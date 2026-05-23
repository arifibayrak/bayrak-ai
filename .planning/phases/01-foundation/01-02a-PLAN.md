---
phase: 01-foundation
plan: 02a
type: execute
wave: 2
depends_on: ["01-01"]
files_modified:
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
  - src/db/migrate.ts
  - src/db/seed.ts
  - src/lib/tenant.ts
  - src/lib/boq-balance.ts
  - tests/schema.test.ts
autonomous: true
requirements: [SETUP-01, SETUP-02, SETUP-04, AUTH-01, AUTH-02, AUTH-03, AUTH-04]

must_haves:
  truths:
    - "All Phase 1 Drizzle tables are authored with the contract column names downstream plans import: tenants, users, accounts, sessions, verification_tokens, projects, boq_items, routes, people, pending_people, assignments"
    - "The routes.geom column is declared as geometry(LineString,4326) via a customType, NOT geometry(Point,4326)"
    - "assignments enforces role_on_project ('worker'|'auditor') unique per person+project+role"
    - "boq_items exposes plannedQty + approvedQty as numeric(12,3) with approvedQty default '0' and a sortOrder column"
    - "remainingBalance(planned, approved) returns planned − approved (SETUP-04) and is unit-tested without a DB"
    - "getDefaultTenantId() returns the fixed seed tenant UUID 00000000-0000-0000-0000-000000000001"
    - "D-06: boq_items carries material/unit/contracted-qty plus a maintained remaining balance, with a commented-out nullable unit_price placeholder (unit_price omitted in v1, addable later)"
    - "D-09: every domain table carries a nullable tenant_id referencing tenants.id, with a single seeded default tenant for v1 and no tenant-switching UI"
  artifacts:
    - path: "src/db/schema/index.ts"
      provides: "Barrel export of all Drizzle tables consumed across the app"
      contains: "export"
    - path: "src/db/migrations/0000_enable_postgis.sql"
      provides: "CREATE EXTENSION IF NOT EXISTS postgis as the first migration statement"
      contains: "CREATE EXTENSION IF NOT EXISTS postgis"
    - path: "src/db/schema/routes.ts"
      provides: "routes table with geometry(LineString,4326) geom column + GiST index"
      contains: "LineString"
    - path: "src/db/schema/assignments.ts"
      provides: "person<->project join carrying role_on_project (D-03)"
      contains: "roleOnProject"
    - path: "src/db/migrate.ts"
      provides: "Migration runner that applies PostGIS SQL before Drizzle migrations"
      contains: "postgis"
    - path: "src/lib/tenant.ts"
      provides: "getDefaultTenantId() helper reading BAYRAK_TENANT_ID with hardcoded fallback"
      contains: "getDefaultTenantId"
    - path: "src/lib/boq-balance.ts"
      provides: "remainingBalance(planned, approved) pure helper (SETUP-04)"
      contains: "remainingBalance"
  key_links:
    - from: "src/db/migrate.ts"
      to: "src/db/migrations/0000_enable_postgis.sql"
      via: "readFileSync + raw sql execution before migrate()"
      pattern: "0000_enable_postgis"
    - from: "src/db/schema/assignments.ts"
      to: "src/db/schema/people.ts"
      via: "personId foreign key"
      pattern: "people.id"
    - from: "src/lib/tenant.ts"
      to: "process.env.BAYRAK_TENANT_ID"
      via: "env read with hardcoded fallback UUID"
      pattern: "BAYRAK_TENANT_ID"
---

<objective>
Author the complete Phase 1 Drizzle schema (all domain tables + the Auth.js adapter tables), the PostGIS-extension-first migration (0000), the migration runner, the seed-tenant script, the tenant helper, and the pure BOQ-balance helper — so every downstream plan has the exact table/column contracts and library helpers it imports.

Purpose: This is the schema-authoring half of the data foundation (split from the live push, which is plan 01-02b). Authoring is fully autonomous and verifiable without a live database — type checks + `drizzle-kit generate` + pure unit tests prove the schema is well-formed. The live push (a false-positive-prone, DB-writing checkpoint) is isolated into 01-02b so this plan can run and be reviewed without blocking on a provisioned Neon connection string. Plans 01-03 and 01-04 depend on the schema being AUTHORED here.
Output: All 8 schema files + index barrel, the PostGIS 0000 migration, migrate.ts, seed.ts, tenant.ts, boq-balance.ts, and a passing schema.test.ts (pure balance + describeIfDb-gated assignment uniqueness). `npx drizzle-kit generate` produces a migration without error.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-foundation/01-RESEARCH.md
@.planning/phases/01-foundation/01-VALIDATION.md
@.planning/phases/01-foundation/01-CONTEXT.md

<interfaces>
<!-- The exact Drizzle table definitions are specified in RESEARCH.md § "Schema: Complete Phase 1 Drizzle Definitions" (Pattern 1 PostGIS migration, Pattern 2 full schema). The executor must implement them verbatim (table/column names are the contract for plans 01-02b through 01-06). Key contracts: -->
<!-- boqItems: { id, tenantId(nullable), projectId, material, unit, plannedQty numeric(12,3), approvedQty numeric(12,3) default '0', sortOrder, createdAt } -->
<!-- people: { id, tenantId, telegramUserId bigint unique, telegramName, displayName, createdAt } -->
<!-- pendingPeople: { id, tenantId, telegramUserId bigint unique, telegramName, startedAt } -->
<!-- assignments: { id, tenantId, personId, projectId, roleOnProject enum['worker','auditor'], assignedAt } UNIQUE(personId,projectId,roleOnProject) -->
<!-- routes: { id, tenantId, projectId unique, geom geometry(LineString,4326), coordinateCount, uploadedAt } + GiST index on geom -->
<!-- auth tables (users/accounts/sessions/verification_tokens): EXACT column names from @auth/drizzle-adapter — do not rename -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Author the full Drizzle schema + PostGIS migration 0000 + migrate runner + seed + tenant helper + balance helper</name>
  <read_first>
    - .planning/phases/01-foundation/01-RESEARCH.md § "Schema: Complete Phase 1 Drizzle Definitions" (Pattern 1 PostGIS migration, Pattern 2 full schema — implement table/column names verbatim)
    - .planning/phases/01-foundation/01-RESEARCH.md § "Common Pitfalls" Pitfall 1 (LineString hand-edit), Pitfall 3 (tenant_id always supplied), Pitfall 6 (PostGIS before migrations)
    - .planning/phases/01-foundation/01-RESEARCH.md § "Open Questions (RESOLVED)" #2 (seed tenant UUID hardcoded in the PostGIS/first migration path; getDefaultTenantId returns it)
    - .planning/phases/01-foundation/01-CONTEXT.md D-06, D-08, D-09, D-10 (BOQ fields, LineString store, nullable tenant_id, PostGIS-first + GiST)
    - src/db/index.ts (the Drizzle client created in plan 01-01)
  </read_first>
  <behavior>
    - Schema test: `assignments` enforces UNIQUE(personId, projectId, roleOnProject); the same person can hold role 'worker' on project A and 'auditor' on project B (two distinct rows accepted).
    - Schema test: `boqItems` exposes plannedQty and approvedQty as numeric(12,3); approvedQty defaults to '0'.
    - Schema test (pure, no DB): a `remainingBalance(plannedQty, approvedQty)` helper returns plannedQty − approvedQty correctly at 0 and at positive values (SETUP-04).
    - Schema test (pure, no DB): `getDefaultTenantId()` returns the fixed UUID 00000000-0000-0000-0000-000000000001 when BAYRAK_TENANT_ID is unset.
  </behavior>
  <files>src/db/schema/tenants.ts, src/db/schema/auth.ts, src/db/schema/projects.ts, src/db/schema/boq-items.ts, src/db/schema/routes.ts, src/db/schema/people.ts, src/db/schema/pending-people.ts, src/db/schema/assignments.ts, src/db/schema/index.ts, src/db/migrations/0000_enable_postgis.sql, src/db/migrate.ts, src/db/seed.ts, src/lib/tenant.ts, src/lib/boq-balance.ts, tests/schema.test.ts</files>
  <action>
    Create each schema file per RESEARCH Pattern 2 with the EXACT table/column names (they are the contract for downstream plans). Tables: tenants, projects, boq_items, routes, people, pending_people, assignments, and the Auth.js set (users, accounts, sessions, verification_tokens). Every domain table carries a nullable `tenant_id` referencing tenants.id (D-09). Add GiST index on routes.geom and the documented btree indexes.
    routes.ts: declare the geom column via a `customType` returning `geometry(LineString, 4326)`; add the block comment from RESEARCH warning that the generated SQL must be hand-edited from point→LineString (that edit happens in plan 01-02b).
    boq_items.ts: include the commented-out nullable `unit_price` placeholder (D-06) and the `sort_order` column for import row order. Create `src/lib/boq-balance.ts` exporting `remainingBalance(planned: string|number, approved: string|number): number` (SETUP-04).
    src/db/schema/index.ts: barrel-export every table.
    src/db/migrations/0000_enable_postgis.sql: single statement `CREATE EXTENSION IF NOT EXISTS postgis;` with the documenting comment.
    src/db/migrate.ts: per RESEARCH — read+execute 0000_enable_postgis.sql FIRST, then `migrate(db, { migrationsFolder: 'src/db/migrations' })`.
    src/db/seed.ts: insert the default tenant with fixed UUID 00000000-0000-0000-0000-000000000001 (idempotent via onConflictDoNothing) — per RESEARCH Open Questions (RESOLVED) #2.
    src/lib/tenant.ts: export `getDefaultTenantId()` reading `process.env.BAYRAK_TENANT_ID` with the hardcoded fallback UUID 00000000-0000-0000-0000-000000000001 (Pitfall 3 — app code always supplies tenant_id).
    Write tests/schema.test.ts covering the <behavior> assertions (the pure remainingBalance + getDefaultTenantId cases run without a DB; the assignment uniqueness test uses describeIfDb from tests/fixtures/db.ts so it skips cleanly without TEST_DATABASE_URL).
  </action>
  <verify>
    <automated>npx vitest run tests/schema.test.ts --reporter=verbose 2>&1 | tail -20 && npx drizzle-kit generate 2>&1 | tail -10</automated>
  </verify>
  <acceptance_criteria>
    - All 8 schema files + index barrel exist; `npx drizzle-kit generate` produces a migration without error.
    - routes.ts geom column declares LineString and carries the hand-edit warning comment.
    - boq_items has plannedQty + approvedQty numeric(12,3), approvedQty default '0', sort_order, and the commented unit_price placeholder.
    - assignments has roleOnProject enum + UNIQUE(personId,projectId,roleOnProject).
    - migrate.ts executes 0000_enable_postgis.sql before migrate(); seed.ts uses the fixed tenant UUID; tenant.ts exports getDefaultTenantId() returning the fixed UUID fallback.
    - tests/schema.test.ts: remainingBalance + getDefaultTenantId pure tests pass; assignment uniqueness test passes under describeIfDb (or skips cleanly without TEST_DATABASE_URL).
  </acceptance_criteria>
  <done>Complete schema, PostGIS migration, runner, seed, tenant helper, and balance helper authored; generate succeeds; schema/balance/tenant tests green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| application code → database | All writes must scope tenant_id to the seed tenant; geometry inserts must be parameterized (enforced downstream in 01-06) |
| schema authoring → generated migration | A wrong geometry type silently corrupts all downstream spatial work; the LineString declaration here is the source of the regression-guard edit in 01-02b |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02a-01 | Tampering | routes.geom column type | mitigate | customType declares `geometry(LineString, 4326)` + the hand-edit warning comment so plan 01-02b corrects the drizzle-kit point default; never use `drizzle-kit push` directly |
| T-02a-02 | Information Disclosure | cross-tenant leakage (D-09 hedge) | mitigate | `getDefaultTenantId()` helper returns a fixed UUID; app code always supplies tenant_id on insert (Pitfall 3); seed tenant isolated by fixed UUID |
| T-02a-03 | Denial of Service | missing GiST index on geom | accept | Single-tenant low-row-count in v1; GiST index is declared now so Phase 4 spatial queries are index-backed — accepted as mitigated-forward |
</threat_model>

<verification>
- `npx drizzle-kit generate` succeeds; generated SQL is produced for review by plan 01-02b.
- `npx vitest run tests/schema.test.ts` passes (pure balance + getDefaultTenantId + describeIfDb-gated assignment uniqueness).
- All 8 schema files + index barrel + migrate.ts + seed.ts + tenant.ts + boq-balance.ts exist.
</verification>

<success_criteria>
- Complete Phase 1 schema authored with the exact contract column names downstream plans import.
- routes.geom declared as geometry(LineString,4326) with the regression-guard comment.
- assignments enforces per-person+project+role uniqueness; boq_items carries the SETUP-04 balance inputs.
- getDefaultTenantId() returns the fixed seed tenant UUID; remainingBalance() correct.
- `drizzle-kit generate` succeeds; schema/balance/tenant tests green.
</success_criteria>

<output>
Create `.planning/phases/01-foundation/01-02a-SUMMARY.md` when done.
</output>
</content>
</invoke>
