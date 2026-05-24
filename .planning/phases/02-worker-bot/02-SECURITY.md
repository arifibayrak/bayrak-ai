---
phase: 2
slug: worker-bot
status: secured
threats_open: 0
asvs_level: 1
created: 2026-05-24
---

# Phase 2 — Security (Worker Bot)

> Per-phase security contract: threat register, accepted risks, and audit trail.

**Audit date:** 2026-05-24
**ASVS Level:** 1
**Auditor verdict:** SECURED — all 13 mitigate threats verified closed in code, all 4 accept threats documented. Register authored at plan time (all 6 PLANs carried `<threat_model>` blocks).

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-02-01 | Tampering | mitigate | CLOSED | `src/db/schema/submissions.ts:34` — `unique('submissions_flow_id_unique').on(t.flowId)`; `src/lib/telegram.ts:1293` — `.onConflictDoNothing()` on confirm insert |
| T-02-02 | Tampering/Spoofing | mitigate | CLOSED | `src/db/schema/processed-updates.ts:8` — `updateId: bigint(...).primaryKey()`; `src/lib/telegram.ts:45-65` — idempotency middleware registered first via `bot.use()`, inserts with `.onConflictDoNothing()`, returns early on replay |
| T-02-03 | Info disclosure | mitigate | CLOSED | `src/db/schema/conversation-state.ts:12` — `telegramUserId: bigint(...).notNull().unique()` — enforces one row per worker at DB level |
| T-02-04 | Tampering | mitigate | CLOSED | `src/lib/telegram.ts:687-698` (`handleStepProject`) — re-queries worker's assigned projects via `resolveWorker`, checks `workerIdentity.projects.some(p => p.id === value)`, reprompts on mismatch; `src/lib/telegram.ts:834-841` (`handleStepBoq`) — re-queries BOQ items for the stored `projectId`, checks `boqRows.find(r => r.id === value)`, reprompts on tampered ID |
| T-02-05 | Info disclosure | mitigate | CLOSED | `src/lib/bot-photo.ts:57-59` — token used only to build Telegram file URL via `process.env.TELEGRAM_BOT_TOKEN`; never stored in conversation_state, never logged (zero `console.*` calls in bot-photo.ts and telegram.ts) |
| T-02-09 | Elevation of privilege | mitigate | CLOSED | `src/lib/telegram.ts:222-236` — `/start` handler calls `resolveWorker`; on `null` result, inserts into `pending_people` and replies `MESSAGES.pendingApproval`, returns before entering FSM; FSM dispatcher at line 587 also gates on stale/missing state |
| T-02-10 | Spoofing | mitigate | CLOSED | `src/app/api/telegram/webhook/route.ts:42-56` — Phase 1 secretToken check intact and not regressed; `webhookCallback(bot, 'std/http', { secretToken: webhookSecret })` — grammY validates `X-Telegram-Bot-Api-Secret-Token` header before any bot handler runs |
| T-02-11 | Info disclosure | mitigate | CLOSED | `src/lib/bot-fsm.ts:85-87` — `isStaleState()` compares `Date.now() - updatedAt.getTime() > 86_400_000` (24 h); called at `src/lib/telegram.ts:253`, `339`, `482`, `587` — all FSM entry points enforce TTL |
| T-02-12 | Availability | mitigate | CLOSED | `src/lib/telegram.ts:316` — `await ctx.answerCallbackQuery()` is the first statement in the `bot.on('callback_query:data', ...)` handler, before any DB work; all step-specific callback handlers are dispatched through this single top-level handler so every callback_query receives an answer |
| T-02-13 | Tampering | mitigate | CLOSED | Photo: `src/lib/telegram.ts:907-910` — checks `ctx.message?.photo` array; empty/missing -> `rejectNotPhoto`, no advance. Location: `src/lib/telegram.ts:973-977` — checks `ctx.message?.location`; missing -> `rejectNotLocation`, no advance. Quantity: `src/lib/telegram.ts:1041-1055` — normalizes comma, checks `dotCount > 1`, applies `!isFinite(parsed) || parsed <= 0` guard (CR-02), reprompts on failure |
| T-02-14 | Injection | mitigate | CLOSED | `src/lib/telegram.ts:1116` — `notes.slice(0, 1000)` caps free-text at 1000 chars; all DB writes use Drizzle parameterized ORM calls (no string-built SQL anywhere in telegram.ts) |
| T-02-15 | Availability | mitigate | CLOSED | `src/lib/telegram.ts:919-924` — `uploadPhotoToBlob` wrapped in `try { ... } catch (_err) { await ctx.reply(MESSAGES.photoUploadError); return; }` — stays on PHOTO step on failure |
| T-02-16 | Tampering | mitigate | CLOSED | `src/lib/telegram.ts:1267-1305` — `handleConfirmSubmit` opens a `getTxDb()` neon-serverless Pool transaction; `tx.insert(submissions)` and `tx.delete(conversationState)` execute atomically; `catch (_txErr)` block (CR-03) rolls back and leaves conversation_state intact for retry |
| T-02-17 | Spoofing | mitigate | CLOSED | `src/lib/telegram.ts:1238-1260` — `handleConfirmSubmit` re-loads state from DB (line 1239-1247); application-level guard at line 1258 checks `!data.projectId || !data.boqItemId || !data.photoUrl || data.quantity === undefined` before reaching the insert; DB-level NOT NULL constraints on `personId`, `projectId`, `boqItemId`, `photoUrl`, `quantity` in `src/db/schema/submissions.ts:15-25` provide a second line of defence |

*Status: open · closed. Threats open: 0.*

---

## Accepted Risks

These threats were accepted at plan time. No code mitigation is required. Documented here per the threat register.

| Threat ID | Category | Rationale |
|-----------|----------|-----------|
| T-02-06 | DoS/SSRF | Fetch URL is constructed only from Telegram's `getFile()` response (`api.telegram.org` host), not from user-controlled input. SSRF surface is bounded to Telegram's CDN. File-size cap deferred to Phase 3+ hardening. |
| T-02-07 | Tampering | Schema migration generated as CREATE-only (no DROP/ALTER). Human checkpoint required before any `drizzle-kit push` to production. |
| T-02-08 | Elevation of privilege | `DATABASE_URL` read from env (`.env.local` / Vercel env vars), never hardcoded. Vercel env var access controls are the transfer boundary. |
| T-02-SC | Tampering | Zero new package installs in Phase 2 (all deps from Phase 1). Supply-chain risk unchanged from Phase 1 baseline. |

---

## Unregistered Flags

None — no new attack surface appeared in SUMMARY.md threat flags that lacked a threat register mapping. All SUMMARY.md flags corresponded to registered threats above.

---

## Audit Trail

### Security Audit 2026-05-24

| Metric | Count |
|--------|-------|
| Threats found | 18 (14 distinct mitigate + 4 accept) |
| Closed | 18 |
| Open | 0 |

- CR-02 (isFinite quantity guard) verified present at `telegram.ts:1052`
- CR-03 (try/catch around confirm transaction) verified present at `telegram.ts:1273-1304`
- CR-05 (atomic `onConflictDoUpdate` in `saveState`) verified present at `telegram.ts:191-194`
- Phase 1 webhook secretToken check (T-02-10) confirmed not regressed by Phase 2 changes
- Deferred hardening (note for Phase 3+): explicit file-size cap on Telegram photo download (T-02-06), and a file-extension whitelist in `bot-photo.ts` (review finding WR-04, accepted as low risk this phase)
