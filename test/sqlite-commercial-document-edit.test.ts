/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Test Suite: Edit Dokumen Komersial (SQLite)
 * Memverifikasi:
 * 1. Kalkulasi murni konsisten dengan urutan diskon LOCKED.
 * 2. Edit menghitung ulang nilai di server, menyinkronkan baris, dan menulis audit before/after.
 * 3. Edit tidak mengubah stok (ledger), pembayaran, maupun status PO.
 * 4. Total baru tidak boleh lebih kecil dari jumlah yang sudah dibayar (rollback atomik).
 * 5. Hanya OWNER; isolasi lintas-Owner (dokumen dan pelanggan).
 * 6. Status pembayaran diturunkan dari pembayaran nyata, bukan input.
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
  type UpdateCommercialDocumentInput,
} from "../src/lib/db/repositories/inventory-repository.ts";
import { AppError } from "../src/lib/errors/app-error.ts";
import { calculateDocumentTotals } from "../src/lib/inventory/document-calc.ts";
import type { DatabaseClient } from "../src/lib/db/sqlite-client.ts";
import type { ActiveSecurityContext } from "../src/lib/types/auth.ts";

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-doc-edit.db");

function expectCode(code: string) {
  return (err: unknown) => err instanceof AppError && err.code === code;
}

describe("Edit Dokumen Komersial DocuFlow V2", () => {
  let nativeDb: DatabaseSync;
  let client: DatabaseClient;
  let repo: InventoryRepository;
  let altCustomerId = "";

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
  const staffAlpha: ActiveSecurityContext = { ...ownerAlpha, userId: "usr-staff-alpha", role: "STAFF" };
  const ownerBeta: ActiveSecurityContext = {
    ...ownerAlpha,
    userId: "usr-owner-beta",
    ownerId: "owner-beta",
    ownerName: "Beta Retail Nusantara",
    warehouseId: "wh-beta-01",
    warehouseName: "Gudang Barat Surabaya",
  };

  const baseInput = (overrides: Partial<UpdateCommercialDocumentInput> = {}): UpdateCommercialDocumentInput => {
    const doc = repo.getCommercialDocumentById(ownerAlpha, "inv-alpha-001");
    assert.ok(doc);
    return {
      documentId: "inv-alpha-001",
      customerId: doc.customerId,
      documentDate: doc.documentDate.slice(0, 10),
      dueDate: doc.dueDate.slice(0, 10),
      notes: doc.notes,
      docNominalDiscount: doc.docNominalDiscount,
      docPercentageDiscount: doc.docPercentageDiscount,
      lines: doc.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountType: l.discountType,
        discountValue: l.discountValue,
        note: l.descriptionSnapshot,
      })),
      ...overrides,
    };
  };

  const count = (sql: string, ...params: string[]) =>
    (nativeDb.prepare(sql).get(...params) as { c: number }).c;

  before(() => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

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

    repo.createCustomer(ownerAlpha, { code: "CUST-ALT", name: "CV Alternatif Sejahtera" });
    altCustomerId = (
      nativeDb.prepare("SELECT id FROM customers WHERE owner_id = 'owner-alpha' AND code = 'CUST-ALT'").get() as {
        id: string;
      }
    ).id;
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

  test("1. Kalkulasi murni sesuai urutan diskon LOCKED dan data seed", () => {
    const totals = calculateDocumentTotals({
      lines: [{ quantity: 10, unitPrice: 1000000, discountType: "NOMINAL", discountValue: 500000 }],
      docNominalDiscount: 250000,
      docPercentageDiscount: 0,
      pointsRedeemed: 0,
    });
    assert.equal(totals.subtotal, 10000000);
    assert.equal(totals.itemDiscount, 500000);
    assert.equal(totals.totalAmount, 9250000);

    const pct = calculateDocumentTotals({
      lines: [{ quantity: 2, unitPrice: 100000, discountType: "PERCENTAGE", discountValue: 10 }],
      docNominalDiscount: 20000,
      docPercentageDiscount: 10,
      pointsRedeemed: 5000,
    });
    // 200.000 - 20.000(item) = 180.000; - 20.000 = 160.000; x0,9 = 144.000; - 5.000 = 139.000
    assert.equal(pct.totalAmount, 139000);
  });

  test("2. Edit sukses: nilai dihitung ulang server, baris tersinkron, stok & pembayaran tidak berubah", () => {
    const before = repo.getCommercialDocumentById(ownerAlpha, "inv-alpha-001");
    assert.ok(before);
    const ledgerBefore = count("SELECT COUNT(*) AS c FROM inventory_ledger");
    const paymentsBefore = count("SELECT COUNT(*) AS c FROM document_payments WHERE document_id = 'inv-alpha-001'");
    const lineId = before.lines[0].id;
    const sourceBefore = (
      nativeDb
        .prepare("SELECT source_order_item_id AS s FROM commercial_document_lines WHERE id = ?")
        .get(lineId) as { s: string | null }
    ).s;

    const input = baseInput({
      customerId: altCustomerId,
      notes: "  Catatan hasil edit  ",
      dueDate: "2026-11-30",
    });
    input.lines = [
      { ...input.lines[0], quantity: 12, discountType: "NONE", discountValue: 0, note: "Termin revisi" },
    ];

    const updated = repo.updateCommercialDocument(ownerAlpha, input);

    // 12 x 1.000.000 = 12.000.000; - 250.000 (nominal dokumen) = 11.750.000
    assert.equal(updated.subtotal, 12000000);
    assert.equal(updated.itemDiscount, 0);
    assert.equal(updated.totalAmount, 11750000);
    assert.equal(updated.paidAmount, 5000000);
    assert.equal(updated.status, "PARTIALLY_PAID");
    assert.equal(updated.customerId, altCustomerId);
    assert.equal(updated.customerName, "CV Alternatif Sejahtera");
    assert.equal(updated.notes, "Catatan hasil edit");
    assert.equal(updated.dueDate, "2026-11-30");
    assert.equal(updated.documentNumber, before.documentNumber);
    assert.equal(updated.documentType, before.documentType);
    assert.equal(updated.poId, before.poId);

    assert.equal(updated.lines.length, 1);
    assert.equal(updated.lines[0].id, lineId, "Baris yang ada harus di-update, bukan diganti.");
    assert.equal(updated.lines[0].quantity, 12);
    assert.equal(updated.lines[0].lineTotal, 12000000);
    assert.equal(updated.lines[0].descriptionSnapshot, "Termin revisi");
    const srcRow = nativeDb
      .prepare("SELECT source_order_item_id AS s FROM commercial_document_lines WHERE id = ?")
      .get(lineId) as { s: string | null };
    assert.equal(srcRow.s, sourceBefore, "source_order_item_id harus dipertahankan.");

    assert.equal(count("SELECT COUNT(*) AS c FROM inventory_ledger"), ledgerBefore, "Edit tidak boleh menyentuh ledger stok.");
    assert.equal(
      count("SELECT COUNT(*) AS c FROM document_payments WHERE document_id = 'inv-alpha-001'"),
      paymentsBefore,
      "Edit tidak boleh membuat atau menghapus pembayaran."
    );

    const audit = nativeDb
      .prepare(
        "SELECT payload_json AS p FROM audit_logs WHERE entity_id = 'inv-alpha-001' AND action = 'UPDATE_COMMERCIAL_DOCUMENT'"
      )
      .get() as { p: string } | undefined;
    assert.ok(audit, "Audit UPDATE_COMMERCIAL_DOCUMENT harus tercatat.");
    const payload = JSON.parse(audit.p) as {
      before: { totalAmount: number };
      after: { totalAmount: number };
    };
    assert.equal(payload.before.totalAmount, 9250000);
    assert.equal(payload.after.totalAmount, 11750000);
  });

  test("3. Total baru < jumlah dibayar ditolak dan database tidak berubah (atomik)", () => {
    const input = baseInput();
    input.lines = [{ ...input.lines[0], quantity: 1 }];

    assert.throws(() => repo.updateCommercialDocument(ownerAlpha, input), expectCode("ERR_CONFLICT"));

    const after = repo.getCommercialDocumentById(ownerAlpha, "inv-alpha-001");
    assert.equal(after?.totalAmount, 11750000);
    assert.equal(after?.lines[0].quantity, 12);
  });

  test("4. Hanya OWNER yang boleh mengedit (Staff ditolak di server)", () => {
    assert.throws(() => repo.updateCommercialDocument(staffAlpha, baseInput()), expectCode("ERR_FORBIDDEN_ROLE"));
    assert.throws(
      () => repo.updateCommercialDocument({ ...ownerAlpha, isSuperAdminOnBehalf: true }, baseInput()),
      expectCode("ERR_FORBIDDEN_ROLE")
    );
  });

  test("5. Isolasi lintas-Owner: dokumen Alpha tidak dapat diedit Beta; pelanggan Beta ditolak untuk dokumen Alpha", () => {
    assert.throws(
      () => repo.updateCommercialDocument(ownerBeta, baseInput()),
      expectCode("ERR_NOT_FOUND")
    );
    assert.throws(
      () => repo.updateCommercialDocument(ownerAlpha, baseInput({ customerId: "cust-beta-01" })),
      expectCode("ERR_VALIDATION")
    );
    const doc = repo.getCommercialDocumentById(ownerAlpha, "inv-alpha-001");
    assert.equal(doc?.customerId, altCustomerId, "Data tidak boleh berubah setelah percobaan ditolak.");
  });

  test("6. Validasi server: item kosong, tanggal, diskon, dan produk lintas-Owner", () => {
    assert.throws(() => repo.updateCommercialDocument(ownerAlpha, baseInput({ lines: [] })), expectCode("ERR_VALIDATION"));
    assert.throws(
      () => repo.updateCommercialDocument(ownerAlpha, baseInput({ dueDate: "2020-01-01" })),
      expectCode("ERR_VALIDATION")
    );
    assert.throws(
      () => repo.updateCommercialDocument(ownerAlpha, baseInput({ documentDate: "bukan-tanggal" })),
      expectCode("ERR_VALIDATION")
    );
    assert.throws(
      () => repo.updateCommercialDocument(ownerAlpha, baseInput({ docPercentageDiscount: 101 })),
      expectCode("ERR_VALIDATION")
    );

    const badPct = baseInput();
    badPct.lines = [{ ...badPct.lines[0], discountType: "PERCENTAGE", discountValue: 150 }];
    assert.throws(() => repo.updateCommercialDocument(ownerAlpha, badPct), expectCode("ERR_VALIDATION"));

    const badQty = baseInput();
    badQty.lines = [{ ...badQty.lines[0], quantity: 0 }];
    assert.throws(() => repo.updateCommercialDocument(ownerAlpha, badQty), expectCode("ERR_VALIDATION"));

    const foreignProduct = baseInput();
    foreignProduct.lines = [{ ...foreignProduct.lines[0], productId: "produk-tidak-ada" }];
    assert.throws(() => repo.updateCommercialDocument(ownerAlpha, foreignProduct), expectCode("ERR_VALIDATION"));
  });

  test("7. Menambah lalu menghapus item menyinkronkan commercial_document_lines", () => {
    const withExtra = baseInput();
    withExtra.lines = [
      ...withExtra.lines,
      { productId: "prod-cbl-01", quantity: 3, unitPrice: 50000, discountType: "PERCENTAGE", discountValue: 10, note: null },
    ];
    const added = repo.updateCommercialDocument(ownerAlpha, withExtra);
    assert.equal(added.lines.length, 2);
    assert.equal(added.lines[1].productId, "prod-cbl-01");
    // 3 x 50.000 = 150.000, diskon 10% = 15.000 -> 135.000
    assert.equal(added.lines[1].lineTotal, 135000);
    // subtotal 12.150.000, item disc 15.000 -> 12.135.000 - 250.000 = 11.885.000
    assert.equal(added.totalAmount, 11885000);

    const removedId = added.lines[1].id;
    const withoutExtra = baseInput();
    withoutExtra.lines = withoutExtra.lines.filter((l) => l.id !== removedId);
    const removed = repo.updateCommercialDocument(ownerAlpha, withoutExtra);
    assert.equal(removed.lines.length, 1);
    assert.equal(removed.totalAmount, 11750000);
    assert.equal(
      count("SELECT COUNT(*) AS c FROM commercial_document_lines WHERE id = ?", removedId),
      0
    );
  });

  test("8. Dokumen PO tanpa baris tersimpan: baris fallback dimaterialisasi dengan source_order_item_id", () => {
    repo.createPurchaseOrder(ownerAlpha, {
      customerId: "cust-alpha-01",
      poNumber: "PO-EDIT-001",
      orderDate: "2026-10-10",
      lines: [{ productId: "prod-rtr-01", targetQty: 2, unitPrice: 100000 }],
    });
    const po = nativeDb
      .prepare("SELECT id FROM purchase_orders WHERE owner_id = 'owner-alpha' AND po_number = 'PO-EDIT-001'")
      .get() as { id: string };
    const created = repo.createCommercialDocument(ownerAlpha, {
      customerId: "cust-alpha-01",
      poId: po.id,
      documentNumber: "INV-EDIT-001",
      documentDate: "2026-10-12",
      dueDate: "2026-10-30",
      subtotal: 200000,
    });
    nativeDb.prepare("DELETE FROM commercial_document_lines WHERE document_id = ?").run(created.id);

    const detail = repo.getCommercialDocumentById(ownerAlpha, created.id);
    assert.ok(detail);
    assert.equal(detail.lines.length, 1, "Fallback dari PO harus tampil.");
    const poLineId = detail.lines[0].id;
    const poStatusBefore = (
      nativeDb.prepare("SELECT status FROM purchase_orders WHERE id = ?").get(po.id) as { status: string }
    ).status;

    const updated = repo.updateCommercialDocument(ownerAlpha, {
      documentId: created.id,
      customerId: "cust-alpha-01",
      documentDate: "2026-10-12",
      dueDate: "2026-10-30",
      docNominalDiscount: 0,
      docPercentageDiscount: 0,
      lines: [
        { id: poLineId, productId: "prod-rtr-01", quantity: 3, unitPrice: 100000, discountType: "NONE", discountValue: 0 },
      ],
    });

    assert.equal(updated.totalAmount, 300000);
    const row = nativeDb
      .prepare("SELECT source_order_item_id AS s FROM commercial_document_lines WHERE document_id = ?")
      .get(created.id) as { s: string | null };
    assert.equal(row.s, poLineId);
    assert.equal(
      (nativeDb.prepare("SELECT status FROM purchase_orders WHERE id = ?").get(po.id) as { status: string }).status,
      poStatusBefore,
      "Edit dokumen tidak boleh mengubah status PO."
    );
  });

  test("9. Status diturunkan dari pembayaran: total == dibayar menjadi PAID, lalu pembayaran baru ditolak", () => {
    const input = baseInput({ docNominalDiscount: 7000000 });
    // 12.000.000 - 7.000.000 = 5.000.000 == paid
    const updated = repo.updateCommercialDocument(ownerAlpha, input);
    assert.equal(updated.totalAmount, 5000000);
    assert.equal(updated.status, "PAID");

    assert.throws(
      () =>
        repo.recordDocumentPayment(ownerAlpha, {
          documentId: "inv-alpha-001",
          amount: 1000,
          paymentMethod: "TUNAI",
        }),
      expectCode("ERR_CONFLICT")
    );

    // Total dinaikkan kembali: status turun menjadi PARTIALLY_PAID (bukan diset manual).
    const reopened = repo.updateCommercialDocument(ownerAlpha, baseInput({ docNominalDiscount: 250000 }));
    assert.equal(reopened.totalAmount, 11750000);
    assert.equal(reopened.status, "PARTIALLY_PAID");
  });

  test("10. getDocumentEditOptions terisolasi per-Owner", () => {
    const opts = repo.getDocumentEditOptions(ownerAlpha, "inv-alpha-001");
    assert.ok(opts.customers.some((c) => c.id === altCustomerId));
    assert.ok(opts.customers.every((c) => c.id !== "cust-beta-01"));
    assert.ok(opts.products.some((p) => p.id === "prod-rtr-01"));

    const betaOpts = repo.getDocumentEditOptions(ownerBeta, "inv-alpha-001");
    assert.ok(betaOpts.customers.every((c) => c.id !== "cust-alpha-01" && c.id !== altCustomerId));
    assert.ok(betaOpts.products.every((p) => p.id !== "prod-rtr-01"));
  });
});
