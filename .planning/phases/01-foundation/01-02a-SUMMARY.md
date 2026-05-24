---
phase: 01-foundation
plan: "02a"
subsystem: schema
tags: [drizzle, postgis, schema, vitest, tdd]
dependency_graph:
  requires:
    - 01-01 (scaffold: Next.js 15.5.18, Drizzle client, Vitest harness)
  provides:
    - Complete Phase 1 Drizzle schema (11 tables) with exact contract column names
    - routes.geom as geometry(LineString,4326) via customType + GiST index
    - assignments with UNIQUE(personId,projectId,roleOnProject)
    - boq_items with plannedQty/approvedQty numeric(12,3), sort_order, commented unit_price
    - src/db/migrations/0000_enable_postgis.sql (CREATE EXTENSION IF NOT EXISTS postgis)
    - src/db/migrate.ts runner (PostGIS first, then drizzle migrate())
    - src/db/seed.ts (idempotent default tenant UUID)
    - src/lib/tenant.ts (getDefaultTenantId() with BAYRAK_TENANT_ID fallback)
    - src/lib/boq-balance.ts (remainingBalance() pure helper)
    - tests/schema.test.ts (pure + describeIfDb-gated tests, all green)
  affects:
    - 01-02b (live DB push consumes the generated migration + migrate.ts)
    - 01-03 (Auth.js config imports auth.ts table definitions)
    - 01-04 (Telegram /start webhook imports pendingPeople schema)
    - 01-05 (Server Actions import all domain tables)
    - 01-06 (GeoJSON upload imports routes schema)
tech_stack:
  added: []
  patterns:
    - Drizzle pgTable with customType for PostGIS geometry(LineString,4326)
    - Auth.js v5 exact adapter column names (do not rename)
    - Nullable tenant_id on every domain table (D-09 hedge for future multi-tenancy)
    - getDefaultTenantId() pattern — always supply tenant_id on insert (Pitfall 3)
    - remainingBalance() computed at read time — no maintained column needed
    - describeIfDb guard — DB-gated tests skip cleanly without TEST_DATABASE_URL
key_files:
  created:
    - src/db/schema/tenants.ts
    - src/db/schema/auth.ts
    - src/db/schema/projects.ts
    - src/db/schema/boq-items.ts
    - src/db/schema/routes.ts
    - src/db/schema/people.ts
    - src/db/schema/pending-people.ts
    - src/db/schema/assignments.ts
    - src/db/schema/index.ts
    - src/db/migrations/0000_enable_postgis.sql
    - src/db/migrations/0000_lame_silver_sable.sql
    - src/db/migrate.ts
    - src/db/seed.ts
    - src/lib/tenant.ts
    - src/lib/boq-balance.ts
    - tests/schema.test.ts
  modified: []
decisions:
  - "geometry(LineString,4326) generated correctly by customType without hand-edit (Pitfall 1 did not trigger — drizzle-kit 0.31.x honoured the dataType() string)"
  - "TDD RED/GREEN: test file committed first (e50117e), implementation committed second (e03f8be)"
  - "drizzle-kit generate produced migration 0000_lame_silver_sable.sql cleanly for all 11 tables"
  - "describeIfDb-gated DB tests skip cleanly without TEST_DATABASE_URL — 7 pure tests pass, 0 fail"
metrics:
  duration: "12 minutes"
  completed: "2026-05-24"
  tasks_completed: 1
  files_created: 16
---

# Phase 01 Plan 02a: Drizzle Schema Authoring + PostGIS Migration + Helpers Summary

**One-liner:** Complete Phase 1 Drizzle schema (11 tables) authored with exact contract column names, geometry(LineString,4326) customType, UNIQUE assignments, PostGIS-first migration runner, idempotent seed, tenant helper, and pure BOQ-balance helper — all verified by drizzle-kit generate + passing Vitest suite.

## What Was Built

### Task 1: Full schema + PostGIS migration + migrate runner + seed + helpers (TDD)

**Schema files (src/db/schema/):**

- `tenants.ts` — id/name/createdAt; seed row UUID `00000000-0000-0000-0000-000000000001`
- `auth.ts` — Auth.js v5 exact column names: users, accounts, sessions, verification_tokens
- `projects.ts` — tenant_id nullable (D-09), name, description, btree index on tenant_id
- `boq-items.ts` — plannedQty/approvedQty numeric(12,3), approvedQty default '0', sort_order, commented unit_price placeholder (D-06)
- `routes.ts` — geometry(LineString,4326) via customType + GiST index + hand-edit warning comment block
- `people.ts` — telegramUserId bigint unique, displayName, tenant_id nullable
- `pending-people.ts` — telegramUserId bigint unique, telegramName, startedAt
- `assignments.ts` — roleOnProject enum ['worker','auditor'] + UNIQUE(personId,projectId,roleOnProject) (D-03)
- `index.ts` — barrel export of all 8 schema files

**Migration artifacts:**

- `src/db/migrations/0000_enable_postgis.sql` — `CREATE EXTENSION IF NOT EXISTS postgis;`
- `src/db/migrations/0000_lame_silver_sable.sql` — drizzle-kit generated migration for all 11 tables; geometry(LineString,4326) correctly in generated SQL

**Runtime files:**

- `src/db/migrate.ts` — reads 0000_enable_postgis.sql via readFileSync, executes it before `migrate(db, ...)`
- `src/db/seed.ts` — inserts default tenant UUID `00000000-0000-0000-0000-000000000001` via onConflictDoNothing

**Helpers:**

- `src/lib/tenant.ts` — `getDefaultTenantId()` reads BAYRAK_TENANT_ID with fixed UUID fallback
- `src/lib/boq-balance.ts` — `remainingBalance(planned, approved): number` accepts string|number inputs

**Tests (tests/schema.test.ts):**

- `remainingBalance` — 5 pure unit tests (0, positive, string inputs, over-approval edge case) — all pass
- `getDefaultTenantId` — 2 pure unit tests (env unset returns fixed UUID; env set returns env value) — all pass
- assignments uniqueness — 2 describeIfDb-gated integration tests — skip cleanly without TEST_DATABASE_URL

## Commits

| Commit | Description |
|--------|-------------|
| e50117e | test(01-02a): add failing schema/balance/tenant tests (RED gate) |
| e03f8be | feat(01-02a): author full Drizzle schema + PostGIS migration + helpers (GREEN gate) |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

**Notable:** Pitfall 1 (geometry(point,4326) hand-edit) did NOT trigger. drizzle-kit 0.31.x with the `customType` returning `'geometry(LineString, 4326)'` generated the correct type directly in the SQL output. No manual edit was needed. The warning comment in routes.ts is retained for future regression protection.

## TDD Gate Compliance

- RED gate: `e50117e` — test(01-02a) committed with failing suite (import errors)
- GREEN gate: `e03f8be` — feat(01-02a) committed with all 7 pure tests passing
- REFACTOR: Not required — no cleanup needed

## Known Stubs

None — this plan creates schema and pure helpers only (no UI, no data-connected components).

## Threat Flags

None — all threat mitigations from the plan's threat model are implemented:

- T-02a-01: customType declares `geometry(LineString, 4326)` + hand-edit warning comment retained
- T-02a-02: getDefaultTenantId() helper returns fixed UUID; all app code should supply tenant_id on insert
- T-02a-03: GiST index declared on routes.geom (Phase 4 spatial queries index-backed)

## Self-Check: PASSED

All 15 required files exist (verified above).
Both commits (e50117e, e03f8be) present in git log.
`npx vitest run tests/schema.test.ts` → 7 passed, 0 failed, exit 0.
`drizzle-kit generate` → "No schema changes, nothing to migrate" (migration already captured).
