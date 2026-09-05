import { createServerFn } from "@tanstack/react-start";

/**
 * Checkout payment options. Account numbers are no longer readable through the
 * public data API, so they are served from the server instead.
 */
export const listCheckoutAccounts = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("payment_accounts")
    .select(
      "id,provider,account_title,account_number,bank_name,instructions,is_active,sort_order,use_count,last_used_at",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return { accounts: data ?? [] };
});
