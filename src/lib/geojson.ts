/**
 * src/lib/geojson.ts
 *
 * Server-side GeoJSON LineString validation (D-07, SETUP-03).
 * Called by the uploadRoute Server Action before any DB write.
 *
 * Security: validates that uploaded files are a single WGS84 LineString
 * before the geometry string is passed to ST_GeomFromGeoJSON.
 * Coordinate order is [lng, lat] per GeoJSON spec.
 */

import { z } from 'zod';

/** [lng, lat] pair — lng in -180..180, lat in -90..90; optional elevation allowed */
const lngLatPair = z.tuple([
  z.number().min(-180).max(180),  // longitude first (X)
  z.number().min(-90).max(90),    // latitude second (Y)
]).rest(z.number());              // optional elevation allowed

const lineStringGeometry = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(lngLatPair).min(2, 'Route must have at least 2 coordinate points'),
});

const geojsonFeature = z.object({
  type: z.literal('Feature'),
  geometry: lineStringGeometry,
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
});

const geojsonFeatureCollection = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(geojsonFeature).min(1, 'FeatureCollection must contain at least one Feature'),
});

export type LineStringValidationResult =
  | { ok: true; coordinates: [number, number][]; count: number; geojsonString: string }
  | { ok: false; error: string; actualType?: string };

/**
 * validateLineStringGeoJSON — parses and validates a raw GeoJSON string.
 *
 * Accepts:
 * - GeoJSON Feature with geometry.type === 'LineString'
 * - GeoJSON FeatureCollection whose first Feature has geometry.type === 'LineString'
 *
 * Returns the geometry-only JSON string (NOT the Feature wrapper) so it can
 * be passed directly to ST_GeomFromGeoJSON() — Pitfall 4: pass geometry, not Feature.
 *
 * Error codes:
 * - NOT_VALID_JSON  — input is not parseable JSON
 * - NOT_LINESTRING  — valid GeoJSON Feature/FeatureCollection but geometry is not LineString
 * - NOT_GEOJSON     — valid JSON but not a recognizable GeoJSON structure
 */
export function validateLineStringGeoJSON(rawJson: string): LineStringValidationResult {
  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: 'NOT_VALID_JSON' };
  }

  // Step 2: Try Feature first
  const featureResult = geojsonFeature.safeParse(parsed);
  if (featureResult.success) {
    const coords = featureResult.data.geometry.coordinates as [number, number][];
    return {
      ok: true,
      coordinates: coords,
      count: coords.length,
      // Return ONLY the geometry object — not the Feature wrapper (Pitfall 4)
      geojsonString: JSON.stringify(featureResult.data.geometry),
    };
  }

  // Step 3: Try FeatureCollection
  const fcResult = geojsonFeatureCollection.safeParse(parsed);
  if (fcResult.success) {
    const geom = fcResult.data.features[0].geometry;
    const coords = geom.coordinates as [number, number][];
    return {
      ok: true,
      coordinates: coords,
      count: coords.length,
      geojsonString: JSON.stringify(geom),
    };
  }

  // Step 4: Check if it's a Feature/FeatureCollection with wrong geometry type
  const asObj = parsed as Record<string, unknown>;
  if (asObj?.type === 'Feature' || asObj?.type === 'FeatureCollection') {
    // Extract the actual geometry type for a specific error message
    const geomType =
      (asObj?.geometry as Record<string, unknown>)?.type as string | undefined ??
      (asObj?.features as Array<{ geometry: { type: string } }>)?.[0]?.geometry?.type;

    if (geomType && geomType !== 'LineString') {
      return { ok: false, error: 'NOT_LINESTRING', actualType: geomType };
    }
  }

  // Step 5: Valid JSON but not recognizable GeoJSON
  return { ok: false, error: 'NOT_GEOJSON' };
}
