# Feature Research

**Domain:** Linear-infrastructure field-ops platform — v4.0 new features only
**Researched:** 2026-05-29
**Confidence:** HIGH (domain conventions verified via multiple sources; Turkish CRS from official EPSG registry)

---

## Scope Note

This file covers **only the v4.0 net-new features**. The existing loop (Telegram bot, auditor approve/reject, PostGIS snapping, Mapbox dashboard, BOQ auto-decrement, hakkediş, exports, brand) is already validated and is treated as infrastructure here.

---

## Domain Conventions: Chainage / Stationing

Before the feature breakdown, a precise definition of chainage as used in Turkish linear-infrastructure construction, because every v4 feature depends on it.

### Notation

**Format:** `K+M` where K = kilometres from route start, M = metres remainder, zero-padded to three digits.

Examples:
- `0+000` — route start
- `0+750` — 750 m from start
- `1+250` — 1 km 250 m from start
- `12+480` — 12 km 480 m from start

This is **identical** to the international "stationing" notation used on highways, pipelines, and utility alignments worldwide (US: 1+25.00 using feet; metric countries: K+M above). Turkish construction uses the metric form and the term **"km"** informally alongside the formal notation.

### Segment ranges

Work is always referenced as **from-station / to-station**: `0+200 – 0+400` means a 200 m sub-segment of the route. A foreman will say "km 3'ten km 4'e kadar" (from km 3 to km 4) colloquially, but the formal record uses chainage ranges.

### "As-built" meaning in linear-infra construction

An as-built record for a pipeline means: for every metre of the designed route, what was actually constructed, by whom, when, and verified by whom. Concretely:
- The designed route (centerline) is the reference.
- Actual work locations are recorded against that reference (chainage fraction or explicit from/to chainage).
- A running as-built survey annotates the longitudinal section with actual chainage values at every structure, deviation, or handover point.
- Completion is expressed as approved length / total length, per segment and cumulatively.

### What a foreman / office engineer wants to see

- "At chainage 3+400, what was logged, approved, by which worker and auditor?"
- "Which segments of the route are complete (approved), in progress, or not started?"
- "What is the cumulative approved length as of today, and what percentage of total route is that?"
- A strip view oriented along the route axis is the industry-standard visual: segment rows coloured by status (not started / in progress / approved), chainage on the horizontal axis.

### Existing PostGIS foundation

The platform already stores, per submission: `snapped_point` (geometry Point), `segment_fraction` (float 0–1, position along the matched segment LineString), and `segment_id` (FK to the route segment). PostGIS's `ST_LineLocatePoint` returns this fraction; `ST_LineInterpolatePoint` can reconstruct a point from any fraction; `ST_LineSubstring` extracts a sub-segment. These are the building blocks for chainage derivation — no new spatial primitives needed.

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Dependencies on Existing Features | Notes |
|---------|--------------|------------|-----------------------------------|-------|
| **DXF upload with layer picker** | Engineers work in AutoCAD daily; DXF (DWG export) is the universal hand-off format for designed alignments. If the import is "upload GeoJSON only", the engineer has to do an external conversion step they don't know how to do. A layer picker is non-negotiable because a DXF almost always has multiple layers (alignment, ROW boundary, chainages, title block) and only one layer is the centerline. | MEDIUM | PostGIS `route` LineString storage (existing GeoJSON pipeline reused); Mapbox preview component | DXF files do not embed CRS — the engineer must declare the source projection. The most common Turkish engineering projections are TUREF/TM30 (EPSG:5254) and TUREF/TM33 (EPSG:5255), and UTM Zone 35N (EPSG:32635). App must offer a dropdown; free-text EPSG entry is a differentiator. |
| **CRS declaration on import** | DXF has no embedded CRS metadata. If the app assumes WGS84 and the drawing is in TUREF/TM30 (metre-based), the route will appear in the Atlantic ocean. The engineer must be told explicitly: "select the coordinate system your drawing was created in". | LOW | None — pure UI + proj4 or PROJ library server-side | Offer preset options: TUREF/TM30, TUREF/TM33, UTM35N, UTM36N, WGS84/geographic. Pipeline operators in Trakya (the project region) typically use TUREF/TM30 (28.5°–31.5°E). |
| **Import preview before save** | Engineers have been burned by bad georeferencing. Industry expectation (QGIS, ArcGIS, every GIS tool shows a preview before committing). Without it, a wrong CRS selection silently corrupts the route and everything downstream re-snaps incorrectly. | LOW | Mapbox component (already exists for dashboard); preview is a modal map, not a full page | Show the parsed centerline over a Mapbox satellite basemap in a preview modal. Engineer confirms or cancels. This is the catch for "I selected the wrong projection". |
| **Chainage derivation along route** | Every engineer, foreman, and project manager in linear infra uses km markers. Without chainage, they cannot communicate position — "near the pump station" is not a valid record. Chainage derived from cumulative arc length from route start (ST_Length on geography cast for metre-accurate results) is table stakes. | MEDIUM | PostGIS route LineString (existing); submission `segment_fraction` (existing); need new `route_segments.cumulative_start_m` column | Chainage = `cumulative_start_m + (segment_fraction × segment_length_m)`. Store `cumulative_start_m` per segment at import time so chainage derivation is O(1) at query time, not a re-scan of the route. |
| **Per-segment as-built status view (strip/table)** | Industry-standard deliverable for linear-infra projects. Every major tool (TILOS, TimeChainage, StrategicERP) expresses progress as a chainage-keyed strip with segment status. Office engineers expect to see Not Started / In Progress / Approved per interval. | HIGH | Submission `segment_id` + `segment_fraction` (existing); auditor approval status (existing); chainage derivation (new) | Strip view: horizontal axis = chainage (km 0 to route end); each fixed-interval bucket (e.g. every 100 m) coloured by: grey=not started, amber=pending/in-progress, green=approved. Clicking a bucket drills to the submissions for that interval. |
| **Per-km completion % in BOQ / dashboard** | BOQ deduction already happens per submission. Executives want "% of route approved" as a headline KPI alongside BOQ % remaining. This is the linear-infra equivalent of a Gantt completion %. | MEDIUM | Approved submissions with chainage (new); route total length (stored at import); existing BOQ progress component | Compute: `approved_length_m / total_route_length_m × 100`. Can be per-segment (what % of segment 3 is approved?) or whole-route. Both are expected. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Chainage calibration override** | Routes often have a known "km 0" that is NOT the mathematical start of the GeoJSON — e.g. the pipeline starts at an existing junction already at "km 12+400" from a master reference. Letting the engineer pin a known chainage to a GPS point (or route fraction) calibrates the offset so all displayed chainages match the contract drawings. Competitors rarely expose this. | MEDIUM | Chainage derivation (new); a `chainage_offset_m` stored per project or per route | Store `chainage_offset_m` at project level; all derived chainages = `offset + cumulative_arc_length`. The calibration UI: pick a point on the map, enter its known chainage, app solves the offset. |
| **Who did what where: attribution drill-down by chainage** | "At km 3+400, who submitted, who audited, what was the photo, what was the BOQ line decremented?" This cross-referencing of spatial position + worker identity + auditor identity + BOQ is a genuine differentiator over spreadsheet-based tracking. Competitors either show the map OR the table, rarely both linked. | MEDIUM | Submission record (existing); worker + auditor attribution (existing); snapped point + segment fraction (existing); chainage derivation (new) | The drill-down is a slide-over or dedicated page: chainage range → list of submissions → each submission links to the canonical submission detail page (already built in Phase 8). |
| **As-built export keyed by chainage** | Exporting the as-built breakdown (from chainage / to chainage / worker / auditor / date / activity / qty / status) to Excel or PDF is something contractors hand to the project owner as a formal deliverable. Existing exports are BOQ/hakkediş-oriented; a chainage-keyed as-built sheet is a separate document type valued by the civil-engineering audience. | MEDIUM | Existing ExcelJS + PDF pipeline (Phase 11); chainage derivation (new); submission attribution (existing) | Add a fourth sheet to the hakkediş Excel or a standalone "As-Built Report" route handler. Format: chainage range | activity | worker | auditor | approval date | qty | BOQ line. |
| **DXF source document viewer (reference panel)** | Office engineers constantly flip between the drawing and the dashboard to check design intent vs. as-built reality. Storing the original DXF (or its rasterized thumbnail / PDF equivalent) alongside the map and showing them side-by-side reduces context switching. | HIGH | Vercel Blob storage (existing); new document storage table; potentially a PDF.js or canvas DXF renderer | Complexity depends on format: DXF rendering in-browser is hard (ezdxf / Open Design Alliance). The simpler path: require the engineer to also upload a PDF export of the drawing (AutoCAD exports PDF natively). Store the PDF in Blob, display with PDF.js iframe. Full DXF viewer is anti-feature (see below). |
| **AI vision anomaly assist (advisory)** | Auditors reviewing 20-40 photos per day suffer from decision fatigue. An AI advisory layer that flags "this photo appears blurry", "GPS location is 800 m from the snapped point", "this looks like concrete work but the BOQ line is for pipe laying" reduces the auditor's cognitive load without removing their authority. Competitors (Procore, Autodesk Build) charge enterprise pricing for AI features. | HIGH | Submission photo URL (Vercel Blob, existing); GPS coordinates (existing); snapped point + distance anomaly flag (existing, Phase 4 GEO-02); BOQ line context (existing); Vercel AI Gateway + Claude vision (configured) | Async Claude vision call after submission is persisted. Results stored in a new `submission_ai_flags` table. Auditor's Telegram notification and/or dashboard detail page shows flags as advisory badges. Eval harness (AI-01..AI-05) gates display — flags only shown after acceptance criteria met. |
| **Chainage-aware anomaly flag** | AI already has the GPS-to-snapped-point distance. Combining that with chainage context ("submitted at km 4+200 but the BOQ line is for the km 6+500 zone") adds a second anomaly signal that pure distance-check misses when work crews are legitimately far from the route but on a different branch. | MEDIUM | AI vision assist (new); chainage derivation (new); segment-to-BOQ-zone mapping (may be new) | Only build after the base AI assist is working. Described here to flag the dependency ordering. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full in-browser DXF/DWG viewer** | Engineers want to see the drawing exactly as AutoCAD renders it, with all layers, dimensions, hatch patterns, and annotations. | DXF rendering in a browser is extremely complex (AutoCAD's proprietary entity types, custom fonts, 3D content, block references). ezdxf can parse DXF in Python/Node but rendering faithfully requires a full CAD kernel. This is a multi-month engineering effort that is not core to the platform's value. | Require the engineer to upload a PDF alongside (or instead of) the DXF for reference viewing. AutoCAD's "Plot to PDF" is a one-click workflow every engineer knows. Store in Vercel Blob; render with `<iframe>` or PDF.js. |
| **BOQ auto-extraction from DXF drawings** | Drawings contain quantity annotations (pipe lengths, valve counts, etc.) — engineers want the system to auto-populate the BOQ from the drawing. | Heavy ML problem; AutoCAD annotation formats vary wildly per drafter and firm; OCR/entity recognition on CAD geometry is unreliable and creates billing errors. Already explicitly Out of Scope (saha ADR-0002). | Keep the existing Excel BOQ importer. Engineers export quantities to Excel from their quantity-takeoff tools; that is the established workflow. |
| **Real-time chainage progress during the Telegram conversation** | Workers might benefit from knowing "you are at km 3+400, this segment is 60% approved". | Adds latency to the submission flow (requires a spatial query during the conversation). Telegram conversations are sequential; slowing the submit flow hurts adoption. The auditor, not the worker, is the primary consumer of chainage progress. | Show chainage position to the worker in the auditor's approval notification or in a separate `/status` command. Never in the critical submission path. |
| **Automatic CRS detection from DXF file** | Engineers don't want to select a CRS — "just figure it out". | DXF has no mandatory CRS metadata field. Some drafters embed a `$DWGCODEPAGE` or use a `.prj` sidecar, but these are unreliable and inconsistent. Auto-detection fails silently, putting routes in wrong locations. | Make CRS selection a deliberate UI step with a clear explanation: "Your drawing coordinates are in [unit]. Which coordinate system did you use?" Offer the 4-5 most common Turkish options as radio buttons. Clear > clever here. |
| **Per-worker chainage assignment (geofencing bot to a km zone)** | Project managers want workers locked to their assigned km zone so they cannot accidentally log work at the wrong chainage. | Geofencing in a Telegram bot adds conversation complexity and GPS accuracy depends on phone hardware (±10–50 m in field conditions). A worker 200 m outside their zone due to GPS drift gets hard-blocked. | Use the existing 500 m distance anomaly flag (GEO-02) as a soft warning. The auditor sees the distance-anomaly badge and rejects if the location is genuinely wrong. Soft warning + auditor authority is the right UX, not bot geofencing. |

---

## Feature Dependencies

```
[DXF upload + layer picker]
    └──requires──> [CRS declaration]
    └──requires──> [Import preview before save]
    └──produces──> [Route LineString in PostGIS] (existing pipeline reused)
                       └──requires before──> [Chainage derivation]
                                                └──requires before──> [Per-segment as-built view]
                                                └──requires before──> [Per-km completion %]
                                                └──requires before──> [Chainage attribution drill-down]
                                                └──requires before──> [As-built Excel export]
                                                └──requires before──> [Chainage calibration override]

[AI vision assist]
    └──requires──> [Submission photo (existing)]
    └──requires──> [GPS + snapped point + distance anomaly (existing GEO-02)]
    └──requires──> [BOQ line context (existing)]
    └──requires──> [Eval harness passing (AI-01..AI-05)] before flags shown
    └──enhances──> [Auditor Telegram notification (existing)]
    └──enhances──> [Submission detail page (existing Phase 8)]

[Chainage-aware anomaly flag]
    └──requires──> [AI vision assist (new)]
    └──requires──> [Chainage derivation (new)]
    -- build last --

[DXF source document viewer]
    └──requires──> [DXF upload (new)]
    └──requires──> [Vercel Blob (existing)]
    └──depends on──> [PDF upload path decision] (PDF = simpler; DXF renderer = anti-feature)
```

### Dependency Notes

- **CRS derivation is a prerequisite for everything**: if the route is mis-georeferenced, every chainage value, every spatial snap, and every as-built record is wrong. The import preview is the catch, so it must be in the same phase as import.
- **Chainage derivation requires `cumulative_start_m` at segment level**: this is a schema change (new column on route_segments or computed at import and stored). Must be done before any chainage-keyed UI is built.
- **AI vision assist is independently deployable**: it does not depend on chainage. It can proceed in its own phase after DXF/chainage work ships, or in parallel if routes are handled first.
- **Chainage calibration override** enhances but does not block the strip view: build the strip view against raw arc-length chainage first, add calibration as a follow-on.

---

## v4.0 MVP Definition

### Must Ship (v4.0 launch criteria)

- [x] DXF upload with layer picker + CRS declaration + import preview — **foundation: without this the route is a manually uploaded GeoJSON blob with no as-built path**
- [x] Chainage derivation stored at segment level — **all downstream features require this**
- [x] Per-segment as-built strip view (chainage on X-axis, status colour-coded) with drill-down — **headline deliverable of the milestone per PROJECT.md**
- [x] Per-km completion % KPI on dashboard — **table stakes for the office audience**
- [x] AI vision assist (async, advisory-only, eval-gated) — **deferred since v1; PROJECT.md explicitly schedules it here**

### Add After Core Is Verified (v4.x)

- [ ] Chainage calibration override — trigger: engineer reports displayed chainages don't match contract drawings
- [ ] As-built export keyed by chainage — trigger: first project owner requests a formal as-built deliverable
- [ ] DXF source document viewer (PDF path) — trigger: engineer asks for reference drawing alongside map

### Future Consideration (v5+)

- [ ] Chainage-aware anomaly flag — requires AI assist to be stable and chainage to be calibrated; low urgency
- [ ] Time-chainage / Gantt overlay — when schedule data (planned start/end per chainage) is added to the system

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| DXF upload + layer picker + CRS | HIGH | MEDIUM | P1 |
| Import preview before save | HIGH | LOW | P1 (same phase as upload) |
| Chainage derivation (schema + query) | HIGH | MEDIUM | P1 (blocks all chainage UI) |
| Per-segment as-built strip view | HIGH | HIGH | P1 |
| Per-km completion % KPI | HIGH | LOW | P1 (trivial once chainage exists) |
| AI vision assist (async, advisory) | HIGH | HIGH | P1 (PROJECT.md commitment) |
| Chainage attribution drill-down | MEDIUM | MEDIUM | P2 |
| Chainage calibration override | MEDIUM | MEDIUM | P2 |
| As-built Excel export | MEDIUM | MEDIUM | P2 |
| DXF reference document viewer (PDF) | LOW | LOW | P2 |
| Chainage-aware AI anomaly flag | MEDIUM | MEDIUM | P3 |

---

## Complexity Notes

### DXF Import — Medium Complexity, High Risk if Done Wrong

The implementation risk is georeferencing correctness, not parsing. ezdxf (Python) or dxf-parser (JS) can extract geometry from a DXF. The hard part is: (a) presenting the layer list to the user, (b) applying the correct PROJ transformation (TUREF/TM30 → WGS84 = EPSG:5254 → EPSG:4326), and (c) validating the result shows up in Turkey, not the Atlantic. The preview-before-save step is the critical UX safety net.

For the server-side transform, `proj4` (npm: proj4) supports EPSG:5254 and all TUREF variants. The projection string for TUREF/TM30 is available from epsg.io.

### Chainage Derivation — Medium Complexity, Careful Schema Design Required

PostGIS already has all needed functions: `ST_Length(route::geography)` for total route length in metres; `ST_LineLocatePoint` for fraction-to-chainage conversion; `ST_LineInterpolatePoint` for point reconstruction. The schema addition needed:

- `route_segments` table: add `cumulative_start_m NUMERIC` column computed at import time
- Chainage for a submission = `cumulative_start_m + (segment_fraction × ST_Length(segment_geom::geography))`
- This is stored, not recomputed at read time

The strip view requires bucketing submissions into fixed chainage intervals (e.g. 100 m). This is a SQL GROUP BY on `floor(chainage_m / bucket_size) * bucket_size`. No new PostGIS functions needed.

### As-Built Strip View — High Complexity (UI)

The strip view is the most complex UI component in v4. Industry tools (TILOS, TimeChainage) dedicate entire products to this. For bayrak.ai's scope:

- Use an SVG or canvas strip rendered as an RSC with client interactivity for hover/click
- X-axis: chainage buckets (0 to route_length, fixed interval); Y-axis: not needed (single route)
- Colour: grey (no submissions), amber (pending/in-progress submissions exist), green (approved submissions cover this bucket)
- Click on bucket → slide-over with submission list for that chainage range
- Mobile: the strip should still be readable at 375px width; use horizontal scroll or a simplified percentage bar at small breakpoints

### AI Vision Assist — High Complexity, Eval-Gated

The AI assist is an async side effect: when a submission is created, a background job calls Claude vision via Vercel AI Gateway. The result is stored in `submission_ai_flags` (flag type, description, confidence, model version, created_at). Flags are NOT shown until the eval harness passes acceptance criteria (AI-01..AI-05 as referenced in PROJECT.md).

What Claude vision should evaluate per submission photo:
1. **Photo quality**: blurry (Laplacian variance check can be done client-side pre-upload, Claude as backup), dark/overexposed, obstructed
2. **Subject relevance**: does the photo show the declared work type? (e.g. "pipe laying" photo shows a lunch break scene)
3. **Location plausibility**: the submission already has `distance_to_route_m` from GEO-02; AI can provide a second opinion if the photo shows landmarks inconsistent with the expected field environment
4. **Duplicate detection**: perceptual hash comparison against prior submissions on the same project (Claude cannot do this alone; use a server-side pHash library as a pre-filter, Claude for borderline cases)

Advisory-only means: the auditor sees a non-blocking banner/badge on the Telegram notification and/or the dashboard detail page. Flags NEVER block approve/reject. The auditor remains the authority.

Eval harness requirements before enabling display:
- Define a labelled test set of ≥50 submissions (good photos, bad photos, location mismatches, duplicates)
- Measure precision and recall per flag type
- Set acceptance threshold (e.g. ≥80% precision to avoid crying wolf)
- Gate flag display in the UI behind a feature flag until threshold met

---

## Competitor Feature Analysis

| Feature | TILOS / Trimble | Procore | Vitruvi Pipeline | bayrak.ai v4 approach |
|---------|-----------------|---------|------------------|-----------------------|
| Chainage-based progress | Full time-chainage scheduling | Basic linear progress % | Full pipeline construction tracking | Strip view + per-km % — scoped to as-built, not scheduling |
| DXF/DWG import | Yes (full CAD integration) | Via integrations | Yes | Simpler: layer picker + CRS + GeoJSON output; no full CAD viewer |
| AI photo assist | No | Basic photo tag | No | Claude vision, advisory-only, eval-gated |
| Field capture | Desktop/tablet forms | Mobile app | Mobile app | Telegram conversational bot (differentiator) |
| GPS location verification | Yes | Yes | Yes | Existing GEO-02 + AI second opinion in v4 |
| Price point | Enterprise | Enterprise | Enterprise | Accessible (single-tenant, solo-founder) |

bayrak.ai's advantage is the Telegram-native field capture + PostGIS spatial pipeline already in production + the ability to ship a targeted as-built view without the overhead of a full linear scheduling product.

---

## Sources

- Chainage notation and as-built surveying: https://civilthings.com/chainage-meaning-surveying-highway-formula-example/ and https://votexsurveying.com/chainage-construction-surveys/
- Strip chart and chainage-wise DPR: https://strategicerp.com/knowledge-base-article.php?article=strip+chart+and+chainage+wise+dpr
- Linear scheduling software (TILOS): https://construction.trimble.com/en/products/tilos
- Time-chainage diagram overview: https://www.schedulereader.com/view-linear-projects-with-time-chainage-diagram/
- PostGIS linear referencing (ST_LineLocatePoint): https://postgis.net/workshops/postgis-intro/linear_referencing.html
- TUREF/TM30 CRS spec: https://epsg.io/5254
- TUREF to WGS84 transform: https://epsg.io/5261
- DXF to GeoJSON conversion workflow: https://labs.mapbox.com/dxf2geojson/ and https://opengislab.com/blog/2022/6/16/georeferencing-cad-dxf-with-qgis
- AI field photo quality and advisory review: https://www.mymobilelyfe.com/artificial-intelligence/when-a-photo-is-the-evidence-automating-field-service-qa-with-ai-powered-inspection/
- GPS-tagged construction photo audit: https://photoidapp.net/gps-tagged-construction-photos-guide/
- Pipeline construction as-built phases: https://www.phmsa.dot.gov/technical-resources/pipeline/pipeline-construction/phases-pipeline-construction-overview
- AI in construction — advisory patterns: https://www.openspace.ai/blog/ai-in-construction-enhance-project-safety/

---

*Feature research for: bayrak.ai v4.0 — CAD route import, chainage as-built tracking, AI vision assist*
*Researched: 2026-05-29*
