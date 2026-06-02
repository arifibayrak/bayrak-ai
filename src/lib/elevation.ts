/**
 * src/lib/elevation.ts — server-side terrain elevation sampling.
 *
 * Samples elevations for a list of [lng,lat] coordinates from Mapbox Terrain-RGB
 * raster-DEM tiles (we already hold a Mapbox token, so no new vendor/account and
 * the commercial terms are already covered). Tiles are fetched once per unique
 * z/x/y and decoded with `sharp`; the RGB pixel under each coordinate is decoded
 * to metres with Mapbox's documented Terrain-RGB formula:
 *     height = -10000 + ((R * 65536 + G * 256 + B) * 0.1)
 *
 * NOTE: requires the Node.js runtime (sharp + network). Call only from Server
 * Actions / route handlers, never the edge.
 */

import 'server-only';
import sharp from 'sharp';

export const ELEVATION_SOURCE = 'mapbox-terrain-rgb';

const TILE_SIZE = 256;
const ZOOM = 14; // Terrain-RGB max zoom; finest reliable DEM detail.

function lngLatToTilePixel(lng: number, lat: number, z: number) {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  const xWorld = ((lng + 180) / 360) * n;
  const yWorld = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;
  const xtile = Math.floor(xWorld);
  const ytile = Math.floor(yWorld);
  // Clamp pixel to [0, TILE_SIZE-1] to stay in-bounds at tile edges.
  const px = Math.min(TILE_SIZE - 1, Math.max(0, Math.floor((xWorld - xtile) * TILE_SIZE)));
  const py = Math.min(TILE_SIZE - 1, Math.max(0, Math.floor((yWorld - ytile) * TILE_SIZE)));
  return { xtile, ytile, px, py };
}

function decodeTerrainRgb(r: number, g: number, b: number): number {
  return -10000 + (r * 65536 + g * 256 + b) * 0.1;
}

/**
 * sampleElevations — elevation (metres) for each input [lng,lat], in order.
 * Coordinates are grouped by DEM tile so each tile is fetched + decoded once.
 * Throws if NEXT_PUBLIC_MAPBOX_TOKEN is missing.
 */
export async function sampleElevations(
  coords: [number, number][],
): Promise<number[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN is not set — cannot sample elevation.');
  if (coords.length === 0) return [];

  // Group point indices by tile so each tile is fetched once.
  type Pix = { idx: number; px: number; py: number };
  const tiles = new Map<string, { xtile: number; ytile: number; pts: Pix[] }>();
  coords.forEach(([lng, lat], idx) => {
    const { xtile, ytile, px, py } = lngLatToTilePixel(lng, lat, ZOOM);
    const key = `${xtile}/${ytile}`;
    let entry = tiles.get(key);
    if (!entry) {
      entry = { xtile, ytile, pts: [] };
      tiles.set(key, entry);
    }
    entry.pts.push({ idx, px, py });
  });

  const out = new Array<number>(coords.length).fill(0);

  // Decode tiles with bounded concurrency (don't hammer the tiles API).
  const entries = [...tiles.values()];
  const CONCURRENCY = 6;
  for (let start = 0; start < entries.length; start += CONCURRENCY) {
    const batch = entries.slice(start, start + CONCURRENCY);
    await Promise.all(
      batch.map(async (entry) => {
        const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${ZOOM}/${entry.xtile}/${entry.ytile}.pngraw?access_token=${token}`;
        const res = await fetch(url);
        if (!res.ok) {
          // Missing tile (e.g. over open sea) → treat as sea level rather than fail the whole route.
          for (const p of entry.pts) out[p.idx] = 0;
          return;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
        const ch = info.channels; // 3 (RGB) or 4 (RGBA)
        const w = info.width;
        for (const p of entry.pts) {
          const i = (p.py * w + p.px) * ch;
          out[p.idx] = decodeTerrainRgb(data[i], data[i + 1], data[i + 2]);
        }
      }),
    );
  }

  return out;
}
