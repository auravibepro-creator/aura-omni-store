CREATE TABLE public.payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'jazzcash',
  account_title text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  bank_name text,
  instructions text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_accounts TO anon, authenticated;
GRANT ALL ON public.payment_accounts TO service_role;
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active payment accounts are publicly viewable" ON public.payment_accounts FOR SELECT TO anon, authenticated USING (is_active);

CREATE TABLE public.wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'in',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'PKR',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_ledger TO authenticated;
GRANT ALL ON public.wallet_ledger TO service_role;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view wallet ledger" ON public.wallet_ledger FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.support_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL DEFAULT '',
  phone text,
  channels text[] NOT NULL DEFAULT ARRAY['chat','call']::text[],
  is_online boolean NOT NULL DEFAULT true,
  capacity integer NOT NULL DEFAULT 5,
  active_load integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.support_agents TO authenticated;
GRANT ALL ON public.support_agents TO service_role;
ALTER TABLE public.support_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view support agents" ON public.support_agents FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id);

CREATE TABLE public.support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL DEFAULT 'chat',
  customer_name text NOT NULL DEFAULT '',
  customer_phone text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  agent_id uuid REFERENCES public.support_agents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.support_threads TO authenticated;
GRANT ALL ON public.support_threads TO service_role;
ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view support threads" ON public.support_threads FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role) OR EXISTS (SELECT 1 FROM public.support_agents a WHERE a.id = support_threads.agent_id AND a.user_id = auth.uid()));

CREATE TRIGGER update_payment_accounts_updated_at BEFORE UPDATE ON public.payment_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_support_agents_updated_at BEFORE UPDATE ON public.support_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_support_threads_updated_at BEFORE UPDATE ON public.support_threads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.payment_accounts (provider, account_title, account_number, bank_name, sort_order) VALUES
  ('jazzcash', 'Aura Vibe Retail', '0308-0841880', NULL, 0),
  ('easypaisa', 'Aura Vibe Retail', '0345-1234567', NULL, 1),
  ('bank', 'Aura Vibe Retail (Pvt)', 'PK36MEZN0001234567890123', 'Meezan Bank', 2);

INSERT INTO public.support_agents (name, phone, channels, sort_order) VALUES
  ('Support Desk 1', '923080841880', ARRAY['chat','call']::text[], 0),
  ('Support Desk 2', '923080841881', ARRAY['chat','call']::text[], 1);