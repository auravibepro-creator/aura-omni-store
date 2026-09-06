/** Shared helpers for username-based sign-in (client + server safe). */

export const ACCOUNT_EMAIL_DOMAIN = "aura.local";

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** Usernames map to a fixed internal address so no email lookup is ever needed. */
export function usernameToEmail(value: string): string {
  return `${normalizeUsername(value)}@${ACCOUNT_EMAIL_DOMAIN}`;
}

export const CEO_USERNAME = "ceo";
export const CEO_DISPLAY_NAME = "CEO Aura Vibe";
export const DEFAULT_ADMIN_PASSWORD = "12345678";
export const MIN_PASSWORD_LENGTH = 8;
