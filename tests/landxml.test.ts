import { describe, it, expect } from 'vitest';
import { parseLandXml } from '@/lib/landxml';

// EPSG:5254 (TUREF / TM30) — reprojectToWGS84(5254, 600000, 4570000) ≈ [29°E, 41.3°N].
// LandXML point text is "northing easting [elevation]".
const FIXTURE = `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2">
  <Alignments>
    <Alignment name="Test Hat" staStart="1000" length="2000">
      <CoordGeom>
        <Line><Start>4570000 600000</Start><End>4570000 601000</End></Line>
        <Line><Start>4570000 601000</Start><End>4571000 601000</End></Line>
      </CoordGeom>
      <Profile>
        <ProfAlign name="P1">
          <PVI>1000 100.0</PVI>
          <PVI>2000 150.0</PVI>
          <PVI>3000 120.0</PVI>
        </ProfAlign>
      </Profile>
    </Alignment>
  </Alignments>
</LandXML>`;

describe('parseLandXml', () => {
  it('parses alignment name, staStart, and a densified polyline', () => {
    const r = parseLandXml(FIXTURE, 5254);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe('Test Hat');
    expect(r.staStart).toBe(1000);
    expect(r.coords.length).toBe(3); // two collinear lines share a vertex
    expect(r.lengthM).toBeGreaterThan(1900);
    expect(r.lengthM).toBeLessThan(2100);
  });

  it('computes stationing as staStart + cumulative length', () => {
    const r = parseLandXml(FIXTURE, 5254);
    if (!r.ok) throw new Error('parse failed');
    expect(r.stations[0]).toBeCloseTo(1000, 0);
    expect(r.stations[1]).toBeCloseTo(2000, 0);
    expect(r.stations[2]).toBeCloseTo(3000, 0);
  });

  it('interpolates designed elevation from the vertical profile (PVIs)', () => {
    const r = parseLandXml(FIXTURE, 5254);
    if (!r.ok) throw new Error('parse failed');
    expect(r.hasVerticalProfile).toBe(true);
    expect(r.elevations).toHaveLength(3);
    expect(r.elevations[0]).toBeCloseTo(100, 1);
    expect(r.elevations[1]).toBeCloseTo(150, 1);
    expect(r.elevations[2]).toBeCloseTo(120, 1);
  });

  it('reprojects vertices to WGS84 within Turkey', () => {
    const r = parseLandXml(FIXTURE, 5254);
    if (!r.ok) throw new Error('parse failed');
    const [lng, lat] = r.coords[0];
    // Within Turkey's bounds (EPSG:5254 TM30 puts easting 600000 near ~31°E).
    expect(lng).toBeGreaterThan(25);
    expect(lng).toBeLessThan(45);
    expect(lat).toBeGreaterThan(36);
    expect(lat).toBeLessThan(42);
  });

  it('flags a missing vertical profile instead of failing', () => {
    const noProfile = FIXTURE.replace(/<Profile>[\s\S]*<\/Profile>/, '');
    const r = parseLandXml(noProfile, 5254);
    if (!r.ok) throw new Error('parse failed');
    expect(r.hasVerticalProfile).toBe(false);
    expect(r.elevations).toEqual([]);
    expect(r.warnings).toContain('no_vertical_profile');
  });

  it('densifies a Curve into multiple points', () => {
    const curve = `<?xml version="1.0"?>
<LandXML>
  <Alignments>
    <Alignment name="C" staStart="0" length="100">
      <CoordGeom>
        <Curve rot="ccw" radius="100">
          <Start>4570000 600100</Start>
          <Center>4570000 600000</Center>
          <End>4570100 600000</End>
        </Curve>
      </CoordGeom>
    </Alignment>
  </Alignments>
</LandXML>`;
    const r = parseLandXml(curve, 5254);
    if (!r.ok) throw new Error('parse failed');
    expect(r.coords.length).toBeGreaterThan(5); // arc densified
  });

  it('returns ok:false for non-LandXML input', () => {
    const r = parseLandXml('<foo><bar/></foo>', 5254);
    expect(r.ok).toBe(false);
  });
});
