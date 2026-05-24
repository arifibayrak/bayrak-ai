---
phase: 03-audit-loop
plan: "05"
subsystem: audit-decision-engine
tags: [audit, decision, fsm, authorization, atomic, race-condition, telegram-bot]
dependency_graph:
  requires: [03-04]
  provides: [handleAuditDecision, commitRejection, handleAuditReasonSelect, handleAuditRejectFreeText, audit-dispatch]
  affects: [src/lib/bot-audit.ts, src/lib/telegram.ts, tests/telegram-audit.test.ts]
tech_stack:
  added: []
  patterns: [UPDATE-RETURNING-first-wins, DB-row-FSM-reuse, lazy-import-discipline, vitest-doMock-isolation]
key_files:
  created: []
  modified:
    - src/lib/bot-audit.ts
    - src/lib/telegram.ts
    - tests/telegram-audit.test.ts
decisions:
  - "Reject path calls saveState with getDefaultTenantId() — tests must insert the seed tenant '00000000-0000-0000-0000-000000000001' alongside test-specific tenants (FK constraint)"
  - "vi.doMock factory persistence across vi.resetModules() requires explicit override in live-DB test beforeEach: vi.doMock('@/db', async () => vi.importActual('@/db'))"
  - "AUDIT-01 tests restructured to use real bot + api.config.use transformer instead of vi.doMock('@/lib/telegram', ...) to prevent partial mock leakage"
metrics:
  duration: "~3 hours (cross-session)"
  completed: "2026-05-24"
  tasks_completed: 3
  files_changed: 3
---

# Phase 03 Plan 05: Audit Decision Engine Summary

Implements the authorization + atomic approve + mandatory reject FSM + dispatcher wiring for the Telegram audit loop. All 12 audit tests pass in the full suite including both T-3-RACE mandatory tests.

## What Was Built

**handleAuditDecision** (`src/lib/bot-audit.ts`):
- D-36 authorization: re-queries `submissions` → `people` → `assignments` on every tap; non-assigned tap returns ephemeral `auditUnauthorized` toast, no DB change
- Approve path (D-29): `txDb.transaction()` with `UPDATE submissions SET status='approved', decidedBy, decidedAt WHERE id=? AND status='pending_audit' RETURNING ...` — empty RETURNING throws `AlreadyResolvedError` → "already resolved" toast; inside same transaction increments `boqItems.approvedQty += submittedQuantity` (D-27 increment-only)
- Reject path (D-30/D-31): calls `saveState` to write `AWAITING_REJECT_REASON` FSM row, replies `auditRejectPrompt` with `buildRejectReasonKeyboard()` — submission stays `pending_audit`
- Post-approve: `editAllSiblingMessages` + `bot.api.sendMessage` to worker (D-34, D-37)

**commitRejection** (`src/lib/bot-audit.ts`):
- Single rejection commit point (Pitfall 3): `UPDATE WHERE status='pending_audit'` with `status='rejected', rejectionReason, decidedBy, decidedAt` — no rejection without a reason
- AlreadyResolvedError guard identical to approve path
- On success: deletes `conversation_state`, calls `editAllSiblingMessages`, notifies worker with `MESSAGES.workerRejected(reason)` (D-37)

**handleAuditReasonSelect** (`src/lib/bot-audit.ts`):
- Reads `conversation_state` by `BigInt(ctx.from.id)`, checks staleness
- `'free'` sentinel: re-saves state (keeps submissionId/auditorPersonId), replies `auditRejectFreeTextPrompt`
- Canned reason: calls `commitRejection(...)` immediately

**handleAuditRejectFreeText** (`src/lib/bot-audit.ts`):
- Trims and caps at 500 chars (V5 input validation)
- Empty/whitespace → reprompt `auditRejectFreeTextPrompt` (D-31 — reason is mandatory)
- Non-empty → `commitRejection(...)` with the capped text

**Dispatcher wiring** (`src/lib/telegram.ts`):
- `dispatchCallbackQuery`: `audit:approve:` / `audit:reject:` branches before `conversationState` select — auditors have no FSM row, so the select must be skipped
- `dispatchCallbackQuery`: `audit:reason:` branch lazy-imports `handleAuditReasonSelect`
- `bot.on('message')` switch: `AWAITING_REJECT_REASON` case lazy-imports `handleAuditRejectFreeText`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Default tenant insert required in AUDIT-05 reject tests**
- **Found during:** Task 3 test run (AUDIT-05)
- **Issue:** `saveState` always uses `getDefaultTenantId()` = `'00000000-0000-0000-0000-000000000001'` for `conversation_state.tenant_id`. AUDIT-05 test fixtures insert their own tenant UUIDs (`0006-`, `0007-` series) but not the default tenant. This caused FK constraint violation: `Key (tenant_id)=(00000000-0000-0000-0000-000000000001) is not present in table "tenants"`.
- **Fix:** Added `INSERT INTO tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant') ON CONFLICT DO NOTHING` at the start of both AUDIT-05 test bodies.
- **Files modified:** `tests/telegram-audit.test.ts`
- **Commit:** a8d5afc

**2. [Rule 1 - Bug] vi.doMock factory leakage: AUDIT-01 partial telegram mock contaminated AUDIT-03/04/05/06**
- **Found during:** Test suite integration run
- **Issue:** AUDIT-01 tests used `vi.doMock('@/lib/telegram', () => ({ bot: { api: { sendPhoto } } }))` — a partial mock without `api.config`. vitest's `vi.doMock` factory persists across `vi.resetModules()`. AUDIT-03/04/05/06 called `setupBotForTest()` → `bot.api.config.use(...)` → TypeError: `Cannot read properties of undefined (reading 'use')`.
- **Fix:** Removed all `vi.doMock('@/lib/telegram', ...)` calls from AUDIT-01 tests. Replaced with real bot via `setupBotForTest()` and `api.config.use` transformer pattern to intercept `sendPhoto` calls by method name.
- **Files modified:** `tests/telegram-audit.test.ts`
- **Commit:** a8d5afc

**3. [Rule 1 - Bug] vi.doMock factory leakage: AUDIT-03 mock DB contaminated AUDIT-04/SC3/SC5/05**
- **Found during:** Test suite integration run (after fixing deviation 2)
- **Issue:** AUDIT-03 `beforeEach` called `vi.doMock('@/db', () => ({ db: buildAuditDbMock({ auditorAssigned: false }) }))`. This factory persisted after `vi.resetModules()`. AUDIT-04/05/06 tests got the mock DB (all queries return empty arrays) instead of the live test DB — submissions stayed `pending_audit` because authorization failed silently.
- **Fix:** Added `vi.doMock('@/db', async () => await vi.importActual('@/db'))` + `vi.resetModules()` in `beforeEach` of AUDIT-04, AUDIT-04 SC3, AUDIT-06 SC5, and AUDIT-05. This overrides the AUDIT-03 factory with the real module before each live-DB test.
- **Files modified:** `tests/telegram-audit.test.ts`
- **Commit:** a8d5afc

## Test Results

All 12 audit tests pass in the full suite:

| Test | Status | Type |
|------|--------|------|
| AUDIT-01 SC1: sendPhoto per auditor | PASS | unit/mock |
| AUDIT-01 SC2: no-auditor → no photo | PASS | unit/mock |
| AUDIT-01 SC3: failing send → send_failed=true | PASS | unit/mock |
| AUDIT-02: keyboard callback_data ≤64 bytes | PASS | unit/pure |
| AUDIT-02: callback_data format | PASS | unit/pure |
| AUDIT-03: unauthorized tap → no-op | PASS | unit/mock |
| AUDIT-04: approve sets status+qty | PASS | live DB |
| AUDIT-04 SC3 (T-3-RACE MANDATORY): sequential re-tap → once only | PASS | live DB |
| AUDIT-06 SC5 (T-3-RACE MANDATORY): concurrent race → first wins | PASS | live DB |
| AUDIT-06 DUP: duplicate update_id de-duped | PASS | unit/mock |
| AUDIT-05: reject with canned reason | PASS | live DB |
| AUDIT-05: reject without reason → pending_audit | PASS | live DB |

Phase 2 regression: 49/49 tests still pass.

## Known Stubs

None — all handlers are fully implemented.

## Threat Flags

None — no new network endpoints or auth paths introduced. Decision logic reuses existing `assignments` table check (D-36) with no new trust surfaces.

## Self-Check: PASSED

- `src/lib/bot-audit.ts` — FOUND (modified, 699 lines)
- `src/lib/telegram.ts` — FOUND (modified, 1399 lines)
- `tests/telegram-audit.test.ts` — FOUND (modified, 867 lines)
- Commits ef388e8, 7ee49b1, a8d5afc — all present in git log
