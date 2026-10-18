/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Test Suite: Tahap B.1 — Audit Hasil Implementasi dan Verifikasi Gap Integrasi
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "../src/lib/db/migrator.ts";
import { seedSyntheticData } from "../src/lib/db/seed.ts";
import { InventoryRepository } from "../src/lib/db/repositories/inventory-repository.ts";
import {
  hashPassword,
  verifyPassword,
  createLocalSession,
  resolveSecurityContextFromSession,
  destroyLocalSession,
} from "../src/lib/auth/local-auth-service.ts";
import type { DatabaseClient } from "../src/lib/db/sqlite-client.ts";
import type { ActiveSecurityContext } from "../src/lib/types/auth.ts";

const TEST_DB_PATH = path.resolve(process.cwd(), "data", "test-audit-b1.db");

describe("Tahap B.1: Audit Hasil Implementasi & Penyelesaian Gap Integrasi", () => {
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

  const ownerBetaContext: ActiveSecurityContext = {
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

  before(() => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(`${TEST_DB_PATH}-wal`)) fs.unlinkSync(`${TEST_DB_PATH}-wal`);
    if (fs.existsSync(`${TEST_DB_PATH}-shm`)) fs.unlinkSync(`${TEST_DB_PATH}-shm`);

    nativeDb = new DatabaseSync(TEST_DB_PATH);
    nativeDb.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");

    client = {
      prepare: (sql: string) => nativeDb.prepare(sql),
      exec: (sql: string) => nativeDb.exec(sql),
      close: () => nativeDb.close(),
      transaction: <T>(fn: () => T): T => {
        nativeDb.exec("BEGIN IMMEDIATE");
        try {
          const res = fn();
          nativeDb.exec("COMMIT");
          return res;
        } catch (e) {
          nativeDb.exec("ROLLBACK");
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
      client.close();
      if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
      if (fs.existsSync(`${TEST_DB_PATH}-wal`)) fs.unlinkSync(`${TEST_DB_PATH}-wal`);
      if (fs.existsSync(`${TEST_DB_PATH}-shm`)) fs.unlinkSync(`${TEST_DB_PATH}-shm`);
    } catch {
      // Ignore
    }
  });

  // =========================================================================
  // 1. Verifikasi Database SQLite & Persistensi
  // =========================================================================
  test("1. Verifikasi Persistensi Database SQLite setelah Reopen", () => {
    // Tambah produk uji coba
    const newProd = repo.createProduct(ownerAlphaContext, {
      warehouseId: "wh-north",
      sku: "TEST-PERSIST-01",
      name: "Produk Uji Persistensi Disk",
      category: "Hardware",
      trackingMode: "NON_SERIAL",
      unit: "unit",
      minStock: 2,
    });

    assert.ok(newProd.id);

    // Buka koneksi baru seolah server direstart
    const newDbConnection = new DatabaseSync(TEST_DB_PATH);
    const row = newDbConnection.prepare("SELECT sku, name FROM products WHERE id = ?").get(newProd.id) as { sku: string; name: string };
    newDbConnection.close();

    assert.equal(row.sku, "TEST-PERSIST-01");
    assert.equal(row.name, "Produk Uji Persistensi Disk");
  });

  // =========================================================================
  // 2. Audit Autentikasi, Session Expiry & Otorisasi Server
  // =========================================================================
  test("2. Autentikasi: Password scrypt, pembuatan sesi, dan kedaluwarsa sesi", () => {
    const userRow = client.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get("owner_alpha@docuflow.id") as { id: string; email: string; password_hash: string };
    assert.ok(userRow);
    assert.equal(verifyPassword("Docuflow123!", userRow.password_hash), true);
    assert.equal(verifyPassword("SalahPassword", userRow.password_hash), false);

    // Buat sesi
    const { sessionId } = createLocalSession(client, userRow.id, "owner-alpha", "wh-north");
    assert.ok(sessionId);

    // Resolve context dari sesi aktif
    const resolved = resolveSecurityContextFromSession(client, sessionId);
    assert.ok(resolved);
    assert.equal(resolved?.userId, userRow.id);
    assert.equal(resolved?.ownerId, "owner-alpha");

    // Simulasi kedaluwarsa sesi
    client.prepare("UPDATE auth_sessions SET expires_at = ? WHERE id = ?").run(
      new Date(Date.now() - 1000).toISOString(),
      sessionId
    );
    const expiredResolved = resolveSecurityContextFromSession(client, sessionId);
    assert.equal(expiredResolved, null, "Sesi kedaluwarsa harus ditolak di server");

    // Uji logout / destroyLocalSession
    const { sessionId: newToken } = createLocalSession(client, userRow.id, "owner-alpha", "wh-north");
    destroyLocalSession(client, newToken);
    const destroyedResolved = resolveSecurityContextFromSession(client, newToken);
    assert.equal(destroyedResolved, null, "Sesi yang telah di-logout harus hilang");
  });

  test("3. Otorisasi Server: Penolakan manipulasi gudang oleh Staff", () => {
    // Staff Alpha ditugaskan di wh-north, dilarang mengakses wh-south
    assert.throws(
      () => {
        repo.getProductsByOwner(staffAlphaContext, "wh-south");
      },
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, "ERR_FORBIDDEN_WAREHOUSE");
        return true;
      }
    );
  });

  test("4. Otorisasi Server: Penolakan isolasi lintas Owner", () => {
    // Owner Beta tidak boleh melihat produk milik Owner Alpha
    const betaProducts = repo.getProductsByOwner(ownerBetaContext);
    for (const p of betaProducts) {
      assert.equal(p.ownerId, "owner-beta");
      assert.notEqual(p.ownerId, "owner-alpha");
    }
  });

  // =========================================================================
  // 3. Audit Integrasi Inventory & Konsistensi Data
  // =========================================================================
  test("5. Goods In: Menulis entri ledger positif dan menambah saldo fisik riil", () => {
    const initialBal = repo.calculateStockBalance("owner-alpha", "wh-north", "prod-cbl-01");

    repo.postGoodsInTransaction(ownerAlphaContext, {
      warehouseId: "wh-north",
      documentNumber: "GI-TEST-001",
      documentDate: "2026-10-15",
      note: "Barang masuk tes integrasi",
      lines: [
        {
          productId: "prod-cbl-01",
          quantity: 20,
          unit: "roll",
        },
      ],
    });

    const updatedBal = repo.calculateStockBalance("owner-alpha", "wh-north", "prod-cbl-01");
    assert.equal(updatedBal.physicalStock, initialBal.physicalStock + 20);
    assert.equal(updatedBal.availableStock, initialBal.availableStock + 20);
  });

  test("6. Goods Out Pending: Mereservasi stok tanpa memotong saldo fisik", () => {
    const beforeBal = repo.calculateStockBalance("owner-alpha", "wh-north", "prod-cbl-01");

    const goResult = repo.createGoodsOutPendingTransaction(ownerAlphaContext, {
      warehouseId: "wh-north",
      documentNumber: "GO-TEST-PENDING-001",
      documentDate: "2026-10-15",
      note: "Reservasi tes integrasi",
      lines: [
        {
          productId: "prod-cbl-01",
          quantity: 10,
          unit: "roll",
        },
      ],
    });

    assert.ok(goResult.goodsOutId);

    const duringBal = repo.calculateStockBalance("owner-alpha", "wh-north", "prod-cbl-01");
    assert.equal(duringBal.physicalStock, beforeBal.physicalStock, "Saldo fisik dilarang berkurang saat PENDING");
    assert.equal(duringBal.reservedStock, beforeBal.reservedStock + 10, "Reservasi stok harus bertambah");
    assert.equal(duringBal.availableStock, beforeBal.availableStock - 10, "Stok tersedia harus berkurang");

    // Selesaikan (Complete) pengeluaran
    repo.completeGoodsOutTransaction(ownerAlphaContext, goResult.goodsOutId);

    const afterBal = repo.calculateStockBalance("owner-alpha", "wh-north", "prod-cbl-01");
    assert.equal(afterBal.physicalStock, beforeBal.physicalStock - 10, "Saldo fisik harus terpotong setelah COMPLETE");
    assert.equal(afterBal.reservedStock, beforeBal.reservedStock, "Reservasi harus dilepaskan");
  });

  test("7. Pencegahan Oversell: Menolak reservasi melebihi stok tersedia", () => {
    assert.throws(
      () => {
        repo.createGoodsOutPendingTransaction(ownerAlphaContext, {
          warehouseId: "wh-north",
          documentNumber: "GO-OVERSELL-TEST",
          documentDate: "2026-10-15",
          lines: [
            {
              productId: "prod-cbl-01",
              quantity: 999999, // Melebihi stok yang ada
            },
          ],
        });
      },
      (err: unknown) => {
        const e = err as { code?: string; message?: string };
        assert.equal(e.code, "ERR_CONFLICT");
        assert.match(e.message ?? "", /Stok tidak mencukupi/);
        return true;
      }
    );
  });

  test("8. Soft-Delete Tombstone: Membatalkan Goods Out melepas reservasi tanpa hard delete", () => {
    const beforeBal = repo.calculateStockBalance("owner-alpha", "wh-north", "prod-cbl-01");

    const goResult = repo.createGoodsOutPendingTransaction(ownerAlphaContext, {
      warehouseId: "wh-north",
      documentNumber: "GO-CANCEL-TEST",
      documentDate: "2026-10-15",
      lines: [
        {
          productId: "prod-cbl-01",
          quantity: 5,
        },
      ],
    });

    // Batalkan
    const cancelRes = repo.softDeleteGoodsOutTransaction(
      ownerAlphaContext,
      goResult.goodsOutId,
      "Pesanan dibatalkan oleh pembeli"
    );

    assert.equal(cancelRes.cancelled, true);

    // Pastikan record tetap ada di DB (tidak di-hard-delete)
    const tombstone = client.prepare("SELECT status, cancellation_reason FROM goods_out WHERE id = ?").get(goResult.goodsOutId) as { status: string; cancellation_reason: string };
    assert.equal(tombstone.status, "CANCELLED_TOMBSTONE");
    assert.equal(tombstone.cancellation_reason, "Pesanan dibatalkan oleh pembeli");

    // Saldo tersedia harus pulih kembali
    const restoredBal = repo.calculateStockBalance("owner-alpha", "wh-north", "prod-cbl-01");
    assert.equal(restoredBal.availableStock, beforeBal.availableStock);
  });

  test("9. Master Customers & Suppliers: Persistensi dan Pencatatan Audit Log", () => {
    const cust = repo.createCustomer(ownerAlphaContext, {
      code: "CUST-AUDIT-01",
      name: "PT Audit Integrasi Sejahtera",
      email: "audit@sejahtera.co.id",
      phone: "021-998877",
    });
    assert.ok(cust.id);

    const sup = repo.createSupplier(ownerAlphaContext, {
      code: "SUP-AUDIT-01",
      name: "CV Mitra Pasok Utama",
      email: "pasok@mitra.com",
    });
    assert.ok(sup.id);

    // Ambil log audit
    const logs = repo.getAuditLogs(ownerAlphaContext, 10);
    const hasCustAudit = logs.some((l) => l.action === "CREATE_CUSTOMER" && l.targetId === cust.id);
    const hasSupAudit = logs.some((l) => l.action === "CREATE_SUPPLIER" && l.targetId === sup.id);

    assert.ok(hasCustAudit, "Log audit harus mencatat pembuatan customer");
    assert.ok(hasSupAudit, "Log audit harus mencatat pembuatan supplier");
  });

  test("10. Dashboard Summary: Menghitung KPI riil dari SQLite", () => {
    const summary = repo.getDashboardSummary(ownerAlphaContext, "wh-north");
    assert.ok(summary.totalProducts >= 2);
    assert.ok(summary.totalStockCount > 0);
  });
});
