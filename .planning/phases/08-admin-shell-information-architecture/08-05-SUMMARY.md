---
phase: 08-admin-shell-information-architecture
plan: "05"
subsystem: ui
tags: [analytics, people, timeline, drizzle, next-intl, shadcn]

requires:
  - phase: 08-04
    provides: FilterBar, KpiCard, getPortfolioKPIs, getPortfolioTrends — overview command center
  - phase: 08-02
    provides: getPersonMetrics, getCanonicalSubmissions, getAuditorDecisions, AuditorDecision type

provides:
  - getPortfolioPeople bulk aggregation (PortfolioWorker[] | PortfolioAuditor[]) — no N+1
  - ActivityTimeline 'use client' component — grouped-by-month, status dots, drill links
  - /dashboard/people — Workers/Auditors tabs, dual-role person in both
  - /dashboard/people/[personId] — KPI cards + activity timeline

affects:
  - plan 08-06 (records + detail pages — ActivityTimeline drill target must exist)
  - plan 08-07 if any (uses getPortfolioPeople or ActivityTimeline)

tech-stack:
  added: []
  patterns:
    - "getPortfolioPeople overloads: role discriminant + two parallel queries per role (no N+1)"
    - "ActivityTimeline: client-side slice state for Load-more (page size 50), groupByMonth helper"
    - "People directory: Workers/Auditors tabs with URL ?role= param"
    - "Profile page: parallel fetch (worker + auditor metrics + timeline data)"
    - "D-66 pending backlog: separate query, no dateCondition applied"
    - "D-69 dual-role: assignments JOIN produces both roles; person in both result sets"

key-files:
  created:
    - src/actions/analytics.ts (getPortfolioPeople, PortfolioWorker, PortfolioAuditor)
    - src/components/admin/ActivityTimeline.tsx
    - src/app/dashboard/(admin)/people/page.tsx
    - src/app/dashboard/(admin)/people/[personId]/page.tsx
  modified:
    - src/actions/analytics.ts (types + function appended)
    - tests/analytics.test.ts (5 new tests for getPortfolioPeople)

key-decisions:
  - "getPortfolioPeople implemented as overloaded function (not two separate named functions) — role discriminant cleanly narrows return type"
  - "Workers: two parallel queries merged in JS (counts query + value-by-currency query) — avoids GROUP BY cartesian product between status and currency"
  - "Auditors: two parallel queries (decisions+latency + pending backlog) — NULL isolation for AVG latency (split-query pattern D-66)"
  - "ActivityTimeline accepts pre-mapped TimelineEntry[] — parent does shape mapping so component has zero knowledge of analytics types"
  - "Profile page uses getActivePeople() for person existence check (notFound if personId absent from people table)"
  - "Directory pagination: not added — worker/auditor count in single-tenant MVP expected well under 50; SUMMARY note per plan"

patterns-established:
  - "Bulk aggregation pattern: one SQL query per role (not N× getPersonMetrics) via JOIN people → assignments → submissions GROUP BY p.id"
  - "Auditor timeline source: submissions WHERE decided_by = personId (D-70, never office_activity_log)"
  - "TimelineEntry.date: raw Date for sorting/grouping; TimelineEntry.dateStr: pre-formatted display string"

requirements-completed: [PERF-04, UX-03]

duration: 95min
completed: 2026-05-26
---

# Phase 08 Plan 05: People Directory, Profile + Activity Timeline Summary

**Bulk aggregation query `getPortfolioPeople` (no N+1) feeds a cross-project Workers/Auditors directory and per-person profile with month-grouped activity timeline drilling to submission detail.**

## Performance

- **Duration:** ~95 min
- **Started:** 2026-05-26 (continuation session)
- **Completed:** 2026-05-26T21:35:00Z
- **Tasks:** 3 of 4 complete (Task 4 is a checkpoint:human-verify — awaiting manual browser review)
- **Files modified:** 5

## Accomplishments

### Task 1: getPortfolioPeople bulk aggregation (TDD RED → GREEN)

RED commit `795b01f`: 5 failing tests in `describeIfDb('D-69/PERF-04: getPortfolioPeople() bulk aggregation')`.

GREEN commit `dd7ebdb`: implemented `getPortfolioPeople` with two overloads:

```typescript
export async function getPortfolioPeople(options: {
  role: 'worker';
  dateRange?: { from: Date; to: Date };
  projectIds?: string[];
}): Promise<PortfolioWorker[]>;

export async function getPortfolioPeople(options: {
  role: 'auditor';
  dateRange?: { from: Date; to: Date };
  projectIds?: string[];
}): Promise<PortfolioAuditor[]>;
```

Workers query pattern (two queries merged in JS):
1. Counts: `JOIN people → assignments (role='worker') → LEFT JOIN submissions` with `FILTER (WHERE status=...)` per bucket
2. Value: same join chain + `LEFT JOIN boq_items` grouped by `p.id, b.currency_code`

Auditors query pattern (two queries, NULL isolation):
1. Decisions + avg latency: `LEFT JOIN submissions ON s.decided_by = p.id` + `FILTER (WHERE decided_at IS NOT NULL)` for avg
2. Pending backlog: separate query `WHERE status='pending_audit'` with NO dateCondition (D-66 point-in-time)

All 51 tests pass (47 pre-existing + 5 new D-69/PERF-04 tests including dual-role and pending_people exclusion).

### Task 2: ActivityTimeline component

`src/components/admin/ActivityTimeline.tsx` — `'use client'` component:
- Groups entries by calendar month (newest first) via `toLocaleDateString('tr-TR', { month:'long', year:'numeric' })`
- `StatusDot`: `bg-emerald-500` (approved), `bg-destructive` (rejected), `bg-amber-500` (pending_audit)
- Worker mode center: `[material] — [quantity] [unit]`; Auditor mode adds `([workerName])` + `t('decided_in') + latencyLabel`
- Semantic `<ol>/<li>` structure; each entry min-h-[44px] touch target
- Load-more: client-side slice state, starts at 50, increments by 50 per click
- Drill: `<Link href={\`/dashboard/records/${entry.id}\`}>` ChevronRight

### Task 3: People directory + person profile pages

**Directory** (`src/app/dashboard/(admin)/people/page.tsx`):
- `force-dynamic`; `await searchParams` with `isNaN(Date.parse)` date validation
- `Promise.all` for workers + auditors + projects (parallel fetch)
- shadcn Tabs with `?role=worker|auditor` URL state
- Workers table: Name (link), Submissions total, Approved (emerald badge), Rejected (destructive), Pending (secondary), Value (first currency or "—")
- Auditors table: Name (link), Decisions, Avg Turnaround ("X.X sa" or "—"), Backlog (secondary ≤5, destructive >5)
- Suspense-wrapped FilterBar (project + date filters; no person filter — this IS the people list)

**Profile** (`src/app/dashboard/(admin)/people/[personId]/page.tsx`):
- `force-dynamic`; `await params` + `await searchParams`
- `getActivePeople()` → filter by personId → `notFound()` if absent
- Parallel fetch: worker metrics + auditor metrics + worker submissions (100) + auditor decisions (100)
- Dual-role: 8 KpiCards in 4-col grid with Separator + "Worker Metrics" / "Auditor Metrics" headings
- Worker timeline: getCanonicalSubmissions → ActivityTimeline mode="worker"
- Auditor timeline: getAuditorDecisions → ActivityTimeline mode="auditor" (D-70, NOT office_activity_log)

## Deviations from Plan

### Auto-fixed Issues During RED Phase

**1. [Rule 1 - Bug] Fixed invalid hex characters in test UUID fixtures**
- **Found during:** Task 1 (RED phase — fixture inserts failed with invalid UUID errors)
- **Issue:** Six test UUIDs contained non-hex chars (`s`, `v`, `r`) in the node segment
- **Fix:** Replaced with valid hex equivalents (`e005…`, `e041…`, `e051…`)
- **Files modified:** `tests/analytics.test.ts`
- **Commit:** `795b01f` (fixed inline before GREEN)

**2. [Rule 1 - Bug] Fixed wrong `pending_people` column names in test fixture**
- **Found during:** Task 1 (RED phase)
- **Issue:** Test INSERT used `telegram_display_name` (does not exist) and `requested_at` (does not exist)
- **Fix:** Corrected to `telegram_name` and `started_at` per schema migration
- **Files modified:** `tests/analytics.test.ts`
- **Commit:** `795b01f`

**3. [Rule 1 - Bug] Fixed duplicate submission INSERTs in dual-role test**
- **Found during:** Task 1 (GREEN attempt)
- **Issue:** UUID fix edit accidentally left original bad-UUID INSERT lines in place → PG unique violation
- **Fix:** Removed the three duplicate lines
- **Files modified:** `tests/analytics.test.ts`

### Intentional Deviations

**4. decided_in i18n: no interpolation**
- The `dashboard.admin.timeline.decided_in` key value is `"decided in"` (bare string, no `{duration}` slot)
- Used `{t('decided_in')} {entry.latencyLabel}` concatenation instead of `t('decided_in', { duration: … })`

**5. Directory pagination not added**
- Per UI-SPEC: "none — directory should be manageable for single-tenant MVP; if row count > 50, add a note"
- Expected worker/auditor count well under 50 in MVP. No pagination added; documented here per plan instruction.

**6. ActivityTimeline heading uses hardcoded "Aktivite" string**
- The `dashboard.admin.timeline` i18n namespace has no `heading` key (only `load_more`, `empty`, `view_detail`, `decided_in`)
- Used hardcoded "Aktivite" literal. If i18n key is needed in future, add `"heading": "Activity"` / `"heading": "Aktivite"` to both message files.

## Known Stubs

None. All data-wired — `getPortfolioPeople` returns live DB data; timeline entries come from `getCanonicalSubmissions` / `getAuditorDecisions`.

## Threat Flags

No new threat surface beyond what was declared in the plan's `<threat_model>` (T-08-05-IV, T-08-05-ID, T-08-05-XSS). All three mitigations applied:
- T-08-05-IV: `!isNaN(Date.parse(str))` guard on both pages; Drizzle `sql\`\`` binds all params
- T-08-05-ID: getPortfolioPeople + getPersonMetrics + getAuditorDecisions all tenant-scoped; `getActivePeople()` filters to people table only
- T-08-05-XSS: no `dangerouslySetInnerHTML`; all display values JSX-escaped by React

## Self-Check

### Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 RED | `795b01f` | failing tests for getPortfolioPeople |
| 1 GREEN | `dd7ebdb` | implement getPortfolioPeople |
| 2 | `69ea174` | ActivityTimeline component |
| 3 | `8f88b22` | people directory + profile pages |

### Files

- `src/actions/analytics.ts` — getPortfolioPeople exported, PortfolioWorker + PortfolioAuditor types
- `tests/analytics.test.ts` — 5 new D-69/PERF-04 tests, all green (51 pass total)
- `src/components/admin/ActivityTimeline.tsx` — grouped timeline, status dots, load-more, drill links
- `src/app/dashboard/(admin)/people/page.tsx` — Workers/Auditors tabs, dual-role, FilterBar
- `src/app/dashboard/(admin)/people/[personId]/page.tsx` — KPI cards, ActivityTimeline, notFound

## Self-Check: PASSED
