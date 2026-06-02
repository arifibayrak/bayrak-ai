'use server';

import { z } from 'zod';
import { eq, and, count } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { auth } from '@/lib/auth';
import { assertCanWrite } from '@/lib/rbac';
import { getDefaultTenantId } from '@/lib/tenant';
import { projects } from '@/db/schema/projects';
import { boqItems } from '@/db/schema/boq-items';
import { assignments } from '@/db/schema/assignments';
import { logOfficeActivity } from '@/lib/log-office-activity';

// ─── Validation schemas ───────────────────────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required.'),
  description: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required.').optional(),
  description: z.string().optional(),
});

// ─── createProject ─────────────────────────────────────────────────────────────

export async function createProject(input: { name: string; description?: string }) {
  await assertCanWrite(); // RBAC: audit_engineer is read-only
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const parsed = createProjectSchema.parse(input);

  const [project] = await db
    .insert(projects)
    .values({
      name: parsed.name,
      description: parsed.description ?? null,
      tenantId: getDefaultTenantId(),
    })
    .returning();

  // CR-04: skip the log rather than pass an empty-string actorUserId (FK to users.id).
  if (session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'project_created',
      entityType: 'project',
      entityId: project.id,
      metadata: { name: project.name },
    });
  }

  revalidatePath('/dashboard/projects');
  return project;
}

// ─── updateProject ─────────────────────────────────────────────────────────────

export async function updateProject(
  id: string,
  input: { name?: string; description?: string }
) {
  await assertCanWrite(); // RBAC: audit_engineer is read-only
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const parsed = updateProjectSchema.parse(input);

  const updateData: { name?: string; description?: string | null; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (parsed.name !== undefined) updateData.name = parsed.name;
  if (parsed.description !== undefined) updateData.description = parsed.description;

  const [project] = await db
    .update(projects)
    .set(updateData)
    .where(
      and(
        eq(projects.id, id),
        eq(projects.tenantId, getDefaultTenantId())
      )
    )
    .returning();

  // WR-01: only log when the update actually matched a row. A cross-tenant
  // probe (valid UUID, wrong tenant) is a tenant-scoped no-op — emitting a
  // 'project_updated' entry would write a false audit record asserting the
  // action succeeded. Mirrors updateBoqItem's `if (row)` gate.
  if (project && session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'project_updated',
      entityType: 'project',
      entityId: id,
      metadata: { name: parsed.name, description: parsed.description },
    });
  }

  revalidatePath('/dashboard/projects');
  revalidatePath(`/dashboard/projects/${id}`);
  return project ?? null;
}

// ─── deleteProject ─────────────────────────────────────────────────────────────

export async function deleteProject(id: string) {
  await assertCanWrite(); // RBAC: audit_engineer is read-only
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // WR-01: capture the deleted row so the audit log only fires when a row was
  // actually matched. .returning() yields the deleted rows; an empty result
  // means the tenant-scoped DELETE matched nothing (e.g. a cross-tenant probe)
  // and must NOT produce a false 'project_deleted' audit entry. Mirrors
  // deleteBoqItem's `if (row)` gate.
  const [deleted] = await db
    .delete(projects)
    .where(
      and(
        eq(projects.id, id),
        eq(projects.tenantId, getDefaultTenantId())
      )
    )
    .returning({ id: projects.id });

  if (deleted && session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'project_deleted',
      entityType: 'project',
      entityId: id,
      metadata: {},
    });
  }

  revalidatePath('/dashboard/projects');
}

// ─── getProjects ───────────────────────────────────────────────────────────────

export async function getProjects() {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const tenantId = getDefaultTenantId();

  // Fetch projects with BOQ item count and people (assignments) count
  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.tenantId, tenantId))
    .orderBy(projects.createdAt);

  // Get BOQ counts per project
  const boqCounts = await db
    .select({ projectId: boqItems.projectId, count: count() })
    .from(boqItems)
    .where(eq(boqItems.tenantId, tenantId))
    .groupBy(boqItems.projectId);

  // Get assignment (people) counts per project
  const peopleCounts = await db
    .select({ projectId: assignments.projectId, count: count() })
    .from(assignments)
    .where(eq(assignments.tenantId, tenantId))
    .groupBy(assignments.projectId);

  const boqCountMap = new Map(boqCounts.map(r => [r.projectId, Number(r.count)]));
  const peopleCountMap = new Map(peopleCounts.map(r => [r.projectId, Number(r.count)]));

  return projectRows.map(p => ({
    ...p,
    boqCount: boqCountMap.get(p.id) ?? 0,
    peopleCount: peopleCountMap.get(p.id) ?? 0,
  }));
}

// ─── getProject ────────────────────────────────────────────────────────────────

export async function getProject(id: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, id),
        eq(projects.tenantId, getDefaultTenantId())
      )
    )
    .limit(1);

  return project ?? null;
}
