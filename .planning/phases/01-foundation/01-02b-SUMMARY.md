---
phase: 01-foundation
plan: "02b"
subsystem: database
tags: [drizzle, postgis, neon, migration, vitest, dotenv, tsx, linestring, coordinate-order]

dependency_graph:
  requires:
    - 01-02a (full Drizzle schema, migration file 0000_lame_silver_sable.sql, migrate.ts, seed.ts)
    - 01-01 (tests/fixtures/db.ts describeIfDb guard + test Drizzle client)
  provides:
    - Live Neon DB: PostGIS 3.5 enabled, 11 tables present, routes.geom = geometry(LineString,4326)
    - Seed tenant 00000000-0000-0000-0000-000000000001 in live DB
    - HAND-EDITED regression-guard comment in 0000_lame_silver_sable.sql
    - tests/postgis.test.ts: postgis_version() present + Istanbul lng-first ST_AsGeoJSON guard
    - Fixed env loading: dotenv loads .env.local for vitest (DB tests now RUN, not skip)
    - Fixed truncateAllTables: multi-table TRUNCATE CASCADE (no invalid IF EXISTS)
    - vitest fileParallelism:false to prevent DB test file race conditions
    - scripts/verify-db.mjs for live DB verification
  affects:
    - 01-03 (Auth.js tables confirmed live — magic-link email auth can rely on DB)
    - 01-04 (pending_people table confirmed live — /start webhook insert path verified)
    - 01-05 (all 11 domain tables confirmed; Server Actions can target live DB)
    - 01-06 (routes.geom confirmed LineString in live DB — GeoJSON upload path safe)
    - All future DB-gated tests (fileParallelism:false + env loading fix applies globally)

tech_stack:
  added:
    - dotenv@17.4.2 (dev) — loads .env.local for vitest setup
    - tsx@4.22.3 (dev) — TypeScript runner for src/db/migrate.ts and src/db/seed.ts
  patterns:
    - fileParallelism:false in vitest.config.ts for shared-DB test file isolation
    - truncateAllTables uses single multi-table TRUNCATE ... CASCADE (not per-table loop with invalid IF EXISTS)
    - grammY API transformer pattern for mocking ctx.reply() in DB integration tests
    - bot.botInfo setter to bypass getMe network call in unit tests
    - Re-seed tenant in each describeIfDb beforeEach that needs FK references

key_files:
  created:
    - tests/postgis.test.ts
    - scripts/verify-db.mjs
  modified:
    - src/db/migrations/0000_lame_silver_sable.sql (HAND-EDITED comment added above routes.geom)
    - tests/setup.ts (now actually loads .env.local via dotenv)
    - tests/fixtures/db.ts (truncateAllTables: fixed invalid TRUNCATE IF EXISTS syntax)
    - tests/telegram-webhook.test.ts (bot init + sendMessage mock + tenant re-seed)
    - vitest.config.ts (fileParallelism: false)
    - package.json + package-lock.json (dotenv, tsx added)
    - .gitignore (scripts/debug-*.mjs ignored)

key_decisions:
  - "TRUNCATE TABLE IF EXISTS is invalid PostgreSQL syntax (only DROP TABLE supports IF EXISTS); fixed to multi-table TRUNCATE ... CASCADE"
  - "vitest fileParallelism:false required: parallel file execution causes TRUNCATE in one file to race with inserts in another on a shared Neon DB"
  - "tsx@4.22.3 installed to run TypeScript source files with --env-file flag; Node 24 native type stripping can't resolve .ts module imports"
  - "grammY transformer (api.config.use) is the correct mechanism to intercept ctx.reply() in tests; vi.spyOn on bot.api.sendMessage doesn't work because sendMessage delegates to raw Proxy"
  - "bot.botInfo setter must be set explicitly after vi.spyOn(bot, 'init') mock — grammY checks this.me before creating handler context"
  - "Seed tenant must be re-inserted in each describeIfDb beforeEach after truncation — FK constraints on pending_people.tenant_id and others reference it"

requirements-completed: [SETUP-03]

duration: 35min
completed: "2026-05-24"
---

# Phase 01 Plan 02b: Live Schema Push + PostGIS Guard + DB Integration Tests Summary

**PostGIS 3.5 enabled on live Neon DB with all 11 Phase 1 tables and routes.geom=geometry(LineString,4326) confirmed; Istanbul coordinate-order guard + full 31-test suite green.**

## Performance

- **Duration:** ~35 minutes
- **Started:** 2026-05-24T01:10:00Z
- **Completed:** 2026-05-24T01:45:00Z
- **Tasks:** 2 (Task 1: migration hand-edit + test authoring; Task 2: live push + seed + test fixes)
- **Files modified:** 9

## Accomplishments

- Added `-- HAND-EDITED: Drizzle generates point; must be linestring` regression-guard comment above routes.geom in 0000_lame_silver_sable.sql (D-08)
- Confirmed GiST index `routes_geom_gist` already present in generated migration (D-10)
- Fixed env loading: `tests/setup.ts` now loads `.env.local` via dotenv so DB tests run instead of skip
- Applied schema to live Neon: PostGIS 3.5 enabled, all 11 tables created, routes.geom = LINESTRING SRID:4326
- Seeded default tenant `00000000-0000-0000-0000-000000000001` idempotently
- Authored `tests/postgis.test.ts`: postgis_version() presence guard + Istanbul lng-first ST_AsGeoJSON coordinate-order test
- Fixed 4 pre-existing bugs that were masked by the skipping tests (truncate syntax, parallel file racing, grammY bot init, tenant FK)
- Full Vitest suite: **31/31 tests pass**

## Live DB State (Verified via scripts/verify-db.mjs)

| Check | Value |
|-------|-------|
| PostGIS version | `3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1` |
| Tables | accounts, assignments, boq_items, pending_people, people, projects, routes, sessions, tenants, users, verification_tokens (11 tables + spatial_ref_sys) |
| routes.geom type | `LINESTRING` SRID: 4326 — PASS |
| Seed tenant | `00000000-0000-0000-0000-000000000001` present — PASS |
| GiST index | `routes_geom_gist` on routes.geom — PASS |
| Istanbul coordinate order | lng 28.9 reads back first in ST_AsGeoJSON — PASS |

## Task Commits

1. **Task 1: Migration HAND-EDITED + env loading fix + PostGIS coordinate-order test** - `1b4216c` (feat)
2. **Task 2: Live schema push + seed + DB integration tests green** - `040f0f7` (feat)

## Files Created/Modified

- `src/db/migrations/0000_lame_silver_sable.sql` — Added `-- HAND-EDITED` regression-guard comment above routes.geom
- `tests/setup.ts` — Now loads `.env.local` via dotenv (was a comment-only stub)
- `tests/postgis.test.ts` — New: postgis_version() presence + Istanbul lng-first coordinate-order test
- `tests/fixtures/db.ts` — Fixed `truncateAllTables`: invalid TRUNCATE TABLE IF EXISTS → multi-table TRUNCATE ... CASCADE
- `tests/telegram-webhook.test.ts` — Fixed 3 bot-init/API-mock/FK bugs uncovered by env loading fix
- `vitest.config.ts` — Added `fileParallelism: false` to prevent DB test file race conditions
- `package.json` / `package-lock.json` — Added dotenv@17.4 and tsx@4.22 dev deps
- `.gitignore` — Added `scripts/debug-*.mjs` pattern
- `scripts/verify-db.mjs` — Live DB verification script (PostGIS version + table list + geom type + tenant count)

## Decisions Made

- `TRUNCATE TABLE IF EXISTS` is not valid PostgreSQL syntax — only `DROP TABLE` supports `IF EXISTS`. Fixed to `TRUNCATE TABLE a, b, ... CASCADE` (all tables at once with CASCADE to handle FK order automatically).
- `fileParallelism: false` is required in vitest.config.ts: parallel test files each call `truncateAllTables` which races with the other file's inserts, causing FK violations. Neon's HTTP driver makes this worse (no transaction isolation between files).
- tsx@4.22 installed because Node 24's native type-stripping cannot resolve TypeScript `.ts` module imports (relative `.ts` paths fail in ESM mode).
- grammY `bot.api.config.use(transformer)` is the official interception mechanism for mocking all API calls; `vi.spyOn(bot.api, 'sendMessage')` doesn't work because grammY's `Api.raw` is a Proxy with dynamic dispatch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invalid TRUNCATE TABLE IF EXISTS syntax**
- **Found during:** Task 2 (running DB integration tests)
- **Issue:** `TRUNCATE TABLE IF EXISTS "assignments" RESTART IDENTITY CASCADE` is invalid PostgreSQL syntax — `IF EXISTS` is only supported in `DROP TABLE`. Error code 42601 (syntax error).
- **Fix:** Changed `truncateAllTables` to execute a single `TRUNCATE TABLE "a","b",... CASCADE` statement without `IF EXISTS` or `RESTART IDENTITY`.
- **Files modified:** `tests/fixtures/db.ts`
- **Verification:** TRUNCATE runs cleanly; 31 tests pass
- **Committed in:** `040f0f7`

**2. [Rule 1 - Bug] Fixed vitest parallel file execution causing test isolation failures**
- **Found during:** Task 2 (DB tests failing intermittently with FK violations)
- **Issue:** vitest runs test files in parallel by default. `truncateAllTables` in `postgis.test.ts` raced with inserts in `schema.test.ts`, removing the seed tenant mid-test.
- **Fix:** Added `fileParallelism: false` to `vitest.config.ts`.
- **Files modified:** `vitest.config.ts`
- **Verification:** 11/11 DB integration tests pass reliably
- **Committed in:** `040f0f7`

**3. [Rule 1 - Bug] Fixed grammY "Bot not initialized!" in telegram-webhook.test.ts DB tests**
- **Found during:** Task 2 (telegram webhook DB-gated tests now run due to env loading fix)
- **Issue:** `vi.spyOn(bot, 'init').mockResolvedValue()` stubs the method but doesn't set `bot.me` (the internal botInfo store). `handleUpdate` checks `this.me === undefined` and throws.
- **Fix:** Added `bot.botInfo = { id: 123456, is_bot: true, ... }` after the spy, and installed a grammY transformer to intercept `ctx.reply()` calls.
- **Files modified:** `tests/telegram-webhook.test.ts`
- **Verification:** All 4 telegram-webhook tests pass
- **Committed in:** `040f0f7`

**4. [Rule 1 - Bug] Fixed missing tenant re-seed in telegram-webhook.test.ts DB beforeEach**
- **Found during:** Task 2 (FK violation: tenant_id not present in tenants table)
- **Issue:** `truncateAllTables` removes the seed tenant, but the /start handler inserts `pending_people` with `tenantId = getDefaultTenantId()` which FKs to `tenants`. After truncation, the FK constraint fails.
- **Fix:** Added `INSERT INTO tenants ... ON CONFLICT DO NOTHING` in the `describeIfDb` block's `beforeEach`.
- **Files modified:** `tests/telegram-webhook.test.ts`
- **Verification:** pending_people inserts succeed; FK never violated
- **Committed in:** `040f0f7`

---

**Total deviations:** 4 auto-fixed (all Rule 1 — bugs masked by skipping tests that are now running)
**Impact on plan:** All fixes necessary for correct test isolation and DB connectivity. No scope creep. All bugs were pre-existing but invisible because DB tests were previously skipping due to the stub tests/setup.ts.

## Known Stubs

None — this plan pushes schema and runs tests only (no UI, no data-connected UI components).

## Threat Flags

None — threat model mitigations confirmed:
- T-02b-01: routes.geom = geometry(LineString,4326) confirmed in live DB + HAND-EDITED comment added
- T-02b-02: Istanbul coordinate-order test uses parameterized `ST_GeomFromGeoJSON(${...})` (no string concatenation)
- T-02b-03: DATABASE_URL and TEST_DATABASE_URL never echoed or committed; .env.local remains gitignored

## Next Phase Readiness

- Live Neon DB fully operational: PostGIS + 11 tables + LineString geom + seed tenant
- All DB integration tests green (31/31)
- Env loading works for local development (dotenv in vitest setup)
- Ready for 01-03 (Auth.js magic-link), 01-05 (Server Actions), 01-06 (GeoJSON upload)

---
*Phase: 01-foundation*
*Completed: 2026-05-24*
