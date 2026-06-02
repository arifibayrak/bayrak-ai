/**
 * src/lib/authz.ts — pure RBAC primitives (no framework imports, safe to import
 * from both server and client code, e.g. SidebarNav).
 *
 * Roles (web/Auth.js users — NOT the Telegram `people` table):
 *   - admin           : full access incl. account management. ONLY @bayrak.ai emails.
 *   - office_engineer  : full access EXCEPT account management.
 *   - audit_engineer   : READ-ONLY monitoring (overview, records, analytics). No writes.
 *
 * SECURITY INVARIANT: a non-@bayrak.ai email can NEVER be admin, regardless of
 * what the DB row stores. effectiveRole() is the single source of truth and is
 * re-derived on every request in the Auth.js session callback.
 */

export const ROLES = {
  ADMIN: 'admin',
  OFFICE: 'office_engineer',
  AUDIT: 'audit_engineer',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ADMIN_EMAIL_DOMAIN = '@bayrak.ai';

/** True only for @bayrak.ai addresses (case-insensitive). */
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().trim().endsWith(ADMIN_EMAIL_DOMAIN);
}

/**
 * The authoritative role for a user. @bayrak.ai → always admin. Everyone else is
 * office_engineer or audit_engineer (a stray stored 'admin' on a non-@bayrak.ai
 * row is clamped down to office_engineer).
 */
export function effectiveRole(
  email: string | null | undefined,
  storedRole: string | null | undefined,
): Role {
  if (isAdminEmail(email)) return ROLES.ADMIN;
  if (storedRole === ROLES.AUDIT) return ROLES.AUDIT;
  return ROLES.OFFICE;
}

export function isAdmin(role: Role | string | undefined): boolean {
  return role === ROLES.ADMIN;
}

/** admin + office_engineer may mutate office data; audit_engineer is read-only. */
export function canWrite(role: Role | string | undefined): boolean {
  return role === ROLES.ADMIN || role === ROLES.OFFICE;
}

/** Roles allowed to assign/view accounts (the admin panel). */
export function canManageAccounts(role: Role | string | undefined): boolean {
  return role === ROLES.ADMIN;
}

/**
 * Dashboard route prefixes an audit_engineer (read-only) MAY access. Anything
 * not matching is denied (redirected). Used by nav filtering + route guard.
 */
export const AUDIT_ALLOWED_PREFIXES = [
  '/dashboard/overview',
  '/dashboard/records',
  '/dashboard/analytics',
] as const;

export function auditCanAccessPath(pathname: string): boolean {
  return AUDIT_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'),
  );
}
