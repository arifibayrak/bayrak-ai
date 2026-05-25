---
phase: 7
slug: data-foundation-canonical-record
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-25
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `07-RESEARCH.md` → Validation Architecture. Task IDs are assigned by the planner; rows below are keyed by requirement until then.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.7 |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx vitest run tests/analytics.test.ts tests/schema.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds (quick), full suite shares one Neon DB (`fileParallelism: false`) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/analytics.test.ts tests/schema.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Requirement Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|-------------|----------|-----------|-------------------|-------------|
| COST-01 | `setUnitPrice()` persists unit_price + currency_code; unauthorized guard rejects | DB integration | `npx vitest run tests/analytics.test.ts` | ❌ W0 |
| COST-01 | `currency_code` DEFAULT 'TRY' on existing rows after migration | DB integration | `npx vitest run tests/schema.test.ts` | ✅ extend |
| COST-02 | `getProjectMetrics()` returns EV + BAC grouped by currency | DB integration | `npx vitest run tests/analytics.test.ts` | ❌ W0 |
| COST-02 | Postgres `SUM(qty*price)` matches decimal.js — no float drift | unit | `npx vitest run tests/analytics.test.ts` | ❌ W0 |
| COST-03 | % complete = EV/BAC per currency pair (no cross-currency division) | unit | `npx vitest run tests/analytics.test.ts` | ❌ W0 |
| COST-04 | `getPersonMetrics()` value_contributed grouped by currency; role-scoped | DB integration | `npx vitest run tests/analytics.test.ts` | ❌ W0 |
| COST-05 | `getProjectMetrics()` rework_value counts rejected submissions only | DB integration | `npx vitest run tests/analytics.test.ts` | ❌ W0 |
| PERF-03 | `logOfficeActivity()` inserts row to `office_activity_log` after mutation | DB integration | `npx vitest run tests/analytics.test.ts` | ❌ W0 |
| PERF-03 | Primary Server Action succeeds even when log INSERT throws | unit | `npx vitest run tests/analytics.test.ts` | ❌ W0 |
| PERF-03 | `getOfficeActivityLog()` returns entries filtered by `actorUserId` | DB integration | `npx vitest run tests/analytics.test.ts` | ❌ W0 |
| Schema | `hakedis_period_lines` rejects `cumulative_qty < previous_cumulative_qty` (CHECK) | DB integration | `npx vitest run tests/schema.test.ts` | ✅ extend |
| Schema | `office_activity_log.actor_user_id` FK to `users.id` (text) accepted; `people.id` rejected | DB integration | `npx vitest run tests/schema.test.ts` | ✅ extend |

---

## Critical Money-Math Tests (correctness gate before any cost display)

1. **No float drift (COST-02 canonical)** — Seed unit_price `1250.0001` × 3 submissions of `333.333`; verify `getProjectMetrics().evByCurrency['TRY']` matches Postgres `numeric` and `Decimal(result).minus(expected).abs() < 0.001` (no kuruş drift).
2. **Cross-currency guard (COST-02 negative)** — Project with one TRY + one USD BOQ item; verify return has exactly keys `TRY` and `USD`, and **no** `total` key.
3. **Activity-log non-blocking (PERF-03)** — Mock `after()` to run immediately, mock `officeActivityLog` insert to throw; `createProject()` still returns ok AND the project is in the DB.
4. **Dual-role isolation (COST-04)** — Person who is worker on project A + auditor on project B; `getPersonMetrics()` worker metrics reflect project A only, no B bleed-through.
5. **CHECK constraint guard** — INSERT into `hakedis_period_lines` with `cumulative=100, previous=150` throws a Postgres constraint violation.

---

## Wave 0 Requirements

- [ ] `tests/analytics.test.ts` — stubs covering COST-01..05, PERF-03 (all behaviors above)
- [ ] `tests/fixtures/db.ts` — add `hakedis_period_lines`, `hakedis_periods`, `office_activity_log` to `truncateAllTables()` in FK-safe order
- [ ] `tests/schema.test.ts` — extend for currency default, CHECK constraint, actor FK
- [ ] `src/lib/types/canonical-submission.ts` + barrel — type definitions (no test file needed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Unit price + currency field renders in BOQ edit form and persists on save | COST-01 | UI render path; not covered by DB integration test | In dashboard, edit a BOQ item, set price `1000` + currency `TRY`, save, reload — value persists; an unpriced item shows a placeholder not `0` |
| BAC/EV columns appear on BOQ detail alongside quantity columns | COST-02 | Visual placement | Open a project with priced BOQ items; confirm contracted/earned value columns render per line item |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
