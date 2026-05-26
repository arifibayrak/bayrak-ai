/**
 * tests/projects.test.ts
 *
 * Integration tests for project CRUD Server Actions.
 * All DB tests are gated behind describeIfDb — skips cleanly without TEST_DATABASE_URL.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';

// ─── next/cache mock (revalidatePath throws outside Next.js rendering context) ─

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// ─── next/server mock (after() throws outside request scope) ─────────────────
// logOfficeActivity is now wired into projects.ts mutations.

vi.mock('next/server', () => ({
  after: vi.fn((fn) => Promise.resolve(fn())),
}));

// ─── auth() mock — must be defined before the action import ───────────────────

let mockSession: { user: { id: string; email: string } } | null = { user: { id: 'test-user-id', email: 'test@example.com' } };

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => mockSession),
}));

// ─── Lazy import of actions (resolved after mock setup) ───────────────────────

async function getActions() {
  return await import('@/actions/projects');
}

// ─── Pure guard test (no DB needed) ─────────────────────────────────────────

describe('createProject - unauthorized guard', () => {
  it('throws Unauthorized when session is null', async () => {
    mockSession = null;
    const { createProject } = await getActions();
    await expect(createProject({ name: 'Test', description: '' })).rejects.toThrow('Unauthorized');
    mockSession = { user: { id: 'test-user-id', email: 'test@example.com' } }; // reset
  });

  it('throws on empty name', async () => {
    mockSession = { user: { id: 'test-user-id', email: 'test@example.com' } };
    const { createProject } = await getActions();
    await expect(createProject({ name: '', description: '' })).rejects.toThrow();
  });
});

describe('updateProject - unauthorized guard', () => {
  it('throws Unauthorized when session is null', async () => {
    mockSession = null;
    const { updateProject } = await getActions();
    await expect(updateProject('00000000-0000-0000-0000-000000000099', { name: 'X' })).rejects.toThrow('Unauthorized');
    mockSession = { user: { id: 'test-user-id', email: 'test@example.com' } };
  });
});

describe('deleteProject - unauthorized guard', () => {
  it('throws Unauthorized when session is null', async () => {
    mockSession = null;
    const { deleteProject } = await getActions();
    await expect(deleteProject('00000000-0000-0000-0000-000000000099')).rejects.toThrow('Unauthorized');
    mockSession = { user: { id: 'test-user-id', email: 'test@example.com' } };
  });
});

// ─── DB integration tests ────────────────────────────────────────────────────

describeIfDb('Project CRUD lifecycle (DB integration)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    mockSession = { user: { id: 'test-user-id', email: 'test@example.com' } };
    db = await getTestDb();
    await truncateAllTables(db);

    // Re-seed the default tenant (FK requirement)
    const { sql } = await import('drizzle-orm');
    await db.execute(
      sql.raw(`INSERT INTO tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Default') ON CONFLICT DO NOTHING`)
    );
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('createProject inserts a row with the default tenant_id', async () => {
    const { createProject } = await getActions();
    const project = await createProject({ name: 'Pipeline Alpha', description: 'First pipeline' });

    expect(project).toBeDefined();
    expect(project.name).toBe('Pipeline Alpha');
    expect(project.description).toBe('First pipeline');
    expect(project.tenantId).toBe('00000000-0000-0000-0000-000000000001');
    expect(project.id).toBeTruthy();
  });

  it('createProject rejects empty name', async () => {
    const { createProject } = await getActions();
    await expect(createProject({ name: '', description: '' })).rejects.toThrow();
  });

  it('updateProject updates name and description', async () => {
    const { createProject, updateProject } = await getActions();
    const created = await createProject({ name: 'Old Name', description: 'Old desc' });

    const updated = await updateProject(created.id, { name: 'New Name', description: 'New desc' });
    expect(updated.name).toBe('New Name');
    expect(updated.description).toBe('New desc');
  });

  it('deleteProject removes the row', async () => {
    const { createProject, deleteProject, getProjects } = await getActions();
    const created = await createProject({ name: 'To Delete', description: '' });
    await deleteProject(created.id);

    const projects = await getProjects();
    expect(projects.find(p => p.id === created.id)).toBeUndefined();
  });

  it('getProjects returns all projects scoped to tenant', async () => {
    const { createProject, getProjects } = await getActions();
    await createProject({ name: 'Alpha', description: '' });
    await createProject({ name: 'Beta', description: '' });

    const projects = await getProjects();
    expect(projects.length).toBeGreaterThanOrEqual(2);
    const names = projects.map(p => p.name);
    expect(names).toContain('Alpha');
    expect(names).toContain('Beta');
  });

  // ── WR-01 (re-review): no false audit entry on a no-op mutation ────────────
  // A valid-UUID-but-foreign-tenant project is a tenant-scoped UPDATE/DELETE
  // no-op. The audit log must NOT record 'project_updated' / 'project_deleted'
  // for an action that changed nothing. Seed a second tenant's project and aim
  // the (default-tenant) action at it.

  it('updateProject does not log when no row was matched (WR-01)', async () => {
    const { updateProject } = await getActions();
    const { sql } = await import('drizzle-orm');

    const otherTenantId  = '00000000-0000-0000-0000-0000000e0001';
    const otherProjectId = '00000000-0000-0000-0000-0000000e0101';
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${otherTenantId}', 'Other Tenant') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${otherProjectId}', '${otherTenantId}', 'Foreign') ON CONFLICT DO NOTHING`));

    const result = await updateProject(otherProjectId, { name: 'Hijacked' });
    // Tenant-scoped no-op → null return, no row changed.
    expect(result).toBeNull();

    // No audit entry may exist for this foreign project.
    const log = await db.execute(
      sql.raw(`SELECT COUNT(*)::int AS c FROM office_activity_log WHERE entity_id = '${otherProjectId}' AND action_type = 'project_updated'`)
    );
    expect(Number(log.rows[0].c)).toBe(0);

    // And the foreign project name is unchanged (the write was a no-op).
    const proj = await db.execute(sql.raw(`SELECT name FROM projects WHERE id = '${otherProjectId}'`));
    expect(proj.rows[0].name).toBe('Foreign');
  });

  it('deleteProject does not log when no row was matched (WR-01)', async () => {
    const { deleteProject } = await getActions();
    const { sql } = await import('drizzle-orm');

    const otherTenantId  = '00000000-0000-0000-0000-0000000e0002';
    const otherProjectId = '00000000-0000-0000-0000-0000000e0102';
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${otherTenantId}', 'Other Tenant 2') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${otherProjectId}', '${otherTenantId}', 'Foreign 2') ON CONFLICT DO NOTHING`));

    await deleteProject(otherProjectId);

    // No audit entry, and the foreign project still exists (no-op delete).
    const log = await db.execute(
      sql.raw(`SELECT COUNT(*)::int AS c FROM office_activity_log WHERE entity_id = '${otherProjectId}' AND action_type = 'project_deleted'`)
    );
    expect(Number(log.rows[0].c)).toBe(0);

    const proj = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM projects WHERE id = '${otherProjectId}'`));
    expect(Number(proj.rows[0].c)).toBe(1);
  });

  it('updateProject still logs when a row IS matched (WR-01 positive control)', async () => {
    const { createProject, updateProject } = await getActions();
    const { sql } = await import('drizzle-orm');

    // Need a real users row so logOfficeActivity's FK insert succeeds.
    await db.execute(sql.raw(`INSERT INTO users (id, email) VALUES ('test-user-id', 'test@example.com') ON CONFLICT DO NOTHING`));

    const created = await createProject({ name: 'Owned', description: '' });
    const updated = await updateProject(created.id, { name: 'Owned Renamed' });
    expect(updated?.name).toBe('Owned Renamed');

    const log = await db.execute(
      sql.raw(`SELECT COUNT(*)::int AS c FROM office_activity_log WHERE entity_id = '${created.id}' AND action_type = 'project_updated'`)
    );
    expect(Number(log.rows[0].c)).toBeGreaterThanOrEqual(1);
  });
});
