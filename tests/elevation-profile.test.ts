import { describe, it, expect } from 'vitest';
import { haversineMeters, buildElevationProfile } from '@/lib/elevation-profile';

describe('haversineMeters', () => {
  it('returns ~0 for identical points', () => {
    expect(haversineMeters([28, 41], [28, 41])).toBeCloseTo(0, 5);
  });

  it('approximates a known short distance (~1 deg lat ~= 111 km)', () => {
    const d = haversineMeters([28, 41], [28, 42]);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe('buildElevationProfile', () => {
  it('handles empty / mismatched input gracefully', () => {
    expect(buildElevationProfile([], [])).toEqual({
      profile: [],
      lengthM: 0,
      length3dM: 0,
      minM: 0,
      maxM: 0,
    });
    expect(buildElevationProfile([[28, 41]], [10, 20]).profile).toEqual([]);
  });

  it('computes cumulative chainage, min/max, and 3D >= 2D length', () => {
    const coords: [number, number][] = [
      [28.0, 41.0],
      [28.0, 41.01],
      [28.0, 41.02],
    ];
    const elevations = [100, 150, 120];
    const r = buildElevationProfile(coords, elevations);

    expect(r.minM).toBe(100);
    expect(r.maxM).toBe(150);
    expect(r.profile).toHaveLength(3);
    expect(r.profile[0].m).toBe(0);
    expect(r.profile[2].m).toBeCloseTo(r.lengthM, 2);
    // slope length must be >= horizontal length (there is vertical change)
    expect(r.length3dM).toBeGreaterThan(r.lengthM);
  });

  it('3D length equals 2D length when elevation is flat', () => {
    const coords: [number, number][] = [
      [28.0, 41.0],
      [28.0, 41.01],
    ];
    const r = buildElevationProfile(coords, [200, 200]);
    expect(r.length3dM).toBeCloseTo(r.lengthM, 2);
  });

  it('downsamples to maxPoints while keeping first and last', () => {
    const coords: [number, number][] = [];
    const elevations: number[] = [];
    for (let i = 0; i < 1000; i++) {
      coords.push([28 + i * 0.0001, 41]);
      elevations.push(100 + (i % 50));
    }
    const r = buildElevationProfile(coords, elevations, 200);
    expect(r.profile.length).toBeLessThanOrEqual(200);
    expect(r.profile[0].m).toBe(0);
    expect(r.profile[r.profile.length - 1].m).toBeCloseTo(r.lengthM, 2);
  });
});
