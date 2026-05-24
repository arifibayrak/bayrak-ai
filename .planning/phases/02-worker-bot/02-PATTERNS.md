# Phase 2: Worker Bot - Pattern Map

**Mapped:** 2026-05-24
**Files analyzed:** 10 new/modified files
**Analogs found:** 9 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/telegram.ts` (extend) | service + middleware | event-driven | `src/lib/telegram.ts` (self — Phase 1 base) | exact |
| `src/lib/bot-fsm.ts` | service | event-driven | `src/lib/telegram.ts` (FSM dispatch pattern) | role-match |
| `src/lib/bot-messages.ts` | utility | transform | `src/lib/tenant.ts` (single export, simple const) | role-match |
| `src/lib/bot-keyboards.ts` | utility | transform | `src/lib/boq-balance.ts` (pure helper) | role-match |
| `src/lib/bot-photo.ts` | service | file-I/O | `src/lib/excel.ts` (file handling utility) | role-match |
| `src/db/schema/conversation-state.ts` | model | CRUD | `src/db/schema/pending-people.ts` | exact |
| `src/db/schema/processed-updates.ts` | model | CRUD | `src/db/schema/pending-people.ts` | exact |
| `src/db/schema/submissions.ts` | model | CRUD | `src/db/schema/boq-items.ts` + `src/db/schema/routes.ts` | exact |
| `src/db/schema/index.ts` (extend) | config | — | `src/db/schema/index.ts` (self — barrel) | exact |
| `tests/telegram-bot.test.ts` | test | event-driven | `tests/telegram-webhook.test.ts` | exact |

---

## Pattern Assignments

### `src/lib/telegram.ts` — extend with FSM middleware + command handlers

**Analog:** `src/lib/telegram.ts` (Phase 1 base, lines 1-80)

**Imports pattern** (lines 20-21 of existing file):
```typescript
import { Bot } from 'grammy';
import { getDefaultTenantId } from '@/lib/tenant';
```
Phase 2 extends this with additional named imports:
```typescript
import { Bot, InlineKeyboard } from 'grammy';
import { getDefaultTenantId } from '@/lib/tenant';
// All bot-level imports stay at the top; DB schema is lazy-imported inside handlers
```

**Bot construction + token guard pattern** (lines 27-34 of existing file):
```typescript
// The token is validated at REQUEST time in the webhook route handler, NOT here.
// Next.js imports route modules during `next build` with no runtime env —
// a module-load throw would break the build.
const token = process.env.TELEGRAM_BOT_TOKEN;
export const bot = new Bot(token || '0:TELEGRAM_BOT_TOKEN_NOT_CONFIGURED');
```
Do NOT change this pattern. Phase 2 registers additional handlers on the same `bot` export.

**Lazy @/db import pattern** (lines 54-59 of existing file) — MANDATORY for every handler:
```typescript
// Lazy-import DB + schema to avoid triggering neon() at module load time
// when DATABASE_URL is not set (e.g. unit tests, CI without a live DB).
const { db } = await import('@/db');
const { pendingPeople } = await import('@/db/schema/pending-people');
```
Apply this pattern to every new handler that touches the DB. Never import `@/db` or schema files at the top of `src/lib/telegram.ts`.

**Existing /start handler guard pattern** (lines 40-48 of existing file):
```typescript
bot.command('start', async (ctx) => {
  const telegramUserId = ctx.from?.id;
  // Safety guard — ctx.from should always be present in private chats
  if (!telegramUserId) {
    await ctx.reply('Bir hata oluştu. Lütfen tekrar deneyin.');
    return;
  }
  // ... lazy DB import + handler body ...
});
```
Phase 2 `/iptal` command and FSM dispatcher `bot.on('message', ...)` follow the same `ctx.from?.id` null-guard before any DB access.

---

### `src/lib/bot-fsm.ts` — FSM step constants, state type, step dispatch

**Analog:** `src/lib/telegram.ts` (event-driven handler structure) + `src/actions/people.ts` (getTxDb transaction pattern)

**Module structure** — keep pure, no top-level DB calls:
```typescript
// src/lib/bot-fsm.ts
// Pure step constants + TypeScript types exported for use by telegram.ts handlers.
// DB calls happen inside dispatch functions, not at module load.

export const STEPS = {
  PROJECT:  'project',
  BOQ:      'boq',
  PHOTO:    'photo',
  LOCATION: 'location',
  QUANTITY: 'quantity',
  NOTES:    'notes',
  CONFIRM:  'confirm',
} as const;

export type Step = typeof STEPS[keyof typeof STEPS];

export interface ConversationData {
  step: Step;
  projectId?: string;
  boqItemId?: string;
  photoUrl?: string;       // Vercel Blob URL stored after upload (upload-on-receipt)
  photoFileId?: string;    // Telegram file_id for reference
  locationLat?: number;
  locationLon?: number;
  quantity?: number;
  notes?: string | null;
  editReturnStep?: Step;   // set when jumping to edit a field (D-16)
  page?: number;           // current keyboard page for paginated lists
}

/** TTL: 24 hours in milliseconds (D-22) */
export const CONVERSATION_TTL_MS = 86_400_000;

export function isStaleState(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() > CONVERSATION_TTL_MS;
}
```

**getTxDb pattern for submission insert** — copy exactly from `src/actions/people.ts` lines 21-38:
```typescript
// src/lib/bot-fsm.ts (or inline in the confirm step handler)
async function getTxDb() {
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ws = require('ws') as { default?: unknown } | unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    neonConfig.webSocketConstructor = (ws as any).default ?? ws;
  } catch {
    // ws not available — will use native WebSocket (browser/edge)
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  return drizzle(pool);
}
```
Source: `src/actions/people.ts` lines 21-38. This is the exact function — do not simplify or alter the `ws` require pattern; the try/catch is intentional for browser/edge fallback.

**Transaction pattern for confirm step** — from `src/actions/people.ts` lines 91-116:
```typescript
const txDb = await getTxDb();
await txDb.transaction(async (tx) => {
  const [person] = await tx
    .insert(people)
    .values({ ... })
    .returning();
  await tx.insert(assignments).values({ ... });
  await tx.delete(pendingPeople).where(eq(pendingPeople.id, pendingId));
});
```
Phase 2 confirm step maps to: insert `submissions` row + delete `conversationState` row inside one transaction. `.returning()` is used when you need the inserted row's `id`; for the submission insert, use it to confirm the insert succeeded.

---

### `src/lib/bot-messages.ts` — Turkish message catalog

**Analog:** `src/lib/tenant.ts` (single-purpose export of a plain constant)

**Module structure** (copy from `src/lib/tenant.ts` lines 1-27):
```typescript
/**
 * src/lib/bot-messages.ts
 *
 * Turkish message catalog for the worker Telegram bot (I18N-01, D-26).
 * Single source of truth for all Turkish copy — edit here to tune wording.
 *
 * Tone: respectful "siz" form, plain and field-friendly, light emoji as
 * affordance cues (📷 photo, 📍 location).  See CONTEXT.md D-19/D-26.
 */

export const MESSAGES = {
  // ... all Turkish string constants
} as const;
```
The `as const` assertion is the pattern from `tenant.ts` (implicit via `export function` that returns a string literal). For the message catalog, use `export const MESSAGES = { ... } as const` so TypeScript narrows every key to its literal string type.

No dynamic imports, no async, no DB. This file is always synchronously available to handlers.

---

### `src/lib/bot-keyboards.ts` — keyboard builders (project list, BOQ paginated, confirm summary)

**Analog:** `src/lib/boq-balance.ts` (pure helper, no side effects)

**Pure function pattern** — from `src/lib/boq-balance.ts` lines 19-27:
```typescript
export function remainingBalance(
  planned: string | number,
  approved: string | number
): number {
  const plannedNum = typeof planned === 'string' ? parseFloat(planned) : planned;
  const approvedNum = typeof approved === 'string' ? parseFloat(approved) : approved;
  return plannedNum - approvedNum;
}
```
Keyboard builder functions are pure: receive data in, return `InlineKeyboard` out. No DB calls. No `ctx` references. Testable without a running bot.

**InlineKeyboard import** — from grammY, not from framework-level re-exports:
```typescript
import { InlineKeyboard } from 'grammy';
```

**JSDoc style** — follow `boq-balance.ts` single-function JSDoc:
```typescript
/**
 * buildBoqKeyboard — returns a paginated InlineKeyboard for BOQ item selection.
 *
 * @param items  - Full list of BOQ items for the project
 * @param page   - Zero-based page index
 * @returns InlineKeyboard with PAGE_SIZE items + prev/next navigation
 */
export function buildBoqKeyboard(items: BoqItem[], page: number): InlineKeyboard { ... }
```

---

### `src/lib/bot-photo.ts` — photo download from Telegram + upload to Vercel Blob

**Analog:** No exact codebase analog exists (`@vercel/blob` `put()` is unused in Phase 1). Closest structural analog is `src/lib/excel.ts` (file I/O utility). Flag: **no exact analog — this is the first Vercel Blob use in the codebase.**

**Module structure** — follow `src/lib/excel.ts` file utility pattern (single exported async function, typed inputs, typed return):
```typescript
/**
 * src/lib/bot-photo.ts
 *
 * Downloads a photo from Telegram's file API and uploads it to Vercel Blob.
 * First use of @vercel/blob `put()` in this codebase.
 *
 * @vercel/blob reads BLOB_READ_WRITE_TOKEN from env automatically — no explicit
 * token passing required in the put() call.
 */
import { put } from '@vercel/blob';
import type { Context } from 'grammy';

export async function uploadPhotoToBlob(
  ctx: Context,
  submissionFlowId: string
): Promise<string> {
  // photo[] is largest-last per Telegram docs (Pitfall 5 in RESEARCH.md)
  const photoSizes = ctx.msg!.photo!;
  const photo = photoSizes[photoSizes.length - 1];

  const file = await ctx.api.getFile(photo.file_id);
  const telegramFileUrl =
    `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

  const response = await fetch(telegramFileUrl);
  if (!response.ok) throw new Error(`Telegram file fetch failed: ${response.status}`);

  const ext = file.file_path?.split('.').pop() ?? 'jpg';
  const { url } = await put(
    `submissions/${submissionFlowId}/photo.${ext}`,
    response.body!,
    { access: 'public', addRandomSuffix: false }
  );
  return url;
}
```

**Error handling** — no try/catch inside the utility; let the caller (step handler in `telegram.ts`) catch and reply with a Turkish error message. This matches `boq-balance.ts` (no internal error handling — caller responsibility).

---

### `src/db/schema/conversation-state.ts` — conversation_state table

**Analog:** `src/db/schema/pending-people.ts` (same pattern: uuid PK, tenantId FK, bigint telegramUserId, timestamps, indexes)

**Imports pattern** — from `src/db/schema/pending-people.ts` line 4:
```typescript
import { pgTable, uuid, text, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
```
Phase 2 adds `jsonb` and drops `unique` on `telegramUserId` in favor of a UNIQUE constraint enforced via `.unique()` on the column (one conversation per worker, same as `pending-people` has unique `telegram_user_id`):
```typescript
import { pgTable, uuid, text, bigint, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { people } from './people';
```

**Table definition pattern** — from `src/db/schema/pending-people.ts` lines 7-16:
```typescript
export const pendingPeople = pgTable('pending_people', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  telegramUserId: bigint('telegram_user_id', { mode: 'bigint' }).notNull().unique(),
  telegramName: text('telegram_name'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('pending_people_tenant_idx').on(t.tenantId),
  index('pending_people_telegram_idx').on(t.telegramUserId),
]);
```
`conversation-state.ts` follows the exact same structure: uuid PK, `tenantId` nullable FK, `telegramUserId` bigint unique, `personId` uuid FK, `flowId` uuid, `currentStep` text, `data` jsonb, `updatedAt` timestamp with timezone.

**Key difference from analog:** uses `updatedAt` (not `startedAt`/`createdAt`) because the TTL check (D-22) reads this column — it must be updated on every state write. Add `.defaultNow()` AND update it explicitly on every `db.update()` call.

---

### `src/db/schema/processed-updates.ts` — processed_updates dedup table

**Analog:** `src/db/schema/pending-people.ts` (simple table, single-column natural key)

**Imports pattern** — minimal, only what is needed:
```typescript
import { pgTable, bigint, timestamp } from 'drizzle-orm/pg-core';
```
No `uuid`, no FK references, no tenant — this table is tenant-agnostic (D-13 Guard 1 applies at the update level before any tenant context is established).

**Table definition pattern** — from `src/db/schema/pending-people.ts` (simplified):
```typescript
export const processedUpdates = pgTable('processed_updates', {
  updateId: bigint('update_id', { mode: 'bigint' }).primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
});
// No additional indexes needed — PRIMARY KEY on update_id IS the unique index.
// No table-level constraint function needed (no secondary indexes).
```
Note: This is the only table in the schema with no `uuid` PK and no `tenantId`. That is intentional — `update_id` IS the natural primary key (D-13).

**Insert pattern for dedup guard** — uses `.onConflictDoNothing().returning()` to determine if this is a duplicate:
```typescript
// Inside telegram.ts idempotency middleware (lazy import):
const { db } = await import('@/db');
const { processedUpdates } = await import('@/db/schema/processed-updates');

const inserted = await db
  .insert(processedUpdates)
  .values({ updateId: BigInt(ctx.update.update_id), processedAt: new Date() })
  .onConflictDoNothing()
  .returning({ id: processedUpdates.updateId });

if (inserted.length === 0) return; // Already processed — skip all handlers
await next();
```

---

### `src/db/schema/submissions.ts` — submissions table

**Analog:** `src/db/schema/boq-items.ts` (numeric columns, FK references, project/tenant structure) + `src/db/schema/routes.ts` (geometry column + GiST index pattern)

**Imports pattern** — combining both analogs:

From `src/db/schema/boq-items.ts` lines 1-3:
```typescript
import { pgTable, uuid, text, numeric, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { tenants } from './tenants';
```
From `src/db/schema/routes.ts` lines 4-5:
```typescript
import { pgTable, uuid, integer, timestamp, customType, index } from 'drizzle-orm/pg-core';
```
Phase 2 combines and extends:
```typescript
import { pgTable, uuid, text, numeric, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { geometry } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { people } from './people';
import { projects } from './projects';
import { boqItems } from './boq-items';
```

**Geometry column pattern** — from `src/db/schema/routes.ts` lines 22-32:
```typescript
export const routes = pgTable('routes', {
  ...
  geom: geomLinestring('geom').notNull(),
  ...
}, (t) => [
  index('routes_geom_gist').using('gist', t.geom),  // GiST index mandatory for spatial
  index('routes_project_idx').on(t.projectId),
]);
```
`submissions.ts` uses `geometry('location', { type: 'point', mode: 'xy', srid: 4326 })` (nullable — location is present after LOG-05 but referenced from a geometry column for Phase 4 PostGIS). GiST index follows the same `.using('gist', t.location)` pattern.

**Numeric column pattern** — from `src/db/schema/boq-items.ts` lines 11-12:
```typescript
plannedQty: numeric('planned_qty', { precision: 12, scale: 3 }).notNull(),
approvedQty: numeric('approved_qty', { precision: 12, scale: 3 }).notNull().default('0'),
```
`submissions.quantity` uses `numeric('quantity', { precision: 12, scale: 3 }).notNull()`. `locationLat`/`locationLon` use `numeric('location_lat', { precision: 10, scale: 7 })`.

**Unique constraint pattern** — from `src/db/schema/assignments.ts` lines 15-18:
```typescript
}, (t) => [
  unique('unique_person_project_role').on(t.personId, t.projectId, t.roleOnProject),
  index('assignments_project_idx').on(t.projectId),
  index('assignments_person_idx').on(t.personId),
]);
```
`submissions.ts` adds `unique('submissions_flow_id_unique').on(t.flowId)` as D-13 Guard 2. Name constraint explicitly (first argument) so migration SQL is readable.

**Status enum column** — from `src/db/schema/assignments.ts` line 13:
```typescript
roleOnProject: text('role_on_project', { enum: ['worker', 'auditor'] }).notNull(),
```
`submissions.status` follows the same `text(..., { enum: [...] }).notNull().default('pending_audit')` pattern.

---

### `src/db/schema/index.ts` — extend barrel export

**Analog:** `src/db/schema/index.ts` (self)

**Current barrel pattern** (lines 1-9):
```typescript
// Barrel export of all Drizzle tables for the bayrak-ai schema.
export * from './tenants';
export * from './auth';
export * from './projects';
export * from './boq-items';
export * from './routes';
export * from './people';
export * from './pending-people';
export * from './assignments';
```
Phase 2 appends three lines at the end, in this dependency order (exports that reference other tables come after the referenced tables):
```typescript
export * from './conversation-state';  // references tenants, people
export * from './processed-updates';   // no FK references
export * from './submissions';         // references tenants, people, projects, boq-items
```

---

### `tests/telegram-bot.test.ts` — new test file for Phase 2 FSM

**Analog:** `tests/telegram-webhook.test.ts` (exact match — same grammY test harness patterns)

**File header JSDoc pattern** — from `tests/telegram-webhook.test.ts` lines 1-16:
```typescript
/**
 * tests/telegram-bot.test.ts
 *
 * Phase 2: Worker Bot FSM — step validation, idempotency, and cold-start resume tests.
 *
 * Test groups:
 *   (a) Pure unit tests — step handlers reject wrong input types (no DB, no network)
 *   (b) describeIfDb — confirm step creates exactly one submissions row; duplicate
 *       update_id is a no-op (SC4 mandatory test from D-13)
 *   (c) Pure unit tests — TTL staleness check, Turkish decimal normalization
 */
```

**Import pattern** — from `tests/telegram-webhook.test.ts` lines 18-19:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';
```

**beforeEach env setup pattern** — from `tests/telegram-webhook.test.ts` lines 39-55:
```typescript
beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_for_unit_tests';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret-value';
  vi.resetModules();
  vi.doMock('@/db', () => ({ db: { insert: mockInsert } }));
});

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  vi.restoreAllMocks();
  vi.resetModules();
});
```

**bot.botInfo setter pattern** — from `tests/telegram-webhook.test.ts` lines 197-212 (MANDATORY for `bot.handleUpdate()` calls):
```typescript
vi.spyOn(bot, 'init').mockResolvedValue();
bot.botInfo = {
  id: 123456,
  is_bot: true,
  first_name: 'TestBot',
  username: 'testbot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_manage_bots: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
};
```
Copy this block exactly. grammY validates `this.me` before creating handler context; omitting `botInfo` causes `"Bot not initialized!"` errors.

**API interception pattern** — from `tests/telegram-webhook.test.ts` lines 217-220:
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
bot.api.config.use((_prev, _method, _payload, _signal) =>
  Promise.resolve({ ok: true, result: {} as any })
);
```
All outbound Telegram API calls (replies, keyboard sends, `answerCallbackQuery`) are intercepted by this transformer. Use it in every `bot.handleUpdate()` test to prevent real API calls.

**handleUpdate call pattern** — from `tests/telegram-webhook.test.ts` lines 222-234:
```typescript
await bot.handleUpdate({
  update_id: userId,
  message: {
    message_id: userId,
    from: { id: userId, first_name: firstName, is_bot: false, language_code: 'tr' },
    chat: { id: userId, type: 'private' as const, first_name: firstName },
    date: Math.floor(Date.now() / 1000),
    text: '/start',
    entities: [{ offset: 0, length: 6, type: 'bot_command' as const }],
  },
});
```
Phase 2 tests send photo, location, and callback_query updates in addition to text messages. The `update_id` field drives the D-13 dedup guard — tests for idempotency must send the SAME `update_id` twice.

**describeIfDb + truncateAllTables pattern** — from `tests/telegram-webhook.test.ts` lines 151-184:
```typescript
describeIfDb('confirm step — submission insert idempotency (D-13)', () => {
  let testDb: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    testDb = await getTestDb();
    await truncateAllTables(testDb);
    // Re-seed default tenant after truncation
    const { sql } = await import('drizzle-orm');
    await testDb.execute(sql.raw(`
      INSERT INTO tenants (id, name)
      VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant (test)')
      ON CONFLICT DO NOTHING
    `));
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_for_db_tests';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'db-test-secret-value';
    vi.resetModules();
    vi.doMock('@/db', () => ({ db: testDb }));
  });
```
`truncateAllTables` in `tests/fixtures/db.ts` must be extended to include the three new tables: `conversation_state`, `processed_updates`, `submissions` — in FK-safe order (most dependent first):
```typescript
// Add at the top of the tables array in truncateAllTables:
"submissions",
"conversation_state",
"processed_updates",
```

---

## Shared Patterns

### Lazy `@/db` import inside every handler
**Source:** `src/lib/telegram.ts` lines 54-59; `src/lib/telegram.ts` Phase 2 comment line 55:
```typescript
// Lazy-import DB + schema to avoid triggering neon() at module load time
// when DATABASE_URL is not set (e.g. unit tests, CI without a live DB).
const { db } = await import('@/db');
const { tableName } = await import('@/db/schema/table-name');
```
**Apply to:** ALL new handlers in `src/lib/telegram.ts`, ALL step handler functions in `src/lib/bot-fsm.ts`.
**Never do:** `import { db } from '@/db'` at the top of `telegram.ts` or any file that registers bot handlers.

### getDefaultTenantId() on every insert
**Source:** `src/lib/telegram.ts` lines 21, 65-69:
```typescript
import { getDefaultTenantId } from '@/lib/tenant';
// ...
await db.insert(pendingPeople).values({
  telegramUserId: BigInt(telegramUserId),
  telegramName,
  tenantId: getDefaultTenantId(),
}).onConflictDoNothing();
```
**Apply to:** All inserts into `conversation_state` and `submissions`. `processed_updates` has no `tenantId` column (intentional — dedup is pre-tenant-resolution).

### BigInt for Telegram user IDs
**Source:** `src/lib/telegram.ts` line 65; `src/db/schema/people.ts` line 7:
```typescript
telegramUserId: BigInt(telegramUserId),  // JS number → BigInt for bigint column
// schema: bigint('telegram_user_id', { mode: 'bigint' }).notNull()
```
**Apply to:** All reads and writes of `telegram_user_id` across `conversation_state` and `processed_updates` tables. `ctx.from?.id` is a JS number; always wrap in `BigInt()` before DB operations.

### getTxDb() for any db.transaction() call
**Source:** `src/actions/people.ts` lines 21-38; called at lines 91, 153:
```typescript
const txDb = await getTxDb();
await txDb.transaction(async (tx) => {
  await tx.insert(...).values(...).returning();
  await tx.delete(...).where(...);
});
```
**Apply to:** The FSM confirm step handler only. All other FSM operations (state reads, state updates, idempotency insert) use the default `neon-http` `db` client from `@/db`.

### vi.doMock('@/db') test isolation
**Source:** `tests/telegram-webhook.test.ts` lines 54, 175:
```typescript
vi.resetModules();
vi.doMock('@/db', () => ({ db: { insert: mockInsert } }));
// For DB integration tests:
vi.doMock('@/db', () => ({ db: testDb }));
```
**Apply to:** All test groups in `tests/telegram-bot.test.ts`. Always call `vi.resetModules()` before `vi.doMock()` in `beforeEach`.

### Text enum columns
**Source:** `src/db/schema/assignments.ts` line 13:
```typescript
roleOnProject: text('role_on_project', { enum: ['worker', 'auditor'] }).notNull(),
```
**Apply to:** `submissions.status` (`enum: ['pending_audit', 'approved', 'rejected']`), `conversation_state.currentStep` (can be free text or use same pattern with Step enum values).

### Named unique constraints (not anonymous)
**Source:** `src/db/schema/assignments.ts` line 15:
```typescript
unique('unique_person_project_role').on(t.personId, t.projectId, t.roleOnProject),
```
**Apply to:** `submissions_flow_id_unique` constraint on `submissions.flowId`. Always provide an explicit name so migration SQL is readable and constraint can be referenced by name in error handling.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/bot-photo.ts` | service | file-I/O | No Vercel Blob `put()` usage exists anywhere in the codebase (Phase 1 installed `@vercel/blob` but never called it). Closest structural analog is `src/lib/excel.ts` (file I/O utility function pattern). Use RESEARCH.md Pattern 5 + the `put()` code example as the primary reference. |

---

## Metadata

**Analog search scope:** `src/lib/`, `src/db/schema/`, `src/actions/`, `src/app/api/`, `tests/`
**Files scanned:** 28
**Pattern extraction date:** 2026-05-24

**Critical warnings verified against live codebase:**
1. `src/db/index.ts` uses `neon-http` — confirmed NOT WebSocket Pool. getTxDb() in `src/actions/people.ts` is the ONLY transaction-capable DB client. Use it for the confirm step.
2. `bot.botInfo` setter is required before `bot.handleUpdate()` in tests — confirmed in `tests/telegram-webhook.test.ts` lines 198-212.
3. `api.config.use(transformer)` intercepts all outbound API calls — confirmed in `tests/telegram-webhook.test.ts` lines 218-220.
4. `BigInt()` wrapping for all `telegram_user_id` values — confirmed in `src/lib/telegram.ts` line 65.
5. `truncateAllTables` in `tests/fixtures/db.ts` must be extended — three new tables not yet present in the table list.
