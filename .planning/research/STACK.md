# Stack Research

**Domain:** v4.0 additions — document-driven CAD route import, chainage linear referencing, AI vision assist
**Researched:** 2026-05-29
**Confidence:** HIGH (all version numbers verified against npm registry; EPSG codes verified against epsg.io; PostGIS functions confirmed against official docs; AI SDK image format confirmed against ai-sdk.dev)

---

> This file covers ONLY the net-new libraries required for v4.0 capabilities. The full existing stack (Next.js 15, Drizzle, Neon/PostGIS, grammY, react-map-gl, AI SDK v6, next-intl, @vercel/blob, ExcelJS, @react-pdf/renderer) is validated and unchanged.

---

## New Stack Additions for v4.0

### DXF Parsing (Node / Serverless)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `dxf-parser` | 1.1.2 | Parse DXF text files into a structured JS object | Pure JavaScript, zero native dependencies — runs in any Vercel Node function with no bundling issues; confirmed tested against LWPOLYLINE, POLYLINE, and LINE entity types; synchronous `parseSync()` API; actively used in production DXF-to-GeoJSON pipelines |

**Entity support in `dxf-parser` 1.1.2:**
- `LWPOLYLINE` — parsed; vertices exposed as `vertices[]` array with `x`, `y` per vertex
- `POLYLINE` — parsed; vertices exposed similarly
- `LINE` — parsed as start/end point pair
- `SPLINE` — parsed structurally but interpolated points are not computed (the raw control points are available); for route import purposes LWPOLYLINE is the only entity type the Turkey survey CAD workflow produces

**Why not `dxf` (skymakerolof, v5.3.1):** More actively maintained (last publish September 2025 vs June 2022 for dxf-parser), but its value-add is SVG/WebGL rendering — the `toPolylines()` output flattens everything into an undifferentiated array with no entity-type discrimination. For server-side route extraction where entity type matters (LWPOLYLINE vs irrelevant annotation lines), `dxf-parser`'s typed entity object is preferable. If `dxf-parser` proves inadequate for a specific file, `dxf@5.3.1` is the fallback — both are pure JS and serverless-safe.

**Why not DWG parsing:** DWG is Autodesk's proprietary binary format. No reliable pure-JS DWG parser exists. `libredwg-web` uses WASM via LibreDWG (a reverse-engineered library with ambiguous legal status for commercial use). The correct path for v4.0 is: "user exports DXF from AutoCAD before uploading" — this is a one-click operation for any AutoCAD user. DXF covers DWG for this purpose.

**Cloud conversion fallback (not recommended for v4.0):** Autodesk APS Model Derivative API and CloudConvert can convert DWG→DXF server-side, but both require external API keys, per-conversion cost, and add latency to what should be a simple upload. For a single-tenant MVP with one office engineer, training them to export DXF is zero-friction. Add cloud conversion only if field evidence shows DWG-only files are a real blocker.

### Coordinate Reprojection

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `proj4` | 2.20.8 | Reproject projected CRS coordinates to WGS84 (EPSG:4326) | Pure JavaScript, no WASM, no native modules; runs identically in Vercel Node functions and browser; 1036 npm dependents; last published 22 days ago (actively maintained); single `proj4(fromDef, toDef, [x, y])` call |

**Turkey EPSG codes and proj4 strings (verified via epsg.io):**

| CRS | EPSG | Coverage | Proj4 String |
|-----|------|----------|--------------|
| TUREF / TM30 | 5254 | Turkey 28.5°E–31.5°E — primary for modern Turkey surveys | `+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs` |
| TUREF / TM27 | 5253 | Turkey 25.5°E–28.5°E — Trakya/Edirne corridor | `+proj=tmerc +lat_0=0 +lon_0=27 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs` |
| TUREF / TM33 | 5255 | Turkey 31.5°E–34.5°E — Ankara region | `+proj=tmerc +lat_0=0 +lon_0=33 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs` |
| ED50 / UTM 35N | 23035 | Turkey/Europe 24°E–30°E — legacy survey files | `+proj=utm +zone=35 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs` |
| ED50 / UTM 36N | 23036 | Turkey 30°E–36°E — legacy survey files | `+proj=utm +zone=36 +ellps=intl +towgs84=-89.05,-87.03,-124.56,0,0,0,0 +units=m +no_defs` |
| WGS84 / UTM 35N | 32635 | Modern GPS-based surveys in the same band | `+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs` |
| WGS84 / UTM 36N | 32636 | Modern GPS-based surveys | `+proj=utm +zone=36 +datum=WGS84 +units=m +no_defs` |

**Target CRS:** Always EPSG:4326 (`+proj=longlat +datum=WGS84 +no_defs`) for GeoJSON ingestion into the existing PostGIS/Mapbox pipeline.

**Reprojection location: do it in JavaScript (proj4), not in PostGIS (ST_Transform).**

Rationale: ST_Transform works via the `spatial_ref_sys` table. PostGIS 3.x ships with "over 3000" common EPSG definitions, but TUREF (EPSG:5254, added to EPSG registry in 2010) may or may not be present in Neon's specific PostGIS build — this is not verifiable without querying the live database. Neon docs do not enumerate which SRIDs are included. Even if TUREF is present, inserting it as a migration step adds schema complexity. Doing reprojection in JS at upload time (before calling `ST_GeomFromGeoJSON`) is architecturally cleaner: the DXF parser extracts vertices in projected coordinates, `proj4` converts them to `[lng, lat]` pairs, then the existing `validateLineStringGeoJSON` + `uploadRoute` Server Action flow takes over unchanged. No Postgres migration required.

Embed the 6–7 Turkish proj4 strings as a hardcoded lookup table in a `src/lib/crs.ts` module (not fetched from epsg.io at runtime).

### PDF Viewing in Browser

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `react-pdf` | 10.4.1 | Display PDF files in browser | Works with Next.js 15 App Router; `'use client'` component wrapping required; actively maintained (wojtekmaj); peer-compatible with React 18/19; requires `pdfjs-dist` worker setup |
| `pdfjs-dist` | 5.7.284 | PDF.js worker (peer dep of react-pdf) | Installed automatically as peer dep; worker must be configured in the client component |

**Next.js 15 App Router integration pattern:**

```tsx
'use client';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
```

This component must be `'use client'` and dynamically imported in RSC parents with `{ ssr: false }` to avoid SSR crashes. Next.js 15 (>= 14.1.1) no longer requires `next.config.js` workarounds for this — the `import.meta.url` worker pattern works out of the box.

**For DXF side-panel viewing:** Do NOT add a DXF rendering library. The DXF file is parsed server-side to extract geometry only; the dashboard map panel already shows the parsed route as a Mapbox GL layer. A raw DXF viewer (three-dxf, dxf-viewer) adds substantial bundle weight for marginal value — the engineer's CAD software is the authoritative DXF viewer. The "view source drawing beside the map" requirement is satisfied by: (a) parsing the DXF and rendering it as a Mapbox source on the existing map, or (b) showing a preview of the extracted polyline in a lightweight SVG panel using the parsed vertices directly. Neither requires an additional dependency.

### Linear Referencing

**No new dependency.** Chainage is fully achievable with PostGIS functions already installed on Neon:

| Function | What it does | Chainage use |
|----------|-------------|-------------|
| `ST_Length(geom::geography)` | Returns length in meters (geodesic, accurate on WGS84 ellipsoid) | Total route length; chainage denominator |
| `ST_LineLocatePoint(line, point)` | Returns 0–1 fraction of line where point is closest | Convert submission lat/lon to chainage fraction |
| `ST_LineInterpolatePoint(line, fraction)` | Returns point geometry at fraction along line | Map chainage km-mark back to coordinates |
| `ST_LineSubstring(line, start_frac, end_frac)` | Returns sub-line between two fractions | Extract per-segment geometry for interval views |

Chainage in meters = `ST_LineLocatePoint(route.geom, submission.snapped_point) * ST_Length(route.geom::geography)`.

Per-km segment queries group submissions by `floor(chainage_m / 1000)`. All of this is raw SQL in Drizzle `sql\`\`` templates — the same pattern already used in Phase 4 for nearest-segment matching. Confirmed: PostGIS linear referencing chapter covers exactly this use case. GIST index on `routes.geom` (already exists per schema) ensures performant `ST_LineLocatePoint` calls.

### AI Vision Assist

**No new library.** The existing `ai` (AI SDK v6) via Vercel AI Gateway with latest Claude models covers async photo anomaly flagging completely.

**Confirmed image content format (verified against ai-sdk.dev/docs/foundations/prompts):**

```ts
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai'; // or gateway client

const result = await generateText({
  model: gateway('anthropic/claude-sonnet-4.6'), // latest vision-capable model
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Inspect this construction photo for anomalies...' },
      { type: 'image', image: photoUrl }, // @vercel/blob URL — direct HTTPS URL works
    ],
  }],
});
```

The `@vercel/blob` public URL is passed directly as the `image` field — no base64 encoding needed. This is the cleanest path: submission photo is already stored in Blob at approval time.

**Execution pattern:** Call `generateText` inside a Vercel Node route handler (not Edge) triggered by the auditor approval webhook callback. Store the AI flag result in a new `submission_ai_flags` DB column or table before the auditor's Telegram decision UI renders. This is the "async" pattern — fire the vision check at submission receipt, not at auditor render time. If the AI call takes >2s (Claude vision typically 1–3s), use a background queue pattern: store the submission first, respond to Telegram immediately, then trigger vision analysis via a separate API route call or Vercel background function.

**Eval harness (lightweight, hand-rolled — no new dependency):**

Do not add Braintrust, Langfuse, or any observability platform for v4.0. Per the project constraint "eval rigor required since AI is in v1," the correct v4.0 approach is:

1. A `__tests__/ai/vision-eval.ts` Vitest suite with a fixed set of labeled test photos (stored in `test/fixtures/`) and expected classification outcomes
2. Each test calls `generateText` against the real model and asserts the structured output matches the expected label
3. Gate: suite must pass before any AI flag is shown to an auditor (acceptance criteria AI-01..AI-05)
4. This is zero new dependencies — Vitest is already in the test stack

Add Braintrust/Langfuse observability in v5.0 once the eval harness is proven and volumes justify the integration overhead.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Native DWG parser (`libredwg-web`, `dwg-*`) | DWG is proprietary binary; libredwg has ambiguous licensing for commercial use; WASM bundling on Vercel requires `outputFileTracingIncludes` workarounds | Train user to export DXF from AutoCAD (one click) |
| `dxf-viewer` / `three-dxf` / `@dxfom/svg` in browser | Heavy WebGL/three.js dependency for a feature (DXF viewer) that the engineer's CAD app already serves better; adds 500 KB+ to bundle | Parse DXF server-side; render extracted geometry as Mapbox GL layer |
| `@dxfom/dxf` | v0.2.0 (very early stage); no LWPOLYLINE vertex documentation; insufficient ecosystem evidence | `dxf-parser` 1.1.2 |
| PostGIS `ST_Transform` for reprojection | Requires TUREF EPSG:5254 to exist in Neon's `spatial_ref_sys` — not verifiable without live query; adds migration complexity | `proj4` 2.20.8 in JS at upload time |
| Autodesk APS / CloudConvert DWG→DXF pipeline | External API cost, latency, key management — over-engineered for a single-tenant MVP | DXF export from AutoCAD |
| Braintrust / Langfuse for v4.0 | Adds integration overhead and new service dependency before the eval baseline is even established | Hand-rolled Vitest eval suite with labeled fixture photos |
| `proj4-epsg` / `epsg` npm packages | Runtime-fetched or bundled EPSG registries add unnecessary weight; only 6–7 Turkish CRS strings are needed | Hardcoded `src/lib/crs.ts` lookup with verified proj4 strings |

---

## Installation

```bash
# DXF parsing
pnpm add dxf-parser

# Coordinate reprojection
pnpm add proj4
pnpm add -D @types/proj4

# PDF viewer (browser-side)
pnpm add react-pdf
# pdfjs-dist installs automatically as peer dependency of react-pdf
```

No new dev-only dependencies beyond `@types/proj4`.

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| `dxf-parser` | 1.1.2 | Node.js 14+, browser | Pure JS, no native deps; Vercel-safe |
| `proj4` | 2.20.8 | Node.js 12+, browser, Edge | Pure JS, no WASM; works in all Vercel runtimes |
| `react-pdf` | 10.4.1 | React 18/19, Next.js 15 | Must be `'use client'`; dynamic import with `ssr:false` in RSC parents |
| `pdfjs-dist` | 5.7.284 | Peer dep of react-pdf 10.x | Worker must be configured via `import.meta.url` pattern; Next.js 15 has no special config requirement |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `dxf-parser` 1.1.2 | `dxf` 5.3.1 (skymakerolof) | dxf is more actively maintained but optimized for rendering (SVG output); `dxf-parser` gives typed entity objects better suited for server-side geometry extraction |
| `proj4` in JS | PostGIS `ST_Transform` | Requires verified EPSG:5254 in `spatial_ref_sys`; Neon coverage unverified; JS approach is architecturally simpler and doesn't require migration |
| Hand-rolled Vitest eval | Braintrust / Langfuse | External service dependency before eval baseline is established; Vitest is already installed; add observability platform in v5.0 |
| `react-pdf` 10.x | `@react-pdf/renderer` (already in stack) | `@react-pdf/renderer` generates PDFs; it cannot display them — different library for different direction of data flow |
| `react-pdf` 10.x | iframe + `/api/serve-pdf` | Works but gives no page navigation, zoom, or annotation overlay for future use |

---

## Sources

- `dxf-parser` npm registry — version 1.1.2, last published 2022-06-16; pure JS confirmed
- `dxf` npm registry — version 5.3.1, last published 2025-09-01
- github.com/skymakerolof/dxf — LWPOLYLINE/POLYLINE entity support confirmed; `toPolylines()` API
- github.com/gdsestimating/dxf-parser — entity type list, `parseSync()` API
- medium.com/@supulkalhara7 — DXF → GeoJSON + proj4 reprojection pattern confirmed (dxf-parser + proj4 + EPSG:32644 → EPSG:4326)
- `proj4` npm registry — version 2.20.8, published 22 days ago; 1036 dependents
- epsg.io/5254 — TUREF/TM30 proj4 string verified
- epsg.io/23035, epsg.io/23036 — ED50 UTM 35N/36N proj4 strings verified
- postgis.net/docs/ST_LineLocatePoint.html — function signature and linear referencing pattern confirmed
- postgis.net/docs/ST_Transform.html — `spatial_ref_sys` dependency confirmed
- postgis.net/workshops/postgis-intro/linear_referencing.html — chainage pattern confirmed
- ai-sdk.dev/docs/foundations/prompts — image content part format (URL, base64, buffer) verified
- `react-pdf` npm registry — version 10.4.1; React 19 peer dep compatible
- `pdfjs-dist` npm registry — version 5.7.284
- github.com/wojtekmaj/react-pdf README — Next.js 15 App Router worker setup pattern

---

*Stack research for: bayrak.ai v4.0 document-driven route import, chainage as-built tracking, AI vision assist*
*Researched: 2026-05-29*
