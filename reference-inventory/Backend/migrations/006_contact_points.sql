-- ============================================================
-- DocuFlow — Contact Points & Loyalty Migration
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================
-- Tabel: contact_points
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contact_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust', 'expire', 'refund')),
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,       -- Jumlah nominal cashback dalam Rupiah (+ earn / - redeem)
  point_value NUMERIC(14, 2) NOT NULL DEFAULT 0,  -- Nilai Rupiah dari transaksi cashback ini
  balance_after NUMERIC(14, 2) NOT NULL DEFAULT 0,-- Saldo cashback toko setelah transaksi ini (Rupiah)
  description TEXT,                                -- Keterangan transaksi cashback
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner_id UUID NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_contact_points_contact 
  ON public.contact_points(contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_points_owner 
  ON public.contact_points(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_points_doc 
  ON public.contact_points(document_id);

-- Enable RLS
ALTER TABLE public.contact_points ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Authenticated users can read contact points" ON public.contact_points;
CREATE POLICY "Authenticated users can read contact points" 
  ON public.contact_points 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Service role full access contact_points" ON public.contact_points;
CREATE POLICY "Service role full access contact_points" 
  ON public.contact_points 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);
