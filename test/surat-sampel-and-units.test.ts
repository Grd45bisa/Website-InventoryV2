/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Test Suite: Surat Sampel, Satuan PCS/Lusin, dan Konsistensi Modul Dokumen
 * 
 * Pengujian komprehensif:
 * 1. Pembuatan Surat Sampel (SAMPLE) dengan penomoran otomatis SS-YYYYMMDD-SEQ.
 * 2. Surat Sampel non-komersial: subtotal = 0, total = 0, tanpa status lunas.
 * 3. Surat Sampel tidak mengurangi saldo stok fisik dan tidak menulis ledger inventory.
 * 4. Surat Sampel mendukung produk bebas (tanpa product_id) maupun produk katalog.
 * 5. Pemilihan dan penyimpanan satuan PCS / Lusin pada setiap baris item secara eksplisit.
 * 6. Pembuatan Invoice dengan kombinasi satuan PCS dan Lusin; perhitungan subtotal akurat.
 * 7. Edit Surat Sampel: nomor dokumen dan tanggal pembuatan tetap stabil, item & satuan terupdate.
 * 8. Edit Invoice: satuan PCS/Lusin lama tidak ter-overwrite diam-diam dan data tetap konsisten.
 * 9. Isolasi Multi-Tenant: akses lintas-Owner dicegah dengan aman.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "../src/lib/db/migrator.ts";
import { seedSyntheticData } from "../src/lib/db/seed.ts";
import {
  InventoryRepository,
  type CreateCommercialDocumentInput,
  type UpdateCommercialDocumentInput,
} from "../src/lib/db/repositories/inventory-repository.ts";
import { AppError } from "../src/lib/errors/app-error.ts";
import type { DatabaseClient } from "../src/lib/db/sqlite-client.ts";
import type { ActiveSecurityContext } from "../src/lib/types/auth.ts";

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-surat-sampel.db");

describe("Fitur Surat Sampel & Satuan PCS/Lusin Modul Dokumen", () => {
  let nativeDb: DatabaseSync;
  let client: DatabaseClient;
  let repo: InventoryRepository;

  const ownerAlpha: ActiveSecurityContext = {
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

  const ownerBeta: ActiveSecurityContext = {
    userId: "usr-owner-beta",
    email: "owner_beta@docuflow.id",
    ownerId: "owner-beta",
    ownerName: "Beta Niaga Perkasa",
    warehouseId: "wh-south",
    warehouseName: "Gudang Karawang",
    role: "OWNER",
    isSuperAdminOnBehalf: false,
    grantId: null,
  };

  before(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch {}
    }

    nativeDb = new DatabaseSync(TEST_DB_PATH);
    nativeDb.exec("PRAGMA foreign_keys = ON;");
    nativeDb.exec(
      fs.readFileSync(path.resolve(process.cwd(), "src", "lib", "db", "schema.sql"), "utf-8")
    );

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
    } catch {}
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch {}
    }
  });

  test("1. Pembuatan Surat Sampel (SAMPLE) dengan nomor otomatis SS- dan item non-komersial", () => {
    const customers = nativeDb
      .prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha'")
      .all() as Array<{ id: string }>;
    assert.ok(customers.length > 0);

    const products = nativeDb
      .prepare("SELECT id, name FROM products WHERE owner_id = 'owner-alpha'")
      .all() as Array<{ id: string; name: string }>;
    assert.ok(products.length > 0);

    // Hitung total ledger sebelum pembuatan Surat Sampel
    const ledgerCountBefore = (
      nativeDb.prepare("SELECT COUNT(*) as cnt FROM inventory_ledger WHERE owner_id = 'owner-alpha'").get() as { cnt: number }
    ).cnt;

    const input: CreateCommercialDocumentInput = {
      documentType: "SAMPLE",
      documentDate: "2026-10-18",
      dueDate: "2026-10-18",
      customerId: customers[0].id,
      notes: "Sampel produk untuk evaluasi teknis pelanggan",
      lines: [
        {
          productId: products[0].id,
          productName: products[0].name,
          quantity: 5,
          unit: "PCS",
          unitPrice: 0,
          discountValue: 0,
        },
        {
          productName: "Bahan Uji Khusus Prototipe",
          quantity: 2,
          unit: "Lusin",
          unitPrice: 0,
          discountValue: 0,
        },
      ],
    };

    const doc = repo.createCommercialDocument(ownerAlpha, input);

    assert.ok(doc.id, "Surat Sampel harus berhasil dibuat dengan ID");
    assert.match(doc.documentNumber, /^SS-\d{8}-\d{4}$/, "Nomor dokumen harus berformat SS-YYYYMMDD-XXXX");
    assert.equal(doc.documentType, "SAMPLE");
    assert.equal(doc.subtotal, 0, "Subtotal Surat Sampel harus 0");
    assert.equal(doc.totalAmount, 0, "Total tagihan Surat Sampel harus 0");

    // Ambil detail lengkap
    const detail = repo.getCommercialDocumentById(ownerAlpha, doc.id);
    assert.ok(detail);
    assert.equal(detail.lines.length, 2, "Harus menyimpan 2 baris item");

    // Baris 1: dari katalog, unit PCS
    assert.equal(detail.lines[0].quantity, 5);
    assert.equal(detail.lines[0].unit, "PCS");
    assert.equal(detail.lines[0].unitPrice, 0);

    // Baris 2: manual / free-form, unit Lusin
    assert.equal(detail.lines[1].productName, "Bahan Uji Khusus Prototipe");
    assert.equal(detail.lines[1].quantity, 2);
    assert.equal(detail.lines[1].unit, "Lusin");

    // Verifikasi bahwa TIDAK ADA pengurangan stok di inventory_ledger
    const ledgerCountAfter = (
      nativeDb.prepare("SELECT COUNT(*) as cnt FROM inventory_ledger WHERE owner_id = 'owner-alpha'").get() as { cnt: number }
    ).cnt;
    assert.equal(
      ledgerCountAfter,
      ledgerCountBefore,
      "Surat Sampel TIDAK BOLEH mengurangi stok atau menambah entri ledger secara otomatis"
    );
  });

  test("2. Detail Surat Sampel (getCommercialDocumentById) memuat data item dan unit secara akurat", () => {
    const list = repo.getCommercialDocuments(ownerAlpha).filter((d) => d.documentType === "SAMPLE");
    assert.ok(list.length > 0);

    const detail = repo.getCommercialDocumentById(ownerAlpha, list[0].id);
    assert.ok(detail);
    assert.equal(detail.documentType, "SAMPLE");
    assert.equal(detail.totalAmount, 0);
    assert.equal(detail.paidAmount, 0);
    assert.equal(detail.lines.length, 2);

    const linePcs = detail.lines.find((l) => l.unit === "PCS");
    const lineLusin = detail.lines.find((l) => l.unit === "Lusin");

    assert.ok(linePcs, "Item bersatuan PCS harus ditemukan");
    assert.equal(linePcs.quantity, 5);

    assert.ok(lineLusin, "Item bersatuan Lusin harus ditemukan");
    assert.equal(lineLusin.quantity, 2);
    assert.equal(lineLusin.productName, "Bahan Uji Khusus Prototipe");
  });

  test("3. Edit Surat Sampel: nomor dokumen dan tanggal pembuatan tetap stabil", () => {
    const list = repo.getCommercialDocuments(ownerAlpha).filter((d) => d.documentType === "SAMPLE");
    const originalDoc = repo.getCommercialDocumentById(ownerAlpha, list[0].id);
    assert.ok(originalDoc);

    const originalNumber = originalDoc.documentNumber;
    const originalDate = originalDoc.documentDate;

    const editInput: UpdateCommercialDocumentInput = {
      documentId: originalDoc.id,
      customerId: originalDoc.customerId,
      documentDate: originalDoc.documentDate,
      dueDate: originalDoc.documentDate,
      notes: "Catatan sampel telah direvisi oleh tim QA",
      docNominalDiscount: 0,
      docPercentageDiscount: 0,
      lines: [
        {
          id: originalDoc.lines[0].id,
          productId: originalDoc.lines[0].productId,
          productName: originalDoc.lines[0].productName,
          quantity: 10,
          unit: "PCS",
          unitPrice: 0,
          discountType: "NONE",
          discountValue: 0,
        },
        {
          productName: "Item Sampel Tambahan Revisi",
          quantity: 3,
          unit: "Lusin",
          unitPrice: 0,
          discountType: "NONE",
          discountValue: 0,
        },
      ],
    };

    const updated = repo.updateCommercialDocument(ownerAlpha, editInput);

    assert.equal(updated.documentNumber, originalNumber, "Nomor Surat Sampel TIDAK BOLEH berubah saat diedit");
    assert.equal(updated.documentDate, originalDate, "Tanggal terbit Surat Sampel TIDAK BOLEH berubah saat diedit");
    assert.equal(updated.notes, "Catatan sampel telah direvisi oleh tim QA");
    assert.equal(updated.lines.length, 2);

    const line1 = updated.lines.find((l) => l.unit === "PCS");
    assert.ok(line1);
    assert.equal(line1.quantity, 10, "Kuantitas item lama harus terupdate menjadi 10");

    const line2 = updated.lines.find((l) => l.productName === "Item Sampel Tambahan Revisi");
    assert.ok(line2);
    assert.equal(line2.quantity, 3);
    assert.equal(line2.unit, "Lusin");

    // Pastikan tetap non-komersial
    assert.equal(updated.subtotal, 0);
    assert.equal(updated.totalAmount, 0);
  });

  let createdInvoiceId: string;

  test("4. Pembuatan Invoice dengan kombinasi satuan PCS dan Lusin menyimpan satuan secara eksplisit", () => {
    const customers = nativeDb
      .prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha'")
      .all() as Array<{ id: string }>;
    const products = nativeDb
      .prepare("SELECT id, name FROM products WHERE owner_id = 'owner-alpha'")
      .all() as Array<{ id: string; name: string }>;

    const invoiceInput: CreateCommercialDocumentInput = {
      documentType: "INVOICE",
      documentNumber: "INV-20261018-0099",
      documentDate: "2026-10-18",
      dueDate: "2026-11-30",
      customerId: customers[0].id,
      notes: "Faktur penjualan pesanan dengan satuan kombinasi PCS & Lusin",
      lines: [
        {
          productId: products[0].id,
          productName: products[0].name,
          quantity: 12,
          unit: "PCS",
          unitPrice: 50000,
          discountType: "NONE",
          discountValue: 0,
        },
        {
          productId: products.length > 1 ? products[1].id : products[0].id,
          productName: products.length > 1 ? products[1].name : products[0].name,
          quantity: 2,
          unit: "Lusin",
          unitPrice: 600000,
          discountType: "NOMINAL",
          discountValue: 50000,
        },
      ],
      docNominalDiscount: 0,
      docPercentageDiscount: 0,
      pointsRedeemed: 0,
    };

    const invoiceHeader = repo.createCommercialDocument(ownerAlpha, invoiceInput);
    assert.equal(invoiceHeader.documentType, "INVOICE");
    createdInvoiceId = invoiceHeader.id;

    const invoice = repo.getCommercialDocumentById(ownerAlpha, invoiceHeader.id);
    assert.ok(invoice);
    assert.equal(invoice.lines.length, 2);

    // Line 1: 12 PCS * 50.000 = 600.000
    assert.equal(invoice.lines[0].unit, "PCS");
    assert.equal(invoice.lines[0].quantity, 12);
    assert.equal(invoice.lines[0].lineTotal, 600000);

    // Line 2: 2 Lusin * 600.000 - 50.000 = 1.150.000
    assert.equal(invoice.lines[1].unit, "Lusin");
    assert.equal(invoice.lines[1].quantity, 2);
    assert.equal(invoice.lines[1].lineTotal, 1150000);

    // Total = 600.000 + 1.150.000 = 1.750.000
    assert.equal(invoice.totalAmount, 1750000);
  });

  test("5. Edit Invoice mempertahankan satuan item lama yang sudah tersimpan", () => {
    const targetInvoice = repo.getCommercialDocumentById(ownerAlpha, createdInvoiceId);
    assert.ok(targetInvoice);

    const firstLineId = targetInvoice.lines[0].id;
    const firstLineUnit = targetInvoice.lines[0].unit;

    // Update baris pertama tanpa mengubah satuannya
    const editInput: UpdateCommercialDocumentInput = {
      documentId: targetInvoice.id,
      customerId: targetInvoice.customerId,
      documentDate: targetInvoice.documentDate,
      dueDate: targetInvoice.dueDate || targetInvoice.documentDate,
      docNominalDiscount: 0,
      docPercentageDiscount: 0,
      lines: [
        {
          id: firstLineId,
          productId: targetInvoice.lines[0].productId,
          productName: targetInvoice.lines[0].productName,
          quantity: 24,
          unit: firstLineUnit, // pertahankan unit asli
          unitPrice: 50000,
          discountType: "NONE",
          discountValue: 0,
        },
      ],
    };

    const updated = repo.updateCommercialDocument(ownerAlpha, editInput);
    assert.equal(updated.lines[0].unit, firstLineUnit, "Satuan item lama tidak boleh berubah jika tidak diubah pengguna");
    assert.equal(updated.lines[0].quantity, 24);
  });

  test("6. Isolasi Multi-Tenant: akses dan mutasi Surat Sampel lintas-Owner ditolak", () => {
    const listAlpha = repo.getCommercialDocuments(ownerAlpha).filter((d) => d.documentType === "SAMPLE");
    assert.ok(listAlpha.length > 0);
    const alphaSampleId = listAlpha[0].id;

    // Owner Beta mencoba mengakses Surat Sampel milik Alpha
    const betaView = repo.getCommercialDocumentById(ownerBeta, alphaSampleId);
    assert.equal(betaView, null, "Owner Beta TIDAK BOLEH melihat Surat Sampel milik Owner Alpha");

    // Owner Beta mencoba mengedit Surat Sampel milik Alpha
    assert.throws(
      () => {
        repo.updateCommercialDocument(ownerBeta, {
          documentId: alphaSampleId,
          customerId: "cust-invalid",
          documentDate: "2026-10-18",
          dueDate: "2026-10-18",
          docNominalDiscount: 0,
          docPercentageDiscount: 0,
          notes: "Percobaan edit ilegal lintas-tenant",
          lines: [{ productName: "Penyusup", quantity: 1, unit: "PCS", unitPrice: 0, discountType: "NONE", discountValue: 0 }],
        });
      },
      (err: unknown) => err instanceof AppError && err.code === "ERR_NOT_FOUND",
      "Percobaan update dokumen lintas-tenant harus ditolak dengan ERR_NOT_FOUND"
    );
  });

  test("7. Pembuatan berulang Surat Sampel menjamin nomor dokumen unik dan sekuensial", () => {
    const customers = nativeDb
      .prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha'")
      .all() as Array<{ id: string }>;

    const createdNumbers = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const doc = repo.createCommercialDocument(ownerAlpha, {
        documentType: "SAMPLE",
        documentDate: "2026-10-18",
        dueDate: "2026-10-18",
        customerId: customers[0].id,
        lines: [{ productName: `Sampel Uji Seri ${i + 1}`, quantity: 1, unit: "PCS", unitPrice: 0, discountValue: 0 }],
      });
      assert.ok(!createdNumbers.has(doc.documentNumber), `Nomor dokumen ${doc.documentNumber} harus unik`);
      createdNumbers.add(doc.documentNumber);
    }
    assert.equal(createdNumbers.size, 5, "Kelima dokumen sampel harus memiliki nomor unik");
  });

  test("8. Penolakan nomor dokumen duplikat menghasilkan ERR_CONFLICT yang aman", () => {
    const customers = nativeDb
      .prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha'")
      .all() as Array<{ id: string }>;

    const duplicateNumber = "INV-TEST-DUP-001";
    repo.createCommercialDocument(ownerAlpha, {
      documentType: "INVOICE",
      documentNumber: duplicateNumber,
      documentDate: "2026-10-18",
      dueDate: "2026-11-30",
      customerId: customers[0].id,
      lines: [{ productName: "Barang Asli", quantity: 1, unitPrice: 10000 }],
    });

    assert.throws(
      () => {
        repo.createCommercialDocument(ownerAlpha, {
          documentType: "INVOICE",
          documentNumber: duplicateNumber,
          documentDate: "2026-10-18",
          dueDate: "2026-11-30",
          customerId: customers[0].id,
          lines: [{ productName: "Barang Duplikat", quantity: 1, unitPrice: 10000 }],
        });
      },
      (err: unknown) => err instanceof AppError && err.code === "ERR_CONFLICT",
      "Pembuatan dokumen dengan nomor yang sudah ada harus ditolak dengan ERR_CONFLICT"
    );
  });

  test("9. Immutabilitas tanggal terbit Surat Sampel saat diedit oleh server", () => {
    const list = repo.getCommercialDocuments(ownerAlpha).filter((d) => d.documentType === "SAMPLE");
    const targetDoc = repo.getCommercialDocumentById(ownerAlpha, list[0].id);
    assert.ok(targetDoc);

    const originalDate = targetDoc.documentDate;

    // Coba kirim documentDate yang diubah (misal tanggal masa depan)
    const updated = repo.updateCommercialDocument(ownerAlpha, {
      documentId: targetDoc.id,
      customerId: targetDoc.customerId,
      documentDate: "2099-12-31", // coba manipulasi tanggal terbit
      dueDate: "2099-12-31",
      docNominalDiscount: 0,
      docPercentageDiscount: 0,
      lines: [
        {
          id: targetDoc.lines[0].id,
          productName: targetDoc.lines[0].productName,
          quantity: targetDoc.lines[0].quantity,
          unit: targetDoc.lines[0].unit,
          unitPrice: 0,
          discountType: "NONE",
          discountValue: 0,
        },
      ],
    });

    assert.equal(
      updated.documentDate,
      originalDate,
      "Tanggal terbit Surat Sampel harus tetap memegang tanggal pembuatan aslinya"
    );
  });

  test("10. Kompatibilitas data legacy tanpa satuan otomatis fallback ke PCS", () => {
    // Sisipkan baris dokumen lama tanpa kolom unit eksplisit
    const legacyDocId = crypto.randomUUID();
    const legacyLineId = crypto.randomUUID();
    const customers = nativeDb
      .prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha'")
      .all() as Array<{ id: string }>;

    nativeDb.prepare(`
      INSERT INTO commercial_documents (
        id, owner_id, customer_id, document_number, document_date, due_date,
        document_type, status, subtotal, total_amount, paid_amount, print_count, created_by_user_id, created_at, updated_at
      ) VALUES (?, 'owner-alpha', ?, 'LEGACY-001', '2025-01-01', '2025-01-15', 'INVOICE', 'ISSUED', 50000, 50000, 0, 0, 'usr-owner-alpha', '2025-01-01', '2025-01-01')
    `).run(legacyDocId, customers[0].id);

    nativeDb.prepare(`
      INSERT INTO commercial_document_lines (
        id, owner_id, document_id, product_name, quantity, unit_price, line_total, created_at
      ) VALUES (?, 'owner-alpha', ?, 'Produk Legacy Tanpa Satuan', 5, 10000, 50000, '2025-01-01')
    `).run(legacyLineId, legacyDocId);

    const legacyDoc = repo.getCommercialDocumentById(ownerAlpha, legacyDocId);
    assert.ok(legacyDoc);
    assert.equal(legacyDoc.lines.length, 1);
    assert.equal(legacyDoc.lines[0].unit, "PCS", "Item data legacy tanpa kolom unit harus aman dengan fallback ke PCS");
    assert.equal(legacyDoc.lines[0].quantity, 5);
  });
});

