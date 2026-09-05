-- 1) Orders: prevent spoofed identity / agent assignment on insert
DROP POLICY IF EXISTS "Anyone can place an order" ON public.orders;
CREATE POLICY "Place own order without staff fields"
  ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND sales_agent_id IS NULL
    AND delivery_agent_id IS NULL
    AND commission_amount = 0
    AND status = 'pending'
  );

-- 2) Order items: only attachable to a fresh order owned by the caller
DROP POLICY IF EXISTS "Anyone can add order items" ON public.order_items;
CREATE POLICY "Add items to own fresh order"
  ON public.order_items FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (o.user_id = auth.uid() OR (o.user_id IS NULL AND auth.uid() IS NULL))
        AND o.created_at > now() - interval '15 minutes'
    )
  );

-- 3) Payment accounts: no public exposure of account numbers
DROP POLICY IF EXISTS "Active payment accounts are publicly viewable" ON public.payment_accounts;
REVOKE ALL ON public.payment_accounts FROM anon, authenticated;
GRANT ALL ON public.payment_accounts TO service_role;
ALTER TABLE public.payment_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY "Deny client access to payment accounts"
  ON public.payment_accounts AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 4) SECURITY DEFINER signup helper should not be callable by clients
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin, service_role;
