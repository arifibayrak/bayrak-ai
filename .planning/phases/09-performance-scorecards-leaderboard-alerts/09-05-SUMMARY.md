---
phase: "09-performance-scorecards-leaderboard-alerts"
plan: "05"
subsystem: "analytics-ui"
tags: ["scorecards", "leaderboard", "office-engineer", "i18n", "PERF-01", "PERF-02", "PERF-03", "PERF-05"]
dependency_graph:
  requires:
    - "09-02 (KpiCard warning valueColor + alertBadge)"
    - "09-04 (getPersonMetrics outputQuantitySum + slaBreachRateDecided; getPortfolioPeople; getTenantSettings)"
  provides:
    - "Enriched worker+auditor profile scorecards at /dashboard/people/[personId]"
    - "Sortable ranked People directory at /dashboard/people (leaderboard mode)"
    - "Read-only OE activity scorecard at /dashboard/analytics/office-engineers/[userId]"
    - "getWorkerSortFn + getAuditorSortFn exported from analytics.ts (PERF-05 tests GREEN)"
  affects:
    - "/dashboard/people → profile page"
    - "/dashboard/people → directory page"
    - "/dashboard/analytics → analytics page"
tech_stack:
  added: []
  patterns:
    - "Settings-first fetch: getTenantSettings() before getPersonMetrics auditor call"
    - "Pure-TS leaderboard sort: getWorkerSortFn/getAuditorSortFn + addWorkerRanks/addAuditorRanks"
    - "Competition ranking (1,1,3) with localeCompare tiebreaker"
    - "Suspense-wrapped LeaderboardSortSelect (useSearchParams client component)"
    - "OE user lookup via users table + office_activity_log JOIN for tenant-scope"
key_files:
  created:
    - "src/components/admin/LeaderboardSortSelect.tsx"
    - "src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx"
  modified:
    - "src/app/dashboard/(admin)/people/[personId]/page.tsx"
    - "src/app/dashboard/(admin)/people/page.tsx"
    - "src/app/dashboard/(admin)/analytics/page.tsx"
    - "src/actions/analytics.ts"
    - "messages/en.json"
    - "messages/tr.json"
decisions:
  - "Export getWorkerSortFn + getAuditorSortFn from analytics.ts (not people/page.tsx) to satisfy PERF-05 test imports"
  - "OE tenant-scope: scope via office_activity_log JOIN (users table has no tenant_id FK)"
  - "People directory leaderboard: single sortBy param shared across Worker/Auditor tabs; each tab maps it through its own allowlist"
  - "hasNoRecords OE parity note: rendered as informational Alert (D-80 edge case — OE not in people table so rarely reachable)"
metrics:
  duration: "~35 minutes"
  completed: "2026-05-27"
  tasks_completed: 3
  files_changed: 8
---

# Phase 09 Plan 05: UI Scorecards, Leaderboard & OE Activity View Summary

Worker+auditor role scorecards enriched on the Phase-8 profile page with Output Volume + Approval Rate (PERF-01) and SLA Breach Rate (PERF-02); People directory gains competition-ranked leaderboard mode with TypeScript sort helpers (PERF-05, 3 RED tests now GREEN); read-only OE scorecard at /dashboard/analytics/office-engineers/[userId] reuses Phase-7 activity log (PERF-03).

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Enrich person profile with worker + auditor scorecard cards (PERF-01/02) | d5720c1 |
| 2 | Add leaderboard rank column + sort to People directory (PERF-05) | fbf7d87 |
| 3 | Build read-only OE scorecard + Analytics entry point (PERF-03) | ab0e11c |
| fix | JSON comma fix in en.json + tr.json (Rule 1 auto-fix) | e9a9f3f |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing trailing comma in messages JSON**
- **Found during:** Task 3 verification (full test suite)
- **Issue:** i18n tests failed — `oe_scorecard` block missing trailing comma before `timeline` block in both `en.json` and `tr.json`
- **Fix:** Added missing commas; both files parse cleanly
- **Files modified:** `messages/en.json`, `messages/tr.json`
- **Commit:** e9a9f3f

**2. [Rule 2 - Missing Critical] Export sort helpers from analytics.ts**
- **Found during:** Task 2 planning
- **Issue:** PERF-05 tests import `getWorkerSortFn` / `getAuditorSortFn` from `@/actions/analytics`, not from the page file
- **Fix:** Exported all 4 sort/ranking helpers from analytics.ts alongside the portfolio types they operate on
- **Files modified:** `src/actions/analytics.ts`
- **Commit:** fbf7d87

## Verification Results

- `npx tsc --noEmit` — 0 errors
- `npx vitest run tests/analytics.test.ts` — 66 PASS, 0 FAIL (incl. 3 PERF-05 leaderboard sort tests GREEN)
- `npx vitest run` (full suite) — 259 PASS, 0 FAIL

## Known Stubs

None — all data connections wired. OE page uses real `getOfficeActivityLog()` + real users query.

## Threat Surface Scan

No new network endpoints, auth paths, or trust-boundary crossings beyond what the plan's threat model already covers:

| Mitigation applied | Component | Detail |
|-------------------|-----------|--------|
| T-09-05-IDOR | OE scorecard [userId] | Tenant-scope via office_activity_log JOIN; notFound() on missing user |
| T-09-05-XSS | Activity log context | React JSX auto-escapes; no dangerouslySetInnerHTML |
| T-09-05-T | sortBy URL param | Mapped through fixed allowlist in getWorkerSortFn/getAuditorSortFn |
| T-09-05-AC | Profile + OE pages | auth() guard on every RSC |

## Self-Check: PASSED

All created/modified files exist. All commits verified in git log.
