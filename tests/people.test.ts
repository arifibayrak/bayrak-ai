/**
 * tests/people.test.ts
 *
 * Integration tests for people approval/rejection/manual-add/assignment-removal Server Actions.
 * All DB tests are gated behind describeIfDb.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';

// ─── next/cache mock (revalidatePath throws outside Next.js rendering context) ─

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// ─── next/server mock (after() throws outside request scope) ─────────────────
// logOfficeActivity is now wired into people.ts mutations.

vi.mock('next/server', () => ({
  after: vi.fn((fn) => Promise.resolve(fn())),
}));

// ─── auth() mock ───────────────────────────────────────────────────────────────

let mockSession: { user: { id: string; email: string } } | null = { user: { id: 'test-user-id', email: 'test@example.com' } };

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => mockSession),
}));

// ─── Lazy import of actions ───────────────────────────────────────────────────

async function getPeopleActions() {
  return await import('@/actions/people');
}

async function getProjectActions() {
  return await import('@/actions/projects');
}

// ─── Pure guard tests (no DB needed) ─────────────────────────────────────────

describe('people actions - unauthorized guard', () => {
  it('approvePending throws Unauthorized when session is null', async () => {
    mockSession = null;
    const { approvePending } = await getPeopleActions();
    await expect(
      approvePending('00000000-0000-0000-0000-000000000099', {
        displayName: 'Ali',
        role: 'worker',
        projectId: '00000000-0000-0000-0000-000000000099',
      })
    ).rejects.toThrow('Unauthorized');
    mockSession = { user: { id: 'test-user-id', email: 'test@example.com' } };
  });

  it('rejectPending throws Unauthorized when session is null', async () => {
    mockSession = null;
    const { rejectPending } = await getPeopleActions();
    await expect(rejectPending('00000000-0000-0000-0000-000000000099')).rejects.toThrow('Unauthorized');
    mockSession = { user: { id: 'test-user-id', email: 'test@example.com' } };
  });

  it('addManualPerson throws Unauthorized when session is null', async () => {
    mockSession = null;
    const { addManualPerson } = await getPeopleActions();
    await expect(
      addManualPerson({
        displayName: 'Mehmet',
        role: 'auditor',
        telegramUserId: 99999,
        projectId: '00000000-0000-0000-0000-000000000099',
      })
    ).rejects.toThrow('Unauthorized');
    mockSession = { user: { id: 'test-user-id', email: 'test@example.com' } };
  });

  it('removeAssignment throws Unauthorized when session is null', async () => {
    mockSession = null;
    const { removeAssignment } = await getPeopleActions();
    await expect(removeAssignment('00000000-0000-0000-0000-000000000099')).rejects.toThrow('Unauthorized');
    mockSession = { user: { id: 'test-user-id', email: 'test@example.com' } };
  });
});

// ─── DB integration tests ────────────────────────────────────────────────────

describeIfDb('People approval workflow (DB integration)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;
  let testProjectId: string;

  beforeEach(async () => {
    mockSession = { user: { id: 'test-user-id', email: 'test@example.com' } };
    db = await getTestDb();
    await truncateAllTables(db);

    // Seed tenant
    const { sql } = await import('drizzle-orm');
    await db.execute(
      sql.raw(`INSERT INTO tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Default') ON CONFLICT DO NOTHING`)
    );

    // Create a test project
    const { createProject } = await getProjectActions();
    const project = await createProject({ name: 'Test Project', description: '' });
    testProjectId = project.id;
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('approvePending: seeds pending row → promotes to people + assignment + removes pending', async () => {
    // Seed a pending_people row directly
    const { sql } = await import('drizzle-orm');
    const pendingResult = await db.execute(
      sql.raw(`
        INSERT INTO pending_people (id, tenant_id, telegram_user_id, telegram_name)
        VALUES ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 111111, 'testuser')
        RETURNING id
      `)
    );
    const pendingId = (pendingResult.rows as Array<{ id: string }>)[0].id;

    const { approvePending } = await getPeopleActions();
    await approvePending(pendingId, {
      displayName: 'Ali Yılmaz',
      role: 'worker',
      projectId: testProjectId,
    });

    // Pending row must be gone
    const pendingRows = await db.execute(
      sql.raw(`SELECT id FROM pending_people WHERE id = '${pendingId}'`)
    );
    expect((pendingRows.rows as unknown[]).length).toBe(0);

    // People row must exist
    const peopleRows = await db.execute(
      sql.raw(`SELECT id, display_name, telegram_user_id FROM people WHERE telegram_user_id = 111111`)
    );
    expect((peopleRows.rows as unknown[]).length).toBe(1);
    const person = (peopleRows.rows as Array<{ id: string; display_name: string }>)[0];
    expect(person.display_name).toBe('Ali Yılmaz');

    // Assignment must exist
    const assignRows = await db.execute(
      sql.raw(`SELECT id, role_on_project FROM assignments WHERE person_id = '${person.id}'`)
    );
    expect((assignRows.rows as unknown[]).length).toBe(1);
    expect((assignRows.rows as Array<{ role_on_project: string }>)[0].role_on_project).toBe('worker');
  });

  it('rejectPending: removes the pending row without creating people/assignments', async () => {
    const { sql } = await import('drizzle-orm');
    const pendingResult = await db.execute(
      sql.raw(`
        INSERT INTO pending_people (id, tenant_id, telegram_user_id, telegram_name)
        VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 222222, 'rejectme')
        RETURNING id
      `)
    );
    const pendingId = (pendingResult.rows as Array<{ id: string }>)[0].id;

    const { rejectPending } = await getPeopleActions();
    await rejectPending(pendingId);

    const { sql: sql2 } = await import('drizzle-orm');
    const pendingRows = await db.execute(
      sql2.raw(`SELECT id FROM pending_people WHERE id = '${pendingId}'`)
    );
    expect((pendingRows.rows as unknown[]).length).toBe(0);

    const peopleRows = await db.execute(
      sql2.raw(`SELECT id FROM people WHERE telegram_user_id = 222222`)
    );
    expect((peopleRows.rows as unknown[]).length).toBe(0);
  });

  it('D-03: same person can be worker on P1 and auditor on P2 — two assignment rows', async () => {
    // Create a second project
    const { createProject } = await getProjectActions();
    const project2 = await createProject({ name: 'Second Project', description: '' });

    // Seed pending person
    const { sql } = await import('drizzle-orm');
    await db.execute(
      sql.raw(`
        INSERT INTO pending_people (id, tenant_id, telegram_user_id, telegram_name)
        VALUES ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 333333, 'dualrole')
      `)
    );

    // Approve as worker on project 1
    const { approvePending } = await getPeopleActions();
    await approvePending('00000000-0000-0000-0000-000000000020', {
      displayName: 'Dual Role Person',
      role: 'worker',
      projectId: testProjectId,
    });

    // Now assign same person as auditor on project 2 via addManualPerson
    // (using the same telegram_user_id — this is the D-03 edge case)
    const peopleRows = await db.execute(
      sql.raw(`SELECT id FROM people WHERE telegram_user_id = 333333`)
    );
    const personId = (peopleRows.rows as Array<{ id: string }>)[0].id;

    // Insert second assignment directly to simulate D-03
    await db.execute(
      sql.raw(`
        INSERT INTO assignments (tenant_id, person_id, project_id, role_on_project)
        VALUES ('00000000-0000-0000-0000-000000000001', '${personId}', '${project2.id}', 'auditor')
      `)
    );

    const assignRows = await db.execute(
      sql.raw(`SELECT id, role_on_project, project_id FROM assignments WHERE person_id = '${personId}' ORDER BY role_on_project`)
    );
    expect((assignRows.rows as unknown[]).length).toBe(2);
    const roles = (assignRows.rows as Array<{ role_on_project: string }>).map(r => r.role_on_project);
    expect(roles).toContain('worker');
    expect(roles).toContain('auditor');
  });

  it('addManualPerson creates person + assignment directly', async () => {
    const { addManualPerson } = await getPeopleActions();
    await addManualPerson({
      displayName: 'Manuel Kişi',
      role: 'auditor',
      telegramUserId: 444444,
      projectId: testProjectId,
    });

    const { sql } = await import('drizzle-orm');
    const peopleRows = await db.execute(
      sql.raw(`SELECT id, display_name FROM people WHERE telegram_user_id = 444444`)
    );
    expect((peopleRows.rows as unknown[]).length).toBe(1);
    const person = (peopleRows.rows as Array<{ id: string; display_name: string }>)[0];
    expect(person.display_name).toBe('Manuel Kişi');

    const assignRows = await db.execute(
      sql.raw(`SELECT role_on_project FROM assignments WHERE person_id = '${person.id}'`)
    );
    expect((assignRows.rows as unknown[]).length).toBe(1);
    expect((assignRows.rows as Array<{ role_on_project: string }>)[0].role_on_project).toBe('auditor');
  });

  it('removeAssignment deletes the assignment row', async () => {
    const { addManualPerson, removeAssignment } = await getPeopleActions();
    await addManualPerson({
      displayName: 'Temp Person',
      role: 'worker',
      telegramUserId: 555555,
      projectId: testProjectId,
    });

    const { sql } = await import('drizzle-orm');
    const peopleRows = await db.execute(
      sql.raw(`SELECT id FROM people WHERE telegram_user_id = 555555`)
    );
    const personId = (peopleRows.rows as Array<{ id: string }>)[0].id;

    const assignRows = await db.execute(
      sql.raw(`SELECT id FROM assignments WHERE person_id = '${personId}'`)
    );
    const assignmentId = (assignRows.rows as Array<{ id: string }>)[0].id;

    await removeAssignment(assignmentId);

    const afterRows = await db.execute(
      sql.raw(`SELECT id FROM assignments WHERE id = '${assignmentId}'`)
    );
    expect((afterRows.rows as unknown[]).length).toBe(0);
  });
});
