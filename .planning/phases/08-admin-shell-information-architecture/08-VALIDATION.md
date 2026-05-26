---
phase: 8
slug: admin-shell-information-architecture
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-26
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Test map seeded from RESEARCH.md Validation Architecture; per-task IDs filled by the planner.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` (root) — `fileParallelism: false` (DB tests run sequentially) |
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

> Requirement-level seed from RESEARCH.md. Planner maps each row to concrete task IDs (`8-PP-TT`) during planning.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | UX-01 | — | Sidebar renders on all dashboard routes; `/dashboard` → `/dashboard/overview` | smoke / manual | manual browser check | ❌ W0 (no E2E) | ⬜ pending |
| TBD | TBD | TBD | UX-02 | — | `getPortfolioKPIs` returns correct counts | integration | `npx vitest run tests/analytics.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | UX-03 | T-08 tampering | Filter params scope query results; tenant-scoped | integration | `npx vitest run tests/analytics.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | UX-04 | — | `getPortfolioTrends` returns correct bucketed data (Istanbul tz) | integration | `npx vitest run tests/analytics.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | UX-05 | — | `getCanonicalSubmissions({ submissionId })` returns one record | integration | `npx vitest run tests/analytics.test.ts` | ⚠️ partial | ⬜ pending |
| TBD | TBD | TBD | PERF-04 | — | `getPersonMetrics` with `dateRange` scopes correctly | integration | `npx vitest run tests/analytics.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | I18N-03 | — | New `dashboard.admin.*` keys exist in both `en.json` and `tr.json` | unit | `npx vitest run tests/i18n.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/analytics.test.ts` — new `describe` blocks for `getPortfolioKPIs`, `getPortfolioTrends`, `getAuditorDecisions`, and `getPersonMetrics` with `dateRange`
- [ ] `tests/i18n.test.ts` — add assertions for `dashboard.admin.*` namespace keys in `en.json` and `tr.json`

*Existing `tests/analytics.test.ts` covers `getCanonicalSubmissions`, `getProjectMetrics`, `getPersonMetrics`, and `getPortfolioOverview` — those tests stay GREEN and are extended, not replaced.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar visible + active-item highlight on every dashboard route incl. `/dashboard/projects/*` | UX-01 | No E2E framework installed | Browser: visit each top-level route + a project route, confirm sidebar persists and active item highlights |
| `/dashboard` redirects to `/dashboard/overview` | UX-01 | Routing behavior | Browser: navigate to `/dashboard`, confirm redirect |
| TR/EN locale switch flips every new label/column/button/status | I18N-03 | Visual locale toggle | Browser: switch locale, scan admin surfaces for untranslated strings |
| Filters persist across navigation via URL query params | UX-03 | Cross-page nav behavior | Browser: set filters, navigate Overview→People→Records, confirm params persist |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
