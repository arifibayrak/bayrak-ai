---
phase: 15-chainage-as-built-view-approval-snapshot
plan: "05"
subsystem: chainage-backend
tags: [chainage, aggregation, server-action, postgres, generate_series, tdd]
dependency_graph:
  requires: ["15-01", "15-04"]
  provides: ["fetchChainageBucketsRaw", "getChainageBuckets", "setChainageOffset"]
  affects: ["15-06-export-route", "15-07-ui"]
tech_stack:
  added: []
  patterns:
    - "generate_series CTE for not-started bucket enumeration (Pitfall 8)"
    - "COALESCE(chainage_m, segment_fraction * total_length_m) for pending rows (Pitfall 2)"
    - "sql.raw() for whitelist-validated integer literals in multi-occurrence CTE params"
    - "MIN(s.id::text) workaround — Postgres has no MIN(uuid) aggregate"
    - "Non-server-action shared helper pattern for Route Handler + Server Action dual import"
key_files:
  created:
    - src/lib/chainage-data.ts
    - src/actions/chainage.ts
  modified:
    - tests/chainage.test.ts
    - src/db/schema/office-activity-log.ts
decisions:
  - "sql.raw() used for bucketSizeM and totalLengthM literals in CTE to avoid Neon HTTP duplicate-param issue (each ${expr} creates a new positional param; same value used 6+ times in query caused param bloat)"
  - "MIN(s.id::text) instead of MIN(s.id) — Postgres has no built-in MIN aggregate for uuid type"
  - "totalLengthM fetched in a pre-query (step 1) then used as sql.raw() literal; safe because it comes from our own DB row (not user input)"
  - "VALID_BUCKET_SIZES whitelist as const tuple in chainage.ts; isValidBucketSize() type guard keeps TypeScript narrow"
metrics:
  duration: "25 minutes"
  completed: "2026-05-31"
  tasks: 2
  files: 4
---

# Phase 15 Plan 05: Chainage Aggregation Backend Summary

**One-liner:** PostgreSQL generate_series bucket aggregation with three-state D-04 status, COALESCE pending derivation, offset-in-FLOOR, and LEAST-clamped completion % — callable from both Server Action and Route Handler.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | fetchChainageBucketsRaw shared helper + CHN-03/04 tests | f7d3bc9 | src/lib/chainage-data.ts, tests/chainage.test.ts |
| 2 | getChainageBuckets + setChainageOffset Server Actions | 481729f | src/actions/chainage.ts, src/db/schema/office-activity-log.ts |

## What Was Built

### `src/lib/chainage-data.ts`
Non-server-action shared helper `fetchChainageBucketsRaw(projectId, bucketSizeM, tenantId)`:
- Two-query design: step 1 fetches `total_length_m` + `chainage_offset_m`; step 2 runs the full CTE aggregation
- `generate_series(0, N-1)` CTE enumerates ALL bucket indices including not-started (Pitfall 8)
- `COALESCE(s.chainage_m, s.segment_fraction * total_length_m)` for pending rows (Pitfall 2)
- Offset applied inside Postgres `FLOOR(... / bucketSizeM)` (Pitfall 4 — never in JS)
- D-04 three-state status: `approvedCount >= 1 → approved; pendingCount >= 1 → in_progress; else not_started`
- Last bucket `bucketEnd` capped at `totalLengthM` (Pitfall 3)
- `completionPct = Math.min(100, Math.round(coveredBuckets / totalBuckets * 100))` (D-02 + CHN-06)
- Returns empty result when no route exists (Pitfall A6)
- Exports `ChainageBucket` type and `ChainageBucketsResult` type

### `src/actions/chainage.ts`
`'use server'` wrapper actions:
- `getChainageBuckets(projectId, bucketSizeM)`: auth() first → bucketSizeM whitelist validate → delegate to fetchChainageBucketsRaw
- `setChainageOffset(projectId, offsetM)`: auth() + CR-02 ownership check → UPDATE routes.chainage_offset_m as string → logOfficeActivity + revalidatePath

### `tests/chainage.test.ts`
Converted all `it.todo` scaffolds to green tests:
- `formatChainage` (5 cases) — was already green; confirmed unchanged
- `bucket boundary` (Pitfall 2) — pure unit, JS FLOOR logic
- `bucket status` D-04 (3 cases) — pure unit, status derivation helper
- `completion` + `completion clamp` (CHN-06) — pure unit
- `chainage snapshot` (CHN-03) × 2 — integration, Postgres ROUND formula + geometry_version
- `getChainageBuckets` × 2 — integration, 3 buckets + correct boundaries
- `chainage offset` × 2 — integration, DB write + FLOOR bucketing with offset
- `maps link` × 2 — static-edge, axis order assertions (were already green from 15-03)

## Test Results

```
npx vitest run tests/chainage.test.ts
PASS (20) FAIL (0)  [1 it.todo: excel columns — plan 15-06]
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Postgres MIN(uuid) does not exist**
- **Found during:** Task 1 integration test run
- **Issue:** `MIN(s.id) FILTER (...)` failed with "function min(uuid) does not exist" — Postgres has no built-in MIN aggregate for uuid type
- **Fix:** Cast to text: `MIN(s.id::text) FILTER (...)`; result is still a valid UUID string (text representation)
- **Files modified:** src/lib/chainage-data.ts
- **Commit:** f7d3bc9

**2. [Rule 1 - Bug] Neon HTTP duplicate positional param issue with repeated ${expr} in CTE**
- **Found during:** Task 1 integration test run
- **Issue:** Drizzle sql`` template creates a new `$N` positional param for every `${bucketSizeM}` occurrence. With `bucketSizeM` appearing 6 times and `totalLengthM` appearing 2 times, Neon HTTP's prepared-statement mechanism produced 9 params where the query expected consistent reuse — causing "Failed query" with no Postgres error code (connection-level rejection before SQL parsing)
- **Fix:** Use `sql.raw(String(bucketSizeM))` and `sql.raw(String(totalLengthM))` for the whitelist-validated integer literals. Both are safe for `sql.raw()`: `bucketSizeM` is whitelist-validated in the Server Action before this function is called; `totalLengthM` comes from our own DB row. `tenantId` and `projectId` remain as bound parameters.
- **Files modified:** src/lib/chainage-data.ts
- **Commit:** f7d3bc9

**3. [Rule 2 - Missing] chainage_offset_set + chainage_exported added to OFFICE_ACTION_TYPES**
- **Found during:** Task 2 implementation
- **Issue:** `logOfficeActivity` in setChainageOffset uses `actionType: 'chainage_offset_set'` — not yet in the OFFICE_ACTION_TYPES union, would cause TypeScript error
- **Fix:** Added `'chainage_offset_set'` and `'chainage_exported'` to the union (chainage_exported is needed by plan 15-06 export route handler)
- **Files modified:** src/db/schema/office-activity-log.ts
- **Commit:** 481729f

## Known Stubs

None. The aggregation backend is fully wired. `chainage_exported` action type is pre-registered for plan 15-06 (export route handler).

## Threat Flags

No new threat surface beyond the plan's threat model. All T-15-05 mitigations applied:
- T-15-05-IDOR: tenantId bound param on all tables
- T-15-05-SQLI: bucketSizeM whitelist validated; sql.raw() only for whitelist-validated values
- T-15-05-AUTHZ: auth() first in both Server Actions
- T-15-05-FLOAT: all numeric arithmetic in Postgres; completionPct is integer count division

## Self-Check: PASSED

- src/lib/chainage-data.ts: FOUND
- src/actions/chainage.ts: FOUND
- Commit f7d3bc9: FOUND
- Commit 481729f: FOUND
- Tests: PASS (20) FAIL (0)
- tsc --noEmit: clean
