import { supabase } from "@/integrations/supabase/client";

export type PaymentAccount = {
  id: string;
  provider: string;
  account_title: string;
  account_number: string;
  bank_name: string | null;
  instructions: string;
  is_active: boolean;
  sort_order: number;
  use_count: number;
  last_used_at: string | null;
};

export const PROVIDERS = [
  { value: "cod", label: "Cash on delivery", icon: "🚚" },
  { value: "jazzcash", label: "JazzCash", icon: "📱" },
  { value: "easypaisa", label: "EasyPaisa", icon: "💚" },
  { value: "bank", label: "Bank transfer", icon: "🏦" },
] as const;

export function providerLabel(provider: string) {
  return PROVIDERS.find((p) => p.value === provider)?.label ?? provider;
}

export async function fetchPaymentAccounts(): Promise<PaymentAccount[]> {
  const { data, error } = await supabase
    .from("payment_accounts")
    .select("id,provider,account_title,account_number,bank_name,instructions,is_active,sort_order,use_count,last_used_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PaymentAccount[];
}

/**
 * Round-robin account rotation: among the active accounts of a provider we pick
 * the one used least, so incoming payments spread across every wallet.
 */
export function rotateAccount(accounts: PaymentAccount[], provider: string): PaymentAccount | null {
  const pool = accounts.filter((account) => account.provider === provider);
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => {
    if (a.use_count !== b.use_count) return a.use_count - b.use_count;
    const at = a.last_used_at ? Date.parse(a.last_used_at) : 0;
    const bt = b.last_used_at ? Date.parse(b.last_used_at) : 0;
    return at - bt;
  })[0]!;
}
