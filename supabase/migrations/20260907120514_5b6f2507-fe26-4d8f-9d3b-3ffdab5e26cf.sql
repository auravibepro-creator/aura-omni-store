CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- user_roles: no self-referencing subquery (was causing infinite recursion / 500s)
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Customers view own orders" ON public.orders;
CREATE POLICY "Customers view own orders" ON public.orders FOR SELECT TO authenticated
USING (
  auth.uid() = user_id OR auth.uid() = sales_agent_id OR auth.uid() = delivery_agent_id
  OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'agent')
);

DROP POLICY IF EXISTS "Staff update assigned orders" ON public.orders;
CREATE POLICY "Staff update assigned orders" ON public.orders FOR UPDATE TO authenticated
USING (auth.uid() = sales_agent_id OR auth.uid() = delivery_agent_id OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = sales_agent_id OR auth.uid() = delivery_agent_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Order items follow order visibility" ON public.order_items;
CREATE POLICY "Order items follow order visibility" ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND (o.user_id = auth.uid() OR o.sales_agent_id = auth.uid() OR o.delivery_agent_id = auth.uid()
         OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'agent'))
));

DROP POLICY IF EXISTS "Staff can view own settings" ON public.staff_settings;
CREATE POLICY "Staff can view own settings" ON public.staff_settings FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage staff settings" ON public.staff_settings;
CREATE POLICY "Admins manage staff settings" ON public.staff_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Staff view support agents" ON public.support_agents;
CREATE POLICY "Staff view support agents" ON public.support_agents FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Staff view support threads" ON public.support_threads;
CREATE POLICY "Staff view support threads" ON public.support_threads FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.support_agents a WHERE a.id = support_threads.agent_id AND a.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Admins view wallet ledger" ON public.wallet_ledger;
CREATE POLICY "Admins view wallet ledger" ON public.wallet_ledger FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));