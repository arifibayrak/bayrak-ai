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
    mockSession = { user: { email: 'test@example.com' } }; // reset
  });

  it('throws on empty name', async () => {
    mockSession = { user: { email: 'test@example.com' } };
    const { createProject } = await getActions();
    await expect(createProject({ name: '', description: '' })).rejects.toThrow();
  });
});

describe('updateProject - unauthorized guard', () => {
  it('throws Unauthorized when session is null', async () => {
    mockSession = null;
    const { updateProject } = await getActions();
    await expect(updateProject('00000000-0000-0000-0000-000000000099', { name: 'X' })).rejects.toThrow('Unauthorized');
    mockSession = { user: { email: 'test@example.com' } };
  });
});

describe('deleteProject - unauthorized guard', () => {
  it('throws Unauthorized when session is null', async () => {
    mockSession = null;
    const { deleteProject } = await getActions();
    await expect(deleteProject('00000000-0000-0000-0000-000000000099')).rejects.toThrow('Unauthorized');
    mockSession = { user: { email: 'test@example.com' } };
  });
});

// ─── DB integration tests ────────────────────────────────────────────────────

describeIfDb('Project CRUD lifecycle (DB integration)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    mockSession = { user: { email: 'test@example.com' } };
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
});
