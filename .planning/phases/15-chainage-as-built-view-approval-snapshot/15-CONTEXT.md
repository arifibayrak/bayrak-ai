# Phase 15: Chainage As-Built View + Approval Snapshot - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Snapshot each approved submission's chainage at the moment of auditor approval (immutable as-built record), then surface a per-kilometre as-built strip of the route — what work was submitted at each segment, who the worker was, who audited it — with drill-down to the canonical submission detail page, a route-completion % KPI, a numeric chainage calibration offset, and Excel/PDF export. Requirements: CHN-01..CHN-07.

**This phase owns the chainage WRITE** that Phase 14 deliberately left out: `handleAuditDecision` (`src/lib/bot-audit.ts`) is modified here to write `submissions.chainage_m` + `submissions.route_geometry_version` inside the approval transaction. Phase 14 added these columns but never wrote them.

**Not this phase:** AI vision (Phase 16); the "anchor-on-map" calibration UX (deferred to v4.x — this phase ships a numeric offset only).

</domain>

<decisions>
## Implementation Decisions

### Bucket Granularity
- **D-01:** The as-built strip bucket size is **engineer-selectable, defaulting to 1 km**, with a toggle for 500 m / 100 m. `getChainageBuckets` takes a `bucketSizeM` param (default 1000) and does `GROUP BY floor(chainage_m / bucketSizeM)` in Postgres. The completion-% denominator and the colour bar recompute against the selected granularity.

### Completion-% Meaning (the headline KPI, CHN-06)
- **D-02:** Route completion % by chainage = **(count of buckets with ≥1 approved submission) ÷ (total buckets spanning the route length)**, clamped at 100%. Submissions are GPS points (not lengths), so a "covered buckets" count is the honest, granularity-consistent basis — NOT a min→max span (which would count gaps as covered) and NOT BOQ-value-weighted (which would couple the KPI to pricing). Total buckets = `ceil(total_length_m / bucketSizeM)`.

### Strip Presentation (CHN-04)
- **D-03:** The as-built strip is **table-first with a thin colour-coded chainage bar across the top**. The table has one row per bucket: km range (Turkish "km X+YYY – km X+YYY"), status, work count, total quantity grouped by BOQ item, worker name(s), auditor name(s). The colour bar gives at-a-glance status across the whole route. Fits the bayrak.ai dense-table brand aesthetic — render the bar with lightweight CSS (flex/segment divs or a gradient), NOT a heavy charting library.

### Status Semantics (CHN-04 colour coding)
- **D-04:** Three-state per bucket: **≥1 approved submission → approved (green); else ≥1 pending_audit submission → in progress (amber); else → not started (grey).** "In progress" means pending-but-no-approved. Use brand status tokens (the green/amber/grey already established for BOQ/period status).

### Carried Forward (locked by research/roadmap — do not revisit)
- Chainage snapshot at approval: `chainage_m = ROUND(segment_fraction × total_length_m, 2)` + `route_geometry_version`, written in the SAME transaction as `status='approved'` in `handleAuditDecision`. Immutable after.
- One-time backfill migration computes `chainage_m` for existing approved submissions from current route geometry — clearly noted as **estimated, not a true snapshot**.
- `numeric(10,2)` storage; all bucketing/clamping done Postgres-side; completion clamped with `LEAST(..., 100.00)`.
- Calibration (CHN-02) = a **numeric metre offset** stored on `routes.chainage_offset_m` (column already added in Phase 14); applied consistently as `calibrated_chainage_m = chainage_m + offset` across the dashboard strip, Telegram notifications for NEW approvals, and Excel/PDF exports. Changing the offset recomputes/displays consistently across all three surfaces (SC5).
- Chainage display convention: Turkish stationing **"km X+YYY"** (e.g. 2347 m → "km 2+347").
- Export (CHN-07): `GET /api/exports/chainage` reusing the Phase 11 export skeleton (auth() first → 401 JSON on no session, ExcelJS, `@react-pdf/renderer`, DejaVu fonts). Excel columns fixed by SC: Km Başlangıç, Km Bitiş, İş Adedi, Malzeme, Miktar, Birim, İşçi, Denetçi. PDF matches the hakkediş certificate aesthetic.

### Folded Todos
- **`submission-detail-map-link`** (`.planning/todos/pending/submission-detail-map-link.md`): extend `getCanonicalSubmissions`/`CanonicalSubmission` in `src/actions/analytics.ts` to include the submission's snapped-point lat/lon (PostGIS `ST_X`/`ST_Y` or `ST_AsGeoJSON`), and render a Google Maps link (`https://www.google.com/maps?q=<lat>,<lon>`) in `src/components/admin/SubmissionDetailView.tsx` alongside the existing distance/warning badge. Fits CHN-05 (the as-built strip drills into this same detail view). Additive; tenant-scoping + auth already present on `getCanonicalSubmissions`.

### Claude's Discretion
- Exact granularity-toggle control (segmented control vs select); colour-bar implementation (prefer CSS, no charting dep); whether the colour bar segments are clickable (table rows are the primary drill-down per CHN-05).
- Where the calibration offset input lives (As-Built tab vs route metadata card) — planner/UI-spec to decide.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contract
- `.planning/ROADMAP.md` §"Phase 15" — goal + 6 success criteria (SC1 approval snapshot DB check, SC4 completion-% clamp, SC5 calibration consistency across 3 surfaces, SC6 export columns + auth).
- `.planning/REQUIREMENTS.md` §"Chainage As-Built Tracking" — CHN-01..CHN-07.

### v4 research (chainage decisions already resolved)
- `.planning/research/SUMMARY.md` §"Phase 15" + "RESOLVED: Dynamic vs Snapshotted Chainage" — the snapshot-at-approval decision + delivery list. **MUST read.**
- `.planning/research/ARCHITECTURE.md` — `getChainageBuckets` shape, ChainageTab/Table, approval-path modification point.
- `.planning/research/PITFALLS.md` — Pitfall 2 (re-import shift — already mitigated by versioning), 7 (float precision → numeric(10,2)), 9 (over-completion clamp), 13 (calibration consistency).

### Phase 14 foundation (the schema this phase writes into)
- `.planning/phases/14-schema-foundation-dxf-route-import/14-SUMMARY` files — columns added: `submissions.chainage_m`, `submissions.route_geometry_version`; `routes.total_length_m`, `routes.geometry_version`, `routes.chainage_offset_m`.

### Existing code to modify / mirror
- `src/lib/bot-audit.ts` — `handleAuditDecision`: the approval transaction where the chainage snapshot write goes (mirror the Phase 12 post-commit recompute hook placement; Pitfall 5 — bot path has no Auth.js session, never `logOfficeActivity`/`after()`).
- Phase 11 export route handlers (`src/app/api/exports/*`) — the binary-export skeleton to reuse for `/api/exports/chainage`.
- `src/actions/analytics.ts` (`getCanonicalSubmissions`) + `src/components/admin/SubmissionDetailView.tsx` — for the folded map-link todo + CHN-05 drill-down target.
- The existing project-page tab pattern (RouteTab and siblings) — for the new "As-Built" tab.
- `.planning/todos/pending/submission-detail-map-link.md` — folded todo.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`handleAuditDecision` / `recomputeHakedisLine` hook (Phase 12)** in `src/lib/bot-audit.ts`: established pattern for a post-commit, best-effort write triggered on approval — the chainage snapshot write follows the same insertion point and transaction discipline.
- **Phase 11 export skeleton**: auth()-first → 401 JSON, `NextResponse` with `Uint8Array` body, ExcelJS column-level numFmt, `@react-pdf/renderer` + DejaVu fonts — `/api/exports/chainage` mirrors it verbatim.
- **`routes.chainage_offset_m`, `routes.total_length_m`** (Phase 14): already exist — no new route columns needed for calibration/completion.
- Brand status tokens (green/amber/grey) + dense-table primitives (BrandTable/BrandCard/BrandBadge) from Phase 13.

### Established Patterns
- Postgres-side aggregation via Drizzle `sql` templates (Phases 4, 9, 10); money/qty math in Postgres `numeric`, never JS floats.
- Migrations via `npx tsx src/db/migrate.ts` on BOTH Neon branches; immutable post-apply. The backfill is a NEW migration (additive UPDATE), not an edit to 0010-0012.
- `force-dynamic` on financial/analytics surfaces.

### Integration Points
- `handleAuditDecision` gains the chainage-snapshot write (the one cross-cutting change to a shipped file — plan it explicitly).
- New "As-Built" tab on the project page; new `getChainageBuckets` + calibration Server Action; new `/api/exports/chainage` route.
- The as-built strip's row drill-down links to the existing canonical submission detail page (CHN-05).

</code_context>

<specifics>
## Specific Ideas

- Turkish stationing display "km X+YYY" everywhere chainage is shown.
- Default granularity 1 km reflects the office's big-picture view; 100 m available for dense-work zoom.
- Completion % is intentionally a conservative "covered buckets" count — honest about point-based data rather than overstating coverage.

</specifics>

<deferred>
## Deferred Ideas

- **Anchor-on-map calibration UX** (pick a GPS point, enter known station, system solves the offset) → v4.x. Phase 15 ships the numeric offset only.
- **Chainage-aware AI anomaly flag** → v5 (needs Phase 16 AI assist stable + chainage calibrated).
- **Time-chainage / Gantt overlay** → v5 (needs schedule data not yet captured).

### Reviewed Todos (not folded)
- `tenant-settings-seed-fk-safe` — already resolved in Phase 14; keyword-matched here but not applicable.

</deferred>

---

*Phase: 15-chainage-as-built-view-approval-snapshot*
*Context gathered: 2026-05-30*
