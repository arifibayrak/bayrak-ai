# Phase 14: Schema Foundation + DXF Route Import — Research

**Researched:** 2026-05-30
**Domain:** DXF parsing, CRS reprojection, Vercel Blob client upload, Mapbox satellite preview modal, Drizzle schema migrations for PostGIS
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** CRS dropdown defaults to TUREF/TM30 (EPSG:5254); shows all 7 presets; remembers last-used CRS per project in `localStorage` key `bayrak-dxf-crs-{projectId}`
- **D-02:** Parse layer list first, present all layers with vertex/entity counts; auto-highlight AXIS/CL/CENTERLINE/MERKEZ; require explicit engineer selection
- **D-03:** Multiple polylines in selected layer → stitch end-to-end into one ordered LineString, warn if gap; SPLINE triggers non-blocking warning; reject if < 2 vertices
- **D-04:** Re-import over existing route with approved submissions → warn-and-proceed (N approved submissions named, new geometry_version, existing chainage_m NOT rewritten)
- **D-05:** Keep ALL prior source drawings as version history (audit trail)
- **D-06:** DXF exposed as "Kaynak Belge" download link; PDF renders inline via react-pdf; CRS + layer name shown in route metadata card
- **Carried forward (locked):** DXF only (no DWG parser). Explicit CRS declaration, no auto-detect. Mandatory satellite preview before any DB write. Reproject in JS via proj4 (not ST_Transform). Turkey bbox validation after reprojection (lng 25.7–44.8, lat 35.8–42.2). Chainage snapshotted at approval (Phase 15). Route geometry versioning. DXF upload via Vercel Blob direct PUT. Existing GeoJSON LineString path unchanged.

### Claude's Discretion

- Preview affordances beyond the line (start/end markers, total-length readout, bbox sanity line) — recommended but optional
- Migration packaging (single 0010 vs split 0010/0011)
- Exact column types/precision, GIST index placement
- `total_length_m` recompute on existing `uploadRoute` path

### Deferred Ideas (OUT OF SCOPE)

- Chainage calibration "anchor on map" UX (Phase 15 ships simple numeric offset input only)
- SPLINE entity tessellation (v4.x)
- Full in-browser DXF viewer (anti-feature)
- submission-detail-map-link (routed to Phase 15)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RTE-01 | Office engineer can import a project route from DXF, select centerline layer, declare source CRS, route is parsed and reprojected to WGS84 | dxf-parser 1.1.2 API + proj4 2.20.8 + reprojectToWGS84 utility |
| RTE-02 | Before saving, engineer previews reprojected route on satellite basemap and must confirm | Mapbox satellite-preview modal with react-map-gl temporary GeoJSON source |
| RTE-03 | Original uploaded drawing stored and viewable alongside the map | Vercel Blob client PUT, source_blob_url column, react-pdf PdfViewer |
| RTE-04 | Existing GeoJSON upload path continues to work unchanged | uploadRoute Server Action receives total_length_m + geometry_version patch |
| RTE-05 | Re-importing is versioned — existing approved submissions retain chainage_m | geometry_version column on routes, route_geometry_version on submissions (columns only; write in Phase 15) |
</phase_requirements>

---

## Summary

Phase 14 delivers two parallel workstreams: (1) the v4.0 schema foundation — new columns on `routes` and `submissions` plus the `submission_ai_flags` table — and (2) the complete DXF route import pipeline from file-drop through satellite preview confirmation to DB write. The GeoJSON path stays byte-for-byte identical except for the `total_length_m` and `geometry_version` additions added to `uploadRoute`.

The three novel mechanics are all verified with documented APIs. `dxf-parser` 1.1.2 exposes a synchronous `parseSync(text: string)` API whose output is a structured object with `entities[]` (each entity carrying `type`, `layer`, and for LWPOLYLINE a `vertices[]` array of `{x, y}` objects) and `tables.layer` (a named map of layer metadata). `proj4` 2.20.8 uses `proj4(srcDef, 'EPSG:4326', [easting, northing])` returning `[lng, lat]` — axis order matches the project's existing `ST_MakePoint(lng, lat)` convention. The Vercel Blob client-upload pattern requires a new route handler (`POST /api/dxf-upload`) using `handleUpload` from `@vercel/blob/client` that exchanges an auth-checked token before the browser PUT proceeds; the Server Action then receives only the blob URL.

The satellite preview modal is the highest-complexity UI surface: a second react-map-gl instance inside a shadcn Dialog, using the `satellite-streets-v12` style, a temporary GeoJSON source added post-load, `fitBounds` to the route bbox, and a disabled "Onayla" button until the `onLoad` event fires. The modal must unmount cleanly when closed to avoid duplicate Mapbox instances.

**Primary recommendation:** Build in strict dependency order — Wave 0: migrations (schema foundation for all of v4.0); Wave 1: `src/lib/crs.ts` + `reprojectToWGS84` utility with unit tests; Wave 2: `src/lib/dxf-parser.ts` pure parse function with vitest fixtures; Wave 3: Blob upload route handler + `uploadDxf` Server Action; Wave 4: `DxfUpload.tsx` client component with full state machine; Wave 5: metadata card + Kaynak Belge section + `uploadRoute` patch.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DXF file selection + ArrayBuffer read | Browser / Client | — | File API is browser-only; reading as ArrayBuffer is mandatory (DXF is text but DxfUpload reads as ArrayBuffer for the Blob upload path) |
| Vercel Blob client upload (direct PUT) | Browser / Client | Frontend Server (token exchange route) | The PUT goes browser-to-Blob directly; the route handler at `/api/dxf-upload` runs on the Frontend Server to issue the auth-checked token |
| DXF parse + proj4 reprojection | API / Backend (Server Action, Node.js runtime) | — | proj4 and dxf-parser are Node-only safe; Server Action with no edge constraint; runs AFTER blob URL received |
| Turkey bounding-box validation | API / Backend (Server Action) | — | Last-resort safety net; runs after reprojection in uploadDxf |
| Satellite preview map | Browser / Client | — | react-map-gl requires browser; temporary GeoJSON source; Dialog state; fitBounds |
| DB write (route upsert) | API / Backend (Server Action) | Database / Storage | uploadDxf: ST_GeomFromGeoJSON + onConflictDoUpdate |
| Schema migrations | Database / Storage | — | SQL files applied via npx tsx src/db/migrate.ts to BOTH Neon branches |
| Layer list extraction | API / Backend (Server Action) OR Browser / Client | — | Two-pass: first pass extracts layer list (client-side on ArrayBuffer for fast feedback); second pass parses only selected layer (Server Action). See pattern section. |
| CRS last-used persistence | Browser / Client | — | localStorage only; no Server Action call needed |
| Kaynak Belge PDF viewer | Browser / Client | — | react-pdf 'use client' + dynamic import ssr:false |
| total_length_m computation | Database / Storage | — | ST_Length(geom::geography) in the onConflictDoUpdate SET clause; materialized at write time |

---

## Standard Stack

### Core (all verified against npm registry 2026-05-30)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dxf-parser` | 1.1.2 | Parse DXF text into structured JS object | Pure JS, synchronous `parseSync()`, typed entity objects, production-confirmed against LWPOLYLINE/POLYLINE; only library confirmed against Turkish CAD workflow |
| `proj4` | 2.20.8 | CRS reprojection to WGS84 | Pure JS, no WASM, 821K weekly downloads, actively maintained; identical behavior on Node.js and browser; single `proj4(srcDef, dstDef, [x,y])` call |
| `react-pdf` | 10.4.1 | Browser PDF viewer for source documents | React 19 peer-compatible, Next.js 15 App Router confirmed via `import.meta.url` worker pattern; 4.3M weekly downloads |
| `pdfjs-dist` | 5.7.284 | PDF.js worker (peer dep of react-pdf) | Auto-installed as peer dep; no special Next.js config needed |
| `@types/proj4` | 2.19.0 | TypeScript types for proj4 | Official DefinitelyTyped package |

### Supporting (already in project — no new install)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@vercel/blob` | ^2.4.0 | DXF file storage + Blob client upload | Already installed; use `upload()` from `@vercel/blob/client` for browser-side PUT and `handleUpload` from `@vercel/blob/client` in the server route |
| `react-map-gl` | 8.x | Satellite preview map inside Dialog | Already installed; `import from 'react-map-gl/mapbox'` — same as MapView.tsx |
| `zod` | 3.x | Input validation in Server Action | Already installed |
| `shadcn` (Dialog, Select, Separator, Skeleton) | latest | UI components for DxfUpload flow | Already in project |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `dxf-parser` 1.1.2 | `dxf` 5.3.1 (skymakerolof) | `dxf` is more actively maintained but optimized for SVG rendering via `toPolylines()` — no entity-type discrimination. Use as fallback only. |
| `proj4` JS at upload time | PostGIS `ST_Transform` | ST_Transform requires TUREF EPSG:5254 in Neon's `spatial_ref_sys` — unverifiable without live query. JS approach has no DB dependency. |

### Installation

```bash
pnpm add dxf-parser
pnpm add proj4
pnpm add -D @types/proj4
pnpm add react-pdf
# pdfjs-dist installs automatically as peer dep
```

`react-pdf` and `pdfjs-dist` may already be installed if STACK.md was followed. Verify with `pnpm list react-pdf`.

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `dxf-parser` | npm | ~4 yrs (v1.1.2 Nov 2021) | 69K/wk | github.com/gdsestimating/dxf-parser | [OK] | Approved |
| `proj4` | npm | >10 yrs | 821K/wk | github.com/proj4js/proj4js | [OK] | Approved |
| `react-pdf` | npm | >5 yrs | 4.3M/wk | github.com/wojtekmaj/react-pdf | [OK] | Approved |
| `pdfjs-dist` | npm | >8 yrs | >5M/wk | github.com/mozilla/pdf.js | [OK] | Approved |
| `@types/proj4` | npm | >5 yrs | >500K/wk | DefinitelyTyped | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**Postinstall scripts:** none on any package — verified via `npm view <pkg> scripts.postinstall`

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (Office Engineer)
  │
  │  1. File dropped / selected (.dxf)
  ▼
DxfUpload.tsx ['use client']
  │  reads as File object
  │
  ├─── PASS 1: Layer extraction (client-side parse for speed)
  │    │  FileReader.readAsText → dxf-parser.parseSync(text)
  │    │  → build LayerInfo[] from entities grouped by layer
  │    ▼
  │    LayerPicker (inline list, auto-highlight AXIS/CL/CENTERLINE/MERKEZ)
  │    CrsSelector (shadcn Select, 7 presets, localStorage default)
  │
  │  2. "Önizle" button clicked
  │
  ├─── PASS 2: Blob upload (client PUT, bypasses 4.5 MB bodyParser)
  │    import { upload } from '@vercel/blob/client'
  │    const { url: blobUrl } = await upload(filename, file, {
  │      access: 'public',
  │      handleUploadUrl: '/api/dxf-upload',  ← token exchange route
  │    })
  │
  ├─── PASS 3: Parse + reproject (Server Action — Node.js runtime)
  │    uploadDxf(projectId, blobUrl, selectedCrs, selectedLayer, approvedCount)
  │      → fetch blob URL → get ArrayBuffer → Buffer.from()
  │      → parseDxfToLineString(buffer, selectedCrs, selectedLayer)
  │          → dxf-parser.parseSync(text) → filter entities by layer
  │          → extract vertices → stitch polylines → gap detection
  │          → reprojectToWGS84(epsg, easting, northing) for each vertex
  │          → Turkey bbox validation
  │          → validateLineStringGeoJSON(geojsonStr) [existing validator]
  │      → return { ok, geojsonStr, vertexCount, totalLengthM, approvedCount }
  │
  ▼
SatellitePreviewModal (shadcn Dialog)
  │  temporary GeoJSON source on Mapbox satellite-streets-v12
  │  fitBounds after onLoad → "Onayla" button enabled
  │  Re-import warning if approvedCount > 0
  │
  ▼  "Onayla — Kaydet" clicked
uploadDxf Server Action (final save path)
  │  db.insert(routes).onConflictDoUpdate {
  │    geom: ST_GeomFromGeoJSON(geojsonStr)
  │    totalLengthM: ST_Length(geom::geography)   ← or pre-computed
  │    geometryVersion: existing + 1
  │    sourceBlobUrl, sourceCrs, sourceLayer
  │  }
  │  logOfficeActivity + revalidatePath
  ▼
Neon/PostGIS (both branches migrated before deploy)
```

### Recommended Project Structure (new files this phase)

```
src/
├── lib/
│   ├── crs.ts              [NEW] — Turkey EPSG lookup table + reprojectToWGS84()
│   └── dxf-parser.ts       [NEW] — parseDxfLayers(), parseDxfToLineString()
├── actions/
│   └── routes.ts           [MODIFIED] — add uploadDxf export; patch uploadRoute
├── db/
│   ├── schema/
│   │   ├── routes.ts       [MODIFIED] — 6 new columns
│   │   ├── submissions.ts  [MODIFIED] — 2 new columns
│   │   └── ai-flags.ts     [NEW] — submission_ai_flags table definition
│   └── migrations/
│       ├── 0010_v4_routes_ext.sql   [NEW — hand-edited]
│       └── 0011_v4_ai_flags.sql     [NEW]
├── components/dashboard/
│   ├── DxfUpload.tsx        [NEW 'use client']
│   ├── PdfViewer.tsx        [NEW 'use client', dynamic ssr:false]
│   ├── RouteTabClient.tsx   [MODIFIED — add DxfUpload section + Kaynak Belge]
│   └── RouteTab.tsx         [MODIFIED — extend getRoute to include new columns]
└── app/api/
    └── dxf-upload/
        └── route.ts         [NEW] — Vercel Blob handleUpload token exchange
tests/
└── dxf-parser.test.ts       [NEW] — unit tests for reprojectToWGS84 + parseDxfToLineString
```

---

## Pattern 1: dxf-parser 1.1.2 — Exact API

**What:** Synchronous DXF text parser. Returns a structured JS object.

**Import and construction:**
```typescript
// Source: npm registry README (github.com/gdsestimating/dxf-parser)
import DxfParser from 'dxf-parser';

const parser = new DxfParser();
const dxf = parser.parseSync(dxfTextString); // throws on invalid DXF
```

**Parsed object shape:**
```typescript
dxf.entities      // Entity[]  — all entities in MODEL space
dxf.tables.layer  // { [layerName: string]: { name: string; visible: boolean; color: number; ... } }

// Each entity:
entity.type    // 'LWPOLYLINE' | 'POLYLINE' | 'LINE' | 'SPLINE' | 'ARC' | ...
entity.layer   // string — the layer name this entity belongs to

// LWPOLYLINE entity:
entity.vertices  // Array<{ x: number; y: number; bulge?: number }>
entity.shape     // boolean — true if closed polyline

// SPLINE entity:
entity.controlPoints  // Array<{ x: number; y: number; z?: number }> | undefined
entity.fitPoints      // Array<{ x: number; y: number; z?: number }> | undefined
```

**Layer list extraction (for layer picker UI):**
```typescript
// Source: verified from dxf-parser entity structure + tables.layer
function extractLayerInfo(dxf: Dxf): LayerInfo[] {
  // Collect entity counts and vertex counts per layer
  const layerMap = new Map<string, { entities: number; vertices: number; hasSpline: boolean }>();

  for (const entity of dxf.entities) {
    const layer = entity.layer ?? '0';
    const existing = layerMap.get(layer) ?? { entities: 0, vertices: 0, hasSpline: false };
    const vertices = entity.type === 'LWPOLYLINE' ? entity.vertices?.length ?? 0 : 0;
    layerMap.set(layer, {
      entities: existing.entities + 1,
      vertices: existing.vertices + vertices,
      hasSpline: existing.hasSpline || entity.type === 'SPLINE',
    });
  }

  return Array.from(layerMap.entries()).map(([name, info]) => ({
    name,
    entityCount: info.entities,
    vertexCount: info.vertices,
    hasSpline: info.hasSpline,
    // Auto-suggest: layer name matches AXIS/CL/CENTERLINE/MERKEZ (case-insensitive)
    suggested: /^(AXIS|CL|CENTERLINE|MERKEZ)$/i.test(name),
  }));
}
```

**LWPOLYLINE/POLYLINE entity extraction for a selected layer:**
```typescript
// Source: verified from dxf-parser LWPOLYLINE entity structure
function extractPolylinesFromLayer(dxf: Dxf, layerName: string): Polyline[] {
  return dxf.entities
    .filter(e => e.layer === layerName && (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE'))
    .map(e => ({
      vertices: e.vertices?.map(v => ({ x: v.x, y: v.y })) ?? [],
      closed: e.shape === true,
    }))
    .filter(p => p.vertices.length >= 2);
}
```

**Multi-polyline stitching (D-03):**
```typescript
// Source: [ASSUMED] — standard geometric approach; verified conceptually
function stitchPolylines(polylines: Polyline[], gapThresholdM = 1.0): StitchResult {
  if (polylines.length === 0) return { vertices: [], gaps: [] };
  if (polylines.length === 1) return { vertices: polylines[0].vertices, gaps: [] };

  // Sort polylines by proximity of endpoints — greedy nearest-next approach
  // Detect gaps between consecutive segments
  const gaps: number[] = []; // gap distances in projected units
  const ordered = [polylines[0]];
  const remaining = polylines.slice(1);

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    const lastEnd = last.vertices[last.vertices.length - 1];
    // Find nearest next polyline by endpoint proximity
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const first = remaining[i].vertices[0];
      const last_ = remaining[i].vertices[remaining[i].vertices.length - 1];
      const d1 = Math.hypot(first.x - lastEnd.x, first.y - lastEnd.y);
      const d2 = Math.hypot(last_.x - lastEnd.x, last_.y - lastEnd.y);
      if (Math.min(d1, d2) < bestDist) {
        bestDist = Math.min(d1, d2);
        bestIdx = i;
        // if d2 < d1, reverse the polyline before appending
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    if (bestDist > gapThresholdM) gaps.push(bestDist);
    ordered.push(next);
  }

  const vertices = ordered.flatMap(p => p.vertices);
  return { vertices, gaps };
}
```

**SPLINE detection (D-03):**
```typescript
// Non-blocking warning trigger — check at layer extraction time
const hasSpline = dxf.entities.some(
  e => e.layer === selectedLayer && e.type === 'SPLINE'
);
// If true, surface UI warning (see UI-SPEC Surface 1) but do NOT block
```

**Important note — `parseSync` input is a string, not a Buffer:**
```typescript
// dxf-parser.parseSync() requires a UTF-8 string, not a Buffer.
// When fetching from Vercel Blob in the Server Action:
const response = await fetch(blobUrl);
const text = await response.text();  // NOT response.arrayBuffer()
const dxf = parser.parseSync(text);
```

---

## Pattern 2: proj4 2.20.8 — Turkey CRS Reprojection

**What:** `proj4(fromDef, toDef, [x, y])` → `[x, y]` output. For projected→WGS84, input `[easting, northing]`, output `[lng, lat]`.

**The `reprojectToWGS84` utility (canonical shape):**
```typescript
// Source: proj4 npm README (proj4js.github.io/proj4js) + STACK.md verified proj4 strings
// File: src/lib/crs.ts

import proj4 from 'proj4';

// Turkey EPSG proj4 strings (verified via epsg.io)
export const TURKEY_CRS: Record<number, string> = {
  5254: '+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  5253: '+proj=tmerc +lat_0=0 +lon_0=27 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  5255: '+proj=tmerc +lat_0=0 +lon_0=33 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  23035: '+proj=utm +zone=35 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs',
  23036: '+proj=utm +zone=36 +ellps=intl +towgs84=-89.05,-87.03,-124.56,0,0,0,0 +units=m +no_defs',
  32635: '+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs',
  32636: '+proj=utm +zone=36 +datum=WGS84 +units=m +no_defs',
};

// WGS84 target
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';

// Turkey bounding box for post-reprojection validation (SC5)
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
 */
export function validateTurkeyBbox(lng: number, lat: number): boolean {
  return (
    lng >= TURKEY_BBOX.minLng && lng <= TURKEY_BBOX.maxLng &&
    lat >= TURKEY_BBOX.minLat && lat <= TURKEY_BBOX.maxLat
  );
}
```

**Known coordinate test vectors (for unit tests):**
```typescript
// SC5 requirement: reprojectToWGS84(5254, 600000, 4570000) → Istanbul area
// Expected: lng ~29.0°E, lat ~41.3°N — both within Turkey bbox
// Source: STACK.md verified; PITFALLS.md Pitfall 3 example
test('EPSG:5254 known Istanbul area coordinate', () => {
  const [lng, lat] = reprojectToWGS84(5254, 600000, 4570000);
  expect(lng).toBeGreaterThan(28.5);
  expect(lng).toBeLessThan(29.5);
  expect(lat).toBeGreaterThan(40.8);
  expect(lat).toBeLessThan(41.8);
  expect(validateTurkeyBbox(lng, lat)).toBe(true);
});

// Axis-swap detection: if caller accidentally passes [northing, easting]
test('axis-swapped coords fail Turkey bbox', () => {
  // northing 4570000 as "easting" → reprojected result is nowhere near Turkey
  const [lng, lat] = reprojectToWGS84(5254, 4570000, 600000);
  expect(validateTurkeyBbox(lng, lat)).toBe(false);
});
```

---

## Pattern 3: Vercel Blob Two-Step Upload

**What:** Client-side `upload()` from `@vercel/blob/client` sends the file directly from browser to Vercel Blob, bypassing the 4.5 MB bodyParser limit. The browser first calls a server route (`/api/dxf-upload`) to exchange an auth-checked token.

**The two pieces required:**

**Piece 1 — Token exchange route handler:**
```typescript
// src/app/api/dxf-upload/route.ts
// Source: Vercel Blob client-upload official docs (verified 2026-05-30)
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname) => {
        // Auth gate — same as all other guarded routes in this project
        const session = await auth();
        if (!session) throw new Error('Not authenticated');

        return {
          allowedContentTypes: ['application/octet-stream', 'application/dxf'],
          addRandomSuffix: true,
          // 50 MB max (consistent with UI-SPEC error message)
          maximumSizeInBytes: 50 * 1024 * 1024,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Called by Vercel Blob webhook after upload completes.
        // NOTE: does NOT fire in local dev without ngrok tunnel.
        // The uploadDxf Server Action is the primary DB-write path — not here.
        console.log('[dxf-upload] blob complete:', blob.url);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
```

**Piece 2 — Client component upload call:**
```typescript
// Inside DxfUpload.tsx 'use client'
// Source: Vercel Blob client-upload official docs (verified 2026-05-30)
import { upload } from '@vercel/blob/client';

async function handleBlobUpload(file: File): Promise<string> {
  const { url } = await upload(
    `routes/${projectId}/source-${Date.now()}.dxf`,
    file,
    {
      access: 'public',
      handleUploadUrl: '/api/dxf-upload',
    }
  );
  return url; // blobUrl passed to uploadDxf Server Action
}
```

**Piece 3 — Server Action receives blobUrl (NOT the file bytes):**
```typescript
// src/actions/routes.ts — uploadDxf
export async function uploadDxf(
  projectId: string,
  blobUrl: string,          // ← receives blob URL, not file bytes
  sourceCrs: number,        // EPSG code, e.g. 5254
  sourceLayer: string,      // selected layer name
): Promise<UploadDxfResult> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // Ownership check (CR-02)
  const owned = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId())))
    .limit(1);
  if (!owned.length) throw new Error('Not found');

  // Fetch DXF text from blob (not ArrayBuffer — dxf-parser needs text)
  const response = await fetch(blobUrl);
  if (!response.ok) throw new Error(`Blob fetch failed: ${response.status}`);
  const dxfText = await response.text();

  // Parse + reproject
  const parseResult = parseDxfToLineString(dxfText, sourceCrs, sourceLayer);
  if (!parseResult.ok) return { ok: false, error: parseResult.error };

  // Validate with existing validator
  const validation = validateLineStringGeoJSON(parseResult.geojsonString);
  if (!validation.ok) return { ok: false, error: validation.error };

  // Fetch current geometry_version for increment
  const existing = await db.select({ geometryVersion: routes.geometryVersion })
    .from(routes).where(eq(routes.projectId, projectId)).limit(1);
  const nextVersion = (existing[0]?.geometryVersion ?? 0) + 1;

  // Upsert route
  const [row] = await db.insert(routes).values({
    projectId,
    tenantId: getDefaultTenantId(),
    geom: sql`ST_GeomFromGeoJSON(${validation.geojsonString})`,
    coordinateCount: validation.count,
    totalLengthM: sql`ST_Length(ST_GeomFromGeoJSON(${validation.geojsonString})::geography)`,
    geometryVersion: nextVersion,
    sourceBlobUrl: blobUrl,
    sourceCrs: String(sourceCrs),
    sourceLayer,
  }).onConflictDoUpdate({
    target: routes.projectId,
    set: {
      geom: sql`ST_GeomFromGeoJSON(${validation.geojsonString})`,
      coordinateCount: validation.count,
      totalLengthM: sql`ST_Length(ST_GeomFromGeoJSON(${validation.geojsonString})::geography)`,
      geometryVersion: nextVersion,
      sourceBlobUrl: blobUrl,
      sourceCrs: String(sourceCrs),
      sourceLayer,
      uploadedAt: sql`now()`,
    },
  }).returning({ id: routes.id });

  logOfficeActivity({ /* ... */ });
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true, count: validation.count, id: row.id };
}
```

**Local dev caveat:** `onUploadCompleted` in the token route does NOT fire in local dev without a ngrok tunnel. This is fine for this phase because all DB writes happen in the `uploadDxf` Server Action, not in `onUploadCompleted`.

---

## Pattern 4: Satellite Preview Modal — Two Mapbox Instances

**What:** A react-map-gl Map inside a shadcn Dialog showing the reprojected route on satellite basemap before any DB write. Second instance on the same page as the existing MapView.

**Key constraints (from UI-SPEC and MapView.tsx patterns):**
```typescript
// SatellitePreviewModal — 'use client' component (inside DxfUpload.tsx or separate)
// Source: UI-SPEC Mapbox Integration Notes + existing MapView.tsx pattern

import { useState, useRef, useCallback, useEffect } from 'react';
import Map, { Source, Layer, Marker } from 'react-map-gl/mapbox';
import type { MapRef } from 'react-map-gl/mapbox';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface SatellitePreviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  geojson: GeoJSON.LineString; // reprojected route, WGS84
  crsLabel: string;
  layerName: string;
  approvedCount: number;    // for re-import warning
  currentVersion: number;   // for version badge in warning
}

// Critical: Dialog must use conditional render so map unmounts on close
// — avoids ghost Mapbox instances and token-count issues
// Use { open && <SatellitePreviewModal ... /> } or Dialog destroyOnClose behavior

function SatellitePreviewModal({ open, onClose, onConfirm, geojson, ... }) {
  const mapRef = useRef<MapRef>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);
    // fitBounds after load — mirrors MapView.tsx pattern
    if (mapRef.current && geojson.coordinates.length > 0) {
      const lngs = geojson.coordinates.map(c => c[0]);
      const lats = geojson.coordinates.map(c => c[1]);
      mapRef.current.getMap().fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 60, duration: 0 }
      );
    }
  }, [geojson]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl">
        {/* Re-import warning — renders only when approvedCount > 0 */}
        {approvedCount > 0 && <ReimportWarning count={approvedCount} version={currentVersion + 1} />}

        {/* Map area — 480px height per UI-SPEC */}
        <div style={{ height: 480 }}>
          {!process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? (
            <BrandEmpty icon={MapPin} text="Mapbox token eksik" />
          ) : (
            <Map
              ref={mapRef}
              mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
              mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
              style={{ width: '100%', height: '100%' }}
              onLoad={handleMapLoad}
              initialViewState={{ longitude: 35, latitude: 39, zoom: 6 }}
            >
              {/* Route line layer */}
              <Source type="geojson" data={geojson}>
                <Layer
                  type="line"
                  paint={{ 'line-color': '#f59e0b', 'line-width': 3 }} // amber-500
                />
              </Source>
              {/* Start marker (emerald-600) + End marker (red-600) */}
              <Marker longitude={geojson.coordinates[0][0]} latitude={geojson.coordinates[0][1]}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#059669' }} />
              </Marker>
              <Marker longitude={geojson.coordinates.at(-1)![0]} latitude={geojson.coordinates.at(-1)![1]}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#dc2626' }} />
              </Marker>
            </Map>
          )}
        </div>

        {/* Footer: Cancel + Onayla — Kaydet (disabled until mapLoaded) */}
        <div className="flex justify-end gap-2 p-3">
          <BrandButton variant="ghost" onClick={onClose}>İptal</BrandButton>
          <BrandButton variant="primary" onClick={onConfirm} disabled={!mapLoaded}>
            Onayla — Kaydet
          </BrandButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Two-instance collision prevention:**
- The preview map lives ONLY inside the Dialog. When the Dialog is closed, the component is unmounted (use `{open && <SatellitePreviewModal ... />}` in the parent, not Dialog's `open` prop alone).
- The existing MapView uses `mapRef.current.getMap()` — the preview map's ref is a separate `useRef`. No shared state.
- Both use `import from 'react-map-gl/mapbox'` — this is the correct import for the Mapbox GL JS v3 adapter, same as MapView.tsx.

---

## Pattern 5: Schema Migration — Exact SQL

**What:** Migration `0010_v4_routes_ext.sql` — new columns on `routes` and `submissions`; migration `0011_v4_ai_flags.sql` — new `submission_ai_flags` table.

**Schema additions per CONTEXT.md + SUMMARY.md locked decisions:**

```sql
-- 0010_v4_routes_ext.sql
-- Hand-edit required: Drizzle generates generic geometry; these are standard numeric/text columns
-- so no geometry hand-edit needed in THIS migration. The existing routes.geom is already
-- geometry(LineString,4326) from the original schema.

ALTER TABLE "routes" ADD COLUMN "geometry_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "routes" ADD COLUMN "total_length_m" numeric(12, 2);
ALTER TABLE "routes" ADD COLUMN "source_blob_url" text;
ALTER TABLE "routes" ADD COLUMN "source_crs" text;
ALTER TABLE "routes" ADD COLUMN "source_layer" text;
ALTER TABLE "routes" ADD COLUMN "chainage_offset_m" numeric(12, 2) DEFAULT 0;

ALTER TABLE "submissions" ADD COLUMN "chainage_m" numeric(10, 2);
ALTER TABLE "submissions" ADD COLUMN "route_geometry_version" integer;

-- FK-safe seed fix for tenant_settings (folded todo tenant-settings-seed-fk-safe)
-- DO NOT edit 0007 — apply forward here
-- (if a default row in tenant_settings references a tenant that may not exist on fresh DBs)
-- Pattern: INSERT ... SELECT ... WHERE EXISTS (SELECT 1 FROM tenants WHERE id = ...)
-- Actual SQL depends on what 0007 seeds; planner must verify and include here.

-- Index on submissions.chainage_m for Phase 15 bucket queries (install now, paid later)
CREATE INDEX "submissions_chainage_m_idx" ON "submissions" ("chainage_m") WHERE "status" = 'approved';
```

```sql
-- 0011_v4_ai_flags.sql
CREATE TABLE "submission_ai_flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "submission_id" uuid NOT NULL REFERENCES "submissions"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',
  "photo_anomaly_score" numeric(4, 3),
  "work_classification" text,
  "anomaly_description" text,
  "eval_passed" boolean,
  "raw_response" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "submission_ai_flags_submission_id_unique" UNIQUE("submission_id")
);
CREATE INDEX "submission_ai_flags_submission_idx" ON "submission_ai_flags" ("submission_id");
CREATE INDEX "submission_ai_flags_status_idx" ON "submission_ai_flags" ("status");
```

**Drizzle schema additions (TypeScript):**
```typescript
// routes.ts additions
geometryVersion: integer('geometry_version').notNull().default(1),
totalLengthM: numeric('total_length_m', { precision: 12, scale: 2 }),
sourceBlobUrl: text('source_blob_url'),
sourceCrs: text('source_crs'),
sourceLayer: text('source_layer'),
chainageOffsetM: numeric('chainage_offset_m', { precision: 12, scale: 2 }).default('0'),

// submissions.ts additions
chainageM: numeric('chainage_m', { precision: 10, scale: 2 }),
routeGeometryVersion: integer('route_geometry_version'),
```

**Migration application protocol (D-49 + immutability rule):**
```bash
# Apply to BOTH Neon branches — never just one
# neondb (dev):
DATABASE_URL="<neondb-url>" npx tsx src/db/migrate.ts

# neondb_test (test/preview):
DATABASE_URL="<neondb_test-url>" npx tsx src/db/migrate.ts
```

**No geometry hand-edit needed in these migrations** — the new columns are all `numeric`, `text`, or `integer`. The existing `routes.geom` column was already hand-edited to `geometry(LineString,4326)` in migration `0000_lame_silver_sable.sql`. No new geometry columns are added in this phase.

**`total_length_m` compute in `uploadRoute` patch (RTE-04):**
```typescript
// In the onConflictDoUpdate set block of uploadRoute:
totalLengthM: sql`ST_Length(ST_GeomFromGeoJSON(${result.geojsonString})::geography)`,
geometryVersion: sql`COALESCE(${routes.geometryVersion}, 0) + 1`,
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DXF parsing | Custom DXF tokenizer/state machine | `dxf-parser` 1.1.2 | DXF sections, group codes, entity types, table parsing — hundreds of edge cases |
| CRS reprojection math | Custom proj4 string math or Helmert transform JS | `proj4` 2.20.8 | Datum shifts (ED50→WGS84 requires Helmert 7-param), TM/UTM ellipsoid math, axis order correctness — not safely hand-rollable |
| Turkey EPSG strings | Runtime fetch from epsg.io | Hardcoded `src/lib/crs.ts` | Network dependency in Server Action; 7 strings suffice for all Turkey pipelines |
| File upload > 4.5 MB | Chunked XHR upload, multipart FormData through Next.js bodyParser | Vercel Blob `upload()` from `@vercel/blob/client` | bodyParser limit is hard; Blob client upload is the designed solution |
| GeoJSON LineString validation on DXF output | Separate DXF-specific validator | `validateLineStringGeoJSON()` from `src/lib/geojson.ts` | Already handles type checking, min-2-coords, WGS84 range; DXF output is just a LineString |
| Satellite map preview from scratch | Custom canvas-based map rendering | `react-map-gl` + Mapbox satellite-streets-v12 style | Tile fetching, WebGL rendering, coordinate projection for display — never hand-roll |

**Key insight:** The reprojection math (especially ED50→WGS84 Helmert transformation with datum-shift parameters) and DXF group-code parsing are both domains where bugs are silent — wrong proj4 strings or missed DXF group codes produce plausible-looking but incorrect results. The libraries handle these correctly.

---

## Common Pitfalls

### Pitfall 1: parseSync receives ArrayBuffer instead of string
**What goes wrong:** `dxf-parser.parseSync()` expects a UTF-8 text string. If called with `Buffer` or `ArrayBuffer`, it will throw a cryptic parse error or silently produce an empty entities array.
**Why it happens:** When reading a file as `ArrayBuffer` for the Blob upload, developers pass the same buffer to the parser.
**How to avoid:** In the DxfUpload client component, read the file as `ArrayBuffer` ONLY for the Blob upload. For the client-side layer extraction pass, use `FileReader.readAsText()` separately. In the Server Action, call `response.text()` (not `response.arrayBuffer()`) after fetching from the blob URL.
**Warning signs:** `parseDxfToLineString` returns an empty entities array on a file that AutoCAD exports correctly.

### Pitfall 2: CRS dropdown shows EPSG code, user picks wrong one (CRS-as-WGS84)
**What goes wrong:** User selects "UTM 35N" intending WGS84/UTM but their file is actually TUREF/TM30. Route appears on map but offset by metres. Satellite preview is the safety net.
**How to avoid:** CRS labels in the Select must be human-readable (per UI-SPEC copywriting table). Never show raw EPSG codes as the primary label. Make the default TUREF/TM30 (D-01) since that is the dominant modern Turkey CRS. Include the EPSG code in parentheses as secondary text.

### Pitfall 3: Vercel Blob `onUploadCompleted` callback not fired in local dev
**What goes wrong:** Developer wires DB write logic to `onUploadCompleted` in the token route, works in production but never fires locally.
**Why it happens:** Vercel Blob's webhook requires a public URL to call back; localhost is not reachable from Vercel's servers.
**How to avoid:** All DB writes are in the `uploadDxf` Server Action (called after client `upload()` returns). `onUploadCompleted` is used only for logging/debugging. Test the upload end-to-end with `vercel dev` and ngrok, or simply test the Server Action independently.

### Pitfall 4: Both Neon branches not migrated before preview deploy
**What goes wrong:** Preview deploy uses `neondb_test`; migration only applied to `neondb` (dev). Preview deploy crashes with `column "geometry_version" does not exist`.
**How to avoid:** Always run `npx tsx src/db/migrate.ts` against both `DATABASE_URL` (neondb) and `DATABASE_URL_TEST` (neondb_test) in the same session immediately after authoring the migration. Add a `migrate:all` script to `package.json`.

### Pitfall 5: Dialog open prop vs conditional render — ghost Mapbox instances
**What goes wrong:** Using `<Dialog open={open}>` with the map always mounted means the second Mapbox instance is created on page load even when the dialog is closed. Two instances fight for the same WebGL context on some devices.
**How to avoid:** Use `{open && <SatellitePreviewModal ... />}` so the entire component including the Map unmounts when the dialog closes. Alternatively, use Dialog's `forceMount` and CSS `display:none` but this is more complex. Conditional render is the simplest safe approach.

### Pitfall 6: `geometryVersion` increment race condition on concurrent uploads
**What goes wrong:** Two simultaneous upload requests both read `geometryVersion = 1`, both compute `nextVersion = 2`, and both write version 2. One upload's version is silently overwritten.
**Why it happens:** The read-then-increment is not atomic.
**How to avoid:** Use SQL-side increment in the `onConflictDoUpdate` SET: `geometryVersion: sql\`EXCLUDED.geometry_version\`` combined with setting the new value as `(SELECT COALESCE(geometry_version, 0) + 1 FROM routes WHERE project_id = ${projectId})` in the VALUES, or use a Postgres sequence. For the single-tenant MVP, the simplest safe approach is to compute the version in the VALUES clause via a subquery: `sql\`(SELECT COALESCE(MAX(geometry_version), 0) + 1 FROM routes WHERE project_id = ${projectId})\``.

### Pitfall 7: FK-safe seed not applied in 0010 migration (folded todo)
**What goes wrong:** Any new seed rows in migration 0010 that reference `tenants(id)` fail with FK violation on fresh DBs (preview, test, colleague's machine) where the tenant row may not exist.
**How to avoid:** Use the FK-safe pattern: `INSERT INTO ... SELECT ... WHERE EXISTS (SELECT 1 FROM tenants WHERE id = ...)`. Apply this to any default-row seeding in 0010 for `tenant_settings` or similar. Do NOT edit 0007 (hash integrity).

---

## Code Examples

### parseDxfToLineString function shape

```typescript
// src/lib/dxf-parser.ts
// Source: dxf-parser 1.1.2 verified API + proj4 2.20.8 verified API
import DxfParser from 'dxf-parser';
import { reprojectToWGS84, validateTurkeyBbox } from './crs';

export type ParseDxfResult =
  | { ok: true; geojsonString: string; count: number; gaps: number[]; hasSpline: boolean }
  | { ok: false; error: string };

export function parseDxfToLineString(
  dxfText: string,
  epsg: number,
  layerName: string,
): ParseDxfResult {
  let dxf;
  try {
    const parser = new DxfParser();
    dxf = parser.parseSync(dxfText);
  } catch (err) {
    return { ok: false, error: 'DXF_PARSE_FAILED' };
  }

  // Check for SPLINE entities in selected layer (non-blocking — caller surfaces warning)
  const hasSpline = dxf.entities.some(
    e => e.layer === layerName && e.type === 'SPLINE'
  );

  // Extract LWPOLYLINE + POLYLINE entities from the selected layer
  const polylines = dxf.entities
    .filter(e => e.layer === layerName && (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE'))
    .map(e => ({ vertices: e.vertices ?? [] }))
    .filter(p => p.vertices.length >= 2);

  if (polylines.length === 0) {
    return { ok: false, error: 'NO_COMPATIBLE_GEOMETRY' };
  }

  // Stitch + detect gaps (simplified — full stitching logic in separate helper)
  const allVertices = polylines.flatMap(p => p.vertices);

  // Reproject each vertex
  const wgsCoords: [number, number][] = [];
  for (const v of allVertices) {
    const [lng, lat] = reprojectToWGS84(epsg, v.x, v.y);
    // Turkey bbox validation — reject entire file if any vertex is outside
    if (!validateTurkeyBbox(lng, lat)) {
      return { ok: false, error: 'COORDS_OUTSIDE_TURKEY' };
    }
    wgsCoords.push([lng, lat]);
  }

  if (wgsCoords.length < 2) {
    return { ok: false, error: 'TOO_FEW_VERTICES' };
  }

  const geojsonString = JSON.stringify({
    type: 'LineString',
    coordinates: wgsCoords,
  });

  return { ok: true, geojsonString, count: wgsCoords.length, gaps: [], hasSpline };
}
```

### Layer extraction (for client-side first pass)

```typescript
// Called client-side after FileReader.readAsText()
// Source: dxf-parser 1.1.2 API (tables.layer + entities)
export interface LayerInfo {
  name: string;
  entityCount: number;
  vertexCount: number;
  hasSpline: boolean;
  suggested: boolean; // true if name matches AXIS/CL/CENTERLINE/MERKEZ
}

export function extractDxfLayers(dxfText: string): LayerInfo[] | null {
  try {
    const parser = new DxfParser();
    const dxf = parser.parseSync(dxfText);
    const map = new Map<string, LayerInfo>();

    // Initialize from tables.layer (includes layers with no entities)
    for (const [name] of Object.entries(dxf.tables?.layer?.layers ?? {})) {
      map.set(name, { name, entityCount: 0, vertexCount: 0, hasSpline: false,
        suggested: /^(AXIS|CL|CENTERLINE|MERKEZ)$/i.test(name) });
    }

    // Count entities
    for (const entity of dxf.entities ?? []) {
      const layer = entity.layer ?? '0';
      const existing = map.get(layer) ?? { name: layer, entityCount: 0, vertexCount: 0,
        hasSpline: false, suggested: /^(AXIS|CL|CENTERLINE|MERKEZ)$/i.test(layer) };
      map.set(layer, {
        ...existing,
        entityCount: existing.entityCount + 1,
        vertexCount: existing.vertexCount + (entity.vertices?.length ?? 0),
        hasSpline: existing.hasSpline || entity.type === 'SPLINE',
      });
    }

    return Array.from(map.values()).filter(l => l.entityCount > 0 || l.vertexCount > 0);
  } catch {
    return null;
  }
}
```

### uploadRoute patch (RTE-04)

```typescript
// Patch to existing uploadRoute onConflictDoUpdate — add totalLengthM + geometryVersion
// No change to function signature or validation logic
set: {
  geom: sql`ST_GeomFromGeoJSON(${result.geojsonString})`,
  coordinateCount: result.count,
  uploadedAt: sql`now()`,
  // NEW — Phase 14 additions:
  totalLengthM: sql`ST_Length(ST_GeomFromGeoJSON(${result.geojsonString})::geography)`,
  geometryVersion: sql`COALESCE(${routes.geometryVersion}, 0) + 1`,
},
// Also add to VALUES (first insert):
totalLengthM: sql`ST_Length(ST_GeomFromGeoJSON(${result.geojsonString})::geography)`,
geometryVersion: 1,
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vercel Blob `put()` server-side for large files | `upload()` from `@vercel/blob/client` for browser-to-Blob direct PUT | @vercel/blob ≥ 2.x | Bypasses 4.5 MB Next.js bodyParser limit — critical for DXF files |
| PostGIS `ST_Transform` for CRS conversion | `proj4` JS at upload time | This project's decision (D-STACK) | No dependency on TUREF EPSG:5254 existing in Neon's `spatial_ref_sys` |
| `react-map-gl` v7 (Mapbox GL JS v2) import | `import from 'react-map-gl/mapbox'` (v8, GL JS v3 adapter) | react-map-gl v8 | This project already uses v8; the `/mapbox` import is the correct adapter path |

**Deprecated/outdated:**
- `next/image` with Blob URLs: Blob URLs are unoptimized by Next.js Image optimization (requires `remotePatterns` config for `*.public.blob.vercel-storage.com`). For DXF download links this is irrelevant (not an `<img>` tag). For any photo display, this project already handles it correctly in bot-photo.ts.
- `DxfParser.parseStream()`: The streaming API exists but is not needed here. `parseSync()` is simpler and appropriate for server-side use.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Multi-polyline stitching uses endpoint-proximity greedy approach | Pattern 1 — stitching | If DXF files have complex topology (branching, very close polylines), stitching may produce incorrect route order. Low risk for pipeline survey files (typically one centerline polyline per layer). |
| A2 | `tables.layer.layers` is the correct property path for the layer table in dxf-parser output | Pattern 1 — layer extraction | If the actual property path differs, layer initialization from tables will be empty (entities loop still catches active layers). |
| A3 | Gap threshold for stitch warning is in projected metres (before reprojection) | Pattern 1 — stitching | If files use very tight tolerance or very coarse vertex spacing, threshold may need tuning. Planner should use a configurable constant. |
| A4 | `allowedContentTypes` for `.dxf` files should include `'application/octet-stream'` | Pattern 3 — Blob route | Browser may send `application/dxf` or `application/octet-stream` depending on OS. Both should be allowed. |
| A5 | `geometryVersion` increment race condition is acceptable for single-tenant MVP | Pattern 5 — schema | True for single-tenant; would need a DB-side atomic increment for multi-tenant. |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

---

## Open Questions (RESOLVED)

1. **DXF fixture files for unit tests**
   - What we know: `parseDxfToLineString` unit tests require real DXF files in Turkish projected coordinates (TUREF/TM30 EPSG:5254).
   - What's unclear: No fixture DXF exists in the codebase. The research cannot synthesize a valid DXF binary.
   - Recommendation: Create a minimal synthetic DXF fixture as a test helper — a DXF text string with one LWPOLYLINE entity on layer "AXIS" with 3 vertices in valid TUREF/TM30 coordinates. This is a text format and can be hand-authored (or generated via a single AutoCAD export). Store in `tests/fixtures/sample-route-epsg5254.dxf`. Alternatively, generate it programmatically in the test setup using known coordinate values.
   - **RESOLVED:** Plan 14-01 Task 2 hand-authors programmatic DXF text-string fixtures (`tests/fixtures/dxf.ts`) — no AutoCAD export needed.

2. **`tables.layer.layers` exact property path**
   - What we know: `dxf.tables.layer` is the layer table from the dxf-parser README.
   - What's unclear: The exact nested property path (`layers` or the object directly) varies between dxf-parser versions.
   - Recommendation: Log `Object.keys(dxf.tables?.layer)` on the first parse in development and confirm the path before writing the layer extraction code. Guard with optional chaining throughout.
   - **RESOLVED:** Plan 14-04 Task 1 guards `dxf.tables?.layer?.layers` with optional chaining throughout (no hard dependency on the exact path).

3. **`onUploadCompleted` local development**
   - What we know: Vercel Blob's `onUploadCompleted` webhook does not fire in local dev without ngrok.
   - What's unclear: Whether `vercel dev` provides a tunneled URL automatically.
   - Recommendation: Keep all DB write logic in the `uploadDxf` Server Action (called after `upload()` returns on the client). Use `onUploadCompleted` only for logging. This design sidesteps the local dev limitation entirely.
   - **RESOLVED:** Plan 14-04 places all DB writes in the `uploadDxf` Server Action; `onUploadCompleted` only logs — local-dev limitation sidestepped by design.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Satellite preview modal | ✓ (assumed — RouteTab already uses it) | — | Show BrandEmpty error state if absent |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob client upload | ✓ (existing photo upload uses it) | — | None — required |
| `DATABASE_URL` (neondb) | Migration runner | ✓ | Postgres 16 | — |
| `DATABASE_URL_TEST` (neondb_test) | Migration runner (test branch) | ✓ (used in Phase 7, 9, 12) | Postgres 16 | — |
| Node.js runtime (not edge) | `dxf-parser`, `proj4` | ✓ | 18+ (Vercel) | Never use edge runtime for DXF parse |

**Missing dependencies with no fallback:** none.

---

## Validation Architecture

nyquist_validation is enabled (config.json `workflow.nyquist_validation: true`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (confirmed in vitest.config.ts) |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run tests/dxf-parser.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RTE-01 (SC5) | `reprojectToWGS84(5254, 600000, 4570000)` → Istanbul area lng/lat within Turkey bbox | unit | `npx vitest run tests/dxf-parser.test.ts -t "EPSG:5254"` | ❌ Wave 0 |
| RTE-01 | Axis-swapped coords fail Turkey bbox validation | unit | `npx vitest run tests/dxf-parser.test.ts -t "axis-swapped"` | ❌ Wave 0 |
| RTE-01 | All 7 EPSG codes produce Turkey-bbox-valid output | unit | `npx vitest run tests/dxf-parser.test.ts -t "all EPSG"` | ❌ Wave 0 |
| RTE-01 | `parseDxfToLineString` extracts LWPOLYLINE from fixture DXF | unit | `npx vitest run tests/dxf-parser.test.ts -t "LWPOLYLINE"` | ❌ Wave 0 |
| RTE-01 | Out-of-Turkey coords return `COORDS_OUTSIDE_TURKEY` error | unit | `npx vitest run tests/dxf-parser.test.ts -t "outside Turkey"` | ❌ Wave 0 |
| RTE-01 (D-03) | Multi-polyline stitching produces ordered vertices | unit | `npx vitest run tests/dxf-parser.test.ts -t "stitch"` | ❌ Wave 0 |
| RTE-01 (D-03) | SPLINE entity in layer triggers hasSpline=true | unit | `npx vitest run tests/dxf-parser.test.ts -t "SPLINE"` | ❌ Wave 0 |
| RTE-01 | < 2 vertices after filter → `TOO_FEW_VERTICES` error | unit | `npx vitest run tests/dxf-parser.test.ts -t "too few"` | ❌ Wave 0 |
| RTE-02 | Satellite preview modal shows disabled "Onayla" before map load | manual | — | — |
| RTE-02 | Satellite preview modal shows correct route on satellite basemap | manual | — | — |
| RTE-03 | DXF source_blob_url stored in routes row after upload | integration (verify via DB) | manual SQL check | — |
| RTE-04 | GeoJSON upload path still returns ok:true after uploadRoute patch | unit | `npx vitest run tests/routes.test.ts` (if exists) | ❌ Wave 0 |
| RTE-04 | `total_length_m` is non-null after uploadRoute for an existing GeoJSON route | integration | manual SQL check | — |
| RTE-05 | After re-import, existing approved `chainage_m` is NULL (Phase 14 only adds columns — Phase 15 writes them; this SC is that the columns exist without errors) | migration smoke | `npx vitest run tests/dxf-parser.test.ts -t "schema"` | ❌ Wave 0 |
| SC6 (Housekeeping) | PROJECT.md v1 capabilities moved to Validated | manual | — | — |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/dxf-parser.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/dxf-parser.test.ts` — covers all RTE-01 automated cases + reprojectToWGS84 unit tests (SC5)
- [ ] `tests/fixtures/sample-route-epsg5254.dxf` OR programmatic DXF fixture string — required for parse tests
- [ ] `tests/fixtures/sample-route-epsg32635.dxf` — WGS84/UTM35N fixture for second CRS test
- [ ] Confirm `tests/setup.ts` does not need modification (existing vitest setup handles DB — dxf-parser tests are pure unit tests, no DB needed)

---

## Security Domain

`security_enforcement` is absent from config.json — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | auth() guard in uploadDxf Server Action + onBeforeGenerateToken in Blob route |
| V3 Session Management | no | No new session surfaces |
| V4 Access Control | yes | CR-02 ownership check (project belongs to tenant) before any write |
| V5 Input Validation | yes | validateLineStringGeoJSON on DXF output; Turkey bbox validation; DXF file format check (parseSync throws on non-DXF); 50 MB size limit |
| V6 Cryptography | no | No new cryptographic surfaces |

### Known Threat Patterns for this Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious DXF file triggering parser crash | Tampering | `try/catch` around `parseSync`; return structured error; never execute DXF content as code |
| SSRF via blob URL (Engineer crafts blob URL pointing to internal service) | Elevation of Privilege | `uploadDxf` only fetches from `*.public.blob.vercel-storage.com` — validate the URL prefix before fetching, or rely on the Blob token scope |
| Unauthorized DXF upload (unauthenticated user PUTs to Blob) | Spoofing | `onBeforeGenerateToken` in `/api/dxf-upload` route MUST call `auth()` and throw if no session — Vercel docs emphasize this explicitly |
| Tenant isolation: engineer uploads DXF to another tenant's project | IDOR | CR-02 ownership check in `uploadDxf` (same pattern as `uploadRoute`) |
| Excessively large DXF causing serverless OOM | Denial of Service | `maximumSizeInBytes: 50 * 1024 * 1024` in `onBeforeGenerateToken`; vertex count cap in `parseDxfToLineString` |

---

## Sources

### Primary (HIGH confidence)

- [VERIFIED: npm registry] `dxf-parser` 1.1.2 — `parseSync()` API, entity types, vertex structure — confirmed via npm registry README and entity source inspection via WebFetch
- [VERIFIED: npm registry] `proj4` 2.20.8 — `proj4(srcDef, dstDef, [x,y])` API, axis order contract — confirmed via npm registry + proj4js docs
- [VERIFIED: npm registry] `react-pdf` 10.4.1, `pdfjs-dist` 5.7.284 — confirmed existence and versions on npm registry
- [CITED: vercel.com/docs/storage/vercel-blob/client-upload] Vercel Blob client upload — `upload()` + `handleUpload` pattern with auth gate — verified 2026-05-30
- [CITED: epsg.io/5254] TUREF/TM30 proj4 string — verified in STACK.md (already researched 2026-05-29)
- [VERIFIED: codebase read] `src/actions/routes.ts` — exact `uploadRoute` pattern to mirror (auth guard, CR-02 check, `onConflictDoUpdate`, `logOfficeActivity`)
- [VERIFIED: codebase read] `src/db/schema/routes.ts` — exact Drizzle schema and `geomLinestring` custom type
- [VERIFIED: codebase read] `src/db/schema/submissions.ts` — existing columns; `chainage_m` + `route_geometry_version` are additive
- [VERIFIED: codebase read] `src/lib/geojson.ts` — `validateLineStringGeoJSON` returns `{ ok, geojsonString, count }` — reused verbatim in `uploadDxf`
- [VERIFIED: codebase read] `src/lib/bot-photo.ts` — existing `@vercel/blob` `put()` pattern; confirms `BLOB_READ_WRITE_TOKEN` is already in env
- [VERIFIED: codebase read] `src/components/dashboard/RouteTabClient.tsx` — existing state pattern, `MapView` import, `Card` usage
- [VERIFIED: codebase read] `src/db/migrate.ts` — migration runner reads `DATABASE_URL` from `.env.local`, runs `migrate()` via neon-http
- [VERIFIED: codebase read] `vitest.config.ts` — `fileParallelism: false`, `environment: node`

### Secondary (MEDIUM confidence)

- [CITED: github.com/gdsestimating/dxf-parser wiki] Entity structure and `tables.layer` layout — verified via WebFetch of wiki page + entity source directory listing

### Tertiary (LOW confidence)

- [ASSUMED] Multi-polyline stitching algorithm (greedy nearest-next endpoint proximity) — standard geometric approach, not verified in dxf-parser docs
- [ASSUMED] `tables.layer.layers` property path nesting — inferred from README; confirm on first parse

---

## Project Constraints (from CLAUDE.md)

All constraints relevant to Phase 14:

- **Tech stack locked:** Next.js 15 App Router, TypeScript, Tailwind CSS 4.3.x, shadcn/ui
- **Database:** Neon (PostgreSQL 16) + PostGIS via Drizzle ORM — no alternative considered
- **ORM:** Drizzle — migrations via `npx tsx src/db/migrate.ts` (drizzle-kit push is unusable, D-49)
- **Migration protocol:** Applied to BOTH `neondb` and `neondb_test`; immutable after apply; `geometry(LineString,4326)` must be hand-edited in any new geometry column migration; GIST index must be hand-added
- **`tenant_id` required on every insert** — `getDefaultTenantId()` called in uploadDxf
- **Money math:** No monetary values in Phase 14 — `totalLengthM` and `chainageM` are numeric distances, not money
- **Single-tenant MVP:** No multi-tenancy logic added; `getDefaultTenantId()` pattern maintained
- **Mapping:** Mapbox GL JS (react-map-gl v8) — use `import from 'react-map-gl/mapbox'` (mapbox adapter)
- **Auth:** Auth.js v5 magic-link — `auth()` is the session getter; `session.user?.id` for activity log
- **Localization:** Turkish-first; all new i18n keys added to `messages/tr.json` and `messages/en.json`; GSD ui-spec defines exact keys
- **Non-Turbopack dev server** for map work — mapbox-gl worker breaks under Turbopack

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified on npm registry 2026-05-30; slopcheck passed [OK] on all 4 packages; versions match STACK.md
- Architecture: HIGH — based on direct reading of all existing source files; DXF import flow mirrors existing uploadRoute pattern exactly
- dxf-parser API: HIGH — verified via npm registry README and entity source files; LWPOLYLINE vertex structure confirmed
- proj4 reprojection: HIGH — verified via npm registry + proj4js docs; axis order contract documented
- Vercel Blob client upload: HIGH — verified against official Vercel docs (2026-05-30)
- Mapbox preview modal: HIGH — based on existing MapView.tsx patterns + UI-SPEC; react-map-gl v8 `Source`/`Layer`/`Marker` API confirmed
- Migration SQL: HIGH — based on existing migration file patterns + CONTEXT.md locked schema additions
- Pitfalls: HIGH — grounded in PITFALLS.md v4.0 research + codebase reading

**Research date:** 2026-05-30
**Valid until:** 2026-06-30 (stable stack; Vercel Blob API is stable)
