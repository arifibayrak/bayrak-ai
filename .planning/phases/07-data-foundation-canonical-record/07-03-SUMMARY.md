---
phase: 07
plan: "03"
subsystem: analytics
tags: [money-math, currency-grouped, aggregation, logOfficeActivity, analytics, tdd]
dependency_graph:
  requires:
    - "07-01"   # canonical-submission type, office-activity-log schema
    - "07-02"   # migrations applied (0004, 0005) — boq_items.unit_price, office_activity_log table
  provides:
    - logOfficeActivity helper (fire-and-forget, after()-deferred void)
    - getCanonicalSubmissions (typed CanonicalSubmission[] query)
    - getProjectMetrics (EV + BAC + rework grouped by currency_code)
    - getPersonMetrics (worker + auditor scorecard, dual-role isolated)
    - getPortfolioOverview (per-project currency maps)
    - getOfficeActivityLog (activity log query with filters)
  affects:
    - Phase 8–11 downstream consumers (all use these functions as the data contract)
tech_stack:
  added: []
  patterns:
    - "db.execute(sql\`) with GROUP BY b.currency_code for all value aggregations"
    - "Promise.all for parallel queries in getProjectMetrics"
    - "next/server after() fire-and-forget pattern for logOfficeActivity"
    - "Record<string,string> currency-keyed value maps (never cross-currency sum)"
    - "Separate queries for auditor avg-latency vs pending-backlog (NULL decidedAt isolation)"
key_files:
  created:
    - src/lib/log-office-activity.ts
    - src/actions/analytics.ts
  modified:
    - tests/analytics.test.ts
decisions:
  - "after() mock in tests returns Promise.resolve(fn()) to allow awaiting the async callback before assertions"
  - "getPersonMetrics worker path scoped by person_id as submitter only — no auditor decisions bleed through"
  - "pending_backlog and avg_decision_latency_hours computed in SEPARATE queries to prevent NULL decidedAt poisoning the average"
  - "Dynamic WHERE clauses built via string interpolation inside sql.raw() — safe for UUIDs/dates; never user-submitted strings"
  - "reworkValueByCurrency uses FILTER (WHERE s.status = 'rejected') — explicitly COST-05 compliant"
metrics:
  duration_minutes: 12
  completed_date: "2026-05-26"
  tasks_completed: 3
  files_created: 2
  files_modified: 1
---

# Phase 7 Plan 03: Analytics Aggregation Layer Summary

**One-liner:** Currency-grouped aggregation layer with logOfficeActivity (after()-deferred void), getCanonicalSubmissions, getProjectMetrics, getPersonMetrics, getPortfolioOverview, and getOfficeActivityLog — all money math in Postgres SUM(qty::numeric * price::numeric) grouped by currency_code, zero float8 casts.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 (RED) | Failing tests for logOfficeActivity + analytics | 19a44f9 | tests/analytics.test.ts |
| 1 (GREEN) | logOfficeActivity() after()-deferred void helper | 6c8935c | src/lib/log-office-activity.ts |
| 2 (GREEN) | getCanonicalSubmissions + getProjectMetrics + getOfficeActivityLog | 1af8d73 | src/actions/analytics.ts, tests/analytics.test.ts |
| 3 (VERIFY) | getPersonMetrics + getPortfolioOverview (already implemented in Task 2) | 1af8d73 | src/actions/analytics.ts |

## What Was Built

### `src/lib/log-office-activity.ts`

Synchronous void helper that schedules a db.insert into `office_activity_log` via `next/server after()`. The INSERT is wrapped in try/catch inside the after() callback — any error is swallowed and never propagated to the caller. Callers never await it; it never returns a Promise.

### `src/actions/analytics.ts`

Five typed aggregation functions, all auth-guarded (`const session = await auth(); if (!session) throw new Error('Unauthorized')`) and tenant-scoped (`WHERE s.tenant_id = ${tenantId}`):

1. **getCanonicalSubmissions(filters)**: multi-join query returning CanonicalSubmission[] with earned_value computed in Postgres as `(s.quantity::numeric * b.unit_price::numeric)::text` — no float8 casts.

2. **getProjectMetrics(projectId, dateRange?)**: two parallel queries via Promise.all:
   - Query 1: approved/rejected/pending counts, avg_audit_latency, location_warning count, rejection_rate
   - Query 2: EV + BAC + rework_value with `GROUP BY b.currency_code`
   - Returns `evByCurrency`, `bacByCurrency`, `reworkValueByCurrency` as `Record<string,string>` — never a single cross-currency total

3. **getPersonMetrics(personId, options?)**: worker submission counts + currency-grouped valueContributedByCurrency; when asAuditor:true, adds decisionsCount and avgDecisionLatencyHours from a **separate** query (NULL decidedAt isolation), plus pendingBacklogCount from a **third separate** query.

4. **getPortfolioOverview()**: single query returning one row per project-currency, merged in TypeScript into per-project `contractedValueByCurrency` + `earnedValueByCurrency` maps.

5. **getOfficeActivityLog(options?)**: joins `users` (actorEmail) + `projects` (projectName); filters by actorUserId/projectId/date; default limit 50, ordered by occurred_at DESC.

## Test Results

All 17 tests in `tests/analytics.test.ts` pass. Full suite 180/180.

Money-Math Tests:
- Test 1 (no kuruş drift): `new Decimal('1250.0001').times('333.333').times(3)` matches Postgres result within 0.001
- Test 2 (cross-currency guard): evByCurrency has keys TRY + USD, no 'total' key
- Test 3 (non-blocking): FK violation in after() callback swallowed, logOfficeActivity returns void without throwing
- Test 4 (dual-role isolation): worker submissionsApproved == 3 (project A only), not 8 (3+5 bleed)

## Acceptance Criteria Verification

```
grep -c "GROUP BY b.currency_code" src/actions/analytics.ts  → 4 (≥ 2 required)
grep -c "::float8" src/actions/analytics.ts                  → 0 (required == 0)
grep -c "await auth()" src/actions/analytics.ts              → 5 (== 5 exported functions)
grep -c "^export async function" src/actions/analytics.ts    → 5
grep -q "): void" src/lib/log-office-activity.ts             → PASS
grep -q "after(" src/lib/log-office-activity.ts              → PASS
grep -c "pending_backlog" src/actions/analytics.ts           → 2 (separate query confirmed)
```

## Deviations from Plan

**1. [Rule 1 - Bug] flow_id missing from test submission INSERTs**
- Found during: Task 2 (first test run)
- Issue: `submissions.flow_id` is `notNull()` (D-13 Guard 2 unique constraint). Test fixture INSERTs didn't include `flow_id`, causing "Failed query" errors.
- Fix: Added `flow_id` column with deterministic UUID values to all submission INSERT statements in tests/analytics.test.ts.
- Files: tests/analytics.test.ts

**2. [Rule 1 - Bug] Invalid UUID format in COST-05 test**
- Found during: Task 2 second test run
- Issue: `'00000000-0000-0000-0000-aa00000099'` was malformed (12 hex digits required in last group, not 8).
- Fix: Corrected to `'00000000-0000-0000-0000-aa0000000099'`.
- Files: tests/analytics.test.ts

**3. [Rule 1 - Bug] after() mock didn't await async callback**
- Found during: Task 1 PERF-03 test for insert verification
- Issue: `vi.mock('next/server', { after: vi.fn((fn) => fn()) })` — fn() is async (returns Promise) but the mock didn't return the Promise. The test queried the DB before the insert Promise resolved.
- Fix: Changed mock to `after: vi.fn((fn) => Promise.resolve(fn()))` and added await of the mock's last call result in the PERF-03 insert verification test.
- Files: tests/analytics.test.ts

**4. Tasks 2 and 3 implemented together**
- Observation: The plan split Task 2 (getCanonicalSubmissions/getProjectMetrics/getOfficeActivityLog) and Task 3 (getPersonMetrics/getPortfolioOverview). All 5 functions share the same file, auth pattern, and SQL structure, so implementing them together in one pass was more efficient and avoids an intermediate partially-functional state.
- Impact: Task 3 had no new code to write at implementation time; verification confirmed Task 3 acceptance criteria were all met by the Task 2 commit.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced in this plan. The analytics functions are Server Actions (auth-gated at entry). No new trust boundaries.

Threats T-07-05..T-07-08 mitigated as required:
- T-07-05 (Elevation of Privilege): every export has `if (!session) throw new Error('Unauthorized')`
- T-07-06 (cross-tenant leak): every query includes `WHERE tenant_id = ${tenantId}`
- T-07-07 (PII in log): getOfficeActivityLog reconstructs email/project_name by JOIN at read time
- T-07-08 (float drift/cross-currency sum): all multiplication in Postgres numeric; GROUP BY currency_code gated by 4 occurrences

## Known Stubs

None. All 5 functions return real data from Postgres queries. No hardcoded values or placeholder returns.

## Self-Check: PASSED

Files exist:
- src/lib/log-office-activity.ts: FOUND
- src/actions/analytics.ts: FOUND

Commits exist:
- 19a44f9 (test RED): FOUND
- 6c8935c (feat logOfficeActivity): FOUND
- 1af8d73 (feat analytics): FOUND

Tests: 17/17 pass (analytics.test.ts), 180/180 pass (full suite)
