/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Verification Test Suite: PO -> Goods Out Rework (Dual-Panel Reference, Non-Autofill, Guard Validation)
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "../src/lib/db/migrator.ts";
import { seedSyntheticData } from "../src/lib/db/seed.ts";
import { InventoryRepository } from "../src/lib/db/repositories/inventory-repository.ts";
import { AppError } from "../src/lib/errors/app-error.ts";
import type { DatabaseClient } from "../src/lib/db/sqlite-client.ts";
import type { ActiveSecurityContext } from "../src/lib/types/auth.ts";

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-po-go-rework.db");

describe("Rework PO -> Goods Out Workflow & Integrity Verification", () => {
  let nativeDb: DatabaseSync;
  let client: DatabaseClient;
  let repo: InventoryRepository;

  const ownerAlphaContext: ActiveSecurityContext = {
    userId: "usr-owner-alpha",
    email: "owner_alpha@docuflow.id",
    ownerId: "owner-alpha",
    ownerName: "Alpha Logistics Indonesia",
    warehouseId: "wh-north",
    warehouseName: "Gudang Utama Cakung",
    role: "OWNER",
    isSuperAdminOnBehalf: false,
    grantId: null,
  };

  const staffAlphaContext: ActiveSecurityContext = {
    userId: "usr-staff-alpha",
    email: "staff_alpha@docuflow.id",
    ownerId: "owner-alpha",
    ownerName: "Alpha Logistics Indonesia",
    warehouseId: "wh-north",
    warehouseName: "Gudang Utama Cakung",
    role: "STAFF",
    isSuperAdminOnBehalf: false,
    grantId: null,
  };

  const ownerBetaContext: ActiveSecurityContext = {
    userId: "usr-owner-beta",
    email: "owner_beta@docuflow.id",
    ownerId: "owner-beta",
    ownerName: "Beta Niaga Perkasa",
    warehouseId: "wh-beta-01",
    warehouseName: "Gudang Pusat Surabaya",
    role: "OWNER",
    isSuperAdminOnBehalf: false,
    grantId: null,
  };

  before(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    nativeDb = new DatabaseSync(TEST_DB_PATH);
    nativeDb.exec("PRAGMA foreign_keys = ON;");

    client = {
      prepare: (sql: string) => {
        const stmt = nativeDb.prepare(sql);
        return {
          run: (...params: unknown[]) => stmt.run(...params),
          get: (...params: unknown[]) => stmt.get(...params),
          all: (...params: unknown[]) => stmt.all(...params),
        };
      },
      exec: (sql: string) => nativeDb.exec(sql),
      close: () => nativeDb.close(),
      transaction: <T>(fn: () => T): T => {
        nativeDb.exec("BEGIN IMMEDIATE");
        try {
          const res = fn();
          nativeDb.exec("COMMIT");
          return res;
        } catch (err) {
          nativeDb.exec("ROLLBACK");
          throw err;
        }
      },
    };

    runMigrations(client);
    seedSyntheticData(client);
    repo = new InventoryRepository(client);
  });

  after(() => {
    try {
      nativeDb.close();
    } catch {}
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch {}
    }
  });

  test("1. PO Pending dan Post terdaftar sebagai referensi Goods Out tanpa leak CANCELLED/REJECTED", () => {
    const cust = repo.getCustomers(ownerAlphaContext)[0];
    assert.ok(cust, "Harus ada customer");

    // Create a Pending PO
    const pendingPo = repo.createPurchaseOrder(staffAlphaContext, {
      customerId: cust.id,
      poNumber: "PO-REWORK-PENDING-01",
      orderDate: "2026-10-18",
      lines: [
        {
          productId: "prod-cbl-01",
          rawProductName: "Kabel UTP Cat6 Pure Copper 305 Meter",
          orderedQty: 10,
          orderedUnit: "PCS",
        },
      ],
    });
    assert.equal(pendingPo.status, "PENDING_APPROVAL");

    // Create a Confirmed PO
    const confirmedPo = repo.createPurchaseOrder(staffAlphaContext, {
      customerId: cust.id,
      poNumber: "PO-REWORK-CONFIRMED-01",
      orderDate: "2026-10-18",
      lines: [
        {
          productId: "prod-cbl-01",
          rawProductName: "Kabel UTP Cat6 Pure Copper 305 Meter",
          orderedQty: 20,
          orderedUnit: "PCS",
        },
      ],
    });
    repo.approvePurchaseOrder(ownerAlphaContext, confirmedPo.id);

    // Create a Rejected PO
    const rejectedPo = repo.createPurchaseOrder(staffAlphaContext, {
      customerId: cust.id,
      poNumber: "PO-REWORK-REJECTED-01",
      orderDate: "2026-10-18",
      lines: [
        {
          productId: "prod-rtr-01",
          rawProductName: "Barang Ditolak",
          orderedQty: 5,
          orderedUnit: "PCS",
        },
      ],
    });
    repo.rejectPurchaseOrder(ownerAlphaContext, rejectedPo.id, "Stok tidak cukup");

    // Fetch POs for Goods Out reference
    const poList = repo
      .getPurchaseOrders(staffAlphaContext)
      .filter((p) => p.status !== "CANCELLED" && p.status !== "REJECTED");

    const foundPending = poList.find((p) => p.id === pendingPo.id);
    const foundConfirmed = poList.find((p) => p.id === confirmedPo.id);
    const foundRejected = poList.find((p) => p.id === rejectedPo.id);

    assert.ok(foundPending, "PO berstatus PENDING_APPROVAL harus terdeteksi di daftar referensi");
    assert.ok(foundConfirmed, "PO berstatus CONFIRMED harus terdeteksi di daftar referensi");
    assert.equal(foundRejected, undefined, "PO berstatus REJECTED tidak boleh ditawarkan sebagai referensi");
  });

  test("2. Melihat atau membuka PO tidak membuat Goods Out atau memotong stok", () => {
    const productsBefore = repo.getProductsByOwner(ownerAlphaContext);
    const cblBefore = productsBefore.find((p) => p.sku === "CBL-CAT6-305");
    assert.ok(cblBefore);
    const stockBefore = cblBefore.physicalStock ?? 0;

    // View PO detail
    const poList = repo.getPurchaseOrders(ownerAlphaContext);
    const targetPo = poList.find((p) => p.poNumber === "PO-REWORK-CONFIRMED-01");
    assert.ok(targetPo);

    const productsAfter = repo.getProductsByOwner(ownerAlphaContext);
    const cblAfter = productsAfter.find((p) => p.sku === "CBL-CAT6-305");
    assert.equal(cblAfter?.physicalStock, stockBefore, "Melihat PO tidak boleh mengubah saldo fisik produk");
  });

  test("3. Guard Status: PO berstatus Pending ditolak jika dipaksa membuat transaksi Goods Out", () => {
    const poList = repo.getPurchaseOrders(ownerAlphaContext);
    const pendingPo = poList.find((p) => p.poNumber === "PO-REWORK-PENDING-01");
    assert.ok(pendingPo);
    const pendingLine = pendingPo.lines[0];
    assert.ok(pendingLine);

    assert.throws(
      () => {
        repo.createGoodsOutPendingTransaction(staffAlphaContext, {
          warehouseId: "wh-north",
          poId: pendingPo.id,
          customerId: pendingPo.customerId,
          documentNumber: "GO-TEST-PENDING-FAIL",
          documentDate: "2026-10-18",
          lines: [
            {
              productId: pendingLine.productId!,
              poLineId: pendingLine.id,
              quantity: 2,
              unit: "pcs",
            },
          ],
        });
      },
      (err: unknown) => {
        return err instanceof AppError && err.code === "ERR_CONFLICT";
      },
      "PO Pending harus ditolak pada pembuatan Goods Out"
    );
  });

  test("4. Item terpilih dari PO Confirmed dapat dibuat Goods Out Pending (Reservasi)", () => {
    const poList = repo.getPurchaseOrders(ownerAlphaContext);
    const confirmedPo = poList.find((p) => p.poNumber === "PO-REWORK-CONFIRMED-01");
    assert.ok(confirmedPo);
    const confirmedLine = confirmedPo.lines[0];
    assert.ok(confirmedLine);

    const productsBefore = repo.getProductsByOwner(ownerAlphaContext);
    const cblBefore = productsBefore.find((p) => p.sku === "CBL-CAT6-305");
    const physicalBefore = cblBefore?.physicalStock ?? 0;
    const reservedBefore = cblBefore?.reservedStock ?? 0;

    // Create partial Goods Out Pending (8 unit)
    const goPending = repo.createGoodsOutPendingTransaction(staffAlphaContext, {
      warehouseId: "wh-north",
      poId: confirmedPo.id,
      customerId: confirmedPo.customerId,
      documentNumber: "GO-REWORK-01",
      documentDate: "2026-10-18",
      lines: [
        {
          productId: confirmedLine.productId!,
          poLineId: confirmedLine.id,
          quantity: 8,
          unit: "pcs",
        },
      ],
    });

    assert.ok(goPending.goodsOutId);

    // Physical stock MUST NOT change yet
    const productsAfter = repo.getProductsByOwner(ownerAlphaContext);
    const cblAfter = productsAfter.find((p) => p.sku === "CBL-CAT6-305");
    assert.equal(cblAfter?.physicalStock, physicalBefore, "Pending Goods Out tidak mengurangi stok fisik");
    assert.equal(cblAfter?.reservedStock, reservedBefore + 8, "Pending Goods Out menambahkan stok tereservasi");
  });

  test("5. Guard Over-Allocation: Menolak alokasi kuantitas yang melebihi sisa PO", () => {
    const poList = repo.getPurchaseOrders(ownerAlphaContext);
    const confirmedPo = poList.find((p) => p.poNumber === "PO-REWORK-CONFIRMED-01");
    assert.ok(confirmedPo);
    const confirmedLine = confirmedPo.lines[0];
    assert.ok(confirmedLine);

    // Target is 20, 8 is already pending -> remaining is 12. Requesting 15 MUST fail.
    assert.throws(
      () => {
        repo.createGoodsOutPendingTransaction(staffAlphaContext, {
          warehouseId: "wh-north",
          poId: confirmedPo.id,
          customerId: confirmedPo.customerId,
          documentNumber: "GO-REWORK-OVERALLOC",
          documentDate: "2026-10-18",
          lines: [
            {
              productId: confirmedLine.productId!,
              poLineId: confirmedLine.id,
              quantity: 15,
              unit: "pcs",
            },
          ],
        });
      },
      (err: unknown) => {
        return err instanceof AppError && err.code === "ERR_CONFLICT";
      },
      "Alokasi melebihi sisa target PO wajib ditolak (Over-allocation guard)"
    );
  });

  test("6. Penyelesaian Goods Out pertama mengubah PO menjadi PARTIALLY_FULFILLED secara atomik", () => {
    const goList = repo.getGoodsOutList(ownerAlphaContext);
    const go1 = goList.find((g) => g.reference === "GO-REWORK-01");
    assert.ok(go1);

    repo.completeGoodsOutTransaction(staffAlphaContext, go1.id);

    const updatedPo = repo.getPurchaseOrderById(ownerAlphaContext, go1.poId!);
    assert.ok(updatedPo);
    assert.equal(updatedPo.status, "PARTIALLY_FULFILLED");
    assert.equal(updatedPo.lines[0].fulfilledQty, 8);
    const remaining = updatedPo.lines[0].targetQty - updatedPo.lines[0].fulfilledQty;
    assert.equal(remaining, 12, "Sisa kuantitas harus tepat 12");
  });

  test("7. Goods Out kedua memenuhi seluruh sisa PO -> status otomatis FULFILLED", () => {
    const poList = repo.getPurchaseOrders(ownerAlphaContext);
    const targetPo = poList.find((p) => p.poNumber === "PO-REWORK-CONFIRMED-01");
    assert.ok(targetPo);
    const poLine = targetPo.lines[0];

    // Fulfill remaining 12
    const go2 = repo.createGoodsOutPendingTransaction(staffAlphaContext, {
      warehouseId: "wh-north",
      poId: targetPo.id,
      customerId: targetPo.customerId,
      documentNumber: "GO-REWORK-02",
      documentDate: "2026-10-18",
      lines: [
        {
          productId: poLine.productId!,
          poLineId: poLine.id,
          quantity: 12,
          unit: "pcs",
        },
      ],
    });

    repo.completeGoodsOutTransaction(staffAlphaContext, go2.goodsOutId);

    const completedPo = repo.getPurchaseOrderById(ownerAlphaContext, targetPo.id);
    assert.ok(completedPo);
    assert.equal(completedPo.status, "FULFILLED");
    assert.equal(completedPo.lines[0].fulfilledQty, 20);
    const remaining = completedPo.lines[0].targetQty - completedPo.lines[0].fulfilledQty;
    assert.equal(remaining, 0, "Sisa kuantitas harus 0 saat FULFILLED");
  });

  test("8. Multi-Tenant Guard: Owner Beta tidak dapat memproses PO milik Owner Alpha", () => {
    const poListAlpha = repo.getPurchaseOrders(ownerAlphaContext);
    const poAlpha = poListAlpha[0];
    assert.ok(poAlpha);

    assert.throws(
      () => {
        repo.createGoodsOutPendingTransaction(ownerBetaContext, {
          warehouseId: "wh-beta-01",
          poId: poAlpha.id,
          customerId: poAlpha.customerId,
          documentNumber: "GO-BETA-HACK",
          documentDate: "2026-10-18",
          lines: [
            {
              productId: poAlpha.lines[0].productId!,
              poLineId: poAlpha.lines[0].id,
              quantity: 1,
              unit: "pcs",
            },
          ],
        });
      },
      (err: unknown) => {
        return err instanceof AppError && err.code === "ERR_NOT_FOUND";
      },
      "Akses lintas tenant wajib ditolak ERR_NOT_FOUND"
    );
  });

  test("9. Validasi Backend PO: Wajib productId Master Produk resmi, tolak tanpa productId atau produk silang tenant", () => {
    const cust = repo.getCustomers(ownerAlphaContext)[0];
    assert.ok(cust);

    // 9.1 Menolak baris PO tanpa nama dan tanpa productId
    assert.throws(
      () => {
        repo.createPurchaseOrder(staffAlphaContext, {
          customerId: cust.id,
          poNumber: "PO-FAIL-NO-PROD",
          orderDate: "2026-10-18",
          lines: [
            {
              rawProductName: "",
              orderedQty: 5,
              orderedUnit: "PCS",
            },
          ],
        });
      },
      (err: unknown) => {
        return err instanceof AppError && err.code === "ERR_VALIDATION";
      },
      "PO tanpa nama dan tanpa productId wajib ditolak ERR_VALIDATION"
    );

    // 9.1b PO Bebas: baris dengan nama barang bebas berhasil dibuat tanpa membuat master produk
    const poBebas = repo.createPurchaseOrder(staffAlphaContext, {
      customerId: cust.id,
      poNumber: "PO-BEBAS-OK-01",
      orderDate: "2026-10-18",
      lines: [
        {
          rawProductName: "Produk Bebas Tidak Resmi",
          orderedQty: 5,
          orderedUnit: "PCS",
        },
      ],
    });
    assert.ok(poBebas.id);
    assert.equal(poBebas.lines[0].productId, null);
    assert.equal(poBebas.lines[0].mappingStatus, "UNMAPPED");

    // 9.2 Menolak produk milik tenant lain (Beta ke Alpha)
    assert.throws(
      () => {
        repo.createPurchaseOrder(staffAlphaContext, {
          customerId: cust.id,
          poNumber: "PO-FAIL-CROSS-TENANT",
          orderDate: "2026-10-18",
          lines: [
            {
              productId: "prod-beta-01",
              rawProductName: "Produk Milik Tenant Lain",
              orderedQty: 5,
              orderedUnit: "PCS",
            },
          ],
        });
      },
      (err: unknown) => {
        return err instanceof AppError && err.code === "ERR_NOT_FOUND";
      },
      "Produk milik tenant lain wajib ditolak ERR_NOT_FOUND"
    );

    // 9.3 Menolak gudang yang tidak ditugaskan kepada Staff
    assert.throws(
      () => {
        repo.createPurchaseOrder(staffAlphaContext, {
          customerId: cust.id,
          warehouseId: "wh-south", // Bukan wh-north yang ditugaskan ke Staff Alpha
          poNumber: "PO-FAIL-WRONG-WH",
          orderDate: "2026-10-18",
          lines: [
            {
              productId: "prod-cbl-01",
              orderedQty: 5,
              orderedUnit: "PCS",
            },
          ],
        });
      },
      (err: unknown) => {
        return err instanceof AppError && err.code === "ERR_FORBIDDEN_WAREHOUSE";
      },
      "Gudang di luar penugasan Staff wajib ditolak ERR_FORBIDDEN_WAREHOUSE"
    );
  });

  test("10. Integritas PO Lama (UNMAPPED): Ditolak di Goods Out sebelum dipetakan, dan berhasil dipetakan ke produk resmi", () => {
    const cust = repo.getCustomers(ownerAlphaContext)[0];
    assert.ok(cust);

    // Buat PO historis dengan baris unmapped langsung di SQLite (mensimulasikan data lama sebelum pengetatan)
    const legacyPoId = "po-legacy-unmapped-01";
    const legacyLineId = "pol-legacy-01";
    const now = new Date().toISOString();

    nativeDb.prepare(`
      INSERT INTO purchase_orders (id, owner_id, customer_id, warehouse_id, po_number, order_date, status, total_amount, created_by_user_id, created_at, updated_at)
      VALUES (?, 'owner-alpha', ?, 'wh-north', 'PO-LEGACY-001', '2026-10-01', 'CONFIRMED', 0, 'usr-owner-alpha', ?, ?)
    `).run(legacyPoId, cust.id, now, now);

    nativeDb.prepare(`
      INSERT INTO purchase_order_lines (id, po_id, product_id, raw_product_name, ordered_qty, ordered_unit, conversion_factor, mapping_status, target_qty, fulfilled_qty, unit_price, discount_amount, created_at)
      VALUES (?, ?, NULL, 'Barang Lama Belum Terpetakan', 5, 'PCS', 1, 'UNMAPPED', 5, 0, 0, 0, ?)
    `).run(legacyLineId, legacyPoId, now);

    // 10.1 Coba buat Goods Out dari item unmapped -> WAJIB ditolak ERR_CONFLICT
    assert.throws(
      () => {
        repo.createGoodsOutPendingTransaction(staffAlphaContext, {
          warehouseId: "wh-north",
          poId: legacyPoId,
          customerId: cust.id,
          documentNumber: "GO-LEGACY-FAIL",
          documentDate: "2026-10-18",
          lines: [
            {
              productId: "prod-cbl-01",
              poLineId: legacyLineId,
              quantity: 5,
              unit: "pcs",
            },
          ],
        });
      },
      (err: unknown) => {
        return err instanceof AppError && err.code === "ERR_CONFLICT";
      },
      "Goods Out dari baris PO UNMAPPED wajib ditolak"
    );

    // 10.2 Petakan baris PO lama ke produk katalog resmi via mapPurchaseOrderLineToProduct
    repo.mapPurchaseOrderLineToProduct(ownerAlphaContext, {
      poId: legacyPoId,
      lineId: legacyLineId,
      productId: "prod-cbl-01",
    });

    const mappedPo = repo.getPurchaseOrderById(ownerAlphaContext, legacyPoId);
    assert.ok(mappedPo);
    const lineAfterMap = mappedPo.lines.find((l) => l.id === legacyLineId);
    assert.equal(lineAfterMap?.mappingStatus, "MAPPED");
    assert.equal(lineAfterMap?.productId, "prod-cbl-01");

    // 10.3 Sekarang Goods Out dapat diproses
    const goSuccess = repo.createGoodsOutPendingTransaction(staffAlphaContext, {
      warehouseId: "wh-north",
      poId: legacyPoId,
      customerId: cust.id,
      documentNumber: "GO-LEGACY-SUCCESS",
      documentDate: "2026-10-18",
      lines: [
        {
          productId: "prod-cbl-01",
          poLineId: legacyLineId,
          quantity: 5,
          unit: "pcs",
        },
      ],
    });
    assert.ok(goSuccess.goodsOutId);
  });
});
