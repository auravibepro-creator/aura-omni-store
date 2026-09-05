import {
  deviceTokenIssue,
  deviceTokenLogin,
  webauthnLoginBegin,
  webauthnLoginFinish,
  webauthnRegisterBegin,
  webauthnRegisterFinish,
} from "@/lib/webauthn.functions";

/** True when this browser/device can do platform biometrics (fingerprint / face). */
export async function biometricsAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    const { platformAuthenticatorIsAvailable } = await import("@simplewebauthn/browser");
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

function tokenKey(scope: "admin" | "vendor", username?: string) {
  return `auravibe-device-token:${scope}:${username ?? "default"}`;
}

function readToken(scope: "admin" | "vendor", username?: string) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(tokenKey(scope, username));
  } catch {
    return null;
  }
}

function writeToken(scope: "admin" | "vendor", token: string, username?: string) {
  try {
    window.localStorage.setItem(tokenKey(scope, username), token);
  } catch {
    /* storage blocked — ignore */
  }
}

function message(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (error.name === "NotAllowedError") return "Fingerprint check was cancelled";
    if (error.name === "InvalidStateError") return "This device is already registered";
    return error.message || fallback;
  }
  return fallback;
}

type RegisterInput =
  | { scope: "admin"; password: string; label?: string }
  | { scope: "vendor"; username: string; password: string; label?: string };

/** Save a device token so this device can sign in again without the password. */
export async function ensureDeviceToken(input: RegisterInput): Promise<void> {
  const username = input.scope === "vendor" ? input.username : undefined;
  if (readToken(input.scope, username)) return;
  const { token } = await deviceTokenIssue({
    data: {
      scope: input.scope,
      username,
      password: input.password,
      label: input.label,
    },
  });
  writeToken(input.scope, token, username);
}

export async function registerBiometric(input: RegisterInput): Promise<void> {
  const username = input.scope === "vendor" ? input.username : undefined;
  // Always keep a device token as the fallback path.
  try {
    await ensureDeviceToken(input);
  } catch {
    /* non-fatal */
  }

  if (!(await biometricsAvailable())) return; // token fallback is enough

  const { startRegistration } = await import("@simplewebauthn/browser");
  try {
    const { options } = await webauthnRegisterBegin({ data: input as never });
    const response = await startRegistration({ optionsJSON: options as never });
    await webauthnRegisterFinish({
      data: {
        scope: input.scope,
        username,
        password: input.password,
        label: input.label,
        response,
      },
    });
  } catch (error) {
    if (readToken(input.scope, username)) return; // fallback already registered
    throw new Error(message(error, "Could not register this device"));
  }
}

export async function loginWithBiometric(
  scope: "admin" | "vendor",
  username?: string,
): Promise<{ password: string; username: string | null }> {
  const token = readToken(scope, username);

  if (await biometricsAvailable()) {
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const { options } = await webauthnLoginBegin({ data: { scope, username } });
      const response = await startAuthentication({ optionsJSON: options as never });
      const result = await webauthnLoginFinish({ data: { scope, response } });
      return { password: result.password, username: result.username };
    } catch (error) {
      if (error instanceof Error && error.name === "NotAllowedError") {
        throw new Error("Fingerprint check was cancelled");
      }
      if (!token) throw new Error(message(error, "Fingerprint sign-in failed"));
      // fall through to the device-token path
    }
  }

  if (!token) {
    throw new Error("Unlock once with the password to enable quick sign-in on this device");
  }
  try {
    const result = await deviceTokenLogin({ data: { scope, token } });
    return { password: result.password, username: result.username };
  } catch (error) {
    try {
      window.localStorage.removeItem(tokenKey(scope, username));
    } catch {
      /* ignore */
    }
    throw new Error(message(error, "Quick sign-in failed — please use the password"));
  }
}
