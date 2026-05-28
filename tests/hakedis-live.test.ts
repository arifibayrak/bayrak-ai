/**
 * tests/hakedis-live.test.ts — Phase 12 submission-driven hakkediş contract.
 *
 * Wave 3 (Plan 12-03): 8 of 9 it.todo entries replaced with concrete assertions.
 * The 9th (LivePeriodPoller mount gate) stays as it.todo until Plan 12-04 ships
 * src/components/admin/LivePeriodPoller.tsx — the pure-function contract is locked
 * in 12-VALIDATION.md and consumed verbatim then.
 *
 * Test naming MUST stay byte-identical to 12-VALIDATION.md verify-command -t
 * filters so `npx vitest run … -t "<name>"` continues to bind deterministically.
 *
 * Behaviors covered:
 *   - D-117: scoped recompute fires on approve for (project, boq, currency)
 *   - D-118: no-open-period silent no-op
 *   - D-119: join row inserted; idempotent on re-fire (ON CONFLICT DO UPDATE)
 *   - SDH-02: getLineSubmissions response shape
 *   - Pitfall 4: finalize-during-approve race — no join row for finalized period
 *   - Pitfall 5: bot path never writes office_activity_log (no FK violation)
 *   - SDH-03: manual recomputePeriodLines unchanged before/after Phase 12
 *   - D-120: LivePeriodPoller returns null when enabled=false (mount gate, Plan 04)
 *
 * All DB-integration entries are guarded by describeIfDb so the suite stays
 * green on machines without TEST_DATABASE_URL.
 */

import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';
import { seedDraftPeriod, HAKEDIS_LIVE_FIXTURE_IDS } from './fixtures/hakedis';

// ── Mock next/cache (revalidatePath throws outside Next.js render context) ─────
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// ── Mock next/server (after() requires Next.js request scope) ─────────────────
vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => { fn().catch(() => {}); } }));

// ── Mock auth — tests run as an authenticated office engineer where needed ────
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'test-user-auth-id', email: 'test@example.com' },
  }),
}));

// ── Mock getDefaultTenantId — always returns the test tenant ───────────────────
vi.mock('@/lib/tenant', () => ({
  getDefaultTenantId: vi.fn().mockReturnValue('00000000-0000-0000-0000-000000000001'),
}));

// ── Submission insert helper (lazy-imports drizzle-orm) ───────────────────────
//
// Inserts an approved submission with deterministic fields. Each call gets a
// unique flow_id (via crypto.randomUUID) so the submissions_flow_id_unique
// constraint never fires across multiple inserts in the same test.
//
// Returns the inserted submission id so the test can correlate join rows.
async function insertApprovedSubmission(
  db: Awaited<ReturnType<typeof getTestDb>>,
  opts: {
    projectId: string;
    boqItemId: string;
    personId: string;
    auditorPersonId: string;
    quantity: string;
    decidedAt: string;
    photoUrl?: string;
    notes?: string | null;
  },
): Promise<string> {
  const { sql } = await import('drizzle-orm');
  const flowId = crypto.randomUUID();
  const photoUrl = opts.photoUrl ?? 'https://example.com/photo.jpg';
  const notes = opts.notes ?? null;
  const tenantId = HAKEDIS_LIVE_FIXTURE_IDS.tenantId;

  const result = await db.execute(sql`
    INSERT INTO submissions (
      tenant_id, flow_id, person_id, project_id, boq_item_id,
      photo_url, quantity, status, submitted_at, decided_at, decided_by, notes
    ) VALUES (
      ${tenantId}, ${flowId}, ${opts.personId}, ${opts.projectId}, ${opts.boqItemId},
      ${photoUrl}, ${opts.quantity}, 'approved', NOW(), ${opts.decidedAt}::timestamptz,
      ${opts.auditorPersonId}, ${notes}
    )
    RETURNING id
  `);
  return String(result.rows[0].id);
}

describeIfDb('Phase 12 submission-driven hakkediş', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  // ── SDH-01 / D-117 ───────────────────────────────────────────────────────
  it('D-117 scoped recompute fires on approve for matching (project_id, boq_item_id, currency_code) triplet', async () => {
    const { sql } = await import('drizzle-orm');
    const ids = await seedDraftPeriod(db, { unitPrice: '1000.0000', currencyCode: 'TRY' });

    // Insert one approved submission ≤ period_end_date (Istanbul tz)
    await insertApprovedSubmission(db, {
      projectId: ids.projectId,
      boqItemId: ids.boqItemId,
      personId: ids.workerPersonId,
      auditorPersonId: ids.auditorPersonId,
      quantity: '5.000',
      decidedAt: '2026-05-20T10:00:00+03:00',
    });

    // Fire the scoped recompute (the same call the bot post-commit hook makes)
    const { recomputeHakedisLine } = await import('@/actions/hakedis');
    const result = await recomputeHakedisLine(ids.projectId, ids.boqItemId, 'TRY');

    expect(result.updated).toBe(true);
    expect(result.periodLineId).toBeTruthy();

    // Exactly one line row exists; cumulative + period_value match
    const lines = await db.execute(sql`
      SELECT id, cumulative_qty_approved, period_qty, period_value, unit_price_snapshot
      FROM hakedis_period_lines
      WHERE period_id = ${ids.periodId}
        AND boq_item_id = ${ids.boqItemId}
    `);
    expect(lines.rows).toHaveLength(1);
    expect(lines.rows[0].cumulative_qty_approved).toBe('5.000');
    expect(lines.rows[0].period_qty).toBe('5.000');
    // period_value = (5 - 0) * 1000 = 5000.00
    expect(lines.rows[0].period_value).toBe('5000.00');
    expect(lines.rows[0].unit_price_snapshot).toBe('1000.0000');
  });

  // ── SDH-01 / D-118 ───────────────────────────────────────────────────────
  it('D-118 no-open-period: scoped recompute is a no-op when no draft period exists for (project_id, currency_code)', async () => {
    const { sql } = await import('drizzle-orm');
    const ids = await seedDraftPeriod(db, { unitPrice: '1000.0000', currencyCode: 'TRY' });

    // Approve a submission in USD (different currency than the draft period's TRY)
    // → D-118: no-op (no draft period exists for USD on this project).
    // Insert a USD-priced BOQ item to give recomputeHakedisLine a USD scope.
    const usdBoqResult = await db.execute(sql`
      INSERT INTO boq_items (tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code)
      VALUES (${ids.tenantId}, ${ids.projectId}, 'USD Item', 'm', '1000.000', '0.000', 2, '50.0000', 'USD')
      RETURNING id
    `);
    const usdBoqItemId = String(usdBoqResult.rows[0].id);

    await insertApprovedSubmission(db, {
      projectId: ids.projectId,
      boqItemId: usdBoqItemId,
      personId: ids.workerPersonId,
      auditorPersonId: ids.auditorPersonId,
      quantity: '7.000',
      decidedAt: '2026-05-20T10:00:00+03:00',
    });

    const { recomputeHakedisLine } = await import('@/actions/hakedis');
    const result = await recomputeHakedisLine(ids.projectId, usdBoqItemId, 'USD');

    expect(result.updated).toBe(false);
    expect(result.periodLineId).toBeNull();

    // No line rows for the USD scope (period doesn't exist in USD)
    const usdLines = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM hakedis_period_lines
      WHERE boq_item_id = ${usdBoqItemId}
    `);
    expect(Number(usdLines.rows[0].cnt)).toBe(0);

    // No join rows either
    const joinRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM hakedis_line_submissions
    `);
    expect(Number(joinRows.rows[0].cnt)).toBe(0);
  });

  // ── SDH-02 / D-119 ───────────────────────────────────────────────────────
  it('D-119 join row: hakedis_line_submissions row inserted with qty_contributed = submissions.quantity', async () => {
    const { sql } = await import('drizzle-orm');
    const ids = await seedDraftPeriod(db, { unitPrice: '1000.0000', currencyCode: 'TRY' });

    const submissionAId = await insertApprovedSubmission(db, {
      projectId: ids.projectId,
      boqItemId: ids.boqItemId,
      personId: ids.workerPersonId,
      auditorPersonId: ids.auditorPersonId,
      quantity: '3.000',
      decidedAt: '2026-05-15T10:00:00+03:00',
    });
    const submissionBId = await insertApprovedSubmission(db, {
      projectId: ids.projectId,
      boqItemId: ids.boqItemId,
      personId: ids.workerPersonId,
      auditorPersonId: ids.auditorPersonId,
      quantity: '4.000',
      decidedAt: '2026-05-16T10:00:00+03:00',
    });

    const { recomputeHakedisLine } = await import('@/actions/hakedis');
    await recomputeHakedisLine(ids.projectId, ids.boqItemId, 'TRY');

    // Two join rows, each carrying the source quantity byte-identical
    const joinRows = await db.execute(sql`
      SELECT submission_id, qty_contributed
      FROM hakedis_line_submissions
      ORDER BY qty_contributed ASC
    `);
    expect(joinRows.rows).toHaveLength(2);
    expect(joinRows.rows[0].submission_id).toBe(submissionAId);
    expect(joinRows.rows[0].qty_contributed).toBe('3.000');
    expect(joinRows.rows[1].submission_id).toBe(submissionBId);
    expect(joinRows.rows[1].qty_contributed).toBe('4.000');
  });

  // ── SDH-02 / D-119 idempotency ───────────────────────────────────────────
  it('D-119 idempotency: re-running scoped recompute for the same submission yields exactly one join row (ON CONFLICT DO UPDATE)', async () => {
    const { sql } = await import('drizzle-orm');
    const ids = await seedDraftPeriod(db, { unitPrice: '1000.0000', currencyCode: 'TRY' });

    await insertApprovedSubmission(db, {
      projectId: ids.projectId,
      boqItemId: ids.boqItemId,
      personId: ids.workerPersonId,
      auditorPersonId: ids.auditorPersonId,
      quantity: '5.000',
      decidedAt: '2026-05-15T10:00:00+03:00',
    });

    const { recomputeHakedisLine } = await import('@/actions/hakedis');

    // Fire twice in a row (simulates D-13 audit-handler replay)
    const r1 = await recomputeHakedisLine(ids.projectId, ids.boqItemId, 'TRY');
    const r2 = await recomputeHakedisLine(ids.projectId, ids.boqItemId, 'TRY');
    expect(r1.updated).toBe(true);
    expect(r2.updated).toBe(true);
    // Same period_line_id across both calls (UPSERT keeps the same row id)
    expect(r2.periodLineId).toBe(r1.periodLineId);

    // Exactly one line row and one join row
    const lines = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM hakedis_period_lines WHERE period_id = ${ids.periodId}
    `);
    expect(Number(lines.rows[0].cnt)).toBe(1);

    const joinRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM hakedis_line_submissions WHERE period_line_id = ${r1.periodLineId}
    `);
    expect(Number(joinRows.rows[0].cnt)).toBe(1);
  });

  // ── SDH-02 / getLineSubmissions response shape ───────────────────────────
  it('getLineSubmissions returns rows shape { workerName, decidedAt, qtyContributed, photoUrl, notes } ordered by decided_at DESC', async () => {
    const ids = await seedDraftPeriod(db, { unitPrice: '1000.0000', currencyCode: 'TRY' });

    // Two submissions decided 1 day apart so DESC ordering is testable
    await insertApprovedSubmission(db, {
      projectId: ids.projectId,
      boqItemId: ids.boqItemId,
      personId: ids.workerPersonId,
      auditorPersonId: ids.auditorPersonId,
      quantity: '2.000',
      decidedAt: '2026-05-15T10:00:00+03:00',
      photoUrl: 'https://example.com/older.jpg',
      notes: 'older submission',
    });
    await insertApprovedSubmission(db, {
      projectId: ids.projectId,
      boqItemId: ids.boqItemId,
      personId: ids.workerPersonId,
      auditorPersonId: ids.auditorPersonId,
      quantity: '6.000',
      decidedAt: '2026-05-20T10:00:00+03:00',
      photoUrl: 'https://example.com/newer.jpg',
      notes: 'newer submission',
    });

    const { recomputeHakedisLine, getLineSubmissions } = await import('@/actions/hakedis');
    const { periodLineId } = await recomputeHakedisLine(ids.projectId, ids.boqItemId, 'TRY');
    expect(periodLineId).toBeTruthy();

    const rows = await getLineSubmissions(periodLineId!);
    expect(rows).toHaveLength(2);
    // Ordered by decided_at DESC — newer first
    expect(rows[0].qtyContributed).toBe('6.000');
    expect(rows[0].photoUrl).toBe('https://example.com/newer.jpg');
    expect(rows[0].notes).toBe('newer submission');
    expect(rows[0].workerName).toBe('Phase 12 Worker');
    expect(typeof rows[0].decidedAt).toBe('string');
    expect(rows[0].submissionId).toBeTruthy();

    expect(rows[1].qtyContributed).toBe('2.000');
    expect(rows[1].photoUrl).toBe('https://example.com/older.jpg');

    // DESC ordering: rows[0].decidedAt > rows[1].decidedAt
    expect(new Date(rows[0].decidedAt).getTime()).toBeGreaterThan(
      new Date(rows[1].decidedAt).getTime(),
    );
  });

  // ── SDH-03 / Pitfall 4 — finalize race ───────────────────────────────────
  it('finalize race: approve commit + finalize commit do not produce a join row for the just-finalized period (Pitfall 4)', async () => {
    const { sql } = await import('drizzle-orm');
    const ids = await seedDraftPeriod(db, { unitPrice: '1000.0000', currencyCode: 'TRY' });

    // Approve a submission inside the period window
    await insertApprovedSubmission(db, {
      projectId: ids.projectId,
      boqItemId: ids.boqItemId,
      personId: ids.workerPersonId,
      auditorPersonId: ids.auditorPersonId,
      quantity: '8.000',
      decidedAt: '2026-05-15T10:00:00+03:00',
    });

    const { recomputeHakedisLine, finalizePeriod } = await import('@/actions/hakedis');

    // Finalize the period FIRST (simulates the office engineer's click landing before
    // the bot's post-commit hook). Pitfall 4: the bot then tries to recompute the
    // (now-finalized) period — it MUST skip cleanly.
    await finalizePeriod(ids.periodId);

    // Sanity check: period is finalized
    const periodRows = await db.execute(sql`
      SELECT status FROM hakedis_periods WHERE id = ${ids.periodId}
    `);
    expect(periodRows.rows[0].status).toBe('finalized');

    // Now fire the scoped recompute (the bot path lost the race) — must not throw,
    // must not write to the finalized period.
    const result = await recomputeHakedisLine(ids.projectId, ids.boqItemId, 'TRY');
    expect(result.updated).toBe(false);
    expect(result.periodLineId).toBeNull();

    // No join row exists for the finalized period
    const joinRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM hakedis_line_submissions hls
      JOIN hakedis_period_lines hpl ON hpl.id = hls.period_line_id
      WHERE hpl.period_id = ${ids.periodId}
    `);
    expect(Number(joinRows.rows[0].cnt)).toBe(0);
  });

  // ── Pitfall 5 — bot path never writes office_activity_log ────────────────
  it('Pitfall 5: bot path never writes office_activity_log (no FK violation on actor_user_id)', async () => {
    const { sql } = await import('drizzle-orm');
    const ids = await seedDraftPeriod(db, { unitPrice: '1000.0000', currencyCode: 'TRY' });

    await insertApprovedSubmission(db, {
      projectId: ids.projectId,
      boqItemId: ids.boqItemId,
      personId: ids.workerPersonId,
      auditorPersonId: ids.auditorPersonId,
      quantity: '5.000',
      decidedAt: '2026-05-15T10:00:00+03:00',
    });

    // Count office_activity_log rows BEFORE
    const before = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM office_activity_log`);
    const beforeCnt = Number(before.rows[0].cnt);

    // Spy on logOfficeActivity — must NEVER be called from recomputeHakedisLine
    const logModule = await import('@/lib/log-office-activity');
    const spy = vi.spyOn(logModule, 'logOfficeActivity');

    const { recomputeHakedisLine } = await import('@/actions/hakedis');
    await recomputeHakedisLine(ids.projectId, ids.boqItemId, 'TRY');

    expect(spy).not.toHaveBeenCalled();

    // Office_activity_log row count is unchanged
    const after = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM office_activity_log`);
    expect(Number(after.rows[0].cnt)).toBe(beforeCnt);

    spy.mockRestore();
  });

  // ── SDH-03 / regression on manual Recompute ──────────────────────────────
  it('SDH-03 regression: manual recomputePeriodLines on a draft produces identical line totals before/after the helper extraction', async () => {
    const { sql } = await import('drizzle-orm');
    const ids = await seedDraftPeriod(db, { unitPrice: '500.0000', currencyCode: 'TRY' });

    // Approve 3 submissions for the same BOQ item
    await insertApprovedSubmission(db, {
      projectId: ids.projectId,
      boqItemId: ids.boqItemId,
      personId: ids.workerPersonId,
      auditorPersonId: ids.auditorPersonId,
      quantity: '1.000',
      decidedAt: '2026-05-10T10:00:00+03:00',
    });
    await insertApprovedSubmission(db, {
      projectId: ids.projectId,
      boqItemId: ids.boqItemId,
      personId: ids.workerPersonId,
      auditorPersonId: ids.auditorPersonId,
      quantity: '2.500',
      decidedAt: '2026-05-12T10:00:00+03:00',
    });
    await insertApprovedSubmission(db, {
      projectId: ids.projectId,
      boqItemId: ids.boqItemId,
      personId: ids.workerPersonId,
      auditorPersonId: ids.auditorPersonId,
      quantity: '6.500',
      decidedAt: '2026-05-14T10:00:00+03:00',
    });

    // Run the manual Recompute (the path the office "Yeniden Hesapla" button takes).
    // After Plan 12-03 refactor: recomputePeriodLines calls recomputeHakedisLine
    // for each priced (boq_item, currency) pair. Output MUST be identical to v2.0.
    const { recomputePeriodLines } = await import('@/actions/hakedis');
    const { ok } = await recomputePeriodLines(ids.periodId);
    expect(ok).toBe(true);

    const lines = await db.execute(sql`
      SELECT cumulative_qty_approved, previous_cumulative_qty, period_qty, period_value, cumulative_value
      FROM hakedis_period_lines
      WHERE period_id = ${ids.periodId}
        AND boq_item_id = ${ids.boqItemId}
    `);

    expect(lines.rows).toHaveLength(1);
    // cumulative = 1 + 2.5 + 6.5 = 10.000
    expect(lines.rows[0].cumulative_qty_approved).toBe('10.000');
    expect(lines.rows[0].previous_cumulative_qty).toBe('0.000');
    expect(lines.rows[0].period_qty).toBe('10.000');
    // period_value = (10 - 0) * 500 = 5000.00
    expect(lines.rows[0].period_value).toBe('5000.00');
    expect(lines.rows[0].cumulative_value).toBe('5000.00');
  });

  // ── D-120 / LivePeriodPoller mount gate ──────────────────────────────────
  // Pure-function contract: vitest environment='node', no @testing-library/react.
  // Replaced in Plan 04 Task 1 with:
  //   expect(LivePeriodPoller({ enabled: false })).toBeNull();
  // Stays as it.todo here because the component file does not exist yet (Plan 04
  // ships src/components/admin/LivePeriodPoller.tsx). Acceptance criterion allows
  // exactly 1 it.todo at Plan 12-03 close; Plan 12-04 must reduce this to 0.
  it.todo('LivePeriodPoller mount gate: component renders nothing and returns no DOM when enabled=false');

});
