/**
 * GeoJSON test fixtures.
 *
 * Used by tests/geojson.test.ts and any plan that validates LineString uploads.
 * Istanbul coordinates: lng = 28.9, lat = 41.0 (lng first per GeoJSON spec / D-07).
 */

/** A valid GeoJSON Feature wrapping a LineString (2 Istanbul coords, lng first) */
export const validLineStringFeature = {
  type: "Feature" as const,
  geometry: {
    type: "LineString" as const,
    coordinates: [
      [28.9, 41.0], // Istanbul lng, lat — lng first per WGS84 / D-07
      [28.95, 41.05],
      [29.0, 41.1],
    ] as [number, number][],
  },
  properties: null,
};

/**
 * An INVALID fixture: a FeatureCollection containing a Polygon geometry.
 * validateLineStringGeoJSON must reject this (NOT_LINESTRING error).
 */
export const invalidPolygonFeatureCollection = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [28.9, 41.0],
            [29.0, 41.0],
            [29.0, 41.1],
            [28.9, 41.1],
            [28.9, 41.0],
          ],
        ],
      },
      properties: null,
    },
  ],
};

/**
 * An INVALID fixture: coordinates in lat-first order (lat > 90 caught).
 * A coordinate [41.0, 200.0] has lat=41 but lng=200 which exceeds 180
 * → Zod rejects via .max(180).
 * Alternatively, [91.0, 28.9] has first coord (lng?) = 91 which is > 90
 * and would fail the lat validation if coord order were reversed.
 *
 * We use lat=200 (out of range for longitude) to ensure the validator
 * catches swapped coordinates unambiguously.
 */
export const latFirstOutOfRangeFeature = {
  type: "Feature" as const,
  geometry: {
    type: "LineString" as const,
    // First value is latitude (41) used as longitude position → second value
    // 200 exceeds the valid longitude range of -180..180 and will be caught
    coordinates: [
      [41.0, 200.0], // lat-first, out-of-range
      [41.05, 200.1],
    ] as [number, number][],
  },
  properties: null,
};
