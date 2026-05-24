---
phase: 3
slug: audit-loop
status: draft
nyquist_compliant: false
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
| **Quick run command** | `npx vitest run src/lib/<changed>.test.ts tests/<changed>.test.ts` |
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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-XX-XX | XX | 1 | AUDIT-04 | T-3-RACE | First decision wins; second concurrent tap is a no-op ("already resolved") with NO double-increment of `approved_qty` | integration | `npx vitest run tests/audit-decision-race.test.ts` | ❌ W0 | ⬜ pending |
| 3-XX-XX | XX | 1 | AUDIT-04 | — | Approve increments `boq_items.approved_qty` by exactly the submitted quantity, atomically with the status transition | integration | `npx vitest run tests/audit-approve.test.ts` | ❌ W0 | ⬜ pending |
| 3-XX-XX | XX | 1 | AUDIT-06 | T-3-DUP | Replayed callback_query update is de-duped by the `processed_updates` fence (no second decision) | integration | `npx vitest run tests/audit-duplicate-update.test.ts` | ❌ W0 | ⬜ pending |
| 3-XX-XX | XX | 1 | AUDIT-03 | T-3-AUTHZ | Non-assigned user's tap changes no DB row and returns an ephemeral rejection | integration | `npx vitest run tests/audit-authz.test.ts` | ❌ W0 | ⬜ pending |
| 3-XX-XX | XX | 1 | AUDIT-05 | — | Reject without a reason leaves submission `pending_audit`; reject WITH reason persists `rejection_reason` and notifies the worker | integration | `npx vitest run tests/audit-reject-reason.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/audit-decision-race.test.ts` — concurrency/double-tap race stub (AUDIT-04, AUDIT-06)
- [ ] `tests/audit-approve.test.ts` — atomic `approved_qty` increment stub (AUDIT-04)
- [ ] `tests/audit-duplicate-update.test.ts` — idempotency-fence replay stub (AUDIT-06)
- [ ] `tests/audit-authz.test.ts` — action-time authorization stub (AUDIT-03)
- [ ] `tests/audit-reject-reason.test.ts` — mandatory-reason FSM stub (AUDIT-05)
- [ ] grammY callback test harness — set `bot.botInfo` after mocking `bot.init`; intercept replies via `api.config.use(transformer)` (reuse Phase 2 pattern)

*Existing `tests/setup.ts` and DB fixtures from Phase 1/2 cover infrastructure; new audit-specific test files are the Wave 0 additions.*

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
