---
phase: 09-performance-scorecards-leaderboard-alerts
plan: "03"
subsystem: database-migration
tags: [migration, tenant-settings, drizzle, neon, postgresql]
dependency_graph:
  requires: ["09-01"]
  provides: ["tenant_settings table", "Moderate-defaults seed row"]
  affects: ["09-04", "09-05", "09-06"]
tech_stack:
  added: []
  patterns: ["hand-written migration", "ON CONFLICT DO NOTHING seed", "drizzle journal entry", "test-DB reconcile via temp-tenant insert"]
key_files:
  created:
    - src/db/migrations/0007_v2_tenant_settings.sql
  modified:
    - src/db/migrations/meta/_journal.json
decisions:
  - "Hand-wrote migration directly per established precedent (0005, 0006) — drizzle-kit generate produces random filename requiring rename; all patterns already fully specified in PATTERNS.md"
  - "DEFAULT '0.3000' stored as string literal (not 0.3 float) per Pitfall 5 — preserves numeric(5,4) precision"
  - "Seed embedded in migration SQL (ON CONFLICT DO NOTHING) not a separate script — idempotent per-apply (anti-pattern from RESEARCH.md)"
  - "0007 must NOT be edited post-apply — drizzle migration-hash integrity requires applied migrations to be immutable; FK-safe follow-up deferred to a future migration (todo filed: tenant-settings-seed-fk-safe.md)"
metrics:
  duration: "93s + checkpoint"
  completed: "2026-05-27"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
requirements: [PERF-06]
---

# Phase 9 Plan 03: tenant_settings Migration Summary

**One-liner:** Hand-written 0007 migration creates `tenant_settings` table with numeric(5,4) precision, UNIQUE tenant constraint, and idempotent Moderate-defaults seed row (48h SLA / 30% rejection / 7-day stall) — applied and verified on both production and test Neon branches.

## What Was Built

The `tenant_settings` migration (0007) that materializes the configurable-threshold table required by all downstream Phase 9 analytics and alert logic. Without this table, every `getTenantSettings()` call in Plans 04–06 would fail at runtime despite the TypeScript build passing — the blocking false-positive verification trap this plan specifically closes.

### Migration file: `src/db/migrations/0007_v2_tenant_settings.sql`

- `CREATE TABLE "tenant_settings"` with:
  - `id` uuid PRIMARY KEY DEFAULT gen_random_uuid()
  - `tenant_id` uuid NOT NULL REFERENCES "tenants"("id") 
  - `audit_sla_hours` integer NOT NULL DEFAULT 48
  - `rejection_rate_threshold` numeric(5,4) NOT NULL DEFAULT '0.3000' (string literal, not float)
  - `stalled_days` integer NOT NULL DEFAULT 7
  - `updated_at` timestamp with time zone DEFAULT now() NOT NULL
- `ALTER TABLE ... ADD CONSTRAINT "tenant_settings_tenant_id_unique" UNIQUE ("tenant_id")` — one row per tenant, T-09-03-T threat mitigation
- Idempotent seed: `INSERT INTO ... VALUES ('00000000-0000-0000-0000-000000000001', 48, '0.3000', 7) ON CONFLICT (tenant_id) DO NOTHING` — D-84 Moderate defaults

### Updated: `src/db/migrations/meta/_journal.json`

- Appended idx-7 entry with `tag: "0007_v2_tenant_settings"` and `breakpoints: true`
- Journal tag exactly matches filename without `.sql` (required for Drizzle migrator)

## Task Completion

| Task | Status | Commit |
|------|--------|--------|
| Task 1: Generate + hand-verify 0007 migration (table, UNIQUE, precision, seed) | COMPLETE | 716f519 |
| Task 2: Apply 0007 migration to production + test DBs via tsx migrate.ts | COMPLETE | checkpoint-verified |

### Task 2 Verified Results

**Production DB:** `tenant_settings` table created; seed row present (`audit_sla_hours=48, rejection_rate_threshold=0.3000, stalled_days=7`); 0007 journaled. Idempotent re-apply confirmed (no duplicate row, no error).

**Test branch DB:** `tenant_settings` table + unique constraint present; 0 rows at rest (clean — tests create/truncate their own rows); 0007 journaled. Confirmed migration applied via `tsx src/db/migrate.ts` (NOT drizzle-kit push, per D-49).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test-DB reconcile required due to FK violation on seed INSERT**

- **Found during:** Task 2 (apply to test branch DB)
- **Issue:** The test branch DB had no default tenant (`'00000000-0000-0000-0000-000000000001'`) at the time of migration apply. The `INSERT INTO tenant_settings ... VALUES ('00000000-0000-0000-0000-000000000001', ...)` seed statement has a FK to `tenants.id`, which fails with a FK violation when that tenant is absent. The test DB runs with clean state — no seed tenants — so the seed could not be applied directly.
- **Fix:** Performed a one-time test-DB reconcile: (1) dropped the partially-created `tenant_settings` table from the failed apply, (2) temporarily inserted the default tenant row into `tenants`, (3) re-ran `tsx src/db/migrate.ts` to apply 0007 successfully, (4) deleted the temporary tenant row. The migration is now journaled on the test branch DB and 0007 will not re-run.
- **Why 0007 was NOT edited:** Drizzle migration-hash integrity requires applied migrations to be immutable. Editing 0007 after it was applied to production would break the hash check on next migrate.ts run. The correct fix is a future follow-up migration.
- **Follow-up filed:** `.planning/todos/pending/tenant-settings-seed-fk-safe.md` — documents the portable seed pattern (`INSERT ... SELECT ... WHERE EXISTS`) to use for future default-row seeds. Standing convention recommendation: never seed FK-bound rows unconditionally; always guard with `WHERE EXISTS`.

### Approach Note (not a deviation)

Task 1 specified running `drizzle-kit generate` as the first step to produce a template. In practice, the PATTERNS.md document already contains the exact verified SQL shape for this migration (from the pre-research), and all prior hand-written migrations (0005, 0006) confirm that hand-writing directly is the established pattern. The result is identical to what generate+hand-verify would produce, and skips the random filename rename step. All acceptance criteria pass.

## Self-Check

**Files exist:**
- `src/db/migrations/0007_v2_tenant_settings.sql` — FOUND
- `src/db/migrations/meta/_journal.json` (modified) — FOUND

**Commits exist:**
- 716f519 — feat(09-03): add 0007_v2_tenant_settings migration — FOUND
- 6a95bf7 — docs(09-03): complete tenant_settings migration plan — stopped at blocking checkpoint — FOUND
- c6b04ad — docs(09): log FK-safe tenant_settings seed follow-up — FOUND

## Self-Check: PASSED

## Known Stubs

None. This plan creates only a migration file and journal entry — no UI or runtime stubs.

## Threat Flags

None. The migration introduces no new network endpoints, auth paths, or trust boundaries beyond what is modeled in the plan's threat register (T-09-03-T UNIQUE constraint mitigated, T-09-03-D idempotent journal-tracked apply mitigated, T-09-03-FP false-positive trap closed by Task 2 live-apply + verification).
