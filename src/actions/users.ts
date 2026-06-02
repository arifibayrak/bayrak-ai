'use server';

/**
 * Account-management Server Actions (admin-only). Manages WEB users (Auth.js
 * `users`) — NOT Telegram `people`. Every action is admin-guarded via assertAdmin.
 */
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { users } from '@/db/schema/auth';
import { assertAdmin } from '@/lib/rbac';
import { effectiveRole, isAdminEmail, ROLES } from '@/lib/authz';

export interface AccountRow {
  id: string;
  name: string | null;
  email: string | null;
  effectiveRole: string;
  /** @bayrak.ai accounts are always admin and cannot be changed in the panel. */
  locked: boolean;
}

export async function getAccounts(): Promise<AccountRow[]> {
  await assertAdmin();
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .orderBy(users.email);
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    effectiveRole: effectiveRole(u.email, u.role),
    locked: isAdminEmail(u.email),
  }));
}

// Panel may only assign office_engineer or audit_engineer. admin is NEVER
// assignable here — it is derived solely from the @bayrak.ai email domain.
const setRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum([ROLES.OFFICE, ROLES.AUDIT]),
});

export async function setUserRole(userId: string, role: string): Promise<{ ok: true }> {
  await assertAdmin();
  const parsed = setRoleSchema.parse({ userId, role });

  const [target] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, parsed.userId))
    .limit(1);
  if (!target) throw new Error('User not found.');

  // Invariant: @bayrak.ai accounts are admin by domain and immutable here.
  if (isAdminEmail(target.email)) {
    throw new Error('Admin accounts (@bayrak.ai) cannot be reassigned.');
  }

  await db.update(users).set({ role: parsed.role }).where(eq(users.id, parsed.userId));
  revalidatePath('/dashboard/settings/users');
  return { ok: true };
}
