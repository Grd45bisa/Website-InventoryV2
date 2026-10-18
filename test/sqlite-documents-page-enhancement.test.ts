import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createDatabaseConnection } from "../src/lib/db/sqlite-client.ts";
import { runMigrations } from "../src/lib/db/migrator.ts";
import { seedSyntheticData } from "../src/lib/db/seed.ts";
import { InventoryRepository } from "../src/lib/db/repositories/inventory-repository.ts";
import type { ActiveSecurityContext } from "../src/lib/types/auth.ts";

describe("Dokumen Page Enhancement & Verification (DocuFlow V2)", () => {
  const testDbPath = path.resolve(process.cwd(), "data", "test-documents-enhancement.db");
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
  if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);

  const db = createDatabaseConnection(testDbPath);
  runMigrations(db);
  seedSyntheticData(db);

  const customerId = "cust-alpha-01";

  const alphaContext: ActiveSecurityContext = {
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

  const betaContext: ActiveSecurityContext = {
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

  const repo = new InventoryRepository(db);

  it("1. Dapat membuat dokumen tipe INVOICE dengan kalkulasi diskon bertingkat LOCKED", () => {
    const inv = repo.createCommercialDocument(alphaContext, {
      customerId,
      documentNumber: "INV-202610-099",
      documentDate: "2026-10-15",
      dueDate: "2026-10-31",
      documentType: "INVOICE",
      subtotal: 10000000,
      itemDiscount: 500000,
      docNominalDiscount: 250000,
      pointsRedeemed: 100000,
      notes: "Invoice penjualan alat jaringan",
    });

    assert.equal(inv.documentType, "INVOICE");
    assert.equal(inv.totalAmount, 9150000);
    assert.equal(inv.paidAmount, 0);
    assert.equal(inv.printCount, 0);
    assert.equal(inv.status, "ISSUED");
  });

  it("2. Dapat membuat dokumen tipe SURAT_JALAN dengan subtotal 0 tanpa error", () => {
    const sj = repo.createCommercialDocument(alphaContext, {
      customerId,
      documentNumber: "SJ-202610-099",
      documentDate: "2026-10-15",
      dueDate: "2026-10-15",
      documentType: "SURAT_JALAN",
      subtotal: 0,
      notes: "Surat jalan pengiriman barang batch 1",
    });

    assert.equal(sj.documentType, "SURAT_JALAN");
    assert.equal(sj.totalAmount, 0);
    assert.equal(sj.paidAmount, 0);
    assert.equal(sj.printCount, 0);
  });

  it("3. Dapat membuat dokumen tipe RECEIPT (Kuitansi) penerimaan", () => {
    const receipt = repo.createCommercialDocument(alphaContext, {
      customerId,
      documentNumber: "KUI-202610-099",
      documentDate: "2026-10-15",
      dueDate: "2026-10-15",
      documentType: "RECEIPT",
      subtotal: 2500000,
      notes: "Kuitansi penerimaan tanda jadi",
    });

    assert.equal(receipt.documentType, "RECEIPT");
    assert.equal(receipt.totalAmount, 2500000);
    assert.equal(receipt.paidAmount, 0);
  });

  it("4. recordDocumentPrint menambah print_count secara atomik dan mencatat audit log", () => {
    const docs = repo.getCommercialDocuments(alphaContext);
    const inv = docs.find((d) => d.documentNumber === "INV-202610-099");
    assert.ok(inv);
    assert.equal(inv.printCount, 0);

    // Cetak pertama
    const print1 = repo.recordDocumentPrint(alphaContext, inv.id);
    assert.equal(print1.printCount, 1);

    // Cetak kedua
    const print2 = repo.recordDocumentPrint(alphaContext, inv.id);
    assert.equal(print2.printCount, 2);

    // Verifikasi di database
    const refreshed = repo.getCommercialDocuments(alphaContext).find((d) => d.id === inv.id);
    assert.equal(refreshed?.printCount, 2);

    // Verifikasi audit log
    const auditLogs = db.prepare(`
      SELECT action, entity_type, entity_id FROM audit_logs
      WHERE action = 'PRINT_COMMERCIAL_DOCUMENT' AND entity_id = ?
    `).all(inv.id);
    assert.equal(auditLogs.length, 2);
  });

  it("5. Pencatatan pembayaran nyata tersimpan di document_payments dan dapat diambil via getDocumentPayments", () => {
    const docs = repo.getCommercialDocuments(alphaContext);
    const inv = docs.find((d) => d.documentNumber === "INV-202610-099");
    assert.ok(inv);

    // Catat pembayaran parsial 5.000.000
    repo.recordDocumentPayment(alphaContext, {
      documentId: inv.id,
      amount: 5000000,
      paymentMethod: "TRANSFER",
      referenceNumber: "TRX-BCA-55112",
      notes: "DP 50% via transfer BCA",
    });

    // Ambil histori pembayaran
    const payments = repo.getDocumentPayments(alphaContext, inv.id);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].amount, 5000000);
    assert.equal(payments[0].paymentMethod, "TRANSFER");
    assert.equal(payments[0].referenceNumber, "TRX-BCA-55112");
    assert.equal(payments[0].receivedByName, "Budi Santoso (Owner Alpha)");

    // Verifikasi status invoice terupdate
    const updated = repo.getCommercialDocuments(alphaContext).find((d) => d.id === inv.id);
    assert.equal(updated?.paidAmount, 5000000);
    assert.equal(updated?.status, "PARTIALLY_PAID");
  });

  it("6. Multi-tenant isolation: Owner Beta tidak dapat mengakses atau mencetak dokumen Owner Alpha", () => {
    const docsAlpha = repo.getCommercialDocuments(alphaContext);
    // Seed has 1 invoice (INV-202610-001) + our 3 created docs = 4 docs
    assert.ok(docsAlpha.length >= 3);

    // Owner Beta tidak melihat dokumen milik Owner Alpha
    const docsBeta = repo.getCommercialDocuments(betaContext);
    const hasAlphaDocInBeta = docsBeta.some((d) => d.documentNumber === "INV-202610-099");
    assert.equal(hasAlphaDocInBeta, false);

    // Owner Beta tidak dapat mencetak dokumen Owner Alpha
    assert.throws(
      () => repo.recordDocumentPrint(betaContext, docsAlpha[0].id),
      (err: unknown) => {
        const anyErr = err as { code?: string; message?: string };
        return anyErr.code === "ERR_NOT_FOUND" || /tidak ditemukan/i.test(anyErr.message || "");
      }
    );

    // Owner Beta tidak dapat melihat riwayat pembayaran dokumen Owner Alpha
    const paymentsBeta = repo.getDocumentPayments(betaContext, docsAlpha[0].id);
    assert.equal(paymentsBeta.length, 0);
  });
});
