'use server';

/**
 * src/actions/submissions.ts
 *
 * Server Actions for reading submission data (Phase 5 data layer).
 *
 * Exports:
 *   - getRouteGeoJSON  — route geometry as GeoJSON LineString (DASH-01)
 *   - getApprovedPoints — FeatureCollection of approved+snapped submissions (DASH-02)
 *   - getBoqLegend     — stable palette-slot map for BOQ items
 *   - getSubmissions   — paginated, filtered submission list (DASH-03)
 *
 * Security (T-05-AC): auth() guard on every exported function.
 * Security (T-05-IV): status whitelist + clamped integer coercion.
 * Security (T-05-GEO): ST_AsGeoJSON applied via parameterized sql`` on column ref only.
 *
 * Serialization: all Date values are converted to ISO strings before return
 * (RSC→client serializability, RESEARCH Pitfall 5).
 */

import { sql, eq, and, isNotNull, desc } from 'drizzle-orm';
import { db } from '@/db';
import { submissions } from '@/db/schema/submissions';
import { boqItems } from '@/db/schema/boq-items';
import { routes } from '@/db/schema/routes';
import { people } from '@/db/schema/people';
import { auth } from '@/lib/auth';

// ── Whitelist for status filter (T-05-IV / V5) ───────────────────────────────
const VALID_STATUSES = ['pending_audit', 'approved', 'rejected'] as const;
type ValidStatus = typeof VALID_STATUSES[number];

// ── getRouteGeoJSON ───────────────────────────────────────────────────────────

/**
 * getRouteGeoJSON — fetch the project's pipeline route as a GeoJSON LineString.
 *
 * Returns null when no route exists for the project.
 * ST_AsGeoJSON is MANDATORY — routes.geom custom type fromDriver returns raw WKB string.
 * DASH-01: coordinates are [longitude, latitude] per GeoJSON spec (lng first, D-48).
 */
export async function getRouteGeoJSON(projectId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const result = await db
    .select({
      id: routes.id,
      coordinateCount: routes.coordinateCount,
      uploadedAt: routes.uploadedAt,
      geomJson: sql<string>`ST_AsGeoJSON(${routes.geom})`,
    })
    .from(routes)
    .where(eq(routes.projectId, projectId))
    .limit(1);

  if (!result[0]) return null;

  const { geomJson, uploadedAt, ...rest } = result[0];
  return {
    ...rest,
    uploadedAt: uploadedAt.toISOString(),
    geojson: JSON.parse(geomJson) as { type: 'LineString'; coordinates: [number, number][] },
  };
}

// ── getBoqLegend ──────────────────────────────────────────────────────────────

/**
 * getBoqLegend — returns BOQ items with stable palette slot assignments.
 *
 * Palette is built from BOQ item sort_order (stable, D-58 / RESEARCH Pitfall 6).
 * The same paletteSlot map is used in getApprovedPoints so the legend and map
 * markers always agree.
 */
export async function getBoqLegend(projectId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const ordered = await db
    .select({ id: boqItems.id, material: boqItems.material, sortOrder: boqItems.sortOrder })
    .from(boqItems)
    .where(eq(boqItems.projectId, projectId))
    .orderBy(boqItems.sortOrder);

  return ordered.map((item, idx) => ({
    id: item.id,
    material: item.material,
    paletteSlot: idx % 6,
  }));
}

// ── Internal: buildPaletteSlotMap ─────────────────────────────────────────────

async function buildPaletteSlotMap(projectId: string): Promise<Map<string, number>> {
  const ordered = await db
    .select({ id: boqItems.id })
    .from(boqItems)
    .where(eq(boqItems.projectId, projectId))
    .orderBy(boqItems.sortOrder);

  return new Map(ordered.map((item, idx) => [item.id, idx % 6]));
}

// ── getApprovedPoints ─────────────────────────────────────────────────────────

/**
 * getApprovedPoints — returns a GeoJSON FeatureCollection of approved submissions.
 *
 * Filters: status = 'approved' AND snapped_point IS NOT NULL (D-46).
 * An approved row with no snapped_point (no_route case) does NOT appear.
 * Each feature carries serializable properties — no Date or numeric-string leaks.
 *
 * DASH-02, T-05-AC, T-05-GEO.
 */
export async function getApprovedPoints(projectId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // Build stable palette slot map from sort_order (D-58)
  const paletteSlotMap = await buildPaletteSlotMap(projectId);

  const rows = await db
    .select({
      id: submissions.id,
      boqItemId: submissions.boqItemId,
      photoUrl: submissions.photoUrl,
      locationWarning: submissions.locationWarning,
      locationDistanceM: submissions.locationDistanceM,
      quantity: submissions.quantity,
      status: submissions.status,
      decidedAt: submissions.decidedAt,
      snappedPointJson: sql<string>`ST_AsGeoJSON(${submissions.snappedPoint})`,
      boqMaterial: boqItems.material,
      unit: boqItems.unit,
      auditorName: people.displayName,
    })
    .from(submissions)
    .leftJoin(boqItems, eq(submissions.boqItemId, boqItems.id))
    .leftJoin(people, eq(submissions.decidedBy, people.id))
    .where(
      and(
        eq(submissions.projectId, projectId),
        eq(submissions.status, 'approved'),
        isNotNull(submissions.snappedPoint),  // D-46: exclude no_route rows
      )
    );

  const features = rows.map((r) => ({
    type: 'Feature' as const,
    geometry: JSON.parse(r.snappedPointJson) as { type: 'Point'; coordinates: [number, number] },
    properties: {
      id: r.id,
      boqItemId: r.boqItemId,
      boqPaletteSlot: paletteSlotMap.get(r.boqItemId) ?? 0,
      boqMaterial: r.boqMaterial ?? null,
      locationWarning: r.locationWarning ?? false,
      locationDistanceM: r.locationDistanceM != null ? Number(r.locationDistanceM) : null,
      quantity: Number(r.quantity),
      unit: r.unit ?? null,
      photoUrl: r.photoUrl,
      status: r.status,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      auditorName: r.auditorName ?? null,
    },
  }));

  return {
    type: 'FeatureCollection' as const,
    features,
  };
}

// ── getSubmissions ────────────────────────────────────────────────────────────

/**
 * getSubmissions — paginated, status-filtered submission list for Kayıtlar tab.
 *
 * Filters: optional status (whitelist-validated, T-05-IV / V5).
 * Pagination: newest-first by submittedAt DESC; page/pageSize are clamped integers.
 * Returns: { rows, total, page, pageSize, pageCount }.
 *
 * All Date values are serialized to ISO strings; all numerics to Number.
 * DASH-03.
 */
export async function getSubmissions(
  projectId: string,
  {
    status,
    page = 1,
    pageSize = 25,
  }: {
    status?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // V5: whitelist-validate status
  if (status && status !== 'all') {
    if (!VALID_STATUSES.includes(status as ValidStatus)) {
      throw new Error('Invalid status filter');
    }
  }

  // Clamp page and pageSize to sane integers (T-05-IV)
  const safePage = Math.max(1, Math.floor(Number(page)) || 1);
  const safePageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize)) || 25));
  const offset = (safePage - 1) * safePageSize;

  // Build conditions
  const conditions = [eq(submissions.projectId, projectId)];
  if (status && status !== 'all') {
    conditions.push(eq(submissions.status, status as ValidStatus));
  }

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: submissions.id,
        boqMaterial: boqItems.material,
        quantity: submissions.quantity,
        unit: boqItems.unit,
        status: submissions.status,
        decidedAt: submissions.decidedAt,
        submittedAt: submissions.submittedAt,
        locationLat: submissions.locationLat,
        locationLon: submissions.locationLon,
        photoUrl: submissions.photoUrl,
        notes: submissions.notes,
        rejectionReason: submissions.rejectionReason,
      })
      .from(submissions)
      .leftJoin(boqItems, eq(submissions.boqItemId, boqItems.id))
      .where(and(...conditions))
      .orderBy(desc(submissions.submittedAt))
      .limit(safePageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(submissions)
      .where(and(...conditions)),
  ]);

  const total = Number(countRows[0]?.count ?? 0);

  const serializedRows = rows.map((r) => ({
    id: r.id,
    boqMaterial: r.boqMaterial ?? null,
    quantity: Number(r.quantity),
    unit: r.unit ?? null,
    status: r.status,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    submittedAt: r.submittedAt.toISOString(),
    locationLat: r.locationLat != null ? Number(r.locationLat) : null,
    locationLon: r.locationLon != null ? Number(r.locationLon) : null,
    photoUrl: r.photoUrl,
    notes: r.notes ?? null,
    rejectionReason: r.rejectionReason ?? null,
  }));

  return {
    rows: serializedRows,
    total,
    page: safePage,
    pageSize: safePageSize,
    pageCount: Math.ceil(total / safePageSize),
  };
}
