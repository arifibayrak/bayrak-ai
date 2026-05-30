---
phase: 14-schema-foundation-dxf-route-import
plan: "05"
subsystem: ui
tags: [dxf, mapbox, react-map-gl, satellite-preview, vercel-blob, route-import, pdf-viewer, react-pdf, version-history, crs, postgis]

# Dependency graph
requires:
  - phase: 14-schema-foundation-dxf-route-import
    plan: "04"
    provides: uploadDxf Server Action, extractDxfLayers, DXF Blob upload route (/api/dxf-upload), route_source_documents schema, getRoute returning new columns (totalLengthM/sourceCrs/sourceLayer/geometryVersion/sourceBlobUrl)
provides:
  - DxfUpload.tsx — full idle→parsing→layer-picker→crs-select→previewing→saving→saved state machine with SatellitePreviewModal (satellite-streets-v12 confirm gate)
  - previewDxf Server Action (src/actions/dxf-preview.ts) — parse + reproject for satellite preview WITHOUT any DB write (split from uploadDxf)
  - PdfViewer.tsx — react-pdf inline viewer with page navigation, dynamic ssr:false
  - getRouteSourceDocuments(projectId) — auth-guarded Server Action returning all source documents newest-first (D-05)
  - RouteTabClient.tsx — extended with DXF upload zone below GeoJSON path + extended metadata card + Kaynak Belge version-history list
  - RouteTab.tsx — serializes new route columns + calls getRouteSourceDocuments and passes list to client
affects: [15-chainage-as-built, any plan reading route metadata or source documents]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "previewDxf split from uploadDxf — preview Server Action parses + reprojects WITHOUT DB write; uploadDxf called only on Onayla — Kaydet confirm; guarantees RTE-02 no-write-on-Cancel gate at architecture level"
    - "Conditional SatellitePreviewModal render ({open && <Modal/>}) unmounts Mapbox preview instance on close — Pitfall 5 prevention; separate mapRef from main MapView"
    - "CRS localStorage per-project memory — localStorage['bayrak-dxf-crs-'+projectId] stores last-used EPSG; defaults to 5254 (TUREF/TM30)"
    - "Kaynak Belge D-05 version-history list — every route_source_documents row rendered newest-first with doc_type chip + geometry version badge + date + download link; not just the latest"
    - "Dynamic PdfViewer import — dynamic(() => import('./PdfViewer'), { ssr:false }) isolates pdf.js worker from SSR"

key-files:
  created:
    - src/components/dashboard/DxfUpload.tsx
    - src/components/dashboard/PdfViewer.tsx
    - src/actions/dxf-preview.ts
  modified:
    - src/actions/routes.ts
    - src/components/dashboard/RouteTabClient.tsx
    - src/components/dashboard/RouteTab.tsx

key-decisions:
  - "previewDxf Server Action (src/actions/dxf-preview.ts) separated from uploadDxf — parse + reproject only, no DB write, returned GeoJSON used solely for satellite preview; uploadDxf called only on final Onayla — Kaydet confirm; this cleanly guarantees RTE-02 Cancel-writes-nothing gate"
  - "SatellitePreviewModal conditionally rendered with {open && <.../>} not Dialog open prop — prevents ghost Mapbox instances (Pitfall 5 from 14-RESEARCH.md)"
  - "CRS defaults to EPSG:5254 (TUREF/TM30), remembered per-project in localStorage — prevents catastrophic CRS mismatch (Pitfall 2 from 14-RESEARCH.md)"

patterns-established:
  - "previewDxf + uploadDxf two-step pattern: preview action parses/reprojects for UI feedback; write action called only on explicit confirm — reusable pattern for any import flow requiring spatial preview before commit"
  - "D-05 version-history list pattern: all source documents rendered newest-first from route_source_documents table; each row has doc_type + geometry_version + uploadedAt + download link"

requirements-completed: [RTE-01, RTE-02, RTE-03, RTE-05]

# Metrics
duration: UAT-approved
completed: "2026-05-30"
---

# Phase 14 Plan 05: DXF Import UI Summary

**DXF import UI with satellite-preview confirmation gate — drop-zone to layer-picker to CRS selector to Mapbox satellite modal to DB save — plus full source-document version history (D-05) and inline PDF viewer (D-06)**

## Performance

- **Duration:** (UAT session; implementation preceded this summary)
- **Started:** —
- **Completed:** 2026-05-30
- **Tasks:** 3 (2 auto + 1 checkpoint UAT)
- **Files modified:** 6

## Accomplishments

- DxfUpload.tsx state machine (idle→parsing→layer-picker→crs-select→previewing→saving→saved) with SatellitePreviewModal on satellite-streets-v12 — Onayla button disabled until map onLoad; Cancel returns to layer-picker writing nothing (RTE-01/02)
- Dedicated `previewDxf` Server Action (`src/actions/dxf-preview.ts`) for parse + reproject WITHOUT any DB write — architectural guarantee of the RTE-02 no-write-on-Cancel gate
- Kaynak Belge section lists every route_source_documents row newest-first (D-05 version history) with doc_type chip, geometry version badge, date, and download link; latest PDF renders inline via PdfViewer (D-06)
- GeoJSON RouteUpload path left entirely untouched above a Separator (RTE-04 regression: user confirmed working)
- Human UAT checkpoint approved: all RTE-01/02/03/05 passes, D-05 version history verified with two sequential DXF imports, TR/EN toggles confirmed bilingual

## Task Commits

Each task was committed atomically:

1. **Task 1: DxfUpload.tsx state machine + LayerPicker + CrsSelector + SatellitePreviewModal** — `fb7e006` (feat)
2. **Task 2: getRouteSourceDocuments + PdfViewer.tsx + RouteTabClient/RouteTab integration** — `f9593ca` (feat)
3. **Task 3: UAT checkpoint** — approved by user; no code commit (checkpoint only)

## Files Created/Modified

- `src/components/dashboard/DxfUpload.tsx` — DXF upload state machine with LayerPicker, CrsSelector, SatellitePreviewModal (satellite-streets-v12, onLoad-gated confirm, conditional render)
- `src/actions/dxf-preview.ts` — previewDxf Server Action: parse + reproject DXF for satellite preview WITHOUT DB write (split from uploadDxf per deviation note)
- `src/components/dashboard/PdfViewer.tsx` — react-pdf inline viewer ('use client', pdfjs GlobalWorkerOptions, prev/next navigation, width 100%)
- `src/actions/routes.ts` — added getRouteSourceDocuments(projectId): auth-guarded, newest-first, all plain-serializable fields
- `src/components/dashboard/RouteTabClient.tsx` — extended ExistingRoute interface (5 nullable Phase 14 fields), sourceDocuments prop, DxfUpload zone below Separator, metadata card CRS/layer/length/version rows, Kaynak Belge D-05 version-history list + D-06 PDF viewer
- `src/components/dashboard/RouteTab.tsx` — serializes new getRoute columns + calls getRouteSourceDocuments, passes sourceDocuments to RouteTabClient

## Decisions Made

- **previewDxf split from uploadDxf:** The plan's `src/actions/dxf-preview.ts` deviation — a dedicated Server Action for preview-only parse + reproject was created to cleanly guarantee RTE-02 (no DB write before Confirm). uploadDxf (Plan 04) is called only on "Onayla — Kaydet". This is the recommended architectural pattern for any import flow requiring spatial preview before commit.
- **Conditional SatellitePreviewModal render:** `{open && <Modal/>}` used instead of Dialog `open` prop — unmounts the Mapbox GL JS map instance on close, preventing ghost canvas accumulation (Pitfall 5).
- **CRS defaults to 5254 (TUREF/TM30):** Stored per-project in localStorage key `bayrak-dxf-crs-{projectId}`; remembered across sessions per D-01.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Architecture] previewDxf Server Action created separately from uploadDxf**
- **Found during:** Task 1 (DxfUpload.tsx implementation)
- **Issue:** Plan 04's uploadDxf performs the full validate + reproject + DB write in one call. The plan text for Task 1 noted this tension and asked the executor to "parse-for-preview then write-on-confirm." Implementing this cleanly required a dedicated previewDxf action that returns reprojected GeoJSON without touching the DB.
- **Fix:** Created `src/actions/dxf-preview.ts` exporting `previewDxf(projectId, blobUrl, sourceCrs, sourceLayer) → { ok, geojson, count, approvedCount } | { ok: false, error }`. DxfUpload calls previewDxf for the satellite modal; on Onayla it calls uploadDxf (Plan 04 action) for the actual DB write. Cancel never reaches uploadDxf.
- **Files modified:** src/actions/dxf-preview.ts (created), src/components/dashboard/DxfUpload.tsx
- **Verification:** UAT step 3 (Cancel DB check) confirmed no route or route_source_documents row written on Cancel.
- **Committed in:** fb7e006 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical safety architecture)
**Impact on plan:** The previewDxf split is the cleanest implementation of the plan's own RTE-02 requirement. No scope creep; the new file replaces inline logic that would have been needed in DxfUpload.tsx anyway.

## Issues Encountered

None beyond the previewDxf split described above. Build and tsc were clean after both task commits.

## UAT Checkpoint Results

**Checkpoint:** Task 3 — human-verify gate
**Outcome:** APPROVED — user confirmed "all works"
**Verified surfaces:**
- RTE-04: GeoJSON RouteUpload path still works (upload → route renders unchanged)
- RTE-01/02: DXF drop → layer pick → CRS select → satellite modal on correct Turkey location → Onayla disabled until map loads → Cancel writes nothing (DB checked) → Confirm saves route + metadata card renders correctly
- D-05: Second DXF import shows BOTH source documents in Kaynak Belge (newest first, both with geometry version + date + download)
- RTE-05: Approved-submissions re-import warning appeared and geometry_version incremented
- RTE-03/D-06: DXF İndir download link confirmed; PDF inline viewer confirmed
- TR/EN: All DXF copy bilingual across both locales

## User Setup Required

None — no new external service configuration required. Vercel Blob, Mapbox token, and Neon Postgres already configured in prior phases.

## Next Phase Readiness

- DXF import is fully operational end-to-end; route geometry stored with source provenance and version history
- Phase 14 Plan 06 (final plan) can proceed; or Phase 15 (chainage as-built) has all route foundation it needs
- Known constraint for Phase 15: chainage_m snapshot write must be in the same transaction as `status = 'approved'` in bot-audit.ts (STATE.md Phase 15 key constraint — unchanged)

## Self-Check

- `src/components/dashboard/DxfUpload.tsx` — exists (committed fb7e006)
- `src/actions/dxf-preview.ts` — exists (committed fb7e006, deviation)
- `src/components/dashboard/PdfViewer.tsx` — exists (committed f9593ca)
- `src/actions/routes.ts` — getRouteSourceDocuments export present (committed f9593ca)
- `src/components/dashboard/RouteTabClient.tsx` — DxfUpload + Kaynak Belge integration (committed f9593ca)
- `src/components/dashboard/RouteTab.tsx` — getRouteSourceDocuments call + sourceDocuments prop (committed f9593ca)
- Both commits exist: fb7e006, f9593ca

## Self-Check: PASSED

---
*Phase: 14-schema-foundation-dxf-route-import*
*Completed: 2026-05-30*
