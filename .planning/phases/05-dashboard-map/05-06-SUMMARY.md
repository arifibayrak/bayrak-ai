---
phase: 05-dashboard-map
plan: "06"
subsystem: ui
tags: [next.js, react, refresh-on-focus, force-dynamic, tabs, searchParams, mapbox]

# Dependency graph
requires:
  - phase: 05-03
    provides: MapView + RouteTab wired into Rota tab
  - phase: 05-04
    provides: KayitlarTab (filterable/paginated submissions table)
  - phase: 05-05
    provides: BOQ % Tamamlanan column + Progress bar in BoqTable
provides:
  - RefreshOnFocus.tsx client component — triggers router.refresh() on window focus + visibilitychange (DASH-05 liveness)
  - "[id]/page.tsx extended: force-dynamic route segment, Kayıtlar tab in BOQ·Rota·Kayıtlar·Personel order, status/page searchParams plumbed to KayitlarTab, RefreshOnFocus mounted once outside Tabs"
  - Full Phase 5 goal achieved: map, BOQ progress, submission list, and focus-refresh liveness all wired into the project-detail page
affects: [phase-06-ai-vision-assist]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RefreshOnFocus: 'use client' null-rendering side-effect component; useEffect registers focus + visibilitychange listeners calling router.refresh(), cleans up on unmount; [refresh] dep array"
    - "force-dynamic route segment config on [id]/page.tsx ensures every navigation re-runs server fetches (D-55); no polling or WebSocket needed"
    - "TabsTrigger→Link navigation for tab routing (existing pattern); Kayıtlar trigger links to ?tab=kayitlar with submissionsT('tab_label') i18n label"

key-files:
  created:
    - src/components/dashboard/RefreshOnFocus.tsx
  modified:
    - src/app/dashboard/projects/[id]/page.tsx

key-decisions:
  - "D-55 honored: force-dynamic on page segment (not leaf tab components) is the most reliable cache-bypass; newer use-cache / cache-components model explicitly excluded per locked D-55 decision"
  - "RefreshOnFocus mounted once outside <Tabs> (not per-tab) so liveness applies to all tabs uniformly"
  - "Tab order BOQ·Rota·Kayıtlar·Personel (D-49) — Kayıtlar inserted between Rota and Personel"
  - "Mapbox token domain restriction (D-62 / SC4) remains the final ops gate before any external dashboard URL is shared"
  - "Non-Turbopack dev server required for all map work (npm run dev -- --no-turbopack) — mapbox-gl worker breaks under Turbopack (RESEARCH Pitfall 1)"

patterns-established:
  - "Pattern: RefreshOnFocus — pure side-effect 'use client' component returning null; safe to mount inside Server Component page without hydration issues"
  - "Pattern: searchParams widening — Next 15 async searchParams; type extended to include domain-specific params (status, page) alongside routing param (tab)"

requirements-completed: [DASH-03, DASH-05]

# Metrics
duration: 25min
completed: 2026-05-25
---

# Phase 5 Plan 06: Page Integration Summary

**RefreshOnFocus liveness component + project-detail page wired with force-dynamic, BOQ·Rota·Kayıtlar·Personel tab order, and status/page searchParams — completing Phase 5 dashboard-map goal**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-24T23:29:00Z
- **Completed:** 2026-05-25T00:00:00Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint, approved)
- **Files modified:** 2

## Accomplishments

- Created RefreshOnFocus.tsx — a 'use client' side-effect component that registers window 'focus' and document 'visibilitychange' listeners calling router.refresh(), satisfying DASH-05 liveness without polling or WebSockets
- Extended [id]/page.tsx with force-dynamic route segment config, the Kayıtlar tab (reachable at ?tab=kayitlar with status/page searchParams forwarded to KayitlarTab), and RefreshOnFocus mounted once outside Tabs
- Completed the full Phase 5 dashboard-map integration: map (Rota), BOQ progress (BOQ), submission list (Kayıtlar), and people (Personel) all live under one force-dynamic, focus-refreshing page
- Human-verify checkpoint approved — tabs, filtering/pagination, BOQ progress, map, and focus-refresh liveness all verified end-to-end

## Task Commits

Each task was committed atomically:

1. **Task 1: RefreshOnFocus client component (DASH-05 liveness)** - `b35ef2c` (feat)
2. **Task 2: Wire page.tsx — force-dynamic, Kayıtlar tab, searchParams, RefreshOnFocus** - `24ffdea` (feat)
3. **Task 3: Human-verify checkpoint** - approved by user (no code commit — verification only)

**Plan metadata:** (to be committed with this SUMMARY)

## Files Created/Modified

- `src/components/dashboard/RefreshOnFocus.tsx` — 'use client' null-rendering component; useEffect registers window 'focus' + document 'visibilitychange' listeners calling router.refresh(); cleans up on unmount; [refresh] dep array
- `src/app/dashboard/projects/[id]/page.tsx` — Added export const dynamic = 'force-dynamic'; widened searchParams type to include status + page; added submissionsT from dashboard.submissions; updated activeTab to recognize 'kayitlar'; inserted Kayıtlar TabsTrigger + TabsContent with KayitlarTab; mounted RefreshOnFocus once outside Tabs

## Decisions Made

- D-55 honored: force-dynamic placed on the page segment, not leaf tab components — most reliable, uncaches the whole route on every navigation. The newer use-cache / cache-components model was explicitly excluded per locked D-55 decision.
- RefreshOnFocus mounted once outside Tabs so all tabs benefit from liveness equally. Putting it inside individual TabsContent would have caused double registration when switching tabs.
- Tab order D-49: BOQ · Rota · Kayıtlar · Personel. Kayıtlar sits between Rota and Personel — matches the workflow order (map route → audit submissions → people management).
- Mapbox token domain restriction (D-62 / SC4) is the remaining ops gate before sharing any external dashboard URL. Not a code change — an ops obligation.
- Dev server must run without Turbopack (`npm run dev -- --no-turbopack`) due to mapbox-gl worker incompatibility (RESEARCH Pitfall 1). This applies to all Phase 5+ map work.

## Deviations from Plan

None — plan executed exactly as written. Tasks 1 and 2 were auto tasks that completed successfully with tsc + eslint passing. Task 3 (human-verify checkpoint) was approved by the user.

## Issues Encountered

None — no build errors, no type errors, no eslint violations.

## User Setup Required

**Remaining ops gate before sharing any external dashboard URL:**

- **D-62 / SC4 — Mapbox token domain restriction**: The Mapbox public token (`NEXT_PUBLIC_MAPBOX_TOKEN`) must be restricted to the `bayrak.ai` domain in the Mapbox dashboard before any external URL is shared. Without this restriction, the token can be scraped from the page source and used to incur map tile charges on your account.
  - Steps: Mapbox Account → Tokens → select token → add URL restriction `https://bayrak.ai/*` (and preview/staging domains as needed) → save.

## Next Phase Readiness

**Phase 5 is complete.** All Phase 5 success criteria are now satisfied:

1. Mapbox map renders the GeoJSON pipeline route as a line layer and approved submissions as color-coded circle markers (Plan 03)
2. BOQ progress table shows contracted vs approved quantity with % Tamamlanan and a Progress bar (Plan 05)
3. Submissions list is filterable by status with photo lightbox, Maps link, and pagination (Plan 04)
4. The Mapbox token domain restriction (D-62 / SC4) is the final ops obligation — code is complete, ops step is outstanding

**Ready for Phase 6: AI Vision Assist** — async Claude vision analysis, eval harness gate, anomaly badges on dashboard and advisory Telegram follow-up.

---
*Phase: 05-dashboard-map*
*Completed: 2026-05-25*
