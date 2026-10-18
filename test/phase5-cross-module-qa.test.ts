/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Fase 5 Test Suite: Cross-Module Quality, Route Privacy/SEO,
 * Multi-Tenant Isolation Security, & Concurrency State Audits
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import robots from '../src/app/robots.ts';
import { evaluateSecurityContext } from '../src/lib/auth/context-evaluator.ts';
import {
  evaluateCrossWarehouseSerialGuard,
  createGoodsOutPendingReservation,
  reconcileStockOpnameItem,
} from '../src/lib/inventory/ledger-engine.ts';
import { sanitizePayload } from '../src/lib/logging/logger.ts';
import type {
  UserSession,
  OwnerMembership,
  WarehouseAssignment,
} from '../src/lib/types/auth.ts';
import type { ActiveSerialRecord } from '../src/lib/types/inventory-domain.ts';

describe('Fase 5: SEO, Metadata & Route Privacy Audit (TASK-050)', () => {
  test('robots.txt: seluruh rute privat harus di-disallow dari indexing search engine', () => {
    const robotsConfig = robots();
    assert.ok(robotsConfig.rules);

    const rules = Array.isArray(robotsConfig.rules) ? robotsConfig.rules[0] : robotsConfig.rules;
    const disallowList = rules.disallow as string[];

    assert.ok(disallowList.includes('/dashboard'));
    assert.ok(disallowList.includes('/inventory/'));
    assert.ok(disallowList.includes('/purchase-orders'));
    assert.ok(disallowList.includes('/documents'));
    assert.ok(disallowList.includes('/partners/'));
    assert.ok(disallowList.includes('/settings'));
    assert.ok(disallowList.includes('/audit-log'));
  });

  test('AppLayout metadata: robots harus noindex, nofollow, dan nocache untuk seluruh area privat', () => {
    const layoutPath = resolve(process.cwd(), 'src/app/(app)/layout.tsx');
    const layoutContent = readFileSync(layoutPath, 'utf8');

    assert.ok(layoutContent.includes('index: false'), 'Layout harus menyertakan index: false');
    assert.ok(layoutContent.includes('follow: false'), 'Layout harus menyertakan follow: false');
    assert.ok(layoutContent.includes('nocache: true'), 'Layout harus menyertakan nocache: true');
  });
});

describe('Fase 5: Audit Keamanan Isolasi Multi-Tenant & Warehouse Scope (TASK-047)', () => {
  const session: UserSession = {
    userId: 'usr_cross_01',
    email: 'staff@tenant-a.com',
    fullName: 'Staff Tenant A',
  };

  const memberships: OwnerMembership[] = [
    {
      id: 'mem_a',
      userId: 'usr_cross_01',
      ownerId: 'owner_alpha',
      ownerName: 'PT Alpha Mandiri',
      role: 'STAFF',
      status: 'ACTIVE',
    },
  ];

  const assignments: WarehouseAssignment[] = [
    {
      id: 'asg_a1',
      userId: 'usr_cross_01',
      warehouseId: 'wh_alpha_jakarta',
      warehouseName: 'Gudang Jakarta',
      ownerId: 'owner_alpha',
      status: 'ACTIVE',
    },
  ];

  test('Penolakan Akses Lintas Tenant: Staff Tenant A dilarang mengakses tenant Owner Beta', () => {
    assert.throws(
      () => {
        evaluateSecurityContext({
          session,
          requestedOwnerId: 'owner_beta',
          memberships,
          warehouseAssignments: assignments,
          activeGrants: [],
        });
      },
      (err: unknown) => (err as { code: string }).code === 'ERR_FORBIDDEN_OWNER'
    );
  });

  test('Penolakan Akses Lintas Gudang: Staff diblokir jika mencoba mengakses gudang non-tugas', () => {
    assert.throws(
      () => {
        evaluateSecurityContext({
          session,
          requestedOwnerId: 'owner_alpha',
          requestedWarehouseId: 'wh_alpha_surabaya', // Gudang milik Owner Alpha, tetapi staff tidak ditugaskan di sini
          memberships,
          warehouseAssignments: assignments,
          activeGrants: [],
        });
      },
      (err: unknown) => (err as { code: string }).code === 'ERR_FORBIDDEN_WAREHOUSE'
    );
  });
});

describe('Fase 5: Audit Transaksi Konkurensi & Integritas Stok (TASK-048)', () => {
  test('Pencegahan Oversell: Dua transaksi paralel tidak boleh mereservasi kuantitas melebihi stok tersedia', () => {
    const initialBalance = {
      ownerId: 'owner_alpha',
      warehouseId: 'wh_alpha_jakarta',
      productId: 'prod_server_01',
      physicalStock: 10,
      reservedStock: 0,
      availableStock: 10,
    };

    // Transaksi 1 berhasil mereservasi 7 unit
    const tx1 = createGoodsOutPendingReservation(initialBalance, {
      reservationId: 'res_par_01',
      goodsOutId: 'go_par_01',
      goodsOutLineId: 'line_01',
      requestedBaseQty: 7,
      isSerial: false,
    });
    assert.equal(tx1.success, true);
    assert.equal(tx1.updatedBalance.availableStock, 3); // Tersisa 3

    // Transaksi 2 mencoba mereservasi 5 unit dari saldo hasil transaksi 1 -> HARUS DITOLAK
    const tx2 = createGoodsOutPendingReservation(tx1.updatedBalance, {
      reservationId: 'res_par_02',
      goodsOutId: 'go_par_02',
      goodsOutLineId: 'line_01',
      requestedBaseQty: 5,
      isSerial: false,
    });
    assert.equal(tx2.success, false);
    assert.ok(tx2.error?.includes('Stok tidak mencukupi'));
  });

  test('Pencegahan Duplikasi Serial Lintas Gudang: Menolak serial hidup yang sama', () => {
    const activeRegistry: ActiveSerialRecord[] = [
      {
        serialId: 'sn_01',
        serialNumberNormalized: 'SN-LAPTOP-X1',
        ownerId: 'owner_alpha',
        warehouseId: 'wh_alpha_jakarta',
        productId: 'prod_01',
        status: 'AVAILABLE',
        registeredAt: '2026-10-14T10:00:00Z',
      },
    ];

    const guardResult = evaluateCrossWarehouseSerialGuard(activeRegistry, {
      ownerId: 'owner_alpha',
      warehouseId: 'wh_alpha_surabaya',
      serialNumber: 'sn-laptop-x1',
    });

    assert.equal(guardResult.isAllowed, false);
    assert.ok(guardResult.errorMessage?.includes('Konflik SN Lintas Gudang'));
  });

  test('Pencegahan Stale Review Stock Opname: Menolak persetujuan jika terjadi pergerakan paralel', () => {
    // Snapshot awal 50 unit, saat review saldo buku menjadi 60 unit (ada mutasi paralel)
    const recon = reconcileStockOpnameItem('prod_01', 50, 60, 52);

    assert.equal(recon.hasConcurrentMovement, true);
    assert.equal(recon.recommendation, 'REQUIRES_RE_EVALUATION');
  });
});

describe('Fase 5: Audit Log Sanitization & Cross-Module Leak Protection (TASK-045 & TASK-049)', () => {
  test('Sanitasi Data Sensitif: Memastikan tidak ada token/credentials yang bocor pada output', () => {
    const complexPayload = {
      user: 'admin@tenant.com',
      token: 'jwt.token.secret123',
      SUPABASE_SERVICE_ROLE_KEY: 'secret_key_abc',
      safeData: {
        warehouse: 'Gudang Utama',
        qty: 100,
      },
    };

    const sanitized = sanitizePayload(complexPayload);
    assert.equal(sanitized.token, '[REDACTED]');
    assert.equal(sanitized.SUPABASE_SERVICE_ROLE_KEY, '[REDACTED]');
    assert.equal(sanitized.safeData.warehouse, 'Gudang Utama');
    assert.equal(sanitized.safeData.qty, 100);
  });
});
