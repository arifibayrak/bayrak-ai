---
phase: 03-audit-loop
fixed_at: 2026-05-24T20:00:00Z
review_path: .planning/phases/03-audit-loop/03-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-05-24T20:00:00Z
**Source review:** .planning/phases/03-audit-loop/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, CR-02, WR-03, WR-04, WR-07)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Reject free-text handler commits without re-checking auditor authorization

**Files modified:** `src/lib/bot-audit.ts`, `tests/telegram-audit.test.ts`
**Commit:** `b29d45c` (plus `7d09968` for test assertion fix)
**Applied fix:**
Added a full authorization re-validation block at the start of `commitRejection`, mirroring the `handleAuditDecision` Step 1 approach:
1. Re-resolves the caller's `people` row from `ctx.from.id` (not from FSM data) and asserts it matches `auditorPersonId`.
2. Loads the submission's `projectId` from DB.
3. Queries `assignments` for an active `auditor` role on that project.
4. On any auth failure: replies `MESSAGES.auditUnauthorized`, clears the FSM state, and returns — no transaction attempted.

Removed the previous redundant `auditorRows` lookup (display name now comes from `callerRows[0]`). Removed duplicate `submissions`/`eq` top-level imports from the function body (the transaction still uses its own lazy-imported `eq2`/`and2`).

Also added a `describeIfDb` regression test (`CR-01: de-assigned auditor cannot commit a rejection after assignment is revoked`) that:
- Seeds a full tenant/project/assignment/submission
- Drives auditor through `audit:reject:` tap (FSM written)
- DELETEs the assignment from DB (simulates revocation)
- Sends the free-text reason message
- Asserts `submissions.status` remains `pending_audit` and the auditor received the unauthorized reply.

### CR-02: Worker-notification path can silently drop notifications on transient DB read failure

**Files modified:** `src/lib/bot-audit.ts`
**Commit:** `f27c820`
**Applied fix:**
In both `handleAuditDecision` (approve path) and `commitRejection` (reject path):
1. Moved `editAllSiblingMessages` call BEFORE the worker DB lookup — sibling keyboards are now stripped regardless of what happens to the notification lookup.
2. Wrapped the entire worker `db.select` + `bot.api.sendMessage` block in a `try/catch`. A transient DB read error after commit now logs `[...] worker lookup failed (notification skipped)` and continues cleanly, consistent with D-40 best-effort post-commit semantics.

### WR-03: Caption and markup edits not resilient — live keyboard can survive on resolved message

**Files modified:** `src/lib/bot-audit.ts`
**Commit:** `055559e`
**Applied fix:**
Rewrote the per-ref loop in `editAllSiblingMessages` so:
1. `editMessageReplyMarkup` (strip keyboard) runs FIRST in its own `try/catch`.
2. `editMessageCaption` runs SECOND in a separate independent `try/catch`.

A resolved submission can now never retain tappable Approve/Reject buttons even if the caption edit subsequently fails (rate-limit, 48h window). Each call is independently guarded per D-40.

### WR-04: Empty/malformed UUID in callback payload causes unhandled Postgres error

**Files modified:** `src/lib/telegram.ts`
**Commit:** `0db3c62`
**Applied fix:**
Added UUID validation immediately after parsing `submissionId` from the callback data in `dispatchCallbackQuery`, before calling `handleAuditDecision`:
```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_RE.test(submissionId)) {
  const { MESSAGES: MSG } = await import('@/lib/bot-messages');
  await ctx.answerCallbackQuery({ text: MSG.genericError, show_alert: true });
  return;
}
```
An empty string or malformed UUID now produces a clean generic error toast instead of propagating a Postgres `invalid input syntax for type uuid` error.

### WR-07: migrate.ts swallows migration errors and exits 0

**Files modified:** `src/db/migrate.ts`
**Commit:** `7dc1443`
**Applied fix:**
Changed:
```ts
main().catch(console.error);
```
to:
```ts
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```
`scripts/setup-test-db.mjs` checks `r.status !== 0` to detect migration failure — this fix makes that check actually work.

## Skipped Issues

None — all 5 in-scope findings were successfully fixed.

---

## Verification

**TypeScript:** `./node_modules/.bin/tsc --noEmit --skipLibCheck` — clean (0 errors) after all fixes.

**Audit test suite:** `./node_modules/.bin/vitest run tests/telegram-audit.test.ts` — **13/13 passed** (including new CR-01 regression test).

**Full suite:** `./node_modules/.bin/vitest run` — **131/131 passed** across 12 test files. No Phase 1/2 regressions.

---

_Fixed: 2026-05-24T20:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
