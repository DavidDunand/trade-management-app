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

-- Allow authenticated users to read/write invoices
CREATE POLICY "invoices_all" ON public.invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. retro_payments table (tracks payables: one row per trade)
CREATE TABLE IF NOT EXISTS public.retro_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id        uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  payment_status  text NOT NULL DEFAULT 'invoice_not_received'
                    CHECK (payment_status IN (
                      'invoice_not_received',
                      'invoice_received',
                      'invoice_pending_amendment',
                      'payment_approved'
                    )),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id)
);

ALTER TABLE public.retro_payments ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write retro_payments
CREATE POLICY "retro_payments_all" ON public.retro_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger to auto-update updated_at on retro_payments
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
