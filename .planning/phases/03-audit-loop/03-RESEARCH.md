# Phase 3: Audit Loop - Research

**Researched:** 2026-05-24
**Domain:** grammY callback_query handling, atomic Drizzle transactions with SELECT FOR UPDATE, multi-auditor fan-out message lifecycle, DB-row FSM for reject-reason capture, schema additions for audit decision trail
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**BOQ Approval Semantics (AUDIT-04)**
- **D-27:** Approve **increments `boq_items.approved_qty`** by the submission's `quantity`, inside the atomic decision transaction. "Remaining balance" (`planned_qty − approved_qty`, via `src/lib/boq-balance.ts`) is the derived view.
- **D-28:** **Over-delivery is allowed — NO `CHECK (approved_qty <= planned_qty)` constraint.** When an approval would push `approved_qty` past `planned_qty`, the auditor's notification message carries a visible warning flag ("⚠ Sözleşmeyi aşıyor — X/Y [unit]").

**Atomicity & Race Safety (AUDIT-04, AUDIT-06)**
- **D-29:** **First-action-wins via a single DB transaction** on the `neon-serverless` WebSocket Pool driver. The decision locks the submission row (`SELECT … FOR UPDATE`) guarded by `WHERE status='pending_audit'`; if the row is already decided, the action is a no-op that returns "already resolved". The Phase 2 `processed_updates` idempotency fence (**D-13 Guard 1**) additionally de-dupes replayed callback updates at the webhook level.

**Reject Reason Flow (AUDIT-05)**
- **D-30:** Reject is a **two-tier capture**: tapping ❌ Reddet presents an inline keyboard of **canned Turkish reasons + a "Başka (yaz)" free-text option**.
  Initial reason set: "Yetersiz iş", "Yanlış konum", "Eksik/bulanık fotoğraf", "Yanlış miktar", "Başka (yaz)".
- **D-31:** A reason is **MANDATORY** — the rejection is not committed until a reason (canned or typed) is provided. If the auditor abandons, the submission **stays `pending_audit`** and remains actionable by other auditors.
- **D-32:** The free-text ("Başka") path **reuses the D-12 DB-row FSM pattern** for auditor-side state — a `conversation_state`-style row keyed by the auditor's `telegram_user_id`, `current_step = 'awaiting_reject_reason'`, with `data` carrying the target submission/flow id. Planner decides whether to extend the existing `conversation_state` table or add a sibling.

**Multi-Auditor Fan-out & Message Lifecycle (AUDIT-01, AUDIT-02, AUDIT-06)**
- **D-33:** On worker confirm, **fan out one Telegram message per assigned auditor** of that project (`assignments WHERE role_on_project='auditor'` → `people.telegram_user_id`). Each message includes the photo, a Google Maps link, the BOQ material + unit, the quantity, the notes, and inline [✅ Onayla] / [❌ Reddet] buttons.
- **D-34:** **Persist every fan-out message's `chat_id` + `message_id`** (keyed to the submission). On the first decision, **edit ALL of them**: strip the buttons and append the outcome. Planner picks storage: a dedicated `audit_notifications` table vs a `jsonb` array on `submissions`.
- **D-35:** **A single tap is final** — Approve commits immediately; Reject moves straight to the reason step. No confirmation dialog.

**Authorization (AUDIT-03)**
- **D-36:** Button callbacks are **authorized server-side at action time**: only a person with an active `'auditor'` assignment on **that submission's project** may act. Authorization is re-checked against `assignments` on every tap, never trusted from message receipt.

**Decision Feedback & Audit Trail (AUDIT-04, AUDIT-05)**
- **D-37:** The **worker is notified on BOTH outcomes** via Telegram.
- **D-38:** The `submissions` table gains **`decided_by`** (uuid → `people.id`), **`decided_at`** (timestamptz), and **`rejection_reason`** (text).

**Edge Cases**
- **D-39:** **No auditor assigned** → submission stays `pending_audit`; log + best-effort notify the office engineer.
- **D-40:** **Best-effort fan-out** — one failed send must not block other auditors or worker confirmation; record the failure.

### Claude's Discretion

- Photo delivery via Telegram `file_id` (`submissions.photo_file_id`) where available, falling back to the Blob `photo_url`.
- Exact SQL for the atomic decision transaction (D-29).
- Storage shape for fan-out message refs (D-34): dedicated `audit_notifications` table vs `jsonb` array on `submissions`.
- Whether the auditor reject-FSM extends `conversation_state` or adds a sibling table (D-32).
- Final Turkish microcopy/wording for auditor and worker messages (within D-26 tone).
- New schema column/index naming; honor `tenant_id`-on-every-insert (D-09 / `getDefaultTenantId()`). New tables register in `src/db/schema/index.ts` and require a generated drizzle migration + push.

### Deferred Ideas (OUT OF SCOPE)

- Location anomaly flag in the auditor message — GEO-02, Phase 4.
- AI advisory flags — AI-03, Phase 6.
- Dedicated mobile-web auditor review view — AUDIT-V2-01.
- Per-segment / chainage-scoped auditor assignment — AUDIT-V2-02.
- SLA / escalation if no auditor acts within a time window.
- Editing or undoing a decision after the fact.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUDIT-01 | When a worker confirms, every assigned auditor for that project receives a Telegram message with photo, location/map link, selected BOQ item, quantity, and notes | D-33; fan-out via `assignments WHERE role_on_project='auditor'`; `bot.api.sendPhoto` + `bot.api.sendMessage` per auditor |
| AUDIT-02 | The auditor message includes inline [✅ Approve] and [❌ Reject] buttons | InlineKeyboard with callback_data encoding submission id + action (≤64 bytes) |
| AUDIT-03 | Only an auditor assigned to that project can act on the buttons (authorization enforced server-side) | D-36; re-query `assignments` on every callback_query tap; `ctx.answerCallbackQuery()` with rejection toast on unauthorized tap |
| AUDIT-04 | On Approve, the submission becomes `approved` and the BOQ line item's `approved_qty` increments atomically, no double-deduction on duplicate callbacks | D-27, D-29; single DB transaction via neon-serverless Pool + `.for('update')` lock + `WHERE status='pending_audit'` guard |
| AUDIT-05 | On Reject, the bot prompts the auditor for a text reason, sets `status: rejected`, and notifies the worker with the reason | D-30, D-31, D-32; two-tier canned-reason keyboard + DB-row FSM for free-text path |
| AUDIT-06 | With multiple auditors assigned, the first action wins; a later action on an already-decided submission is safely rejected | D-29; `SELECT FOR UPDATE WHERE status='pending_audit'` RETURNING — empty result = already resolved; `answerCallbackQuery` with "Bu kayıt zaten çözüldü" toast |
</phase_requirements>

---

## Summary

Phase 3 adds the auditor side of the trust loop entirely within the existing grammY bot (`src/lib/telegram.ts`) and webhook route. No new bot instance or webhook endpoint is needed — auditor `callback_query` updates arrive through the same POST handler and are dispatched by new handlers registered on the existing `bot`.

The most consequential design constraint is the **atomic first-action-wins transaction** (D-29). The confirmed Drizzle pattern is `.for('update')` on a SELECT inside `txDb.transaction()` (the `neon-serverless` Pool driver — the same `getTxDb()` helper already established in Phase 2). The lock mode is `LockStrength = 'update'`, confirmed by inspecting `node_modules/drizzle-orm/pg-core/query-builders/select.types.d.ts` in the installed `drizzle-orm@0.45.2`. An equivalent, simpler alternative that avoids the two-step SELECT+UPDATE is an `UPDATE submissions SET status='approved' WHERE id=? AND status='pending_audit' RETURNING id` — if the RETURNING array is empty, the submission was already decided. Both approaches are correct; the UPDATE-RETURNING pattern is preferred for its single round-trip.

The **multi-auditor fan-out** (D-33/D-34) fires inside `handleConfirmSubmit` via Next.js `after()` so it does not hold up the worker's "Gönderildi" reply. A dedicated `audit_notifications` table is the recommended storage shape for fan-out `chat_id`+`message_id` refs — cleaner to query for the "edit all siblings on decision" operation than a JSONB array on `submissions`.

The **auditor reject-reason FSM** (D-32) reuses the existing `conversation_state` table extended with two new `currentStep` values (`'awaiting_reject_reason'` and `'awaiting_reject_reason_free'`). The one-active-flow-per-telegram-user-id constraint means an auditor mid-reject and a worker mid-log cannot coexist — this is the stated acceptable edge case.

**Primary recommendation:** Extend `bot`'s `callback_query:data` dispatcher in `telegram.ts` with a new `audit:` prefix branch. Implement the decision transaction as UPDATE-RETURNING (simpler than SELECT FOR UPDATE). Use `after()` for fan-out. Store fan-out refs in `audit_notifications`. Extend `conversation_state` for reject-reason FSM. Add three columns to `submissions`, generate migration, push.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Auditor fan-out notification (send messages on worker confirm) | API / Backend (webhook route → `after()`) | Telegram API | Fires after 200 response to keep worker confirm fast; D-40 best-effort semantics |
| `callback_query` receipt + secret-token check | API / Backend (webhook route) | — | Same `webhookCallback` path already handles all update types; no change to route.ts needed |
| Callback `update_id` dedup | API / Backend (idempotency middleware in `telegram.ts`) | Database (`processed_updates`) | First middleware already running — catches replayed callback_query updates at Guard 1 |
| Auditor authorization (re-check assignment on tap) | API / Backend (callback handler) | Database (`assignments`) | Never trust callback_data alone; re-query on every tap (D-36) |
| First-action-wins atomic decision transaction | Database (Neon via neon-serverless Pool) | API / Backend (handler) | DB transaction is the only correct boundary for atomicity + race safety (D-29) |
| `boq_items.approved_qty` increment | Database (inside decision transaction) | — | Must be in the same transaction as the status update — D-27 |
| Fan-out message ref persistence | Database (`audit_notifications` table) | — | Enables "edit all siblings on decision" without JSONB scan |
| Edit all sibling auditor messages on decision | API / Backend (callback handler) | Telegram API | `bot.api.editMessageReplyMarkup` per stored `(chat_id, message_id)` pair |
| Worker decision notification | API / Backend (callback handler) | Telegram API | `bot.api.sendMessage` to the submission's `personId` → `people.telegram_user_id` |
| Auditor reject-reason FSM state | Database (`conversation_state` extended) | — | Reuse D-12 pattern; one active flow per `telegram_user_id` |
| Schema additions + migration | Database (Drizzle migration) | — | `drizzle-kit generate` + push; new table registers in `schema/index.ts` |

---

## Standard Stack

### Core (no new installs required — all already installed)

| Library | Installed Version | Purpose | Why Standard |
|---------|------------------|---------|--------------|
| `grammy` | 1.43.0 [VERIFIED: npm registry] | `bot.callbackQuery()`, `ctx.answerCallbackQuery()`, `bot.api.sendPhoto`, `bot.api.editMessageReplyMarkup`, `InlineKeyboard` | Same bot already handling Phase 2; callback_query updates arrive through the same webhook |
| `drizzle-orm` | 0.45.2 [VERIFIED: npm registry] | `.for('update')` SELECT locking, `db.transaction()`, UPDATE RETURNING | `.for('update')` confirmed in `select.types.d.ts` of installed version |
| `@neondatabase/serverless` | 1.1.0 [VERIFIED: npm registry] | `getTxDb()` WebSocket Pool for transactions | Already established in Phase 2 `handleConfirmSubmit`; neon-http does NOT support transactions |
| `next` | 15.5.18 [VERIFIED: npm registry] | `after()` for non-blocking fan-out after 200 | `after()` is stable in Next.js 15.1+; confirmed used in Phase 2 research |
| `zod` | 4.4.3 [VERIFIED: npm registry] | Callback data parsing validation | Already installed |

### No new packages to install

Phase 3 is code-only (new handlers, new schema files). All required packages were installed in Phase 1/2.

---

## Package Legitimacy Audit

No new packages are installed in this phase. All packages above were verified in Phase 1/2 research.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Worker confirm (Phase 2 handleConfirmSubmit)
        │
        │  after(() => fanOutToAuditors(submissionId))
        ▼
┌─────────────────────────────────────────────────────────────┐
│  fanOutToAuditors(submissionId)                             │
│  ─ load submission + boq_item + project                     │
│  ─ load auditors: assignments WHERE role_on_project='auditor'│
│      → people.telegram_user_id                              │
│  ─ for each auditor (best-effort, D-40):                    │
│      bot.api.sendPhoto(chat_id, file_id|url, {              │
│        caption: "[material] [qty] [notes] [maps link]",     │
│        reply_markup: buildAuditKeyboard(submissionId)       │
│      })                                                     │
│      → store (chat_id, message_id) in audit_notifications   │
│  ─ if no auditors (D-39): log warning + notify office       │
└─────────────────────────────────────────────────────────────┘

Auditor taps ✅ Onayla or ❌ Reddet
        │
        │  POST /api/telegram/webhook  (callback_query update)
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Middleware 1: processed_updates dedup (D-13 Guard 1)       │
│  → duplicate update_id? return (200, no-op)                 │
│                                                             │
│  callback_query:data dispatcher                             │
│  ─ data starts with 'audit:approve:' or 'audit:reject:'?   │
│      → handleAuditDecision(ctx, action, submissionId)       │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  handleAuditDecision(ctx, action, submissionId)             │
│                                                             │
│  1. ctx.answerCallbackQuery() FIRST (clears spinner)        │
│  2. Re-check authorization (D-36):                          │
│     query assignments: is ctx.from.id an auditor            │
│     on this submission's project?                           │
│     NO → answerCallbackQuery({text:'Yetkisiz'}) + return    │
│                                                             │
│  3a. action === 'approve':                                   │
│     txDb.transaction(async tx => {                          │
│       const rows = await tx.select().from(submissions)      │
│         .where(and(eq(id, submissionId),                    │
│                   eq(status,'pending_audit')))              │
│         .for('update')                                      │
│       if (rows.length === 0) → "already resolved"           │
│       await tx.update(submissions).set({                    │
│         status:'approved', decidedBy: auditorPersonId,      │
│         decidedAt: now()                                    │
│       }).where(eq(id, submissionId))                        │
│       await tx.update(boqItems).set({                       │
│         approvedQty: sql`approved_qty + ${qty}`             │
│       }).where(eq(id, boqItemId))                           │
│     })                                                      │
│     ─ check over-delivery (D-28): warn in edit text         │
│     ─ editAllSiblingMessages("✅ Onaylandı — [Auditor]")    │
│     ─ bot.api.sendMessage(workerChatId, "✅ Kaydınız ...")  │
│                                                             │
│  3b. action === 'reject' (D-30):                            │
│     ─ show canned-reason keyboard to tapping auditor        │
│     ─ store auditor intent in conversation_state            │
│       (current_step='awaiting_reject_reason',               │
│        data={submissionId, auditorPersonId})                │
│     ─ do NOT commit rejection yet (D-31)                    │
│                                                             │
│  When reason selected (canned or typed):                    │
│     txDb.transaction(async tx => {                          │
│       UPDATE submissions WHERE id=? AND status='pending_audit'│
│       SET status='rejected', decidedBy=?, decidedAt=?,      │
│           rejectionReason=?                                 │
│       RETURNING id                                          │
│     })                                                      │
│     if empty RETURNING → already resolved toast             │
│     ─ editAllSiblingMessages("❌ Reddedildi — [reason]")    │
│     ─ bot.api.sendMessage(workerChatId, "❌ Kaydınız ...")  │
│     ─ delete conversation_state row for auditor             │
└─────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (additions to Phase 2)

```
src/
├── lib/
│   ├── telegram.ts           # extend: add audit callback dispatcher + handlers
│   ├── bot-keyboards.ts      # extend: add buildAuditKeyboard, buildRejectReasonKeyboard
│   ├── bot-messages.ts       # extend: add auditor + worker outcome messages
│   └── bot-audit.ts          # NEW: fanOutToAuditors, editAllSiblingMessages
├── db/
│   └── schema/
│       ├── submissions.ts    # extend: add decided_by, decided_at, rejection_reason
│       ├── audit-notifications.ts  # NEW: fan-out message refs
│       └── index.ts          # extend: export audit-notifications
```

### Pattern 1: Atomic Decision Transaction with `.for('update')`

**What:** Lock the submission row then update atomically to prevent double-approval.
**When to use:** On every Approve or Reject action, before any side-effect.

```typescript
// Source: drizzle-orm 0.45.2 select.types.d.ts [VERIFIED: codebase]
// LockStrength = 'update' | 'no key update' | 'share' | 'key share'
// LockConfig = { of?: Table, noWait?: true, skipLocked?: true } (mutually exclusive)

const txDb = await getTxDb(); // neon-serverless Pool — MANDATORY for transactions
await txDb.transaction(async (tx) => {
  const { submissions } = await import('@/db/schema/submissions');
  const { boqItems } = await import('@/db/schema/boq-items');
  const { eq, and, sql } = await import('drizzle-orm');

  // Step 1: Lock the row — fails fast if already decided
  const rows = await tx
    .select({ id: submissions.id, quantity: submissions.quantity, boqItemId: submissions.boqItemId })
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.status, 'pending_audit')))
    .for('update');

  if (rows.length === 0) {
    // Already approved or rejected by another auditor — no-op
    throw new AlreadyResolvedError();
  }

  // Step 2: Transition status
  await tx.update(submissions).set({
    status: 'approved',
    decidedBy: auditorPersonId,
    decidedAt: new Date(),
  }).where(eq(submissions.id, submissionId));

  // Step 3: Increment approvedQty (D-27)
  await tx.update(boqItems).set({
    approvedQty: sql`approved_qty + ${rows[0].quantity}`,
  }).where(eq(boqItems.id, rows[0].boqItemId));
});
```

**Alternative — UPDATE RETURNING (single round-trip, no explicit lock needed):**

```typescript
// This pattern atomically changes status and returns the affected row.
// If RETURNING is empty, the WHERE guard (status='pending_audit') rejected it.
const affected = await tx
  .update(submissions)
  .set({ status: 'approved', decidedBy: auditorPersonId, decidedAt: new Date() })
  .where(and(eq(submissions.id, submissionId), eq(submissions.status, 'pending_audit')))
  .returning({ id: submissions.id, quantity: submissions.quantity, boqItemId: submissions.boqItemId });

if (affected.length === 0) throw new AlreadyResolvedError();
// Then update boqItems with affected[0].quantity
```

**Recommendation:** Use UPDATE-RETURNING (simpler, one round-trip, no explicit row lock needed for this use case). The `status='pending_audit'` WHERE clause is the atomic guard. [ASSUMED — both patterns are valid; UPDATE-RETURNING is idiomatic for "first-wins" semantics]

### Pattern 2: grammY Callback Handler Registration

**What:** Register `audit:` prefixed handlers on the existing bot without conflicting with Phase 2's `callback_query:data` dispatcher.

```typescript
// Source: grammY keyboard docs https://grammy.dev/plugins/keyboard [CITED]
// Source: existing telegram.ts bot.on('callback_query:data') [VERIFIED: codebase]

// Option A: In the EXISTING callback_query:data handler (recommended — single dispatch point)
// In dispatchCallbackQuery(), add a new branch:
if (data.startsWith('audit:approve:') || data.startsWith('audit:reject:')) {
  await handleAuditDecision(ctx, data, db);
  return;
}
if (data.startsWith('audit:reason:') || data === 'audit:reason:free') {
  await handleAuditReasonSelect(ctx, data, db);
  return;
}

// Option B: bot.callbackQuery() with regex (registers a separate handler)
bot.callbackQuery(/^audit:(approve|reject):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); // ALWAYS FIRST
  // ...
});
```

**Recommendation:** Option A (extend the existing `dispatchCallbackQuery` in `telegram.ts`) — consistent with Phase 2 architecture, single dispatch point, no risk of handler ordering conflicts. [ASSUMED — either works; Option A is architecturally cleaner for this codebase]

### Pattern 3: `ctx.answerCallbackQuery()` — Required on EVERY code path

**What:** Must be called within 10 seconds of receiving a callback_query or Telegram shows a loading spinner indefinitely and may retry.

```typescript
// Source: grammY keyboard docs [CITED] + established Phase 2 pattern [VERIFIED: codebase]

// Call FIRST, before any DB work
await ctx.answerCallbackQuery(); // empty = no visible toast

// OR with a toast (ephemeral notification at top of chat):
await ctx.answerCallbackQuery({ text: 'Bu kayıt zaten çözüldü' }); // late tap toast
await ctx.answerCallbackQuery({ text: 'Yetkisiz erişim' });         // unauthorized toast

// The show_alert flag shows a modal alert instead of a toast:
await ctx.answerCallbackQuery({ text: 'Hata oluştu', show_alert: true });
```

**Critical:** Call `answerCallbackQuery` in ALL code paths: success, unauthorized, already-resolved, error. Never let a callback_query go unanswered.

### Pattern 4: Editing Fan-out Messages on Decision

**What:** After the first auditor acts, edit ALL previously sent auditor messages to strip buttons and show outcome.

```typescript
// Source: grammY API ref https://grammy.dev/ref/core/api [CITED]
// bot.api.editMessageReplyMarkup(chat_id, message_id, other?, signal?)
// bot.api.editMessageText(chat_id, message_id, text, other?, signal?)

async function editAllSiblingMessages(
  submissionId: string,
  outcomeText: string
): Promise<void> {
  const { db } = await import('@/db');
  const { auditNotifications } = await import('@/db/schema/audit-notifications');
  const { eq } = await import('drizzle-orm');

  const refs = await db.select().from(auditNotifications)
    .where(eq(auditNotifications.submissionId, submissionId));

  // Best-effort: edit each message independently
  for (const ref of refs) {
    try {
      await bot.api.editMessageText(
        ref.chatId,           // number — the auditor's chat_id
        ref.messageId,        // number — the message_id returned from sendPhoto/sendMessage
        outcomeText,          // "✅ Onaylandı — Ahmet" or "❌ Reddedildi — Yetersiz iş"
        { reply_markup: { inline_keyboard: [] } }  // removes all buttons
      );
    } catch (err) {
      // Message may be too old (Telegram allows editing for 48h)
      // or already edited. Log and continue — do not throw.
      console.error(`[editAllSiblings] failed for chatId=${ref.chatId} msgId=${ref.messageId}:`, err);
    }
  }
}
```

**Note:** `editMessageText` changes both text AND strips buttons in one call. Use `editMessageReplyMarkup` instead if preserving the original caption is important (e.g., if the message is a photo with caption — use `editMessageCaption` for photos, then `editMessageReplyMarkup` to strip buttons separately, or simply call `editMessageReplyMarkup` with empty keyboard). [ASSUMED — testing required to confirm which edit method works for photo messages]

**For photo messages specifically:** `editMessageCaption(other)` + `editMessageReplyMarkup(other)` are needed separately since `editMessageText` cannot edit photo captions. Recommended: use `editMessageReplyMarkup` to strip buttons (simpler, preserves photo + original caption) and append outcome to the caption via `editMessageCaption`.

### Pattern 5: Fan-out with `after()` (D-40 Best-Effort)

**What:** Fan-out fires after the worker's 200 response is sent, so the worker is never blocked by auditor notification failures.

```typescript
// Source: nextjs.org/docs/app/api-reference/functions/after [CITED: Next.js 15.1+ stable]
// Source: Phase 2 RESEARCH.md code examples [VERIFIED: codebase]
import { after } from 'next/server';

// Inside handleConfirmSubmit, after the submissions INSERT succeeds:
const insertedSubmissionId = /* ... from RETURNING */;

after(async () => {
  await fanOutToAuditors(insertedSubmissionId);
});
```

### Pattern 6: Callback Data Encoding (≤64-byte limit)

**What:** Telegram limits `callback_data` to 64 bytes. Submission UUIDs are 36 characters; action prefix adds ~15. Total for `audit:approve:<uuid>` is ~51 bytes — within limit.

```
"audit:approve:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 → 7 + 1 + 7 + 1 + 36 = 52 bytes ✓

"audit:reject:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 → 7 + 1 + 6 + 1 + 36 = 51 bytes ✓

"audit:reason:Yetersiz iş"
 → 7 + 1 + 6 + 1 + 12 = 27 bytes ✓ (canned reasons are short)

"audit:reason:free:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 → Would be 53 bytes ✓ (if submission id embedded for free-text path)
```

All planned callback_data values fit within 64 bytes. [VERIFIED: Telegram Bot API — InlineKeyboardButton callback_data max 1-64 bytes; values above measured directly]

### Pattern 7: Auditor Reject-Reason FSM (D-30, D-31, D-32)

**What:** Two-tier reason capture using the existing `conversation_state` table (reuse D-12 pattern).

```typescript
// Extend STEPS in bot-fsm.ts:
export const STEPS = {
  // ... existing worker steps ...
  AWAITING_REJECT_REASON: 'awaiting_reject_reason',
  AWAITING_REJECT_REASON_FREE: 'awaiting_reject_reason_free',
} as const;

// When auditor taps ❌ Reddet:
await saveState(
  db,
  BigInt(ctx.from.id),
  STEPS.AWAITING_REJECT_REASON,
  { submissionId, auditorPersonId, workerPersonId },
  auditorPersonId  // personId param
);

// Show canned reason keyboard:
const keyboard = new InlineKeyboard()
  .text('Yetersiz iş',           'audit:reason:Yetersiz iş').row()
  .text('Yanlış konum',          'audit:reason:Yanlış konum').row()
  .text('Eksik/bulanık fotoğraf','audit:reason:Eksik/bulanık fotoğraf').row()
  .text('Yanlış miktar',         'audit:reason:Yanlış miktar').row()
  .text('Başka (yaz)',           'audit:reason:free');

await ctx.reply('Ret gerekçesini seçin:', { reply_markup: keyboard });
```

**Free-text path:**
When auditor taps "Başka (yaz)", update step to `AWAITING_REJECT_REASON_FREE`. The next `message` update from this auditor's telegram_user_id is the typed reason. The existing `bot.on('message')` dispatcher reads `conversation_state` and routes to the new step handler.

**One-flow-per-user constraint:** The same `telegram_user_id` UNIQUE constraint that prevents two simultaneous worker flows also prevents a worker-mid-log from simultaneously being an auditor-mid-reject. This edge case is explicitly accepted (D-32).

### Anti-Patterns to Avoid

- **Missing `answerCallbackQuery` in any error path:** Every callback_query must be answered. Missing one creates an indefinite spinner and Telegram may retry, causing duplicate processing that slips past the `processed_updates` fence (replay of the same `update_id` from a retry IS a new event with a new `update_id`).
- **Using `neon-http` driver for the decision transaction:** The default `@/db` (neon-http) throws on `db.transaction()`. ALWAYS use `getTxDb()` (neon-serverless Pool WebSocket) — same as Phase 2 `handleConfirmSubmit`.
- **Trusting `callback_data` for authorization:** The callback_data `submissionId` tells you WHICH submission, not WHO is allowed to act. Always re-query `assignments` on every tap.
- **Fan-out inside the webhook's synchronous response path:** Sending N Telegram messages (one per auditor) before returning 200 will time out for projects with many auditors. Always use `after()` for fan-out.
- **`editMessageText` on photo messages:** Photo messages cannot have their text edited with `editMessageText` — only captions. Use `editMessageCaption` + `editMessageReplyMarkup` separately for photo messages.
- **Storing `audit_notifications` as JSONB on `submissions`:** The "edit all siblings" operation requires loading the refs and iterating. JSONB on `submissions` works but adds a read-modify-write pattern and makes querying individual notification rows harder. A dedicated table is cleaner.
- **Committing a rejection before the reason is captured (D-31):** The `UPDATE submissions SET status='rejected'` must only fire AFTER a reason (canned or typed) is confirmed. Setting status to rejected when the auditor taps ❌ (before choosing a reason) violates D-31 and leaves a rejected submission with no reason.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook secret validation | Custom header check | Existing `webhookCallback(bot, 'std/http', { secretToken })` (Phase 1/2) | Already in place; must not regress |
| Row-level atomic lock for first-action-wins | App-level status checks (TOCTOU race) | Drizzle `.for('update')` inside `txDb.transaction()` OR UPDATE-RETURNING with WHERE status=pending_audit | DB transaction is the ONLY correct race barrier |
| Fan-out message ref storage | JSONB concat on `submissions` row | Dedicated `audit_notifications` table | Cleaner FK, easier to query per-submission, easier to iterate for bulk edit |
| Callback_data parsing | Manual split/parse with no validation | `data.startsWith('audit:')` prefix check then `.split(':')` with length validation | Simple and sufficient; no need for the `callback-data` npm package at this scale |
| Reject-reason multi-step flow | grammY conversations plugin | Extend existing `conversation_state` DB-row FSM (D-12/D-32) | Conversations plugin ruled out by D-12; DB-row FSM already proven in Phase 2 |
| answerCallbackQuery | Forgetting it | Always call it FIRST in every callback handler | Telegram spinner never dismisses without it; Telegram may retry the callback |

**Key insight:** The DB transaction (neon-serverless Pool) is the single correct boundary for all race conditions. Application-level status checks in isolation have a TOCTOU window that concurrent auditor taps will exploit.

---

## Schema Additions

### `submissions` — three new columns (D-38)

```typescript
// src/db/schema/submissions.ts — additions only
// Add alongside the existing columns:
decidedBy: uuid('decided_by').references(() => people.id),    // null until decided
decidedAt: timestamp('decided_at', { withTimezone: true }),    // null until decided
rejectionReason: text('rejection_reason'),                     // null unless rejected
```

Migration: `drizzle-kit generate` then `drizzle-kit push` (non-interactive for this project). The new columns are nullable — no DEFAULT needed, no backfill required for existing `pending_audit` rows.

### `audit_notifications` — new table (D-34)

```typescript
// src/db/schema/audit-notifications.ts  [ASSUMED — column names are Claude's Discretion]
import { pgTable, uuid, bigint, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { submissions } from './submissions';
import { people } from './people';
import { tenants } from './tenants';

export const auditNotifications = pgTable('audit_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),  // D-09
  submissionId: uuid('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  auditorPersonId: uuid('auditor_person_id').notNull().references(() => people.id),
  chatId: bigint('chat_id', { mode: 'bigint' }).notNull(),    // Telegram chat_id (auditor's chat)
  messageId: integer('message_id').notNull(),                  // Telegram message_id returned from send
  sendFailed: boolean('send_failed').notNull().default(false), // D-40: record failed sends
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('audit_notifications_submission_idx').on(t.submissionId),
  index('audit_notifications_auditor_idx').on(t.auditorPersonId),
]);
```

**Why `bigint` for `chat_id`:** Telegram chat IDs are 64-bit integers in some cases (channels, supergroups). Auditor private chats are positive user IDs (fits in 32 bits in practice), but `bigint` is the safe type. Matches `people.telegram_user_id` type convention.

**Why `integer` for `message_id`:** Telegram message IDs are 32-bit integers within a chat. Safe to use `integer`.

Register in `src/db/schema/index.ts`:
```typescript
export * from './audit-notifications';
```

---

## Common Pitfalls

### Pitfall 1: `neon-http` driver on decision transaction

**What goes wrong:** `db.transaction()` throws `"cannot use database transaction on a HTTP connection"` if the default `@/db` (neon-http) client is used.
**Why it happens:** The neon-http driver uses stateless HTTP calls; transactions require a persistent WebSocket connection.
**How to avoid:** ALWAYS use `getTxDb()` (the neon-serverless Pool pattern from `src/actions/people.ts` and Phase 2's `handleConfirmSubmit`) for ANY `db.transaction()` call. The decision transaction is the most critical transaction in Phase 3.
**Warning signs:** Runtime error on first approval tap; `Gönderildi ✅` for workers but no BOQ update visible in dashboard.

### Pitfall 2: Missing `answerCallbackQuery` in error/unauthorized paths

**What goes wrong:** An auditor taps Approve; the authorization check fails and returns early without calling `answerCallbackQuery`. Telegram never clears the spinner. After ~10 seconds, Telegram's client re-delivers the same callback. The `processed_updates` fence has already seen this `update_id` — but a re-delivery may have a DIFFERENT `update_id` (it is a retry, not a replay). The authorization failure path now processes the callback a second time.
**How to avoid:** Call `await ctx.answerCallbackQuery()` (with or without toast text) as the VERY FIRST statement in every callback handler path. Before any DB query.
**Warning signs:** Auditor reports "button keeps spinning"; duplicate notifications to workers.

### Pitfall 3: Reject committed before reason captured (violates D-31)

**What goes wrong:** When an auditor taps ❌, the naive implementation immediately sets `status='rejected'` and then asks for a reason. If the auditor closes Telegram before typing the reason, the submission is permanently rejected with no reason — and the worker's notification says "rejected: (no reason)".
**Why it happens:** The two-step flow (tap → reason → commit) is non-obvious; the easy path is to commit on tap.
**How to avoid:** When auditor taps ❌, only write to `conversation_state` (current_step=awaiting_reject_reason). Do NOT touch `submissions`. The submission stays `pending_audit`. Only commit the rejection AFTER a reason arrives.
**Warning signs:** `submissions.status='rejected'` rows with `rejection_reason=null` in the DB.

### Pitfall 4: `editMessageText` on photo messages

**What goes wrong:** The auditor notification is sent as a photo message with caption. After decision, calling `bot.api.editMessageText(chatId, msgId, outcomeText)` fails with Telegram error 400 "MESSAGE_CONTENT_TYPE_INVALID" — you cannot edit a photo message's text (it has no text, only a caption).
**How to avoid:** For photo messages, use `bot.api.editMessageCaption(chatId, msgId, { caption: newCaption })` to update the caption, then `bot.api.editMessageReplyMarkup(chatId, msgId, { reply_markup: { inline_keyboard: [] } })` to strip the buttons. Or simply use `editMessageReplyMarkup` alone to just strip the buttons while preserving the original caption.
**Warning signs:** Telegram 400 error in logs when editing auditor messages post-decision.

### Pitfall 5: Callback_data `submissionId` is a UUID (36 chars) — budget carefully

**What goes wrong:** Developer adds a `projectId` to the callback_data to avoid a DB lookup, pushing the string over 64 bytes. Telegram silently truncates or rejects the keyboard.
**How to avoid:** Keep callback_data to `audit:<action>:<submissionId>` only (≤52 bytes). Derive all other context (boq_item_id, project_id, worker_id) from a DB lookup on the submissionId inside the handler.
**Warning signs:** Callback handlers receive malformed `data` strings; `submission_id.split(':')[2]` yields a truncated UUID; DB lookup returns no rows.

### Pitfall 6: Fan-out during webhook synchronous path blocks worker

**What goes wrong:** Without `after()`, the `handleConfirmSubmit` function awaits `fanOutToAuditors(...)` before sending "Gönderildi". With 3 auditors, each `sendPhoto` takes ~200ms → 600ms total. Under load or on slow Neon connection, this can push the total webhook duration above Vercel's 55s `maxDuration` is fine, but more practically it delays the worker's feedback.
**How to avoid:** Always wrap `fanOutToAuditors` in `after(async () => { ... })`. The worker receives "Gönderildi" immediately; fan-out fires after the 200 response.

### Pitfall 7: Race between two concurrent auditors — handled, but verify

**What goes wrong:** Two auditors tap simultaneously. Both pass the `processed_updates` fence (different `update_id`s from two different Telegram clients). Both enter the decision transaction. Without `SELECT FOR UPDATE`, both might read `status='pending_audit'` and both try to UPDATE.
**Why it doesn't happen with UPDATE-RETURNING:** Postgres serializes concurrent UPDATEs on the same row. The second concurrent UPDATE will see the row already updated (status no longer `pending_audit`) and its WHERE clause returns 0 rows → RETURNING is empty → "already resolved" path. This is the correct behavior.
**Why it doesn't happen with SELECT FOR UPDATE:** The explicit lock ensures only one transaction proceeds; the second blocks until the first commits, then reads the committed row (status no longer `pending_audit`) and also takes the "already resolved" path.
**Both patterns are safe.** The UPDATE-RETURNING pattern is simpler. [ASSUMED — Postgres concurrent UPDATE behavior is standard; no special Neon-specific concern]

---

## Code Examples

Verified patterns from official sources and codebase inspection:

### Drizzle `.for('update')` — verified from installed node_modules

```typescript
// Source: node_modules/drizzle-orm/pg-core/query-builders/select.types.d.ts [VERIFIED: codebase]
// type LockStrength = 'update' | 'no key update' | 'share' | 'key share'
// type LockConfig = { of?: Table; noWait?: true; skipLocked?: true; }

const rows = await tx
  .select({ id: submissions.id, quantity: submissions.quantity })
  .from(submissions)
  .where(and(eq(submissions.id, submissionId), eq(submissions.status, 'pending_audit')))
  .for('update');
// rows.length === 0 → already decided
```

### UPDATE-RETURNING (preferred alternative)

```typescript
// Source: drizzle-orm docs — .returning() [CITED: orm.drizzle.team/docs/update]
const affected = await tx
  .update(submissions)
  .set({ status: 'approved', decidedBy: auditorPersonId, decidedAt: new Date() })
  .where(and(eq(submissions.id, submissionId), eq(submissions.status, 'pending_audit')))
  .returning({ id: submissions.id, quantity: submissions.quantity, boqItemId: submissions.boqItemId });

if (affected.length === 0) {
  // Already decided — no double-deduction possible
  await ctx.answerCallbackQuery({ text: 'Bu kayıt zaten çözüldü' });
  return;
}
// Continue with approved[0].quantity to update boqItems
```

### `sql` template literal for arithmetic UPDATE

```typescript
// Source: drizzle-orm docs — sql`` [CITED: orm.drizzle.team/docs/sql]
// Source: STACK.md approved pattern [VERIFIED: .planning/research/STACK.md]
import { sql } from 'drizzle-orm';

await tx.update(boqItems).set({
  approvedQty: sql`approved_qty + ${submittedQty}`,
}).where(eq(boqItems.id, boqItemId));
```

### `bot.api.sendPhoto` for fan-out

```typescript
// Source: grammY API ref https://grammy.dev/ref/core/api [CITED]
// sendPhoto(chat_id, photo, other?, signal?)
// photo can be a Telegram file_id (string) or InputFile
const sent = await bot.api.sendPhoto(
  auditorChatId,              // number — from people.telegram_user_id (BigInt → Number cast required)
  submissionPhotoFileId ?? submissionPhotoUrl,  // file_id preferred (D-33 Claude's Discretion)
  {
    caption: auditorMessageText,  // [material] [qty] [notes] [Google Maps link] [over-delivery warning]
    reply_markup: buildAuditKeyboard(submissionId),
  }
);
// sent.message_id → store in audit_notifications
// sent.chat.id → store in audit_notifications (should equal auditorChatId)
```

### `bot.api.editMessageReplyMarkup` for stripping buttons

```typescript
// Source: grammY API ref https://grammy.dev/ref/core/api [CITED]
// editMessageReplyMarkup(chat_id, message_id, other?, signal?)
await bot.api.editMessageReplyMarkup(
  Number(ref.chatId),   // bigint → number cast
  ref.messageId,        // integer
  { reply_markup: { inline_keyboard: [] } }  // empty array = no buttons
);
```

### `ctx.answerCallbackQuery` — ephemeral toast

```typescript
// Source: grammY Context API ref https://grammy.dev/ref/core/context [CITED]
// answerCallbackQuery(other?, signal?)
// 'other' can be a string (shorthand for { text: string }) or the full options object
await ctx.answerCallbackQuery();                                     // silent ack
await ctx.answerCallbackQuery({ text: 'Bu kayıt zaten çözüldü' }); // toast
await ctx.answerCallbackQuery({ text: 'Yetkisiz', show_alert: true }); // modal alert
```

### InlineKeyboard for audit action buttons (D-35, callback_data ≤64 bytes)

```typescript
// Source: grammY keyboard docs [CITED] + callback_data size verified manually
export function buildAuditKeyboard(submissionId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Onayla', `audit:approve:${submissionId}`)
    .text('❌ Reddet', `audit:reject:${submissionId}`);
}
// "audit:approve:<36-char UUID>" = 7+1+7+1+36 = 52 bytes ✓ (Telegram max: 64)

export function buildRejectReasonKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Yetersiz iş',            'audit:reason:Yetersiz iş').row()
    .text('Yanlış konum',           'audit:reason:Yanlış konum').row()
    .text('Eksik/bulanık fotoğraf', 'audit:reason:Eksik%2Fbulanık fotoğraf').row()
    .text('Yanlış miktar',          'audit:reason:Yanlış miktar').row()
    .text('Başka (yaz)',            'audit:reason:free');
}
```

### Google Maps link format (D-33)

```typescript
// Source: CONTEXT.md D-33 [CITED]
function mapsLink(lat: string | number, lon: string | number): string {
  return `https://maps.google.com/?q=${lat},${lon}`;
}
```

### Over-delivery warning calculation (D-28)

```typescript
// Source: src/lib/boq-balance.ts [VERIFIED: codebase]
import { remainingBalance } from '@/lib/boq-balance';

function buildOverDeliveryWarning(
  plannedQty: string, approvedQty: string, submittedQty: string, unit: string
): string | null {
  const newApproved = parseFloat(approvedQty) + parseFloat(submittedQty);
  const planned = parseFloat(plannedQty);
  if (newApproved > planned) {
    return `⚠ Sözleşmeyi aşıyor (${newApproved}/${planned} ${unit})`;
  }
  return null;
}
```

### grammY test patterns for callback_query (extending Phase 2 harness)

```typescript
// Source: tests/telegram-bot.test.ts setupBotForTest() [VERIFIED: codebase]
// Extend makeTextUpdate() with a makeCallbackUpdate() helper:
export function makeCallbackUpdate(userId: number, data: string, updateId?: number) {
  return {
    update_id: updateId ?? userId + 1000,
    callback_query: {
      id: String(userId),
      from: { id: userId, first_name: 'TestAuditor', is_bot: false, language_code: 'tr' },
      chat_instance: String(userId),
      data,
      message: {
        message_id: 42,
        chat: { id: userId, type: 'private' as const },
        date: Math.floor(Date.now() / 1000),
      },
    },
  };
}

// In test: inject via bot.handleUpdate()
const bot = await setupBotForTest();
await bot.handleUpdate(makeCallbackUpdate(
  auditorTelegramId,
  `audit:approve:${submissionId}`
));
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ARCHITECTURE.md: approved_points written in approval transaction | Phase 3 DOES NOT write approved_points — that is Phase 4 (PostGIS) | CONTEXT.md D-33 clarification | Approval transaction is simpler: only submissions + boqItems update; no spatial query in Phase 3 |
| SUMMARY.md: `SELECT FOR UPDATE` mentioned broadly | Drizzle `.for('update')` or simpler UPDATE-RETURNING | Confirmed via drizzle-orm@0.45.2 type defs | Both patterns available; UPDATE-RETURNING preferred for fewer round-trips |
| ARCHITECTURE.md: "silent worker notify on approve" | D-37: worker notified on BOTH outcomes | CONTEXT.md D-37 | Worker always receives a closing message; no silent approvals |
| CHECK constraint on approved_qty | D-28: NO CHECK constraint | CONTEXT.md D-28 | Over-delivery allowed; warning flag in auditor message instead |

**Deprecated/outdated in this phase:**
- `ARCHITECTURE.md` approved_points INSERT inside approval transaction: deferred to Phase 4. The Phase 3 transaction is submissions + boqItems only.
- SUMMARY.md suggestion to add `CHECK (approved_qty <= planned_qty)`: explicitly overridden by D-28.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | UPDATE-RETURNING pattern is sufficient for first-action-wins (no explicit SELECT FOR UPDATE needed) | Pattern 1 | Drizzle's UPDATE is serialized by Postgres at the row level for concurrent transactions; if wrong, use `.for('update')` instead — both are confirmed available |
| A2 | Extending `conversation_state` table (vs sibling table) for auditor reject-reason FSM is the correct choice | Pattern 7 | If wrong, planner adds a `auditor_fsm_state` sibling table; low risk since UNIQUE on telegram_user_id applies to both options |
| A3 | `editMessageReplyMarkup` with `{ inline_keyboard: [] }` successfully strips buttons from photo messages | Pitfall 4 | May need `editMessageCaption` + `editMessageReplyMarkup` separately; test this pattern in Wave 1 |
| A4 | `bot.api.sendPhoto` accepts a Telegram `file_id` string for re-sending a photo (not just InputFile) | Code Examples | If file_id re-send fails, fall back to `photo_url` (Blob URL) — both paths are prepared (D-33 Claude's Discretion) |
| A5 | `Number(bigint)` cast is safe for Telegram user IDs and chat IDs at these scales | Code Examples | Telegram user IDs are < 2^53 in practice; safe for JavaScript Number; BigInt → Number conversion is standard in this codebase |
| A6 | `after()` from `next/server` is available in the webhook route handler's function scope even though `handleConfirmSubmit` is called from within `bot.handleUpdate()` | Fan-out Pattern | If `after()` is not available inside the grammY handler chain, fan-out must be triggered from the route.ts level; planner should note this as a risk |
| A7 | canned reject reasons fit within 64-byte callback_data limit | Pattern 6 | Verified by manual character count; "Eksik/bulanık fotoğraf" = 23 chars; full data = "audit:reason:Eksik/bulanık fotoğraf" = 36 chars ✓ |

---

## Open Questions (RESOLVED)

1. **`after()` availability inside `bot.handleUpdate()` chain**
   - What we know: `after()` is called from inside `handleConfirmSubmit`, which is called from inside a grammY callback handler registered on `bot`, which is invoked from `bot.handleUpdate()` inside `webhookCallback` inside the route handler. `after()` should work because the Next.js runtime tracks the request context.
   - What's unclear: Whether Next.js's `after()` implementation correctly propagates context through the grammY middleware chain. Phase 2 did not exercise this.
   - Recommendation: Test `after()` working inside a grammY callback in Wave 1. If it fails, trigger fan-out directly from `route.ts`'s `POST` handler after `webhookCallback` returns.
   - **RESOLVED:** Planned in 03-04 Task 2 — wire fan-out via `after()`, smoke-test that it fires inside the grammY callback chain, and fall back to a direct `await fanOutToAuditors(submissionId)` before the reply (noting the tradeoff in SUMMARY) if it does not. The fallback is the documented escape hatch, so this is no longer open for planning.

2. **`sendPhoto` file_id re-use vs Blob URL**
   - What we know: Telegram file_ids are stable across bots as long as the file exists. `submissions.photo_file_id` stores the file_id from the original upload. `submissions.photo_url` stores the Vercel Blob URL.
   - What's unclear: Whether the bot's own file_id (stored when the worker sent it) can be re-sent by the same bot to a different chat (auditor). Telegram generally allows this.
   - Recommendation: Try file_id first; catch errors and fall back to `photo_url` (Blob URL). Log which path was used.
   - **RESOLVED:** Planned in 03-04 Task 1 — `sendPhoto(photoFileId ?? photoUrl)` with a catch that re-sends via the Blob `photoUrl` on file_id failure. Fallback is deterministic; no live experiment needed before planning.

3. **`editMessageCaption` vs `editMessageReplyMarkup` for outcome display on photo messages**
   - What we know: Auditor messages are sent as `sendPhoto` with a caption. On decision, we need to strip buttons and show outcome.
   - What's unclear: Whether `editMessageReplyMarkup` alone (stripping buttons) is sufficient UX, or whether the caption must also be updated to show the outcome.
   - Recommendation: Planner decides UX. Simplest: use `editMessageReplyMarkup` to strip buttons only; the original caption remains visible (auditor can still read the submission details). Add "✅ Onaylandı" as a prefix to the caption via `editMessageCaption` if more explicit outcome display is needed.
   - **RESOLVED:** Planned in 03-04 Task 1 (`editAllSiblingMessages`) — use BOTH `editMessageCaption` (prepend the "✅ Onaylandı — [Auditor]" / "❌ Reddedildi — [Auditor]: [reason]" outcome line) AND `editMessageReplyMarkup` (strip buttons), separately, because `editMessageText` 400s on photo messages. UX decision settled: explicit outcome in the caption.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `grammy` | Audit callback handlers, bot.api.* | ✓ | 1.43.0 | — |
| `drizzle-orm` + `.for()` | Decision transaction locking | ✓ | 0.45.2 (verified in node_modules type defs) | UPDATE-RETURNING (no .for() needed) |
| `@neondatabase/serverless` Pool | getTxDb() transaction driver | ✓ | 1.1.0 | — |
| `next/server` `after()` | Non-blocking fan-out | ✓ | Next.js 15.5.18 (after() stable since 15.1) | Direct await in route.ts POST handler |
| `TELEGRAM_BOT_TOKEN` | bot.api.* outbound calls | ✓ | set in .env.local | — |
| `DATABASE_URL` | All DB operations | ✓ | set in .env.local | — |
| `TEST_DATABASE_URL` | Decision transaction + race integration tests | Unknown (must be set for mandatory SC3/SC5 tests) | — | Tests skip cleanly with describeIfDb |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** `TEST_DATABASE_URL` — required for the double-tap race integration test (SC3/SC5 analog). Planner must gate the phase on this test passing with a live DB.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.7 |
| Config file | `vitest.config.ts` (fileParallelism: false — required for shared Neon test DB) |
| Quick run command | `npx vitest run tests/telegram-audit.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUDIT-01 | fanOutToAuditors sends one message per assigned auditor | unit (mock bot.api) | `npx vitest run tests/telegram-audit.test.ts` | ❌ Wave 0 |
| AUDIT-01 | fanOutToAuditors inserts one audit_notifications row per auditor | describeIfDb (live DB) | `npx vitest run tests/telegram-audit.test.ts` | ❌ Wave 0 |
| AUDIT-01 | No auditor assigned → no message sent, warning logged (D-39) | unit (mock) | `npx vitest run tests/telegram-audit.test.ts` | ❌ Wave 0 |
| AUDIT-02 | buildAuditKeyboard returns InlineKeyboard with callback_data ≤64 bytes | unit (pure) | `npx vitest run tests/telegram-audit.test.ts` | ❌ Wave 0 |
| AUDIT-03 | Non-assigned user tap → answerCallbackQuery called, no DB change | unit (mock DB) | `npx vitest run tests/telegram-audit.test.ts` | ❌ Wave 0 |
| AUDIT-04 | Approve sets status='approved', approved_qty increments by qty | describeIfDb (live DB) | `npx vitest run tests/telegram-audit.test.ts` | ❌ Wave 0 |
| AUDIT-04 SC3 | Same callback_query processed twice → approved_qty increments once | describeIfDb (live DB) | `npx vitest run tests/telegram-audit.test.ts` | ❌ Wave 0 **MANDATORY** |
| AUDIT-05 | Reject with canned reason: status='rejected', rejection_reason set, worker notified | describeIfDb (live DB) | `npx vitest run tests/telegram-audit.test.ts` | ❌ Wave 0 |
| AUDIT-05 | Reject with free-text reason: conversation_state set to awaiting_reject_reason | unit (mock DB) | `npx vitest run tests/telegram-audit.test.ts` | ❌ Wave 0 |
| AUDIT-05 | Abandon after ❌ tap (no reason given): submission stays pending_audit (D-31) | describeIfDb (live DB) | `npx vitest run tests/telegram-audit.test.ts` | ❌ Wave 0 |
| AUDIT-06 SC5 | Two concurrent auditor taps: exactly one action wins, other gets "already resolved" | describeIfDb (live DB) | `npx vitest run tests/telegram-audit.test.ts` | ❌ Wave 0 **MANDATORY** |
| AUDIT-06 | already-decided tap returns answerCallbackQuery toast, no DB change | describeIfDb (live DB) | `npx vitest run tests/telegram-audit.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/telegram-audit.test.ts`
- **Per wave merge:** `npx vitest run` (full suite including Phase 1/2 regression)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/telegram-audit.test.ts` — new test file covering all AUDIT-* requirements above
- [ ] `tests/fixtures/db.ts` — extend `truncateAllTables` to include `audit_notifications`
- [ ] Schema additions: `drizzle-kit generate` + `drizzle-kit push` for new `audit_notifications` table and three new columns on `submissions`

**SC3 and SC5 tests are MANDATORY** (analog of Phase 2's SC4 duplicate-update test). These require `TEST_DATABASE_URL` and must pass on a live DB before the phase is marked complete.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (auditor identity) | Telegram User ID from `ctx.callbackQuery.from.id`; re-checked against `assignments` DB on every tap (D-36) |
| V3 Session Management | Yes (auditor reject-reason FSM) | `conversation_state` row keyed by `telegram_user_id`; TTL from D-22; deleted on reason confirmation |
| V4 Access Control | Yes (auditor authorization) | Re-query `assignments WHERE role_on_project='auditor'` on every callback_query tap; `callback_data` submissionId is not trusted for authorization |
| V5 Input Validation | Yes (typed reject reason) | Free-text reason length-capped (recommended: 500 chars max, same pattern as worker notes); stored via Drizzle parameterized inserts |
| V6 Cryptography | No | No cryptographic operations in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Double-tap / duplicate callback | Tampering | `processed_updates` dedup (D-13 Guard 1) + UPDATE-RETURNING WHERE status=pending_audit |
| Unauthorized auditor tap | Elevation of Privilege | Re-query `assignments` on every tap (D-36); `answerCallbackQuery` rejection toast |
| Callback_data forgery (crafted submissionId) | Tampering | DB lookup validates submission exists + authorization re-checked; forged submissionId returns 0 rows |
| Worker notes prompt injection (via auditor message display) | Tampering | Notes displayed as plain text in caption; no AI prompt in Phase 3 path |
| Webhook secret regression | Spoofing | `webhookCallback(bot, 'std/http', { secretToken })` unchanged from Phase 1/2; must not regress |
| Negative approved_qty (over-deduction bug) | Tampering | UPDATE-RETURNING WHERE status=pending_audit prevents double-deduction; no subtractive operation (D-27 increments only) |

---

## Sources

### Primary (HIGH confidence)

- `node_modules/drizzle-orm/pg-core/query-builders/select.types.d.ts` — `LockStrength`, `LockConfig`, `.for()` method confirmed [VERIFIED: codebase]
- `node_modules/drizzle-orm/pg-core/query-builders/select.d.ts` — `.for(strength, config?)` method signature confirmed [VERIFIED: codebase]
- `src/lib/telegram.ts` — existing bot instance, middleware, dispatcher, `getTxDb()`, `saveState()`, `handleConfirmSubmit()` [VERIFIED: codebase]
- `src/db/schema/submissions.ts` — existing column set, status enum, flow_id unique constraint [VERIFIED: codebase]
- `src/db/schema/conversation-state.ts` — D-12 FSM pattern, telegram_user_id UNIQUE constraint [VERIFIED: codebase]
- `src/db/schema/assignments.ts` — `roleOnProject` enum, unique constraint on (person, project, role) [VERIFIED: codebase]
- `src/db/schema/people.ts` — `telegram_user_id bigint` for fan-out targeting [VERIFIED: codebase]
- `src/db/schema/boq-items.ts` — `approved_qty` column + `planned_qty` for over-delivery check [VERIFIED: codebase]
- `src/lib/boq-balance.ts` — `remainingBalance()` reused for over-delivery warning (D-28) [VERIFIED: codebase]
- `src/lib/tenant.ts` — `getDefaultTenantId()` for D-09 compliance on new inserts [VERIFIED: codebase]
- `tests/telegram-bot.test.ts` — `setupBotForTest()`, `makeTextUpdate()`, grammY test harness patterns [VERIFIED: codebase]
- grammY keyboard docs — `InlineKeyboard`, `bot.callbackQuery()`, `answerCallbackQuery` [CITED: https://grammy.dev/plugins/keyboard]
- grammY Context API — `ctx.answerCallbackQuery()`, `ctx.editMessageReplyMarkup()`, `ctx.editMessageCaption()` signatures [CITED: https://grammy.dev/ref/core/context]
- grammY API ref — `bot.api.sendPhoto()`, `bot.api.editMessageReplyMarkup()`, `bot.api.editMessageText()` signatures [CITED: https://grammy.dev/ref/core/api]
- Next.js `after()` docs — stable since 15.1, available in Route Handlers [CITED: https://nextjs.org/docs/app/api-reference/functions/after]

### Secondary (MEDIUM confidence)

- `.planning/phases/03-audit-loop/03-CONTEXT.md` — all D-27 through D-40 locked decisions [CITED]
- `.planning/research/PITFALLS.md` — BOQ double-deduction, auditor authorization bypass, answerCallbackQuery patterns [VERIFIED: codebase]
- `.planning/research/ARCHITECTURE.md` — AuditCallbackHandler component boundary, notification service pattern [VERIFIED: codebase]
- `.planning/phases/02-worker-bot/02-RESEARCH.md` — grammY test patterns, getTxDb() established pattern, after() usage [VERIFIED: codebase]

### Tertiary (LOW confidence)

- grammY keyboard docs (web search) — bot.callbackQuery() regex pattern [CITED: https://grammy.dev/plugins/keyboard] — confirmed available but exact API surface not fully fetched

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all packages from Phase 2; no new installs; `.for('update')` confirmed in installed drizzle-orm type defs
- Atomic transaction pattern: HIGH — UPDATE-RETURNING confirmed Drizzle API; `.for('update')` confirmed in type defs; both patterns are equivalent
- grammY callback APIs: HIGH — confirmed via official docs + existing Phase 2 codebase patterns
- Schema additions: HIGH — existing column types and patterns confirmed; new columns are additive/nullable
- Fan-out message lifecycle: MEDIUM — `editMessageCaption` vs `editMessageReplyMarkup` for photo messages needs empirical confirmation (A3)
- Test patterns: HIGH — extending proven Phase 2 harness (`setupBotForTest`, `makeCallbackUpdate` analog)
- `after()` inside grammY chain: MEDIUM — standard Next.js pattern; needs smoke test in Wave 1

**Research date:** 2026-05-24
**Valid until:** 2026-06-24 (grammY 1.x stable; Drizzle 0.45.x stable; Next.js after() stable since 15.1)
