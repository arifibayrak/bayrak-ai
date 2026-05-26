# Phase 8: Admin Shell & Information Architecture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 8-Admin Shell & Information Architecture
**Areas discussed:** Shell coverage, Active-worker definition, People directory scope, Person profile depth, Roadmap rescope, Overview filterability, Currency presentation, Records surface, Default filter state, Submission detail linking, Filter model, Charting library, Filter scope on People

---

## Shell coverage (sidebar on Projects too?)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — wrap everything | Sidebar in a layout covering /dashboard/projects/* too; routes unchanged, page files unmodified; satisfies SC1 | ✓ |
| No — new pages only | UI-SPEC default: sidebar only on new admin pages; clicking Projects leaves the shell | |

**User's choice:** Yes — wrap everything (→ D-64)
**Notes:** Overrides the UI-SPEC's "projects outside the (admin) group" assumption. Accepted tradeoff: ~240px less desktop content width; project-detail map must stay usable.

---

## "Active worker" KPI definition

| Option | Description | Selected |
|--------|-------------|----------|
| Submitted in last 30d | Distinct workers with >=1 submission in rolling 30d (Istanbul tz) | ✓ |
| Currently assigned | Distinct people with an active worker assignment | |
| Submitted ever | Any worker who ever submitted | |

**User's choice:** Submitted in last 30d (→ D-65)
**Notes:** Later reconciled to "submitted within the active filter range" once the Overview was made fully filterable (lifetime distinct submitters at the all-time default).

---

## People directory scope

| Option | Description | Selected |
|--------|-------------|----------|
| Approved people, aggregated | Approved `people` only, one cross-project row per person; office engineers + pending excluded | ✓ |
| Include pending too | Also surface pending_people with an awaiting-approval badge | |

**User's choice:** Approved people, aggregated (→ D-69)
**Notes:** Workers/Auditors tabs; a person can appear in both via assignments.roleOnProject.

---

## Person profile depth (Phase 8 vs Phase 9)

| Option | Description | Selected |
|--------|-------------|----------|
| Basic now, rich in Phase 9 | KPI cards + "Coming in Phase 9" placeholder (UI-SPEC assumption) | |
| Add activity timeline now | Build the per-person activity timeline in Phase 8 (pulls PERF-04 forward) | ✓ |

**User's choice:** Add activity timeline now → then "Grouped visual timeline + drill-through" (→ D-70)
**Notes:** Drill-through implies the submission detail page (UX-05), pulling more of Phase 9 in.

---

## Activity timeline shape

| Option | Description | Selected |
|--------|-------------|----------|
| Reverse-chron record list | Newest-first list, no drill-through | |
| Grouped visual timeline + drill-through | Date-grouped timeline linking to a full submission detail page | ✓ |

**User's choice:** Grouped visual timeline + drill-through (→ D-70, D-71)

---

## Phase 8/9 boundary — how much to pull forward

| Option | Description | Selected |
|--------|-------------|----------|
| P8: profile+timeline; P9: rest | Keep filters/charts/detail/drill-down in Phase 9 | |
| Pull more into P8 | Bring more Phase 9 work into Phase 8 | ✓ |

**User's choice:** Pull more into P8 → then selected Submission detail (UX-05), Metric drill-down (UX-05), Global filters (UX-03), Trend charts (UX-04) (→ D-71..D-76)
**Notes:** Claude pushed back on unbounded scope creep and asked for specifics; user chose a coherent bundle = the full experience layer.

---

## Roadmap rescope handling

| Option | Description | Selected |
|--------|-------------|----------|
| Re-draw the roadmap | Update Phase 8 goal/SC/req IDs + trim Phase 9; capture in CONTEXT, update ROADMAP via /gsd:phase | ✓ |
| Split into 8a / 8b | Keep original Phase 8, add inserted 8.1 for analytics layer | |
| Dial it back | Keep Phase 8 lean, leave items in Phase 9 | |

**User's choice:** Re-draw the roadmap (→ D-76)
**Notes:** Required because plan-checker + gsd-verifier check against ROADMAP success criteria.

---

## Overview filterability

| Option | Description | Selected |
|--------|-------------|----------|
| Filterable charts, fixed cards | Filter drives charts; KPI cards keep fixed semantics | |
| Fully filterable Overview | Filter re-scopes everything incl. recomputing KPI cards | ✓ |
| Fixed portfolio snapshot | No filter on Overview | |

**User's choice:** Fully filterable Overview (→ D-66)
**Notes:** Removes the hardcoded "(30d)" labels; pending backlog stays point-in-time.

---

## Currency presentation (cross-project EV/charts)

| Option | Description | Selected |
|--------|-------------|----------|
| Per-currency rows/series | Break out per currency | |
| Currency selector | Single toggle, default TRY, show selected only | ✓ |
| TRY only on portfolio | TRY figures only on portfolio | |

**User's choice:** Currency selector (→ D-67)

---

## Cross-project record list surface

| Option | Description | Selected |
|--------|-------------|----------|
| New /dashboard/records page | Dedicated cross-project filterable list, drill-only, rows → detail | ✓ |
| Reuse project Kayıtlar | Route drill-downs into the existing per-project tab | |

**User's choice:** New /dashboard/records page (→ D-74)

---

## Default filter date range

| Option | Description | Selected |
|--------|-------------|----------|
| Last 30 days | Rolling 30d (Istanbul tz) | |
| All time | Everything by default | ✓ |
| Current month | Calendar month-to-date | |

**User's choice:** All time (→ D-73)
**Notes:** Record lists paginated to bound query cost.

---

## Submission detail linking

| Option | Description | Selected |
|--------|-------------|----------|
| Link from all surfaces | One detail page linked from records, timeline, drill-down, AND existing Kayıtlar | ✓ |
| New surfaces only | Detail reachable only from new surfaces; Kayıtlar untouched | |

**User's choice:** Link from all surfaces (→ D-71, D-72)
**Notes:** Existing Kayıtlar rows gain a "details" link alongside the photo lightbox (additive, minor Phase 5 touch).

---

## Global filter model

| Option | Description | Selected |
|--------|-------------|----------|
| Shared URL state, persists | URL query params carry across navigation | ✓ |
| Per-page, resets on nav | Each page's filters reset on navigation | |

**User's choice:** Shared URL state, persists (→ D-73)

---

## Charting library

| Option | Description | Selected |
|--------|-------------|----------|
| shadcn chart (Recharts) | shadcn chart component, theme-token wired | |
| Recharts directly | Recharts without wrapper | |
| You decide | Defer to planner / UI-SPEC extension | ✓ |

**User's choice:** You decide (→ D-68, Claude's Discretion)

---

## Filter scope on People / profiles

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — scope People too | Global date/project filters scope People directory + profiles | ✓ |
| No — People stay lifetime | Directory/profiles always lifetime, all-project | |

**User's choice:** Yes — scope People too (→ D-75)
**Notes:** Requires extending getPersonMetrics with a date-range param (already has projectIds).

---

## Claude's Discretion

- Charting library (shadcn chart vs Recharts) — D-68.
- Submission detail route path (`/dashboard/records/[id]` vs `/dashboard/submissions/[id]`) — D-71.
- Filter-bar composition, chart series styling, pagination page size, currency-selector placement,
  and next-intl key organization for `dashboard.admin.*`.

## Deferred Ideas

- Phase 9 (after trim): PERF-01/02 full scorecards, PERF-05 leaderboard/compare, PERF-06 SLA alerts.
- AI anomaly flags on the detail page — Phase 6 (AI-01..05), deferred from v1.
- Hakkediş / Exports functionality — Phases 10 / 11 (Phase 8 ships stub pages only).
