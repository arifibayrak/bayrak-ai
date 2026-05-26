# Phase 9: Performance Scorecards, Leaderboard & Alerts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-27
**Phase:** 09-performance-scorecards-leaderboard-alerts
**Areas discussed:** Scorecards, Leaderboard, SLA/alert thresholds, Alert presentation

---

## Scorecard surface & 3-role parity (PERF-01/02)

| Option | Description | Selected |
|--------|-------------|----------|
| Enrich the existing profile page | Extend `/dashboard/people/[personId]` with missing scorecard metrics; reuse getPersonMetrics + KpiCard | |
| Dedicated scorecard view per role | Separate scorecard page/component distinct from the profile | |
| You decide | Let the planner choose | ✓ |

**User's choice:** You decide → Claude's discretion (recommendation recorded: enrich the existing profile page, D-77).
**Notes:** getPersonMetrics already returns most worker+auditor metrics; profile page already renders them.

---

## Leaderboard design (PERF-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Sortable/ranked mode of People directory | Add sorting + rank numbers + rank-by selector to existing directory | |
| Dedicated leaderboard page | Distinct route with podium/top-N styling | |
| You decide | Let the planner choose the surface | ✓ |

**User's choice:** You decide (surface) → Claude's discretion (recommendation: sortable mode of People directory, D-81). Ranking content decided separately below.

---

## Leaderboard ranking & role split (PERF-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Separate Worker & Auditor boards, user-picked metric | Two boards mirroring directory tabs; default workers by approved volume, auditors by turnaround; rank-by selector | ✓ |
| Single unified board | One ranked list mixing workers + auditors | |
| You decide | Planner chooses | |

**User's choice:** Separate Worker & Auditor boards, user-picked metric (D-82).

---

## SLA / alert thresholds — configurability (PERF-06 + PERF-02 SLA-breach)

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded sensible defaults | Threshold constants in code; changing requires a deploy | |
| Admin-configurable (new settings table + UI) | Tenant settings table + settings form for self-serve tuning | ✓ |
| You decide | Planner chooses | |

**User's choice:** Admin-configurable — new tenant settings table + settings UI (D-83).

---

## Default threshold values (PERF-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Moderate | 48h audit-pending · >30% rejection · 7-day stalled | ✓ |
| Strict | 24h · >20% · 3-day stalled | |
| Let me specify exact values | User types exact numbers | |

**User's choice:** Moderate defaults (D-84).

---

## Settings UI placement (PERF-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Settings sub-page under Analytics | Thresholds form under the Analytics section | |
| Dedicated /dashboard/settings page | Standalone settings route, no new sidebar item | ✓ |
| You decide | Planner chooses | |

**User's choice:** Dedicated `/dashboard/settings` page (D-86). Sidebar stays 6 items (Phase-8 D-74).

---

## Rejection-rate alert semantics (PERF-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Absolute threshold | Alert when rejection rate exceeds configured % in active window | ✓ |
| Relative spike vs trailing baseline | Alert when current rate is X% above a trailing baseline | |
| You decide | Planner chooses | |

**User's choice:** Absolute threshold for v1 (D-85). Baseline-relative spike deferred.

---

## Alert presentation on Overview (PERF-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Alert card/list at top of Overview + drill-through | Dedicated alerts panel above KPIs with severity + drill | |
| Inline badges on existing KPI cards | Warning badges/colors on relevant KPI cards | ✓ |
| You decide | Planner chooses | |

**User's choice:** Inline badges on existing KPI cards (D-87).

---

## Stalled-project alert home (PERF-06 / SC5)

| Option | Description | Selected |
|--------|-------------|----------|
| Add a "Stalled projects" KPI card | New Overview count card that badges red and drills to stalled projects | ✓ |
| Small alerts strip for non-card alerts only | Hybrid strip for alerts with no card home | |
| You decide | Planner chooses | |

**User's choice:** Add a "Stalled projects" KPI card (D-88).

---

## Claude's Discretion

- Scorecard surface (D-77) — recommended: enrich the existing profile page.
- Leaderboard surface (D-81) — recommended: sortable mode of People directory.
- Office-engineer scorecard parity (D-80) — link existing PERF-03 scorecard, don't rebuild.
- Exact `/dashboard/settings` entry point; settings stored as a new table vs columns on `tenants`.
- Scorecard metric layout/grouping; leaderboard tie-breaking; full "rank by" metric list.

## Deferred Ideas

- Relative/trailing-baseline rejection-spike detection (v1 = absolute threshold).
- Per-role / per-project threshold overrides (v1 = tenant-wide).
- Alert dismissal / acknowledgement / history (v1 = stateless inline badges).
- Office-engineer scorecard rebuild (PERF-03 already shipped Phase 7).
