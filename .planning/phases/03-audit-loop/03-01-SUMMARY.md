---
phase: 03-audit-loop
plan: "01"
subsystem: schema + fsm + test-scaffold
tags: [drizzle-schema, audit-trail, fsm, tdd, wave-0]
dependency_graph:
  requires: [02-06]
  provides: [audit_notifications-schema, submissions-audit-columns, fsm-reject-steps, audit-test-scaffold]
  affects: [03-02, 03-03, 03-04, 03-05]
tech_stack:
  added: []
  patterns: [drizzle-nullable-columns, pgTable-with-cascade-fk, tdd-red-scaffold, truncateAllTables-fallback]
key_files:
  created:
    - src/db/schema/audit-notifications.ts
    - tests/telegram-audit.test.ts
  modified:
    - src/db/schema/submissions.ts
    - src/db/schema/index.ts
    - src/lib/bot-fsm.ts
    - tests/fixtures/db.ts
decisions:
  - "No CHECK(approved_qty <= planned_qty) constraint added per D-28 — over-delivery is allowed"
  - "audit_notifications table uses cascade FK on submissionId so deleting a submission cleans up its fan-out refs"
  - "truncateAllTables falls back to pre-Phase-3 table list when audit_notifications not yet migrated (42P01 catch)"
  - "AWAITING_REJECT_REASON and AWAITING_REJECT_REASON_FREE added to STEPS const but NOT to ConversationData interface (auditor state shape is different from worker flow data)"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-24T17:41:55Z"
  tasks_completed: 3
  files_changed: 6
---

# Phase 3 Plan 01: Schema Foundation + FSM Steps + Wave 0 Test Scaffold Summary

Drizzle audit-trail columns added to submissions (D-38), audit_notifications table created (D-34/D-40), two auditor FSM step constants added (D-32), and all AUDIT-* behaviors scaffolded as RED Wave 0 tests before any handler is written — satisfying the Nyquist contract.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend submissions + create audit_notifications + register in barrel | 2226062 | src/db/schema/submissions.ts, src/db/schema/audit-notifications.ts, src/db/schema/index.ts |
| 2 | Add FSM steps + audit_notifications to truncation order | e4360ba | src/lib/bot-fsm.ts, tests/fixtures/db.ts |
| 3 (TDD RED) | Wave 0 audit test scaffold | 129805c | tests/telegram-audit.test.ts |
| Rule 1 fix | truncateAllTables fallback for pre-migration state | 8b3b3e4 | tests/fixtures/db.ts |

## Verification

- `tsc --noEmit` exits 0 — schema typechecks before migration (Wave 0 correct behavior)
- `vitest run tests/telegram-audit.test.ts` — 7 failing (DB-bound: audit_notifications not yet migrated), 2 passing (pure unit tests referencing not-yet-implemented exports are red) — NOT all-green, correct Wave 0 state
- Full suite: Phase 1/2 tests pass; SC3/SC4 submission tests fail because `decided_by/decided_at/rejection_reason` columns exist in Drizzle schema but not in test DB yet (expected pre-migration behavior per environment gotchas)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] truncateAllTables broke Phase 1/2 tests after adding audit_notifications**

- **Found during:** Post-Task-3 full suite regression check
- **Issue:** Adding `audit_notifications` to the truncation list caused all `truncateAllTables()` callers (including Phase 1/2 tests) to fail with "relation does not exist" (Postgres 42P01) because the table doesn't exist in the test DB until Plan 03-02 migration
- **Fix:** Added try/catch in `truncateAllTables` — catches 42P01 (undefined_table) or message containing "does not exist" and retries with the pre-Phase-3 table list. After 03-02 migration, the try branch succeeds normally and audit_notifications is truncated with the rest
- **Files modified:** tests/fixtures/db.ts
- **Commit:** 8b3b3e4

## Known Stubs

None — this plan creates schema and test scaffolds only. No UI data sources or handler stubs.

## Threat Flags

None — this plan adds only schema definitions and test scaffolds. No new network endpoints, auth paths, or trust-boundary surfaces are introduced. The decided_by/decided_at/rejection_reason columns and the audit_notifications table are passive data stores; the handlers that write to them (Plans 03-03 through 03-05) will carry the relevant threat analysis.

## TDD Gate Compliance

- RED gate: `test(03-01): Wave 0 audit test scaffold — all AUDIT-* behaviors red` (commit 129805c) — RED committed before any handler implementation
- GREEN gate: not applicable at Wave 0 — handlers land in Plans 03-03 and 03-04
- All AUDIT-* behaviors have named failing test targets; the two MANDATORY tests (T-3-RACE SC3 and T-3-RACE SC5) are present and DB-gated via describeIfDb

## Self-Check

Files created/modified:
- [x] src/db/schema/audit-notifications.ts — FOUND
- [x] src/db/schema/submissions.ts — FOUND (decided_by, decided_at, rejection_reason)
- [x] src/db/schema/index.ts — FOUND (audit-notifications export)
- [x] src/lib/bot-fsm.ts — FOUND (AWAITING_REJECT_REASON, AWAITING_REJECT_REASON_FREE)
- [x] tests/fixtures/db.ts — FOUND (audit_notifications first in list, fallback logic)
- [x] tests/telegram-audit.test.ts — FOUND

Commits:
- [x] 2226062 — feat(03-01): extend submissions + create audit_notifications
- [x] e4360ba — feat(03-01): add AWAITING_REJECT_REASON FSM steps
- [x] 129805c — test(03-01): Wave 0 audit test scaffold
- [x] 8b3b3e4 — fix(03-01): truncateAllTables fallback

## Self-Check: PASSED
