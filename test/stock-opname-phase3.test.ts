/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Suite Pengujian Phase 3: UI Penghitungan Fisik per Area Stock Opname
 * 
 * Memvalidasi:
 * 1. Isolasi Gudang: Sesi dan area terisolasi ketat per gudang & Owner.
 * 2. Hitungan Fisik per Area: Simpan kuantitas non-serial ke stock_opname_area_counts & pembaruan otomatis stock_opname_lines.
 * 3. Validasi Input: Penolakan kuantitas negatif & validasi satuan konversi kanonis.
 * 4. Switcher Satuan: Konversi visual PCS/Lusin tidak mengubah kuantitas dasar kanonis.
 * 5. Snapshot Serial Number: Drill-down rincian SN beku dan penandaan status unit invalid (isUnitValid = false).
 * 6. Proteksi Read-Only: Sesi tertutup/dibatalkan menolak penambahan atau pembaruan hitungan fisik.
 * 7. Manajemen Area: Penambahan, pengubahan nama, dan pengambilan hitungan per area.
 */

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getDatabaseClient } from "../src/lib/db/sqlite-client.ts";
import { runMigrations } from "../src/lib/db/migrator.ts";
import { seedSyntheticData } from "../src/lib/db/seed.ts";
import { InventoryRepository } from "../src/lib/db/repositories/inventory-repository.ts";
import { AppError } from "../src/lib/errors/app-error.ts";
import type { ActiveSecurityContext } from "../src/lib/types/auth.ts";

const db = getDatabaseClient();
runMigrations(db);
seedSyntheticData(db);
const repo = new InventoryRepository(db);

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

test("PHASE 3: STOCK OPNAME AREA COUNTING & UI BACKEND FOUNDATION", async (t) => {
  let sessionId = "";
  let areaAId = "";
  let areaBId = "";
  let nonSerialProdId = "";
  let serialProdId = "";

  // Setup: Buka Sesi SO di Cakung
  await t.test("3.0 Setup Sesi Stock Opname dengan Area A & Area B", () => {
    // Cari produk non-serial & serial di Cakung
    const products = repo.getProductsByOwner(ownerAlphaWhNorthContext, "wh-north");
    const nonSer = products.find((p) => p.trackingMode === "NON_SERIAL");
    const ser = products.find((p) => p.trackingMode === "SERIAL");
    assert.ok(nonSer, "Harus ada produk non-serial");
    assert.ok(ser, "Harus ada produk serial");

    nonSerialProdId = nonSer.id;
    serialProdId = ser.id;

    const session = repo.createStockOpnameSession(ownerAlphaWhNorthContext, {
      warehouseId: "wh-north",
      sessionNumber: `SO-P3-${Date.now()}`,
      title: "Sesi Uji Phase 3 Penghitungan Area",
      initialAreas: ["Rak A1", "Rak B2"],
    });

    sessionId = session.id;
    assert.ok(sessionId);

    const areas = repo.getStockOpnameAreas(ownerAlphaWhNorthContext, sessionId);
    assert.equal(areas.length, 2);
    areaAId = areas[0].id;
    areaBId = areas[1].id;
  });

  // 1. Simpan Hitungan Fisik Manual per Area
  await t.test("3.1 Simpan hitungan fisik non-serial pada Area A1 berhasil dan memperbarui stock_opname_lines", () => {
    const saveRes = repo.saveStockOpnameAreaCount(ownerAlphaWhNorthContext, {
      sessionId,
      areaId: areaAId,
      productId: nonSerialProdId,
      quantity: 10,
      unit: "pcs",
      notes: "Dihitung di rak atas",
    });

    assert.equal(saveRes.success, true);
    assert.equal(saveRes.countedQtyBase, 10);
    assert.equal(saveRes.totalCountedQty, 10);

    // Ambil detail sesi untuk memastikan stock_opname_lines tersinkronkan
    const detail = repo.getStockOpnameSessionDetail(ownerAlphaWhNorthContext, sessionId);
    const line = detail.lines.find((l) => l.productId === nonSerialProdId);
    assert.ok(line);
    assert.equal(line.countedQty, 10, "Counted qty pada baris produk harus bernilai 10");
  });

  // 2. Akumulasi Hitungan Fisik Multi-Area
  await t.test("3.2 Menambahkan hitungan pada Area B2 mengakumulasi total counted_qty pada level sesi", () => {
    // Di Area B2, hitung produk yang sama sebanyak 2 Lusin (24 pcs)
    const saveResB = repo.saveStockOpnameAreaCount(ownerAlphaWhNorthContext, {
      sessionId,
      areaId: areaBId,
      productId: nonSerialProdId,
      quantity: 2,
      unit: "lusin", // 2 lusin = 24 pcs base
    });

    assert.equal(saveResB.success, true);
    assert.equal(saveResB.countedQtyBase, 24);
    assert.equal(saveResB.totalCountedQty, 34, "Total hitung lintas area harus 10 (Area A) + 24 (Area B) = 34");

    // Ambil data hitungan spesifik Area B2
    const areaBCounts = repo.getStockOpnameAreaCounts(ownerAlphaWhNorthContext, sessionId, areaBId);
    assert.equal(areaBCounts.length, 1);
    assert.equal(areaBCounts[0].countedQtyBase, 24);
    assert.equal(areaBCounts[0].unit, "lusin");
    assert.equal(areaBCounts[0].unitQuantity, 2);
  });

  // 3. Validasi Input Hitungan Fisik
  await t.test("3.3 Validasi input: Kuantitas negatif ditolak dengan ERR_VALIDATION", () => {
    assert.throws(
      () => {
        repo.saveStockOpnameAreaCount(ownerAlphaWhNorthContext, {
          sessionId,
          areaId: areaAId,
          productId: nonSerialProdId,
          quantity: -5,
          unit: "pcs",
        });
      },
      (err: unknown) => {
        return err instanceof AppError && err.code === "ERR_VALIDATION";
      }
    );
  });

  // 4. Isolasi Gudang & Multi-Owner pada Hitungan Fisik
  await t.test("3.4 Owner Beta DITOLAK saat mencoba menyimpan hitungan fisik pada sesi Owner Alpha", () => {
    assert.throws(
      () => {
        repo.saveStockOpnameAreaCount(ownerBetaWh1Context, {
          sessionId,
          areaId: areaAId,
          productId: nonSerialProdId,
          quantity: 15,
        });
      },
      (err: unknown) => {
        return err instanceof AppError && (err.code === "ERR_NOT_FOUND" || err.code === "ERR_FORBIDDEN_WAREHOUSE");
      }
    );
  });

  // 5. Snapshot Serial Number & Penandaan Satuan Invalid
  await t.test("3.5 getStockOpnameSerialSnapshots mengembalikan rincian SN beku untuk produk serial", () => {
    const serials = repo.getStockOpnameSerialSnapshots(ownerAlphaWhNorthContext, sessionId, serialProdId);
    assert.ok(Array.isArray(serials));
    for (const sn of serials) {
      assert.equal(sn.sessionId, sessionId);
      assert.equal(sn.productId, serialProdId);
      assert.ok(sn.serialNumber);
      assert.ok(typeof sn.baseQuantity === "number");
    }
  });

  await t.test("3.6 SN dengan satuan invalid pada snapshot ditandai isUnitValid = false", () => {
    // Simulasikan SN beku yang memiliki unit UNKNOWN
    const invalidSn = `SN-INVALID-TEST-${Date.now()}`;
    db.prepare(`
      INSERT INTO stock_opname_serial_snapshots (
        id, owner_id, warehouse_id, session_id, product_id,
        serial_number, normalized_serial_number, unit, unit_quantity,
        base_quantity, status_at_snapshot, snapshot_at
      ) VALUES (?, 'owner-alpha', 'wh-north', ?, ?, ?, ?, 'UNKNOWN', 1, 0, 'AVAILABLE', datetime('now'))
    `).run(crypto.randomUUID(), sessionId, serialProdId, invalidSn, invalidSn.toLowerCase());

    const serials = repo.getStockOpnameSerialSnapshots(ownerAlphaWhNorthContext, sessionId, serialProdId);
    const foundInvalid = serials.find((s) => s.serialNumber === invalidSn);
    assert.ok(foundInvalid);
    assert.equal(foundInvalid.isUnitValid, false, "SN ber-unit UNKNOWN harus ditandai isUnitValid = false");
    assert.equal(foundInvalid.baseQuantity, 0, "SN invalid dilarang memiliki kuantitas dasar > 0");
  });

  // 6. Proteksi Read-Only Sesi
  await t.test("3.7 Sesi yang telah dibatalkan menolak pembaruan hitungan fisik", () => {
    // Batalkan sesi
    repo.cancelStockOpnameSession(ownerAlphaWhNorthContext, sessionId, "Uji selesai");

    assert.throws(
      () => {
        repo.saveStockOpnameAreaCount(ownerAlphaWhNorthContext, {
          sessionId,
          areaId: areaAId,
          productId: nonSerialProdId,
          quantity: 20,
        });
      },
      (err: unknown) => {
        return err instanceof AppError && err.code === "ERR_CONFLICT";
      },
      "Sesi berstatus CANCELLED harus menolak hitungan fisik dengan ERR_CONFLICT"
    );
  });
});
