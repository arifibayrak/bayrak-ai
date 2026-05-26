# Phase 9: Performance Scorecards, Leaderboard & Alerts - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the per-person metrics already computed in Phases 7–8 into **full role scorecards** (worker + auditor), a **ranked leaderboard** for side-by-side comparison, and **SLA / performance alerts** surfaced on the Overview — with admin-configurable alert thresholds.

**New scope this phase:** PERF-01 (worker scorecard), PERF-02 (auditor scorecard), PERF-05 (leaderboard), PERF-06 (SLA/performance alerts on Overview).

**Already shipped — do NOT rebuild:**
- **PERF-03** (office-engineer activity scorecard) — Phase 7, `office_activity_log` table + scorecard.
- **PERF-04** (per-employee profile page with metrics + activity timeline) — Phase 8, `/dashboard/people/[personId]`.

The roadmap Phase 9 section still lists PERF-03 and its SC3; PERF-03 is **Complete** in REQUIREMENTS.md (Phase 7). Phase 9 may surface/link the existing office-engineer scorecard for 3-role parity but must not re-implement it.
</domain>

<decisions>
## Implementation Decisions

### Scorecards (PERF-01 / PERF-02)
- **D-77 [recommended — Claude's Discretion]:** Implement the worker/auditor scorecard by **enriching the existing Phase-8 profile page** (`/dashboard/people/[personId]`) rather than building a separate scorecard view. The profile already renders most metrics via `getPersonMetrics` + `KpiCard`. (User said "you decide"; this is the lowest-build path that reuses existing surfaces.)
- **D-78:** PERF-01 worker scorecard metrics = submission volume, approval rate, rejection rate, location-compliance rate, **output quantity** (summed), and value contribution by currency — scoped **per-project and across all projects** via the existing FilterBar project scope (Phase-8 D-73). Most fields already in `getPersonMetrics`; add output-quantity sum / throughput where missing.
- **D-79:** PERF-02 auditor scorecard metrics = decision count, approval/rejection split, mean decision turnaround (`decidedAt − submittedAt`), pending backlog, and **SLA-breach rate**. SLA-breach rate = % of an auditor's decisions whose pending time exceeded the configurable audit-pending threshold (see D-84). Most fields already in `getPersonMetrics`; add SLA-breach rate.
- **D-80 [revised after research]:** Build a **minimal, read-only office-engineer scorecard view** in Phase 9 to genuinely deliver PERF-03 / roadmap SC3. Research found office engineers live in the `users` table (not `people`) and **no scorecard view exists** — only the Phase-7 `office_activity_log` data. The view = a list of an office engineer's logged actions (project create/edit, BOQ import, unit-price edits, person approval/assignment, hakkediş create/finalize) with timestamps, derived from `office_activity_log`, tenant-scoped + auth-guarded. (Supersedes the original "just link the existing scorecard" intent, whose premise — an existing view — proved false.) Reuse, don't rebuild, the Phase-7 `office_activity_log` data layer.

### Leaderboard (PERF-05)
- **D-81 [recommended — Claude's Discretion]:** Implement the leaderboard as a **sortable / ranked mode of the existing People directory** (reuse `getPortfolioPeople`), not a separate page. (User said "you decide".)
- **D-82:** **Separate Worker and Auditor leaderboards** (mirroring the directory's Workers/Auditors tabs), each with a user-selectable **"rank by" metric**. Default ranking: workers by approved-submission volume; auditors by mean decision turnaround (faster = better). Leaderboards respect the global filter (date-range / project) and the no-cross-currency rule for any value-based metric.

### Alert thresholds & SLA configuration (PERF-06 + PERF-02 SLA-breach)
- **D-83:** Thresholds are **admin-configurable** — add a new **tenant-scoped settings table** (schema migration) storing the alert thresholds, plus a settings UI to edit them. (Not hardcoded constants.)
- **D-84:** Seeded **default thresholds (Moderate)**: audit pending **> 48h** = SLA breach; rejection-rate alert when rate **> 30%**; project **stalled** = no approved submission in **7 days**.
- **D-85:** The rejection-rate alert fires on an **absolute rate** exceeding the configured threshold (in the active filter window) — **no** trailing-baseline / relative-spike comparison in v1. Single configurable percentage.
- **D-86:** The threshold settings UI lives on a **dedicated `/dashboard/settings` page** — **no new sidebar item** (the 6-item nav Overview·Projects·People·Analytics·Hakkediş·Exports is locked, Phase-8 D-74). Reachable via a gear/TopNav link or drill; exact entry point is planner's discretion.
- **D-89:** Threshold settings are **office-engineer-only and tenant-scoped**, consistent with the existing `auth()` guard + `WHERE tenant_id = ${tenantId}` pattern in all analytics functions.

### Alert presentation on Overview (PERF-06)
- **D-87:** Alerts surface as **inline badges / colors on the relevant Overview KPI cards** (e.g. the pending-audit-backlog card badges when audits breach the SLA threshold; the rejection card badges on a rejection-rate alert). **No** separate alert panel/banner.
- **D-88:** Add a new **"Stalled projects" KPI card** to the Overview KPI row (count of projects with no approved submission beyond the stalled threshold) — badges red when ≥1, and clicking it drills to the stalled projects. This is the home for SC5's stalled-project alert, which otherwise has no KPI card.

### Claude's Discretion
- Scorecard surface (D-77) and leaderboard surface (D-81) — recommendations above; planner may adjust based on the actual profile/directory structure.
- Exact `/dashboard/settings` entry point (gear icon vs TopNav link vs drill).
- Scorecard metric layout/grouping, leaderboard tie-breaking, and "rank by" metric list beyond the defaults.
- Whether the new settings table is a dedicated `tenant_settings` table or columns on the existing `tenants` table.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 9: Performance Scorecards, Leaderboard & Alerts" — goal + success criteria (note: SC3/PERF-03 already satisfied by Phase 7).
- `.planning/REQUIREMENTS.md` — PERF-01/02/05/06 (Pending) and the PERF-03/04 (Complete) traceability rows.

### Surfaces & data layer being extended (Phases 7–8)
- `src/actions/analytics.ts` — `getPersonMetrics` (worker+auditor scorecard metrics: rates, latency, backlog, value), `getPortfolioPeople` (bulk directory → leaderboard source), `getPortfolioKPIs` (Overview KPI counts → alert-badge source), `getCanonicalSubmissions`, `getAuditorDecisions`. All `auth()`-guarded + tenant-scoped; money math in Postgres; Istanbul-tz bucketing.
- `src/app/dashboard/(admin)/people/[personId]/page.tsx` — the profile page to enrich (PERF-01/02 scorecards).
- `src/app/dashboard/(admin)/people/page.tsx` — the People directory to extend with ranking (PERF-05).
- `src/app/dashboard/(admin)/overview/page.tsx` — the Overview to add alert badges + the "Stalled projects" KPI card (PERF-06).
- `src/components/admin/KpiCard.tsx`, `FilterBar.tsx`, `CurrencySelector.tsx` — reusable building blocks.
- `.planning/phases/08-admin-shell-information-architecture/08-CONTEXT.md` — Phase-8 locked decisions (D-64 shell, D-69 directory scope, D-73 URL filters, D-74 6-item nav) that constrain this phase.

### Schema (new settings table + existing tables to read)
- `src/db/schema/tenants.ts` — tenant table; candidate home for tenant-scoped threshold settings (or a new `tenant_settings` table).
- `src/db/schema/office-activity-log.ts` — PERF-03 office-engineer scorecard source (do not rebuild).
- `src/db/schema/submissions.ts` — submission status / decidedAt / submittedAt for turnaround + SLA computations.
- ⚠ **Migration constraint:** project decision **D-49 — `drizzle-kit push` is unusable**; the new settings table requires a generated migration applied the project's established way (NOT `drizzle-kit push`). Researcher must confirm the working migration path before planning.

### Project conventions
- `CLAUDE.md` — stack, money-in-Postgres, Istanbul tz, next-intl TR/EN (all new labels need keys in `messages/en.json` + `messages/tr.json`), shadcn via `node_modules/.bin/shadcn add` (NOT `npx shadcn@latest add` — known broken, Phase-8 finding).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getPersonMetrics(personId, {projectIds, dateRange})`: already returns worker volume, approvalRate, rejectionRate, locationComplianceRate, valueContributedByCurrency, and (auditor) avgDecisionLatencyHours + pendingBacklogCount — covers most of PERF-01/02. Add: worker output-quantity sum/throughput; auditor SLA-breach rate.
- `getPortfolioPeople({role, dateRange, projectIds})`: single bulk query returning `PortfolioWorker[]` / `PortfolioAuditor[]` — the leaderboard data source (no N+1).
- `getPortfolioKPIs(filters)`: Overview counts (pendingBacklog, approvals/rejections) — feeds the inline alert badges; pendingBacklog is point-in-time (D-66).
- `KpiCard`, `FilterBar` (URL params: date/project/person/status), `CurrencySelector` — Overview/profile components ready to reuse.

### Established Patterns
- All analytics functions: `auth()` guard + `WHERE tenant_id = ${tenantId}` first; Drizzle `sql\`\`` bound params (CR-03); money via `SUM(::numeric)` grouped by currency, returned as strings; latency via `FILTER (WHERE decided_at IS NOT NULL)`.
- Pages: `export const dynamic = 'force-dynamic'`, read `searchParams`, `Promise.all` parallel fetch, pass serialized data to client components; `useSearchParams()` clients wrapped in `<Suspense>`.
- i18n: `getTranslations` (RSC) / `useTranslations` (client); every new label keyed in both `en.json` + `tr.json`.

### Integration Points
- New `tenant_settings` (or tenant columns) → read by the alert-computation function(s) in `analytics.ts` and the Overview page; written by the `/dashboard/settings` form (office-engineer, tenant-scoped).
- Overview KPI row gains a "Stalled projects" card + inline alert badges driven by the configured thresholds.
- People directory gains ranking/sort; profile page gains the missing scorecard metrics.
</code_context>

<specifics>
## Specific Ideas

- Default thresholds are "Moderate": 48h audit-pending SLA, 30% absolute rejection-rate alert, 7-day stalled-project window.
- Leaderboard defaults: workers ranked by approved-submission volume; auditors by mean turnaround (faster is better).
- Alerts are stateless inline badges (no dismissal/acknowledgement in v1).
</specifics>

<deferred>
## Deferred Ideas

- **Relative / trailing-baseline rejection-spike detection** — v1 uses an absolute rejection-rate threshold (D-85); baseline-relative spike detection is a future enhancement.
- **Per-role / per-project threshold overrides** — v1 thresholds are tenant-wide; granular overrides deferred.
- **Alert dismissal / acknowledgement / history** — inline badges are stateless in v1; an alerts inbox/ack workflow is a future phase.
- **Office-engineer scorecard rebuild** — out of scope; PERF-03 already shipped in Phase 7 (only linked for parity).
- Unrelated tracked todo `submission-detail-map-link.md` (Phase-8 follow-up) — not part of Phase 9.

</deferred>

---

*Phase: 09-performance-scorecards-leaderboard-alerts*
*Context gathered: 2026-05-27*
