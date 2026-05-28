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

  it('currency_code defaults to TRY when a boq_items row is inserted without explicit currency (COST-01)', async () => {
    const { tenants } = await import('@/db/schema/tenants');
    const { projects } = await import('@/db/schema/projects');
    const { boqItems } = await import('@/db/schema/boq-items');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    await db.insert(tenants).values({ id: tenantId, name: 'Test Tenant' }).onConflictDoNothing();

    const [project] = await db.insert(projects).values({ tenantId, name: 'Test Project' }).returning();

    // Insert without explicit currency_code — should default to TRY
    const [item] = await db.insert(boqItems).values({
      tenantId,
      projectId: project.id,
      material: 'DN200 HDPE Boru',
      unit: 'm',
      plannedQty: '1000.000',
      sortOrder: 1,
    }).returning();

    expect(item.currencyCode).toBe('TRY');
  });

  it('unit_price defaults to NULL when a boq_items row is inserted without explicit unit_price (COST-01)', async () => {
    const { tenants } = await import('@/db/schema/tenants');
    const { projects } = await import('@/db/schema/projects');
    const { boqItems } = await import('@/db/schema/boq-items');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    await db.insert(tenants).values({ id: tenantId, name: 'Test Tenant' }).onConflictDoNothing();

    const [project] = await db.insert(projects).values({ tenantId, name: 'Test Project' }).returning();

    // Insert without explicit unit_price — should default to NULL
    const [item] = await db.insert(boqItems).values({
      tenantId,
      projectId: project.id,
      material: 'DN200 HDPE Boru',
      unit: 'm',
      plannedQty: '1000.000',
      sortOrder: 1,
    }).returning();

    expect(item.unitPrice).toBeNull();
  });
});

// requires 0004 migration (Plan 02)
describeIfDb('Money-Math Test 5: hakedis_period_lines GENERATED period_qty + cumulative CHECK (Phase 10 / D-104)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('Money-Math Test 5 — CHECK rejects cumulative_qty_approved < previous_cumulative_qty', async () => {
    const { tenants } = await import('@/db/schema/tenants');
    const { projects } = await import('@/db/schema/projects');
    const { boqItems } = await import('@/db/schema/boq-items');
    const { hakedisPeriods } = await import('@/db/schema/hakedis-periods');
    const { hakedisPeriodLines } = await import('@/db/schema/hakedis-period-lines');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    await db.insert(tenants).values({ id: tenantId, name: 'Test Tenant' }).onConflictDoNothing();

    const [project] = await db.insert(projects).values({ tenantId, name: 'Test Project' }).returning();

    const [boqItem] = await db.insert(boqItems).values({
      tenantId,
      projectId: project.id,
      material: 'DN200 HDPE',
      unit: 'm',
      plannedQty: '1000.000',
      sortOrder: 1,
    }).returning();

    const [period] = await db.insert(hakedisPeriods).values({
      tenantId,
      projectId: project.id,
      periodNumber: 'HK-2026-01',
      periodEndDate: '2026-05-31',
    }).returning();

    // cumulative_qty_approved (50) < previous_cumulative_qty (100) — must be rejected
    // by the cumulative_check (0004 migration). Note: periodQty is now GENERATED ALWAYS AS
    // STORED (D-104, migration 0008) — it must NOT be supplied in the INSERT.
    await expect(
      db.insert(hakedisPeriodLines).values({
        tenantId,
        periodId: period.id,
        boqItemId: boqItem.id,
        materialSnapshot: 'DN200 HDPE',
        unitSnapshot: 'm',
        currencyCodeSnapshot: 'TRY',
        unitPriceSnapshot: '1250.0000',
        cumulativeQtyApproved: '50.000',
        previousCumulativeQty: '100.000',
        periodValue: '-62500.00',
        cumulativeValue: '62500.00',
      })
    ).rejects.toThrow();
  });

  it('allows INSERT when cumulative_qty_approved == previous_cumulative_qty (boundary)', async () => {
    const { tenants } = await import('@/db/schema/tenants');
    const { projects } = await import('@/db/schema/projects');
    const { boqItems } = await import('@/db/schema/boq-items');
    const { hakedisPeriods } = await import('@/db/schema/hakedis-periods');
    const { hakedisPeriodLines } = await import('@/db/schema/hakedis-period-lines');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    await db.insert(tenants).values({ id: tenantId, name: 'Test Tenant' }).onConflictDoNothing();

    const [project] = await db.insert(projects).values({ tenantId, name: 'Test Project' }).returning();

    const [boqItem] = await db.insert(boqItems).values({
      tenantId,
      projectId: project.id,
      material: 'DN200 HDPE',
      unit: 'm',
      plannedQty: '1000.000',
      sortOrder: 1,
    }).returning();

    const [period] = await db.insert(hakedisPeriods).values({
      tenantId,
      projectId: project.id,
      periodNumber: 'HK-2026-01',
      periodEndDate: '2026-05-31',
    }).returning();

    // cumulative == previous → should be allowed (boundary case)
    // periodQty is GENERATED ALWAYS AS STORED (D-104) — must NOT be supplied.
    // Postgres auto-computes: 100.000 - 100.000 = 0.000
    const [line] = await db.insert(hakedisPeriodLines).values({
      tenantId,
      periodId: period.id,
      boqItemId: boqItem.id,
      materialSnapshot: 'DN200 HDPE',
      unitSnapshot: 'm',
      currencyCodeSnapshot: 'TRY',
      unitPriceSnapshot: '1250.0000',
      cumulativeQtyApproved: '100.000',
      previousCumulativeQty: '100.000',
      periodValue: '0.00',
      cumulativeValue: '125000.00',
    }).returning();

    expect(line.cumulativeQtyApproved).toBe('100.000');
    // GENERATED column: period_qty = cumulative - previous = 100.000 - 100.000 = 0.000
    expect(line.periodQty).toBe('0.000');
  });

  it('allows INSERT when cumulative_qty_approved > previous_cumulative_qty (normal case)', async () => {
    const { tenants } = await import('@/db/schema/tenants');
    const { projects } = await import('@/db/schema/projects');
    const { boqItems } = await import('@/db/schema/boq-items');
    const { hakedisPeriods } = await import('@/db/schema/hakedis-periods');
    const { hakedisPeriodLines } = await import('@/db/schema/hakedis-period-lines');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    await db.insert(tenants).values({ id: tenantId, name: 'Test Tenant' }).onConflictDoNothing();

    const [project] = await db.insert(projects).values({ tenantId, name: 'Test Project' }).returning();

    const [boqItem] = await db.insert(boqItems).values({
      tenantId,
      projectId: project.id,
      material: 'DN200 HDPE',
      unit: 'm',
      plannedQty: '1000.000',
      sortOrder: 1,
    }).returning();

    const [period] = await db.insert(hakedisPeriods).values({
      tenantId,
      projectId: project.id,
      periodNumber: 'HK-2026-01',
      periodEndDate: '2026-05-31',
    }).returning();

    // cumulative (200) > previous (100) — normal case
    // periodQty is GENERATED ALWAYS AS STORED (D-104) — must NOT be supplied.
    // Postgres auto-computes: 200.000 - 100.000 = 100.000
    const [line] = await db.insert(hakedisPeriodLines).values({
      tenantId,
      periodId: period.id,
      boqItemId: boqItem.id,
      materialSnapshot: 'DN200 HDPE',
      unitSnapshot: 'm',
      currencyCodeSnapshot: 'TRY',
      unitPriceSnapshot: '1250.0000',
      cumulativeQtyApproved: '200.000',
      previousCumulativeQty: '100.000',
      periodValue: '125000.00',
      cumulativeValue: '250000.00',
    }).returning();

    expect(line.cumulativeQtyApproved).toBe('200.000');
    // GENERATED column: period_qty = cumulative - previous = 200.000 - 100.000 = 100.000
    expect(line.periodQty).toBe('100.000');
  });
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

  it('accepts a valid users.id (text) as actor_user_id (T-07-01)', async () => {
    const { tenants } = await import('@/db/schema/tenants');
    const { users } = await import('@/db/schema/auth');
    const { officeActivityLog } = await import('@/db/schema/office-activity-log');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    await db.insert(tenants).values({ id: tenantId, name: 'Test Tenant' }).onConflictDoNothing();

    // Insert a valid Auth.js user (text PK)
    const userId = 'auth-user-text-id-001';
    await db.insert(users).values({ id: userId, email: 'engineer@test.com' }).onConflictDoNothing();

    // Should succeed — valid FK reference
    const [log] = await db.insert(officeActivityLog).values({
      tenantId,
      actorUserId: userId,
      actionType: 'project_created',
      entityType: 'project',
    }).returning();

    expect(log.actorUserId).toBe(userId);
  });

  it('rejects a non-existent user id as actor_user_id (T-07-01 FK violation)', async () => {
    const { tenants } = await import('@/db/schema/tenants');
    const { officeActivityLog } = await import('@/db/schema/office-activity-log');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    await db.insert(tenants).values({ id: tenantId, name: 'Test Tenant' }).onConflictDoNothing();

    // Non-existent user id → should throw FK violation
    await expect(
      db.insert(officeActivityLog).values({
        tenantId,
        actorUserId: 'non-existent-user-id-xyz',
        actionType: 'project_created',
        entityType: 'project',
      })
    ).rejects.toThrow();
  });

  it('actor_user_id is NOT a people.id (uuid) — wrong table guard (T-07-01)', async () => {
    const { tenants } = await import('@/db/schema/tenants');
    const { people } = await import('@/db/schema/people');
    const { officeActivityLog } = await import('@/db/schema/office-activity-log');

    const tenantId = '00000000-0000-0000-0000-000000000001';
    await db.insert(tenants).values({ id: tenantId, name: 'Test Tenant' }).onConflictDoNothing();

    // Insert a person (uuid PK, NOT in the users table)
    const [person] = await db.insert(people).values({
      tenantId,
      telegramUserId: BigInt('111222333'),
      displayName: 'Field Worker',
    }).returning();

    // person.id is a UUID that exists in people table, NOT in users table
    // → FK violation because office_activity_log.actor_user_id references users.id
    await expect(
      db.insert(officeActivityLog).values({
        tenantId,
        actorUserId: person.id,   // This is people.id, not users.id — should fail FK
        actionType: 'project_created',
        entityType: 'project',
      })
    ).rejects.toThrow();
  });
});
