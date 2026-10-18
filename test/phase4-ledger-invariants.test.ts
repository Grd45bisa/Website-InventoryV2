/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Fase 4 Test Suite: Ledger Invariants, Cross-Warehouse Serial Guard,
 * Reservation Dynamics, Soft-Delete Tombstone, & SO Reconciliation
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeSerialNumber,
  evaluateCrossWarehouseSerialGuard,
  reconstructStockBalance,
  createGoodsOutPendingReservation,
  executeGoodsOutSoftDeleteTombstone,
  reconcileStockOpnameItem,
} from '../src/lib/inventory/ledger-engine.ts';
import type {
  LedgerEntry,
  ReservationEntry,
  ActiveSerialRecord,
} from '../src/lib/types/inventory-domain.ts';

describe('Fase 4: Serial Normalization & Cross-Warehouse Guard (RPD §10.2 & DB-AUD-008)', () => {
  test('Normalisasi SN: harus konsisten trim, uppercase, dan konversi spasi menjadi tanda hubung', () => {
    assert.equal(normalizeSerialNumber('  sn-macbook-001  '), 'SN-MACBOOK-001');
    assert.equal(normalizeSerialNumber('wh1 sku1 20261014 0001'), 'WH1-SKU1-20261014-0001');
    assert.equal(normalizeSerialNumber('abc_def_123'), 'ABC_DEF_123');
    assert.equal(normalizeSerialNumber(''), '');
  });

  test('Guard SN: menolak pendaftaran SN aktif yang sama pada gudang berbeda dalam satu Owner', () => {
    const existingRegistry: ActiveSerialRecord[] = [
      {
        serialId: 'sn-01',
        serialNumberNormalized: 'SN-IPHONE-001',
        ownerId: 'owner_alpha',
        warehouseId: 'wh_main',
        productId: 'prod_01',
        status: 'AVAILABLE',
        registeredAt: '2026-10-14T10:00:00Z',
      },
      {
        serialId: 'sn-02',
        serialNumberNormalized: 'SN-IPHONE-002',
        ownerId: 'owner_alpha',
        warehouseId: 'wh_main',
        productId: 'prod_01',
        status: 'RESERVED',
        registeredAt: '2026-10-14T10:00:00Z',
      },
    ];

    // Coba daftarkan SN yang sama di gudang sekunder milik Owner Alpha
    const conflictResult = evaluateCrossWarehouseSerialGuard(existingRegistry, {
      ownerId: 'owner_alpha',
      warehouseId: 'wh_secondary',
      serialNumber: 'sn-iphone-001',
    });

    assert.equal(conflictResult.isAllowed, false);
    assert.ok(conflictResult.errorMessage?.includes('Konflik SN Lintas Gudang'));
    assert.equal(conflictResult.conflictingRecord?.warehouseId, 'wh_main');
  });

  test('Guard SN: mengizinkan pendaftaran SN yang sama pada Owner yang berbeda (Multi-Owner Tenant Isolation)', () => {
    const existingRegistry: ActiveSerialRecord[] = [
      {
        serialId: 'sn-01',
        serialNumberNormalized: 'SN-GENERIC-999',
        ownerId: 'owner_alpha',
        warehouseId: 'wh_alpha_1',
        productId: 'prod_01',
        status: 'AVAILABLE',
        registeredAt: '2026-10-14T10:00:00Z',
      },
    ];

    // Tenant Beta mendaftarkan SN yang sama di gudangnya sendiri
    const allowResult = evaluateCrossWarehouseSerialGuard(existingRegistry, {
      ownerId: 'owner_beta',
      warehouseId: 'wh_beta_1',
      serialNumber: 'SN-GENERIC-999',
    });

    assert.equal(allowResult.isAllowed, true);
    assert.equal(allowResult.conflictingRecord, undefined);
  });
});

describe('Fase 4: Ledger Projection & Reconstructable Balance (RPD §7.4 & AGENTS.md §1)', () => {
  test('Rekonstruksi saldo fisik murni dari ledger: tidak ada direct write saldo', () => {
    const mockLedger: LedgerEntry[] = [
      {
        id: 'led-01',
        sequenceNumber: 1,
        ownerId: 'owner_alpha',
        warehouseId: 'wh_main',
        productId: 'prod_macbook',
        locationId: 'loc_rack_a',
        entryType: 'GOODS_IN_POSTED',
        sourceDocType: 'GOODS_IN',
        sourceDocId: 'gin-001',
        sourceLineId: 'line-01',
        quantityDeltaBase: 50,
        actorUserId: 'user_staff_1',
        occurredAt: '2026-10-14T08:00:00Z',
      },
      {
        id: 'led-02',
        sequenceNumber: 2,
        ownerId: 'owner_alpha',
        warehouseId: 'wh_main',
        productId: 'prod_macbook',
        locationId: 'loc_rack_a',
        entryType: 'GOODS_OUT_COMPLETED',
        sourceDocType: 'GOODS_OUT',
        sourceDocId: 'gout-001',
        sourceLineId: 'line-01',
        quantityDeltaBase: -10,
        actorUserId: 'user_staff_1',
        occurredAt: '2026-10-14T09:00:00Z',
      },
    ];

    const balance = reconstructStockBalance(
      mockLedger,
      [],
      'owner_alpha',
      'wh_main',
      'prod_macbook'
    );

    assert.equal(balance.physicalStock, 40); // 50 - 10
    assert.equal(balance.reservedStock, 0);
    assert.equal(balance.availableStock, 40);
  });
});

describe('Fase 4: Goods Out Pending Reservation & Soft-Delete Tombstone (RPD §7.6 & DB-AUD-009)', () => {
  test('Goods Out Pending: menahan reservasi stok tetapi TIDAK mengurangi fisik', () => {
    const initialBalance = {
      ownerId: 'owner_alpha',
      warehouseId: 'wh_main',
      productId: 'prod_macbook',
      physicalStock: 40,
      reservedStock: 0,
      availableStock: 40,
    };

    const reservationResult = createGoodsOutPendingReservation(initialBalance, {
      reservationId: 'res-01',
      goodsOutId: 'gout-pending-100',
      goodsOutLineId: 'line-01',
      requestedBaseQty: 15,
      isSerial: false,
    });

    assert.equal(reservationResult.success, true);
    assert.ok(reservationResult.reservation);
    assert.equal(reservationResult.reservation.status, 'ACTIVE');
    assert.equal(reservationResult.reservation.reservedBaseQty, 15);

    // Kritis: Saldo fisik tetap 40 (tidak berkurang saat pending)
    assert.equal(reservationResult.updatedBalance.physicalStock, 40);
    assert.equal(reservationResult.updatedBalance.reservedStock, 15);
    assert.equal(reservationResult.updatedBalance.availableStock, 25); // 40 - 15
  });

  test('Oversell Protection: menolak reservasi jika kuantitas melebihi available stock', () => {
    const balanceWithExistingReservations = {
      ownerId: 'owner_alpha',
      warehouseId: 'wh_main',
      productId: 'prod_macbook',
      physicalStock: 40,
      reservedStock: 30,
      availableStock: 10,
    };

    // Permintaan 15 unit padahal yang tersedia hanya 10
    const failedResult = createGoodsOutPendingReservation(balanceWithExistingReservations, {
      reservationId: 'res-02',
      goodsOutId: 'gout-pending-101',
      goodsOutLineId: 'line-01',
      requestedBaseQty: 15,
      isSerial: false,
    });

    assert.equal(failedResult.success, false);
    assert.ok(failedResult.error?.includes('Stok tidak mencukupi'));
    assert.equal(failedResult.updatedBalance.reservedStock, 30);
  });

  test('Serial Invariant: menolak pecahan pada serial dan memvalidasi kecocokan SN', () => {
    const balance = {
      ownerId: 'owner_alpha',
      warehouseId: 'wh_main',
      productId: 'prod_serial_device',
      physicalStock: 10,
      reservedStock: 0,
      availableStock: 10,
    };

    // Coba kuantitas pecahan pada produk serial
    const fractionalResult = createGoodsOutPendingReservation(balance, {
      reservationId: 'res-err-01',
      goodsOutId: 'gout-err',
      goodsOutLineId: 'line-err',
      requestedBaseQty: 1.5,
      isSerial: true,
      serialIds: ['SN-01', 'SN-02'],
    });

    assert.equal(fractionalResult.success, false);
    assert.ok(fractionalResult.error?.includes('tidak boleh berupa pecahan'));

    // Coba kuantitas 2 tapi hanya melampirkan 1 SN
    const mismatchResult = createGoodsOutPendingReservation(balance, {
      reservationId: 'res-err-02',
      goodsOutId: 'gout-err',
      goodsOutLineId: 'line-err',
      requestedBaseQty: 2,
      isSerial: true,
      serialIds: ['SN-01'],
    });

    assert.equal(mismatchResult.success, false);
    assert.ok(mismatchResult.error?.includes('tidak cocok'));
  });

  test('Soft-Delete Tombstone: melepas seluruh reservasi secara atomik tanpa hard-delete', () => {
    const activeReservation: ReservationEntry = {
      id: 'res-10',
      ownerId: 'owner_alpha',
      warehouseId: 'wh_main',
      productId: 'prod_macbook',
      sourceDocType: 'GOODS_OUT_PENDING',
      sourceDocId: 'gout-pending-999',
      sourceLineId: 'line-01',
      reservedBaseQty: 10,
      status: 'ACTIVE',
      createdAt: '2026-10-14T11:00:00Z',
      releasedAt: null,
    };

    const currentBalance = {
      ownerId: 'owner_alpha',
      warehouseId: 'wh_main',
      productId: 'prod_macbook',
      physicalStock: 50,
      reservedStock: 10,
      availableStock: 40,
    };

    const tombstoneResult = executeGoodsOutSoftDeleteTombstone(
      activeReservation,
      currentBalance,
      {
        actorUserId: 'user_owner_1',
        reason: 'Customer membatalkan pesanan sebelum dispatch',
        cancelledAt: '2026-10-14T11:30:00Z',
      }
    );

    assert.equal(tombstoneResult.success, true);
    assert.equal(tombstoneResult.releasedReservation.status, 'RELEASED_CANCELLED');
    assert.equal(tombstoneResult.releasedReservation.releasedReason, 'CANCELLED_SOFT_DELETE');

    // Reservasi kembali ke 0, available stock pulih ke 50, physical stock tetap 50
    assert.equal(tombstoneResult.updatedBalance.reservedStock, 0);
    assert.equal(tombstoneResult.updatedBalance.availableStock, 50);
    assert.equal(tombstoneResult.updatedBalance.physicalStock, 50);

    // Memverifikasi payload audit tombstone mempertahankan histori
    assert.equal(tombstoneResult.tombstoneAuditPayload.event, 'GOODS_OUT_TOMBSTONED');
    assert.equal(tombstoneResult.tombstoneAuditPayload.isHardDeleted, false);
    assert.equal(tombstoneResult.tombstoneAuditPayload.cancellationReason, 'Customer membatalkan pesanan sebelum dispatch');
  });
});

describe('Fase 4: Stock Opname Variance & Stale Movement Reconciliation (RPD §10.7 & DB-AUD-004)', () => {
  test('Rekonsiliasi tanpa mutasi paralel: selisih dihitung tepat dan siap posting adjustment', () => {
    const recon = reconcileStockOpnameItem('prod_a', 100, 100, 95);

    assert.equal(recon.hasConcurrentMovement, false);
    assert.equal(recon.varianceQty, -5); // Fisik 95 vs Buku 100 => Selisih -5
    assert.equal(recon.recommendation, 'READY_FOR_ADJUSTMENT');
  });

  test('Deteksi mutasi paralel (Stale Review): menolak persetujuan langsung dan mewajibkan evaluasi ulang', () => {
    // Saat sesi dibuat saldo buku 100, tapi saat review ada transaksi masuk sehingga saldo buku kini 120
    const reconWithMovement = reconcileStockOpnameItem('prod_a', 100, 120, 115);

    assert.equal(reconWithMovement.hasConcurrentMovement, true);
    assert.equal(reconWithMovement.concurrentDelta, 20); // 120 - 100
    assert.equal(reconWithMovement.varianceQty, -5); // 115 - 120
    assert.equal(reconWithMovement.recommendation, 'REQUIRES_RE_EVALUATION');
  });
});
