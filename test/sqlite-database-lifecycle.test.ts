/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * SQLite Database Lifecycle & Real Auth / Multi-Tenant Isolation Test Suite
 * Menguji secara fisik pada SQLite engine:
 * 1. DDL Migrations & Foreign Key enforcement.
 * 2. Idempotensi Seed Sintetis.
 * 3. Autentikasi Server, Password Hashing (scrypt), & Session Lifecycle.
 * 4. Isolasi ketat 2 Owner (Alpha vs Beta).
 * 5. Pembatasan akses Warehouse untuk Staff.
 * 6. Guard Serial Number aktif lintas gudang dalam satu Owner.
 * 7. Transaksi Goods In -> Immutable Ledger.
 * 8. Transaksi Goods Out Pending -> Reservasi tanpa potong fisik & Oversell Protection.
 * 9. Transaksi Goods Out Completion -> Pemotongan fisik atomik di Ledger.
 * 10. Transaksi Goods Out Soft-Delete Tombstone (TIDAK ADA HARD DELETE).
 */

import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { runMigrations } from '../src/lib/db/migrator.ts';
import { seedSyntheticData } from '../src/lib/db/seed.ts';
import {
  hashPassword,
  verifyPassword,
  createLocalSession,
  resolveSecurityContextFromSession,
  destroyLocalSession,
} from '../src/lib/auth/local-auth-service.ts';
import { InventoryRepository } from '../src/lib/db/repositories/inventory-repository.ts';
import type { DatabaseClient } from '../src/lib/db/sqlite-client.ts';
import type { ActiveSecurityContext } from '../src/lib/types/auth.ts';

describe('SQLite Database Lifecycle & Multi-Tenant Enforcement', () => {
  let db: DatabaseClient;
  let repo: InventoryRepository;

  before(() => {
    // Inisialisasi database SQLite in-memory untuk pengujian fisik terisolasi
    const nativeDb = new DatabaseSync(':memory:');
    nativeDb.exec('PRAGMA foreign_keys = ON;');
    nativeDb.exec('PRAGMA journal_mode = WAL;');

    db = {
      prepare: (sql: string) => nativeDb.prepare(sql),
      exec: (sql: string) => nativeDb.exec(sql),
      close: () => nativeDb.close(),
      transaction: <T>(fn: () => T): T => {
        nativeDb.exec('BEGIN IMMEDIATE');
        try {
          const res = fn();
          nativeDb.exec('COMMIT');
          return res;
        } catch (e) {
          nativeDb.exec('ROLLBACK');
          throw e;
        }
      },
    };

    repo = new InventoryRepository(db);
  });

  test('1. DDL Migrations: Seluruh tabel terbuat dan Foreign Keys aktif', () => {
    const executedMigrations = runMigrations(db);
    assert.ok(executedMigrations.applied.length > 0, 'Migrasi awal harus dieksekusi');

    // Verifikasi Foreign Keys
    const fkRow = db.prepare('PRAGMA foreign_keys;').get() as { foreign_keys: number };
    assert.equal(fkRow.foreign_keys, 1, 'PRAGMA foreign_keys harus bernilai 1');

    // Verifikasi tabel inti
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    `).all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    assert.ok(tableNames.includes('users'));
    assert.ok(tableNames.includes('auth_sessions'));
    assert.ok(tableNames.includes('owners'));
    assert.ok(tableNames.includes('warehouses'));
    assert.ok(tableNames.includes('products'));
    assert.ok(tableNames.includes('product_serials'));
    assert.ok(tableNames.includes('inventory_ledger'));
    assert.ok(tableNames.includes('reservations'));
    assert.ok(tableNames.includes('goods_in'));
    assert.ok(tableNames.includes('goods_out'));
    assert.ok(tableNames.includes('audit_logs'));
  });

  test('2. Foreign Key Enforcement: Insert produk dengan owner_id invalid harus ditolak database', () => {
    assert.throws(() => {
      db.prepare(`
        INSERT INTO products (
          id, owner_id, warehouse_id, sku, name, category, tracking_mode, unit, min_stock, status, created_at, updated_at
        ) VALUES ('prod-dummy', 'owner-tidak-ada', 'wh-tidak-ada', 'SKU-001', 'Test', 'Umum', 'NON_SERIAL', 'pcs', 0, 'ACTIVE', '2026-01-01', '2026-01-01')
      `).run();
    }, /FOREIGN KEY constraint failed/i);
  });

  test('3. Seed Sintetis Idempotent: Dijalankan 2 kali tidak menghasilkan konflik duplikasi', () => {
    // Seed pertama
    const seedResult1 = seedSyntheticData(db);
    assert.ok(seedResult1.users > 0);
    assert.ok(seedResult1.owners === 3);

    // Seed kedua (harus berhasil tanpa error)
    const seedResult2 = seedSyntheticData(db);
    assert.ok(seedResult2.users > 0);

    // Verifikasi jumlah Owner tetap 3 (1 internal super admin + 2 client owners)
    const owners = db.prepare('SELECT COUNT(*) as count FROM owners').get() as { count: number };
    assert.equal(owners.count, 3, 'Harus tetap ada tepat 3 Owner sintetis');
  });

  test('4. Password Hashing & Local Auth Session Lifecycle', () => {
    const rawPass = 'RahasiaSuper2026!';
    const hash = hashPassword(rawPass);
    assert.ok(hash.includes(':'), 'Hash harus memuat salt dan derived key');
    assert.equal(verifyPassword(rawPass, hash), true, 'Password valid harus lolos verifikasi');
    assert.equal(verifyPassword('SalahPassword', hash), false, 'Password salah harus ditolak');

    // Ambil user Alpha
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get('owner_alpha@docuflow.id') as {
      id: string;
      email: string;
    };
    assert.ok(user);

    // Buat session
    const { sessionId } = createLocalSession(db, user.id, 'owner-alpha', 'wh-north');
    assert.ok(sessionId);

    // Resolusi Security Context dari session
    const context = resolveSecurityContextFromSession(db, sessionId);
    assert.ok(context);
    assert.equal(context.userId, user.id);
    assert.equal(context.ownerId, 'owner-alpha');
    assert.equal(context.role, 'OWNER');
    assert.equal(context.warehouseId, 'wh-north');

    // Logout & Destroy Session
    destroyLocalSession(db, sessionId);
    const contextAfterLogout = resolveSecurityContextFromSession(db, sessionId);
    assert.equal(contextAfterLogout, null, 'Sesi yang sudah di-destroy harus mengembalikan null');
  });

  test('5. Isolasi Ketat Dua Owner: Owner Alpha vs Owner Beta', () => {
    // Context Owner Alpha
    const alphaContext: ActiveSecurityContext = {
      userId: 'usr-owner-alpha',
      email: 'owner_alpha@docuflow.id',
      ownerId: 'owner-alpha',
      ownerName: 'Alpha Logistics Indonesia',
      role: 'OWNER',
      warehouseId: 'wh-north',
      warehouseName: 'Gudang Utama Cakung',
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    // Context Owner Beta
    const betaContext: ActiveSecurityContext = {
      userId: 'usr-owner-beta',
      email: 'owner_beta@docuflow.id',
      ownerId: 'owner-beta',
      ownerName: 'Beta Retail Nusantara',
      role: 'OWNER',
      warehouseId: 'wh-beta-01',
      warehouseName: 'Gudang Surabaya',
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    const alphaProducts = repo.getProductsByOwner(alphaContext);
    const betaProducts = repo.getProductsByOwner(betaContext);

    assert.ok(alphaProducts.length > 0, 'Owner Alpha harus memiliki produk');
    assert.ok(betaProducts.length > 0, 'Owner Beta harus memiliki produk');

    // Verifikasi kebocoran data: Tidak boleh ada produk Alpha di Beta atau sebaliknya
    for (const p of alphaProducts) {
      assert.equal(p.ownerId, 'owner-alpha');
      assert.notEqual(p.ownerId, 'owner-beta');
      assert.notEqual(p.id, 'prod-beta-01');
    }

    for (const p of betaProducts) {
      assert.equal(p.ownerId, 'owner-beta');
      assert.notEqual(p.ownerId, 'owner-alpha');
      assert.equal(p.id, 'prod-beta-01');
    }
  });

  test('6. Pembatasan Hak Akses Gudang untuk Staff', () => {
    // Staff Alpha hanya ditugaskan pada wh-north
    const staffAlphaContext: ActiveSecurityContext = {
      userId: 'usr-staff-alpha',
      email: 'staff_alpha@docuflow.id',
      ownerId: 'owner-alpha',
      ownerName: 'Alpha Logistics Indonesia',
      role: 'STAFF',
      warehouseId: 'wh-north',
      warehouseName: 'Gudang Utama Cakung',
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    // Mencoba akses ke wh-south (gudang yang tidak ditugaskan) harus ditolak
    assert.throws(() => {
      repo.getProductsByOwner(staffAlphaContext, 'wh-south');
    }, (err: unknown) => (err as { code?: string }).code === 'ERR_FORBIDDEN_WAREHOUSE');

    // Akses ke wh-north (gudang yang sah) harus berhasil
    const validWhProducts = repo.getProductsByOwner(staffAlphaContext, 'wh-north');
    assert.ok(Array.isArray(validWhProducts));
  });

  test('7. Guard Serial Number Aktif Lintas Gudang dalam Satu Owner', () => {
    const alphaContext: ActiveSecurityContext = {
      userId: 'usr-owner-alpha',
      email: 'owner_alpha@docuflow.id',
      ownerId: 'owner-alpha',
      ownerName: 'Alpha Logistics Indonesia',
      role: 'OWNER',
      warehouseId: 'wh-south', // Coba masukkan ke wh-south
      warehouseName: 'Transit Cikarang',
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    // Daftarkan produk serial baru di wh-south terlebih dahulu
    const newProd = repo.createProduct(alphaContext, {
      warehouseId: 'wh-south',
      sku: 'RTR-TEST-SOUTH',
      name: 'Router Test South',
      category: 'Jaringan',
      trackingMode: 'SERIAL',
    });

    // Coba posting Goods In di wh-south dengan SN-RTR-2026-0001 (yang sedang aktif di wh-north)
    assert.throws(() => {
      repo.postGoodsInTransaction(alphaContext, {
        warehouseId: 'wh-south',
        documentNumber: 'GI-ERR-CROSS-SN',
        documentDate: '2026-10-15',
        lines: [
          {
            productId: newProd.id,
            quantity: 1,
            serials: ['SN-RTR-2026-0001'], // SN SUDAH AKTIF DI wh-north!
          },
        ],
      });
    }, /Konflik SN Lintas Gudang/i);
  });

  test('8. Transaksi Goods In -> Immutable Ledger Saldo Bertambah', () => {
    const alphaContext: ActiveSecurityContext = {
      userId: 'usr-owner-alpha',
      email: 'owner_alpha@docuflow.id',
      ownerId: 'owner-alpha',
      ownerName: 'Alpha Logistics Indonesia',
      role: 'OWNER',
      warehouseId: 'wh-north',
      warehouseName: 'Gudang Utama Cakung',
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    // Buat produk non-serial untuk test mutasi
    const cableProd = repo.createProduct(alphaContext, {
      warehouseId: 'wh-north',
      sku: 'CBL-CAT6-TEST',
      name: 'Kabel UTP Cat6 Test',
      category: 'Aksesoris',
      trackingMode: 'NON_SERIAL',
      unit: 'meter',
    });

    const initialBalance = repo.calculateStockBalance(alphaContext.ownerId, 'wh-north', cableProd.id);
    assert.equal(initialBalance.physicalStock, 0);

    // Posting Goods In 50 meter
    const giRes = repo.postGoodsInTransaction(alphaContext, {
      warehouseId: 'wh-north',
      documentNumber: 'GI-TEST-001',
      documentDate: '2026-10-15',
      lines: [
        {
          productId: cableProd.id,
          quantity: 50,
          unit: 'meter',
        },
      ],
    });

    assert.ok(giRes.goodsInId);
    assert.equal(giRes.ledgerEntriesCount, 1);

    // Periksa saldo fisik terupdate di ledger
    const updatedBalance = repo.calculateStockBalance(alphaContext.ownerId, 'wh-north', cableProd.id);
    assert.equal(updatedBalance.physicalStock, 50);
    assert.equal(updatedBalance.availableStock, 50);
    assert.equal(updatedBalance.reservedStock, 0);
  });

  test('9. Goods Out Pending: Reservasi Stok Tanpa Potong Fisik & Oversell Protection', () => {
    const alphaContext: ActiveSecurityContext = {
      userId: 'usr-owner-alpha',
      email: 'owner_alpha@docuflow.id',
      ownerId: 'owner-alpha',
      ownerName: 'Alpha Logistics Indonesia',
      role: 'OWNER',
      warehouseId: 'wh-north',
      warehouseName: 'Gudang Utama Cakung',
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    // Ambil produk kabel
    const prods = repo.getProductsByOwner(alphaContext, 'wh-north');
    const cable = prods.find((p) => p.sku === 'CBL-CAT6-TEST')!;
    assert.ok(cable);

    // Oversell Protection: Stok tersedia 50, minta 60 harus ditolak
    assert.throws(() => {
      repo.createGoodsOutPendingTransaction(alphaContext, {
        warehouseId: 'wh-north',
        documentNumber: 'GO-OVERSELL',
        documentDate: '2026-10-15',
        lines: [{ productId: cable.id, quantity: 60 }],
      });
    }, (err: unknown) => (err as { code?: string }).code === 'ERR_CONFLICT');

    // Buat Goods Out Pending 20 meter (valid)
    const goPending = repo.createGoodsOutPendingTransaction(alphaContext, {
      warehouseId: 'wh-north',
      documentNumber: 'GO-PENDING-001',
      documentDate: '2026-10-15',
      lines: [{ productId: cable.id, quantity: 20 }],
    });

    assert.ok(goPending.goodsOutId);

    // INVARIANT V2.4.1: Saldo fisik TETAP 50, Saldo reservasi 20, Saldo tersedia 30!
    const balance = repo.calculateStockBalance(alphaContext.ownerId, 'wh-north', cable.id);
    assert.equal(balance.physicalStock, 50, 'Stok fisik TIDAK BOLEH berkurang saat Goods Out Pending');
    assert.equal(balance.reservedStock, 20, 'Stok reservasi harus bertambah 20');
    assert.equal(balance.availableStock, 30, 'Stok tersedia harus berkurang menjadi 30');
  });

  test('10. Goods Out Completion: Pemotongan Fisik Atomik di Ledger', () => {
    const alphaContext: ActiveSecurityContext = {
      userId: 'usr-owner-alpha',
      email: 'owner_alpha@docuflow.id',
      ownerId: 'owner-alpha',
      ownerName: 'Alpha Logistics Indonesia',
      role: 'OWNER',
      warehouseId: 'wh-north',
      warehouseName: 'Gudang Utama Cakung',
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    const goRow = db.prepare(`
      SELECT id FROM goods_out WHERE document_number = 'GO-PENDING-001'
    `).get() as { id: string };

    // Selesaikan Goods Out
    const compRes = repo.completeGoodsOutTransaction(alphaContext, goRow.id);
    assert.equal(compRes.completed, true);
    assert.equal(compRes.ledgerEntriesCount, 1);

    // INVARIANT: Saldo fisik sekarang berkurang menjadi 30, Reservasi lepas ke 0, Saldo tersedia 30!
    const prods = repo.getProductsByOwner(alphaContext, 'wh-north');
    const cable = prods.find((p) => p.sku === 'CBL-CAT6-TEST')!;

    const balance = repo.calculateStockBalance(alphaContext.ownerId, 'wh-north', cable.id);
    assert.equal(balance.physicalStock, 30, 'Stok fisik harus terpotong resmi');
    assert.equal(balance.reservedStock, 0, 'Reservasi harus telah dilepas');
    assert.equal(balance.availableStock, 30);
  });

  test('11. Goods Out Soft-Delete Tombstone: Pelepasan Reservasi Tanpa Hard-Delete', () => {
    const alphaContext: ActiveSecurityContext = {
      userId: 'usr-owner-alpha',
      email: 'owner_alpha@docuflow.id',
      ownerId: 'owner-alpha',
      ownerName: 'Alpha Logistics Indonesia',
      role: 'OWNER',
      warehouseId: 'wh-north',
      warehouseName: 'Gudang Utama Cakung',
      isSuperAdminOnBehalf: false,
      grantId: null,
    };

    const prods = repo.getProductsByOwner(alphaContext, 'wh-north');
    const cable = prods.find((p) => p.sku === 'CBL-CAT6-TEST')!;

    // 1. Buat Goods Out Pending 10 meter
    const goPending = repo.createGoodsOutPendingTransaction(alphaContext, {
      warehouseId: 'wh-north',
      documentNumber: 'GO-CANCEL-ME',
      documentDate: '2026-10-15',
      lines: [{ productId: cable.id, quantity: 10 }],
    });

    const balanceBeforeCancel = repo.calculateStockBalance(alphaContext.ownerId, 'wh-north', cable.id);
    assert.equal(balanceBeforeCancel.reservedStock, 10);
    assert.equal(balanceBeforeCancel.availableStock, 20);

    // 2. Soft delete tombstone pembatalan
    const tombstoneRes = repo.softDeleteGoodsOutTransaction(
      alphaContext,
      goPending.goodsOutId,
      'Pelanggan membatalkan pesanan secara lisan'
    );

    assert.equal(tombstoneRes.cancelled, true);

    // 3. Verifikasi record TIDAK DIHAPUS dari database (TIDAK ADA HARD DELETE)
    const cancelledRow = db.prepare(`
      SELECT status, cancellation_reason FROM goods_out WHERE id = ?
    `).get(goPending.goodsOutId) as { status: string; cancellation_reason: string };

    assert.equal(cancelledRow.status, 'CANCELLED_TOMBSTONE');
    assert.equal(cancelledRow.cancellation_reason, 'Pelanggan membatalkan pesanan secara lisan');

    // 4. Saldo reservasi kembali ke 0, available kembali ke 30
    const balanceAfterCancel = repo.calculateStockBalance(alphaContext.ownerId, 'wh-north', cable.id);
    assert.equal(balanceAfterCancel.reservedStock, 0);
    assert.equal(balanceAfterCancel.availableStock, 30);
  });
});
