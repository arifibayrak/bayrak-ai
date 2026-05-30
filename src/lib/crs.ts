/**
 * src/lib/crs.ts
 *
 * Turkey EPSG lookup table + reprojectToWGS84 utility (RTE-01, SC5).
 * Called by parseDxfToLineString in the uploadDxf Server Action.
 *
 * Axis order contract:
 *   INPUT:  [easting, northing] in the source CRS (metres)
 *   OUTPUT: [lng, lat] in WGS84 degrees — matches ST_MakePoint(lng, lat) convention.
 */

import proj4 from 'proj4';

/**
 * TURKEY_CRS — proj4 definition strings for the 7 Turkey-specific EPSG codes.
 * Strings are verbatim from epsg.io and STACK.md (verified 2026-05-30).
 *
 * Coverage:
 *   5253 — TUREF / TM27   (western Turkey, lon_0=27)
 *   5254 — TUREF / TM30   (central Turkey, lon_0=30) — default CRS (D-01)
 *   5255 — TUREF / TM33   (eastern Turkey, lon_0=33)
 *  23035 — ED50 / UTM zone 35N
 *  23036 — ED50 / UTM zone 36N
 *  32635 — WGS 84 / UTM zone 35N
 *  32636 — WGS 84 / UTM zone 36N
 */
export const TURKEY_CRS: Record<number, string> = {
  5254: '+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  5253: '+proj=tmerc +lat_0=0 +lon_0=27 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  5255: '+proj=tmerc +lat_0=0 +lon_0=33 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  23035: '+proj=utm +zone=35 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs',
  23036: '+proj=utm +zone=36 +ellps=intl +towgs84=-89.05,-87.03,-124.56,0,0,0,0 +units=m +no_defs',
  32635: '+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs',
  32636: '+proj=utm +zone=36 +datum=WGS84 +units=m +no_defs',
};

/** WGS84 target — standard longlat definition */
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';

/** Turkey approximate bounding box for post-reprojection validation (T-14-VAL, SC5) */
const TURKEY_BBOX = { minLng: 25.7, maxLng: 44.8, minLat: 35.8, maxLat: 42.2 };

/**
 * reprojectToWGS84 — converts a single projected coordinate to WGS84 [lng, lat].
 *
 * Axis order contract:
 *   INPUT:  [easting, northing] in the source CRS (metres)
 *   OUTPUT: [lng, lat] in WGS84 degrees
 *   This matches the existing ST_MakePoint(lng, lat) convention in this codebase.
 *
 * Unit test anchor (SC5): reprojectToWGS84(5254, 600000, 4570000) → ~[29.0°E, 41.3°N]
 *
 * @throws {Error} if epsg is not in TURKEY_CRS lookup table
 */
export function reprojectToWGS84(
  epsg: number,
  easting: number,
  northing: number,
): [lng: number, lat: number] {
  const srcDef = TURKEY_CRS[epsg];
  if (!srcDef) throw new Error(`Unsupported EPSG: ${epsg}`);
  // proj4 input: [x=easting, y=northing]; output: [x=lng, y=lat] for WGS84
  const [lng, lat] = proj4(srcDef, WGS84, [easting, northing]);
  return [lng, lat];
}

/**
 * validateTurkeyBbox — checks that a [lng, lat] point falls within Turkey's
 * approximate bounding box. Returns false for axis-swapped or out-of-country coords.
 *
 * Used as the last validation gate before any DB write (T-14-VAL mitigation).
 * Turkey bbox: lng 25.7–44.8, lat 35.8–42.2
 */
export function validateTurkeyBbox(lng: number, lat: number): boolean {
  return (
    lng >= TURKEY_BBOX.minLng &&
    lng <= TURKEY_BBOX.maxLng &&
    lat >= TURKEY_BBOX.minLat &&
    lat <= TURKEY_BBOX.maxLat
  );
}
