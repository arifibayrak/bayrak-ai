# Phase 5: Dashboard & Map - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 delivers the **office read/monitor surface** — it turns the data the
worker bot and audit loop have been writing into a live, visual project
dashboard for the Office Engineer.

Within the existing project-detail page (`src/app/dashboard/projects/[id]`), the
phase adds three capabilities: a **live Mapbox map** of the pipeline route with
approved work-log points snapped to it and color-coded by BOQ item; **BOQ
progress** (contracted vs approved + completion %) inside the BOQ tab; and a
**status-filterable submissions list** ("Kayıtlar"). It is purely a read/monitor
layer over Phases 1–4 data — no new write paths.

Requirements in scope: **DASH-01** (route on map), **DASH-02** (approved points
overlay), **DASH-03** (status-filtered submissions list with photo/location/qty/
notes), **DASH-04** (live BOQ progress per line item), **DASH-05** (map + progress
reflect approved submissions, refresh on load/focus).

**Builds on:**
- Phase 1 — the project-detail Server Component with URL-state tabs (`?tab=`),
  the `XTab` (server-fetch) + `XTabClient` (interactivity) pattern, shadcn `Tabs`/
  `Table`, next-intl TR/EN, and `routes.geom` (GeoJSON LineString). The existing
  **Rota** tab already renders the route.
- Phase 3 — `submissions.status`, `decided_by`/`decided_at`, `rejection_reason`
  (the submissions list reads these); the Google Maps link pattern
  (`maps.google.com/?q=<lat>,<lon>`).
- Phase 4 — `snapped_point`, `segment_fraction`, `location_match`,
  `location_warning`, `location_distance_m`. The map renders "approved points"
  = `submissions WHERE status='approved' AND snapped_point IS NOT NULL` (D-46);
  `location_match='far'` drives the on-map anomaly style.
- `src/lib/boq-balance.ts` `remainingBalance(planned, approved)` for the progress %.

**Not this phase:**
- AI vision/notes anomaly badges on the dashboard auditor card — **Phase 6 (AI-\*)**.
- Real-time/WebSocket map updates — explicitly out of scope (REQUIREMENTS); v1 is
  refresh-on-load/focus.
- Export/print of BOQ progress (PDF/report) — deferred, adjacent to hakkediş (v2).
- Any new write/edit path — Phase 5 is read/monitor only.
</domain>

<decisions>
## Implementation Decisions

> Decision IDs continue the project sequence (Phase 4 ended at D-48).

### Dashboard Information Architecture (DASH-01, DASH-02, DASH-03, DASH-04)
- **D-49:** The existing **Rota tab becomes the live Mapbox map** (route line +
  approved points, color-coded, interactive) while keeping its GeoJSON upload
  control. A **new "Kayıtlar" tab** holds the submissions list. **BOQ progress
  enhances the existing BOQ tab** (not a separate tab). Resulting tab order:
  **BOQ · Rota(=map) · Kayıtlar · Personel**. Reuses the route-display slot
  rather than creating a parallel map view. Follow the established `XTab`/
  `XTabClient` + URL-state (`?tab=`) pattern.
- **D-50:** BOQ progress is shown **inline in `BoqTable`** — add **`Approved`** and
  **`% complete`** columns plus a **per-row progress bar**, computed from
  `remainingBalance()` / `approved_qty` / `planned_qty`. Per-line-item granularity
  matches DASH-04/SC2. No separate progress card or project rollup in v1.

### Map Interactivity & Encoding (DASH-01, DASH-02)
- **D-51:** Clicking an approved point opens a **rich Mapbox popup**: photo
  thumbnail, BOQ item, quantity, status, date, and deciding auditor. The map is
  an investigation tool, not just a picture. Markers are plotted at their
  **snapped position** (`snapped_point`), per SC1.
- **D-52:** Approved-but-**`far`** points (`location_match='far'` /
  `location_warning=true`) get a **distinct visual style** — a warning ring/outline
  layered over the BOQ-item color — and the popup shows the recorded
  `location_distance_m`. The anomaly is conveyed by **shape, not hue alone** (a11y,
  D-58). `no_route` approved points have a null `snapped_point` and so do not plot
  on the map (they remain visible in Kayıtlar). Route line styling is Claude's
  discretion.

### Submissions List — "Kayıtlar" (DASH-03)
- **D-53:** A **shadcn `Table`** matching the existing `BoqTable`/`ActivePeopleTable`
  idiom, with columns: **photo thumbnail, BOQ item, quantity, status badge, date,
  location (Google Maps link reusing the Phase 3 pattern), notes**. (Card grid and
  row-expand-for-photo were rejected.)
- **D-54:** Default to **all statuses** with filter chips (**All / Pending /
  Approved / Rejected**), sorted **newest-first**, with **pagination** (page size
  ~25–50, planner's exact number). The office view is monitoring, so "all" is the
  honest default; pagination keeps long-running projects fast.

### Liveness / Refresh (DASH-05)
- **D-55:** **Dynamic Server Components** (no caching) so every load and tab
  navigation fetches fresh data, **plus a client `router.refresh()` on tab focus**
  (visibilitychange/focus). Directly satisfies SC2/DASH-05's "load/focus" wording
  with no polling/WebSocket infrastructure. Reuses the server-fetch tab pattern.

### Map Viewport & Empty States (DASH-01)
- **D-56:** On load, **auto-fit (`fitBounds`) to the route LineString's bounding
  box** (with padding); approved points are snapped to the route so they're already
  framed. When there is **no route**, fall through to the empty state (D-57) rather
  than framing a blank map.
- **D-57:** **Graceful, guided empty states** (all via next-intl): no route → the
  Rota tab shows a "upload a route to see the map" empty state with the existing
  upload control front-and-center (no broken map); route but no approved points →
  render the route line with a subtle "no approved work yet" note; empty Kayıtlar →
  "Henüz kayıt yok"; a 0%-progress BOQ item → empty bar at 0%.

### Visual Encoding & Accessibility (DASH-02)
- **D-58:** **Curated, color-blind-safe palette** assigned to BOQ items in a
  **stable order** (e.g. sorted/creation id) so the same item keeps its color
  across reloads, with a **legend** mapping color→material. When BOQ items exceed
  the palette size, **cycle with a secondary cue** (shape/pattern/numbered marker)
  so items stay distinguishable. Exact hex palette is Claude's discretion within
  color-blind-safe constraints.
- **D-59:** **Practical accessibility** (not a formal WCAG audit): color is never
  the only signal (legend + text labels; anomaly via shape per D-52), sufficient
  marker/route contrast, and Mapbox GL's built-in keyboard pan/zoom. The same data
  is fully available in the accessible Kayıtlar table.

### Responsive (DASH-01..05)
- **D-60:** **Desktop-first but genuinely mobile-responsive** (revised from an
  earlier "tablet-usable" answer at the user's request). Desktop is the primary
  optimization target (the Office Engineer's context), but the new surfaces must
  work on phone/tablet too: map fills available width with touch-friendly controls,
  tables go horizontally scrollable / stack, tabs wrap. Not merely "doesn't break"
  on tablet — real mobile layouts.

### Photo Thumbnails (DASH-03)
- **D-61:** Thumbnails in the Kayıtlar table and map popups render with
  **`next/image`** (lazy-loaded, explicitly sized) for performance at scale;
  clicking opens a **shadcn `Dialog` lightbox** with the full image in-app (not a
  new browser tab). Requires adding the **Vercel Blob hostname to `next.config`
  `images.remotePatterns`** — flag for planning.

### Mapbox Token Security (DASH-01 / SC4)
- **D-62:** The Mapbox token is **public**, supplied via `NEXT_PUBLIC_MAPBOX_TOKEN`.
  **Before any dashboard URL is shared externally, the token MUST be restricted to
  the bayrak.ai domain in the Mapbox account dashboard.** This is primarily an
  ops/env step (no app logic) but is a hard success criterion — planning should
  surface it as an explicit checklist/verification item, not silently assume it.

### i18n (I18N-02)
- **D-63:** **Full next-intl TR/EN coverage** of every new surface — Kayıtlar tab
  label, table headers, filter chips, status badges (pending/approved/rejected),
  empty-state copy, BOQ progress labels, map popup labels — plus locale-sensible
  formatting of dates/quantities/distance. No hardcoded strings in new components;
  honors I18N-02 (the dashboard is TR/EN switchable).

### Claude's Discretion
- Exact BOQ color palette hex values (within color-blind-safe + legend constraints,
  D-58), route line styling/width, marker size, popup layout.
- Pagination page-size number (D-54) and the pagination mechanism (page links vs
  load-more).
- Reading `snapped_point`/route geometry back as GeoJSON (`ST_AsGeoJSON` / `wkx`
  per the STACK custom-type pattern) and the FeatureCollection shape passed to the
  client map component.
- Whether the map client component uses `react-map-gl` `<Source>`/`<Layer>` (route
  line + a points layer) vs individual `<Marker>`s — honor the locked
  `mapbox-gl` 3.24 + `react-map-gl` 8.1 stack.
- next-intl message-key organization for the new namespaces.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — product vision, locked stack (Mapbox, next-intl, Blob).
- `.planning/REQUIREMENTS.md` — Phase 5 = **DASH-01..05**; note real-time WebSocket
  is Out of Scope.
- `.planning/ROADMAP.md` §"Phase 5: Dashboard & Map" — goal + 4 success criteria
  (SC1 map line + color-coded snapped markers, SC2 BOQ % on load/focus, SC3 status
  filter, SC4 token domain restriction). SC values are **locked**.
- `CLAUDE.md` — locked stack + integration patterns: `mapbox-gl` 3.24 +
  `react-map-gl` 8.1 (to install), `wkx` for WKB→GeoJSON, `@vercel/blob`,
  `next-intl` 4.x App Router `getTranslations`, shadcn/ui.

### Prior phase context (locked decisions to honor)
- `.planning/phases/04-spatial-layer/04-CONTEXT.md` — **D-46** (approved-points =
  `status='approved' AND snapped_point IS NOT NULL`; columns on submissions only),
  **D-44** (`location_match` near/far/no_route + `location_warning`), the
  `snapped_point`/`segment_fraction`/`location_distance_m` columns the map reads.
- `.planning/phases/03-audit-loop/03-CONTEXT.md` — **D-38** (`decided_by`/
  `decided_at`/`rejection_reason`), the Google Maps link format reused in Kayıtlar.
- `.planning/phases/01-foundation/01-CONTEXT.md` — **D-07/D-08** (route is
  `geometry(LineString,4326)`, `lng,lat`), dashboard IA + tab conventions.

### Existing code this phase extends
- `src/app/dashboard/projects/[id]/page.tsx` — the Server-Component detail page;
  add the Kayıtlar tab, make rendering dynamic (D-55), wire the new tabs.
- `src/components/dashboard/RouteTab.tsx` + `RouteTabClient.tsx` — the Rota tab that
  becomes the live map (D-49); keep the upload control.
- `src/components/dashboard/RouteUpload.tsx` — existing GeoJSON upload, retained.
- `src/components/dashboard/BoqTab.tsx` + `BoqTable.tsx` — add progress columns +
  per-row bar (D-50).
- `src/lib/boq-balance.ts` — `remainingBalance()` for progress %.
- `src/db/schema/submissions.ts` — status, decided_*, rejection_reason,
  snapped_point, segment_fraction, location_match, location_warning,
  location_distance_m, photo_url, location_lat/lon, quantity, notes, boq_item_id.
- `src/db/schema/routes.ts` — `routes.geom` LineString (render as the map line).
- `src/lib/geojson.ts` — existing geometry I/O; reference for `ST_AsGeoJSON`
  read-back of route/snapped_point.
- `src/actions/projects.ts`, `src/actions/people.ts` — existing server-action
  data-fetch pattern; add submission/route/approved-point fetchers.

### Reference only (sibling project — DO NOT copy code)
- `/Users/arifismailbayrak/saha/GLOSSARY.md` — domain vocabulary (BOQ, Chainage).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Project-detail tab shell** (`[id]/page.tsx`) with URL-state tabs and the
  `XTab`/`XTabClient` split — the new Kayıtlar tab and the map slot the same way.
- **`BoqTable`** — extend with progress columns rather than build new (D-50).
- **`RouteTab`/`RouteTabClient`** — already fetches + displays the route; upgrade
  the client to a Mapbox map (D-49).
- **`remainingBalance()`** (`boq-balance.ts`) — the progress math already exists.
- **Google Maps link pattern** (Phase 3, `bot-audit.ts`) — reuse in Kayıtlar (D-53).
- **next-intl `getTranslations` (server) + locale cookie toggle** — the i18n
  scaffold for D-63.

### Established Patterns
- **Server Components fetch via server actions; client components for interactivity**
  — the map and the focus-refresh effect (D-55) are client; data is server-fetched
  and passed as props.
- **shadcn `Tabs`/`Table`/`Dialog`** added via CLI; consistent table idiom (D-53, D-61).
- **next/image requires `images.remotePatterns`** for the Vercel Blob host (D-61) —
  not yet configured.
- **`mapbox-gl` + `react-map-gl` are NOT yet installed** — Phase 5 adds them; needs
  `NEXT_PUBLIC_MAPBOX_TOKEN`.

### Integration Points
- **Input:** `routes.geom` (route line), approved `submissions` with
  `snapped_point`/`location_match`/`location_distance_m` (Phase 4) and
  `status`/`decided_*`/`rejection_reason` (Phase 3), `boq_items` planned/approved.
- The map and BOQ progress are **read-only views**; no writes back to these tables.
- Map markers join `submissions.boq_item_id` → BOQ item for color + legend (D-58).
</code_context>

<specifics>
## Specific Ideas

- Tab order/labels (TR): **BOQ · Rota (live map) · Kayıtlar · Personel**.
- Anomaly marker: warning ring/outline over the BOQ-item color; popup shows the
  Phase-4 `location_distance_m` (D-52).
- Empty-state copy direction (TR, via next-intl): no route → upload CTA; no points →
  "henüz onaylı iş yok"; empty list → "Henüz kayıt yok" (D-57).
- Refresh: dynamic RSC + `router.refresh()` on `visibilitychange`/focus (D-55).
- Photo: `next/image` thumbnail → shadcn `Dialog` lightbox (D-61).
- SC4: `NEXT_PUBLIC_MAPBOX_TOKEN` + manual Mapbox-dashboard domain restriction to
  bayrak.ai before external sharing (D-62).
</specifics>

<deferred>
## Deferred Ideas

- **Export / print of BOQ progress** (PDF/report) — adjacent to hakkediş (HAK-01),
  out of scope for v1. Noted at user's prompting; redirect to v2 reporting.
- **Real-time / WebSocket live map updates** — explicitly Out of Scope (REQUIREMENTS);
  v1 is refresh-on-load/focus (D-55).
- **Project-level BOQ progress rollup card** — considered for D-50, deferred; v1 is
  per-line-item inline only.
- **Full WCAG 2.1 AA audit** of the map surfaces — D-59 is practical a11y; formal
  AA is a later pass.
- **Dedicated mobile-web auditor review view** — AUDIT-V2-01, v2 (unchanged from
  Phase 3 deferral).

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 5-Dashboard & Map*
*Context gathered: 2026-05-24*
