---
phase: 14-schema-foundation-dxf-route-import
plan: "04"
subsystem: dxf-pipeline
tags: [dxf, parsing, server-action, blob-upload, i18n, rte-01, rte-03, rte-04, rte-05, d-05]
dependency_graph:
  requires: ["14-01", "14-02", "14-03"]
  provides: ["parseDxfToLineString", "extractDxfLayers", "uploadDxf", "uploadRoute-patched", "getRoute-extended", "getRouteGeoJSON-extended", "dxf-upload-token-route", "dashboard.route-i18n"]
  affects: ["src/lib/dxf-parser.ts", "src/actions/routes.ts", "src/app/api/dxf-upload/route.ts", "messages/tr.json", "messages/en.json"]
tech_stack:
  added: []
  patterns:
    - dxf-parser 1.1.2 parseSync API with try/catch DXF_PARSE_FAILED gate
    - greedy nearest-next endpoint polyline stitching for D-03 multi-segment routes
    - SSRF guard: blobUrl validated to https://*.public.blob.vercel-storage.com before fetch
    - Vercel Blob handleUpload token exchange route with onBeforeGenerateToken auth gate
    - db.transaction for atomic routes upsert + route_source_documents INSERT (D-05)
    - MAX subquery geometry_version increment (Pitfall 6 mitigation)
key_files:
  created:
    - src/lib/dxf-parser.ts
    - src/app/api/dxf-upload/route.ts
  modified:
    - src/actions/routes.ts
    - messages/tr.json
    - messages/en.json
decisions:
  - key: dxf-parser-stub-to-full
    description: Replaced Wave 0 stub in src/lib/dxf-parser.ts with full implementation; all 20 RED tests now GREEN
  - key: too-few-vertices-detection
    description: Polyline entities with < 2 vertices are detected before the >= 2 filter — returns TOO_FEW_VERTICES (not NO_COMPATIBLE_GEOMETRY) when entities exist but none qualify
  - key: require-import-for-dxf-parser
    description: Used require() instead of ESM import for dxf-parser because the package has no ESM export — consistent with how grammY and other CJS-only packages are handled
  - key: atomic-transaction-d05
    description: routes upsert + routeSourceDocuments INSERT wrapped in db.transaction() to satisfy T-14-SRCDOC-ATOM — history row always reflects the geometry_version that landed on the routes row
metrics:
  duration_minutes: 35
  completed_at: "2026-05-30T01:55:48Z"
  tasks_completed: 3
  files_created: 2
  files_modified: 3
---

# Phase 14 Plan 04: DXF Backend Pipeline Summary

DXF parse-reproject-validate pipeline implemented in full; all 20 RED tests from Plan 01 turned GREEN. `uploadDxf` Server Action adds auth, SSRF, bbox, and atomic D-05 history. `uploadRoute` patched for `total_length_m` and `geometry_version` without signature change. Blob token route auth-gated. Full i18n key set in both locales.

## What Was Built

### Task 1: `src/lib/dxf-parser.ts` (RTE-01 — 20 tests GREEN)

Full replacement of the Wave 0 stub with:

- `parseDxfToLineString(dxfText, epsg, layerName) → ParseDxfResult`
  - `DxfParser.parseSync()` in try/catch → `DXF_PARSE_FAILED` (T-14-PARSE, never throws to caller)
  - Distinguishes no-polyline-entities (`NO_COMPATIBLE_GEOMETRY`) from polylines-with-insufficient-vertices (`TOO_FEW_VERTICES`)
  - SPLINE detection per layer → `hasSpline: true` (non-blocking, D-03)
  - Greedy nearest-next endpoint stitching for multi-polyline layers → `gaps[]` populated when endpoint gap > 1.0m
  - `reprojectToWGS84(epsg, v.x, v.y)` per vertex; `validateTurkeyBbox(lng, lat)` → `COORDS_OUTSIDE_TURKEY` (T-14-VAL)
  - 100,000 vertex DoS cap (T-14-DOS)
- `extractDxfLayers(dxfText) → LayerInfo[] | null`
  - Entity-based aggregation (entity array is the source of truth, not tables.layer map)
  - `suggested: true` for AXIS/CL/CENTERLINE/MERKEZ (case-insensitive, D-02)
  - Returns null on parse failure

### Task 2: `src/actions/routes.ts` (RTE-01/03/04/05, D-05)

**New `uploadDxf` Server Action:**
- `auth()` → throw Unauthorized (T-14-AUTHZ)
- CR-02 ownership check (projects.tenantId = getDefaultTenantId())
- SSRF guard: URL must be `https://` and host must end in `.public.blob.vercel-storage.com` (T-14-SSRF)
- `fetch(blobUrl).text()` — string not ArrayBuffer (RESEARCH Pitfall 1)
- `parseDxfToLineString` + `validateLineStringGeoJSON` (shared gate)
- `MAX(geometry_version)` subquery for version increment (Pitfall 6 mitigation, T-14-VERSION)
- `db.transaction`: routes `onConflictDoUpdate` + `routeSourceDocuments` INSERT (T-14-SRCDOC-ATOM, D-05)
- `logOfficeActivity('dxf_route_uploaded')` + `revalidatePath`

**Patched `uploadRoute` (RTE-04):**
- Added `totalLengthM: sql\`ST_Length(ST_GeomFromGeoJSON(...)::geography)\`` to both VALUES and SET
- Added `geometryVersion: 1` to VALUES; `COALESCE(routes.geometryVersion, 0) + 1` to SET
- Signature and validation unchanged

**Extended `getRoute` + `getRouteGeoJSON` (RTE-05):**
- Both functions now include `totalLengthM`, `sourceCrs`, `sourceLayer`, `geometryVersion`, `sourceBlobUrl` in their select projections

### Task 3: `/api/dxf-upload` + i18n (RTE-03)

- `src/app/api/dxf-upload/route.ts`: `runtime = 'nodejs'`, `handleUpload` from `@vercel/blob/client`, `onBeforeGenerateToken` calls `auth()` (T-14-BLOB), 50MB cap, `allowedContentTypes` octet-stream + dxf
- `messages/tr.json` + `messages/en.json`: 47 new keys each under `dashboard.route` — dxf_* flow keys, source_doc_* keys, meta_* keys, error_dxf_* keys, crs_* selector labels (7 presets matching UI-SPEC)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TOO_FEW_VERTICES vs NO_COMPATIBLE_GEOMETRY discrimination**
- **Found during:** Task 1, first test run (19/20 passing)
- **Issue:** The test sends a polyline entity with vertex count = 1. The `>= 2` filter dropped it, leaving an empty array, which returned `NO_COMPATIBLE_GEOMETRY`. But the test expects `TOO_FEW_VERTICES` — polyline entities existed but none qualified.
- **Fix:** Collect all polyline entities first; if none exist → `NO_COMPATIBLE_GEOMETRY`; if entities exist but all have < 2 vertices → `TOO_FEW_VERTICES`
- **Files modified:** `src/lib/dxf-parser.ts`
- **Commit:** 1718a3a

**2. [Rule 2 - Missing critical functionality] dxf-parser CJS import**
- **Found during:** Task 1
- **Issue:** `dxf-parser` 1.1.2 is CommonJS-only. `import DxfParser from 'dxf-parser'` would fail ESM resolution. Used `require()` to avoid the import error.
- **Files modified:** `src/lib/dxf-parser.ts`

## Known Stubs

None — all exported functions fully implemented.

## Threat Surface Scan

No new network endpoints or auth paths beyond what is in the plan's threat model. The `/api/dxf-upload` route is the only new network surface and is covered by T-14-BLOB.

## Self-Check: PASSED

All files verified to exist on disk. All commit hashes found in git history.

| Item | Status |
|------|--------|
| `src/lib/dxf-parser.ts` | FOUND |
| `src/actions/routes.ts` | FOUND |
| `src/app/api/dxf-upload/route.ts` | FOUND |
| commit 1718a3a (Task 1) | FOUND |
| commit f9ad419 (Task 2) | FOUND |
| commit 6d702fb (Task 3) | FOUND |
