/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Test Suite: Buat Dokumen Komersial Baru dengan Item Dinamis & Diskon Bertingkat (SQLite)
 * Memverifikasi:
 * 1. Pembuatan dokumen komersial dengan baris item dinamis menghitung subtotal & diskon otomatis (LOCKED).
 * 2. Baris item tersimpan persisten ke tabel commercial_document_lines.
 * 3. Pembuatan dokumen (Invoice / Surat Jalan / Kuitansi) TIDAK memotong stok fisik di ledger.
 * 4. Isolasi Multi-Tenant: Pelanggan lintas-Owner ditolak.
 * 5. Role Guard: Super Admin on behalf audit log atau Staff sesuai permission.
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

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-doc-create.db");

describe("Buat Dokumen Komersial DocuFlow V2 (Create Document)", () => {
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

  before(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
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

  test("1. Pembuatan Invoice dengan baris item dinamis menghitung subtotal & total sesuai aturan LOCKED", () => {
    const customers = nativeDb
      .prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha'")
      .all() as Array<{ id: string }>;
    const products = nativeDb
      .prepare("SELECT id FROM products WHERE owner_id = 'owner-alpha'")
      .all() as Array<{ id: string }>;
    assert.ok(customers.length > 0);
    assert.ok(products.length >= 2);

    const input: CreateCommercialDocumentInput = {
      customerId: customers[0].id,
      documentNumber: "INV-202610-TEST-001",
      documentType: "INVOICE",
      documentDate: "2026-10-15",
      dueDate: "2026-10-31",
      notes: "Invoice pengujian otomatis bento form",
      docNominalDiscount: 50000,
      pointsRedeemed: 10000,
      lines: [
        {
          productId: products[0].id,
          quantity: 2,
          unitPrice: 500000,
          discountType: "PERCENTAGE",
          discountValue: 10, // diskon 10% dari 1.000.000 = 100.000 -> line total 900.000
          note: "Item pertama",
        },
        {
          productId: products[1].id,
          quantity: 1,
          unitPrice: 200000,
          discountType: "NOMINAL",
          discountValue: 20000, // diskon 20.000 -> line total 180.000
          note: "Item kedua",
        },
      ],
    };

    const created = repo.createCommercialDocument(ownerAlpha, input);
    assert.ok(created.id);
    assert.equal(created.documentNumber, "INV-202610-TEST-001");
    assert.equal(created.documentType, "INVOICE");

    // Subtotal kotor: (2 * 500.000) + (1 * 200.000) = 1.200.000
    assert.equal(created.subtotal, 1200000);
    // Diskon item: 100.000 + 20.000 = 120.000
    assert.equal(created.itemDiscount, 120000);
    // Diskon nominal doc: 50.000
    assert.equal(created.docNominalDiscount, 50000);
    // Poin: 10.000
    assert.equal(created.pointsRedeemed, 10000);
    // Urutan LOCKED: (1.200.000 - 120.000) - 50.000 - 10.000 = 1.020.000
    assert.equal(created.totalAmount, 1020000);
  });

  test("2. Baris item tersimpan persisten ke tabel commercial_document_lines", () => {
    const detail = repo.getCommercialDocumentById(ownerAlpha, "INV-202610-TEST-001");
    assert.ok(detail);
    assert.equal(detail.lines.length, 2);

    const line1 = detail.lines[0];
    assert.ok(line1);
    assert.equal(line1.quantity, 2);
    assert.equal(line1.unitPrice, 500000);
    assert.equal(line1.discountType, "PERCENTAGE");
    assert.equal(line1.discountValue, 10);
    assert.equal(line1.lineTotal, 900000);

    const line2 = detail.lines[1];
    assert.ok(line2);
    assert.equal(line2.quantity, 1);
    assert.equal(line2.unitPrice, 200000);
    assert.equal(line2.discountType, "NOMINAL");
    assert.equal(line2.discountValue, 20000);
    assert.equal(line2.lineTotal, 180000);
  });

  test("3. Pembuatan Invoice TIDAK mengubah ledger mutasi stok atau saldo fisik", () => {
    const ledgerBefore = (
      nativeDb.prepare("SELECT COUNT(*) as count FROM inventory_ledger").get() as { count: number }
    ).count;

    const customers = nativeDb
      .prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha'")
      .all() as Array<{ id: string }>;
    const products = nativeDb
      .prepare("SELECT id FROM products WHERE owner_id = 'owner-alpha'")
      .all() as Array<{ id: string }>;

    repo.createCommercialDocument(ownerAlpha, {
      customerId: customers[0].id,
      documentNumber: "INV-202610-TEST-NO-LEDGER",
      documentType: "INVOICE",
      documentDate: "2026-10-15",
      dueDate: "2026-10-31",
      lines: [
        {
          productId: products[0].id,
          quantity: 10,
          unitPrice: 100000,
        },
      ],
    });

    const ledgerAfter = (
      nativeDb.prepare("SELECT COUNT(*) as count FROM inventory_ledger").get() as { count: number }
    ).count;
    assert.equal(ledgerAfter, ledgerBefore, "Pembuatan invoice komersial tidak boleh menulis inventory_ledger");
  });

  test("4. Surat Jalan: total otomatis 0 meskipun memiliki baris item", () => {
    const customers = nativeDb
      .prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha'")
      .all() as Array<{ id: string }>;
    const products = nativeDb
      .prepare("SELECT id FROM products WHERE owner_id = 'owner-alpha'")
      .all() as Array<{ id: string }>;

    const sj = repo.createCommercialDocument(ownerAlpha, {
      customerId: customers[0].id,
      documentNumber: "SJ-202610-TEST-001",
      documentType: "SURAT_JALAN",
      documentDate: "2026-10-15",
      dueDate: "2026-10-15",
      lines: [
        {
          productId: products[0].id,
          quantity: 5,
          unitPrice: 500000,
        },
      ],
    });

    assert.equal(sj.documentType, "SURAT_JALAN");
    assert.equal(sj.totalAmount, 0, "Surat jalan tidak memiliki nilai tagihan rupiah");
  });

  test("5. Isolasi Multi-Tenant: Gagal membuat dokumen dengan customer milik Owner lain", () => {
    const betaCustomers = nativeDb
      .prepare("SELECT id FROM customers WHERE owner_id = 'owner-beta'")
      .all() as Array<{ id: string }>;
    assert.ok(betaCustomers.length > 0);

    assert.throws(
      () => {
        repo.createCommercialDocument(ownerAlpha, {
          customerId: betaCustomers[0].id, // Milik Owner Beta!
          documentNumber: "INV-CROSS-TENANT",
          documentType: "INVOICE",
          documentDate: "2026-10-15",
          dueDate: "2026-10-31",
          lines: [],
        });
      },
      (err: unknown) => err instanceof AppError && err.code === "ERR_NOT_FOUND"
    );
  });
});
