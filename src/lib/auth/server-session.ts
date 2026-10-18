/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Server Session & Context Integration (TASK-011 & TASK-012)
 * Bertanggung jawab mengekstrak sesi aktif pengguna dari cookie server
 * dan menegakkan proteksi halaman privat di level Server Component.
 */

import { cookies } from "next/headers";
import { getDatabaseClient } from "../db/sqlite-client";
import { runMigrations } from "../db/migrator";
import { seedSyntheticData } from "../db/seed";
import {
  SESSION_COOKIE_NAME,
  resolveSecurityContextFromSession,
} from "./local-auth-service";
import type { ActiveSecurityContext, UserRole } from "../types/auth";

export interface ServerSessionData {
  sessionId: string;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
  context: ActiveSecurityContext;
  availableWarehouses: Array<{ id: string; name: string }>;
  availableOwners: Array<{ id: string; name: string; role: UserRole }>;
}

let isInitialized = false;

/**
 * Memastikan skema dan seed awal terpasang secara otomatis di development
 */
export function ensureDatabaseReady(): void {
  if (isInitialized) return;

  try {
    const db = getDatabaseClient();
    runMigrations(db);
    seedSyntheticData(db);
    isInitialized = true;
  } catch (err) {
    console.error("Gagal menginisialisasi database SQLite:", err);
  }
}

/**
 * Mengambil konteks keamanan sesi yang terautentikasi di Server Component / Route Handler.
 * Mengembalikan null jika pengguna belum login atau sesi telah kedaluwarsa.
 */
export async function getServerSessionContext(): Promise<ServerSessionData | null> {
  ensureDatabaseReady();

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const db = getDatabaseClient();
  const sessionId = sessionCookie.value;

  const context = resolveSecurityContextFromSession(db, sessionId);
  if (!context) {
    return null;
  }

  // Ambil detail profil user
  const userRow = db.prepare(`
    SELECT id, email, full_name
    FROM users
    WHERE id = ?
  `).get(context.userId) as { id: string; email: string; full_name: string } | undefined;

  if (!userRow) {
    return null;
  }

  // Ambil daftar gudang yang dapat diakses oleh context.ownerId aktif
  const warehouseRows = db.prepare(`
    SELECT id, name
    FROM warehouses
    WHERE owner_id = ? AND status = 'ACTIVE'
    ORDER BY name ASC
  `).all(context.ownerId) as Array<{ id: string; name: string }>;

  // Ambil daftar Owner yang menjadi keanggotaan user
  const ownerRows = db.prepare(`
    SELECT m.owner_id, m.role, o.name AS owner_name
    FROM owner_memberships m
    JOIN owners o ON o.id = m.owner_id
    WHERE m.user_id = ? AND m.status = 'ACTIVE'
  `).all(context.userId) as Array<{
    owner_id: string;
    role: UserRole;
    owner_name: string;
  }>;

  // Jika pengguna adalah Super Admin, sertakan seluruh Owner yang tercakup dalam grant aktif
  if (context.role === "SUPER_ADMIN") {
    const grantRows = db.prepare(`
      SELECT g.target_owner_id AS owner_id, 'SUPER_ADMIN' AS role, o.name AS owner_name
      FROM admin_access_grants g
      JOIN owners o ON o.id = g.target_owner_id
      WHERE g.super_admin_user_id = ?
        AND datetime(g.starts_at) <= datetime('now')
        AND datetime(g.expires_at) > datetime('now')
        AND g.revoked_at IS NULL
    `).all(context.userId) as Array<{
      owner_id: string;
      role: UserRole;
      owner_name: string;
    }>;

    for (const gr of grantRows) {
      if (!ownerRows.some((o) => o.owner_id === gr.owner_id)) {
        ownerRows.push(gr);
      }
    }
  }

  const availableOwners = ownerRows.map((r) => ({
    id: r.owner_id,
    name: r.owner_name,
    role: r.role,
  }));

  const availableWarehouses = warehouseRows.map((w) => ({
    id: w.id,
    name: w.name,
  }));

  return {
    sessionId,
    user: {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
    },
    context: JSON.parse(JSON.stringify(context)),
    availableWarehouses,
    availableOwners,
  };
}
