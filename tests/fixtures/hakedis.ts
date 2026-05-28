/**
 * tests/fixtures/hakedis.ts
 *
 * Phase 12 Wave 0 fixture helper — seeds the minimal row-set needed for the
 * submission-driven hakkediş contract tests in tests/hakedis-live.test.ts.
 *
 * seedDraftPeriod() inserts:
 *   - tenant                 (idempotent ON CONFLICT DO NOTHING)
 *   - project                (single project for the period)
 *   - BOQ item               (priced — submissions tests need a non-NULL unit_price)
 *   - worker + auditor people rows
 *   - auditor assignment row (so fan-out logic has a recipient)
 *   - hakedis_periods row    (status='draft' — only state recomputeHakedisLine will write to)
 *
 * Pattern mirrors tests/fixtures/exports.ts seedFinalizedHakedisFixture for
 * consistency: idempotent inserts via ON CONFLICT DO NOTHING, lazy-imported
 * `drizzle-orm`, returns deterministic IDs the tests assert against.
 *
 * The helper is INTENTIONALLY narrow: it stops at the draft period creation.
 * Individual tests insert their own submissions so each contract row can
 * vary independently (different boqItem, different decided_at, race scenarios).
 */

import type { getTestDb } from './db';

type Db = Awaited<ReturnType<typeof getTestDb>>;

/**
 * Deterministic UUIDs for Phase 12 hakkediş-live fixture rows.
 * Chosen so they do NOT collide with HAKEDIS_FIXTURE_IDS in tests/fixtures/exports.ts.
 */
export const HAKEDIS_LIVE_FIXTURE_IDS = {
  tenantId:        '00000000-0000-0000-0000-000000000001',
  userId:          'test-user-auth-id', // matches auth() mock in hakedis-live.test.ts
  projectId:       '00000000-0000-0000-0000-0000000c0001',
  boqItemId:       '00000000-0000-0000-0000-0000000c0002',
  workerPersonId:  '00000000-0000-0000-0000-0000000c0003',
  auditorPersonId: '00000000-0000-0000-0000-0000000c0004',
  periodId:        '00000000-0000-0000-0000-0000000c0005',
  workerAssignmentId:  '00000000-0000-0000-0000-0000000c0006',
  auditorAssignmentId: '00000000-0000-0000-0000-0000000c0007',
} as const;

/**
 * seedDraftPeriod — inserts the row-set needed for Phase 12 contract tests.
 *
 * Inputs (all optional):
 *   - unitPrice       BOQ unit price string (default '1000.0000')
 *   - currencyCode    Period + BOQ currency (default 'TRY')
 *   - periodEndDate   YYYY-MM-DD for period_end_date (default tomorrow UTC)
 *
 * Returns the deterministic IDs so callers can immediately insert submissions
 * + invoke recomputeHakedisLine(projectId, boqItemId, currencyCode) without
 * re-deriving anything.
 *
 * Idempotent: every INSERT uses ON CONFLICT DO NOTHING so the helper can be
 * called repeatedly within a test session without violating PK uniqueness.
 */
export async function seedDraftPeriod(
  db: Db,
  opts?: {
    unitPrice?: string;
    currencyCode?: string;
    periodEndDate?: string;
  },
): Promise<{
  tenantId: string;
  userId: string;
  projectId: string;
  boqItemId: string;
  workerPersonId: string;
  auditorPersonId: string;
  periodId: string;
}> {
  const { sql } = await import('drizzle-orm');
  const ids = HAKEDIS_LIVE_FIXTURE_IDS;

  const unitPrice = opts?.unitPrice ?? '1000.0000';
  const currencyCode = opts?.currencyCode ?? 'TRY';
  // Default: tomorrow (YYYY-MM-DD UTC) so any approval "today" lands within the window.
  const periodEndDate = opts?.periodEndDate ?? (() => {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  })();

  // 1. Tenant
  await db.execute(sql.raw(
    `INSERT INTO tenants (id, name) VALUES ('${ids.tenantId}', 'Phase 12 Test Tenant') ON CONFLICT DO NOTHING`,
  ));

  // 2. Auth.js user — required by hakedis_periods.created_by_user_id FK
  await db.execute(sql.raw(
    `INSERT INTO users (id, email) VALUES ('${ids.userId}', 'test@example.com') ON CONFLICT DO NOTHING`,
  ));

  // 3. Project
  await db.execute(sql.raw(
    `INSERT INTO projects (id, tenant_id, name) VALUES ('${ids.projectId}', '${ids.tenantId}', 'Phase 12 Draft-Period Project') ON CONFLICT DO NOTHING`,
  ));

  // 4. Priced BOQ item (submissions tests need unit_price NOT NULL so D-103 doesn't exclude)
  await db.execute(sql`
    INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code)
    VALUES (${ids.boqItemId}, ${ids.tenantId}, ${ids.projectId}, 'DN200 HDPE Boru', 'm', '1000.000', '0.000', 1, ${unitPrice}, ${currencyCode})
    ON CONFLICT DO NOTHING
  `);

  // 5. Worker + auditor people rows
  await db.execute(sql.raw(
    `INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${ids.workerPersonId}', '${ids.tenantId}', 999111200, 'Phase 12 Worker') ON CONFLICT DO NOTHING`,
  ));
  await db.execute(sql.raw(
    `INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${ids.auditorPersonId}', '${ids.tenantId}', 999111201, 'Phase 12 Auditor') ON CONFLICT DO NOTHING`,
  ));

  // 6. Worker + auditor assignments (so auditor fan-out has a target)
  await db.execute(sql.raw(
    `INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) ` +
    `VALUES ('${ids.workerAssignmentId}', '${ids.tenantId}', '${ids.workerPersonId}', '${ids.projectId}', 'worker') ON CONFLICT DO NOTHING`,
  ));
  await db.execute(sql.raw(
    `INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) ` +
    `VALUES ('${ids.auditorAssignmentId}', '${ids.tenantId}', '${ids.auditorPersonId}', '${ids.projectId}', 'auditor') ON CONFLICT DO NOTHING`,
  ));

  // 7. Draft hakedis period — status='draft' so recomputeHakedisLine will write
  await db.execute(sql`
    INSERT INTO hakedis_periods (
      id, tenant_id, project_id, period_number, period_end_date, currency_code, status,
      kdv_rate, retention_rate, tevkifat_fraction, stopaj_enabled, stopaj_rate, avans_kesintisi_rate,
      created_by_user_id
    ) VALUES (
      ${ids.periodId}, ${ids.tenantId}, ${ids.projectId}, 'HK-2026-12-LIVE', ${periodEndDate}, ${currencyCode}, 'draft',
      '0.2000', '0.0500', '0.4000', false, NULL, '0.0000',
      ${ids.userId}
    ) ON CONFLICT DO NOTHING
  `);

  return {
    tenantId: ids.tenantId,
    userId: ids.userId,
    projectId: ids.projectId,
    boqItemId: ids.boqItemId,
    workerPersonId: ids.workerPersonId,
    auditorPersonId: ids.auditorPersonId,
    periodId: ids.periodId,
  };
}
