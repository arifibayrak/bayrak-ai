/**
 * Pure allowlist helper — no framework imports so it is safely
 * unit-testable in Vitest's Node environment without pulling in
 * the next-auth runtime chain.
 *
 * Called from src/lib/auth.ts signIn callback AND from tests.
 */

/**
 * Returns true if the given email is present in AUTH_ALLOWED_EMAILS.
 *
 * AUTH_ALLOWED_EMAILS is a comma-separated list of email addresses.
 * Comparison is case-insensitive; list entries are whitespace-trimmed.
 *
 * Called on BOTH Auth.js signIn callback entry points:
 *   1. verificationRequest — before the magic-link email is sent
 *   2. link-click — before the session is created
 * Returning false blocks both email delivery and session creation (D-11, Pitfall 2).
 */
export function isAllowed(email: string): boolean {
  if (!email) return false;

  const allowedRaw = process.env.AUTH_ALLOWED_EMAILS ?? '';
  if (!allowedRaw) return false;

  const allowlist = allowedRaw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(email.toLowerCase());
}
