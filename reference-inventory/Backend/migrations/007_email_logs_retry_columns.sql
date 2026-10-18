-- ============================================================
-- DocuFlow — Email Logs Retry Tracking Migration (Phase 3)
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================
-- Menambahkan kolom pelacak retry ke email_logs agar cron worker
-- (GET/POST /api/cron/retry-emails) bisa memilih baris yang gagal,
-- masih di bawah batas percobaan, dan belum kadaluarsa.
-- Idempotent: aman dijalankan berkali-kali.
-- ============================================================

ALTER TABLE IF EXISTS public.email_logs
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.email_logs
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;

-- Index untuk query worker: pilih baris failed, retry_count < 3, urut created_at.
-- Partial index (hanya baris status='failed') agar tetap kecil & cepat meski
-- tabel email_logs terus bertambah besar (mayoritas baris berstatus 'sent').
CREATE INDEX IF NOT EXISTS idx_email_logs_retry_pending
  ON public.email_logs (created_at DESC)
  WHERE status = 'failed';
