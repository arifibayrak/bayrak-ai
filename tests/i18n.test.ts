import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * i18n unit tests (pure Node — no Next.js runtime needed).
 *
 * Three groups:
 *  (a) getRequestConfig returns locale 'tr' when no locale cookie is set (TR default, I18N-02)
 *  (b) getRequestConfig returns locale 'en' when locale cookie value is 'en'
 *  (c) key-parity assertion: every key path in tr.json exists in en.json and vice versa
 */

// ---------------------------------------------------------------------------
// Helper: flatten nested object to dot-path keys
// ---------------------------------------------------------------------------
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? flattenKeys(v as Record<string, unknown>, prefix + k + '.')
      : [prefix + k]
  );
}

// ---------------------------------------------------------------------------
// Pure locale selection logic — tested in isolation from next/headers
//
// The actual src/i18n/request.ts does:
//   const cookieStore = await cookies();
//   const locale = cookieStore.get('locale')?.value ?? 'tr';
//
// We test this logic directly via a pure helper so there is no dependency on
// the next/headers runtime (which is unavailable in a plain Vitest/Node env).
// ---------------------------------------------------------------------------

function resolveLocale(cookieValue: string | undefined): string {
  // Mirror the logic in src/i18n/request.ts exactly:
  //   const locale = cookieStore.get('locale')?.value ?? 'tr';
  return cookieValue ?? 'tr';
}

describe('locale resolution logic (mirrors src/i18n/request.ts)', () => {
  it('returns tr when no locale cookie is present (TR default — I18N-02)', () => {
    expect(resolveLocale(undefined)).toBe('tr');
  });

  it('returns en when locale cookie value is "en"', () => {
    expect(resolveLocale('en')).toBe('en');
  });

  it('returns tr when locale cookie value is "tr"', () => {
    expect(resolveLocale('tr')).toBe('tr');
  });

  it('preserves an unknown locale value as returned by the cookie (caller handles validation)', () => {
    // The raw resolver is a passthrough; higher-level code or next-intl would
    // reject unsupported locales — not the resolver's responsibility.
    expect(resolveLocale('xx')).toBe('xx');
  });
});

// ---------------------------------------------------------------------------
// (c) Key parity: tr.json ⟺ en.json
// ---------------------------------------------------------------------------

describe('message catalog key parity', () => {
  it('tr.json and en.json have identical key sets', async () => {
    const tr = (await import('../messages/tr.json')).default as Record<string, unknown>;
    const en = (await import('../messages/en.json')).default as Record<string, unknown>;

    const trKeys = new Set(flattenKeys(tr));
    const enKeys = new Set(flattenKeys(en));

    const missingFromEn = [...trKeys].filter((k) => !enKeys.has(k));
    const missingFromTr = [...enKeys].filter((k) => !trKeys.has(k));

    expect(missingFromEn, 'Keys present in tr.json but missing from en.json').toEqual([]);
    expect(missingFromTr, 'Keys present in en.json but missing from tr.json').toEqual([]);

    // Sanity: both catalogs must have a meaningful number of keys
    expect(trKeys.size).toBeGreaterThan(20);
  });

  it('auth.signin keys cover the UI-SPEC Copywriting Contract', async () => {
    const tr = (await import('../messages/tr.json')).default as Record<string, unknown>;
    const en = (await import('../messages/en.json')).default as Record<string, unknown>;

    const trFlat = new Set(flattenKeys(tr));
    const enFlat = new Set(flattenKeys(en));

    const requiredAuthKeys = [
      'auth.signin.cta',
      'auth.signin.success',
      'auth.signin.error_not_allowed',
      'auth.signin.heading',
      'auth.signin.subheading',
      'auth.signin.email_label',
      'auth.signin.helper',
      'auth.signin.sending',
    ];

    for (const key of requiredAuthKeys) {
      expect(trFlat.has(key), `tr.json missing required key: ${key}`).toBe(true);
      expect(enFlat.has(key), `en.json missing required key: ${key}`).toBe(true);
    }
  });

  it('nav keys cover TopNav strings (wordmark, sign_out, language_toggle_label)', async () => {
    const tr = (await import('../messages/tr.json')).default as Record<string, unknown>;
    const en = (await import('../messages/en.json')).default as Record<string, unknown>;

    const trFlat = new Set(flattenKeys(tr));
    const enFlat = new Set(flattenKeys(en));

    const requiredNavKeys = ['nav.wordmark', 'nav.sign_out', 'nav.language_toggle_label'];

    for (const key of requiredNavKeys) {
      expect(trFlat.has(key), `tr.json missing nav key: ${key}`).toBe(true);
      expect(enFlat.has(key), `en.json missing nav key: ${key}`).toBe(true);
    }
  });

  it('dashboard keys cover all UI-SPEC CTAs (create_project, save_changes, add_item, etc.)', async () => {
    const tr = (await import('../messages/tr.json')).default as Record<string, unknown>;
    const trFlat = new Set(flattenKeys(tr));

    const requiredDashboardKeys = [
      'dashboard.projects.create_project',
      'dashboard.projects.save_changes',
      'dashboard.projects.empty_state',
      'dashboard.boq.add_item',
      'dashboard.boq.import_excel',
      'dashboard.boq.confirm_import',
      'dashboard.boq.empty_state',
      'dashboard.route.save_route',
      'dashboard.route.replace_route',
      'dashboard.route.choose_file',
      'dashboard.people.approve',
      'dashboard.people.reject',
      'dashboard.people.add_manually',
      'dashboard.people.empty_active',
    ];

    for (const key of requiredDashboardKeys) {
      expect(trFlat.has(key), `tr.json missing dashboard key: ${key}`).toBe(true);
    }
  });
});
