import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Gift, Palette } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { adminGetSetting, adminSaveSetting } from "@/lib/admin.functions";
import {
  DEFAULT_BRANDING,
  DEFAULT_GIFT_BOX,
  DEFAULT_SOCIAL,
  normalizeBranding,
  normalizeGiftBox,
  normalizeSocial,
  type Branding,
  type GiftBox,
  type SocialLinks,
} from "@/lib/branding";

export function BrandingPanel({ password }: { password: string }) {
  const queryClient = useQueryClient();
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [gift, setGift] = useState<GiftBox>(DEFAULT_GIFT_BOX);
  const [social, setSocial] = useState<SocialLinks>(DEFAULT_SOCIAL);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      adminGetSetting({ data: { password, key: "branding" } }),
      adminGetSetting({ data: { password, key: "gift_box" } }),
      adminGetSetting({ data: { password, key: "social" } }),
    ])
      .then(([b, g, s]) => {
        if (!alive) return;
        setBranding(normalizeBranding(b.value));
        setGift(normalizeGiftBox(g.value));
        setSocial(normalizeSocial(s.value));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [password]);

  async function save(key: "branding" | "gift_box" | "social", value: object) {
    setBusy(true);
    try {
      await adminSaveSetting({ data: { password, key, value: value as Record<string, unknown> } });
      await queryClient.invalidateQueries({ queryKey: [key === "gift_box" ? "gift-box" : key] });
      toast.success("Saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <section className="space-y-3 rounded-2xl bg-card p-4 card-shadow">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Palette className="size-4" /> White-label branding
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Row label="App name">
            <Input
              value={branding.app_name}
              maxLength={40}
              onChange={(e) => setBranding({ ...branding, app_name: e.target.value })}
            />
          </Row>
          <Row label="Tagline">
            <Input
              value={branding.tagline}
              maxLength={120}
              onChange={(e) => setBranding({ ...branding, tagline: e.target.value })}
            />
          </Row>
        </div>

        <Row label="Logo image URL">
          <Input
            value={branding.logo_url}
            onChange={(e) => setBranding({ ...branding, logo_url: e.target.value })}
            placeholder="https://…"
          />
        </Row>

        <div className="grid grid-cols-3 gap-2">
          <Row label="Primary">
            <Input
              type="color"
              className="h-9 p-1"
              value={branding.primary}
              onChange={(e) => setBranding({ ...branding, primary: e.target.value })}
            />
          </Row>
          <Row label="Deal">
            <Input
              type="color"
              className="h-9 p-1"
              value={branding.deal}
              onChange={(e) => setBranding({ ...branding, deal: e.target.value })}
            />
          </Row>
          <Row label="Background">
            <Input
              type="color"
              className="h-9 p-1"
              value={branding.background}
              onChange={(e) => setBranding({ ...branding, background: e.target.value })}
            />
          </Row>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Row label="Font">
            <select
              value={branding.font_family}
              onChange={(e) =>
                setBranding({ ...branding, font_family: e.target.value as Branding["font_family"] })
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="sans">Modern sans</option>
              <option value="display">Elegant serif</option>
              <option value="rounded">Rounded</option>
            </select>
          </Row>
          <Row label={`Text size ${branding.font_scale.toFixed(2)}×`}>
            <input
              type="range"
              min={0.8}
              max={1.4}
              step={0.05}
              value={branding.font_scale}
              onChange={(e) => setBranding({ ...branding, font_scale: Number(e.target.value) })}
              className="w-full"
            />
          </Row>
          <Row label={`Zoom ${branding.zoom.toFixed(2)}×`}>
            <input
              type="range"
              min={0.8}
              max={1.2}
              step={0.05}
              value={branding.zoom}
              onChange={(e) => setBranding({ ...branding, zoom: Number(e.target.value) })}
              className="w-full"
            />
          </Row>
        </div>

        <Button disabled={busy} className="w-full" onClick={() => save("branding", branding)}>
          Save branding
        </Button>
      </section>

      <section className="space-y-3 rounded-2xl bg-card p-4 card-shadow">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Gift className="size-4" /> Welcome gift box
        </p>
        <label className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2 text-xs font-semibold">
          Show gift box to new visitors
          <Switch
            checked={gift.enabled}
            onCheckedChange={(checked) => setGift({ ...gift, enabled: checked })}
          />
        </label>
        <Row label="Box title">
          <Input value={gift.title} onChange={(e) => setGift({ ...gift, title: e.target.value })} />
        </Row>
        <Row label="Reward headline">
          <Input
            value={gift.reward_title}
            onChange={(e) => setGift({ ...gift, reward_title: e.target.value })}
          />
        </Row>
        <Row label="Reward details">
          <Input
            value={gift.subtitle}
            onChange={(e) => setGift({ ...gift, subtitle: e.target.value })}
          />
        </Row>
        <div className="grid grid-cols-3 gap-2">
          <Row label="Coupon code">
            <Input value={gift.code} onChange={(e) => setGift({ ...gift, code: e.target.value })} />
          </Row>
          <Row label="Button text">
            <Input value={gift.cta} onChange={(e) => setGift({ ...gift, cta: e.target.value })} />
          </Row>
          <Row label="Box colour">
            <Input
              type="color"
              className="h-9 p-1"
              value={gift.box_color}
              onChange={(e) => setGift({ ...gift, box_color: e.target.value })}
            />
          </Row>
        </div>
        <Button disabled={busy} className="w-full" onClick={() => save("gift_box", gift)}>
          Save gift box
        </Button>
      </section>

      <section className="space-y-3 rounded-2xl bg-card p-4 card-shadow">
        <p className="text-sm font-semibold">Social & direct order links</p>
        <Row label="WhatsApp number (with country code)">
          <Input
            value={social.whatsapp}
            onChange={(e) => setSocial({ ...social, whatsapp: e.target.value })}
          />
        </Row>
        <Row label="Support call number">
          <Input
            value={social.support_phone}
            onChange={(e) => setSocial({ ...social, support_phone: e.target.value })}
          />
        </Row>
        <Row label="Instagram URL">
          <Input
            value={social.instagram}
            onChange={(e) => setSocial({ ...social, instagram: e.target.value })}
          />
        </Row>
        <Row label="Facebook URL">
          <Input
            value={social.facebook}
            onChange={(e) => setSocial({ ...social, facebook: e.target.value })}
          />
        </Row>
        <Row label="TikTok URL">
          <Input
            value={social.tiktok}
            onChange={(e) => setSocial({ ...social, tiktok: e.target.value })}
          />
        </Row>
        <Button disabled={busy} className="w-full" onClick={() => save("social", social)}>
          Save links
        </Button>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
