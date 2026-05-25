'use server';

/**
 * src/actions/boq.ts
 *
 * Server Actions for BOQ manual CRUD + Excel import (D-04, D-05, SETUP-02).
 *
 * Threat T-06-02: parseFloat after comma→period normalization + positivity check;
 *   cell values never eval()'d; inserted via Drizzle parameterized values.
 * Threat T-06-04: all actions auth-guarded — throws Unauthorized without session.
 * Threat T-06-05: previewBoqImport rejects non-.xlsx by extension check.
 * Threat T-06-03: 4MB body limit enforced by Next.js framework; surfaced in UI.
 */

import { eq, and, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { boqItems } from '@/db/schema/boq-items';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';
import { parseBoqExcel, type BoqRow } from '@/lib/excel';

// ── Manual CRUD ───────────────────────────────────────────────────────────────

/**
 * addBoqItem — manually add a single BOQ line item.
 * Auth-guarded, tenant-scoped. sort_order set to current max+1 or 0.
 */
export async function addBoqItem(params: {
  projectId: string;
  material: string;
  unit: string;
  plannedQty: number;
}) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const { projectId, material, unit, plannedQty } = params;

  if (!material.trim()) {
    return { ok: false as const, error: 'Material is required' };
  }
  if (!unit.trim()) {
    return { ok: false as const, error: 'Unit is required' };
  }
  if (isNaN(plannedQty) || plannedQty <= 0) {
    return { ok: false as const, error: 'Planned quantity must be a positive number' };
  }

  // Determine next sort_order for this project
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(boqItems)
    .where(eq(boqItems.projectId, projectId));
  const sortOrder = countResult[0]?.count ?? 0;

  const [inserted] = await db
    .insert(boqItems)
    .values({
      projectId,
      tenantId: getDefaultTenantId(),
      material: material.trim(),
      unit: unit.trim(),
      plannedQty: String(plannedQty),
      sortOrder,
    })
    .returning({ id: boqItems.id });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true as const, id: inserted.id };
}

/**
 * updateBoqItem — update material, unit, and/or plannedQty of an existing BOQ item.
 * Auth-guarded. WR-06: tenant-scoped WHERE clause prevents cross-tenant writes
 * even if a UUID leaks through logs or network traces.
 */
export async function updateBoqItem(
  id: string,
  params: {
    material?: string;
    unit?: string;
    plannedQty?: number;
  }
) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const updates: Partial<typeof boqItems.$inferInsert> = {};

  if (params.material !== undefined) {
    if (!params.material.trim()) return { ok: false as const, error: 'Material is required' };
    updates.material = params.material.trim();
  }
  if (params.unit !== undefined) {
    if (!params.unit.trim()) return { ok: false as const, error: 'Unit is required' };
    updates.unit = params.unit.trim();
  }
  if (params.plannedQty !== undefined) {
    if (isNaN(params.plannedQty) || params.plannedQty <= 0) {
      return { ok: false as const, error: 'Planned quantity must be a positive number' };
    }
    updates.plannedQty = String(params.plannedQty);
  }

  if (Object.keys(updates).length === 0) {
    return { ok: true as const }; // no-op
  }

  // WR-06: tenant scope prevents cross-tenant write even if UUID leaks
  await db
    .update(boqItems)
    .set(updates)
    .where(and(eq(boqItems.id, id), eq(boqItems.tenantId, getDefaultTenantId())));

  // Fetch the project ID to revalidate the correct path
  const [row] = await db
    .select({ projectId: boqItems.projectId })
    .from(boqItems)
    .where(and(eq(boqItems.id, id), eq(boqItems.tenantId, getDefaultTenantId())))
    .limit(1);

  if (row) revalidatePath(`/dashboard/projects/${row.projectId}`);
  return { ok: true as const };
}

/**
 * deleteBoqItem — delete a BOQ line item by ID.
 * Auth-guarded. WR-06: tenant-scoped WHERE clause prevents cross-tenant deletes.
 */
export async function deleteBoqItem(id: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // Fetch project ID before delete for revalidation (tenant-scoped)
  const [row] = await db
    .select({ projectId: boqItems.projectId })
    .from(boqItems)
    .where(and(eq(boqItems.id, id), eq(boqItems.tenantId, getDefaultTenantId())))
    .limit(1);

  // WR-06: tenant scope prevents cross-tenant delete even if UUID leaks
  await db
    .delete(boqItems)
    .where(and(eq(boqItems.id, id), eq(boqItems.tenantId, getDefaultTenantId())));

  if (row) revalidatePath(`/dashboard/projects/${row.projectId}`);
  return { ok: true as const };
}

/**
 * getBoqItems — fetch all BOQ items for a project, ordered by sort_order.
 * Auth-guarded.
 */
export async function getBoqItems(projectId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  return db
    .select()
    .from(boqItems)
    .where(eq(boqItems.projectId, projectId))
    .orderBy(boqItems.sortOrder);
}

// ── Excel Import (preview → confirm) ─────────────────────────────────────────

/**
 * previewBoqImport — parse an uploaded .xlsx file and return preview rows.
 *
 * This is the first step of the preview→confirm import flow (D-05).
 * No DB writes happen in this step — rows are returned to the client
 * for display in the preview table.
 *
 * Threat T-06-05: rejects non-.xlsx files by extension (ONLY_XLSX).
 * Pitfall 5: Buffer.from(await file.arrayBuffer()) — avoids stream issues.
 */
export async function previewBoqImport(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const file = formData.get('file') as File | null;

  if (!file) {
    return { ok: false as const, errors: [{ row: 0, field: 'file', message: 'ONLY_XLSX' }] };
  }

  // Reject non-.xlsx files (T-06-05)
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return { ok: false as const, errors: [{ row: 0, field: 'file', message: 'ONLY_XLSX' }] };
  }

  // Pitfall 5: await file.arrayBuffer() then wrap in Buffer (not streaming)
  const buffer = Buffer.from(await file.arrayBuffer());
  return parseBoqExcel(buffer);
}

/**
 * confirmBoqImport — insert the previewed rows into the database.
 *
 * This is the second step of the preview→confirm import flow (D-05).
 * Called after the user reviews the preview table and clicks "Onayla ve İçe Aktar".
 *
 * Rows are inserted with sort_order matching their import row order.
 * Security (T-06-02): values are parameterized through Drizzle — no injection possible.
 */
export async function confirmBoqImport(projectId: string, rows: BoqRow[]) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  if (rows.length === 0) {
    return { ok: false as const, error: 'No rows to import' };
  }

  await db.insert(boqItems).values(
    rows.map((r, i) => ({
      projectId,
      tenantId: getDefaultTenantId(),
      material: r.material,
      unit: r.unit,
      plannedQty: String(r.plannedQty),
      sortOrder: i,
    }))
  );

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true as const, count: rows.length };
}
