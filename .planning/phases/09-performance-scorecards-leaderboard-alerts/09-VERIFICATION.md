---
phase: 09-performance-scorecards-leaderboard-alerts
verified: 2026-05-27T00:00:00Z
status: human_needed
score: 13/13
overrides_applied: 0
re_verification: null
human_verification:
  - test: "Navigate to /dashboard/people/[workerId] — switch between a worker and auditor persona"
    expected: "Worker profile shows Output Volume + Approval Rate KPI cards; Auditor profile shows SLA-Breach-Rate KPI card colored amber (warning) or red (destructive) based on breach severity"
    why_human: "React Server Component rendering of conditional valueColor and alertBadge is only observable in browser"
  - test: "Navigate to /dashboard/people and use the LeaderboardSortSelect dropdown to change sort metric"
    expected: "Worker list re-ranks by selected metric; Auditor list re-ranks by selected metric (turnaround/decisions/backlog/sla_breach); a rank column shows ordinal position; ties broken by displayName"
    why_human: "Client-side sort interaction and rank column rendering require browser navigation with real data"
  - test: "Navigate to /dashboard/analytics/office-engineers/[userId] for a valid OE user"
    expected: "Read-only list of administrative actions (project creates/edits, BOQ imports, unit-price sets, person approvals/assignments, hakkediş create/finalize) with timestamps. Accessing a userId from a different tenant returns 404."
    why_human: "IDOR boundary (notFound on tenant miss) and activity log table rendering are browser/live-DB behaviors"
  - test: "On Overview with no date filter active: observe pending-backlog KPI and stalled-projects KPI"
    expected: "Stalled Projects KPI card badges red when >=1 stalled project; pending-backlog card shows destructive when pendingBacklog > 0 AND avgDecisionLatencyHours > auditSlaHours, warning when pendingBacklog > 0 but latency within threshold; rejection alert is suppressed (no date filter active)"
    why_human: "Alert badge rendering and two-condition color logic require live data and browser rendering"
  - test: "Navigate to /dashboard/settings via the TopNav gear icon"
    expected: "Gear icon visible in TopNav; clicking opens /dashboard/settings; the 3-input threshold form is present; submit with valid values saves and shows success; submit with auditSlaHours=0 shows a validation error"
    why_human: "Form UX, TopNav gear icon visibility, and form submission round-trip are browser-only behaviors"
  - test: "Toggle locale between TR and EN on scorecard, leaderboard, and settings pages"
    expected: "All new strings (output volume, approval rate, SLA breach rate, leaderboard column headers, settings labels, stalled projects, threshold form) render in the selected language"
    why_human: "i18n string rendering requires browser locale toggle"
---

# Phase 9: Performance Scorecards, Leaderboard, and Alerts — Verification Report

**Phase Goal:** Admin can view and compare worker, auditor, and office-engineer performance through full scorecards and a leaderboard, and SLA-breach alerts surface on the Overview — building on the filter, drill-down, and profile surfaces delivered in Phase 8.
**Verified:** 2026-05-27T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | tenant_settings table defined with D-84 Moderate defaults and unique tenant_id | VERIFIED | `src/db/schema/tenant-settings.ts`: `pgTable('tenant_settings',...)`, `.unique()` on tenantId, `default('0.3000')` string literal, auditSlaHours default 48, stalledDays default 7 |
| 2 | Schema barrel exports tenant-settings; truncate helper registers it | VERIFIED | `src/db/schema/index.ts` has `export * from './tenant-settings'`; `tests/fixtures/db.ts` contains `'tenant_settings'` |
| 3 | 0007 migration creates table with correct precision, UNIQUE, and idempotent seed | VERIFIED | `src/db/migrations/0007_v2_tenant_settings.sql`: `numeric(5,4)`, `tenant_settings_tenant_id_unique` UNIQUE, `ON CONFLICT (tenant_id) DO NOTHING` seed; `_journal.json` has idx-7 entry tagged `0007_v2_tenant_settings` |
| 4 | KpiCard accepts `'warning'` valueColor (amber) and `alertBadge` corner-slot | VERIFIED | `src/components/admin/KpiCard.tsx`: `'warning'` in ValueColor union, `text-amber-600` mapping, `alertBadge?: React.ReactNode`, `absolute top-2 right-2`, `aria-label="Alert: threshold exceeded"`; no `--primary` in alert paths |
| 5 | getPersonMetrics returns outputQuantitySum (worker) and slaBreachRateDecided (auditor, null-safe, bound param) | VERIFIED | `src/actions/analytics.ts`: both fields on PersonMetrics type; `output_quantity_sum` SQL alias; `auditSlaHours` bound param (not sql.raw); NULLIF denominator present |
| 6 | getPortfolioKPIs returns avgDecisionLatencyHours (point-in-time, null-safe) | VERIFIED | `src/actions/analytics.ts`: `avgDecisionLatencyHours` on PortfolioKPIs type; `avg_decision_latency_hours` SQL alias with `FILTER (WHERE decided_at IS NOT NULL)`; no dateCondition applied to this aggregate |
| 7 | getStalledProjects returns NOW-anchored stalled projects (NOT EXISTS, tenant-scoped) | VERIFIED | `src/actions/analytics.ts`: `export async function getStalledProjects`, `NOT EXISTS` subselect, `thresholdDate` computed from `Date.now()`, not date-range filter |
| 8 | getTenantSettings / updateTenantSettings: tenant-scoped, zod-validated, auth-guarded, idempotent upsert | VERIFIED | `src/actions/settings.ts`: auth guard, `WHERE tenant_id`, `ON CONFLICT (tenant_id)` upsert, `z.number().int().min(1).max(720)` / `min(0).max(1)` zod, `revalidatePath('/dashboard/overview')` + `revalidatePath('/dashboard/settings')` |
| 9 | Worker + auditor profile (PERF-01/02): outputQuantitySum and slaBreachRateDecided rendered on enriched Phase-8 profile page | VERIFIED | `src/app/dashboard/(admin)/people/[personId]/page.tsx`: imports both fields; `auditSlaHours` threaded from getTenantSettings into getPersonMetrics; `slaBreachRateDecided` rendered |
| 10 | Leaderboard (PERF-05): People directory ranks by selectable metric with rank column | VERIFIED | `src/app/dashboard/(admin)/people/page.tsx`: `sortBy` URL param, rank column, `sla_breach` auditor sort, LeaderboardSortSelect component wired |
| 11 | OE scorecard (PERF-03): read-only office-engineer activity view via getOfficeActivityLog, IDOR-closed | VERIFIED | `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx`: `getOfficeActivityLog({ actorUserId })`, `notFound()` on tenant miss, tenant-scoped via INNER JOIN |
| 12 | Overview alerts (PERF-06): Stalled Projects KPI, two-condition pending-backlog alert, rejection alert suppressed without date filter | VERIFIED | `src/app/dashboard/(admin)/overview/page.tsx`: `getStalledProjects(settings.stalledDays)` called; pendingColor two-condition logic (`avgDecisionLatencyHours > settings.auditSlaHours` → destructive, else warning); `rejectionAlertFires = isDateFiltered && ...` |
| 13 | Settings page + ThresholdSettingsForm + TopNav gear (PERF-06) | VERIFIED | `src/app/dashboard/(admin)/settings/page.tsx` renders with `getTenantSettings`; `ThresholdSettingsForm.tsx` calls `updateTenantSettings`; `TopNav.tsx` contains `/dashboard/settings` link; alert colors destructive/amber only |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema/tenant-settings.ts` | tenantSettings table definition | VERIFIED | pgTable with D-84 Moderate defaults, .unique() FK |
| `src/db/migrations/0007_v2_tenant_settings.sql` | CREATE TABLE + UNIQUE + seed INSERT | VERIFIED | numeric(5,4), UNIQUE, ON CONFLICT DO NOTHING |
| `src/db/migrations/meta/_journal.json` | idx 7 journal entry | VERIFIED | tag: "0007_v2_tenant_settings" |
| `src/components/admin/KpiCard.tsx` | warning ValueColor + alertBadge prop | VERIFIED | Both present, aria-label, no --primary |
| `src/actions/analytics.ts` | outputQuantitySum + slaBreachRateDecided + avgDecisionLatencyHours + getStalledProjects | VERIFIED | All four present with correct SQL shape |
| `src/actions/settings.ts` | getTenantSettings + updateTenantSettings | VERIFIED | Auth-guarded, zod-validated, tenant-scoped upsert |
| `src/app/dashboard/(admin)/people/[personId]/page.tsx` | Worker + auditor scorecard cards | VERIFIED | outputQuantitySum and slaBreachRateDecided rendered |
| `src/app/dashboard/(admin)/people/page.tsx` | Leaderboard rank column + sort | VERIFIED | sortBy param, rank col, sla_breach sort option |
| `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx` | Read-only OE activity scorecard | VERIFIED | getOfficeActivityLog wired, IDOR notFound gate |
| `src/components/admin/LeaderboardSortSelect.tsx` | Sort select component | VERIFIED | Exported |
| `src/app/dashboard/(admin)/overview/page.tsx` | Alert badges + Stalled Projects KPI card | VERIFIED | getStalledProjects, avgDecisionLatencyHours, two-condition logic |
| `src/app/dashboard/(admin)/settings/page.tsx` | Threshold settings page | VERIFIED | getTenantSettings called |
| `src/components/admin/ThresholdSettingsForm.tsx` | 3-input threshold form | VERIFIED | updateTenantSettings called |
| `src/components/layout/TopNav.tsx` | Settings gear entry point | VERIFIED | /dashboard/settings link present |
| `messages/en.json` + `messages/tr.json` | New i18n keys | VERIFIED | Both files contain new Phase-9 keys |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/db/schema/index.ts` | `tenant-settings.ts` | `export *` re-export | VERIFIED | Grep confirms `export * from './tenant-settings'` |
| `tests/fixtures/db.ts` | tenant_settings table | truncate list entry | VERIFIED | `'tenant_settings'` present in truncate array |
| `overview/page.tsx` | `getTenantSettings + getStalledProjects + getPortfolioKPIs` | Promise.all then sequential | VERIFIED | Phase-1 Promise.all fetches all three; stalledProjects called with `settings.stalledDays` in Phase-2 |
| `overview/page.tsx` pending-backlog badge | `avgDecisionLatencyHours vs auditSlaHours` | two-condition TS logic | VERIFIED | `kpis.avgDecisionLatencyHours > settings.auditSlaHours` → destructive, else warning |
| `ThresholdSettingsForm` | `updateTenantSettings` | client form submit | VERIFIED | Import and call confirmed in component |
| `TopNav gear` | `/dashboard/settings` | Link | VERIFIED | `/dashboard/settings` present in TopNav |
| `getPersonMetrics` auditor branch | `auditSlaHours` bound SQL param | FILTER on SLA hours | VERIFIED | `auditSlaHours` in options, not sql.raw |
| `people/[personId]/page.tsx` | `getTenantSettings().auditSlaHours` | threaded to getPersonMetrics | VERIFIED | `auditSlaHours` present on profile page |
| `people/page.tsx` | getPortfolioPeople result | TS sort by sortBy URL param + rank | VERIFIED | `sortBy` param and rank column both present |
| `analytics/office-engineers/[userId]/page.tsx` | `getOfficeActivityLog({ actorUserId })` | direct call | VERIFIED | Both identifiers confirmed |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `overview/page.tsx` | `kpis`, `settings`, `stalledProjects` | `getPortfolioKPIs` + `getTenantSettings` + `getStalledProjects` | Yes — DB queries in analytics.ts/settings.ts | FLOWING |
| `people/[personId]/page.tsx` | `workerMetrics.outputQuantitySum`, `metrics.slaBreachRateDecided` | `getPersonMetrics` with auditSlaHours | Yes — SUM/FILTER aggregates in analytics.ts | FLOWING |
| `analytics/office-engineers/[userId]/page.tsx` | activity log rows | `getOfficeActivityLog({ actorUserId })` | Yes — Phase-7 office_activity_log table queried | FLOWING |
| `settings/page.tsx` | settings row | `getTenantSettings()` | Yes — SELECT from tenant_settings, seeded row in DB | FLOWING |

---

### Behavioral Spot-Checks

Step 7b skipped — all entry points require an authenticated browser session and live Neon DB; no standalone-runnable CLI commands apply.

---

### Probe Execution

No `probe-*.sh` files declared or found for this phase. Step 7c not applicable.

---

### Requirements Coverage

| Requirement | Plans | Description | Status | Evidence |
|-------------|-------|-------------|--------|----------|
| PERF-01 | 04, 05 | Worker scorecard: output quantity, approval rate per project + across all projects | SATISFIED | outputQuantitySum in analytics.ts; rendered in people/[personId]/page.tsx |
| PERF-02 | 04, 05 | Auditor scorecard: SLA-breach rate, decision count, turnaround | SATISFIED | slaBreachRateDecided in analytics.ts; rendered in people/[personId]/page.tsx |
| PERF-03 | 05 | OE activity log as read-only scorecard view | SATISFIED | office-engineers/[userId]/page.tsx reads Phase-7 getOfficeActivityLog; IDOR-closed |
| PERF-05 | 05 | Leaderboard ranked by selectable metric | SATISFIED | people/page.tsx sortBy + rank col; LeaderboardSortSelect component |
| PERF-06 | 01, 02, 03, 04, 06 | SLA/rejection/stalled alerts on Overview + configurable thresholds | SATISFIED | tenant_settings table/migration/actions; Overview alert logic; settings page + form + TopNav gear |

All 5 requirement IDs from phase frontmatter accounted for. REQUIREMENTS.md Phase mapping confirms all marked Complete for Phase 9.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No debt markers (TBD/FIXME/XXX) or stubs found in any Phase-9 modified file |

No TODO/HACK/PLACEHOLDER or hardcoded empty data patterns found in any artifact that flows to rendering. Rejection alert correctly suppressed when `isDateFiltered` is false (not a stub — intentional logic per Pitfall 4 from research).

---

### Human Verification Required

The following behaviors are observably wired in code but require a browser with authenticated session and live data to confirm rendering, interaction, and UX correctness.

#### 1. Worker and Auditor Scorecard Rendering

**Test:** Navigate to `/dashboard/people/[workerId]` for a worker and an auditor
**Expected:** Worker shows Output Volume + Approval Rate KPI cards; Auditor shows SLA-Breach-Rate KPI card with amber (warning) or red (destructive) valueColor depending on breach level
**Why human:** Conditional valueColor assignment and alertBadge rendering only observable in browser with real data

#### 2. Leaderboard Sort and Rank Column

**Test:** Navigate to `/dashboard/people`, use the LeaderboardSortSelect to cycle through worker and auditor sort metrics
**Expected:** List re-ranks with each selection; rank column shows ordinal position (1, 2, 3…); ties broken by displayName alphabetically; `sla_breach` auditor sort works
**Why human:** Client-side sort interaction requires browser; rank column is DOM output

#### 3. Office-Engineer Scorecard and IDOR Boundary

**Test:** Navigate to `/dashboard/analytics/office-engineers/[validUserId]`; also try a userId from a different tenant
**Expected:** Valid user: read-only activity log table with action types and timestamps; cross-tenant userId: 404 page
**Why human:** notFound() IDOR gate and activity table rendering require browser + live multi-tenant DB state

#### 4. Overview Alert Badges (Two-Condition Rule + Suppression)

**Test:** On Overview without date filter: observe pending-backlog and stalled-projects KPI cards; add a date filter and observe rejection card
**Expected:** Stalled Projects KPI badges red when >=1 stalled project; pending-backlog card amber/red per two-condition rule; rejection alert appears only when date filter is active and rate exceeds threshold
**Why human:** Alert badge rendering, color states, and date-filter suppression are browser-visible behaviors

#### 5. Settings Form and TopNav Gear

**Test:** Click the TopNav gear icon; submit valid threshold values; re-submit with auditSlaHours=0
**Expected:** Gear navigates to `/dashboard/settings`; valid submit persists and reflects on Overview; auditSlaHours=0 shows validation error
**Why human:** Form submission round-trip, TopNav icon visibility, and zod error display are browser-only

#### 6. TR/EN Localization of New Strings

**Test:** Toggle locale between TR and EN; visit scorecard, leaderboard, settings, and Overview pages
**Expected:** All new Phase-9 strings render in the active locale without fallback/key bleedthrough
**Why human:** i18n rendering requires browser locale switch

---

### Gaps Summary

No gaps found. All 13 must-have truths are VERIFIED against the codebase. All 5 requirement IDs (PERF-01/02/03/05/06) are satisfied by concrete implementation evidence. No debt markers. No stubs in the data path. The phase status is `human_needed` solely because 6 browser-observable behaviors (scorecard rendering, leaderboard interaction, IDOR 404, alert badge colors, settings form UX, TR/EN strings) cannot be verified by static analysis.

---

_Verified: 2026-05-27T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
