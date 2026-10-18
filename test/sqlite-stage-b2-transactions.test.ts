/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Test Suite: Tahap B.2 — Finalisasi Modul Transaksi & Uji End-to-End
 * Fokus:
 * 1. Purchase Orders (PO) — Pembuatan, Pemenuhan Parsial, Guard Over-fulfillment, Isolasi Gudang
 * 2. Invoices & Komersial — Persistensi SQLite, Urutan Diskon LOCKED, Pembayaran Nyata, Anti-Potong Stok
 * 3. Retur Barang — Baseline Reopen Source Qty, Mutasi Positif RETURN_IN_POSTED, Sanitasi Serial
 * 4. Audit Trail, Multi-Owner Isolation, Warehouse Boundary & Concurrency Rollback
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

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-stage-b2.db");

describe("Tahap B.2: Finalisasi Transaksi & Validasi End-to-End", () => {
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
  // 1. PURCHASE ORDERS (PO)
  // =========================================================================
  describe("Modul 1: Purchase Orders (PO) & Pemenuhan Bertahap", () => {
    let createdPoId: string;

    test("1.1 Dapat membuat PO baru dengan status CONFIRMED dan tersimpan persisten di SQLite", () => {
      const po = repo.createPurchaseOrder(ownerAlphaContext, {
        customerId: "cust-alpha-01",
        poNumber: "PO-B2-TEST-001",
        orderDate: "2026-10-15",
        notes: "Pesanan batch pengujian B.2",
        lines: [
          {
            productId: "prod-rtr-01",
            targetQty: 10,
            unitPrice: 150000,
            discountAmount: 50000,
          },
          {
            productId: "prod-cbl-01",
            targetQty: 5,
            unitPrice: 200000,
            discountAmount: 0,
          },
        ],
      });

      assert.ok(po.id, "ID PO harus terisi");
      assert.strictEqual(po.poNumber, "PO-B2-TEST-001");
      assert.strictEqual(po.status, "CONFIRMED");
      // Total = (10 * 150000 - 50000) + (5 * 200000 - 0) = 1450000 + 1000000 = 2450000
      assert.strictEqual(po.totalAmount, 2450000);
      createdPoId = po.id;

      // Verifikasi pembacaan dari SQLite
      const orders = repo.getPurchaseOrders(ownerAlphaContext);
      const found = orders.find((o) => o.id === po.id);
      assert.ok(found, "PO harus ditemukan dalam query repository");
      assert.strictEqual(found?.lines.length, 2, "Harus memiliki 2 baris item");

      // Verifikasi jejak audit log
      const audit = nativeDb
        .prepare(`SELECT * FROM audit_logs WHERE entity_id = ? AND action = 'CREATE_PURCHASE_ORDER'`)
        .get(po.id) as { action: string; entity_type: string } | undefined;
      assert.ok(audit, "Aktivitas pembuatan PO harus tercatat di audit log");
      assert.strictEqual(audit.entity_type, "PURCHASE_ORDER");
    });

    test("1.2 Pemenuhan parsial PO via Goods Out menambah fulfilled_qty bertahap", () => {
      // Pemenuhan tahap 1: 4 unit prod-rtr-01
      repo.recordPoFulfillment(ownerAlphaContext, createdPoId, [
        { productId: "prod-rtr-01", quantity: 4 },
      ]);

      const poAfterStep1 = repo.getPurchaseOrders(ownerAlphaContext).find((o) => o.id === createdPoId);
      const line1AfterStep1 = poAfterStep1?.lines.find((l) => l.productId === "prod-rtr-01");
      assert.strictEqual(line1AfterStep1?.fulfilledQty, 4, "Fulfilled qty harus 4");

      // Pemenuhan tahap 2: sisa 6 unit prod-rtr-01 dan 5 unit prod-cbl-01
      repo.recordPoFulfillment(ownerAlphaContext, createdPoId, [
        { productId: "prod-rtr-01", quantity: 6 },
        { productId: "prod-cbl-01", quantity: 5 },
      ]);

      const poAfterStep2 = repo.getPurchaseOrders(ownerAlphaContext).find((o) => o.id === createdPoId);
      const line1AfterStep2 = poAfterStep2?.lines.find((l) => l.productId === "prod-rtr-01");
      const line2AfterStep2 = poAfterStep2?.lines.find((l) => l.productId === "prod-cbl-01");
      assert.strictEqual(line1AfterStep2?.fulfilledQty, 10, "prod-rtr-01 harus terpenuhi 10/10");
      assert.strictEqual(line2AfterStep2?.fulfilledQty, 5, "prod-cbl-01 harus terpenuhi 5/5");
    });

    test("1.3 Guard Over-Fulfillment menolak pemenuhan yang melebihi kuantitas PO", () => {
      // Target prod-rtr-01 adalah 10, saat ini sudah 10. Jika ditambah 1 lagi, harus melempar ERR_CONFLICT
      assert.throws(
        () => {
          repo.recordPoFulfillment(ownerAlphaContext, createdPoId, [
            { productId: "prod-rtr-01", quantity: 1 },
          ]);
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.code, "ERR_CONFLICT");
          assert.match(err.message, /melampaui target PO/i);
          return true;
        }
      );
    });

    test("1.4 Isolasi Owner pada PO: Owner Beta tidak dapat melihat atau memenuhi PO Owner Alpha", () => {
      const ordersBeta = repo.getPurchaseOrders(ownerBetaContext);
      assert.strictEqual(
        ordersBeta.some((o) => o.id === createdPoId),
        false,
        "PO Owner Alpha tidak boleh muncul pada query Owner Beta"
      );

      // Coba rekayasa pemenuhan lintas-Owner
      assert.throws(
        () => {
          repo.recordPoFulfillment(ownerBetaContext, createdPoId, [
            { productId: "prod-rtr-01", quantity: 1 },
          ]);
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.code, "ERR_NOT_FOUND");
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 2. INVOICES & COMMERCIAL DOCUMENTS
  // =========================================================================
  describe("Modul 2: Invoices, Urutan Diskon LOCKED, dan Pembayaran Nyata", () => {
    let createdInvoiceId: string;
    let initialProdStock: number;

    test("2.1 Menghitung nilai akhir tagihan sesuai urutan diskon LOCKED (Item -> DocNom -> DocPct -> Points)", () => {
      // Ambil stok produk sebelum pembuatan invoice
      const pBefore = repo.getProductById(ownerAlphaContext, "prod-rtr-01");
      initialProdStock = pBefore?.product.physicalStock ?? 0;

      // Skenario Diskon Bertingkat:
      // Subtotal kotor: 10.000.000
      // 1. Diskon Item: 1.000.000 -> Step 1 = 9.000.000
      // 2. Diskon Dokumen Nominal: 500.000 -> Step 2 = 8.500.000
      // 3. Diskon Dokumen Persentase: 10% -> Step 3 = 8.500.000 * 0.9 = 7.650.000
      // 4. Penukaran Poin Terakhir: 150.000 -> Step 4 = 7.650.000 - 150.000 = 7.500.000
      const invoice = repo.createCommercialDocument(ownerAlphaContext, {
        customerId: "cust-alpha-01",
        documentNumber: "INV-B2-TEST-001",
        documentDate: "2026-10-15",
        dueDate: "2026-11-15",
        documentType: "INVOICE",
        subtotal: 10000000,
        itemDiscount: 1000000,
        docNominalDiscount: 500000,
        docPercentageDiscount: 10,
        pointsRedeemed: 150000,
        notes: "Uji urutan kalkulasi diskon bertingkat",
      });

      assert.ok(invoice.id);
      assert.strictEqual(invoice.totalAmount, 7500000, "Nilai total tagihan harus tepat Rp 7.500.000");
      assert.strictEqual(invoice.status, "ISSUED");
      createdInvoiceId = invoice.id;

      // Verifikasi data di SQLite
      const docs = repo.getCommercialDocuments(ownerAlphaContext);
      const found = docs.find((d) => d.id === invoice.id);
      assert.ok(found);
      assert.strictEqual(found?.totalAmount, 7500000);
      assert.strictEqual(found?.paidAmount, 0);
    });

    test("2.2 Pembuatan dokumen Invoice TIDAK mengurangi saldo stok fisik", () => {
      const pAfter = repo.getProductById(ownerAlphaContext, "prod-rtr-01");
      assert.strictEqual(
        pAfter?.product.physicalStock,
        initialProdStock,
        "Stok fisik tidak boleh berkurang akibat pembuatan dokumen komersial/invoice"
      );
    });

    test("2.3 Pencatatan pembayaran nyata mencatat histori pembayaran dan mengubah status bertahap", () => {
      // Pembayaran parsial pertama: Rp 3.000.000
      const pay1 = repo.recordDocumentPayment(ownerAlphaContext, {
        documentId: createdInvoiceId,
        amount: 3000000,
        paymentMethod: "TRANSFER",
        referenceNumber: "TRF-BCA-001",
        notes: "Cicilan ke-1",
      });

      assert.strictEqual(pay1.newStatus, "PARTIALLY_PAID");
      assert.strictEqual(pay1.paidAmount, 3000000);

      // Verifikasi di SQLite
      const docStep1 = repo.getCommercialDocuments(ownerAlphaContext).find((d) => d.id === createdInvoiceId);
      assert.strictEqual(docStep1?.status, "PARTIALLY_PAID");
      assert.strictEqual(docStep1?.paidAmount, 3000000);

      // Pembayaran pelunasan sisa: Rp 4.500.000
      const pay2 = repo.recordDocumentPayment(ownerAlphaContext, {
        documentId: createdInvoiceId,
        amount: 4500000,
        paymentMethod: "TRANSFER",
        referenceNumber: "TRF-BCA-002",
        notes: "Pelunasan sisa",
      });

      assert.strictEqual(pay2.newStatus, "PAID");
      assert.strictEqual(pay2.paidAmount, 7500000);

      const docStep2 = repo.getCommercialDocuments(ownerAlphaContext).find((d) => d.id === createdInvoiceId);
      assert.strictEqual(docStep2?.status, "PAID");
      assert.strictEqual(docStep2?.paidAmount, 7500000);

      // Verifikasi tabel document_payments
      const paymentRows = nativeDb
        .prepare(`SELECT * FROM document_payments WHERE document_id = ? ORDER BY created_at ASC`)
        .all(createdInvoiceId) as Array<{ amount: number; payment_method: string }>;
      assert.strictEqual(paymentRows.length, 2, "Harus ada 2 histori pembayaran nyata");
      assert.strictEqual(Number(paymentRows[0].amount), 3000000);
      assert.strictEqual(Number(paymentRows[1].amount), 4500000);
    });

    test("2.4 Menolak pembayaran pada invoice yang sudah lunas (Anti-Double-Payment)", () => {
      assert.throws(
        () => {
          repo.recordDocumentPayment(ownerAlphaContext, {
            documentId: createdInvoiceId,
            amount: 100000,
            paymentMethod: "TUNAI",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.code, "ERR_CONFLICT");
          assert.match(err.message, /sudah lunas/i);
          return true;
        }
      );
    });

    test("2.5 Menolak nominal pembayaran invalid (<= 0)", () => {
      assert.throws(
        () => {
          repo.recordDocumentPayment(ownerAlphaContext, {
            documentId: createdInvoiceId,
            amount: -50000,
            paymentMethod: "TUNAI",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.code, "ERR_VALIDATION");
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 3. INVENTORY RETURNS (RETUR BARANG)
  // =========================================================================
  describe("Modul 3: Retur Barang, Evaluasi Reopen Qty & Mutasi Stok Atomik", () => {
    test("3.1 Alasan SALAH_KIRIM / PEMBATALAN membuka kembali kuota sumber (reopenSourceQty = true)", () => {
      const pBefore = repo.getProductById(ownerAlphaContext, "prod-rtr-01");
      const stockBefore = pBefore?.product.physicalStock ?? 0;

      const ret = repo.createInventoryReturn(ownerAlphaContext, {
        warehouseId: "wh-north",
        customerId: "cust-alpha-01",
        returnNumber: "RET-B2-001",
        returnDate: "2026-10-15",
        reason: "SALAH_KIRIM",
        notes: "Barang salah kirim, fisik baik",
        lines: [
          {
            productId: "prod-rtr-01",
            quantity: 3,
            unit: "pcs",
            condition: "BAIK",
          },
        ],
      });

      assert.strictEqual(ret.reason, "SALAH_KIRIM");
      assert.strictEqual(ret.reopenSourceQty, true, "SALAH_KIRIM wajib reopenSourceQty = true");
      assert.strictEqual(ret.status, "DRAFT", "Pengajuan retur awal wajib berstatus DRAFT");

      // Verifikasi saat DRAFT BELUM ada mutasi ledger
      const ledgerBefore = nativeDb
        .prepare(`
          SELECT * FROM inventory_ledger
          WHERE source_doc_id = ? AND entry_type = 'RETURN_IN_POSTED'
        `)
        .get(ret.id);
      assert.strictEqual(ledgerBefore, undefined, "DRAFT retur TIDAK boleh memutasi ledger sebelum diterima fisik");

      // Setujui dan terima fisik retur (Fase 2)
      const approved = repo.approveAndReceiveInventoryReturn(ownerAlphaContext, ret.id);
      assert.strictEqual(approved.received, true);

      // Verifikasi mutasi ledger fisik atomik RETURN_IN_POSTED setelah penerimaan
      const ledgerEntry = nativeDb
        .prepare(`
          SELECT * FROM inventory_ledger
          WHERE source_doc_id = ? AND entry_type = 'RETURN_IN_POSTED'
        `)
        .get(ret.id) as { quantity_delta_base: number; entry_type: string } | undefined;

      assert.ok(ledgerEntry, "Harus menghasilkan entry ledger RETURN_IN_POSTED setelah disetujui");
      assert.strictEqual(Number(ledgerEntry.quantity_delta_base), 3);

      // Verifikasi stok fisik bertambah
      const pAfter = repo.getProductById(ownerAlphaContext, "prod-rtr-01");
      assert.strictEqual(pAfter?.product.physicalStock, stockBefore + 3, "Stok fisik harus bertambah 3 unit");
    });

    test("3.2 Alasan CACAT / LAINNYA TIDAK membuka kembali kuota sumber (reopenSourceQty = false)", () => {
      const ret = repo.createInventoryReturn(ownerAlphaContext, {
        warehouseId: "wh-north",
        customerId: "cust-alpha-01",
        returnNumber: "RET-B2-002",
        returnDate: "2026-10-15",
        reason: "CACAT",
        notes: "Barang retak dari pelanggan",
        lines: [
          {
            productId: "prod-rtr-01",
            quantity: 1,
            unit: "pcs",
            condition: "RUSAK",
          },
        ],
      });

      assert.strictEqual(ret.reason, "CACAT");
      assert.strictEqual(ret.reopenSourceQty, false, "CACAT wajib reopenSourceQty = false");
    });

    test("3.3 Validasi Serial Number Retur: BAIK -> AVAILABLE, RUSAK -> QUARANTINE", () => {
      // Siapkan 2 SN uji untuk owner-alpha di wh-north
      const snGood = "SN-TEST-B2-GOOD";
      const snBad = "SN-TEST-B2-BAD";
      const now = new Date().toISOString();

      nativeDb.prepare(`
        INSERT INTO product_serials (
          id, owner_id, warehouse_id, product_id, serial_number, normalized_serial_number, status, created_at, updated_at
        ) VALUES
          (?, 'owner-alpha', 'wh-north', 'prod-rtr-01', ?, ?, 'CONSUMED_OUT', ?, ?),
          (?, 'owner-alpha', 'wh-north', 'prod-rtr-01', ?, ?, 'CONSUMED_OUT', ?, ?)
      `).run(
        crypto.randomUUID(), snGood, snGood.toUpperCase(), now, now,
        crypto.randomUUID(), snBad, snBad.toUpperCase(), now, now
      );

      // Lakukan retur dengan SN (Status awal DRAFT)
      const retWithSn = repo.createInventoryReturn(ownerAlphaContext, {
        warehouseId: "wh-north",
        customerId: "cust-alpha-01",
        returnNumber: "RET-B2-SN-001",
        returnDate: "2026-10-15",
        reason: "SALAH_KIRIM",
        lines: [
          {
            productId: "prod-rtr-01",
            quantity: 1,
            unit: "unit",
            condition: "BAIK",
            returnedSerials: [snGood],
          },
          {
            productId: "prod-rtr-01",
            quantity: 1,
            unit: "unit",
            condition: "RUSAK",
            returnedSerials: [snBad],
          },
        ],
      });

      // Saat DRAFT, serial belum diubah statusnya
      const rowGoodDraft = nativeDb
        .prepare(`SELECT status FROM product_serials WHERE serial_number = ?`)
        .get(snGood) as { status: string };
      assert.strictEqual(rowGoodDraft.status, "CONSUMED_OUT", "Saat DRAFT serial tetap CONSUMED_OUT");

      // Setujui dan terima fisik retur SN
      repo.approveAndReceiveInventoryReturn(ownerAlphaContext, retWithSn.id);

      // Verifikasi status serial number di database setelah penerimaan fisik
      const rowGood = nativeDb
        .prepare(`SELECT status FROM product_serials WHERE serial_number = ?`)
        .get(snGood) as { status: string };
      const rowBad = nativeDb
        .prepare(`SELECT status FROM product_serials WHERE serial_number = ?`)
        .get(snBad) as { status: string };

      assert.strictEqual(rowGood.status, "AVAILABLE", "SN kondisi BAIK harus kembali AVAILABLE");
      assert.strictEqual(rowBad.status, "QUARANTINE", "SN kondisi RUSAK harus di-karantina (QUARANTINE)");
    });
  });

  // =========================================================================
  // 4. OTORISASI & AUDIT TRAIL
  // =========================================================================
  describe("Modul 4: Pemeriksaan Keamanan, Otorisasi, dan Integritas Transaksi", () => {
    test("4.1 Staff dibatasi pada gudang penugasannya (Warehouse Boundary Guard)", () => {
      // Staff Alpha ditugaskan di 'wh-north'. Jika mencoba membuat retur di 'wh-south', wajib ditolak
      assert.throws(
        () => {
          repo.createInventoryReturn(staffAlphaContext, {
            warehouseId: "wh-south",
            customerId: "cust-alpha-01",
            returnNumber: "RET-STAFF-ILLEGAL",
            returnDate: "2026-10-15",
            reason: "SALAH_KIRIM",
            lines: [{ productId: "prod-rtr-01", quantity: 1, condition: "BAIK" }],
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.code, "ERR_FORBIDDEN_WAREHOUSE");
          return true;
        }
      );
    });

    test("4.2 Atomic Rollback: Kesalahan di tengah transaksi membatalkan seluruh perubahan", () => {
      const pBefore = repo.getProductById(ownerAlphaContext, "prod-rtr-01");
      const stockBefore = pBefore?.product.physicalStock ?? 0;

      // Jalankan transaksi manual yang melempar error setelah insert parsial
      assert.throws(() => {
        client.transaction(() => {
          nativeDb.prepare(`
            INSERT INTO inventory_returns (
              id, owner_id, warehouse_id, customer_id, return_number, return_date,
              reason, status, reopen_source_qty, created_by_user_id, created_at, updated_at
            ) VALUES ('temp-ret-fail', 'owner-alpha', 'wh-north', 'cust-alpha-01', 'RET-FAIL', '2026-10-15',
                      'SALAH_KIRIM', 'RECEIVED', 1, 'usr-test', datetime('now'), datetime('now'))
          `).run();

          // Sengaja throw exception simulasi kegagalan
          throw new Error("Simulasi kegagalan atomik di tengah transaksi");
        });
      });

      // Pastikan record dibatalkan (rollback)
      const phantom = nativeDb
        .prepare(`SELECT id FROM inventory_returns WHERE id = 'temp-ret-fail'`)
        .get();
      assert.strictEqual(phantom, undefined, "Record yang gagal harus ter-rollback sepenuhnya");

      const pAfter = repo.getProductById(ownerAlphaContext, "prod-rtr-01");
      assert.strictEqual(pAfter?.product.physicalStock, stockBefore, "Saldo stok tidak boleh berubah jika rollback");
    });
  });
});
