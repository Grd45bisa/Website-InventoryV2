/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Test Suite: Detail Dokumen & Halaman Dokumen Lengkap (SQLite)
 * Memverifikasi:
 * 1. getCommercialDocumentById mengembalikan dokumen utuh (header, lines, payments, customer).
 * 2. Isolasi data antar-Owner (IDOR Guard): Owner Beta ditolak saat mengakses dokumen Owner Alpha.
 * 3. Pencatatan pencetakan atomik (recordDocumentPrint) menambah print_count dan jejak audit.
 * 4. Pembayaran nyata terintegrasi dengan validasi saldo, anti-overpayment, dan idempotensi.
 * 5. Dokumen tidak ditemukan atau ID invalid mengembalikan null.
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

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-doc-detail.db");

describe("Detail Dokumen & Halaman Dokumen Lengkap DocuFlow V2", () => {
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

  const ownerBetaContext: ActiveSecurityContext = {
    userId: "usr-owner-beta",
    email: "owner_beta@docuflow.id",
    ownerId: "owner-beta",
    ownerName: "Beta Retail Nusantara",
    warehouseId: "wh-beta-01",
    warehouseName: "Gudang Barat Surabaya",
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

    const schemaPath = path.resolve(process.cwd(), "src", "lib", "db", "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf-8");
    nativeDb.exec(schemaSql);

    client = {
      prepare: (sql: string) => nativeDb.prepare(sql),
      exec: (sql: string) => nativeDb.exec(sql),
      close: () => nativeDb.close(),
      transaction: <T>(fn: () => T): T => {
        nativeDb.exec("BEGIN IMMEDIATE;");
        try {
          const res = fn();
          nativeDb.exec("COMMIT;");
          return res;
        } catch (e) {
          nativeDb.exec("ROLLBACK;");
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
      nativeDb.close();
    } catch {
      // Abaikan
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch {
        // Abaikan
      }
    }
  });

  test("1.1 Mengambil dokumen lengkap berdasarkan ID (getCommercialDocumentById)", () => {
    const doc = repo.getCommercialDocumentById(ownerAlphaContext, "inv-alpha-001");
    assert.ok(doc, "Dokumen inv-alpha-001 harus ditemukan.");
    assert.equal(doc.id, "inv-alpha-001");
    assert.equal(doc.documentNumber, "INV-202610-001");
    assert.equal(doc.documentType, "INVOICE");
    assert.equal(doc.customerName, "PT Megah Perkasa Engineering");
    assert.equal(doc.poNumber, "PO-202610-001");
    assert.equal(doc.subtotal, 10000000);
    assert.equal(doc.totalAmount, 9250000);
    assert.equal(doc.paidAmount, 5000000);

    // Memastikan daftar item lines terambil
    assert.ok(Array.isArray(doc.lines), "doc.lines harus berupa array.");
    assert.ok(doc.lines.length > 0, "doc.lines harus memiliki setidaknya 1 baris item.");
    const firstLine = doc.lines[0];
    assert.equal(firstLine.productId, "prod-rtr-01");
    assert.equal(firstLine.sku, "RTR-AC1200");
    assert.ok(firstLine.quantity > 0, "Kuantitas item harus > 0.");
    assert.ok(firstLine.unitPrice > 0, "Harga satuan item harus > 0.");

    // Memastikan riwayat pembayaran terambil
    assert.ok(Array.isArray(doc.payments), "doc.payments harus berupa array.");
    assert.equal(doc.payments.length, 1, "Harus ada 1 riwayat pembayaran awal.");
    assert.equal(doc.payments[0].amount, 5000000);
    assert.equal(doc.payments[0].paymentMethod, "TRANSFER");
  });

  test("1.2 Isolasi Antar-Owner: Owner Beta ditolak saat mengakses dokumen Owner Alpha", () => {
    const doc = repo.getCommercialDocumentById(ownerBetaContext, "inv-alpha-001");
    assert.equal(doc, null, "Owner Beta tidak boleh dapat membaca dokumen milik Owner Alpha.");
  });

  test("1.3 Dokumen tidak ditemukan atau ID invalid mengembalikan null", () => {
    const doc = repo.getCommercialDocumentById(ownerAlphaContext, "non-existent-id-999");
    assert.equal(doc, null, "ID tidak valid harus mengembalikan null.");
  });

  test("1.4 Pencatatan pencetakan atomik (recordDocumentPrint) menambah print_count", () => {
    const beforeDoc = repo.getCommercialDocumentById(ownerAlphaContext, "inv-alpha-001");
    const initialPrintCount = beforeDoc?.printCount ?? 0;

    const printResult = repo.recordDocumentPrint(ownerAlphaContext, "inv-alpha-001");
    assert.equal(printResult.printCount, initialPrintCount + 1);

    const afterDoc = repo.getCommercialDocumentById(ownerAlphaContext, "inv-alpha-001");
    assert.equal(afterDoc?.printCount, initialPrintCount + 1);

    // Verifikasi audit log tercatat
    const auditRow = nativeDb.prepare(`
      SELECT action, entity_type, entity_id FROM audit_logs
      WHERE entity_id = 'inv-alpha-001' AND action = 'PRINT_COMMERCIAL_DOCUMENT'
    `).get() as { action: string; entity_type: string; entity_id: string } | undefined;

    assert.ok(auditRow, "Audit log untuk PRINT_COMMERCIAL_DOCUMENT harus tercatat.");
  });

  test("1.5 Pencatatan pembayaran nyata: melunasi sisa tagihan dan guard anti-overpayment", () => {
    const doc = repo.getCommercialDocumentById(ownerAlphaContext, "inv-alpha-001");
    assert.ok(doc);
    const sisaTagihan = doc.totalAmount - doc.paidAmount; // 9.250.000 - 5.000.000 = 4.250.000

    // Coba overpayment (lebih besar dari sisa)
    assert.throws(
      () => {
        repo.recordDocumentPayment(ownerAlphaContext, {
          documentId: "inv-alpha-001",
          amount: sisaTagihan + 500000,
          paymentMethod: "TRANSFER",
          referenceNumber: "TRX-OVERPAY-001",
        });
      },
      (err: unknown) => {
        return err instanceof AppError && err.code === "ERR_VALIDATION";
      },
      "Harus menolak nominal pembayaran yang melebihi sisa tagihan."
    );

    // Pembayaran sah melunasi tagihan
    const payResult = repo.recordDocumentPayment(ownerAlphaContext, {
      documentId: "inv-alpha-001",
      amount: sisaTagihan,
      paymentMethod: "TRANSFER",
      referenceNumber: "TRX-LUNAS-001",
      notes: "Pelunasan tagihan termin akhir",
    });

    assert.equal(payResult.newStatus, "PAID");
    assert.equal(payResult.paidAmount, doc.totalAmount);

    // Verifikasi state dokumen terbarui
    const updatedDoc = repo.getCommercialDocumentById(ownerAlphaContext, "inv-alpha-001");
    assert.equal(updatedDoc?.status, "PAID");
    assert.equal(updatedDoc?.paidAmount, doc.totalAmount);
    assert.equal(updatedDoc?.payments.length, 2, "Harus tercatat 2 entri riwayat pembayaran.");

    // Coba bayar lagi setelah lunas (Anti-Double-Payment)
    assert.throws(
      () => {
        repo.recordDocumentPayment(ownerAlphaContext, {
          documentId: "inv-alpha-001",
          amount: 100000,
          paymentMethod: "TUNAI",
          referenceNumber: "TRX-EXTRA-001",
        });
      },
      (err: unknown) => {
        return err instanceof AppError && err.code === "ERR_CONFLICT";
      },
      "Harus menolak pembayaran pada dokumen yang sudah lunas."
    );
  });
});
