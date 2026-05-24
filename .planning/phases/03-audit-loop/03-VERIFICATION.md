---
phase: 03-audit-loop
verified: 2026-05-24T20:15:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 03: Audit Loop Verification Report

**Phase Goal:** Every assigned auditor receives a Telegram summary of each new submission and can approve or reject it; approved submissions atomically increment the BOQ counter; rejected submissions notify the worker with a reason; double-approval is safely rejected.
**Verified:** 2026-05-24T20:15:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (5 ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | On worker confirm, all assigned auditors receive a Telegram message with photo, Maps link, BOQ item, qty, notes, and Approve/Reject buttons | VERIFIED | `fanOutToAuditors` in `src/lib/bot-audit.ts:80-217` builds caption (BOQ, qty, notes, Maps link `maps.google.com/?q=`), calls `bot.api.sendPhoto` with `buildAuditKeyboard(submissionId)`. AUDIT-01 SC1 test passes. |
| SC2 | A non-assigned user tapping Approve/Reject is rejected with no DB change | VERIFIED | `handleAuditDecision` re-queries `assignments WHERE roleOnProject='auditor'` on every tap (D-36). Non-assigned → `answerCallbackQuery({text: auditUnauthorized, show_alert:true})` + return. AUDIT-03 test passes. |
| SC3 | Approve sets status='approved' and increments approved_qty by exactly the submitted quantity; a second tap is rejected as already-decided | VERIFIED | Atomic `UPDATE submissions SET status='approved' WHERE status='pending_audit' RETURNING` in `getTxDb()` transaction (`bot-audit.ts:399-427`). Empty RETURNING throws `AlreadyResolvedError` → `auditAlreadyResolved` toast. `approved_qty += quantity` via `sql\`approved_qty + ${qty}\`` (D-27 increment-only). AUDIT-04 and AUDIT-04 SC3 (T-3-RACE) both pass. |
| SC4 | Reject prompts for a reason, sets status='rejected', and the worker receives the reason | VERIFIED | `handleAuditDecision` reject branch writes `conversation_state` to `AWAITING_REJECT_REASON` + replies keyboard without touching submissions (D-31). `commitRejection` is the single commit point; sets status='rejected' + rejectionReason + decidedBy/decidedAt in one transaction; notifies worker via `MESSAGES.workerRejected(reason)`. AUDIT-05 (canned + abandon) tests pass. |
| SC5 | Two simultaneous taps → exactly one succeeds, the other gets "already resolved", no double-deduction | VERIFIED | Same UPDATE-RETURNING WHERE status='pending_audit' guard. Postgres serializes concurrent same-row UPDATEs; the second writer matches 0 rows → AlreadyResolvedError. AUDIT-06 SC5 (Promise.all concurrent race) passes — `approved_qty` increments exactly once. |

**Score: 5/5 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema/audit-notifications.ts` | audit_notifications table (D-34) | VERIFIED | Exists; exports `auditNotifications` with submission FK cascade, bigint chatId, integer messageId, boolean sendFailed, two indexes |
| `src/db/schema/submissions.ts` | decided_by / decided_at / rejection_reason columns (D-38) | VERIFIED | Lines 34-36: nullable decidedBy (FK people.id), decidedAt (timestamptz), rejectionReason (text) |
| `src/lib/bot-fsm.ts` | AWAITING_REJECT_REASON + AWAITING_REJECT_REASON_FREE step constants (D-32) | VERIFIED | Lines 35-36 of bot-fsm.ts; STEPS.AWAITING_REJECT_REASON = 'awaiting_reject_reason' |
| `src/lib/bot-keyboards.ts` | buildAuditKeyboard + buildRejectReasonKeyboard (D-30, D-35) | VERIFIED | Both exported; callback_data `audit:approve:<uuid>` = 50 bytes, `audit:reject:<uuid>` = 49 bytes (both ≤64) |
| `src/lib/bot-messages.ts` | 9 Turkish audit/worker decision strings in respectful siz tone | VERIFIED | All 9 keys present: auditOverDelivery, auditRejectPrompt, auditRejectFreeTextPrompt, auditUnauthorized, auditAlreadyResolved, auditApprovedOutcome, auditRejectedOutcome, workerApproved, workerRejected |
| `src/lib/bot-audit.ts` | fanOutToAuditors + editAllSiblingMessages + handleAuditDecision + handleAuditReasonSelect + handleAuditRejectFreeText + commitRejection + AlreadyResolvedError | VERIFIED | All 7 exports confirmed; file is 783 lines with full implementations |
| `src/lib/telegram.ts` | audit: callback dispatch branches + AWAITING_REJECT_REASON message-switch case | VERIFIED | Lines 473-498: audit:approve/reject and audit:reason: branches BEFORE conversation_state load. Line 651: `case STEPS.AWAITING_REJECT_REASON:` → handleAuditRejectFreeText |
| `src/db/migrations/0002_normal_mach_iv.sql` | Phase 3 migration SQL | VERIFIED | CREATE TABLE audit_notifications with ON DELETE CASCADE FK; ALTER TABLE submissions adds decided_by/decided_at/rejection_reason; no DROP statements |
| `src/db/schema/index.ts` | audit-notifications barrel export after submissions | VERIFIED | Line 15: `export * from './audit-notifications';` positioned after submissions export |
| `tests/fixtures/db.ts` | audit_notifications first in truncation order | VERIFIED | Line 56: 'audit_notifications' is first entry, before 'submissions' |
| `tests/telegram-audit.test.ts` | All AUDIT-* test scaffold with mandatory race/atomic tests | VERIFIED | 13 tests across 8 describe blocks including T-3-RACE (AUDIT-04 SC3) and T-3-RACE (AUDIT-06 SC5), all DB-bound gated by describeIfDb |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/db/schema/index.ts` | `src/db/schema/audit-notifications.ts` | barrel export | VERIFIED | `export * from './audit-notifications'` at line 15 |
| `src/db/schema/audit-notifications.ts` | `src/db/schema/submissions.ts` | submissionId FK ON DELETE CASCADE | VERIFIED | `references(() => submissions.id, { onDelete: 'cascade' })` at line 12 |
| `src/lib/telegram.ts handleConfirmSubmit` | `fanOutToAuditors` | `after()` post-transaction hook | VERIFIED | Lines 1390-1401: `after(async () => { fanOutToAuditors(submissionIdForFanOut) })` with direct-await fallback |
| `src/lib/bot-audit.ts fanOutToAuditors` | `audit_notifications` | insert (chatId, messageId) per auditor send | VERIFIED | Lines 188-195 (success path) and 206-214 (sendFailed path) |
| `src/lib/bot-audit.ts fanOutToAuditors` | `assignments` | query roleOnProject='auditor' | VERIFIED | Lines 121-128: `eq(assignments.roleOnProject, 'auditor')` |
| `src/lib/telegram.ts dispatchCallbackQuery` | `handleAuditDecision / handleAuditReasonSelect` | audit:approve / audit:reject / audit:reason prefix branches | VERIFIED | Lines 473-498 of telegram.ts; branches appear before conversation_state load at line 500 |
| `src/lib/bot-audit.ts handleAuditDecision` | `assignments` | re-query roleOnProject='auditor' on every tap (D-36) | VERIFIED | Lines 363-378: fresh DB query on every tap; non-assigned returns auditUnauthorized |
| `src/lib/bot-audit.ts approve transaction` | `boq_items.approved_qty` | UPDATE-RETURNING WHERE status='pending_audit' then sql`approved_qty + qty` | VERIFIED | Lines 399-427; `sql2\`approved_qty + ${affected[0].quantity}\`` |
| `src/lib/bot-audit.ts commitRejection` | worker notification | bot.api.sendMessage to worker telegram_user_id | VERIFIED | Lines 655-666; uses `MESSAGES.workerRejected(reason)` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `fanOutToAuditors` | submission, boqItem, auditorRows | DB selects from submissions/boqItems/assignments/people | Yes — live DB queries | FLOWING |
| `handleAuditDecision` | subRows, auditorPersonRows, assignmentRows | DB selects in handler body | Yes — re-queried on every tap | FLOWING |
| `commitRejection` | workerPersonId from RETURNING | DB transaction UPDATE RETURNING | Yes — from atomic transaction | FLOWING |
| `editAllSiblingMessages` | refs (chatId, messageId) | DB select from audit_notifications | Yes — persisted during fan-out | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| AUDIT-02: callback_data ≤64 bytes | vitest AUDIT-02 | 2 passing tests | PASS |
| AUDIT-03: unauthorized tap no-op | vitest AUDIT-03 | 1 passing test | PASS |
| AUDIT-04: approve increments approved_qty | vitest AUDIT-04 (live DB) | 1 passing test | PASS |
| AUDIT-04 SC3 (T-3-RACE): sequential re-tap once | vitest AUDIT-04 SC3 (live DB) | 1 passing test; approved_qty=25 | PASS |
| AUDIT-06 SC5 (T-3-RACE): concurrent race first-wins | vitest AUDIT-06 SC5 (live DB) | 1 passing test; approved_qty=30 | PASS |
| AUDIT-05: reject with canned reason | vitest AUDIT-05 (live DB) | 2 passing tests (with reason + abandon) | PASS |
| CR-01 regression: revoked auditor cannot commit | vitest CR-01 (live DB) | 1 passing test | PASS |
| Phase 2 regression | vitest telegram-bot.test.ts | 49/49 passing | PASS |

**Full test suite:** `tests/telegram-audit.test.ts` — 13/13 passed (all AUDIT-* including both MANDATORY T-3-RACE tests with live DB against Neon neondb_test). `tests/telegram-bot.test.ts` — 49/49 passed (Phase 2 regression clean).

---

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| AUDIT-01 | 03-04 | All assigned auditors receive Telegram photo message with BOQ item, qty, notes, Maps link | SATISFIED | `fanOutToAuditors` queries assignments WHERE roleOnProject='auditor', sends sendPhoto with caption + keyboard; AUDIT-01 SC1 test passes |
| AUDIT-02 | 03-03, 03-04 | Auditor message includes ✅ Onayla / ❌ Reddet inline buttons | SATISFIED | `buildAuditKeyboard` in bot-keyboards.ts; callback_data format `audit:approve:<uuid>`/`audit:reject:<uuid>` ≤64 bytes; AUDIT-02 test passes |
| AUDIT-03 | 03-05 | Only assigned auditor can act on buttons (server-side authz) | SATISFIED | `handleAuditDecision` re-queries `assignments` on every tap; non-assigned → unauthorized toast, zero DB writes; AUDIT-03 test passes |
| AUDIT-04 | 03-01, 03-05 | Approve sets submission approved, decrements BOQ atomically, no double-deduction | SATISFIED | UPDATE-RETURNING WHERE status='pending_audit' atomic guard; `approved_qty + quantity` increment; AUDIT-04 and AUDIT-04 SC3 tests pass |
| AUDIT-05 | 03-01, 03-05 | Reject prompts for reason, sets status='rejected', notifies worker | SATISFIED | Two-tier FSM (canned + free-text); `commitRejection` is single commit point; worker notified via `workerRejected(reason)`; AUDIT-05 tests pass (canned + abandon) |
| AUDIT-06 | 03-01, 03-05 | First action wins; later action safely rejected; told submission resolved | SATISFIED | Same UPDATE-RETURNING guard handles both concurrent and sequential re-taps; AlreadyResolvedError → `auditAlreadyResolved` toast; AUDIT-06 SC5 (concurrent) and AUDIT-04 SC3 (sequential) tests pass |

**All 6 AUDIT-* requirements: SATISFIED**

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/bot-fsm.ts` | 36 | `AWAITING_REJECT_REASON_FREE` defined but never used | Info (IN-03 from review) | Dead constant; code comment explains it deliberately reuses AWAITING_REJECT_REASON |
| `src/lib/bot-audit.ts` | 28-46 | `getTxDb` duplicated from telegram.ts | Info (IN-01 from review) | Copy acknowledged in header comment; no behavioral impact |
| `src/app/api/telegram/webhook/route.ts` | ~80 | `{ ok: true, phase: 1 }` stale phase marker | Info (IN-04 from review) | Misleading health probe label only |

No BLOCKER or WARNING anti-patterns found in Phase 3 files. No TBD/FIXME/XXX markers in any Phase 3 source file. The three Info items are documented in the code review and have no behavioral impact on the phase goal.

**CR-01 fix verified:** `commitRejection` contains full re-authorization: re-resolves caller from `ctx.from.id` (lines 544-555), re-checks assignment exists (lines 572-590). CR-01 regression test passes.

**CR-02 fix verified:** Post-commit worker lookup is wrapped in try/catch (lines 445-470 for approve, lines 647-673 for reject); `editAllSiblingMessages` is called before the worker lookup in both paths.

**WR-03 fix verified:** `editAllSiblingMessages` strips keyboard (editMessageReplyMarkup) FIRST, then edits caption (editMessageCaption), per lines 262-280. Each is independently try/catch guarded.

**WR-04 fix verified:** UUID regex validation at telegram.ts:480-485 guards against malformed submissionId before any DB query.

---

### Human Verification Required

None identified. All success criteria are verifiable programmatically and all tests pass against the live Neon test database.

---

## Gaps Summary

No gaps. All 5 ROADMAP success criteria are verified. All 6 AUDIT-* requirements are satisfied. Both MANDATORY T-3-RACE tests (AUDIT-04 SC3 and AUDIT-06 SC5) pass against the live Neon test database. Phase 2 regression is clean (49/49). TypeScript typecheck exits 0. The two critical code review findings (CR-01 unauthorized re-validation, CR-02 post-commit notification guard) are verified fixed.

---

_Verified: 2026-05-24T20:15:00Z_
_Verifier: Claude (gsd-verifier)_
