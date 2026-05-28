---
phase: 12
slug: submission-driven-hakkedi
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
revised: 2026-05-28
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `12-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.7 [VERIFIED in package.json] |
| **Config file** | `vitest.config.ts` (existing, used by all Phase 7-11 tests) |
| **Test environment** | `environment: 'node'` [VERIFIED in vitest.config.ts] — NO jsdom, NO @testing-library/react. Component tests are pure-function invocations. |
| **Quick run command** | `npx vitest run tests/hakedis-live.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10s quick / ~300s full |
| **DB integration gate** | `describeIfDb` from `tests/fixtures/db.ts` (same pattern Phase 7-11 used) |
| **Mock pattern** | `vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => fn() }))` for any test that touches Server Actions importing `logOfficeActivity` (Phase 7 finding, reusable) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/hakedis-live.test.ts -x`
- **After every plan wave:** Run `npx vitest run tests/hakedis-live.test.ts tests/hakedis.test.ts tests/exports.test.ts tests/telegram-audit.test.ts`
- **Before `/gsd:verify-work`:** Full suite must be green (`npx vitest run`)
- **Max feedback latency:** ~10 seconds (quick) / ~60 seconds (wave)

---

## Per-Task Verification Map

> Test IDs are placeholders. Planner will assign concrete `{N}-{plan}-{task}` IDs in PLAN.md files and update this map after planning.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|
| SDH-01 | Approval triggers `recomputeHakedisLine` for matching `(projectId, boqItemId, currencyCode)` | integration (describeIfDb) | `npx vitest run tests/hakedis-live.test.ts -t "D-117"` | ❌ W0 | ⬜ pending |
| SDH-01 | D-118: no draft period → recompute is a no-op (no error, no write) | integration | `… -t "D-118 no-open-period"` | ❌ W0 | ⬜ pending |
| SDH-01 | D-120 polling: `LivePeriodPoller` returns `null` when `enabled === false` (pure-import contract; vitest node env, no DOM) | unit (component-as-function) | `… -t "LivePeriodPoller mount gate"` | ❌ W0 | ⬜ pending |
| SDH-02 | `hakedis_line_submissions` row inserted on contribution (D-119) | integration | `… -t "D-119 join row"` | ❌ W0 | ⬜ pending |
| SDH-02 | `getLineSubmissions` returns expected shape (worker, decided_at, qty_contributed) | integration | `… -t "getLineSubmissions"` | ❌ W0 | ⬜ pending |
| SDH-03 | Finalize-during-approve race serialises correctly (Pitfall 4 mitigation) | integration | `… -t "finalize race"` | ❌ W0 | ⬜ pending |
| SDH-03 | Manual `recomputePeriodLines` produces identical output before/after Phase 12 | integration | `npx vitest run tests/hakedis.test.ts` | ✅ (must stay green) | ⬜ pending |
| SDH-03 | Phase 11 exports byte-identical for same finalized period before/after Phase 12 | integration | `npx vitest run tests/exports.test.ts` | ✅ (must stay green) | ⬜ pending |
| Pitfall 5 mitigation | Bot path never calls `logOfficeActivity` (no FK fail on `actorUserId`) | integration | `… -t "no office_activity_log write from bot"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Row 3 — LivePeriodPoller Mount Gate Contract Note (revised 2026-05-28)

The original row spec'd a rendered sr-only span on every mount. After checker review (Blocker 2), the contract was revised:

- **LivePeriodPoller returns `null` when `enabled === false`** (no DOM, no sr-only span emitted on disabled paths).
- **LivePeriodPoller returns the sr-only `<span role="status" aria-live="polite">` only when `enabled === true`** (matches D-120 "polls only when status === 'draft'").

This makes the test a deterministic pure-function call that works in vitest's `environment: 'node'` without `@testing-library/react` (which is NOT in `package.json`). The concrete assertion shape lives in Plan 04 Task 1:

```ts
expect(typeof LivePeriodPoller).toBe('function');
expect(LivePeriodPoller({ enabled: false })).toBeNull();
```

Plan 03 Task 1 leaves this as `it.todo` until Plan 04 ships the component file; Plan 04 Task 1 replaces the todo with the concrete assertion above. After Plan 04 Task 1, `grep -cE 'it\\.todo' tests/hakedis-live.test.ts` MUST return 0.

---

## Wave 0 Requirements

- [ ] `tests/hakedis-live.test.ts` — new file; mirrors `tests/hakedis.test.ts` setup (`describeIfDb`, `seedAuditFixture`, `truncateAllTables`); covers SDH-01/02/03 contracts above
- [ ] `seedDraftPeriod` fixture helper (additive in `tests/fixtures/hakedis.ts` or equivalent) — reuses `seedAuditFixture`'s workers/auditors/BOQ items
- [ ] No new framework install — vitest 4.1.7 already in deps

*If none of the above ship in Wave 0, plans fail Dimension 8 (test-evidence sampling).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| 30s polling visibly updates the draft hakkediş detail page when an approval arrives | SDH-01 / D-120 | Browser-render + setInterval timing is observable, but full timing cannot be deterministically asserted from a vitest run in finite CI time | Open `/dashboard/hakedis/{draft-period-id}` in browser; have an auditor approve a submission via Telegram for a BOQ item in the period's scope; wait ≤30s; confirm the line row's `period_qty` increases without a manual refresh |
| Traceability UI lists the contributing submissions for a hakkediş line | SDH-02 | The exact rendered surface (drawer / expand-row / sub-page — planner picks) needs a human visual check that fields are present + readable | Open a draft hakkediş line that has had ≥1 approval contribute to it; open the traceability surface; confirm rows show worker name, approval timestamp, and `qty_contributed` |
| Late approval (decided_at past current draft period_end_date) does NOT mutate the finalized snapshot | SDH-03 | The "did the snapshot change" check is best done by comparing the Phase 11 PDF/Excel bytes for the same finalized period before-and-after | Finalize period A. Then have an auditor approve a back-dated submission whose `decided_at` falls inside period A's window. Confirm period A's `hakedis_period_lines` rows are unchanged and Phase 11 PDF/Excel for period A still produces identical bytes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s (quick) / 60s (wave)
- [ ] `nyquist_compliant: true` set in frontmatter (after planner+plan-checker pass)

**Approval:** pending (planner to update on completion)
