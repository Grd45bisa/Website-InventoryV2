/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Server-Side Context Evaluator
 * Menegakkan isolasi data multi-Owner, pembatasan gudang, dan otorisasi Super Admin grant
 */

import type {
  ActiveSecurityContext,
  OwnerMembership,
  SuperAdminGrant,
  UserSession,
  WarehouseAssignment,
} from '../types/auth.ts';
import {
  createForbiddenOwnerError,
  createForbiddenSuperAdminError,
  createForbiddenWarehouseError,
  createUnauthorizedError,
} from '../errors/app-error.ts';

export interface EvaluateContextParams {
  session: UserSession | null;
  requestedOwnerId: string;
  requestedWarehouseId?: string | null;
  requestedOwnerName?: string;
  requestedWarehouseName?: string;
  memberships: OwnerMembership[];
  warehouseAssignments: WarehouseAssignment[];
  activeGrants?: SuperAdminGrant[];
  currentTime?: string;
}

/**
 * Mengevaluasi dan memvalidasi konteks keamanan di sisi server.
 * Default-deny: Request tidak dipercaya sampai keanggotaan dan penugasan terverifikasi di database.
 */
export function evaluateSecurityContext(params: EvaluateContextParams): ActiveSecurityContext {
  const {
    session,
    requestedOwnerId,
    requestedWarehouseId = null,
    requestedOwnerName,
    requestedWarehouseName,
    memberships,
    warehouseAssignments,
    activeGrants = [],
    currentTime,
  } = params;

  // 1. Verifikasi Sesi
  if (!session || !session.userId) {
    throw createUnauthorizedError('Sesi tidak ditemukan atau kedaluwarsa');
  }

  // 2. Evaluasi Super Admin
  const isSuperAdmin = Boolean(
    session.isSuperAdmin ||
      memberships.some((m) => m.role === 'SUPER_ADMIN' && m.status === 'ACTIVE')
  );

  if (isSuperAdmin) {
    // Mode Operasional Internal Super Admin
    // Super Admin memiliki tepat dua gudang internal miliknya sendiri (wh-sa-01 & wh-sa-02)
    if (requestedOwnerId === 'owner-super-admin') {
      const allowedInternalWarehouses = ['wh-sa-01', 'wh-sa-02'];
      let targetWarehouseId = requestedWarehouseId;

      if (targetWarehouseId && !allowedInternalWarehouses.includes(targetWarehouseId)) {
        throw createForbiddenWarehouseError(
          `Akses ditolak: Gudang ${targetWarehouseId} bukan gudang internal Super Admin.`
        );
      }

      if (!targetWarehouseId) {
        targetWarehouseId = 'wh-sa-01';
      }

      const whName =
        requestedWarehouseName ??
        (targetWarehouseId === 'wh-sa-01' ? 'Gudang SA-01' : 'Gudang SA-02');

      return {
        userId: session.userId,
        email: session.email,
        ownerId: 'owner-super-admin',
        ownerName: requestedOwnerName ?? 'DocuFlow Internal Operations',
        warehouseId: targetWarehouseId,
        warehouseName: whName,
        role: 'SUPER_ADMIN',
        isSuperAdminOnBehalf: false,
        grantId: null,
      };
    }

    // Super Admin mencoba mengakses data operasional Owner Klien (owner-alpha, owner-beta, dll.)
    // WAJIB memiliki grant aktif, sah, dan belum dicabut.
    const nowIso = currentTime ?? new Date().toISOString();
    const validGrant = activeGrants.find((g) => {
      if (g.superAdminUserId !== session.userId) return false;
      if (g.targetOwnerId !== requestedOwnerId) return false;
      if (g.revokedAt) return false;
      return g.startsAt <= nowIso && g.expiresAt > nowIso;
    });

    if (!validGrant) {
      throw createForbiddenSuperAdminError(
        'Akses operasional ditolak: Super Admin tidak memiliki grant aktif berizin untuk Owner ini'
      );
    }

    // Grant sah: Berikan akses atas nama Owner dengan wewenang penuh
    const resolvedOwnerName =
      requestedOwnerName ??
      memberships.find((m) => m.ownerId === requestedOwnerId)?.ownerName ??
      `Owner [${requestedOwnerId}]`;

    return {
      userId: session.userId,
      email: session.email,
      ownerId: requestedOwnerId,
      ownerName: resolvedOwnerName,
      warehouseId: requestedWarehouseId,
      warehouseName: requestedWarehouseName ?? (requestedWarehouseId ? `Warehouse [${requestedWarehouseId}]` : null),
      role: 'SUPER_ADMIN',
      isSuperAdminOnBehalf: true,
      grantId: validGrant.id,
    };
  }

  // 3. Evaluasi Membership Reguler (Multi-Owner)
  const targetMembership = memberships.find(
    (m) => m.ownerId === requestedOwnerId && m.status === 'ACTIVE'
  );

  if (!targetMembership) {
    throw createForbiddenOwnerError(
      `Akses ditolak: Pengguna tidak memiliki keanggotaan aktif pada Owner ${requestedOwnerId}`
    );
  }

  // 4. Evaluasi Penugasan Gudang (Warehouse Assignment)
  let validatedWarehouseId: string | null = null;
  let validatedWarehouseName: string | null = null;

  if (targetMembership.role === 'OWNER') {
    // Owner memiliki wewenang mengelola seluruh gudang miliknya
    validatedWarehouseId = requestedWarehouseId;
    validatedWarehouseName = requestedWarehouseId ? `Gudang [${requestedWarehouseId}]` : null;
  } else {
    // Staff atau Sales wajib dibatasi HANYA pada gudang penugasan aktif
    const activeAssignments = warehouseAssignments.filter(
      (a) => a.ownerId === requestedOwnerId && a.status === 'ACTIVE'
    );

    if (activeAssignments.length === 0) {
      throw createForbiddenWarehouseError(
        'Pengguna belum memiliki penugasan gudang aktif pada Owner ini'
      );
    }

    if (!requestedWarehouseId) {
      // Default ke gudang penugasan pertama jika tidak dispesifikasikan secara eksplisit
      validatedWarehouseId = activeAssignments[0].warehouseId;
      validatedWarehouseName = activeAssignments[0].warehouseName;
    } else {
      // Verifikasi apakah requestedWarehouseId ada dalam daftar penugasan aktif
      const matched = activeAssignments.find((a) => a.warehouseId === requestedWarehouseId);
      if (!matched) {
        throw createForbiddenWarehouseError(
          `Akses ditolak: Anda tidak ditugaskan pada gudang ${requestedWarehouseId}`
        );
      }
      validatedWarehouseId = matched.warehouseId;
      validatedWarehouseName = matched.warehouseName;
    }
  }

  return {
    userId: session.userId,
    email: session.email,
    ownerId: targetMembership.ownerId,
    ownerName: targetMembership.ownerName,
    warehouseId: validatedWarehouseId,
    warehouseName: validatedWarehouseName,
    role: targetMembership.role,
    isSuperAdminOnBehalf: false,
    grantId: null,
  };
}
