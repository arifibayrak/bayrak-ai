---
phase: 04-spatial-layer
plan: 03
subsystem: spatial
tags: [postgis, spatial, snapToRoute, geometry, geography, vitest, integration-test, telegram-bot]

# Dependency graph
requires:
  - phase: 04-spatial-layer
    plan: 02
    provides: Five spatial columns on submissions + GiST index live in Neon (neondb)
  - phase: 04-spatial-layer
    plan: 01
    provides: seedSpatialFixture, SPATIAL_FIXTURE_IDS, tests/spatial.test.ts Wave 0 scaffold
provides:
  - snapToRoute(tx, flowId, lon, lat) — guarded PostGIS in-transaction snap helper (GEO-01/GEO-02)
  - getProximityThresholdM() — env-configurable threshold reader (D-45, default 500m)
  - formatDistance(m) — human-readable distance formatter for D-47 caption
  - handleConfirmSubmit wired to snapToRoute inside existing getTxDb() transaction (D-41)
  - GEO-01/GEO-02 integration tests passing against live Neon test DB
affects: [04-04-PLAN, 05-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "snapToRoute accepts tx: any — avoids circular drizzle-orm type import; matches PATTERNS.md lazy-tx pattern"
    - "CTE sub_pt + snap pattern: compute frac+dist_m once, reference from UPDATE SET clauses"
    - "::geography cast on both sides of ST_Distance — mandatory for metre-accurate threshold comparison"
    - "best-effort nested try/catch: outer catches geo error, inner catches no_route fallback error; neither re-throws"
    - "lazy await import('@/lib/spatial') inside transaction callback — no top-level import of @/lib/spatial in telegram.ts"
    - "locationLon/Lat null-check guard before snapToRoute call — defensive; LOG-05 enforces presence in normal flow"
    - "sql.raw for read-back assertions in integration tests — avoids neon-http UUID parameter-binding edge case"
    - "Rule 3 auto-fix: migration applied to neondb_test (test branch was missing Phase 4 columns)"

key-files:
  created:
    - src/lib/spatial.ts
  modified:
    - src/lib/telegram.ts
    - tests/spatial.test.ts

key-decisions:
  - "snapToRoute parameterized via Drizzle sql`` template: ${lon}, ${lat}, ${flowId}, ${threshold} are prepared-statement bindings (T-04-04)"
  - "Routes/submissions referenced as raw SQL table names (not schema imports) to avoid circular imports"
  - "neon-http db client passes as tx-like argument in tests: only tx.execute() used, compatible with neon-http"
  - "sql.raw used for post-snap SELECT assertions in tests (not parameterized sql``) — neon-http handles UUID literals in raw SQL cleanly"
  - "Migration applied to neondb_test (test DB branch) which lacked the Phase 4 columns — test DB and prod DB are separate Neon databases on the same endpoint"

# Metrics
duration: 30min
completed: 2026-05-24
---

# Phase 4 Plan 03: snapToRoute helper + telegram wiring + GEO-01/GEO-02 tests Summary

**snapToRoute guarded PostGIS snap wired into handleConfirmSubmit transaction (D-41/D-42); GEO-01/GEO-02 near/far/no_route integration tests all green against live Neon test DB**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-24T20:19:00Z
- **Completed:** 2026-05-24T20:50:23Z
- **Tasks:** 3
- **Files modified:** 3 (spatial.ts created, telegram.ts modified, spatial.test.ts rewritten)

## Accomplishments

- Created `src/lib/spatial.ts` — pure helper with `snapToRoute`, `getProximityThresholdM`, `formatDistance`:
  - `snapToRoute` runs a CTE-based PostGIS UPDATE inside the caller's transaction: `sub_pt` CTE builds `ST_SetSRID(ST_MakePoint(lon, lat), 4326)`; `snap` CTE computes `frac` + `dist_m` from `routes.geom` via `ST_LineLocatePoint` + `ST_Distance(::geography)` in one pass; UPDATE writes `snapped_point`, `segment_fraction`, `location_distance_m`, `location_match` (near/far CASE), `location_warning`
  - All lon/lat/flowId/threshold values are parameterized via `sql\`\`` (T-04-04, never string-concatenated)
  - `::geography` cast on both operands of `ST_Distance` — metre-accurate threshold (D-10, Pitfall 2)
  - `ST_LineInterpolatePoint(geom, frac)` for `snapped_point` — PostGIS canonical form (Pitfall 4)
  - Best-effort try/catch: outer catches any PostGIS error → sets `location_match='no_route'`; inner catches fallback error → swallows it; never re-throws (D-42)
  - `getProximityThresholdM()` reads `PROXIMITY_THRESHOLD_M` at call time (D-45, default 500)
  - `formatDistance(m)`: `>=1000` → `~X.X km`, else `~N m` (D-47)

- Modified `src/lib/telegram.ts` `handleConfirmSubmit`:
  - Added 12 lines inside `txDb.transaction()` callback, after the `submissions.insert().onConflictDoNothing()` and before the `conversation_state` DELETE
  - Lazy `await import('@/lib/spatial')` preserves lazy-import discipline (PATTERNS.md / telegram.ts module comment)
  - Null-check guard on `locationLon`/`locationLat` before calling `snapToRoute` (defensive edge case)
  - Longitude-first: `snapToRoute(tx, flowId, data.locationLon, data.locationLat)` (D-48)
  - Existing txErr try/catch and `onConflictDoNothing` unchanged

- Converted all 5 `it.todo` slots in `tests/spatial.test.ts` to real DB-gated assertions:
  - GEO-01 near: snapped_point IS NOT NULL, segment_fraction IS NOT NULL, Point geometry returned, longitude in route range
  - GEO-01 fraction: segment_fraction in [0.0, 1.0]
  - GEO-02 near: `location_match='near'`, `location_warning=false`, `dist_m <= 500`
  - GEO-02 far: `location_match='far'`, `location_warning=true`, `dist_m > 500`
  - GEO-02 no_route: `location_match='no_route'`, `location_warning=false`, null snap columns, `status='pending_audit'` (D-42 best-effort)
  - D-48 coordinate-order test remains active and green

## Task Commits

1. **Task 1: Create src/lib/spatial.ts** — `1532e78` (feat)
2. **Task 2: Wire snapToRoute into handleConfirmSubmit transaction** — `0903c0e` (feat)
3. **Task 3: Implement GEO-01/GEO-02 integration tests** — `4913eb1` (feat)

## Files Created/Modified

- `src/lib/spatial.ts` — New: 138 lines; exports `snapToRoute`, `getProximityThresholdM`, `formatDistance`; no top-level DB import
- `src/lib/telegram.ts` — +12 lines in `handleConfirmSubmit` transaction callback; lazy `import('@/lib/spatial')` guard + snapToRoute call
- `tests/spatial.test.ts` — Fully rewritten from Wave 0 scaffold: 5 real assertions + D-48 guard; all 6 tests pass

## Decisions Made

- `neon-http db` client works as the `tx` argument in tests: `snapToRoute` only calls `tx.execute(sql\`...\`)`, which neon-http supports
- `sql.raw` for read-back SELECT assertions in tests (not parameterized `sql\`\``) — neon-http UUID parameter binding with `::uuid` cast caused "Failed query" errors; `sql.raw` with literal UUIDs works cleanly
- Routes and submissions referenced as raw table names in SQL (no schema object imports) — avoids circular imports between `spatial.ts` and the schema barrel

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test database (neondb_test) missing Phase 4 spatial columns**
- **Found during:** Task 3 first test run (all 5 new tests failed with "Failed query")
- **Issue:** `TEST_DATABASE_URL` connects to `neondb_test` (a separate Neon database from `neondb`). The Plan 02 migration was applied only to `neondb` (production). The test DB lacked all five Phase 4 spatial columns.
- **Fix:** Applied migration to test DB via `DATABASE_URL=<TEST_DATABASE_URL> node_modules/.bin/tsx src/db/migrate.ts` — the project's established migration runner (D-49 pattern from Plan 02)
- **Files modified:** None (migration was already correct; only applied to the second DB)
- **Commit:** 4913eb1 (migration applied before test commit)

**2. [Rule 1 - Bug] Parameterized sql`` UUID binding fails in neon-http integration tests**
- **Found during:** Task 3 first test run
- **Issue:** `sql\`SELECT ... WHERE flow_id = ${flowId}::uuid\`` produced "Failed query" errors via neon-http. The `::uuid` cast on a `$1` parameter is not supported in all Neon HTTP client versions.
- **Fix:** Switched read-back SELECT queries to `sql.raw(...)` with literal UUID values — consistent with `tests/postgis.test.ts` seed pattern. The `insertSubmission` helper also uses `sql.raw` consistently.
- **Files modified:** `tests/spatial.test.ts`
- **Commit:** 4913eb1

## Known Stubs

None — `snapToRoute` is fully wired; spatial columns are populated at submission time; no placeholder data flows.

## Threat Flags

No new threat surface beyond the planned spatial snap in Plan 03:
- T-04-04 (SQL injection via lon/lat): mitigated — all `${lon}`, `${lat}`, `${flowId}`, `${threshold}` are Drizzle `sql\`\`` prepared-statement parameters, never string-concatenated. Verified via acceptance-gate grep: `grep -q "ST_MakePoint(\${lon}" src/lib/spatial.ts`.
- T-04-05 (degenerate geometry): mitigated — try/catch degrades to `no_route`; PostGIS handles edge cases natively.
- T-04-06 (silent warning drop): mitigated — error path always sets `no_route` (never silently sets `near`); GEO-02 no_route test asserts this.
- T-04-07 (threshold manipulation): mitigated — `PROXIMITY_THRESHOLD_M` is server-side env, not worker-controllable.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `src/lib/spatial.ts` | FOUND |
| `src/lib/telegram.ts` (wired) | FOUND |
| `tests/spatial.test.ts` | FOUND |
| Commit 1532e78 (Task 1) | FOUND |
| Commit 0903c0e (Task 2) | FOUND |
| Commit 4913eb1 (Task 3) | FOUND |
| `npx vitest run tests/spatial.test.ts` | 6/6 PASS |
| `npx tsc --noEmit` | CLEAN |
| ST_MakePoint(${lon} parameterized | CONFIRMED |
| ::geography cast | CONFIRMED |
| ST_LineInterpolatePoint | CONFIRMED |
| no_route fallback | CONFIRMED |

---
*Phase: 04-spatial-layer*
*Completed: 2026-05-24*
