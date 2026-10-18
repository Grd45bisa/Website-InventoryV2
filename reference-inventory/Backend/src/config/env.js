import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  FRONTEND_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NVIDIA_API_KEY: z.string().optional(),
  // Melindungi endpoint cron worker (GET/POST /api/cron/retry-emails) dari akses publik.
  // Vercel Cron otomatis mengirim header `Authorization: Bearer <CRON_SECRET>` saat
  // env var ini di-set di Project Settings. Opsional di env schema agar deployment yang
  // belum mengaktifkan cron tidak gagal start; endpoint sendiri menolak semua request
  // jika CRON_SECRET belum dikonfigurasi (lihat cron.routes.js).
  CRON_SECRET: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  const hint = process.env.NODE_ENV === 'production'
    ? ' On Vercel, set these in the Project Settings → Environment Variables dashboard.'
    : ' Check your .env file against .env.example.';
  throw new Error(`Invalid backend environment: ${details}${hint}`);
}

export const env = parsed.data;
