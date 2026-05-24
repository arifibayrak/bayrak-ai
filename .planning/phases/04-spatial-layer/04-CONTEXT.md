# Phase 4: Spatial Layer - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 delivers the **geospatial truth layer** — it makes every worker
submission location-aware against the project's pipeline route.

At submission time (the moment of confirm), the worker's shared lat/long is
matched via PostGIS to the nearest point on the project's
`geometry(LineString,4326)` route: the submission row stores a `snapped_point`
geometry and a `segment_fraction` (0.0–1.0 position along the route). The
metre-accurate distance to the route is computed (`::geography`); submissions
beyond the configured proximity threshold (default 500 m) are flagged so the
auditor's Telegram notification carries a distance-anomaly warning. This wires
PostGIS into the **submission path** built in Phase 2 (`handleConfirmSubmit`)
and the **auditor fan-out** built in Phase 3 (`fanOutToAuditors`).

Requirements in scope: **GEO-01** (nearest-segment matching), **GEO-02**
(beyond-threshold anomaly flag).

**Builds on:**
- Phase 1 — the `submissions.location` `geometry(point,4326)` column + its
  `submissions_location_gist` GiST index already exist (built ready but
  **unpopulated** today), the `routes.geom` `geometry(LineString,4326)` column +
  `routes_geom_gist` index, PostGIS enabled in migration 0000, and the
  `geometry`/`geography` + coordinate-order conventions (D-07/D-08/D-10).
- Phase 2 — `handleConfirmSubmit` in `src/lib/telegram.ts` does a transactional
  insert via `getTxDb()` (neon-serverless Pool, required for transactions) and
  currently writes only `locationLat`/`locationLon` strings, never the `location`
  geometry. D-13 Guard 2 (`onConflictDoNothing` on `flow_id`) protects against
  double-confirm.
- Phase 3 — `fanOutToAuditors` (`src/lib/bot-audit.ts`) builds the auditor caption
  (BOQ item, quantity, notes, Google Maps link, over-delivery warning D-28) and
  is scheduled via `after()` post-reply. The Phase-4 distance flag is a new line
  in that same caption.

**Not this phase:**
- Mapbox rendering of the route and snapped points, BOQ progress view, submission
  list/filter UI — **Phase 5 (DASH-\*)**. Phase 4 only populates the columns
  Phase 5 reads.
- AI vision/notes anomaly flags in the auditor message — **Phase 6 (AI-\*)**.
- Per-project threshold tuning + office UI to edit it — **v2** (see Deferred).
</domain>

<decisions>
## Implementation Decisions

> Decision IDs continue the project sequence (Phase 3 ended at D-40).

### Match Timing & Placement (GEO-01, GEO-02)
- **D-41:** The PostGIS match runs **inside the existing confirm insert
  transaction** (`getTxDb().transaction(...)` in `handleConfirmSubmit`). All
  spatial values — `location` geometry, `snapped_point`, `segment_fraction`,
  metre distance, `location_match`, `location_warning` — are computed and
  committed **atomically with the submission row**, so when the `after()`
  fan-out later loads the row (`fanOutToAuditors`), the anomaly state is
  **guaranteed present**. No separate post-insert write, no race between the
  snap and the auditor notification. (Exact SQL — `ST_SetSRID(ST_MakePoint(lon,
  lat),4326)`, `ST_ClosestPoint`, `ST_LineLocatePoint`, `ST_Distance(::geography)`
  against the project's `routes.geom` — is the planner's; this is the locked
  placement.)
- **D-42:** The snap is **best-effort and MUST NOT abort the submission.** The
  worker has already done verified field work — a missing route, invalid
  geometry, or transient PostGIS error must **never** roll back the insert. On
  any geo failure the row commits with **null** `snapped_point`/`segment_fraction`
  and is marked unverifiable (see D-43). Implies the spatial computation is a
  **guarded step** (try/catch or a tolerant SQL path) that degrades rather than
  throwing out of the transaction. Consistent with D-39/D-40 ("never lose a
  submission; best-effort fan-out"). Note this softens the simpler "everything in
  one atomic statement" path — the insert of the core submission must survive a
  geo failure.

### No-Route / Unmatchable Handling (GEO-02)
- **D-43:** **Three distinct location states, not a single boolean.** Route upload
  was optional in Phase 1, so route-less projects are a normal early state and a
  missing route is **not** the worker's fault. The three outcomes:
  - `near` — matched within threshold → no warning.
  - `far` — matched but beyond threshold → genuine anomaly (`location_warning =
    true`, distance shown).
  - `no_route` — no route on the project, or the match could not be computed →
    **neutral** "couldn't verify" state, **not** an off-route alarm.
- **D-44:** Represent this with a **`location_match` text/enum column**
  (`'near' | 'far' | 'no_route'`) as the **source of truth**, plus the
  **`location_warning` boolean kept** (set `true` **only** when `location_match =
  'far'`) for SC1/SC2 compatibility and cheap filtering. `snapped_point` and
  `segment_fraction` are **null** when `location_match = 'no_route'`. (Exact
  column/enum naming is the planner's; honor the three-state semantics and keep a
  `location_warning` boolean.)

### Threshold Configurability (GEO-02)
- **D-45:** The proximity threshold is a **single env-configurable constant**
  (e.g. `PROXIMITY_THRESHOLD_M`, default **500**), read from env/config and used
  wherever the distance comparison happens. Satisfies GEO-02's "configured
  threshold" wording, is tunable without a code change, and adds **no schema or
  UI work** — right-sized for the solo MVP / single family-firm context.
  Per-project tuning is a clean v2 add (see Deferred).

### Snapped-Point Data Model (GEO-01)
- **D-46:** Snapped coordinates live as **columns on `submissions` only**, written
  **at submission time** (snap is independent of later approval — per SC1). There
  is **no separate `approved_points` table and no view.** "approved_points" (from
  the roadmap overview) is the **conceptual set** Phase 5 renders via a query:
  `submissions WHERE status = 'approved' AND snapped_point IS NOT NULL`. Single
  source of truth; no denormalization or sync-on-approve.

### Auditor Anomaly Flag (GEO-02)
- **D-47:** The auditor's Telegram notification **shows the actual distance**,
  mirroring the D-28 over-delivery pattern (show the number, not just a flag):
  - `far` → **"⚠ Konum rotadan uzak (~1.2 km)"** (distance human-formatted).
  - `no_route` → neutral **"ℹ Rota yüklenmemiş — konum doğrulanamadı"** (not an
    alarm).
  - The existing **Google Maps link is kept** in all cases.
  This is a new caption line in `fanOutToAuditors` (`src/lib/bot-audit.ts`),
  within the Phase 2 D-26 Turkish tone (respectful "siz", light emoji
  affordances). Final microcopy and distance formatting are Claude's discretion.

### Coordinate-Order Test (SC3 — locked by ROADMAP)
- **D-48:** A **unit test is mandatory before merge**: storing an Istanbul
  coordinate (lng 28.9, lat 41.0) must read back **longitude-first** in GeoJSON
  output. This is the recurring STATE.md Phase-4 landmine (`ST_MakePoint(lon,
  lat)` order); the test is the structural guard against silently swapping
  lat/long. Carried forward from Phase 1's coordinate-order discipline (D-07).

### Claude's Discretion
- Exact `ST_*` SQL for the match (`ST_MakePoint` / `ST_SetSRID` /
  `ST_ClosestPoint` / `ST_LineLocatePoint` / `ST_Distance` with `::geography`),
  and whether it's a single insert-with-expressions or a guarded `UPDATE` inside
  the same transaction (honor D-41 placement + D-42 best-effort).
- New column names, the `location_match` enum vs text choice, and any added
  index — honor `tenant_id`-on-every-insert (D-09 / `getDefaultTenantId()`),
  register in `src/db/schema/index.ts`, and generate + push a Drizzle migration.
- Final Turkish microcopy and human distance formatting (m vs km, rounding) for
  the D-47 auditor flag.
- How `snapped_point` is read back for any internal use (`ST_AsGeoJSON`, `wkx`
  per the STACK custom-type pattern) — Phase 5 owns map rendering.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — product vision, locked stack (PostGIS/Neon/Drizzle,
  Mapbox), single-tenant hedge.
- `.planning/REQUIREMENTS.md` — Phase 4 = **GEO-01** (nearest-segment match),
  **GEO-02** (configured-threshold anomaly flag); full text per requirement.
- `.planning/ROADMAP.md` §"Phase 4: Spatial Layer" — goal + 3 success criteria
  (SC1 snap columns, SC2 warning + auditor flag, SC3 coordinate-order test). SC
  values (500 m, `segment_fraction`, `snapped_point`, `location_warning`) are
  **locked**.
- `CLAUDE.md` — locked stack + integration patterns (PostGIS+Drizzle spatial
  schema, nearest-segment query with `::geography` + `<->` KNN, custom geography
  type via `wkx`).

### Research (stack, architecture, pitfalls)
- `.planning/research/STACK.md` — PostGIS+Drizzle geometry/geography patterns,
  nearest-segment query, `ST_*` via Drizzle `sql\`\`` escape hatch, custom-type
  `fromDriver` with `wkx`.
- `.planning/research/PITFALLS.md` — **coordinate order (`lng,lat` /
  `ST_MakePoint(lon,lat)`)**, **geometry vs geography** (`::geography` cast for
  metre distance), GiST index requirement.
- `.planning/research/ARCHITECTURE.md` — entity/data-model + component boundaries.
- `.planning/research/SUMMARY.md` — cross-cutting risk table + resolved decisions.

### Prior phase context (locked decisions to honor)
- `.planning/phases/01-foundation/01-CONTEXT.md` — **D-07** (route is WGS84
  LineString, `lng,lat`), **D-08** (`geometry(linestring,4326)` + manual-migration
  edit caveat), **D-09** (`tenant_id` on every insert / `getDefaultTenantId()`),
  **D-10** (PostGIS extension, `geography` for distance, GiST indexes).
- `.planning/phases/03-audit-loop/03-CONTEXT.md` — **D-28** (over-delivery warning
  shows the number — the pattern D-47 mirrors), **D-33/D-34** (auditor fan-out
  caption + message lifecycle), **D-39/D-40** (never lose a submission;
  best-effort fan-out — the precedent for D-42).

### Existing code this phase extends
- `src/db/schema/submissions.ts` — already has the **unpopulated** `location`
  `geometry(point,4326)` column + `submissions_location_gist` GiST index; add
  `snapped_point`, `segment_fraction`, `location_match`, `location_warning`.
- `src/db/schema/routes.ts` — `routes.geom` `geometry(LineString,4326)` +
  `routes_geom_gist`; the match target. Note the hand-edit-migration caveat.
- `src/lib/telegram.ts` — `handleConfirmSubmit` transactional insert
  (`getTxDb()`, `onConflictDoNothing` on `flow_id`); the D-41/D-42 spatial
  computation hooks in here.
- `src/lib/bot-audit.ts` — `fanOutToAuditors` caption builder; add the D-47
  distance/anomaly line.
- `src/lib/geojson.ts` — `ST_GeomFromGeoJSON` handling / "pass geometry not
  Feature" (Pitfall 4) — reference for SQL geometry I/O.
- `src/lib/tenant.ts` (`getDefaultTenantId()`), `src/db/schema/index.ts`,
  `src/db/migrations/` — new columns/migration registration.

### Reference only (sibling project — DO NOT copy code; clean-room build)
- `/Users/arifismailbayrak/saha/GLOSSARY.md` — domain vocabulary (Chainage,
  BOQ/Contract Line Item, Project) for consistent Turkish/English terms.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`submissions.location` column + `submissions_location_gist` GiST index** —
  already in the schema (built "Phase 4 ready" in Phase 1), just never written.
  Phase 4 populates it; the index is already in place for `ST_DWithin`/
  `ST_ClosestPoint` performance.
- **`getTxDb()` transaction helper** (`src/lib/telegram.ts`) — neon-serverless
  Pool (WebSocket) driver, the only one supporting `db.transaction()`. The
  spatial match lives inside this existing transaction (D-41).
- **`fanOutToAuditors` caption builder** (`src/lib/bot-audit.ts`) — the auditor
  message with the D-28 over-delivery warning pattern is the template for the
  D-47 distance line.
- **`geojson.ts`** — established `ST_GeomFromGeoJSON` / geometry-not-Feature
  handling for PostGIS geometry I/O.

### Established Patterns
- **Coordinate order `lng,lat` / `ST_MakePoint(lon,lat)`** — the recurring
  landmine; D-48 mandates a coordinate-order unit test (SC3).
- **`::geography` cast for metre-accurate distance** — never compare planar
  degrees for the threshold (D-10 / PITFALLS).
- **`tenant_id` on every insert** via `getDefaultTenantId()` (D-09).
- **Lazy `@/db` import inside handlers** — keep unit tests runnable without
  `DATABASE_URL`.
- **Drizzle raw SQL escape hatch (`sql\`\`)** for `ST_*` functions; custom-type
  `fromDriver` with `wkx` when reading geometry back (STACK).
- **`drizzle-kit generate` + manual migration edit + push** — and the LineString
  hand-edit caveat already documented in `routes.ts`.

### Integration Points
- **Input:** `submissions` rows at `handleConfirmSubmit` (Phase 2) carrying
  `locationLat`/`locationLon`; the project's `routes.geom` (Phase 1) is the match
  target.
- **Output consumed by Phase 5:** `snapped_point`, `segment_fraction`,
  `location_match` on approved submissions drive the Mapbox overlay (DASH-01/02);
  `location_warning` feeds submission-list filtering (DASH-03).
- **Output consumed by Phase 3 flow:** `fanOutToAuditors` reads the now-populated
  anomaly state to render the D-47 line — same bot instance/token.
</code_context>

<specifics>
## Specific Ideas

- **Auditor flag microcopy** (Phase 2 D-26 tone — respectful "siz", light emoji as
  affordance):
  - Far: **"⚠ Konum rotadan uzak (~1.2 km)"** (distance human-formatted; planner
    picks m/km rounding).
  - No route: **"ℹ Rota yüklenmemiş — konum doğrulanamadı"** (neutral, not an
    alarm).
  - Always keep the existing Google Maps link (`https://maps.google.com/?q=<lat>,
    <lon>`).
- **Threshold env var**: default **500** m; one knob (e.g. `PROXIMITY_THRESHOLD_M`).
- **Coordinate-order test fixture**: Istanbul `lng 28.9, lat 41.0` → reads back
  longitude-first in GeoJSON.
</specifics>

<deferred>
## Deferred Ideas

- **Per-project proximity threshold** — a `projects.proximity_threshold_m` column
  + office-dashboard control to tune tolerance per site (urban vs rural route
  precision). v2; v1 uses one env constant (D-45).
- **Second map pin to the snapped point** alongside the worker's raw location in
  the auditor message — more context, more clutter; deferred (D-47 keeps a single
  raw-location link).
- **Recompute snap on resubmission / route re-upload** — if a project's route is
  replaced after submissions exist, existing rows are not re-snapped in v1.
  Revisit if route edits become common.
- **Backfill of pre-Phase-4 submissions** — existing `pending_audit`/decided rows
  predate the snap columns and stay null; not retroactively matched in v1.
- **Per-segment / chainage scoping of the anomaly** — only nearest-point distance
  is judged in v1; per-segment auditor scoping is the v2 AUDIT-V2-02 path.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 4-Spatial Layer*
*Context gathered: 2026-05-24*
