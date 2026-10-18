"use server";

/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Authentication Server Actions (TASK-011)
 * Menangani login password, logout aman, pemulihan akun, dan pertukaran sesi.
 * Mendukung SQLite aktif selama mode development tanpa bypass atau kredensial rahasia.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "../supabase/server";
import { validateSignInInput, validatePasswordResetInput } from "./auth-validator";
import { getDatabaseClient } from "../db/sqlite-client";
import {
  SESSION_COOKIE_NAME,
  createLocalSession,
  destroyLocalSession,
  verifyPassword,
} from "./local-auth-service";
import { ensureDatabaseReady } from "./server-session";

export interface AuthActionResult {
  success: boolean;
  error?: string;
}

export async function signInAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get("email");
  const password = formData.get("password");

  const validation = validateSignInInput(email, password);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  const isSqliteMode = process.env.DATABASE_DRIVER === "sqlite" || !process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (isSqliteMode) {
    try {
      ensureDatabaseReady();
      const db = getDatabaseClient();

      const user = db.prepare(`
        SELECT id, email, password_hash, full_name, is_super_admin
        FROM users
        WHERE email = ?
      `).get(validation.sanitizedEmail) as {
        id: string;
        email: string;
        password_hash: string;
        full_name: string;
        is_super_admin: number;
      } | undefined;

      if (!user) {
        return {
          success: false,
          error: "Kredensial login tidak valid. Silakan periksa email dan password Anda.",
        };
      }

      const isPasswordValid = verifyPassword(password as string, user.password_hash);
      if (!isPasswordValid) {
        return {
          success: false,
          error: "Kredensial login tidak valid. Silakan periksa email dan password Anda.",
        };
      }

      // Ambil default membership & gudang
      let initialOwnerId: string | undefined = undefined;
      let initialWarehouseId: string | undefined = undefined;

      if (user.is_super_admin === 1) {
        initialOwnerId = "owner-super-admin";
        initialWarehouseId = "wh-sa-01";
      } else {
        const defaultMembership = db.prepare(`
          SELECT owner_id FROM owner_memberships
          WHERE user_id = ? AND status = 'ACTIVE'
          LIMIT 1
        `).get(user.id) as { owner_id: string } | undefined;

        initialOwnerId = defaultMembership?.owner_id;

        if (initialOwnerId) {
          const assignment = db.prepare(`
            SELECT warehouse_id FROM warehouse_assignments
            WHERE user_id = ? AND owner_id = ? AND status = 'ACTIVE'
            LIMIT 1
          `).get(user.id, initialOwnerId) as { warehouse_id: string } | undefined;

          if (assignment) {
            initialWarehouseId = assignment.warehouse_id;
          } else {
            const firstWh = db.prepare(`
              SELECT id FROM warehouses
              WHERE owner_id = ? AND status = 'ACTIVE'
              LIMIT 1
            `).get(initialOwnerId) as { id: string } | undefined;
            initialWarehouseId = firstWh?.id;
          }
        }
      }

      // Buat session di database SQLite
      const { sessionId } = createLocalSession(
        db,
        user.id,
        initialOwnerId,
        initialWarehouseId
      );

      // Set HttpOnly session cookie
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 3600, // 7 hari
      });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan sistem saat proses login.";
      return {
        success: false,
        error: message,
      };
    }

    revalidatePath("/", "layout");
    redirect("/dashboard");
  }

  // Fallback ke Supabase jika mode SQLite tidak aktif
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: validation.sanitizedEmail!,
      password: password as string,
    });

    if (error) {
      return {
        success: false,
        error: error.message === "Invalid login credentials"
          ? "Kredensial login tidak valid. Silakan periksa email dan password Anda."
          : error.message,
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal saat autentikasi.";
    return {
      success: false,
      error: message,
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const isSqliteMode = process.env.DATABASE_DRIVER === "sqlite" || !process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (isSqliteMode) {
    try {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
      if (sessionCookie?.value) {
        const db = getDatabaseClient();
        destroyLocalSession(db, sessionCookie.value);
      }
      cookieStore.delete(SESSION_COOKIE_NAME);
    } catch {
      // Abaikan error jaringan saat logout
    }

    revalidatePath("/", "layout");
    redirect("/login");
  }

  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Sesi dihapus di sisi server walau request jaringan logout gagal
  }

  revalidatePath("/", "layout");
  redirect("/login");
}

export async function requestPasswordResetAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get("email");

  const validation = validatePasswordResetInput(email);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  const isSqliteMode = process.env.DATABASE_DRIVER === "sqlite" || !process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (isSqliteMode) {
    // Pada mode SQLite dev lokal, catat informasi pengiriman tanpa membocorkan eksistensi akun
    return {
      success: true,
    };
  }

  try {
    const supabase = await createClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const { error } = await supabase.auth.resetPasswordForEmail(validation.sanitizedEmail!, {
      redirectTo: `${appUrl}/auth/callback?next=/settings`,
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal mengirim permintaan reset kata sandi.";
    return {
      success: false,
      error: message,
    };
  }
}

export async function switchContextAction(
  ownerId: string,
  warehouseId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie || !sessionCookie.value) {
    return { success: false, error: "Tidak ada sesi aktif." };
  }

  const db = getDatabaseClient();

  // 1. Verifikasi eksistensi dan validitas sesi
  const sessionRow = db.prepare(`
    SELECT s.user_id, u.is_super_admin
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND datetime(s.expires_at) > datetime('now')
  `).get(sessionCookie.value) as { user_id: string; is_super_admin: number } | undefined;

  if (!sessionRow) {
    return { success: false, error: "Sesi tidak ditemukan atau telah kedaluwarsa." };
  }

  // 2. Verifikasi wewenang pengguna terhadap Owner yang diminta
  if (sessionRow.is_super_admin !== 1) {
    const mem = db.prepare(`
      SELECT id FROM owner_memberships
      WHERE user_id = ? AND owner_id = ? AND status = 'ACTIVE'
    `).get(sessionRow.user_id, ownerId);
    if (!mem) {
      return { success: false, error: "Akses ditolak: Anda bukan anggota aktif dari Owner ini." };
    }
  } else {
    // Super Admin: jika mengakses tenant klien (selain internal), WAJIB memiliki grant aktif
    if (ownerId !== "owner-super-admin") {
      const grant = db.prepare(`
        SELECT id FROM admin_access_grants
        WHERE super_admin_user_id = ? AND target_owner_id = ?
          AND datetime(starts_at) <= datetime('now')
          AND datetime(expires_at) > datetime('now')
          AND revoked_at IS NULL
      `).get(sessionRow.user_id, ownerId);
      if (!grant) {
        return { success: false, error: "Akses ditolak: Super Admin tidak memiliki grant aktif berizin untuk Owner ini." };
      }
    }
  }

  // 3. Verifikasi gudang yang diminta
  if (warehouseId) {
    if (sessionRow.is_super_admin === 1 && ownerId === "owner-super-admin") {
      if (warehouseId !== "wh-sa-01" && warehouseId !== "wh-sa-02") {
        return { success: false, error: "Gudang internal Super Admin tidak valid." };
      }
    } else {
      const wh = db.prepare(`
        SELECT id, owner_id FROM warehouses WHERE id = ? AND status = 'ACTIVE'
      `).get(warehouseId) as { id: string; owner_id: string } | undefined;
      if (!wh || wh.owner_id !== ownerId) {
        return { success: false, error: "Akses ditolak: Gudang tidak valid untuk Owner aktif." };
      }
    }
  }

  const { updateSessionContext } = await import("./local-auth-service");
  const updated = updateSessionContext(db, sessionCookie.value, ownerId, warehouseId);

  if (!updated) {
    return { success: false, error: "Sesi tidak ditemukan atau telah kedaluwarsa." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

