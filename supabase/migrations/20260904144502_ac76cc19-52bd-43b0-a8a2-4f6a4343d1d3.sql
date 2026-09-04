CREATE TABLE public.tabs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  icon text NOT NULL DEFAULT '✨',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  commission_percent numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tabs TO anon;
GRANT SELECT ON public.tabs TO authenticated;
GRANT ALL ON public.tabs TO service_role;
ALTER TABLE public.tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active tabs" ON public.tabs FOR SELECT USING (is_active = true);

CREATE TABLE public.vendors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  tab_id uuid REFERENCES public.tabs(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.products ADD COLUMN tab_id uuid REFERENCES public.tabs(id) ON DELETE SET NULL;

INSERT INTO public.tabs (name, slug, sort_order, icon) VALUES
  ('All','all',0,'🛍️'),
  ('Beauty','beauty',1,'💄'),
  ('Health','health',2,'🧪'),
  ('Women','women',3,'👗'),
  ('Men','men',4,'👔'),
  ('Home','home',5,'🏠'),
  ('Kids','kids',6,'🧸'),
  ('Bags','bags',7,'👜'),
  ('Jewelry','jewelry',8,'💎'),
  ('Electronics','electronics',9,'📱'),
  ('Sports','sports',10,'🏀'),
  ('Pets','pets',11,'🐾'),
  ('Food','food',12,'🍫'),
  ('Household','household',13,'🧺');

CREATE TABLE IF NOT EXISTS public.site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view site settings" ON public.site_settings FOR SELECT USING (true);
INSERT INTO public.site_settings (key, value) VALUES ('ticker_style', '{"height":26,"font_size":12,"speed":22,"bg_from":"#e23c1f","bg_to":"#f07a20","text_color":"#ffffff","bold":true,"gap":40,"enabled":true}'::jsonb)
ON CONFLICT (key) DO NOTHING;