---
phase: 01-foundation
plan: 02b
type: execute
wave: 3
depends_on: ["01-02a"]
files_modified:
  - src/db/migrations/0001_init_schema.sql
  - tests/postgis.test.ts
autonomous: false

requirements: [SETUP-03]

must_haves:
  truths:
    - "D-08: The generated Drizzle migration declares routes.geom as geometry(LineString,4326), NOT geometry(point,4326), and carries the -- HAND-EDITED regression-guard comment"
    - "No `geometry(point` remains in any migration file"
    - "D-10: The PostGIS extension is enabled on the live database via the first migration (SELECT postgis_version() returns a value); GiST index on routes.geom is applied"
    - "All Phase 1 tables exist in the live DB after the schema push: tenants, users, accounts, sessions, verification_tokens, projects, boq_items, routes, people, pending_people, assignments"
    - "A single default tenant row exists with the fixed UUID 00000000-0000-0000-0000-000000000001"
    - "Storing an Istanbul coordinate (lng 28.9, lat 41.0) reads back longitude-first in ST_AsGeoJSON output"
  artifacts:
    - path: "src/db/migrations/0001_init_schema.sql"
      provides: "The drizzle-kit-generated schema migration, hand-edited so routes.geom is geometry(LineString,4326)"
      contains: "LineString"
    - path: "tests/postgis.test.ts"
      provides: "PostGIS-present + Istanbul coordinate-order readback integration test (describeIfDb)"
      contains: "postgis_version"
  key_links:
    - from: "tests/postgis.test.ts"
      to: "routes.geom"
      via: "ST_GeomFromGeoJSON insert + ST_AsGeoJSON readback asserts lng-first"
      pattern: "ST_AsGeoJSON"
    - from: "src/db/migrate.ts"
      to: "src/db/migrations/0001_init_schema.sql"
      via: "migrate() applies the LineString-corrected migration after PostGIS 0000"
      pattern: "migrationsFolder"
---

<objective>
Take the schema authored in plan 01-02a to a live, correct database: run `drizzle-kit generate`, hand-edit the generated migration so routes.geom is `geometry(LineString,4326)` (drizzle-kit emits point by default — D-08), author the coordinate-order PostGIS integration test, then — at a BLOCKING checkpoint — push the schema to the live Neon database (PostGIS enabled via the first migration per D-10), seed the default tenant, and run the DB integration tests.

Purpose: This isolates the two error-prone, false-positive-prone steps from schema authoring: (1) the manual point→LineString migration edit that silently regresses on every regenerate (D-08), and (2) the live schema push, which build/type checks alone cannot verify (types come from config, so a green build with no live DB is a false-positive). Separating these into their own non-autonomous plan keeps 01-02a fully autonomous and reviewable without a provisioned connection string, while gating the live write behind explicit human confirmation. NOTE: the actual generated migration filename may differ (e.g. `0001_<adjective>_<name>.sql`); `files_modified` lists the conventional name — the executor edits whatever drizzle-kit emits.
Output: A migrated Neon database with PostGIS enabled (D-10), all 11 tables present, routes.geom correctly typed as LineString (D-08), a seeded default tenant, and passing coordinate-order + schema DB integration tests.
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
<!-- From plan 01-02a: all schema files + src/db/schema/index.ts barrel; src/db/migrate.ts (PostGIS-first runner); src/db/seed.ts (fixed tenant UUID); src/db/migrations/0000_enable_postgis.sql -->
<!-- From plan 01-01: tests/fixtures/db.ts (describeIfDb + test Drizzle client); src/db/index.ts (db client) -->
<!-- RESEARCH § "Schema" Pattern 1/2 MANUAL MIGRATION EDIT block: change geometry(point,4326) → geometry(LineString,4326) for routes.geom; add `-- HAND-EDITED` comment -->
<!-- RESEARCH § "Open Questions (RESOLVED)" #2: seed tenant UUID 00000000-0000-0000-0000-000000000001 -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Generate migration + HAND-EDIT LineString + author coordinate-order PostGIS test</name>
  <read_first>
    - .planning/phases/01-foundation/01-RESEARCH.md § "Schema" Pattern 1/2 (the MANUAL MIGRATION EDIT block) and § "Common Pitfalls" Pitfall 1
    - .planning/phases/01-foundation/01-VALIDATION.md § "Per-Task Verification Map" (coordinate-order + PostGIS-present rows)
    - .planning/phases/01-foundation/01-CONTEXT.md D-08 (geometry(linestring,4326), hand-edit migration), D-10 (PostGIS in first migration, GiST indexes)
    - src/db/schema/routes.ts (authored in plan 01-02a — the LineString customType + hand-edit warning comment)
    - tests/fixtures/db.ts (describeIfDb + test client from plan 01-01)
  </read_first>
  <action>
    Run `npx drizzle-kit generate` to emit the schema migration from the 01-02a schema. Open the generated Drizzle migration SQL. Find the routes.geom column emitted as `geometry(point, 4326)` (or `geometry(Point,4326)`) and CHANGE it to `geometry(LineString, 4326)` (D-08). Add the comment line `-- HAND-EDITED: Drizzle generates point; must be linestring` directly above that column. Confirm the GiST index on geom is present in the generated SQL; add it if drizzle-kit omitted it (D-10 GiST requirement). Do NOT run `drizzle-kit push` (it bypasses this file-review edit) — the push happens via the migrate runner in Task 2.
    Author tests/postgis.test.ts under describeIfDb: (a) `SELECT postgis_version()` returns a non-null value (extension present — D-10); (b) insert a route via `ST_GeomFromGeoJSON` of a LineString whose first coordinate is Istanbul [28.9, 41.0], then read back via `ST_AsGeoJSON(geom)` and assert the first coordinate is 28.9 (longitude first) — proving coordinate order (SETUP-03 / GEO coordinate-order guard).
  </action>
  <verify>
    <automated>grep -rl "HAND-EDITED" src/db/migrations/ && grep -ri "geometry(LineString" src/db/migrations/ && bash -c 'if grep -rqi "geometry(point" src/db/migrations/; then echo "FAIL: point still present"; exit 1; fi'</automated>
  </verify>
  <acceptance_criteria>
    - The generated migration SQL contains `geometry(LineString` for routes.geom and the `-- HAND-EDITED` comment.
    - No `geometry(point` remains in any migration file.
    - A GiST index on routes.geom is present in the migration SQL.
    - tests/postgis.test.ts asserts postgis_version() present AND Istanbul lng-first readback (gated by describeIfDb).
  </acceptance_criteria>
  <done>Migration hand-edited to LineString with the regression-guard comment; coordinate-order + extension test authored.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: [BLOCKING] Push schema to live Neon DB + run seed + run DB integration tests</name>
  <read_first>
    - .planning/phases/01-foundation/01-RESEARCH.md § "Environment Availability" (Neon must be provisioned first) and § "Open Questions (RESOLVED)" #2 (seed tenant UUID)
    - src/db/migrate.ts and src/db/seed.ts authored in plan 01-02a
  </read_first>
  <action>
    [BLOCKING — schema push] Apply the schema to the live Neon database, seed the default tenant, and run the DB integration tests. This is a human-action checkpoint because it requires the Neon connection string (provisioned outside Claude in `.env.local`) and writes to a live database; build/type checks alone are a false-positive verification state. Claude runs the commands once the connection strings are present; the human confirms the live DB state.
    Steps: (1) ensure DATABASE_URL + TEST_DATABASE_URL are set in `.env.local`; (2) run the migration runner `npx tsx src/db/migrate.ts` (enables PostGIS via the first migration per D-10, then applies the LineString-corrected migration per D-08); (3) run the seed `npx tsx src/db/seed.ts`; (4) verify the live DB; (5) run the DB integration tests against the test branch. See <how-to-verify> for the exact commands.
  </action>
  <what-built>
    The full Drizzle schema (plan 01-02a), the PostGIS-first migration runner (src/db/migrate.ts), the seed script (src/db/seed.ts), and the coordinate-order test (this plan). The migration runner enables PostGIS then applies the LineString-corrected migration. This task applies them to the live Neon database.
  </what-built>
  <how-to-verify>
    Prerequisite: `DATABASE_URL` (and `TEST_DATABASE_URL` for the DB tests) must be set in `.env.local` pointing at the provisioned Neon database/branch.
    1. Run the migration runner: `npx tsx src/db/migrate.ts`. Confirm console prints "Migrations complete" with no error.
    2. Run the seed: `npx tsx src/db/seed.ts`. Confirm one tenant row with UUID 00000000-0000-0000-0000-000000000001.
    3. Verify PostGIS + tables live:
       `psql "$DATABASE_URL" -c "SELECT postgis_version();"` → returns a version string.
       `psql "$DATABASE_URL" -c "\\dt"` → lists tenants, users, accounts, sessions, verification_tokens, projects, boq_items, routes, people, pending_people, assignments.
       `psql "$DATABASE_URL" -c "\\d routes"` → geom column type is `geometry(LineString,4326)`.
    4. Run DB integration tests against the test branch: `TEST_DATABASE_URL=... npx vitest run tests/schema.test.ts tests/postgis.test.ts` → all green (postgis_version present + Istanbul lng-first readback).
  </how-to-verify>
  <verify>
    <automated>MISSING — requires live DATABASE_URL; verified manually via the checkpoint steps (migration runner + psql \dt + DB integration tests). Phase verification re-runs `TEST_DATABASE_URL=... npx vitest run tests/schema.test.ts tests/postgis.test.ts`.</automated>
  </verify>
  <acceptance_criteria>
    - Migration runner completes; PostGIS enabled (postgis_version() returns a value).
    - All 11 tables present in the live DB.
    - routes.geom is geometry(LineString,4326) in the live DB (\d routes confirms).
    - Seed produced exactly one default tenant (fixed UUID).
    - tests/postgis.test.ts + tests/schema.test.ts pass against TEST_DATABASE_URL.
  </acceptance_criteria>
  <done>Schema applied to live Neon; PostGIS + 11 tables + LineString geom + seed tenant confirmed; DB integration tests green.</done>
  <resume-signal>Type "approved" once the migration ran, all 11 tables + PostGIS are confirmed live, routes.geom is LineString, and the DB tests pass — or describe the failure.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| migration tooling → live DB | A wrong geometry type silently corrupts all downstream spatial work |
| application code → database | All writes must scope tenant_id to the seed tenant; geometry inserts must be parameterized (enforced in 01-06) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02b-01 | Tampering | routes.geom column type in generated migration | mitigate | Hand-edit point→LineString with the `-- HAND-EDITED` regression-guard comment; grep gate fails the task if `geometry(point` remains; never use `drizzle-kit push` directly |
| T-02b-02 | Tampering | GeoJSON geometry injection at insert | mitigate | Geometry inserted only via parameterized `ST_GeomFromGeoJSON(${...})` (validated upstream in plan 01-06); no string concatenation into SQL; the postgis test uses the same parameterized path |
| T-02b-03 | Information Disclosure | live DB credentials in the push checkpoint | mitigate | DATABASE_URL / TEST_DATABASE_URL read from `.env.local` only (gitignored); never echoed into committed artifacts |
</threat_model>

<verification>
- `npx drizzle-kit generate` produced a migration; generated SQL contains `geometry(LineString`, no `geometry(point`, and the GiST index on geom.
- Live DB (checkpoint): postgis_version() returns a value; 11 tables present; routes.geom is LineString; one seed tenant.
- `TEST_DATABASE_URL=... npx vitest run tests/postgis.test.ts tests/schema.test.ts` passes (coordinate order + extension present + assignment uniqueness).
</verification>

<success_criteria>
- The generated migration is hand-edited to LineString with the regression-guard comment; no point geometry remains.
- PostGIS enabled on the live database; all 11 Phase 1 tables present; routes.geom is geometry(LineString,4326).
- Default tenant seeded with the fixed UUID.
- Coordinate order verified (Istanbul lng 28.9 reads back first); PostGIS + schema DB tests green.
</success_criteria>

<output>
Create `.planning/phases/01-foundation/01-02b-SUMMARY.md` when done.
</output>
</content>
</invoke>
</output>
