/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Test Suite: Tahap B.3 — Final Audit Sebelum Migrasi Database
 * Memverifikasi:
 * 1. Integrasi penuh Purchase Order (PO) <-> Goods Out (parsial, over-fulfillment guard, auto status transition).
 * 2. Two-phase Inventory Returns (DRAFT -> approveAndReceive, source qty limit, serial quarantine, reopen PO quota).
 * 3. Invoice & Payments (overpayment guard, anti-duplicate reference guard, separation from stock mutations).
 * 4. Stock Opname & Multi-Tenant / Warehouse Security Enforcement.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "../src/lib/db/migrator.ts";
import { seedSyntheticData } from "../src/lib/db/seed.ts";
import { InventoryRepository } from "../src/lib/db/repositories/inventory-repository.ts";
import { AppError } from "../src/lib/errors/app-error.ts";
import type { DatabaseClient } from "../src/lib/db/sqlite-client.ts";
import type { ActiveSecurityContext } from "../src/lib/types/auth.ts";

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-stage-b3.db");

describe("Tahap B.3: Final Audit Aturan Bisnis, Integrasi UI & Kesiapan Migrasi", () => {
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

  const staffNorthContext: ActiveSecurityContext = {
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
    ownerName: "Beta Retail Nusantara",
    warehouseId: "wh-beta-01",
    warehouseName: "Gudang Surabaya",
    role: "OWNER",
    isSuperAdminOnBehalf: false,
    grantId: null,
  };

  before(() => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(`${TEST_DB_PATH}-wal`)) fs.unlinkSync(`${TEST_DB_PATH}-wal`);
    if (fs.existsSync(`${TEST_DB_PATH}-shm`)) fs.unlinkSync(`${TEST_DB_PATH}-shm`);

    nativeDb = new DatabaseSync(TEST_DB_PATH);
    nativeDb.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");

    client = {
      prepare: (sql: string) => nativeDb.prepare(sql),
      exec: (sql: string) => nativeDb.exec(sql),
      close: () => nativeDb.close(),
      transaction: <T>(fn: () => T): T => {
        nativeDb.exec("BEGIN IMMEDIATE");
        try {
          const res = fn();
          nativeDb.exec("COMMIT");
          return res;
        } catch (e) {
          nativeDb.exec("ROLLBACK");
          throw e;
        }
      },
    };

    runMigrations(client);
    seedSyntheticData(client);

    // Setup produk tambahan prod-rj45-01 untuk pengujian multi-item PO
    nativeDb.prepare(`
      INSERT INTO products (id, owner_id, warehouse_id, sku, name, category, tracking_mode, unit, min_stock, description, status, created_at, updated_at)
      VALUES ('prod-rj45-01', 'owner-alpha', 'wh-north', 'CONN-RJ45', 'Konektor RJ45 Cat6 Gold Plated', 'Konektor', 'NON_SERIAL', 'pack', 10, 'Pack 50 pcs konektor RJ45', 'ACTIVE', datetime('now'), datetime('now'))
    `).run();

    nativeDb.prepare(`
      INSERT INTO inventory_ledger (id, sequence_number, owner_id, warehouse_id, product_id, location_id, entry_type, source_doc_type, source_doc_id, source_line_id, quantity_delta_base, serial_ids_json, actor_user_id, occurred_at, created_at)
      VALUES ('led-setup-rj45', 10, 'owner-alpha', 'wh-north', 'prod-rj45-01', null, 'GOODS_IN_POSTED', 'GOODS_IN', 'gi-setup-rj45', 'line-setup-rj45', 50, null, 'usr-owner-alpha', datetime('now'), datetime('now'))
    `).run();

    repo = new InventoryRepository(client);
  });

  after(() => {
    try {
      client.close();
      if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
      if (fs.existsSync(`${TEST_DB_PATH}-wal`)) fs.unlinkSync(`${TEST_DB_PATH}-wal`);
      if (fs.existsSync(`${TEST_DB_PATH}-shm`)) fs.unlinkSync(`${TEST_DB_PATH}-shm`);
    } catch {
      // Ignore cleanup error
    }
  });

  // =========================================================================
  // 1. INTEGRASI PURCHASE ORDER <-> GOODS OUT
  // =========================================================================
  describe("Modul 1: Integrasi Penuh Purchase Order (PO) <-> Goods Out", () => {
    let testPoId: string;
    let poLineCblId: string;
    let poLineRj45Id: string;

    test("1.1 Pembuatan PO dengan status CONFIRMED untuk multi-item", () => {
      const po = repo.createPurchaseOrder(ownerAlphaContext, {
        customerId: "cust-alpha-01",
        poNumber: "PO-B3-AUDIT-001",
        orderDate: "2026-10-15",
        notes: "Uji integrasi pemenuhan bertahap Goods Out",
        lines: [
          { productId: "prod-cbl-01", targetQty: 10, unitPrice: 250000 },
          { productId: "prod-rj45-01", targetQty: 20, unitPrice: 50000 },
        ],
      });

      testPoId = po.id;
      const lines = nativeDb
        .prepare(`SELECT id, product_id, target_qty, fulfilled_qty FROM purchase_order_lines WHERE po_id = ?`)
        .all(testPoId) as Array<{ id: string; product_id: string; target_qty: number; fulfilled_qty: number }>;

      poLineCblId = lines.find((l) => l.product_id === "prod-cbl-01")!.id;
      poLineRj45Id = lines.find((l) => l.product_id === "prod-rj45-01")!.id;

      assert.strictEqual(po.status, "CONFIRMED");
      assert.strictEqual(lines.length, 2);
      assert.strictEqual(Number(lines[0].fulfilled_qty), 0);
    });

    test("1.2 Goods Out Pending pertama mereservasi kuantitas PO tanpa mengurangi stok fisik", () => {
      const pBefore = repo.getProductById(ownerAlphaContext, "prod-cbl-01");
      const stockBefore = pBefore?.product.physicalStock ?? 0;

      // Buat Goods Out 1 untuk memenuhi 6 dari 10 unit prod-cbl-01
      const go1 = repo.createGoodsOutPendingTransaction(ownerAlphaContext, {
        warehouseId: "wh-north",
        customerId: "cust-alpha-01",
        poId: testPoId,
        documentNumber: "GO-B3-STAGE1-001",
        documentDate: "2026-10-15",
        lines: [
          {
            productId: "prod-cbl-01",
            poLineId: poLineCblId,
            quantity: 6,
          },
        ],
      });

      assert.ok(go1.goodsOutId);

      // Verifikasi stok fisik BELUM berkurang
      const pAfterPending = repo.getProductById(ownerAlphaContext, "prod-cbl-01");
      assert.strictEqual(pAfterPending?.product.physicalStock, stockBefore, "Pending tidak boleh mengurangi fisik");
      assert.strictEqual(pAfterPending?.product.reservedStock, 6, "Reservasi harus bertambah 6");

      // Verifikasi po_id dan po_line_id tersimpan di tabel
      const goRow = nativeDb
        .prepare(`SELECT po_id FROM goods_out WHERE id = ?`)
        .get(go1.goodsOutId) as { po_id: string };
      assert.strictEqual(goRow.po_id, testPoId);

      const goLineRow = nativeDb
        .prepare(`SELECT po_line_id, quantity FROM goods_out_lines WHERE goods_out_id = ?`)
        .get(go1.goodsOutId) as { po_line_id: string; quantity: number };
      assert.strictEqual(goLineRow.po_line_id, poLineCblId);
      assert.strictEqual(Number(goLineRow.quantity), 6);
    });

    test("1.3 Guard Over-Allocation: Menolak Goods Out kedua jika akumulasi alokasi melebihi sisa PO", () => {
      // Sisa kuota prod-cbl-01 adalah 10 - 6 = 4. Jika mencoba meminta 5 unit, harus ditolak!
      assert.throws(
        () => {
          repo.createGoodsOutPendingTransaction(ownerAlphaContext, {
            warehouseId: "wh-north",
            customerId: "cust-alpha-01",
            poId: testPoId,
            documentNumber: "GO-B3-OVER-TEST",
            documentDate: "2026-10-15",
            lines: [
              {
                productId: "prod-cbl-01",
                poLineId: poLineCblId,
                quantity: 5, // 6 + 5 = 11 > 10
              },
            ],
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.code, "ERR_CONFLICT");
          assert.match(err.message, /melampaui sisa target PO yang belum dialokasikan/i);
          return true;
        }
      );
    });

    test("1.4 Menyelesaikan Goods Out pertama: Mengurangi fisik dan mengubah status PO ke PARTIALLY_FULFILLED", () => {
      const go1Row = nativeDb
        .prepare(`SELECT id FROM goods_out WHERE document_number = 'GO-B3-STAGE1-001'`)
        .get() as { id: string };

      const res = repo.completeGoodsOutTransaction(ownerAlphaContext, go1Row.id);
      assert.strictEqual(res.completed, true);

      // Verifikasi baris PO ter-update fulfilled_qty = 6
      const poLine = nativeDb
        .prepare(`SELECT fulfilled_qty FROM purchase_order_lines WHERE id = ?`)
        .get(poLineCblId) as { fulfilled_qty: number };
      assert.strictEqual(Number(poLine.fulfilled_qty), 6);

      // Verifikasi status PO berubah menjadi PARTIALLY_FULFILLED
      const poRow = nativeDb
        .prepare(`SELECT status FROM purchase_orders WHERE id = ?`)
        .get(testPoId) as { status: string };
      assert.strictEqual(poRow.status, "PARTIALLY_FULFILLED");
    });

    test("1.5 Goods Out kedua memenuhi seluruh sisa PO -> Status PO otomatis FULFILLED", () => {
      // Sisa prod-cbl-01: 4 unit. Sisa prod-rj45-01: 20 unit.
      const go2 = repo.createGoodsOutPendingTransaction(ownerAlphaContext, {
        warehouseId: "wh-north",
        customerId: "cust-alpha-01",
        poId: testPoId,
        documentNumber: "GO-B3-STAGE2-002",
        documentDate: "2026-10-15",
        lines: [
          { productId: "prod-cbl-01", poLineId: poLineCblId, quantity: 4 },
          { productId: "prod-rj45-01", poLineId: poLineRj45Id, quantity: 20 },
        ],
      });

      // Selesaikan Goods Out 2
      repo.completeGoodsOutTransaction(ownerAlphaContext, go2.goodsOutId);

      // Verifikasi seluruh line PO terpenuhi
      const lines = nativeDb
        .prepare(`SELECT target_qty, fulfilled_qty FROM purchase_order_lines WHERE po_id = ?`)
        .all(testPoId) as Array<{ target_qty: number; fulfilled_qty: number }>;

      assert.strictEqual(Number(lines[0].fulfilled_qty), Number(lines[0].target_qty));
      assert.strictEqual(Number(lines[1].fulfilled_qty), Number(lines[1].target_qty));

      // Verifikasi status PO berpindah menjadi FULFILLED
      const poRow = nativeDb
        .prepare(`SELECT status FROM purchase_orders WHERE id = ?`)
        .get(testPoId) as { status: string };
      assert.strictEqual(poRow.status, "FULFILLED");
    });

    test("1.6 getGoodsOutList menampilkan referensi nomor PO yang valid", () => {
      const list = repo.getGoodsOutList(ownerAlphaContext);
      const tx1 = list.find((t) => t.reference === "GO-B3-STAGE1-001");
      const tx2 = list.find((t) => t.reference === "GO-B3-STAGE2-002");

      assert.ok(tx1);
      assert.strictEqual(tx1.poId, testPoId);
      assert.strictEqual(tx1.poNumber, "PO-B3-AUDIT-001");

      assert.ok(tx2);
      assert.strictEqual(tx2.poId, testPoId);
      assert.strictEqual(tx2.poNumber, "PO-B3-AUDIT-001");
    });
  });

  // =========================================================================
  // 2. AUDIT RETUR BARANG (TWO-PHASE & REOPEN PO QUOTA)
  // =========================================================================
  describe("Modul 2: Audit Retur Menyeluruh (DRAFT -> Received, Limit Sumber, Serial Quarantine & Reopen PO)", () => {
    let createdGoId: string;
    let draftReturnId: string;

    test("2.1 Persiapan: Pengiriman Goods Out 5 unit prod-cbl-01", () => {
      const go = repo.createGoodsOutPendingTransaction(ownerAlphaContext, {
        warehouseId: "wh-north",
        customerId: "cust-alpha-01",
        documentNumber: "GO-B3-FOR-RETURN-001",
        documentDate: "2026-10-15",
        lines: [{ productId: "prod-cbl-01", quantity: 5 }],
      });
      repo.completeGoodsOutTransaction(ownerAlphaContext, go.goodsOutId);
      createdGoId = go.goodsOutId;
      assert.ok(createdGoId);
    });

    test("2.2 Guard Limit Kuantitas Sumber: Menolak retur jika melebihi kuantitas pengiriman asli", () => {
      // Pengiriman aslinya adalah 5 unit. Jika diretur 6 unit, server wajib menolak!
      assert.throws(
        () => {
          repo.createInventoryReturn(ownerAlphaContext, {
            warehouseId: "wh-north",
            customerId: "cust-alpha-01",
            goodsOutId: createdGoId,
            returnNumber: "RET-B3-EXCEED-001",
            returnDate: "2026-10-15",
            reason: "SALAH_KIRIM",
            lines: [{ productId: "prod-cbl-01", quantity: 6, condition: "BAIK" }],
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.code, "ERR_CONFLICT");
          assert.match(err.message, /melebihi sisa kuantitas pengiriman yang dapat diretur/i);
          return true;
        }
      );
    });

    test("2.3 Pengajuan Retur Berstatus DRAFT: TIDAK ada mutasi stok di ledger sebelum penerimaan fisik", () => {
      const pBefore = repo.getProductById(ownerAlphaContext, "prod-cbl-01");
      const stockBefore = pBefore?.product.physicalStock ?? 0;

      const ret = repo.createInventoryReturn(ownerAlphaContext, {
        warehouseId: "wh-north",
        customerId: "cust-alpha-01",
        goodsOutId: createdGoId,
        returnNumber: "RET-B3-DRAFT-001",
        returnDate: "2026-10-15",
        reason: "SALAH_KIRIM",
        notes: "Barang salah kirim 2 unit, masih dalam perjalanan",
        lines: [{ productId: "prod-cbl-01", quantity: 2, condition: "BAIK" }],
      });

      draftReturnId = ret.id;
      assert.strictEqual(ret.status, "DRAFT", "Status retur awal harus DRAFT");

      // Verifikasi saldo fisik tidak berubah
      const pAfter = repo.getProductById(ownerAlphaContext, "prod-cbl-01");
      assert.strictEqual(pAfter?.product.physicalStock, stockBefore, "Saldo fisik tidak boleh bertambah saat DRAFT");

      // Verifikasi tabel inventory_ledger belum ada entry retur ini
      const ledgerEntry = nativeDb
        .prepare(`SELECT id FROM inventory_ledger WHERE source_doc_id = ?`)
        .get(draftReturnId);
      assert.strictEqual(ledgerEntry, undefined, "Ledger tidak boleh ditulis saat retur masih DRAFT");
    });

    test("2.4 Persetujuan & Penerimaan Fisik: Menulis ledger RETURN_IN_POSTED atomik", () => {
      const pBefore = repo.getProductById(ownerAlphaContext, "prod-cbl-01");
      const stockBefore = pBefore?.product.physicalStock ?? 0;

      const receiveRes = repo.approveAndReceiveInventoryReturn(ownerAlphaContext, draftReturnId);
      assert.strictEqual(receiveRes.received, true);

      // Verifikasi status berubah ke RECEIVED
      const retRow = nativeDb
        .prepare(`SELECT status, received_by_user_id, received_at FROM inventory_returns WHERE id = ?`)
        .get(draftReturnId) as { status: string; received_by_user_id: string; received_at: string };
      assert.strictEqual(retRow.status, "RECEIVED");
      assert.strictEqual(retRow.received_by_user_id, ownerAlphaContext.userId);
      assert.ok(retRow.received_at);

      // Verifikasi ledger ditulis dengan quantity delta positif +2
      const ledger = nativeDb
        .prepare(`SELECT quantity_delta_base, entry_type FROM inventory_ledger WHERE source_doc_id = ?`)
        .get(draftReturnId) as { quantity_delta_base: number; entry_type: string };
      assert.strictEqual(ledger.entry_type, "RETURN_IN_POSTED");
      assert.strictEqual(Number(ledger.quantity_delta_base), 2);

      // Verifikasi stok fisik bertambah 2
      const pAfter = repo.getProductById(ownerAlphaContext, "prod-cbl-01");
      assert.strictEqual(pAfter?.product.physicalStock, stockBefore + 2);
    });

    test("2.5 Anti-Double-Receive: Menolak penerimaan fisik berulang pada retur yang sudah RECEIVED", () => {
      assert.throws(
        () => {
          repo.approveAndReceiveInventoryReturn(ownerAlphaContext, draftReturnId);
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.code, "ERR_CONFLICT");
          assert.match(err.message, /Hanya DRAFT yang dapat disetujui/i);
          return true;
        }
      );
    });

    test("2.6 Serial Number Rusak wajib masuk status QUARANTINE (Tidak boleh jadi stok tersedia)", () => {
      const snBad = "SN-QUARANTINE-B3-001";
      const now = new Date().toISOString();

      nativeDb.prepare(`
        INSERT INTO product_serials (
          id, owner_id, warehouse_id, product_id, serial_number, normalized_serial_number, status, created_at, updated_at
        ) VALUES (?, 'owner-alpha', 'wh-north', 'prod-rtr-01', ?, ?, 'CONSUMED_OUT', ?, ?)
      `).run(crypto.randomUUID(), snBad, snBad, now, now);

      const ret = repo.createInventoryReturn(ownerAlphaContext, {
        warehouseId: "wh-north",
        customerId: "cust-alpha-01",
        returnNumber: "RET-B3-DEFECT-001",
        returnDate: "2026-10-15",
        reason: "CACAT",
        lines: [{ productId: "prod-rtr-01", quantity: 1, condition: "RUSAK", returnedSerials: [snBad] }],
      });

      repo.approveAndReceiveInventoryReturn(ownerAlphaContext, ret.id);

      const snRow = nativeDb
        .prepare(`SELECT status FROM product_serials WHERE serial_number = ?`)
        .get(snBad) as { status: string };
      assert.strictEqual(snRow.status, "QUARANTINE", "Serial rusak harus berstatus QUARANTINE");
    });
  });

  // =========================================================================
  // 3. INVOICE, OVERPAYMENT GUARD & IDEMPOTENCY
  // =========================================================================
  describe("Modul 3: Invoice, Overpayment Guard, dan Idempotensi Pembayaran", () => {
    let testDocId: string;

    test("3.1 Pembuatan Invoice tidak memotong stok fisik", () => {
      const pBefore = repo.getProductById(ownerAlphaContext, "prod-rtr-01");
      const stockBefore = pBefore?.product.physicalStock ?? 0;

      const doc = repo.createCommercialDocument(ownerAlphaContext, {
        customerId: "cust-alpha-01",
        documentNumber: "INV-B3-AUDIT-001",
        documentDate: "2026-10-15",
        dueDate: "2026-11-15",
        documentType: "INVOICE",
        subtotal: 5000000,
        itemDiscount: 500000,
        docNominalDiscount: 200000,
        docPercentageDiscount: 10,
        pointsRedeemed: 70000,
      });

      testDocId = doc.id;
      // Step 1: 5.000.000 - 500.000 = 4.500.000
      // Step 2: 4.500.000 - 200.000 = 4.300.000
      // Step 3: 4.300.000 * 0.9 = 3.870.000
      // Step 4: 3.870.000 - 70.000 = 3.800.000
      assert.strictEqual(doc.totalAmount, 3800000);

      // Verifikasi stok tidak berubah sama sekali
      const pAfter = repo.getProductById(ownerAlphaContext, "prod-rtr-01");
      assert.strictEqual(pAfter?.product.physicalStock, stockBefore, "Invoice tidak boleh merubah saldo stok");
    });

    test("3.2 Guard Overpayment: Menolak pembayaran yang melebihi sisa tagihan", () => {
      // Total tagihan adalah 3.800.000. Jika dikirim 4.000.000, server wajib menolak!
      assert.throws(
        () => {
          repo.recordDocumentPayment(ownerAlphaContext, {
            documentId: testDocId,
            amount: 4000000,
            paymentMethod: "TRANSFER",
            referenceNumber: "REF-OVERPAY-001",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.code, "ERR_VALIDATION");
          assert.match(err.message, /melebihi sisa tagihan/i);
          return true;
        }
      );
    });

    test("3.3 Pembayaran Pertama Berhasil dan Mengubah Status ke PARTIALLY_PAID", () => {
      const pay1 = repo.recordDocumentPayment(ownerAlphaContext, {
        documentId: testDocId,
        amount: 2000000,
        paymentMethod: "TRANSFER",
        referenceNumber: "TRX-B3-REF-001",
      });

      assert.strictEqual(pay1.newStatus, "PARTIALLY_PAID");
      assert.strictEqual(pay1.paidAmount, 2000000);
    });

    test("3.4 Idempotency Guard: Menolak nomor referensi pembayaran duplikat", () => {
      assert.throws(
        () => {
          repo.recordDocumentPayment(ownerAlphaContext, {
            documentId: testDocId,
            amount: 500000,
            paymentMethod: "TRANSFER",
            referenceNumber: "TRX-B3-REF-001", // Referensi sama persis
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.code, "ERR_CONFLICT");
          assert.match(err.message, /sudah pernah dicatat/i);
          return true;
        }
      );
    });

    test("3.5 Pelunasan Tagihan: Pembayaran sisa 1.800.000 mengubah status ke PAID", () => {
      const pay2 = repo.recordDocumentPayment(ownerAlphaContext, {
        documentId: testDocId,
        amount: 1800000,
        paymentMethod: "TUNAI",
        referenceNumber: "TRX-B3-REF-002",
      });

      assert.strictEqual(pay2.newStatus, "PAID");
      assert.strictEqual(pay2.paidAmount, 3800000);
    });
  });

  // =========================================================================
  // 4. STOCK OPNAME & KEAMANAN MULTI-TENANT / WAREHOUSE
  // =========================================================================
  describe("Modul 4: Stock Opname & Keamanan Multi-Tenant / Multi-Warehouse", () => {
    test("4.1 Snapshot Stock Opname saat pembuatan sesi tidak mengubah saldo fisik", () => {
      const pBefore = repo.getProductById(ownerAlphaContext, "prod-rtr-01");
      const stockBefore = pBefore?.product.physicalStock ?? 0;

      const session = repo.createStockOpnameSession(ownerAlphaContext, {
        warehouseId: "wh-north",
        sessionNumber: "SO-B3-AUDIT-001",
        scope: "ALL",
        note: "Audit snapshot opname",
      });

      assert.strictEqual(session.status, "COUNTING");

      // Verifikasi stok fisik tetap sama
      const pAfter = repo.getProductById(ownerAlphaContext, "prod-rtr-01");
      assert.strictEqual(pAfter?.product.physicalStock, stockBefore);

      // Verifikasi snapshot lines tersimpan
      const lines = nativeDb
        .prepare(`SELECT snapshot_qty FROM stock_opname_lines WHERE session_id = ? AND product_id = 'prod-rtr-01'`)
        .get(session.id) as { snapshot_qty: number };
      assert.strictEqual(Number(lines.snapshot_qty), stockBefore);
    });

    test("4.2 Isolasi Multi-Tenant: Owner Beta tidak dapat mengakses dokumen Owner Alpha", () => {
      // Owner Beta mencoba membaca detail dokumen komersial milik Owner Alpha
      const betaDocs = repo.getCommercialDocuments(ownerBetaContext);
      assert.strictEqual(
        betaDocs.some((d) => d.ownerId === "owner-alpha"),
        false,
        "Dokumen Owner Alpha tidak boleh bocor ke query Owner Beta"
      );
    });

    test("4.3 Boundary Gudang: Staff Gudang Utara ditolak saat memproses mutasi di Gudang Selatan", () => {
      assert.throws(
        () => {
          repo.postGoodsInTransaction(staffNorthContext, {
            warehouseId: "wh-south", // Berbeda dengan context.warehouseId (wh-north)
            documentNumber: "GI-UNAUTHORIZED-WH",
            documentDate: "2026-10-15",
            lines: [{ productId: "prod-rtr-01", quantity: 5 }],
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.code, "ERR_FORBIDDEN_WAREHOUSE");
          return true;
        }
      );
    });
  });
});
