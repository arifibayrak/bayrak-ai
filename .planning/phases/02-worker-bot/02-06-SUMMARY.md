---
phase: 02-worker-bot
plan: "06"
subsystem: bot-confirm-submit
tags: [telegram-bot, fsm, confirm-step, submission-insert, idempotency, tdd, transactions, neon-serverless, SC3, SC4]
dependency_graph:
  requires: [02-05, 02-04, 02-02]
  provides: [confirm-step-summary, per-field-edit, transactional-submission-insert, SC3-persistence-test, SC4-idempotency-test]
  affects: [03-audit-loop]
tech_stack:
  added: []
  patterns: [getTxDb-neon-serverless-transaction, onConflictDoNothing-guard2, editReturnStep-jump-return, replyWithPhoto-summary, vi-doMock-importActual-restore]
key_files:
  created: []
  modified:
    - src/lib/telegram.ts
    - tests/telegram-bot.test.ts
decisions:
  - "getTxDb copied exactly from src/actions/people.ts (neon-serverless Pool + ws require/try-catch pattern) — neon-http cannot do transactions (Pitfall 2)"
  - "editReturnStep=CONFIRM is set by edit:<field> callback; step handlers check it after successful capture and route back to CONFIRM instead of linear next step"
  - "handleStepConfirm uses replyWithPhoto(data.photoUrl, {caption, reply_markup}) with per-field edit buttons + confirm:submit button (D-16)"
  - "confirm:submit loads state from DB (authoritative flowId), validates required fields, runs getTxDb().transaction with insert + delete atomically (T-02-16)"
  - ".onConflictDoNothing() on submissions.flowId (D-13 Guard 2) prevents double-confirm double-insert"
  - "Gönderildi reply with single flow:new button — NO auto-loop (D-18); worker explicitly starts new flow"
  - "SC4 tests use vi.doMock with importActual to restore real @neondatabase/serverless in beforeEach — prevents unit test mock bleeding into live-DB tests"
  - "SC4 Guard 2 test re-seeds conversation_state with same flowId after first confirm to prove submissions_flow_id_unique + onConflictDoNothing works independently of Guard 1"
metrics:
  duration: "~40 minutes"
  completed: "2026-05-24T15:00:00Z"
  tasks_completed: 3
  files_created: 0
  files_modified: 2
---

# Phase 2 Plan 6: Confirm Step + Transactional Submission Insert Summary

Closes the exactly-once, durable submission contract: D-16 confirm step renders captured photo + summary caption with per-field edit buttons (jump-to-step → return-to-confirm); D-18 Gönderildi + Yeni kayıt reply; LOG-08 transactional `submissions` INSERT using `getTxDb()` neon-serverless Pool (WebSocket driver) with `onConflictDoNothing` on `flow_id`; conversation_state DELETE in the same transaction. The mandatory SC3 persistence test and SC4 duplicate-update integration tests both run green against the live Neon test DB, proving exactly-once submission end-to-end.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Confirm step summary + per-field edit (D-16) | 8a31ca1 | src/lib/telegram.ts, tests/telegram-bot.test.ts |
| 2 | Transactional submission insert + Gönderildi/Yeni kayıt (LOG-08, D-18) | 8f613db | tests/telegram-bot.test.ts |
| 3 | SC3 persistence + SC4 duplicate-update integration tests (mandatory) | 3b8f139 | tests/telegram-bot.test.ts |

## Verification Evidence

- `npx vitest run tests/telegram-bot.test.ts` — **42 passed, 0 failed** (was 34 pre-plan)
- `npx vitest run` (full suite) — **111 passed, 0 failed**
- `npx tsc --noEmit` — zero new errors (TypeScript clean throughout)
- SC3 test: live DB — 1 submissions row, status=pending_audit, conversation_state deleted
- SC4 Guard 1+2 test: live DB — same update_id twice → exactly 1 submissions row
- SC4 Guard 2 only test: live DB — different update_ids, same flow_id → exactly 1 row (onConflictDoNothing)
- TEST_DATABASE_URL present in .env.local — SC3/SC4 tests executed (not skipped)

## Implementation Summary

### handleStepConfirm (D-16, replyWithPhoto)

- Sends captured photo via `ctx.replyWithPhoto(data.photoUrl, { caption, reply_markup })`
- Caption: MESSAGES.confirmSummary + project / BOQ material / quantity+unit / location presence / notes
- Inline keyboard per D-16: `edit:photo`, `edit:location`, `edit:quantity`, `edit:notes`, `edit:boq` buttons + `confirm:submit` button
- Falls back to `ctx.reply(caption)` if photoUrl is absent (defensive guard for edge cases)

### Per-field edit flow (D-16)

- `edit:<field>` callback: sets `editReturnStep = STEPS.CONFIRM` in data, saves state at the target step, reprompts that step
- Step handlers (photo, location, quantity, notes) check `data.editReturnStep` after successful capture:
  - If `editReturnStep === STEPS.CONFIRM`: clear it, save state at CONFIRM, call `handleStepConfirm` (returns to confirm, not linear next step)
  - Otherwise: advance linearly as before (normal flow unaffected)

### getTxDb (Pitfall 2 guard)

- Copied EXACTLY from `src/actions/people.ts` lines 21-38 (neon-serverless Pool + ws require/try-catch)
- Used ONLY for the transactional `confirm:submit` insert (neon-http default @/db used for all reads)

### handleConfirmSubmit (LOG-08, D-13 Guard 2, T-02-16)

- Re-loads conversation_state from DB to get authoritative flowId, personId, and captured data
- Validates required fields (projectId, boqItemId, photoUrl, quantity) before transacting (T-02-17)
- `txDb.transaction(async tx => { insert submissions + delete conversation_state })`
- `insert submissions.values({...}).onConflictDoNothing()` — flow_id unique constraint prevents double-confirm (D-13 Guard 2)
- Numeric columns (locationLat, locationLon, quantity) receive string values per Drizzle numeric type
- After transaction: `ctx.reply(MESSAGES.sent, { reply_markup: doneKeyboard })` with single `flow:new` button (D-18)

### flow:new + flow handling

- `flow:new` callback: resolves worker, calls saveState at PROJECT step, replies greeting + project keyboard
- Exactly mirrors the `flow:restart` path — no auto-loop into new flow (D-18)

### SC3/SC4 Integration Tests

- `describeIfDb('submission persistence & idempotency (SC4)')` — 3 tests
- **beforeEach**: vi.resetModules() twice, importActual restore for @neondatabase/serverless and drizzle-orm/neon-serverless (prevents unit test mock bleeding), seeds tenant/project/boqItem/person/assignment/conversation_state
- **SC3**: drives `confirm:submit` → asserts 1 row with status=pending_audit + state row deleted
- **SC4 (Guard 1+2)**: sends same update_id twice → asserts count=1
- **SC4 (Guard 2 only)**: different update_ids, same flow_id, re-seeds state row between confirms → asserts count=1

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.doMock('@neondatabase/serverless') mock bleeding into SC4 tests**
- **Found during:** Task 3 integration tests
- **Issue:** The submission insert unit tests (Task 2) install `vi.doMock('@neondatabase/serverless', ...)` without a `neon` export. vitest's `vi.doMock` factories persist beyond `vi.resetModules()` until explicitly replaced. When the SC4 `beforeEach` called `getTestDb()`, it got the partial mock (missing `neon`) and threw "No 'neon' export is defined".
- **Fix:** SC4 `beforeEach` calls `vi.doMock('@neondatabase/serverless', async () => await vi.importActual('@neondatabase/serverless'))` and same for `drizzle-orm/neon-serverless` to restore the real modules before `getTestDb()`.
- **Files modified:** tests/telegram-bot.test.ts
- **Commit:** 3b8f139

## Known Stubs

None — all confirm step logic and submission insert are fully implemented. The Phase 2 worker flow is complete end-to-end.

## Threat Surface Scan

No new security surface beyond the plan's threat register:
- T-02-01 (double-confirm): Mitigated — `onConflictDoNothing()` on `submissions_flow_id_unique` (D-13 Guard 2); proven by SC4 Guard 2 test
- T-02-02 (replayed update_id): Mitigated — processed_updates dedup middleware (D-13 Guard 1); proven by SC4 Guard 1+2 test
- T-02-16 (partial write): Mitigated — insert + state delete in ONE `getTxDb()` transaction
- T-02-17 (confirm without complete payload): Mitigated — required fields validated before transaction; missing fields abort with genericError reply

## SC4 Gate Status (mandatory per D-13 / STATE.md Phase 2 blocker)

TEST_DATABASE_URL was available (set in .env.local). SC3 and SC4 tests executed against the live Neon test DB and passed:
- SC3: 1 submissions row, status=pending_audit, conversation_state deleted ✓
- SC4 Guard 1+2: same update_id twice → exactly 1 row ✓
- SC4 Guard 2: double-confirm with different update_ids, same flow_id → exactly 1 row ✓

## Self-Check: PASSED

Files exist:
- [x] src/lib/telegram.ts — FOUND
- [x] tests/telegram-bot.test.ts — FOUND (modified)

Commits exist:
- [x] 8a31ca1 — Task 1: confirm step summary + per-field edit
- [x] 8f613db — Task 2: transactional submission insert + Gönderildi
- [x] 3b8f139 — Task 3: SC3/SC4 integration tests
