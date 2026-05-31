---
phase: 15-chainage-as-built-view-approval-snapshot
plan: "07"
subsystem: ui
tags: [chainage, as-built, dashboard, react, next-intl, react-server-components, color-bar, granularity-toggle, drill-down]

# Dependency graph
requires:
  - phase: 15-chainage-as-built-view-approval-snapshot
    provides: "getChainageBuckets + setChainageOffset server actions (plan 05); chainage export route /api/exports/chainage (plan 06)"

provides:
  - ChainageTab RSC shell (force-dynamic, KPI row + offset form + table + BrandEmpty)
  - ChainageTable client component (colour bar, granularity toggle 1km/500m/100m, per-bucket BrandTable, export buttons)
  - ChainageOffsetForm client form (calibration offset write + router.refresh)
  - As-Built tab wired into project page (additive, 5th tab)
  - Full dashboard.asbuilt.* + dashboard.projects.tab_asbuilt i18n in tr.json and en.json

affects: [phase-16-ai-vision-assist, any future multi-tenant expansion of project page tabs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RSC shell + client component split: ChainageTab (RSC, Promise.all, force-dynamic) passes serialized data to ChainageTable (client, granularity toggle via useTransition)"
    - "CSS flex colour bar without charting library — one div per bucket, width proportional to bucket fraction, bg-emerald-400/bg-amber-300/bg-slate-200"
    - "Granularity toggle re-queries getChainageBuckets(projectId, newSize) inside useTransition for non-blocking rebucketing"
    - "Drill-down ?from=asbuilt back-link pattern (CHN-05)"
    - "Calibration offset: setChainageOffset + router.refresh() inside useTransition with toast feedback"

key-files:
  created:
    - src/components/dashboard/ChainageTab.tsx
    - src/components/dashboard/ChainageTable.tsx
    - src/components/dashboard/ChainageOffsetForm.tsx
  modified:
    - src/app/dashboard/projects/[id]/page.tsx
    - messages/tr.json
    - messages/en.json

key-decisions:
  - "Colour bar is pure CSS flex — zero charting libraries (recharts/d3/visx = 0 grep hits per Note #1)"
  - "Granularity toggle calls getChainageBuckets directly from client via useTransition — no URL param change, no page reload"
  - "Not-started buckets render em-dash cells and no Detay link (CHN-05 compliance)"
  - "Tab wire is purely additive — existing four tabs (overview/boq/records/route) untouched (Note #6)"

patterns-established:
  - "ChainageTab RSC shell pattern: export const dynamic='force-dynamic'; getTranslations; Promise.all data fetch; serialize Dates to ISO; pass to client child"
  - "Client granularity toggle: useState(bucketSizeM); onChange calls server action inside useTransition; LoadingSpinner overlay on table only"

requirements-completed: [CHN-02, CHN-04, CHN-05, CHN-06]

# Metrics
duration: continuation (tasks 1-3 in prior agent, UAT in this session)
completed: "2026-05-31"
---

# Phase 15 Plan 07: As-Built Tab UI (ChainageTab + ChainageTable + ChainageOffsetForm) Summary

**Colour-coded chainage as-built strip with completion KPI, CSS-flex colour bar, granularity toggle (1km/500m/100m), per-bucket drill-down table, calibration offset form, and bilingual TR/EN i18n — UAT-approved by user.**

## Performance

- **Duration:** Continuation plan (tasks 1-3 committed in prior execution; UAT in this session)
- **Started:** Prior execution session
- **Completed:** 2026-05-31
- **Tasks:** 4 (3 auto + 1 checkpoint:human-verify)
- **Files modified:** 6

## Accomplishments

- ChainageTab RSC renders a completion KPI row (3 KpiCards: %, covered km, total km), calibration offset form (BrandCard), and ChainageTable; force-dynamic prevents stale cache
- ChainageTable delivers CSS-flex colour bar (emerald/amber/slate per bucket status), three-button granularity toggle (1km/500m/100m) via useTransition re-query, BrandTable with drill-down links (?from=asbuilt), and Excel/PDF export buttons
- ChainageOffsetForm writes offset via setChainageOffset + router.refresh(); calibration shifts displayed km consistently across strip, Excel export, and Telegram approval line (Pitfall 13 three-surface consistency — UAT step 4 verified)
- As-Built tab wired into project page as purely additive 5th tab; all existing tabs (overview/boq/records/route) unchanged
- Full dashboard.asbuilt.* + dashboard.projects.tab_asbuilt i18n keys present in both tr.json and en.json

## Task Commits

Each task was committed atomically:

1. **Task 1: ChainageTab (RSC) + ChainageOffsetForm (client) + i18n** - `6353e58` (feat)
2. **Task 2: ChainageTable (colour bar + granularity toggle + table + export buttons)** - `f75760f` (feat)
3. **Task 3: Wire As-Built tab into the project page (additive)** - `fb26a47` (feat)
4. **Task 4: UAT checkpoint** - approved by user ("approved — all works")

## Files Created/Modified

- `src/components/dashboard/ChainageTab.tsx` - RSC shell: force-dynamic, Promise.all(getChainageBuckets+getRoute), KPI row, offset form, table mount, BrandEmpty fallback
- `src/components/dashboard/ChainageTable.tsx` - Client: CSS-flex colour bar (bg-emerald-400/bg-amber-300/bg-slate-200), granularity toggle (useTransition), BrandTable with drill-down per row, export buttons (window.open xlsx/pdf)
- `src/components/dashboard/ChainageOffsetForm.tsx` - Client: calibration offset input, setChainageOffset + router.refresh(), useTransition, toast feedback
- `src/app/dashboard/projects/[id]/page.tsx` - Additive: asbuilt TabsTrigger + TabsContent with ChainageTab; existing tabs untouched
- `messages/tr.json` - Added all dashboard.asbuilt.* keys + dashboard.projects.tab_asbuilt (Turkish)
- `messages/en.json` - Added all dashboard.asbuilt.* keys + dashboard.projects.tab_asbuilt (English)

## Decisions Made

- Colour bar uses CSS flex with no charting library — satisfies Note #1 from UI-SPEC; grep recharts|d3|visx = 0
- Granularity toggle calls getChainageBuckets directly from client inside useTransition — avoids URL param changes, no page reload needed
- Tab addition is purely additive per Note #6 — no restructuring of the existing tab bar

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — tsc clean after all three implementation tasks; UAT approved without reported issues.

## UAT Verification (Task 4)

**Status: APPROVED** — User confirmed in browser:

- Completion % KpiCard, colour bar (emerald/amber/slate full-width including not-started grey), per-bucket table with "km X+YYY – km X+YYY" format, status badges, work count, materials, worker + auditor names all render correctly
- Granularity toggle 1km → 500m → 100m re-segments bar + table without page reload
- Row "Detay" drill-down reaches canonical submission detail; "← As-Built'e dön" back-link returns to the strip (CHN-05 verified)
- Calibration offset 50m write + "Kaydedildi" toast; km values shift by offset; Excel export and Telegram approval line show same calibrated km (Pitfall 13 three-surface consistency verified)
- Dashboard locale TR ↔ EN: all as-built labels translate
- (Plan 06) `/api/exports/chainage?...` returns 401 when signed out

## User Setup Required

None — no external service configuration required.

## Threat Surface Scan

No new trust boundaries introduced beyond what the plan's threat model covers:

- All ChainageTab data flows through auth()-guarded server actions (plan 05 boundary)
- Export via /api/exports/chainage has auth() first-statement guard (plan 06 boundary)
- Bucket material/worker name strings are React text children — no dangerouslySetInnerHTML; T-15-07-XSS mitigated
- Three-surface calibration consistency (T-15-07-CONSIST) verified in UAT step 4

## Known Stubs

None — all data is wired through real getChainageBuckets queries; no placeholder text or hardcoded empty values in the render path.

## Next Phase Readiness

- Phase 15 complete: all 7 plans executed, CHN-01 through CHN-06 + CHN-02 calibration delivered and UAT-approved
- Phase 16 (AI Vision Assist) can begin: DXF route import + chainage snapshot foundation (Phases 14-15) is complete
- No blockers

## Self-Check: PASSED

Files confirmed present:
- src/components/dashboard/ChainageTab.tsx — FOUND (committed 6353e58)
- src/components/dashboard/ChainageTable.tsx — FOUND (committed f75760f)
- src/components/dashboard/ChainageOffsetForm.tsx — FOUND (committed 6353e58)
- src/app/dashboard/projects/[id]/page.tsx — FOUND (committed fb26a47)
- messages/tr.json — FOUND (committed 6353e58)
- messages/en.json — FOUND (committed 6353e58)

Commits confirmed:
- 6353e58 — Task 1 (ChainageTab + ChainageOffsetForm + i18n)
- f75760f — Task 2 (ChainageTable)
- fb26a47 — Task 3 (page.tsx tab wire)

---
*Phase: 15-chainage-as-built-view-approval-snapshot*
*Completed: 2026-05-31*
