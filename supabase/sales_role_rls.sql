-- ============================================================
-- Sales role + RLS hardening migration
-- Apply manually in Supabase SQL editor
-- After applying, run: NOTIFY pgrst, 'reload schema';
-- ============================================================

-- ─── 1. Add 'sales' to the user_role enum ───────────────────
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'sales';


-- ─── 2. Add sales_person_id FK to profiles ──────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sales_person_id uuid
    REFERENCES public.sales_people(id) ON DELETE SET NULL;


-- ─── 3. Helper: returns the full name of the linked sales person ─
--  SECURITY DEFINER so it can read profiles without extra policies.
CREATE OR REPLACE FUNCTION public.get_my_sales_name()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT sp.first_name || ' ' || sp.family_name
  FROM public.profiles  p
  JOIN public.sales_people sp ON sp.id = p.sales_person_id
  WHERE p.id = auth.uid()
$$;


-- ─── 4. trades — ensure a permissive SELECT policy exists ───
--  Admins and readonly users see all active rows.
--  (Re-creates it safely; does not break anything if already present.)
DROP POLICY IF EXISTS "trades_select_active"   ON public.trades;
DROP POLICY IF EXISTS "trades_select_all"       ON public.trades;

CREATE POLICY "trades_select_active" ON public.trades
  FOR SELECT TO authenticated
  USING (public.is_active_user());


-- ─── 5. trades — RESTRICTIVE policy that gates sales users ──
--  RESTRICTIVE policies AND with permissive ones, so a sales user
--  must satisfy BOTH the permissive policy above AND this one.
--  Non-sales users are always permitted through (USING = true).
DROP POLICY IF EXISTS "trades_sales_restrict" ON public.trades;

CREATE POLICY "trades_sales_restrict" ON public.trades
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid())
      != 'sales'::public.user_role
    OR
    sales_name = public.get_my_sales_name()
  );


-- ─── 6. trade_legs — ensure a permissive SELECT policy exists ─
DROP POLICY IF EXISTS "trade_legs_select_active" ON public.trade_legs;
DROP POLICY IF EXISTS "trade_legs_select_all"    ON public.trade_legs;

CREATE POLICY "trade_legs_select_active" ON public.trade_legs
  FOR SELECT TO authenticated
  USING (public.is_active_user());


-- ─── 7. trade_legs — RESTRICTIVE policy for sales users ─────
DROP POLICY IF EXISTS "trade_legs_sales_restrict" ON public.trade_legs;

CREATE POLICY "trade_legs_sales_restrict" ON public.trade_legs
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid())
      != 'sales'::public.user_role
    OR
    EXISTS (
      SELECT 1
      FROM public.trades t
      WHERE t.id = trade_legs.trade_id
        AND t.sales_name = public.get_my_sales_name()
    )
  );


-- ─── 8. trades_analytics_v — enforce RLS on underlying tables ─
--  Without security_invoker, the view runs as its owner and bypasses
--  RLS on trades entirely. This one line closes that gap.
ALTER VIEW public.trades_analytics_v SET (security_invoker = true);


-- ─── Done ────────────────────────────────────────────────────
-- After running this migration:
--   NOTIFY pgrst, 'reload schema';
--
-- Then in Supabase Auth dashboard, create the sales user account,
-- and insert a profiles row:
--   INSERT INTO public.profiles (id, email, full_name, role, sales_person_id)
--   VALUES (
--     '<auth-user-uuid>',
--     '<email>',
--     '<First Last>',
--     'sales',
--     (SELECT id FROM public.sales_people WHERE first_name = 'X' AND family_name = 'Y')
--   );
