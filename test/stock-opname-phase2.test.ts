/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Suite Pengujian Phase 2: Stock Opname (Data, Session, Snapshot, Area & Isolasi Gudang)
 * 
 * Memvalidasi:
 * 1. Isolasi Mutlak Owner & Warehouse.
 * 2. Pencegahan Benturan Sesi Aktif Ganda per Gudang.
 * 3. Integritas Snapshot Stok & Snapshot Serial Number (Tanpa Mengubah Saldo Aktual).
 * 4. Representasi Kuantitas Satuan SN (1 PCS, 1 Lusin = 12 PCS, Pack, & Penolakan Satuan Invalid).
 * 5. Manajemen Area (CRUD, Nama Unik per Sesi, Penghapusan Aman Berbasis Riwayat).
 * 6. Penolakan ID Cross-Warehouse (Sesi, Area, SN dari Gudang Lain).
 */

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getDatabaseClient } from "../src/lib/db/sqlite-client.ts";
import { runMigrations } from "../src/lib/db/migrator.ts";
import { seedSyntheticData } from "../src/lib/db/seed.ts";
import { InventoryRepository } from "../src/lib/db/repositories/inventory-repository.ts";
import { resolveSerialUnitRepresentation } from "../src/lib/inventory/units.ts";
import { AppError } from "../src/lib/errors/app-error.ts";
import type { ActiveSecurityContext } from "../src/lib/types/auth.ts";

// Setup database & repository
const db = getDatabaseClient();
runMigrations(db);
seedSyntheticData(db);
const repo = new InventoryRepository(db);

// Konteks Keamanan Uji (Menggunakan Data Seed Resmi: wh-north, wh-south, wh-beta-01)
const ownerAlphaWhNorthContext: ActiveSecurityContext = {
  userId: "usr-owner-alpha",
  email: "owner_alpha@docuflow.id",
  ownerId: "owner-alpha",
  ownerName: "PT Alpha Logistik",
  warehouseId: "wh-north",
  warehouseName: "Gudang Utama Cakung",
  role: "OWNER",
  isSuperAdminOnBehalf: false,
  grantId: null,
};

const ownerAlphaWhSouthContext: ActiveSecurityContext = {
  userId: "usr-owner-alpha",
  email: "owner_alpha@docuflow.id",
  ownerId: "owner-alpha",
  ownerName: "PT Alpha Logistik",
  warehouseId: "wh-south",
  warehouseName: "Gudang Transit Cikarang",
  role: "OWNER",
  isSuperAdminOnBehalf: false,
  grantId: null,
};

const staffAlphaWhNorthContext: ActiveSecurityContext = {
  userId: "usr-staff-alpha",
  email: "staff_alpha@docuflow.id",
  ownerId: "owner-alpha",
  ownerName: "PT Alpha Logistik",
  warehouseId: "wh-north",
  warehouseName: "Gudang Utama Cakung",
  role: "STAFF",
  isSuperAdminOnBehalf: false,
  grantId: null,
};

const ownerBetaWh1Context: ActiveSecurityContext = {
  userId: "usr-owner-beta",
  email: "owner_beta@docuflow.id",
  ownerId: "owner-beta",
  ownerName: "CV Beta Distribusi",
  warehouseId: "wh-beta-01",
  warehouseName: "Gudang Pusat Surabaya",
  role: "OWNER",
  isSuperAdminOnBehalf: false,
  grantId: null,
};

test("PHASE 2: STOCK OPNAME FOUNDATION & WAREHOUSE ISOLATION", async (t) => {
  let createdSessionId = "";

  // -----------------------------------------------------------------
  // 1. ISOLASI GUDANG & PENCEGAHAN BENTURAN SESI GANDA
  // -----------------------------------------------------------------

  await t.test("1.1 Pembuatan Sesi SO Baru di Gudang Utama Cakung (wh-north) membekukan snapshot tanpa mengubah stok", () => {
    // Pastikan saldo awal produk tercatat sebelum sesi dibuat
    const productsBefore = repo.getProductsByOwner(ownerAlphaWhNorthContext, "wh-north");
    assert.ok(productsBefore.length > 0, "Harus ada produk di Gudang Utama Cakung");
    const sampleProduct = productsBefore[0];
    const initialStock = sampleProduct.physicalStock ?? 0;

    const session = repo.createStockOpnameSession(ownerAlphaWhNorthContext, {
      warehouseId: "wh-north",
      sessionNumber: `SO-NORTH-${Date.now()}`,
      title: "Stock Opname Audit Cakung Phase 2",
      scope: "ALL",
      initialAreas: ["Rak Utama A", "Rak Cadangan B"],
      note: "Sesi uji Phase 2 isolasi gudang dan snapshot.",
    });

    createdSessionId = session.id;

    assert.ok(session.id, "Session ID harus terbuat");
    assert.equal(session.ownerId, "owner-alpha");
    assert.equal(session.warehouseId, "wh-north");
    assert.equal(session.status, "COUNTING");
    assert.ok(session.startedAt, "startedAt harus tercatat");
    assert.ok(session.snapshotAt, "snapshotAt harus tercatat");
    assert.ok(session.itemCount > 0, "itemCount snapshot harus > 0");

    // Verifikasi snapshot stok tidak mengubah stok aktual produk sama sekali
    const productsAfter = repo.getProductsByOwner(ownerAlphaWhNorthContext, "wh-north");
    const sampleProductAfter = productsAfter.find((p) => p.id === sampleProduct.id);
    assert.equal(
      sampleProductAfter?.physicalStock,
      initialStock,
      "Pengambilan snapshot tidak boleh mengubah saldo fisik aktual di ledger/database!"
    );
  });

  await t.test("1.2 Pencegahan Benturan: Menolak membuat sesi baru jika ada sesi aktif di gudang yang sama", () => {
    assert.throws(
      () => {
        repo.createStockOpnameSession(ownerAlphaWhNorthContext, {
          warehouseId: "wh-north",
          sessionNumber: `SO-DUPLIKAT-${Date.now()}`,
          scope: "ALL",
        });
      },
      (err: unknown) => {
        return (
          err instanceof AppError &&
          err.code === "ERR_CONFLICT" &&
          err.message.includes("masih memiliki sesi Stock Opname aktif")
        );
      },
      "Harus menolak sesi baru jika ada sesi COUNTING/REVIEW aktif di gudang yang sama (ERR_CONFLICT)"
    );
  });

  await t.test("1.3 Gudang Berbeda dapat membuat sesi mandiri tanpa saling mengganggu", () => {
    // Gudang Transit Cikarang (wh-south) belum memiliki sesi aktif
    const sessionSouth = repo.createStockOpnameSession(ownerAlphaWhSouthContext, {
      warehouseId: "wh-south",
      sessionNumber: `SO-SOUTH-${Date.now()}`,
      title: "SO Gudang Cikarang",
      scope: "ALL",
    });

    assert.equal(sessionSouth.warehouseId, "wh-south");
    assert.equal(sessionSouth.ownerId, "owner-alpha");

    // Bersihkan sesi di wh-south dengan membatalkannya
    const cancelRes = repo.cancelStockOpnameSession(ownerAlphaWhSouthContext, sessionSouth.id, "Selesai uji coba");
    assert.equal(cancelRes.status, "CANCELLED");
  });

  await t.test("1.4 Isolasi Owner: Owner Beta dilarang membaca atau mengakses sesi milik Owner Alpha", () => {
    // Owner Beta mencoba membaca detail sesi milik Owner Alpha
    assert.throws(
      () => {
        repo.getStockOpnameSessionDetail(ownerBetaWh1Context, createdSessionId);
      },
      (err: unknown) => err instanceof AppError && err.code === "ERR_NOT_FOUND",
      "Owner Beta tidak boleh menemukan sesi milik Owner Alpha (ERR_NOT_FOUND / 404)"
    );

    // Owner Beta mencoba membuat sesi dengan menyusupkan warehouseId milik Alpha
    assert.throws(
      () => {
        repo.createStockOpnameSession(ownerBetaWh1Context, {
          warehouseId: "wh-north",
          sessionNumber: `SO-INTRUDER-${Date.now()}`,
          scope: "ALL",
        });
      },
      (err: unknown) => err instanceof AppError && err.code === "ERR_FORBIDDEN_WAREHOUSE",
      "Owner Beta dilarang membuat sesi pada gudang milik Owner Alpha (ERR_FORBIDDEN_WAREHOUSE)"
    );
  });

  await t.test("1.5 Isolasi Staff: Staff Gudang North dilarang mengakses atau mengelola sesi di Gudang South", () => {
    assert.throws(
      () => {
        repo.createStockOpnameSession(staffAlphaWhNorthContext, {
          warehouseId: "wh-south", // Di luar penugasan staff (staff ditugaskan di wh-north)
          sessionNumber: `SO-STAFF-FORBIDDEN-${Date.now()}`,
          scope: "ALL",
        });
      },
      (err: unknown) => err instanceof AppError && err.code === "ERR_FORBIDDEN_WAREHOUSE",
      "Staff dilarang mengakses gudang di luar penugasannya"
    );
  });

  // -----------------------------------------------------------------
  // 2. AUDIT SATUAN & KUANTITAS SERIAL NUMBER (SN)
  // -----------------------------------------------------------------

  await t.test("2.1 SN dengan satuan 1 PCS dihitung tepat 1 PCS base", () => {
    const res = resolveSerialUnitRepresentation({
      serialNumber: "SN-PCS-001",
      unit: "pcs",
      unitQuantity: 1,
      baseQuantity: 1,
    });

    assert.equal(res.isValid, true);
    assert.equal(res.unit, "pcs");
    assert.equal(res.unitQuantity, 1);
    assert.equal(res.baseQuantity, 1, "SN 1 PCS harus memiliki kuantitas dasar 1");
  });

  await t.test("2.2 SN dengan satuan 1 Lusin dihitung tepat 12 PCS base (Bukan 1 PCS!)", () => {
    const res = resolveSerialUnitRepresentation({
      serialNumber: "SN-LS-001",
      unit: "lusin",
      unitQuantity: 1,
      baseQuantity: 12,
    });

    assert.equal(res.isValid, true);
    assert.equal(res.unit, "lusin");
    assert.equal(res.unitQuantity, 1);
    assert.equal(res.baseQuantity, 12, "SN 1 Lusin wajib memiliki kuantitas dasar 12 PCS!");
  });

  await t.test("2.3 SN dengan satuan Pack 60 PCS (pack) dihitung tepat 60 PCS base", () => {
    const res = resolveSerialUnitRepresentation({
      serialNumber: "SN-PACK-001",
      unit: "pack",
      unitQuantity: 1,
      baseQuantity: 60,
    });

    assert.equal(res.isValid, true);
    assert.equal(res.unit, "pack");
    assert.equal(res.unitQuantity, 1);
    assert.equal(res.baseQuantity, 60, "SN 1 Pack harus memiliki kuantitas dasar 60 PCS!");
  });

  await t.test("2.4 SN dengan satuan tidak dikenal / invalid ditolak dan TIDAK defaulting ke 1 PCS", () => {
    const res = resolveSerialUnitRepresentation({
      serialNumber: "SN-INVALID-999",
      unit: "kontainer_ajaib", // Tidak ada di SUPPORTED_UNITS / UNIT_MULTIPLIERS
      unitQuantity: 1,
      baseQuantity: 0,
    });

    assert.equal(res.isValid, false, "Satuan tidak sah harus menghasilkan isValid: false");
    assert.equal(res.baseQuantity, 0, "Satuan tidak sah dilarang keras otomatis defaulting ke 1 PCS!");
    assert.ok(res.errorMessage?.includes("tidak valid atau tidak terdaftar"));
  });

  await t.test("2.5 Penolakan Mutlak SN Lintas Gudang dalam Sesi SO", () => {
    // Daftarkan SN di Gudang Transit Cikarang (wh-south)
    const foreignSn = `SN-SOUTH-UNIQUE-${Date.now()}`;
    db.prepare(`
      INSERT INTO product_serials (
        id, owner_id, warehouse_id, product_id, serial_number, normalized_serial_number,
        status, unit, unit_quantity, base_quantity, created_at, updated_at
      ) VALUES (?, 'owner-alpha', 'wh-south', 'prod-rtr-01', ?, ?, 'AVAILABLE', 'pcs', 1, 1, datetime('now'), datetime('now'))
    `).run(crypto.randomUUID(), foreignSn, foreignSn.toLowerCase());

    // Coba validasi SN tersebut pada Sesi yang berjalan di Gudang Utama Cakung (wh-north)
    assert.throws(
      () => {
        repo.validateSerialForStockOpname(ownerAlphaWhNorthContext, {
          sessionId: createdSessionId,
          serialNumber: foreignSn,
          warehouseId: "wh-north",
        });
      },
      (err: unknown) => {
        return (
          err instanceof AppError &&
          err.code === "ERR_FORBIDDEN_WAREHOUSE" &&
          err.message.includes("bukan di gudang sesi")
        );
      },
      "SN milik gudang lain wajib ditolak keras ERR_FORBIDDEN_WAREHOUSE"
    );
  });

  await t.test("2.6 Custom conversionFactor resmi produk diprioritaskan di atas nilai default", () => {
    // Produk dengan pack khusus berisi 24 pcs (bukan standar 60 pcs)
    const res = resolveSerialUnitRepresentation({
      serialNumber: "SN-CUSTOM-PACK-24",
      unit: "pack",
      unitQuantity: 1,
      conversionFactor: 24, // Faktor konversi khusus produk
    });

    assert.equal(res.isValid, true);
    assert.equal(res.unit, "pack");
    assert.equal(res.baseQuantity, 24, "Harus mengikuti conversionFactor resmi produk (24), bukan default (60)");
  });

  await t.test("2.7 Pencegahan konversi ganda saat SN sudah memiliki base_quantity eksplisit", () => {
    // SN dari Goods In sudah memiliki base_quantity = 12 untuk 1 lusin
    const res = resolveSerialUnitRepresentation({
      serialNumber: "SN-ALREADY-BASE-12",
      unit: "lusin",
      unitQuantity: 1,
      baseQuantity: 12,
    });

    assert.equal(res.isValid, true);
    assert.equal(res.baseQuantity, 12, "Tidak boleh terjadi pengali ganda (12 * 12 = 144)");
  });

  // -----------------------------------------------------------------
  // 3. PENGELOLAAN AREA PENGHITUNGAN (CRUD & SAFE DELETION)
  // -----------------------------------------------------------------

  let areaRakAId = "";

  await t.test("3.1 Area penghitungan awal otomatis terdaftar dan dapat diambil", () => {
    const areas = repo.getStockOpnameAreas(ownerAlphaWhNorthContext, createdSessionId);
    assert.ok(areas.length >= 2, "Dua area awal harus terdaftar");
    const rakA = areas.find((a) => a.name === "Rak Utama A");
    assert.ok(rakA, "Rak Utama A harus ada");
    assert.equal(rakA.status, "PENDING");
    assert.equal(rakA.warehouseId, "wh-north");
    areaRakAId = rakA.id;
  });

  await t.test("3.2 Menambah area baru dengan nama unik berhasil", () => {
    const newArea = repo.createStockOpnameArea(ownerAlphaWhNorthContext, {
      sessionId: createdSessionId,
      name: "Area Palet Depan C",
      locationCode: "PALET-C",
    });

    assert.equal(newArea.name, "Area Palet Depan C");
    assert.equal(newArea.locationCode, "PALET-C");
    assert.equal(newArea.status, "PENDING");
  });

  await t.test("3.3 Menolak pembuatan area dengan nama duplikat di sesi yang sama", () => {
    assert.throws(
      () => {
        repo.createStockOpnameArea(ownerAlphaWhNorthContext, {
          sessionId: createdSessionId,
          name: "Rak Utama A", // Sudah ada
        });
      },
      (err: unknown) => err instanceof AppError && err.code === "ERR_CONFLICT",
      "Nama area duplikat pada sesi yang sama wajib ditolak (ERR_CONFLICT)"
    );
  });

  await t.test("3.4 Mengupdate status dan metadata area berhasil", () => {
    const updated = repo.updateStockOpnameArea(ownerAlphaWhNorthContext, {
      sessionId: createdSessionId,
      areaId: areaRakAId,
      name: "Rak Utama A (Lorong 1)",
      status: "IN_PROGRESS",
    });

    assert.equal(updated.name, "Rak Utama A (Lorong 1)");
    assert.equal(updated.status, "IN_PROGRESS");
  });

  await t.test("3.5 Menghapus area tanpa riwayat hitungan fisik (Hard Delete bersih)", () => {
    const tempArea = repo.createStockOpnameArea(ownerAlphaWhNorthContext, {
      sessionId: createdSessionId,
      name: "Area Sementara D",
    });

    const delRes = repo.deleteStockOpnameArea(ownerAlphaWhNorthContext, {
      sessionId: createdSessionId,
      areaId: tempArea.id,
    });

    assert.equal(delRes.success, true);
    assert.equal(delRes.action, "DELETED");

    // Pastikan area benar-benar hilang dari daftar
    const areas = repo.getStockOpnameAreas(ownerAlphaWhNorthContext, createdSessionId);
    assert.ok(!areas.some((a) => a.id === tempArea.id), "Area tanpa riwayat harus terhapus bersih");
  });

  await t.test("3.6 Area yang memiliki riwayat hitungan tidak dihapus fisik, melainkan di-soft-cancel", () => {
    // Simulasikan ada data hitung fisik di area Rak A dengan produk resmi prod-rtr-01
    const countId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO stock_opname_area_counts (
        id, owner_id, warehouse_id, session_id, area_id, product_id,
        counted_qty_base, unit, unit_quantity, created_at, updated_at
      ) VALUES (?, 'owner-alpha', 'wh-north', ?, ?, 'prod-rtr-01', 10, 'pcs', 1, ?, ?)
    `).run(countId, createdSessionId, areaRakAId, now, now);

    // Coba hapus area Rak A
    const delRes = repo.deleteStockOpnameArea(ownerAlphaWhNorthContext, {
      sessionId: createdSessionId,
      areaId: areaRakAId,
    });

    assert.equal(delRes.success, true);
    assert.equal(delRes.action, "CANCELLED", "Area dengan riwayat hitungan harus di-soft cancel demi audit!");

    // Area tetap ada di DB dengan status CANCELLED
    const areas = repo.getStockOpnameAreas(ownerAlphaWhNorthContext, createdSessionId);
    const cancelledArea = areas.find((a) => a.id === areaRakAId);
    assert.ok(cancelledArea, "Area dengan histori harus tetap tersimpan");
    assert.equal(cancelledArea.status, "CANCELLED");
  });

  // -----------------------------------------------------------------
  // 4. DETAIL SESI LENGKAP & PEMBATALAN SESI
  // -----------------------------------------------------------------

  await t.test("4.1 getStockOpnameSessionDetail mengembalikan rincian lengkap snapshot dan area", () => {
    const detail = repo.getStockOpnameSessionDetail(ownerAlphaWhNorthContext, createdSessionId);
    assert.equal(detail.session.id, createdSessionId);
    assert.equal(detail.session.warehouseId, "wh-north");
    assert.ok(detail.lines.length > 0, "Lines snapshot harus terambil");
    assert.ok(detail.areas.length > 0, "Areas harus terambil");
    assert.ok(detail.serialSnapshotsCount >= 0, "Serial snapshots count harus terhitung");
  });

  await t.test("4.2 Membatalkan Sesi SO berhasil dan mengubah status menjadi CANCELLED", () => {
    const cancelRes = repo.cancelStockOpnameSession(ownerAlphaWhNorthContext, createdSessionId, "Audit selesai dibatalkan");
    assert.equal(cancelRes.success, true);
    assert.equal(cancelRes.status, "CANCELLED");

    const detailAfter = repo.getStockOpnameSessionDetail(ownerAlphaWhNorthContext, createdSessionId);
    assert.equal(detailAfter.session.status, "CANCELLED");
  });

  await t.test("4.3 Setelah sesi dibatalkan, gudang dapat membuka sesi SO baru kembali", () => {
    const newSession = repo.createStockOpnameSession(ownerAlphaWhNorthContext, {
      warehouseId: "wh-north",
      sessionNumber: `SO-REOPEN-${Date.now()}`,
      title: "Sesi Baru Pasca Pembatalan",
      scope: "ALL",
    });

    assert.ok(newSession.id);
    assert.equal(newSession.status, "COUNTING");

    // Batalkan juga sesi ini agar tidak meninggalkan sesi terbuka
    repo.cancelStockOpnameSession(ownerAlphaWhNorthContext, newSession.id, "Cleanup");
  });

  // -----------------------------------------------------------------
  // 5. ERROR SCAN SEMENTARA & INTEGRITAS LEDGER / AUDIT
  // -----------------------------------------------------------------

  await t.test("5.1 Error scan sementara tercatat per area dan dapat diambil secara terisolasi", () => {
    // Buat sesi SO baru khusus pengujian error scan
    const errSession = repo.createStockOpnameSession(ownerAlphaWhNorthContext, {
      warehouseId: "wh-north",
      sessionNumber: `SO-ERR-TEST-${Date.now()}`,
      title: "Uji Error Scan Ephemeral",
      initialAreas: ["Area Scan Test"],
    });

    const areas = repo.getStockOpnameAreas(ownerAlphaWhNorthContext, errSession.id);
    const areaId = areas[0].id;

    // Catat 2 error scan sementara pada area tersebut
    const rec1 = repo.recordStockOpnameScanError(ownerAlphaWhNorthContext, {
      sessionId: errSession.id,
      areaId,
      scannedValue: "INVALID-BARCODE-XYZ",
      errorType: "INVALID_FORMAT",
      errorMessage: "Format barcode tidak sesuai standar",
    });
    assert.equal(rec1.success, true);

    const rec2 = repo.recordStockOpnameScanError(ownerAlphaWhNorthContext, {
      sessionId: errSession.id,
      areaId,
      scannedValue: "UNKNOWN-SN-9999",
      errorType: "NOT_FOUND",
      errorMessage: "SN tidak terdaftar di sistem",
    });
    assert.equal(rec2.success, true);

    // Ambil error scan aktif
    const activeErrors = repo.getStockOpnameScanErrors(ownerAlphaWhNorthContext, errSession.id, areaId);
    assert.equal(activeErrors.length, 2, "Harus ada 2 error scan aktif");
    assert.equal(activeErrors[0].isArchived, false);

    // Ambil jumlah entri ledger dan audit logs saat ini
    const ledgerCountBefore = (db.prepare("SELECT COUNT(*) as count FROM inventory_ledger").get() as { count: number }).count;
    const auditCountBefore = (db.prepare("SELECT COUNT(*) as count FROM audit_logs").get() as { count: number }).count;

    // Batalkan sesi SO
    repo.cancelStockOpnameSession(ownerAlphaWhNorthContext, errSession.id, "Test error scan archival");

    // Pastikan error scan sekarang terarsip (is_archived = 1)
    const activeErrorsAfter = repo.getStockOpnameScanErrors(ownerAlphaWhNorthContext, errSession.id, areaId, false);
    assert.equal(activeErrorsAfter.length, 0, "Error aktif harus kosong setelah sesi dibatalkan");

    const allErrorsAfter = repo.getStockOpnameScanErrors(ownerAlphaWhNorthContext, errSession.id, areaId, true);
    assert.equal(allErrorsAfter.length, 2, "Total error historis tetap tersimpan");
    assert.equal(allErrorsAfter[0].isArchived, true, "Error harus ditandai is_archived = true");

    // Pastikan TIDAK ADA entri ledger yang terhapus (ledger tidak tersentuh)
    const ledgerCountAfter = (db.prepare("SELECT COUNT(*) as count FROM inventory_ledger").get() as { count: number }).count;
    assert.equal(ledgerCountAfter, ledgerCountBefore, "Pembatalan sesi SO tidak boleh menyentuh atau menghapus inventory_ledger!");

    // Pastikan audit logs bertambah (pencatatan event pembatalan) dan tidak pernah terhapus
    const auditCountAfter = (db.prepare("SELECT COUNT(*) as count FROM audit_logs").get() as { count: number }).count;
    assert.ok(auditCountAfter >= auditCountBefore, "Audit logs tidak boleh berkurang atau dihapus!");
  });
});
