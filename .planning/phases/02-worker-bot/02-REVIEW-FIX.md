---
phase: "02"
fixed_at: "2026-05-24T13:45:00Z"
review_path: .planning/phases/02-worker-bot/02-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-05-24T13:45:00Z
**Source review:** `.planning/phases/02-worker-bot/02-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (CR-01, CR-02, CR-03, CR-04, CR-05, WR-01, WR-02, WR-03)
- Fixed: 8
- Skipped: 0

---

## Fixed Issues

### CR-01: repromptStep does not rebuild keyboard for keyboard-driven steps

**Files modified:** `src/lib/telegram.ts`
**Commit:** `0aa6389`
**Applied fix:** Rewrote `repromptStep` to check the step parameter. For `STEPS.PROJECT`: calls `resolveWorker` and builds the project selection keyboard via `buildProjectKeyboard`. For `STEPS.BOQ`: queries boq items for the stored `projectId` and builds the BOQ keyboard via `buildBoqKeyboard`. For `STEPS.CONFIRM`: delegates to `handleStepConfirm` which sends the full photo + keyboard. All other steps fall through to plain-text reprompt (photo/location/quantity/notes need no keyboard).

---

### CR-02: parseFloat('Infinity') passes quantity validation

**Files modified:** `src/lib/telegram.ts`
**Commit:** `0aa6389`
**Applied fix:** Changed the guard from `isNaN(parsed)` to `!isFinite(parsed)`. `isFinite` returns false for NaN, Infinity, and -Infinity in one check, closing the `parseFloat('Infinity') > 0` loophole entirely.

---

### CR-03: No try/catch around txDb.transaction() in handleConfirmSubmit

**Files modified:** `src/lib/telegram.ts`
**Commit:** `0aa6389`
**Applied fix:** Wrapped the `txDb.transaction(async (tx) => { ... })` block in `try { ... } catch (_txErr) { await ctx.reply(MESSAGES.genericError); return; }`. The `await ctx.reply(MESSAGES.submitSuccess, ...)` ("Gönderildi") now only executes after the transaction resolves successfully. Failed transactions show `genericError` and leave conversation state intact so the worker can retry.

---

### CR-04: SC4 DB test submits to DATABASE_URL not TEST_DATABASE_URL

**Files modified:** `tests/telegram-bot.test.ts`
**Commit:** `61f7b2c`
**Applied fix:** Added `process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;` at the start of `describeIfDb`'s `beforeEach` hook (before `vi.resetModules()`) and mirrored it in `afterEach`. This ensures the Neon driver sees the test-database URL even if a prior test suite left `DATABASE_URL` pointing at the production database.

---

### CR-05: saveState UPDATE-then-INSERT has a race window

**Files modified:** `src/lib/telegram.ts`, `src/lib/bot-fsm.ts`
**Commit:** `0aa6389`
**Applied fix:** Replaced the two-step UPDATE-then-INSERT pattern with a single atomic `insert().values().onConflictDoUpdate({ target: conversationState.telegramUserId, set: { currentStep, data, updatedAt } })`. This eliminates the race window where two concurrent `/start` requests could both find zero rows on UPDATE and both attempt INSERT, causing a unique-constraint violation. Combined the two separate `await import('drizzle-orm')` calls into one destructured import as a bonus cleanup (also addresses IN-01).

---

### WR-01: personId never stored in JSONB data

**Files modified:** `src/lib/telegram.ts`, `src/lib/bot-fsm.ts`
**Commit:** `0aa6389`
**Applied fix:** Added `personId: workerIdentity.person.id` to the initial `ConversationData` object passed to `saveState` at all three flow-start points: `/start` command handler, `flow:restart` callback, and `flow:new` callback. Also added the `personId?: string` field to the `ConversationData` interface in `bot-fsm.ts` with a JSDoc comment explaining its purpose.

---

### WR-02: String.replace(',', '.') only replaces first comma

**Files modified:** `src/lib/telegram.ts`
**Commit:** `0aa6389`
**Applied fix:** Changed `rawText.trim().replace(',', '.')` to `rawText.trim().replace(/,/g, '.')` (global regex replace). Added multi-dot rejection: count dots via `(normalized.match(/\./g) ?? []).length` and if `dotCount > 1`, reply `rejectNotNumeric` and return. This rejects ambiguous formats like `"1.234,5"` and `"1,234.5"` while accepting single-comma Turkish decimals like `"25,5"`.

---

### WR-03: Confirm summary shows raw UUIDs instead of human-readable labels

**Files modified:** `src/lib/telegram.ts`, `src/lib/bot-fsm.ts`
**Commit:** `0aa6389`
**Applied fix:** In `handleStepProject`, when a project is selected, `newData` now includes `projectName: selectedProject?.name ?? value` alongside `projectId`. In `handleStepBoq`, both the `confirm0` (re-confirm with same item) and `select` paths now include `boqMaterial: selectedItem.material` alongside `boqItemId`. Added `projectName?: string` and `boqMaterial?: string` fields to the `ConversationData` interface in `bot-fsm.ts`.

---

## Test Impact

| Suite | Before | After |
|-------|--------|-------|
| All pure unit tests | 41 pass, 5 fail, 3 skip | 46 pass, 0 fail, 3 skip (DB-gated) |
| (m) flow:resume keyboard rebuild (CR-01) | — new — | 2 pass |
| (n) quantity validation Infinity + ambiguous decimal (CR-02 + WR-02) | — new — | 4 pass |
| (o) confirm summary names not UUIDs (WR-03) | — new — | 1 pass |
| LOG-06 Turkish comma decimal | 1 pass | 1 pass |
| LOG-07 notes:skip / free-text notes | 2 fail (wrong capture) | 2 pass |
| D-16 edit:quantity | 1 pass | 1 pass |
| DB-gated (SC4, SC5) | 3 skip (no TEST_DATABASE_URL on CI) | 3 skip |

**TypeScript:** `npx tsc --noEmit` — clean (0 errors) before and after.

---

_Fixed: 2026-05-24T13:45:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
