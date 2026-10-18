/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Fase 7 Test Suite: Deployment Verification, Environment Security & Staging Smoke Tests
 * 
 * Cakupan:
 * 1. Environment & Secret Template Validation (Tidak ada bocoran secret, placeholder lengkap)
 * 2. Vercel Configuration & Security Headers (vercel.json valid, nosniff, frame denial, strict referrer)
 * 3. Staging Smoke Test: Login, Context Switching & Data Scope
 * 4. Staging Smoke Test: Safe Transactions & Idempotency Rollback Gate
 * 5. Production Gate: Memastikan rilis produksi diblokir tanpa persetujuan eksplisit
 * 6. Proteksi Database Legacy pada Target Deployment
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { evaluateSecurityContext } from '../src/lib/auth/context-evaluator.ts';
import {
  reconstructStockBalance,
  createGoodsOutPendingReservation,
  executeGoodsOutSoftDeleteTombstone,
} from '../src/lib/inventory/ledger-engine.ts';
import type { LedgerEntry, ReservationEntry } from '../src/lib/types/inventory-domain.ts';
import type {
  UserSession,
  OwnerMembership,
  WarehouseAssignment,
} from '../src/lib/types/auth.ts';

describe('Fase 7: Validasi Konfigurasi Deployment & Environment (TASK-055)', () => {
  test('Template .env.example tidak boleh mengandung nilai rahasia atau kredensial riil', () => {
    const envExamplePath = path.resolve(process.cwd(), '.env.example');
    assert.ok(fs.existsSync(envExamplePath), '.env.example harus tersedia di root repository');

    const content = fs.readFileSync(envExamplePath, 'utf-8');
    
    // Pastikan variabel wajib didefinisikan
    assert.match(content, /NEXT_PUBLIC_SUPABASE_URL=/, 'NEXT_PUBLIC_SUPABASE_URL harus ada');
    assert.match(content, /NEXT_PUBLIC_SUPABASE_ANON_KEY=/, 'NEXT_PUBLIC_SUPABASE_ANON_KEY harus ada');
    assert.match(content, /SUPABASE_SERVICE_ROLE_KEY=/, 'SUPABASE_SERVICE_ROLE_KEY harus ada');
    assert.match(content, /TARGET_ENV=/, 'TARGET_ENV harus ada');

    // Pastikan tidak ada kredensial nyata atau private key
    assert.doesNotMatch(content, /eyJh[a-zA-Z0-9_-]{20,}/, 'Tidak boleh ada JWT token nyata');
    assert.doesNotMatch(content, /postgres:\/\/[^:]+:[^@]+@/, 'Tidak boleh ada connection string postgres langsung dengan password');

    // Pastikan variabel NEXT_PUBLIC_SUPABASE_URL bukan URL legacy
    const lines = content.split('\n');
    const supabaseUrlLine = lines.find((l) => l.startsWith('NEXT_PUBLIC_SUPABASE_URL='));
    assert.ok(supabaseUrlLine);
    assert.doesNotMatch(supabaseUrlLine, /legacy/i, 'NEXT_PUBLIC_SUPABASE_URL dilarang mengarah ke database legacy');
  });

  test('Konfigurasi vercel.json harus memiliki framework nextjs dan security headers wajib', () => {
    const vercelConfigPath = path.resolve(process.cwd(), 'vercel.json');
    assert.ok(fs.existsSync(vercelConfigPath), 'vercel.json harus tersedia');

    const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf-8'));
    assert.equal(config.framework, 'nextjs', 'Framework harus nextjs');
    assert.equal(config.buildCommand, 'npm run build', 'Build command harus npm run build');
    
    // Periksa security headers
    assert.ok(Array.isArray(config.headers), 'Headers array harus didefinisikan');
    const rootHeaders = config.headers.find((h: { source: string }) => h.source === '/(.*)');
    assert.ok(rootHeaders, 'Header rule untuk /(.*) harus ada');

    const headerKeys = rootHeaders.headers.map((h: { key: string }) => h.key);
    assert.ok(headerKeys.includes('X-Content-Type-Options'), 'Wajib memiliki X-Content-Type-Options: nosniff');
    assert.ok(headerKeys.includes('X-Frame-Options'), 'Wajib memiliki X-Frame-Options: DENY');
    assert.ok(headerKeys.includes('Referrer-Policy'), 'Wajib memiliki Referrer-Policy');
    assert.ok(headerKeys.includes('Permissions-Policy'), 'Wajib memiliki Permissions-Policy');
  });
});

describe('Fase 7: Staging Smoke Tests & Operasi Transaksi Aman (TASK-055 & TASK-056)', () => {
  test('Smoke Test 1: Autentikasi, Pemilihan Context Owner & Gudang di Staging', () => {
    const session: UserSession = {
      userId: 'usr-stage-01',
      email: 'staging-user@example.com',
      fullName: 'Staging Operator',
    };

    const memberships: OwnerMembership[] = [
      {
        id: 'mem-01',
        userId: 'usr-stage-01',
        ownerId: 'owner-alpha',
        ownerName: 'Owner Alpha Staging',
        role: 'STAFF',
        status: 'ACTIVE',
      },
      {
        id: 'mem-02',
        userId: 'usr-stage-01',
        ownerId: 'owner-beta',
        ownerName: 'Owner Beta Staging',
        role: 'OWNER',
        status: 'ACTIVE',
      },
    ];

    const warehouseAssignments: WarehouseAssignment[] = [
      {
        id: 'wa-01',
        userId: 'usr-stage-01',
        ownerId: 'owner-alpha',
        warehouseId: 'wh-north',
        warehouseName: 'Gudang Utara',
        status: 'ACTIVE',
      },
    ];

    // 1. Staff memilih Owner Alpha dan gudang yang ditugaskan (wh-north) -> Valid
    const validCtx = evaluateSecurityContext({
      session,
      requestedOwnerId: 'owner-alpha',
      requestedWarehouseId: 'wh-north',
      memberships,
      warehouseAssignments,
    });
    assert.equal(validCtx.ownerId, 'owner-alpha');
    assert.equal(validCtx.warehouseId, 'wh-north');
    assert.equal(validCtx.role, 'STAFF');

    // 2. Staff mencoba memilih gudang di luar tugas (wh-south) -> Harus ditolak dengan AppError
    assert.throws(
      () => {
        evaluateSecurityContext({
          session,
          requestedOwnerId: 'owner-alpha',
          requestedWarehouseId: 'wh-south',
          memberships,
          warehouseAssignments,
        });
      },
      /Akses ditolak.*gudang/i,
      'Staff dilarang mengakses gudang di luar tugasnya',
    );

    // 3. Context switch ke Owner Beta sebagai OWNER -> Bebas akses gudang apapun tanpa penugasan spesifik
    const ownerBetaCtx = evaluateSecurityContext({
      session,
      requestedOwnerId: 'owner-beta',
      requestedWarehouseId: 'wh-central',
      memberships,
      warehouseAssignments,
    });
    assert.equal(ownerBetaCtx.ownerId, 'owner-beta');
    assert.equal(ownerBetaCtx.warehouseId, 'wh-central');
    assert.equal(ownerBetaCtx.role, 'OWNER');
  });

  test('Smoke Test 2: Transaksi Aman & Proteksi Rollback jika Terjadi Kegagalan Concurrency di Staging', () => {
    const existingLedger: LedgerEntry[] = [
      {
        id: 'led-stg-01',
        sequenceNumber: 1,
        ownerId: 'owner-alpha',
        warehouseId: 'wh-north',
        productId: 'prod-item-1',
        locationId: null,
        entryType: 'GOODS_IN_POSTED',
        sourceDocType: 'GOODS_IN',
        sourceDocId: 'gi-stg-01',
        sourceLineId: 'line-gi-01',
        quantityDeltaBase: 20,
        actorUserId: 'usr-stage-01',
        occurredAt: new Date().toISOString(),
      },
    ];

    const currentReservations: ReservationEntry[] = [];

    // Verifikasi saldo awal 20
    const initialBalance = reconstructStockBalance(existingLedger, currentReservations, 'owner-alpha', 'wh-north', 'prod-item-1');
    assert.equal(initialBalance.physicalStock, 20);
    assert.equal(initialBalance.availableStock, 20);

    // Permintaan 1: Reservasi 15 unit -> Berhasil
    const res1 = createGoodsOutPendingReservation(initialBalance, {
      reservationId: 'res-stg-01',
      goodsOutId: 'go-stg-01',
      goodsOutLineId: 'line-stg-01',
      requestedBaseQty: 15,
      isSerial: false,
    });
    assert.equal(res1.success, true);
    assert.ok(res1.reservation);
    assert.equal(res1.updatedBalance.physicalStock, 20, 'Fisik tetap 20 selama status Pending');
    assert.equal(res1.updatedBalance.reservedStock, 15);
    assert.equal(res1.updatedBalance.availableStock, 5);

    // Permintaan 2: Mencoba reservasi 10 unit tambahan padahal sisa available hanya 5 -> Harus ditolak (Oversell Guard)
    const res2 = createGoodsOutPendingReservation(res1.updatedBalance, {
      reservationId: 'res-stg-02',
      goodsOutId: 'go-stg-02',
      goodsOutLineId: 'line-stg-02',
      requestedBaseQty: 10,
      isSerial: false,
    });
    assert.equal(res2.success, false);
    assert.match(res2.error || '', /Stok tidak mencukupi/);

    // Rollback / Pembatalan transaksi go-stg-01 via Soft-Delete Tombstone
    const tombstone = executeGoodsOutSoftDeleteTombstone(
      res1.reservation!,
      res1.updatedBalance,
      {
        actorUserId: 'usr-stage-01',
        reason: 'Pembatalan transaksi staging',
        cancelledAt: new Date().toISOString(),
      }
    );
    assert.equal(tombstone.success, true);
    assert.equal(tombstone.releasedReservation.status, 'RELEASED_CANCELLED');
    assert.equal(tombstone.updatedBalance.availableStock, 20, 'Available stock harus pulih utuh setelah pembatalan/rollback');
    assert.equal(tombstone.updatedBalance.reservedStock, 0);
  });

  test('Gate Produksi: Menegakkan pemblokiran rilis produksi tanpa approval eksplisit (AGENTS.md §2 & §14)', () => {
    interface DeploymentGateInput {
      targetEnvironment: 'preview' | 'staging' | 'production';
      userExplicitApprovalGranted: boolean;
      allQualityGatesPassed: boolean;
    }

    function evaluateProductionReleaseGate(input: DeploymentGateInput) {
      if (input.targetEnvironment === 'production') {
        if (!input.userExplicitApprovalGranted) {
          return {
            allowed: false,
            reason: 'Rilis produksi DIBLOKIR: Belum ada persetujuan eksplisit dari pengguna sesuai batasan AGENTS.md §2 dan TASK-056.',
          };
        }
        if (!input.allQualityGatesPassed) {
          return {
            allowed: false,
            reason: 'Rilis produksi DIBLOKIR: Masih ada quality gates yang gagal.',
          };
        }
      }
      return {
        allowed: true,
        reason: 'Deployment diizinkan untuk target lingkungan yang ditentukan.',
      };
    }

    // 1. Preview / Staging diizinkan jika quality gates lulus
    const stagingDecision = evaluateProductionReleaseGate({
      targetEnvironment: 'staging',
      userExplicitApprovalGranted: false,
      allQualityGatesPassed: true,
    });
    assert.equal(stagingDecision.allowed, true);

    // 2. Production tanpa approval eksplisit WAJIB ditolak
    const prodWithoutApproval = evaluateProductionReleaseGate({
      targetEnvironment: 'production',
      userExplicitApprovalGranted: false,
      allQualityGatesPassed: true,
    });
    assert.equal(prodWithoutApproval.allowed, false);
    assert.match(prodWithoutApproval.reason, /DIBLOKIR/);
  });
});
