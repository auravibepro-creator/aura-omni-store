ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS must_onboard boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key
  ON public.profiles (lower(username)) WHERE username IS NOT NULL;

ALTER TABLE public.webauthn_credentials DROP CONSTRAINT IF EXISTS webauthn_credentials_scope_check;
ALTER TABLE public.webauthn_credentials
  ADD CONSTRAINT webauthn_credentials_scope_check
  CHECK (scope = ANY (ARRAY['admin'::text, 'vendor'::text, 'account'::text]));

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, username, designation, must_onboard)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    NULLIF(NEW.raw_user_meta_data ->> 'username', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'designation', ''),
    COALESCE((NEW.raw_user_meta_data ->> 'must_onboard')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;