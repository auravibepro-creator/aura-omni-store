-- 1. Inline admin/role checks so RLS no longer needs an app-callable SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND _user_id IS NOT NULL
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- user_roles: own rows only (admin tooling uses the privileged server client)
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::public.app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::public.app_role));

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::public.app_role))
  WITH CHECK (auth.uid() = id OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::public.app_role));

-- wallet ledger
DROP POLICY IF EXISTS "Admins view wallet ledger" ON public.wallet_ledger;
CREATE POLICY "Admins view wallet ledger" ON public.wallet_ledger
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::public.app_role));

-- staff settings
DROP POLICY IF EXISTS "Staff can view own settings" ON public.staff_settings;
CREATE POLICY "Staff can view own settings" ON public.staff_settings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage staff settings" ON public.staff_settings;
CREATE POLICY "Admins manage staff settings" ON public.staff_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::public.app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::public.app_role));

-- orders
DROP POLICY IF EXISTS "Customers view own orders" ON public.orders;
CREATE POLICY "Customers view own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR auth.uid() = sales_agent_id OR auth.uid() = delivery_agent_id
    OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin'::public.app_role, 'agent'::public.app_role))
  );

DROP POLICY IF EXISTS "Staff update assigned orders" ON public.orders;
CREATE POLICY "Staff update assigned orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = sales_agent_id OR auth.uid() = delivery_agent_id
    OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::public.app_role)
  )
  WITH CHECK (
    auth.uid() = sales_agent_id OR auth.uid() = delivery_agent_id
    OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::public.app_role)
  );

-- order items
DROP POLICY IF EXISTS "Order items follow order visibility" ON public.order_items;
CREATE POLICY "Order items follow order visibility" ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        o.user_id = auth.uid() OR o.sales_agent_id = auth.uid() OR o.delivery_agent_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin'::public.app_role, 'agent'::public.app_role))
      )
  ));

-- support agents / threads
DROP POLICY IF EXISTS "Staff view support agents" ON public.support_agents;
CREATE POLICY "Staff view support agents" ON public.support_agents
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::public.app_role));

DROP POLICY IF EXISTS "Staff view support threads" ON public.support_threads;
CREATE POLICY "Staff view support threads" ON public.support_threads
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.support_agents a WHERE a.id = support_threads.agent_id AND a.user_id = auth.uid())
  );

-- 2. order_items can never be updated or deleted through the Data API
REVOKE UPDATE, DELETE ON public.order_items FROM anon, authenticated;
DROP POLICY IF EXISTS "No one can modify order items" ON public.order_items;
CREATE POLICY "No one can modify order items" ON public.order_items
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "No one can delete order items" ON public.order_items;
CREATE POLICY "No one can delete order items" ON public.order_items
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- 3. Validate and throttle guest order creation
CREATE OR REPLACE FUNCTION public.validate_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent integer;
BEGIN
  IF length(btrim(NEW.customer_name)) < 2 OR length(NEW.customer_name) > 80 THEN
    RAISE EXCEPTION 'Please enter a valid name';
  END IF;
  IF length(btrim(NEW.customer_phone)) < 7 OR length(NEW.customer_phone) > 20 THEN
    RAISE EXCEPTION 'Please enter a valid phone number';
  END IF;
  IF length(btrim(NEW.address)) < 5 OR length(NEW.address) > 300 THEN
    RAISE EXCEPTION 'Please enter a valid address';
  END IF;
  IF length(COALESCE(NEW.notes, '')) > 500 THEN
    RAISE EXCEPTION 'Notes are too long';
  END IF;
  IF NEW.subtotal < 0 OR NEW.shipping < 0 OR NEW.total < 0 OR NEW.total > 10000000 THEN
    RAISE EXCEPTION 'Order totals are invalid';
  END IF;

  SELECT count(*) INTO recent
  FROM public.orders o
  WHERE o.customer_phone = NEW.customer_phone
    AND o.created_at > now() - interval '10 minutes';

  IF recent >= 5 THEN
    RAISE EXCEPTION 'Too many orders placed recently. Please try again in a few minutes.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_new_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_orders_before_insert ON public.orders;
CREATE TRIGGER validate_orders_before_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_new_order();