---
phase: 02-worker-bot
plan: "05"
subsystem: bot-step-handlers
tags: [telegram-bot, fsm, step-handlers, tdd, input-enforcement, anti-tamper, turkish-decimal]
dependency_graph:
  requires: [02-04, 02-02]
  provides: [step-handlers-project, step-handlers-boq, step-handlers-photo, step-handlers-location, step-handlers-quantity, step-handlers-notes]
  affects: [02-06]
tech_stack:
  added: []
  patterns: [V4-callback-tamper-defense, upload-on-receipt, turkish-decimal-normalize, D25-soft-warning, notes-skip-null, length-cap-injection-bound, notes-skip-dual-path]
key_files:
  created: []
  modified:
    - src/lib/telegram.ts
    - tests/telegram-bot.test.ts
decisions:
  - "handleStepPhoto wraps uploadPhotoToBlob in try/catch — on failure replies photoUploadError and stays on step (T-02-15); bot-photo.ts has no internal try/catch by design"
  - "handleStepNotes called from both message dispatcher (text path) and callback dispatcher (notes:skip path); ctx.answerCallbackQuery() already called at top of callback_query:data handler"
  - "D-25 soft warning uses boq:confirm0:<id> callback to distinguish confirmed-0-balance from normal select — handleStepBoq routes this separately"
  - "Notes length cap is 1000 chars (V5 injection surface bound); notes stored via Drizzle parameterized insert so no SQL risk, cap bounds data size only"
  - "handleStepConfirm is a minimal stub replying confirmSummary — Plan 06 fills the full summary rendering and DB insert"
  - "repromptStep QUANTITY case now uses promptQuantity(data.unit) instead of the Plan-04 placeholder promptNotes"
  - "cold-start resume test updated: text at PHOTO step now correctly triggers rejectNotPhoto (D-19 real handler replaces stub)"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-24T12:43:31Z"
  tasks_completed: 3
  files_created: 0
  files_modified: 2
---

# Phase 2 Plan 5: FSM Step Handlers Summary

Six guided, validated FSM step handlers filling the Plan 04 stubs: project selection with V4 callback-tamper defense, BOQ selection with remaining-balance display and 0-balance soft warning (D-25), photo upload-on-receipt via Vercel Blob with upload error isolation (T-02-15), native-location-only enforcement (D-20), Turkish-decimal-normalized quantity validation (Pitfall 4), and notes with Atla-skip-to-null path (D-21). Each step enforces its input type and reprompts in Turkish without advancing on invalid input (LOG-09). The flow now reaches STEP_CONFIRM ready for Plan 06.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 RED | Failing tests for all six step handlers | 7060efd | tests/telegram-bot.test.ts |
| 1-3 GREEN | Six step handler implementations + test fix | 8791d65 | src/lib/telegram.ts, tests/telegram-bot.test.ts |

## Verification Evidence

- `npx vitest run tests/telegram-bot.test.ts` — 34 passed, 0 failed (was 21 pre-plan)
- `npx vitest run tests/telegram-bot.test.ts -t "selection"` — 4 passed (project + BOQ)
- `npx vitest run tests/telegram-bot.test.ts -t "enforcement"` — 4 passed (photo + location)
- `npx vitest run tests/telegram-bot.test.ts -t "quantity"` — 5 passed (Turkish decimal + notes)
- `npx tsc --noEmit` — 5 pre-existing TS2339 errors only (callback_data on GameButton in test file, Wave 0 origin); zero new errors
- Turkish decimal: `parseFloat('25,5'.replace(',', '.'))` === 25.5 confirmed (Pitfall 4 guard)
- Invalid input never advances current_step; valid input advances exactly one step (LOG-09)

## Implementation Summary

### handleStepProject (LOG-02, V4 anti-tamper)

- Parses `project:select:<id>` / `project:page:<n>` from `ctx.callbackQuery.data`
- On **page**: calls `resolveWorker` to re-fetch assigned projects; re-renders `buildProjectKeyboard(projects, pageNum)` — no step advance
- On **select**: calls `resolveWorker` to re-query assignments — never trusts the callback_data ID (V4)
  - ID not in worker's projects → reprompts `chooseProject` with current keyboard (tamper defense)
  - ID valid → lazy-loads `boqItems` for the selected project, saves `projectId` via `saveState(STEPS.BOQ)`, replies `chooseBoqItem + buildBoqKeyboard(items, 0)`

### handleStepBoq (LOG-03, D-24, D-25, V4)

- Parses `boq:select:<id>` / `boq:page:<n>` / `boq:confirm0:<id>` / `boq:back`
- Always re-queries `boqItems WHERE projectId = data.projectId` before acting (V4)
- On **page**: re-renders `buildBoqKeyboard(items, pageNum)` — no advance
- On **back**: re-renders BOQ keyboard (worker backed out from exhausted warning)
- On **select**: validates id belongs to project BOQ (V4); computes `remainingBalance(planned, approved)`
  - balance > 0 → saves `boqItemId + unit`, advances to `STEPS.PHOTO`, replies `promptPhoto`
  - balance ≤ 0 → replies `exhaustedBoqWarning` with `boq:confirm0:<id>` / `boq:back` keyboard (D-25 soft warning, no advance)
- On **confirm0**: proceeds past 0-balance — saves `boqItemId + unit`, advances to `STEPS.PHOTO`

### handleStepPhoto (LOG-04, D-19, T-02-15)

- Detects `ctx.message?.photo` array (truthy = photo present)
- Non-photo message → replies `MESSAGES.rejectNotPhoto`, returns without advancing (D-19)
- Photo received → calls `uploadPhotoToBlob(ctx, flowId)` in `try/catch`
  - Upload failure → replies `MESSAGES.photoUploadError`, stays on step (T-02-15)
  - Upload success → stores `photoUrl + photoFileId` (last element's file_id — Pitfall 5), advances to `STEPS.LOCATION`, replies `promptLocation`

### handleStepLocation (LOG-05, D-20)

- Detects `ctx.message?.location` (native Telegram location = latitude + longitude present)
- Non-native-location (text, typed coordinates, photo) → replies `MESSAGES.rejectNotLocation` with 📎 → Konum hint, no advance (D-20)
- Native location → stores `locationLat + locationLon`, advances to `STEPS.QUANTITY`, replies `promptQuantity(data.unit)`
- No geofencing — any native location accepted; Phase 4 / GEO-02 boundary preserved

### handleStepQuantity (LOG-06, Pitfall 4)

- Reads `ctx.message?.text`
- **Critical**: normalizes `rawText.replace(',', '.')` BEFORE `parseFloat` (Pitfall 4 — `parseFloat('25,5')` truncates to 25 without replacement)
- Validation: `!isNaN(parsed) && parsed > 0` — rejects non-numeric and non-positive
- Invalid → replies `MESSAGES.rejectNotNumeric`, no advance
- Valid → stores `quantity: parsed` (normalized float), advances to `STEPS.NOTES`, replies `promptNotes` with `InlineKeyboard.text(MESSAGES.skipNotes, 'notes:skip')`

### handleStepNotes (LOG-07, D-21, V5)

- Dual-path entry: called from message dispatcher (text) AND callback dispatcher (`notes:skip`)
- `notes:skip` callback → `notes = null`, advances to `STEPS.CONFIRM` (D-21)
- Text message → `notes = ctx.message.text.slice(0, 1000)` (V5 length cap), advances to `STEPS.CONFIRM`
- After saving state at CONFIRM, calls `handleStepConfirm` to render the confirm message

### handleStepConfirm (D-16, D-18 — stub for Plan 06)

- Minimal stub: replies `MESSAGES.confirmSummary`
- Plan 06 fills: full submission summary with per-field edit buttons, transactional `submissions` INSERT

### dispatchCallbackQuery Updates

- Added routing for `boq:confirm0:*`, `boq:back`, `notes:skip` to their respective handlers
- These were previously unrouted (fell through to repromptStep)

### repromptStep Fix

- QUANTITY step now uses `MESSAGES.promptQuantity(data.unit)` instead of the Plan-04 stub `promptNotes`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] cold-start resume test tested stub behavior, not real D-19 behavior**
- **Found during:** Task 1-3 GREEN
- **Issue:** The Plan-04 cold-start resume test sent a text message to the PHOTO step and expected `resumePrefix + promptPhoto`. The Plan-04 stub correctly returned that. The Plan-05 real handler correctly sends `rejectNotPhoto` for a text message at the PHOTO step (D-19). These are different and the new behavior is correct — `resumePrefix` is shown via `flow:resume` callback path, not on every message.
- **Fix:** Updated the test assertion to match the real D-19 behavior: text at PHOTO step → `rejectNotPhoto`; does NOT produce `resumePrefix`.
- **Files modified:** tests/telegram-bot.test.ts
- **Commit:** 8791d65

## Known Stubs

| Stub | File | Lines | Reason |
|------|------|-------|--------|
| handleStepConfirm | src/lib/telegram.ts | ~780-790 | Intentional — Plan 06 fills confirm summary rendering + transactional submissions INSERT |

## Threat Surface Scan

No new threat surface beyond the plan's threat register:
- T-02-04 (callback_data tamper): Mitigated by V4 re-query in handleStepProject + handleStepBoq
- T-02-12 (callback spinner): Mitigated — ctx.answerCallbackQuery() first in top-level callback_query:data handler
- T-02-13 (input-type FSM advance): Mitigated — each step checks message type and reprompts without advancing
- T-02-14 (notes injection): Mitigated — Drizzle parameterized insert + 1000-char length cap (V5)
- T-02-15 (photo upload crash): Mitigated — uploadPhotoToBlob in try/catch, replies photoUploadError on failure

## Self-Check: PASSED

Files exist:
- [x] src/lib/telegram.ts — FOUND
- [x] tests/telegram-bot.test.ts — FOUND (modified)

Commits exist:
- [x] 7060efd — Task RED: failing tests
- [x] 8791d65 — Task GREEN: six step handlers + test fix
