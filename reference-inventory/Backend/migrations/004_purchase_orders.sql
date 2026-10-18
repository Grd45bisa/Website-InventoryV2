-- ============================================================
-- DocuFlow — Purchase Orders Tables Migration
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================
-- Tabel: purchase_orders, purchase_order_items, email_logs
-- ============================================================

-- ----------------------------------------------------------------
-- 1. purchase_orders
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number VARCHAR(20) NOT NULL,
  po_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vendor_name VARCHAR(255) NOT NULL,
  sales_person_id UUID NOT NULL REFERENCES profiles(id),
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, submitted, approved, cancelled
  notes TEXT,
  owner_id UUID NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT purchase_orders_owner_po_number_key UNIQUE (owner_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_owner
  ON purchase_orders(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_sales_person
  ON purchase_orders(sales_person_id, created_at DESC);

-- ----------------------------------------------------------------
-- 2. purchase_order_items
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po
  ON purchase_order_items(purchase_order_id);

-- ----------------------------------------------------------------
-- 3. email_logs (tracking pengiriman email PO)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
  sender_email VARCHAR(255) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  cc_email VARCHAR(255),
  subject VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, sent, failed
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_po
  ON email_logs(purchase_order_id, created_at DESC);

-- ----------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Service role (backend) memiliki akses penuh; RLS di-bypass oleh service_role key.
-- Policy berikut mengizinkan akses dasar via anon/auth (opsional, karena backend pakai service role).
CREATE POLICY "Service role full access purchase_orders"
  ON purchase_orders FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access purchase_order_items"
  ON purchase_order_items FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access email_logs"
  ON email_logs FOR ALL
  USING (true) WITH CHECK (true);