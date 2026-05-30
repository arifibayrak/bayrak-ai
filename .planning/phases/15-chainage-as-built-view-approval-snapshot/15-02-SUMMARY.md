---
phase: 15-chainage-as-built-view-approval-snapshot
plan: "02"
subsystem: bot-audit / migrations
tags: [chainage, snapshot, approval-transaction, backfill-migration, telegram-notification]
dependency_graph:
  requires: ["15-01"]
  provides: ["chainage_m-write-at-approval", "0013-backfill-migration"]
  affects: ["15-04", "15-03"]
tech_stack:
  added: []
  patterns:
    - "Second UPDATE inside txDb.transaction for chainage_m snapshot (Pitfall 1 prevention)"
    - "Postgres ROUND via sql2 template — no JS float multiplication of numeric strings"
    - "formatChainage lazy import in post-commit best-effort path"
    - "MESSAGES.workerApproved converted to optional-param function (backward-compatible)"
key_files:
  modified:
    - src/lib/bot-audit.ts
    - src/lib/bot-messages.ts
    - src/db/migrations/meta/_journal.json
  created:
    - src/db/migrations/0013_v4_chainage_backfill.sql
decisions:
  - "Two-step approach: extend .returning() with segmentFraction + projectId; fetch route in same tx; second UPDATE with Postgres ROUND"
  - "capturedChainageM re-derived in JS (display only) — stored value was computed by Postgres"
  - "workerApproved converted from string to (chainageLabel?: string) => string; backward-compatible zero-arg call still returns original text"
  - "Migration 0013 when=1780182400000 (well after 0012's 1780088633500; Phase 14 epoch lesson applied)"
metrics:
  duration: "4 minutes"
  completed_date: "2026-05-31"
  tasks: 3
  files: 4
---

# Phase 15 Plan 02: Chainage Snapshot Write + Backfill Migration Summary

**One-liner:** Postgres ROUND chainage_m snapshot written atomically inside the approval transaction, calibrated chainage in worker Telegram notification, and backfill migration 0013 authored for historical approvals.

## What Was Built

### Task 1: Chainage snapshot write inside the approval transaction

Modified `handleAuditDecision` in `src/lib/bot-audit.ts`:

- Extended first `UPDATE submissions ... .returning()` to include `segmentFraction` and `projectId`.
- After the existing BOQ approved_qty increment, fetches `totalLengthM`, `geometryVersion`, and `chainageOffsetM` from the `routes` table within the same `txDb.transaction` block.
- Issues a second `tx.update(sub2)` setting `chainageM = sql2\`ROUND(...::numeric * ...::numeric, 2)\`` and `routeGeometryVersion`. Postgres-side ROUND — no JS float multiplication (T-15-02-FLOAT mitigated).
- Both writes are inside the SAME transaction as the `status='approved'` flip — no window where `status='approved'` but `chainage_m IS NULL` (T-15-02-WINDOW mitigated, Pitfall 1 honored).
- Captures `capturedChainageM` and `capturedChainageOffsetM` in outer-scope vars for Task 2.
- Zero calls to `auth()`, `logOfficeActivity`, or `after()` in the file (Pitfall 5 honored).

### Task 2: Calibrated chainage line in worker approval message

Modified `src/lib/bot-messages.ts`:
- `MESSAGES.workerApproved` converted from a fixed string to `(chainageLabel?: string) => string`.
- When `chainageLabel` is provided: appends `\n📍 Konum: {chainageLabel}`.
- When absent: returns original `'✅ Kaydınız onaylandı.'` unchanged (all existing callers remain valid).

Modified `src/lib/bot-audit.ts` (post-commit worker notification block):
- Lazily imports `formatChainage` from `@/lib/format-chainage`.
- Computes `formatChainage(Number(capturedChainageM) + Number(capturedChainageOffsetM))` when chainage is known.
- Passes label to `MESSAGES.workerApproved(chainageLabel)` — same calibrated value as dashboard and export (Pitfall 13 consistency honored).

### Task 3: Backfill migration 0013 (authored, registered — NOT applied)

Created `src/db/migrations/0013_v4_chainage_backfill.sql`:
- Single `UPDATE submissions s SET chainage_m = ROUND(...), route_geometry_version = r.geometry_version FROM routes r WHERE ...`.
- Guards: `AND s.chainage_m IS NULL` (idempotent), `AND s.segment_fraction IS NOT NULL` (excludes no_route), `AND r.total_length_m IS NOT NULL` (Open Question 3 resolution).
- Header documents ESTIMATED nature (current geometry, not historical snapshot), D-49 apply command, and statement-breakpoint guidance for future editors.
- NOT applied in this plan — Plan 15-04 owns the [BLOCKING] apply step.

Updated `src/db/migrations/meta/_journal.json`:
- Registered `idx=13`, `version="7"`, `tag="0013_v4_chainage_backfill"`, `when=1780182400000`.
- `when` strictly greater than 0012's `1780088633500` (Phase 14 epoch lesson applied — stale epoch causes Drizzle to silently skip).
- Migrations 0010–0012 untouched (hash-locked, immutable).

## Verification Results

| Check | Result |
|-------|--------|
| ROUND in Postgres sql2 template | `sql2\`ROUND(${segFrac}::numeric * ${totLen}::numeric, 2)\`` at line 481 |
| Pitfall 5 (no auth/logOfficeActivity/after in code) | 0 non-comment occurrences |
| `formatChainage` imported in bot-audit.ts | 3 occurrences (comment + import + call) |
| Migration 0013 file exists with UPDATE submissions | 1 match |
| Journal idx=13 with when=1780182400000 > 0012 epoch | Verified |
| `npx tsc --noEmit` | PASSED |
| `npx vitest run tests/telegram-audit.test.ts` | 13/13 PASSED |

## Deviations from Plan

None — plan executed exactly as written.

**Note on Pitfall 5 grep count:** The plan specifies `grep -cE "logOfficeActivity|after\(|@/lib/auth" src/lib/bot-audit.ts` = 0. The actual count is 2 because both occurrences are in comment lines (one pre-existing from Phase 12, one added in this plan's descriptive comment). No actual function calls to these exist in the file — the functional constraint is fully honored. The comment-stripping form `grep -v '^\s*//' ... | grep -cE ...` returns 0.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what was planned in the threat model. All three STRIDE threats mitigated as designed (T-15-02-WINDOW, T-15-02-FLOAT, T-15-02-BOTAUTH, T-15-02-MIGSKIP).

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1 + 2: chainage snapshot + worker notification | `bcbc1b1` | src/lib/bot-audit.ts, src/lib/bot-messages.ts |
| Task 3: migration 0013 authored + journal registered | `fd94c26` | src/db/migrations/0013_v4_chainage_backfill.sql, src/db/migrations/meta/_journal.json |

## Self-Check: PASSED

All created/modified files confirmed to exist on disk. All commits confirmed in git log:
- `bcbc1b1`: feat(15-02): write chainage_m snapshot in approval tx + calibrated worker notification
- `fd94c26`: chore(15-02): author backfill migration 0013 + register in journal (NOT applied)
