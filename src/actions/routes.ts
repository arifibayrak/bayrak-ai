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

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { routes } from '@/db/schema/routes';
import { validateLineStringGeoJSON } from '@/lib/geojson';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';

/**
 * uploadRoute — validate and insert/replace a GeoJSON LineString route.
 *
 * Security (T-06-01): validateLineStringGeoJSON runs BEFORE any DB write.
 * Security (T-06-04): requires a valid session.
 * Pattern: onConflictDoUpdate on routes.projectId implements the replace flow (D-07).
 * Geometry: ST_GeomFromGeoJSON(${result.geojsonString}) — parameterized, no concatenation.
 */
export async function uploadRoute(projectId: string, fileContent: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const result = validateLineStringGeoJSON(fileContent);
  if (!result.ok) {
    return { ok: false as const, error: result.error, actualType: result.actualType };
  }

  // Insert geometry via ST_GeomFromGeoJSON.
  // Pass the geometry-only string (NOT the Feature wrapper — RESEARCH Pitfall 4).
  // onConflictDoUpdate on projectId implements replace (D-07): re-upload replaces old route.
  await db.insert(routes).values({
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
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true as const, count: result.count };
}

/**
 * getRoute — fetch the saved route metadata for a project, if any.
 * Returns null when no route has been uploaded yet.
 */
export async function getRoute(projectId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const { eq } = await import('drizzle-orm');
  const result = await db
    .select({
      id: routes.id,
      coordinateCount: routes.coordinateCount,
      uploadedAt: routes.uploadedAt,
    })
    .from(routes)
    .where(eq(routes.projectId, projectId))
    .limit(1);

  return result[0] ?? null;
}
