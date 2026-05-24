# Phase 2: Worker Bot - Research

**Researched:** 2026-05-24
**Domain:** Telegram conversational bot — DB-row FSM, idempotency, Vercel/serverless, photo+location handling, Turkish i18n
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-12:** Explicit DB-row finite-state machine (NOT `@grammyjs/conversations`). One `conversation_state` row per worker (keyed by `telegram_id` / person) holds `current_step` and partial submission as JSON. `@grammyjs/conversations` and `@grammyjs/storage-psql` are NOT required and must NOT be installed.
- **D-13:** Two independent idempotency guards: (1) persisted `update_id` dedup — a replayed/duplicate update is a no-op for the whole pipeline; (2) unique constraint on the submission's natural key — a double-confirm cannot insert two submission rows. Duplicate-update integration test is mandatory on day one.
- **D-14:** On resume of a half-finished flow, reprompt the current step in Turkish ("Devam ediyoruz — …"). Workers on flaky field connections always see what's expected.
- **D-15:** `/start` while a flow is in progress offers an inline "Devam et / Baştan başla" choice. Never silently discards a half-done log.
- **D-16:** The confirm step shows a full summary with per-field edit buttons; the worker can jump back and redo any single field (e.g., "Fotoğrafı değiştir", "Miktarı düzelt") and return to confirm. The FSM must support jump-to-step → return-to-confirm.
- **D-17:** Turkish `/iptal` (cancel) command available at any step; clears `conversation_state` row and confirms "İptal edildi".
- **D-18:** After successful confirm, send "Gönderildi" + "Yeni kayıt" button. Do NOT auto-loop; worker explicitly starts another.
- **D-19:** On wrong input type, bot rejects and re-explains with a short how-to hint in Turkish. The step does NOT advance. Field workers may be low-literacy — explicit hint beats a terse error.
- **D-20:** Accept any native Telegram location message (lat/long present); reject only typed coordinates. Geofence is Phase 4.
- **D-21:** Notes (LOG-07) are optional: worker can type notes OR tap "Atla" (skip). Skipped/empty notes stored as `null`.
- **D-22:** `conversation_state` rows expire after a TTL (~24h). Stale row → worker's next message starts a clean flow.
- **D-23:** BOQ line items presented as paginated inline keyboard (~6–8 per page, with ‹ › navigation). Project list reuses same paginated keyboard pattern.
- **D-24:** Each BOQ option shows its remaining balance (e.g., "Boru döşeme — 320/500 m kaldı"), read from `src/lib/boq-balance.ts`.
- **D-25:** Selecting a fully-consumed (0-balance) item is allowed with a soft warning. Over-delivery is real in construction; enforcement is Phase 3.
- **D-26:** Worker bot operates in Turkish only. Tone: respectful "siz" form, plain and field-friendly, light emoji as affordance cues. Bot's Turkish strings live in a simple message catalog (planner picks exact mechanism; single source of truth).

### Claude's Discretion

- Exact `conversation_state` / `processed_updates` / `submissions` table and column names, indexes, and Drizzle schema organization — honor D-12, D-13, D-22.
- The exact TTL value for stale `conversation_state` (D-22).
- The FSM's internal step representation and the jump-to-step/edit mechanism (D-16).
- Single photo per submission (default): one photo, uploaded to Vercel Blob — planner decides upload-on-receipt vs upload-on-confirm.
- Quantity prompt shows the selected BOQ item's unit (e.g., "Kaç metre?"); numeric parsing accepts decimals (planner decides decimal/locale handling).
- Pagination page size, button ordering, and exact Turkish copy/wording for every prompt (within the D-26 tone).

### Deferred Ideas (OUT OF SCOPE)

- Location geofencing (GEO-02, Phase 4). Phase 2 accepts any native location.
- Multiple photos per submission — single photo for v1; revisit if field demands it.
- Type-to-search BOQ selection — rejected for v1; paginated keyboard (D-23) instead.
- After-N-failures escalating help / "Yardım" contact.
- Quantity vs remaining-balance hard validation — enforcement in Phase 3.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOG-01 | Worker identified by Telegram User ID on `/start`; bot greets them by role | Phase 1 already stores `people` rows with `telegramUserId`; the handler reads from `people` joined to `assignments` to find the person + projects |
| LOG-02 | Worker selects active project from inline keyboard of assigned projects | `InlineKeyboard.from()` + paginated callback; `assignments` table + `people.telegramUserId` join provides the project list |
| LOG-03 | Worker selects BOQ line item / material (inline keyboard) | `boqItems` table + `remainingBalance()` from `boq-balance.ts`; paginated keyboard pattern (D-23/D-24) |
| LOG-04 | Worker uploads photo; bot rejects non-photo input and reprompts | grammY filter `ctx.on('message:photo')`; reject all other message types with Turkish reprompt |
| LOG-05 | Worker shares location via native Telegram feature; bot rejects typed coordinates | `ctx.on('message:location')` for valid; any other message type → reprompt with "📎 → Konum" hint |
| LOG-06 | Worker enters numeric quantity; bot rejects non-numeric input | Zod `z.string().transform(parseFloat)` or `isNaN` check; unit shown in prompt from `boqItems.unit` |
| LOG-07 | Worker can add optional free-text notes | Step present with "Atla" skip button; stored as `null` if skipped (D-21) |
| LOG-08 | On confirmation, submission persists with `status: pending_audit` | New `submissions` table with Drizzle insert in DB transaction; unique constraint guards duplication |
| LOG-09 | Bot guides worker sequentially; reprompts on skipped or out-of-order step | DB-row FSM `current_step` column prevents any step advancement on invalid input; cold-start resume re-sends current step prompt |
| LOG-10 | In-progress submission preserved across serverless invocations; never lost or duplicated | `conversation_state` DB row; `processed_updates` dedup table; neon-serverless Pool for transaction |
| I18N-01 | Worker Telegram bot operates in Turkish | Simple message catalog (TypeScript const map or flat JSON); no next-intl in webhook handler |
</phase_requirements>

---

## Summary

Phase 2 builds the worker conversation loop entirely on top of Phase 1's existing foundation: the grammY `bot` instance in `src/lib/telegram.ts`, the webhook route in `src/app/api/telegram/webhook/route.ts`, and the Drizzle schema for `people`, `assignments`, and `boqItems`. The fundamental design constraint (D-12) rules out `@grammyjs/conversations` in favour of a plain DB-row finite-state machine — a simpler, more debuggable, and replay-safe approach for a strictly linear six-step flow.

Three new DB tables are required: `conversation_state` (one row per worker, holds `current_step` + partial JSON payload), `processed_updates` (one row per handled `update_id`, the dedup fence from D-13), and `submissions` (one row per confirmed field log, with `status: pending_audit` and a unique natural-key constraint). The transaction that writes the final `submissions` row must use the `neon-serverless` Pool/WebSocket driver (not `neon-http`) because `db.transaction()` requires a real connection — this is the same established pattern from `src/actions/people.ts`. Photo upload to Vercel Blob via `put()` is the first use of that installed-but-unused package; the bot downloads the file from Telegram via `ctx.api.getFile(fileId)` then pipes it to Blob.

The most non-obvious complexity lives in three areas: (1) paginated inline keyboards for BOQ selection (D-23) with `callback_query` routing for `prev`/`next`/`select` actions; (2) the confirm step with per-field edit buttons (D-16) that require the FSM to support `jump_to_step` without resetting the whole partial payload; and (3) the dual-guard idempotency system (D-13) — both guards are easy to implement individually but must both be active and tested together.

**Primary recommendation:** Implement the FSM as a single dispatcher in `src/lib/telegram.ts` that reads the worker's `conversation_state` row, routes to a step handler, and writes back the updated state. Each step handler is a pure function of `(ctx, state) → newState | null`. This keeps the bot logic testable without a live webhook.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Telegram update receipt + secret-token check | API / Backend (webhook route) | — | grammY `webhookCallback` in `route.ts`; already in place from Phase 1 |
| `update_id` dedup fence | API / Backend (webhook route) | Database | First thing after secret-token check; reads/writes `processed_updates` table before any handler runs |
| Worker identity lookup (`telegramUserId` → person + projects) | API / Backend (handler) | Database | DB read from `people` join `assignments`; lookup happens on every message for unregistered/active guard |
| FSM state load / step dispatch | API / Backend (`src/lib/telegram.ts`) | Database | Reads `conversation_state` row; routes to step handler; writes back updated state |
| Photo download from Telegram | API / Backend (handler) | Telegram API | `ctx.api.getFile(fileId)` + HTTP fetch to `api.telegram.org/file/bot<token>/<file_path>` |
| Photo upload to Vercel Blob | API / Backend (handler) | Vercel Blob | `put()` from `@vercel/blob`; stores photo URL in partial submission payload |
| Location validation | API / Backend (handler) | — | Check `ctx.message?.location` truthy; reject everything else |
| Numeric quantity validation | API / Backend (handler) | — | `parseFloat()` + `isNaN` guard or Zod transform |
| BOQ paginated keyboard rendering | API / Backend (handler) | Database | Reads `boqItems` for project; `InlineKeyboard.from()` with page-slice |
| Submission persistence | Database | — | Drizzle `db.transaction()` via neon-serverless Pool; `submissions` row + unique constraint |
| Turkish message catalog | API / Backend (shared const) | — | Single TypeScript `const MESSAGES` map in `src/lib/bot-messages.ts`; imported by all handlers |
| Conversation TTL eviction | Database | API / Backend | Timestamp check on `conversation_state` read; stale rows treated as abandoned (D-22) |

---

## Standard Stack

### Core (all already installed — no new direct installs needed)

| Library | Installed Version | Purpose | Why Standard |
|---------|------------------|---------|--------------|
| `grammy` | 1.43.0 [VERIFIED: npm registry] | Bot framework; `bot.on()`, `InlineKeyboard`, `ctx.api`, `bot.handleUpdate()` | Already in use for Phase 1 webhook |
| `drizzle-orm` | 0.45.2 [VERIFIED: npm registry] | DB schema, queries, migrations | Project ORM; all schema already uses it |
| `@neondatabase/serverless` | 1.1.0 [VERIFIED: npm registry] | Both neon-http (reads) and neon-serverless Pool (transactions) | Already used; Pool/WebSocket pattern established in `src/actions/people.ts` |
| `@vercel/blob` | 2.4.0 [VERIFIED: npm registry] | Photo storage via `put()` | Already installed (Phase 1); first use in Phase 2 |
| `zod` | 4.4.3 [VERIFIED: npm registry] | Input schema validation | Already used; note v4 API differences (see Pitfalls) |
| `ws` | 8.21.0 [VERIFIED: npm registry] | WebSocket constructor for neon-serverless Pool in Node.js | Already a transitive dep of `@neondatabase/serverless`; already used in `src/actions/people.ts` |

### No new packages to install

All required packages were installed in Phase 1. Phase 2 is code-only: new Drizzle schema files, handlers, and a message catalog.

The CONTEXT.md (D-12) explicitly rules out `@grammyjs/conversations` and `@grammyjs/storage-psql`. Do NOT install either.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DB-row FSM (D-12) | `@grammyjs/conversations` | conversations plugin uses replay engine — all DB calls must be wrapped in `conversation.external()`, easy to miss, causes duplicate rows on replay. DB-row FSM is simpler and fully transparent. |
| Simple message catalog TS const | `next-intl` in webhook handler | `next-intl`'s `getTranslations()` targets RSC/dashboard; it's not designed for webhook handler context and introduces unnecessary overhead. Plain TS const is sufficient for a single-language all-Turkish bot. |
| Vercel Blob `put()` for photos | Store Telegram `file_id` only | `file_id` is valid long-term but requires a Telegram API call to render in the dashboard later. Storing the Blob URL is self-contained and dashboard-ready for Phase 5. |

---

## Package Legitimacy Audit

No new packages are being installed in this phase. All packages listed above were installed in Phase 1 and verified at that time (see `01-RESEARCH.md` Package Legitimacy Audit).

`ws` (already a transitive dep, not a new direct install):
- Registry: npm
- Age: Published 2011-12-04 (14+ years)
- Source: github.com/websockets/ws
- slopcheck: not available — but age, download volume (most depended-on Node.js WS library), and source repo are unambiguous. [ASSUMED for slopcheck verdict; otherwise established package]
- Disposition: Approved (no new install — already present via `@neondatabase/serverless`)

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Telegram Client (worker's phone)
        │
        │ POST /api/telegram/webhook
        │ X-Telegram-Bot-Api-Secret-Token: <secret>
        ▼
┌──────────────────────────────────────────────────────────┐
│ src/app/api/telegram/webhook/route.ts                    │
│  (Node.js runtime, maxDuration: 55s, memory: 512MB)     │
│                                                          │
│  1. grammY secret-token check (401 if bad)              │
│  2. bot.handleUpdate(update) ──────────────────────────┐ │
└──────────────────────────────────────────────────────────┘
                                                         │
                    ┌────────────────────────────────────┘
                    ▼
┌──────────────────────────────────────────────────────────┐
│ src/lib/telegram.ts  — grammY bot handlers              │
│                                                          │
│  ┌─ Middleware layer (runs on every update) ──────────┐  │
│  │  [1] update_id dedup: check processed_updates      │  │
│  │      → duplicate? respond 200 + return             │  │
│  │  [2] worker identity: lookup people by telegramId  │  │
│  │      → unregistered? "pending approval" reply      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ /start command handler ──────────────────────────┐  │
│  │  Check conversation_state:                        │  │
│  │    none/stale → show assigned projects keyboard   │  │
│  │    active → show "Devam et / Baştan başla" (D-15) │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ /iptal command handler ──────────────────────────┐  │
│  │  Delete conversation_state row → "İptal edildi"   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ FSM dispatcher (all other updates) ─────────────┐   │
│  │  Load conversation_state row                      │   │
│  │  Check TTL (D-22) → stale? reset + reprompt step 0│  │
│  │  Route to step handler:                           │   │
│  │    STEP_PROJECT   → handle project selection      │   │
│  │    STEP_BOQ       → handle BOQ item selection     │   │
│  │    STEP_PHOTO     → handle photo upload           │   │
│  │    STEP_LOCATION  → handle location share         │   │
│  │    STEP_QUANTITY  → handle numeric input          │   │
│  │    STEP_NOTES     → handle notes / skip           │   │
│  │    STEP_CONFIRM   → show summary + edit buttons   │   │
│  │    STEP_EDIT_*    → handle per-field edit         │   │
│  └───────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
           │                    │                   │
     ┌─────┘          ┌─────────┘         ┌─────────┘
     ▼                ▼                   ▼
 Neon Postgres    Telegram API       Vercel Blob
 (conversation_   (outbound replies,  (put(photo) →
  state,          InlineKeyboard)     stored URL)
  processed_
  updates,
  submissions)
```

### Recommended Project Structure

```
src/
├── lib/
│   ├── telegram.ts           # bot instance + all handlers (Phase 1 exists; Phase 2 extends)
│   ├── bot-messages.ts       # NEW: Turkish message catalog (all bot copy in one place)
│   ├── bot-fsm.ts            # NEW: FSM step constants, state type, step dispatch logic
│   ├── bot-keyboards.ts      # NEW: keyboard builders (project list, BOQ paginated, confirm summary)
│   ├── bot-photo.ts          # NEW: download from Telegram + upload to Vercel Blob
│   ├── boq-balance.ts        # Phase 1 (unchanged)
│   └── tenant.ts             # Phase 1 (unchanged)
├── db/
│   └── schema/
│       ├── conversation-state.ts  # NEW: conversation_state table
│       ├── processed-updates.ts   # NEW: processed_updates dedup table
│       ├── submissions.ts         # NEW: submissions table (status: pending_audit)
│       └── index.ts               # extend barrel export
└── app/api/telegram/webhook/
    └── route.ts              # Phase 1 (no changes needed; bot handlers registered in telegram.ts)
```

### Pattern 1: DB-Row FSM Step Dispatch

**What:** The FSM dispatcher reads one `conversation_state` row, checks TTL, and delegates to a step handler function. Each step handler receives `(ctx, state)` and returns `newState` or `null` (no-op on invalid input).

**When to use:** All non-command Telegram updates that represent a mid-flow message.

```typescript
// Source: grammY docs https://grammy.dev/guide/filter-queries [CITED]
// + project patterns from src/actions/people.ts [VERIFIED: codebase]

// src/lib/bot-fsm.ts
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
  photoUrl?: string;     // Vercel Blob URL stored after upload
  photoFileId?: string;  // Telegram file_id for reference
  locationLat?: number;
  locationLon?: number;
  quantity?: number;
  notes?: string | null;
  editReturnStep?: Step; // set when jumping to edit a field (D-16)
  page?: number;         // current keyboard page for BOQ list
}

// In telegram.ts — FSM dispatcher
bot.on('message', async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;
  const { db } = await import('@/db');
  // 1. Load state
  const stateRow = await loadConversationState(db, telegramId);
  if (!stateRow || isStale(stateRow)) {
    // Stale or absent: reprompt to /start
    await ctx.reply(MESSAGES.noActiveFlow);
    return;
  }
  // 2. Dispatch
  await dispatchStep(ctx, stateRow.data as ConversationData, db);
});
```

### Pattern 2: Idempotency Middleware

**What:** Before any handler logic, check `processed_updates` for the incoming `update.update_id`. If found, immediately acknowledge and return. Insert on first processing.

**When to use:** As the first middleware registered on the bot.

```typescript
// Source: grammY middleware docs + D-13 decision [CITED: CONTEXT.md]
bot.use(async (ctx, next) => {
  const updateId = ctx.update.update_id;
  const { db } = await import('@/db');
  const { processedUpdates } = await import('@/db/schema/processed-updates');

  // INSERT ... ON CONFLICT DO NOTHING; check if inserted
  const result = await db.insert(processedUpdates)
    .values({ updateId, processedAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: processedUpdates.id });

  if (result.length === 0) {
    // Already processed — acknowledge 200 and skip all handlers
    return; // grammY returns 200 to Telegram regardless
  }
  await next();
});
```

### Pattern 3: neon-serverless Pool Transaction for Submission Insert

**What:** The submission insert must be transactional (insert submission + any future side-effects). Use the same `getTxDb()` pattern from `src/actions/people.ts`.

**When to use:** Only for the final confirm step — not for reads or state updates.

```typescript
// Source: src/actions/people.ts (established project pattern) [VERIFIED: codebase]
async function getTxDb() {
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  try {
    const ws = require('ws');
    neonConfig.webSocketConstructor = ws.default ?? ws;
  } catch { /* no-op — browser/edge fallback */ }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  return drizzle(pool);
}

// In confirm step handler:
const txDb = await getTxDb();
await txDb.transaction(async (tx) => {
  await tx.insert(submissions).values({
    tenantId: getDefaultTenantId(),
    personId: person.id,
    projectId: data.projectId!,
    boqItemId: data.boqItemId!,
    photoUrl: data.photoUrl!,
    locationLat: data.locationLat!,
    locationLon: data.locationLon!,
    quantity: String(data.quantity!),
    notes: data.notes ?? null,
    status: 'pending_audit',
    submittedAt: new Date(),
    flowId: stateRow.flowId,  // natural key for dedup unique constraint
  });
  // Clear conversation state inside the same transaction
  await tx.delete(conversationState).where(eq(conversationState.telegramUserId, telegramId));
});
```

### Pattern 4: InlineKeyboard for Paginated BOQ List

**What:** Build a paginated keyboard from a slice of BOQ items. Callback data encodes action type + item ID (or page direction).

**When to use:** BOQ selection step (D-23); project selection step reuses same pattern.

```typescript
// Source: grammY keyboard docs https://grammy.dev/plugins/keyboard [CITED]
import { InlineKeyboard } from 'grammy';
import { remainingBalance } from '@/lib/boq-balance';

const PAGE_SIZE = 6;

function buildBoqKeyboard(items: BoqItem[], page: number): InlineKeyboard {
  const start = page * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);
  const kb = new InlineKeyboard();

  for (const item of pageItems) {
    const remaining = remainingBalance(item.plannedQty, item.approvedQty);
    const label = `${item.material} — ${remaining}/${item.plannedQty} ${item.unit} kaldı`;
    kb.text(label, `boq:select:${item.id}`).row();
  }

  // Navigation row
  const hasPrev = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < items.length;
  if (hasPrev) kb.text('‹ Önceki', `boq:page:${page - 1}`);
  if (hasNext) kb.text('Sonraki ›', `boq:page:${page + 1}`);

  return kb;
}
```

### Pattern 5: Photo Download → Vercel Blob Upload

**What:** Receive `file_id` from `ctx.msg.photo`, call Telegram's `getFile` API, download via HTTP, upload to Vercel Blob with `put()`.

**When to use:** Photo step handler (LOG-04).

```typescript
// Source: grammY files docs https://grammy.dev/guide/files [CITED]
// + Vercel Blob put() docs https://vercel.com/docs/storage/vercel-blob/using-blob-sdk [CITED]

import { put } from '@vercel/blob';

async function uploadPhotoToBlob(
  ctx: Context,
  submissionFlowId: string
): Promise<string> {
  // Get the largest photo from the array (last = highest resolution)
  const photoSizes = ctx.msg!.photo!;
  const photo = photoSizes[photoSizes.length - 1];

  // Get Telegram file path
  const file = await ctx.api.getFile(photo.file_id);
  const telegramFileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

  // Download from Telegram
  const response = await fetch(telegramFileUrl);
  if (!response.ok) throw new Error(`Failed to fetch photo: ${response.status}`);

  // Upload to Vercel Blob
  // Pathname includes submission flow ID to allow retrieval without DB
  const ext = file.file_path?.split('.').pop() ?? 'jpg';
  const { url } = await put(
    `submissions/${submissionFlowId}/photo.${ext}`,
    response.body!,  // ReadableStream
    { access: 'public', addRandomSuffix: false }
  );
  return url;
}
```

### Anti-Patterns to Avoid

- **In-memory conversation state:** All conversation data MUST live in the DB. Never use a module-level Map or `MemorySessionStorage` — serverless functions are stateless. (Pitfall: Serverless Session State)
- **Processing updates synchronously in the critical path:** For long operations (photo upload), consider whether they need to block the 200 response. Telegram has a 55s timeout on webhooks for this project (vercel.json), which is sufficient for a single photo upload, but be aware.
- **Calling `@/db` at module scope:** The existing pattern of lazy importing `@/db` inside handlers must be preserved — `neon()` at module load breaks the build.
- **Using `neon-http` driver for `db.transaction()`:** Will throw. Use the `getTxDb()` Pool pattern for any transactional insert.
- **Skipping `ctx.answerCallbackQuery()`:** Every `callback_query` update MUST be answered (even with empty text) or Telegram shows a loading spinner indefinitely.
- **Storing the Telegram bot token in conversation state or DB rows:** Token is for server-side Telegram API calls only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook secret verification | Custom HMAC check | `webhookCallback(bot, 'std/http', { secretToken })` | Already in place (Phase 1); grammY handles the header comparison |
| Inline keyboard button layout | Raw `reply_markup` JSON | `InlineKeyboard` class from `grammy` | Type-safe, fluent API; handles row structure automatically |
| Telegram file download URL construction | Manual string concat with bot token | `ctx.api.getFile(fileId)` → returned `file_path` | Telegram may change internal URL structure; official API method is stable |
| Photo storage | Custom S3 or filesystem | `@vercel/blob` `put()` | Already installed; native Vercel integration; no infra to manage |
| Numeric parsing with locale | Custom decimal parser | `parseFloat()` + `isNaN` guard | Field workers enter simple numbers; parseFloat handles "25", "25.5", "25,5" (note: comma-as-decimal is NOT handled by parseFloat — see Pitfalls) |
| Conversation TTL | Cron job / background worker | Timestamp check on read (D-22) | Zero infra; lazy eviction on next message is sufficient for a field app |

---

## Runtime State Inventory

> Rename/refactor check: N/A — this is a greenfield addition.

No existing runtime state is being renamed or migrated in this phase. All three new tables (`conversation_state`, `processed_updates`, `submissions`) are created fresh.

**Nothing found in any category** — verified: this phase only adds new tables/code; it does not rename existing strings, IDs, or OS-registered state.

---

## Common Pitfalls

### Pitfall 1: `@grammyjs/conversations` replay footgun (AVOIDED by D-12)

**What goes wrong:** If the conversations plugin were used, any DB call outside `conversation.external()` fires on every replay — creating duplicate `submissions` rows.
**Why it matters for this phase:** D-12 explicitly chose the DB-row FSM to sidestep this entirely. Do NOT introduce `@grammyjs/conversations` even as a "just for testing" dependency.
**How to avoid:** The DB-row FSM never replays; each handler runs exactly once per `update_id`.

### Pitfall 2: `neon-http` driver does NOT support transactions

**What goes wrong:** `db.transaction(async (tx) => { ... })` throws `"ERROR: neon-http does not support transactions"` when `db` is the default `neon-http` client from `src/db/index.ts`.
**Why it happens:** The neon-http driver uses stateless HTTP requests; transactions require a persistent connection (WebSocket).
**How to avoid:** Always use `getTxDb()` (the `neon-serverless` Pool pattern from `src/actions/people.ts`) for any `db.transaction()` call. Reads and state updates can use the default `neon-http` `db` client.
**Warning signs:** Runtime error `cannot use database transaction on a HTTP connection`.

### Pitfall 3: `ctx.answerCallbackQuery()` must be called for every `callback_query`

**What goes wrong:** If a `callback_query` update (button tap) is processed but `ctx.answerCallbackQuery()` is never called, Telegram keeps showing a loading spinner on the button and may retry the callback.
**Why it happens:** Telegram expects an explicit ack for every callback query within 10 seconds.
**How to avoid:** Call `await ctx.answerCallbackQuery()` (or with `{ text: '...' }` for a toast) as early as possible in every callback handler — before the DB operations.
**Warning signs:** Workers see a persistent loading indicator on buttons; duplicate callback deliveries in Neon logs.

### Pitfall 4: Turkish decimal separators — parseFloat does NOT accept comma

**What goes wrong:** Turkish locale uses comma as decimal separator (`25,5` not `25.5`). `parseFloat('25,5')` returns `25` (truncates at the comma), silently accepting the input as an integer.
**Why it happens:** `parseFloat` follows the C locale; it stops at the first non-numeric character.
**How to avoid:** Normalize input before parsing: `value.replace(',', '.')` before calling `parseFloat`. Add a test: `parseFloat('25,5'.replace(',', '.')) === 25.5`.
**Warning signs:** Quantity stored as `25` when worker typed `25,5`; no error shown; quantity is wrong.

### Pitfall 5: Photo array — use the LAST element for highest resolution

**What goes wrong:** `ctx.msg.photo` is an array of `PhotoSize` objects at different resolutions. Taking `photo[0]` gives the smallest (thumbnail, ~90px). File is stored permanently at low quality.
**Why it happens:** Telegram always sends thumbnails first, highest-resolution last.
**How to avoid:** Always use `ctx.msg.photo[ctx.msg.photo.length - 1]` for the largest available photo.
**Warning signs:** Stored photos are small blurry thumbnails.

### Pitfall 6: Typed coordinates vs native location share

**What goes wrong:** Workers may type coordinates as text (e.g., `41.0082, 28.9784`). This is a text message, not a native location message. Phase 2 must reject it (D-20). If not rejected, the bot will fail to find `ctx.message.location` and crash or silently skip.
**Why it happens:** Workers are trained on Telegram location sharing but may know coordinates from a previous app.
**How to avoid:** Only `ctx.on('message:location')` proceeds in the location step. Any text, photo, or other message type gets the reprompt with the "📎 → Konum" how-to hint.
**Warning signs:** Location step silently advances without `ctx.message.location.latitude/longitude` set.

### Pitfall 7: Unique constraint on `submissions` must be a DB-level constraint, not app-level

**What goes wrong:** Checking "does a submission already exist for this flow_id?" in application code before insert creates a TOCTOU race — two concurrent invocations of the same `update_id` can both pass the check before either inserts.
**Why it happens:** Telegram can deliver the same `update_id` to two concurrent function instances.
**How to avoid:** The `submissions` table MUST have a `UNIQUE (flow_id)` constraint (or equivalent natural key). `ON CONFLICT DO NOTHING` on insert, combined with the `processed_updates` dedup table (D-13, Guard 1), gives belt-and-suspenders protection.
**Warning signs:** Duplicate `submissions` rows with the same `flow_id` in the DB.

### Pitfall 8: `bot.botInfo` must be set in tests that call `bot.handleUpdate()`

**What goes wrong:** Tests that call `bot.handleUpdate()` directly (as in `tests/telegram-webhook.test.ts`) must set `bot.botInfo` after mocking `bot.init()`. grammY validates `this.me` before creating handler context.
**Why it matters for Phase 2:** The FSM tests will call `bot.handleUpdate()` to simulate step transitions; the Phase 1 test pattern (setting `bot.botInfo` explicitly) must be followed.
**How to avoid:** Copy the `bot.botInfo = { id: ..., is_bot: true, ... }` setter from the existing test fixture.

---

## Code Examples

Verified patterns from official sources and existing codebase:

### Registering grammY message filter handlers
```typescript
// Source: https://grammy.dev/guide/filter-queries [CITED]
bot.on('message:photo', async (ctx) => {
  const photos = ctx.msg.photo; // PhotoSize[] — always present when filter matches
  const largest = photos[photos.length - 1]; // highest resolution
  const fileId = largest.file_id;
  // ...
});

bot.on('message:location', async (ctx) => {
  const { latitude, longitude } = ctx.msg.location;
  // ...
});

bot.on('callback_query:data', async (ctx) => {
  await ctx.answerCallbackQuery(); // MUST call this
  const data = ctx.callbackQuery.data; // e.g. "boq:select:uuid-here"
  // ...
});
```

### InlineKeyboard construction and sending
```typescript
// Source: https://grammy.dev/plugins/keyboard [CITED]
import { InlineKeyboard } from 'grammy';

const keyboard = new InlineKeyboard()
  .text('Proje A', 'project:select:uuid-1').row()
  .text('Proje B', 'project:select:uuid-2').row();

await ctx.reply('Projenizi seçiniz:', { reply_markup: keyboard });

// Functional construction from array (for dynamic lists):
const keyboard2 = InlineKeyboard.from(
  items.map(item => [InlineKeyboard.text(item.label, `item:${item.id}`)])
);
```

### Vercel Blob put() — upload from ReadableStream
```typescript
// Source: https://vercel.com/docs/storage/vercel-blob/using-blob-sdk [CITED]
import { put } from '@vercel/blob';

const { url } = await put(
  'submissions/flow-123/photo.jpg',   // pathname in the blob store
  readableStream,                      // Response.body from fetch()
  {
    access: 'public',
    addRandomSuffix: false,
    // BLOB_READ_WRITE_TOKEN read from env automatically
  }
);
// url: 'https://<store>.public.blob.vercel-storage.com/submissions/flow-123/photo.jpg'
```

### neon-serverless Pool transaction (established pattern)
```typescript
// Source: src/actions/people.ts (Phase 1 codebase pattern) [VERIFIED: codebase]
async function getTxDb() {
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  try {
    const ws = require('ws');
    neonConfig.webSocketConstructor = ws.default ?? ws;
  } catch { /* no-op */ }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  return drizzle(pool);
}
```

### Zod v4 numeric validation (note v4 API)
```typescript
// Source: existing codebase patterns — zod 4.4.3 [VERIFIED: codebase]
// Note: z.string().regex() in v4 — no 'message' shorthand in z.number()
const quantitySchema = z.string()
  .transform(val => parseFloat(val.replace(',', '.')))  // Turkish decimal
  .refine(n => !isNaN(n) && n > 0, { message: 'Geçerli bir sayı girin' });
```

### after() for non-blocking post-confirm work
```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/after [CITED]
// after() is available in Route Handlers (Next.js 15.1+, stable)
// The webhook route returns 200 immediately; async work runs after
import { after } from 'next/server';

// In a future phase, Phase 3 auditor notification could use this pattern:
after(async () => {
  await notifyAuditors(submissionId);
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| grammY conversations plugin for multi-step flows | DB-row FSM (D-12) | Phase 2 decision | Eliminates replay footgun; simpler debuggability; no new plugin dependency |
| `@grammyjs/storage-psql` for session storage | Plain Drizzle schema for `conversation_state` | Phase 2 decision | No abstraction layer; full schema control; works with existing Drizzle patterns |
| `next/server` `unstable_after()` | `after()` (stable since Next.js 15.1) [CITED: nextjs.org] | Next.js 15.1.0 | Safe to use without `unstable_` prefix in Next.js 15.5.18 (installed version) |

**Deprecated/outdated:**
- `@grammyjs/conversations` for this project: explicitly ruled out by D-12. Do not install.
- `MemorySessionStorage` for any production use: never appropriate on Vercel serverless.

---

## Schema Design (New Tables)

These three tables must be added as Drizzle schema files in `src/db/schema/` and exported from `src/db/schema/index.ts`.

### `conversation_state` (D-12, D-22)

```typescript
// src/db/schema/conversation-state.ts  [ASSUMED — column names are Claude's Discretion]
import { pgTable, uuid, bigint, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { people } from './people';

export const conversationState = pgTable('conversation_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  // keyed by telegram_user_id for direct lookup without people join
  telegramUserId: bigint('telegram_user_id', { mode: 'bigint' }).notNull().unique(),
  personId: uuid('person_id').notNull().references(() => people.id),
  // flow_id: a random UUID generated at the start of a new flow,
  // used as the natural key on the submissions table for dedup (D-13 Guard 2)
  flowId: uuid('flow_id').notNull().defaultRandom(),
  currentStep: text('current_step').notNull(),  // STEPS constant value
  data: jsonb('data').notNull().default('{}'),  // ConversationData partial payload
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

TTL check on read: `Date.now() - row.updatedAt.getTime() > TTL_MS` (planner picks TTL_MS value, suggested 24h = 86_400_000ms).

### `processed_updates` (D-13 Guard 1)

```typescript
// src/db/schema/processed-updates.ts  [ASSUMED — column names are Claude's Discretion]
import { pgTable, bigint, timestamp } from 'drizzle-orm/pg-core';

export const processedUpdates = pgTable('processed_updates', {
  // update_id from Telegram is a 32-bit int, well within bigint
  updateId: bigint('update_id', { mode: 'bigint' }).primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
});
// PRIMARY KEY on update_id is the unique constraint; INSERT...ON CONFLICT DO NOTHING
```

Note: `processedUpdates` rows accumulate indefinitely. A periodic cleanup job is out of scope for Phase 2; the table will stay small for the single-tenant v1. Flag as a Phase 3+ ops concern.

### `submissions` (LOG-08, D-13 Guard 2)

```typescript
// src/db/schema/submissions.ts  [ASSUMED — column names are Claude's Discretion]
import { pgTable, uuid, bigint, text, numeric, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { geometry } from 'drizzle-orm/pg-core';
import { people } from './people';
import { projects } from './projects';
import { boqItems } from './boq-items';
import { tenants } from './tenants';

export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  // flow_id ties back to conversation_state.flow_id — the dedup key (D-13 Guard 2)
  flowId: uuid('flow_id').notNull(),
  personId: uuid('person_id').notNull().references(() => people.id),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  boqItemId: uuid('boq_item_id').notNull().references(() => boqItems.id),
  photoUrl: text('photo_url').notNull(),       // Vercel Blob URL
  photoFileId: text('photo_file_id'),          // Telegram file_id for reference
  // location stored as geometry(Point,4326) for Phase 4 spatial matching compatibility
  // D-10 from Phase 1: geography/geometry convention
  location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }),
  // Also store lat/lon as plain numerics for easy Phase 3 auditor Google Maps link
  locationLat: numeric('location_lat', { precision: 10, scale: 7 }),
  locationLon: numeric('location_lon', { precision: 10, scale: 7 }),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  notes: text('notes'),
  status: text('status', { enum: ['pending_audit', 'approved', 'rejected'] })
    .notNull()
    .default('pending_audit'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique('submissions_flow_id_unique').on(t.flowId),  // D-13 Guard 2
  index('submissions_project_idx').on(t.projectId),
  index('submissions_person_idx').on(t.personId),
  index('submissions_status_idx').on(t.status),
  index('submissions_location_gist').using('gist', t.location),  // Phase 4 ready
]);
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.7 |
| Config file | `vitest.config.ts` (fileParallelism: false — required for shared Neon test DB) |
| Quick run command | `npx vitest run tests/telegram-bot.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOG-01 | `/start` greets registered worker by name in Turkish with project keyboard | unit (mock DB) | `npx vitest run tests/telegram-bot.test.ts` | ❌ Wave 0 |
| LOG-01 | Unregistered Telegram ID gets "pending approval" reply | unit (mock DB) | `npx vitest run tests/telegram-bot.test.ts` | ❌ Wave 0 |
| LOG-04 | Photo step rejects text message; does not advance step | unit (mock DB) | `npx vitest run tests/telegram-bot.test.ts` | ❌ Wave 0 |
| LOG-05 | Location step rejects text message; does not advance | unit (mock DB) | `npx vitest run tests/telegram-bot.test.ts` | ❌ Wave 0 |
| LOG-06 | Quantity step rejects non-numeric; accepts `25.5` and Turkish `25,5` | unit (mock) | `npx vitest run tests/telegram-bot.test.ts` | ❌ Wave 0 |
| LOG-08 | Confirm creates exactly one `submissions` row with `status: pending_audit` | describeIfDb (live DB) | `npx vitest run tests/telegram-bot.test.ts` | ❌ Wave 0 |
| LOG-10 (SC4) | Same `update_id` delivered twice → exactly one `submissions` row | describeIfDb (live DB) | `npx vitest run tests/telegram-bot.test.ts` | ❌ Wave 0 |
| LOG-10 (SC5) | Cold-start resume: FSM reads state row and reprompts current step | unit (mock DB + state) | `npx vitest run tests/telegram-bot.test.ts` | ❌ Wave 0 |
| LOG-10 D-13 | `processed_updates` INSERT ON CONFLICT DO NOTHING — dedup guard | unit (mock DB) | `npx vitest run tests/telegram-bot.test.ts` | ❌ Wave 0 |
| Turkish decimal | `parseFloat('25,5'.replace(',', '.'))` round-trips correctly | unit (pure) | `npx vitest run tests/telegram-bot.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/telegram-bot.test.ts`
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/telegram-bot.test.ts` — new test file covering all LOG-* requirements above
- [ ] `tests/fixtures/db.ts` — extend `truncateAllTables` to include the three new tables: `conversation_state`, `processed_updates`, `submissions`
- [ ] Migration: new Drizzle schema files generate a new migration SQL — planner must include a schema push task

*(Existing test infrastructure — Vitest config, setup.ts, fixtures/db.ts, describeIfDb — covers the framework; only the new test file and table additions to truncateAllTables are new gaps.)*

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | grammY webhook (runtime: nodejs) | ✓ | v24.x (darwin) | — |
| `grammy` | Bot framework | ✓ | 1.43.0 | — |
| `@neondatabase/serverless` | Neon DB driver (http + Pool) | ✓ | 1.1.0 | — |
| `ws` | neon-serverless WebSocket in Node.js | ✓ | 8.21.0 (transitive) | Native WebSocket (not needed in Node.js) |
| `@vercel/blob` | Photo storage | ✓ | 2.4.0 | — |
| `BLOB_READ_WRITE_TOKEN` | @vercel/blob `put()` | ✓ (set in .env.local) | — | — |
| `TELEGRAM_BOT_TOKEN` | Telegram API calls | ✓ (set in .env.local) | — | — |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook security | ✓ (set in .env.local) | — | — |
| `DATABASE_URL` | Neon primary DB | ✓ (set in .env.local) | — | — |
| `TEST_DATABASE_URL` | describeIfDb integration tests | Unknown (must be set for SC4 test) | — | Tests skip cleanly with describeIfDb |

**Missing dependencies with no fallback:** None — all are already installed and configured from Phase 1.

**Missing dependencies with fallback:** `TEST_DATABASE_URL` — if not set, the duplicate-update integration test (SC4, mandatory per STATE.md/D-13) is skipped. The planner must include a gate: SC4 test must pass with a live DB before the phase is considered complete.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (Telegram identity) | Telegram User ID from `ctx.from.id` (authenticated by Telegram at the platform level); no additional auth needed for the bot channel |
| V3 Session Management | Yes | DB-row `conversation_state` keyed by `telegram_user_id`; TTL eviction (D-22); `flowId` UUID random per flow |
| V4 Access Control | Yes | Worker can only see projects assigned to them via `assignments` table; callback query data (BOQ item IDs, project IDs) validated against DB — a tampered callback_data cannot select an unassigned project |
| V5 Input Validation | Yes | All user inputs validated per step before advancing FSM: photo (type check), location (native check), quantity (numeric + positive), notes (text, length cap recommended) |
| V6 Cryptography | Partial | Photo URLs in Vercel Blob are public (access: 'public'); not sensitive in isolation; `flowId` is a UUID (random, unguessable); no crypto hand-rolling |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Replayed Telegram webhook (same update_id) | Spoofing / Tampering | `processed_updates` dedup table + UNIQUE constraint on `submissions.flow_id` (D-13) |
| Worker tampers callback_data to select unassigned project/BOQ | Tampering | Validate callback_data values against `assignments` + `boqItems` DB on receipt, not just parse the ID |
| Unauthenticated POST to webhook | Spoofing | grammY `secretToken` in `webhookCallback` (T-04-01, Phase 1 — do not regress) |
| Unregistered Telegram user accesses bot | Unauthorized access | `people` table lookup on every message; unregistered users get "pending approval" reply and cannot advance the FSM |
| Long-running photo upload blocks Telegram timeout | DoS / Availability | Vercel function maxDuration: 55s (vercel.json); a single photo upload is ~1–3s; within budget. Note: Phase 6 AI vision must NOT be in the sync path. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Column names in new schema tables (e.g., `flowId`, `currentStep`, `data`, `updatedAt`) | Schema Design section | Planner must choose exact names; names above are suggestions, not locked |
| A2 | TTL of 24h for `conversation_state` staleness check | Schema Design + D-22 | Planner decides exact value; too short frustrates workers; too long accumulates stale rows |
| A3 | Photo upload uses `access: 'public'` in Vercel Blob | Code Examples (Pattern 5) | If access should be private, URL construction changes; for Phase 2 public is sufficient and simplest |
| A4 | `submissions.location` uses `geometry(Point,4326)` as in Phase 1 spatial conventions | Schema Design | Compatible with Phase 4 PostGIS; if Phase 4 requires `geography`, a cast at query time is sufficient (no migration needed — `geometry` column + `::geography` cast is the Phase 1 established pattern) |
| A5 | `ws` package will resolve correctly from `neon-serverless` transitive dep without direct install | Standard Stack | If neon-serverless removes ws as a peer dep in a future version, a direct `npm install ws` would be needed. Not a concern for v1 since it's already in node_modules. |
| A6 | `slopcheck` was unavailable at research time | Package Legitimacy Audit | All Phase 2 packages were already verified in Phase 1 research; no new direct installs in this phase |

---

## Open Questions

1. **Upload-on-receipt vs upload-on-confirm (Claude's Discretion)**
   - What we know: Both are viable. Upload-on-receipt stores the photo at the photo step; upload-on-confirm only uploads if the worker doesn't cancel. Upload-on-receipt is simpler (photo URL goes directly into conversation state); upload-on-confirm avoids orphaned Blob objects for cancelled flows.
   - What's unclear: Expected cancellation rate in the field — if low, upload-on-receipt is simpler. If non-trivial, upload-on-confirm + blob cleanup matters.
   - Recommendation: Upload-on-receipt for v1 simplicity. The planner should note orphaned blobs as a known ops debt. A cleanup script (list Vercel Blob by prefix, delete those with no matching submission) is trivial to add later.

2. **`processedUpdates` table housekeeping (future concern)**
   - What we know: The table accumulates indefinitely at one row per Telegram update. At typical field-worker message rates (say 50 messages/day across all workers), the table grows slowly.
   - What's unclear: At what size does this become a performance concern?
   - Recommendation: No action in Phase 2. Add a note in the plan to revisit after Phase 3 (when audit callbacks further increase update volume).

3. **Confirm step — summary message format (Claude's Discretion)**
   - What we know: D-16 requires per-field edit buttons. Telegram message text has a 4096-char limit; a photo + caption structure (using `ctx.replyWithPhoto`) shows the submitted photo alongside the confirmation message.
   - Recommendation: Send the stored Blob URL as a photo message with a caption containing the summary text and an inline keyboard with edit buttons + confirm button. This gives workers visual confirmation of their photo.

---

## Sources

### Primary (HIGH confidence)

- grammY official docs (grammy.dev) — filter queries, inline keyboards, file handling, context API [CITED: multiple pages]
- Telegram Bot API reference (core.telegram.org/bots/api) — Photo, Location, PhotoSize, getFile fields [CITED]
- Vercel Blob SDK docs (vercel.com/docs/storage/vercel-blob/using-blob-sdk) — `put()` signature, access options, return shape [CITED]
- Next.js `after()` docs (nextjs.org/docs/app/api-reference/functions/after) — stable in 15.1, usage in Route Handlers [CITED]
- `src/actions/people.ts` — neon-serverless Pool transaction pattern [VERIFIED: codebase]
- `src/lib/telegram.ts` — existing grammY bot structure and lazy-import pattern [VERIFIED: codebase]
- `src/db/schema/*.ts` — Phase 1 schema conventions (UUID PKs, tenant_id nullable, geometry types) [VERIFIED: codebase]
- `tests/telegram-webhook.test.ts` — grammY test patterns (bot.botInfo setter, api.config.use transformer, vi.doMock) [VERIFIED: codebase]
- `vitest.config.ts` — fileParallelism: false, test setup, path aliases [VERIFIED: codebase]

### Secondary (MEDIUM confidence)

- grammY `@grammyjs/conversations` docs — understood and explicitly ruled out by D-12 [CITED: grammy.dev/plugins/conversations]
- Phase 1 PITFALLS.md — replay semantics, serverless session loss, webhook retry loops [VERIFIED: .planning/research/PITFALLS.md]
- npm registry — all package versions confirmed (`grammy@1.43.0`, `@neondatabase/serverless@1.1.0`, `@vercel/blob@2.4.0`, `zod@4.4.3`, `ws@8.21.0`) [VERIFIED: npm registry]

### Tertiary (LOW confidence)

- None — all claims for Phase 2 technical patterns are verified from codebase patterns or official docs.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all packages already installed and used in Phase 1; versions confirmed
- Architecture: HIGH — DB-row FSM pattern is straightforward; all integration points are Phase 1-established
- Schema: MEDIUM — exact column names are Claude's Discretion; structure is verified-compatible with Phase 1 conventions
- Pitfalls: HIGH — all pitfalls are either verified from codebase history (01-SUMMARY.md decisions) or from official docs
- Test patterns: HIGH — grammY test patterns are already proven in `tests/telegram-webhook.test.ts`

**Research date:** 2026-05-24
**Valid until:** 2026-06-24 (30 days; grammY 1.x API is stable; Vercel Blob/Next.js APIs are stable)
