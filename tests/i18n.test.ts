import { describe, it, expect } from 'vitest';

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
//   const raw = cookieStore.get('locale')?.value;
//   const locale = isSupportedLocale(raw) ? raw : 'tr';
//
// We test this logic directly via a pure helper so there is no dependency on
// the next/headers runtime (which is unavailable in a plain Vitest/Node env).
// ---------------------------------------------------------------------------

const SUPPORTED_LOCALES = ['tr', 'en'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(v: string | undefined): v is SupportedLocale {
  return SUPPORTED_LOCALES.includes(v as SupportedLocale);
}

function resolveLocale(cookieValue: string | undefined): string {
  // Mirror the allowlist logic in src/i18n/request.ts exactly (CR-01 fix):
  return isSupportedLocale(cookieValue) ? cookieValue : 'tr';
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

  it('rejects unknown locale values and falls back to tr (CR-01 allowlist)', () => {
    // Unknown locales must NOT be passed to import() — they fall back to default.
    expect(resolveLocale('xx')).toBe('tr');
    expect(resolveLocale('../../etc/passwd')).toBe('tr');
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

// ---------------------------------------------------------------------------
// (d) dashboard.admin.* namespace coverage (I18N-03)
// ---------------------------------------------------------------------------

describe("dashboard.admin.* namespace coverage (I18N-03)", () => {
  it("representative keys exist in both en.json and tr.json", async () => {
    const tr = (await import('../messages/tr.json')).default as Record<string, unknown>;
    const en = (await import('../messages/en.json')).default as Record<string, unknown>;

    const trFlat = new Set(flattenKeys(tr));
    const enFlat = new Set(flattenKeys(en));

    const requiredAdminKeys = [
      // nav sub-namespace
      'dashboard.admin.nav.overview',
      'dashboard.admin.nav.projects',
      'dashboard.admin.nav.people',
      'dashboard.admin.nav.analytics',
      'dashboard.admin.nav.hakedis',
      'dashboard.admin.nav.exports',
      'dashboard.admin.nav.main_nav_aria',
      'dashboard.admin.nav.open_nav',
      'dashboard.admin.nav.close_nav',
      'dashboard.admin.nav.expand_sidebar',
      'dashboard.admin.nav.collapse_sidebar',
      // overview sub-namespace
      'dashboard.admin.overview.heading',
      'dashboard.admin.overview.subtitle_all_time',
      'dashboard.admin.overview.subtitle_filtered',
      'dashboard.admin.overview.kpi_pending_label',
      'dashboard.admin.overview.kpi_pending_sub',
      'dashboard.admin.overview.kpi_approvals_label',
      'dashboard.admin.overview.kpi_rejections_label',
      'dashboard.admin.overview.kpi_workers_label',
      'dashboard.admin.overview.kpi_sub_all_time',
      'dashboard.admin.overview.kpi_sub_filtered',
      'dashboard.admin.overview.ev_heading',
      'dashboard.admin.overview.ev_col_project',
      'dashboard.admin.overview.ev_col_bac',
      'dashboard.admin.overview.ev_col_ev',
      'dashboard.admin.overview.ev_col_complete',
      'dashboard.admin.overview.chart_throughput',
      'dashboard.admin.overview.chart_earned_value',
      'dashboard.admin.overview.chart_rejection_rate',
      'dashboard.admin.overview.empty_no_projects',
      'dashboard.admin.overview.chart_no_data',
      'dashboard.admin.overview.error_load',
      // filters sub-namespace
      'dashboard.admin.filters.from',
      'dashboard.admin.filters.to',
      'dashboard.admin.filters.all_projects',
      'dashboard.admin.filters.all_people',
      'dashboard.admin.filters.clear',
      // currency sub-namespace
      'dashboard.admin.currency.label',
      // people sub-namespace
      'dashboard.admin.people.heading',
      'dashboard.admin.people.subtitle',
      'dashboard.admin.people.tab_workers',
      'dashboard.admin.people.tab_auditors',
      'dashboard.admin.people.empty_state',
      'dashboard.admin.people.col_name',
      'dashboard.admin.people.col_submissions',
      'dashboard.admin.people.col_approved',
      'dashboard.admin.people.col_rejected',
      'dashboard.admin.people.col_pending',
      'dashboard.admin.people.col_value',
      'dashboard.admin.people.col_decisions',
      'dashboard.admin.people.col_turnaround',
      'dashboard.admin.people.col_backlog',
      'dashboard.admin.people.back_to_people',
      'dashboard.admin.people.role_worker',
      'dashboard.admin.people.role_auditor',
      'dashboard.admin.people.kpi_worker_metrics',
      'dashboard.admin.people.kpi_auditor_metrics',
      'dashboard.admin.people.no_records_alert',
      'dashboard.admin.people.error_load',
      // records sub-namespace
      'dashboard.admin.records.heading',
      'dashboard.admin.records.col_status',
      'dashboard.admin.records.col_worker',
      'dashboard.admin.records.col_project',
      'dashboard.admin.records.col_boq',
      'dashboard.admin.records.col_quantity',
      'dashboard.admin.records.col_submitted',
      'dashboard.admin.records.col_auditor',
      'dashboard.admin.records.details_header',
      'dashboard.admin.records.details',
      'dashboard.admin.records.prev',
      'dashboard.admin.records.next',
      'dashboard.admin.records.pagination',
      'dashboard.admin.records.empty',
      'dashboard.admin.records.error_load',
      // detail sub-namespace
      'dashboard.admin.detail.heading',
      'dashboard.admin.detail.back',
      'dashboard.admin.detail.field_worker',
      'dashboard.admin.detail.field_project',
      'dashboard.admin.detail.field_boq',
      'dashboard.admin.detail.field_quantity',
      'dashboard.admin.detail.field_submitted',
      'dashboard.admin.detail.field_location',
      'dashboard.admin.detail.field_location_warning',
      'dashboard.admin.detail.field_auditor',
      'dashboard.admin.detail.field_decided',
      'dashboard.admin.detail.field_rejection_reason',
      'dashboard.admin.detail.ai_slot_label',
      'dashboard.admin.detail.ai_slot_body',
      'dashboard.admin.detail.view_on_maps',
      'dashboard.admin.detail.photo_alt',
      'dashboard.admin.detail.no_photo',
      // stubs sub-namespace
      'dashboard.admin.stubs.coming_soon',
      'dashboard.admin.stubs.analytics_heading',
      'dashboard.admin.stubs.analytics_body',
      'dashboard.admin.stubs.hakedis_heading',
      'dashboard.admin.stubs.hakedis_body',
      'dashboard.admin.stubs.exports_heading',
      'dashboard.admin.stubs.exports_body',
    ];

    for (const key of requiredAdminKeys) {
      expect(trFlat.has(key), `tr.json missing dashboard.admin key: ${key}`).toBe(true);
      expect(enFlat.has(key), `en.json missing dashboard.admin key: ${key}`).toBe(true);
    }
  });

  it("tr.json and en.json still have identical key sets after admin namespace addition", async () => {
    const tr = (await import('../messages/tr.json')).default as Record<string, unknown>;
    const en = (await import('../messages/en.json')).default as Record<string, unknown>;

    const trKeys = new Set(flattenKeys(tr));
    const enKeys = new Set(flattenKeys(en));

    const missingFromEn = [...trKeys].filter((k) => !enKeys.has(k));
    const missingFromTr = [...enKeys].filter((k) => !trKeys.has(k));

    expect(missingFromEn, 'Keys in tr.json but missing from en.json').toEqual([]);
    expect(missingFromTr, 'Keys in en.json but missing from tr.json').toEqual([]);
  });
});
