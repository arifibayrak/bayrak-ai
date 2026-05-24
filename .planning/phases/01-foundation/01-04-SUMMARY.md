---
phase: 01-foundation
plan: "04"
subsystem: telegram-webhook
tags: [grammy, telegram, webhook, tdd, security, nodejs]
dependency_graph:
  requires:
    - 01-01 (scaffold: grammy installed, serverExternalPackages, vercel.json function override)
    - 01-02a (schema: pendingPeople table + getDefaultTenantId() helper)
  provides:
    - src/lib/telegram.ts: minimal grammY Bot + /start command handler (no conversations plugin)
    - src/app/api/telegram/webhook/route.ts: Node-runtime POST via webhookCallback + secret-token verification + GET health
    - tests/telegram-webhook.test.ts: secret-token 401 unit tests + describeIfDb idempotency tests
  affects:
    - 01-05 (people approval Server Actions read pending_people rows we write here)
    - Phase 2 (adds conversations plugin + session middleware to the same route entry point)
tech_stack:
  added: []
  patterns:
    - grammY webhookCallback with std/http adapter for Next.js App Router route handlers
    - runtime='nodejs' on webhook route (grammY incompatible with Edge runtime)
    - Lazy @/db import inside handler body — prevents neon() firing at module load when DATABASE_URL unset
    - vi.doMock(@/db) + bot.init spy pattern for pure unit tests without network or DB
    - describeIfDb guard for DB-gated idempotency tests
key_files:
  created:
    - src/lib/telegram.ts
    - src/app/api/telegram/webhook/route.ts
    - tests/telegram-webhook.test.ts
  modified: []
decisions:
  - "Lazy import of @/db inside /start handler body (not at module scope) — prevents neon() initialization at load time when DATABASE_URL is unset; keeps pure unit tests runnable without a live DB"
  - "vi.doMock(@/db) + bot.init spy pattern — prevents grammY from making getMe network call to Telegram API during unit tests; avoids timeout (grammY calls bot.init() before secret-token check)"
  - "TDD RED/GREEN: test file committed first (e93abc8), implementation committed second (bae6ee7)"
  - "grammY secretToken option explicitly passed to webhookCallback — grammY does NOT auto-read TELEGRAM_WEBHOOK_SECRET from env (T-04-01)"
  - "Fail-fast throw at module load if TELEGRAM_WEBHOOK_SECRET or TELEGRAM_BOT_TOKEN unset — misconfigured deploy fails immediately"
metrics:
  duration: "7 minutes"
  completed: "2026-05-24"
  tasks_completed: 1
  files_created: 3
---

# Phase 01 Plan 04: Telegram /start Webhook Summary

**One-liner:** Minimal grammY Bot with /start command handler that idempotently upserts pending_people rows (ON CONFLICT DO NOTHING), exposed as a Node-runtime Next.js route with grammY secret-token verification (T-04-01) — unit tests mock bot.init to avoid Telegram API calls; DB idempotency tests gate on TEST_DATABASE_URL.

## What Was Built

### Task 1: grammY bot instance + /start handler + Node-runtime webhook route (TDD)

**src/lib/telegram.ts:**
- Creates minimal `Bot` from `TELEGRAM_BOT_TOKEN`; throws at load if unset (T-04-03)
- `bot.command('start')`: reads `ctx.from.id` + `ctx.from.first_name ?? ctx.from.username`; inserts into `pendingPeople` via `.onConflictDoNothing()` with `tenantId: getDefaultTenantId()` (Pitfall 3 prevention)
- Turkish pending-approval reply: `Merhaba ${name}! 👋\n\nKayıt talebiniz ofis mühendisine iletildi. Onaylandıktan sonra iş kaydı yapmaya başlayabilirsiniz.`
- No `@grammyjs/conversations`, no session middleware (Phase 2 boundary preserved, D-02)
- `@/db` and `@/db/schema/pending-people` are lazy-imported inside the handler body (deviation from original plan sketch) to prevent `neon()` from firing at module load when `DATABASE_URL` is unset

**src/app/api/telegram/webhook/route.ts:**
- `export const runtime = 'nodejs'` — required; grammY is incompatible with Edge runtime
- `export const dynamic = 'force-dynamic'` + `export const fetchCache = 'force-no-store'`
- Fail-fast: throws at module load if `TELEGRAM_WEBHOOK_SECRET` is unset
- `export const POST = webhookCallback(bot, 'std/http', { secretToken: webhookSecret })` — grammY validates `X-Telegram-Bot-Api-Secret-Token` header; wrong/missing secret → 401-class response, `/start` handler does not run (T-04-01)
- `export async function GET()` — returns `{ ok: true, phase: 1 }` for health probes

**tests/telegram-webhook.test.ts:**
- Pure unit tests (no DB, no network):
  - `vi.doMock('@/db')` stubs Drizzle client before route import so `neon()` never fires
  - `vi.spyOn(bot, 'init').mockResolvedValue()` prevents grammY's `getMe` network call
  - POST with wrong secret → response.status in [400, 500) AND mockInsert not called
  - POST with missing secret header → same assertions
- `describeIfDb` idempotency tests (skip without `TEST_DATABASE_URL`):
  - First `/start` from user N → exactly one `pending_people` row
  - Replay same user → still exactly one row (ON CONFLICT DO NOTHING)

## Commits

| Commit | Description |
|--------|-------------|
| e93abc8 | test(01-04): add failing Telegram webhook tests (RED gate) |
| bae6ee7 | feat(01-04): grammY /start webhook + Node runtime + secret-token verification (GREEN gate) |
| c23c189 | fix(01-04): add first_name to PrivateChat mock object (TS2322) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Lazy @/db import to prevent neon() at module load**
- **Found during:** GREEN phase (first test run)
- **Issue:** `src/db/index.ts` calls `neon(process.env.DATABASE_URL!)` at module load. Importing `@/lib/telegram` (which imports `@/db`) in a test environment without `DATABASE_URL` throws: "No database connection string was provided to `neon()`". Pure unit tests require the module to load without a DB.
- **Fix:** Moved `import('@/db')` and `import('@/db/schema/pending-people')` from module scope into the `/start` handler body as dynamic imports. The handler only runs during real webhook invocations where `DATABASE_URL` must be set; at load time no DB connection is attempted.
- **Files modified:** `src/lib/telegram.ts`
- **Commit:** bae6ee7

**2. [Rule 1 - Bug] grammY bot.init() network call blocks unit tests**
- **Found during:** GREEN phase (tests timed out at 5s)
- **Issue:** `webhookCallback` calls `bot.init()` (which calls Telegram's `getMe` API) on the FIRST invocation — BEFORE the secret-token comparison. With a fake `TEST:...` token the network call hangs indefinitely (no valid response from Telegram). Tests timed out.
- **Fix:** In tests, spy on `bot.init()` with `vi.spyOn(bot, 'init').mockResolvedValue()` to stub the network call. The secret-token check still runs correctly because grammY's `compareSecretToken` is internal to the callback logic.
- **Files modified:** `tests/telegram-webhook.test.ts`
- **Commit:** bae6ee7

**3. [Rule 1 - Bug] PrivateChat TypeScript type requires first_name**
- **Found during:** TypeScript check post-GREEN
- **Issue:** grammY's `PrivateChat` type requires a `first_name` field; the test fake chat object was missing it (TS2322)
- **Fix:** Added `first_name: firstName` to the chat object in `triggerStart()`
- **Files modified:** `tests/telegram-webhook.test.ts`
- **Commit:** c23c189

## TDD Gate Compliance

- RED gate: `e93abc8` — test(01-04) committed with failing suite (Cannot find module)
- GREEN gate: `bae6ee7` — feat(01-04) committed with 2 pure tests passing, 2 DB tests skipped
- REFACTOR: Not required — no cleanup needed beyond the TS fix commit

## Known Stubs

None — this plan creates infrastructure only (no UI rendering, no data-connected components beyond the webhook handler itself).

## Threat Flags

None — all threat mitigations from the plan's threat model are implemented:

- T-04-01: `webhookCallback(bot, 'std/http', { secretToken: webhookSecret })` — grammY validates header; wrong/missing → 401-class; unit-tested (both wrong and missing header cases)
- T-04-02: `onConflictDoNothing()` on telegram_user_id UNIQUE constraint — idempotent; prevents duplicate rows
- T-04-03: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` read from env only; module throws if either unset; never logged
- T-04-04: `/start` only writes `pending_people` (no role, no project, no session); access via plan 01-05 approval only
- T-04-SC: grammy was verified in RESEARCH Package Legitimacy Audit; installed in plan 01-01

## Self-Check: PASSED

Files verified to exist:
- src/lib/telegram.ts: present (bot.command('start') + onConflictDoNothing)
- src/app/api/telegram/webhook/route.ts: present (runtime='nodejs', webhookCallback, secretToken, GET health)
- tests/telegram-webhook.test.ts: present (vi.doMock, bot.init spy, secret-token assertions)

Commits verified present in git log:
- e93abc8: test(01-04) — RED gate
- bae6ee7: feat(01-04) — GREEN gate
- c23c189: fix(01-04) — TS fix

`npx vitest run tests/telegram-webhook.test.ts` → 2 passed, 2 skipped (DB-gated), exit 0
`npx vitest run` (full suite) → 25 passed, 0 failed, exit 0
Grep checks: webhookCallback ✓, secretToken ✓, TELEGRAM_WEBHOOK_SECRET ✓, runtime='nodejs' ✓, no edge runtime ✓, onConflictDoNothing ✓
