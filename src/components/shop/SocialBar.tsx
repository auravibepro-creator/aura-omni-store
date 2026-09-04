import { useQuery } from "@tanstack/react-query";
import { Facebook, Instagram, MessageCircle, Music2 } from "lucide-react";

import { fetchSocial } from "@/lib/branding";

/** Omnichannel row: one-tap WhatsApp order plus social profiles. */
export function SocialBar({ checkoutText }: { checkoutText?: string }) {
  const { data } = useQuery({ queryKey: ["social"], queryFn: fetchSocial, staleTime: 5 * 60_000 });
  if (!data) return null;

  const waText = encodeURIComponent(checkoutText ?? "Hi! I'd like to place an order.");
  const links = [
    data.whatsapp
      ? { href: `https://wa.me/${data.whatsapp}?text=${waText}`, label: "WhatsApp", Icon: MessageCircle }
      : null,
    data.instagram ? { href: data.instagram, label: "Instagram", Icon: Instagram } : null,
    data.facebook ? { href: data.facebook, label: "Facebook", Icon: Facebook } : null,
    data.tiktok ? { href: data.tiktok, label: "TikTok", Icon: Music2 } : null,
  ].filter(Boolean) as { href: string; label: string; Icon: typeof MessageCircle }[];

  if (links.length === 0) return null;

  return (
    <div className="mx-3 mt-3 flex gap-2">
      {links.map(({ href, label, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-card py-2.5 text-[11px] font-bold card-shadow"
        >
          <Icon className="size-4 text-primary" />
          {label}
        </a>
      ))}
    </div>
  );
}
