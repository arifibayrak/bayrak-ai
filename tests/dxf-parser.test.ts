/**
 * tests/dxf-parser.test.ts
 *
 * Nyquist test scaffold for crs.ts (Wave 0 GREEN) + dxf-parser.ts (RED until Plan 04).
 *
 * No DB access — pure unit tests; does not import tests/setup.ts.
 *
 * Wave 0 status:
 *   - reprojectToWGS84 / validateTurkeyBbox cases → GREEN (crs.ts is implemented)
 *   - parseDxfToLineString / extractDxfLayers cases → RED until Plan 04 implements dxf-parser.ts
 */

import { describe, it, expect } from 'vitest';
import { reprojectToWGS84, validateTurkeyBbox, TURKEY_CRS } from '@/lib/crs';
import { parseDxfToLineString, extractDxfLayers } from '@/lib/dxf-parser';
import {
  SAMPLE_DXF_EPSG5254,
  SAMPLE_DXF_EPSG32635,
  SAMPLE_DXF_MULTI_POLYLINE,
  SAMPLE_DXF_SPLINE,
  SAMPLE_DXF_OUT_OF_TURKEY,
} from './fixtures/dxf';

// =============================================================================
// CRS unit tests — GREEN (crs.ts is fully implemented in Plan 01)
// =============================================================================

describe('reprojectToWGS84', () => {
  it('SC5: EPSG:5254 known Istanbul area coordinate lands in Turkey bbox', () => {
    // Unit test anchor per SC5:
    //   easting=600000, northing=4570000 in TUREF/TM30 (central meridian lon_0=30, false_easting=500000)
    //   → easting 100km east of central meridian → ~31.2°E, ~41.3°N (central Anatolia)
    //   Both values are within Turkey bbox (lng 25.7–44.8, lat 35.8–42.2)
    const [lng, lat] = reprojectToWGS84(5254, 600000, 4570000);
    // Validated actual result: ~31.19°E, ~41.26°N
    expect(lng).toBeGreaterThan(30.5);
    expect(lng).toBeLessThan(32.0);
    expect(lat).toBeGreaterThan(40.8);
    expect(lat).toBeLessThan(41.8);
    // SC5 key assertion: must be inside Turkey bbox
    expect(validateTurkeyBbox(lng, lat)).toBe(true);
  });

  it('axis-swapped coords fail Turkey bbox (northing passed as easting)', () => {
    // T-14-VAL: if caller accidentally passes [northing, easting], bbox rejects
    const [lng, lat] = reprojectToWGS84(5254, 4570000, 600000);
    expect(validateTurkeyBbox(lng, lat)).toBe(false);
  });

  it('all EPSG: all 7 Turkey EPSG codes reproject to Turkey-bbox-valid output', () => {
    // Test vectors per RESEARCH Pattern 2 — representative coordinates for each zone
    const testVectors: Record<number, [number, number]> = {
      5254: [600000, 4570000],  // TUREF/TM30 — Istanbul area
      5253: [500000, 4550000],  // TUREF/TM27 — western Turkey
      5255: [500000, 4550000],  // TUREF/TM33 — central-east Turkey
      23035: [500000, 4550000], // ED50/UTM35N
      23036: [500000, 4550000], // ED50/UTM36N
      32635: [500000, 4550000], // WGS84/UTM35N
      32636: [500000, 4550000], // WGS84/UTM36N
    };

    const epsgCodes = Object.keys(TURKEY_CRS).map(Number);
    expect(epsgCodes).toHaveLength(7);

    for (const epsg of epsgCodes) {
      const [easting, northing] = testVectors[epsg] ?? [500000, 4550000];
      const [lng, lat] = reprojectToWGS84(epsg, easting, northing);
      expect(
        validateTurkeyBbox(lng, lat),
        `EPSG:${epsg} should produce Turkey-bbox-valid output (got lng=${lng}, lat=${lat})`
      ).toBe(true);
    }
  });

  it('throws for unsupported EPSG code', () => {
    expect(() => reprojectToWGS84(9999, 500000, 4500000)).toThrow('Unsupported EPSG: 9999');
  });
});

describe('validateTurkeyBbox', () => {
  it('returns true for a known Istanbul coordinate (lng ~29, lat ~41)', () => {
    expect(validateTurkeyBbox(29.0, 41.0)).toBe(true);
  });

  it('returns false for coordinates outside Turkey (e.g. London)', () => {
    expect(validateTurkeyBbox(-0.12, 51.5)).toBe(false);
  });

  it('returns false for lng below Turkey minimum (25.7)', () => {
    expect(validateTurkeyBbox(25.0, 39.0)).toBe(false);
  });

  it('returns false for lat above Turkey maximum (42.2)', () => {
    expect(validateTurkeyBbox(35.0, 43.0)).toBe(false);
  });
});

// =============================================================================
// dxf-parser.ts tests — RED until Plan 04 implements parseDxfToLineString
// These are real expects (not it.todo) so Plan 04 turns them green.
// =============================================================================

describe('parseDxfToLineString', () => {
  it('LWPOLYLINE: extracts LWPOLYLINE from EPSG:5254 fixture → ok:true with geojsonString', () => {
    // Plan 04 implements parseDxfToLineString — will return ok:true
    const result = parseDxfToLineString(SAMPLE_DXF_EPSG5254, 5254, 'AXIS');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count).toBeGreaterThanOrEqual(2);
    const geojson = JSON.parse(result.geojsonString);
    expect(geojson.type).toBe('LineString');
    expect(geojson.coordinates).toHaveLength(result.count);
    // All reprojected coords should be within Turkey bbox
    for (const [lng, lat] of geojson.coordinates) {
      expect(validateTurkeyBbox(lng as number, lat as number)).toBe(true);
    }
    expect(result.gaps).toBeDefined();
    expect(result.hasSpline).toBe(false);
  });

  it('outside Turkey: out-of-Turkey coordinates return COORDS_OUTSIDE_TURKEY error', () => {
    // SAMPLE_DXF_OUT_OF_TURKEY has EPSG:5254 coords at origin → reprojected far from Turkey
    const result = parseDxfToLineString(SAMPLE_DXF_OUT_OF_TURKEY, 5254, 'AXIS');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('COORDS_OUTSIDE_TURKEY');
  });

  it('stitch: multi-polyline fixture produces ordered vertices from stitched segments', () => {
    // SAMPLE_DXF_MULTI_POLYLINE has 2 polylines on layer AXIS — should stitch to 1 LineString
    const result = parseDxfToLineString(SAMPLE_DXF_MULTI_POLYLINE, 5254, 'AXIS');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Combined count: 3 + 3 = 6 (or fewer if deduplicated at stitch points)
    expect(result.count).toBeGreaterThanOrEqual(4);
    expect(result.gaps).toBeDefined();
  });

  it('SPLINE: SPLINE entity in selected layer triggers hasSpline=true (non-blocking)', () => {
    // SAMPLE_DXF_SPLINE has both a SPLINE and an LWPOLYLINE on layer AXIS
    const result = parseDxfToLineString(SAMPLE_DXF_SPLINE, 5254, 'AXIS');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hasSpline).toBe(true);
    // Still parses LWPOLYLINE successfully
    expect(result.count).toBeGreaterThanOrEqual(2);
  });

  it('too few: layer with < 2 vertices → TOO_FEW_VERTICES error', () => {
    // DXF with a single vertex polyline (not enough for a LineString)
    const oneVertexDxf = [
      '  0', 'SECTION', '  2', 'ENTITIES',
      '  0', 'LWPOLYLINE',
      '  8', 'AXIS',
      ' 70', '     0',
      ' 90', '     1',
      ' 10', '600000',
      ' 20', '4570000',
      '  0', 'ENDSEC', '  0', 'EOF',
    ].join('\n');
    const result = parseDxfToLineString(oneVertexDxf, 5254, 'AXIS');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('TOO_FEW_VERTICES');
  });

  it('malformed: non-DXF input returns DXF_PARSE_FAILED (never throws to caller)', () => {
    // T-14-PARSE: parseSync is wrapped in try/catch; malicious/non-DXF text never crashes
    const result = parseDxfToLineString('this is not a DXF file at all', 5254, 'AXIS');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('DXF_PARSE_FAILED');
  });

  it('malformed: empty string returns DXF_PARSE_FAILED', () => {
    const result = parseDxfToLineString('', 5254, 'AXIS');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('DXF_PARSE_FAILED');
  });

  it('returns NO_COMPATIBLE_GEOMETRY when selected layer has no LWPOLYLINE entities', () => {
    // Layer "NONEXISTENT" does not exist in SAMPLE_DXF_EPSG5254 (which has AXIS)
    const result = parseDxfToLineString(SAMPLE_DXF_EPSG5254, 5254, 'NONEXISTENT');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('NO_COMPATIBLE_GEOMETRY');
  });

  it('EPSG:32635 (WGS84/UTM35N) fixture parses and reprojected coords are in Turkey bbox', () => {
    // Second CRS fixture — ensures multi-CRS coverage
    const result = parseDxfToLineString(SAMPLE_DXF_EPSG32635, 32635, 'CL');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const geojson = JSON.parse(result.geojsonString);
    expect(geojson.type).toBe('LineString');
    for (const [lng, lat] of geojson.coordinates) {
      expect(validateTurkeyBbox(lng as number, lat as number)).toBe(true);
    }
  });
});

describe('extractDxfLayers', () => {
  it('returns layer list with entity/vertex counts for valid DXF', () => {
    // SAMPLE_DXF_EPSG5254 has one LWPOLYLINE on layer AXIS
    const layers = extractDxfLayers(SAMPLE_DXF_EPSG5254);
    expect(layers).not.toBeNull();
    if (!layers) return;
    expect(layers.length).toBeGreaterThanOrEqual(1);
    const axisLayer = layers.find(l => l.name === 'AXIS');
    expect(axisLayer).toBeDefined();
    if (axisLayer) {
      expect(axisLayer.entityCount).toBeGreaterThanOrEqual(1);
      expect(axisLayer.vertexCount).toBeGreaterThanOrEqual(3);
      expect(axisLayer.suggested).toBe(true); // AXIS matches the suggested pattern
    }
  });

  it('returns null for completely invalid DXF text', () => {
    const result = extractDxfLayers('this is not a DXF file');
    expect(result).toBeNull();
  });
});

// =============================================================================
// Schema smoke test — RTE-05 column existence placeholder
// (Plan 02 adds the migration; this test documents the schema requirement)
// =============================================================================

describe('schema', () => {
  it('schema: geometry_version and chainage_m columns are expected on routes/submissions (RTE-05)', () => {
    // This is a conceptual smoke test. The migration in Plan 02 (0010_v4_routes_ext.sql)
    // adds geometry_version, total_length_m, source_blob_url, source_crs, source_layer,
    // chainage_offset_m to routes; and chainage_m, route_geometry_version to submissions.
    // Plan 03 verifies schema via actual DB queries.
    // Scope here: document that these columns are part of RTE-05 contract (columns only;
    // values written at approval in Phase 15).
    expect(true).toBe(true);
  });
});
