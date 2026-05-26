---
phase: 07-data-foundation-canonical-record
plan: "01"
subsystem: schema
tags: [schema, types, tests, decimal.js, boq, hakedis, activity-log]
dependency_graph:
  requires: []
  provides:
    - decimal.js installed and importable
    - boq_items.unit_price numeric(15,4) nullable
    - boq_items.currency_code text NOT NULL DEFAULT 'TRY'
    - office_activity_log table schema + OFFICE_ACTION_TYPES + OfficeActionType
    - hakedis_periods table schema + HAKEDIS_STATUSES + HakedisStatus
    - hakedis_period_lines table schema with cumulative/previous/period qty columns
    - CanonicalSubmission type with money-safe string fields
    - src/lib/types barrel
    - Wave 0 test stubs for COST-01..05 + PERF-03
  affects:
    - Plan 07-02 (drizzle-kit generate reads new schema files)
    - Plan 07-03 (analytics implementation builds against CanonicalSubmission + function signatures)
    - Plan 07-04 (logOfficeActivity wiring builds against office_activity_log schema)
tech_stack:
  added:
    - decimal.js@^10.6.0 (JS-side money display, prevents float drift on numeric strings)
  patterns:
    - OFFICE_ACTION_TYPES as const tuple (text not pg enum — new values require no migration)
    - CanonicalSubmission money fields typed as string (Drizzle numeric behavior, decimal.js boundary)
    - truncateAllTables phase-aware fallback (42P01 progressive retry by migration phase)
key_files:
  created:
    - src/db/schema/office-activity-log.ts
    - src/db/schema/hakedis-periods.ts
    - src/db/schema/hakedis-period-lines.ts
    - src/lib/types/canonical-submission.ts
    - src/lib/types/index.ts
    - tests/analytics.test.ts
  modified:
    - src/db/schema/boq-items.ts (D-06 comment → real unitPrice + currencyCode columns)
    - src/db/schema/index.ts (3 new barrel exports)
    - tests/fixtures/db.ts (Phase 7 truncation order + extended 42P01 fallback)
    - tests/schema.test.ts (3 new Phase 7 describeIfDb blocks)
    - package.json (decimal.js added)
decisions:
  - "decimal.js 10.6.0 installed — pre-approved in RESEARCH Package Legitimacy Audit (11yr-old package, Mike McFadyen, no postinstall)"
  - "OFFICE_ACTION_TYPES as text not pg enum — adding new action types requires no schema migration"
  - "CanonicalSubmission money fields (unitPrice, quantity, earnedValue, locationDistanceM) typed as string — forces callers to use decimal.js explicitly, prevents silent float coercion"
  - "periodStartDate nullable in hakedis_periods — Open Question 3: informational only; periodEndDate required"
  - "truncateAllTables 42P01 fallback extended: Phase 7 tables filtered together with Phase 3 tables, allowing tests to run against DB with only 0000-0003 migrations applied"
metrics:
  duration: "5 minutes"
  completed: "2026-05-26"
  tasks_completed: 3
  files_changed: 10
---

# Phase 07 Plan 01: Data Foundation Schema + Type Contracts Summary

**One-liner:** decimal.js installed; boq_items extended with unit_price+currency_code; three new Phase 7 schema tables (office_activity_log, hakedis_periods, hakedis_period_lines); CanonicalSubmission money-safe type; Wave 0 test stubs for all COST-01..05 + PERF-03 behaviors.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install decimal.js + schema files | 8f7b897 | package.json, boq-items.ts, office-activity-log.ts, hakedis-periods.ts, hakedis-period-lines.ts |
| 2 | Schema barrel + CanonicalSubmission type | 1a3d12f | schema/index.ts, lib/types/canonical-submission.ts, lib/types/index.ts |
| 3 | Truncation order + Wave 0 test stubs | 0853ac4 | tests/fixtures/db.ts, tests/analytics.test.ts, tests/schema.test.ts |

## Verification

- `npx tsc --noEmit` — clean, no errors in any of the four schema files or the two type files
- `npx vitest run tests/analytics.test.ts tests/schema.test.ts` — PASS (9) FAIL (0)
- `node -e "require('decimal.js')"` — succeeds; package.json lists `"decimal.js": "^10.6.0"`

## Schema Changes Summary

### boq_items (modified)
Replaced D-06 comment block with two real columns:
- `unitPrice: numeric('unit_price', { precision: 15, scale: 4 })` — NULLABLE (v1 rows have no price)
- `currencyCode: text('currency_code').notNull().default('TRY')` — ISO-4217, TRY default for backward compat

### office_activity_log (new)
15-value `OFFICE_ACTION_TYPES` tuple, `OfficeActionType` union, `officeActivityLog` table with:
- `actorUserId` → `users.id` (text FK — Auth.js, NOT people.id; critical Pitfall 3 guard)
- 4 indexes: actor, project, actionType, occurredAt
- KVKK 90-day retention comment (cleanup deferred)

### hakedis_periods (new)
`HAKEDIS_STATUSES` + `HakedisStatus`; table with `kdvRate` (0.2000), `retentionRate` (0.0500) defaults;
tevkifatFraction commented as Phase 10 only; `periodStartDate` NULLABLE per Open Question 3.

### hakedis_period_lines (new)
Snapshot + quantity + value columns; `periodId` cascade, `boqItemId` restrict FKs;
`CHECK (cumulative_qty_approved >= previous_cumulative_qty)` noted in comment — hand-added in Plan 02 migration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Extended 42P01 fallback to cover Phase 7 tables**
- **Found during:** Task 3 — existing schema tests (assignments uniqueness) failed after Phase 7 tables were added to the truncation list
- **Issue:** The existing 42P01 fallback in `truncateAllTables` only filtered out `audit_notifications`. Adding Phase 7 tables to the list caused the same fallback path to fail because those tables don't exist in the test DB until Plan 02's migration runs
- **Fix:** Expanded the fallback to filter all "later phase" tables (Phase 7: hakedis_period_lines, hakedis_periods, office_activity_log; Phase 3: audit_notifications) into a single `laterTables` Set, then retries with only the pre-Phase-3/7 tables
- **Files modified:** tests/fixtures/db.ts
- **Commit:** 0853ac4

## Known Stubs

All stubs are intentional Wave 0 stubs. None prevent plan goals from being achieved — they define the behavior contracts for Plans 03 and 04 to implement against.

| File | Stub | Reason |
|------|------|--------|
| tests/analytics.test.ts | 20 `it.todo` stubs | Wave 0 — implementation in Plan 03 (analytics functions) |
| tests/schema.test.ts | 7 `it.todo` stubs (Phase 7 blocks) | Wave 0 — requires 0004 migration from Plan 02 |

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundary changes introduced in this plan. Schema files define table contracts only — no DDL executed (migration is Plan 02). No threat flags.

## Self-Check: PASSED
