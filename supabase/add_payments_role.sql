-- Add 'payments' role to the user_role enum
-- Apply in Supabase SQL editor, then run: NOTIFY pgrst, 'reload schema';

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'payments';
