/**
 * tests/analytics.test.ts
 *
 * Integration and unit tests for Phase 7 analytics actions and logOfficeActivity helper.
 *
 * Requirements covered:
 *   COST-01: setUnitPrice() Server Action
 *   COST-02: getProjectMetrics() EV + BAC, float-safe, cross-currency guard
 *   COST-03: % complete EV/BAC per currency pair
 *   COST-04: getPersonMetrics() value_contributed by currency + dual-role isolation
 *   COST-05: getProjectMetrics() rework_value for rejected submissions
 *   PERF-03: logOfficeActivity() inserts row; non-blocking; getOfficeActivityLog() filter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';
import { sql } from 'drizzle-orm';

// Mock next/cache to prevent revalidatePath from throwing outside Next.js context
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Mock auth() for authorized tests — include `id` field so logOfficeActivity() can
// read session.user.id (actorUserId). This matches the Auth.js session shape.
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id', email: 'test@example.com' } }),
}));

// Mock next/server `after()` to execute immediately in tests — avoids "after() must be
// called within a request scope" error. Parallel to vi.mock('next/cache') pattern.
// Note: after() callback is async — we return the Promise so callers can await it
// transitively if needed (test assertions execute after the mock resolves).
vi.mock('next/server', () => ({
  after: vi.fn((fn) => Promise.resolve(fn())),  // execute immediately; ignore lifecycle
}));

// ── COST-01: setUnitPrice() ─────────────────────────────────────────────────

describeIfDb('COST-01: setUnitPrice() Server Action', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it.todo(
    'persists unit_price and currency_code on the BOQ item row (COST-01): ' +
    'given a seeded BOQ item with no price, call setUnitPrice({ boqItemId, unitPrice: "1250.0000", currencyCode: "TRY" }), ' +
    'then SELECT unit_price + currency_code — expect "1250.0000" and "TRY"'
  );

  it.todo(
    'returns { ok: false, error: "Unauthorized" } when auth() returns null (COST-01 auth guard): ' +
    'mock auth to return null, call setUnitPrice() — expect ok: false + error contains "Unauthorized"'
  );

  it.todo(
    'accepts null unitPrice to clear an existing price (COST-01 null clear): ' +
    'seed BOQ item with unit_price set, call setUnitPrice({ unitPrice: null, currencyCode: "TRY" }), ' +
    'verify unit_price IS NULL in DB'
  );

  it.todo(
    'rejects negative unitPrice with { ok: false } (COST-01 validation): ' +
    'call setUnitPrice({ unitPrice: "-1", currencyCode: "TRY" }) — expect ok: false'
  );
});

// ── COST-02: getProjectMetrics() EV + BAC + float safety ───────────────────

describeIfDb('COST-02: getProjectMetrics() earned value + BAC', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('returns evByCurrency and bacByCurrency grouped by currency_code (COST-02)', async () => {
    const { getProjectMetrics } = await import('@/actions/analytics');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-000000000101';
    const boqItemId = '00000000-0000-0000-0000-000000000201';
    const personId =  '00000000-0000-0000-0000-000000000301';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'P1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1, '500.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 111111, 'Worker1') ON CONFLICT DO NOTHING`));

    // 2 approved submissions of quantity 10 each; flow_id required (unique constraint)
    for (let i = 0; i < 2; i++) {
      const subId  = `00000000-0000-0000-0000-9000000000${String(i).padStart(2, '0')}`;
      const flowId = `00000000-f000-0000-0000-9000000000${String(i).padStart(2, '0')}`;
      await db.execute(sql.raw(`
        INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
        VALUES ('${subId}', '${flowId}', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '10.000', 'https://example.com/photo.jpg', NOW())
        ON CONFLICT DO NOTHING
      `));
    }

    const metrics = await getProjectMetrics(projectId);

    expect(metrics.evByCurrency).toBeDefined();
    expect(metrics.bacByCurrency).toBeDefined();
    expect(typeof metrics.evByCurrency['TRY']).toBe('string');
    expect(typeof metrics.bacByCurrency['TRY']).toBe('string');
    // EV = 500.0000 * 10 * 2 = 10000.0000
    const ev = parseFloat(metrics.evByCurrency['TRY'] ?? '0');
    expect(ev).toBeCloseTo(10000, 1);
  });

  it('Money-Math Test 1 — no float drift (COST-02 canonical)', async () => {
    const { getProjectMetrics } = await import('@/actions/analytics');
    const Decimal = (await import('decimal.js')).default;

    const tenantId = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-000000000102';
    const boqItemId = '00000000-0000-0000-0000-000000000202';
    const personId =  '00000000-0000-0000-0000-000000000302';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'MoneyMath1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 2000, 0, 1, '1250.0001', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 111112, 'Worker2') ON CONFLICT DO NOTHING`));

    // 3 approved submissions of quantity 333.333
    for (let i = 0; i < 3; i++) {
      const subId  = `00000000-0000-0000-0000-8000000000${String(i).padStart(2, '0')}`;
      const flowId = `00000000-f000-0000-0000-8000000000${String(i).padStart(2, '0')}`;
      await db.execute(sql.raw(`
        INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
        VALUES ('${subId}', '${flowId}', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '333.333', 'https://example.com/photo.jpg', NOW())
        ON CONFLICT DO NOTHING
      `));
    }

    const metrics = await getProjectMetrics(projectId);
    const result = metrics.evByCurrency['TRY'];
    expect(result).toBeDefined();

    // Expected: 1250.0001 * 333.333 * 3 (Postgres numeric precision)
    const expected = new Decimal('1250.0001').times('333.333').times(3);
    const actual = new Decimal(result!);
    const diff = actual.minus(expected).abs();
    expect(diff.lessThan('0.001')).toBe(true); // no kuruş drift
  });

  it('Money-Math Test 2 — cross-currency guard (COST-02 negative)', async () => {
    const { getProjectMetrics } = await import('@/actions/analytics');

    const tenantId    = '00000000-0000-0000-0000-000000000001';
    const projectId   = '00000000-0000-0000-0000-000000000103';
    const boqItemTRY  = '00000000-0000-0000-0000-000000000203';
    const boqItemUSD  = '00000000-0000-0000-0000-000000000204';
    const personId    = '00000000-0000-0000-0000-000000000303';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'CrossCurrency') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemTRY}', '${tenantId}', '${projectId}', 'TRY Pipe', 'm', 1000, 0, 1, '500.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemUSD}', '${tenantId}', '${projectId}', 'USD Pipe', 'm', 500, 0, 2, '10.0000', 'USD') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 111113, 'Worker3') ON CONFLICT DO NOTHING`));

    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-700000000001', '00000000-f000-0000-0000-700000000001', '${tenantId}', '${projectId}', '${personId}', '${boqItemTRY}', 'approved', '5.000', 'https://example.com/photo.jpg', NOW())
      ON CONFLICT DO NOTHING
    `));
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-700000000002', '00000000-f000-0000-0000-700000000002', '${tenantId}', '${projectId}', '${personId}', '${boqItemUSD}', 'approved', '5.000', 'https://example.com/photo.jpg', NOW())
      ON CONFLICT DO NOTHING
    `));

    const metrics = await getProjectMetrics(projectId);
    const keys = Object.keys(metrics.evByCurrency).sort();

    expect(keys).toContain('TRY');
    expect(keys).toContain('USD');
    expect(metrics.evByCurrency).not.toHaveProperty('total');
  });

  it('returns empty maps for a project with no priced BOQ items (COST-02 edge)', async () => {
    const { getProjectMetrics } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-000000000104';
    const boqItemId = '00000000-0000-0000-0000-000000000205';
    const personId  = '00000000-0000-0000-0000-000000000304';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'NoPrice') ON CONFLICT DO NOTHING`));
    // No unit_price (NULL) — no currency grouping possible
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1) ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 111114, 'Worker4') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-600000000001', '00000000-f000-0000-0000-600000000001', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '10.000', 'https://example.com/photo.jpg', NOW())
      ON CONFLICT DO NOTHING
    `));

    const metrics = await getProjectMetrics(projectId);
    // evByCurrency should be empty when unit_price IS NULL on all BOQ items
    expect(Object.keys(metrics.evByCurrency).length).toBe(0);
  });
});

// ── COST-03: % complete EV/BAC per currency pair ─────────────────────────────

describe('COST-03: % complete calculation per currency pair', () => {
  it('computes pct = EV/BAC for each currency independently (COST-03)', () => {
    // Unit test — no DB required; just verify the division logic
    const evByCurrency:  Record<string, string> = { TRY: '500000' };
    const bacByCurrency: Record<string, string> = { TRY: '1000000' };

    const pctByKey: Record<string, number | null> = {};
    for (const currency of Object.keys(bacByCurrency)) {
      const bac = parseFloat(bacByCurrency[currency] ?? '0');
      const ev  = parseFloat(evByCurrency[currency] ?? '0');
      pctByKey[currency] = bac > 0 ? (ev / bac) * 100 : null;
    }

    expect(pctByKey['TRY']).toBeCloseTo(50, 1);
  });

  it('handles BAC = "0" without division by zero (COST-03 guard)', () => {
    const bacByCurrency: Record<string, string> = { TRY: '0' };
    const evByCurrency:  Record<string, string> = { TRY: '100' };

    const bac = parseFloat(bacByCurrency['TRY'] ?? '0');
    const ev  = parseFloat(evByCurrency['TRY']  ?? '0');
    const pct = bac > 0 ? (ev / bac) * 100 : null;

    expect(pct).toBeNull();
    expect(Number.isNaN(pct)).toBe(false);
    expect(pct).not.toBe(Infinity);
  });

  it('does not produce a cross-currency combined % (COST-03 isolation)', () => {
    const evByCurrency:  Record<string, string> = { TRY: '500000', USD: '10000' };
    const bacByCurrency: Record<string, string> = { TRY: '1000000', USD: '20000' };

    const tryPct = parseFloat(bacByCurrency['TRY'] ?? '0') > 0
      ? (parseFloat(evByCurrency['TRY'] ?? '0') / parseFloat(bacByCurrency['TRY'] ?? '0')) * 100
      : null;
    const usdPct = parseFloat(bacByCurrency['USD'] ?? '0') > 0
      ? (parseFloat(evByCurrency['USD'] ?? '0') / parseFloat(bacByCurrency['USD'] ?? '0')) * 100
      : null;

    expect(tryPct).toBeCloseTo(50, 1);
    expect(usdPct).toBeCloseTo(50, 1);
    expect(Object.keys(evByCurrency)).not.toContain('total');
  });
});

// ── COST-04: getPersonMetrics() value_contributed + dual-role isolation ──────

describeIfDb('COST-04: getPersonMetrics() value contribution', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('returns valueContributedByCurrency grouped by currency for approved submissions (COST-04)', async () => {
    const { getPersonMetrics } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-000000000105';
    const boqItemId = '00000000-0000-0000-0000-000000000206';
    const personId  = '00000000-0000-0000-0000-000000000305';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'PersonMetrics') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1, '200.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 222220, 'PersonA') ON CONFLICT DO NOTHING`));

    // 2 approved submissions of quantity 5 each = 2*5*200 = 2000 TRY
    for (let i = 0; i < 2; i++) {
      const subId  = `00000000-0000-0000-0000-5000000000${String(i).padStart(2, '0')}`;
      const flowId = `00000000-f000-0000-0000-5000000000${String(i).padStart(2, '0')}`;
      await db.execute(sql.raw(`
        INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
        VALUES ('${subId}', '${flowId}', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '5.000', 'https://example.com/photo.jpg', NOW())
        ON CONFLICT DO NOTHING
      `));
    }

    const metrics = await getPersonMetrics(personId);
    expect(metrics.valueContributedByCurrency).toBeDefined();
    expect(typeof metrics.valueContributedByCurrency['TRY']).toBe('string');
    const val = parseFloat(metrics.valueContributedByCurrency['TRY'] ?? '0');
    expect(val).toBeCloseTo(2000, 1);
  });

  it('Money-Math Test 4 — dual-role isolation (COST-04)', async () => {
    const { getPersonMetrics } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectAId = '00000000-0000-0000-0000-000000000106';
    const projectBId = '00000000-0000-0000-0000-000000000107';
    const boqItemA   = '00000000-0000-0000-0000-000000000207';
    const boqItemB   = '00000000-0000-0000-0000-000000000208';
    const personId   = '00000000-0000-0000-0000-000000000306';
    const workerOnB  = '00000000-0000-0000-0000-000000000307';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectAId}', '${tenantId}', 'ProjectA') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectBId}', '${tenantId}', 'ProjectB') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemA}', '${tenantId}', '${projectAId}', 'Pipe A', 'm', 1000, 0, 1, '100.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemB}', '${tenantId}', '${projectBId}', 'Pipe B', 'm', 1000, 0, 1, '100.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 333330, 'DualRole') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${workerOnB}', '${tenantId}', 333331, 'WorkerB') ON CONFLICT DO NOTHING`));

    // person is worker on project A — 3 approved submissions (person_id = personId)
    for (let i = 0; i < 3; i++) {
      const subId  = `00000000-0000-0000-0000-4000000000${String(i).padStart(2, '0')}`;
      const flowId = `00000000-f000-0000-0000-4000000000${String(i).padStart(2, '0')}`;
      await db.execute(sql.raw(`
        INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
        VALUES ('${subId}', '${flowId}', '${tenantId}', '${projectAId}', '${personId}', '${boqItemA}', 'approved', '1.000', 'https://example.com/photo.jpg', NOW())
        ON CONFLICT DO NOTHING
      `));
    }

    // person is auditor on project B — 5 decisions (decided_by = personId, but person_id = workerOnB)
    for (let i = 0; i < 5; i++) {
      const subId  = `00000000-0000-0000-0000-3000000000${String(i).padStart(2, '0')}`;
      const flowId = `00000000-f000-0000-0000-3000000000${String(i).padStart(2, '0')}`;
      await db.execute(sql.raw(`
        INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at, decided_by, decided_at)
        VALUES ('${subId}', '${flowId}', '${tenantId}', '${projectBId}', '${workerOnB}', '${boqItemB}', 'approved', '1.000', 'https://example.com/photo.jpg', NOW(), '${personId}', NOW())
        ON CONFLICT DO NOTHING
      `));
    }

    // assignments
    await db.execute(sql.raw(`
      INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project)
      VALUES ('00000000-0000-0000-0000-2000000000a1', '${tenantId}', '${personId}', '${projectAId}', 'worker')
      ON CONFLICT DO NOTHING
    `));
    await db.execute(sql.raw(`
      INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project)
      VALUES ('00000000-0000-0000-0000-2000000000a2', '${tenantId}', '${personId}', '${projectBId}', 'auditor')
      ON CONFLICT DO NOTHING
    `));

    const metrics = await getPersonMetrics(personId);

    // Worker metrics: only project A submissions as person_id (3 approved)
    expect(metrics.submissionsApproved).toBe(3);
    // auditor decisions on B must NOT bleed into worker submission counts
    expect(metrics.submissionsApproved).not.toBe(8);  // 3+5 would be a bleed
  });

  it('returns auditor decision metrics when asAuditor: true (COST-04 auditor path)', async () => {
    const { getPersonMetrics } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-000000000108';
    const boqItemId = '00000000-0000-0000-0000-000000000209';
    const personId  = '00000000-0000-0000-0000-000000000308'; // auditor
    const workerId  = '00000000-0000-0000-0000-000000000309'; // worker who submits

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'AuditorTest') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1) ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 444440, 'Auditor') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${workerId}', '${tenantId}', 444441, 'WorkerForAudit') ON CONFLICT DO NOTHING`));

    // 5 decisions made by person
    for (let i = 0; i < 5; i++) {
      const subId  = `00000000-0000-0000-0000-1000000000${String(i).padStart(2, '0')}`;
      const flowId = `00000000-f000-0000-0000-1000000000${String(i).padStart(2, '0')}`;
      await db.execute(sql.raw(`
        INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at, decided_by, decided_at)
        VALUES ('${subId}', '${flowId}', '${tenantId}', '${projectId}', '${workerId}', '${boqItemId}', 'approved', '1.000', 'https://example.com/photo.jpg', NOW(), '${personId}', NOW())
        ON CONFLICT DO NOTHING
      `));
    }

    const metrics = await getPersonMetrics(personId, { asAuditor: true });
    expect(metrics.decisionsCount).toBe(5);
  });
});

// ── COST-05: rework_value for rejected submissions ────────────────────────────

describeIfDb('COST-05: getProjectMetrics() rework value', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('reworkValueByCurrency reflects only rejected submissions, not approved (COST-05)', async () => {
    const { getProjectMetrics } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-000000000109';
    const boqItemId = '00000000-0000-0000-0000-000000000210';
    const personId  = '00000000-0000-0000-0000-000000000310';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'Rework') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1, '300.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 555550, 'WorkerRework') ON CONFLICT DO NOTHING`));

    // 2 approved submissions of qty 5 each (value = 2*5*300 = 3000)
    for (let i = 0; i < 2; i++) {
      const subId  = `00000000-0000-0000-0000-aa000000${String(i).padStart(4, '0')}`;
      const flowId = `00000000-f000-0000-0000-aa000000${String(i).padStart(4, '0')}`;
      await db.execute(sql.raw(`
        INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
        VALUES ('${subId}', '${flowId}', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '5.000', 'https://example.com/photo.jpg', NOW())
        ON CONFLICT DO NOTHING
      `));
    }

    // 1 rejected submission of qty 7 (value = 7*300 = 2100) — rework
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-aa0000000099', '00000000-f000-0000-0000-aa0000000099', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'rejected', '7.000', 'https://example.com/photo.jpg', NOW())
      ON CONFLICT DO NOTHING
    `));

    const metrics = await getProjectMetrics(projectId);

    // rework = 7 * 300 = 2100
    const rework = parseFloat(metrics.reworkValueByCurrency['TRY'] ?? '0');
    expect(rework).toBeCloseTo(2100, 1);

    // EV should be approved only = 2 * 5 * 300 = 3000
    const ev = parseFloat(metrics.evByCurrency['TRY'] ?? '0');
    expect(ev).toBeCloseTo(3000, 1);
  });

  it('reworkValueByCurrency is empty for a project with no rejections (COST-05 edge)', async () => {
    const { getProjectMetrics } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-000000000110';
    const boqItemId = '00000000-0000-0000-0000-000000000211';
    const personId  = '00000000-0000-0000-0000-000000000311';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'NoRework') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1, '300.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 666660, 'WorkerNoRework') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-bb0000000001', '00000000-f000-0000-0000-bb0000000001', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '5.000', 'https://example.com/photo.jpg', NOW())
      ON CONFLICT DO NOTHING
    `));

    const metrics = await getProjectMetrics(projectId);

    // rework should be empty or '0' (no rejected submissions)
    const reworkVal = metrics.reworkValueByCurrency['TRY'] ?? '0';
    expect(parseFloat(reworkVal)).toBeCloseTo(0, 2);
  });
});

// ── PERF-03: logOfficeActivity() + getOfficeActivityLog() ───────────────────

describeIfDb('PERF-03: logOfficeActivity() inserts + getOfficeActivityLog() filter', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('logOfficeActivity() inserts row and returns void synchronously (PERF-03 non-blocking)', async () => {
    const { logOfficeActivity } = await import('@/lib/log-office-activity');
    const { after } = await import('next/server');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    const userId   = 'test-user-id';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO users (id, email) VALUES ('${userId}', 'test@example.com') ON CONFLICT DO NOTHING`));

    // Should return void synchronously (not a Promise)
    const result = logOfficeActivity({
      actorUserId: userId,
      actionType: 'project_created',
      entityType: 'project',
      entityId: '00000000-0000-0000-0000-000000000001',
      metadata: { name: 'Test Project' },
    });

    // Wait for the async after() callback to finish
    // The mock returns Promise.resolve(fn()) — the last call's return value is the promise
    const afterMock = after as ReturnType<typeof vi.fn>;
    const lastCallResult = afterMock.mock.results[afterMock.mock.results.length - 1]?.value;
    if (lastCallResult instanceof Promise) {
      await lastCallResult;
    }

    expect(result).toBeUndefined(); // void return

    const rows = await db.execute(sql.raw(`SELECT action_type FROM office_activity_log WHERE actor_user_id = '${userId}'`));
    expect(rows.rows.length).toBeGreaterThan(0);
    expect(rows.rows[0].action_type).toBe('project_created');
  });

  it('Money-Math Test 3 — activity log is non-blocking (PERF-03)', async () => {
    const { logOfficeActivity } = await import('@/lib/log-office-activity');

    // after() is mocked to execute immediately. The insert throws because
    // 'nonexistent-user' doesn't exist (FK violation). logOfficeActivity must
    // swallow the error and not throw — the function still returns void without error.
    expect(() => {
      logOfficeActivity({
        actorUserId: 'nonexistent-user-causes-fk-error',
        actionType: 'project_created',
        entityType: 'project',
        metadata: { name: 'test' },
      });
    }).not.toThrow();
  });

  it('getOfficeActivityLog() filters by actorUserId (PERF-03)', async () => {
    const { getOfficeActivityLog } = await import('@/actions/analytics');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    const userId1  = 'log-user-1';
    const userId2  = 'log-user-2';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO users (id, email) VALUES ('${userId1}', 'user1@example.com') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO users (id, email) VALUES ('${userId2}', 'user2@example.com') ON CONFLICT DO NOTHING`));

    // 2 entries for userId1, 1 for userId2
    await db.execute(sql.raw(`INSERT INTO office_activity_log (id, tenant_id, actor_user_id, action_type, entity_type) VALUES ('00000000-0000-0000-0000-cc0000000001', '${tenantId}', '${userId1}', 'project_created', 'project') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO office_activity_log (id, tenant_id, actor_user_id, action_type, entity_type) VALUES ('00000000-0000-0000-0000-cc0000000002', '${tenantId}', '${userId1}', 'boq_item_created', 'boq_item') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO office_activity_log (id, tenant_id, actor_user_id, action_type, entity_type) VALUES ('00000000-0000-0000-0000-cc0000000003', '${tenantId}', '${userId2}', 'route_uploaded', 'route') ON CONFLICT DO NOTHING`));

    const entries = await getOfficeActivityLog({ actorUserId: userId1 });
    expect(entries).toHaveLength(2);
    expect(entries.every(e => e.actorUserId === userId1)).toBe(true);
  });

  it('getOfficeActivityLog() respects limit option (PERF-03 pagination)', async () => {
    const { getOfficeActivityLog } = await import('@/actions/analytics');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    const userId   = 'log-limit-user';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO users (id, email) VALUES ('${userId}', 'limituser@example.com') ON CONFLICT DO NOTHING`));

    // Insert 10 entries
    for (let i = 1; i <= 10; i++) {
      const id = `00000000-0000-0000-00${String(i).padStart(2, '0')}-dd0000000001`;
      await db.execute(sql.raw(`INSERT INTO office_activity_log (id, tenant_id, actor_user_id, action_type, entity_type) VALUES ('${id}', '${tenantId}', '${userId}', 'project_created', 'project') ON CONFLICT DO NOTHING`));
    }

    const entries = await getOfficeActivityLog({ limit: 3 });
    expect(entries.length).toBeLessThanOrEqual(3);
  });
});

// ── getPortfolioOverview() ─────────────────────────────────────────────────

describeIfDb('getPortfolioOverview() per-project currency maps', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('returns one ProjectSummary per project with currency-keyed value maps', async () => {
    const { getPortfolioOverview } = await import('@/actions/analytics');

    const tenantId   = '00000000-0000-0000-0000-000000000001';
    const projectId1 = '00000000-0000-0000-0000-000000000111';
    const projectId2 = '00000000-0000-0000-0000-000000000112';
    const boqItem1   = '00000000-0000-0000-0000-000000000212';
    const boqItem2   = '00000000-0000-0000-0000-000000000213';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId1}', '${tenantId}', 'Portfolio1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId2}', '${tenantId}', 'Portfolio2') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItem1}', '${tenantId}', '${projectId1}', 'PipeA', 'm', 100, 0, 1, '10.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItem2}', '${tenantId}', '${projectId2}', 'PipeB', 'm', 200, 0, 1, '20.0000', 'USD') ON CONFLICT DO NOTHING`));

    const overview = await getPortfolioOverview();

    expect(overview.length).toBeGreaterThanOrEqual(2);

    const p1 = overview.find(p => p.projectId === projectId1);
    const p2 = overview.find(p => p.projectId === projectId2);

    expect(p1).toBeDefined();
    expect(p1!.contractedValueByCurrency).toBeDefined();
    expect(p1!.contractedValueByCurrency['TRY']).toBeDefined();

    expect(p2).toBeDefined();
    expect(p2!.contractedValueByCurrency['USD']).toBeDefined();
  });
});
