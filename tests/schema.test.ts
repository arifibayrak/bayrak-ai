/**
 * tests/schema.test.ts
 *
 * Schema, balance, and tenant helper tests for plan 01-02a.
 *
 * Pure (no DB) tests:
 *   - remainingBalance() helper (SETUP-04)
 *   - getDefaultTenantId() returns fixed UUID when env is unset
 *
 * DB-gated tests (require TEST_DATABASE_URL):
 *   - assignments UNIQUE(personId, projectId, roleOnProject) enforced at DB level
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';
import { remainingBalance } from '@/lib/boq-balance';
import { getDefaultTenantId } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// Pure unit tests — no DB required
// ---------------------------------------------------------------------------

describe('remainingBalance (SETUP-04)', () => {
  it('returns 0 when both planned and approved are 0', () => {
    expect(remainingBalance(0, 0)).toBe(0);
  });

  it('returns planned when approved is 0', () => {
    expect(remainingBalance(100, 0)).toBe(100);
  });

  it('returns planned minus approved for positive values', () => {
    expect(remainingBalance('1000.000', '250.500')).toBeCloseTo(749.5);
  });

  it('returns negative when approved exceeds planned (over-approval edge case)', () => {
    expect(remainingBalance(50, 75)).toBe(-25);
  });

  it('handles string numeric inputs correctly', () => {
    expect(remainingBalance('500.000', '0')).toBe(500);
    expect(remainingBalance('200.000', '200.000')).toBe(0);
  });
});

describe('getDefaultTenantId (D-09)', () => {
  const FIXED_UUID = '00000000-0000-0000-0000-000000000001';

  it('returns the fixed seed UUID when BAYRAK_TENANT_ID is unset', () => {
    const original = process.env.BAYRAK_TENANT_ID;
    delete process.env.BAYRAK_TENANT_ID;
    expect(getDefaultTenantId()).toBe(FIXED_UUID);
    if (original !== undefined) process.env.BAYRAK_TENANT_ID = original;
  });

  it('returns BAYRAK_TENANT_ID env var when set', () => {
    const custom = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const original = process.env.BAYRAK_TENANT_ID;
    process.env.BAYRAK_TENANT_ID = custom;
    expect(getDefaultTenantId()).toBe(custom);
    if (original !== undefined) {
      process.env.BAYRAK_TENANT_ID = original;
    } else {
      delete process.env.BAYRAK_TENANT_ID;
    }
  });
});

// ---------------------------------------------------------------------------
// DB-gated tests — skipped without TEST_DATABASE_URL
// ---------------------------------------------------------------------------

describeIfDb('assignments uniqueness (AUTH-04)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('enforces UNIQUE(personId, projectId, roleOnProject): duplicate role rejected', async () => {
    const { tenants } = await import('@/db/schema/tenants');
    const { projects } = await import('@/db/schema/projects');
    const { people } = await import('@/db/schema/people');
    const { assignments } = await import('@/db/schema/assignments');

    const tenantId = '00000000-0000-0000-0000-000000000001';

    // Insert seed tenant
    await db.insert(tenants).values({
      id: tenantId,
      name: 'Test Tenant',
    }).onConflictDoNothing();

    // Insert seed project
    const [project] = await db.insert(projects).values({
      tenantId,
      name: 'Test Project',
    }).returning();

    // Insert seed person
    const [person] = await db.insert(people).values({
      tenantId,
      telegramUserId: BigInt('123456789'),
      displayName: 'Test Worker',
    }).returning();

    // First assignment: OK
    await db.insert(assignments).values({
      tenantId,
      personId: person.id,
      projectId: project.id,
      roleOnProject: 'worker',
    });

    // Duplicate: same person + project + role → should throw
    await expect(
      db.insert(assignments).values({
        tenantId,
        personId: person.id,
        projectId: project.id,
        roleOnProject: 'worker',
      })
    ).rejects.toThrow();
  });

  it('allows same person as worker on project A and auditor on project B (D-03)', async () => {
    const { tenants } = await import('@/db/schema/tenants');
    const { projects } = await import('@/db/schema/projects');
    const { people } = await import('@/db/schema/people');
    const { assignments } = await import('@/db/schema/assignments');

    const tenantId = '00000000-0000-0000-0000-000000000001';

    await db.insert(tenants).values({ id: tenantId, name: 'Test Tenant' }).onConflictDoNothing();

    const [projectA] = await db.insert(projects).values({ tenantId, name: 'Project A' }).returning();
    const [projectB] = await db.insert(projects).values({ tenantId, name: 'Project B' }).returning();

    const [person] = await db.insert(people).values({
      tenantId,
      telegramUserId: BigInt('987654321'),
      displayName: 'Dual Role Person',
    }).returning();

    // Same person: worker on A, auditor on B — both should succeed
    await db.insert(assignments).values({
      tenantId,
      personId: person.id,
      projectId: projectA.id,
      roleOnProject: 'worker',
    });

    await db.insert(assignments).values({
      tenantId,
      personId: person.id,
      projectId: projectB.id,
      roleOnProject: 'auditor',
    });

    const rows = await db.select().from(assignments);
    expect(rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Phase 7 schema stubs — requires 0004 migration (Plan 02)
// ---------------------------------------------------------------------------

// requires 0004 migration (Plan 02)
describeIfDb('COST-01: currency_code DEFAULT TRY on boq_items (Phase 7)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it.todo(
    'currency_code defaults to TRY when a boq_items row is inserted without explicit currency (COST-01): ' +
    'INSERT into boq_items omitting currency_code column; ' +
    'SELECT currency_code → expect "TRY"'
  );

  it.todo(
    'unit_price defaults to NULL when a boq_items row is inserted without explicit unit_price (COST-01): ' +
    'INSERT into boq_items omitting unit_price column; ' +
    'SELECT unit_price → expect NULL (not 0)'
  );
});

// requires 0004 migration (Plan 02)
describeIfDb('Money-Math Test 5: hakedis_period_lines CHECK constraint (Phase 7)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it.todo(
    'Money-Math Test 5 — CHECK rejects cumulative_qty_approved < previous_cumulative_qty: ' +
    'seed the required parent rows (tenant + project + hakedis_period + boq_item); ' +
    'INSERT hakedis_period_lines with cumulative_qty_approved = 100, previous_cumulative_qty = 150; ' +
    'expect the INSERT to throw a Postgres CHECK constraint violation'
  );

  it.todo(
    'allows INSERT when cumulative_qty_approved == previous_cumulative_qty (boundary): ' +
    'INSERT hakedis_period_lines with cumulative_qty_approved = 100, previous_cumulative_qty = 100; ' +
    'expect no error (cumulative >= previous satisfied at equality)'
  );

  it.todo(
    'allows INSERT when cumulative_qty_approved > previous_cumulative_qty (normal case): ' +
    'INSERT hakedis_period_lines with cumulative = 200, previous = 100; ' +
    'expect no error'
  );
});

// requires 0004 migration (Plan 02)
describeIfDb('T-07-01: office_activity_log actor_user_id FK to users.id (Phase 7)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it.todo(
    'accepts a valid users.id (text) as actor_user_id (T-07-01): ' +
    'INSERT into users table with a known text id; ' +
    'INSERT into office_activity_log with actor_user_id = that user id; ' +
    'expect no FK violation'
  );

  it.todo(
    'rejects a non-existent user id as actor_user_id (T-07-01 FK violation): ' +
    'INSERT into office_activity_log with actor_user_id = "non-existent-user-id"; ' +
    'expect the INSERT to throw a Postgres FK violation'
  );

  it.todo(
    'actor_user_id is NOT a people.id (uuid) — wrong table guard (T-07-01 type mismatch): ' +
    'seed a person row (people table, uuid PK); ' +
    'attempt INSERT into office_activity_log with actor_user_id = person.id; ' +
    'expect FK violation (people.id is not in users table)'
  );
});
