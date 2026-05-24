---
phase: 02-worker-bot
plan: "02"
subsystem: bot-lib-modules
tags: [telegram-bot, i18n, fsm, keyboards, vercel-blob, tdd, pure-modules]
dependency_graph:
  requires: [02-01]
  provides: [bot-messages, bot-fsm, bot-keyboards, bot-photo]
  affects: [02-03, 02-04, 02-05, 02-06]
tech_stack:
  added: []
  patterns: [as-const-catalog, pure-fsm-types, paginated-inline-keyboard, vercel-blob-put, tdd-red-green]
key_files:
  created:
    - src/lib/bot-messages.ts
    - src/lib/bot-fsm.ts
    - src/lib/bot-keyboards.ts
    - src/lib/bot-photo.ts
  modified:
    - tests/telegram-bot.test.ts
decisions:
  - "Upload-on-receipt chosen for v1 simplicity (Q1 resolution); orphaned-blob cleanup logged as ops debt"
  - "PAGE_SIZE = 6 for paginated keyboards (D-23, within 6-8 planner range)"
  - "nav row added only when prev or next page exists — no trailing empty row"
  - "bot-messages.ts uses arrow functions for interpolated strings (greeting, promptQuantity) instead of placeholder strings"
  - "bot-photo.ts has no try/catch — caller handles errors, consistent with excel.ts/boq-balance.ts pattern"
metrics:
  duration: "6 minutes"
  completed: "2026-05-24T13:10:50Z"
  tasks_completed: 3
  files_created: 4
  files_modified: 1
---

# Phase 2 Plan 2: Bot Library Modules Summary

Four pure/side-effect-isolated library modules: Turkish message catalog as `as const` (I18N-01/D-26), FSM step types + TTL helper (D-12/D-22), paginated inline keyboard builders with remaining-balance labels (D-23/D-24), and photo download→Vercel Blob upload helper (LOG-04 plumbing). TDD used for keyboard builders; all modules compile clean; 7 new keyboard builder tests pass.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Turkish message catalog + FSM step types/TTL helper | 8d2bbf7 | src/lib/bot-messages.ts, src/lib/bot-fsm.ts |
| 2 RED | Keyboard builder failing tests (TDD RED) | 59672d8 | tests/telegram-bot.test.ts |
| 2 GREEN | Paginated keyboard builders (TDD GREEN) | a328250 | src/lib/bot-keyboards.ts |
| 3 | Photo download → Vercel Blob upload helper | 9ced1ca | src/lib/bot-photo.ts |

## Verification Evidence

- `npx tsc --noEmit` — exits 0 (zero errors in any of the four new files)
- `npx vitest run tests/telegram-bot.test.ts -t "keyboard builders"` — 7 passed, 0 failed
- `npx vitest run tests/telegram-bot.test.ts` — 10 passed (3 Turkish decimal + 7 keyboard builders), 0 failed
- bot-fsm.ts and bot-messages.ts: zero `@/db` imports confirmed (module-load purity)
- bot-photo.ts: uses `photoSizes[photoSizes.length - 1]`, no `try/catch`, `submissions/${submissionFlowId}/` path confirmed

## Module Summary

### src/lib/bot-messages.ts (I18N-01, D-26)
- `export const MESSAGES = { ... } as const` — single Turkish source of truth
- Respectful "siz" form, light emoji affordance cues (📷 📍 ✅) per D-26
- Interpolated messages use arrow functions: `greeting: (name) => ...`, `promptQuantity: (unit) => ...`
- All required keys present: greeting, pendingApproval, noActiveFlow, chooseProject, chooseBoqItem, exhaustedBoqWarning, promptPhoto, rejectNotPhoto, promptLocation, rejectNotLocation, promptQuantity, rejectNotNumeric, promptNotes, confirmSummary, sent ("Gönderildi ✅"), cancelled ("İptal edildi"), resumePrefix ("Devam ediyoruz — "), startInProgress, plus navigation/edit button labels
- No Turkish strings elsewhere in handler code

### src/lib/bot-fsm.ts (D-12, D-22)
- Pure module — no top-level DB imports, no async at module scope
- `STEPS` const: PROJECT/BOQ/PHOTO/LOCATION/QUANTITY/NOTES/CONFIRM (7 values)
- `Step` type derived from `typeof STEPS[keyof typeof STEPS]`
- `ConversationData` interface: step, projectId, boqItemId, photoUrl, photoFileId, locationLat/Lon, quantity, notes, editReturnStep (D-16), page (D-23)
- `CONVERSATION_TTL_MS = 86_400_000` (24h, D-22)
- `isStaleState(updatedAt: Date): boolean` — pure, no side effects

### src/lib/bot-keyboards.ts (D-23, D-24)
- `PAGE_SIZE = 6` (D-23 planner choice)
- `buildBoqKeyboard(items, page)` — per-item label: `"${material} — ${remaining}/${planned} ${unit} kaldı"` (D-24)
  - select: `boq:select:${id}`, nav: `boq:page:${n}`
- `buildProjectKeyboard(projects, page)` — same pagination, `project:select:${id}` / `project:page:${n}`
- nav row absent when items fit in a single page (no trailing empty row)
- imports `remainingBalance` from `@/lib/boq-balance`; no `@/db` import

### src/lib/bot-photo.ts (LOG-04)
- First `@vercel/blob` use in the codebase
- `uploadPhotoToBlob(ctx, submissionFlowId): Promise<string>`
- Uses `photoSizes[photoSizes.length - 1]` (highest resolution — Pitfall 5)
- `ctx.api.getFile(file_id)` → builds `https://api.telegram.org/file/bot${TOKEN}/${path}` URL server-side only (T-02-05)
- `fetch` + throw on `!response.ok` — no internal try/catch (caller handles)
- `put('submissions/${flowId}/photo.${ext}', body, { access: 'public', addRandomSuffix: false })`
- BLOB_READ_WRITE_TOKEN read from env automatically by `@vercel/blob`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] InlineKeyboard trailing empty row**
- **Found during:** Task 2 TDD GREEN
- **Issue:** Calling `.row()` after the last item button (the naive pattern) creates a trailing empty `[]` row in `inline_keyboard`, which makes item count wrong in tests
- **Fix:** Changed loop to call `.row()` between items only (not after last), then call `.row()` before nav buttons if nav exists
- **Files modified:** src/lib/bot-keyboards.ts
- **Commit:** a328250 (incorporated in GREEN commit)

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: info-disclosure | src/lib/bot-photo.ts | TELEGRAM_BOT_TOKEN appears in Telegram file URL — confirmed server-side only, never stored or logged. T-02-05 mitigation in place per threat register. |

## Known Stubs

None. All four modules are complete implementations, not stubs. Tests contain `it.todo()` placeholders for Wave 4/5 FSM handler tests — these are by-design placeholders (bot-messages, bot-fsm, bot-keyboards, and bot-photo are the building blocks those future tests will exercise).

## Self-Check: PASSED

Files exist:
- [x] src/lib/bot-messages.ts — FOUND
- [x] src/lib/bot-fsm.ts — FOUND
- [x] src/lib/bot-keyboards.ts — FOUND
- [x] src/lib/bot-photo.ts — FOUND
- [x] tests/telegram-bot.test.ts — FOUND (modified)

Commits exist:
- [x] 8d2bbf7 — Task 1: bot-messages.ts + bot-fsm.ts
- [x] 59672d8 — Task 2 RED: failing keyboard tests
- [x] a328250 — Task 2 GREEN: bot-keyboards.ts
- [x] 9ced1ca — Task 3: bot-photo.ts
