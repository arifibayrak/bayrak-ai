/**
 * src/lib/dxf-parser.ts
 *
 * DXF route import utilities: layer extraction + LineString parsing.
 * Full implementation arrives in Plan 04 of Phase 14.
 *
 * This stub exports the correct TypeScript types and function signatures
 * so the test scaffold (tests/dxf-parser.test.ts) compiles cleanly in Wave 0.
 * All functions return `{ ok: false, error: 'NOT_IMPLEMENTED' }` until Plan 04
 * replaces this file with the real implementation.
 *
 * Axis order contract (same as crs.ts):
 *   Vertices extracted from DXF are passed as [easting, northing] to
 *   reprojectToWGS84, which returns [lng, lat] for GeoJSON.
 */

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

/**
 * extractDxfLayers — parse a DXF text string and return a list of layers
 * with entity/vertex counts. Returns null if the input is not valid DXF.
 *
 * Implementation: Plan 04, Task 1.
 */
export function extractDxfLayers(_dxfText: string): LayerInfo[] | null {
  // Stub — Plan 04 implements this
  return null;
}

/**
 * parseDxfToLineString — parse a DXF text string, filter to selectedLayer,
 * stitch LWPOLYLINE entities, reproject each vertex from epsg to WGS84,
 * validate the Turkey bbox, and return a GeoJSON LineString string.
 *
 * Error codes:
 *   DXF_PARSE_FAILED        — dxf-parser threw (malformed/non-DXF input)
 *   NO_COMPATIBLE_GEOMETRY  — no LWPOLYLINE/POLYLINE entities in selectedLayer
 *   COORDS_OUTSIDE_TURKEY   — a vertex reprojected outside Turkey bbox
 *   TOO_FEW_VERTICES        — fewer than 2 vertices after filter/stitch
 *
 * Implementation: Plan 04, Task 2.
 */
export function parseDxfToLineString(
  _dxfText: string,
  _epsg: number,
  _layerName: string,
): ParseDxfResult {
  // Stub — Plan 04 implements this
  return { ok: false, error: 'NOT_IMPLEMENTED' };
}
