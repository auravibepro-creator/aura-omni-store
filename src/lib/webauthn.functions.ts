import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { hashPassword } from "@/lib/hash";

const RP_NAME = "Aura Omni Store";

const scopeShape = z.enum(["admin", "vendor", "account"]);

const registerBeginShape = z.union([
  z.object({ scope: z.literal("admin"), password: z.string().min(1).max(200) }),
  z.object({
    scope: z.literal("vendor"),
    username: z.string().trim().min(3).max(40),
    password: z.string().min(1).max(200),
  }),
  z.object({
    scope: z.literal("account"),
    username: z.string().trim().min(3).max(40),
    password: z.string().min(1).max(200),
  }),
]);

const registerFinishShape = z.object({
  scope: scopeShape,
  username: z.string().trim().max(40).optional(),
  password: z.string().min(1).max(200),
  label: z.string().trim().max(60).optional(),
  response: z.any(),
});

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Derive the relying-party id + expected origin from the incoming request. */
function relyingParty() {
  const request = getRequest();
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const hostname = host.split(":")[0]!;
  return { rpID: hostname, origin: `${proto}://${host}` };
}

async function assertAdminPassword(password: string) {
  const { assertAdminPasswordValue } = await import("@/lib/admin-password.server");
  await assertAdminPasswordValue(password);
}

async function assertVendorPassword(username: string, password: string) {
  const client = await db();
  const { data } = await client
    .from("vendors")
    .select("username, is_active, password_hash")
    .eq("username", username)
    .maybeSingle();
  if (!data || !data.is_active) throw new Error("Invalid vendor login");
  if (data.password_hash !== (await hashPassword(password))) throw new Error("Invalid vendor login");
}

/** Staff / customer account password check (username-based sign-in). */
async function assertAccountPassword(username: string, password: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const { usernameToEmail } = await import("@/lib/account");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) throw new Error("Invalid username or password");
}

async function assertScopePassword(
  scope: "admin" | "vendor" | "account",
  username: string | undefined | null,
  password: string,
) {
  if (scope === "admin") return assertAdminPassword(password);
  if (!username) throw new Error("Username is required");
  if (scope === "vendor") return assertVendorPassword(username, password);
  return assertAccountPassword(username, password);
}

async function saveChallenge(input: {
  challenge: string;
  scope: string;
  purpose: "register" | "login";
  vendor_username?: string | null;
}) {
  const client = await db();
  await client.from("webauthn_challenges").delete().lt("expires_at", new Date().toISOString());
  await client.from("webauthn_challenges").insert({
    challenge: input.challenge,
    scope: input.scope,
    purpose: input.purpose,
    vendor_username: input.vendor_username ?? null,
  });
}

async function consumeChallenge(challenge: string, purpose: "register" | "login") {
  const client = await db();
  const { data } = await client
    .from("webauthn_challenges")
    .select("id, challenge, expires_at")
    .eq("challenge", challenge)
    .eq("purpose", purpose)
    .maybeSingle();
  if (!data) throw new Error("This request expired. Please try again.");
  await client.from("webauthn_challenges").delete().eq("id", data.id);
  if (new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error("This request expired. Please try again.");
  }
}

/** Step 1 of enrolling a fingerprint / face unlock for this device. */
export const webauthnRegisterBegin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => registerBeginShape.parse(data))
  .handler(async ({ data }) => {
    const { generateRegistrationOptions } = await import("@simplewebauthn/server");
    const { isoBase64URL } = await import("@simplewebauthn/server/helpers");
    const client = await db();

    await assertScopePassword(
      data.scope,
      data.scope === "admin" ? null : data.username,
      data.password,
    );

    const accountName = data.scope === "admin" ? "store-admin" : data.username;
    const baseQuery = client
      .from("webauthn_credentials")
      .select("credential_id")
      .neq("public_key", "device-token")
      .eq("scope", data.scope);
    const existingQuery =
      data.scope === "admin"
        ? baseQuery.is("vendor_username", null)
        : baseQuery.eq("vendor_username", data.username);
    const { data: existing } = await existingQuery;

    const { rpID } = relyingParty();
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userID: isoBase64URL.toBuffer(isoBase64URL.fromUTF8String(`${data.scope}:${accountName}`)),
      userName: accountName,
      userDisplayName: data.scope === "admin" ? "Aura Omni Store admin" : accountName,
      attestationType: "none",
      excludeCredentials: (existing ?? []).map((row) => ({ id: row.credential_id })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
        authenticatorAttachment: "platform",
      },
    });

    await saveChallenge({
      challenge: options.challenge,
      scope: data.scope,
      purpose: "register",
      vendor_username: data.scope === "admin" ? null : data.username,
    });

    return { options };
  });

/** Step 2 — store the new passkey for this account. */
export const webauthnRegisterFinish = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => registerFinishShape.parse(data))
  .handler(async ({ data }) => {
    const { verifyRegistrationResponse } = await import("@simplewebauthn/server");
    const { isoBase64URL } = await import("@simplewebauthn/server/helpers");

    await assertScopePassword(data.scope, data.username, data.password);

    const response = data.response as {
      response: { clientDataJSON: string };
    };
    const clientData = JSON.parse(
      new TextDecoder().decode(isoBase64URL.toBuffer(response.response.clientDataJSON)),
    ) as { challenge: string };
    await consumeChallenge(clientData.challenge, "register");

    const { rpID, origin } = relyingParty();
    const verification = await verifyRegistrationResponse({
      response: data.response,
      expectedChallenge: clientData.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new Error("Could not verify this device");
    }

    const credential = verification.registrationInfo.credential;
    const client = await db();
    const { error } = await client.from("webauthn_credentials").upsert(
      {
        scope: data.scope,
        vendor_username: data.scope === "admin" ? null : (data.username ?? null),
        credential_id: credential.id,
        public_key: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        label: data.label?.trim() || "This device",
        secret: data.password,
      },
      { onConflict: "credential_id" },
    );
    if (error) throw error;

    return { ok: true as const };
  });

/** Step 1 of biometric sign-in. */
export const webauthnLoginBegin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ scope: scopeShape, username: z.string().trim().max(40).optional() })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { generateAuthenticationOptions } = await import("@simplewebauthn/server");
    const client = await db();

    let query = client
      .from("webauthn_credentials")
      .select("credential_id, transports")
      .neq("public_key", "device-token")
      .eq("scope", data.scope);
    if (data.scope === "admin") query = query.is("vendor_username", null);
    else if (data.username) query = query.eq("vendor_username", data.username);
    const { data: rows } = await query;
    if (!rows || rows.length === 0) {
      throw new Error("No fingerprint is registered for this account yet");
    }

    const { rpID } = relyingParty();
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: rows.map((row) => ({
        id: row.credential_id,
        transports: (row.transports ?? []) as never,
      })),
    });

    await saveChallenge({
      challenge: options.challenge,
      scope: data.scope,
      purpose: "login",
      vendor_username: data.scope === "admin" ? null : (data.username ?? null),
    });

    return { options };
  });

/** Step 2 — verify the assertion and hand back the account credentials. */
export const webauthnLoginFinish = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ scope: scopeShape, response: z.any() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
    const { isoBase64URL } = await import("@simplewebauthn/server/helpers");

    const response = data.response as {
      id: string;
      response: { clientDataJSON: string };
    };
    const clientData = JSON.parse(
      new TextDecoder().decode(isoBase64URL.toBuffer(response.response.clientDataJSON)),
    ) as { challenge: string };
    await consumeChallenge(clientData.challenge, "login");

    const client = await db();
    const { data: row } = await client
      .from("webauthn_credentials")
      .select("*")
      .eq("credential_id", response.id)
      .eq("scope", data.scope)
      .maybeSingle();
    if (!row) throw new Error("This device is not registered");

    const { rpID, origin } = relyingParty();
    const verification = await verifyAuthenticationResponse({
      response: data.response,
      expectedChallenge: clientData.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: row.credential_id,
        publicKey: isoBase64URL.toBuffer(row.public_key),
        counter: Number(row.counter),
        transports: (row.transports ?? []) as never,
      },
    });
    if (!verification.verified) throw new Error("Fingerprint verification failed");

    await client
      .from("webauthn_credentials")
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    // The stored secret is only released after a verified biometric assertion.
    if (data.scope === "admin") {
      await assertAdminPassword(row.secret);
      return { scope: "admin" as const, password: row.secret, username: null };
    }

    if (!row.vendor_username) throw new Error("This device is not registered");
    await assertScopePassword(data.scope, row.vendor_username, row.secret);
    return { scope: data.scope, password: row.secret, username: row.vendor_username };
  });

/** List / remove registered devices for the admin account. */
export const webauthnListDevices = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ password: z.string().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data }) => {
    await assertAdminPassword(data.password);
    const client = await db();
    const { data: rows } = await client
      .from("webauthn_credentials")
      .select("id, scope, vendor_username, label, created_at, last_used_at")
      .order("created_at", { ascending: false });
    return { devices: rows ?? [] };
  });

export const webauthnDeleteDevice = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ password: z.string().min(1).max(200), id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    await assertAdminPassword(data.password);
    const client = await db();
    const { error } = await client.from("webauthn_credentials").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

/**
 * Device-token fallback. Used when this browser/device cannot complete a real
 * WebAuthn/biometric ceremony (previews, desktop browsers, in-app webviews).
 * The token is issued only after a valid password check and is stored on the
 * device; presenting it later returns the saved credentials.
 */
export const deviceTokenIssue = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        scope: scopeShape,
        username: z.string().trim().max(40).optional(),
        password: z.string().min(1).max(200),
        label: z.string().trim().max(60).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertScopePassword(data.scope, data.username, data.password);

    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
    const client = await db();
    const { error } = await client.from("webauthn_credentials").insert({
      scope: data.scope,
      vendor_username: data.scope === "admin" ? null : (data.username ?? null),
      credential_id: `device-token:${token}`,
      public_key: "device-token",
      counter: 0,
      transports: [],
      label: data.label?.trim() || "This device",
      secret: data.password,
    });
    if (error) throw error;

    return { token };
  });

export const deviceTokenLogin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ scope: scopeShape, token: z.string().min(10).max(200) }).parse(data),
  )
  .handler(async ({ data }) => {
    const client = await db();
    const { data: row } = await client
      .from("webauthn_credentials")
      .select("*")
      .eq("credential_id", `device-token:${data.token}`)
      .eq("scope", data.scope)
      .maybeSingle();
    if (!row) throw new Error("This device is not registered");

    await client
      .from("webauthn_credentials")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);

    if (data.scope === "admin") {
      await assertAdminPassword(row.secret);
      return { scope: "admin" as const, password: row.secret, username: null };
    }
    if (!row.vendor_username) throw new Error("This device is not registered");
    await assertScopePassword(data.scope, row.vendor_username, row.secret);
    return { scope: data.scope, password: row.secret, username: row.vendor_username };
  });
