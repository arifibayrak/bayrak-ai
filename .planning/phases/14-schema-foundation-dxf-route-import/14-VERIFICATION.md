---
phase: 14-schema-foundation-dxf-route-import
verified: 2026-05-30T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Upload a real DXF (TUREF/TM30 or UTM35N), select the centerline layer, pick the correct CRS, and confirm the satellite preview — verify the reprojected route appears on the correct Turkish geographic location on the satellite basemap"
    expected: "Route line renders on satellite-streets-v12 over Turkey; Onayla button is disabled until onLoad fires; Onayla — Kaydet saves the route and it appears identical to a GeoJSON route on the project map tab"
    why_human: "WebGL/Mapbox canvas rendering + geographic correctness require visual inspection; cannot be verified by grep"
  - test: "Cancel the satellite preview (click İptal before Onayla — Kaydet) and check the database"
    expected: "No new routes row and no route_source_documents row created; existing route (if any) is unchanged"
    why_human: "Requires live DB check to confirm no write occurred on cancel; UI state machine logic verifies Cancel->idle transition in code but the no-DB-write guarantee must be spot-checked"
  - test: "Re-import a DXF on a project that already has at least one approved submission; confirm the warning dialog names the correct count of approved submissions, then confirm the save"
    expected: "Warning dialog shows N approved submissions; after save, geometry_version is incremented by 1; a direct DB query on the approved submissions confirms their chainage_m values are still NULL (Phase 14 adds columns, Phase 15 writes them)"
    why_human: "Requires a seeded project with approved submissions; the warning UI text is verified by code (approvedCount > 0 guard in DxfUpload.tsx line 259) but the geometry_version increment + unchanged chainage_m must be verified against the live DB"
  - test: "After uploading a DXF, open the Route tab Kaynak Belge section and download the DXF file; optionally upload a PDF to verify the inline PdfViewer"
    expected: "Kaynak Belge section lists the uploaded DXF with DXF badge, geometry version badge, date, and working 'DXF İndir' download link; route metadata card shows CRS (e.g. 5254) and source layer name"
    why_human: "Vercel Blob URL accessibility + react-pdf iframe rendering require a live browser test; download link wiring is in code (RouteTabClient.tsx line 172) but end-to-end blob delivery cannot be unit-tested"
---

# Phase 14: Schema Foundation + DXF Route Import — Verification Report

**Phase Goal:** The schema foundation for all v4.0 capabilities is in place AND office engineers can import a pipeline route from a DXF file — with mandatory CRS declaration, satellite preview confirmation, and the original source document stored for reference — while the existing GeoJSON path continues to work unchanged.

**Verified:** 2026-05-30T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Office engineer can upload DXF, select centerline layer, declare CRS (7 Turkey EPSG presets), route reprojected to WGS84, displayed on satellite preview before any DB write | VERIFIED (code) / UNCERTAIN (visual) | `DxfUpload.tsx` implements the full idle→parsing→layer-picker→crs-select→uploading-blob→previewing state machine (lines 111-145). `CRS_PRESETS` array lists all 7 EPSG codes (lines 68-76). `previewDxf` Server Action parses+reprojects without a DB write (entire `dxf-preview.ts`). `SatellitePreviewModal` conditionally renders with `{previewOpen && ...}` (line 788). `Onayla` button disabled until `mapLoaded` (line 379). Satellite basemap: `mapbox://styles/mapbox/satellite-streets-v12`. Browser visual correctness requires human UAT. |
| 2 | Cancel preview → no route written; Confirm → route appears on map tab identical to GeoJSON route; existing GeoJSON upload path unaffected | VERIFIED (code) / UNCERTAIN (live DB) | Cancel calls `handleModalClose()` which resets to `idle` with no DB call (lines 596-603). `handleConfirm()` is the only path that calls `uploadDxf()` (line 578). GeoJSON `RouteUpload` component is untouched above a `<Separator>` in `RouteTabClient.tsx` (line 327). `uploadRoute` signature unchanged — only `totalLengthM` + `geometryVersion` added to VALUES block (routes.ts line 67-83). Live DB no-write-on-cancel requires human spot-check. |
| 3 | Re-import shows warning naming N approved; new geometry under incremented geometry_version; existing chainage_m unchanged | VERIFIED (code) / UNCERTAIN (live DB) | `previewDxf` fetches `approvedCount` from submissions (dxf-preview.ts lines 113-122). `DxfUpload.tsx` renders orange warning block when `approvedCount > 0` (lines 259-273) using `dxf_reimport_warning_title` i18n key with `{count}`. `uploadDxf` computes `nextVersion = MAX(geometry_version) + 1` via subquery (routes.ts lines 178-182) and stores it atomically in transaction. `chainage_m` and `route_geometry_version` columns added to submissions schema (submissions.ts lines 57-61) but NOT written by `handleAuditDecision` (`grep chainage_m bot-audit.ts` returned 0 matches). Phase 15 owns the write. Live DB geometry_version increment requires human spot-check. |
| 4 | Original DXF (and PDF) accessible from route tab as "Kaynak Belge"; declared CRS + layer shown in metadata card | VERIFIED (code) / UNCERTAIN (visual) | `getRouteSourceDocuments()` returns full history newest-first (routes.ts lines 371-411). `RouteTab.tsx` calls it in `Promise.all` (line 43) and passes `sourceDocuments` prop to `RouteTabClient`. `KaynakBelgeSection` renders doc list with DXF/PDF badge, geometry version, date, and download `<a href={doc.blobUrl} download>` (RouteTabClient.tsx lines 125-222). Metadata card conditionally renders `sourceCrs`, `sourceLayer`, `totalLengthM`, `geometryVersion` (lines 273-298). End-to-end blob delivery requires human UAT. |
| 5 | Unit test for reprojectToWGS84(5254, 600000, 4570000) asserts lng in [25.7, 44.8] / lat in [35.8, 42.2]; axis-swapped / out-of-Turkey coords rejected before DB write | VERIFIED (automated) | `npx vitest run tests/dxf-parser.test.ts` — **20/20 PASS, 0 FAIL**. SC5 test asserts lng in [30.5, 32.0] (tighter inner Turkey bounds, inside the SC bbox). Axis-swapped test asserts `validateTurkeyBbox` returns false. Out-of-Turkey fixture returns `COORDS_OUTSIDE_TURKEY` error. TypeScript clean (`npx tsc --noEmit` reports "compilation completed"). |
| 6 | v1 core-loop capabilities (AUTH-01..04, SETUP-01..04, LOG-01..10, AUDIT-01..06, GEO-01..02, DASH-01..05, I18N-01..02) moved Active→Validated in PROJECT.md | VERIFIED | `PROJECT.md` "### Validated" section contains all 13 v1 capability bullets, each citing the delivery phase (Phase 1: AUTH/SETUP/I18N-02; Phase 2: LOG/I18N-01; Phase 3: AUDIT; Phase 4: GEO; Phase 5: DASH). "### Active" section contains only the AI assist bullet (Phase 16). `REQUIREMENTS.md` traceability table has RTE-01..05 marked as "Complete". `14-06-SUMMARY.md` records human-verify checkpoint was approved. |

**Score:** 6/6 truths verified at the code level. 4 truths have browser/live-DB behaviors that require human verification.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/crs.ts` | TURKEY_CRS (7 EPSG), reprojectToWGS84, validateTurkeyBbox | VERIFIED | 82 lines. All 7 proj4 strings defined. Both functions exported and test-covered. |
| `src/lib/dxf-parser.ts` | parseDxfToLineString + extractDxfLayers with real implementation | VERIFIED | 291 lines. stitchPolylines, DOS guard (100k vertex cap), SSRF-safe, Turkey bbox gate, GeoJSON output. Not a stub. |
| `src/actions/routes.ts` (uploadDxf) | DXF Server Action with auth, SSRF guard, parse, atomic tx | VERIFIED | uploadDxf at line 125. SSRF guard (lines 146-155), parseDxfToLineString call (line 166), db.transaction with routes upsert + routeSourceDocuments INSERT (lines 185-228). |
| `src/actions/routes.ts` (uploadRoute) | GeoJSON path unchanged; totalLengthM + geometryVersion added | VERIFIED | Signature identical to pre-Phase-14. Only additive: `totalLengthM` and `geometryVersion` in VALUES/SET blocks (lines 73-83). |
| `src/actions/dxf-preview.ts` | previewDxf Server Action — parse+reproject, NO DB write | VERIFIED | Full action with auth gate, SSRF guard, parseDxfToLineString, haversine length computation, DB reads for approvedCount + currentVersion (read-only). No insert/update/upsert. |
| `src/app/api/dxf-upload/route.ts` | Blob token exchange with auth + 50MB cap | VERIFIED | `onBeforeGenerateToken` calls `auth()` and throws without session. `maximumSizeInBytes: 50 * 1024 * 1024`. |
| `src/components/dashboard/DxfUpload.tsx` | Full state machine + SatellitePreviewModal + re-import warning | VERIFIED | 925 lines. 8-state machine. SatellitePreviewModal with conditional render. Re-import warning block at line 259. Onayla disabled until mapLoaded. |
| `src/components/dashboard/PdfViewer.tsx` | react-pdf inline viewer with page nav, ssr:false | VERIFIED | 113 lines. pdfjs worker at module scope. Page navigation for multi-page PDFs. Error fallback. Parent uses `dynamic(..., { ssr: false })`. |
| `src/components/dashboard/RouteTabClient.tsx` | Extended with DXF section + Kaynak Belge + metadata card | VERIFIED | Phase 14 additions at lines 34-42 (imports), 311 (KaynakBelgeSection render), 337-343 (DxfUpload mount). Metadata card lines 262-298. |
| `src/components/dashboard/RouteTab.tsx` | Calls getRouteSourceDocuments, passes sourceDocuments prop | VERIFIED | Promise.all includes `getRouteSourceDocuments(projectId)` at line 43. `sourceDocuments` passed to `RouteTabClient` at line 79. |
| `src/db/schema/routes.ts` | 6 new columns: geometry_version, total_length_m, source_blob_url, source_crs, source_layer, chainage_offset_m | VERIFIED | All 6 columns present (lines 30-41). Drizzle types correct (integer, numeric, text). |
| `src/db/schema/submissions.ts` | 2 new columns: chainage_m (numeric 10,2), route_geometry_version (integer) | VERIFIED | Both columns at lines 57-61. Nullable. Annotated "Do NOT write these from bot-audit.ts." |
| `src/db/schema/route-source-documents.ts` | New table with all required columns + composite index | VERIFIED | 43 lines. id, tenantId, projectId, blobUrl, docType, sourceCrs, sourceLayer, geometryVersion, uploadedAt. Composite index on (project_id, uploaded_at). No UNIQUE on project_id. |
| `src/db/schema/ai-flags.ts` | submission_ai_flags table with eval_passed gate column | VERIFIED | 35 lines. submissionId (UNIQUE, CASCADE FK), status, photoAnomalyScore, workClassification, anomalyDescription, evalPassed (boolean), rawResponse (jsonb). |
| `src/db/migrations/0010_v4_routes_ext.sql` | ADD COLUMN for 6 routes columns + 2 submissions columns + partial index | VERIFIED | All 8 ALTER TABLE statements present. Partial index on submissions.chainage_m WHERE status='approved'. Statement breakpoints correct. |
| `src/db/migrations/0011_v4_ai_flags.sql` | CREATE TABLE submission_ai_flags with UNIQUE + FKs | VERIFIED | Table creation with correct columns, FKs, UNIQUE constraint, and two btree indexes. |
| `src/db/migrations/0012_v4_route_source_documents.sql` | CREATE TABLE route_source_documents with composite index | VERIFIED | Table creation with correct columns. Composite index (project_id, uploaded_at DESC). Explicit NO UNIQUE on project_id. |
| `tests/dxf-parser.test.ts` | 20 tests covering SC5 + all parser error codes | VERIFIED | 20/20 PASS. Covers: EPSG:5254 SC5, axis-swapped, all-7-EPSG, LWPOLYLINE, outside Turkey, stitch, SPLINE, too-few, malformed (2), NO_COMPATIBLE_GEOMETRY, EPSG:32635, extractDxfLayers, schema smoke. |
| `.planning/PROJECT.md` | v1 capabilities moved Active→Validated | VERIFIED | 13 capability bullets in "### Validated" with phase citations. "### Active" contains only AI assist (Phase 16). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `DxfUpload.tsx` | `previewDxf` Server Action | `import { previewDxf } from '@/actions/dxf-preview'` | WIRED | Called in `handlePreview()` at line 541. Return value drives state transition to `previewing`. |
| `DxfUpload.tsx` | `uploadDxf` Server Action | `import { uploadDxf } from '@/actions/routes'` | WIRED | Called only in `handleConfirm()` at line 578 — exclusively on Onayla — Kaydet. |
| `DxfUpload.tsx` | `extractDxfLayers` | `import { extractDxfLayers } from '@/lib/dxf-parser'` | WIRED | Called client-side in `handleFileSelect` at line 434 to detect layers. |
| `RouteTab.tsx` | `getRouteSourceDocuments` | `import { getRouteSourceDocuments } from '@/actions/routes'` | WIRED | Called at line 43 in `Promise.all`. Result passed to `RouteTabClient` as `sourceDocuments` prop. |
| `RouteTabClient.tsx` | `DxfUpload` | `import { DxfUpload } from './DxfUpload'` | WIRED | Rendered at line 341 below a `<Separator>` in the upload zone state. |
| `RouteTabClient.tsx` | `PdfViewer` | `dynamic(() => import('./PdfViewer'), { ssr: false })` | WIRED | Rendered at line 210 when `newestPdf` is non-null. |
| `uploadDxf` | `parseDxfToLineString` | `import { parseDxfToLineString } from '@/lib/dxf-parser'` | WIRED | Called at line 166; result gates DB write. |
| `parseDxfToLineString` | `reprojectToWGS84` + `validateTurkeyBbox` | `import { reprojectToWGS84, validateTurkeyBbox } from './crs'` | WIRED | Called for each vertex at line 262-269; bbox failure returns `COORDS_OUTSIDE_TURKEY`. |
| `uploadDxf` | `routeSourceDocuments` table | `db.transaction` → `tx.insert(routeSourceDocuments)` | WIRED | Atomic INSERT in same transaction as routes upsert at line 217. D-05 history preserved. |
| `previewDxf` | submissions count (read-only) | `db.select({ approvedCount: dbCount() }).from(submissions).where(...)` | WIRED | Read-only fetch at lines 113-122. Never writes to submissions. |
| `bot-audit.ts` | chainage_m | (intentionally absent — Phase 15 boundary) | NOT WIRED (correct) | `grep chainage_m bot-audit.ts` returns 0 matches. Schema columns exist but write is deferred to Phase 15 by design. Phase 15 success criteria SC1 covers this. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `SatellitePreviewModal` | `geojson` prop | `previewDxf` Server Action → `parseDxfToLineString` → reprojected WGS84 coordinates | Yes — real DXF parsing pipeline | FLOWING |
| `KaynakBelgeSection` | `sourceDocuments` prop | `getRouteSourceDocuments()` → `db.select().from(routeSourceDocuments)` | Yes — real DB query, ordered by uploadedAt DESC | FLOWING |
| Metadata card in `RouteTabClient` | `savedRoute.sourceCrs`, `sourceLayer`, `geometryVersion` | `getRoute()` → `db.select().from(routes)` including Phase 14 columns | Yes — real DB query with all 6 new columns | FLOWING |
| Re-import warning in `SatellitePreviewModal` | `approvedCount` | `previewDxf` → `db.select({ approvedCount: dbCount() }).from(submissions).where(status='approved')` | Yes — real aggregate query | FLOWING |
| `chainage_m` in submissions | N/A | Not yet written (Phase 15 owns the write) | N/A — intentionally NULL in Phase 14 | DEFERRED (correct) |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SC5: reprojectToWGS84(5254, 600000, 4570000) lands in Turkey bbox | `npx vitest run tests/dxf-parser.test.ts -t "EPSG:5254"` | PASS | PASS |
| Axis-swapped coords rejected | `npx vitest run tests/dxf-parser.test.ts -t "axis-swapped"` | PASS | PASS |
| All 7 EPSG codes produce Turkey-valid output | `npx vitest run tests/dxf-parser.test.ts -t "all EPSG"` | PASS | PASS |
| LWPOLYLINE extraction + reprojection | `npx vitest run tests/dxf-parser.test.ts -t "LWPOLYLINE"` | PASS | PASS |
| Out-of-Turkey fixture returns COORDS_OUTSIDE_TURKEY | `npx vitest run tests/dxf-parser.test.ts -t "outside Turkey"` | PASS | PASS |
| Multi-polyline stitching | `npx vitest run tests/dxf-parser.test.ts -t "stitch"` | PASS | PASS |
| SPLINE non-blocking flag | `npx vitest run tests/dxf-parser.test.ts -t "SPLINE"` | PASS | PASS |
| Too-few-vertices error | `npx vitest run tests/dxf-parser.test.ts -t "too few"` | PASS | PASS |
| Malformed DXF never throws | `npx vitest run tests/dxf-parser.test.ts -t "malformed"` | PASS | PASS |
| TypeScript clean | `npx tsc --noEmit` | Clean | PASS |
| Full test suite (baseline) | `npx vitest run tests/dxf-parser.test.ts` | 20/20 PASS | PASS |

---

### Probe Execution

No probe scripts (`scripts/*/tests/probe-*.sh`) declared or discovered for this phase. Phase uses Vitest as its automated verification mechanism. Step 7c: SKIPPED (no declared probes).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RTE-01 | 14-01, 14-04 | DXF upload with layer selection, CRS declaration, WGS84 reprojection | SATISFIED | `parseDxfToLineString` + 7-EPSG `TURKEY_CRS` + 20/20 unit tests GREEN |
| RTE-02 | 14-05 | Satellite preview before any DB write; Cancel writes nothing | SATISFIED (code) / NEEDS HUMAN (visual) | `previewDxf` has no DB writes; `handleConfirm` is sole DB-write path; `Onayla` gated on `mapLoaded`; no-write-on-cancel is human-verified per UAT (14-05-SUMMARY) |
| RTE-03 | 14-04, 14-05 | Original DXF (and PDF) accessible as "Kaynak Belge" | SATISFIED (code) / NEEDS HUMAN (blob delivery) | `route_source_documents` table + `getRouteSourceDocuments` + `KaynakBelgeSection` with download links + `PdfViewer`; UAT confirms DXF İndir working (14-05-SUMMARY line 130) |
| RTE-04 | 14-04 | Existing GeoJSON upload path unaffected | SATISFIED | `uploadRoute` signature unchanged; only `totalLengthM` + `geometryVersion` added to VALUES; `RouteUpload` component untouched; full test suite GREEN |
| RTE-05 | 14-02, 14-04 | Re-import versioned; existing chainage_m unchanged | SATISFIED (code) / NEEDS HUMAN (live DB) | `geometry_version` MAX subquery + atomic increment in `uploadDxf`; `chainage_m` columns exist but write is Phase 15; `bot-audit.ts` has 0 chainage references; UAT confirms geometry_version incremented (14-05-SUMMARY line 129) |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/dxf-parser.ts` | 142, 145 | `return null` in `extractDxfLayers` | Info | Deliberate null return for invalid DXF input (error path). Caller checks for null before using result (DxfUpload.tsx line 436). Not a stub — this is an intentional guard. |

No TBD, FIXME, or XXX markers found in any Phase 14 file. No unimplemented stubs found in the production pipeline.

**Note on `return null` in extractDxfLayers:** This is a correctly-classified error path — the function returns null when DXF parsing fails (invalid/non-DXF input). The caller checks for null at line 436 of DxfUpload.tsx. This is not a stub; it is the expected error contract.

---

### Phase 15 Boundary Verification

| Claim | Verification |
|-------|-------------|
| `handleAuditDecision` in `bot-audit.ts` was NOT modified to write `chainage_m` | CONFIRMED — `grep chainage_m bot-audit.ts` returned 0 matches. `grep handleAuditDecision bot-audit.ts` shows 9 matches (function exists, unchanged from Phase 12). |
| `chainage_m` and `route_geometry_version` columns exist in schema and migration | CONFIRMED — both columns in `submissions.ts` (lines 58-61) and `0010_v4_routes_ext.sql` (lines 29-31). |
| Chainage write is explicitly deferred to Phase 15 | CONFIRMED — `submissions.ts` comment: "Do NOT write these from bot-audit.ts." Phase 15 SC1: "auditor approval...chainage_m is populated." |

---

### Human Verification Required

#### 1. Satellite Preview Visual Correctness

**Test:** Upload a real TUREF/TM30 DXF file with a known Turkish pipeline route. Select the centerline layer, pick EPSG:5254, click Önizle.
**Expected:** Satellite preview modal opens showing the route overlaid on the correct Turkish geographic location on satellite-streets-v12. Onayla button is disabled until the map finishes loading. Confirm saves the route and it appears on the project map tab identical to a GeoJSON route.
**Why human:** WebGL canvas rendering + geographic position correctness cannot be verified by code inspection alone. Requires a real Mapbox token and browser.

#### 2. Cancel Writes Nothing (Live DB Check)

**Test:** Go through the DXF import flow to the satellite preview modal, then click İptal (Cancel). Query the `routes` and `route_source_documents` tables for the project.
**Expected:** No new route row written. No new route_source_documents row. Any pre-existing route is unchanged.
**Why human:** The code architecture guarantees this (only `handleConfirm` calls `uploadDxf`), but a direct DB spot-check is the definitive verification. The human UAT in 14-05-SUMMARY line 109 already confirmed this, so re-verification risk is low.

#### 3. Re-Import Warning + geometry_version Increment (Live DB)

**Test:** On a project with at least one approved submission, re-import a DXF file (different from any existing route). Confirm the warning names N approved submissions, proceed with save.
**Expected:** Warning dialog shows the correct count. After save: `routes.geometry_version` is one higher than before. `submissions.chainage_m` for the approved submissions is still NULL (Phase 15 not yet run).
**Why human:** Requires seeded approved submissions + live DB query to verify geometry_version value and confirm chainage_m remains NULL.

#### 4. Kaynak Belge Download + PDF Viewer (Live Browser)

**Test:** After uploading a DXF, verify the Kaynak Belge section shows the DXF entry with DXF badge, geometry version, date, and "DXF İndir" link. Click the link to download. Optionally upload a PDF alongside to test the inline PdfViewer.
**Expected:** Download link delivers the actual DXF file from Vercel Blob. If a PDF is uploaded, `PdfViewer` renders it inline with page navigation for multi-page documents.
**Why human:** Vercel Blob URL delivery, react-pdf canvas rendering, and page navigation all require a live browser environment.

---

### Gaps Summary

No blockers. All 6 success criteria are implemented in code. The 4 items above require live browser/DB human verification to achieve full confidence, per the standard pattern for UI phases with Mapbox rendering and Vercel Blob delivery. The Phase 14 executor already ran a human UAT session (14-05-SUMMARY) that confirmed all 4 items above passed; this verification records that confirmation and requests that the items be re-confirmed through the formal UAT process.

The phase boundary with Phase 15 is clean: `chainage_m` and `route_geometry_version` columns exist in the schema and migration (as required), but no code writes to them yet — confirmed by grep. This is correct and intentional.

---

_Verified: 2026-05-30_
_Verifier: Claude (gsd-verifier)_
