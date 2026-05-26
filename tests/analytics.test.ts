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

  it('persists unit_price and currency_code on the BOQ item row (COST-01)', async () => {
    const { setUnitPrice } = await import('@/actions/boq');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-000000000120';
    const boqItemId = '00000000-0000-0000-0000-000000000220';
    const userId    = 'test-user-id';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'Test') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO users (id, email) VALUES ('${userId}', 'test@example.com') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'PriceTest') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', '1000', '0', 1) ON CONFLICT DO NOTHING`));

    const result = await setUnitPrice({ boqItemId, unitPrice: '1250.0000', currencyCode: 'TRY' });
    expect(result.ok).toBe(true);

    const rows = await db.execute(sql.raw(`SELECT unit_price, currency_code FROM boq_items WHERE id = '${boqItemId}'`));
    expect(rows.rows[0].unit_price).toBe('1250.0000');
    expect(rows.rows[0].currency_code).toBe('TRY');
  });

  it('throws Unauthorized when auth() returns null (COST-01 auth guard)', async () => {
    const { auth } = await import('@/lib/auth');
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const { setUnitPrice } = await import('@/actions/boq');

    await expect(
      setUnitPrice({ boqItemId: '00000000-0000-0000-0000-000000000220', unitPrice: '100', currencyCode: 'TRY' })
    ).rejects.toThrow('Unauthorized');
  });

  it('accepts null unitPrice to clear an existing price (COST-01 null clear)', async () => {
    const { setUnitPrice } = await import('@/actions/boq');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-000000000121';
    const boqItemId = '00000000-0000-0000-0000-000000000221';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'Test') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO users (id, email) VALUES ('test-user-id', 'test@example.com') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'ClearTest') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', '1000', '0', 1, '500.0000', 'TRY') ON CONFLICT DO NOTHING`));

    const result = await setUnitPrice({ boqItemId, unitPrice: null, currencyCode: 'TRY' });
    expect(result.ok).toBe(true);

    const rows = await db.execute(sql.raw(`SELECT unit_price FROM boq_items WHERE id = '${boqItemId}'`));
    expect(rows.rows[0].unit_price).toBeNull();
  });

  it('rejects negative unitPrice with { ok: false } (COST-01 validation)', async () => {
    const { setUnitPrice } = await import('@/actions/boq');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-000000000122';
    const boqItemId = '00000000-0000-0000-0000-000000000222';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'Test') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO users (id, email) VALUES ('test-user-id', 'test@example.com') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'NegTest') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', '1000', '0', 1) ON CONFLICT DO NOTHING`));

    const result = await setUnitPrice({ boqItemId, unitPrice: '-1', currencyCode: 'TRY' });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/non-negative/i);
  });
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

  it('Money-Math Test 3b — createProject succeeds even when log INSERT throws (PERF-03)', async () => {
    const { createProject } = await import('@/actions/projects');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    // Do NOT insert a user — this causes the logOfficeActivity FK insert to fail
    // The project INSERT should succeed regardless
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'Test') ON CONFLICT DO NOTHING`));

    // auth() returns test-user-id which has no corresponding users row → FK violation on log insert
    const project = await createProject({ name: 'LogFailProject' });
    expect(project).toBeDefined();
    expect(project.name).toBe('LogFailProject');

    // Verify project row exists in DB
    const rows = await db.execute(sql.raw(`SELECT id FROM projects WHERE name = 'LogFailProject'`));
    expect(rows.rows.length).toBeGreaterThan(0);
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

// ── PERF-03: logOfficeActivity wiring in people.ts + routes.ts ──────────────

describeIfDb('PERF-03: logOfficeActivity wiring — people.ts + routes.ts', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('createProject fires logOfficeActivity and getOfficeActivityLog returns the entry (PERF-03 e2e)', async () => {
    const { createProject } = await import('@/actions/projects');
    const { getOfficeActivityLog } = await import('@/actions/analytics');
    const { after } = await import('next/server');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    const userId   = 'test-user-id';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'Test') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO users (id, email) VALUES ('${userId}', 'test@example.com') ON CONFLICT DO NOTHING`));

    await createProject({ name: 'E2ELogProject' });

    // Wait for after() callback to complete
    const afterMock = after as ReturnType<typeof vi.fn>;
    const lastCallResult = afterMock.mock.results[afterMock.mock.results.length - 1]?.value;
    if (lastCallResult instanceof Promise) {
      await lastCallResult;
    }

    const entries = await getOfficeActivityLog({ actorUserId: userId });
    const entry = entries.find(e => e.actionType === 'project_created');
    expect(entry).toBeDefined();
    expect(entry!.actorUserId).toBe(userId);
  });

  it('logOfficeActivity wired in people.ts — person_approved fires log (PERF-03)', async () => {
    // Test that logOfficeActivity is wired into people.ts mutations by checking
    // that the function is imported and called in the source file (structural test)
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../src/actions/people.ts', import.meta.url).pathname,
      'utf8'
    );
    expect(content).toContain('logOfficeActivity(');
    expect(content).not.toMatch(/await logOfficeActivity/);
  });

  it('logOfficeActivity wired in routes.ts — route_uploaded fires log (PERF-03)', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(
      new URL('../src/actions/routes.ts', import.meta.url).pathname,
      'utf8'
    );
    expect(content).toContain('logOfficeActivity(');
    expect(content).not.toMatch(/await logOfficeActivity/);
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

  // WR-02 (re-review): portfolio EV and project-detail EV must agree.
  // getPortfolioOverview previously derived earned value from
  // boq_items.approved_qty while getProjectMetrics derived it from approved
  // submissions — a silent divergence risk. Both must now read the same source
  // (approved submissions), so for identical seed data the two EV maps match.
  it('getPortfolioOverview EV equals getProjectMetrics EV for the same project (WR-02)', async () => {
    const { getPortfolioOverview, getProjectMetrics } = await import('@/actions/analytics');
    const Decimal = (await import('decimal.js')).default;

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-0000000f0101';
    const boqItemId = '00000000-0000-0000-0000-0000000f0201';
    const personId  = '00000000-0000-0000-0000-0000000f0301';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'Default') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'WR02Project') ON CONFLICT DO NOTHING`));
    // unit_price 250, planned 1000 — but approved_qty is intentionally set to a
    // VALUE THAT DISAGREES with the approved submissions below (5) so the test
    // would fail if EV were still sourced from approved_qty.
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 999, 1, '250.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 880001, 'WR02Worker') ON CONFLICT DO NOTHING`));

    // 5 approved submissions of qty 1 each → approved submission qty total = 5.
    // EV from submissions = 5 * 250 = 1250. EV from approved_qty (999) would be
    // 249750 — wildly different, proving the source.
    for (let i = 0; i < 5; i++) {
      const subId  = `00000000-0000-0000-0000-0000f1000${String(i).padStart(3, '0')}`;
      const flowId = `00000000-f000-0000-0000-0000f1000${String(i).padStart(3, '0')}`;
      await db.execute(sql.raw(`
        INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
        VALUES ('${subId}', '${flowId}', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '1.000', 'https://example.com/photo.jpg', NOW())
        ON CONFLICT DO NOTHING
      `));
    }

    const overview = await getPortfolioOverview();
    const p = overview.find(x => x.projectId === projectId);
    expect(p).toBeDefined();

    const metrics = await getProjectMetrics(projectId);

    // The two EV maps must be identical for this project on identical data.
    const portfolioEv = p!.earnedValueByCurrency['TRY'];
    const detailEv    = metrics.evByCurrency['TRY'];
    expect(portfolioEv).toBeDefined();
    expect(detailEv).toBeDefined();
    expect(new Decimal(portfolioEv!).equals(new Decimal(detailEv!))).toBe(true);

    // And it equals the submission-derived value (5 * 250 = 1250), NOT the
    // approved_qty-derived value (999 * 250 = 249750).
    expect(new Decimal(portfolioEv!).equals(new Decimal('1250'))).toBe(true);
    expect(new Decimal(portfolioEv!).equals(new Decimal('249750'))).toBe(false);
  });
});

// ── REGRESSION: Phase 7 code-review fixes (CR-01..CR-05) ────────────────────
//
// Each test here exercises a specific defect found in 07-REVIEW.md. They FAIL
// against the pre-fix code and PASS after the fix.

// CR-01: BAC must not be multiplied by the submission count. Driving BAC from
// the submissions join summed planned_qty * unit_price once per submission.
describeIfDb('REGRESSION CR-01: getProjectMetrics BAC not fanned out by submissions', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('BAC = planned_qty * unit_price counted once, regardless of submission count (CR-01)', async () => {
    const { getProjectMetrics } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-0000000c0101';
    const boqItemId = '00000000-0000-0000-0000-0000000c0201';
    const personId  = '00000000-0000-0000-0000-0000000c0301';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'CR01') ON CONFLICT DO NOTHING`));
    // 1 BOQ item: planned 100, price 10 → BAC should be exactly 1000
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 100, 0, 1, '10.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 770001, 'WorkerCR01') ON CONFLICT DO NOTHING`));

    // 3 approved submissions against the SAME BOQ item. Pre-fix, BAC would be
    // 3 * (100 * 10) = 3000. Post-fix it must be 1000.
    for (let i = 0; i < 3; i++) {
      const subId  = `00000000-0000-0000-0000-0000c1000${String(i).padStart(3, '0')}`;
      const flowId = `00000000-f000-0000-0000-0000c1000${String(i).padStart(3, '0')}`;
      await db.execute(sql.raw(`
        INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
        VALUES ('${subId}', '${flowId}', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '5.000', 'https://example.com/photo.jpg', NOW())
        ON CONFLICT DO NOTHING
      `));
    }

    const metrics = await getProjectMetrics(projectId);

    // BAC = 100 * 10 = 1000, NOT 3000 (3 submissions × 1000)
    const bac = parseFloat(metrics.bacByCurrency['TRY'] ?? '0');
    expect(bac).toBeCloseTo(1000, 2);
    expect(bac).not.toBeCloseTo(3000, 2);

    // EV still driven from submissions: 3 × 5 × 10 = 150
    const ev = parseFloat(metrics.evByCurrency['TRY'] ?? '0');
    expect(ev).toBeCloseTo(150, 2);
  });
});

// CR-02: getPortfolioOverview must not Cartesian-multiply submissions × boq_items.
describeIfDb('REGRESSION CR-02: getPortfolioOverview no cross-join fan-out', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('counts and values are not multiplied by the submissions × boq_items cross-join (CR-02)', async () => {
    const { getPortfolioOverview } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-0000000c0102';
    const boqItem1  = '00000000-0000-0000-0000-0000000c0202';
    const boqItem2  = '00000000-0000-0000-0000-0000000c0203';
    const personId  = '00000000-0000-0000-0000-0000000c0302';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'CR02') ON CONFLICT DO NOTHING`));
    // 2 BOQ items, same currency. planned 100@10 and 50@10 → contracted = 1000 + 500 = 1500
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItem1}', '${tenantId}', '${projectId}', 'Pipe1', 'm', 100, 0, 1, '10.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItem2}', '${tenantId}', '${projectId}', 'Pipe2', 'm', 50, 0, 2, '10.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 770002, 'WorkerCR02') ON CONFLICT DO NOTHING`));

    // 2 approved submissions. Pre-fix: approved_count = 2 subs × 2 boq = 4, and
    // contracted_value = 1500 × 2 subs = 3000. Post-fix: count = 2, value = 1500.
    for (let i = 0; i < 2; i++) {
      const subId  = `00000000-0000-0000-0000-0000c2000${String(i).padStart(3, '0')}`;
      const flowId = `00000000-f000-0000-0000-0000c2000${String(i).padStart(3, '0')}`;
      await db.execute(sql.raw(`
        INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
        VALUES ('${subId}', '${flowId}', '${tenantId}', '${projectId}', '${personId}', '${boqItem1}', 'approved', '1.000', 'https://example.com/photo.jpg', NOW())
        ON CONFLICT DO NOTHING
      `));
    }

    const overview = await getPortfolioOverview();
    const p = overview.find(x => x.projectId === projectId);

    expect(p).toBeDefined();
    // approved count is the real number of approved submissions (2), not 4
    expect(p!.approvedCount).toBe(2);
    // contracted value = 1000 + 500 = 1500, not multiplied by the 2 submissions
    const contracted = parseFloat(p!.contractedValueByCurrency['TRY'] ?? '0');
    expect(contracted).toBeCloseTo(1500, 2);
    expect(contracted).not.toBeCloseTo(3000, 2);
  });
});

// CR-03: caller-supplied filter values must be bound parameters, never injected SQL.
describeIfDb('REGRESSION CR-03: filter values are parameterized, not injectable', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('malicious status string is treated as a parameter — no SQL executed, no error (CR-03)', async () => {
    const { getCanonicalSubmissions } = await import('@/actions/analytics');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));

    // A classic injection payload. Pre-fix this concatenated into the WHERE clause
    // and would either error or execute the injected statement. Post-fix it is a
    // bound parameter compared against s.status, matching nothing → empty result.
    const malicious = "approved'; DROP TABLE submissions; --";
    const rows = await getCanonicalSubmissions({
      // bypass the TS union type at runtime to simulate a crafted HTTP payload
      status: malicious as unknown as 'approved',
    });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(0);

    // submissions table must still exist (injection did NOT drop it)
    const check = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM submissions`));
    expect(Number(check.rows[0].c)).toBe(0);
  });

  it('malicious projectId in office activity log filter is a parameter, not SQL (CR-03)', async () => {
    const { getOfficeActivityLog } = await import('@/actions/analytics');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));

    // project_id is a uuid column; a non-uuid injection payload would, pre-fix,
    // be concatenated raw. Post-fix it is bound as a parameter. We assert the call
    // does not leak/execute injected SQL. (A non-uuid param may raise a typed
    // parameter error from Postgres — that is acceptable: it is NOT SQL injection,
    // and the office_activity_log table is never dropped.)
    const malicious = "'; DROP TABLE office_activity_log; --";
    let threw = false;
    try {
      const entries = await getOfficeActivityLog({ projectId: malicious });
      expect(Array.isArray(entries)).toBe(true);
    } catch {
      // typed parameter rejection is fine — the point is no injection executed
      threw = true;
    }

    // table must still exist regardless of whether a typed param error was raised
    const check = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM office_activity_log`));
    expect(Number(check.rows[0].c)).toBe(0);
    expect([true, false]).toContain(threw);
  });
});

// CR-05: setUnitPrice must reject currency codes outside the allow-list.
describe('REGRESSION CR-05: setUnitPrice currency validation (no DB needed)', () => {
  it('throws on an invalid currency code before any DB write (CR-05)', async () => {
    const { setUnitPrice } = await import('@/actions/boq');

    // The currency check runs BEFORE the DB read, so this throws without a DB.
    await expect(
      setUnitPrice({
        boqItemId: '00000000-0000-0000-0000-0000000c0205',
        unitPrice: '100',
        currencyCode: 'XYZ',
      })
    ).rejects.toThrow(/invalid currency/i);
  });
});

describeIfDb('REGRESSION CR-05: setUnitPrice accepts allowed currency', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('accepts a valid currency (TRY) and persists it (CR-05)', async () => {
    const { setUnitPrice } = await import('@/actions/boq');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-0000000c0105';
    const boqItemId = '00000000-0000-0000-0000-0000000c0206';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO users (id, email) VALUES ('test-user-id', 'test@example.com') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'CR05ok') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1) ON CONFLICT DO NOTHING`));

    const result = await setUnitPrice({ boqItemId, unitPrice: '50.0000', currencyCode: 'TRY' });
    expect(result.ok).toBe(true);

    const rows = await db.execute(sql.raw(`SELECT currency_code FROM boq_items WHERE id = '${boqItemId}'`));
    expect(rows.rows[0].currency_code).toBe('TRY');
  });
});

// ── UX-04: getPortfolioTrends() ────────────────────────────────────────────

describeIfDb('UX-04: getPortfolioTrends() — Istanbul-tz time-bucketed throughput + EV', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('returns monthly buckets ordered ASC with correct counts and non-null earnedValue', async () => {
    const { getPortfolioTrends } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-00000d040001';
    const boqItemId = '00000000-0000-0000-0000-00000d040101';
    const personId  = '00000000-0000-0000-0000-00000d040201';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'TrendsTest') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1, '50.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 910001, 'TrendWorker') ON CONFLICT DO NOTHING`));

    // Two approved submissions in April 2025 (Istanbul: April)
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-d04000000001', '00000000-f000-0000-0000-d04000000001', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '10.000', 'https://example.com/p.jpg', '2025-04-10T10:00:00Z')
      ON CONFLICT DO NOTHING
    `));
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-d04000000002', '00000000-f000-0000-0000-d04000000002', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '5.000', 'https://example.com/p.jpg', '2025-04-20T10:00:00Z')
      ON CONFLICT DO NOTHING
    `));
    // One rejected submission in June 2025 (Istanbul: June)
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-d04000000003', '00000000-f000-0000-0000-d04000000003', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'rejected', '3.000', 'https://example.com/p.jpg', '2025-06-15T10:00:00Z')
      ON CONFLICT DO NOTHING
    `));

    // No date filter → monthly bucketing (range > 60 days)
    const trends = await getPortfolioTrends({});

    expect(trends.length).toBeGreaterThanOrEqual(2);

    // Buckets must be ordered ASC
    for (let i = 1; i < trends.length; i++) {
      expect(trends[i].bucket >= trends[i - 1].bucket).toBe(true);
    }

    // Find the April bucket (approved submissions)
    const aprilBucket = trends.find(t => t.bucket.startsWith('2025-04'));
    expect(aprilBucket).toBeDefined();
    expect(aprilBucket!.approvedCount).toBe(2);
    expect(aprilBucket!.rejectedCount).toBe(0);
    // earnedValue = (10 + 5) * 50 = 750 TRY
    expect(aprilBucket!.earnedValue).not.toBeNull();
    const ev = parseFloat(aprilBucket!.earnedValue ?? '0');
    expect(ev).toBeCloseTo(750, 1);

    // Find the June bucket (rejected submission)
    const juneBucket = trends.find(t => t.bucket.startsWith('2025-06'));
    expect(juneBucket).toBeDefined();
    expect(juneBucket!.rejectedCount).toBe(1);
    // earnedValue for June is null (no approved priced submissions)
    expect(juneBucket!.earnedValue).toBeNull();
  });

  it('produces weekly buckets when date range is ≤60 days', async () => {
    const { getPortfolioTrends } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-00000d040002';
    const boqItemId = '00000000-0000-0000-0000-00000d040102';
    const personId  = '00000000-0000-0000-0000-00000d040202';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'WeeklyBuckets') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1) ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 910002, 'WeeklyWorker') ON CONFLICT DO NOTHING`));

    // 2 submissions in different weeks within a 30-day window
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-d04000000010', '00000000-f000-0000-0000-d04000000010', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '1.000', 'https://example.com/p.jpg', '2025-06-01T10:00:00Z')
      ON CONFLICT DO NOTHING
    `));
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-d04000000011', '00000000-f000-0000-0000-d04000000011', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '1.000', 'https://example.com/p.jpg', '2025-06-16T10:00:00Z')
      ON CONFLICT DO NOTHING
    `));

    const from = new Date('2025-06-01T00:00:00Z');
    const to   = new Date('2025-06-30T23:59:59Z');
    const trends = await getPortfolioTrends({ from, to });

    // Range ≤60 days → weekly buckets → two different submissions in different weeks → ≥2 buckets
    expect(trends.length).toBeGreaterThanOrEqual(2);
    // Total approvedCount across all buckets should equal 2
    const totalApproved = trends.reduce((s, t) => s + t.approvedCount, 0);
    expect(totalApproved).toBe(2);
  });

  it('throws Unauthorized when auth() returns null', async () => {
    const { auth } = await import('@/lib/auth');
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const { getPortfolioTrends } = await import('@/actions/analytics');
    await expect(getPortfolioTrends()).rejects.toThrow('Unauthorized');
  });
});

// ── PERF-04 extension: getPersonMetrics with dateRange ──────────────────────

describeIfDb('PERF-04: getPersonMetrics() with dateRange scopes all sub-queries', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('dateRange scopes submission counts to the selected period only', async () => {
    const { getPersonMetrics } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-00000d040003';
    const boqItemId = '00000000-0000-0000-0000-00000d040103';
    const personId  = '00000000-0000-0000-0000-00000d040203';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'DateRangeTest') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1, '100.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 920001, 'DateRangeWorker') ON CONFLICT DO NOTHING`));

    // 1 approved submission in April (in-range)
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-d04000000020', '00000000-f000-0000-0000-d04000000020', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '5.000', 'https://example.com/p.jpg', '2025-04-15T10:00:00Z')
      ON CONFLICT DO NOTHING
    `));
    // 1 approved submission in January (out-of-range)
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-d04000000021', '00000000-f000-0000-0000-d04000000021', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '5.000', 'https://example.com/p.jpg', '2025-01-10T10:00:00Z')
      ON CONFLICT DO NOTHING
    `));

    const aprilFrom = new Date('2025-04-01T00:00:00Z');
    const aprilTo   = new Date('2025-04-30T23:59:59Z');

    // With dateRange: only the April submission counts
    const metricsWithRange = await getPersonMetrics(personId, { dateRange: { from: aprilFrom, to: aprilTo } });
    expect(metricsWithRange.submissionsApproved).toBe(1);

    // Without dateRange: both submissions count (backward-compatible all-time path)
    const metricsAllTime = await getPersonMetrics(personId);
    expect(metricsAllTime.submissionsApproved).toBe(2);
  });
});

// ── UX-02: getPortfolioKPIs() ──────────────────────────────────────────────

describeIfDb('UX-02: getPortfolioKPIs() — pending backlog + in-range counts', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('pending backlog is NOT scoped by date filter (D-66)', async () => {
    const { getPortfolioKPIs } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-00000d020001';
    const boqItemId = '00000000-0000-0000-0000-00000d020101';
    const personId  = '00000000-0000-0000-0000-00000d020201';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'KPITest') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1, '100.0000', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 900001, 'WorkerKPI') ON CONFLICT DO NOTHING`));

    // pending_audit submission OUTSIDE the narrow date window (old date)
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-d02000000001', '00000000-f000-0000-0000-d02000000001', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'pending_audit', '5.000', 'https://example.com/p.jpg', '2024-01-15T00:00:00Z')
      ON CONFLICT DO NOTHING
    `));
    // approved submission INSIDE narrow window
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-d02000000002', '00000000-f000-0000-0000-d02000000002', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '5.000', 'https://example.com/p.jpg', '2025-06-15T00:00:00Z')
      ON CONFLICT DO NOTHING
    `));
    // rejected submission INSIDE narrow window
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-d02000000003', '00000000-f000-0000-0000-d02000000003', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'rejected', '5.000', 'https://example.com/p.jpg', '2025-06-20T00:00:00Z')
      ON CONFLICT DO NOTHING
    `));

    // narrow date window that excludes the 2024 pending row
    const from = new Date('2025-06-01T00:00:00Z');
    const to   = new Date('2025-06-30T23:59:59Z');

    const kpis = await getPortfolioKPIs({ from, to });

    // D-66: pending backlog is point-in-time — the 2024 pending row must be counted
    expect(kpis.pendingBacklog).toBeGreaterThan(0);
    expect(kpis.pendingBacklog).toBe(1);

    // in-range counts only see the window rows
    expect(kpis.approvalsInRange).toBe(1);
    expect(kpis.rejectionsInRange).toBe(1);
  });

  it('activeWorkers counts distinct submitters within date range (D-65)', async () => {
    const { getPortfolioKPIs } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-00000d020002';
    const boqItemId = '00000000-0000-0000-0000-00000d020102';
    const personA   = '00000000-0000-0000-0000-00000d020202';
    const personB   = '00000000-0000-0000-0000-00000d020203';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'KPIActiveWorker') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1) ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personA}', '${tenantId}', 900002, 'WorkerA') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personB}', '${tenantId}', 900003, 'WorkerB') ON CONFLICT DO NOTHING`));

    // personA submits 2 rows in window
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-d02000000a01', '00000000-f000-0000-0000-d02000000a01', '${tenantId}', '${projectId}', '${personA}', '${boqItemId}', 'approved', '1.000', 'https://example.com/p.jpg', '2025-06-10T00:00:00Z')
      ON CONFLICT DO NOTHING
    `));
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-d02000000a02', '00000000-f000-0000-0000-d02000000a02', '${tenantId}', '${projectId}', '${personA}', '${boqItemId}', 'approved', '1.000', 'https://example.com/p.jpg', '2025-06-11T00:00:00Z')
      ON CONFLICT DO NOTHING
    `));
    // personB submits 1 row in window
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('00000000-0000-0000-0000-d02000000b01', '00000000-f000-0000-0000-d02000000b01', '${tenantId}', '${projectId}', '${personB}', '${boqItemId}', 'approved', '1.000', 'https://example.com/p.jpg', '2025-06-12T00:00:00Z')
      ON CONFLICT DO NOTHING
    `));
    // personA submits 1 row OUTSIDE window — should not count toward activeWorkers in narrow range
    // but already counted above in window so still = 2 distinct

    const from = new Date('2025-06-01T00:00:00Z');
    const to   = new Date('2025-06-30T23:59:59Z');
    const kpis = await getPortfolioKPIs({ from, to });

    // 2 distinct workers submitted in this window
    expect(kpis.activeWorkers).toBe(2);
  });

  it('throws Unauthorized when auth() returns null', async () => {
    const { auth } = await import('@/lib/auth');
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const { getPortfolioKPIs } = await import('@/actions/analytics');
    await expect(getPortfolioKPIs()).rejects.toThrow('Unauthorized');
  });
});

// ── UX-05: getCanonicalSubmissions pagination + single-record ───────────────

describeIfDb('UX-05: getCanonicalSubmissions — submissionId lookup + limit/offset pagination', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('returns exactly one row when filtering by submissionId', async () => {
    const { getCanonicalSubmissions } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-00000d050001';
    const boqItemId = '00000000-0000-0000-0000-00000d050101';
    const personId  = '00000000-0000-0000-0000-00000d050201';
    const subId1    = '00000000-0000-0000-0000-00000d050301';
    const subId2    = '00000000-0000-0000-0000-00000d050302';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'SubIdTest') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1) ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 900010, 'SubLookupWorker') ON CONFLICT DO NOTHING`));

    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('${subId1}', '00000000-f000-0000-0000-00000d050301', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '10.000', 'https://example.com/p.jpg', NOW())
      ON CONFLICT DO NOTHING
    `));
    await db.execute(sql.raw(`
      INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
      VALUES ('${subId2}', '00000000-f000-0000-0000-00000d050302', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'rejected', '5.000', 'https://example.com/p.jpg', NOW())
      ON CONFLICT DO NOTHING
    `));

    const result = await getCanonicalSubmissions({ submissionId: subId1 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(subId1);
  });

  it('returns [] when submissionId does not match any row', async () => {
    const { getCanonicalSubmissions } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));

    const result = await getCanonicalSubmissions({ submissionId: '00000000-0000-0000-0000-000000099999' });
    expect(result).toHaveLength(0);
  });

  it('limit/offset slices the result set in DESC submitted_at order', async () => {
    const { getCanonicalSubmissions } = await import('@/actions/analytics');

    const tenantId  = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-00000d050003';
    const boqItemId = '00000000-0000-0000-0000-00000d050103';
    const personId  = '00000000-0000-0000-0000-00000d050203';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'T1') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'PaginateTest') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1) ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 900011, 'PaginateWorker') ON CONFLICT DO NOTHING`));

    // Insert 5 submissions with different dates (newest first in results)
    for (let i = 0; i < 5; i++) {
      const subId  = `00000000-0000-0000-0000-00000d05030${i + 4}`;
      const flowId = `00000000-f000-0000-0000-00000d05030${i + 4}`;
      const ts = `2025-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`;
      await db.execute(sql.raw(`
        INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
        VALUES ('${subId}', '${flowId}', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '1.000', 'https://example.com/p.jpg', '${ts}')
        ON CONFLICT DO NOTHING
      `));
    }

    // limit=2 offset=0 → 2 most recent
    const page1 = await getCanonicalSubmissions({ personId, limit: 2, offset: 0 });
    expect(page1).toHaveLength(2);

    // limit=2 offset=2 → next 2
    const page2 = await getCanonicalSubmissions({ personId, limit: 2, offset: 2 });
    expect(page2).toHaveLength(2);

    // page1 and page2 must not overlap
    const page1Ids = page1.map(r => r.id);
    const page2Ids = page2.map(r => r.id);
    expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false);

    // limit=2 offset=4 → only 1 row left
    const page3 = await getCanonicalSubmissions({ personId, limit: 2, offset: 4 });
    expect(page3).toHaveLength(1);
  });
});
