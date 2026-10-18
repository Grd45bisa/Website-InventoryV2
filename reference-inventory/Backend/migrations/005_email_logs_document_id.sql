-- Allow purchase_order_id to be nullable so email_logs can also log document emails (goods_out, etc.)
ALTER TABLE IF EXISTS public.email_logs ALTER COLUMN purchase_order_id DROP NOT NULL;

-- Add document_id reference column
ALTER TABLE IF EXISTS public.email_logs ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_email_logs_doc
  ON public.email_logs(document_id, created_at DESC);
