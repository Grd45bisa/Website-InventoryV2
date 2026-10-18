/**
 * DocuFlow Inventory Multi-Owner V2.4.1
 * Supabase Environment Validation (TASK-010)
 * Memastikan URL dan Anon Key tersedia untuk public/client,
 * serta Service Role Key terisolasi ketat di sisi server.
 */

export interface SupabasePublicEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL tidak valid atau belum dikonfigurasi. Periksa file .env Anda.'
    );
  }

  if (!supabaseAnonKey || supabaseAnonKey.includes('placeholder')) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY tidak valid atau belum dikonfigurasi. Periksa file .env Anda.'
    );
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  };
}

export function getSupabaseServiceRoleKey(): string {
  if (typeof window !== 'undefined') {
    throw new Error(
      'PELANGGARAN KEAMANAN: SUPABASE_SERVICE_ROLE_KEY tidak boleh diakses dari sisi browser/client!'
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey || serviceRoleKey.includes('placeholder')) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY tidak valid atau belum dikonfigurasi pada environment server.'
    );
  }

  return serviceRoleKey;
}
