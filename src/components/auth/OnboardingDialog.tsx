import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@/lib/account";
import { completeOnboarding } from "@/lib/accounts.functions";
import { registerBiometric } from "@/lib/webauthn-client";

/**
 * Mandatory first-time setup for a new staff member signing in with a
 * temporary password: details, permanent password and biometric unlock.
 */
export function OnboardingDialog({
  open,
  username,
  defaultName,
  onDone,
}: {
  open: boolean;
  username: string;
  defaultName: string;
  onDone: () => void | Promise<void>;
}) {
  const save = useServerFn(completeOnboarding);
  const [step, setStep] = useState<"details" | "biometric">("details");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: defaultName,
    designation: "",
    email: "",
    phone: "",
    new_password: "",
    confirm: "",
  });

  async function submitDetails() {
    if (form.new_password.length < MIN_PASSWORD_LENGTH) {
      toast.error("Your new password needs at least 8 characters.");
      return;
    }
    if (form.new_password !== form.confirm) {
      toast.error("Both passwords must match.");
      return;
    }
    setBusy(true);
    try {
      await save({
        data: {
          full_name: form.full_name.trim(),
          designation: form.designation.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          new_password: form.new_password,
        },
      });
      toast.success("Details saved — now enable quick unlock.");
      setStep("biometric");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your details.");
    } finally {
      setBusy(false);
    }
  }

  async function enableBiometric() {
    setBusy(true);
    try {
      await registerBiometric({
        scope: "account",
        username,
        password: form.new_password,
        label: "This device",
      });
      toast.success("Fingerprint / face unlock is on.");
      await onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not enable quick unlock.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Finish setting up your account</DialogTitle>
        </DialogHeader>

        {step === "details" ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Signed in as <span className="font-semibold">{username}</span>. Complete this once to
              start working.
            </p>
            <Field
              id="full_name"
              label="Name"
              value={form.full_name}
              onChange={(value) => setForm({ ...form, full_name: value })}
              placeholder="Your full name"
            />
            <Field
              id="designation"
              label="Designation"
              value={form.designation}
              onChange={(value) => setForm({ ...form, designation: value })}
              placeholder="e.g. Sales agent"
            />
            <Field
              id="email"
              label="Email"
              type="email"
              value={form.email}
              onChange={(value) => setForm({ ...form, email: value })}
              placeholder="you@example.com"
            />
            <Field
              id="phone"
              label="Contact number"
              value={form.phone}
              onChange={(value) => setForm({ ...form, phone: value })}
              placeholder="03XX XXXXXXX"
            />
            <Field
              id="new_password"
              label="New permanent password"
              type="password"
              value={form.new_password}
              onChange={(value) => setForm({ ...form, new_password: value })}
              placeholder="At least 8 characters"
            />
            <Field
              id="confirm"
              label="Repeat password"
              type="password"
              value={form.confirm}
              onChange={(value) => setForm({ ...form, confirm: value })}
              placeholder="Repeat the new password"
            />
            <Button className="w-full" disabled={busy} onClick={() => void submitDetails()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Save and continue
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Last step: turn on fingerprint or face unlock so you can sign in instantly on this
              device.
            </p>
            <Button className="w-full gap-2" disabled={busy} onClick={() => void enableBiometric()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Enable fingerprint / face unlock
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        maxLength={160}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
