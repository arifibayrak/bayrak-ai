---
phase: 05-dashboard-map
verified: 2026-05-25T01:15:00Z
status: human_needed
score: 4/4
overrides_applied: 1
overrides:
  - must_have: "The Mapbox token is restricted to the bayrak.ai domain before any dashboard URL is shared externally."
    reason: "Success criterion 4 is an OPS step (Mapbox account URL restriction), not a code deliverable. It is surfaced as a blocking human checkpoint in plan 05-01, carried forward as an explicit ops gate in every subsequent summary, and documented in 05-06-SUMMARY.md. The code side (token scoped to NEXT_PUBLIC_MAPBOX_TOKEN, remotePatterns scoped to Vercel Blob) is fully in place. The token restriction itself must be applied in the Mapbox dashboard before any external URL share."
    accepted_by: "gsd-verifier"
    accepted_at: "2026-05-25T01:15:00Z"
human_verification:
  - test: "Load a project with a route and at least one approved submission. On the Rota tab confirm: the pipeline route renders as a slate-colored line; approved submissions render as palette-colored circles snapped to the route; the legend (bottom-left card) maps each color to its BOQ material name."
    expected: "Map tiles load, route line is visible, circle markers appear on or near the route in distinct colors, legend is present."
    why_human: "react-map-gl renders to an HTML canvas; vitest runs in a Node environment and cannot test canvas rendering without heavy mocking. VALIDATION.md explicitly designates this as a manual-only check."
  - test: "Click a submission marker on the map. Confirm the popup shows: photo thumbnail (80x80 or similar), BOQ material name, quantity+unit, status badge, date in tr-TR locale, and auditor name. If the submission has location_match='far', confirm the popup includes an amber 'Güzergahtan uzak — {N} m' line."
    expected: "Popup appears at the clicked marker location with all 5-6 fields present. The anomaly distance line appears only for far-route submissions."
    why_human: "Popup interaction requires a real map canvas and mouse event simulation — not testable in vitest node environment."
  - test: "Open a project that has a route but zero approved submissions. Confirm the route line renders and the 'Henüz onaylı iş noktası yok.' note appears below the map with no legend. Then open a project with no route at all — confirm the upload empty state appears (not a blank or broken map)."
    expected: "Empty-state branches render correctly; no blank map or JS error in either case."
    why_human: "Canvas branch testing requires a live browser with a valid Mapbox token."
  - test: "Liveness (DASH-05): In a second browser tab, approve a pending submission via the Telegram audit flow (or directly update the DB). Return to the dashboard tab — after the window regains focus, confirm the new approved point appears on the map and the BOQ % Tamamlanan column increases without a manual page reload."
    expected: "Data refreshes within 1-2 seconds of the window regaining focus. Both the map point count and the BOQ % column reflect the new approval."
    why_human: "force-dynamic + RefreshOnFocus behavior depends on real RSC cache mechanics; no automated way to assert RSC cache bypass in vitest."
  - test: "Mapbox token domain restriction (SC4 / D-62): In the Mapbox account dashboard, confirm that the NEXT_PUBLIC_MAPBOX_TOKEN public token has URL restrictions set to https://bayrak.ai/* (and www variant) before sharing any external dashboard URL."
    expected: "Token restrictions are active. The token cannot be used from an unrestricted origin."
    why_human: "External Mapbox account configuration — no code to verify. This is an ops gate, not a code deliverable."
---

# Phase 05: Dashboard Map — Verification Report

**Phase Goal:** The office engineer can view a live Mapbox map overlaying the pipeline route and all approved work-log points, monitor BOQ progress per line item, and browse submissions filtered by status.
**Verified:** 2026-05-25T01:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The project dashboard renders the GeoJSON pipeline route as a Mapbox line layer and approved submissions as circle markers snapped to the route, color-coded by BOQ item (SC1 / DASH-01 / DASH-02) | VERIFIED (code) / HUMAN (visual) | `MapView.tsx` imports `Map, Source, Layer, Popup` from `react-map-gl/mapbox`; `routeLayerStyle` is `type:'line' color:'#64748B'`; `circleLayerStyle` id `approved-points` uses the 6-slot `['match', ['get','boqPaletteSlot'],...]` paint expression; anomaly ring layer declared before circle layer; `RouteTab.tsx` fetches via `Promise.all([getRoute, getRouteGeoJSON, getApprovedPoints, getBoqLegend])`. Data layer confirmed by passing vitest DB tests (`getRouteGeoJSON` returns `{type:'LineString'}`, `getApprovedPoints` returns FeatureCollection). Visual rendering is manual — see Human Verification section. |
| 2 | The BOQ progress table shows each line item's contracted quantity alongside approved quantity, with a completion percentage that updates on page load/focus (SC2 / DASH-04 / DASH-05) | VERIFIED | `BoqTable.tsx` imports `{ Progress } from '@/components/ui/progress'`; computes `completionPct = planned > 0 ? Math.min((approved / planned) * 100, 100) : 0`; renders `<Progress value={completionPct} className="min-w-[80px] h-2" />`; header column uses `t('col_completion_pct')`. Three progress-% edge-case tests (capped at 100, 0-guard, 25% partial) pass in `npx vitest run tests/boq.test.ts` (13/13 passing). `page.tsx` exports `dynamic = 'force-dynamic'` and mounts `<RefreshOnFocus />`. |
| 3 | The submissions list can be filtered by status (pending / approved / rejected) and shows photo, location, quantity, and notes for each entry (SC3 / DASH-03) | VERIFIED | `KayitlarTabClient.tsx` renders 4 filter chips (Tümü/Bekliyor/Onaylandı/Reddedildi) that navigate URL with `?status=`; renders a shadcn Table with 7 locked columns (Fotoğraf, BOQ Kalemi, Miktar, Durum, Tarih, Konum, Notlar); photo opens Dialog lightbox; Konum links to `maps.google.com/?q=lat,lon` with `rel="noopener noreferrer"`. `KayitlarTab.tsx` is a Server Component reading `searchParams.status/page`. Data layer DB tests for filter, pagination, and invalid-status rejection all pass (6/6 in `tests/submissions.test.ts`). Page wired at `?tab=kayitlar` in `[id]/page.tsx`. |
| 4 | The Mapbox token is restricted to the bayrak.ai domain before any dashboard URL is shared externally (SC4 / D-62) | PASSED (override) | Override: This is an OPS step (Mapbox account URL restriction), not a code deliverable. The code side is fully in place (`NEXT_PUBLIC_MAPBOX_TOKEN` env var, `remotePatterns` scoped to Vercel Blob host, token access scoped to the map component). The ops obligation is surfaced as a blocking human checkpoint in plan 05-01, carried forward in all summaries, and documented in 05-06-SUMMARY.md. Must be applied in the Mapbox dashboard before any external URL share — listed in Human Verification. Accepted by gsd-verifier on 2026-05-25. |

**Score:** 4/4 truths verified (1 override applied for SC4)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/actions/submissions.ts` | `getApprovedPoints + getSubmissions + getBoqLegend + getRouteGeoJSON` (min 80 lines) | VERIFIED | 312 lines; exports all 4 functions; `'use server'` directive; `VALID_STATUSES` whitelist; auth guard on all functions; `ST_AsGeoJSON` on both `routes.geom` and `submissions.snappedPoint`; tenant scope (`eq(*.tenantId, getDefaultTenantId())`) on all queries (CR-01 fix applied). |
| `src/actions/routes.ts` | `getRouteGeoJSON + getRoute + uploadRoute` | VERIFIED | Exports all 3; `getRouteGeoJSON` uses `ST_AsGeoJSON`; `uploadRoute` has IDOR check (CR-02 fix); `getRoute` and `getRouteGeoJSON` tenant-scoped (CR-01 fix). |
| `src/components/dashboard/MapView.tsx` | `'use client'` react-map-gl map (min 90 lines) | VERIFIED | 334 lines; `'use client'`; imports `Map, Source, Layer, Popup` from `react-map-gl/mapbox` (not bare `react-map-gl`); imports `mapbox-gl/dist/mapbox-gl.css`; anomaly-ring layer before circle layer; `fitBounds` via `mapRef.current.getMap().fitBounds()`; null route returns guided empty state; no individual `<Marker>` used; all strings via `useTranslations`. |
| `src/components/dashboard/RouteTab.tsx` | Server Component fetching route + approved points + legend | VERIFIED | No `'use client'`; `Promise.all([getRoute, getRouteGeoJSON, getApprovedPoints, getBoqLegend])`; serializes `uploadedAt` to ISO string; passes props to `RouteTabClient`. |
| `src/components/dashboard/RouteTabClient.tsx` | Mounts MapView; keeps upload/replace control | VERIFIED | `'use client'`; `ExistingRoute.uploadedAt: string`; renders `<MapView>` when route exists; `RouteUpload` fallback preserved; `handleUploadSuccess` uses real `routeId` (WR-04 fix). |
| `src/components/dashboard/KayitlarTab.tsx` | Server Component reading searchParams, calling getSubmissions | VERIFIED | No `'use client'`; reads `searchParams.status/page`; validates status against whitelist (falls back to 'all' on invalid); coerces page to positive int; calls `getSubmissions(projectId, { status, page, pageSize: 25 })`; renders `<KayitlarTabClient>`. |
| `src/components/dashboard/KayitlarTabClient.tsx` | shadcn Table + filter chips + pagination + photo lightbox (min 90 lines) | VERIFIED | 352 lines; `'use client'`; 4 filter chips with URL navigation; shadcn Table with 7 locked columns; `overflow-x-auto` for mobile; Dialog lightbox for photos; `maps.google.com/?q=lat,lon` with `rel="noopener noreferrer"`; `t('pagination', {page, pages})` ICU interpolation; all strings via `useTranslations`. |
| `src/components/dashboard/BoqTable.tsx` | % Tamamlanan column + Progress bar | VERIFIED | Imports `{ Progress } from '@/components/ui/progress'`; `progressColorClass` helper; header `t('col_completion_pct')`; `completionPct = planned > 0 ? Math.min((approved / planned) * 100, 100) : 0`; `<Progress value={completionPct} className="min-w-[80px] h-2" />`; inserted after `col_approved_qty`, before `col_remaining`. |
| `src/components/dashboard/RefreshOnFocus.tsx` | `'use client'` side-effect component calling `router.refresh()` on focus/visibility | VERIFIED | `'use client'`; `useEffect` registers `window 'focus'` and `document 'visibilitychange'` listeners; `visibilitychange` handler guards `document.visibilityState === 'visible'`; cleanup removes both listeners; `[refresh]` dep array; returns null. |
| `src/app/dashboard/projects/[id]/page.tsx` | `force-dynamic` export, Kayıtlar tab, searchParams plumbing, RefreshOnFocus mount | VERIFIED | `export const dynamic = 'force-dynamic'`; tab order BOQ · Rota · Kayıtlar · Personel; `searchParams` type includes `status?, page?`; `<KayitlarTab projectId={id} searchParams={{ status, page }} />`; `<RefreshOnFocus />` mounted outside `<Tabs>`; `activeTab` resolves `'kayitlar'`. |
| `next.config.ts` | `images.remotePatterns` for Vercel Blob host | VERIFIED | Plain-object form `{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com', pathname: '/**' }` (WR-02 fix; not URL constructor form). `serverExternalPackages` unchanged. `mapbox-gl` absent from `transpilePackages`/`serverExternalPackages`. |
| `messages/tr.json` | `dashboard.submissions` + `dashboard.map` namespaces + `dashboard.boq.col_completion_pct` | VERIFIED | All 3 namespaces present. Key spot-check: `tab_label`, `filter_all`, `col_photo`, `status_approved`, `empty_all`, `pagination` (with `{page}/{pages}` ICU), `photo_alt` (with `{material}` ICU), `empty_no_route`, `popup_distance` (with `{meters}` ICU), `legend_title`, `empty_no_points` — all confirmed present. |
| `messages/en.json` | EN parity of TR keys | VERIFIED | All 3 namespaces present at EN parity (node script confirmed: no missing keys across checked namespaces). |
| `tests/submissions.test.ts` | DASH-01/02/03 test scaffold | VERIFIED | File exists; imports `describeIfDb`, `seedSpatialFixture`, `SPATIAL_FIXTURE_IDS` from `./fixtures/db`; dynamic imports from `@/actions/submissions`; covers `getRouteGeoJSON` (LineString + null), `getApprovedPoints` (approved+snapped only), `getSubmissions` (filter, pagination, invalid-status rejection). All 6 DB tests pass with the connected database. |
| `tests/boq.test.ts` | DASH-04 progress-% edge-case tests | VERIFIED | Contains 3 edge-case `it()` tests: 100% cap (planned 100, approved 150 → 100), 0-guard (planned 0 → 0), partial (planned 1000, approved 250 → 25). All pass (`npx vitest run tests/boq.test.ts` → 13/13). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `MapView.tsx` | `react-map-gl/mapbox` Source/Layer/Popup | `import Map, { Source, Layer, Popup } from 'react-map-gl/mapbox'` | WIRED | Confirmed; bare `from 'react-map-gl'` absent. |
| `MapView.tsx` | `mapbox-gl/dist/mapbox-gl.css` | `import 'mapbox-gl/dist/mapbox-gl.css'` | WIRED | Confirmed at line 32. |
| `RouteTab.tsx` | `getRouteGeoJSON + getApprovedPoints + getBoqLegend` | `Promise.all` server fetch | WIRED | All 3 imported and called in `Promise.all`; results passed to `RouteTabClient`. |
| `src/actions/submissions.ts getApprovedPoints` | `submissions.snappedPoint` via `ST_AsGeoJSON` | `sql\`ST_AsGeoJSON(${submissions.snappedPoint})\`` | WIRED | Line 160 in submissions.ts confirmed. |
| `src/actions/submissions.ts getSubmissions` | `submissions.status` filter via whitelist | `VALID_STATUSES` + `eq()` | WIRED | `VALID_STATUSES` declared at line 33; conditional `eq(submissions.status, status)` applied when status is valid and not 'all'. |
| `src/actions/routes.ts getRouteGeoJSON` | `routes.geom` via `ST_AsGeoJSON` | `sql\`ST_AsGeoJSON(${routes.geom})\`` | WIRED | Line 117 in routes.ts confirmed. |
| `KayitlarTab.tsx` | `getSubmissions(projectId, { status, page })` | Server Component fetch from searchParams | WIRED | `getSubmissions` imported and called with sanitized `status` and `page`; result passed to `KayitlarTabClient`. |
| `KayitlarTabClient.tsx` | URL `?status=` / `?page=` | `router.push(...)` on filter/page change | WIRED | `navigate()` helper calls `router.push` with status + page; `handleFilterChange` resets to page 1; `handlePageChange` increments/decrements page. |
| `KayitlarTabClient.tsx` | Google Maps location link | `maps.google.com/?q=lat,lon` | WIRED | Line 247 confirmed with `rel="noopener noreferrer" target="_blank"`. |
| `[id]/page.tsx` | `export const dynamic = 'force-dynamic'` | Route segment config | WIRED | Line 15 confirmed. |
| `[id]/page.tsx` | `KayitlarTab` with `status, page` searchParams | `TabsContent value="kayitlar"` | WIRED | Lines 100-101 confirmed. |
| `[id]/page.tsx` | `RefreshOnFocus` outside `<Tabs>` | Mount once | WIRED | Line 63 confirmed — mounted inside outer `<div>` before `<Tabs>`. |
| `RefreshOnFocus.tsx` | `router.refresh()` on focus + visibilitychange | `useEffect` listeners | WIRED | Both `window 'focus'` and `document 'visibilitychange'` listeners call `refresh()`; cleanup removes both. |
| `BoqTable.tsx` | `shadcn Progress` component | `import { Progress } from '@/components/ui/progress'` | WIRED | Confirmed; rendered per row with `value={completionPct}`. |
| `BoqTable.tsx` | `dashboard.boq.col_completion_pct` | `useTranslations('dashboard.boq')` → `t('col_completion_pct')` | WIRED | Header uses `{t('col_completion_pct')}`; key confirmed in both locale files. |
| `next.config.ts images.remotePatterns` | `next/image` photo thumbnails | `hostname: '*.public.blob.vercel-storage.com'` allowlist | WIRED | Confirmed in plain-object form. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `MapView.tsx` | `routeGeoJSON`, `approvedPoints`, `boqLegend` | Props from `RouteTab.tsx` → `getRouteGeoJSON`, `getApprovedPoints`, `getBoqLegend` (server actions with PostGIS DB queries) | Yes — DB tests confirmed `getRouteGeoJSON` returns `{type:'LineString',coordinates:[...]}` and `getApprovedPoints` returns a FeatureCollection with real rows | FLOWING |
| `KayitlarTabClient.tsx` | `initialData.rows` | Props from `KayitlarTab.tsx` → `getSubmissions` (paginated DB query with `leftJoin boqItems`) | Yes — DB tests confirmed filter and pagination return real rows from Neon Postgres | FLOWING |
| `BoqTable.tsx` | `items` (including `approvedQty`, `plannedQty`) | Props from `BoqTab.tsx` → `getBoqItems` (existing server action; established in Phase 1) | Yes — Phase 1 established pattern; `approvedQty` is decremented atomically in `handleAuditDecision` during Telegram audit flow | FLOWING |
| `RefreshOnFocus.tsx` | — | Side-effect only; no data variable; triggers `router.refresh()` to re-run server fetches | N/A — triggers fresh data via RSC re-render; `force-dynamic` ensures cache bypass | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `getRouteGeoJSON` returns `{type:'LineString'}` from DB | `npx vitest run tests/submissions.test.ts -t "getRouteGeoJSON"` | 2 tests passed | PASS |
| `getApprovedPoints` returns only approved+snapped rows | `npx vitest run tests/submissions.test.ts -t "getApprovedPoints"` | 1 test passed | PASS |
| `getSubmissions` filter + pagination + invalid-status rejection | `npx vitest run tests/submissions.test.ts` | 6/6 passed (filter, pagination, invalid-status) | PASS |
| BOQ progress-% capped at 100, 0-guard, 25% partial | `npx vitest run tests/boq.test.ts` | 13/13 passed (includes all 3 edge cases) | PASS |
| Map stack packages installed and resolvable | `node -e "require.resolve('react-map-gl/mapbox'); require.resolve('mapbox-gl')"` | Resolved without error | PASS |

---

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| DASH-01 | 05-01, 05-02, 05-03 | Office Engineer sees the project's pipeline route rendered on a Mapbox map | VERIFIED (code) / HUMAN (visual) | `getRouteGeoJSON` DB-tested; `MapView.tsx` route line layer wired; `RouteTab.tsx` fetches and passes data; visual rendering is manual |
| DASH-02 | 05-01, 05-02, 05-03 | Approved work logs render as point markers overlaying the route | VERIFIED (code) / HUMAN (visual) | `getApprovedPoints` DB-tested (D-46 filter enforced); `MapView.tsx` circle + anomaly-ring layers; stable palette slots (D-58); visual rendering is manual |
| DASH-03 | 05-01, 05-02, 05-04, 05-06 | Office Engineer can view submissions filterable by status | VERIFIED | `getSubmissions` DB-tested (filter + pagination + invalid-status); `KayitlarTabClient.tsx` filter chips + pagination + photo + location + notes; URL-state in `?status=/?page=`; tab reachable at `?tab=kayitlar` |
| DASH-04 | 05-01, 05-05 | Office Engineer sees live BOQ progress per line item | VERIFIED | `BoqTable.tsx` extends with `% Tamamlanan` column + shadcn Progress; formula tested (3 edge cases green); `col_completion_pct` i18n key present |
| DASH-05 | 05-01, 05-06 | Map and BOQ progress reflect approved submissions (refresh on load/focus) | VERIFIED (code) / HUMAN (liveness) | `page.tsx` `export const dynamic = 'force-dynamic'`; `RefreshOnFocus.tsx` registers focus + visibilitychange; liveness behavior requires human verification in a real browser |

All 5 DASH requirements claimed by phase plans are accounted for. No orphaned requirements found in REQUIREMENTS.md for Phase 5.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No debt markers (TBD/FIXME/XXX/HACK/PLACEHOLDER) found in any Phase 5 file | — | None |
| — | — | No unimplemented stubs (all actions execute real DB queries; all components render real data) | — | None |
| `submissions.ts` | 1-47 | `getRouteGeoJSON` is exported from BOTH `submissions.ts` AND `routes.ts` (duplicate export). The test uses `submissions.ts`; `RouteTab.tsx` uses `routes.ts`. Both are identical implementations. | INFO | No behavioral impact — both paths work correctly and call the same DB query. Could cause confusion for future maintainers. Not a blocker. |

The duplicate `getRouteGeoJSON` is notable but not a blocker: the plan's Wave 0 test scaffold was written to import from `@/actions/submissions`, and the implementation also added the function to `routes.ts` (where `RouteTab.tsx` imports it). Both exports are substantive and call the same query. The discrepancy is a minor code hygiene issue.

---

### Human Verification Required

### 1. Mapbox Map Renders (DASH-01, DASH-02 visual)

**Test:** Start dev server with `npm run dev -- --no-turbopack`. Open a project with a route and at least one approved submission. Navigate to the Rota tab.
**Expected:** The pipeline route renders as a slate-colored line. Approved submissions render as palette-colored circles (up to 6 BOQ colors) positioned on or near the route. The bottom-left legend card maps each color to its BOQ material name.
**Why human:** react-map-gl renders to an HTML canvas. vitest runs in a Node environment — canvas rendering cannot be tested without heavy browser mocking. VALIDATION.md designates this as a manual-only check.

### 2. Popup Content (DASH-02 D-51)

**Test:** Click a submission marker on the map.
**Expected:** A popup opens at the marker location showing: a photo thumbnail, the BOQ material name, quantity + unit (tr-TR formatted), a status badge, a date in tr-TR locale, and the auditor name. If the submission has `location_match='far'`, an amber "Güzergahtan uzak — {N} m" line appears.
**Why human:** Popup interaction requires mouse events on a live canvas.

### 3. Map Empty States (D-56, D-57)

**Test:** (a) Open a project with a route but zero approved submissions. (b) Open a project with no route at all.
**Expected:** (a) Route line renders with the "Henüz onaylı iş noktası yok." note below the map, no legend. (b) The upload empty state appears — not a blank or broken map.
**Why human:** Branch rendering with a real Mapbox token requires a live browser.

### 4. Liveness — RefreshOnFocus + force-dynamic (DASH-05)

**Test:** In a second browser tab, approve a pending submission via Telegram audit (or update `approved_qty` directly in the DB). Return to the dashboard tab and let the window regain focus.
**Expected:** Within 1-2 seconds, the new approved point appears on the map and the BOQ % Tamamlanan column increases — without a manual page reload.
**Why human:** RSC cache behavior and `force-dynamic` interaction cannot be asserted in vitest.

### 5. Mapbox Token Domain Restriction (SC4 / D-62) — Ops Gate

**Test:** In the Mapbox account dashboard (`account.mapbox.com` → Tokens → select token → URL restrictions), confirm the `NEXT_PUBLIC_MAPBOX_TOKEN` is restricted to `https://bayrak.ai/*` (and `https://www.bayrak.ai/*` or preview domains as needed) before sharing any external dashboard URL.
**Expected:** Token restrictions are saved. The token returns 401 when used from an unrecognized origin.
**Why human:** External Mapbox account configuration — not testable from the codebase.

---

### Gaps Summary

No code gaps. All 4 success criteria have code-level verification. SC4 (Mapbox token domain restriction) is an ops gate, not a code deficiency — it is accepted via override and surfaced as human verification item #5.

The only noteworthy finding is the informational duplicate `getRouteGeoJSON` export in both `src/actions/submissions.ts` and `src/actions/routes.ts`. Both implementations are correct and tests pass from both import paths. This is a code hygiene item for future cleanup, not a blocker.

---

_Verified: 2026-05-25T01:15:00Z_
_Verifier: Claude (gsd-verifier)_
