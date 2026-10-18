/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Core Auth, Membership, dan Security Context Types
 */

export type UserRole = 'OWNER' | 'STAFF' | 'SALES' | 'SUPER_ADMIN';

export type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export type AssignmentStatus = 'ACTIVE' | 'INACTIVE';

export interface UserSession {
  userId: string;
  email: string;
  fullName: string;
  isSuperAdmin?: boolean;
}

export interface OwnerMembership {
  id: string;
  userId: string;
  ownerId: string;
  ownerName: string;
  role: UserRole;
  status: MembershipStatus;
  isDefault?: boolean;
}

export interface WarehouseAssignment {
  id: string;
  userId: string;
  warehouseId: string;
  warehouseName: string;
  ownerId: string;
  status: AssignmentStatus;
}

export interface SuperAdminGrant {
  id: string;
  superAdminUserId: string;
  targetOwnerId: string;
  scope: string; // e.g. "SUPPORT_READONLY", "MAINTENANCE"
  grantedBy: string; // Owner User ID yang memberikan izin
  startsAt: string; // ISO DateTime
  expiresAt: string; // ISO DateTime
  revokedAt: string | null;
  isEmergencyBreakGlass?: boolean;
}

export interface ActiveSecurityContext {
  userId: string;
  email: string;
  ownerId: string;
  ownerName: string;
  warehouseId: string | null;
  warehouseName: string | null;
  role: UserRole;
  isSuperAdminOnBehalf: boolean;
  grantId: string | null;
}
