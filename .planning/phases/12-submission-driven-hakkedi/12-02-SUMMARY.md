---
phase: 12-submission-driven-hakkedi
plan: 02
subsystem: db-migrations
tags: [migration, postgis-adjacent, hakedis, live-db-gate, blocking, wave-2]
requires:
  - 12-01 (D-119 schema authored in src/db/schema/hakedis-line-submissions.ts + UNIQUE on hakedis-period-lines.ts)
provides:
  - live hakedis_line_submissions table on dev DB (DATABASE_URL → neondb) with composite PK + 3 FKs + reverse index
  - live hakedis_line_submissions table on test DB (TEST_DATABASE_URL → neondb_test) — identical schema
  - live UNIQUE (period_id, boq_item_id) on hakedis_period_lines on both DBs (D-117 UPSERT target ready)
  - scripts/verify-0009.ts (reusable schema-presence assertion against either DB)
affects:
  - all Wave 3 plans (12-03 helper, 12-04 integration tests) — INSERT into the join table now succeeds end-to-end
tech-stack:
  added: []
  patterns:
    - "live-DB gate via npx tsx src/db/migrate.ts (D-49) — drizzle-kit push remains unusable due to spatial_ref_sys"
    - "TEST_DATABASE_URL secondary apply (Phase 7-02 precedent)"
    - "Post-apply migration file untouched (Phase 9-03 hash-integrity)"
key-files:
  created:
    - .planning/phases/12-submission-driven-hakkedi/12-02-SUMMARY.md
    - scripts/verify-0009.ts
  modified:
    - (none — Task 1 committed the migration scaffold + journal already)
decisions:
  - D-49 re-affirmed: drizzle-kit push unusable (spatial_ref_sys); migrate.ts is the project's only working migration runner
  - Phase 7-02 pattern reused verbatim: dev apply via npx tsx src/db/migrate.ts, test apply via DATABASE_URL=$TEST_DATABASE_URL prefix
  - Phase 9-03 hash-integrity invariant honored: no post-apply edit to 0009 SQL or meta journal
  - scripts/verify-0009.ts kept in-repo as small reusable assertion — runs against either DB by toggling DATABASE_URL
metrics:
  duration: ~3min
  completed: 2026-05-28
---

# Phase 12 Plan 02: 0009 v3 Line-Submissions Live-DB Apply Summary

D-119 join table + Open Question 4 parent UNIQUE applied to both dev and test Neon branches, verified by live information_schema query — Wave 3 can now write into hakedis_line_submissions without the Phase 7/9/10 false-positive trap (TS types compile but live DB has no table).

## What Was Built

- **Task 1 (committed 43e52a2 in prior executor invocation):** generated `src/db/migrations/0009_v3_line_submissions.sql` containing exactly the four expected statements — one CREATE TABLE for `hakedis_line_submissions` with composite PK (period_line_id, submission_id), three FK ALTERs (tenant_id → tenants no-action, period_line_id → hakedis_period_lines ON DELETE cascade per D-97 draft-delete semantics, submission_id → submissions ON DELETE restrict per Pitfall 8 snapshot durability), one CREATE INDEX `hakedis_line_submissions_submission_idx`, plus the parent-table ALTER `hakedis_period_lines ADD CONSTRAINT hakedis_period_lines_period_boq_unique UNIQUE(period_id, boq_item_id)` for the D-117 UPSERT target. Pitfall 7 verified clean: zero `period_qty` DROP/RECREATE statements. Journal carries the `0009_v3_line_submissions` tag.
- **Task 2 [BLOCKING] (resolved by user: `approved both`):** human reviewed the SQL diff and authorized live apply to both DBs.
- **Task 3 (committed bdaac4a in this executor invocation):**
  - `./node_modules/.bin/tsx src/db/migrate.ts` → applied to dev (DATABASE_URL → neondb). `Migrations complete`.
  - `DATABASE_URL=$TEST_DATABASE_URL ./node_modules/.bin/tsx src/db/migrate.ts` → applied to test (TEST_DATABASE_URL → neondb_test). `Migrations complete`.
  - `scripts/verify-0009.ts` written + run against both DBs. Both printed `OK` with the full constraint summary:
    - table: `hakedis_line_submissions`
    - pk: `hakedis_line_submissions_period_line_id_submission_id_pk`
    - fks: `hakedis_line_submissions_period_line_id_hakedis_period_lines_id`, `hakedis_line_submissions_submission_id_submissions_id_fk`, `hakedis_line_submissions_tenant_id_tenants_id_fk`
    - idx: `hakedis_line_submissions_submission_idx`
    - parent unique: `hakedis_period_lines_period_boq_unique`

## Verification Evidence

| Layer | Check | Evidence |
| ----- | ----- | -------- |
| Migration file integrity | 4 expected statements, no period_qty re-emit | Task 1 acceptance criteria passed (Phase 9-03 hash invariant intact: file UNTOUCHED post-apply) |
| Drizzle runner | `Migrations complete` printed for both invocations | Bash stdout, both runs exited 0 |
| Live DB (dev) schema | table + composite PK + 3 FKs + index + parent UNIQUE all present | `scripts/verify-0009.ts` → `OK` against DATABASE_URL |
| Live DB (test) schema | identical to dev | `DATABASE_URL=$TEST_DATABASE_URL scripts/verify-0009.ts` → `OK` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `npx tsx` shadowed by RTK proxy → `npm run tsx`**
- **Found during:** Task 3 dev DB apply
- **Issue:** `npx tsx src/db/migrate.ts` rewrote to `npm run tsx`, which failed (`Missing script: "tsx"`). The plan's literal invocation pattern is RTK-incompatible in the current shell.
- **Fix:** Invoked the binary directly: `./node_modules/.bin/tsx src/db/migrate.ts`. Functionally identical to `npx tsx` — same binary, same module resolution, same env loading.
- **Files modified:** none (runtime-only)
- **Commit:** included in bdaac4a (no source change beyond verification script)

**2. [Rule 3 — Blocking] `verify-0009.mjs` in /tmp couldn't resolve `@neondatabase/serverless`**
- **Found during:** Task 3 live-DB verification
- **Issue:** Plan suggested an inline `npx tsx -e` one-liner; running it via a temp `.mjs` in `/tmp` failed because node module resolution looks up from the file location, and `/tmp` has no `node_modules`.
- **Fix:** Wrote `scripts/verify-0009.ts` inside the repo (so module resolution finds `node_modules/@neondatabase/serverless`), with explicit `dotenv` `.env.local` load to mirror `src/db/migrate.ts`. Wrapped queries in an `async main()` since tsx targets CJS where top-level `await` isn't supported. Kept the file as a reusable assertion utility.
- **Files modified:** added `scripts/verify-0009.ts`
- **Commit:** bdaac4a

Neither deviation altered the migration SQL, the journal, or any production code path. Both stayed strictly within Task 3's runtime envelope.

### Auth Gates

None. Database creds were already present in `.env.local`.

## Threat Surface Scan

No new network endpoints, no new auth paths, no new file access patterns, no new schema beyond what was already in the plan's threat model and which D-119 + Open Question 4 already mitigate. Migration file remains read-only post-apply (T-12-02-INT mitigation honored).

## Known Stubs

None — `scripts/verify-0009.ts` is a complete, working assertion utility, and the live schema is fully provisioned on both DBs.

## Self-Check: PASSED

- File `src/db/migrations/0009_v3_line_submissions.sql` exists: FOUND
- File `src/db/migrations/meta/_journal.json` carries tag `0009_v3_line_submissions`: FOUND (journal entry idx 9)
- File `scripts/verify-0009.ts` exists: FOUND
- Commit `43e52a2` (Task 1): FOUND in git log
- Commit `bdaac4a` (Task 3 — this plan): FOUND in git log
- Dev DB hakedis_line_submissions table + UNIQUE on hakedis_period_lines: confirmed via live information_schema query (OK printed)
- Test DB hakedis_line_submissions table + UNIQUE on hakedis_period_lines: confirmed via live information_schema query (OK printed)
