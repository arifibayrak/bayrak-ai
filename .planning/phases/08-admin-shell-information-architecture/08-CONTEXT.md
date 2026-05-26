# Phase 8: Admin Shell & Information Architecture - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning — BUT see "Required Before Planning" below (roadmap re-draw + UI-SPEC re-run)

<domain>
## Phase Boundary

**⚠ This phase was deliberately rescoped during discussion.** It is no longer just
the navigation shell — it now delivers the **entire admin experience layer** of the
v2.0 dashboard.

Phase 8 delivers, as a read-only navigation + display layer over Phases 1–7 data:

1. **Admin shell** — a persistent sidebar (Overview · Projects · People · Analytics ·
   Hakkediş · Exports) visible on **all** dashboard pages including the existing
   `/dashboard/projects/*`; `/dashboard` → `/dashboard/overview` redirect.
2. **Overview command center** — portfolio KPIs (pending backlog, approvals, rejections,
   EV vs BAC, active workers) + trend charts, **fully filterable**.
3. **People directory** — cross-project, approved-people-only list (Workers/Auditors tabs).
4. **Person profile + activity timeline** — KPI cards + a grouped visual timeline with
   drill-through (partial PERF-04, pulled forward).
5. **Submission detail page (UX-05)** — full canonical-record view, the drill-through target.
6. **Global filters (UX-03)** — date-range / project / person / status, URL-persisted,
   applied across Overview + People + records.
7. **Metric drill-down (UX-05)** — every metric → underlying filtered record list
   (new `/dashboard/records` cross-project list).
8. **Full TR/EN i18n** for every new surface (I18N-03).

**Requirements in scope (post-rescope):** UX-01, UX-02, UX-03, UX-04, UX-05, PERF-04, I18N-03.
(Originally only UX-01, UX-02, I18N-03 — UX-03/04/05 + PERF-04 were pulled forward from Phase 9.)

**NOT this phase (remains Phase 9 after the trim):**
- PERF-01 worker scorecard / PERF-02 auditor scorecard (full scorecard surfaces beyond the
  profile KPI cards)
- PERF-05 leaderboard / side-by-side compare
- PERF-06 SLA / performance alerts on the Overview
- AI anomaly flags on the submission detail page — Phase 6 deferred (AI-01..05); leave a slot,
  do not implement.

</domain>

<decisions>
## Implementation Decisions

> Decision IDs continue the project sequence (Phase 5 ended at D-63).

### Shell coverage (UX-01)
- **D-64:** The persistent sidebar wraps **all** dashboard pages, including the existing
  `/dashboard/projects` and `/dashboard/projects/[id]`. **Routes are NOT renamed and existing
  project page files are NOT modified** — they inherit a new shared parent layout that renders
  the sidebar. The "Projects" sidebar item highlights as active on project routes.
  **This OVERRIDES the 08-UI-SPEC.md assumption** that the sidebar lives only inside the
  `(admin)` route group with `/dashboard/projects/*` left outside the shell.
  - Implementation latitude (planner): cleanest is to render the sidebar at the
    `dashboard/layout.tsx` level (wrapping TopNav's children) so both projects and admin pages
    get it without moving routes — rather than nesting projects inside `(admin)`.
  - Honors the locked ROADMAP rule "(admin) additive only — no existing routes moved/renamed"
    (a layout is added; routes and page files are untouched).
  - Tradeoff accepted: desktop content loses ~240px to the sidebar; the project-detail map must
    stay usable (already mobile-responsive per Phase 5 D-60).

### Overview KPIs & filterability (UX-02, UX-03)
- **D-65:** **"Active worker" = distinct workers who submitted ≥1 work log within the active
  filter range** (Istanbul tz). With the default all-time range this is lifetime distinct
  submitters. (Reconciled away from a fixed rolling-30-day definition once the Overview became
  fully filterable.) Needs a new portfolio-KPI query (no existing function returns this).
- **D-66:** The **Overview is fully filterable** — the global filter bar re-scopes everything on
  the page, **including recomputing the KPI cards within the selected date range**. Consequences:
  - The hardcoded "(30 gün)/(30d)" KPI labels and the "30-day portfolio summary" subtitle in the
    UI-SPEC are **removed** — labels reflect the active range (e.g. "seçili dönem" / selected range).
  - **Pending backlog** stays a point-in-time count of `status='pending_audit'` (optionally
    scoped by `submitted_at` within range — planner detail), not a range delta.
  - Approvals / rejections = counts within the active range; active workers per D-65.
- **D-67:** **Currency selector** (default **TRY**) governs all money displays on Overview /
  analytics. KPIs and charts show the selected currency only; the per-currency EV breakout from
  the UI-SPEC collapses to the selected currency. Projects with no data in the selected currency
  show "—". Honors the no-cross-currency-sum lock (each currency is still aggregated separately
  in Postgres; the selector just picks which to display).

### Trend charts (UX-04)
- **D-68:** Overview carries trend charts — throughput over time, earned-value progression,
  rejection-rate trend — as client components fed server-prefetched data (XTab/XTabClient split).
  Charts respect the global filter + currency selector. Charting library is **Claude's discretion**
  during the UI-SPEC extension (see Claude's Discretion below).

### People directory (PERF-04 partial)
- **D-69:** The People directory (`/dashboard/people`) lists **approved `people` only**, **one
  cross-project aggregated row per person**. Workers tab + Auditors tab; a person who is a worker
  on one project and auditor on another **appears in both tabs** (driven by `assignments.roleOnProject`).
  **Office engineers are excluded** (they are auth `users`, not `people`; their activity scorecard
  is Phase 9 / PERF-03 already done in Phase 7). **`pending_people` are excluded** (they stay in the
  project-scoped approval flow). Metrics come from `getPersonMetrics()` aggregated across projects.

### Person profile + timeline (PERF-04)
- **D-70:** The profile page (`/dashboard/people/[personId]`) delivers **PERF-04 in full now**:
  KPI stat cards (from `getPersonMetrics`) + a **grouped visual activity timeline with
  drill-through** to the submission detail page.
  - Worker timeline = their **submission history**; auditor timeline = their **decision history**
    (`submissions WHERE decided_by = personId`). **NOT** `office_activity_log` (office-engineer only).
  - Data: `getCanonicalSubmissions({ personId })` for worker history + a decided-by query for
    auditor history.

### Submission detail page (UX-05)
- **D-71:** A **single canonical submission detail page** (likely `/dashboard/records/[id]` —
  exact path is planner discretion) shows the full canonical record: photo (reuse the Phase 5
  `next/image` + shadcn Dialog lightbox, D-61), location (snapped point / Google Maps link),
  BOQ item, quantity, status, auditor decision + rejection reason, location flag/distance.
  Leave an **empty slot for AI flags** (Phase 6 deferred — do not implement).
- **D-72:** **All** submission references link to this one detail page — the new `/dashboard/records`
  list, the profile timeline, metric drill-downs, **and the existing project "Kayıtlar" tab rows**
  (rows gain a "details" link **alongside** the existing photo lightbox — minor additive touch to the
  Phase 5 component, lightbox behavior preserved).

### Global filters & cross-project records (UX-03, UX-05)
- **D-73:** **Global filters** = date-range / project / person / status, stored in **URL query
  params** and **persisted across navigation** (links propagate the params). The filter bar sits
  at the top of each filterable page's content area (Overview, People, records) — not a single
  shell-global sticky bar (not every page filters). **Default date range = all time** (no date
  bound); record lists are paginated to bound cost.
- **D-74:** A **new `/dashboard/records` page** is the cross-project, filterable canonical-record
  list — the drill-down target for metrics. It is **drill-only / reachable via filters** (NO new
  sidebar item — the 6-item nav is unchanged). Rows link to the detail page (D-71). The existing
  per-project "Kayıtlar" tab stays as the project-scoped view.
- **D-75:** The global **date-range + project filters also scope the People directory and person
  profiles**. Requires **extending `getPersonMetrics` with a date-range parameter** (it already
  accepts `projectIds`). Consistent global filter model on every surface.

### Roadmap rescope (governance)
- **D-76:** Phase 8 absorbs **UX-03, UX-04, UX-05, PERF-04** from Phase 9. Phase 9 is trimmed to
  **PERF-01, PERF-02, PERF-05, PERF-06**. The ROADMAP Phase 8 goal + success criteria and the
  REQUIREMENTS.md traceability table **MUST be updated via `/gsd:phase`** before planning, so the
  plan-checker and gsd-verifier (which check against ROADMAP success criteria) stay coherent.
  Chosen handling = re-draw the roadmap (not split into 8a/8b, not dial back).

### Claude's Discretion
- **Charting library** for D-68 (shadcn `chart` component — Recharts-based, theme-token wired — is
  the likely best fit on base-nova; Recharts direct is the ROADMAP-named fallback). Decide during
  the UI-SPEC extension.
- Submission detail **route path** (`/dashboard/records/[id]` vs `/dashboard/submissions/[id]`).
- Exact filter-bar component composition, chart series styling, pagination page size, and
  next-intl key organization for the new `dashboard.admin.*` namespaces.
- Whether the currency selector is global (one control) or per-section — keep it simple, default TRY.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition & requirements (note: being re-drawn per D-76)
- `.planning/ROADMAP.md` §"Phase 8: Admin Shell & Information Architecture" — goal + success
  criteria. **Will be updated (D-76)** to add UX-03/04/05 + PERF-04. Also §"Phase 9" (trimmed) and
  §"Milestone v2.0 — Locked decisions carried into all phases".
- `.planning/REQUIREMENTS.md` — UX-01, UX-02, UX-03, UX-04, UX-05, PERF-04, I18N-03 (and the
  traceability table, updated per D-76). Note Phase 9 = PERF-01/02/05/06 after trim.
- `.planning/PROJECT.md` — product vision; v2.0 milestone target features and locked decisions.

### Design contract (MUST read; needs extension per D-76)
- `.planning/phases/08-admin-shell-information-architecture/08-UI-SPEC.md` — the existing UI design
  contract. **Currently covers only shell + Overview (fixed 30d) + basic People.** It is now stale
  vs the rescope and D-64/D-66/D-67/D-70..D-75. **Re-run `/gsd:ui-phase 8` to extend it** before
  planning (filters, charts, records page, detail page, profile timeline, currency selector,
  filterable KPI labels, shell-wraps-projects).

### Existing data layer (reuse — do not rebuild)
- `src/actions/analytics.ts` — `getCanonicalSubmissions`, `getProjectMetrics`, `getPersonMetrics`
  (extend with date range per D-75), `getPortfolioOverview`, `getOfficeActivityLog` + types
  (`ProjectSummary`, `PersonMetrics`, `ProjectMetrics`, `ActivityLogEntry`). All auth-guarded,
  tenant-scoped, currency-grouped, money-in-Postgres. A **new portfolio-KPI query** is needed for
  the Overview cards (pending backlog, approvals/rejections-in-range, active workers per D-65).
- `src/lib/types.ts` — `CanonicalSubmission` shape (the detail page + records list render this).

### Prior-phase patterns to honor
- `.planning/phases/05-dashboard-map/05-CONTEXT.md` — D-49 (XTab/XTabClient + URL-state tabs),
  D-55 (dynamic RSC + RefreshOnFocus), D-58 (color-blind-safe palette + legend), D-61
  (`next/image` thumbnail → shadcn Dialog lightbox; Vercel Blob in `images.remotePatterns`),
  D-63 (full next-intl TR/EN), D-60 (genuinely mobile-responsive). Google Maps link pattern.
- `.planning/STATE.md` §Accumulated Context — v2.0 locked decisions: force-dynamic on all new
  pages, Istanbul tz date boundaries, role-on-assignments, NULL `decidedAt` split-query rule,
  money math in Postgres/decimal.js.

### Schema (data shapes the surfaces read)
- `src/db/schema/people.ts`, `assignments.ts` (roleOnProject worker|auditor, per project),
  `pending-people.ts` (excluded from directory), `submissions.ts`, `boq-items.ts` (unit_price +
  currency_code), `office-activity-log.ts` (office engineers only — NOT person timelines).

### Integration points (shell)
- `src/app/dashboard/layout.tsx` — auth guard + TopNav + `max-w-5xl` content; the sidebar likely
  mounts here (D-64).
- `src/components/layout/TopNav.tsx` — gets the mobile `<SidebarTrigger>` hamburger (UI-SPEC).
- `messages/en.json`, `messages/tr.json` — add `dashboard.admin.*` namespace (I18N-03).

### Stack reference
- `CLAUDE.md` — locked stack (next-intl 4.x, shadcn/ui base-nova, Tailwind 4, Drizzle, Neon).
  Charting library is NOT yet in the stack (new dependency — D-68).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/actions/analytics.ts`** — the entire typed aggregation layer already exists (Phase 7).
  Reuse for Overview EV/BAC, People metrics, records list, profile, detail. Two gaps to add:
  (1) a portfolio-KPI function (pending backlog / in-range approvals+rejections / active workers),
  (2) a date-range param on `getPersonMetrics` (D-75).
- **Phase 5 dashboard components** — XTab/XTabClient server-fetch split, shadcn `Table`/`Tabs`/
  `Dialog`, `next/image` lightbox (D-61), `RefreshOnFocus` (D-55), Google Maps link, color-blind
  palette + legend (D-58). The records list + detail page reuse these idioms directly.
- **`src/app/dashboard/layout.tsx`** — shell host; already provides auth guard + TopNav.
- **next-intl `getTranslations` (server) / `useTranslations` (client) + locale cookie toggle.**

### Established Patterns
- **Dynamic Server Components** (`export const dynamic = 'force-dynamic'`) on every new page —
  financial/operational data is never statically cached (v2.0 lock).
- **Currency-grouped money maps** (`Record<currencyCode, string>`); decimal.js for JS display;
  never cross-currency sum. The currency selector (D-67) picks which key to show.
- **Istanbul timezone** for all date boundaries in filters (v2.0 lock).
- **URL-state for view config** — Phase 5 used `?tab=`; Phase 8 extends to `?from=&to=&project=
  &person=&status=` (D-73), persisted across nav.
- **shadcn components added via CLI** (sidebar is new — `npx shadcn@latest add sidebar`; chart
  likely new too); `--sidebar-*` tokens already in globals.css.

### Integration Points
- **Input:** `submissions` (+ Phase 3/4 columns), `boq_items` (unit_price/currency), `people`,
  `assignments`, `projects` — all via `analytics.ts` functions (auth + tenant scoped).
- **Shell wraps existing routes** (D-64) — sidebar layout must not modify project page files.
- **Existing Kayıtlar tab** gains an additive "details" link to the new detail page (D-72).
- **New surfaces:** `/dashboard/overview`, `/dashboard/people`, `/dashboard/people/[personId]`,
  `/dashboard/records`, `/dashboard/records/[id]` (or `/submissions/[id]`), and stub pages
  `/dashboard/analytics`, `/dashboard/hakedis`, `/dashboard/exports`.

</code_context>

<specifics>
## Specific Ideas

- Sidebar persists on Projects pages too; "Projects" highlights as active there (D-64).
- KPI card labels are range-aware, not "(30 gün)" hardcoded; pending backlog is point-in-time (D-66).
- Currency selector defaults to TRY; one figure/line per selected currency (D-67).
- People directory: approved people only, Workers/Auditors tabs, a person can be in both (D-69).
- Profile activity timeline: worker = submissions, auditor = decisions; drill-through to detail (D-70).
- One canonical submission detail page, linked from records list, timeline, drill-down, AND the
  existing Kayıtlar rows (D-71/D-72).
- Filters live in URL query params, persist across navigation, default all-time (D-73).
- `/dashboard/records` is drill-only (no 7th sidebar item) (D-74).
- Stub pages for Analytics/Hakkediş/Exports keep those nav items from 404-ing (UI-SPEC).

</specifics>

<deferred>
## Deferred Ideas

Remains in **Phase 9** after the D-76 trim:
- **PERF-01 / PERF-02** — full worker & auditor scorecard surfaces (beyond the profile KPI cards).
- **PERF-05** — leaderboard / side-by-side employee comparison.
- **PERF-06** — SLA / performance alerts on the Overview (pending > threshold, rejection spikes,
  stalled projects).

Deferred to other milestones / phases:
- **AI anomaly flags** on the submission detail page — Phase 6 (AI-01..05), deferred from v1.
  Phase 8 leaves a slot only.
- **Hakkediş / Exports** real functionality — Phases 10 / 11 (Phase 8 ships reachable stub pages).

### Reviewed Todos (not folded)
None — STATE.md "Pending Todos: None yet."

</deferred>

---

## Required Before Planning (do these first)

1. **Re-draw the roadmap (D-76)** — `/gsd:phase` to update Phase 8 goal + success criteria +
   requirement IDs (add UX-03/04/05, PERF-04) and trim Phase 9 to PERF-01/02/05/06; update the
   REQUIREMENTS.md traceability table accordingly.
2. **Extend the UI design contract** — re-run `/gsd:ui-phase 8` (Update mode) so 08-UI-SPEC.md
   covers the new surfaces (shell-wraps-projects, filterable range-aware KPI cards, currency
   selector, trend charts, People directory + profile timeline, submission detail page, global
   filter bar, `/dashboard/records`).
3. Then `/gsd:plan-phase 8`.

---

*Phase: 8-Admin Shell & Information Architecture*
*Context gathered: 2026-05-26*
