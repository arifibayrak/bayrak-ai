'use server';

/**
 * src/actions/dxf-preview.ts
 *
 * previewDxf — fetch, parse, and reproject a DXF from Vercel Blob for the
 * satellite preview modal WITHOUT writing anything to the database.
 *
 * This is the parse-for-preview step in the DxfUpload state machine.
 * The write happens only when the engineer clicks "Onayla — Kaydet" and the
 * parent calls uploadDxf() (T-14-PREVIEW: no DB write before Confirm).
 *
 * Security (T-14-SSRF): blobUrl validated to *.public.blob.vercel-storage.com.
 * Security (T-14-AUTHZ): auth() guard before any Blob fetch.
 */

import { auth } from '@/lib/auth';
import { db } from '@/db';
import { routes } from '@/db/schema/routes';
import { projects } from '@/db/schema/projects';
import { submissions } from '@/db/schema/submissions';
import { eq, and, count as dbCount } from 'drizzle-orm';
import { getDefaultTenantId } from '@/lib/tenant';
import { parseDxfToLineString } from '@/lib/dxf-parser';

export type PreviewDxfResult =
  | {
      ok: true;
      geojson: { type: 'LineString'; coordinates: [number, number][] };
      count: number;
      totalLengthM: number;
      hasSpline: boolean;
      gaps: number[];
      approvedCount: number;
      currentVersion: number;
    }
  | { ok: false; error: string };

/**
 * previewDxf — parse DXF from Blob URL, return reprojected GeoJSON for the
 * satellite preview modal. Does NOT write to the database.
 *
 * @param projectId   — UUID of the target project
 * @param blobUrl     — Vercel Blob public URL of the uploaded DXF file
 * @param sourceCrs   — EPSG code, e.g. 5254 for TUREF/TM30
 * @param sourceLayer — DXF layer name selected by the office engineer
 */
export async function previewDxf(
  projectId: string,
  blobUrl: string,
  sourceCrs: number,
  sourceLayer: string,
): Promise<PreviewDxfResult> {
  // Auth gate
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // CR-01 / CR-02 parity: verify the project belongs to the active tenant
  // before any read or Blob fetch (IDOR mitigation — mirrors uploadDxf/uploadRoute).
  const owned = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId())))
    .limit(1);
  if (!owned.length) return { ok: false, error: 'NOT_FOUND' };

  // SSRF guard: blobUrl must be https and host must end with
  // .public.blob.vercel-storage.com
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

  // Fetch DXF text from blob (NOT arrayBuffer — dxf-parser needs UTF-8 string)
  const response = await fetch(blobUrl);
  if (!response.ok) {
    return { ok: false, error: `BLOB_FETCH_FAILED_${response.status}` };
  }
  const dxfText = await response.text();

  // Parse + reproject — no DB write
  const parseResult = parseDxfToLineString(dxfText, sourceCrs, sourceLayer);
  if (!parseResult.ok) {
    return { ok: false, error: parseResult.error };
  }

  // Parse GeoJSON string to object for the client
  let geojson: { type: 'LineString'; coordinates: [number, number][] };
  try {
    geojson = JSON.parse(parseResult.geojsonString) as typeof geojson;
  } catch {
    return { ok: false, error: 'DXF_PARSE_FAILED' };
  }

  // Compute total length in metres from the WGS84 coordinates.
  // Haversine-based approximation (accurate enough for a km readout).
  // The exact value is computed by PostGIS ST_Length::geography on write.
  const totalLengthM = haversineLineLength(geojson.coordinates);

  // Fetch current geometry version + approved submission count for the
  // re-import warning (Surface 3, D-04).
  const [existingRoute] = await db
    .select({ geometryVersion: routes.geometryVersion })
    .from(routes)
    .where(
      and(
        eq(routes.projectId, projectId),
        eq(routes.tenantId, getDefaultTenantId()),
      ),
    )
    .limit(1);

  const currentVersion = existingRoute?.geometryVersion ?? 0;

  const [approvedRow] = await db
    .select({ approvedCount: dbCount() })
    .from(submissions)
    .where(
      and(
        eq(submissions.projectId, projectId),
        eq(submissions.status, 'approved'),
        eq(submissions.tenantId, getDefaultTenantId()), // WR-02: tenant scope (defense-in-depth)
      ),
    );

  const approvedCount = approvedRow?.approvedCount ?? 0;

  return {
    ok: true,
    geojson,
    count: parseResult.count,
    totalLengthM,
    hasSpline: parseResult.hasSpline,
    gaps: parseResult.gaps,
    approvedCount,
    currentVersion,
  };
}

/**
 * Haversine-based total line length in metres.
 * Accurate within ~0.3% for lines spanning typical Turkish pipeline distances.
 */
function haversineLineLength(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  const R = 6_371_000; // Earth radius in metres
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    total += 2 * R * Math.asin(Math.sqrt(a));
  }
  return total;
}
