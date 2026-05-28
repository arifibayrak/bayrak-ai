---
phase: 10-hakkedi-billing
plan: "02"
subsystem: billing-actions
tags: [hakedis, billing, server-actions, money-math, postgres, istanbul-tz, tdd]

# Dependency graph
requires:
  - phase: 10-hakkedi-billing
    plan: "01"
    provides: hakedis_periods deduction columns + GENERATED period_qty + tests scaffold
provides:
  - src/actions/hakedis.ts with 7 exported auth-guarded server actions
  - computePeriodLines (Istanbul-tz cutoff, finalized-only chaining, never inserts GENERATED period_qty)
  - createPeriod (IDOR guard, auto-suggest period number, compute-on-create, activity log)
  - getPeriodsByProject (per-period netByDisplay in Postgres numeric; null for empty periods)
  - getPeriodDetail (full D-90 deduction chain + unpriced item warning D-103)
  - finalizePeriod (irreversible status lock D-96, activity log hakedis_period_finalized)
  - updatePaymentStatus (VALID_TRANSITIONS enforces finalized→submitted→paid, D-95)
  - deletePeriod (draft-only delete cascade D-97, activity log hakedis_period_deleted)
  - tests/hakedis.test.ts: 28 DB integration tests covering HAK-01..HAK-05 (all green)
affects:
  - 10-03 (period list + detail pages consume getPeriodsByProject + getPeriodDetail)
  - 10-04 (billing computation depends on finalizePeriod + updatePaymentStatus)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Istanbul-tz inclusive cutoff: (period_end_date::date + interval '1 day') AT TIME ZONE 'Europe/Istanbul' (D-100)
    - DISTINCT ON for previous-cumulative: picks most recent finalized period per boq_item_id (D-99)
    - GROUP BY hp.id + all rate columns in deduction query (Postgres aggregate correctness)
    - COALESCE(tevkifat_fraction, 0) + COALESCE(stopaj_rate, 0) in deduction SQL (Pitfall 5)
    - CASE WHEN stopaj_enabled in deduction SQL (D-93)
    - D-90 net formula computed in single Postgres query, never in JS
    - Auth user seeded in test setup to satisfy created_by_user_id FK in hakedis_periods

key-files:
  created:
    - src/actions/hakedis.ts
  modified:
    - tests/hakedis.test.ts

key-decisions:
  - "7 auth guards: const session = await auth() is the first statement of every exported function (T-10-02-EoP)"
  - "GROUP BY hp.id + all rate columns required in deduction query — Postgres requires non-aggregate columns referenced in SELECT to be in GROUP BY (auto-fix applied)"
  - "Test user seeded: users table INSERT with id='test-user-auth-id' required before createPeriod — hakedis_periods.created_by_user_id has FK to users.id (Rule 1 auto-fix)"
  - "previous_cumulative_qty comparison: DB returns numeric(12,3) as '0.000' not '0' — test assertion changed to Number() comparison (Rule 1 auto-fix)"
  - "crypto.randomUUID() used instead of uuid package — avoids TypeScript @types/uuid missing declaration error"

# Metrics
duration: ~90min
completed: 2026-05-28
---

# Phase 10 Plan 02: Hakkediş Server Actions + Tests Summary

**All 7 server actions implemented with money-in-Postgres (D-90), Istanbul-tz cutoff (D-100), finalized-only chaining (D-99), and immutability guards (D-95/D-96/D-97). 28 DB integration tests green across HAK-01..HAK-05.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-05-28T01:48:47Z
- **Completed:** 2026-05-28T10:53:35Z
- **Tasks:** 2
- **Files created/modified:** 2

## Accomplishments

- Created `src/actions/hakedis.ts` with 7 exported server actions, each with `const session = await auth()` as the first statement (T-10-02-EoP)
- `recomputePeriodLines`: Istanbul-tz inclusive cutoff `(period_end_date::date + interval '1 day') AT TIME ZONE 'Europe/Istanbul'`; DISTINCT ON previous-cumulative from most recent FINALIZED period (status != 'draft', D-99); DELETE+INSERT pattern; never writes GENERATED period_qty (D-104)
- `createPeriod`: IDOR guard verifies project belongs to tenant (CR-01); auto-suggests HK-{YYYY}-{NN} period number; calls recomputePeriodLines synchronously (D-98); logOfficeActivity hakedis_period_created
- `getPeriodsByProject`: per-period netByDisplay via correlated subquery using full D-90 deduction chain in Postgres numeric; returns null for periods with no lines
- `getPeriodDetail`: period header + ordered lines + full D-90 deduction chain (6 values + net in single GROUP BY query, COALESCE on nullable rates per Pitfall 5, CASE on stopaj_enabled); unpriced BOQ items for D-103 warning
- `finalizePeriod`: irreversible status lock (D-96); throws 'Period is not in draft status' for non-draft; logOfficeActivity hakedis_period_finalized
- `updatePaymentStatus`: VALID_TRANSITIONS record enforces finalized→submitted→paid; rejects draft→submitted and paid→anything
- `deletePeriod`: draft-only guard (D-97); cascade via FK ON DELETE CASCADE; logOfficeActivity hakedis_period_deleted
- Filled `tests/hakedis.test.ts` Wave 0 scaffold with 28 real DB integration tests covering all HAK-01..HAK-05 behaviors; all 28 green
- Full suite: 288/288 tests pass (no regressions in schema.test.ts or any other test file)

## Task Commits

1. **Tasks 1+2: computePeriodLines + all 7 actions + 28 tests** - `2015e5f`

## Files Created/Modified

- `src/actions/hakedis.ts` — New: 7 exported server actions implementing HAK-01..HAK-05 financial core
- `tests/hakedis.test.ts` — Modified: Wave 0 todos replaced with 28 real DB integration tests

## Decisions Made

- **GROUP BY required in deduction query:** Postgres requires all non-aggregate columns in SELECT to appear in GROUP BY. Added `GROUP BY hp.id, hp.kdv_rate, hp.tevkifat_fraction, hp.stopaj_enabled, hp.stopaj_rate, hp.retention_rate, hp.avans_kesintisi_rate` to the getPeriodDetail deduction query (Rule 1 auto-fix — bug caught by test runner).
- **User FK seed in tests:** `hakedis_periods.created_by_user_id` has FK to `users.id`. The auth mock returns `test-user-auth-id` which must exist in the `users` table. Added `INSERT INTO users ... ON CONFLICT DO NOTHING` in each test's setup block (Rule 1 auto-fix).
- **numeric(12,3) returns '0.000' not '0':** Postgres returns the default previous_cumulative_qty as '0.000' (full precision). Changed test assertion from `toBe('0')` to `Number(...) === 0` (Rule 1 auto-fix).
- **crypto.randomUUID() instead of uuid package:** The uuid package lacks `@types/uuid` in this project, causing TypeScript errors. Node 16+ natively provides `crypto.randomUUID()` — no new dependency needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GROUP BY missing in deduction query**
- **Found during:** Task 1 test run (getPeriodDetail tests)
- **Issue:** `hp.kdv_rate` and other rate columns referenced in SUM expressions without GROUP BY — Postgres error 42803 "must appear in GROUP BY clause"
- **Fix:** Added `GROUP BY hp.id, hp.kdv_rate, hp.tevkifat_fraction, hp.stopaj_enabled, hp.stopaj_rate, hp.retention_rate, hp.avans_kesintisi_rate` to the deduction SELECT in getPeriodDetail
- **Files modified:** `src/actions/hakedis.ts`
- **Commit:** 2015e5f

**2. [Rule 1 - Bug] Users table FK not seeded in tests**
- **Found during:** Task 1 test run (createPeriod tests)
- **Issue:** `hakedis_periods.created_by_user_id` FK to `users.id`; the auth mock returns `'test-user-auth-id'` which did not exist in the test DB, causing constraint violation
- **Fix:** Added `INSERT INTO users (id, email) VALUES ('test-user-auth-id', ...) ON CONFLICT DO NOTHING` to each test block's setup
- **Files modified:** `tests/hakedis.test.ts`
- **Commit:** 2015e5f

**3. [Rule 1 - Bug] numeric(12,3) returns '0.000' not '0'**
- **Found during:** Task 1 test run (previous_cumulative_qty assertion)
- **Issue:** Test asserted `previous_cumulative_qty === '0'` but Postgres returns full precision `'0.000'` for numeric(12,3) columns
- **Fix:** Changed assertion to `Number(lines.rows[0].previous_cumulative_qty) === 0`
- **Files modified:** `tests/hakedis.test.ts`
- **Commit:** 2015e5f

## Known Stubs

None — all exported functions compute real data from the database.

## Threat Flags

No new threat surface beyond what the threat model specified. All seven T-10-02-* threats were mitigated:
- T-10-02-EoP: 7 auth guards verified (one per exported fn)
- T-10-02-IDOR-P: tenant_id in 24 places; projectId IDOR guard in createPeriod
- T-10-02-IMM: status === 'draft' guard in recompute/finalize/delete
- T-10-02-FLOAT: all arithmetic stays in Postgres numeric; no JS float math
- T-10-02-SQLi: all values bound via Drizzle sql`` params
- T-10-02-XCUR: currency_code = period.currencyCode filter in aggregation
- T-10-02-NULL: COALESCE(tevkifat_fraction, 0) + COALESCE(stopaj_rate, 0) in all deduction queries

## Test Results

**DB Integration Tests (hakedis.test.ts):** 28/28 passed
**Full Suite:** 288/288 passed (no regressions)

---

## Self-Check: PASSED

- `src/actions/hakedis.ts` — FOUND (committed at 2015e5f)
- `tests/hakedis.test.ts` — FOUND (committed at 2015e5f)
- `10-02-SUMMARY.md` — FOUND
- Commit 2015e5f — FOUND in git log
- 28/28 hakedis tests pass
- 288/288 full suite passes
- 7 auth guards (one per exported function)
- No period_qty in INSERT statements
- COALESCE on nullable rates: confirmed
- Istanbul-tz cutoff: confirmed
- status != 'draft' previous-cumulative filter: confirmed
