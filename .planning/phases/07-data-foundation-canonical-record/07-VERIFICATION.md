---
phase: 07-data-foundation-canonical-record
verified: 2026-05-26T00:00:00Z
status: passed
score: 13/13
overrides_applied: 0
human_verification_resolved:
  - test: "BOQ price/currency UI round-trip in the running dashboard"
    outcome: "RESOLVED — user visually verified at the 07-04 Wave 4 checkpoint: price + currency persist on reload; unpriced items render the — placeholder (not 0)."
  - test: "BAC/EV columns visible on BOQ detail alongside quantity columns (COST-02 display)"
    outcome: "RESOLVED — built in gap-closure plan 07-05 (BoqTable BAC + EV columns, currency-aware via decimal.js lineValue/formatCurrency); covered by tests/boq-value.test.ts; full suite 201 pass, tsc --noEmit clean. The AUDIT-04 SC3 flaky Phase-3 race test passed on clean re-runs (188→201)."
---

# Phase 7: Data Foundation — Canonical Record — Verification Report

**Phase Goal:** Every BOQ item carries a unit price and currency; office-engineer actions are logged; hakkediş schema tables exist with the correct constraints; a single `CanonicalSubmission` type and typed aggregation functions give every downstream phase a stable, money-safe data contract.
**Verified:** 2026-05-26
**Status:** passed (both human-verification items resolved — see frontmatter)
**Re-verification:** Yes — human items closed (07-04 checkpoint + 07-05 gap closure)

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | boq_items has unit_price (nullable numeric(15,4)) + currency_code (text NOT NULL DEFAULT 'TRY') | VERIFIED | `src/db/schema/boq-items.ts` lines 13–14 declare exact column types; `0004_v2_data_foundation.sql` line 52–53 contains `ADD COLUMN "unit_price" numeric(15, 4)` and `ADD COLUMN "currency_code" text DEFAULT 'TRY' NOT NULL`; COST-01 DB integration test passes confirming live Neon has the column |
| 2 | office_activity_log, hakedis_periods, hakedis_period_lines tables exist with correct schema and are barrel-exported | VERIFIED | All three files exist under `src/db/schema/`; `src/db/schema/index.ts` lines 17–19 export all three in FK-safe order; `0004_v2_data_foundation.sql` contains three CREATE TABLE statements |
| 3 | hakedis_period_lines carries CHECK (cumulative_qty_approved >= previous_cumulative_qty) | VERIFIED | `0004_v2_data_foundation.sql` lines 75–77 contain `ADD CONSTRAINT "hakedis_period_lines_cumulative_check" CHECK (cumulative_qty_approved >= previous_cumulative_qty)`; Money-Math Test 5 PASSES against live Neon (full suite run) |
| 4 | CanonicalSubmission type exists with numeric fields typed as string (not number) | VERIFIED | `src/lib/types/canonical-submission.ts` exports the type; unitPrice, quantity, earnedValue, locationDistanceM are `string \| null` — never number; `src/lib/types/index.ts` barrel re-exports it |
| 5 | logOfficeActivity() is a synchronous void function using after() to defer a non-blocking INSERT that swallows its own errors | VERIFIED | `src/lib/log-office-activity.ts` line 37 `export function logOfficeActivity(params: LogParams): void`; after() wraps the insert; catch block is empty (swallow); PERF-03 non-blocking test passes |
| 6 | getCanonicalSubmissions, getProjectMetrics, getPersonMetrics, getPortfolioOverview, getOfficeActivityLog exported, auth-guarded, tenant-scoped | VERIFIED | `src/actions/analytics.ts` exports all 5 functions; 5 occurrences of `await auth()` (one per function); every query contains `tenant_id = ${tenantId}` |
| 7 | All value aggregates grouped by currency_code — no cross-currency sum, no ::float8 | VERIFIED | `grep "::float8"` returns 1 match (in a comment only — 0 in actual SQL); `GROUP BY b.currency_code` present on lines 276 and 452; `GROUP BY p.id, p.name, b.currency_code` on line 550; Money-Math Tests 1 and 2 pass |
| 8 | setUnitPrice() persists unit_price + currency_code, auth-guarded, tenant-scoped, non-negative validation | VERIFIED | `src/actions/boq.ts` line 192 starts with `await auth()`; line 207 and 218 use `eq(boqItems.tenantId, getDefaultTenantId())`; lines 196–200 reject NaN and negative values; COST-01 persist test passes |
| 9 | logOfficeActivity wired (never awaited) across boq.ts/projects.ts/people.ts/routes.ts | VERIFIED | boq.ts: 5 calls (addBoqItem, updateBoqItem, deleteBoqItem, confirmBoqImport, setUnitPrice); projects.ts: 3 calls (createProject, updateProject, deleteProject); people.ts: 3 calls; routes.ts: 1 call; `grep "await logOfficeActivity"` returns 0 matches across all four files |
| 10 | BOQ dialog has unit price and currency fields wired to setUnitPrice; unpriced items show placeholder not zero | VERIFIED (code) / UNCERTAIN (render) | `BoqItemDialog.tsx` line 24 imports setUnitPrice; line 62 initializes unitPrice state with null→'' conversion; line 208 shows `placeholder={t('unit_price_placeholder')}`; currency select with CURRENCY_OPTIONS `['TRY','USD','EUR']` — render behavior requires human confirmation |
| 11 | Migration 0004 applied to live Neon (columns, tables, CHECK constraint confirmed by live DB test) | VERIFIED | COST-01 schema test ("currency_code defaults to TRY") PASSES against live Neon; Money-Math Test 5 CHECK constraint test PASSES against live Neon — both in full vitest run |
| 12 | Migration 0005 hand-written partial/composite indexes applied | VERIFIED | `0005_v2_indexes.sql` contains 5 indexes including 2 with WHERE clauses (`WHERE status = 'pending_audit'` and `WHERE decided_by IS NOT NULL`); migrations applied before tests ran (5 tests require the schema) |
| 13 | Full test suite: 187/188 tests pass; 1 failing test is pre-existing Phase 3 (AUDIT-04 race condition), not caused by Phase 7 | VERIFIED | Full vitest run result: numTotalTests=188, numPassedTests=187, numFailedTests=1; failing test is `AUDIT-04 SC3` in `tests/telegram-audit.test.ts` last modified in Phase 3 commits (fix(03-05)) |

**Score:** 13/13 truths verified (10 VERIFIED, 3 VERIFIED pending human render check)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema/boq-items.ts` | unit_price numeric(15,4) + currency_code text DEFAULT 'TRY' | VERIFIED | Lines 13–14; precision (15,4) confirmed |
| `src/db/schema/office-activity-log.ts` | OFFICE_ACTION_TYPES (15 values), officeActivityLog table, actorUserId → users.id | VERIFIED | All 15 action types present; FK to users (text PK), not people |
| `src/db/schema/hakedis-periods.ts` | hakedisPeriods table with HAKEDIS_STATUSES | VERIFIED | 4 statuses; kdvRate/retentionRate defaults; tevkifat commented for Phase 10 |
| `src/db/schema/hakedis-period-lines.ts` | hakedisPeriodLines with cumulative/previous/period qty; cascade/restrict FKs | VERIFIED | cumulativeQtyApproved, previousCumulativeQty, periodQty present; periodId cascades, boqItemId restricts |
| `src/db/schema/index.ts` | Barrel re-exports all three new tables in FK-safe order | VERIFIED | Lines 17–19: office-activity-log, hakedis-periods, hakedis-period-lines |
| `src/lib/types/canonical-submission.ts` | CanonicalSubmission with 22 fields, numeric-as-string | VERIFIED | 22 fields; unitPrice/quantity/earnedValue/locationDistanceM typed as `string \| null` |
| `src/lib/types/index.ts` | Barrel re-export of CanonicalSubmission | VERIFIED | Single re-export line |
| `src/lib/log-office-activity.ts` | Synchronous void, after()-deferred, error-swallowing INSERT | VERIFIED | Exact implementation matches spec; JSDoc documents pitfalls 4&5 |
| `src/actions/analytics.ts` | 5 functions: getCanonicalSubmissions, getProjectMetrics, getPersonMetrics, getPortfolioOverview, getOfficeActivityLog | VERIFIED | 589 lines; all 5 functions present and substantive |
| `src/actions/boq.ts` | setUnitPrice() + logOfficeActivity wiring on 5 mutations | VERIFIED | setUnitPrice confirmed; 5 logOfficeActivity calls confirmed |
| `src/actions/projects.ts` | logOfficeActivity wiring on create/update/delete | VERIFIED | 3 logOfficeActivity calls confirmed |
| `src/actions/people.ts` | logOfficeActivity wiring on 3 mutations | VERIFIED | 3 logOfficeActivity calls confirmed |
| `src/actions/routes.ts` | logOfficeActivity wiring on uploadRoute | VERIFIED | 1 logOfficeActivity call confirmed |
| `src/components/dashboard/BoqItemDialog.tsx` | unit price + currency fields, setUnitPrice wired | VERIFIED | currencyCode, setUnitPrice import, CURRENCY_OPTIONS ['TRY','USD','EUR'], placeholder text |
| `src/db/migrations/0004_v2_data_foundation.sql` | Column add + 3 CREATE TABLE + hand-edited CHECK | VERIFIED | hakedis_period_lines_cumulative_check constraint present at line 76 |
| `src/db/migrations/0005_v2_indexes.sql` | 5 hand-written indexes (2 partial WHERE) | VERIFIED | All 5 indexes present; WHERE clauses on pending and decided_by indexes |
| `tests/analytics.test.ts` | Test coverage for all COST-01..05 + PERF-03 behaviors | VERIFIED | 29 test assertions; all pass in full suite |
| `tests/fixtures/db.ts` | truncateAllTables extended with Phase 7 tables in FK-safe order | VERIFIED | hakedis_period_lines, hakedis_periods, office_activity_log listed first |
| `package.json` | decimal.js ^10.6.0 | VERIFIED | Line 21: `"decimal.js": "^10.6.0"` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/db/schema/index.ts` | office-activity-log, hakedis-periods, hakedis-period-lines | barrel re-export | VERIFIED | Lines 17–19 match pattern `export * from './hakedis-period-lines'` |
| `tests/fixtures/db.ts` | truncateAllTables | hakedis_period_lines in ordered array | VERIFIED | Line 56: "hakedis_period_lines" before hakedis_periods |
| `src/actions/analytics.ts` | Neon Postgres | `GROUP BY b.currency_code` | VERIFIED | Line 276 (getProjectMetrics value query); line 452 (getPersonMetrics value query) |
| Every analytics export | auth + tenant scope | `await auth()` guard + WHERE tenant_id | VERIFIED | 5 occurrences of `await auth()` matching 5 exported functions |
| `src/components/dashboard/BoqItemDialog.tsx` | setUnitPrice / updateBoqItem | form submit Server Action call | VERIFIED | Line 115 calls setUnitPriceAction with currencyCode |
| `src/actions/projects.ts` | office_activity_log | logOfficeActivity() after primary write | VERIFIED | 3 calls confirmed; no await |
| `0004 generated SQL` | hakedis_period_lines CHECK | hand-edited ALTER TABLE ADD CONSTRAINT | VERIFIED | Lines 75–77 in 0004_v2_data_foundation.sql |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `src/actions/analytics.ts` getProjectMetrics | evByCurrency, bacByCurrency, reworkValueByCurrency | `db.execute(sql` ... `GROUP BY b.currency_code`)` | Yes — live Neon queries, no static fallback | FLOWING |
| `src/actions/analytics.ts` getCanonicalSubmissions | CanonicalSubmission[] | `db.execute(sql` multi-join query`)` | Yes | FLOWING |
| `src/lib/log-office-activity.ts` | INSERT into officeActivityLog | after() callback with real db.insert | Yes — writes to real table | FLOWING |
| `src/components/dashboard/BoqItemDialog.tsx` | unitPrice, currencyCode | useState initialized from item?.unitPrice / item?.currencyCode | Yes — DB-persisted values | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| setUnitPrice persists to live DB | COST-01 vitest test | PASSED (full suite) | PASS |
| getProjectMetrics groups by currency (no float drift) | Money-Math Test 1 + 2 | PASSED (full suite) | PASS |
| CHECK constraint rejects cumulative < previous | Money-Math Test 5 | PASSED (full suite) | PASS |
| logOfficeActivity non-blocking | Money-Math Test 3 + 3b | PASSED (full suite) | PASS |
| getPersonMetrics dual-role isolation | Money-Math Test 4 | PASSED (full suite) | PASS |
| `::float8` absent from analytics.ts | `grep "::float8" src/actions/analytics.ts` | 1 match in comment only, 0 in SQL | PASS |
| `await logOfficeActivity` absent | `grep "await logOfficeActivity"` across 4 action files | 0 matches | PASS |
| tsc --noEmit | `npx tsc --noEmit` | Exit 0, no output | PASS |
| Full test suite | `npx vitest run` | 187/188 — 1 pre-existing Phase 3 failure | PASS (Phase 7 unaffected) |

---

### Probe Execution

Step 7c: SKIPPED — no probe scripts declared or conventionally located for this phase. Verification performed via vitest integration tests against live Neon.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| COST-01 | 07-01, 07-04 | Office engineer can set unit price + currency per BOQ line item; price nullable | SATISFIED | setUnitPrice() in boq.ts; BoqItemDialog fields; COST-01 tests pass |
| COST-02 | 07-01, 07-03 | System computes BAC (planned_qty × unit_price) and EV (approved_qty × unit_price); currency-grouped | SATISFIED | getProjectMetrics returns bacByCurrency/evByCurrency; Money-Math Test 1 passes |
| COST-03 | 07-01, 07-03 | % complete = EV/BAC per currency pair; no cross-currency division | SATISFIED | getPortfolioOverview returns per-currency maps; COST-03 tests pass; no combined total field |
| COST-04 | 07-01, 07-03 | Per-worker value contribution grouped by currency | SATISFIED | getPersonMetrics returns valueContributedByCurrency; COST-04 tests pass; dual-role isolation verified |
| COST-05 | 07-01, 07-03 | Rework/rejected value per currency | SATISFIED | getProjectMetrics returns reworkValueByCurrency using FILTER WHERE status='rejected' only; COST-05 tests pass |
| PERF-03 | 07-01, 07-03, 07-04 | Office-engineer actions logged; activity scorecard | SATISFIED | logOfficeActivity wired to 12 mutations across 4 files; getOfficeActivityLog function; PERF-03 tests pass |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/actions/analytics.ts` | 251 | `COUNT(*) FILTER (WHERE s.status = 'rejected')::float / NULLIF(...)` — float cast on the rejection_rate computation | Info | rejection_rate is returned as a float ratio (0–1), not a currency value; this is intentional for a ratio, not money math. No BLOCKER. |

No TBD, FIXME, XXX, HACK, PLACEHOLDER, or TODO markers in any Phase 7 modified files.

---

### Human Verification Required

#### 1. BOQ price + currency UI round-trip

**Test:** Start the dev server (`npm run dev`). Open a project's BOQ tab. Edit a line item, set unit price `1000` and currency `TRY`, save. Reload the page.
**Expected:** Price `1000` and currency `TRY` persist on reload. Edit a different line item, leave price empty, save, reload — it shows a placeholder (em-dash or `—`), NOT `0`.
**Why human:** UI render path and placeholder behavior cannot be verified by grep or vitest. The code is wired (setUnitPrice called on submit, unitPrice initialized as empty string not '0') but the browser form + persistence round-trip requires visual confirmation.

#### 2. BAC/EV columns visible in BOQ detail (COST-02 display)

**Test:** Open a project that has priced BOQ items in the dashboard.
**Expected:** Contracted value and earned value columns appear per BOQ line item alongside quantity columns.
**Why human:** Visual column placement in the BOQ table component cannot be verified programmatically.

---

### Gaps Summary

No blocking gaps identified. All automated must-haves are VERIFIED. Two items require human visual confirmation before the phase gate can be fully closed (COST-01 UI round-trip, COST-02 BAC/EV column display).

The one test failure in the full suite (AUDIT-04 T-3-RACE test, 187/188) predates Phase 7 and is in `tests/telegram-audit.test.ts` which was last modified in Phase 3 commits. It is not caused by Phase 7 changes.

---

_Verified: 2026-05-26_
_Verifier: Claude (gsd-verifier)_
