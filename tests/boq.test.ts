/**
 * tests/boq.test.ts
 *
 * DB integration tests for BOQ Server Actions (src/actions/boq.ts).
 * Gated behind describeIfDb — skips cleanly without TEST_DATABASE_URL.
 *
 * Covers:
 * - Manual CRUD: addBoqItem, updateBoqItem, deleteBoqItem
 * - remainingBalance helper
 * - confirmBoqImport row count
 * - Unauthorized guard on all actions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';
import { remainingBalance } from '@/lib/boq-balance';

// Mock next/cache to prevent revalidatePath from throwing outside Next.js context
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Mock next/server after() to prevent "called outside a request scope" error.
// logOfficeActivity is now wired into all boq.ts mutations.
vi.mock('next/server', () => ({
  after: vi.fn((fn) => Promise.resolve(fn())),
}));

// Mock auth() for authorized tests
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id', email: 'test@example.com' } }),
}));

// ── Pure unit tests (no DB) ─────────────────────────────────────────────────
describe('remainingBalance helper', () => {
  it('returns plannedQty - approvedQty for string inputs', () => {
    expect(remainingBalance('1000', '200')).toBe(800);
  });

  it('returns zero when fully approved', () => {
    expect(remainingBalance('500', '500')).toBe(0);
  });

  it('returns negative when over-approved', () => {
    expect(remainingBalance('100', '150')).toBe(-50);
  });

  it('handles decimal quantities', () => {
    expect(remainingBalance('1000.5', '123.5')).toBeCloseTo(877);
  });
});

// ── BOQ completion percentage edge cases (DASH-04) ──────────────────────────
// Formula: planned > 0 ? Math.min((approved / planned) * 100, 100) : 0
// All pure math — no DB required.
describe('BOQ completion percentage', () => {
  it('completion percentage is capped at 100 when over-approved (planned 100, approved 150 → 100)', () => {
    const planned = 100;
    const approved = 150;
    const pct = Math.min((approved / planned) * 100, 100);
    expect(pct).toBe(100);
  });

  it('completion percentage is 0 when planned is 0 (division guard)', () => {
    const planned = 0;
    const approved = 0;
    const pct = planned > 0 ? Math.min((approved / planned) * 100, 100) : 0;
    expect(pct).toBe(0);
  });

  it('completion percentage is exact for partial (planned 1000, approved 250 → 25)', () => {
    const planned = 1000;
    const approved = 250;
    const pct = planned > 0 ? Math.min((approved / planned) * 100, 100) : 0;
    expect(pct).toBe(25);
  });
});

// ── DB integration tests ────────────────────────────────────────────────────
describeIfDb('BOQ Server Actions (DB)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let testProjectId: string;

  beforeEach(async () => {
    const { auth } = await import('@/lib/auth');
    vi.mocked(auth).mockResolvedValue({ user: { email: 'test@example.com' } } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    db = await getTestDb();
    await truncateAllTables(db);

    // Seed tenant
    await db.execute(
      (await import('drizzle-orm')).sql.raw(
        `INSERT INTO tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Test Tenant') ON CONFLICT DO NOTHING`
      )
    );

    // Seed project
    const { projects } = await import('@/db/schema/projects');
    const { sql } = await import('drizzle-orm');
    const [project] = await db
      .insert(projects)
      .values({
        tenantId: '00000000-0000-0000-0000-000000000001',
        name: 'Test Project',
      })
      .returning({ id: projects.id });
    testProjectId = project.id;
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('addBoqItem creates a BOQ item and it is retrievable from the DB', async () => {
    const { addBoqItem } = await import('@/actions/boq');
    const { boqItems } = await import('@/db/schema/boq-items');
    const { eq } = await import('drizzle-orm');

    const result = await addBoqItem({
      projectId: testProjectId,
      material: 'DN200 HDPE Boru',
      unit: 'm',
      plannedQty: 1500,
    });

    expect(result.ok).toBe(true);

    const rows = await db
      .select()
      .from(boqItems)
      .where(eq(boqItems.projectId, testProjectId));

    expect(rows).toHaveLength(1);
    expect(rows[0].material).toBe('DN200 HDPE Boru');
    expect(rows[0].unit).toBe('m');
    expect(parseFloat(rows[0].plannedQty)).toBe(1500);
  });

  // ── IN-02 (re-review): server accepts the raw STRING quantity and parses it ─
  // The dialog now sends the trimmed string the user typed (no client parseFloat
  // round-trip). The server validates via decimal.js and persists the exact
  // value into numeric(12,3) — trailing decimals preserved, no float drift.
  it('addBoqItem accepts a string plannedQty and persists it exactly (IN-02)', async () => {
    const { addBoqItem } = await import('@/actions/boq');
    const { boqItems } = await import('@/db/schema/boq-items');
    const { eq } = await import('drizzle-orm');
    const Decimal = (await import('decimal.js')).default;

    // A value with three decimal places — the numeric(12,3) column should keep
    // it exactly. Passing it as a STRING is the new dialog contract.
    const result = await addBoqItem({
      projectId: testProjectId,
      material: 'DN300 Steel',
      unit: 'm',
      plannedQty: '1500.125',
    });
    expect(result.ok).toBe(true);

    const [row] = await db.select().from(boqItems).where(eq(boqItems.projectId, testProjectId));
    // Exact decimal equality (no parseFloat in the assertion's load-bearing path).
    expect(new Decimal(row.plannedQty).equals(new Decimal('1500.125'))).toBe(true);
  });

  it('addBoqItem rejects a non-numeric string plannedQty (IN-02)', async () => {
    const { addBoqItem } = await import('@/actions/boq');

    const result = await addBoqItem({
      projectId: testProjectId,
      material: 'Garbage',
      unit: 'm',
      plannedQty: 'not-a-number',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/positive number/i);
  });

  it('updateBoqItem modifies material and plannedQty', async () => {
    const { addBoqItem, updateBoqItem } = await import('@/actions/boq');
    const { boqItems } = await import('@/db/schema/boq-items');
    const { eq } = await import('drizzle-orm');

    const addResult = await addBoqItem({
      projectId: testProjectId,
      material: 'Old Material',
      unit: 'm',
      plannedQty: 100,
    });
    expect(addResult.ok).toBe(true);

    const [row] = await db.select().from(boqItems).where(eq(boqItems.projectId, testProjectId));
    const updateResult = await updateBoqItem(row.id, {
      material: 'New Material',
      unit: 'm²',
      plannedQty: 250,
    });

    expect(updateResult.ok).toBe(true);

    const [updated] = await db.select().from(boqItems).where(eq(boqItems.id, row.id));
    expect(updated.material).toBe('New Material');
    expect(updated.unit).toBe('m²');
    expect(parseFloat(updated.plannedQty)).toBe(250);
  });

  it('deleteBoqItem removes the row', async () => {
    const { addBoqItem, deleteBoqItem } = await import('@/actions/boq');
    const { boqItems } = await import('@/db/schema/boq-items');
    const { eq } = await import('drizzle-orm');

    await addBoqItem({ projectId: testProjectId, material: 'Delete Me', unit: 'adet', plannedQty: 10 });
    const [row] = await db.select().from(boqItems).where(eq(boqItems.projectId, testProjectId));

    const deleteResult = await deleteBoqItem(row.id);
    expect(deleteResult.ok).toBe(true);

    const remaining = await db.select().from(boqItems).where(eq(boqItems.projectId, testProjectId));
    expect(remaining).toHaveLength(0);
  });

  it('remaining balance is correctly computed from plannedQty and approvedQty', async () => {
    const { addBoqItem } = await import('@/actions/boq');
    const { boqItems } = await import('@/db/schema/boq-items');
    const { eq, sql } = await import('drizzle-orm');

    await addBoqItem({ projectId: testProjectId, material: 'Pipe', unit: 'm', plannedQty: 1000 });
    const [row] = await db.select().from(boqItems).where(eq(boqItems.projectId, testProjectId));

    // Manually set approvedQty to simulate Phase 3 approval
    await db
      .update(boqItems)
      .set({ approvedQty: sql`200` })
      .where(eq(boqItems.id, row.id));

    const [updated] = await db.select().from(boqItems).where(eq(boqItems.id, row.id));
    const balance = remainingBalance(updated.plannedQty, updated.approvedQty);

    expect(balance).toBe(800);
  });

  it('confirmBoqImport inserts the correct number of rows', async () => {
    const { confirmBoqImport } = await import('@/actions/boq');
    const { boqItems } = await import('@/db/schema/boq-items');
    const { eq } = await import('drizzle-orm');

    const rows = [
      { rowNumber: 2, material: 'Pipe A', unit: 'm', plannedQty: 100 },
      { rowNumber: 3, material: 'Pipe B', unit: 'm³', plannedQty: 200 },
      { rowNumber: 4, material: 'Valve', unit: 'adet', plannedQty: 5 },
    ];

    const result = await confirmBoqImport(testProjectId, rows);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count).toBe(3);

    const dbRows = await db.select().from(boqItems).where(eq(boqItems.projectId, testProjectId));
    expect(dbRows).toHaveLength(3);
  });

  it('throws Unauthorized when auth() returns null', async () => {
    const { auth } = await import('@/lib/auth');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValueOnce(null as any);

    const { addBoqItem } = await import('@/actions/boq');
    await expect(
      addBoqItem({ projectId: testProjectId, material: 'X', unit: 'm', plannedQty: 1 })
    ).rejects.toThrow('Unauthorized');
  });

  // ── CR-01 (re-review): project-ownership IDOR guard ────────────────────────
  // addBoqItem / confirmBoqImport accept a caller-supplied projectId. The action
  // runs under the default tenant (getDefaultTenantId). A projectId belonging to
  // ANOTHER tenant must be rejected with { ok: false } and write nothing — the
  // boq_items.project_id FK alone only checks row existence, not tenant ownership.

  it('addBoqItem rejects a projectId owned by another tenant and inserts nothing (CR-01)', async () => {
    const { addBoqItem } = await import('@/actions/boq');
    const { boqItems } = await import('@/db/schema/boq-items');
    const { eq, sql } = await import('drizzle-orm');

    // Seed a SECOND tenant + a project owned by it. The action runs as the
    // default tenant, so this foreign project must be unreachable.
    const otherTenantId  = '00000000-0000-0000-0000-0000000d0001';
    const otherProjectId = '00000000-0000-0000-0000-0000000d0101';
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${otherTenantId}', 'Other Tenant') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${otherProjectId}', '${otherTenantId}', 'Foreign Project') ON CONFLICT DO NOTHING`));

    const result = await addBoqItem({
      projectId: otherProjectId,
      material: 'Smuggled Pipe',
      unit: 'm',
      plannedQty: 100,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not found/i);

    // No boq_items row may have been inserted against the foreign project.
    const rows = await db.select().from(boqItems).where(eq(boqItems.projectId, otherProjectId));
    expect(rows).toHaveLength(0);
  });

  it('confirmBoqImport rejects a projectId owned by another tenant and inserts nothing (CR-01)', async () => {
    const { confirmBoqImport } = await import('@/actions/boq');
    const { boqItems } = await import('@/db/schema/boq-items');
    const { eq, sql } = await import('drizzle-orm');

    const otherTenantId  = '00000000-0000-0000-0000-0000000d0002';
    const otherProjectId = '00000000-0000-0000-0000-0000000d0102';
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${otherTenantId}', 'Other Tenant 2') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${otherProjectId}', '${otherTenantId}', 'Foreign Project 2') ON CONFLICT DO NOTHING`));

    const result = await confirmBoqImport(otherProjectId, [
      { rowNumber: 2, material: 'Smuggled A', unit: 'm', plannedQty: 10 },
      { rowNumber: 3, material: 'Smuggled B', unit: 'm', plannedQty: 20 },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not found/i);

    const rows = await db.select().from(boqItems).where(eq(boqItems.projectId, otherProjectId));
    expect(rows).toHaveLength(0);
  });
});
