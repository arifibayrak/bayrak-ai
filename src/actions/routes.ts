'use server';

/**
 * src/actions/routes.ts
 *
 * Server Actions for route management (D-07, SETUP-03, RTE-01/03/04/05).
 *
 * Threat T-06-01: server-side validation before any DB write.
 * Threat T-06-04: auth-guarded — throws Unauthorized without a valid session.
 * Threat T-14-AUTHZ: uploadDxf — auth() + CR-02 ownership check before writes.
 * Threat T-14-SSRF: blobUrl validated to *.public.blob.vercel-storage.com before fetch.
 * Threat T-14-SRCDOC-ATOM: routes upsert + route_source_documents INSERT in one db.transaction.
 *
 * The geometry is inserted ONLY via parameterized ST_GeomFromGeoJSON(${...})
 * — never via string concatenation (T-06-01 mitigation).
 */

import { sql, eq, and, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { routes } from '@/db/schema/routes';
import { projects } from '@/db/schema/projects';
import { routeSourceDocuments } from '@/db/schema/route-source-documents';
import { validateLineStringGeoJSON } from '@/lib/geojson';
import { parseDxfToLineString } from '@/lib/dxf-parser';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';
import { logOfficeActivity } from '@/lib/log-office-activity';

// ---------------------------------------------------------------------------
// uploadRoute — GeoJSON LineString route upload (RTE-04: signature unchanged)
// ---------------------------------------------------------------------------

/**
 * uploadRoute — validate and insert/replace a GeoJSON LineString route.
 *
 * Security (T-06-01): validateLineStringGeoJSON runs BEFORE any DB write.
 * Security (T-06-04): requires a valid session.
 * Security (CR-02): verifies caller owns the target project before writing.
 * Pattern: onConflictDoUpdate on routes.projectId implements the replace flow (D-07).
 * Geometry: ST_GeomFromGeoJSON(${result.geojsonString}) — parameterized, no concatenation.
 *
 * Phase 14 (RTE-04): Added totalLengthM (ST_Length::geography) and geometryVersion
 * to both the VALUES and the SET block — no signature or validation change.
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
  // Phase 14 (RTE-04): totalLengthM and geometryVersion added to VALUES + SET.
  const [row] = await db.insert(routes).values({
    projectId,
    tenantId: getDefaultTenantId(),
    geom: sql`ST_GeomFromGeoJSON(${result.geojsonString})`,
    coordinateCount: result.count,
    totalLengthM: sql`ST_Length(ST_GeomFromGeoJSON(${result.geojsonString})::geography)`,
    geometryVersion: 1,
  }).onConflictDoUpdate({
    target: routes.projectId,
    set: {
      geom: sql`ST_GeomFromGeoJSON(${result.geojsonString})`,
      coordinateCount: result.count,
      uploadedAt: sql`now()`,
      totalLengthM: sql`ST_Length(ST_GeomFromGeoJSON(${result.geojsonString})::geography)`,
      geometryVersion: sql`COALESCE(${routes.geometryVersion}, 0) + 1`,
    },
  }).returning({ id: routes.id });

  // CR-04: skip the log rather than pass an empty-string actorUserId (FK to users.id).
  if (session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'route_uploaded',
      entityType: 'project',
      entityId: projectId,
      projectId,
      metadata: { coordinateCount: result.count },
    });
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true as const, count: result.count, id: row.id };
}

// ---------------------------------------------------------------------------
// uploadDxf — DXF route upload (RTE-01/03/05, D-05)
// ---------------------------------------------------------------------------

type UploadDxfResult =
  | { ok: true; count: number; id: string }
  | { ok: false; error: string };

/**
 * uploadDxf — fetch a DXF from Vercel Blob, parse + reproject, upsert the route,
 * and INSERT a new route_source_documents row (D-05 history — never overwrite).
 *
 * Security (T-14-AUTHZ): auth() + CR-02 ownership check before any write.
 * Security (T-14-SSRF): blobUrl validated to https://*.public.blob.vercel-storage.com.
 * Security (T-14-SRCDOC-ATOM): routes upsert + route_source_documents INSERT in one
 *   db.transaction so the history row always reflects the geometry_version landed.
 * Security (T-14-VERSION / WR-01): geometry_version derived atomically inside the
 *   transaction via COALESCE(routes.geometry_version, 0) + 1 and read back via
 *   RETURNING — no separate SELECT MAX() read-modify-write (Pitfall 6 mitigation).
 *
 * @param projectId   — UUID of the project to upsert the route for
 * @param blobUrl     — Vercel Blob public URL of the uploaded DXF file
 * @param sourceCrs   — EPSG code, e.g. 5254 for TUREF/TM30
 * @param sourceLayer — DXF layer name selected by the office engineer
 */
export async function uploadDxf(
  projectId: string,
  blobUrl: string,
  sourceCrs: number,
  sourceLayer: string,
): Promise<UploadDxfResult> {
  // Auth gate (T-14-AUTHZ)
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // CR-02: Verify project belongs to the active tenant before writing (IDOR mitigation).
  const owned = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId())))
    .limit(1);
  if (!owned.length) throw new Error('Not found');

  // SSRF guard (T-14-SSRF): blobUrl must be https and host must end with
  // .public.blob.vercel-storage.com — rejects any server-side redirect abuse.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(blobUrl);
  } catch {
    return { ok: false, error: 'INVALID_BLOB_URL' };
  }
  if (
    parsedUrl.protocol !== 'https:' ||
    !parsedUrl.hostname.endsWith('.public.blob.vercel-storage.com')
  ) {
    return { ok: false, error: 'INVALID_BLOB_URL' };
  }

  // Fetch DXF text from blob (NEVER arrayBuffer — dxf-parser needs UTF-8 string; RESEARCH Pitfall 1)
  const response = await fetch(blobUrl);
  if (!response.ok) {
    return { ok: false, error: `BLOB_FETCH_FAILED_${response.status}` };
  }
  const dxfText = await response.text();

  // Parse + reproject (T-14-PARSE: errors returned as structured result, never thrown)
  const parseResult = parseDxfToLineString(dxfText, sourceCrs, sourceLayer);
  if (!parseResult.ok) {
    return { ok: false, error: parseResult.error };
  }

  // Shared validation gate (same as uploadRoute — ensures WGS84 coordinate range)
  const validation = validateLineStringGeoJSON(parseResult.geojsonString);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  // Atomic transaction: routes upsert + route_source_documents INSERT (T-14-SRCDOC-ATOM, D-05)
  //
  // WR-01: geometry_version is derived atomically from the route row itself
  // (COALESCE(routes.geometry_version, 0) + 1 in the conflict SET, mirroring
  // uploadRoute) and read back via RETURNING. This eliminates the previous
  // non-atomic SELECT MAX() read-modify-write: two concurrent uploads can no
  // longer both compute the same version and write duplicate history rows.
  // The route_source_documents history row is tied to the version the DB
  // actually landed, inside the same transaction.
  const [row] = await db.transaction(async (tx) => {
    // Upsert routes row with new geometry + provenance columns.
    // First import: geometry_version = 1. Re-import (conflict): increment the
    // existing row's geometry_version atomically.
    const upserted = await tx
      .insert(routes)
      .values({
        projectId,
        tenantId: getDefaultTenantId(),
        geom: sql`ST_GeomFromGeoJSON(${validation.geojsonString})`,
        coordinateCount: validation.count,
        totalLengthM: sql`ST_Length(ST_GeomFromGeoJSON(${validation.geojsonString})::geography)`,
        geometryVersion: 1,
        sourceBlobUrl: blobUrl,
        sourceCrs: String(sourceCrs),
        sourceLayer,
      })
      .onConflictDoUpdate({
        target: routes.projectId,
        set: {
          geom: sql`ST_GeomFromGeoJSON(${validation.geojsonString})`,
          coordinateCount: validation.count,
          totalLengthM: sql`ST_Length(ST_GeomFromGeoJSON(${validation.geojsonString})::geography)`,
          geometryVersion: sql`COALESCE(${routes.geometryVersion}, 0) + 1`,
          sourceBlobUrl: blobUrl,
          sourceCrs: String(sourceCrs),
          sourceLayer,
          uploadedAt: sql`now()`,
        },
      })
      .returning({ id: routes.id, geometryVersion: routes.geometryVersion });

    // The version the DB actually landed — drives the history row + activity log.
    const landedVersion = upserted[0].geometryVersion;

    // D-05: INSERT a NEW row into route_source_documents — never upsert/overwrite.
    // This preserves the full history of all source drawings for the project.
    await tx.insert(routeSourceDocuments).values({
      tenantId: getDefaultTenantId(),
      projectId,
      blobUrl,
      docType: 'dxf',
      sourceCrs: String(sourceCrs),
      sourceLayer,
      geometryVersion: landedVersion,
    });

    return upserted;
  });

  const landedVersion = row.geometryVersion;

  // Activity log (fire-and-forget — CR-04: skip if no userId)
  if (session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'dxf_route_uploaded',
      entityType: 'project',
      entityId: projectId,
      projectId,
      metadata: { coordinateCount: validation.count, geometryVersion: landedVersion, sourceCrs, sourceLayer },
    });
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true, count: validation.count, id: row.id };
}

// ---------------------------------------------------------------------------
// getRoute — fetch saved route metadata (Phase 14: extended projection)
// ---------------------------------------------------------------------------

/**
 * getRoute — fetch the saved route metadata for a project, if any.
 * Returns null when no route has been uploaded yet.
 * CR-01: tenant-scoped to prevent cross-tenant reads.
 *
 * Phase 14 (RTE-05): Extended projection includes totalLengthM, sourceCrs,
 * sourceLayer, geometryVersion, sourceBlobUrl.
 */
export async function getRoute(projectId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const result = await db
    .select({
      id: routes.id,
      coordinateCount: routes.coordinateCount,
      uploadedAt: routes.uploadedAt,
      // Phase 14 additions (RTE-05):
      totalLengthM: routes.totalLengthM,
      sourceCrs: routes.sourceCrs,
      sourceLayer: routes.sourceLayer,
      geometryVersion: routes.geometryVersion,
      sourceBlobUrl: routes.sourceBlobUrl,
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

// ---------------------------------------------------------------------------
// getRouteGeoJSON — fetch route geometry as GeoJSON (Phase 14: extended)
// ---------------------------------------------------------------------------

/**
 * getRouteGeoJSON — fetch the project route and return geometry as parsed GeoJSON.
 *
 * ST_AsGeoJSON is MANDATORY — routes.geom custom type fromDriver returns raw WKB.
 * Returns null when no route exists for the project.
 * uploadedAt is serialized to ISO string for RSC → client serializability.
 * DASH-01: coordinates are [longitude, latitude] per GeoJSON spec.
 * CR-01: tenant-scoped to prevent cross-tenant reads.
 * CR-03: guarded JSON.parse — returns null when geomJson is null/undefined.
 *
 * Phase 14 (RTE-05): Extended projection includes totalLengthM, sourceCrs,
 * sourceLayer, geometryVersion, sourceBlobUrl.
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
      // Phase 14 additions (RTE-05):
      totalLengthM: routes.totalLengthM,
      sourceCrs: routes.sourceCrs,
      sourceLayer: routes.sourceLayer,
      geometryVersion: routes.geometryVersion,
      sourceBlobUrl: routes.sourceBlobUrl,
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

// ---------------------------------------------------------------------------
// getRouteSourceDocuments — fetch source-document version history (D-05)
// ---------------------------------------------------------------------------

/**
 * SourceDocument — client-serializable shape of a route_source_documents row.
 * All Date fields serialized to ISO string for RSC→client boundary safety.
 */
export interface SourceDocument {
  id: string;
  blobUrl: string;
  docType: string;
  sourceCrs: string | null;
  sourceLayer: string | null;
  geometryVersion: number | null;
  uploadedAt: string; // ISO-8601
}

/**
 * getRouteSourceDocuments — return ALL source documents for a project, newest
 * first (D-05: keep ALL prior source drawings as version history, never just
 * the latest).
 *
 * Security (T-14-SRCDOC-READ): auth() guard + default-tenant scope mirrors getRoute.
 * Only the project's own history rows are returned (no cross-project reads).
 *
 * @param projectId — UUID of the project
 */
export async function getRouteSourceDocuments(
  projectId: string,
): Promise<SourceDocument[]> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const rows = await db
    .select({
      id: routeSourceDocuments.id,
      blobUrl: routeSourceDocuments.blobUrl,
      docType: routeSourceDocuments.docType,
      sourceCrs: routeSourceDocuments.sourceCrs,
      sourceLayer: routeSourceDocuments.sourceLayer,
      geometryVersion: routeSourceDocuments.geometryVersion,
      uploadedAt: routeSourceDocuments.uploadedAt,
      // Tenant scope: join via projects to enforce CR-01
      projectTenantId: routeSourceDocuments.tenantId,
    })
    .from(routeSourceDocuments)
    .where(
      and(
        eq(routeSourceDocuments.projectId, projectId),
        eq(routeSourceDocuments.tenantId, getDefaultTenantId()), // CR-01 tenant scope
      ),
    )
    .orderBy(desc(routeSourceDocuments.uploadedAt)); // newest first (D-05)

  // Serialize Date → ISO string for RSC→client boundary safety
  return rows.map((row) => ({
    id: row.id,
    blobUrl: row.blobUrl,
    docType: row.docType,
    sourceCrs: row.sourceCrs,
    sourceLayer: row.sourceLayer,
    geometryVersion: row.geometryVersion,
    uploadedAt:
      row.uploadedAt instanceof Date
        ? row.uploadedAt.toISOString()
        : String(row.uploadedAt),
  }));
}
