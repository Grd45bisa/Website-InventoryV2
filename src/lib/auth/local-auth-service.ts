/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Local Auth & Session Service (TASK-011)
 * Provider autentikasi server-side development untuk SQLite.
 * Menggunakan password hashing aman (crypto scrypt), session database, dan cookie HttpOnly.
 */

import crypto from "node:crypto";
import type { DatabaseClient } from "../db/sqlite-client.ts";
import { evaluateSecurityContext } from "./context-evaluator.ts";
import type {
  ActiveSecurityContext,
  OwnerMembership,
  SuperAdminGrant,
  UserSession,
  WarehouseAssignment,
} from "../types/auth.ts";

export const SESSION_COOKIE_NAME = "docuflow_session_token";
const SESSION_DURATION_HOURS = 24 * 7; // 7 hari

// ==========================================
// 1. PASSWORD HASHING (scrypt + timingSafeEqual)
// ==========================================

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

// ==========================================
// 2. SESSION STORE (auth_sessions di SQLite)
// ==========================================

export interface StoredSession {
  id: string;
  user_id: string;
  active_owner_id: string | null;
  active_warehouse_id: string | null;
  expires_at: string;
  created_at: string;
}

export function createLocalSession(
  db: DatabaseClient,
  userId: string,
  initialOwnerId?: string,
  initialWarehouseId?: string
): { sessionId: string; expiresAt: string } {
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_HOURS * 3600 * 1000).toISOString();
  const createdAt = now.toISOString();

  // Bersihkan sesi lama yang sudah kedaluwarsa untuk user ini
  db.prepare("DELETE FROM auth_sessions WHERE expires_at < ?").run(createdAt);

  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, active_owner_id, active_warehouse_id, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, userId, initialOwnerId ?? null, initialWarehouseId ?? null, expiresAt, createdAt);

  return { sessionId, expiresAt };
}

export function updateSessionContext(
  db: DatabaseClient,
  sessionId: string,
  ownerId: string,
  warehouseId?: string | null
): boolean {
  const res = db.prepare(`
    UPDATE auth_sessions
    SET active_owner_id = ?, active_warehouse_id = ?
    WHERE id = ? AND datetime(expires_at) > datetime('now')
  `).run(ownerId, warehouseId ?? null, sessionId);

  return res.changes > 0;
}

export function destroyLocalSession(db: DatabaseClient, sessionId: string): void {
  db.prepare("DELETE FROM auth_sessions WHERE id = ?").run(sessionId);
}

// ==========================================
// 3. SERVER SECURITY CONTEXT RESOLVER
// ==========================================

export function resolveSecurityContextFromSession(
  db: DatabaseClient,
  sessionId: string,
  overrideOwnerId?: string,
  overrideWarehouseId?: string
): ActiveSecurityContext | null {
  // 1. Ambil session aktif
  const sessionRow = db.prepare(`
    SELECT s.id, s.user_id, s.active_owner_id, s.active_warehouse_id, s.expires_at,
           u.email, u.full_name, u.is_super_admin
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND datetime(s.expires_at) > datetime('now')
  `).get(sessionId) as {
    id: string;
    user_id: string;
    active_owner_id: string | null;
    active_warehouse_id: string | null;
    email: string;
    full_name: string;
    is_super_admin: number;
  } | undefined;

  if (!sessionRow) {
    return null;
  }

  const userSession: UserSession = {
    userId: sessionRow.user_id,
    email: sessionRow.email,
    fullName: sessionRow.full_name,
  };

  // 2. Ambil keanggotaan Owner user
  const membershipRows = db.prepare(`
    SELECT m.id, m.user_id, m.owner_id, m.role, m.status, o.name AS owner_name
    FROM owner_memberships m
    JOIN owners o ON o.id = m.owner_id
    WHERE m.user_id = ? AND m.status = 'ACTIVE'
  `).all(sessionRow.user_id) as Array<{
    id: string;
    user_id: string;
    owner_id: string;
    role: "OWNER" | "STAFF" | "SALES" | "SUPER_ADMIN";
    status: "ACTIVE" | "SUSPENDED" | "REVOKED";
    owner_name: string;
  }>;

  const memberships: OwnerMembership[] = membershipRows.map((m) => ({
    id: m.id,
    userId: m.user_id,
    ownerId: m.owner_id,
    ownerName: m.owner_name,
    role: m.role,
    status: m.status,
  }));

  // Jika user adalah super admin, pastikan keanggotaan SUPER_ADMIN pada owner-super-admin ada
  if (sessionRow.is_super_admin === 1) {
    if (!memberships.some((m) => m.role === "SUPER_ADMIN")) {
      memberships.push({
        id: `sa-membership-${sessionRow.user_id}`,
        userId: sessionRow.user_id,
        ownerId: "owner-super-admin",
        ownerName: "DocuFlow Internal Operations",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      });
    }
  }

  // 3. Ambil penugasan gudang aktif
  const assignmentRows = db.prepare(`
    SELECT wa.id, wa.user_id, wa.owner_id, wa.warehouse_id, wa.status, w.name AS warehouse_name
    FROM warehouse_assignments wa
    JOIN warehouses w ON w.id = wa.warehouse_id
    WHERE wa.user_id = ? AND wa.status = 'ACTIVE'
  `).all(sessionRow.user_id) as Array<{
    id: string;
    user_id: string;
    owner_id: string;
    warehouse_id: string;
    status: "ACTIVE" | "INACTIVE";
    warehouse_name: string;
  }>;

  const warehouseAssignments: WarehouseAssignment[] = assignmentRows.map((wa) => ({
    id: wa.id,
    userId: wa.user_id,
    ownerId: wa.owner_id,
    warehouseId: wa.warehouse_id,
    warehouseName: wa.warehouse_name,
    status: wa.status,
  }));

  // 4. Ambil grants Super Admin aktif
  const grantRows = db.prepare(`
    SELECT id, super_admin_user_id, target_owner_id, scope, granted_by_user_id, starts_at, expires_at, revoked_at
    FROM admin_access_grants
    WHERE super_admin_user_id = ? AND datetime(starts_at) <= datetime('now') AND datetime(expires_at) > datetime('now') AND revoked_at IS NULL
  `).all(sessionRow.user_id) as Array<{
    id: string;
    super_admin_user_id: string;
    target_owner_id: string;
    scope: string;
    granted_by_user_id: string;
    starts_at: string;
    expires_at: string;
    revoked_at: string | null;
  }>;

  const activeGrants: SuperAdminGrant[] = grantRows.map((g) => ({
    id: g.id,
    superAdminUserId: g.super_admin_user_id,
    targetOwnerId: g.target_owner_id,
    scope: g.scope,
    grantedBy: g.granted_by_user_id,
    startsAt: g.starts_at,
    expiresAt: g.expires_at,
    revokedAt: g.revoked_at,
  }));

  // Tentukan Owner dan Warehouse yang diminta
  let defaultOwnerId = memberships[0]?.ownerId;
  if (sessionRow.is_super_admin === 1) {
    defaultOwnerId = "owner-super-admin";
  }

  const requestedOwnerId =
    overrideOwnerId ??
    (sessionRow.active_owner_id && sessionRow.active_owner_id !== "system-super-admin"
      ? sessionRow.active_owner_id
      : defaultOwnerId);

  let requestedWarehouseId = overrideWarehouseId ?? sessionRow.active_warehouse_id;

  // Jika Super Admin beroperasi di owner-super-admin, pastikan gudang yang diminta valid (wh-sa-01 atau wh-sa-02)
  if (sessionRow.is_super_admin === 1 && requestedOwnerId === "owner-super-admin") {
    if (!requestedWarehouseId || (requestedWarehouseId !== "wh-sa-01" && requestedWarehouseId !== "wh-sa-02")) {
      requestedWarehouseId = "wh-sa-01";
    }
  }

  if (!requestedOwnerId) {
    return null;
  }

  const ownerRecord = db.prepare("SELECT name FROM owners WHERE id = ?").get(requestedOwnerId) as { name: string } | undefined;
  const warehouseRecord = requestedWarehouseId
    ? (db.prepare("SELECT name FROM warehouses WHERE id = ?").get(requestedWarehouseId) as { name: string } | undefined)
    : undefined;

  // Evaluasi konteks keamanan menggunakan aturan ketat context-evaluator (TASK-012 & AGENTS.md)
  try {
    return evaluateSecurityContext({
      session: userSession,
      requestedOwnerId,
      requestedWarehouseId,
      requestedOwnerName: ownerRecord?.name,
      requestedWarehouseName: warehouseRecord?.name,
      memberships,
      warehouseAssignments,
      activeGrants,
    });
  } catch {
    // Jika requestedOwnerId/WarehouseId tidak valid, coba fallback ke membership/internal default yang sah
    const fallbackOwnerId =
      sessionRow.is_super_admin === 1
        ? "owner-super-admin"
        : memberships[0]?.ownerId;

    if (!fallbackOwnerId) return null;

    const fallbackOwnerRecord = db.prepare("SELECT name FROM owners WHERE id = ?").get(fallbackOwnerId) as { name: string } | undefined;
    const fallbackWarehouseId = sessionRow.is_super_admin === 1 ? "wh-sa-01" : null;

    return evaluateSecurityContext({
      session: userSession,
      requestedOwnerId: fallbackOwnerId,
      requestedWarehouseId: fallbackWarehouseId,
      requestedOwnerName: fallbackOwnerRecord?.name,
      memberships,
      warehouseAssignments,
      activeGrants,
    });
  }
}
