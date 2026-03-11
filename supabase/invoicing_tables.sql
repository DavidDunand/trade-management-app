-- ============================================================
-- INVOICING MODULE — Database migrations
-- Run this in Supabase > SQL Editor
-- ============================================================

-- 1. invoices table (tracks receivables: one row per trade)
CREATE TABLE IF NOT EXISTS public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id        uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  downloaded_at   timestamptz,
  payment_status  text NOT NULL DEFAULT 'pending'
                    CHECK (payment_status IN ('pending', 'paid')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id)
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_all" ON public.invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2. retro_payments table
--    Tracks payables: one row per (trade, recipient_type).
--    recipient_type is 'client' or 'introducer'.
-- ============================================================

-- Create fresh (if the table never existed)
CREATE TABLE IF NOT EXISTS public.retro_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id        uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  recipient_type  text NOT NULL CHECK (recipient_type IN ('client', 'introducer')),
  payment_status  text NOT NULL DEFAULT 'invoice_not_received'
                    CHECK (payment_status IN (
                      'invoice_not_received',
                      'invoice_received',
                      'invoice_pending_amendment',
                      'payment_approved'
                    )),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id, recipient_type)
);

-- If the table already exists from a previous migration, run these statements
-- to migrate it to the new per-recipient schema:
--
--   ALTER TABLE public.retro_payments
--     ADD COLUMN IF NOT EXISTS recipient_type text
--     CHECK (recipient_type IN ('client', 'introducer'));
--
--   UPDATE public.retro_payments SET recipient_type = 'client' WHERE recipient_type IS NULL;
--
--   ALTER TABLE public.retro_payments ALTER COLUMN recipient_type SET NOT NULL;
--
--   ALTER TABLE public.retro_payments
--     DROP CONSTRAINT IF EXISTS retro_payments_trade_id_key;
--
--   ALTER TABLE public.retro_payments
--     ADD CONSTRAINT retro_payments_trade_id_recipient_type_key
--     UNIQUE (trade_id, recipient_type);

ALTER TABLE public.retro_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retro_payments_all" ON public.retro_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS retro_payments_updated_at ON public.retro_payments;
CREATE TRIGGER retro_payments_updated_at
  BEFORE UPDATE ON public.retro_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
