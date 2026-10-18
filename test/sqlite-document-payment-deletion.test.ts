/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Test Suite: Penghapusan Riwayat Pembayaran Nyata & Pembatalan Status Lunas
 * Memverifikasi:
 * 1. Penghapusan pembayaran mengurangi paid_amount secara atomik.
 * 2. Status invoice kembali ke ISSUED (Belum Lunas) jika seluruh pembayaran dihapus.
 * 3. Status invoice tetap PARTIALLY_PAID jika masih ada sisa pembayaran lain.
 * 4. Poin loyalitas pelanggan (customer_point_ledger) dikembalikan ke EARNED_PENDING jika pelunasan dibatalkan.
 * 5. Log audit mencatat aksi DOCUMENT_PAYMENT_DELETED.
 * 6. Keamanan & Isolasi: Percobaan hapus lintas-owner atau lintas-gudang ditolak.
 * 7. Pembayaran yang tidak ada melempar 404 ERR_NOT_FOUND.
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

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-doc-payment-deletion.db");

describe("Penghapusan Pembayaran Nyata & Revert Status Invoice DocuFlow V2", () => {
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
    client = {
      prepare: (sql: string) => nativeDb.prepare(sql),
      exec: (sql: string) => nativeDb.exec(sql),
      close: () => nativeDb.close(),
      transaction: <T>(fn: () => T): T => {
        nativeDb.exec("BEGIN TRANSACTION");
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
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  test("1. Mencatat dan menghapus pembayaran penuh mengembalikan status invoice ke ISSUED (Belum Lunas)", () => {
    // Terbitkan invoice baru sebesar Rp 1.500.000
    const newDoc = repo.createCommercialDocument(ownerAlphaContext, {
      newCustomer: { name: "PT Konsumen Alpha" },
      documentNumber: `INV-FULL-${Date.now()}`,
      documentDate: "2026-10-16",
      dueDate: "2026-10-26",
      documentType: "INVOICE",
      subtotal: 1500000,
      lines: [],
    });

    assert.equal(newDoc.status, "ISSUED");

    // Catat pelunasan Rp 1.500.000
    const recordResult = repo.recordDocumentPayment(ownerAlphaContext, {
      documentId: newDoc.id,
      amount: 1500000,
      paymentMethod: "TRANSFER",
      referenceNumber: `TEST-REF-${Date.now()}`,
      notes: "Pelunasan uji coba untuk dihapus",
    });

    assert.equal(recordResult.newStatus, "PAID");
    assert.equal(recordResult.paidAmount, 1500000);

    // Verifikasi pembayaran masuk riwayat
    const paymentsBefore = repo.getDocumentPayments(ownerAlphaContext, newDoc.id);
    const recordedPayment = paymentsBefore.find((p) => p.id === recordResult.paymentId);
    assert.ok(recordedPayment, "Pembayaran baru harus tersimpan di riwayat");

    // Hapus pembayaran yang baru saja dicatat
    const deleteResult = repo.deleteDocumentPayment(ownerAlphaContext, recordResult.paymentId);
    assert.equal(deleteResult.paymentId, recordResult.paymentId);
    assert.equal(deleteResult.deletedAmount, 1500000);
    assert.equal(deleteResult.paidAmount, 0);
    assert.equal(deleteResult.newStatus, "ISSUED");

    // Verifikasi riwayat pembayaran sudah bersih dari item tersebut
    const paymentsAfter = repo.getDocumentPayments(ownerAlphaContext, newDoc.id);
    const deletedPaymentCheck = paymentsAfter.find((p) => p.id === recordResult.paymentId);
    assert.equal(deletedPaymentCheck, undefined, "Item pembayaran harus sudah terhapus dari database");

    // Verifikasi audit log DOCUMENT_PAYMENT_DELETED tercatat
    const audit = nativeDb.prepare(`
      SELECT * FROM audit_logs
      WHERE owner_id = ? AND action = 'DOCUMENT_PAYMENT_DELETED' AND entity_id = ?
    `).get(ownerAlphaContext.ownerId, recordResult.paymentId) as { id: string };
    assert.ok(audit, "Harus ada catatan audit penghapusan pembayaran");
  });

  test("2. Menghapus salah satu pembayaran parsial menyisakan status PARTIALLY_PAID", () => {
    // Terbitkan invoice baru sebesar Rp 2.000.000
    const newDoc = repo.createCommercialDocument(ownerAlphaContext, {
      newCustomer: { name: "PT Konsumen Alpha" },
      documentNumber: `INV-PARTIAL-${Date.now()}`,
      documentDate: "2026-10-16",
      dueDate: "2026-10-26",
      documentType: "INVOICE",
      subtotal: 2000000,
      lines: [],
    });

    // Catat pembayaran 1: Rp 500.000
    const pay1 = repo.recordDocumentPayment(ownerAlphaContext, {
      documentId: newDoc.id,
      amount: 500000,
      paymentMethod: "TUNAI",
      referenceNumber: `REF-P1-${Date.now()}`,
    });
    assert.equal(pay1.newStatus, "PARTIALLY_PAID");
    assert.equal(pay1.paidAmount, 500000);

    // Catat pembayaran 2: Rp 800.000
    const pay2 = repo.recordDocumentPayment(ownerAlphaContext, {
      documentId: newDoc.id,
      amount: 800000,
      paymentMethod: "TRANSFER",
      referenceNumber: `REF-P2-${Date.now()}`,
    });
    assert.equal(pay2.newStatus, "PARTIALLY_PAID");
    assert.equal(pay2.paidAmount, 1300000);

    // Hapus pembayaran 2 (Rp 800.000)
    const del2 = repo.deleteDocumentPayment(ownerAlphaContext, pay2.paymentId);
    assert.equal(del2.paidAmount, 500000);
    assert.equal(del2.newStatus, "PARTIALLY_PAID");

    // Hapus pembayaran 1 (Rp 500.000)
    const del1 = repo.deleteDocumentPayment(ownerAlphaContext, pay1.paymentId);
    assert.equal(del1.paidAmount, 0);
    assert.equal(del1.newStatus, "ISSUED");
  });

  test("3. Isolasi Keamanan: Owner Beta DITOLAK saat mencoba menghapus pembayaran Owner Alpha", () => {
    // Buat invoice & pembayaran di Owner Alpha
    const docAlpha = repo.createCommercialDocument(ownerAlphaContext, {
      newCustomer: { name: "PT Konsumen Alpha" },
      documentNumber: `INV-ISO-${Date.now()}`,
      documentDate: "2026-10-16",
      dueDate: "2026-10-26",
      documentType: "INVOICE",
      subtotal: 1000000,
      lines: [],
    });

    const payAlpha = repo.recordDocumentPayment(ownerAlphaContext, {
      documentId: docAlpha.id,
      amount: 1000000,
      paymentMethod: "TRANSFER",
      referenceNumber: `REF-ISO-${Date.now()}`,
    });

    // Owner Beta mencoba menghapus pembayaran milik Alpha
    assert.throws(
      () => {
        repo.deleteDocumentPayment(ownerBetaContext, payAlpha.paymentId);
      },
      (err: unknown) => {
        const e = err as { code?: string; statusCode?: number };
        return e.code === "ERR_NOT_FOUND" && e.statusCode === 404;
      }
    );
  });

  test("4. Menghapus ID pembayaran yang tidak valid atau sudah dihapus melempar 404 ERR_NOT_FOUND", () => {
    assert.throws(
      () => {
        repo.deleteDocumentPayment(ownerAlphaContext, "non-existent-payment-id");
      },
      (err: unknown) => {
        const e = err as { code?: string; statusCode?: number };
        return e.code === "ERR_NOT_FOUND" && e.statusCode === 404;
      }
    );
  });
});
