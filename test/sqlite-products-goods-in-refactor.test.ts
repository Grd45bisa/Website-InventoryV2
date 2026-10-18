/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Test Suite: Refactor Produk dan Goods In (Penerimaan Barang)
 * 
 * Memverifikasi:
 * 1. Master Produk: Pembuatan produk ber-saldo 0, update metadata produk, dan detail 4-tab data source.
 * 2. Konsistensi Satuan & Ledger: Kuantitas selalu dalam satuan dasar resmi.
 * 3. Goods In Multi-Item:
 *    - Simpan Draft (PENDING): Tidak ada penambahan saldo fisik atau pendaftaran SN di ledger.
 *    - Posting Final (POSTED): Atomic write ke inventory_ledger, registrasi SN AVAILABLE, dan mutasi saldo fisik.
 *    - Anti-Double-Post: Menolak posting ganda pada dokumen yang sudah berstatus POSTED.
 * 4. Serial Number Integrity:
 *    - Wajib tepat N SN untuk kuantitas N pada produk serial.
 *    - Menolak SN duplikat lintas-gudang dalam satu Owner (Cross-Warehouse Serial Guard).
 * 5. Isolasi Multi-Owner & Warehouse Boundary.
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
  type CreateProductInput,
  type CreateGoodsInInput,
} from "../src/lib/db/repositories/inventory-repository.ts";
import { AppError } from "../src/lib/errors/app-error.ts";
import type { DatabaseClient } from "../src/lib/db/sqlite-client.ts";
import type { ActiveSecurityContext } from "../src/lib/types/auth.ts";

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-prod-goods-in.db");

describe("Refactor Produk dan Goods In DocuFlow V2.4.1", () => {
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

  // TEST 1: Modul Produk
  describe("Modul 1: Pengelolaan Master Produk dan Satuan", () => {
    let createdProdId: string;

    test("1.1 Pembuatan produk baru memiliki saldo awal 0 tanpa mutasi siluman", () => {
      const input: CreateProductInput = {
        warehouseId: "wh-north",
        sku: "SWT-CORE-10G",
        name: "Switch Core 10G Managed",
        category: "Jaringan",
        trackingMode: "SERIAL",
        unit: "unit",
        minStock: 2,
        description: "Switch backbone berkecepatan tinggi",
      };

      const prod = repo.createProduct(ownerAlpha, input);
      createdProdId = prod.id;

      assert.equal(prod.sku, "SWT-CORE-10G");
      assert.equal(prod.trackingMode, "SERIAL");
      assert.equal(prod.unit, "unit");
      assert.equal(prod.physicalStock, 0, "Saldo fisik produk baru wajib 0");
      assert.equal(prod.status, "ACTIVE");
    });

    test("1.2 Dapat memperbarui metadata produk via updateProduct", () => {
      const updated = repo.updateProduct(ownerAlpha, {
        productId: createdProdId,
        name: "Switch Core 10G Managed Enterprise V2",
        barcode: "8999900112233",
        minStock: 4,
        description: "Versi pembaruan firmware 2.4",
      });

      assert.equal(updated.name, "Switch Core 10G Managed Enterprise V2");
      assert.equal(updated.barcode, "8999900112233");
      assert.equal(updated.minStock, 4);
      assert.equal(updated.description, "Versi pembaruan firmware 2.4");
      assert.equal(updated.sku, "SWT-CORE-10G", "SKU dilarang berubah sembarangan");
      assert.equal(updated.unit, "unit", "Satuan dasar dilarang berubah");
    });

    test("1.3 getProductById mengembalikan data lengkap untuk 4 Tab Detail Produk", () => {
      const detail = repo.getProductById(ownerAlpha, createdProdId);
      assert.ok(detail, "Detail produk harus ditemukan");
      assert.equal(detail.product.id, createdProdId);
      assert.equal(Array.isArray(detail.serials), true, "Tab 2: Array serials harus ada");
      assert.equal(Array.isArray(detail.ledgerHistory), true, "Tab 3: Array ledger history harus ada");
    });

    test("1.4 Isolasi Owner pada produk: Owner Beta ditolak mengakses produk Owner Alpha", () => {
      const detailBeta = repo.getProductById(ownerBeta, createdProdId);
      assert.equal(detailBeta, null, "Owner Beta tidak boleh melihat produk Owner Alpha");

      assert.throws(
        () => repo.updateProduct(ownerBeta, { productId: createdProdId, name: "Hacked" }),
        (err: unknown) => err instanceof AppError && err.code === "ERR_NOT_FOUND"
      );
    });
  });

  // TEST 2: Modul Goods In
  describe("Modul 2: Goods In Multi-Item, Draft (PENDING), dan Posting", () => {
    let pendingDocId: string;
    const testDocNum = "GI-TEST-2026-MULTI";
    const serialList = ["SN-SWT-10G-001", "SN-SWT-10G-002"];

    test("2.1 Simpan Draft (PENDING) multi-item TIDAK menambah stok fisik atau serial aktif", () => {
      // Ambil produk yang ada
      const prodSerial = repo.getProductsByOwner(ownerAlpha).find((p) => p.sku === "SWT-CORE-10G")!;
      const prodNonSerial = repo.getProductsByOwner(ownerAlpha).find((p) => p.trackingMode === "NON_SERIAL")!;

      const initialSerialStock = prodSerial.physicalStock ?? 0;
      const initialNonSerialStock = prodNonSerial.physicalStock ?? 0;

      const input: CreateGoodsInInput = {
        warehouseId: "wh-north",
        supplierId: "sup-alpha-01",
        documentNumber: testDocNum,
        documentDate: "2026-10-15",
        note: "Surat Jalan SJ-7788 Penerimaan Draft",
        lines: [
          {
            productId: prodSerial.id,
            quantity: 2,
            unit: "unit",
            serials: serialList,
          },
          {
            productId: prodNonSerial.id,
            quantity: 15,
            unit: prodNonSerial.unit,
            note: "Dus segel aman",
          },
        ],
      };

      const res = repo.createGoodsInPendingTransaction(ownerAlpha, input);
      pendingDocId = res.goodsInId;
      assert.ok(pendingDocId, "Harus menghasilkan goodsInId draft");

      // Cek bahwa saldo fisik belum bertambah
      const afterDraftSerial = repo.getProductById(ownerAlpha, prodSerial.id)!;
      const afterDraftNonSerial = repo.getProductById(ownerAlpha, prodNonSerial.id)!;

      assert.equal(afterDraftSerial.product.physicalStock, initialSerialStock, "Stok serial tidak boleh bertambah saat draft");
      assert.equal(afterDraftNonSerial.product.physicalStock, initialNonSerialStock, "Stok non-serial tidak boleh bertambah saat draft");
      assert.equal(afterDraftSerial.serials.length, 0, "SN belum boleh terdaftar aktif");

      // Cek status di daftar Goods In
      const list = repo.getGoodsInList(ownerAlpha, "wh-north");
      const found = list.find((g) => g.id === pendingDocId);
      assert.ok(found, "Dokumen draft harus ada di daftar");
      assert.equal(found.status, "PENDING", "Status dokumen wajib PENDING");
      assert.equal(found.items.length, 2, "Harus memiliki 2 baris item");
    });

    test("2.2 Memposting Goods In PENDING secara atomik menambah stok fisik dan mendaftarkan SN AVAILABLE", () => {
      const prodSerial = repo.getProductsByOwner(ownerAlpha).find((p) => p.sku === "SWT-CORE-10G")!;
      const prodNonSerial = repo.getProductsByOwner(ownerAlpha).find((p) => p.trackingMode === "NON_SERIAL")!;

      const preSerialStock = prodSerial.physicalStock ?? 0;
      const preNonSerialStock = prodNonSerial.physicalStock ?? 0;

      const res = repo.postPendingGoodsInTransaction(ownerAlpha, pendingDocId);
      assert.equal(res.goodsInId, pendingDocId);
      assert.equal(res.ledgerEntriesCount, 2, "Harus menulis 2 entri ke inventory_ledger");

      // Cek bahwa saldo fisik bertambah tepat
      const afterPostSerial = repo.getProductById(ownerAlpha, prodSerial.id)!;
      const afterPostNonSerial = repo.getProductById(ownerAlpha, prodNonSerial.id)!;

      assert.equal(afterPostSerial.product.physicalStock, preSerialStock + 2, "Stok serial harus bertambah +2");
      assert.equal(afterPostNonSerial.product.physicalStock, preNonSerialStock + 15, "Stok non-serial harus bertambah +15");

      // Cek nomor seri terdaftar
      assert.equal(afterPostSerial.serials.length, 2, "Dua SN harus terdaftar");
      assert.equal(afterPostSerial.serials[0].status, "AVAILABLE", "Status SN harus AVAILABLE");

      // Cek dokumen berubah status ke POSTED
      const list = repo.getGoodsInList(ownerAlpha, "wh-north");
      const found = list.find((g) => g.id === pendingDocId);
      assert.equal(found?.status, "POSTED", "Status harus berubah ke POSTED");
    });

    test("2.3 Anti-Double-Post: Menolak posting kedua pada dokumen Goods In yang sudah POSTED", () => {
      assert.throws(
        () => repo.postPendingGoodsInTransaction(ownerAlpha, pendingDocId),
        (err: unknown) => err instanceof AppError && err.code === "ERR_CONFLICT",
        "Wajib menolak posting berulang"
      );
    });

    test("2.4 Validasi Serial Number: Menolak kuantitas serial jika jumlah SN tidak cocok", () => {
      const prodSerial = repo.getProductsByOwner(ownerAlpha).find((p) => p.sku === "SWT-CORE-10G")!;

      assert.throws(
        () =>
          repo.postGoodsInTransaction(ownerAlpha, {
            warehouseId: "wh-north",
            documentNumber: "GI-ERR-SN-COUNT",
            documentDate: "2026-10-15",
            lines: [
              {
                productId: prodSerial.id,
                quantity: 2,
                serials: ["SN-SINGLE-ONLY"], // Kurang 1
              },
            ],
          }),
        (err: unknown) => err instanceof AppError && err.code === "ERR_VALIDATION"
      );
    });

    test("2.5 Cross-Warehouse Serial Guard: Menolak SN yang sudah aktif di gudang lain dalam satu Owner", () => {
      const prodSouth = repo.getProductsByOwner(ownerAlpha).find((p) => p.warehouseId === "wh-south");
      if (!prodSouth) return;

      // Coba daftarkan serialList[0] yang sudah terdaftar di wh-north ke wh-south
      assert.throws(
        () =>
          repo.postGoodsInTransaction(ownerAlpha, {
            warehouseId: "wh-south",
            documentNumber: "GI-CROSS-GUARD-FAIL",
            documentDate: "2026-10-15",
            lines: [
              {
                productId: prodSouth.id,
                quantity: 1,
                serials: [serialList[0]],
              },
            ],
          }),
        (err: unknown) => err instanceof AppError && err.code === "ERR_CONFLICT",
        "Wajib menolak SN yang sudah aktif di gudang lain"
      );
    });

    test("2.6 Multi-baris produk yang sama dengan satuan (unit) berbeda terakumulasi presisi sesuai multiplier", () => {
      const prodNonSerial = repo.getProductsByOwner(ownerAlpha).find((p) => p.trackingMode === "NON_SERIAL")!;
      const startStock = prodNonSerial.physicalStock ?? 0;

      // Buat transaksi dengan 3 baris untuk produk yang SAMA:
      // Baris 1: 10 pcs (10 * 1 = 10 pcs)
      // Baris 2: 5 pack3 (5 * 3 = 15 pcs)
      // Baris 3: 2 lusin (2 * 12 = 24 pcs)
      // Total kuantitas fisik = 49 pcs
      const multiUnitDoc = repo.postGoodsInTransaction(ownerAlpha, {
        warehouseId: "wh-north",
        documentNumber: "GI-MULTI-UNIT-SAME-PROD",
        documentDate: "2026-10-15",
        note: "Uji multi-baris produk sama beda satuan",
        lines: [
          {
            productId: prodNonSerial.id,
            quantity: 10,
            unit: "pcs",
            note: "10 pcs eceran",
          },
          {
            productId: prodNonSerial.id,
            quantity: 5,
            unit: "pack3",
            note: "5 pack isi 3",
          },
          {
            productId: prodNonSerial.id,
            quantity: 2,
            unit: "lusin",
            note: "2 lusin isi 12",
          },
        ],
      });

      assert.ok(multiUnitDoc.goodsInId);
      assert.equal(multiUnitDoc.ledgerEntriesCount, 3, "Harus menulis 3 baris ledger");

      // Cek dokumen di daftar
      const list = repo.getGoodsInList(ownerAlpha, "wh-north");
      const found = list.find((g) => g.id === multiUnitDoc.goodsInId);
      assert.ok(found);
      assert.equal(found.items.length, 3, "Harus menyimpan 3 baris item");

      // Verifikasi stok fisik di produk bertambah tepat +49 pcs
      const updatedProd = repo.getProductById(ownerAlpha, prodNonSerial.id)!;
      assert.equal(
        updatedProd.product.physicalStock,
        startStock + 49,
        "Stok fisik produk harus bertambah tepat 49 pcs (10 pcs + 15 pcs + 24 pcs)"
      );
    });

    test("2.7 Dokumen campuran multi-produk & produk berulang dengan SN: Draft tidak menambah stok, Posting atomik menambah stok & SN presisi", () => {
      const prodSerial = repo.getProductsByOwner(ownerAlpha).find((p) => p.sku === "SWT-CORE-10G")!;
      const prodNonSerial = repo.getProductsByOwner(ownerAlpha).find((p) => p.trackingMode === "NON_SERIAL")!;

      const startSerialStock = prodSerial.physicalStock ?? 0;
      const startNonSerialStock = prodNonSerial.physicalStock ?? 0;

      const serialNumbers = [
        "SN-MIX-PROD-001",
        "SN-MIX-PROD-002",
      ];

      // 1. Simpan PENDING dengan campuran baris:
      // Baris 1: Produk Non-Serial (A) - 2 lusin (= 24 pcs)
      // Baris 2: Produk Serial (B) - 2 pcs (= 2 SN)
      // Baris 3: Produk Non-Serial (A lagi) - 5 pcs (= 5 pcs)
      const pendingDoc = repo.createGoodsInPendingTransaction(ownerAlpha, {
        warehouseId: "wh-north",
        documentNumber: "GI-MIXED-MULTI-ITEM",
        documentDate: "2026-10-15",
        note: "Campuran multi-item dan produk berulang",
        lines: [
          {
            productId: prodNonSerial.id,
            quantity: 2,
            unit: "lusin",
            note: "Baris 1 Non-Serial Dus Lusin",
          },
          {
            productId: prodSerial.id,
            quantity: 2,
            unit: "pcs",
            serials: serialNumbers,
            note: "Baris 2 Serial",
          },
          {
            productId: prodNonSerial.id,
            quantity: 5,
            unit: "pcs",
            note: "Baris 3 Non-Serial Pcs Ecer",
          },
        ],
      });

      assert.ok(pendingDoc.goodsInId);

      // Verifikasi stok saat PENDING belum berubah
      const midSerial = repo.getProductById(ownerAlpha, prodSerial.id)!;
      const midNonSerial = repo.getProductById(ownerAlpha, prodNonSerial.id)!;
      assert.equal(midSerial.product.physicalStock, startSerialStock, "Draft tidak boleh menambah stok serial");
      assert.equal(midNonSerial.product.physicalStock, startNonSerialStock, "Draft tidak boleh menambah stok non-serial");

      // 2. Posting transaksi PENDING
      const postResult = repo.postPendingGoodsInTransaction(ownerAlpha, pendingDoc.goodsInId);
      assert.equal(postResult.goodsInId, pendingDoc.goodsInId);
      assert.equal(postResult.ledgerEntriesCount, 3, "Harus menulis 3 baris ledger untuk 3 item");

      // Verifikasi stok setelah POSTED
      const finalSerial = repo.getProductById(ownerAlpha, prodSerial.id)!;
      const finalNonSerial = repo.getProductById(ownerAlpha, prodNonSerial.id)!;

      // Produk Non-Serial bertambah: 2 lusin (24) + 5 pcs (5) = +29 pcs
      assert.equal(
        finalNonSerial.product.physicalStock,
        startNonSerialStock + 29,
        "Stok non-serial harus bertambah tepat 29 pcs dari 2 baris terpisah"
      );

      // Produk Serial bertambah +2 pcs dan 2 SN terdaftar
      assert.equal(
        finalSerial.product.physicalStock,
        startSerialStock + 2,
        "Stok serial harus bertambah tepat 2 pcs"
      );

      // Cek SN terdaftar
      const foundSn1 = finalSerial.serials.some((s) => s.serialNumber === serialNumbers[0] && s.status === "AVAILABLE");
      const foundSn2 = finalSerial.serials.some((s) => s.serialNumber === serialNumbers[1] && s.status === "AVAILABLE");
      assert.ok(foundSn1, "SN 1 harus terdaftar AVAILABLE");
      assert.ok(foundSn2, "SN 2 harus terdaftar AVAILABLE");
    });
  });

  describe("Modul 3: Keunikan SKU per Gudang & Quick Create Master Product", () => {
    test("3.1 Validasi wajib Nama dan SKU: Menolak string kosong / spasi", () => {
      assert.throws(
        () =>
          repo.createProduct(ownerAlpha, {
            warehouseId: "wh-north",
            name: "   ",
            sku: "SKU-TEST-EMPTY",
            category: "General",
            trackingMode: "NON_SERIAL",
          }),
        (err: unknown) => err instanceof AppError && err.code === "ERR_VALIDATION",
        "Wajib menolak nama produk yang hanya berupa spasi"
      );

      assert.throws(
        () =>
          repo.createProduct(ownerAlpha, {
            warehouseId: "wh-north",
            name: "Produk Valid",
            sku: "   ",
            category: "General",
            trackingMode: "NON_SERIAL",
          }),
        (err: unknown) => err instanceof AppError && err.code === "ERR_VALIDATION",
        "Wajib menolak SKU yang kosong"
      );
    });

    test("3.2 Keunikan SKU dalam cakupan Gudang: Menolak SKU duplikat pada gudang yang sama", () => {
      const uniqueSku = "SKU-UNIQUE-WH-NORTH";

      const p1 = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-north",
        name: "Produk Pertama Wh North",
        sku: uniqueSku,
        category: "General",
        trackingMode: "NON_SERIAL",
      });
      assert.ok(p1.id);

      // Coba buat produk kedua dengan SKU yang sama persis di gudang yang sama (wh-north)
      assert.throws(
        () =>
          repo.createProduct(ownerAlpha, {
            warehouseId: "wh-north",
            name: "Produk Kedua Duplikat Wh North",
            sku: uniqueSku,
            category: "General",
            trackingMode: "NON_SERIAL",
          }),
        (err: unknown) => err instanceof AppError && err.code === "ERR_CONFLICT",
        "Wajib menolak pembuatan produk dengan SKU yang sama pada gudang yang sama"
      );
    });

    test("3.3 SKU yang sama di gudang berbeda (atau owner berbeda) diperbolehkan", () => {
      const sharedSku = "SKU-SHARED-MULTI-WH";

      // 1. Buat di wh-north (Gudang Utama)
      const pNorth = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-north",
        name: "Item di Gudang Utara",
        sku: sharedSku,
        category: "General",
        trackingMode: "NON_SERIAL",
      });
      assert.ok(pNorth.id);

      // 2. Buat dengan SKU yang sama di wh-south (Gudang Distribusi) pada Owner yang sama
      const pSouth = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-south",
        name: "Item di Gudang Selatan",
        sku: sharedSku,
        category: "General",
        trackingMode: "NON_SERIAL",
      });
      assert.ok(pSouth.id);
      assert.notEqual(pNorth.id, pSouth.id);
      assert.equal(pNorth.sku, pSouth.sku);
    });

    test("3.4 Quick Create Master Produk: Saldo awal tetap 0 tanpa mutasi stok siluman", () => {
      const quickSku = "SKU-QUICK-STOCK-ZERO";

      const created = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-north",
        name: "Produk Baru Quick Create",
        sku: quickSku,
        category: "General",
        trackingMode: "NON_SERIAL",
        unit: "pcs",
      });

      assert.equal(created.physicalStock, 0, "Saldo fisik harus 0");
      assert.equal(created.reservedStock, 0, "Saldo reservasi harus 0");
      assert.equal(created.availableStock, 0, "Saldo tersedia harus 0");

      // Cek ledger: Tidak boleh ada entri pergerakan stok untuk produk baru ini
      const ledgerEntries = repo.calculateStockBalance(ownerAlpha.ownerId, "wh-north", created.id);
      assert.equal(ledgerEntries.physicalStock, 0);
    });
  });

  describe("Modul 4: Unit Operasional Serial Number & Registrasi Pasca-Penerimaan (Revisi V2)", () => {
    test("4.1 Master produk baru tanpa satuan dasar dan metode pelacakan: Default aman & saldo 0", () => {
      const p = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-north",
        name: "Kemeja Flanel Kasual",
        sku: "KFL-001",
        category: "Pakaian",
        trackingMode: "NON_SERIAL",
        unit: "pcs",
      });

      assert.ok(p.id);
      assert.equal(p.physicalStock, 0);
      assert.equal(p.unit, "pcs");
      assert.equal(p.trackingMode, "NON_SERIAL");
    });

    test("4.2 Goods In PENDING menolak registrasi SN pasca-penerimaan sebelum POSTED", () => {
      const p = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-north",
        name: "Celana Denim Premium",
        sku: "CDN-001",
        category: "Pakaian",
        trackingMode: "NON_SERIAL",
      });

      const { goodsInId } = repo.createGoodsInPendingTransaction(ownerAlpha, {
        warehouseId: "wh-north",
        documentNumber: "GI-PEND-REGSN-01",
        documentDate: "2026-10-15",
        lines: [
          {
            productId: p.id,
            quantity: 5,
            unit: "lusin",
          },
        ],
      });

      // Ambil baris
      const statusRes = repo.getGoodsInSerialsStatus(ownerAlpha, goodsInId);
      assert.equal(statusRes.status, "PENDING");
      assert.equal(statusRes.lines.length, 1);
      const lineId = statusRes.lines[0].lineId;

      // Harus ditolak karena belum POSTED
      assert.throws(
        () => {
          repo.registerGoodsInSerials(ownerAlpha, {
            goodsInId,
            lineId,
            serialNumbers: ["SN-PENDING-01"],
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal(err.code, "ERR_CONFLICT");
          assert.match(err.message, /POSTED/i);
          return true;
        }
      );
    });

    test("4.3 Penerimaan 5 unit dengan satuan lusin membutuhkan TEPAT 5 SN operasional, bukan 60 SN", () => {
      const p = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-north",
        name: "Kaos Polos Combed 30s",
        sku: "KPC-30S-LUSIN",
        category: "Pakaian",
        trackingMode: "NON_SERIAL",
      });

      // Posting Goods In 5 lusin (konversi: 5 * 12 = 60 pcs fisik)
      const { goodsInId } = repo.postGoodsInTransaction(ownerAlpha, {
        warehouseId: "wh-north",
        documentNumber: "GI-POST-5LUSIN-01",
        documentDate: "2026-10-15",
        lines: [
          {
            productId: p.id,
            quantity: 5,
            unit: "lusin",
          },
        ],
      });

      // Saldo fisik bertambah 60 pcs di ledger
      const balance = repo.calculateStockBalance(ownerAlpha.ownerId, "wh-north", p.id);
      assert.equal(balance.physicalStock, 60, "5 lusin harus menghasilkan 60 pcs di saldo fisik");

      // Cek status SN: Harus membutuhkan 5 SN operasional!
      const statusRes = repo.getGoodsInSerialsStatus(ownerAlpha, goodsInId);
      assert.equal(statusRes.lines[0].requiredUnits, 5, "5 lusin = butuh 5 SN operasional");
      assert.equal(statusRes.lines[0].conversionMultiplier, 12);
      assert.equal(statusRes.lines[0].totalBaseQuantity, 60);
      assert.equal(statusRes.lines[0].registeredCount, 0);
      assert.equal(statusRes.lines[0].remainingCount, 5);
      assert.equal(statusRes.lines[0].status, "BELUM_DIREGISTRASIKAN");

      // Daftarkan 5 SN bertahap: Batch 1 (2 SN)
      const lineId = statusRes.lines[0].lineId;
      const regRes1 = repo.registerGoodsInSerials(ownerAlpha, {
        goodsInId,
        lineId,
        serialNumbers: ["SN-LSN-001", "SN-LSN-002"],
      });
      assert.equal(regRes1.registeredCount, 2);
      assert.equal(regRes1.totalRegistered, 2);
      assert.equal(regRes1.remainingCount, 3);
      assert.equal(regRes1.status, "SEBAGIAN_DIREGISTRASIKAN");

      // Cek bahwa pendaftaran SN TIDAK MENAMBAH saldo stok (tetap 60 pcs)
      const balanceAfterReg1 = repo.calculateStockBalance(ownerAlpha.ownerId, "wh-north", p.id);
      assert.equal(balanceAfterReg1.physicalStock, 60, "Registrasi SN tidak boleh menambah stok dua kali!");

      // Batch 2: Sisa 3 SN
      const regRes2 = repo.registerGoodsInSerials(ownerAlpha, {
        goodsInId,
        lineId,
        serialNumbers: ["SN-LSN-003", "SN-LSN-004", "SN-LSN-005"],
      });
      assert.equal(regRes2.registeredCount, 3);
      assert.equal(regRes2.totalRegistered, 5);
      assert.equal(regRes2.remainingCount, 0);
      assert.equal(regRes2.status, "LENGKAP");

      // Verifikasi status terkini
      const finalStatus = repo.getGoodsInSerialsStatus(ownerAlpha, goodsInId);
      assert.equal(finalStatus.lines[0].status, "LENGKAP");
      assert.equal(finalStatus.lines[0].registeredCount, 5);
      assert.equal(finalStatus.lines[0].serials.length, 5);

      // Verifikasi setiap SN menyimpan unit 'lusin' dan base_quantity = 12
      for (const s of finalStatus.lines[0].serials) {
        assert.equal(s.unit, "lusin");
        assert.equal(s.unitQuantity, 1);
        assert.equal(s.baseQuantity, 12, "Setiap SN lusin harus mewakili 12 pcs");
        assert.equal(s.status, "AVAILABLE");
      }
    });

    test("4.4 Penerimaan 60 unit PCS membutuhkan 60 SN operasional", () => {
      const p = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-north",
        name: "Baut M6 Baja",
        sku: "BAUT-M6-PCS",
        category: "Hardware",
        trackingMode: "NON_SERIAL",
      });

      const { goodsInId } = repo.postGoodsInTransaction(ownerAlpha, {
        warehouseId: "wh-north",
        documentNumber: "GI-POST-60PCS-01",
        documentDate: "2026-10-15",
        lines: [
          {
            productId: p.id,
            quantity: 60,
            unit: "pcs",
          },
        ],
      });

      const statusRes = repo.getGoodsInSerialsStatus(ownerAlpha, goodsInId);
      assert.equal(statusRes.lines[0].requiredUnits, 60, "60 pcs = butuh 60 SN");
      assert.equal(statusRes.lines[0].conversionMultiplier, 1);
      assert.equal(statusRes.lines[0].totalBaseQuantity, 60);
      assert.equal(statusRes.lines[0].remainingCount, 60);
    });

    test("4.5 Idempotensi & Kuota Guard: Menolak SN berlebih atau menduplikasi input", () => {
      const p = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-north",
        name: "Topi Trucker",
        sku: "TPI-TRK-01",
        category: "Aksesoris",
        trackingMode: "NON_SERIAL",
      });

      const { goodsInId } = repo.postGoodsInTransaction(ownerAlpha, {
        warehouseId: "wh-north",
        documentNumber: "GI-POST-TOPI-01",
        documentDate: "2026-10-15",
        lines: [
          {
            productId: p.id,
            quantity: 2,
            unit: "pack3", // 2 unit pack3 = butuh 2 SN operasional, total 6 pcs
          },
        ],
      });

      const statusRes = repo.getGoodsInSerialsStatus(ownerAlpha, goodsInId);
      const lineId = statusRes.lines[0].lineId;
      assert.equal(statusRes.lines[0].requiredUnits, 2);

      // Daftarkan 1 SN
      repo.registerGoodsInSerials(ownerAlpha, {
        goodsInId,
        lineId,
        serialNumbers: ["SN-TOPI-01"],
      });

      // Mengirim ulang SN yang sama (idempoten) tidak menyebabkan error duplikasi, tetapi tidak menambah count baru
      const idempotentRes = repo.registerGoodsInSerials(ownerAlpha, {
        goodsInId,
        lineId,
        serialNumbers: ["SN-TOPI-01"],
      });
      assert.equal(idempotentRes.registeredCount, 0);
      assert.equal(idempotentRes.totalRegistered, 1);

      // Mencoba mendaftarkan 2 SN baru padahal sisa kuota hanya 1 -> Tolak error!
      assert.throws(
        () => {
          repo.registerGoodsInSerials(ownerAlpha, {
            goodsInId,
            lineId,
            serialNumbers: ["SN-TOPI-02", "SN-TOPI-03"],
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal(err.code, "ERR_VALIDATION");
          return true;
        }
      );
    });

    test("4.6 Integrasi Goods Out: SN yang mewakili 1 lusin mengurangi tepat 12 pcs fisik dasar di ledger", () => {
      const p = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-north",
        name: "Sandal Slop Distro",
        sku: "SDL-SLP-01",
        category: "Alas Kaki",
        trackingMode: "NON_SERIAL",
      });

      // 1. Terima 3 lusin (= 36 pcs)
      const { goodsInId } = repo.postGoodsInTransaction(ownerAlpha, {
        warehouseId: "wh-north",
        documentNumber: "GI-POST-SANDAL-01",
        documentDate: "2026-10-15",
        lines: [
          {
            productId: p.id,
            quantity: 3,
            unit: "lusin",
          },
        ],
      });

      const st = repo.getGoodsInSerialsStatus(ownerAlpha, goodsInId);
      const lineId = st.lines[0].lineId;

      // 2. Daftarkan 3 SN (tiap SN mewakili 1 lusin = 12 pcs)
      repo.registerGoodsInSerials(ownerAlpha, {
        goodsInId,
        lineId,
        serialNumbers: ["SN-SDL-01", "SN-SDL-02", "SN-SDL-03"],
      });

      // Cek available serials query
      const availSerials = repo.getAvailableSerialsByProduct(ownerAlpha, p.id, "wh-north");
      assert.equal(availSerials.length, 3);
      assert.equal(availSerials[0].unit, "lusin");
      assert.equal(availSerials[0].baseQuantity, 12);

      // 3. Buat Goods Out Pending dengan memilih 1 SN ("SN-SDL-01")
      // 1 SN mewakili 1 lusin, sehingga kuantitas dasar yang direservasi harus 12 pcs!
      const { goodsOutId } = repo.createGoodsOutPendingTransaction(ownerAlpha, {
        warehouseId: "wh-north",
        documentNumber: "GO-SANDAL-OUT-01",
        documentDate: "2026-10-15",
        lines: [
          {
            productId: p.id,
            quantity: 1, // 1 unit operasional
            unit: "lusin",
            serials: ["SN-SDL-01"],
          },
        ],
      });

      // Cek saldo: Saldo fisik tetap 36 pcs, reservedStock harus 12 pcs, availableStock = 24 pcs!
      const balAfterGoPending = repo.calculateStockBalance(ownerAlpha.ownerId, "wh-north", p.id);
      assert.equal(balAfterGoPending.physicalStock, 36);
      assert.equal(balAfterGoPending.reservedStock, 12, "Reservasi 1 SN lusin harus menahan 12 pcs dasar");
      assert.equal(balAfterGoPending.availableStock, 24, "Sisa tersedia harus 36 - 12 = 24 pcs");

      // 4. Selesaikan Goods Out
      repo.completeGoodsOutTransaction(ownerAlpha, goodsOutId);

      // Saldo akhir setelah penyelesaian: fisik berkurang 12 pcs (menjadi 24 pcs), reservasi lepas (0)
      const balFinal = repo.calculateStockBalance(ownerAlpha.ownerId, "wh-north", p.id);
      assert.equal(balFinal.physicalStock, 24, "Penyelesaian 1 SN lusin memotong tepat 12 pcs fisik dasar");
      assert.equal(balFinal.reservedStock, 0);
      assert.equal(balFinal.availableStock, 24);
    });
  });

  describe("Modul 5: Pengujian Isolasi Gudang Wajib (Skenario A - F)", () => {
    // Skenario A — Nama dan SKU sama di 2 gudang milik owner yang sama
    test("5.1 Skenario A: Nama & SKU sama di WH-A01 dan WH-A02 (Owner yang sama) -> Stok hanya berubah di WH-A01", () => {
      // Buat gudang kedua WH-A02 untuk ownerAlpha
      client.prepare(`
        INSERT INTO warehouses (id, owner_id, code, name, address, status, created_at, updated_at)
        VALUES ('wh-alpha-02', 'owner-alpha', 'WH-A02', 'Gudang Satelit Cakung', 'Jl. Cakung Barat', 'ACTIVE', '2026-10-15T00:00:00Z', '2026-10-15T00:00:00Z')
        ON CONFLICT(id) DO NOTHING
      `).run();

      // Buat produk dengan nama dan SKU sama ("LGB-SKENARIO-A", "Hoga Baby Legging") di wh-north dan wh-alpha-02
      const prodWh1 = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-north",
        name: "Hoga Baby Legging",
        sku: "LGB-SKENARIO-A",
        category: "Pakaian",
        trackingMode: "NON_SERIAL",
        unit: "pcs",
        minStock: 5,
      });

      const prodWh2 = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-alpha-02",
        name: "Hoga Baby Legging",
        sku: "LGB-SKENARIO-A", // SKU sama di gudang berbeda
        category: "Pakaian",
        trackingMode: "NON_SERIAL",
        unit: "pcs",
        minStock: 5,
      });

      // Goods In hanya dilakukan untuk WH-A01 (wh-north)
      repo.postGoodsInTransaction(ownerAlpha, {
        warehouseId: "wh-north",
        documentNumber: "GI-SKEN-A-01",
        documentDate: "2026-10-15",
        lines: [
          {
            productId: prodWh1.id,
            quantity: 25,
            unit: "pcs",
          },
        ],
      });

      // Verifikasi stok:
      const bal1 = repo.calculateStockBalance(ownerAlpha.ownerId, "wh-north", prodWh1.id);
      const bal2 = repo.calculateStockBalance(ownerAlpha.ownerId, "wh-alpha-02", prodWh2.id);

      assert.equal(bal1.physicalStock, 25, "Stok wh-north harus bertambah 25");
      assert.equal(bal2.physicalStock, 0, "Stok wh-alpha-02 harus tetap 0!");
    });

    // Skenario B — Nama gudang sama, ID berbeda
    test("5.2 Skenario B: Nama gudang sama ('Gudang Utama'), ID berbeda -> Transaksi terikat ke ID gudang yang sah", () => {
      // Buat gudang dengan nama sama 'Gudang Utama Cakung' tapi ID berbeda 'wh-alpha-same-name'
      client.prepare(`
        INSERT INTO warehouses (id, owner_id, code, name, address, status, created_at, updated_at)
        VALUES ('wh-alpha-same-name', 'owner-alpha', 'WH-SAME', 'Gudang Utama Cakung', 'Jl. Cakung Timur', 'ACTIVE', '2026-10-15T00:00:00Z', '2026-10-15T00:00:00Z')
        ON CONFLICT(id) DO NOTHING
      `).run();

      const p1 = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-north",
        name: "Produk Skenario B",
        sku: "SKU-SKEN-B",
        category: "General",
        trackingMode: "NON_SERIAL",
        unit: "pcs",
        minStock: 0,
      });

      const p2 = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-alpha-same-name",
        name: "Produk Skenario B",
        sku: "SKU-SKEN-B",
        category: "General",
        trackingMode: "NON_SERIAL",
        unit: "pcs",
        minStock: 0,
      });

      // Goods In ditujukan untuk 'wh-north'
      repo.postGoodsInTransaction(ownerAlpha, {
        warehouseId: "wh-north",
        documentNumber: "GI-SKEN-B-01",
        documentDate: "2026-10-15",
        lines: [
          {
            productId: p1.id,
            quantity: 40,
            unit: "pcs",
          },
        ],
      });

      const bal1 = repo.calculateStockBalance(ownerAlpha.ownerId, "wh-north", p1.id);
      const bal2 = repo.calculateStockBalance(ownerAlpha.ownerId, "wh-alpha-same-name", p2.id);

      assert.equal(bal1.physicalStock, 40, "wh-north harus menerima 40 pcs");
      assert.equal(bal2.physicalStock, 0, "wh-alpha-same-name tidak boleh berubah (tetap 0)");
    });

    // Skenario C — Owner berbeda
    test("5.3 Skenario C: Owner berbeda -> Percobaan membuat Goods In dengan gudang / produk milik Owner lain ditolak", () => {
      // Context owner Beta
      const contextBetaActive: ActiveSecurityContext = {
        ...ownerBeta,
        warehouseId: "wh-beta-01", // Gudang sah milik Beta
      };

      // Buat produk di Owner Beta
      const prodBeta = repo.createProduct(contextBetaActive, {
        warehouseId: "wh-beta-01",
        name: "Produk Beta Sah",
        sku: "BETA-01",
        category: "Retail",
        trackingMode: "NON_SERIAL",
        unit: "pcs",
        minStock: 0,
      });

      // Percobaan 1: Owner Alpha mencoba membuat Goods In ke gudang milik Owner Beta ("wh-beta-01")
      assert.throws(
        () => {
          repo.postGoodsInTransaction(ownerAlpha, {
            warehouseId: "wh-beta-01",
            documentNumber: "GI-HACK-01",
            documentDate: "2026-10-15",
            lines: [
              {
                productId: prodBeta.id,
                quantity: 10,
                unit: "pcs",
              },
            ],
          });
        },
        (err: unknown) => {
          assert(err instanceof AppError);
          assert.equal(err.code, "ERR_FORBIDDEN_WAREHOUSE");
          return true;
        },
        "Owner Alpha harus ditolak mengakses gudang milik Owner Beta"
      );

      // Percobaan 2: Owner Alpha mencoba memasukkan produk milik Owner Beta ke gudangnya sendiri
      assert.throws(
        () => {
          repo.postGoodsInTransaction(ownerAlpha, {
            warehouseId: "wh-north",
            documentNumber: "GI-HACK-02",
            documentDate: "2026-10-15",
            lines: [
              {
                productId: prodBeta.id,
                quantity: 10,
                unit: "pcs",
              },
            ],
          });
        },
        (err: unknown) => {
          assert(err instanceof AppError);
          assert.equal(err.code, "ERR_NOT_FOUND");
          return true;
        },
        "Owner Alpha harus ditolak memakai produk milik Owner Beta"
      );
    });

    // Skenario D — Keunikan SN, Status, & Cross-Warehouse Guard
    test("5.4 Skenario D: SN duplikat dalam dokumen ditolak, dan SN aktif di gudang lain dalam satu owner ditolak", () => {
      const serialProdWhNorth = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-north",
        name: "Mesin Scanner Alpha",
        sku: "SCN-SER-D1",
        category: "Elektronik",
        trackingMode: "SERIAL",
        unit: "pcs",
        minStock: 0,
      });

      const serialProdWhSouth = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-south",
        name: "Mesin Scanner Alpha",
        sku: "SCN-SER-D2",
        category: "Elektronik",
        trackingMode: "SERIAL",
        unit: "pcs",
        minStock: 0,
      });

      // 1. SN duplikat dalam dokumen yang sama
      assert.throws(
        () => {
          repo.postGoodsInTransaction(ownerAlpha, {
            warehouseId: "wh-north",
            documentNumber: "GI-DUP-SN-01",
            documentDate: "2026-10-15",
            lines: [
              {
                productId: serialProdWhNorth.id,
                quantity: 2,
                unit: "pcs",
                serials: ["SN-DUP-SAME", "SN-DUP-SAME"],
              },
            ],
          });
        },
        (err: unknown) => {
          assert(err instanceof Error);
          return true;
        }
      );

      // 2. Daftarkan SN di wh-north
      repo.postGoodsInTransaction(ownerAlpha, {
        warehouseId: "wh-north",
        documentNumber: "GI-SN-VALID-01",
        documentDate: "2026-10-15",
        lines: [
          {
            productId: serialProdWhNorth.id,
            quantity: 1,
            unit: "pcs",
            serials: ["SN-ALPHA-ACTIVE-99"],
          },
        ],
      });

      // 3. Coba daftarkan kembali SN yang sama di wh-south (Cross-Warehouse Serial Guard)
      assert.throws(
        () => {
          repo.postGoodsInTransaction(ownerAlpha, {
            warehouseId: "wh-south",
            documentNumber: "GI-CROSS-SN-01",
            documentDate: "2026-10-15",
            lines: [
              {
                productId: serialProdWhSouth.id,
                quantity: 1,
                unit: "pcs",
                serials: ["SN-ALPHA-ACTIVE-99"],
              },
            ],
          });
        },
        (err: unknown) => {
          assert(err instanceof AppError);
          assert.equal(err.code, "ERR_CONFLICT");
          assert(err.message.includes("sedang aktif") || err.message.includes("Konflik SN Lintas Gudang"));
          return true;
        }
      );
    });

    // Skenario E — Transaksi Bersamaan & Anti-Double-Post
    test("5.5 Skenario E: Transaksi atomic dan pencegahan double-post pada dokumen yang sama", () => {
      const p = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-north",
        name: "Item Concurrency Test",
        sku: "CONC-001",
        category: "General",
        trackingMode: "NON_SERIAL",
        unit: "pcs",
        minStock: 0,
      });

      const { goodsInId } = repo.createGoodsInPendingTransaction(ownerAlpha, {
        warehouseId: "wh-north",
        documentNumber: "GI-CONC-01",
        documentDate: "2026-10-15",
        lines: [
          {
            productId: p.id,
            quantity: 10,
            unit: "pcs",
          },
        ],
      });

      // Posting pertama: Berhasil
      repo.postPendingGoodsInTransaction(ownerAlpha, goodsInId);
      const balAfterFirst = repo.calculateStockBalance(ownerAlpha.ownerId, "wh-north", p.id);
      assert.equal(balAfterFirst.physicalStock, 10);

      // Percobaan posting kedua (misal retry dari network/browser bersamaan): Harus ditolak
      assert.throws(
        () => {
          repo.postPendingGoodsInTransaction(ownerAlpha, goodsInId);
        },
        (err: unknown) => {
          assert(err instanceof AppError);
          assert.equal(err.code, "ERR_CONFLICT");
          return true;
        }
      );

      // Saldo fisik tetap 10, tidak pernah bertambah menjadi 20
      const balAfterSecond = repo.calculateStockBalance(ownerAlpha.ownerId, "wh-north", p.id);
      assert.equal(balAfterSecond.physicalStock, 10, "Stok tidak boleh terduplikasi akibat double post");
    });

    // Skenario F — Multi-unit & registrasi SN operasional konsisten dengan Goods Out
    test("5.6 Skenario F: Produk multi-baris multi-satuan & representasi 1 SN per unit operasional", () => {
      const p = repo.createProduct(ownerAlpha, {
        warehouseId: "wh-north",
        name: "Kemeja Formal Multi-Satuan",
        sku: "KMF-SKEN-F",
        category: "Fashion",
        trackingMode: "SERIAL",
        unit: "pcs",
        minStock: 0,
      });

      // Goods In: 2 lusin (24 pcs) dan 3 pcs. Total = 27 pcs dasar.
      // Serial numbers: 2 SN untuk baris lusin (masing-masing SN mewakili 1 lusin), dan 3 SN untuk baris pcs
      const { goodsInId } = repo.createGoodsInPendingTransaction(ownerAlpha, {
        warehouseId: "wh-north",
        documentNumber: "GI-MULTI-UNIT-F",
        documentDate: "2026-10-15",
        lines: [
          {
            productId: p.id,
            quantity: 2,
            unit: "lusin", // 2 unit operasional = 24 pcs
          },
          {
            productId: p.id,
            quantity: 3,
            unit: "pcs", // 3 unit operasional = 3 pcs
          },
        ],
      });

      repo.postPendingGoodsInTransaction(ownerAlpha, goodsInId);

      // Saldo dasar total harus bertambah 27 pcs
      const balPost = repo.calculateStockBalance(ownerAlpha.ownerId, "wh-north", p.id);
      assert.equal(balPost.physicalStock, 27);

      const status = repo.getGoodsInSerialsStatus(ownerAlpha, goodsInId);
      assert.equal(status.lines.length, 2);

      const lineLusin = status.lines.find((l) => l.unit === "lusin")!;
      const linePcs = status.lines.find((l) => l.unit === "pcs")!;

      assert.equal(lineLusin.requiredUnits, 2, "2 lusin membutuhkan tepat 2 SN operasional");
      assert.equal(linePcs.requiredUnits, 3, "3 pcs membutuhkan tepat 3 SN operasional");

      // Daftarkan 2 SN lusin
      repo.registerGoodsInSerials(ownerAlpha, {
        goodsInId,
        lineId: lineLusin.lineId,
        serialNumbers: ["SN-LSN-01", "SN-LSN-02"],
      });

      // Daftarkan 3 SN pcs
      repo.registerGoodsInSerials(ownerAlpha, {
        goodsInId,
        lineId: linePcs.lineId,
        serialNumbers: ["SN-PCS-01", "SN-PCS-02", "SN-PCS-03"],
      });

      // Available serials check
      const avail = repo.getAvailableSerialsByProduct(ownerAlpha, p.id, "wh-north");
      assert.equal(avail.length, 5);

      const snLusin = avail.find((s) => s.serialNumber === "SN-LSN-01")!;
      assert.equal(snLusin.unit, "lusin");
      assert.equal(snLusin.baseQuantity, 12);

      // Goods Out 1 lusin memakai SN-LSN-01
      const { goodsOutId } = repo.createGoodsOutPendingTransaction(ownerAlpha, {
        warehouseId: "wh-north",
        documentNumber: "GO-OUT-LUSIN-01",
        documentDate: "2026-10-15",
        lines: [
          {
            productId: p.id,
            quantity: 1,
            unit: "lusin",
            serials: ["SN-LSN-01"],
          },
        ],
      });

      // Saldo setelah GO Pending: Reserved 12 pcs, available 15 pcs, fisik 27 pcs
      const balGoPending = repo.calculateStockBalance(ownerAlpha.ownerId, "wh-north", p.id);
      assert.equal(balGoPending.physicalStock, 27);
      assert.equal(balGoPending.reservedStock, 12);
      assert.equal(balGoPending.availableStock, 15);

      // Selesaikan GO
      repo.completeGoodsOutTransaction(ownerAlpha, goodsOutId);
      const balGoDone = repo.calculateStockBalance(ownerAlpha.ownerId, "wh-north", p.id);
      assert.equal(balGoDone.physicalStock, 15);
      assert.equal(balGoDone.reservedStock, 0);
      assert.equal(balGoDone.availableStock, 15);
    });
  });
});

