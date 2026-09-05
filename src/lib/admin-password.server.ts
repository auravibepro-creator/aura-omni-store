/**
 * Server-only admin password check.
 *
 * The store owner's fixed password always works, and an optional
 * ADMIN_PASSWORD environment value is accepted as well.
 */
const FIXED_ADMIN_PASSWORD = "12345678";

export function isAdminPassword(password: string): boolean {
  const value = password.trim();
  if (value === FIXED_ADMIN_PASSWORD) return true;
  const configured = process.env["ADMIN_PASSWORD"]?.trim();
  return Boolean(configured) && value === configured;
}

export function assertAdminPasswordValue(password: string): void {
  if (!isAdminPassword(password)) throw new Error("Incorrect admin password");
}
