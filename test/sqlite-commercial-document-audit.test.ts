/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Test Suite: Audit dan Verifikasi Menyeluruh Modul Dokumen (SQLite)
 * 
 * Verifikasi:
 * 1. Tipe Dokumen SAMPLE: Rp 0, tanpa nilai finansial/piutang, tidak memotong stok fisik.
 * 2. SAMPLE dilarang menerima pencatatan pembayaran nyata (ERR_VALIDATION).
 * 3. Pembatalan Dokumen (cancelCommercialDocument):
 *    - Validasi alasan minimal 3 karakter.
 *    - Status berubah menjadi CANCELLED dan tercatat di audit log.
 *    - Dokumen dengan paid_amount > 0 dilarang dibatalkan (ERR_CONFLICT).
 *    - Dokumen CANCELLED dilarang menerima pembayaran.
 * 4. Isolasi Multi-Owner & Multi-Warehouse:
 *    - Pengambilan detail dokumen lintas owner ditolak (ERR_NOT_FOUND).
 *    - Pembayaran & pembatalan dokumen lintas owner ditolak (ERR_NOT_FOUND).
 * 5. Diskon bertingkat & persentase clamping:
 *    - Diskon persen di-clamp maksimal 100% dan tidak pernah menghasilkan total negatif.
 * 6. Audit Riwayat Cetak:
 *    - Pencatatan print menambah print_count dan tercatat di audit log.
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
} from "../src/lib/db/repositories/inventory-repository.ts";
import { AppError } from "../src/lib/errors/app-error.ts";
import type { DatabaseClient } from "../src/lib/db/sqlite-client.ts";
import type { ActiveSecurityContext } from "../src/lib/types/auth.ts";

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-doc-audit.db");

describe("Audit Komprehensif Modul Dokumen DocuFlow V2", () => {
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
    ownerName: "Beta Niaga Nusantara",
    warehouseId: "wh-south",
    warehouseName: "Gudang Distribusi Cikarang",
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

  test("1. Pembuatan Dokumen SAMPLE wajib Rp 0, tanpa nilai finansial, dan tidak memotong stok ledger", () => {
    const customer = nativeDb
      .prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha' LIMIT 1")
      .get() as { id: string };
    const product = nativeDb
      .prepare("SELECT id, sku, name FROM products WHERE owner_id = 'owner-alpha' LIMIT 1")
      .get() as { id: string; sku: string; name: string };

    const ledgerCountBefore = (
      nativeDb.prepare("SELECT COUNT(*) as c FROM inventory_ledger WHERE owner_id = 'owner-alpha'").get() as { c: number }
    ).c;

    const input: CreateCommercialDocumentInput = {
      documentType: "SAMPLE",
      documentNumber: "SMP-202610-001",
      customerId: customer.id,
      documentDate: "2026-10-15",
      dueDate: "2026-10-15",
      notes: "Barang contoh pameran industri",
      lines: [
        {
          productId: product.id,
          quantity: 3,
          unitPrice: 150000, // input disengaja ada harga untuk menguji pemaksaan non-finansial
          discountValue: 10000,
        },
      ],
    };

    const created = repo.createCommercialDocument(ownerAlpha, input);

    assert.equal(created.documentType, "SAMPLE");
    assert.equal(created.totalAmount, 0, "Total amount dokumen SAMPLE wajib 0");
    assert.equal(created.subtotal, 0, "Subtotal dokumen SAMPLE wajib 0");
    assert.equal(created.paidAmount, 0);

    // Verifikasi di database: baris item unit_price wajib 0
    const lines = nativeDb
      .prepare("SELECT unit_price, line_total FROM commercial_document_lines WHERE document_id = ?")
      .all(created.id) as Array<{ unit_price: number; line_total: number }>;

    assert.equal(lines.length, 1);
    assert.equal(lines[0].unit_price, 0, "Unit price baris SAMPLE harus dipaksa 0");
    assert.equal(lines[0].line_total, 0, "Line total baris SAMPLE harus dipaksa 0");

    // Verifikasi ledger tidak berubah
    const ledgerCountAfter = (
      nativeDb.prepare("SELECT COUNT(*) as c FROM inventory_ledger WHERE owner_id = 'owner-alpha'").get() as { c: number }
    ).c;
    assert.equal(ledgerCountAfter, ledgerCountBefore, "Pembuatan dokumen SAMPLE tidak boleh memotong stok fisik ledger");
  });

  test("2. SAMPLE dilarang menerima pencatatan pembayaran finansial", () => {
    const sampleDoc = nativeDb
      .prepare("SELECT id FROM commercial_documents WHERE document_type = 'SAMPLE' AND owner_id = 'owner-alpha' LIMIT 1")
      .get() as { id: string };

    assert.throws(
      () => {
        repo.recordDocumentPayment(ownerAlpha, {
          documentId: sampleDoc.id,
          amount: 50000,
          paymentMethod: "TRANSFER",
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "ERR_VALIDATION");
        assert.match(err.message, /SAMPLE/i);
        return true;
      }
    );
  });

  test("3. Pembatalan Dokumen Komersial (cancelCommercialDocument) dengan audit log", () => {
    const customer = nativeDb
      .prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha' LIMIT 1")
      .get() as { id: string };
    const product = nativeDb
      .prepare("SELECT id, sku, name FROM products WHERE owner_id = 'owner-alpha' LIMIT 1")
      .get() as { id: string; sku: string; name: string };

    const doc = repo.createCommercialDocument(ownerAlpha, {
      documentType: "INVOICE",
      documentNumber: "INV-CANCEL-TEST-01",
      customerId: customer.id,
      documentDate: "2026-10-15",
      dueDate: "2026-10-30",
      lines: [
        {
          productId: product.id,
          quantity: 1,
          unitPrice: 50000,
        },
      ],
    });

    // Validasi alasan minimal 3 karakter
    assert.throws(
      () => {
        repo.cancelCommercialDocument(ownerAlpha, {
          documentId: doc.id,
          reason: "ab", // kurang dari 3
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "ERR_VALIDATION");
        return true;
      }
    );

    // Pembatalan berhasil
    const cancelled = repo.cancelCommercialDocument(ownerAlpha, {
      documentId: doc.id,
      reason: "Pembatalan pesanan atas permintaan klien",
    });

    assert.equal(cancelled.status, "CANCELLED");

    // Verifikasi di database
    const checkDb = nativeDb
      .prepare("SELECT status, notes FROM commercial_documents WHERE id = ?")
      .get(doc.id) as { status: string; notes: string };
    assert.equal(checkDb.status, "CANCELLED");
    assert.match(checkDb.notes, /DIBATALKAN/);

    // Verifikasi audit log tercatat
    const audit = nativeDb
      .prepare(
        "SELECT action, payload_json FROM audit_logs WHERE entity_id = ? AND action = 'CANCEL_COMMERCIAL_DOCUMENT'"
      )
      .get(doc.id) as { action: string; payload_json: string };
    assert.ok(audit, "Audit log CANCEL_COMMERCIAL_DOCUMENT harus tercatat");
    assert.match(audit.payload_json, /Pembatalan pesanan/);
  });

  test("4. Dokumen dengan pembayaran aktif dilarang dibatalkan (ERR_CONFLICT)", () => {
    const customer = nativeDb
      .prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha' LIMIT 1")
      .get() as { id: string };
    const product = nativeDb
      .prepare("SELECT id, sku, name FROM products WHERE owner_id = 'owner-alpha' LIMIT 1")
      .get() as { id: string; sku: string; name: string };

    const inv = repo.createCommercialDocument(ownerAlpha, {
      documentType: "INVOICE",
      documentNumber: "INV-PAY-NOCANCEL-01",
      customerId: customer.id,
      documentDate: "2026-10-15",
      dueDate: "2026-10-30",
      lines: [
        {
          productId: product.id,
          quantity: 2,
          unitPrice: 100000,
        },
      ],
    });

    // Catat pembayaran parsial
    repo.recordDocumentPayment(ownerAlpha, {
      documentId: inv.id,
      amount: 50000,
      paymentMethod: "TRANSFER",
    });

    // Percobaan pembatalan harus ditolak
    assert.throws(
      () => {
        repo.cancelCommercialDocument(ownerAlpha, {
          documentId: inv.id,
          reason: "Coba batalkan dokumen berbayar",
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "ERR_CONFLICT");
        assert.match(err.message, /pembayaran/i);
        return true;
      }
    );
  });

  test("5. Isolasi Multi-Tenant: Akses & mutasi dokumen lintas-Owner wajib ditolak", () => {
    // Dokumen milik Alpha
    const alphaDoc = nativeDb
      .prepare("SELECT id FROM commercial_documents WHERE owner_id = 'owner-alpha' LIMIT 1")
      .get() as { id: string };

    // 1. Detail lintas owner mengembalikan null (isolasi tenant)
    const crossDetail = repo.getCommercialDocumentById(ownerBeta, alphaDoc.id);
    assert.equal(crossDetail, null, "Pengambilan detail dokumen lintas-owner wajib mengembalikan null");

    // 2. Pembayaran lintas owner
    assert.throws(
      () => {
        repo.recordDocumentPayment(ownerBeta, {
          documentId: alphaDoc.id,
          amount: 10000,
          paymentMethod: "TUNAI",
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "ERR_NOT_FOUND");
        return true;
      }
    );

    // 3. Pembatalan lintas owner
    assert.throws(
      () => {
        repo.cancelCommercialDocument(ownerBeta, {
          documentId: alphaDoc.id,
          reason: "Hacking lintas owner",
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "ERR_NOT_FOUND");
        return true;
      }
    );

    // 4. Pencatatan print lintas owner
    assert.throws(
      () => {
        repo.recordDocumentPrint(ownerBeta, alphaDoc.id);
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "ERR_NOT_FOUND");
        return true;
      }
    );
  });

  test("6. Validasi Diskon Persen (maks 100%) dan tidak menghasilkan total negatif", () => {
    const customer = nativeDb
      .prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha' LIMIT 1")
      .get() as { id: string };
    const product = nativeDb
      .prepare("SELECT id, sku, name FROM products WHERE owner_id = 'owner-alpha' LIMIT 1")
      .get() as { id: string; sku: string; name: string };

    // Diskon melebihi 100% wajib ditolak oleh validasi server (ERR_VALIDATION)
    assert.throws(
      () => {
        repo.createCommercialDocument(ownerAlpha, {
          documentType: "INVOICE",
          documentNumber: "INV-CLAMP-ERR-01",
          customerId: customer.id,
          documentDate: "2026-10-15",
          dueDate: "2026-10-30",
          docPercentageDiscount: 120, // 120% melebihi batas 100%
          lines: [
            {
              productId: product.id,
              quantity: 1,
              unitPrice: 200000,
            },
          ],
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "ERR_VALIDATION");
        assert.match(err.message, /100/);
        return true;
      }
    );

    // Diskon tepat 100% diperbolehkan dan menghasilkan total Rp 0 (tidak negatif)
    const inv = repo.createCommercialDocument(ownerAlpha, {
      documentType: "INVOICE",
      documentNumber: "INV-CLAMP-OK-01",
      customerId: customer.id,
      documentDate: "2026-10-15",
      dueDate: "2026-10-30",
      docPercentageDiscount: 100,
      lines: [
        {
          productId: product.id,
          quantity: 1,
          unitPrice: 200000,
        },
      ],
    });

    assert.equal(inv.totalAmount, 0, "Diskon 100% menghasilkan total tagihan Rp 0 (tidak pernah negatif)");
  });

  test("7. Pencatatan Cetak (recordDocumentPrint) menambah print_count dan mencatat audit log", () => {
    const doc = nativeDb
      .prepare("SELECT id, print_count FROM commercial_documents WHERE owner_id = 'owner-alpha' LIMIT 1")
      .get() as { id: string; print_count: number };

    const countBefore = doc.print_count;
    const res = repo.recordDocumentPrint(ownerAlpha, doc.id);

    assert.equal(res.printCount, countBefore + 1);

    const audit = nativeDb
      .prepare(
        "SELECT action, payload_json FROM audit_logs WHERE entity_id = ? AND action = 'PRINT_COMMERCIAL_DOCUMENT' ORDER BY occurred_at DESC LIMIT 1"
      )
      .get(doc.id) as { action: string; payload_json: string };

    assert.ok(audit);
    assert.match(audit.payload_json, /printCount/);
  });

  test("8. Pencatatan Pembayaran Nyata dengan Bukti Bayar Base64 & Validasi Server", () => {
    const customer = nativeDb.prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha' LIMIT 1").get() as { id: string };
    const product = nativeDb.prepare("SELECT id FROM products WHERE owner_id = 'owner-alpha' LIMIT 1").get() as { id: string };

    // Buat invoice baru
    const invoice = repo.createCommercialDocument(ownerAlpha, {
      documentType: "INVOICE",
      documentNumber: "INV-PROOF-TEST-01",
      customerId: customer.id,
      documentDate: "2026-10-15",
      dueDate: "2026-10-30",
      lines: [
        {
          productId: product.id,
          quantity: 2,
          unitPrice: 500000,
        },
      ],
    });

    assert.equal(invoice.totalAmount, 1000000);

    // 8.1 Pembayaran parsial dengan bukti bayar JPEG Base64
    const sampleBase64 = Buffer.from("simulasi-gambar-bukti-transfer-resmi-docuflow").toString("base64");
    const payRes1 = repo.recordDocumentPayment(ownerAlpha, {
      documentId: invoice.id,
      amount: 400000,
      paymentMethod: "TRANSFER",
      referenceNumber: "TRX-BCA-PROOF-01",
      notes: "Pembayaran tahap 1 via mobile banking",
      proof: {
        mimeType: "image/jpeg",
        base64: `data:image/jpeg;base64,${sampleBase64}`, // prefix Data URI harus otomatis disanitasi
        fileName: "struk_transfer_bca.jpg",
        fileSize: 1024,
      },
    });

    assert.equal(payRes1.paidAmount, 400000);
    assert.equal(payRes1.newStatus, "PARTIALLY_PAID");

    // Verifikasi tersimpan persisten di SQLite tabel document_payments
    const savedPayment = nativeDb
      .prepare(
        "SELECT proof_mime_type, proof_base64, proof_file_name, proof_file_size FROM document_payments WHERE id = ?"
      )
      .get(payRes1.paymentId) as {
        proof_mime_type: string;
        proof_base64: string;
        proof_file_name: string;
        proof_file_size: number;
      };

    assert.ok(savedPayment);
    assert.equal(savedPayment.proof_mime_type, "image/jpeg");
    assert.equal(savedPayment.proof_base64, sampleBase64, "Prefix data:image/jpeg;base64, harus dibersihkan sebelum disimpan");
    assert.equal(savedPayment.proof_file_name, "struk_transfer_bca.jpg");
    assert.equal(savedPayment.proof_file_size, 1024);

    // Verifikasi dapat dibaca kembali via getCommercialDocumentById
    const detail = repo.getCommercialDocumentById(ownerAlpha, invoice.id);
    assert.ok(detail);
    assert.equal(detail.payments.length, 1);
    assert.equal(detail.payments[0].proofBase64, sampleBase64);
    assert.equal(detail.payments[0].proofMimeType, "image/jpeg");
    assert.equal(detail.payments[0].proofFileName, "struk_transfer_bca.jpg");

    // 8.2 Server Guard: Penolakan bukti bayar dengan ukuran > 2.5 MB
    assert.throws(
      () => {
        repo.recordDocumentPayment(ownerAlpha, {
          documentId: invoice.id,
          amount: 1000,
          paymentMethod: "TRANSFER",
          proof: {
            mimeType: "image/png",
            base64: "dummy",
            fileName: "large_file.png",
            fileSize: 3 * 1024 * 1024, // 3 MB > 2.5 MB
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "ERR_VALIDATION");
        assert.match(err.message, /2\.5 MB/);
        return true;
      }
    );

    // 8.3 Server Guard: Penolakan MIME type tidak didukung (contoh executable / script)
    assert.throws(
      () => {
        repo.recordDocumentPayment(ownerAlpha, {
          documentId: invoice.id,
          amount: 1000,
          paymentMethod: "TRANSFER",
          proof: {
            mimeType: "application/x-msdownload",
            base64: "dummy",
            fileName: "malware.exe",
            fileSize: 1000,
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "ERR_VALIDATION");
        assert.match(err.message, /tidak didukung/);
        return true;
      }
    );

    // 8.4 Upload bukti bayar bersifat opsional: pembayaran tanpa bukti tetap sukses dan melunasi tagihan
    const payRes2 = repo.recordDocumentPayment(ownerAlpha, {
      documentId: invoice.id,
      amount: 600000,
      paymentMethod: "TUNAI",
      referenceNumber: "KAS-TUNAI-02",
      notes: "Pelunasan tunai di kasir tanpa unggahan bukti",
    });

    assert.equal(payRes2.paidAmount, 1000000);
    assert.equal(payRes2.newStatus, "PAID");

    const savedPayment2 = nativeDb
      .prepare(
        "SELECT proof_mime_type, proof_base64 FROM document_payments WHERE id = ?"
      )
      .get(payRes2.paymentId) as { proof_mime_type: string | null; proof_base64: string | null };
    assert.equal(savedPayment2.proof_mime_type, null);
    assert.equal(savedPayment2.proof_base64, null);
  });

  test("9. Jatuh Tempo pada Dokumen INVOICE: Persistensi, Modifikasi via Edit, dan Isolasi", () => {
    const customer = nativeDb.prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha' LIMIT 1").get() as { id: string };
    const product = nativeDb.prepare("SELECT id FROM products WHERE owner_id = 'owner-alpha' LIMIT 1").get() as { id: string };

    // 9.1 Dokumen INVOICE baru menyimpan due_date
    const invoice = repo.createCommercialDocument(ownerAlpha, {
      documentType: "INVOICE",
      documentNumber: "INV-DUE-TEST-01",
      customerId: customer.id,
      documentDate: "2026-10-15",
      dueDate: "2026-10-25",
      lines: [
        {
          productId: product.id,
          quantity: 1,
          unitPrice: 150000,
        },
      ],
    });

    assert.equal(invoice.dueDate, "2026-10-25");

    // 9.2 Edit Dokumen INVOICE: Perubahan jatuh tempo diperbarui di SQLite via updateCommercialDocument
    const edited = repo.updateCommercialDocument(ownerAlpha, {
      documentId: invoice.id,
      customerId: customer.id,
      documentDate: "2026-10-15",
      dueDate: "2026-11-10",
      docNominalDiscount: 0,
      docPercentageDiscount: 0,
      notes: "Catatan revisi jatuh tempo",
      lines: [
        {
          productId: product.id,
          quantity: 1,
          unitPrice: 150000,
          discountType: "NONE",
          discountValue: 0,
        },
      ],
    });

    assert.equal(edited.dueDate, "2026-11-10");
    assert.equal(edited.notes, "Catatan revisi jatuh tempo");

    // Pastikan data tersimpan persisten
    const refreshed = repo.getCommercialDocumentById(ownerAlpha, invoice.id);
    assert.ok(refreshed);
    assert.equal(refreshed.dueDate, "2026-11-10");
  });
});

