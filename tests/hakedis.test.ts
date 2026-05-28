/**
 * tests/hakedis.test.ts — Phase 10 hakkediş billing integration tests.
 *
 * Covers HAK-01..HAK-05 requirements (period CRUD, cumulative computation,
 * deduction chain, payment lifecycle, finalization lock).
 *
 * All DB-integration tests are guarded by describeIfDb so the suite stays
 * green on machines without TEST_DATABASE_URL set (todos pass, real tests skip).
 *
 * HAK-01: Period CRUD (create, delete)
 * HAK-02: Yeşil-defter cumulative computation (Istanbul cutoff, locked snapshot)
 * HAK-03: Configurable deduction chain (KDV, tevkifat, stopaj, teminat, avans → net)
 * HAK-04: Payment status lifecycle (finalized → submitted → paid)
 * HAK-05: Finalization lock / immutable snapshot
 * D-104:  period_qty GENERATED ALWAYS AS (cumulative − previous) STORED
 */

import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';

// ── Mock next/cache (revalidatePath throws outside Next.js render context) ─────
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// ── Mock next/server (after() requires Next.js request scope) ─────────────────
vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => { fn().catch(() => {}); } }));

// ── Mock auth — all tests run as an authenticated office engineer ───────────────
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'test-user-auth-id', email: 'test@example.com' },
  }),
}));

// ── Mock getDefaultTenantId — always returns the test tenant ───────────────────
vi.mock('@/lib/tenant', () => ({
  getDefaultTenantId: vi.fn().mockReturnValue('00000000-0000-0000-0000-000000000001'),
}));

describeIfDb('Phase 10 hakedis billing', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  // ── Fixture helpers ───────────────────────────────────────────────────────

  const TENANT_ID = '00000000-0000-0000-0000-000000000001';
  // Must match the id returned by the auth() mock above
  const TEST_USER_ID = 'test-user-auth-id';

  /** Minimal boilerplate: insert tenant + project + BOQ item, return IDs */
  async function seedBase(opts?: {
    unitPrice?: string;
    currencyCode?: string;
    material?: string;
  }): Promise<{ projectId: string; boqItemId: string }> {
    const { sql } = await import('drizzle-orm');

    // Seed the auth user so created_by_user_id FK is satisfied
    await db.execute(
      sql.raw(`INSERT INTO users (id, email) VALUES ('${TEST_USER_ID}', 'test@example.com') ON CONFLICT DO NOTHING`)
    );

    await db.execute(
      sql.raw(`INSERT INTO tenants (id, name) VALUES ('${TENANT_ID}', 'Test Tenant') ON CONFLICT DO NOTHING`)
    );

    const projectResult = await db.execute(sql`
      INSERT INTO projects (tenant_id, name)
      VALUES (${TENANT_ID}, 'Test Project')
      RETURNING id
    `);
    const projectId = String(projectResult.rows[0].id);

    const unitPrice = opts?.unitPrice ?? '1000.0000';
    const currencyCode = opts?.currencyCode ?? 'TRY';
    const material = opts?.material ?? 'DN200 HDPE Boru';

    const boqResult = await db.execute(sql`
      INSERT INTO boq_items (tenant_id, project_id, material, unit, planned_qty, sort_order, unit_price, currency_code)
      VALUES (${TENANT_ID}, ${projectId}, ${material}, 'm', '1000.000', 1, ${unitPrice}, ${currencyCode})
      RETURNING id
    `);
    const boqItemId = String(boqResult.rows[0].id);

    return { projectId, boqItemId };
  }

  /** Insert an approved submission with a specific decidedAt timestamp */
  async function insertApprovedSubmission(opts: {
    projectId: string;
    boqItemId: string;
    quantity: string;
    decidedAt: string;  // ISO timestamp string
  }): Promise<void> {
    const { sql } = await import('drizzle-orm');

    // Insert a minimal people row (required FK) if not exists
    await db.execute(sql`
      INSERT INTO people (tenant_id, telegram_user_id, display_name)
      VALUES (${TENANT_ID}, 999999001, 'Test Worker')
      ON CONFLICT DO NOTHING
    `);

    const personResult = await db.execute(sql`
      SELECT id FROM people WHERE tenant_id = ${TENANT_ID} LIMIT 1
    `);
    const personId = String(personResult.rows[0].id);

    // Generate a unique flow_id using crypto.randomUUID (available in Node 16+)
    const flowId = crypto.randomUUID();

    await db.execute(sql`
      INSERT INTO submissions (
        tenant_id, flow_id, person_id, project_id, boq_item_id,
        photo_url, quantity, status, submitted_at, decided_at
      ) VALUES (
        ${TENANT_ID},
        ${flowId},
        ${personId},
        ${opts.projectId},
        ${opts.boqItemId},
        'https://example.com/photo.jpg',
        ${opts.quantity},
        'approved',
        NOW(),
        ${opts.decidedAt}::timestamptz
      )
    `);
  }

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  // ── HAK-01: Period CRUD ───────────────────────────────────────────────────

  it('createPeriod() inserts a hakedis_periods row with status = "draft"', async () => {
    const { createPeriod } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    const { projectId } = await seedBase();

    const result = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',
      currencyCode: 'TRY',
    });

    expect(result.ok).toBe(true);
    expect(result.periodId).toBeTruthy();

    // Verify row in DB
    const rows = await db.execute(sql`
      SELECT id, status, period_number, currency_code
      FROM hakedis_periods
      WHERE id = ${result.periodId}
        AND tenant_id = ${TENANT_ID}
    `);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].status).toBe('draft');
    expect(rows.rows[0].currency_code).toBe('TRY');
  });

  it('createPeriod() calls computePeriodLines() synchronously and stores line rows', async () => {
    const { createPeriod } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    const { projectId, boqItemId } = await seedBase({ unitPrice: '500.0000' });

    // Insert an approved submission before the period end date
    await insertApprovedSubmission({
      projectId,
      boqItemId,
      quantity: '10.000',
      decidedAt: '2026-05-25T10:00:00+03:00',
    });

    const result = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',
      currencyCode: 'TRY',
    });

    expect(result.ok).toBe(true);

    // Lines should have been computed and stored
    const lines = await db.execute(sql`
      SELECT id, cumulative_qty_approved, period_value, period_qty
      FROM hakedis_period_lines
      WHERE period_id = ${result.periodId}
        AND tenant_id = ${TENANT_ID}
    `);
    expect(lines.rows.length).toBeGreaterThan(0);
    expect(lines.rows[0].cumulative_qty_approved).toBe('10.000');
    // period_qty is GENERATED: cumulative - previous = 10 - 0 = 10
    expect(lines.rows[0].period_qty).toBe('10.000');
    // period_value = 10 * 500 = 5000
    expect(lines.rows[0].period_value).toBe('5000.00');
  });

  it('deletePeriod() removes a draft period and its lines (CASCADE); logs hakedis_period_deleted', async () => {
    const { createPeriod, deletePeriod } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    const { projectId, boqItemId } = await seedBase();

    await insertApprovedSubmission({
      projectId,
      boqItemId,
      quantity: '5.000',
      decidedAt: '2026-05-20T10:00:00+03:00',
    });

    const { periodId } = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',
      currencyCode: 'TRY',
    });

    // Confirm lines exist
    const before = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM hakedis_period_lines WHERE period_id = ${periodId}
    `);
    expect(Number(before.rows[0].cnt)).toBeGreaterThan(0);

    const delResult = await deletePeriod(periodId);
    expect(delResult.ok).toBe(true);

    // Period gone
    const periods = await db.execute(sql`
      SELECT id FROM hakedis_periods WHERE id = ${periodId}
    `);
    expect(periods.rows).toHaveLength(0);

    // Lines cascaded
    const after = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM hakedis_period_lines WHERE period_id = ${periodId}
    `);
    expect(Number(after.rows[0].cnt)).toBe(0);
  });

  it('deletePeriod() throws when period status is not draft', async () => {
    const { createPeriod, finalizePeriod, deletePeriod } = await import('@/actions/hakedis');

    const { projectId } = await seedBase();

    const { periodId } = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',
      currencyCode: 'TRY',
    });

    await finalizePeriod(periodId);

    await expect(deletePeriod(periodId)).rejects.toThrow('Cannot delete a finalized period');
  });

  // ── HAK-02: Yeşil-defter cumulative computation ───────────────────────────

  it('computePeriodLines() cumulative_qty_approved sums only approved submissions with decided_at ≤ period_end_date (Istanbul tz)', async () => {
    const { createPeriod } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    const { projectId, boqItemId } = await seedBase({ unitPrice: '100.0000' });

    // Submission 1: BEFORE cutoff — should be included (2026-05-30 Istanbul = before 2026-05-31 end of day Istanbul)
    await insertApprovedSubmission({
      projectId, boqItemId,
      quantity: '20.000',
      decidedAt: '2026-05-30T15:00:00+03:00',  // 2026-05-30 15:00 Istanbul — within cutoff
    });

    // Submission 2: AFTER cutoff — should be excluded (2026-06-01 Istanbul = after 2026-05-31 end of day Istanbul)
    await insertApprovedSubmission({
      projectId, boqItemId,
      quantity: '5.000',
      decidedAt: '2026-06-01T08:00:00+03:00',  // 2026-06-01 Istanbul — beyond cutoff
    });

    const { periodId } = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',  // inclusive cutoff
      currencyCode: 'TRY',
    });

    const lines = await db.execute(sql`
      SELECT cumulative_qty_approved, period_qty
      FROM hakedis_period_lines
      WHERE period_id = ${periodId}
        AND tenant_id = ${TENANT_ID}
    `);

    expect(lines.rows).toHaveLength(1);
    // Only the before-cutoff submission (20) should be included
    expect(lines.rows[0].cumulative_qty_approved).toBe('20.000');
    expect(lines.rows[0].period_qty).toBe('20.000');
  });

  it('computePeriodLines() excludes submissions decided after the period end date cutoff', async () => {
    const { createPeriod } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    const { projectId, boqItemId } = await seedBase({ unitPrice: '200.0000' });

    // Only post-cutoff submissions
    await insertApprovedSubmission({
      projectId, boqItemId,
      quantity: '10.000',
      decidedAt: '2026-06-15T12:00:00+03:00',
    });

    const { periodId } = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',
      currencyCode: 'TRY',
    });

    // No lines should exist (no items with cumulative > 0 before cutoff)
    const lines = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM hakedis_period_lines WHERE period_id = ${periodId}
    `);
    expect(Number(lines.rows[0].cnt)).toBe(0);
  });

  it('computePeriodLines() uses previous_cumulative_qty from the most recent FINALIZED period (D-99)', async () => {
    const { createPeriod, finalizePeriod } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    const { projectId, boqItemId } = await seedBase({ unitPrice: '100.0000' });

    // Period 1: 30 units approved before April 30
    await insertApprovedSubmission({
      projectId, boqItemId,
      quantity: '30.000',
      decidedAt: '2026-04-20T10:00:00+03:00',
    });

    const period1 = await createPeriod({
      projectId,
      periodEndDate: '2026-04-30',
      currencyCode: 'TRY',
    });

    // Finalize period 1 (so it becomes the previous-cumulative source)
    await finalizePeriod(period1.periodId);

    // Period 2: additional 20 units approved in May
    await insertApprovedSubmission({
      projectId, boqItemId,
      quantity: '20.000',
      decidedAt: '2026-05-20T10:00:00+03:00',
    });

    const period2 = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',
      currencyCode: 'TRY',
    });

    const lines2 = await db.execute(sql`
      SELECT cumulative_qty_approved, previous_cumulative_qty, period_qty
      FROM hakedis_period_lines
      WHERE period_id = ${period2.periodId}
        AND tenant_id = ${TENANT_ID}
    `);

    expect(lines2.rows).toHaveLength(1);
    // Cumulative through May = 30 + 20 = 50
    expect(lines2.rows[0].cumulative_qty_approved).toBe('50.000');
    // Previous from finalized period 1 = 30
    expect(lines2.rows[0].previous_cumulative_qty).toBe('30.000');
    // Period delta = 50 - 30 = 20
    expect(lines2.rows[0].period_qty).toBe('20.000');
  });

  it('computePeriodLines() uses previous_cumulative_qty = 0 when no prior finalized period exists', async () => {
    const { createPeriod } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    const { projectId, boqItemId } = await seedBase({ unitPrice: '100.0000' });

    await insertApprovedSubmission({
      projectId, boqItemId,
      quantity: '15.000',
      decidedAt: '2026-05-10T10:00:00+03:00',
    });

    const { periodId } = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',
      currencyCode: 'TRY',
    });

    const lines = await db.execute(sql`
      SELECT previous_cumulative_qty, period_qty
      FROM hakedis_period_lines
      WHERE period_id = ${periodId}
        AND tenant_id = ${TENANT_ID}
    `);

    expect(lines.rows).toHaveLength(1);
    // No prior finalized period → previous = 0 (DB returns numeric(12,3) as '0.000')
    expect(Number(lines.rows[0].previous_cumulative_qty)).toBe(0);
    expect(lines.rows[0].period_qty).toBe('15.000');
  });

  it('computePeriodLines() excludes BOQ items with unit_price = NULL (D-103)', async () => {
    const { createPeriod } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    // Create base with no unit_price on the BOQ item
    await db.execute(
      sql.raw(`INSERT INTO users (id, email) VALUES ('${TEST_USER_ID}', 'test@example.com') ON CONFLICT DO NOTHING`)
    );
    await db.execute(
      sql.raw(`INSERT INTO tenants (id, name) VALUES ('${TENANT_ID}', 'Test Tenant') ON CONFLICT DO NOTHING`)
    );
    const projResult = await db.execute(sql`
      INSERT INTO projects (tenant_id, name)
      VALUES (${TENANT_ID}, 'Unpriced Test Project')
      RETURNING id
    `);
    const projectId = String(projResult.rows[0].id);

    // BOQ item with no unit_price (NULL)
    const boqResult = await db.execute(sql`
      INSERT INTO boq_items (tenant_id, project_id, material, unit, planned_qty, sort_order)
      VALUES (${TENANT_ID}, ${projectId}, 'Unpriced Item', 'm', '100.000', 1)
      RETURNING id
    `);
    const boqItemId = String(boqResult.rows[0].id);

    await insertApprovedSubmission({
      projectId, boqItemId,
      quantity: '10.000',
      decidedAt: '2026-05-10T10:00:00+03:00',
    });

    const { periodId } = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',
      currencyCode: 'TRY',
    });

    // No lines should exist (unpriced item excluded)
    const lines = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM hakedis_period_lines WHERE period_id = ${periodId}
    `);
    expect(Number(lines.rows[0].cnt)).toBe(0);

    // But it should show up in the unpriced warning list (via getPeriodDetail)
    const { getPeriodDetail } = await import('@/actions/hakedis');
    const detail = await getPeriodDetail(periodId);
    expect(detail.unpricedItems.some(i => i.id === boqItemId)).toBe(true);
  });

  it('computePeriodLines() only includes BOQ items matching the period currency_code (D-101)', async () => {
    const { createPeriod } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    await db.execute(
      sql.raw(`INSERT INTO users (id, email) VALUES ('${TEST_USER_ID}', 'test@example.com') ON CONFLICT DO NOTHING`)
    );
    await db.execute(
      sql.raw(`INSERT INTO tenants (id, name) VALUES ('${TENANT_ID}', 'Test Tenant') ON CONFLICT DO NOTHING`)
    );
    const projResult = await db.execute(sql`
      INSERT INTO projects (tenant_id, name)
      VALUES (${TENANT_ID}, 'Multi-currency Project')
      RETURNING id
    `);
    const projectId = String(projResult.rows[0].id);

    // TRY item
    const tryBoqResult = await db.execute(sql`
      INSERT INTO boq_items (tenant_id, project_id, material, unit, planned_qty, sort_order, unit_price, currency_code)
      VALUES (${TENANT_ID}, ${projectId}, 'TRY Item', 'm', '500.000', 1, '100.0000', 'TRY')
      RETURNING id
    `);
    const tryBoqItemId = String(tryBoqResult.rows[0].id);

    // USD item
    const usdBoqResult = await db.execute(sql`
      INSERT INTO boq_items (tenant_id, project_id, material, unit, planned_qty, sort_order, unit_price, currency_code)
      VALUES (${TENANT_ID}, ${projectId}, 'USD Item', 'm', '500.000', 2, '100.0000', 'USD')
      RETURNING id
    `);
    const usdBoqItemId = String(usdBoqResult.rows[0].id);

    // Insert approved submissions for both
    await insertApprovedSubmission({ projectId, boqItemId: tryBoqItemId, quantity: '10.000', decidedAt: '2026-05-20T10:00:00+03:00' });
    await insertApprovedSubmission({ projectId, boqItemId: usdBoqItemId, quantity: '10.000', decidedAt: '2026-05-20T10:00:00+03:00' });

    // Create a TRY period
    const { periodId } = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',
      currencyCode: 'TRY',
    });

    const lines = await db.execute(sql`
      SELECT currency_code_snapshot FROM hakedis_period_lines
      WHERE period_id = ${periodId}
        AND tenant_id = ${TENANT_ID}
    `);

    // Only TRY items should appear
    expect(lines.rows).toHaveLength(1);
    expect(lines.rows[0].currency_code_snapshot).toBe('TRY');
  });

  // ── HAK-03: Deduction chain ───────────────────────────────────────────────

  it('getPeriodDetail() deduction chain: gross, kdv, tevkifat, stopaj, teminat, avans, net match expected Postgres numeric values', async () => {
    const { createPeriod, getPeriodDetail } = await import('@/actions/hakedis');

    const { projectId, boqItemId } = await seedBase({ unitPrice: '1000.0000' });

    // 10 units × 1000 = gross 10000
    await insertApprovedSubmission({
      projectId, boqItemId,
      quantity: '10.000',
      decidedAt: '2026-05-20T10:00:00+03:00',
    });

    const { periodId } = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',
      currencyCode: 'TRY',
      kdvRate: '0.2000',           // 20%
      tevkifatFraction: '0.4000',  // 4/10 of KDV withheld
      retentionRate: '0.0500',     // 5% teminat
      avansKesintisiRate: '0.0000', // no avans
      stopajEnabled: false,
      stopajRate: '0.0200',
    });

    const detail = await getPeriodDetail(periodId);
    const d = detail.deductions!;

    // gross = 10 × 1000 = 10000
    expect(parseFloat(d.gross)).toBeCloseTo(10000, 2);
    // kdv = 10000 × 0.20 = 2000
    expect(parseFloat(d.kdv)).toBeCloseTo(2000, 2);
    // tevkifat = KDV × 0.40 = 2000 × 0.40 = 800
    expect(parseFloat(d.tevkifat)).toBeCloseTo(800, 2);
    // stopaj = 0 (disabled)
    expect(parseFloat(d.stopaj)).toBeCloseTo(0, 2);
    // teminat = 10000 × 0.05 = 500
    expect(parseFloat(d.teminat)).toBeCloseTo(500, 2);
    // avans = 0
    expect(parseFloat(d.avans)).toBeCloseTo(0, 2);
    // net = 10000 + (2000 - 800) - 0 - 500 - 0 = 10000 + 1200 - 500 = 10700
    expect(parseFloat(d.net)).toBeCloseTo(10700, 2);
  });

  it('getPeriodDetail() stopaj row is 0 when stopaj_enabled = false regardless of stopaj_rate', async () => {
    const { createPeriod, getPeriodDetail } = await import('@/actions/hakedis');

    const { projectId, boqItemId } = await seedBase({ unitPrice: '1000.0000' });
    await insertApprovedSubmission({ projectId, boqItemId, quantity: '5.000', decidedAt: '2026-05-10T10:00:00+03:00' });

    const { periodId } = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',
      currencyCode: 'TRY',
      stopajEnabled: false,
      stopajRate: '0.0500',  // non-zero rate but toggle is off
    });

    const detail = await getPeriodDetail(periodId);
    expect(parseFloat(detail.deductions!.stopaj)).toBeCloseTo(0, 2);
  });

  it('getPeriodDetail() avans row is 0 when avans_kesintisi_rate = 0', async () => {
    const { createPeriod, getPeriodDetail } = await import('@/actions/hakedis');

    const { projectId, boqItemId } = await seedBase({ unitPrice: '1000.0000' });
    await insertApprovedSubmission({ projectId, boqItemId, quantity: '3.000', decidedAt: '2026-05-10T10:00:00+03:00' });

    const { periodId } = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',
      currencyCode: 'TRY',
      avansKesintisiRate: '0.0000',
    });

    const detail = await getPeriodDetail(periodId);
    expect(parseFloat(detail.deductions!.avans)).toBeCloseTo(0, 2);
  });

  it('getPeriodDetail() tevkifat = KDV × tevkifat_fraction (not applied to gross directly)', async () => {
    const { createPeriod, getPeriodDetail } = await import('@/actions/hakedis');

    const { projectId, boqItemId } = await seedBase({ unitPrice: '500.0000' });
    await insertApprovedSubmission({ projectId, boqItemId, quantity: '4.000', decidedAt: '2026-05-10T10:00:00+03:00' });

    // gross = 4 * 500 = 2000
    // kdv = 2000 * 0.20 = 400
    // tevkifat_fraction = 3/10 = 0.3000
    // tevkifat = KDV * 0.3 = 400 * 0.3 = 120 (NOT gross * 0.3 = 600)
    const { periodId } = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',
      currencyCode: 'TRY',
      kdvRate: '0.2000',
      tevkifatFraction: '0.3000',
      stopajEnabled: false,
      retentionRate: '0.0000',
      avansKesintisiRate: '0.0000',
    });

    const detail = await getPeriodDetail(periodId);
    const d = detail.deductions!;
    expect(parseFloat(d.gross)).toBeCloseTo(2000, 2);
    expect(parseFloat(d.kdv)).toBeCloseTo(400, 2);
    // tevkifat must be 120 (= KDV × fraction), NOT 600 (= gross × fraction)
    expect(parseFloat(d.tevkifat)).toBeCloseTo(120, 2);
  });

  it('getPeriodDetail() uses COALESCE to handle NULL tevkifat_fraction / stopaj_rate defensively', async () => {
    const { getPeriodDetail } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    // Create a period with NULL tevkifat_fraction and NULL stopaj_rate (mimicking old period)
    await db.execute(
      sql.raw(`INSERT INTO users (id, email) VALUES ('${TEST_USER_ID}', 'test@example.com') ON CONFLICT DO NOTHING`)
    );
    await db.execute(
      sql.raw(`INSERT INTO tenants (id, name) VALUES ('${TENANT_ID}', 'Test Tenant') ON CONFLICT DO NOTHING`)
    );
    const projResult = await db.execute(sql`
      INSERT INTO projects (tenant_id, name)
      VALUES (${TENANT_ID}, 'COALESCE Test Project')
      RETURNING id
    `);
    const projectId = String(projResult.rows[0].id);

    // Insert period with NULL tevkifat_fraction and stopaj_rate directly
    const periodResult = await db.execute(sql`
      INSERT INTO hakedis_periods (
        tenant_id, project_id, period_number, period_end_date, currency_code, status,
        kdv_rate, retention_rate, tevkifat_fraction, stopaj_enabled, stopaj_rate, avans_kesintisi_rate
      ) VALUES (
        ${TENANT_ID}, ${projectId}, 'HK-2026-01', '2026-05-31', 'TRY', 'draft',
        '0.2000', '0.0500', NULL, false, NULL, '0.0000'
      )
      RETURNING id
    `);
    const periodId = String(periodResult.rows[0].id);

    // Insert a line directly (bypassing recompute)
    const boqResult = await db.execute(sql`
      INSERT INTO boq_items (tenant_id, project_id, material, unit, planned_qty, sort_order, unit_price, currency_code)
      VALUES (${TENANT_ID}, ${projectId}, 'Test Item', 'm', '100.000', 1, '1000.0000', 'TRY')
      RETURNING id
    `);
    const boqItemId = String(boqResult.rows[0].id);

    await db.execute(sql`
      INSERT INTO hakedis_period_lines (
        tenant_id, period_id, boq_item_id,
        material_snapshot, unit_snapshot, currency_code_snapshot, unit_price_snapshot,
        cumulative_qty_approved, previous_cumulative_qty, period_value, cumulative_value
      ) VALUES (
        ${TENANT_ID}, ${periodId}, ${boqItemId},
        'Test Item', 'm', 'TRY', '1000.0000',
        '10.000', '0', '10000.00', '10000.00'
      )
    `);

    // This should NOT throw even with NULL rates — COALESCE handles them
    const detail = await getPeriodDetail(periodId);
    expect(detail.deductions).not.toBeNull();
    // tevkifat = KDV × COALESCE(NULL, 0) = 2000 × 0 = 0
    expect(parseFloat(detail.deductions!.tevkifat)).toBeCloseTo(0, 2);
    // stopaj = CASE WHEN false THEN ... = 0 (and COALESCE(NULL, 0) doesn't matter here)
    expect(parseFloat(detail.deductions!.stopaj)).toBeCloseTo(0, 2);
    // net should not be NULL
    expect(detail.deductions!.net).not.toBeNull();
    // net = 10000 + (2000 - 0) - 0 - 500 - 0 = 11500
    expect(parseFloat(detail.deductions!.net)).toBeCloseTo(11500, 2);
  });

  // ── getPeriodsByProject net ────────────────────────────────────────────────

  it('getPeriodsByProject() returns non-null netByDisplay for a period with lines, null for empty period', async () => {
    const { createPeriod, getPeriodsByProject } = await import('@/actions/hakedis');

    const { projectId, boqItemId } = await seedBase({ unitPrice: '1000.0000' });

    // Empty period (no approved submissions)
    const emptyPeriod = await createPeriod({
      projectId,
      periodEndDate: '2026-04-30',
      currencyCode: 'TRY',
    });

    // Period with lines
    await insertApprovedSubmission({
      projectId, boqItemId,
      quantity: '5.000',
      decidedAt: '2026-05-15T10:00:00+03:00',
    });

    const withLinesPeriod = await createPeriod({
      projectId,
      periodEndDate: '2026-05-31',
      currencyCode: 'TRY',
      kdvRate: '0.2000',
      tevkifatFraction: '0.4000',
      retentionRate: '0.0500',
      avansKesintisiRate: '0.0000',
      stopajEnabled: false,
    });

    const list = await getPeriodsByProject(projectId);

    const emptyRow = list.find(r => r.id === emptyPeriod.periodId);
    const withLinesRow = list.find(r => r.id === withLinesPeriod.periodId);

    expect(emptyRow).toBeDefined();
    expect(emptyRow!.netByDisplay).toBeNull();

    expect(withLinesRow).toBeDefined();
    expect(withLinesRow!.netByDisplay).not.toBeNull();

    // gross = 5 × 1000 = 5000
    // net = 5000 + (1000 - 400) - 0 - 250 - 0 = 5000 + 600 - 250 = 5350
    expect(parseFloat(withLinesRow!.netByDisplay!)).toBeCloseTo(5350, 2);
  });

  // ── HAK-04: Payment status lifecycle ─────────────────────────────────────

  it('updatePaymentStatus() transitions finalized → submitted', async () => {
    const { createPeriod, finalizePeriod, updatePaymentStatus } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    const { projectId } = await seedBase();
    const { periodId } = await createPeriod({ projectId, periodEndDate: '2026-05-31', currencyCode: 'TRY' });
    await finalizePeriod(periodId);

    const result = await updatePaymentStatus(periodId, 'submitted');
    expect(result.ok).toBe(true);

    const row = await db.execute(sql`SELECT status FROM hakedis_periods WHERE id = ${periodId}`);
    expect(row.rows[0].status).toBe('submitted');
  });

  it('updatePaymentStatus() transitions submitted → paid', async () => {
    const { createPeriod, finalizePeriod, updatePaymentStatus } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    const { projectId } = await seedBase();
    const { periodId } = await createPeriod({ projectId, periodEndDate: '2026-05-31', currencyCode: 'TRY' });
    await finalizePeriod(periodId);
    await updatePaymentStatus(periodId, 'submitted');

    const result = await updatePaymentStatus(periodId, 'paid');
    expect(result.ok).toBe(true);

    const row = await db.execute(sql`SELECT status FROM hakedis_periods WHERE id = ${periodId}`);
    expect(row.rows[0].status).toBe('paid');
  });

  it('updatePaymentStatus() rejects draft → submitted (must finalize first)', async () => {
    const { createPeriod, updatePaymentStatus } = await import('@/actions/hakedis');

    const { projectId } = await seedBase();
    const { periodId } = await createPeriod({ projectId, periodEndDate: '2026-05-31', currencyCode: 'TRY' });

    await expect(updatePaymentStatus(periodId, 'submitted')).rejects.toThrow('Invalid status transition');
  });

  it('updatePaymentStatus() rejects paid → any (terminal state)', async () => {
    const { createPeriod, finalizePeriod, updatePaymentStatus } = await import('@/actions/hakedis');

    const { projectId } = await seedBase();
    const { periodId } = await createPeriod({ projectId, periodEndDate: '2026-05-31', currencyCode: 'TRY' });
    await finalizePeriod(periodId);
    await updatePaymentStatus(periodId, 'submitted');
    await updatePaymentStatus(periodId, 'paid');

    await expect(updatePaymentStatus(periodId, 'paid')).rejects.toThrow('Invalid status transition');
    await expect(updatePaymentStatus(periodId, 'submitted')).rejects.toThrow('Invalid status transition');
    await expect(updatePaymentStatus(periodId, 'finalized')).rejects.toThrow('Invalid status transition');
  });

  // ── HAK-05: Finalization lock ─────────────────────────────────────────────

  it('finalizePeriod() sets status = "finalized" and finalizedAt = NOW()', async () => {
    const { createPeriod, finalizePeriod } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    const { projectId } = await seedBase();
    const { periodId } = await createPeriod({ projectId, periodEndDate: '2026-05-31', currencyCode: 'TRY' });

    const result = await finalizePeriod(periodId);
    expect(result.ok).toBe(true);

    const row = await db.execute(sql`
      SELECT status, finalized_at FROM hakedis_periods WHERE id = ${periodId}
    `);
    expect(row.rows[0].status).toBe('finalized');
    expect(row.rows[0].finalized_at).not.toBeNull();
  });

  it('finalizePeriod() is irreversible — no second call allowed on already-finalized period', async () => {
    const { createPeriod, finalizePeriod } = await import('@/actions/hakedis');

    const { projectId } = await seedBase();
    const { periodId } = await createPeriod({ projectId, periodEndDate: '2026-05-31', currencyCode: 'TRY' });

    await finalizePeriod(periodId);

    await expect(finalizePeriod(periodId)).rejects.toThrow('Period is not in draft status');
  });

  it('recomputePeriodLines() throws "Period is not in draft status" for finalized periods', async () => {
    const { createPeriod, finalizePeriod, recomputePeriodLines } = await import('@/actions/hakedis');

    const { projectId } = await seedBase();
    const { periodId } = await createPeriod({ projectId, periodEndDate: '2026-05-31', currencyCode: 'TRY' });
    await finalizePeriod(periodId);

    await expect(recomputePeriodLines(periodId)).rejects.toThrow('Period is not in draft status');
  });

  it('recomputePeriodLines() throws for submitted periods', async () => {
    const { createPeriod, finalizePeriod, updatePaymentStatus, recomputePeriodLines } = await import('@/actions/hakedis');

    const { projectId } = await seedBase();
    const { periodId } = await createPeriod({ projectId, periodEndDate: '2026-05-31', currencyCode: 'TRY' });
    await finalizePeriod(periodId);
    await updatePaymentStatus(periodId, 'submitted');

    await expect(recomputePeriodLines(periodId)).rejects.toThrow('Period is not in draft status');
  });

  it('recomputePeriodLines() throws for paid periods', async () => {
    const { createPeriod, finalizePeriod, updatePaymentStatus, recomputePeriodLines } = await import('@/actions/hakedis');

    const { projectId } = await seedBase();
    const { periodId } = await createPeriod({ projectId, periodEndDate: '2026-05-31', currencyCode: 'TRY' });
    await finalizePeriod(periodId);
    await updatePaymentStatus(periodId, 'submitted');
    await updatePaymentStatus(periodId, 'paid');

    await expect(recomputePeriodLines(periodId)).rejects.toThrow('Period is not in draft status');
  });

  it('finalized period lines are immutable — stored snapshot values do not change on recompute attempt', async () => {
    const { createPeriod, finalizePeriod, recomputePeriodLines } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    const { projectId, boqItemId } = await seedBase({ unitPrice: '200.0000' });

    await insertApprovedSubmission({
      projectId, boqItemId,
      quantity: '7.000',
      decidedAt: '2026-05-10T10:00:00+03:00',
    });

    const { periodId } = await createPeriod({ projectId, periodEndDate: '2026-05-31', currencyCode: 'TRY' });

    // Capture line values before finalize
    const before = await db.execute(sql`
      SELECT period_value, cumulative_qty_approved FROM hakedis_period_lines
      WHERE period_id = ${periodId}
    `);

    await finalizePeriod(periodId);

    // Attempt to recompute (should throw)
    await expect(recomputePeriodLines(periodId)).rejects.toThrow('Period is not in draft status');

    // Lines must remain unchanged
    const after = await db.execute(sql`
      SELECT period_value, cumulative_qty_approved FROM hakedis_period_lines
      WHERE period_id = ${periodId}
    `);

    expect(after.rows[0].period_value).toBe(before.rows[0].period_value);
    expect(after.rows[0].cumulative_qty_approved).toBe(before.rows[0].cumulative_qty_approved);
  });

  it('deletePeriod() on a draft removes the period AND its lines (lines count == 0 after delete)', async () => {
    const { createPeriod, deletePeriod } = await import('@/actions/hakedis');
    const { sql } = await import('drizzle-orm');

    const { projectId, boqItemId } = await seedBase({ unitPrice: '100.0000' });

    await insertApprovedSubmission({
      projectId, boqItemId,
      quantity: '3.000',
      decidedAt: '2026-05-10T10:00:00+03:00',
    });

    const { periodId } = await createPeriod({ projectId, periodEndDate: '2026-05-31', currencyCode: 'TRY' });

    // Verify lines exist before delete
    const linesBeforeDelete = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM hakedis_period_lines WHERE period_id = ${periodId}
    `);
    expect(Number(linesBeforeDelete.rows[0].cnt)).toBeGreaterThan(0);

    await deletePeriod(periodId);

    // Lines should be 0 after delete (CASCADE)
    const linesAfterDelete = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM hakedis_period_lines WHERE period_id = ${periodId}
    `);
    expect(Number(linesAfterDelete.rows[0].cnt)).toBe(0);
  });

  it('deletePeriod() throws when period is finalized', async () => {
    const { createPeriod, finalizePeriod, deletePeriod } = await import('@/actions/hakedis');

    const { projectId } = await seedBase();
    const { periodId } = await createPeriod({ projectId, periodEndDate: '2026-05-31', currencyCode: 'TRY' });
    await finalizePeriod(periodId);

    await expect(deletePeriod(periodId)).rejects.toThrow('Cannot delete a finalized period');
  });

});
