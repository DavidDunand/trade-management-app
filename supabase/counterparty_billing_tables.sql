-- ============================================================
-- COUNTERPARTY BILLING & BANKING — Database migrations
-- Run this in Supabase > SQL Editor
-- ============================================================

-- 1. counterparty_billing (all counterparty types: billing/address details)
CREATE TABLE IF NOT EXISTS public.counterparty_billing (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_id   uuid NOT NULL REFERENCES public.counterparties(id) ON DELETE CASCADE,
  billing_entity    text NOT NULL,
  postal_address    text NOT NULL,
  vat_number        text,
  billing_email     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (counterparty_id)
);

ALTER TABLE public.counterparty_billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "counterparty_billing_all" ON public.counterparty_billing
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Reuse the set_updated_at() function created in the invoicing migration.
-- If you haven't run that yet, uncomment this block:
-- CREATE OR REPLACE FUNCTION public.set_updated_at()
-- RETURNS TRIGGER LANGUAGE plpgsql AS $$
-- BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS counterparty_billing_updated_at ON public.counterparty_billing;
CREATE TRIGGER counterparty_billing_updated_at
  BEFORE UPDATE ON public.counterparty_billing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. counterparty_bank_accounts (internal counterparties only)
--    Multiple accounts per counterparty, multiple per currency allowed.
--    bic is nullable to support UK sort-code / account-number accounts.
CREATE TABLE IF NOT EXISTS public.counterparty_bank_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_id   uuid NOT NULL REFERENCES public.counterparties(id) ON DELETE CASCADE,
  currency          text NOT NULL,
  bank_name         text NOT NULL,
  iban              text,
  account_number    text,
  sort_code         text,
  bic               text,
  intermediary_bic  text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.counterparty_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "counterparty_bank_accounts_all" ON public.counterparty_bank_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- SEED — RiverRock Securities SAS, France
-- Pre-populates billing details and three bank accounts.
-- Safe to re-run: uses ON CONFLICT DO NOTHING / DO UPDATE.
-- ============================================================

DO $$
DECLARE
  cp_id uuid;
BEGIN
  SELECT id INTO cp_id
  FROM public.counterparties
  WHERE cp_type = 'internal'
    AND legal_name ILIKE '%RiverRock Securities SAS%'
  LIMIT 1;

  IF cp_id IS NULL THEN
    RAISE NOTICE 'RiverRock internal counterparty not found — skipping seed.';
    RETURN;
  END IF;

  -- Billing details
  INSERT INTO public.counterparty_billing
    (counterparty_id, billing_entity, postal_address, vat_number)
  VALUES (
    cp_id,
    'RiverRock Securities SAS, France',
    '145-147, boulevard Haussmann. 75008 Paris. France',
    'FR71849190335'
  )
  ON CONFLICT (counterparty_id) DO UPDATE SET
    billing_entity = EXCLUDED.billing_entity,
    postal_address = EXCLUDED.postal_address,
    vat_number     = EXCLUDED.vat_number;

  -- EUR account
  INSERT INTO public.counterparty_bank_accounts
    (counterparty_id, currency, bank_name, iban, bic, intermediary_bic)
  VALUES (
    cp_id, 'EUR', 'Revolut Bank UAB',
    'FR76 2823 3000 0120 0803 3675 733', 'REVOFRP2', 'CHASDEFX'
  );

  -- USD account
  INSERT INTO public.counterparty_bank_accounts
    (counterparty_id, currency, bank_name, iban, bic, intermediary_bic)
  VALUES (
    cp_id, 'USD', 'Revolut Bank UAB',
    'FR76 2823 3000 0120 0803 3675 733', 'REVOFRP2', 'CHASGB2L'
  );

  -- GBP account (sort code / account number, no IBAN/BIC)
  INSERT INTO public.counterparty_bank_accounts
    (counterparty_id, currency, bank_name, account_number, sort_code)
  VALUES (
    cp_id, 'GBP', 'Revolut Ltd', '34898581', '04-29-09'
  );

END $$;
