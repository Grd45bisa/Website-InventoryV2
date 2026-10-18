/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Supabase Browser Client (TASK-010)
 * Digunakan oleh Client Components untuk interaksi Supabase di browser dengan RLS aktif.
 */

import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicEnv } from './env.ts';

export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabasePublicEnv();
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
