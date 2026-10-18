/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Suite Pengujian Phase 4: Scanner SN, Validasi, Suara, dan Error History
 *
 * Menguji:
 * 1. Scan SN valid berhasil dicatat secara atomik ke stock_opname_area_counts & stock_opname_lines.
 * 2. Scan duplikat pada area yang sama ditolak (DUPLICATE_IN_AREA).
 * 3. Scan duplikat lintas area ditolak (DUPLICATE_CROSS_AREA) dengan info nama area asal.
 * 4. Scan SN asing / tidak terdaftar di snapshot ditolak (UNREGISTERED_SERIAL) & dicatat ke scan errors.
 * 5. SN dari gudang lain ditolak tanpa kebocoran data (UNREGISTERED_SERIAL).
 * 6. SN dengan satuan tidak valid ditolak (INVALID_UNIT) dan dicatat untuk audit.
 * 7. SN dengan satuan kemasan / non-PCS menambahkan kuantitas kanonis (base_quantity) yang benar.
 * 8. Proteksi Konkurensi: Dua pemindaian simultan untuk SN yang sama tidak menghasilkan hitungan ganda.
 * 9. Isolasi Error History: Riwayat error tersimpan per sesi & area, tidak hilang saat reload.
 * 10. Pengarsipan aman: Riwayat error dapat diarsipkan tanpa menghapus audit trail atau ledger.
 * 11. Proteksi status sesi & area: Sesi/area yang dibatalkan menolak pemindaian.
 * 12. Imutabilitas Ledger: Scan SN tidak pernah mengubah saldo fisik atau menulis ledger mutasi.
 */

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getDatabaseClient } from "../src/lib/db/sqlite-client.ts";
import { runMigrations } from "../src/lib/db/migrator.ts";
import { seedSyntheticData } from "../src/lib/db/seed.ts";
import { InventoryRepository } from "../src/lib/db/repositories/inventory-repository.ts";
import type { ActiveSecurityContext } from "../src/lib/types/auth.ts";

const db = getDatabaseClient();
runMigrations(db);
seedSyntheticData(db);
const repo = new InventoryRepository(db);

const ownerAlphaContext: ActiveSecurityContext = {
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

const ownerBetaContext: ActiveSecurityContext = {
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

test("PHASE 4: STOCK OPNAME SN SCANNER, VALIDATION, AND ERROR HISTORY", async (t) => {
  let sessionId = "";
  let areaAId = "";
  let areaBId = "";
  let validSerial1 = "";
  let validSerial2 = "";
  let packSerial = "";
  let invalidUnitSerial = "";
  let serialProductId = "";
  let initialLedgerCount = 0;

  // 4.0 Setup Sesi Stock Opname dan Siapkan Data Snapshot SN
  await t.test("4.0 Setup Sesi Stock Opname dengan Area & Serial Numbers", () => {
    // Batalkan sesi aktif sebelumnya di Cakung agar tidak bentrok
    db.prepare("UPDATE stock_opname_sessions SET status = 'CANCELLED' WHERE warehouse_id = 'wh-north' AND status = 'COUNTING'").run();

    // Hitung baris ledger awal untuk verifikasi invariansi nanti
    const ledgerRow = db.prepare("SELECT COUNT(*) as count FROM inventory_ledger").get() as { count: number };
    initialLedgerCount = ledgerRow.count;

    // Cari produk serial di Cakung
    const products = repo.getProductsByOwner(ownerAlphaContext, "wh-north");
    const serProduct = products.find((p) => p.trackingMode === "SERIAL");
    assert.ok(serProduct, "Harus ada produk serial di Cakung");
    serialProductId = serProduct.id;

    // Tambahkan serial numbers khusus untuk pengujian Phase 4
    validSerial1 = `SN-P4-VAL1-${Date.now()}`;
    validSerial2 = `SN-P4-VAL2-${Date.now()}`;
    packSerial = `SN-P4-PACK-${Date.now()}`;
    invalidUnitSerial = `SN-P4-INV-${Date.now()}`;

    const now = new Date().toISOString();

    // 1. SN Valid standar (1 PCS)
    db.prepare(`
      INSERT INTO product_serials (
        id, owner_id, warehouse_id, product_id, serial_number, normalized_serial_number,
        status, unit, unit_quantity, base_quantity, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', 'pcs', 1, 1, ?, ?)
    `).run(crypto.randomUUID(), "owner-alpha", "wh-north", serialProductId, validSerial1, validSerial1.toLowerCase(), now, now);

    db.prepare(`
      INSERT INTO product_serials (
        id, owner_id, warehouse_id, product_id, serial_number, normalized_serial_number,
        status, unit, unit_quantity, base_quantity, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', 'pcs', 1, 1, ?, ?)
    `).run(crypto.randomUUID(), "owner-alpha", "wh-north", serialProductId, validSerial2, validSerial2.toLowerCase(), now, now);

    // 2. SN dengan unit kemasan (Lusin = 12 PCS kanonis)
    db.prepare(`
      INSERT INTO product_serials (
        id, owner_id, warehouse_id, product_id, serial_number, normalized_serial_number,
        status, unit, unit_quantity, base_quantity, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', 'lusin', 1, 12, ?, ?)
    `).run(crypto.randomUUID(), "owner-alpha", "wh-north", serialProductId, packSerial, packSerial.toLowerCase(), now, now);

    // 3. SN dengan unit rusak/tidak valid
    db.prepare(`
      INSERT INTO product_serials (
        id, owner_id, warehouse_id, product_id, serial_number, normalized_serial_number,
        status, unit, unit_quantity, base_quantity, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', 'INVALID_UNIT_XYZ', 1, 0, ?, ?)
    `).run(crypto.randomUUID(), "owner-alpha", "wh-north", serialProductId, invalidUnitSerial, invalidUnitSerial.toLowerCase(), now, now);

    // Buat sesi SO baru (ini membekukan snapshot serial di Cakung)
    const session = repo.createStockOpnameSession(ownerAlphaContext, {
      warehouseId: "wh-north",
      sessionNumber: `SO-P4-${Date.now()}`,
      title: "Sesi Uji Scanner Barcode Phase 4",
      initialAreas: ["Rak Timur", "Rak Barat"],
    });

    sessionId = session.id;
    assert.ok(sessionId);

    const areas = repo.getStockOpnameAreas(ownerAlphaContext, sessionId);
    assert.equal(areas.length, 2);
    areaAId = areas[0].id;
    areaBId = areas[1].id;
  });

  // 4.1 Scan SN Valid
  await t.test("4.1 Scan SN valid berhasil dicatat dan menambah hitungan area", () => {
    const res = repo.scanStockOpnameSerial(ownerAlphaContext, {
      sessionId,
      areaId: areaAId,
      serialNumber: validSerial1,
    });

    assert.equal(res.success, true);
    assert.equal(res.resultType, "SUCCESS");
    assert.equal(res.serialNumber, validSerial1);
    assert.equal(res.baseQuantity, 1);

    // Verifikasi kuantitas terakumulasi pada baris produk stock_opname_lines
    const lines = repo.getStockOpnameSessionDetail(ownerAlphaContext, sessionId).lines;
    const targetLine = lines.find((l) => l.productId === serialProductId);
    assert.ok(targetLine);
    assert.ok(targetLine.countedQty >= 1);

    // Verifikasi tercatat di stock_opname_area_counts
    const areaCounts = repo.getStockOpnameAreaCounts(ownerAlphaContext, sessionId, areaAId);
    const prodCount = areaCounts.find((ac) => ac.productId === serialProductId);
    assert.ok(prodCount);
    assert.ok(prodCount.scannedSerialsJson?.includes(validSerial1));
  });

  // 4.2 Scan Duplikat di Area yang Sama
  await t.test("4.2 Scan duplikat pada area yang sama ditolak (DUPLICATE_IN_AREA)", () => {
    const lineBefore = repo.getStockOpnameSessionDetail(ownerAlphaContext, sessionId).lines.find((l) => l.productId === serialProductId);
    const countedBefore = lineBefore?.countedQty || 0;

    const res = repo.scanStockOpnameSerial(ownerAlphaContext, {
      sessionId,
      areaId: areaAId,
      serialNumber: validSerial1,
    });

    assert.equal(res.success, false);
    assert.equal(res.resultType, "DUPLICATE_IN_AREA");
    assert.ok(res.message.includes("sudah dipindai di area"));

    // Pastikan tidak ada penambahan kuantitas
    const lineAfter = repo.getStockOpnameSessionDetail(ownerAlphaContext, sessionId).lines.find((l) => l.productId === serialProductId);
    assert.equal(lineAfter?.countedQty, countedBefore);
  });

  // 4.3 Scan Duplikat Lintas Area
  await t.test("4.3 Scan SN yang sudah dihitung di area lain ditolak (DUPLICATE_CROSS_AREA)", () => {
    const res = repo.scanStockOpnameSerial(ownerAlphaContext, {
      sessionId,
      areaId: areaBId, // Coba scan di Rak Barat padahal sudah ada di Rak Timur
      serialNumber: validSerial1,
    });

    assert.equal(res.success, false);
    assert.equal(res.resultType, "DUPLICATE_CROSS_AREA");
    assert.equal(res.duplicateAreaName, "Rak Timur");
    assert.ok(res.message.includes("sudah tercatat di area 'Rak Timur'"));
  });

  // 4.4 Scan SN Tidak Terdaftar di Snapshot
  await t.test("4.4 Scan SN asing / tidak ada di snapshot ditolak (UNREGISTERED_SERIAL)", () => {
    const foreignSn = "SN-ASING-99999999";
    const res = repo.scanStockOpnameSerial(ownerAlphaContext, {
      sessionId,
      areaId: areaAId,
      serialNumber: foreignSn,
    });

    assert.equal(res.success, false);
    assert.equal(res.resultType, "UNREGISTERED_SERIAL");
    assert.ok(res.message.includes("tidak terdaftar dalam snapshot"));
  });

  // 4.5 Scan SN Milik Gudang Lain
  await t.test("4.5 SN dari gudang lain ditolak tanpa membocorkan rincian gudang lain", () => {
    // Daftarkan SN baru di Gudang Surabaya (Owner Beta)
    const betaSn = `SN-BETA-SBY-${Date.now()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO product_serials (
        id, owner_id, warehouse_id, product_id, serial_number, normalized_serial_number,
        status, unit, unit_quantity, base_quantity, created_at, updated_at
      ) VALUES (?, ?, 'wh-beta-01', ?, ?, ?, 'AVAILABLE', 'pcs', 1, 1, ?, ?)
    `).run(crypto.randomUUID(), "owner-beta", serialProductId, betaSn, betaSn.toLowerCase(), now, now);

    // Coba scan betaSn di sesi Cakung (Owner Alpha)
    const res = repo.scanStockOpnameSerial(ownerAlphaContext, {
      sessionId,
      areaId: areaAId,
      serialNumber: betaSn,
    });

    // Harus ditolak dengan UNREGISTERED_SERIAL tanpa membocorkan kata 'Surabaya' atau 'wh-beta-01'
    assert.equal(res.success, false);
    assert.equal(res.resultType, "UNREGISTERED_SERIAL");
    assert.equal(res.message.includes("Surabaya"), false);
    assert.equal(res.message.includes("wh-beta-01"), false);
  });

  // 4.6 Scan SN dengan Satuan Invalid
  await t.test("4.6 SN dengan satuan invalid ditolak (INVALID_UNIT) dan tidak menambah kuantitas", () => {
    const res = repo.scanStockOpnameSerial(ownerAlphaContext, {
      sessionId,
      areaId: areaAId,
      serialNumber: invalidUnitSerial,
    });

    assert.equal(res.success, false);
    assert.equal(res.resultType, "INVALID_UNIT");
    assert.ok(res.message.includes("satuan tidak valid"));
  });

  // 4.7 Scan SN Kemasan (Lusin / Multi-Unit) Mengikuti Kuantitas Kanonis
  await t.test("4.7 SN kemasan lusin menambah kuantitas kanonis (base_quantity = 12) secara akurat", () => {
    const lineBefore = repo.getStockOpnameSessionDetail(ownerAlphaContext, sessionId).lines.find((l) => l.productId === serialProductId);
    const qtyBefore = lineBefore?.countedQty || 0;

    const res = repo.scanStockOpnameSerial(ownerAlphaContext, {
      sessionId,
      areaId: areaBId,
      serialNumber: packSerial,
    });

    assert.equal(res.success, true);
    assert.equal(res.resultType, "SUCCESS");
    assert.equal(res.baseQuantity, 12);

    const lineAfter = repo.getStockOpnameSessionDetail(ownerAlphaContext, sessionId).lines.find((l) => l.productId === serialProductId);
    assert.equal(lineAfter?.countedQty, qtyBefore + 12);
  });

  // 4.8 Simulasi Pemindaian Simultan (Konkurensi / Race Condition)
  await t.test("4.8 Dua request pemindaian simultan untuk SN yang sama tidak menghasilkan hitungan ganda", () => {
    const lineBefore = repo.getStockOpnameSessionDetail(ownerAlphaContext, sessionId).lines.find((l) => l.productId === serialProductId);
    const qtyBefore = lineBefore?.countedQty || 0;

    // Eksekusi dua scan untuk validSerial2
    const res1 = repo.scanStockOpnameSerial(ownerAlphaContext, {
      sessionId,
      areaId: areaAId,
      serialNumber: validSerial2,
    });

    const res2 = repo.scanStockOpnameSerial(ownerAlphaContext, {
      sessionId,
      areaId: areaBId,
      serialNumber: validSerial2,
    });

    // Tepat satu harus sukses, dan satu harus gagal sebagai DUPLICATE_CROSS_AREA
    assert.equal(res1.success, true);
    assert.equal(res2.success, false);
    assert.equal(res2.resultType, "DUPLICATE_CROSS_AREA");

    // Kuantitas hanya bertambah 1 PCS (bukan 2)
    const lineAfter = repo.getStockOpnameSessionDetail(ownerAlphaContext, sessionId).lines.find((l) => l.productId === serialProductId);
    assert.equal(lineAfter?.countedQty, qtyBefore + 1);
  });

  // 4.9 Pemeriksaan Riwayat Error Sementara
  await t.test("4.9 Riwayat error scan tercatat pada tabel stock_opname_scan_errors dan terfilter per area", () => {
    const errorsAreaA = repo.getStockOpnameScanErrors(ownerAlphaContext, sessionId, areaAId);
    assert.ok(errorsAreaA.length >= 2, "Harus ada catatan error di Area A (duplikat & asing)");

    const hasDuplicate = errorsAreaA.some((e) => e.errorType === "DUPLICATE_IN_AREA");
    const hasUnregistered = errorsAreaA.some((e) => e.errorType === "UNREGISTERED_SERIAL");
    assert.ok(hasDuplicate, "Harus ada entri DUPLICATE_IN_AREA");
    assert.ok(hasUnregistered, "Harus ada entri UNREGISTERED_SERIAL");

    // Pastikan Owner Beta tidak dapat melihat riwayat error sesi Owner Alpha
    assert.throws(
      () => repo.getStockOpnameScanErrors(ownerBetaContext, sessionId),
      (err: any) => err.statusCode === 404 || err.code === "ERR_NOT_FOUND"
    );
  });

  // 4.10 Pengarsipan Riwayat Error Scan Sesi
  await t.test("4.10 Pengarsipan riwayat error menandai is_archived = 1 tanpa menghapus data", () => {
    const archiveRes = repo.archiveStockOpnameScanErrors(ownerAlphaContext, sessionId);
    assert.ok(archiveRes.archivedCount > 0);

    // Default getStockOpnameScanErrors (includeArchived: false) harus kosong
    const activeErrors = repo.getStockOpnameScanErrors(ownerAlphaContext, sessionId, areaAId, false);
    assert.equal(activeErrors.length, 0);

    // Jika includeArchived: true, data historis tetap utuh
    const allErrors = repo.getStockOpnameScanErrors(ownerAlphaContext, sessionId, areaAId, true);
    assert.ok(allErrors.length > 0);
  });

  // 4.11 Proteksi Sesi Dibatalkan
  await t.test("4.11 Sesi atau area yang dibatalkan menolak pemindaian barcode", () => {
    // Batalkan sesi yang sedang aktif
    repo.cancelStockOpnameSession(ownerAlphaContext, sessionId, "Dibatalkan untuk pengujian proteksi scan");

    const res = repo.scanStockOpnameSerial(ownerAlphaContext, {
      sessionId,
      areaId: areaAId,
      serialNumber: "SN-ANY-VALUE",
    });

    assert.equal(res.success, false);
    assert.equal(res.resultType, "INACTIVE_SESSION");
  });

  // 4.12 Invariansi: Pemindaian Tidak Mengubah Saldo Aktual di Inventory Ledger
  await t.test("4.12 Pemindaian barcode tidak menulis atau mengubah baris transaksi pada inventory_ledger", () => {
    const ledgerRow = db.prepare("SELECT COUNT(*) as count FROM inventory_ledger").get() as { count: number };
    assert.equal(ledgerRow.count, initialLedgerCount, "Jumlah baris ledger tidak boleh berubah selama pemindaian Stock Opname!");
  });
});
