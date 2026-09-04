import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type ReactNode } from "react";

import { DEFAULT_BRANDING, fetchBranding, type Branding } from "@/lib/branding";

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);

const FONT_STACKS: Record<Branding["font_family"], string> = {
  sans: '"Plus Jakarta Sans", system-ui, sans-serif',
  display: '"Playfair Display", Georgia, serif',
  rounded: 'ui-rounded, "Segoe UI Rounded", "Plus Jakarta Sans", system-ui, sans-serif',
};

/** Applies the admin's white-label theme (name, colours, fonts, zoom) app-wide. */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ["branding"],
    queryFn: fetchBranding,
    staleTime: 5 * 60_000,
  });
  const branding = data ?? DEFAULT_BRANDING;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--primary", branding.primary);
    root.style.setProperty("--deal", branding.deal);
    root.style.setProperty("--hot", branding.deal);
    root.style.setProperty("--background", branding.background);
    root.style.setProperty("--font-sans", FONT_STACKS[branding.font_family]);
    root.style.fontSize = `${Math.round(16 * branding.font_scale)}px`;
    root.style.setProperty("zoom", String(branding.zoom));
    if (branding.app_name) document.title = document.title.replace(/Aura Vibe/g, branding.app_name);
  }, [branding]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
