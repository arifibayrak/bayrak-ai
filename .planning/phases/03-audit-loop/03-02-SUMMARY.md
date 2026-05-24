---
phase: "03-audit-loop"
plan: "02"
subsystem: "database"
tags: ["migration", "drizzle", "postgres", "schema", "audit-loop", "blocking"]
dependency_graph:
  requires: ["03-01"]
  provides: ["audit_notifications table", "submissions.decided_by", "submissions.decided_at", "submissions.rejection_reason"]
  affects: ["03-04", "03-05"]
tech_stack:
  added: []
  patterns: ["drizzle-kit generate + migrate() runner (Phase 1/2 convention)", "information_schema verification"]
key_files:
  created:
    - "src/db/migrations/0002_normal_mach_iv.sql"
    - "src/db/migrations/meta/0002_snapshot.json"
  modified:
    - "src/db/migrations/meta/_journal.json"
decisions: []
metrics:
  duration: "~10 minutes"
  completed: "2026-05-24T17:55:00Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase 3 Plan 02: Database Migration — audit_notifications + submissions audit columns

**One-liner:** Drizzle-generated migration adding the audit_notifications table (D-34, 8 cols, 3 FKs, 2 indexes) and decided_by/decided_at/rejection_reason to submissions (D-38), applied to live Neon dev DB via project migrate runner.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Generate Phase 3 migration and inspect SQL | e57ec7e | src/db/migrations/0002_normal_mach_iv.sql, meta/_journal.json, meta/0002_snapshot.json |
| 2 | [BLOCKING] Apply migration to live database | (no new files — DB-state change) | Live Neon neondb |

## Verification Results

### Task 1: Generated SQL Inspection

Migration `0002_normal_mach_iv.sql` confirmed to contain:
- `CREATE TABLE "audit_notifications"` with all 8 columns: id (uuid PK), tenant_id (uuid nullable), submission_id (uuid NOT NULL FK → submissions cascade), auditor_person_id (uuid NOT NULL FK → people), chat_id (bigint), message_id (integer), send_failed (boolean DEFAULT false), sent_at (timestamptz DEFAULT now())
- `ALTER TABLE "submissions" ADD COLUMN "decided_by" uuid` (FK → people)
- `ALTER TABLE "submissions" ADD COLUMN "decided_at" timestamp with time zone`
- `ALTER TABLE "submissions" ADD COLUMN "rejection_reason" text`
- Two indexes: audit_notifications_submission_idx, audit_notifications_auditor_idx
- FK: `ON DELETE cascade` on submission_id (D-34 required)
- No DROP TABLE statements — non-destructive
- No approved_qty CHECK constraint (D-28 honored)
- meta/_journal.json updated with tag `0002_normal_mach_iv` at idx 2

### Task 2: Live DB Apply

- `./node_modules/.bin/tsx src/db/migrate.ts` completed: "Migrations complete"
- Live DB verification (information_schema query, sandbox disabled): `audit_notifications table: EXISTS`, `submissions new columns: decided_at, decided_by, rejection_reason`
- Idempotent re-run: second invocation of migrate runner completed cleanly with "Migrations complete"
- DATABASE_URL was not printed to logs

## Deviations from Plan

None — plan executed exactly as written. The `npx` command references in the plan were replaced with direct invocations of `./node_modules/.bin/drizzle-kit` and `./node_modules/.bin/tsx` per environment_gotchas (no behavioral deviation, just tooling path).

## Threat Model Compliance

| Threat ID | Status |
|-----------|--------|
| T-3-MIG-01 | Mitigated — SQL inspected before apply; no DROP on existing tables confirmed |
| T-3-MIG-02 | Mitigated — [BLOCKING] apply executed; live-DB introspection confirmed new table + columns |
| T-3-SC | N/A — no new packages installed |

## Known Stubs

None — this plan produces only DDL SQL and applies it; no application code, no UI stubs.

## Threat Flags

None — DDL-only migration plan; no new network endpoints, auth paths, or file access patterns introduced.

## Self-Check: PASSED

- src/db/migrations/0002_normal_mach_iv.sql: FOUND
- src/db/migrations/meta/0002_snapshot.json: FOUND
- src/db/migrations/meta/_journal.json: FOUND (updated)
- Commit e57ec7e: FOUND
- Live DB audit_notifications table: EXISTS (verified via information_schema)
- Live DB submissions new columns (decided_at, decided_by, rejection_reason): EXISTS (verified via information_schema)
