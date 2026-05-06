/**
 * Email whitelist logic — pure function, no Next.js dependencies.
 * Reads ALLOWED_EMAILS from process.env (comma-separated).
 */

export function getAllowedEmails(): string[] {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string): boolean {
  const allowed = getAllowedEmails();
  if (allowed.length === 0) return false; // deny all if not configured
  return allowed.includes(email.toLowerCase());
}
