/**
 * Server-only admin password check.
 *
 * The owner can change the admin password from the dashboard; the new value is
 * stored (hashed) in site_settings. Until then the default password works.
 */
import { hashPassword } from "@/lib/hash";
import { DEFAULT_ADMIN_PASSWORD } from "@/lib/account";

export const ADMIN_PASSWORD_KEY = "admin_password";

async function storedHash(): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("key", ADMIN_PASSWORD_KEY)
      .maybeSingle();
    const hash = (data?.value as { hash?: string } | null)?.hash;
    return typeof hash === "string" && hash.length > 0 ? hash : null;
  } catch {
    return null;
  }
}

export async function isAdminPassword(password: string): Promise<boolean> {
  const value = password.trim();
  if (!value) return false;

  const hash = await storedHash();
  if (hash) return (await hashPassword(value)) === hash;

  if (value === DEFAULT_ADMIN_PASSWORD) return true;
  const configured = process.env["ADMIN_PASSWORD"]?.trim();
  return Boolean(configured) && value === configured;
}

export async function assertAdminPasswordValue(password: string): Promise<void> {
  if (!(await isAdminPassword(password))) throw new Error("Incorrect admin password");
}

/** Persist a new admin password (hashed). */
export async function saveAdminPassword(password: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hash = await hashPassword(password.trim());
  const { error } = await supabaseAdmin
    .from("site_settings")
    .upsert({ key: ADMIN_PASSWORD_KEY, value: { hash } }, { onConflict: "key" });
  if (error) throw error;
}
