/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Supabase Admin / Service Role Client (TASK-010)
 * DILARANG KERAS DIIMPORT DI SISI BROWSER / CLIENT COMPONENT.
 * Hanya untuk RPC internal, webhook, dan job administratif server-side yang diaudit.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabasePublicEnv, getSupabaseServiceRoleKey } from './env.ts';

export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error(
      'PELANGGARAN KEAMANAN: createAdminClient hanya boleh dieksekusi di sisi server!'
    );
  }

  const { supabaseUrl } = getSupabasePublicEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
