-- 1) Replace the blanket public read on site_settings with a key-scoped policy.
-- Only pure UI/branding keys are readable by visitors; any future operational
-- key added to this table is private by default.
DROP POLICY IF EXISTS "Anyone can view site settings" ON public.site_settings;

CREATE POLICY "Public can read safe UI settings"
ON public.site_settings
FOR SELECT
TO anon, authenticated
USING (key IN ('branding', 'gift_box', 'social', 'ticker_style', 'overlay_settings'));

-- 2) Harden has_role: signed-in users may only check their OWN role.
-- Checking another user's roles requires the caller to be an admin.
-- The function stays SECURITY DEFINER so RLS policies keep working without
-- recursion, and EXECUTE is removed for anonymous callers entirely.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN auth.uid() IS NULL OR _user_id = auth.uid() THEN
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
    ELSE
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
      AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
  END
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
