---
phase: 9
slug: performance-scorecards-leaderboard-alerts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-27
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Test map seeded from RESEARCH.md Validation Architecture; per-task IDs filled by the planner.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vitest.config.ts` — `fileParallelism: false`, `environment: 'node'` |
| **Quick run command** | `npx vitest run tests/analytics.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds (full), ~10s (analytics only) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/analytics.test.ts` (data-layer tasks)
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Requirement-level seed from RESEARCH.md. Planner maps each row to concrete task IDs (`9-PP-TT`) during planning.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PERF-01 | — | `getPersonMetrics` returns `outputQuantitySum` for approved submissions | integration | `npx vitest run tests/analytics.test.ts` | ⚠️ extend | ⬜ pending |
| TBD | TBD | TBD | PERF-02 | — | `getPersonMetrics` returns SLA-breach rate (breach/decided); null when no decisions | integration | `npx vitest run tests/analytics.test.ts` | ⚠️ extend | ⬜ pending |
| TBD | TBD | TBD | PERF-03 | T-09 access | OE scorecard reads `office_activity_log`, tenant-scoped + auth-guarded | integration | `npx vitest run tests/analytics.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PERF-05 | — | Leaderboard sort: workers by approved volume, auditors by turnaround, tie-break by name | unit | `npx vitest run tests/analytics.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PERF-06 | — | `getStalledProjects` returns projects w/ no approved submission in N days | integration | `npx vitest run tests/analytics.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PERF-06 | T-09 tamper | `getTenantSettings` returns seeded defaults; `updateTenantSettings` upserts, tenant-scoped, zod-validated | integration | `npx vitest run tests/analytics.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PERF-06 | — | Overview alert badges fire per configured thresholds (rejection absolute; suppress when no date filter) | smoke / manual | manual browser check | ❌ W0 (no E2E) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/analytics.test.ts` — new `describeIfDb('PERF-01/02: getPersonMetrics enrichments')` block (outputQuantitySum, SLA-breach-rate fraction, null-safe denominator)
- [ ] `tests/analytics.test.ts` — new `describeIfDb('PERF-06: getStalledProjects')` block
- [ ] `tests/analytics.test.ts` — new `describeIfDb('PERF-06: getTenantSettings / updateTenantSettings')` block (defaults, upsert, auth guard, zod rejection)
- [ ] `tests/analytics.test.ts` — new `describe('PERF-05: leaderboard sort')` block (pure sort — no DB)
- [ ] `tests/analytics.test.ts` — new `describeIfDb('PERF-03: getOfficeEngineerActivity')` block
- [ ] `vi.mock('next/server')` in any new test file importing actions that use `after()`

*Existing `tests/analytics.test.ts` (51 tests) covers PERF-01/02 base fields under COST-04 + PERF-04 blocks — extended, not replaced.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Overview KPI cards show inline alert badges when thresholds breached | PERF-06 | No E2E framework | Browser: set thresholds low on /dashboard/settings, confirm pending/rejection cards + Stalled-projects card badge red |
| Stalled-projects card drills to stalled projects | PERF-06 | Browser interaction | Browser: click the Stalled projects card, confirm filtered drill |
| Leaderboard rank-by selector re-sorts boards | PERF-05 | Browser interaction | Browser: switch rank-by metric, confirm order changes; Worker/Auditor boards separate |
| Settings form persists thresholds (office-engineer only) | PERF-06 | Browser + auth | Browser: edit thresholds, reload, confirm persisted; verify tenant-scoped |
| New labels render in TR and EN | I18N (project rule) | Locale toggle | Browser: toggle TR/EN across scorecards, leaderboard, settings, alerts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
