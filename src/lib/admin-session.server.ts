/**
 * Server-only admin session keys.
 *
 * A signed-in administrator receives a short-lived signed key instead of typing
 * the admin password again. The key is accepted anywhere the admin password is.
 */

const SECRET_KEY = "admin_session_secret";
const TTL_MS = 12 * 60 * 60 * 1000;
export const SESSION_KEY_PREFIX = "sess.";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function secret(): Promise<string> {
  const client = await db();
  const { data } = await client
    .from("site_settings")
    .select("value")
    .eq("key", SECRET_KEY)
    .maybeSingle();
  const existing = (data?.value as { secret?: string } | null)?.secret;
  if (typeof existing === "string" && existing.length > 0) return existing;

  const fresh = crypto.randomUUID() + crypto.randomUUID();
  await client
    .from("site_settings")
    .upsert({ key: SECRET_KEY, value: { secret: fresh } }, { onConflict: "key" });
  return fresh;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(await secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Issue a signed key for an administrator's user id. */
export async function issueAdminSessionKey(userId: string): Promise<string> {
  const payload = `${userId}.${Date.now() + TTL_MS}`;
  return `${SESSION_KEY_PREFIX}${payload}.${await sign(payload)}`;
}

/** True when the value is a valid, unexpired admin session key. */
export async function isAdminSessionKey(value: string): Promise<boolean> {
  if (!value.startsWith(SESSION_KEY_PREFIX)) return false;
  const parts = value.slice(SESSION_KEY_PREFIX.length).split(".");
  if (parts.length !== 3) return false;
  const [userId, expiry, mac] = parts as [string, string, string];
  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  if ((await sign(`${userId}.${expiry}`)) !== mac) return false;

  const client = await db();
  const { data } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}
