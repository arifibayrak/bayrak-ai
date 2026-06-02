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
import { assertCanWrite } from '@/lib/rbac';
import { getDefaultTenantId } from '@/lib/tenant';
import { logOfficeActivity } from '@/lib/log-office-activity';
import { sampleElevations, ELEVATION_SOURCE } from '@/lib/elevation';
import { buildElevationProfile } from '@/lib/elevation-profile';
import { parseLandXml } from '@/lib/landxml';

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
// uploadLandXml — LandXML/InfraModel alignment import (designed elevation + chainage)
// ---------------------------------------------------------------------------

type UploadLandXmlResult =
  | { ok: true; count: number; id: string; hasVerticalProfile: boolean; warnings: string[]; name: string }
  | { ok: false; error: string };

/**
 * uploadLandXml — parse a LandXML alignment (horizontal + vertical), upsert the
 * route as a 2D LineString, and — when the file carries a vertical profile —
 * populate the elevation columns with DESIGNED elevation (elevation_source
 * 'landxml-designed'), reusing the same profile pipeline as terrain sampling.
 * The alignment's staStart is stored as the chainage offset so the as-built view
 * reflects true civil stationing. Office-only (assertCanWrite).
 */
export async function uploadLandXml(
  projectId: string,
  fileContent: string,
  epsg: number,
): Promise<UploadLandXmlResult> {
  await assertCanWrite(); // RBAC: audit_engineer is read-only
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // CR-02: ownership check before any write (IDOR mitigation).
  const owned = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId())))
    .limit(1);
  if (!owned.length) throw new Error('Not found');

  const parsed = parseLandXml(fileContent, epsg);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };

  const geojsonString = JSON.stringify({ type: 'LineString', coordinates: parsed.coords });

  // Designed elevation profile (only when the LandXML carries a vertical profile).
  const elev = parsed.hasVerticalProfile
    ? buildElevationProfile(parsed.coords, parsed.elevations)
    : null;

  const elevationCols = elev
    ? {
        minElevationM: String(elev.minM),
        maxElevationM: String(elev.maxM),
        length3dM: String(elev.length3dM),
        elevationProfile: elev.profile,
        elevationSampledAt: new Date(),
        elevationSource: 'landxml-designed',
      }
    : {};

  const [row] = await db
    .insert(routes)
    .values({
      projectId,
      tenantId: getDefaultTenantId(),
      geom: sql`ST_GeomFromGeoJSON(${geojsonString})`,
      coordinateCount: parsed.coords.length,
      totalLengthM: sql`ST_Length(ST_GeomFromGeoJSON(${geojsonString})::geography)`,
      geometryVersion: 1,
      sourceLayer: 'LandXML',
      sourceCrs: String(epsg),
      chainageOffsetM: String(parsed.staStart),
      ...elevationCols,
    })
    .onConflictDoUpdate({
      target: routes.projectId,
      set: {
        geom: sql`ST_GeomFromGeoJSON(${geojsonString})`,
        coordinateCount: parsed.coords.length,
        uploadedAt: sql`now()`,
        totalLengthM: sql`ST_Length(ST_GeomFromGeoJSON(${geojsonString})::geography)`,
        geometryVersion: sql`COALESCE(${routes.geometryVersion}, 0) + 1`,
        sourceLayer: 'LandXML',
        sourceCrs: String(epsg),
        chainageOffsetM: String(parsed.staStart),
        // Reset elevation to the LandXML profile (or clear if none in this file).
        minElevationM: elev ? String(elev.minM) : null,
        maxElevationM: elev ? String(elev.maxM) : null,
        length3dM: elev ? String(elev.length3dM) : null,
        elevationProfile: elev ? elev.profile : null,
        elevationSampledAt: elev ? new Date() : null,
        elevationSource: elev ? 'landxml-designed' : null,
      },
    })
    .returning({ id: routes.id });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return {
    ok: true as const,
    count: parsed.coords.length,
    id: row?.id ?? '',
    hasVerticalProfile: parsed.hasVerticalProfile,
    warnings: parsed.warnings,
    name: parsed.name,
  };
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
      // Elevation (terrain-sampled, real 3D) — null until sampleRouteElevation runs.
      minElevationM: routes.minElevationM,
      maxElevationM: routes.maxElevationM,
      length3dM: routes.length3dM,
      elevationProfile: routes.elevationProfile,
      elevationSampledAt: routes.elevationSampledAt,
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

  const { geomJson, uploadedAt, elevationSampledAt, ...rest } = result[0];

  // CR-03: guard JSON.parse — ST_AsGeoJSON returns null for null geometry
  if (!geomJson) return null;

  return {
    ...rest,
    uploadedAt: (uploadedAt as Date).toISOString(),
    elevationSampledAt: elevationSampledAt ? (elevationSampledAt as Date).toISOString() : null,
    geojson: JSON.parse(geomJson as string) as { type: 'LineString'; coordinates: [number, number][] },
  };
}

// ---------------------------------------------------------------------------
// sampleRouteElevation — terrain-sample Z onto the route (real 3D)
// ---------------------------------------------------------------------------

/**
 * sampleRouteElevation — fetch the project route, sample a DEM elevation for
 * every vertex (Mapbox Terrain-RGB), and persist the derived vertical profile,
 * 3D (slope) length, and min/max elevation. Office-only (assertCanWrite); the
 * 2D geometry is untouched — only the additive elevation columns are written.
 */
export async function sampleRouteElevation(
  projectId: string,
): Promise<{ ok: true; minM: number; maxM: number; length3dM: number; points: number } | { ok: false; error: string }> {
  await assertCanWrite(); // RBAC: audit_engineer is read-only
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  const route = await getRouteGeoJSON(projectId);
  if (!route) return { ok: false as const, error: 'No route to sample.' };

  const coords = route.geojson.coordinates;
  if (!coords || coords.length < 2) {
    return { ok: false as const, error: 'Route has too few points.' };
  }

  let elevations: number[];
  try {
    elevations = await sampleElevations(coords);
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : 'Elevation sampling failed.' };
  }

  const { profile, length3dM, minM, maxM } = buildElevationProfile(coords, elevations);

  await db
    .update(routes)
    .set({
      minElevationM: String(minM),
      maxElevationM: String(maxM),
      length3dM: String(length3dM),
      elevationProfile: profile,
      elevationSampledAt: new Date(),
      elevationSource: ELEVATION_SOURCE,
    })
    .where(and(eq(routes.projectId, projectId), eq(routes.tenantId, tenantId)));

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true as const, minM, maxM, length3dM, points: coords.length };
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
      // WR-05: tenant scoping is enforced by the where clause below
      // (eq(routeSourceDocuments.tenantId, getDefaultTenantId())), not a join.
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
