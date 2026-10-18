/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Supabase Server Client (TASK-010)
 * Digunakan oleh Server Components, Server Actions, dan Route Handlers.
 * Berjalan aman di server dengan session cookie store Next.js.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabasePublicEnv } from './env.ts';

export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicEnv();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Dipanggil dari Server Component di mana cookie tidak dapat diset.
          // Aman diabaikan selama Route Handlers / Server Actions menyegarkan sesi.
        }
      },
    },
  });
}
