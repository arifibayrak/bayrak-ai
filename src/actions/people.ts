'use server';

import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';
import { people } from '@/db/schema/people';
import { pendingPeople } from '@/db/schema/pending-people';
import { assignments } from '@/db/schema/assignments';
import { logOfficeActivity } from '@/lib/log-office-activity';

// ─── Transaction-capable DB helper ───────────────────────────────────────────
//
// neon-http driver does NOT support transactions. For transactional operations
// (approvePending, addManualPerson) we create a one-shot Pool using the
// neon-serverless WebSocket driver which fully supports db.transaction().
// This is isolated here so the rest of the app (which uses neon-http for reads)
// is unaffected.

async function getTxDb() {
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');

  // In Node.js (non-edge) environments, neon-serverless needs ws
  // Try to require ws if available, fall back gracefully if not
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ws = require('ws') as { default?: unknown } | unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    neonConfig.webSocketConstructor = (ws as any).default ?? ws;
  } catch {
    // ws not available — will use native WebSocket (browser/edge)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  return drizzle(pool);
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const roleSchema = z.enum(['worker', 'auditor'], {
  error: () => ({ message: 'Select a role: Worker or Auditor.' }),
});

const approvePendingSchema = z.object({
  displayName: z.string().min(1, 'Enter a name before approving.'),
  role: roleSchema,
  projectId: z.string().uuid('Invalid project ID.'),
});

const addManualPersonSchema = z.object({
  displayName: z.string().min(1, 'Display name is required.'),
  role: roleSchema,
  telegramUserId: z.number().int().positive('Telegram user ID must be a positive integer.'),
  projectId: z.string().uuid('Invalid project ID.'),
});

// ─── approvePending ────────────────────────────────────────────────────────────
//
// Transactional: insert into people + insert assignment + delete pending row.
// On any failure, the transaction rolls back — no orphaned person without assignment.

export async function approvePending(
  pendingId: string,
  input: { displayName: string; role: 'worker' | 'auditor'; projectId: string }
) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const parsed = approvePendingSchema.parse(input);
  const tenantId = getDefaultTenantId();

  // Fetch the pending row first (need telegramUserId + telegramName)
  const [pendingRow] = await db
    .select()
    .from(pendingPeople)
    .where(
      and(
        eq(pendingPeople.id, pendingId),
        eq(pendingPeople.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!pendingRow) {
    throw new Error('Pending person not found.');
  }

  // Run the promotion as a transaction using the WebSocket-capable driver
  const txDb = await getTxDb();
  let approvedPersonId: string | undefined;
  await txDb.transaction(async (tx) => {
    // 1. Insert into people
    const [person] = await tx
      .insert(people)
      .values({
        tenantId,
        telegramUserId: pendingRow.telegramUserId,
        telegramName: pendingRow.telegramName,
        displayName: parsed.displayName,
      })
      .returning();

    approvedPersonId = person.id;

    // 2. Insert assignment
    await tx.insert(assignments).values({
      tenantId,
      personId: person.id,
      projectId: parsed.projectId,
      roleOnProject: parsed.role,
    });

    // 3. Delete pending row
    await tx.delete(pendingPeople).where(eq(pendingPeople.id, pendingId));
  });

  // CR-04: skip the log rather than pass an empty-string actorUserId (FK to users.id).
  if (session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'person_approved',
      entityType: 'person',
      entityId: approvedPersonId,
      projectId: parsed.projectId,
      metadata: { role: parsed.role, displayName: parsed.displayName },
    });
  }

  revalidatePath('/dashboard/projects');
}

// ─── rejectPending ────────────────────────────────────────────────────────────

export async function rejectPending(pendingId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const tenantId = getDefaultTenantId();

  await db
    .delete(pendingPeople)
    .where(
      and(
        eq(pendingPeople.id, pendingId),
        eq(pendingPeople.tenantId, tenantId)
      )
    );

  revalidatePath('/dashboard/projects');
}

// ─── addManualPerson ──────────────────────────────────────────────────────────

export async function addManualPerson(input: {
  displayName: string;
  role: 'worker' | 'auditor';
  telegramUserId: number;
  projectId: string;
}) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const parsed = addManualPersonSchema.parse(input);
  const tenantId = getDefaultTenantId();

  const txDb2 = await getTxDb();
  let manualPersonId: string | undefined;
  await txDb2.transaction(async (tx) => {
    // Insert person
    const [person] = await tx
      .insert(people)
      .values({
        tenantId,
        telegramUserId: BigInt(parsed.telegramUserId),
        telegramName: null,
        displayName: parsed.displayName,
      })
      .returning();

    manualPersonId = person.id;

    // Insert assignment
    await tx.insert(assignments).values({
      tenantId,
      personId: person.id,
      projectId: parsed.projectId,
      roleOnProject: parsed.role,
    });
  });

  if (session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'person_assigned',
      entityType: 'person',
      entityId: manualPersonId,
      projectId: parsed.projectId,
      metadata: { personId: manualPersonId, role: parsed.role, projectId: parsed.projectId },
    });
  }

  revalidatePath('/dashboard/projects');
}

// ─── removeAssignment ─────────────────────────────────────────────────────────

export async function removeAssignment(assignmentId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const tenantId = getDefaultTenantId();

  // Fetch assignment before delete so we can include entityId + projectId in the log
  const [assignmentRow] = await db
    .select({ personId: assignments.personId, projectId: assignments.projectId })
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.tenantId, tenantId)))
    .limit(1);

  await db
    .delete(assignments)
    .where(
      and(
        eq(assignments.id, assignmentId),
        eq(assignments.tenantId, tenantId)
      )
    );

  if (session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'person_unassigned',
      entityType: 'person',
      entityId: assignmentRow?.personId,
      projectId: assignmentRow?.projectId,
      metadata: { assignmentId },
    });
  }

  revalidatePath('/dashboard/projects');
}

// ─── getPendingPeople ─────────────────────────────────────────────────────────

export async function getPendingPeople() {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  return db
    .select()
    .from(pendingPeople)
    .where(eq(pendingPeople.tenantId, getDefaultTenantId()))
    .orderBy(pendingPeople.startedAt);
}

// ─── getActivePeople ──────────────────────────────────────────────────────────

export async function getActivePeople() {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const tenantId = getDefaultTenantId();

  const rows = await db
    .select({
      personId: people.id,
      displayName: people.displayName,
      telegramUserId: people.telegramUserId,
      telegramName: people.telegramName,
      assignmentId: assignments.id,
      roleOnProject: assignments.roleOnProject,
      projectId: assignments.projectId,
    })
    .from(people)
    .leftJoin(assignments, eq(assignments.personId, people.id))
    .where(eq(people.tenantId, tenantId))
    .orderBy(people.displayName);

  return rows;
}
