/**
 * src/lib/rbac.ts — server-side RBAC guards (import `auth`). Use these in page
 * RSCs (redirect) and Server Actions (throw). Defense-in-depth: a denied role is
 * blocked at BOTH layers, never UI-only.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { ROLES, type Role, canWrite, canManageAccounts } from '@/lib/authz';

/** Read the effective role off the session (set in the auth session callback). */
export function sessionRole(session: { user?: { role?: string } } | null): Role {
  const r = session?.user?.role;
  if (r === ROLES.ADMIN || r === ROLES.OFFICE || r === ROLES.AUDIT) return r;
  return ROLES.OFFICE;
}

/** Page guard: require a signed-in user whose role is in `allowed`, else redirect. */
export async function requireRole(allowed: Role[]) {
  const session = await auth();
  if (!session) redirect('/auth/signin');
  const role = sessionRole(session);
  if (!allowed.includes(role)) redirect('/dashboard/overview');
  return { session, role };
}

/** Page guard: admin only (account management). */
export async function requireAdmin() {
  return requireRole([ROLES.ADMIN]);
}

/** Page guard: anyone who can write (admin + office). Blocks audit_engineer. */
export async function requireWriteAccess() {
  return requireRole([ROLES.ADMIN, ROLES.OFFICE]);
}

/** Server Action guard: throw unless the caller may mutate office data. */
export async function assertCanWrite() {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  if (!canWrite(sessionRole(session))) {
    throw new Error('Forbidden: your role is read-only.');
  }
  return session;
}

/** Server Action guard: throw unless the caller is an admin. */
export async function assertAdmin() {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  if (!canManageAccounts(sessionRole(session))) {
    throw new Error('Forbidden: admin only.');
  }
  return session;
}
