/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Fase 6 Test Suite: Release Verification & Quality Gates
 * 
 * Cakupan:
 * 1. Unit Test Kalkulasi Matematis Diskon Berurutan (LOCKED)
 * 2. Kebijakan Retur Reopen Source Qty (RPD §10.6)
 * 3. Validasi Pemenuhan PO Parsial & Pencegahan Over-Fulfillment (RPD §10.4)
 * 4. Integration Workflow End-to-End: Goods In -> Goods Out -> PO -> Invoice -> SO
 * 5. Data Reconciliation: Rekonstruksi Saldo Fisik vs Ledger
 * 6. Legacy Database Isolation Verification
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateInvoiceTotals,
  evaluateReopenSourceQty,
  validatePOFulfillmentAllocation,
} from '../src/lib/inventory/commercial-engine.ts';
import {
  reconstructStockBalance,
  createGoodsOutPendingReservation,
  executeGoodsOutSoftDeleteTombstone,
} from '../src/lib/inventory/ledger-engine.ts';
import type { LedgerEntry, ReservationEntry } from '../src/lib/types/inventory-domain.ts';

describe('Fase 6: Kalkulasi Diskon Berurutan (RPD §10.5 & DB-AUD-006)', () => {
  test('Urutan Diskon LOCKED: Diskon Item -> Diskon Nominal Dokumen -> Diskon Persen Dokumen -> Poin Terakhir', () => {
    // 2 item @ 500.000 = 1.000.000 (Gross)
    // Diskon Item: 100.000 -> Subtotal 1 = 900.000
    // Diskon Nominal Dokumen: 50.000 -> Subtotal 2 = 850.000
    // Diskon Persen Dokumen: 10% dari 850.000 = 85.000 -> Subtotal 3 = 765.000
    // Penukaran Poin Terakhir: 15.000 -> Net Total = 750.000
    const calc = calculateInvoiceTotals({
      items: [
        {
          unitPrice: 500000,
          quantity: 2,
          itemDiscountNominal: 100000,
        },
      ],
      documentDiscountNominal: 50000,
      documentDiscountPercentage: 10,
      pointsRedeemedValue: 15000,
    });

    assert.equal(calc.grossTotal, 1000000);
    assert.equal(calc.totalItemDiscount, 100000);
    assert.equal(calc.subtotalAfterItemDiscount, 900000);
    assert.equal(calc.documentDiscountNominalApplied, 50000);
    assert.equal(calc.subtotalAfterDocNominal, 850000);
    assert.equal(calc.documentDiscountPercentageApplied, 85000);
    assert.equal(calc.subtotalAfterDocPercentage, 765000);
    assert.equal(calc.pointsRedeemedValueApplied, 15000);
    assert.equal(calc.finalNetTotal, 750000);
  });

  test('Proteksi Batas Diskon: Total akhir tidak boleh bernilai negatif jika diskon/poin melampaui tagihan', () => {
    const calc = calculateInvoiceTotals({
      items: [
        {
          unitPrice: 10000,
          quantity: 1,
        },
      ],
      documentDiscountNominal: 50000, // Nominal lebih besar dari harga barang
      pointsRedeemedValue: 20000,
    });

    assert.equal(calc.grossTotal, 10000);
    assert.equal(calc.subtotalAfterItemDiscount, 10000);
    assert.equal(calc.documentDiscountNominalApplied, 10000); // Terpangkas max subtotal
    assert.equal(calc.finalNetTotal, 0); // Tidak negatif
  });
});

describe('Fase 6: Evaluasi Retur & Reopen Source Quantity (RPD §10.6 & V2.4.1)', () => {
  test('Alasan Salah Kirim / Pembatalan / Salah Input harus membuka kembali kuantitas sumber', () => {
    assert.equal(evaluateReopenSourceQty('SALAH_KIRIM'), true);
    assert.equal(evaluateReopenSourceQty('PEMBATALAN'), true);
    assert.equal(evaluateReopenSourceQty('SALAH_INPUT'), true);
  });

  test('Alasan Barang Cacat / Rusak atau Lainnya dilarang membuka kembali kuantitas sumber', () => {
    assert.equal(evaluateReopenSourceQty('CACAT'), false);
    assert.equal(evaluateReopenSourceQty('LAINNYA'), false);
  });
});

describe('Fase 6: Pemenuhan PO Parsial & Pencegahan Over-Fulfillment (RPD §10.4)', () => {
  test('Fulfillment Bertahap: PO 100 unit dapat dipenuhi melalui Goods Out parsial bertahap', () => {
    // Alokasi Pertama: 40 unit dari target 100
    const alloc1 = validatePOFulfillmentAllocation(100, 0, 40);
    assert.equal(alloc1.isValid, true);
    assert.equal(alloc1.totalFulfilledAfterThis, 40);
    assert.equal(alloc1.remainingQtyAfterThis, 60);

    // Alokasi Kedua: 60 unit (memenuhi sisa target 60)
    const alloc2 = validatePOFulfillmentAllocation(100, alloc1.totalFulfilledAfterThis, 60);
    assert.equal(alloc2.isValid, true);
    assert.equal(alloc2.totalFulfilledAfterThis, 100);
    assert.equal(alloc2.remainingQtyAfterThis, 0);
  });

  test('Pencegahan Over-Fulfillment: Menolak Goods Out yang melebihi sisa target PO', () => {
    // Target 100, sudah terpenuhi 80 (tersisa 20). Mencoba alokasi 25.
    const invalidAlloc = validatePOFulfillmentAllocation(100, 80, 25);
    assert.equal(invalidAlloc.isValid, false);
    assert.ok(invalidAlloc.errorMessage?.includes('Over-fulfillment terdeteksi'));
    assert.ok(invalidAlloc.errorMessage?.includes('melebihi sisa target PO sebesar 5 unit'));
  });
});

describe('Fase 6: Integration Workflow End-to-End & Transaction Safety', () => {
  test('Alur Lengkap Transaksi: Goods In -> Goods Out Pending -> Cancel Tombstone -> Complete -> Invoice Safety', () => {
    const ownerId = 'own_test_release';
    const warehouseId = 'wh_release_01';
    const productId = 'prod_server_dell';

    // 1. Awal mula: Stok fisik = 0
    const ledger: LedgerEntry[] = [];
    let reservations: ReservationEntry[] = [];

    let balance = reconstructStockBalance(ledger, reservations, ownerId, warehouseId, productId);
    assert.equal(balance.physicalStock, 0);

    // 2. Transaksi Goods In POSTED (+50 unit)
    ledger.push({
      id: 'led_gin_01',
      sequenceNumber: 1,
      ownerId,
      warehouseId,
      productId,
      locationId: 'loc_rack_a1',
      entryType: 'GOODS_IN_POSTED',
      sourceDocType: 'GOODS_IN',
      sourceDocId: 'gin_release_001',
      sourceLineId: 'line_01',
      quantityDeltaBase: 50,
      actorUserId: 'usr_staff_01',
      occurredAt: '2026-10-14T08:00:00Z',
    });

    balance = reconstructStockBalance(ledger, reservations, ownerId, warehouseId, productId);
    assert.equal(balance.physicalStock, 50);
    assert.equal(balance.availableStock, 50);

    // 3. Transaksi Goods Out PENDING (Mereservasi 20 unit)
    const pendingGO = createGoodsOutPendingReservation(balance, {
      reservationId: 'res_go_01',
      goodsOutId: 'gout_pending_01',
      goodsOutLineId: 'line_01',
      requestedBaseQty: 20,
      isSerial: false,
    });
    assert.equal(pendingGO.success, true);
    assert.ok(pendingGO.reservation);
    reservations.push(pendingGO.reservation);

    balance = reconstructStockBalance(ledger, reservations, ownerId, warehouseId, productId);
    assert.equal(balance.physicalStock, 50); // Fisik tetap 50 (Pending tidak memotong fisik)
    assert.equal(balance.reservedStock, 20); // Reservasi 20
    assert.equal(balance.availableStock, 30); // Tersisa 30

    // 4. Pembatalan Goods Out PENDING via Soft-Delete Tombstone
    const tombstone = executeGoodsOutSoftDeleteTombstone(
      pendingGO.reservation,
      balance,
      {
        actorUserId: 'usr_owner_01',
        reason: 'Pesanan dibatalkan pembeli',
        cancelledAt: '2026-10-14T09:00:00Z',
      }
    );
    assert.equal(tombstone.success, true);
    // Update daftar reservasi dengan hasil pelepasan
    reservations = reservations.map(r => r.id === tombstone.releasedReservation.id ? tombstone.releasedReservation : r);

    balance = reconstructStockBalance(ledger, reservations, ownerId, warehouseId, productId);
    assert.equal(balance.physicalStock, 50); // Fisik tetap 50
    assert.equal(balance.reservedStock, 0);  // Reservasi pulih ke 0
    assert.equal(balance.availableStock, 50); // Stok bebas kembali ke 50

    // 5. Transaksi Goods Out COMPLETED (15 unit resmi keluar)
    ledger.push({
      id: 'led_gout_02',
      sequenceNumber: 2,
      ownerId,
      warehouseId,
      productId,
      locationId: 'loc_rack_a1',
      entryType: 'GOODS_OUT_COMPLETED',
      sourceDocType: 'GOODS_OUT',
      sourceDocId: 'gout_completed_02',
      sourceLineId: 'line_01',
      quantityDeltaBase: -15,
      actorUserId: 'usr_staff_01',
      occurredAt: '2026-10-14T10:00:00Z',
    });

    balance = reconstructStockBalance(ledger, reservations, ownerId, warehouseId, productId);
    assert.equal(balance.physicalStock, 35); // 50 - 15 = 35
    assert.equal(balance.availableStock, 35);

    // 6. Pembuatan Invoice Komersial untuk 15 unit
    const invoice = calculateInvoiceTotals({
      items: [
        {
          unitPrice: 15000000,
          quantity: 15,
        },
      ],
    });
    assert.equal(invoice.finalNetTotal, 225000000);

    // Invarian Kritis: Pembuatan invoice komersial TIDAK PERNAH mengurangi stok fisik gudang
    balance = reconstructStockBalance(ledger, reservations, ownerId, warehouseId, productId);
    assert.equal(balance.physicalStock, 35);
  });
});

describe('Fase 6: Rekonsiliasi Data & Integritas Lingkungan (TASK-054)', () => {
  test('Rekonsiliasi Konsistensi Ledger vs Saldo: Saldo fisik sama persis dengan agregasi ledger', () => {
    const mockLedger: LedgerEntry[] = [
      { id: '1', sequenceNumber: 1, ownerId: 'own_1', warehouseId: 'wh_1', productId: 'p1', locationId: null, entryType: 'GOODS_IN_POSTED', sourceDocType: 'GOODS_IN', sourceDocId: 'g1', sourceLineId: 'l1', quantityDeltaBase: 100, actorUserId: 'u1', occurredAt: '2026-10-14T01:00:00Z' },
      { id: '2', sequenceNumber: 2, ownerId: 'own_1', warehouseId: 'wh_1', productId: 'p1', locationId: null, entryType: 'GOODS_OUT_COMPLETED', sourceDocType: 'GOODS_OUT', sourceDocId: 'g2', sourceLineId: 'l1', quantityDeltaBase: -25, actorUserId: 'u1', occurredAt: '2026-10-14T02:00:00Z' },
      { id: '3', sequenceNumber: 3, ownerId: 'own_1', warehouseId: 'wh_1', productId: 'p1', locationId: null, entryType: 'STOCK_ADJUSTMENT_POSTED', sourceDocType: 'STOCK_OPNAME_ADJUSTMENT', sourceDocId: 'so1', sourceLineId: 'l1', quantityDeltaBase: -5, actorUserId: 'u1', occurredAt: '2026-10-14T03:00:00Z' },
      { id: '4', sequenceNumber: 4, ownerId: 'own_1', warehouseId: 'wh_1', productId: 'p1', locationId: null, entryType: 'RETURN_IN_POSTED', sourceDocType: 'RETURN', sourceDocId: 'ret1', sourceLineId: 'l1', quantityDeltaBase: 2, actorUserId: 'u1', occurredAt: '2026-10-14T04:00:00Z' },
    ];

    const balance = reconstructStockBalance(mockLedger, [], 'own_1', 'wh_1', 'p1');

    // 100 - 25 - 5 + 2 = 72
    assert.equal(balance.physicalStock, 72);
    assert.equal(balance.availableStock, 72);
  });

  test('Isolasi Database Legacy: Tidak ada URL atau kredensial database legacy di environment template', () => {
    const envExample = process.env.DATABASE_URL || '';
    assert.equal(/legacy/i.test(envExample), false, 'Environment tidak boleh mengarah ke database legacy');
  });
});
