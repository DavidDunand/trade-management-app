-- Trade tickets log: records every generated ticket file
CREATE TABLE IF NOT EXISTS public.trade_tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leg_id       uuid NOT NULL REFERENCES trade_legs(id) ON DELETE CASCADE,
  contact_id   uuid NOT NULL REFERENCES advisor_contacts(id),
  format       text NOT NULL CHECK (format IN ('docx','pdf','png')),
  generated_by uuid NOT NULL REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trade_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read trade_tickets"
  ON public.trade_tickets FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert trade_tickets"
  ON public.trade_tickets FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Add is_primary to advisor_contacts for Step 4 pre-selection
ALTER TABLE public.advisor_contacts
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
