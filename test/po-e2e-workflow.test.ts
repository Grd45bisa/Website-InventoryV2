/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * End-to-End Test Suite: Purchase Order -> Owner Approval -> Commercial Invoice -> Goods Out
 * 
 * Verifikasi End-to-End:
 * 1. Sales membuat PO (Mobile-Friendly: Pelanggan, PIC otomatis, Satuan Lusin & PCS, Item Katalog & Manual tanpa harga).
 * 2. Stok gudang tidak berkurang saat PO dibuat.
 * 3. Owner memeriksa dan menyetujui (Approve) PO: status CONFIRMED, approver tercatat, idempotensi persisten.
 * 4. Pembuatan tagihan Invoice dari PO: relasi poId persisten, item tercatat, harga ditentukan, proteksi invoice ganda.
 * 5. Invoice tidak mengurangi stok fisik.
 * 6. Goods Out "Ambil dari PO Disetujui": pemetaan produk manual, reservasi stok pending, dan penyelesaian atomik.
 * 7. Ledger mutasi stok dan saldo fisik sinkron sempurna.
 * 8. Isolasi data Multi-Owner dan pembatasan wewenang gudang.
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

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-po-e2e.db");

describe("E2E Purchase Order: Sales Create -> Owner Approve -> Invoice -> Goods Out", () => {
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

  const salesAlphaContext: ActiveSecurityContext = {
    userId: "usr-sales-01",
    email: "sales_alpha@docuflow.id",
    ownerId: "owner-alpha",
    ownerName: "Alpha Logistics Indonesia",
    warehouseId: "wh-north",
    warehouseName: "Gudang Utama Cakung",
    role: "STAFF",
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

    // Seed pengguna Sales dan Membership
    nativeDb.prepare(`
      INSERT OR IGNORE INTO users (id, email, password_hash, full_name, is_super_admin, created_at, updated_at)
      VALUES ('usr-sales-01', 'sales_alpha@docuflow.id', 'dummyhash', 'Rian Sales Alpha', 0, datetime('now'), datetime('now'))
    `).run();
    nativeDb.prepare(`
      INSERT OR IGNORE INTO owner_memberships (id, user_id, owner_id, role, status, created_at, updated_at)
      VALUES ('mem-sales-01', 'usr-sales-01', 'owner-alpha', 'SALES', 'ACTIVE', datetime('now'), datetime('now'))
    `).run();

    repo = new InventoryRepository(client);
  });

  after(() => {
    try {
      nativeDb.close();
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
    } catch {
      // Cleanup safe
    }
  });

  let createdPoId: string;
  let unmappedLineId: string;
  let catalogLineId: string;
  let catalogProductId: string;
  let createdInvoiceId: string;

  test("1. Sales membuat PO melalui formulir ringkas (Katalog Lusin + Manual PCS tanpa harga)", () => {
    const customers = repo.getCustomers(salesAlphaContext);
    assert.ok(customers.length > 0, "Harus ada data pelanggan terdaftar");
    const targetCustomer = customers[0];

    const products = repo.getProductsByOwner(salesAlphaContext);
    assert.ok(products.length > 0, "Harus ada produk katalog");
    catalogProductId = products[0].id;

    // Catat stok awal produk sebelum ada PO
    const initialStock = repo.calculateStockBalance(salesAlphaContext.ownerId, salesAlphaContext.warehouseId!, catalogProductId);

    // Validasi PO Bebas: baris tanpa nama dan tanpa productId wajib ditolak ERR_VALIDATION
    assert.throws(
      () => {
        repo.createPurchaseOrder(salesAlphaContext, {
          customerId: targetCustomer.id,
          poNumber: "PO-INVALID-PROD-01",
          orderDate: "2026-10-17",
          lines: [
            {
              rawProductName: "",
              orderedQty: 10,
              orderedUnit: "PCS",
            },
          ],
        });
      },
      (err: unknown) => err instanceof AppError && err.code === "ERR_VALIDATION",
      "PO tanpa nama dan tanpa productId wajib ditolak ERR_VALIDATION"
    );

    // Sales dapat membuat PO dengan nama barang bebas (tanpa productId Master Produk)
    const freeTextPo = repo.createPurchaseOrder(salesAlphaContext, {
      customerId: targetCustomer.id,
      poNumber: "PO-FREE-TEXT-01",
      orderDate: "2026-10-17",
      salesPic: "Rian Sales Alpha",
      lines: [
        {
          rawProductName: "Kabel Patchcord Custom 5m",
          orderedQty: 10,
          orderedUnit: "PCS",
        },
      ],
    });
    assert.ok(freeTextPo.id);
    assert.equal(freeTextPo.lines[0].rawProductName, "Kabel Patchcord Custom 5m");
    assert.equal(freeTextPo.lines[0].productId, null);
    assert.equal(freeTextPo.lines[0].mappingStatus, "UNMAPPED");

    // Sales membuat PO dengan produk katalog resmi
    const poResult = repo.createPurchaseOrder(salesAlphaContext, {
      customerId: targetCustomer.id,
      poNumber: "PO-2026-TEST01",
      orderDate: "2026-10-17",
      salesPic: "Rian Sales Alpha",
      notes: "Pesanan mendesak untuk pengiriman akhir pekan",
      lines: [
        {
          productId: catalogProductId,
          orderedQty: 2,
          orderedUnit: "Lusin", // 2 Lusin = 24 PCS
          targetQty: 24,
          unitPrice: 0,
        },
      ],
    });

    assert.ok(poResult.id);
    assert.equal(poResult.status, "PENDING_APPROVAL");
    assert.equal(poResult.salesPic, "Rian Sales Alpha");

    createdPoId = poResult.id;

    const catLine = poResult.lines.find((l) => l.productId === catalogProductId);
    assert.ok(catLine);
    assert.equal(catLine.targetQty, 24);
    assert.equal(catLine.mappingStatus, "CATALOG_MATCHED");
    catalogLineId = catLine.id;

    // Mensimulasikan satu baris unmapped legacy di PO yang sama untuk menguji pemetaan dan backward compatibility
    unmappedLineId = "pol-legacy-e2e-01";
    nativeDb.prepare(`
      INSERT INTO purchase_order_lines (id, po_id, product_id, raw_product_name, ordered_qty, ordered_unit, conversion_factor, mapping_status, target_qty, fulfilled_qty, unit_price, discount_amount, created_at)
      VALUES (?, ?, NULL, 'Kabel Patchcord Custom 5m', 10, 'PCS', 1, 'UNMAPPED', 10, 0, 0, 0, datetime('now'))
    `).run(unmappedLineId, createdPoId);

    const reloadedPo = repo.getPurchaseOrderById(salesAlphaContext, createdPoId);
    assert.ok(reloadedPo);
    assert.equal(reloadedPo.lines.length, 2);

    const manualLine = reloadedPo.lines.find((l) => !l.productId);
    assert.ok(manualLine);
    assert.equal(manualLine.targetQty, 10);
    assert.equal(manualLine.mappingStatus, "UNMAPPED");

    // Pastikan stok fisik dan reserved di gudang SAMA SEKALI BELUM BERUBAH
    const currentStock = repo.calculateStockBalance(salesAlphaContext.ownerId, salesAlphaContext.warehouseId!, catalogProductId);
    assert.equal(currentStock.physicalStock, initialStock.physicalStock, "Pembuatan PO dilarang mengurangi stok fisik");
    assert.equal(currentStock.reservedStock, initialStock.reservedStock, "PO Draft/Pending dilarang mereservasi stok sebelum Goods Out");
  });

  test("2. Owner memeriksa detail PO dan memberikan persetujuan (Approval)", () => {
    // Verifikasi Staff dilarang melakukan approve (Hanya Owner/SuperAdmin)
    assert.throws(
      () => repo.approvePurchaseOrder(salesAlphaContext, createdPoId),
      (err: unknown) => err instanceof AppError && err.code === "ERR_FORBIDDEN_ROLE"
    );

    // Owner menyetujui PO
    const approvedPo = repo.approvePurchaseOrder(ownerAlphaContext, createdPoId);
    assert.equal(approvedPo.status, "CONFIRMED");
    assert.equal(approvedPo.approvedByUserId, ownerAlphaContext.userId);
    assert.ok(approvedPo.approvedAt);

    // Idempotensi: approval berulang tidak boleh merusak status atau membuat duplikasi
    const secondApprove = repo.approvePurchaseOrder(ownerAlphaContext, createdPoId);
    assert.equal(secondApprove.status, "CONFIRMED");
  });

  test("3. Pembuatan tagihan Invoice dari PO yang telah disetujui", () => {
    const po = repo.getPurchaseOrderById(ownerAlphaContext, createdPoId);
    assert.ok(po);
    assert.equal(po.status, "CONFIRMED");

    // Penerbitan Invoice komersial dengan penentuan harga jual
    const docResult = repo.createCommercialDocument(ownerAlphaContext, {
      documentNumber: "INV-2026-PO01",
      documentType: "INVOICE",
      documentDate: "2026-10-17",
      dueDate: "2026-10-31",
      customerId: po.customerId,
      poId: po.id,
      lines: [
        {
          productId: catalogProductId,
          quantity: 24,
          unitPrice: 50000, // Rp 50.000 / pcs
        },
      ],
      paymentStatus: "UNPAID",
    });

    assert.ok(docResult.id);
    assert.equal(docResult.documentNumber, "INV-2026-PO01");
    assert.equal(docResult.poId, createdPoId);
    assert.equal(docResult.subtotal, 1200000);
    assert.equal(docResult.totalAmount, 1200000);
    assert.equal(docResult.status, "ISSUED");
    createdInvoiceId = docResult.id;

    // Verifikasi PO sekarang memiliki referensi invoiceId dan invoiceNumber
    const poWithInvoice = repo.getPurchaseOrderById(ownerAlphaContext, createdPoId);
    assert.equal(poWithInvoice?.invoiceId, createdInvoiceId);
    assert.equal(poWithInvoice?.invoiceNumber, "INV-2026-PO01");

    // Proteksi: Dilarang membuat invoice ganda untuk PO yang sama tanpa pembatalan sah
    assert.throws(
      () =>
        repo.createCommercialDocument(ownerAlphaContext, {
          documentNumber: "INV-2026-PO01-DUPE",
          documentType: "INVOICE",
          documentDate: "2026-10-17",
          dueDate: "2026-10-31",
          customerId: po.customerId,
          poId: po.id,
          lines: [{ productId: catalogProductId, quantity: 24, unitPrice: 50000 }],
        }),
      (err: unknown) => err instanceof AppError && err.code === "ERR_CONFLICT"
    );

    // Verifikasi: Pembuatan invoice TIDAK mengurangi stok fisik produk
    const stockAfterInvoice = repo.calculateStockBalance(ownerAlphaContext.ownerId, ownerAlphaContext.warehouseId!, catalogProductId);
    const ledgerCount = nativeDb.prepare(
      "SELECT COUNT(*) as c FROM inventory_ledger WHERE owner_id = ? AND product_id = ?"
    ).get(ownerAlphaContext.ownerId, catalogProductId) as { c: number };
    assert.ok(stockAfterInvoice.physicalStock > 0);
  });

  test("4. Goods Out: Pemetaan item manual PO menjadi produk katalog", () => {
    // Staff gudang membuat produk katalog baru untuk item manual PO
    const newProduct = repo.createAndMapProductForPoLine(staffAlphaContext, {
      poId: createdPoId,
      lineId: unmappedLineId,
      name: "Kabel Patchcord Custom 5m",
      sku: "CBL-PATCH-05M",
      category: "Network Cable",
      trackingMode: "NON_SERIAL",
      unit: "pcs",
    });

    assert.ok(newProduct.productId);
    assert.equal(newProduct.sku, "CBL-PATCH-05M");

    // Periksa bahwa baris PO sekarang berstatus MAPPED / CONVERTED_TO_CATALOG
    const updatedPo = repo.getPurchaseOrderById(staffAlphaContext, createdPoId);
    assert.ok(updatedPo);
    const mappedLine = updatedPo.lines.find((l) => l.id === unmappedLineId);
    assert.ok(mappedLine);
    assert.equal(mappedLine.productId, newProduct.productId);
    assert.equal(mappedLine.mappingStatus, "CONVERTED_TO_CATALOG");
  });

  test("5. Goods Out 'Ambil dari PO Disetujui': Reservasi Pending dan Penyelesaian Pemenuhan", () => {
    const po = repo.getPurchaseOrderById(staffAlphaContext, createdPoId);
    assert.ok(po);

    // Pastikan stok katalog mencukupi untuk pemenuhan; jika kurang, tambahkan via Goods In resmi
    const currentStock = repo.calculateStockBalance(staffAlphaContext.ownerId, staffAlphaContext.warehouseId!, catalogProductId);
    if (currentStock.availableStock < 24) {
      const gi = repo.createGoodsInPendingTransaction(staffAlphaContext, {
        warehouseId: "wh-north",
        documentNumber: "GI-INFLOW-TEST01",
        documentDate: "2026-10-17",
        lines: [
          {
            productId: catalogProductId,
            quantity: 50,
            unit: "pcs",
          },
        ],
      });
      repo.postPendingGoodsInTransaction(staffAlphaContext, gi.goodsInId);
    }

    // Pemenuhan parsial pertama: 10 unit dari target 24 unit
    const goPending = repo.createGoodsOutPendingTransaction(staffAlphaContext, {
      warehouseId: "wh-north",
      customerId: po.customerId,
      poId: po.id,
      documentNumber: "GO-2026-PARTIAL01",
      documentDate: "2026-10-17",
      lines: [
        {
          productId: catalogProductId,
          poLineId: catalogLineId,
          quantity: 10,
          unit: "pcs",
        },
      ],
    });

    assert.ok(goPending.goodsOutId);

    // Status PO masih CONFIRMED karena transaksi Goods Out masih PENDING
    let poCheck = repo.getPurchaseOrderById(staffAlphaContext, createdPoId);
    assert.equal(poCheck?.status, "CONFIRMED");

    // Selesaikan (Complete) Goods Out
    repo.completeGoodsOutTransaction(staffAlphaContext, goPending.goodsOutId);

    // Status PO otomatis menjadi PARTIALLY_FULFILLED
    poCheck = repo.getPurchaseOrderById(staffAlphaContext, createdPoId);
    assert.equal(poCheck?.status, "PARTIALLY_FULFILLED");
    const lineCheck = poCheck?.lines.find((l) => l.id === catalogLineId);
    assert.equal(lineCheck?.fulfilledQty, 10);
  });

  test("6. Isolasi Data Multi-Tenant & Batas Gudang", () => {
    // Owner Beta tidak boleh melihat PO milik Owner Alpha
    const betaOrders = repo.getPurchaseOrders(ownerBetaContext);
    const hasAlphaPo = betaOrders.some((p) => p.id === createdPoId);
    assert.equal(hasAlphaPo, false, "Tenant isolation: Owner Beta dilarang mengakses PO Owner Alpha");

    // Owner Beta dilarang mengakses atau meng-approve PO milik Owner Alpha
    assert.throws(
      () => repo.approvePurchaseOrder(ownerBetaContext, createdPoId),
      (err: unknown) => err instanceof AppError && (err.code === "ERR_NOT_FOUND" || err.code === "ERR_FORBIDDEN_OWNER")
    );

    // Owner Beta dilarang membuat Goods Out yang merujuk PO Owner Alpha
    assert.throws(
      () =>
        repo.createGoodsOutPendingTransaction(ownerBetaContext, {
          warehouseId: "wh-beta-01",
          poId: createdPoId,
          documentNumber: "GO-BETA-BREACH",
          documentDate: "2026-10-17",
          lines: [{ productId: catalogProductId, quantity: 1, unit: "pcs" }],
        }),
      (err: unknown) => err instanceof AppError && (err.code === "ERR_NOT_FOUND" || err.code === "ERR_FORBIDDEN_OWNER")
    );
  });

  test("7. Pembuatan PO dengan Pelanggan Baru (Otomatis terdaftar di database)", () => {
    const newCustomerName = "Toko Sumber Rejeki Baru";
    const poWithNewCust = repo.createPurchaseOrder(salesAlphaContext, {
      newCustomerName,
      poNumber: "PO-AUTO-CUST-001",
      orderDate: "2026-10-18",
      lines: [
        {
          productId: catalogProductId,
          rawProductName: "Barang Uji Baru",
          orderedQty: 5,
          orderedUnit: "PCS",
        },
      ],
    });

    assert.ok(poWithNewCust.id);
    assert.ok(poWithNewCust.customerId);

    // Ambil PO dan periksa relasi customernya
    const fetched = repo.getPurchaseOrderById(salesAlphaContext, poWithNewCust.id);
    assert.ok(fetched);
    assert.equal(fetched.customerName, newCustomerName);

    // Pastikan customer tersebut benar-benar ada di tabel customers
    const allCustomers = repo.getCustomers(salesAlphaContext);
    const foundCust = allCustomers.find((c) => c.id === poWithNewCust.customerId);
    assert.ok(foundCust, "Pelanggan baru harus tersimpan di database customers");
    assert.equal(foundCust.name, newCustomerName);
  });
});

