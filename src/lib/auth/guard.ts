/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Server Guard & Permission Assertion
 */

import type { ActiveSecurityContext, UserRole } from '../types/auth.ts';
import { AppError } from '../errors/app-error.ts';

export interface GuardOptions {
  allowedRoles?: UserRole[];
  requireWarehouse?: boolean;
}

/**
 * Menegakkan izin akses pada Server Action atau Route Handler.
 * Memastikan context tidak kosong, role diizinkan, dan konteks gudang terpenuhi jika diwajibkan.
 */
export function assertAuthorized(
  context: ActiveSecurityContext | null | undefined,
  options: GuardOptions = {}
): asserts context is ActiveSecurityContext {
  if (!context) {
    throw new AppError('ERR_UNAUTHORIZED', 'Konteks autentikasi tidak tersedia', 401);
  }

  // 1. Verifikasi Role
  if (options.allowedRoles && options.allowedRoles.length > 0) {
    const isAllowed = options.allowedRoles.includes(context.role);
    if (!isAllowed) {
      throw new AppError(
        'ERR_FORBIDDEN_ROLE',
        `Role '${context.role}' tidak memiliki wewenang untuk melakukan tindakan ini`,
        403,
        { requiredRoles: options.allowedRoles, currentRole: context.role }
      );
    }
  }

  // 2. Verifikasi Gudang jika diwajibkan
  if (options.requireWarehouse && !context.warehouseId) {
    throw new AppError(
      'ERR_FORBIDDEN_WAREHOUSE',
      'Operasi inventaris ini membutuhkan pemilihan gudang aktif yang sah',
      403
    );
  }
}
