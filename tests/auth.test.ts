import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Auth allowlist unit tests (pure — no DB, no Auth.js runtime needed).
 * Tests the exported `isAllowed(email): boolean` helper from src/lib/auth.ts.
 */

describe('isAllowed — allowlist enforcement (AUTH-01 / D-11)', () => {
  // We dynamically import the module inside each test group so we can
  // control the AUTH_ALLOWED_EMAILS env var via vi.stubEnv without module-level
  // contamination from other tests.

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false for a non-allowlisted email when list is set', async () => {
    vi.stubEnv('AUTH_ALLOWED_EMAILS', 'allowed@bayrak.ai,admin@bayrak.ai');
    const { isAllowed } = await import('../src/lib/auth');
    expect(isAllowed('hacker@evil.com')).toBe(false);
  });

  it('returns true for an allowlisted email (exact match)', async () => {
    vi.stubEnv('AUTH_ALLOWED_EMAILS', 'allowed@bayrak.ai,admin@bayrak.ai');
    const { isAllowed } = await import('../src/lib/auth');
    expect(isAllowed('allowed@bayrak.ai')).toBe(true);
  });

  it('returns true for an allowlisted email (case-insensitive — UPPER input)', async () => {
    vi.stubEnv('AUTH_ALLOWED_EMAILS', 'allowed@bayrak.ai');
    const { isAllowed } = await import('../src/lib/auth');
    expect(isAllowed('ALLOWED@BAYRAK.AI')).toBe(true);
  });

  it('returns true for an allowlisted email (case-insensitive — mixed-case env list)', async () => {
    vi.stubEnv('AUTH_ALLOWED_EMAILS', 'Engineer@Bayrak.AI');
    const { isAllowed } = await import('../src/lib/auth');
    expect(isAllowed('engineer@bayrak.ai')).toBe(true);
  });

  it('returns false for an empty string email', async () => {
    vi.stubEnv('AUTH_ALLOWED_EMAILS', 'allowed@bayrak.ai');
    const { isAllowed } = await import('../src/lib/auth');
    expect(isAllowed('')).toBe(false);
  });

  it('returns false when AUTH_ALLOWED_EMAILS is not set (no access by default)', async () => {
    vi.stubEnv('AUTH_ALLOWED_EMAILS', '');
    const { isAllowed } = await import('../src/lib/auth');
    expect(isAllowed('anyone@example.com')).toBe(false);
  });

  it('handles whitespace-padded entries in the allowlist', async () => {
    vi.stubEnv('AUTH_ALLOWED_EMAILS', '  engineer@bayrak.ai ,  admin@bayrak.ai  ');
    const { isAllowed } = await import('../src/lib/auth');
    expect(isAllowed('engineer@bayrak.ai')).toBe(true);
  });

  it('returns false for a second non-allowlisted email (multiple-entry list)', async () => {
    vi.stubEnv('AUTH_ALLOWED_EMAILS', 'a@bayrak.ai,b@bayrak.ai');
    const { isAllowed } = await import('../src/lib/auth');
    expect(isAllowed('c@bayrak.ai')).toBe(false);
  });
});
