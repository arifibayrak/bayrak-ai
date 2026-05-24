# Phase 3: Audit Loop - Pattern Map

**Mapped:** 2026-05-24
**Files analyzed:** 10 new/modified files
**Analogs found:** 10 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/telegram.ts` | grammY callback handler + FSM dispatcher | event-driven (callback_query) | `src/lib/telegram.ts` itself (extend) | exact — add branches to existing dispatcher |
| `src/lib/bot-audit.ts` | service (fan-out + sibling-edit) | request-response + Telegram API | `src/lib/telegram.ts` `handleConfirmSubmit` | role-match (same getTxDb + bot.api pattern) |
| `src/lib/bot-keyboards.ts` | inline keyboard builder | pure transform | `src/lib/bot-keyboards.ts` itself (extend) | exact — add two builder functions |
| `src/lib/bot-messages.ts` | Turkish message catalog | pure config | `src/lib/bot-messages.ts` itself (extend) | exact — add new string keys |
| `src/lib/bot-fsm.ts` | FSM step constants + TTL | pure config | `src/lib/bot-fsm.ts` itself (extend) | exact — add two new STEPS values |
| `src/db/schema/submissions.ts` | Drizzle schema (extend) | CRUD | `src/db/schema/submissions.ts` itself | exact — additive nullable columns |
| `src/db/schema/audit-notifications.ts` | Drizzle schema (new table) | CRUD | `src/db/schema/conversation-state.ts` | role-match (same bigint + uuid + FK pattern) |
| `src/db/schema/index.ts` | barrel export | config | `src/db/schema/index.ts` itself | exact — add one export line |
| `src/db/migrations/` | Drizzle migration files | batch | `src/db/migrate.ts` convention | exact — `drizzle-kit generate` + push |
| `tests/telegram-audit.test.ts` | Vitest integration + unit tests | batch | `tests/telegram-bot.test.ts` | exact — same setupBotForTest + describeIfDb harness |

---

## Pattern Assignments

### `src/lib/telegram.ts` (extend — add audit callback dispatch)

**Analog:** `src/lib/telegram.ts` lines 462–558 (`dispatchCallbackQuery`) + lines 314–376 (`bot.on('callback_query:data')`)

**Critical rule:** `ctx.answerCallbackQuery()` MUST be called as the FIRST statement in every callback path, before any DB work (Pitfall 3 / T-02-12). The existing handler already calls it at line 316.

**Dispatch extension pattern** (lines 487–530 — extend the `if`-chain in `dispatchCallbackQuery`):
```typescript
// ADD before the "Unknown callback — reprompt" fallthrough:
if (data.startsWith('audit:approve:') || data.startsWith('audit:reject:')) {
  const submissionId = data.split(':')[2];
  await handleAuditDecision(ctx, data.startsWith('audit:approve:') ? 'approve' : 'reject', submissionId, db);
  return;
}
if (data.startsWith('audit:reason:')) {
  const reason = data.slice('audit:reason:'.length); // includes 'free' sentinel
  await handleAuditReasonSelect(ctx, reason, db);
  return;
}
```

**Note:** The `audit:` callback branches must be added BEFORE the existing fallthrough `repromptStep` call (line 557). They must NOT be added to the worker FSM state-load path — audit callbacks do NOT require a `conversation_state` row for the auditor (only the reject free-text path writes one).

**Message dispatcher extension** (lines 593–619 — extend `bot.on('message')` switch):
```typescript
// ADD to the switch in bot.on('message'):
case STEPS.AWAITING_REJECT_REASON:      // free-text reason entry
  await handleAuditRejectFreeText(ctx, state.data as Record<string, unknown>, db);
  break;
```

**Lazy import pattern** (mandatory — used throughout the file):
```typescript
// NEVER import at module top level — always inside handler body:
const { db } = await import('@/db');
const { submissions } = await import('@/db/schema/submissions');
const { eq, and, sql } = await import('drizzle-orm');
```

**getTxDb pattern** (lines 1156–1175 — copy exactly for all transaction use):
```typescript
async function getTxDb() {
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  try {
    const ws = require('ws') as { default?: unknown } | unknown;
    neonConfig.webSocketConstructor = (ws as any).default ?? ws;
  } catch (wsErr) {
    console.error('[getTxDb] require("ws") failed; falling back to native WebSocket:', wsErr);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  return drizzle(pool);
}
```

**tenant_id on every insert** (lines 185–186 in `saveState`):
```typescript
tenantId: getDefaultTenantId(),
```

---

### `src/lib/bot-audit.ts` (NEW — fan-out + sibling-edit service)

**Analog:** `src/lib/telegram.ts` `handleConfirmSubmit` (lines 1246–1331) for the `getTxDb()` transaction pattern, and `handleStepConfirm` (lines 1185–1236) for `bot.api.*` usage.

**File-level rule:** Lazy imports throughout. Import `bot` from `'@/lib/telegram'` (the singleton). Use `getTxDb()` (neon-serverless Pool) for the decision transaction — never the default `@/db` neon-http client.

**fanOutToAuditors pattern** — analogous to `handleConfirmSubmit` but uses `bot.api` directly:
```typescript
export async function fanOutToAuditors(submissionId: string): Promise<void> {
  const { db } = await import('@/db');
  const { assignments } = await import('@/db/schema/assignments');
  const { people } = await import('@/db/schema/people');
  const { submissions } = await import('@/db/schema/submissions');
  const { boqItems } = await import('@/db/schema/boq-items');
  const { auditNotifications } = await import('@/db/schema/audit-notifications');
  const { eq, and } = await import('drizzle-orm');
  const { bot } = await import('@/lib/telegram');
  const { getDefaultTenantId } = await import('@/lib/tenant');

  // Load submission + boqItem + project
  // Load auditors: assignments WHERE role_on_project='auditor' on submission.projectId
  // For each auditor (best-effort, D-40):
  try {
    const sent = await bot.api.sendPhoto(
      Number(auditorChatId),           // bigint → number cast (A5)
      photoFileId ?? photoUrl,         // file_id preferred; fallback to Blob URL (D-33)
      { caption: captionText, reply_markup: buildAuditKeyboard(submissionId) }
    );
    // Persist (chat_id, message_id) in audit_notifications
    await db.insert(auditNotifications).values({
      tenantId: getDefaultTenantId(),
      submissionId,
      auditorPersonId: auditorPerson.id,
      chatId: BigInt(sent.chat.id),
      messageId: sent.message_id,
      sentAt: new Date(),
    });
  } catch (err) {
    // D-40: best-effort — record failure, do not throw
    console.error('[fanOutToAuditors] send failed for auditor', auditorPerson.id, ':', err);
    await db.insert(auditNotifications).values({
      tenantId: getDefaultTenantId(),
      submissionId,
      auditorPersonId: auditorPerson.id,
      chatId: BigInt(auditorChatId),
      messageId: 0,
      sendFailed: true,
    });
  }
}
```

**Decision transaction pattern** (UPDATE-RETURNING, D-29 — preferred over SELECT FOR UPDATE):
```typescript
const txDb = await getTxDb();
try {
  await txDb.transaction(async (tx) => {
    const { submissions } = await import('@/db/schema/submissions');
    const { boqItems } = await import('@/db/schema/boq-items');
    const { eq, and, sql } = await import('drizzle-orm');

    // Atomic first-wins guard: WHERE status='pending_audit' is the race barrier
    const affected = await tx
      .update(submissions)
      .set({ status: 'approved', decidedBy: auditorPersonId, decidedAt: new Date() })
      .where(and(eq(submissions.id, submissionId), eq(submissions.status, 'pending_audit')))
      .returning({ id: submissions.id, quantity: submissions.quantity, boqItemId: submissions.boqItemId });

    if (affected.length === 0) {
      // Already decided — no-op (D-29, AUDIT-06)
      throw new AlreadyResolvedError();
    }

    // D-27: increment approved_qty atomically
    await tx.update(boqItems).set({
      approvedQty: sql`approved_qty + ${affected[0].quantity}`,
    }).where(eq(boqItems.id, affected[0].boqItemId));
  });
} catch (err) {
  if (err instanceof AlreadyResolvedError) {
    await ctx.answerCallbackQuery({ text: 'Bu kayıt zaten çözüldü' });
    return;
  }
  console.error('[handleAuditDecision] transaction failed:', err);
  await ctx.answerCallbackQuery({ text: 'Bir hata oluştu', show_alert: true });
  return;
}
```

**editAllSiblingMessages pattern** — load refs, iterate best-effort:
```typescript
export async function editAllSiblingMessages(
  submissionId: string,
  outcomeCaption: string
): Promise<void> {
  const { db } = await import('@/db');
  const { auditNotifications } = await import('@/db/schema/audit-notifications');
  const { eq } = await import('drizzle-orm');
  const { bot } = await import('@/lib/telegram');

  const refs = await db.select().from(auditNotifications)
    .where(eq(auditNotifications.submissionId, submissionId));

  for (const ref of refs) {
    if (ref.sendFailed) continue; // skip refs that were never sent
    try {
      // For photo messages: editMessageCaption changes the caption; editMessageReplyMarkup strips buttons
      await bot.api.editMessageCaption(Number(ref.chatId), ref.messageId, {
        caption: outcomeCaption,
      });
      await bot.api.editMessageReplyMarkup(Number(ref.chatId), ref.messageId, {
        reply_markup: { inline_keyboard: [] },
      });
    } catch (err) {
      // Message may be >48h old or already edited — log and continue (D-40)
      console.error('[editAllSiblings] failed chatId=%s msgId=%s:', ref.chatId, ref.messageId, err);
    }
  }
}
```

**after() fan-out integration** (called from `handleConfirmSubmit` in `telegram.ts`):
```typescript
import { after } from 'next/server';

// Inside handleConfirmSubmit, after the submissions INSERT resolves:
after(async () => {
  await fanOutToAuditors(insertedSubmissionId);
});
```

**Auditor authorization re-check pattern** (D-36 — analogous to project tamper-check in `handleStepProject` lines 689–701):
```typescript
// Re-query assignments on every tap — never trust callback_data alone
const { assignments } = await import('@/db/schema/assignments');
const { submissions } = await import('@/db/schema/submissions');
const { people } = await import('@/db/schema/people');
const { eq, and } = await import('drizzle-orm');

// Get the submission's projectId
const subRows = await db.select({ projectId: submissions.projectId, personId: submissions.personId })
  .from(submissions).where(eq(submissions.id, submissionId));
if (!subRows.length) {
  await ctx.answerCallbackQuery({ text: 'Kayıt bulunamadı' });
  return;
}

// Get the auditor's person row
const personRows = await db.select({ id: people.id })
  .from(people).where(eq(people.telegramUserId, BigInt(ctx.from.id)));
if (!personRows.length) {
  await ctx.answerCallbackQuery({ text: 'Yetkisiz erişim', show_alert: true });
  return;
}

// Check active auditor assignment on this project
const assignmentRows = await db.select({ id: assignments.id })
  .from(assignments)
  .where(and(
    eq(assignments.personId, personRows[0].id),
    eq(assignments.projectId, subRows[0].projectId),
    eq(assignments.roleOnProject, 'auditor')
  ));
if (!assignmentRows.length) {
  await ctx.answerCallbackQuery({ text: 'Yetkisiz erişim', show_alert: true });
  return;
}
```

---

### `src/lib/bot-keyboards.ts` (extend — add two builders)

**Analog:** `src/lib/bot-keyboards.ts` lines 57–86 (`buildBoqKeyboard`) and lines 103–128 (`buildProjectKeyboard`).

**Module-level imports** (lines 1–14 — the two new functions use the same imports):
```typescript
import { InlineKeyboard } from 'grammy';
// No DB imports — pure module, no async
```

**buildAuditKeyboard pattern** (model: `buildBoqKeyboard` single-action pattern):
```typescript
/**
 * buildAuditKeyboard — inline [✅ Onayla] / [❌ Reddet] buttons for auditor messages.
 * callback_data: "audit:approve:<uuid>" = 52 bytes ✓ (Telegram max: 64)
 */
export function buildAuditKeyboard(submissionId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Onayla', `audit:approve:${submissionId}`)
    .text('❌ Reddet', `audit:reject:${submissionId}`);
}
```

**buildRejectReasonKeyboard pattern** (model: `buildBoqKeyboard` multi-row pattern):
```typescript
/**
 * buildRejectReasonKeyboard — canned reject reasons + free-text option (D-30).
 * Each reason is on its own row for mobile readability (mirrors buildBoqKeyboard row pattern).
 */
export function buildRejectReasonKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Yetersiz iş',            'audit:reason:Yetersiz iş').row()
    .text('Yanlış konum',           'audit:reason:Yanlış konum').row()
    .text('Eksik/bulanık fotoğraf', 'audit:reason:Eksik/bulanık fotoğraf').row()
    .text('Yanlış miktar',          'audit:reason:Yanlış miktar').row()
    .text('Başka (yaz)',            'audit:reason:free');
}
```

**Type declaration** (model: `BoqItemForKeyboard` lines 27–33):
```typescript
// No structural types needed for the audit keyboards — they take only a submissionId string.
```

---

### `src/lib/bot-messages.ts` (extend — add audit message keys)

**Analog:** `src/lib/bot-messages.ts` lines 14–138. The entire file is the pattern.

**Extension pattern** — add new keys inside the existing `MESSAGES` object literal:
```typescript
export const MESSAGES = {
  // ... all existing keys unchanged ...

  // ------------------------------------------------------------------
  // Phase 3: Audit Loop (D-26 tone: respectful "siz", light emoji)
  // ------------------------------------------------------------------

  /** AUDIT-02: over-delivery warning in auditor notification caption (D-28) */
  auditOverDelivery: (newTotal: number, planned: number, unit: string) =>
    `⚠ Sözleşmeyi aşıyor (${newTotal}/${planned} ${unit})`,

  /** AUDIT-05: auditor canned reason prompt */
  auditRejectPrompt:
    'Ret gerekçesini seçin:',

  /** AUDIT-05: free-text reason prompt (Başka path) */
  auditRejectFreeTextPrompt:
    'Lütfen ret gerekçenizi yazın:',

  /** AUDIT-03: unauthorized tap toast */
  auditUnauthorized:
    'Yetkisiz erişim',

  /** AUDIT-06: late/duplicate tap toast (D-29) */
  auditAlreadyResolved:
    'Bu kayıt zaten çözüldü',

  /** AUDIT-04: outcome text appended to sibling messages on approve */
  auditApprovedOutcome: (auditorName: string) =>
    `✅ Onaylandı — ${auditorName}`,

  /** AUDIT-05: outcome text appended to sibling messages on reject */
  auditRejectedOutcome: (auditorName: string, reason: string) =>
    `❌ Reddedildi — ${auditorName}: ${reason}`,

  /** AUDIT-04: worker notification on approve (D-37) */
  workerApproved:
    '✅ Kaydınız onaylandı.',

  /** AUDIT-05: worker notification on reject (D-37) */
  workerRejected: (reason: string) =>
    `❌ Kaydınız reddedildi: ${reason}`,
} as const;
```

**Tone rule** (D-26): respectful "siz" form, plain field-friendly Turkish, light emoji as affordance cues. Match the existing keys exactly.

---

### `src/lib/bot-fsm.ts` (extend — add two new STEPS values)

**Analog:** `src/lib/bot-fsm.ts` lines 23–31 (`STEPS` const object).

**Extension pattern** — add to existing `STEPS` object:
```typescript
export const STEPS = {
  PROJECT:  'project',
  BOQ:      'boq',
  PHOTO:    'photo',
  LOCATION: 'location',
  QUANTITY: 'quantity',
  NOTES:    'notes',
  CONFIRM:  'confirm',
  // Phase 3 additions (D-32 auditor reject-reason FSM)
  AWAITING_REJECT_REASON:      'awaiting_reject_reason',
  AWAITING_REJECT_REASON_FREE: 'awaiting_reject_reason_free',
} as const;
```

**No other changes** — `CONVERSATION_TTL_MS` and `isStaleState` apply to auditor FSM rows identically (D-32 reuses D-22 TTL).

**ConversationData type** — the auditor reject-reason state stores different fields in `data`:
```typescript
// For AWAITING_REJECT_REASON step, data shape is:
// { submissionId: string, auditorPersonId: string, workerPersonId: string }
// This is NOT added to ConversationData interface — that type describes worker flow data.
// Auditor state shape is documented only (planner can add a separate AuditorStateData type).
```

---

### `src/db/schema/submissions.ts` (extend — add three columns, D-38)

**Analog:** `src/db/schema/submissions.ts` lines 1–40. The pattern for nullable FK columns and audit timestamps is already in the file.

**Additions** (insert after `submittedAt`, before the closing `}` of the column map):
```typescript
// Phase 3: audit decision trail (D-38)
// All three are nullable — no DEFAULT needed; backfill not required for existing pending_audit rows.
decidedBy: uuid('decided_by').references(() => people.id),        // null until decided
decidedAt: timestamp('decided_at', { withTimezone: true }),        // null until decided
rejectionReason: text('rejection_reason'),                         // null unless rejected
```

**Import additions** — `people` is already imported (line 8). No new imports needed.

**No CHECK constraint** (D-28): do NOT add `CHECK (approved_qty <= planned_qty)` here or on `boq_items`.

---

### `src/db/schema/audit-notifications.ts` (NEW table, D-34)

**Analog:** `src/db/schema/conversation-state.ts` (lines 1–21) for `bigint` Telegram ID convention, `uuid` FK pattern, `tenantId` nullable, index declarations.

**Full pattern to copy and adapt:**
```typescript
// audit_notifications stores the (chat_id, message_id) for every auditor fan-out
// message sent on worker confirm. Used to edit all sibling messages on first decision (D-34).
import { pgTable, uuid, bigint, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { submissions } from './submissions';
import { people } from './people';

export const auditNotifications = pgTable('audit_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id), // nullable D-09 (matches all other tables)
  submissionId: uuid('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  auditorPersonId: uuid('auditor_person_id').notNull().references(() => people.id),
  // bigint matches people.telegram_user_id convention (conversation-state.ts line 12)
  chatId: bigint('chat_id', { mode: 'bigint' }).notNull(),
  // Telegram message_id is a 32-bit integer within a chat
  messageId: integer('message_id').notNull(),
  sendFailed: boolean('send_failed').notNull().default(false), // D-40: record best-effort failures
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('audit_notifications_submission_idx').on(t.submissionId),
  index('audit_notifications_auditor_idx').on(t.auditorPersonId),
]);
```

**Key conventions matched from analogs:**
- `uuid('id').primaryKey().defaultRandom()` — matches every other table's PK
- `tenantId` nullable with `.references(() => tenants.id)` — matches D-09 pattern in all tables
- `bigint('chat_id', { mode: 'bigint' })` — matches `conversation-state.ts` line 12 `telegramUserId` type
- `{ onDelete: 'cascade' }` on submissionId — matches `boq-items.ts` line 8 cascade pattern

---

### `src/db/schema/index.ts` (extend — register new table)

**Analog:** `src/db/schema/index.ts` lines 1–14. Append one line:

```typescript
export * from './audit-notifications';
```

**Placement**: add after the `submissions` export (line 14) — `audit-notifications` references `submissions`, so it must come after.

---

### `src/db/migrations/` (Drizzle migration files)

**Analog:** `src/db/migrate.ts` + drizzle-kit convention. No code to copy — commands to run:

```bash
# Generate migration after all schema additions:
npx drizzle-kit generate

# Apply to dev/staging DB:
npx drizzle-kit push
```

The `src/db/migrate.ts` script (lines 10–24) handles PostGIS pre-run and then applies all migrations in `src/db/migrations/`. New migration files generated by `drizzle-kit generate` are automatically picked up by `migrate()` on the next run.

---

### `tests/telegram-audit.test.ts` (NEW test file)

**Analog:** `tests/telegram-bot.test.ts` — entire file. The following patterns are the mandatory harness.

**setupBotForTest pattern** (lines 64–93 of `telegram-bot.test.ts` — copy exactly):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';

export async function setupBotForTest() {
  const { bot } = await import('@/lib/telegram');
  vi.spyOn(bot, 'init').mockResolvedValue();
  bot.botInfo = {
    id: 123456, is_bot: true, first_name: 'TestBot', username: 'testbot',
    can_join_groups: false, can_read_all_group_messages: false,
    supports_inline_queries: false, can_manage_bots: false,
    can_connect_to_business: false, has_main_web_app: false,
    has_topics_enabled: false, allows_users_to_create_topics: false,
  };
  // Intercept ALL outbound Telegram API calls (vi.spyOn does NOT work on grammY Proxy)
  bot.api.config.use((_prev, _method, _payload, _signal) =>
    Promise.resolve({ ok: true, result: {} as any })
  );
  return bot;
}
```

**makeCallbackUpdate helper** (extend from `makeTextUpdate` pattern at lines 98–109; Phase 3 equivalent):
```typescript
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
        from: { id: 123456, is_bot: true, first_name: 'TestBot', username: 'testbot' },
        chat: { id: userId, type: 'private' as const },
        date: Math.floor(Date.now() / 1000),
      },
    },
  };
}
```

**beforeEach / afterEach pattern** (lines 245–279 — copy for every describe block):
```typescript
beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_audit';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-audit';
  vi.resetModules();
  // vi.doMock('@/db', ...) here
});

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  vi.restoreAllMocks();
  vi.resetModules();
});
```

**DB mock skeleton** (lines 707–729 `buildDbMock` pattern — adapt for audit tests):
```typescript
function buildAuditDbMock(opts: {
  submissionRow?: Record<string, unknown> | null;
  auditorAssigned?: boolean;
  stateRow?: Record<string, unknown> | null;
}) {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
        }),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    })}),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    })}),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
  };
}
```

**describeIfDb usage** (lines 22–23 of `fixtures/db.ts` — mandatory for SC3/SC5 race tests):
```typescript
describeIfDb('AUDIT-06 SC5 — double-tap race: first wins, second gets toast', () => {
  // requires TEST_DATABASE_URL + live DB
  it('two concurrent auditor taps: exactly one increments approved_qty', async () => { /* ... */ });
});
```

**API transformer for capturing multi-method calls** (lines 544–549 — needed for sendPhoto + editMessageCaption):
```typescript
const sentMessages: Array<{ method: string; payload: unknown }> = [];
bot.api.config.use(async (_prev: any, method: any, payload: any) => {
  sentMessages.push({ method, payload });
  // Return appropriate result shapes per method
  if (method === 'sendPhoto') {
    return Promise.resolve({ ok: true, result: { message_id: 42, chat: { id: userId } } });
  }
  return Promise.resolve({ ok: true, result: {} as any });
});
```

---

### `tests/fixtures/db.ts` (extend — add audit_notifications to truncation list)

**Analog:** `tests/fixtures/db.ts` lines 54–80 (`truncateAllTables`). Add one entry to the `tables` array:
```typescript
const tables = [
  // Phase 3 additions
  'audit_notifications',   // ADD — references submissions
  // existing Phase 2 tables:
  'submissions',
  'conversation_state',
  // ... rest unchanged
];
```

**Placement**: `audit_notifications` references `submissions`, so it must appear BEFORE `submissions` in the truncation list (most-dependent first).

---

## Shared Patterns

### Lazy DB Import (mandatory in all new handlers)
**Source:** `src/lib/telegram.ts` lines 48–51, 98–101, 219–220 (pattern repeated throughout)
**Apply to:** All new handler functions in `telegram.ts` and `bot-audit.ts`
```typescript
// CORRECT — lazy import inside handler body:
const { db } = await import('@/db');
const { submissions } = await import('@/db/schema/submissions');

// WRONG — never at module top level (breaks builds and unit tests without DATABASE_URL):
import { db } from '@/db'; // DO NOT DO THIS
```

### getTxDb (neon-serverless Pool for transactions, MANDATORY)
**Source:** `src/lib/telegram.ts` lines 1156–1175
**Apply to:** Every `db.transaction()` call in Phase 3 (decision transaction + reject-commit transaction)
- The default `@/db` (neon-http) throws `"cannot use database transaction on a HTTP connection"` — never use it for `.transaction()`
- Copy `getTxDb()` exactly including the `ws` try/catch

### ctx.answerCallbackQuery() — first call in every callback path
**Source:** `src/lib/telegram.ts` line 316 + Phase 3 RESEARCH.md Pattern 3
**Apply to:** ALL audit callback handlers (`handleAuditDecision`, `handleAuditReasonSelect`)
```typescript
// ALWAYS call first — before any DB work, before any branching:
await ctx.answerCallbackQuery(); // silent ack
// OR with toast:
await ctx.answerCallbackQuery({ text: 'Bu kayıt zaten çözüldü' });
```

### tenant_id on every insert (D-09)
**Source:** `src/lib/telegram.ts` line 185, `src/lib/tenant.ts`
**Apply to:** All `db.insert()` calls in `bot-audit.ts` and any new migration inserts
```typescript
import { getDefaultTenantId } from '@/lib/tenant';
// In every .values({...}):
tenantId: getDefaultTenantId(),
```

### saveState (auditor reject-reason FSM, D-32)
**Source:** `src/lib/telegram.ts` lines 158–195 (`saveState` function — exported)
**Apply to:** `handleAuditDecision` when action === 'reject' (store FSM state before showing reason keyboard)
```typescript
// Reuse the exported saveState from telegram.ts — same function, new STEPS values:
import { saveState } from '@/lib/telegram';

await saveState(
  db,
  BigInt(ctx.from.id),                    // auditor's telegram_user_id
  STEPS.AWAITING_REJECT_REASON,           // new step from bot-fsm.ts
  { submissionId, auditorPersonId, workerPersonId },  // auditor-specific data shape
  auditorPersonId                          // personId for the row
);
```

### Error handling (try/catch wrapping transactions)
**Source:** `src/lib/telegram.ts` lines 1291–1326 (`handleConfirmSubmit` try/catch block)
**Apply to:** Both the approval and rejection commit transactions in `bot-audit.ts`
```typescript
try {
  await txDb.transaction(async (tx) => { /* ... */ });
} catch (err) {
  if (err instanceof AlreadyResolvedError) {
    await ctx.answerCallbackQuery({ text: MESSAGES.auditAlreadyResolved });
    return;
  }
  console.error('[handleAuditDecision] transaction failed for submissionId', submissionId, ':', err);
  await ctx.answerCallbackQuery({ text: MESSAGES.genericError, show_alert: true });
  return;
}
```

### Callback data parsing (prefix-based, ≤64 bytes)
**Source:** `src/lib/telegram.ts` lines 488–530 (existing prefix-based dispatch), RESEARCH.md Pattern 6
**Apply to:** All `audit:` callback data parsing
```typescript
// Parse: "audit:approve:<uuid>" → submissionId = data.split(':')[2]
// Parse: "audit:reason:Yetersiz iş" → reason = data.slice('audit:reason:'.length)
// Parse: "audit:reason:free" → free-text sentinel
const parts = data.split(':');
const prefix = parts[0];     // 'audit'
const action = parts[1];     // 'approve' | 'reject' | 'reason'
const value = parts.slice(2).join(':'); // UUID or reason string (may contain ':')
```

---

## No Analog Found

All files have close analogs in the existing codebase. No entries.

---

## Metadata

**Analog search scope:** `src/lib/`, `src/db/schema/`, `src/app/api/telegram/`, `tests/`
**Files scanned:** 15 (telegram.ts, bot-fsm.ts, bot-keyboards.ts, bot-messages.ts, boq-balance.ts, tenant.ts, submissions.ts, conversation-state.ts, boq-items.ts, assignments.ts, people.ts, schema/index.ts, webhook/route.ts, telegram-bot.test.ts, fixtures/db.ts, migrate.ts)
**Pattern extraction date:** 2026-05-24
