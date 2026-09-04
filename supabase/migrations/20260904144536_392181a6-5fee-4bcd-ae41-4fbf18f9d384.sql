CREATE TABLE public.webauthn_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('admin','vendor')),
  vendor_username TEXT,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT '{}',
  label TEXT NOT NULL DEFAULT 'This device',
  secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
GRANT ALL ON public.webauthn_credentials TO service_role;
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.webauthn_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  purpose TEXT NOT NULL,
  vendor_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '5 minutes'
);
GRANT ALL ON public.webauthn_challenges TO service_role;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

CREATE INDEX webauthn_credentials_scope_idx ON public.webauthn_credentials (scope, vendor_username);
CREATE INDEX webauthn_challenges_challenge_idx ON public.webauthn_challenges (challenge);

REVOKE ALL ON public.vendors FROM anon, authenticated;
REVOKE ALL ON public.webauthn_credentials FROM anon, authenticated;
REVOKE ALL ON public.webauthn_challenges FROM anon, authenticated;

GRANT ALL ON public.vendors TO service_role;
GRANT ALL ON public.webauthn_credentials TO service_role;
GRANT ALL ON public.webauthn_challenges TO service_role;

ALTER TABLE public.vendors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_challenges FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all client access to vendors" ON public.vendors;
CREATE POLICY "Deny all client access to vendors" ON public.vendors
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny all client access to webauthn_credentials" ON public.webauthn_credentials;
CREATE POLICY "Deny all client access to webauthn_credentials" ON public.webauthn_credentials
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny all client access to webauthn_challenges" ON public.webauthn_challenges;
CREATE POLICY "Deny all client access to webauthn_challenges" ON public.webauthn_challenges
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);