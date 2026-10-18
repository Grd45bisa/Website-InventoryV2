/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Fase 1 Test Suite: Security Context, Sanitasi Logging, Error Contracts, & Guard
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizePayload, logger } from '../src/lib/logging/logger.ts';
import {
  AppError,
  createForbiddenOwnerError,
} from '../src/lib/errors/app-error.ts';
import { validateSchema } from '../src/lib/validation/validator.ts';
import { evaluateSecurityContext } from '../src/lib/auth/context-evaluator.ts';
import { assertAuthorized } from '../src/lib/auth/guard.ts';
import type {
  UserSession,
  OwnerMembership,
  WarehouseAssignment,
  SuperAdminGrant,
} from '../src/lib/types/auth.ts';

describe('Fase 1: Logger Sanitization & Error Contracts (TASK-009)', () => {
  test('Sanitasi payload: harus menyamarkan secret, password, dan token', () => {
    const rawPayload = {
      username: 'johndoe',
      password: 'supersecretpassword123',
      secretKey: 'sk_live_123456789',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJh...super-secret-service-key',
      metadata: {
        token: 'bearer-token-1234',
        safeProperty: 'NilaiAman',
      },
    };

    const sanitized = sanitizePayload(rawPayload);

    assert.equal(sanitized.password, '[REDACTED]');
    assert.equal(sanitized.secretKey, '[REDACTED]');
    assert.equal(sanitized.SUPABASE_SERVICE_ROLE_KEY, '[REDACTED]');
    assert.equal(sanitized.metadata.token, '[REDACTED]');
    assert.equal(sanitized.metadata.safeProperty, 'NilaiAman');
    assert.equal(sanitized.username, 'johndoe');

    // Uji logging aman dengan SafeLogger
    const logEntry = logger.info('Autentikasi event dicatat', rawPayload, 'corr_test_01');
    assert.equal(logEntry.context?.password, '[REDACTED]');
    assert.equal(logEntry.correlationId, 'corr_test_01');
  });

  test('AppError contract: respons harus aman dan memiliki correlationId', () => {
    const error = createForbiddenOwnerError('Akses ditolak pada tenant ini');
    const safeResponse = error.toSafeResponse();

    assert.equal(safeResponse.success, false);
    assert.equal(safeResponse.error.code, 'ERR_FORBIDDEN_OWNER');
    assert.equal(safeResponse.error.message, 'Akses ditolak pada tenant ini');
    assert.ok(safeResponse.error.correlationId.startsWith('err_'));
  });

  test('Server validation: input valid dan invalid ditangani dengan benar', () => {
    interface SampleDTO {
      sku: string;
      qty: number;
    }

    const rules = [
      {
        field: 'sku' as keyof SampleDTO,
        validate: (v: unknown) => typeof v === 'string' && (v as string).length >= 3,
        message: 'SKU minimal 3 karakter',
      },
      {
        field: 'qty' as keyof SampleDTO,
        validate: (v: unknown) => typeof v === 'number' && (v as number) > 0,
        message: 'Kuantitas harus berupa angka positif',
      },
    ];

    const validResult = validateSchema<SampleDTO>({ sku: 'PROD-001', qty: 10 }, rules);
    assert.equal(validResult.valid, true);

    const invalidResult = validateSchema<SampleDTO>({ sku: 'AB', qty: -5 }, rules);
    assert.equal(invalidResult.valid, false);
    if (!invalidResult.valid) {
      assert.ok(invalidResult.errors.sku.length > 0);
      assert.ok(invalidResult.errors.qty.length > 0);
    }
  });
});

describe('Fase 1: Context Evaluator & Multi-Owner Isolation (TASK-012 & TASK-013)', () => {
  const dummySession: UserSession = {
    userId: 'usr_001',
    email: 'staff@example.com',
    fullName: 'Budi Santoso',
  };

  const dummyMemberships: OwnerMembership[] = [
    {
      id: 'mem_1',
      userId: 'usr_001',
      ownerId: 'own_jakarta',
      ownerName: 'PT Maju Jakarta',
      role: 'STAFF',
      status: 'ACTIVE',
    },
    {
      id: 'mem_2',
      userId: 'usr_001',
      ownerId: 'own_surabaya',
      ownerName: 'PT Maju Surabaya',
      role: 'STAFF',
      status: 'ACTIVE',
    },
    {
      id: 'mem_3',
      userId: 'usr_001',
      ownerId: 'own_bandung_suspended',
      ownerName: 'PT Bandung Nonaktif',
      role: 'STAFF',
      status: 'SUSPENDED',
    },
  ];

  const dummyWarehouseAssignments: WarehouseAssignment[] = [
    {
      id: 'wa_1',
      userId: 'usr_001',
      warehouseId: 'wh_jkt_utama',
      warehouseName: 'Gudang Utama Jakarta',
      ownerId: 'own_jakarta',
      status: 'ACTIVE',
    },
    {
      id: 'wa_2',
      userId: 'usr_001',
      warehouseId: 'wh_sby_barat',
      warehouseName: 'Gudang Surabaya Barat',
      ownerId: 'own_surabaya',
      status: 'ACTIVE',
    },
  ];

  test('Positif: Mengakses Owner A dengan penugasan gudang yang sah', () => {
    const context = evaluateSecurityContext({
      session: dummySession,
      requestedOwnerId: 'own_jakarta',
      requestedWarehouseId: 'wh_jkt_utama',
      memberships: dummyMemberships,
      warehouseAssignments: dummyWarehouseAssignments,
    });

    assert.equal(context.ownerId, 'own_jakarta');
    assert.equal(context.warehouseId, 'wh_jkt_utama');
    assert.equal(context.role, 'STAFF');
  });

  test('Positif: Beralih ke Owner B (Multi-Owner) menghasilkan konteks baru yang terisolasi', () => {
    const context = evaluateSecurityContext({
      session: dummySession,
      requestedOwnerId: 'own_surabaya',
      requestedWarehouseId: 'wh_sby_barat',
      memberships: dummyMemberships,
      warehouseAssignments: dummyWarehouseAssignments,
    });

    assert.equal(context.ownerId, 'own_surabaya');
    assert.equal(context.warehouseId, 'wh_sby_barat');
    assert.notEqual(context.ownerId, 'own_jakarta');
  });

  test('Negatif: Sesi null / tidak ada -> Tolak ERR_UNAUTHORIZED', () => {
    assert.throws(
      () => {
        evaluateSecurityContext({
          session: null,
          requestedOwnerId: 'own_jakarta',
          memberships: dummyMemberships,
          warehouseAssignments: dummyWarehouseAssignments,
        });
      },
      (err: AppError) => err.code === 'ERR_UNAUTHORIZED'
    );
  });

  test('Negatif: Memanipulasi Owner ID ke tenant di mana user bukan anggota -> Tolak ERR_FORBIDDEN_OWNER', () => {
    assert.throws(
      () => {
        evaluateSecurityContext({
          session: dummySession,
          requestedOwnerId: 'own_medan_asing', // Tenant orang lain
          memberships: dummyMemberships,
          warehouseAssignments: dummyWarehouseAssignments,
        });
      },
      (err: AppError) => err.code === 'ERR_FORBIDDEN_OWNER'
    );
  });

  test('Negatif: Mengakses Owner yang membership-nya SUSPENDED -> Tolak ERR_FORBIDDEN_OWNER', () => {
    assert.throws(
      () => {
        evaluateSecurityContext({
          session: dummySession,
          requestedOwnerId: 'own_bandung_suspended',
          memberships: dummyMemberships,
          warehouseAssignments: dummyWarehouseAssignments,
        });
      },
      (err: AppError) => err.code === 'ERR_FORBIDDEN_OWNER'
    );
  });

  test('Negatif: Staff mencoba mengakses gudang di luar penugasannya -> Tolak ERR_FORBIDDEN_WAREHOUSE', () => {
    assert.throws(
      () => {
        evaluateSecurityContext({
          session: dummySession,
          requestedOwnerId: 'own_jakarta',
          requestedWarehouseId: 'wh_jkt_rahasia_vip', // Gudang bukan haknya
          memberships: dummyMemberships,
          warehouseAssignments: dummyWarehouseAssignments,
        });
      },
      (err: AppError) => err.code === 'ERR_FORBIDDEN_WAREHOUSE'
    );
  });

  test('Negatif: Super Admin mencoba akses tanpa active grant -> Tolak ERR_FORBIDDEN_SUPERADMIN_NO_GRANT', () => {
    const superAdminSession: UserSession = {
      userId: 'usr_super_99',
      email: 'admin@platform.com',
      fullName: 'Super Admin Platform',
    };
    const superAdminMemberships: OwnerMembership[] = [
      {
        id: 'mem_super',
        userId: 'usr_super_99',
        ownerId: 'platform_system',
        ownerName: 'Platform System',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    ];

    assert.throws(
      () => {
        evaluateSecurityContext({
          session: superAdminSession,
          requestedOwnerId: 'own_jakarta', // Mencoba intip tenant tanpa izin
          memberships: superAdminMemberships,
          warehouseAssignments: [],
          activeGrants: [], // TIDAK ADA GRANT
        });
      },
      (err: AppError) => err.code === 'ERR_FORBIDDEN_SUPERADMIN_NO_GRANT'
    );
  });

  test('Positif: Super Admin dengan active grant sah -> Diberi akses atas nama Owner dengan audit trail', () => {
    const superAdminSession: UserSession = {
      userId: 'usr_super_99',
      email: 'admin@platform.com',
      fullName: 'Super Admin Platform',
    };
    const superAdminMemberships: OwnerMembership[] = [
      {
        id: 'mem_super',
        userId: 'usr_super_99',
        ownerId: 'platform_system',
        ownerName: 'Platform System',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    ];

    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 3600000);

    const activeGrant: SuperAdminGrant = {
      id: 'grant_123',
      superAdminUserId: 'usr_super_99',
      targetOwnerId: 'own_jakarta',
      scope: 'SUPPORT_INVESTIGATION',
      grantedBy: 'usr_owner_jakarta',
      startsAt: now.toISOString(),
      expiresAt: oneHourLater.toISOString(),
      revokedAt: null,
    };

    const context = evaluateSecurityContext({
      session: superAdminSession,
      requestedOwnerId: 'own_jakarta',
      memberships: superAdminMemberships,
      warehouseAssignments: [],
      activeGrants: [activeGrant],
    });

    assert.equal(context.role, 'SUPER_ADMIN');
    assert.equal(context.isSuperAdminOnBehalf, true);
    assert.equal(context.grantId, 'grant_123');
    assert.equal(context.ownerId, 'own_jakarta');
  });

  test('Guard: assertAuthorized menolak aksi jika role tidak diizinkan', () => {
    const context = evaluateSecurityContext({
      session: dummySession,
      requestedOwnerId: 'own_jakarta',
      requestedWarehouseId: 'wh_jkt_utama',
      memberships: dummyMemberships,
      warehouseAssignments: dummyWarehouseAssignments,
    });

    // Operasi hanya untuk OWNER
    assert.throws(
      () => {
        assertAuthorized(context, { allowedRoles: ['OWNER'] });
      },
      (err: AppError) => err.code === 'ERR_FORBIDDEN_ROLE'
    );

    // Operasi untuk STAFF dan OWNER -> Berhasil
    assert.doesNotThrow(() => {
      assertAuthorized(context, { allowedRoles: ['OWNER', 'STAFF'] });
    });
  });
});
