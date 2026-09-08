import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, LogIn, ScanFace } from "lucide-react";

import { BiometricLoginButton } from "@/components/auth/BiometricButtons";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { CEO_USERNAME, MIN_PASSWORD_LENGTH, normalizeUsername, usernameToEmail } from "@/lib/account";
import { ensureCeoAccount } from "@/lib/accounts.functions";
import { useAuth } from "@/lib/auth";
import { useBranding } from "@/lib/branding-provider";
import { ensureDeviceToken } from "@/lib/webauthn-client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Aura Omni Store Team & Customer Portal" },
      {
        name: "description",
        content:
          "Sign in with your username, password, fingerprint or face unlock to reach your Aura Omni Store dashboard.",
      },
      { property: "og:title", content: "Sign in — Aura Omni Store Portal" },
      {
        property: "og:description",
        content: "One login for admins, sales agents, support agents, delivery riders and customers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const branding = useBranding();
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: "", password: "" });

  useEffect(() => {
    void ensureCeoAccount().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [loading, session, navigate]);

  async function signIn(username: string, password: string, remember: boolean) {
    const clean = normalizeUsername(username);
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(clean),
      password,
    });
    if (error) throw new Error("Wrong username or password");
    if (remember) {
      await ensureDeviceToken({ scope: "account", username: clean, password }).catch(
        () => undefined,
      );
    }
    toast.success("Signed in.");
    navigate({ to: "/dashboard", replace: true });
  }

  async function submit() {
    if (!form.username.trim() || form.password.length < MIN_PASSWORD_LENGTH) {
      toast.error("Enter your username and a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await signIn(form.username, form.password, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen pb-16">
      <ShopHeader title="Sign in" showBack />

      <div className="mx-auto mt-4 w-full max-w-md px-3">
        <div className="rounded-2xl bg-card p-4 card-shadow">
          <h1 className="truncate font-display text-lg font-bold">{branding.app_name}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Sign in with your username and password, or unlock instantly with fingerprint or face.
          </p>

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                autoCapitalize="none"
                value={form.username}
                maxLength={32}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                placeholder="e.g. ceo"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="At least 8 characters"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
              />
            </div>

            <Button
              className="w-full brand-gradient text-primary-foreground"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
              Sign in
            </Button>

            <BiometricLoginButton
              scope="account"
              username={normalizeUsername(form.username) || undefined}
              label="Fingerprint"
              onSuccess={async (result) => {
                await signIn(result.username ?? form.username, result.password, false);
              }}
            />

            <BiometricLoginButton
              scope="account"
              username={normalizeUsername(form.username) || undefined}
              label="Face unlock"
              icon={<ScanFace className="size-4" />}
              onSuccess={async (result) => {
                await signIn(result.username ?? form.username, result.password, false);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
