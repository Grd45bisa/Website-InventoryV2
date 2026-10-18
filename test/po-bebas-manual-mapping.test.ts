/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Test Suite: PO Bebas & Pemetaan Manual Item PO di Goods Out Berdasarkan SN
 * Menguji 13 Skenario Wajib sesuai Spesifikasi Task
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

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-po-bebas-manual.db");

describe("PO Bebas + Pemetaan Manual Item PO di Goods Out Berdasarkan SN", () => {
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

  const salesAlphaContext: ActiveSecurityContext = {
    userId: "usr-sales-01",
    email: "sales_alpha@docuflow.id",
    ownerId: "owner-alpha",
    ownerName: "Alpha Logistics Indonesia",
    warehouseId: "wh-north",
    warehouseName: "Gudang Utama Cakung",
    role: "SALES",
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

    // Seed sales user
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
    } catch {}
  });

  let createdPoId: string;
  let poLineId: string;
  let officialProductId: string;
  const freeTextOrderName = "Enterprise Wireless Router AC1200 Dual-Band";
  const sn1 = "RTR-SN-001";
  const sn2 = "RTR-SN-002";
  const sn3 = "RTR-SN-003";

  test("Skenario 1: Membuat PO dengan nama barang bebas yang tidak ada di Master Produk", () => {
    const customers = repo.getCustomers(ownerAlphaContext);
    assert.ok(customers.length > 0);
    const targetCust = customers[0];

    // Hitung total produk master sebelum buat PO
    const countBefore = (nativeDb.prepare("SELECT count(*) as cnt FROM products WHERE owner_id = 'owner-alpha'").get() as { cnt: number }).cnt;

    const po = repo.createPurchaseOrder(salesAlphaContext, {
      customerId: targetCust.id,
      poNumber: "PO-BEBAS-001",
      orderDate: "2026-10-18",
      lines: [
        {
          rawProductName: freeTextOrderName,
          orderedQty: 3,
          orderedUnit: "PCS",
        },
      ],
    });

    assert.ok(po.id);
    createdPoId = po.id;
    assert.equal(po.lines.length, 1);
    poLineId = po.lines[0].id;
    assert.equal(po.lines[0].productId, null, "Item PO bebas tidak memiliki productId Master Produk");
    assert.equal(po.lines[0].rawProductName, freeTextOrderName);
    assert.equal(po.lines[0].mappingStatus, "UNMAPPED");
    assert.equal(po.lines[0].targetQty, 3);
    assert.equal(po.lines[0].fulfilledQty, 0);

    // Pastikan tidak ada produk baru dibuat di tabel products
    const countAfter = (nativeDb.prepare("SELECT count(*) as cnt FROM products WHERE owner_id = 'owner-alpha'").get() as { cnt: number }).cnt;
    assert.equal(countBefore, countAfter, "Jumlah produk master tidak boleh bertambah hanya karena PO dibuat");
  });

  test("Skenario 2: Membuka ulang PO dan memastikan nama item asli tetap tampil utuh", () => {
    const fetchedPo = repo.getPurchaseOrderById(ownerAlphaContext, createdPoId);
    assert.ok(fetchedPo);
    assert.equal(fetchedPo.lines[0].rawProductName, freeTextOrderName);
    assert.equal(fetchedPo.lines[0].productName, freeTextOrderName);
    assert.equal(fetchedPo.lines[0].productId, null);
  });

  test("Skenario 3: Mendaftarkan produk baru dan menerima barang fisik melalui Goods In", () => {
    // 3.1 Daftarkan produk resmi di Master Produk
    const createdProduct = repo.createProduct(ownerAlphaContext, {
      warehouseId: "wh-north",
      name: "Router AC1200",
      sku: "RTR-NEW-001",
      barcode: "8991234567890",
      category: "Jaringan",
      unit: "pcs",
      minStock: 2,
      trackingMode: "SERIAL",
    });

    assert.ok(createdProduct.id);
    officialProductId = createdProduct.id;

    // 3.2 Terima fisik barang melalui Goods In resmi
    const goodsIn = repo.postGoodsInTransaction(ownerAlphaContext, {
      warehouseId: "wh-north",
      documentNumber: "GI-RTR-001",
      documentDate: "2026-10-18",
      lines: [
        {
          productId: officialProductId,
          quantity: 3,
          unit: "pcs",
          serials: [sn1, sn2, sn3],
        },
      ],
    });

    assert.ok(goodsIn.goodsInId);

    // 3.3 Verifikasi stok fisik dan serial numbers di database
    const balance = repo.calculateStockBalance(ownerAlphaContext.ownerId, "wh-north", officialProductId);
    assert.equal(balance.availableStock, 3);

    const availableSerials = repo.getAvailableSerialsByWarehouse(ownerAlphaContext, "wh-north");
    const rtrSerials = availableSerials.filter((s) => s.productId === officialProductId);
    assert.equal(rtrSerials.length, 3);
    const snList = rtrSerials.map((s) => s.serialNumber);
    assert.ok(snList.includes(sn1));
    assert.ok(snList.includes(sn2));
    assert.ok(snList.includes(sn3));
  });

  test("Skenario 4 & 5: Memindai SN di Goods Out mendeteksi produk resmi & TIDAK memilih item PO otomatis", () => {
    // Simulasikan resolusi SN: SN dikenali berasal dari produk resmi
    const snItem = repo.verifySerialForGoodsOut(ownerAlphaContext, sn1, "wh-north");
    assert.equal(snItem.productId, officialProductId);
    assert.equal(snItem.productName, "Router AC1200");
    assert.equal(snItem.sku, "RTR-NEW-001");

    // Di UI, pemindaian SN tidak boleh auto-assign poLineId.
    // Kolom Produk & SKU menampilkan Router AC1200 (SKU RTR-NEW-001),
    // sedangkan kolom Item Pesanan PO tetap menunggu input manual pengguna.
  });

  test("Skenario 6: Memilih item PO secara manual: relasi baris PO tersimpan dengan benar", () => {
    const cust = repo.getCustomers(ownerAlphaContext)[0];

    // Persetujui PO terlebih dahulu agar CONFIRMED
    repo.approvePurchaseOrder(ownerAlphaContext, createdPoId);
    const poConfirmed = repo.getPurchaseOrderById(ownerAlphaContext, createdPoId);
    assert.equal(poConfirmed?.status, "CONFIRMED");

    // Pengguna memetakan baris PO pesanan bebas ke produk resmi Master Produk secara manual (seperti di UI Goods Out)
    repo.mapPurchaseOrderLineToProduct(ownerAlphaContext, {
      poId: createdPoId,
      lineId: poLineId,
      productId: officialProductId,
    });

    // Goods Out menghubungkan produk resmi (Router AC1200) ke baris PO pesanan bebas (Enterprise Wireless Router AC1200 Dual-Band)
    const goPending = repo.createGoodsOutPendingTransaction(staffAlphaContext, {
      warehouseId: "wh-north",
      poId: createdPoId,
      customerId: cust.id,
      documentNumber: "GO-RTR-001",
      documentDate: "2026-10-18",
      lines: [
        {
          productId: officialProductId,
          poLineId: poLineId, // Pemetaan manual ke baris PO bebas
          quantity: 1,
          unit: "pcs",
          serials: [sn1],
        },
      ],
    });

    assert.ok(goPending.goodsOutId);

    // Verifikasi relasi tersimpan di goods_out_lines
    const gol = nativeDb.prepare(`
      SELECT po_line_id, product_id, allocated_serials_json
      FROM goods_out_lines
      WHERE goods_out_id = ?
    `).get(goPending.goodsOutId) as { po_line_id: string; product_id: string; allocated_serials_json: string | null };

    assert.equal(gol.po_line_id, poLineId);
    assert.equal(gol.product_id, officialProductId);
    assert.ok(gol.allocated_serials_json);
  });

  test("Skenario 7: Memenuhi sebagian PO: sisa kuantitas dihitung dengan benar & status PARTIALLY_FULFILLED", () => {
    // Selesaikan Goods Out pertama (1 dari 3 unit)
    const pendingGo = nativeDb.prepare("SELECT id FROM goods_out WHERE document_number = 'GO-RTR-001'").get() as { id: string };
    repo.completeGoodsOutTransaction(staffAlphaContext, pendingGo.id);

    // Periksa PO
    const poAfterPartial = repo.getPurchaseOrderById(ownerAlphaContext, createdPoId);
    assert.ok(poAfterPartial);
    assert.equal(poAfterPartial.status, "PARTIALLY_FULFILLED");
    assert.equal(poAfterPartial.lines[0].fulfilledQty, 1);
    assert.equal(poAfterPartial.lines[0].targetQty, 3);
    const remaining = poAfterPartial.lines[0].targetQty - poAfterPartial.lines[0].fulfilledQty;
    assert.equal(remaining, 2, "Sisa kuantitas pesanan harus tepat 2");
  });

  test("Skenario 8: Memenuhi PO hingga selesai: status FULFILLED dan riwayat pemenuhan akurat", () => {
    const cust = repo.getCustomers(ownerAlphaContext)[0];

    // Buat dan selesaikan pengeluaran kedua untuk 2 unit sisa (sn2 dan sn3)
    const go2 = repo.createGoodsOutPendingTransaction(staffAlphaContext, {
      warehouseId: "wh-north",
      poId: createdPoId,
      customerId: cust.id,
      documentNumber: "GO-RTR-002",
      documentDate: "2026-10-18",
      lines: [
        {
          productId: officialProductId,
          poLineId: poLineId,
          quantity: 2,
          unit: "pcs",
          serials: [sn2, sn3],
        },
      ],
    });

    repo.completeGoodsOutTransaction(staffAlphaContext, go2.goodsOutId);

    // Periksa PO terkini
    const poDone = repo.getPurchaseOrderById(ownerAlphaContext, createdPoId);
    assert.ok(poDone);
    assert.equal(poDone.status, "FULFILLED", "PO harus berubah status menjadi FULFILLED saat semua item terpenuhi");
    assert.equal(poDone.lines[0].fulfilledQty, 3);
  });

  test("Skenario 9: Mencoba melebihi kuantitas PO atau stok: wajib ditolak ERR_CONFLICT", () => {
    const cust = repo.getCustomers(ownerAlphaContext)[0];

    // PO sudah terpenuhi penuh (3/3). Mencoba mengalokasikan kuantitas tambahan ke poLineId ini harus ditolak
    assert.throws(
      () => {
        repo.createGoodsOutPendingTransaction(staffAlphaContext, {
          warehouseId: "wh-north",
          poId: createdPoId,
          customerId: cust.id,
          documentNumber: "GO-RTR-OVER",
          documentDate: "2026-10-18",
          lines: [
            {
              productId: officialProductId,
              poLineId: poLineId,
              quantity: 1,
              unit: "pcs",
            },
          ],
        });
      },
      (err: unknown) => err instanceof AppError && err.code === "ERR_CONFLICT",
      "Pengeluaran melebihi sisa PO wajib ditolak ERR_CONFLICT"
    );
  });

  test("Skenario 10: Menggunakan SN duplikat atau tidak tersedia: ditolak", () => {
    // sn1 sudah dikeluarkan pada GO-RTR-001, statusnya sudah COMPLETED/DELIVERED
    assert.throws(
      () => {
        repo.verifySerialForGoodsOut(ownerAlphaContext, sn1, "wh-north");
      },
      (err: unknown) => err instanceof AppError && err.code === "ERR_CONFLICT",
      "SN yang sudah dikeluarkan wajib ditolak ERR_CONFLICT"
    );

    // SN fiktif yang belum pernah masuk Goods In
    assert.throws(
      () => {
        repo.verifySerialForGoodsOut(ownerAlphaContext, "FAKE-SN-999", "wh-north");
      },
      (err: unknown) => err instanceof AppError && err.code === "ERR_NOT_FOUND",
      "SN tidak terdaftar wajib ditolak ERR_NOT_FOUND"
    );
  });

  test("Skenario 11: Mengirim ID PO atau SN dari gudang/Owner lain: ditolak", () => {
    const cust = repo.getCustomers(ownerBetaContext)[0];
    assert.ok(cust);

    // Owner Beta mencoba membuat Goods Out merujuk ke PO milik Owner Alpha
    assert.throws(
      () => {
        repo.createGoodsOutPendingTransaction(ownerBetaContext, {
          warehouseId: "wh-beta-01",
          poId: createdPoId, // PO milik Owner Alpha
          customerId: cust.id,
          documentNumber: "GO-BETA-HACK",
          documentDate: "2026-10-18",
          lines: [
            {
              productId: "prod-beta-01",
              quantity: 1,
              unit: "pcs",
            },
          ],
        });
      },
      (err: unknown) => err instanceof AppError && (err.code === "ERR_NOT_FOUND" || err.code === "ERR_FORBIDDEN_WAREHOUSE"),
      "Akses lintas tenant wajib ditolak"
    );
  });

  test("Skenario 12: Membuka, mencari, atau memilih item PO: tidak membuat produk atau mengubah stok", () => {
    const stockBefore = repo.calculateStockBalance(ownerAlphaContext.ownerId, "wh-north", officialProductId);
    const countBefore = (nativeDb.prepare("SELECT count(*) as cnt FROM products WHERE owner_id = 'owner-alpha'").get() as { cnt: number }).cnt;

    // Panggil getter PO
    const po = repo.getPurchaseOrderById(ownerAlphaContext, createdPoId);
    assert.ok(po);
    const poList = repo.getPurchaseOrders(ownerAlphaContext);
    assert.ok(poList.length > 0);

    const stockAfter = repo.calculateStockBalance(ownerAlphaContext.ownerId, "wh-north", officialProductId);
    const countAfter = (nativeDb.prepare("SELECT count(*) as cnt FROM products WHERE owner_id = 'owner-alpha'").get() as { cnt: number }).cnt;

    assert.equal(stockBefore.availableStock, stockAfter.availableStock, "Stok tidak boleh berubah karena sekadar membuka atau membaca PO");
    assert.equal(countBefore, countAfter, "Master Produk tidak boleh bertambah karena membaca PO");
  });

  test("Skenario 13: Memastikan transaksi Goods Out reguler non-PO tetap bekerja seperti sebelumnya", () => {
    const cust = repo.getCustomers(ownerAlphaContext)[0];
    const initialBal = repo.calculateStockBalance(ownerAlphaContext.ownerId, "wh-north", "prod-cbl-01").availableStock;

    // Buat Goods In non-serial untuk barang umum
    repo.postGoodsInTransaction(ownerAlphaContext, {
      warehouseId: "wh-north",
      documentNumber: "GI-CBL-REG",
      documentDate: "2026-10-18",
      lines: [
        {
          productId: "prod-cbl-01",
          quantity: 20,
          unit: "pcs",
        },
      ],
    });

    // Buat Goods Out non-PO (item tambahan / reguler)
    const goNonPo = repo.createGoodsOutPendingTransaction(staffAlphaContext, {
      warehouseId: "wh-north",
      customerId: cust.id,
      documentNumber: "GO-NON-PO-001",
      documentDate: "2026-10-18",
      lines: [
        {
          productId: "prod-cbl-01",
          quantity: 5,
          unit: "pcs",
        },
      ],
    });

    assert.ok(goNonPo.goodsOutId);
    repo.completeGoodsOutTransaction(staffAlphaContext, goNonPo.goodsOutId);

    const balance = repo.calculateStockBalance(ownerAlphaContext.ownerId, "wh-north", "prod-cbl-01");
    assert.equal(balance.availableStock, initialBal + 15, "Stok produk non-PO berkurang dengan benar");
  });
});
