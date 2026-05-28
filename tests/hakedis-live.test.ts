/**
 * tests/hakedis-live.test.ts — Phase 12 submission-driven hakkediş contract.
 *
 * Wave 0 scaffold: 9 pending entries map 1:1 to the rows in 12-VALIDATION.md
 * §Per-Task Verification Map. Downstream Waves (2/3/4) replace these todos
 * with concrete assertions; targeting by name MUST stay byte-identical so
 * `npx vitest run tests/hakedis-live.test.ts -t "<name>"` continues to bind
 * verify commands deterministically across plans.
 *
 * Behaviors covered:
 *   - D-117: scoped recompute fires on approve for (project, boq, currency)
 *   - D-118: no-open-period silent no-op
 *   - D-119: join row inserted; idempotent on re-fire (ON CONFLICT DO UPDATE)
 *   - SDH-02: getLineSubmissions response shape
 *   - Pitfall 4: finalize-during-approve race — no join row for finalized period
 *   - Pitfall 5: bot path never writes office_activity_log (no FK violation)
 *   - SDH-03: manual recomputePeriodLines unchanged before/after Phase 12
 *   - D-120: LivePeriodPoller returns null when enabled=false (mount gate)
 *
 * All DB-integration entries are guarded by describeIfDb so the suite stays
 * green on machines without TEST_DATABASE_URL.
 */

import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';
import { seedDraftPeriod } from './fixtures/hakedis';

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

describeIfDb('Phase 12 submission-driven hakkediş', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
    // Silence "unused" warnings on the scaffold-only Wave 0 file —
    // downstream waves consume these bindings to insert submissions
    // and invoke recomputeHakedisLine.
    void db;
    void seedDraftPeriod;
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  // ── SDH-01 / D-117 ───────────────────────────────────────────────────────
  it.todo('D-117 scoped recompute fires on approve for matching (project_id, boq_item_id, currency_code) triplet');

  // ── SDH-01 / D-118 ───────────────────────────────────────────────────────
  it.todo('D-118 no-open-period: scoped recompute is a no-op when no draft period exists for (project_id, currency_code)');

  // ── SDH-02 / D-119 ───────────────────────────────────────────────────────
  it.todo('D-119 join row: hakedis_line_submissions row inserted with qty_contributed = submissions.quantity');

  // ── SDH-02 / D-119 idempotency ───────────────────────────────────────────
  it.todo('D-119 idempotency: re-running scoped recompute for the same submission yields exactly one join row (ON CONFLICT DO UPDATE)');

  // ── SDH-02 / getLineSubmissions response shape ───────────────────────────
  it.todo('getLineSubmissions returns rows shape { workerName, decidedAt, qtyContributed, photoUrl, notes } ordered by decided_at DESC');

  // ── SDH-03 / Pitfall 4 — finalize race ───────────────────────────────────
  it.todo('finalize race: approve commit + finalize commit do not produce a join row for the just-finalized period (Pitfall 4)');

  // ── Pitfall 5 — bot path never writes office_activity_log ────────────────
  it.todo('Pitfall 5: bot path never writes office_activity_log (no FK violation on actor_user_id)');

  // ── SDH-03 / regression on manual Recompute ──────────────────────────────
  it.todo('SDH-03 regression: manual recomputePeriodLines on a draft produces identical line totals before/after the helper extraction');

  // ── D-120 / LivePeriodPoller mount gate ──────────────────────────────────
  // Pure-function contract: vitest environment='node', no @testing-library/react.
  // Replaced in Plan 04 Task 1 with:
  //   expect(LivePeriodPoller({ enabled: false })).toBeNull();
  it.todo('LivePeriodPoller mount gate: component renders nothing and returns no DOM when enabled=false');

});
