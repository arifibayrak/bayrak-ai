/**
 * tests/geojson.test.ts
 *
 * Unit tests for validateLineStringGeoJSON (src/lib/geojson.ts).
 * These tests cover the 5 behavior cases required by plan 01-06.
 * No DB access needed — pure unit tests.
 */

import { describe, it, expect } from 'vitest';
import { validateLineStringGeoJSON } from '@/lib/geojson';
import {
  validLineStringFeature,
  invalidPolygonFeatureCollection,
  latFirstOutOfRangeFeature,
} from './fixtures/geojson';

describe('validateLineStringGeoJSON', () => {
  it('accepts a valid LineString Feature and returns ok:true with coordinates + count + geometry-only string', () => {
    const json = JSON.stringify(validLineStringFeature);
    const result = validateLineStringGeoJSON(json);

    expect(result.ok).toBe(true);
    if (!result.ok) return; // type narrowing

    // Should have 3 coordinate pairs
    expect(result.count).toBe(3);
    expect(result.coordinates).toHaveLength(3);
    expect(result.coordinates[0]).toEqual([28.9, 41.0]);

    // geojsonString should be the geometry object only (NOT the Feature wrapper)
    const parsed = JSON.parse(result.geojsonString);
    expect(parsed.type).toBe('LineString');
    expect(parsed).not.toHaveProperty('properties'); // no Feature wrapper
    expect(parsed).not.toHaveProperty('type', 'Feature'); // no Feature wrapper
    expect(parsed).toHaveProperty('coordinates');
  });

  it('rejects a FeatureCollection with Polygon geometry → ok:false, error=NOT_LINESTRING, actualType=Polygon', () => {
    const json = JSON.stringify(invalidPolygonFeatureCollection);
    const result = validateLineStringGeoJSON(json);

    expect(result.ok).toBe(false);
    if (result.ok) return; // type narrowing

    expect(result.error).toBe('NOT_LINESTRING');
    expect(result.actualType).toBe('Polygon');
  });

  it('rejects coordinates with lat/lng swapped (lat>90 as lng) → ok:false', () => {
    const json = JSON.stringify(latFirstOutOfRangeFeature);
    const result = validateLineStringGeoJSON(json);

    expect(result.ok).toBe(false);
    // Coordinates [41, 200] have 200 exceeding max longitude 180 → zod range check
    // Should fail validation (may return NOT_LINESTRING or NOT_GEOJSON based on which check runs)
    expect(['NOT_LINESTRING', 'NOT_GEOJSON']).toContain(result.error);
  });

  it('rejects non-JSON input → ok:false, error=NOT_VALID_JSON', () => {
    const result = validateLineStringGeoJSON('not valid json {{{');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('NOT_VALID_JSON');
  });

  it('rejects valid JSON that is not GeoJSON → ok:false, error=NOT_GEOJSON', () => {
    const result = validateLineStringGeoJSON('{"hello": "world", "number": 42}');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe('NOT_GEOJSON');
  });
});
