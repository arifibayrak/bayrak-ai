# Project Research Summary

**Project:** bayrak.ai v4.0 — Document-Driven Route Import, Chainage As-Built Tracking & AI Vision Assist
**Domain:** Linear-infrastructure field operations platform (pipeline/utility construction, Turkey)
**Researched:** 2026-05-29
**Confidence:** HIGH

## Executive Summary

bayrak.ai v4.0 is a precision extension to a shipped and validated field-ops platform: the goal is to transform the existing PostGIS-backed geospatial pipeline into a formal as-built record that engineers and project owners can trust as a contractual deliverable. The three capability areas — DXF route import, chainage-based progress tracking, and AI vision assist — are tightly sequenced: import is the foundation everything else stands on, chainage tracking is the headline deliverable, and AI vision is an independently deployable enhancement once the route and submission data structures are stable. The research confirms all three areas are achievable with the existing stack plus three small net-new dependencies (`dxf-parser`, `proj4`, `react-pdf`), all pure JavaScript, all Vercel-safe.

The dominant technical risk is georeferencing correctness. Turkish engineering DXF files use projected coordinate systems (TUREF/TM30, UTM Zone 35, ED50) that produce coordinates with values like 600,000 m — if these are ingested as WGS84 degrees, the route silently lands in the ocean and every downstream spatial query returns nonsense. The mandatory safeguard is a two-step import UX: (1) engineer selects the source CRS from a labelled dropdown, (2) a satellite preview over the Mapbox basemap must be confirmed before any DB write occurs. The preview catches axis-swap, datum errors, and wrong CRS selection simultaneously — without it, errors are invisible until field submissions start failing spatial snapping.

The second-order risk is data integrity of the as-built record. Research revealed a direct conflict between the ARCHITECTURE.md recommendation (derive chainage dynamically from `segment_fraction × total_length_m`) and the PITFALLS.md assessment (dynamic derivation is the most insidious risk: a route re-import silently rewrites all historical chainage values). This conflict is resolved in the Open Questions / Decisions section with a clear recommendation that the roadmapper must inherit. The AI vision assist carries a distinct trust risk: false positives shown to auditors before an eval harness establishes precision erode trust in the feature permanently — the eval gate must be built before flags are surfaced in any UI.

---

## Open Questions / Decisions

### RESOLVED: Dynamic vs. Snapshotted Chainage — CRITICAL ARCHITECTURAL DECISION

**The conflict:**
- ARCHITECTURE.md recommends computing chainage dynamically at read time: `chainage_m = segment_fraction × total_length_m + chainage_offset_m`. Explicitly avoids a `route_segments` table. The `segment_fraction` stored per submission is the canonical linear-referencing primitive.
- PITFALLS.md (Pitfall 2, Severity: CRITICAL) flags this as the "most insidious data-integrity risk": when an office engineer re-imports a corrected DXF, the route geometry changes, `total_length_m` changes, and every historical submission's implied chainage silently shifts. An as-built record showing "km 2.3: 150 m of pipe approved" may show "km 2.1" after re-import — without audit trail — corrupting the legal record.

**Resolved recommendation: SNAPSHOT chainage at approval time; derive dynamically only for in-progress work.**

- Add a `chainage_m numeric(10,2)` column to `submissions`. At the moment an auditor approves a submission, the approval transaction MUST compute and store `ROUND(segment_fraction × total_length_m, 2)` as the frozen chainage value. This value is immutable after that point.
- Add a `route_geometry_version integer` column to `routes`. Each re-import increments this version. Add `route_geometry_version integer` to `submissions` to record which route geometry the chainage was computed against — creating an explicit audit trail.
- For **in-progress/pending submissions** (not yet approved), chainage MAY be derived dynamically for display only: `segment_fraction × total_length_m + chainage_offset_m`. Acceptable because pending submissions have no legal standing yet.
- All user-facing displays (dashboard, Telegram notifications, Excel/PDF exports, as-built strip view) MUST read `submissions.chainage_m` (the snapshotted value) for approved records. Never recompute from fraction at export or display time.
- On route re-import, show a confirmation warning: "This project has N approved submissions with recorded chainage. Their chainage will NOT change. Only new submissions will use the updated route geometry (v{N+1})."
- The ARCHITECTURE.md anti-pattern note ("no `route_segments` table") remains valid — the `chainage_m` snapshot is on `submissions`, not a new table.

**Schema additions required in migration 0010 (or split 0010/0011):**
```sql
ALTER TABLE submissions ADD COLUMN chainage_m numeric(10,2);
ALTER TABLE submissions ADD COLUMN route_geometry_version integer;
ALTER TABLE routes ADD COLUMN geometry_version integer NOT NULL DEFAULT 1;
-- plus: total_length_m, source_blob_url, source_crs, source_layer, chainage_offset_m
```

**Approval path implication:** `handleAuditDecision` in `bot-audit.ts` must write `chainage_m` and `route_geometry_version` in the same transaction as `status = 'approved'`. Planner must schedule this explicitly alongside the chainage view phase.

### NEEDS DESIGN STEP: SPLINE Entity Support

`dxf-parser` 1.1.2 parses SPLINE entities structurally but does not interpolate control points into curve geometry. PITFALLS.md recommends skipping SPLINE with a warning for v4.0 ("use LWPOLYLINE export from AutoCAD"). For Turkish pipeline survey workflows LWPOLYLINE is dominant. Recommended v4.0 approach: parse LWPOLYLINE and POLYLINE only; detect SPLINE entities in the selected layer and surface a non-blocking warning. If the resulting geometry has < 2 vertices after filtering, reject with a clear error. Flag for v4.x if field evidence shows SPLINE-based centerlines are common.

### NEEDS DESIGN STEP: Chainage Calibration Override UX

The calibration offset (`chainage_offset_m` stored per route) lets engineers align displayed chainages to a contract datum (e.g. project master chainage starts at "km 12+450", not "km 0"). PITFALLS.md (Pitfall 13) flags inconsistent offset application across surfaces as a medium-severity issue. Recommended v4.0 approach: store the offset as a numeric field on `routes`; apply consistently in Postgres (`calibrated_chainage_m = raw_chainage_m + chainage_offset_m`); recompute all approved submissions' `calibrated_chainage_m` in a single UPDATE transaction when the offset changes. The "anchor on map" UX (pick a GPS point, enter known chainage, system solves the offset) requires a dedicated design step — defer to a v4.x phase; ship as a simple numeric input in v4.0.

---

## Key Findings

### Recommended Stack

The v4.0 stack additions are deliberately minimal: three pure-JavaScript npm packages on top of the fully-validated existing stack. All three run on Vercel Node.js runtime and in the browser where needed; none require WASM, native binaries, or edge-runtime workarounds.

**Net-new dependencies:**
- `dxf-parser` 1.1.2: DXF file parsing — pure JS, synchronous `parseSync()`, typed entity objects for LWPOLYLINE/POLYLINE/LINE; preferred over `dxf` 5.3.1 (rendering-optimized) for server-side geometry extraction where entity-type discrimination matters
- `proj4` 2.20.8: CRS reprojection to WGS84 in JavaScript at upload time — preferred over PostGIS `ST_Transform` because Neon's inclusion of TUREF EPSG:5254 in `spatial_ref_sys` is unverifiable without a live query; JS reprojection requires no migration and no DB dependency
- `react-pdf` 10.4.1 + `pdfjs-dist` 5.7.284 (peer dep): browser-side PDF viewing for the source document reference panel; must be `'use client'` with dynamic import `{ ssr: false }` in RSC parents

**What NOT to add:** No DWG parser (proprietary; DXF export from AutoCAD is one-click). No in-browser DXF viewer (heavy bundle, CAD software serves this better). No Braintrust/Langfuse for v4.0 (add after eval baseline established). No `proj4-epsg` package (only 7 Turkish CRS strings needed; hardcode in `src/lib/crs.ts`).

**Turkey CRS lookup table** (embed as hardcoded constants — do NOT fetch from epsg.io at runtime): EPSG:5254 (TUREF/TM30, primary modern Turkey), EPSG:5253 (TUREF/TM27), EPSG:5255 (TUREF/TM33), EPSG:23035 (ED50/UTM35N, pre-2005 legacy), EPSG:23036 (ED50/UTM36N), EPSG:32635 (WGS84/UTM35N), EPSG:32636 (WGS84/UTM36N).

**Linear referencing:** No new dependency. PostGIS functions already on Neon: `ST_LineLocatePoint`, `ST_Length(::geography)`, `ST_LineInterpolatePoint`, `ST_LineSubstring`. Store `total_length_m` on `routes` at import time to avoid recomputing on every chainage query.

**AI vision:** No new library. Existing AI SDK v6 + Vercel AI Gateway + Claude vision. Use `generateObject` with a Zod schema (not `generateText`) for typed structured output that guards against prompt injection via image content.

### Expected Features

v4.0 net-new features only. Existing core loop (Telegram bot, auditor approval, PostGIS snapping, Mapbox dashboard, BOQ decrement, hakkediş, exports, brand) is infrastructure and unchanged.

**Must have (table stakes — v4.0 launch blockers):**
- DXF upload with layer picker + CRS declaration — without this, import requires engineer to pre-convert to GeoJSON
- Satellite import preview before save — the critical safety net; no other mitigation catches wrong CRS selection before data is corrupted
- Chainage snapshotted at approval time (`chainage_m` column on `submissions`) — all downstream features require this; see RESOLVED decision above
- Per-segment as-built strip view (chainage X-axis, colour-coded by status) with drill-down — headline deliverable of the milestone
- Per-km completion % KPI on dashboard — trivial once chainage exists; expected by the office audience
- AI vision assist (async, advisory-only, eval-gated) — deferred from v1; PROJECT.md explicitly commits to v4.0

**Should have (competitive differentiators — v4.x):**
- Chainage attribution drill-down by km range — who submitted, who audited, what BOQ line
- Chainage calibration override (numeric offset input) — displayed chainages must match contract drawings
- As-built Excel/PDF export keyed by chainage — formal contractual deliverable for project owners
- DXF source document reference viewer (PDF path) — react-pdf renders stored PDF alongside the map

**Defer to v5+:**
- Chainage-aware AI anomaly flag — requires AI assist to be stable and chainage calibrated
- Time-chainage / Gantt overlay — requires schedule data not yet in the system
- SPLINE entity tessellation — only if field evidence shows this is common
- Full in-browser DXF/DWG viewer — anti-feature; engineer's CAD software does this better

**Anti-features (never build):**
- Automatic CRS detection from DXF (unreliable; silent failure corrupts route)
- BOQ auto-extraction from CAD drawings (saha ADR-0002; heavy ML, error-prone billing)
- Real-time chainage feedback in Telegram submission critical path (adds latency)
- Per-worker km-zone geofencing in bot (GPS drift causes false blocks)

### Architecture Approach

The v4.0 architecture extends the existing App Router pattern cleanly. A new `uploadDxf` Server Action mirrors the existing `uploadRoute` Server Action, both leading to the same `ST_GeomFromGeoJSON` upsert path. DXF parsing and CRS reprojection live in a pure library function (`src/lib/dxf-parser.ts`) that is Node.js-runtime-only, unit-testable with fixture files, and never imported from edge routes or middleware. The chainage strip view is a new "As-Built" tab in the existing project page tab bar, implemented as RSC + client component following the established `RouteTab`/`KayitlarTab` pattern. AI vision runs entirely off the Telegram webhook critical path via fire-and-forget `enqueueAiFlag` after the approval transaction commits, with a cron-job retry for stuck pending rows.

**Major components:**
1. `src/lib/dxf-parser.ts` [NEW pure lib] — `parseDxfToLineString(buffer, sourceCrs, sourceLayer)`: extracts LWPOLYLINE/POLYLINE vertices, reprojects via `proj4` to WGS84, returns GeoJSON LineString string
2. `uploadDxf` Server Action [NEW in `src/actions/routes.ts`] — auth guard → ownership check → Blob upload → parse → bounding-box validation → DB upsert with `total_length_m`, `geometry_version`, provenance columns
3. `DxfUpload.tsx` [NEW client component] — `accept=".dxf"`, reads as `ArrayBuffer`, CRS selector with human-readable labels, layer picker, satellite preview modal before save
4. `getChainageBuckets` Server Action [NEW in `src/actions/chainage.ts`] — SQL GROUP BY on `floor(chainage_m / bucket_size_m)`, returns `ChainageBucket[]` with worker/auditor attribution, BOQ breakdown, submission IDs
5. `ChainageTab.tsx` / `ChainageTable.tsx` [NEW RSC + client] — as-built strip view with colour-coded km buckets, click-to-drill-down to existing submission detail page
6. `src/lib/ai-flag-queue.ts` + `src/lib/ai-vision.ts` [NEW libs] — `enqueueAiFlag` inserts pending row and fires `runAiAnalysis` as detached Promise; `runAiAnalysis` calls AI SDK `generateObject` with Zod schema, writes result with `eval_passed` gate
7. `/api/cron/ai-flags/route.ts` [NEW] — cron retry for rows stuck in `pending` > 5 minutes; registered in `vercel.json`
8. `submission_ai_flags` table [NEW] — per-submission AI analysis result with status, scores, classification, `eval_passed` gate, raw response for eval harness

**Build order (dependency-ordered):**
- Phase A: Schema migrations (foundation — all phases blocked until this ships)
- Phase B: DXF import pipeline (depends on Phase A; independent of Phase C)
- Phase C: Chainage view + approval snapshot modification (depends on Phase A; independent of Phase B)
- Phase D: AI vision assist (depends on Phase A schema; independent of Phase B and C)

### Critical Pitfalls

Full inventory is in PITFALLS.md (13 pitfalls, all HIGH/CRITICAL/MEDIUM severity). The five that must be addressed before writing any code:

1. **CRS mismatch — projected coordinates treated as WGS84** (Pitfall 1, CATASTROPHIC) — DXF files never embed CRS; Turkish engineering coordinates have values like 600,000 m. If inserted as WGS84 without reprojection, route lands in the ocean; all spatial queries return wrong results silently. Prevention: mandatory CRS selector with human-readable labels; mandatory satellite preview before DB write; Turkey bounding-box validation after reprojection (`lng: 25.7–44.8, lat: 35.8–42.2`); include ED50 EPSG codes for pre-2005 drawings (~100 m datum shift).

2. **Route re-import silently shifts historical chainage** (Pitfall 2, CRITICAL) — resolved by the SNAPSHOT decision above. Snapshot `chainage_m` at approval time in the same transaction; never recompute historical values from current route geometry.

3. **AI vision in the Telegram webhook critical path** (Pitfall 10, CRITICAL) — awaiting a Claude vision call (2–6 s) inside the webhook handler causes Telegram to retry after timeout, creating duplicate submissions. Prevention: fire-and-forget `enqueueAiFlag` after approval transaction; cron retry for stuck rows; never `await runAiAnalysis` in webhook path.

4. **AI hallucinated anomalies eroding auditor trust** (Pitfall 11, HIGH) — flags shown before eval precision threshold (≥ 0.80) is validated against a labeled dataset causes auditors to permanently stop reading AI flags. Prevention: build eval harness and labeled fixture dataset first; gate all flag display behind `eval_passed = true`; use `generateObject` with Zod schema to prevent prompt injection via image.

5. **DXF layer selection — wrong polyline taken as centerline** (Pitfall 5, HIGH) — multi-layer DXF files contain topography, cadastral boundaries, annotation alongside the pipeline centerline. Prevention: parse layer list first (layer name + entity count), present to engineer, require explicit selection, parse only selected layer; default to layers named `AXIS`, `CL`, `CENTERLINE`, or `MERKEZ`.

**Additional must-handle pitfalls:**
- Axis order confusion in proj4: write a single `reprojectToWGS84(epsg, easting, northing)` utility with unit tests against known Turkish coordinates — e.g., EPSG:5254 easting 600,000 / northing 4,570,000 → approximately [29.0°E, 41.3°N] (Pitfall 3)
- Drizzle migration hand-edits: `geometry(LineString, 4326)` not `geometry(Geometry, 4326)`; GIST index must be hand-added; both Neon branches must be migrated (Pitfall 12)
- Float precision: store `chainage_m` as `numeric(10,2)`, bucket in Postgres, clamp completion at 100% with `LEAST(..., 100.00)` (Pitfall 7)
- DXF upload via Vercel Blob direct client PUT, not through Next.js bodyParser (4.5 MB limit vs. potentially 50 MB DXF files) (Pitfall 6)

---

## Implications for Roadmap

Four phases emerge from the dependency graph in FEATURES.md and the build order in ARCHITECTURE.md. Ordering is driven by hard data dependencies: schema before everything; import and chainage view are independent after schema; AI vision is independently deployable after schema.

### Phase 14: Schema Foundation + DXF Route Import

**Rationale:** The `chainage_m` column must exist before any approval can snapshot it. The DXF import pipeline must exist before any chainage view has data to display. Schema and import ship together: schema without import leaves no data pipeline; import without snapshot schema corrupts the as-built record from day one.

**Delivers:**
- Migrations: `routes` extended (5 new columns including `total_length_m`, `geometry_version`); `submissions` extended (`chainage_m`, `route_geometry_version`); `submission_ai_flags` table created
- `src/lib/crs.ts` — hardcoded Turkey CRS lookup table (7 EPSG strings)
- `reprojectToWGS84(epsg, easting, northing)` utility with unit tests against Istanbul-area known coordinates
- `src/lib/dxf-parser.ts` — `parseDxfToLineString(buffer, sourceCrs, sourceLayer)` pure function with vitest fixtures
- `uploadDxf` Server Action — auth guard, Blob upload (client PUT pattern), parse, bounding-box validation, DB upsert
- `DxfUpload.tsx` — CRS selector (human-readable labels), layer picker, satellite preview modal with confirm/cancel
- `uploadRoute` Server Action modified to populate `total_length_m` and increment `geometry_version` on every upsert

**Addresses:** DXF upload (P1), CRS declaration (P1), import preview (P1) from FEATURES.md
**Avoids:** Pitfalls 1, 2, 3, 4, 5, 6, 8, 12 — all route-import pitfalls addressed in one foundational phase
**Research flag:** NEEDS RESEARCH on the satellite preview modal UX (temporary Mapbox GeoJSON source before save, confirm/cancel flow) and the two-step Blob upload pattern (client PUT to Blob → Server Action receives URL). Novel for this project.

### Phase 15: Chainage As-Built View + Approval Snapshot

**Rationale:** Once the schema exists, the approval path must be updated to snapshot `chainage_m` before any new submission is approved under the new schema. The chainage view is then built against real data. The snapshot modification and the view ship together to avoid a period where the view exists but shows NULL chainages for all approvals.

**Delivers:**
- `handleAuditDecision` modified: snapshots `chainage_m = ROUND(segment_fraction × total_length_m, 2)` and `route_geometry_version` in the approval transaction
- One-time backfill migration: computes `chainage_m` for all existing approved submissions using current route geometry (clearly noted as estimated, not true snapshots)
- `getChainageBuckets` Server Action — SQL GROUP BY on `floor(chainage_m / 1000)` with worker/auditor/BOQ JSON aggregations, over-completion clamp
- `ChainageTab.tsx` RSC + `ChainageTable.tsx` client component — as-built strip view with colour-coded km buckets
- Per-km completion % KPI on dashboard
- `GET /api/exports/chainage` route handler — Excel + PDF chainage as-built export (reuses existing ExcelJS + `@react-pdf/renderer`)
- `numeric(10,2)` storage convention enforced; Postgres-side bucketing throughout

**Addresses:** Chainage derivation snapshot (P1), per-segment strip view (P1), per-km completion % (P1), as-built export (P2 — included because it reuses existing infrastructure trivially) from FEATURES.md
**Avoids:** Pitfalls 2 (snapshot enforced), 7 (float precision), 9 (over-completion clamp), 13 (calibration consistency)
**Research flag:** Standard patterns — SQL GROUP BY and JSON aggregation follow established Drizzle `sql` template patterns from Phases 4 and 10; exports follow Phase 11 patterns. Skip research phase.

### Phase 16: AI Vision Assist

**Rationale:** AI vision is independently deployable after Phase 14 schema (needs `submission_ai_flags` table). Placed last because the eval harness must be built and pass before any flags are surfaced — this has the longest QA cycle regardless of code complexity. Placing it last also means the chainage view (headline deliverable) ships before the AI feature.

**Delivers:**
- `src/lib/ai-vision.ts` — `runAiAnalysis`: AI SDK `generateObject` with Zod schema, writes to `submission_ai_flags`, applies `eval_passed` gate
- `src/lib/ai-flag-queue.ts` — `enqueueAiFlag`: inserts pending row, fires `runAiAnalysis` as detached Promise
- `tests/ai-vision.test.ts` — Vitest eval harness with labeled fixture photos (≥ 30 submissions, ground-truth labels); precision ≥ 0.80 on "anomaly" class required before enabling flag display (AI-01..AI-05)
- `handleAuditDecision` modified: adds `enqueueAiFlag` call after hakkediş recompute block (best-effort, never awaited)
- `/api/cron/ai-flags/route.ts` — cron retry for stuck pending rows, registered in `vercel.json`
- `getSubmissionAiFlag` Server Action — queries `WHERE eval_passed = true`
- `AiFlagCard.tsx` — client component on submission detail page; amber dot on `ChainageTable` rows with eval-passed flag

**Addresses:** AI vision assist (P1 — PROJECT.md commitment) from FEATURES.md
**Avoids:** Pitfalls 10 (vision off critical path), 11 (eval harness gates all display), prompt injection via typed Zod schema
**Research flag:** NEEDS RESEARCH on eval harness labeling workflow (tooling for creating labeled fixture dataset from real submission photos), the `generateObject` Zod schema for construction photo classification, and Vercel `after()` behavior in cold-start serverless contexts.

### Phase 17 (Optional): Chainage Calibration Override UX

**Rationale:** `chainage_offset_m` is already stored in the schema from Phase 14. The simple numeric offset input is a small addition. Placed as a separate optional phase because it requires the dedicated UX design step noted above and because the strip view is fully functional without it using raw arc-length chainage.

**Delivers:**
- `setChainageOffset` Server Action
- `ChainageOffsetForm.tsx` — numeric input for offset in metres, converting to/from `km+m` display format
- Recompute trigger: UPDATE `calibrated_chainage_m` for all project approvals on offset change

**Addresses:** Chainage calibration override (P2) from FEATURES.md
**Avoids:** Pitfall 13 (calibration inconsistency across surfaces)
**Research flag:** Skip research phase — math and DB pattern are straightforward.

### Phase Ordering Rationale

- Schema precedes everything: `chainage_m` must exist before any approval snapshots it; `submission_ai_flags` must exist before AI vision runs
- DXF import and chainage view are independent after Phase 14 and could run in parallel; serialized here to give each phase clean scope
- Approval snapshot modification (Phase 15) is placed with the chainage view — not with DXF import — because it requires the view to provide value, and the backfill migration must be sequenced carefully
- AI vision (Phase 16) is independent and placed last to give the eval harness maximum preparation time
- Calibration override (Phase 17) is optional and correctly follows the strip view: engineers notice the calibration need only after seeing raw chainages

### Research Flags

Phases needing deeper research during planning:
- **Phase 14 (DXF Import):** Satellite preview + confirm UX (Mapbox modal, temporary GeoJSON source before save); two-step Blob upload pattern (client PUT → Server Action receives URL); final SPLINE handling decision
- **Phase 16 (AI Vision):** Eval harness labeling workflow; `generateObject` Zod schema design for construction photo classification; Vercel `after()` behavior in cold-start serverless contexts

Phases with standard, well-documented patterns (skip research phase):
- **Phase 15 (Chainage View):** SQL GROUP BY + JSON aggregation follows established Drizzle `sql` template patterns from Phases 4 and 10; exports follow Phase 11 patterns exactly
- **Phase 17 (Calibration Override):** Simple numeric input → Server Action → single-table UPDATE; no novel integration

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All three new packages verified against npm registry (versions, peer deps, Vercel compatibility). PostGIS linear referencing functions confirmed against official docs. AI SDK image content format verified against ai-sdk.dev. |
| Features | HIGH | Turkish chainage K+M notation, as-built conventions, strip view industry standard all verified via multiple sources. Feature priority matrix grounded in competitor analysis (TILOS, Procore, Vitruvi). Anti-features have clear rationale. |
| Architecture | HIGH | Architecture researcher read all existing source files before making recommendations. Component boundaries and data flows grounded in actual codebase. Dynamic chainage recommendation overridden by RESOLVED decision above. |
| Pitfalls | HIGH | All 13 pitfalls grounded in existing project constraints (D-49 drizzle-kit push ban, `::geography` cast convention, bot-path `after()` ban, immutable migration protocol) and PostGIS/DXF/AI domain knowledge. |

**Overall confidence:** HIGH

### Gaps to Address

- **TUREF EPSG:5254 in Neon `spatial_ref_sys`:** Unverifiable without a live query. The `proj4` JS approach sidesteps this entirely. During Phase 14 execution, run `SELECT COUNT(*) FROM spatial_ref_sys WHERE srid = 5254` against the Neon dev branch — purely informational.
- **Vercel `after()` vs. fire-and-forget Promise in serverless:** PITFALLS.md recommends `after()` as more reliable; ARCHITECTURE.md uses fire-and-forget Promise. The cron retry covers the gap either way. Verify against current Vercel docs during Phase 16 planning.
- **One-time chainage backfill for existing approvals:** Approved submissions from Phases 4–13 have no `chainage_m`. A backfill migration computes `ROUND(segment_fraction × total_length_m, 2)` for all existing approvals. Accuracy depends on route geometry not having changed since approval — for the current single-tenant MVP with one active project this is deterministic. Flag for verification during Phase 15 planning.
- **DXF fixture files for unit tests:** `parseDxfToLineString` unit tests require real DXF fixture files in Turkish projected coordinates. Source not identified in research. During Phase 14 planning, export a sample DXF from AutoCAD in TUREF/TM30 for the fixture set.

---

## Sources

### Primary (HIGH confidence)
- postgis.net/docs/ST_LineLocatePoint.html — linear referencing function signatures confirmed
- postgis.net/workshops/postgis-intro/linear_referencing.html — chainage pattern confirmed
- ai-sdk.dev/docs/foundations/prompts — image content part format (URL, base64, buffer) verified
- epsg.io/5254 — TUREF/TM30 proj4 string verified
- epsg.io/23035, epsg.io/23036 — ED50 UTM 35N/36N proj4 strings verified
- npm: dxf-parser 1.1.2 — entity type list, `parseSync()` API, pure-JS confirmed
- npm: proj4 2.20.8 — 1,036 dependents, actively maintained, axis order convention confirmed
- npm: react-pdf 10.4.1, pdfjs-dist 5.7.284 — React 19 peer dep, Next.js 15 worker setup confirmed
- github.com/wojtekmaj/react-pdf README — Next.js 15 App Router worker setup pattern
- grammy.dev/plugins/conversations — replay engine behavior and `conversation.external()` usage

### Secondary (MEDIUM confidence)
- medium.com/@supulkalhara7 — DXF to GeoJSON + proj4 reprojection pattern confirmed working
- strategicerp.com — strip chart and chainage-wise DPR (as-built strip view industry standard)
- construction.trimble.com/tilos — TILOS competitor feature set for chainage-based progress
- spin.atomicobject.com/linestring-geometry-drizzle/ — Drizzle LineString migration hand-edit pattern (known project constraint D-49)
- hkmo.org.tr — ED50 Turkey datum shift documentation

### Tertiary (LOW confidence — validate during implementation)
- Vercel `after()` behavior with fire-and-forget Promises in cold-start serverless contexts — inferred from Vercel docs; empirical verification needed during Phase 16
- `dxf-parser` SPLINE entity interpolation gap — stated in package README; needs a real SPLINE fixture to verify behavior

---

*Research completed: 2026-05-29*
*Ready for roadmap: yes*
