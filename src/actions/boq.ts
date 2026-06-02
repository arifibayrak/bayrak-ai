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
import { ALLOWED_CURRENCIES, type AllowedCurrency } from '@/lib/currencies';
import Decimal from 'decimal.js';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { boqItems } from '@/db/schema/boq-items';
import { projects } from '@/db/schema/projects';
import { auth } from '@/lib/auth';
import { assertCanWrite } from '@/lib/rbac';
import { getDefaultTenantId } from '@/lib/tenant';
import { parseBoqExcel, type BoqRow } from '@/lib/excel';
import { logOfficeActivity } from '@/lib/log-office-activity';

// ── plannedQty validation ──────────────────────────────────────────────────
//
// IN-02: the client (BoqItemDialog) now sends plannedQty as the trimmed string
// the user typed — it no longer round-trips through parseFloat, which stripped
// trailing zeros ("1500.000" → "1500") and risked silent truncation on
// higher-precision columns. The server is the single validation/parse authority:
// it validates with decimal.js (NOT parseFloat — keeps the "no parseFloat on
// numeric strings" rule) and returns the canonical numeric string to insert
// into the numeric(12,3) column. A number is still accepted for backward
// compatibility with existing callers/tests.
//
// Returns the normalized numeric string, or null when the value is not a
// positive finite number.
function normalizePositiveQty(value: string | number): string | null {
  let dec: Decimal;
  try {
    dec = new Decimal(typeof value === 'string' ? value.trim() : value);
  } catch {
    return null;
  }
  if (!dec.isFinite() || dec.lte(0)) return null;
  return dec.toString();
}

// ── Currency allow-list ───────────────────────────────────────────────────────
//
// CR-05: the set of currency codes the server will accept on a BOQ item.
// Server Actions are directly callable via fetch/curl, so the client-side
// dropdown is NOT a sufficient guard — every write path must validate against
// this list before touching the DB. Exported so other server code (and tests)
// can share the canonical set.
// Canonical currency list + type live in `src/lib/currencies.ts` (this file
// carries `'use server'`, which forbids non-async exports — including const
// arrays). Imported here for in-file use; other callers import from
// `@/lib/currencies` directly.

// ── Manual CRUD ───────────────────────────────────────────────────────────────

/**
 * addBoqItem — manually add a single BOQ line item.
 * Auth-guarded, tenant-scoped. sort_order set to current max+1 or 0.
 */
export async function addBoqItem(params: {
  projectId: string;
  material: string;
  unit: string;
  plannedQty: string | number;
}) {
  await assertCanWrite(); // RBAC: audit_engineer is read-only
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const { projectId, material, unit, plannedQty } = params;

  // CR-01: verify the project belongs to the active tenant BEFORE any write.
  // projectId is caller-supplied; the boq_items.project_id FK only checks row
  // existence, not tenant ownership — so without this guard a caller could insert
  // BOQ items into another tenant's project by guessing a valid UUID (IDOR).
  // Mirrors the ownership check in uploadRoute (routes.ts:39-44).
  const owned = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId())))
    .limit(1);
  if (!owned.length) {
    return { ok: false as const, error: 'Project not found' };
  }

  if (!material.trim()) {
    return { ok: false as const, error: 'Material is required' };
  }
  if (!unit.trim()) {
    return { ok: false as const, error: 'Unit is required' };
  }
  // IN-02: validate via decimal.js; keep the canonical string for the insert.
  const normalizedQty = normalizePositiveQty(plannedQty);
  if (normalizedQty === null) {
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
      plannedQty: normalizedQty,
      sortOrder,
    })
    .returning({ id: boqItems.id });

  // CR-04: never pass an empty string actorUserId — '' is not NULL and fails the
  // FK to users.id, silently dropping the log row inside after()'s catch{}.
  // The session guard above guarantees a session; skip the log only if the user
  // ID is genuinely absent (keeps the primary mutation non-fatal).
  if (session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'boq_item_created',
      entityType: 'boq_item',
      entityId: inserted.id,
      projectId,
      metadata: { material, unit, plannedQty: normalizedQty },
    });
  }

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
    plannedQty?: string | number;
  }
) {
  await assertCanWrite(); // RBAC: audit_engineer is read-only
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
    // IN-02: validate via decimal.js (NOT parseFloat); keep the canonical string.
    const normalizedQty = normalizePositiveQty(params.plannedQty);
    if (normalizedQty === null) {
      return { ok: false as const, error: 'Planned quantity must be a positive number' };
    }
    updates.plannedQty = normalizedQty;
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

  if (row) {
    if (session.user?.id) {
      logOfficeActivity({
        actorUserId: session.user.id,
        actionType: 'boq_item_updated',
        entityType: 'boq_item',
        entityId: id,
        projectId: row.projectId,
        metadata: params,
      });
    }
    revalidatePath(`/dashboard/projects/${row.projectId}`);
  }
  return { ok: true as const };
}

/**
 * deleteBoqItem — delete a BOQ line item by ID.
 * Auth-guarded. WR-06: tenant-scoped WHERE clause prevents cross-tenant deletes.
 */
export async function deleteBoqItem(id: string) {
  await assertCanWrite(); // RBAC: audit_engineer is read-only
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

  if (row) {
    if (session.user?.id) {
      logOfficeActivity({
        actorUserId: session.user.id,
        actionType: 'boq_item_deleted',
        entityType: 'boq_item',
        entityId: id,
        projectId: row.projectId,
        metadata: {},
      });
    }
    revalidatePath(`/dashboard/projects/${row.projectId}`);
  }
  return { ok: true as const };
}

/**
 * setUnitPrice — set or clear the unit price + currency for a BOQ line item.
 * Auth-guarded. Tenant-scoped (T-07-09 mitigation).
 * Validates non-negative numeric (T-07-10 mitigation).
 * Logs 'unit_price_set' to office_activity_log after a successful write.
 */
export async function setUnitPrice(params: {
  boqItemId: string;
  unitPrice: string | null;
  currencyCode: string;
}) {
  await assertCanWrite(); // RBAC: audit_engineer is read-only
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // CR-05: validate the currency code against the server-side allow-list BEFORE
  // any DB write. Server Actions are directly callable, so an attacker/malformed
  // client could otherwise persist arbitrary text into currency_code, poisoning
  // the financial schema and breaking downstream Intl.NumberFormat formatting.
  if (!ALLOWED_CURRENCIES.includes(params.currencyCode as AllowedCurrency)) {
    // IN-01: do NOT echo the raw caller-supplied currency string back in the
    // error — a crafted value (newlines, log-format control chars, JSON
    // metacharacters) could pollute a structured log aggregator or a client
    // error boundary. Emit a generic message listing the allowed codes instead.
    throw new Error(`Invalid currency code. Allowed: ${ALLOWED_CURRENCIES.join(', ')}`);
  }

  // T-07-10 (+iter3 review): validate with decimal.js (NOT parseFloat — keeps the
  // "no parseFloat on numeric strings" rule) AND bound to the numeric(15,4) column
  // range. parseFloat let "1e308" pass (Infinity >= 0) and surface later as an
  // unhandled Postgres numeric overflow; decimal.js parses it as finite, so we also
  // reject magnitudes the column cannot store (numeric(15,4) → max 11 integer digits
  // → must stay below 1e11). 0 remains allowed.
  if (params.unitPrice !== null) {
    let price: Decimal;
    try {
      price = new Decimal(params.unitPrice.trim());
    } catch {
      return { ok: false as const, error: 'Unit price must be a non-negative number' };
    }
    if (!price.isFinite() || price.isNegative() || price.gte('1e11')) {
      return { ok: false as const, error: 'Unit price must be a non-negative number within range' };
    }
  }

  // Fetch old price + projectId (tenant-scoped, before update so we have old value for log)
  const [old] = await db
    .select({ unitPrice: boqItems.unitPrice, projectId: boqItems.projectId })
    .from(boqItems)
    .where(and(eq(boqItems.id, params.boqItemId), eq(boqItems.tenantId, getDefaultTenantId())))
    .limit(1);

  if (!old) {
    return { ok: false as const, error: 'BOQ item not found' };
  }

  // T-07-09: tenant-scoped WHERE prevents cross-tenant writes
  await db
    .update(boqItems)
    .set({ unitPrice: params.unitPrice, currencyCode: params.currencyCode })
    .where(and(eq(boqItems.id, params.boqItemId), eq(boqItems.tenantId, getDefaultTenantId())));

  if (session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'unit_price_set',
      entityType: 'boq_item',
      entityId: params.boqItemId,
      projectId: old.projectId,
      metadata: { oldPrice: old.unitPrice, newPrice: params.unitPrice, currencyCode: params.currencyCode },
    });
  }

  revalidatePath(`/dashboard/projects/${old.projectId}`);
  return { ok: true as const };
}

/**
 * getBoqItems — fetch all BOQ items for a project, ordered by sort_order.
 * Auth-guarded.
 */
export async function getBoqItems(projectId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // WR-01: tenant-scope the read — projectId comes from the client, so without
  // the tenant filter a caller could read another tenant's BOQ by guessing a UUID.
  return db
    .select()
    .from(boqItems)
    .where(and(eq(boqItems.projectId, projectId), eq(boqItems.tenantId, getDefaultTenantId())))
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
  await assertCanWrite(); // RBAC: audit_engineer is read-only
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  if (rows.length === 0) {
    return { ok: false as const, error: 'No rows to import' };
  }

  // CR-01: verify the project belongs to the active tenant BEFORE any write.
  // projectId is caller-supplied; without this guard a caller could bulk-insert
  // imported BOQ rows into another tenant's project (IDOR). Mirrors uploadRoute
  // (routes.ts:39-44) and the same guard in addBoqItem above.
  const owned = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId())))
    .limit(1);
  if (!owned.length) {
    return { ok: false as const, error: 'Project not found' };
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

  if (session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'boq_imported',
      entityType: 'project',
      projectId,
      metadata: { rowCount: rows.length },
    });
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true as const, count: rows.length };
}
