import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Region = {
  code: string;
  label: string;
  flag: string;
  currency: string;
  symbol: string;
  /** Units of this currency per 1 PKR. */
  rate: number;
};

export const REGIONS: Region[] = [
  { code: "PK", label: "Pakistan", flag: "🇵🇰", currency: "PKR", symbol: "Rs.", rate: 1 },
  { code: "AE", label: "UAE", flag: "🇦🇪", currency: "AED", symbol: "AED", rate: 0.0132 },
  { code: "SA", label: "Saudi Arabia", flag: "🇸🇦", currency: "SAR", symbol: "SAR", rate: 0.0135 },
  { code: "GB", label: "United Kingdom", flag: "🇬🇧", currency: "GBP", symbol: "£", rate: 0.0028 },
  { code: "US", label: "United States", flag: "🇺🇸", currency: "USD", symbol: "$", rate: 0.0036 },
];

const STORAGE_KEY = "auravibe-region";

type Ctx = {
  region: Region;
  setRegion: (code: string) => void;
  format: (amountPkr: number) => string;
};

const RegionContext = createContext<Ctx | null>(null);

export function RegionProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState("PK");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && REGIONS.some((r) => r.code === saved)) setCode(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setRegion = useCallback((next: string) => {
    setCode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<Ctx>(() => {
    const region = REGIONS.find((r) => r.code === code) ?? REGIONS[0]!;
    return {
      region,
      setRegion,
      format: (amountPkr: number) => {
        const converted = amountPkr * region.rate;
        const decimals = region.code === "PK" ? 0 : 2;
        return `${region.symbol} ${converted.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}`;
      },
    };
  }, [code, setRegion]);

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion(): Ctx {
  const ctx = useContext(RegionContext);
  if (ctx) return ctx;
  const region = REGIONS[0]!;
  return {
    region,
    setRegion: () => undefined,
    format: (amount: number) => `Rs. ${Math.round(amount).toLocaleString("en-US")}`,
  };
}
