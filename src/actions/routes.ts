'use server';

/**
 * src/actions/routes.ts
 *
 * Server Actions for GeoJSON route upload/replace (D-07, SETUP-03).
 * Threat T-06-01: server-side zod validation before any DB write.
 * Threat T-06-04: auth-guarded — throws Unauthorized without a valid session.
 *
 * The geometry is inserted ONLY via parameterized ST_GeomFromGeoJSON(${...})
 * — never via string concatenation (T-06-01 mitigation).
 */

import { sql, eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { routes } from '@/db/schema/routes';
import { projects } from '@/db/schema/projects';
import { validateLineStringGeoJSON } from '@/lib/geojson';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';
import { logOfficeActivity } from '@/lib/log-office-activity';

/**
 * uploadRoute — validate and insert/replace a GeoJSON LineString route.
 *
 * Security (T-06-01): validateLineStringGeoJSON runs BEFORE any DB write.
 * Security (T-06-04): requires a valid session.
 * Security (CR-02): verifies caller owns the target project before writing.
 * Pattern: onConflictDoUpdate on routes.projectId implements the replace flow (D-07).
 * Geometry: ST_GeomFromGeoJSON(${result.geojsonString}) — parameterized, no concatenation.
 */
export async function uploadRoute(projectId: string, fileContent: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // CR-02: Verify project belongs to the active tenant before writing (IDOR mitigation).
  // Mirrors the ownership check in getProject in projects.ts.
  const owned = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId())))
    .limit(1);
  if (!owned.length) throw new Error('Not found');

  const result = validateLineStringGeoJSON(fileContent);
  if (!result.ok) {
    return { ok: false as const, error: result.error, actualType: result.actualType };
  }

  // Insert geometry via ST_GeomFromGeoJSON.
  // Pass the geometry-only string (NOT the Feature wrapper — RESEARCH Pitfall 4).
  // onConflictDoUpdate on projectId implements replace (D-07): re-upload replaces old route.
  const [row] = await db.insert(routes).values({
    projectId,
    tenantId: getDefaultTenantId(),
    geom: sql`ST_GeomFromGeoJSON(${result.geojsonString})`,
    coordinateCount: result.count,
  }).onConflictDoUpdate({
    target: routes.projectId,
    set: {
      geom: sql`ST_GeomFromGeoJSON(${result.geojsonString})`,
      coordinateCount: result.count,
      uploadedAt: sql`now()`,
    },
  }).returning({ id: routes.id });

  logOfficeActivity({
    actorUserId: session.user?.id ?? '',
    actionType: 'route_uploaded',
    entityType: 'project',
    entityId: projectId,
    projectId,
    metadata: { coordinateCount: result.count },
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true as const, count: result.count, id: row.id };
}

/**
 * getRoute — fetch the saved route metadata for a project, if any.
 * Returns null when no route has been uploaded yet.
 * CR-01: tenant-scoped to prevent cross-tenant reads.
 */
export async function getRoute(projectId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const result = await db
    .select({
      id: routes.id,
      coordinateCount: routes.coordinateCount,
      uploadedAt: routes.uploadedAt,
    })
    .from(routes)
    .where(
      and(
        eq(routes.projectId, projectId),
        eq(routes.tenantId, getDefaultTenantId()),  // CR-01: tenant scope
      )
    )
    .limit(1);

  return result[0] ?? null;
}

/**
 * getRouteGeoJSON — fetch the project route and return geometry as parsed GeoJSON.
 *
 * ST_AsGeoJSON is MANDATORY — routes.geom custom type fromDriver returns raw WKB.
 * Returns null when no route exists for the project.
 * uploadedAt is serialized to ISO string for RSC → client serializability.
 * DASH-01: coordinates are [longitude, latitude] per GeoJSON spec.
 * CR-01: tenant-scoped to prevent cross-tenant reads.
 * CR-03: guarded JSON.parse — returns null when geomJson is null/undefined.
 */
export async function getRouteGeoJSON(projectId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const result = await db
    .select({
      id: routes.id,
      coordinateCount: routes.coordinateCount,
      uploadedAt: routes.uploadedAt,
      geomJson: sql`ST_AsGeoJSON(${routes.geom})`,
    })
    .from(routes)
    .where(
      and(
        eq(routes.projectId, projectId),
        eq(routes.tenantId, getDefaultTenantId()),  // CR-01: tenant scope
      )
    )
    .limit(1);

  if (!result[0]) return null;

  const { geomJson, uploadedAt, ...rest } = result[0];

  // CR-03: guard JSON.parse — ST_AsGeoJSON returns null for null geometry
  if (!geomJson) return null;

  return {
    ...rest,
    uploadedAt: (uploadedAt as Date).toISOString(),
    geojson: JSON.parse(geomJson as string) as { type: 'LineString'; coordinates: [number, number][] },
  };
}
