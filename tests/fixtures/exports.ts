/**
 * tests/fixtures/exports.ts
 *
 * Shared seeding helpers for the Phase 11 Wave-2 route-handler test suites.
 *
 * Plan 11-04 Task 1 implements seedFinalizedHakedisFixture as a real function
 * (replacing the throwing Wave-1 stub from Plan 11-01b). The fixture inserts
 * a finalized hakkediş period with priced BOQ items, approved submissions,
 * and computed period lines so the EXP-02 (Excel) and EXP-04 (PDF) route
 * handler tests can run end-to-end with a non-null deductions object.
 *
 * IMPORTANT: previousCumulativeQty = '0' for a single-period fixture. Plan
 * 11-04 tests rely on this to compute deductions against the SUM of
 * period_value via getPeriodDetail().
 */

import type { getTestDb } from './db';

type Db = Awaited<ReturnType<typeof getTestDb>>;

/**
 * Deterministic IDs used by seedFinalizedHakedisFixture so tests can assert
 * route handler responses against known seed values.
 *
 * tenantId matches getDefaultTenantId() — the test-DB default tenant.
 * Project name 'İstanbul Doğalgaz' exercises both D-112 toSlug (→ 'istanbul-dogalgaz')
 * and D-106 PDF Turkish-glyph rendering ('İ' must survive end-to-end).
 */
export const HAKEDIS_FIXTURE_IDS = {
  tenantId:   '00000000-0000-0000-0000-000000000001',
  userId:     'test-user-id', // Auth.js users.id (matches the auth() mock in exports.test.ts)
  projectId:  '00000000-0000-0000-0000-0000000e0001',
  boqItemAId: '00000000-0000-0000-0000-0000000e0002',
  boqItemBId: '00000000-0000-0000-0000-0000000e0003',
  personId:   '00000000-0000-0000-0000-0000000e0004',
  flowAId:    '00000000-f000-0000-0000-0000000e0005',
  flowBId:    '00000000-f000-0000-0000-0000000e0006',
  submissionAId: '00000000-0000-0000-0000-0000000e0007',
  submissionBId: '00000000-0000-0000-0000-0000000e0008',
  periodId:   '00000000-0000-0000-0000-0000000e0009',
  lineAId:    '00000000-0000-0000-0000-0000000e000a',
  lineBId:    '00000000-0000-0000-0000-0000000e000b',
} as const;

/**
 * seedFinalizedHakedisFixture — inserts a finalized hakkediş period with priced
 * BOQ items, approved submissions, and ≥2 computed period lines into the test DB.
 *
 * After seeding:
 *   - Default tenant (id 0000…0001) exists
 *   - Auth.js user (id 'test-user-id') exists — matches the auth() mock id
 *   - Project 'İstanbul Doğalgaz' exists (D-106 + D-112 end-to-end gate)
 *   - 2 BOQ items with TRY unit prices ('100.00' + '200.00')
 *   - 1 worker (people row) + 1 worker assignment
 *   - 2 approved submissions (one per BOQ item; decided 2026-01-20)
 *   - 1 finalized hakedis period (HK-2026-01, periodEndDate 2026-01-31)
 *   - 2 hakedis_period_lines (one per BOQ item) — non-null deductions guaranteed
 *
 * The period uses kdvRate '0.20', retentionRate '0.05', tevkifatFraction '0.4',
 * stopajEnabled false, avansKesintisiRate '0' — predictable deduction values
 * that exports.test.ts asserts against via getPeriodDetail.
 *
 * Returns the deterministic IDs so EXP-02 + EXP-04 tests can invoke the route
 * handlers directly against the seeded periodId without re-deriving anything.
 */
export async function seedFinalizedHakedisFixture(db: Db): Promise<{
  tenantId: string;
  projectId: string;
  periodId: string;
  periodNumber: string;
}> {
  const { sql } = await import('drizzle-orm');
  const ids = HAKEDIS_FIXTURE_IDS;

  // 1. Tenant — idempotent (may already exist from describeIfDb beforeEach)
  await db.execute(sql.raw(
    `INSERT INTO tenants (id, name) VALUES ('${ids.tenantId}', 'Default') ON CONFLICT DO NOTHING`,
  ));

  // 2. Auth.js user — required for hakedis_periods.created_by_user_id FK + office_activity_log.actor_user_id FK
  await db.execute(sql.raw(
    `INSERT INTO users (id, email) VALUES ('${ids.userId}', 'test@example.com') ON CONFLICT DO NOTHING`,
  ));

  // 3. Project with Turkish-character name — proves D-112 toSlug + D-106 PDF Turkish render end-to-end
  await db.execute(sql.raw(
    `INSERT INTO projects (id, tenant_id, name) VALUES ('${ids.projectId}', '${ids.tenantId}', 'İstanbul Doğalgaz') ON CONFLICT DO NOTHING`,
  ));

  // 4. Two priced BOQ items (currency_code = 'TRY' matches the period's currency)
  await db.execute(sql.raw(
    `INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) ` +
    `VALUES ('${ids.boqItemAId}', '${ids.tenantId}', '${ids.projectId}', 'DN200 HDPE Boru', 'm', 1000, 0, 1, '100.00', 'TRY') ON CONFLICT DO NOTHING`,
  ));
  await db.execute(sql.raw(
    `INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) ` +
    `VALUES ('${ids.boqItemBId}', '${ids.tenantId}', '${ids.projectId}', 'DN300 HDPE Boru', 'm', 1000, 0, 2, '200.00', 'TRY') ON CONFLICT DO NOTHING`,
  ));

  // 5. Worker (people row) — submissions has notNull FK to person_id
  await db.execute(sql.raw(
    `INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${ids.personId}', '${ids.tenantId}', 999111222, 'Test Worker') ON CONFLICT DO NOTHING`,
  ));

  // 6. Two approved submissions — decided BEFORE 2026-01-31 cutoff (Istanbul tz)
  await db.execute(sql.raw(
    `INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at, decided_at) ` +
    `VALUES ('${ids.submissionAId}', '${ids.flowAId}', '${ids.tenantId}', '${ids.projectId}', '${ids.personId}', '${ids.boqItemAId}', 'approved', '10.000', 'https://example.com/a.jpg', NOW(), '2026-01-20T10:00:00+03:00'::timestamptz) ON CONFLICT DO NOTHING`,
  ));
  await db.execute(sql.raw(
    `INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at, decided_at) ` +
    `VALUES ('${ids.submissionBId}', '${ids.flowBId}', '${ids.tenantId}', '${ids.projectId}', '${ids.personId}', '${ids.boqItemBId}', 'approved', '5.000', 'https://example.com/b.jpg', NOW(), '2026-01-20T11:00:00+03:00'::timestamptz) ON CONFLICT DO NOTHING`,
  ));

  // 7. Hakedis period — status='finalized', finalizedAt = NOW()
  // periodNumber 'HK-2026-01', periodEndDate '2026-01-31', currencyCode 'TRY'
  // kdvRate=0.20, retentionRate=0.05, tevkifatFraction=0.4, stopajEnabled=false, avansKesintisiRate=0
  await db.execute(sql.raw(
    `INSERT INTO hakedis_periods (id, tenant_id, project_id, period_number, period_end_date, currency_code, status, ` +
    `kdv_rate, retention_rate, tevkifat_fraction, stopaj_enabled, stopaj_rate, avans_kesintisi_rate, created_by_user_id, finalized_at) ` +
    `VALUES ('${ids.periodId}', '${ids.tenantId}', '${ids.projectId}', 'HK-2026-01', '2026-01-31', 'TRY', 'finalized', ` +
    `'0.2000', '0.0500', '0.4000', false, NULL, '0.0000', '${ids.userId}', NOW()) ON CONFLICT DO NOTHING`,
  ));

  // 8. Two period lines — INSERT MUST NOT supply period_qty (D-104 GENERATED column)
  // Line A: 10 m × 100 = 1000 (matches submission A: qty 10)
  // Line B: 5  m × 200 = 1000 (matches submission B: qty 5)
  // gross = 2000; previousCumulativeQty = '0' (first/only period)
  await db.execute(sql.raw(
    `INSERT INTO hakedis_period_lines (id, tenant_id, period_id, boq_item_id, ` +
    `material_snapshot, unit_snapshot, currency_code_snapshot, unit_price_snapshot, ` +
    `cumulative_qty_approved, previous_cumulative_qty, period_value, cumulative_value) ` +
    `VALUES ('${ids.lineAId}', '${ids.tenantId}', '${ids.periodId}', '${ids.boqItemAId}', ` +
    `'DN200 HDPE Boru', 'm', 'TRY', '100.00', ` +
    `'10.000', '0', '1000.00', '1000.00') ON CONFLICT DO NOTHING`,
  ));
  await db.execute(sql.raw(
    `INSERT INTO hakedis_period_lines (id, tenant_id, period_id, boq_item_id, ` +
    `material_snapshot, unit_snapshot, currency_code_snapshot, unit_price_snapshot, ` +
    `cumulative_qty_approved, previous_cumulative_qty, period_value, cumulative_value) ` +
    `VALUES ('${ids.lineBId}', '${ids.tenantId}', '${ids.periodId}', '${ids.boqItemBId}', ` +
    `'DN300 HDPE Boru', 'm', 'TRY', '200.00', ` +
    `'5.000', '0', '1000.00', '1000.00') ON CONFLICT DO NOTHING`,
  ));

  return {
    tenantId: ids.tenantId,
    projectId: ids.projectId,
    periodId: ids.periodId,
    periodNumber: 'HK-2026-01',
  };
}
