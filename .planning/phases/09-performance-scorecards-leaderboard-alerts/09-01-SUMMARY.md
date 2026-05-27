---
phase: 09-performance-scorecards-leaderboard-alerts
plan: "01"
subsystem: database-schema
tags: [schema, tenant-settings, test-scaffold, wave-0, drizzle, vitest]
dependency_graph:
  requires: []
  provides:
    - tenant_settings Drizzle table with D-84 Moderate defaults
    - tenantSettings export from '@/db/schema'
    - truncateAllTables phase9Tables graceful-degradation fallback
    - Wave-0 failing test blocks for PERF-01/02/05/06
  affects:
    - tests/analytics.test.ts (extended with 4 describe blocks)
    - src/db/schema/index.ts (barrel updated)
    - tests/fixtures/db.ts (truncate helper updated)
tech_stack:
  added: []
  patterns:
    - pgTable column shape from tenants.ts analog
    - numeric(5,4) with string-literal default '0.3000' (Pitfall 5 prevention)
    - unique() on tenantId for one-row-per-tenant enforcement
    - phase9Tables fallback set in truncateAllTables (graceful pre-migration degradation)
    - Wave-0 RED test scaffold pattern (describeIfDb + dynamic import)
key_files:
  created:
    - src/db/schema/tenant-settings.ts
  modified:
    - src/db/schema/index.ts
    - tests/fixtures/db.ts
    - tests/analytics.test.ts
decisions:
  - "Default '0.3000' is a string literal not a float — Pitfall 5 prevention; ensures numeric(5,4) precision is preserved in migration generation"
  - "tenant_settings truncated BEFORE tenants in helper (child FK ordering)"
  - "phase9Tables fallback set mirrors phase7Tables/phase3Tables pattern for graceful pre-migration test runs"
  - "Wave-0 tests use (metrics as Record<string, unknown>) cast so TypeScript does not error on fields not yet present in PersonMetrics type — tests remain valid RED scaffolds"
  - "getStalledProjects/getTenantSettings typed via double cast for clean import-time error when functions are not yet implemented"
metrics:
  duration: "8 minutes"
  completed: "2026-05-27"
  tasks_completed: 2
  files_modified: 4
---

# Phase 09 Plan 01: tenant_settings Schema + Wave-0 Test Scaffolds Summary

**One-liner:** Drizzle `tenant_settings` table with D-84 Moderate defaults (48h SLA, 30% rejection, 7d stalled) plus four failing Wave-0 test blocks covering PERF-01/02/05/06.

## What Was Built

### Task 1 — tenant_settings schema + barrel + truncate helper

`src/db/schema/tenant-settings.ts` defines the `tenantSettings` pgTable following the `tenants.ts` column shape. Key design points:

- `tenantId` is `uuid.notNull().references(() => tenants.id).unique()` — enforces one row per tenant (D-83, T-09-01-T mitigation)
- `rejectionRateThreshold` uses `numeric({ precision: 5, scale: 4 }).default('0.3000')` — string literal default prevents float precision loss (Pitfall 5)
- D-84 Moderate defaults: `auditSlaHours=48`, `rejectionRateThreshold='0.3000'`, `stalledDays=7`

`src/db/schema/index.ts` appended `export * from './tenant-settings'` after `hakedis-period-lines` (correct dependency order — tenant-settings references tenants only).

`tests/fixtures/db.ts` updated:
- `tenant_settings` added to the top of the `tables` array (before `tenants`, as FK child)
- `phase9Tables = ["tenant_settings"]` fallback set created and merged into `laterTables` — mirrors phase7Tables pattern so tests pass before migration 0007 lands in Plan 09-03

### Task 2 — Wave-0 failing test blocks

Four new test blocks appended to `tests/analytics.test.ts`:

1. **`PERF-01/02: getPersonMetrics enrichments`** (describeIfDb) — asserts `outputQuantitySum` equals `'10'` for a seeded approved submission; asserts `slaBreachRateDecided` returns `0.5` for 1 breach out of 2 decided; asserts `null` when no decided submissions (NULLIF denominator path). All RED until Plan 09-04.

2. **`PERF-06: getStalledProjects`** (describeIfDb) — asserts stalled project appears when last approval is 30 days old (> 7-day threshold); asserts active project excluded when recent approval exists; asserts empty project (no submissions) excluded. RED until Plan 09-04.

3. **`PERF-06: getTenantSettings / updateTenantSettings`** (describeIfDb) — asserts D-84 defaults returned from seeded row; asserts upsert persists new values; asserts auth guard throws `'Unauthorized'`; asserts zod rejects `auditSlaHours=0` and `auditSlaHours=9999`. RED until Plan 09-04.

4. **`PERF-05: leaderboard sort`** (plain describe — no DB) — asserts `getWorkerSortFn()` sorts workers by `submissionsApproved` DESC; asserts `getAuditorSortFn()` sorts auditors by `avgDecisionLatencyHours` ASC (faster=better); asserts ties broken by `displayName` alphabetically. RED until Plan 09-05.

## Deviations from Plan

None — plan executed exactly as written. The Wave-0 tests use TypeScript double-cast pattern (`as Record<string, unknown> as { functionName: ... }`) for clean compile-time failures when functions are not yet exported, matching the RED scaffold intent.

## Known Stubs

None — this plan creates schema and test contracts only. No UI or data flow stubs exist.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what the plan's threat model already covers. T-09-01-T (unique constraint on tenant_id) is implemented in the schema file. T-09-01-I (tenant scope enforcement) is scaffolded in the test blocks that will validate the WHERE tenant_id filter when Plan 09-04 implements the functions.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 4ea8019 | feat(09-01): author tenant_settings schema + barrel + truncate helper |
| 2 | 54be7eb | test(09-01): add Wave-0 failing test scaffolds for Phase-9 behaviors |

## Self-Check

- [x] `src/db/schema/tenant-settings.ts` — created
- [x] `src/db/schema/index.ts` — updated with barrel export
- [x] `tests/fixtures/db.ts` — updated with phase9Tables fallback
- [x] `tests/analytics.test.ts` — extended with 4 Wave-0 blocks
- [x] TypeScript check passes (npx tsc --noEmit — 0 errors on these files)
- [x] Acceptance criteria verified: pgTable, rejectionRateThreshold, unique(), barrel, truncate helper
- [x] Test scaffold confirmed: all 4 describe blocks present in test output
- [x] No drizzle-kit push run (constraint respected per D-49)
