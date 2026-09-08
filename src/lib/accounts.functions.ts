import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CEO_DISPLAY_NAME,
  CEO_USERNAME,
  DEFAULT_ADMIN_PASSWORD,
  MIN_PASSWORD_LENGTH,
  USERNAME_PATTERN,
  normalizeUsername,
  usernameToEmail,
} from "@/lib/account";

const adminPassword = z.object({ password: z.string().min(1).max(200) });
const usernameField = z
  .string()
  .trim()
  .transform(normalizeUsername)
  .refine((value) => USERNAME_PATTERN.test(value), "Use 3-32 lowercase letters, numbers, . _ or -");
const newPassword = z.string().min(MIN_PASSWORD_LENGTH, "Use at least 8 characters").max(200);

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertAdmin(password: string) {
  const { assertAdminPasswordValue } = await import("@/lib/admin-password.server");
  await assertAdminPasswordValue(password);
}

/**
 * Makes sure the built-in CEO / admin account exists with the default password.
 * Safe to call any time: an existing account is never modified.
 */
export const ensureCeoAccount = createServerFn({ method: "POST" }).handler(async () => {
  const client = await db();
  const { data: existing } = await client
    .from("profiles")
    .select("id")
    .eq("username", CEO_USERNAME)
    .maybeSingle();
  if (existing) return { created: false as const, username: CEO_USERNAME };

  const { data: created, error } = await client.auth.admin.createUser({
    email: usernameToEmail(CEO_USERNAME),
    password: DEFAULT_ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: CEO_DISPLAY_NAME,
      username: CEO_USERNAME,
      designation: "Owner / CEO",
      must_onboard: false,
    },
  });
  if (error || !created.user) return { created: false as const, username: CEO_USERNAME };

  await client
    .from("profiles")
    .update({ username: CEO_USERNAME, full_name: CEO_DISPLAY_NAME, designation: "Owner / CEO" })
    .eq("id", created.user.id);
  await client
    .from("user_roles")
    .upsert({ user_id: created.user.id, role: "admin" }, { onConflict: "user_id,role" });

  return { created: true as const, username: CEO_USERNAME };
});

/**
 * A signed-in administrator exchanges their session for an admin key, so the
 * dashboard never asks for the admin password a second time.
 */
export const adminSessionKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = await db();
    const { data: role } = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Administrator access only");

    const { issueAdminSessionKey } = await import("@/lib/admin-session.server");
    return { key: await issueAdminSessionKey(context.userId) };
  });

/** Admin updates their own display name and/or password. */
export const adminUpdateSelf = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    adminPassword
      .extend({
        full_name: z.string().trim().min(2).max(80).optional(),
        new_password: newPassword.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertAdmin(data.password);
    const client = await db();

    const { data: ceo } = await client
      .from("profiles")
      .select("id")
      .eq("username", CEO_USERNAME)
      .maybeSingle();

    if (data.full_name && ceo?.id) {
      await client.from("profiles").update({ full_name: data.full_name }).eq("id", ceo.id);
    }

    if (data.new_password) {
      if (ceo?.id) {
        await client.auth.admin.updateUserById(ceo.id, { password: data.new_password });
      }
      const { saveAdminPassword } = await import("@/lib/admin-password.server");
      await saveAdminPassword(data.new_password);
    }

    return { ok: true as const };
  });

/** Admin creates a staff account with a temporary password. */
export const adminCreateStaff = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    adminPassword
      .extend({
        username: usernameField,
        full_name: z.string().trim().min(2).max(80),
        designation: z.string().trim().max(80).default(""),
        role: z.enum(["admin", "agent", "sales", "delivery", "user"]),
        temp_password: newPassword,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertAdmin(data.password);
    const client = await db();

    const { data: taken } = await client
      .from("profiles")
      .select("id")
      .eq("username", data.username)
      .maybeSingle();
    if (taken) throw new Error("That username is already taken");

    const { data: created, error } = await client.auth.admin.createUser({
      email: usernameToEmail(data.username),
      password: data.temp_password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        username: data.username,
        designation: data.designation,
        must_onboard: true,
      },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create the account");

    await client
      .from("profiles")
      .update({
        username: data.username,
        full_name: data.full_name,
        designation: data.designation,
        must_onboard: true,
        email: null,
      })
      .eq("id", created.user.id);

    if (data.role !== "user") {
      await client
        .from("user_roles")
        .upsert({ user_id: created.user.id, role: data.role }, { onConflict: "user_id,role" });
    }

    return { ok: true as const, username: data.username };
  });

/** First-time staff setup: profile details plus a permanent password. */
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        full_name: z.string().trim().min(2).max(80),
        designation: z.string().trim().min(2).max(80),
        email: z.string().trim().email().max(160),
        phone: z.string().trim().min(7).max(20),
        new_password: newPassword,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.new_password,
    });
    if (passwordError) throw new Error(passwordError.message);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.full_name,
        designation: data.designation,
        email: data.email,
        phone: data.phone,
        must_onboard: false,
      })
      .eq("id", context.userId);
    if (error) throw error;

    return { ok: true as const };
  });
