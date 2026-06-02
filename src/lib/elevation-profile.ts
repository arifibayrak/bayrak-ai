/**
 * src/lib/elevation-profile.ts — pure helpers to turn a route's (lng,lat) coords
 * plus sampled elevations into a vertical profile + 3D stats. No framework / IO,
 * so it is unit-testable and safe to import anywhere.
 */

import type { ElevationProfilePoint } from '@/db/schema/routes';

const EARTH_RADIUS_M = 6_371_008.8; // mean Earth radius (IUGG)

/** Great-circle distance in metres between two [lng,lat] points (haversine). */
export function haversineMeters(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export type ElevationProfileResult = {
  profile: ElevationProfilePoint[]; // downsampled chainage(m) → elevation(m)
  lengthM: number;                  // horizontal (2D) length
  length3dM: number;                // slope (3D) length using sampled Z
  minM: number;
  maxM: number;
};

/**
 * buildElevationProfile — combine planar coords with per-vertex elevations.
 *
 * Cumulative horizontal chainage is haversine between consecutive vertices; 3D
 * length adds the vertical component per segment (sqrt(dHoriz² + dZ²)). The
 * returned profile is downsampled to at most `maxPoints` samples (first and last
 * always kept) so it can be stored as compact JSON and charted cheaply.
 */
export function buildElevationProfile(
  coords: [number, number][],
  elevations: number[],
  maxPoints = 400,
): ElevationProfileResult {
  if (coords.length === 0 || coords.length !== elevations.length) {
    return { profile: [], lengthM: 0, length3dM: 0, minM: 0, maxM: 0 };
  }

  const cumulative: number[] = [0];
  let lengthM = 0;
  let length3dM = 0;
  let minM = elevations[0];
  let maxM = elevations[0];

  for (let i = 1; i < coords.length; i++) {
    const horiz = haversineMeters(coords[i - 1], coords[i]);
    const dz = elevations[i] - elevations[i - 1];
    lengthM += horiz;
    length3dM += Math.sqrt(horiz * horiz + dz * dz);
    cumulative.push(lengthM);
    if (elevations[i] < minM) minM = elevations[i];
    if (elevations[i] > maxM) maxM = elevations[i];
  }

  // Downsample to <= maxPoints, always keeping the first and last vertex.
  const n = coords.length;
  const profile: ElevationProfilePoint[] = [];
  if (n <= maxPoints) {
    for (let i = 0; i < n; i++) {
      profile.push({ m: round2(cumulative[i]), z: round2(elevations[i]) });
    }
  } else {
    const stride = (n - 1) / (maxPoints - 1);
    for (let k = 0; k < maxPoints; k++) {
      const i = k === maxPoints - 1 ? n - 1 : Math.round(k * stride);
      profile.push({ m: round2(cumulative[i]), z: round2(elevations[i]) });
    }
  }

  return {
    profile,
    lengthM: round2(lengthM),
    length3dM: round2(length3dM),
    minM: round2(minM),
    maxM: round2(maxM),
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
