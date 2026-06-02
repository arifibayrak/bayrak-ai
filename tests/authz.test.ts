import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * RBAC tests (Layer 1-3).
 *
 *  - Pure authz primitives (effectiveRole, canWrite, etc.) — no mocks needed.
 *  - Server-action guards (assertCanWrite, assertAdmin, setUserRole) — auth() is
 *    mocked so we exercise the guard without a DB. assertAdmin/assertCanWrite
 *    throw BEFORE any DB access, so no test branch is required.
 *
 * SECURITY INVARIANT under test: a non-@bayrak.ai email can NEVER be admin,
 * regardless of the stored role.
 */

import {
  ROLES,
  effectiveRole,
  isAdminEmail,
  canWrite,
  canManageAccounts,
  auditCanAccessPath,
} from '@/lib/authz';

// ─── Pure primitives (no mocks) ───────────────────────────────────────────────

describe('effectiveRole — admin is domain-derived, never stored', () => {
  it('@bayrak.ai is always admin (stored role ignored)', () => {
    expect(effectiveRole('arif@bayrak.ai', 'office_engineer')).toBe(ROLES.ADMIN);
    expect(effectiveRole('mehmet@bayrak.ai', null)).toBe(ROLES.ADMIN);
    expect(effectiveRole('x@BAYRAK.AI', 'audit_engineer')).toBe(ROLES.ADMIN);
  });

  it('a non-@bayrak.ai email can NEVER be admin, even if the row stores "admin"', () => {
    expect(effectiveRole('hacker@evil.com', 'admin')).toBe(ROLES.OFFICE);
    expect(effectiveRole('user@gmail.com', 'admin')).toBe(ROLES.OFFICE);
  });

  it('non-@bayrak.ai resolves to its stored office/audit role', () => {
    expect(effectiveRole('user@gmail.com', 'audit_engineer')).toBe(ROLES.AUDIT);
    expect(effectiveRole('user@gmail.com', 'office_engineer')).toBe(ROLES.OFFICE);
    expect(effectiveRole('user@gmail.com', null)).toBe(ROLES.OFFICE); // default
    expect(effectiveRole('user@gmail.com', 'garbage')).toBe(ROLES.OFFICE);
  });
});

describe('isAdminEmail', () => {
  it('matches @bayrak.ai case-insensitively, rejects others', () => {
    expect(isAdminEmail('a@bayrak.ai')).toBe(true);
    expect(isAdminEmail('A@BAYRAK.AI')).toBe(true);
    expect(isAdminEmail('a@evil.com')).toBe(false);
    expect(isAdminEmail('')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});

describe('canWrite / canManageAccounts', () => {
  it('admin + office may write; audit is read-only', () => {
    expect(canWrite(ROLES.ADMIN)).toBe(true);
    expect(canWrite(ROLES.OFFICE)).toBe(true);
    expect(canWrite(ROLES.AUDIT)).toBe(false);
  });

  it('only admin may manage accounts', () => {
    expect(canManageAccounts(ROLES.ADMIN)).toBe(true);
    expect(canManageAccounts(ROLES.OFFICE)).toBe(false);
    expect(canManageAccounts(ROLES.AUDIT)).toBe(false);
  });
});

describe('auditCanAccessPath — read-only surface allowlist', () => {
  it('allows overview, records, analytics (and sub-paths)', () => {
    expect(auditCanAccessPath('/dashboard/overview')).toBe(true);
    expect(auditCanAccessPath('/dashboard/records')).toBe(true);
    expect(auditCanAccessPath('/dashboard/records/abc')).toBe(true);
    expect(auditCanAccessPath('/dashboard/analytics')).toBe(true);
    expect(auditCanAccessPath('/dashboard/analytics/office-engineers/x')).toBe(true);
  });

  it('denies office-only routes', () => {
    expect(auditCanAccessPath('/dashboard/projects')).toBe(false);
    expect(auditCanAccessPath('/dashboard/people')).toBe(false);
    expect(auditCanAccessPath('/dashboard/hakedis')).toBe(false);
    expect(auditCanAccessPath('/dashboard/exports')).toBe(false);
    expect(auditCanAccessPath('/dashboard/requests')).toBe(false);
    expect(auditCanAccessPath('/dashboard/settings/users')).toBe(false);
  });
});

// ─── Server-action guards (auth() mocked) ─────────────────────────────────────

let mockSession: { user: { id: string; email: string; role: string } } | null = null;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => mockSession),
}));

// rbac.ts imports redirect; assert* never calls it, but the import must resolve.
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

function setSession(role: string, email = 'user@gmail.com') {
  mockSession = { user: { id: 'u1', email, role } };
}

describe('assertCanWrite — blocks audit_engineer', () => {
  beforeEach(() => {
    mockSession = null;
  });
  afterEach(() => {
    mockSession = null;
  });

  it('throws Unauthorized when there is no session', async () => {
    const { assertCanWrite } = await import('@/lib/rbac');
    await expect(assertCanWrite()).rejects.toThrow('Unauthorized');
  });

  it('throws Forbidden for audit_engineer', async () => {
    setSession(ROLES.AUDIT);
    const { assertCanWrite } = await import('@/lib/rbac');
    await expect(assertCanWrite()).rejects.toThrow('read-only');
  });

  it('allows office_engineer and admin', async () => {
    const { assertCanWrite } = await import('@/lib/rbac');
    setSession(ROLES.OFFICE);
    await expect(assertCanWrite()).resolves.toBeTruthy();
    setSession(ROLES.ADMIN, 'arif@bayrak.ai');
    await expect(assertCanWrite()).resolves.toBeTruthy();
  });
});

describe('assertAdmin / setUserRole — admin-only account management', () => {
  beforeEach(() => {
    mockSession = null;
  });
  afterEach(() => {
    mockSession = null;
  });

  it('assertAdmin throws Forbidden for office_engineer', async () => {
    setSession(ROLES.OFFICE);
    const { assertAdmin } = await import('@/lib/rbac');
    await expect(assertAdmin()).rejects.toThrow('admin only');
  });

  it('setUserRole is blocked for a non-admin caller (before any DB access)', async () => {
    setSession(ROLES.OFFICE);
    const { setUserRole } = await import('@/actions/users');
    await expect(setUserRole('u2', ROLES.AUDIT)).rejects.toThrow('admin only');
  });

  it('setUserRole rejects an attempt to assign an invalid role for an admin caller', async () => {
    setSession(ROLES.ADMIN, 'arif@bayrak.ai');
    const { setUserRole } = await import('@/actions/users');
    // admin passes the guard; Zod then rejects the disallowed 'admin' role
    // (panel may only assign office_engineer | audit_engineer).
    await expect(setUserRole('u2', 'admin')).rejects.toThrow();
  });
});
