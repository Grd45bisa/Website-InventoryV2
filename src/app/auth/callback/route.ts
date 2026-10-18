import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Supabase Auth Callback Route (TASK-010 & TASK-011)
 * Menangani pertukaran authorization code (PKCE) untuk konfirmasi email,
 * password recovery, atau undangan pengguna.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        // Cegah Open Redirect: Pastikan tujuan diawali tanda '/' dan bukan domain eksternal
        const safePath = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
        return NextResponse.redirect(`${origin}${safePath}`);
      }
    } catch {
      // Gagal menukar kode
    }
  }

  // Jika gagal atau code tidak valid, arahkan kembali ke halaman login dengan pesan error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
