---
phase: 02-worker-bot
reviewed: 2026-05-24T12:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/lib/telegram.ts
  - src/lib/bot-fsm.ts
  - src/lib/bot-keyboards.ts
  - src/lib/bot-messages.ts
  - src/lib/bot-photo.ts
  - src/db/schema/conversation-state.ts
  - src/db/schema/processed-updates.ts
  - src/db/schema/submissions.ts
  - src/db/schema/index.ts
  - tests/telegram-bot.test.ts
  - tests/fixtures/db.ts
findings:
  critical: 5
  warning: 5
  info: 3
  total: 13
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-05-24T12:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

The FSM skeleton is structurally sound: idempotency fence is wired correctly, the transactional confirm is on the right driver (neon-serverless Pool), and the V4 tamper-defence on callback IDs is present and enforced. However five correctness defects were found, three of which block shipping:

1. `repromptStep` sends bare text for every keyboard-driven step (PROJECT, BOQ, CONFIRM), leaving workers stranded with no actionable buttons after a `flow:resume`.
2. `parseFloat('Infinity')` passes quantity validation, propagating into the transaction as `String(Infinity)` = `'Infinity'`, which Postgres numeric rejects — with no try/catch around the transaction the worker sees a silent hang.
3. The SC4 DB integration test calls `getTxDb()` which reads `process.env.DATABASE_URL`, not `TEST_DATABASE_URL`; when those differ, the submission rows land in the production database.

The remaining issues are warnings about code structure and latent edge-case bugs.

---

## Critical Issues

### CR-01: `repromptStep` sends bare text for keyboard-driven steps — worker cannot act

**File:** `src/lib/telegram.ts:393-404`

**Issue:** `repromptStep` is the single function handling `flow:resume` resume and D-14 cold-start reprompts. For `STEPS.PROJECT`, `STEPS.BOQ`, and `STEPS.CONFIRM` it sends a plain text message without an inline keyboard. A worker who taps "Devam et" while at the PROJECT, BOQ, or CONFIRM step receives only a text string — no buttons, no keyboard — and is stuck. They cannot select a project, cannot select a BOQ item, and cannot submit or edit a confirmed record. The only escape is `/iptal`, which destroys the partially-filled flow.

```
// current: sends 'Devam ediyoruz — Projenizi seçin:' (no keyboard)
const stepPrompt = stepPrompts[step] ?? MESSAGES.noActiveFlow;
await ctx.reply(MESSAGES.resumePrefix + stepPrompt);
```

**Fix:** `repromptStep` must be made keyboard-aware. The cleanest approach is to delegate to the real step handlers directly:

```typescript
// Option A: call the real handler (passes no callback data, falls through to reprompt-with-keyboard)
async function repromptStep(ctx: any, step: string, data: Record<string, unknown>): Promise<void> {
  const { STEPS } = await import('@/lib/bot-fsm');
  const { db } = await import('@/db');

  if (step === STEPS.PROJECT) {
    // resolveWorker and send keyboard
    const workerIdentity = await resolveWorker(db, BigInt(ctx.from.id));
    const { buildProjectKeyboard } = await import('@/lib/bot-keyboards');
    const { MESSAGES } = await import('@/lib/bot-messages');
    await ctx.reply(MESSAGES.resumePrefix + MESSAGES.chooseProject, {
      reply_markup: buildProjectKeyboard(workerIdentity?.projects ?? [], (data.page as number) ?? 0),
    });
    return;
  }
  if (step === STEPS.CONFIRM) {
    await handleStepConfirm(ctx, data, db);
    return;
  }
  // BOQ: similar keyboard reconstruction...
}
```

---

### CR-02: `parseFloat('Infinity')` passes quantity validation — silent DB error on submit

**File:** `src/lib/telegram.ts:974-977`

**Issue:** The quantity validation at line 977 is `isNaN(parsed) || parsed <= 0`. `parseFloat('Infinity')` returns `Infinity`, which is neither `NaN` nor `<= 0`, so the string `"Infinity"` passes as a valid quantity. At line 1208, `String(Infinity)` is `"Infinity"`. The `quantity` column in `submissions` is `numeric(12, 3)`, which rejects `'Infinity'` with a Postgres error. Because `txDb.transaction()` has no `try/catch` (see CR-03 below), the exception propagates silently: the worker sees no reply, their conversation state is not deleted (the transaction rolled back), and they are stuck at CONFIRM permanently since every subsequent `confirm:submit` tap will throw again.

**Fix:**
```typescript
// Replace:
if (isNaN(parsed) || parsed <= 0) {

// With:
if (!isFinite(parsed) || parsed <= 0) {
```

`!isFinite(n)` rejects `NaN`, `Infinity`, and `-Infinity` in a single check. This is the correct guard for the numeric insert.

---

### CR-03: No `try/catch` around `txDb.transaction()` in `handleConfirmSubmit` — silent failure

**File:** `src/lib/telegram.ts:1192-1219`

**Issue:** `getTxDb()` and the subsequent `txDb.transaction()` block are called without any error handling. If the transaction fails for any reason (network blip, DB constraint, the `Infinity` value described in CR-02, a stale `DATABASE_URL`, etc.) the exception propagates to grammY's `callback_query:data` handler, which also has no `try/catch`. grammY absorbs unhandled handler errors without replying to the user. The Telegram spinner stops, the worker sees nothing, and their `conversation_state` row is intact (the transaction rolled back), so they are stuck at CONFIRM with no path to recovery other than `/iptal`.

**Fix:**
```typescript
try {
  await txDb.transaction(async (tx) => {
    await tx.insert(submissions).values({ ... }).onConflictDoNothing();
    await tx.delete(conversationState).where(eq(conversationState.telegramUserId, BigInt(telegramUserId)));
  });
} catch (_err) {
  await ctx.reply(MESSAGES.genericError);
  return;
}
// reply "Gönderildi ✅" only after successful commit
```

---

### CR-04: SC4 DB integration test submits to `DATABASE_URL`, not `TEST_DATABASE_URL`

**File:** `tests/telegram-bot.test.ts:2198-2459`

**Issue:** The `describeIfDb('submission persistence & idempotency (SC4)')` block sets up `testDb` from `TEST_DATABASE_URL` via `getTestDb()`, truncates its tables, and seeds fixture data correctly. However, when `bot.handleUpdate(makeConfirmSubmitUpdate(...))` runs, `handleConfirmSubmit` internally calls `getTxDb()` (line 1065-1081 in `telegram.ts`), which creates a new `Pool` from `process.env.DATABASE_URL`, not `TEST_DATABASE_URL`. If `DATABASE_URL` is unset, `getTxDb()` throws a `TypeError` and the test passes only because the transaction error is swallowed (before CR-03 is fixed). If `DATABASE_URL` is set to a different database (e.g. production), the `INSERT INTO submissions` lands in the production database. The test assertions query `testDb` (bound to `TEST_DATABASE_URL`) and find zero rows — making the test pass incorrectly (a false green) or fail for the wrong reason.

**Fix:** In the `describeIfDb` `beforeEach`, override `getTxDb` via `vi.doMock` to use the test database, or set `DATABASE_URL = process.env.TEST_DATABASE_URL` for the duration of the describe block:

```typescript
beforeEach(async () => {
  vi.resetModules();
  // Ensure getTxDb() also hits the test database
  const origUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  // ... rest of beforeEach setup ...
});

afterEach(async () => {
  process.env.DATABASE_URL = origUrl; // restore
  // ...
});
```

---

### CR-05: `saveState` INSERT has no `ON CONFLICT` clause — race window causes unhandled unique violation

**File:** `src/lib/telegram.ts:174-196`

**Issue:** `saveState` uses an update-then-insert pattern: it first runs `UPDATE ... RETURNING`, and if the result is empty it runs `INSERT`. There is no `ON CONFLICT` on the INSERT. If two concurrent requests for the same worker arrive simultaneously (e.g. Telegram delivers the same update twice with a sub-millisecond gap before the idempotency fence commits), both could find zero rows on UPDATE and both could attempt INSERT. The second INSERT would hit the `UNIQUE` constraint on `telegram_user_id` and throw an unhandled `PostgresError`. This propagates through the handler chain with no try/catch, causing grammY to silently swallow it. The worker sees nothing and their flow stalls.

**Fix:** Add `ON CONFLICT DO NOTHING` to the INSERT, and fall back to a plain Drizzle upsert (`onConflictDoUpdate`) which is the atomic equivalent:

```typescript
// Replace the update-then-insert with a single atomic upsert:
await db
  .insert(conversationState)
  .values({
    telegramUserId,
    personId,
    tenantId: getDefaultTenantId(),
    flowId: resolvedFlowId,
    currentStep: step,
    data,
    updatedAt: now,
  })
  .onConflictDoUpdate({
    target: conversationState.telegramUserId,
    set: { currentStep: step, data, updatedAt: now },
  });
```

---

## Warnings

### WR-01: `data.personId` is never stored in JSONB — mid-flow fallback reads `undefined`

**File:** `src/lib/telegram.ts:767, 810, 873, 884, 929, 940, 989, 1000, 1050`

**Issue:** `ConversationData` (bot-fsm.ts) does not define a `personId` field, and no `saveState` call stores `personId` inside the `data` JSONB object. However, eight call sites pass `data.personId as string` as the `personId` argument to `saveState`. This value is always `undefined`, which TypeScript casts to the string `"undefined"`. In the current flow, these calls always reach the `UPDATE` branch (a row exists), so the INSERT with the bogus `personId` never fires. But if the `conversation_state` row is absent for any reason (manual cleanup, DB reset, migration), the INSERT would fire with `personId = "undefined"`, which violates the `person_id NOT NULL REFERENCES people(id)` FK constraint and throws an unhandled DB error.

**Fix:** Either store `personId` in the JSONB data at `/start` time, or read it from `state.personId` (the DB column) rather than `data.personId`. The `state.personId` pattern is already used correctly at line 469.

```typescript
// At /start and flow:restart, store personId in data:
await saveState(db, BigInt(telegramUserId), STEPS.PROJECT, 
  { step: STEPS.PROJECT, page: 0, personId: workerIdentity.person.id },
  workerIdentity.person.id
);

// Then all downstream handlers can safely use data.personId as string
```

---

### WR-02: `String.replace(',', '.')` only replaces the first comma — `1,234` silently becomes `1.234` (= 1)

**File:** `src/lib/telegram.ts:974`

**Issue:** The Turkish decimal normalization replaces only the first comma occurrence (JS `String.prototype.replace(string, string)` is not global). A worker entering `1,234` (intending the number one thousand two hundred and thirty-four using the Turkish thousands separator) gets `parseFloat('1.234')` = `1.234`, which passes the `> 0` check and is stored as `1.234` rather than `1234`. Likewise `1,234,567` becomes `1.234,567`, whose `parseFloat` is `1.234`. These are silent data-integrity errors that bypass both the validation and the user.

**Fix:**
```typescript
// Current:
const normalized = rawText.replace(',', '.');

// Fixed (global replace + strip all but the last period):
// Simple: Turkish decimal uses comma as decimal separator — not as thousands sep at the same time.
// Most field workers will type "25,5" not "1.000,5".
// Use replaceAll to handle e.g. "25,500" (which is ambiguous), then add isFinite check.
const normalized = rawText.trim().replace(/,/g, '.');
// If there are multiple dots after replacing all commas, the number is ambiguous — reject it
const dotCount = (normalized.match(/\./g) ?? []).length;
if (dotCount > 1) {
  await ctx.reply(MESSAGES.rejectNotNumeric);
  return;
}
const parsed = parseFloat(normalized);
```

---

### WR-03: Confirm summary always shows raw UUID for project name and BOQ material

**File:** `src/lib/telegram.ts:1105-1116`

**Issue:** `handleStepConfirm` builds the confirmation caption using `data.projectName` and `data.boqMaterial` (lines 1105-1106). These fields are never stored in the JSONB `data` object anywhere in the flow. `handleStepProject` stores only `projectId` (line 661), and `handleStepBoq` stores only `boqItemId` and `unit` (lines 800-803, 757-761). The fallback at line 1105 is `(data.projectId as string) ?? '—'`, so the worker sees a raw UUID like `"3f4a8b12-..."` instead of the project name. This is not a data-loss bug but makes the confirm screen unreadable for field workers.

**Fix:** Store the human-readable names when saving the project and BOQ steps:

```typescript
// In handleStepProject 'select' path:
const newData = { ...data, projectId: value, projectName: selectedProject.name };

// In handleStepBoq 'select' and 'confirm0' paths:
const newData = { ...data, boqItemId: value, unit: selectedItem.unit, boqMaterial: selectedItem.material };
```

---

### WR-04: `bot-photo.ts` applies no file-extension whitelist — arbitrary extensions stored in Blob path

**File:** `src/lib/bot-photo.ts:68`

**Issue:** The Blob path is `submissions/{flowId}/photo.{ext}` where `ext` is derived by `file.file_path?.split('.').pop()`. The `file_path` comes from Telegram's `getFile()` API, which is trusted (T-02-06). However the extension is used verbatim with no validation. If `file_path` is `documents/file.html` (Telegram theoretically supports document uploads), the Blob key would be `photo.html`. More practically, if `file_path` has no extension (`documents/file`), `split('.').pop()` returns `'documents/file'` — the entire path rather than an extension — producing an invalid and potentially very long Blob key.

**Fix:**
```typescript
// After: const ext = file.file_path?.split('.').pop() ?? 'jpg';
const rawExt = file.file_path?.split('.').pop() ?? 'jpg';
const ALLOWED_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const ext = ALLOWED_EXTS.has(rawExt.toLowerCase()) ? rawExt.toLowerCase() : 'jpg';
```

---

### WR-05: `fieldStepMap` in `dispatchCallbackQuery` includes `boq: STEPS.BOQ` — dead code that silently does wrong thing if ever activated

**File:** `src/lib/telegram.ts:458-464`

**Issue:** The `fieldStepMap` at lines 458-464 includes `boq: STEPS.BOQ`. This entry is never reachable because the confirm keyboard (lines 1124-1130) does not emit an `edit:boq` button. However, if an `edit:boq` button is ever added, `dispatchCallbackQuery` would route it to `handleStepBoq` with `editReturnStep=CONFIRM` in `data`. `handleStepBoq` has no check for `editReturnStep` — a BOQ re-selection would advance the worker to the PHOTO step (not back to CONFIRM), breaking the D-16 edit contract for BOQ. The dead-code entry misleads future developers.

**Fix:** Either remove the `boq` entry from `fieldStepMap`, or add `editReturnStep` handling to `handleStepBoq` and add the `edit:boq` button to the confirm keyboard if that edit path is intended by D-16.

---

## Info

### IN-01: Dual `import('drizzle-orm')` in `saveState` — minor redundancy

**File:** `src/lib/telegram.ts:169-170`

**Issue:** `saveState` imports `eq` and `sql` from `drizzle-orm` in two separate `await import` calls on consecutive lines. These could be combined into one destructuring import, reducing two dynamic imports to one.

**Fix:**
```typescript
const { eq, sql } = await import('drizzle-orm');
```

---

### IN-02: `response.body!` non-null assertion in `bot-photo.ts` — relies on fetch spec guarantee

**File:** `src/lib/bot-photo.ts:75`

**Issue:** `response.body!` uses a non-null assertion. In the Fetch API spec, `response.body` is `null` only when the response has already been consumed or the body is empty. After a successful `fetch()` call with a Telegram file URL, the body should be a readable stream. The `!` assertion is technically justified by the preceding `response.ok` check but is not self-documenting. In environments that polyfill fetch (older Node versions, test doubles), `body` may be `null` and the assertion would produce an unhelpful `TypeError: Cannot read properties of null`.

**Fix:** Add an explicit guard:
```typescript
if (!response.body) {
  throw new Error('Telegram file response has no body stream');
}
const { url } = await put(`submissions/${submissionFlowId}/photo.${ext}`, response.body, ...);
```

---

### IN-03: `resolveWorker` is called 2-3 times per PROJECT step action — redundant DB queries

**File:** `src/lib/telegram.ts:621-680`

**Issue:** In `handleStepProject`, the `page` action calls `resolveWorker` once (line 623), the `select` action calls it again (line 636), and the unknown-action fallback calls it a third time (line 677). Each call issues two DB queries (people lookup + assignments join). This is 4-6 queries for a single callback, where one would suffice. This is not a correctness bug but produces unnecessary load.

**Note:** Out of v1 scope per review instructions (performance), but noting as INFO since it also affects test mock complexity.

---

_Reviewed: 2026-05-24T12:00:00Z_
_Reviewer: Claude Sonnet 4.6 (gsd-code-reviewer)_
_Depth: standard_
