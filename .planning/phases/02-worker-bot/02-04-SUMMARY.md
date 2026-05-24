---
phase: 02-worker-bot
plan: "04"
subsystem: bot-pipeline-scaffold
tags: [telegram-bot, fsm, idempotency, tdd, identity-guard, cold-start-resume]
dependency_graph:
  requires: [02-01, 02-02, 02-03]
  provides: [idempotency-middleware, identity-guard, start-handler, iptal-handler, fsm-dispatcher, saveState-helper, resolveWorker-helper, step-stubs]
  affects: [02-05, 02-06]
tech_stack:
  added: []
  patterns: [bot-use-middleware, onConflictDoNothing-dedup, lazy-db-import, call-order-mock, resolveWorker-join, saveState-upsert, grammY-answerCallbackQuery]
key_files:
  created: []
  modified:
    - src/lib/telegram.ts
    - tests/telegram-bot.test.ts
decisions:
  - "Idempotency middleware registered as bot.use() FIRST — before /start, /iptal, or any message handler"
  - "resolveWorker exported helper: telegramUserId (bigint) → { person, projects } | null, reusable by Plan 05"
  - "saveState exported helper: upsert conversation_state + bump updatedAt, used by /start and Plan 05 step handlers"
  - "bot.on('callback_query:data') handles all callbacks in one place: answerCallbackQuery() FIRST, then routes flow:resume/flow:restart/step callbacks"
  - "Step stubs reprompt current step with resumePrefix — Plan 05 fills real bodies (intentional by-design stubs)"
  - "saveState uses UPDATE-then-INSERT pattern (not UPSERT ON CONFLICT) for clarity and correct updatedAt bump"
  - "Test mocks use call-order tracking (selectCallCount) to distinguish people/assignments/conversationState selects"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-24T14:30:00Z"
  tasks_completed: 3
  files_created: 0
  files_modified: 2
---

# Phase 2 Plan 4: Bot Pipeline Scaffold Summary

Worker-bot control spine: idempotency middleware (D-13 Guard 1) fences duplicate update_ids before all handlers; worker identity guard resolves telegramUserId → active person + assigned projects (LOG-01); /start greets registered workers by name with project keyboard, offers Devam/Baştan mid-flow (D-15); /iptal cancels at any step (D-17); FSM dispatcher loads conversation_state, enforces TTL (D-22), and reprompts the current step on cold-start resume (D-14, SC5). Step stubs are named dispatch targets ready for Plan 05 to fill.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 RED | Failing idempotency + identity tests | aaf9b02 | tests/telegram-bot.test.ts |
| 1 GREEN | Idempotency middleware + identity guard + full pipeline scaffold | d3242fb | src/lib/telegram.ts, tests/telegram-bot.test.ts |
| 2 | /start greeting + Devam/Baştan + /iptal tests | c1bd530 | tests/telegram-bot.test.ts |
| 3 | Cold-start resume (SC5) + TTL eviction (D-22) tests | 34fe8b0 | tests/telegram-bot.test.ts |

## Verification Evidence

- `npx vitest run tests/telegram-bot.test.ts` — 21 passed, 0 failed
- `npx vitest run tests/telegram-bot.test.ts -t "idempotency"` — 4 passed
- `npx vitest run tests/telegram-bot.test.ts -t "start"` — 4 passed (7 with unregistered user group)
- `npx vitest run tests/telegram-bot.test.ts -t "resume"` — 3 passed
- `npx tsc --noEmit` — 5 pre-existing errors only (TS2339 callback_data in test file, from Wave 0); zero new errors
- No top-level `@/db` import in telegram.ts confirmed
- `ctx.answerCallbackQuery()` is first call in callback_query handler (line 315)
- Phase 1 webhook auth (secret-token) not regressed — route.ts unchanged

## Implementation Summary

### Idempotency Middleware (D-13 Guard 1, T-02-02)

- `bot.use(...)` registered first on the bot instance
- Lazy-imports `@/db` and `processedUpdates` schema inside the middleware body
- `INSERT processed_updates { updateId: BigInt(updateId) } ON CONFLICT DO NOTHING .returning()`
- If returned array length === 0 → duplicate → returns without calling `next()`
- First delivery → inserts row → calls `await next()`

### resolveWorker Helper (LOG-01, T-02-09)

- Exported async function `resolveWorker(db, telegramUserId: bigint): Promise<WorkerIdentity | null>`
- `db.select().from(people).where(eq(people.telegramUserId, telegramUserId))` → person row
- `db.select({id, name}).from(assignments).innerJoin(projects, ...).where(roleOnProject='worker' AND personId=person.id)` → projects
- Returns `null` when no active people row found (unregistered user path)

### saveState Helper (Plan 05 contract)

- Exported async function `saveState(db, telegramUserId, step, data, personId, flowId?)`
- UPDATE-then-INSERT pattern: tries to UPDATE existing row first; only inserts if no row found
- Bumps `updatedAt: new Date()` on every call (D-22 TTL requirement)
- Used by `/start` clean-start path and available for Plan 05 step handlers

### /start Handler (D-14, D-15, AUTH-02)

- Unregistered user: `pendingPeople` insert + `MESSAGES.pendingApproval` (Phase 1 preserved)
- Registered + no/stale state: `saveState(...)` with PROJECT step + `MESSAGES.greeting(displayName)` + `buildProjectKeyboard()`
- Registered + active non-stale: `MESSAGES.startInProgress` + InlineKeyboard with `flow:resume` / `flow:restart`

### /iptal Handler (D-17)

- Lazy-imports db + conversationState + eq
- `db.delete(conversationState).where(eq(conversationState.telegramUserId, BigInt(...)))`
- Replies `MESSAGES.cancelled` ("İptal edildi")

### callback_query:data Handler (T-02-12)

- First call: `ctx.answerCallbackQuery()` (Pitfall 3 prevention)
- Routes `flow:resume` → loads state + calls `repromptStep()`
- Routes `flow:restart` → `resolveWorker()` + `saveState()` at PROJECT + greeting
- Routes `project:select:*` / `project:page:*` / `boq:select:*` / `boq:page:*` → stub handlers

### FSM Dispatcher — bot.on('message') (D-14, D-22, SC5)

- Guards `ctx.from?.id`
- Lazy-imports db + conversationState + isStaleState
- `db.select().from(conversationState).where(eq(...telegramUserId...))` → state row
- `if (!state || isStaleState(state.updatedAt))` → `MESSAGES.noActiveFlow` (D-22)
- `switch (state.currentStep)` → dispatches to named step stub functions
- Step stubs reprompt `MESSAGES.resumePrefix + stepPrompt` (D-14 cold-start contract)

### Step Stubs (Plan 05 targets)

Seven named exported functions: `handleStepProject`, `handleStepBoq`, `handleStepPhoto`, `handleStepLocation`, `handleStepQuantity`, `handleStepNotes`, `handleStepConfirm`. Each replies `MESSAGES.resumePrefix + <step-prompt>` as the cold-start resume behavior. Plan 05 fills the real bodies.

## Test Groups Added

| Group | Tests | Focus |
|-------|-------|-------|
| idempotency (D-13 Guard 1) | 4 | First delivery runs handler; duplicate skips; BigInt used; insert called |
| unregistered user (identity guard) | 1 | /start with no people row → pendingApproval |
| /start + cancel | 4 | Clean start greeting; startInProgress + Devam/Baştan; /iptal cancels |
| cold-start resume (SC5) + TTL (D-22) | 3 | PHOTO step resume; stale → noActiveFlow; no row → noActiveFlow |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test "first delivery runs handler" needed ctx.reply spy instead of message spy**
- **Found during:** Task 1 GREEN
- **Issue:** Test registered `bot.on('message', spy)` after setupBotForTest(), but the existing `bot.on('message')` FSM dispatcher in telegram.ts already handled and consumed the message without calling `next()`. The spy was never invoked.
- **Fix:** Changed assertion to capture `sendMessage` API calls via transformer, verifying the handler body ran by confirming a reply was produced.
- **Files modified:** tests/telegram-bot.test.ts
- **Commit:** d3242fb (incorporated in GREEN commit)

**2. [Rule 1 - Bug] startInProgress test: double vi.doMock caused incorrect module isolation**
- **Found during:** Task 2 tests
- **Issue:** Test had two `vi.doMock('@/db', ...)` calls with an intermediate `vi.resetModules()`, creating confusing mock state. The second mock was correct but the first was dead code. The `activeState.updatedAt` received by `isStaleState()` was undefined due to mock chain complexity.
- **Fix:** Rewrote to single `vi.doMock` with call-order tracking (`selectCount`) to correctly route people, assignments, and conversationState selects.
- **Files modified:** tests/telegram-bot.test.ts
- **Commit:** c1bd530 (incorporated in Task 2 commit)

**3. [Rule 1 - Bug] New test TS errors: implicit `any` in transformer lambdas**
- **Found during:** Task 1 GREEN TypeScript check
- **Issue:** New transformer lambdas in tests had `_prev`, `method`, `payload` without type annotations (TS7006). The existing `setupBotForTest` transformer used eslint-disable; new tests didn't.
- **Fix:** Added `_prev: any, method: any, payload: any` with `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments.
- **Files modified:** tests/telegram-bot.test.ts
- **Commit:** d3242fb

## Known Stubs

| Stub | File | Lines | Reason |
|------|------|-------|--------|
| handleStepProject | src/lib/telegram.ts | ~528-540 | Intentional — Plan 05 fills real project selection + state advance logic |
| handleStepBoq | src/lib/telegram.ts | ~543-555 | Intentional — Plan 05 fills BOQ selection logic |
| handleStepPhoto | src/lib/telegram.ts | ~558-570 | Intentional — Plan 05 fills photo upload + Blob storage |
| handleStepLocation | src/lib/telegram.ts | ~573-585 | Intentional — Plan 05 fills native location parsing |
| handleStepQuantity | src/lib/telegram.ts | ~588-600 | Intentional — Plan 05 fills numeric validation |
| handleStepNotes | src/lib/telegram.ts | ~603-615 | Intentional — Plan 05 fills notes + skip logic |
| handleStepConfirm | src/lib/telegram.ts | ~618-630 | Intentional — Plan 05 fills confirmation summary + submission insert |

These stubs are by design (per plan spec: "Step BODIES are Plan 05"). They all reprompt the current step with the resume prefix, implementing the D-14 cold-start resume contract while leaving the advance logic for Plan 05.

## Threat Surface Scan

No new security surface introduced beyond what the plan's threat model covers:
- T-02-02 (idempotency/tampering): Mitigated by middleware (D-13 Guard 1)
- T-02-09 (unregistered elevation): Mitigated by resolveWorker null check
- T-02-10 (forged webhook): Not regressed — route.ts unchanged, Phase 1 secretToken still active
- T-02-11 (stale flow info disclosure): Mitigated by isStaleState TTL check (D-22)
- T-02-12 (callback spinner): Mitigated by answerCallbackQuery() as first call

## Self-Check: PASSED

Files exist:
- [x] src/lib/telegram.ts — FOUND
- [x] tests/telegram-bot.test.ts — FOUND (modified)

Commits exist:
- [x] aaf9b02 — Task 1 RED
- [x] d3242fb — Task 1 GREEN
- [x] c1bd530 — Task 2
- [x] 34fe8b0 — Task 3
