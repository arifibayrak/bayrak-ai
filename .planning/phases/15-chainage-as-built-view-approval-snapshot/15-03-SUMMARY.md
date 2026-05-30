---
phase: 15-chainage-as-built-view-approval-snapshot
plan: "03"
subsystem: submission-detail
tags: [canonical-submission, google-maps, chainage, i18n, as-built]
dependency_graph:
  requires: [15-01]
  provides: [snapped-coords-on-canonical-submission, google-maps-link-detail, asbuilt-backlink]
  affects: [src/actions/analytics.ts, src/lib/types/canonical-submission.ts, src/components/admin/SubmissionDetailView.tsx]
tech_stack:
  added: []
  patterns: [additive-nullable-field-extension, static-edge-test, useRouter-back-link, noopener-noreferrer]
key_files:
  created: []
  modified:
    - src/lib/types/canonical-submission.ts
    - src/actions/analytics.ts
    - src/components/admin/SubmissionDetailView.tsx
    - src/app/dashboard/records/[id]/page.tsx
    - messages/tr.json
    - messages/en.json
    - tests/chainage.test.ts
    - tests/exports.test.ts
decisions:
  - "dashboard.admin.records namespace (not dashboard.records) — matched existing JSON structure under dashboard.admin"
  - "router.back() for As-Built back-link instead of hard-coded href — CHN-05 strip URL unknown at this component level"
  - "Static-edge test in chainage.test.ts reads source files to assert axis order at CI time"
metrics:
  duration: "5 minutes"
  completed_date: "2026-05-31"
  tasks: 2
  files: 8
---

# Phase 15 Plan 03: Submission Detail Map Link + As-Built Back-Link Summary

**One-liner:** Added nullable snapped lat/lon coords to CanonicalSubmission (ST_Y=lat, ST_X=lon), rendered a Google Maps link in SubmissionDetailView (q=lat,lon — no axis swap), and wired the CHN-05 As-Built strip drill-down return path via ?from=asbuilt back-link.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend CanonicalSubmission + getCanonicalSubmissions with snapped coords | 1699849 | canonical-submission.ts, analytics.ts, chainage.test.ts, exports.test.ts |
| 2 | Google Maps link + As-Built back-link in SubmissionDetailView + i18n | f11af09 | SubmissionDetailView.tsx, records/[id]/page.tsx, tr.json, en.json |

## What Was Built

### Task 1 — Type + Query Extension
- `CanonicalSubmission` type: added `snappedLat: number | null` and `snappedLon: number | null` with inline comments documenting the axis assignment (`snappedLat = ST_Y = latitude`, `snappedLon = ST_X = longitude`)
- `getCanonicalSubmissions` SELECT: added `ST_Y(s.snapped_point) AS snapped_lat` and `ST_X(s.snapped_point) AS snapped_lon` — semantically named columns prevent silent axis swap (Pitfall 5)
- Row mapper: serialized via `Number()` (coordinates are floats, not money — decimal.js not appropriate)
- `tests/chainage.test.ts`: converted `it.todo` for maps link to two concrete static-edge tests that read the analytics + component source files at CI time to assert axis order is correct

### Task 2 — UI + i18n
- `SubmissionDetailView.tsx`: added Google Maps anchor `https://www.google.com/maps?q=${submission.snappedLat},${submission.snappedLon}` with `target="_blank" rel="noopener noreferrer"` (T-15-03-TABNAB mitigated), rendered only when both coords non-null
- Added As-Built back-link: `from === 'asbuilt'` prop gates a `router.back()` button with `ChevronLeft` icon — CHN-05 drill-down return path ready
- `records/[id]/page.tsx`: threads `from` from `searchParams` into `SubmissionDetailView` as a prop
- i18n keys added to both `messages/tr.json` and `messages/en.json` under `dashboard.admin.records`:
  - `view_on_map`: TR "Haritada Gör" / EN "View on Map"
  - `back_to_asbuilt`: TR "← As-Built'e dön" / EN "← Back to As-Built"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] exports.test.ts CanonicalSubmission fixture type errors**
- **Found during:** Task 1 — `npx tsc --noEmit` after extending the type
- **Issue:** Two fixture objects in `tests/exports.test.ts` created `CanonicalSubmission` literals missing the new nullable fields `snappedLat`/`snappedLon`, causing TS2739/TS2345 errors
- **Fix:** Added `snappedLat: null, snappedLon: null` to both fixture objects — additive, no behavior change
- **Files modified:** `tests/exports.test.ts`
- **Commit:** 1699849

**2. [Rule 2 - Namespace correction] i18n path was dashboard.records, actual path is dashboard.admin.records**
- **Found during:** Task 2 — node verification of i18n keys failed; inspection of JSON structure revealed the namespace nesting
- **Issue:** Plan spec said `dashboard.records.view_on_map` but the JSON is nested under `dashboard.admin.records` (consistent with other records-namespace keys in the component using `'dashboard.admin.records'`)
- **Fix:** Used `useTranslations('dashboard.admin.records')` and placed keys under `dashboard.admin.records` in both JSON files
- **Files modified:** `src/components/admin/SubmissionDetailView.tsx`, `messages/tr.json`, `messages/en.json`
- **Commit:** f11af09

## Pending Todo Resolved

- `.planning/todos/pending/submission-detail-map-link.md` moved to `.planning/todos/completed/submission-detail-map-link.md`

## Threat Surface Scan

All threats identified in plan's `<threat_model>` are mitigated:
- T-15-03-TABNAB: `rel="noopener noreferrer"` present on Google Maps anchor
- T-15-03-AXIS: `ST_Y AS snapped_lat` / `ST_X AS snapped_lon` + `?q=${snappedLat},${snappedLon}` — lat first, no swap; static-edge tests assert at CI time
- T-15-03-IDOR: existing auth() + tenant scope unchanged; additive columns only

No new threat surface introduced beyond what the plan's threat model covers.

## Known Stubs

None — all data is wired. Google Maps link renders when snapped coords are present in the DB (non-null snapped_point on the submission). Submissions with `location_match = 'no_route'` have null coords and the link is correctly hidden.

## Self-Check: PASSED

- `src/lib/types/canonical-submission.ts` — snappedLat/snappedLon fields present ✓
- `src/actions/analytics.ts` — ST_Y AS snapped_lat + ST_X AS snapped_lon in SELECT ✓
- `src/components/admin/SubmissionDetailView.tsx` — google.com/maps present + noopener noreferrer ✓
- `messages/tr.json` — dashboard.admin.records.view_on_map + back_to_asbuilt present ✓
- `messages/en.json` — dashboard.admin.records.view_on_map + back_to_asbuilt present ✓
- `npx tsc --noEmit` — TypeScript compilation completed (clean) ✓
- Commits 1699849 + f11af09 — both in git log ✓
