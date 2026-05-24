---
phase: 3
slug: audit-loop
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-24
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.x |
| **Config file** | `vitest.config.ts` (globals on, node env, `tests/setup.ts`, `fileParallelism: false`) |
| **Quick run command** | `npx vitest run tests/telegram-audit.test.ts` (optionally `-t "AUDIT-04"` to scope by requirement) |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30–60 seconds (DB integration tests run sequentially — shared Neon database) |

---

## Sampling Rate

- **After every task commit:** Run the quick command scoped to the changed unit
- **After every plan wave:** Run `npx vitest run` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Populated by the planner (Dimension 8 — each task carries an `<automated>` verify
> command) and reconciled by the Nyquist auditor against the final PLAN.md files.
> The race/concurrency and atomic-increment rows below are MANDATORY — they prove the
> phase's hardest success criteria.

> All Phase 3 tests live in ONE file — `tests/telegram-audit.test.ts` — scaffolded red
> in Plan 03-01 (Wave 0) and turned green in Plans 03-04/03-05. DB-dependent rows run
> under `describeIfDb` (skip cleanly without `TEST_DATABASE_URL`). Scope by requirement
> with `-t "<REQ>"`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-05-01 | 05 | 4 | AUDIT-06 SC5 | T-3-RACE | First decision wins; second concurrent tap is a no-op ("already resolved") with NO double-increment of `approved_qty` | integration (describeIfDb) **MANDATORY** | `npx vitest run tests/telegram-audit.test.ts -t "AUDIT-06"` | ❌ W0 | ⬜ pending |
| 3-05-01 | 05 | 4 | AUDIT-04 SC3 | — | Approve increments `boq_items.approved_qty` by exactly the submitted quantity, atomically with the status transition; second tap increments once total | integration (describeIfDb) **MANDATORY** | `npx vitest run tests/telegram-audit.test.ts -t "AUDIT-04"` | ❌ W0 | ⬜ pending |
| 3-05-03 | 05 | 4 | AUDIT-06 | T-3-DUP | Replayed callback_query update is de-duped by the `processed_updates` fence (no second decision) | integration | `npx vitest run tests/telegram-audit.test.ts -t "AUDIT-06"` | ❌ W0 | ⬜ pending |
| 3-05-01 | 05 | 4 | AUDIT-03 | T-3-AUTHZ | Non-assigned user's tap changes no DB row and returns an ephemeral rejection | unit (mock DB) | `npx vitest run tests/telegram-audit.test.ts -t "AUDIT-03"` | ❌ W0 | ⬜ pending |
| 3-05-02 | 05 | 4 | AUDIT-05 | — | Reject without a reason leaves submission `pending_audit`; reject WITH reason persists `rejection_reason` and notifies the worker | integration (describeIfDb) | `npx vitest run tests/telegram-audit.test.ts -t "AUDIT-05"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

- [ ] `tests/telegram-audit.test.ts` — single audit test file scaffolded red in Plan 03-01 Task 3, covering ALL audit behaviors: concurrency/double-tap race (AUDIT-06 SC5, MANDATORY), atomic `approved_qty` increment (AUDIT-04 SC3, MANDATORY), idempotency-fence replay (AUDIT-06), action-time authorization (AUDIT-03), and mandatory-reason FSM (AUDIT-05)
- [ ] grammY callback test harness — `setupBotForTest()` + `bot.api.config.use(transformer)` (NOT `vi.spyOn`); add `makeCallbackUpdate()` as the Phase 3 analog of `makeTextUpdate()` (reuse `tests/telegram-bot.test.ts` pattern)
- [ ] `tests/fixtures/db.ts` — add `audit_notifications` to `truncateAllTables` BEFORE `submissions` (FK order)

*Existing `tests/setup.ts` and DB fixtures from Phase 1/2 cover infrastructure; the consolidated `tests/telegram-audit.test.ts` plus the fixture/truncate-order update are the Wave 0 additions. DB-dependent cases run under `describeIfDb` and skip cleanly without `TEST_DATABASE_URL`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Auditor receives the fan-out message with photo, Maps link, BOQ item, qty, notes, and live Approve/Reject buttons | AUDIT-01 | Real Telegram delivery + photo rendering can't be fully asserted in unit tests | Trigger a worker confirm in a staging chat; verify the auditor account receives a correctly-formatted message |
| All sibling fan-out messages lose their buttons after the first decision | AUDIT-02 | Requires multiple real auditor chats to observe edit propagation | Assign 2 auditors; confirm a submission; tap on one; verify the other's message buttons are stripped and show the outcome |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (use `vitest run`, never `vitest` watch)
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
