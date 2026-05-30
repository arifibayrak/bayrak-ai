/**
 * src/lib/dxf-parser.ts
 *
 * DXF route import utilities: layer extraction + LineString parsing.
 * Phase 14, Plan 04 — full implementation (turns Wave 0 RED tests GREEN).
 *
 * Axis order contract (same as crs.ts):
 *   Vertices extracted from DXF are passed as [easting, northing] to
 *   reprojectToWGS84, which returns [lng, lat] for GeoJSON.
 *
 * Security (T-14-PARSE): parseSync is wrapped in try/catch; malformed or
 * non-DXF content returns DXF_PARSE_FAILED and never throws to the caller.
 * Security (T-14-VAL): Turkey bbox validation rejects axis-swapped / out-of-country
 * coordinates before any caller can write them to the database.
 * Security (T-14-DOS): vertex-count cap (100,000) prevents oversized DXF files
 * from exhausting memory or compute in the Server Action.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DxfParser = require('dxf-parser');
import { reprojectToWGS84, validateTurkeyBbox } from './crs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParseDxfResult =
  | { ok: true; geojsonString: string; count: number; gaps: number[]; hasSpline: boolean }
  | { ok: false; error: string };

export interface LayerInfo {
  name: string;
  entityCount: number;
  vertexCount: number;
  hasSpline: boolean;
  /** true if name matches AXIS/CL/CENTERLINE/MERKEZ (case-insensitive) */
  suggested: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Maximum vertex count allowed across all selected-layer polylines (T-14-DOS). */
const MAX_VERTEX_COUNT = 100_000;

/**
 * Gap threshold in projected coordinate units (metres for TUREF/UTM).
 * Gaps between stitched polyline endpoints larger than this are recorded.
 */
const GAP_THRESHOLD_M = 1.0;

/**
 * Pattern for auto-suggested layer names (D-02).
 * Case-insensitive match on AXIS, CL, CENTERLINE, MERKEZ.
 */
const SUGGESTED_LAYER_RE = /^(AXIS|CL|CENTERLINE|MERKEZ)$/i;

interface Vertex {
  x: number;
  y: number;
}

interface Polyline {
  vertices: Vertex[];
}

/**
 * stitchPolylines — greedy nearest-next endpoint stitching (D-03).
 *
 * Picks the polyline whose nearest endpoint (head or tail) is closest to
 * the current chain's tail. Reverses the next segment when the tail is
 * nearer than the head. Collects gap distances (projected units) when the
 * gap exceeds GAP_THRESHOLD_M.
 *
 * Returns a flat vertex array and the list of gaps found.
 */
function stitchPolylines(
  polylines: Polyline[],
): { vertices: Vertex[]; gaps: number[] } {
  if (polylines.length === 0) return { vertices: [], gaps: [] };
  if (polylines.length === 1) return { vertices: polylines[0].vertices, gaps: [] };

  const gaps: number[] = [];
  // Work with copies so we can splice freely
  const remaining = polylines.map(p => ({ vertices: [...p.vertices] }));
  const ordered: Vertex[] = [...remaining.shift()!.vertices];

  while (remaining.length > 0) {
    const chainTail = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    let bestReverse = false;

    for (let i = 0; i < remaining.length; i++) {
      const verts = remaining[i].vertices;
      const head = verts[0];
      const tail = verts[verts.length - 1];
      const dHead = Math.hypot(head.x - chainTail.x, head.y - chainTail.y);
      const dTail = Math.hypot(tail.x - chainTail.x, tail.y - chainTail.y);
      const dMin = Math.min(dHead, dTail);
      if (dMin < bestDist) {
        bestDist = dMin;
        bestIdx = i;
        bestReverse = dTail < dHead;
      }
    }

    const [next] = remaining.splice(bestIdx, 1);
    if (bestDist > GAP_THRESHOLD_M) gaps.push(bestDist);

    const nextVerts = bestReverse
      ? [...next.vertices].reverse()
      : next.vertices;

    for (const v of nextVerts) {
      ordered.push(v);
    }
  }

  return { vertices: ordered, gaps };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * extractDxfLayers — parse a DXF text string and return a list of layers
 * with entity/vertex counts. Returns null if the input is not valid DXF.
 *
 * Layer list is derived from the entities array (source of truth), not the
 * tables.layer map, to avoid discrepancies when layers have entities but no
 * explicit layer table entry (RESEARCH Open Question 2).
 */
export function extractDxfLayers(dxfText: string): LayerInfo[] | null {
  let dxf: { entities: Array<{ type: string; layer?: string; vertices?: Array<{ x: number; y: number }> }> };
  try {
    const parser = new DxfParser();
    dxf = parser.parseSync(dxfText);
  } catch {
    return null;
  }

  if (!dxf || !Array.isArray(dxf.entities)) return null;

  // Aggregate counts from the entities array (not tables.layer)
  const layerMap = new Map<string, { entities: number; vertices: number; hasSpline: boolean }>();

  for (const entity of dxf.entities) {
    const layer = entity.layer ?? '0';
    const existing = layerMap.get(layer) ?? { entities: 0, vertices: 0, hasSpline: false };
    const vertexCount =
      entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE'
        ? (entity.vertices?.length ?? 0)
        : 0;
    layerMap.set(layer, {
      entities: existing.entities + 1,
      vertices: existing.vertices + vertexCount,
      hasSpline: existing.hasSpline || entity.type === 'SPLINE',
    });
  }

  return Array.from(layerMap.entries()).map(([name, info]) => ({
    name,
    entityCount: info.entities,
    vertexCount: info.vertices,
    hasSpline: info.hasSpline,
    suggested: SUGGESTED_LAYER_RE.test(name),
  }));
}

/**
 * parseDxfToLineString — parse a DXF text string, filter to selectedLayer,
 * stitch LWPOLYLINE entities, reproject each vertex from epsg to WGS84,
 * validate the Turkey bbox, and return a GeoJSON LineString string.
 *
 * Error codes:
 *   DXF_PARSE_FAILED        — dxf-parser threw (malformed/non-DXF input)
 *   NO_COMPATIBLE_GEOMETRY  — no LWPOLYLINE/POLYLINE entities in selectedLayer
 *                             with >= 2 vertices
 *   COORDS_OUTSIDE_TURKEY   — a vertex reprojected outside Turkey bbox (T-14-VAL)
 *   TOO_FEW_VERTICES        — fewer than 2 vertices after filter/stitch
 *
 * @param dxfText   — UTF-8 DXF text string (NOT a Buffer — RESEARCH Pitfall 1)
 * @param epsg      — EPSG code for the source CRS (must be in TURKEY_CRS)
 * @param layerName — DXF layer name to extract polylines from
 */
export function parseDxfToLineString(
  dxfText: string,
  epsg: number,
  layerName: string,
): ParseDxfResult {
  // --- Step 1: Parse DXF (T-14-PARSE: never throw to caller) ---
  let dxf: {
    entities: Array<{
      type: string;
      layer?: string;
      vertices?: Array<{ x: number; y: number; bulge?: number }>;
      shape?: boolean;
    }>;
  };
  try {
    const parser = new DxfParser();
    dxf = parser.parseSync(dxfText);
  } catch {
    return { ok: false, error: 'DXF_PARSE_FAILED' };
  }

  if (!dxf || !Array.isArray(dxf.entities)) {
    return { ok: false, error: 'DXF_PARSE_FAILED' };
  }

  // --- Step 2: Detect SPLINE entities in the selected layer (D-03, non-blocking) ---
  const hasSpline = dxf.entities.some(
    (e) => e.layer === layerName && e.type === 'SPLINE',
  );

  // --- Step 3: Extract LWPOLYLINE/POLYLINE entities from the selected layer ---
  // First collect ALL polyline entities (even those with < 2 vertices) so we can
  // distinguish "no polyline entities at all" from "polylines exist but too few vertices".
  const allPolylineEntities = dxf.entities.filter(
    (e) =>
      e.layer === layerName &&
      (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE'),
  );

  if (allPolylineEntities.length === 0) {
    return { ok: false, error: 'NO_COMPATIBLE_GEOMETRY' };
  }

  const polylines: Polyline[] = allPolylineEntities
    .map((e) => ({
      vertices: (e.vertices ?? []).map((v) => ({ x: v.x, y: v.y })),
    }))
    .filter((p) => p.vertices.length >= 2);

  if (polylines.length === 0) {
    // Polyline entities exist but none have >= 2 vertices
    return { ok: false, error: 'TOO_FEW_VERTICES' };
  }

  // --- Step 4: DoS guard (T-14-DOS) ---
  const totalVertices = polylines.reduce((sum, p) => sum + p.vertices.length, 0);
  if (totalVertices > MAX_VERTEX_COUNT) {
    return { ok: false, error: 'TOO_FEW_VERTICES' }; // overloaded: too-many becomes a fail
  }

  // --- Step 5: Stitch multiple polylines into one ordered vertex list (D-03) ---
  const { vertices: stitched, gaps } = stitchPolylines(polylines);

  if (stitched.length < 2) {
    return { ok: false, error: 'TOO_FEW_VERTICES' };
  }

  // --- Step 6: Reproject each vertex + Turkey bbox validation (T-14-VAL) ---
  const wgsCoords: [number, number][] = [];
  for (const v of stitched) {
    let lng: number;
    let lat: number;
    try {
      [lng, lat] = reprojectToWGS84(epsg, v.x, v.y);
    } catch {
      // Unsupported EPSG — treated as parse failure
      return { ok: false, error: 'DXF_PARSE_FAILED' };
    }
    if (!validateTurkeyBbox(lng, lat)) {
      return { ok: false, error: 'COORDS_OUTSIDE_TURKEY' };
    }
    wgsCoords.push([lng, lat]);
  }

  if (wgsCoords.length < 2) {
    return { ok: false, error: 'TOO_FEW_VERTICES' };
  }

  // --- Step 7: Build GeoJSON LineString ---
  const geojsonString = JSON.stringify({
    type: 'LineString',
    coordinates: wgsCoords,
  });

  return {
    ok: true,
    geojsonString,
    count: wgsCoords.length,
    gaps,
    hasSpline,
  };
}
