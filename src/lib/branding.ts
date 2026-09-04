import { supabase } from "@/integrations/supabase/client";

export type Branding = {
  app_name: string;
  tagline: string;
  logo_url: string;
  primary: string;
  deal: string;
  background: string;
  font_family: "sans" | "display" | "rounded";
  font_scale: number;
  zoom: number;
};

export const DEFAULT_BRANDING: Branding = {
  app_name: "Aura Vibe",
  tagline: "Beauty & personal care, delivered",
  logo_url: "",
  primary: "#7c2fb4",
  deal: "#e01e5a",
  background: "#fffafd",
  font_family: "sans",
  font_scale: 1,
  zoom: 1,
};

export type GiftBox = {
  enabled: boolean;
  title: string;
  reward_title: string;
  subtitle: string;
  code: string;
  box_color: string;
  cta: string;
};

export const DEFAULT_GIFT_BOX: GiftBox = {
  enabled: true,
  title: "Your welcome reward",
  reward_title: "You unlocked Rs. 300 off",
  subtitle: "Use code AURA300 at checkout on orders over Rs. 2,500.",
  code: "AURA300",
  box_color: "#e01e5a",
  cta: "Open the box",
};

export type SocialLinks = {
  whatsapp: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  support_phone: string;
};

export const DEFAULT_SOCIAL: SocialLinks = {
  whatsapp: "923080841880",
  instagram: "",
  facebook: "",
  tiktok: "",
  support_phone: "923080841880",
};

function str(value: unknown, fallback: string, max = 400) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function num(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function normalizeBranding(value: unknown): Branding {
  const v = (value ?? {}) as Record<string, unknown>;
  const family = str(v["font_family"], DEFAULT_BRANDING.font_family, 20);
  return {
    app_name: str(v["app_name"], DEFAULT_BRANDING.app_name, 40),
    tagline: str(v["tagline"], DEFAULT_BRANDING.tagline, 120),
    logo_url: str(v["logo_url"], "", 100000),
    primary: str(v["primary"], DEFAULT_BRANDING.primary, 40),
    deal: str(v["deal"], DEFAULT_BRANDING.deal, 40),
    background: str(v["background"], DEFAULT_BRANDING.background, 40),
    font_family: (["sans", "display", "rounded"].includes(family) ? family : "sans") as
      Branding["font_family"],
    font_scale: num(v["font_scale"], 1, 0.8, 1.4),
    zoom: num(v["zoom"], 1, 0.8, 1.2),
  };
}

export function normalizeGiftBox(value: unknown): GiftBox {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    enabled: v["enabled"] !== false,
    title: str(v["title"], DEFAULT_GIFT_BOX.title, 80),
    reward_title: str(v["reward_title"], DEFAULT_GIFT_BOX.reward_title, 80),
    subtitle: str(v["subtitle"], DEFAULT_GIFT_BOX.subtitle, 200),
    code: str(v["code"], DEFAULT_GIFT_BOX.code, 30),
    box_color: str(v["box_color"], DEFAULT_GIFT_BOX.box_color, 40),
    cta: str(v["cta"], DEFAULT_GIFT_BOX.cta, 40),
  };
}

export function normalizeSocial(value: unknown): SocialLinks {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    whatsapp: str(v["whatsapp"], DEFAULT_SOCIAL.whatsapp, 30),
    instagram: str(v["instagram"], "", 300),
    facebook: str(v["facebook"], "", 300),
    tiktok: str(v["tiktok"], "", 300),
    support_phone: str(v["support_phone"], DEFAULT_SOCIAL.support_phone, 30),
  };
}

async function readSetting(key: string): Promise<unknown> {
  const { data } = await supabase.from("site_settings").select("value").eq("key", key).maybeSingle();
  return (data as { value?: unknown } | null)?.value ?? null;
}

export async function fetchBranding(): Promise<Branding> {
  return normalizeBranding(await readSetting("branding"));
}

export async function fetchGiftBox(): Promise<GiftBox> {
  return normalizeGiftBox(await readSetting("gift_box"));
}

export async function fetchSocial(): Promise<SocialLinks> {
  return normalizeSocial(await readSetting("social"));
}
