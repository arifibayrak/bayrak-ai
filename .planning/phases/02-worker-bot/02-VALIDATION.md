---
phase: 02
slug: worker-bot
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-24
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.7 |
| **Config file** | `vitest.config.ts` (fileParallelism: false — shared Neon test DB) |
| **Quick run command** | `npx vitest run tests/telegram-bot.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10–30 seconds (unit groups fast; describeIfDb adds live-DB latency only when TEST_DATABASE_URL set) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/telegram-bot.test.ts` (optionally `-t "<group>"` for the task's group)
- **After every plan wave:** Run `npx vitest run` (full suite) + `npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite green, AND the SC3/SC4 describeIfDb tests run green against a live TEST_DATABASE_URL (mandatory — D-13 / STATE.md Phase 2 blocker)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | LOG-08, LOG-10 | T-02-02 | conversation_state + processed_updates schema (PK dedup fence) | source/tsc | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | LOG-08 | T-02-01 | submissions flow_id UNIQUE constraint + status default | source/tsc | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | LOG-08, LOG-10 | T-02-01 | Wave 0 scaffold + FK-safe truncate; Turkish-decimal guard | unit | `npx vitest run tests/telegram-bot.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | I18N-01, LOG-09 | — | Turkish catalog single source; pure FSM types + TTL | unit/tsc | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | LOG-02, LOG-03 | T-02-04 | paginated keyboards; balance labels (D-24) | unit | `npx vitest run tests/telegram-bot.test.ts -t "keyboard builders"` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | LOG-04 | T-02-05/06 | photo→Blob helper; last-photo; no token leak | tsc | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | LOG-08, LOG-10 | T-02-07 | [BLOCKING] live schema push (closes false-positive trap) | CLI | `node_modules/.bin/drizzle-kit push` | n/a | ⬜ pending |
| 02-04-01 | 04 | 3 | LOG-10, LOG-01 | T-02-02/09 | dedup middleware (Guard 1); unregistered rejected | unit | `npx vitest run tests/telegram-bot.test.ts -t "idempotency"` | ❌ W0 | ⬜ pending |
| 02-04-02 | 04 | 3 | LOG-01, I18N-01 | T-02-09/12 | /start greeting + Devam/Baştan; /iptal; answerCallbackQuery | unit | `npx vitest run tests/telegram-bot.test.ts -t "start"` | ❌ W0 | ⬜ pending |
| 02-04-03 | 04 | 3 | LOG-10, LOG-09 | T-02-11/12 | cold-start resume (SC5); TTL eviction (D-22) | unit | `npx vitest run tests/telegram-bot.test.ts -t "resume"` | ❌ W0 | ⬜ pending |
| 02-05-01 | 05 | 4 | LOG-02, LOG-03 | T-02-04 | assigned-only project; balance + 0-balance soft warn; tamper-check | unit | `npx vitest run tests/telegram-bot.test.ts -t "selection"` | ❌ W0 | ⬜ pending |
| 02-05-02 | 05 | 4 | LOG-04, LOG-05 | T-02-13/15 | photo/location type enforcement; no geofence | unit | `npx vitest run tests/telegram-bot.test.ts -t "enforcement"` | ❌ W0 | ⬜ pending |
| 02-05-03 | 05 | 4 | LOG-06, LOG-07 | T-02-13/14 | numeric incl. Turkish 25,5; notes skip→null; length cap | unit | `npx vitest run tests/telegram-bot.test.ts -t "quantity"` | ❌ W0 | ⬜ pending |
| 02-06-01 | 06 | 5 | LOG-08, I18N-01 | — | confirm summary + per-field edit (D-16) | unit | `npx vitest run tests/telegram-bot.test.ts -t "confirm summary"` | ❌ W0 | ⬜ pending |
| 02-06-02 | 06 | 5 | LOG-08 | T-02-16/17 | transactional insert (getTxDb); Gönderildi/Yeni kayıt | unit | `npx vitest run tests/telegram-bot.test.ts -t "submission insert"` | ❌ W0 | ⬜ pending |
| 02-06-03 | 06 | 5 | LOG-08, LOG-10 | T-02-01/02 | [SC4 MANDATORY] duplicate-update → exactly one row; persistence | describeIfDb (live DB) | `npx vitest run tests/telegram-bot.test.ts -t "idempotency"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/telegram-bot.test.ts` — new test file; scaffolded in Plan 01 Task 3 (runs green with the Turkish-decimal guard + it.todo placeholders), filled across Plans 02/04/05/06
- [ ] `tests/fixtures/db.ts` — `truncateAllTables` extended with `submissions`, `conversation_state`, `processed_updates` (FK-safe order) — Plan 01 Task 3
- [ ] Live schema push — `node_modules/.bin/drizzle-kit push` — Plan 03 ([BLOCKING], Wave 2)

*Existing infrastructure (vitest.config.ts, tests/setup.ts, tests/fixtures/db.ts describeIfDb/getTestDb) covers the framework; only the new test file, the truncate extension, and the schema push are new.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| drizzle-kit push interactive prompt resolution | LOG-08, LOG-10 | drizzle-kit may prompt to confirm new-table creation; the environment may not auto-answer | Run `node_modules/.bin/drizzle-kit push`; for each prompt choose CREATE for conversation_state / processed_updates / submissions (never rename) — Plan 03 is flagged autonomous: false |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (test file, truncate extension, schema push)
- [x] No watch-mode flags (all commands use `vitest run`, not `vitest`)
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-24
