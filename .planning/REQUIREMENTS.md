# Requirements: bayrak.ai

**Defined:** 2026-05-23
**Core Value:** Every unit of field work flows through one trustworthy loop — worker submits → auditor approves on-site → central project data (BOQ + map) updates automatically.

## v1 Requirements

Requirements for the initial release. Each maps to roadmap phases.

### Auth & Identity

- [x] **AUTH-01**: Office Engineer can sign in to the dashboard via an email magic-link (Auth.js)
- [x] **AUTH-02**: Office Engineer can register a Worker by mapping their Telegram User ID to a name
- [x] **AUTH-03**: Office Engineer can register an Auditor by mapping their Telegram User ID to a name
- [x] **AUTH-04**: Office Engineer can assign workers and auditors to specific projects

### Project & BOQ Setup

- [x] **SETUP-01**: Office Engineer can create and edit a project
- [x] **SETUP-02**: Office Engineer can define Bill of Quantities line items (material, unit, contracted quantity) for a project
- [x] **SETUP-03**: Office Engineer can upload the project's pipeline route as a GeoJSON LineString
- [x] **SETUP-04**: Office Engineer can view the remaining balance per BOQ line item

### Worker Logging (Telegram bot)

- [x] **LOG-01**: Worker is identified by their Telegram User ID on `/start`; the bot greets them by role
- [x] **LOG-02**: Worker selects an active project from an inline keyboard of projects assigned to them
- [x] **LOG-03**: Worker selects which BOQ line item / material the work applies to (inline keyboard)
- [x] **LOG-04**: Worker uploads a photo; the bot rejects non-photo input and reprompts
- [x] **LOG-05**: Worker shares location via Telegram's native location feature; the bot rejects typed coordinates and reprompts
- [x] **LOG-06**: Worker enters a numeric quantity of material used; the bot rejects non-numeric input and reprompts
- [x] **LOG-07**: Worker can add optional free-text notes
- [x] **LOG-08**: On confirmation, the submission persists with `status: pending_audit`
- [x] **LOG-09**: The bot guides the worker sequentially and reprompts on any skipped or out-of-order step
- [x] **LOG-10**: A worker's in-progress multi-step submission is preserved reliably and never lost or duplicated across the bot's serverless invocations

### Audit Loop

- [x] **AUDIT-01**: When a worker confirms, every assigned auditor for that project receives a Telegram message with the photo, location/map link, selected BOQ item, quantity, and notes
- [x] **AUDIT-02**: The auditor message includes inline [✅ Approve] and [❌ Reject] buttons
- [x] **AUDIT-03**: Only an auditor assigned to that project can act on the buttons (authorization enforced server-side)
- [x] **AUDIT-04**: On Approve, the submission becomes `approved` and the selected BOQ line item decrements by the submitted quantity — atomically, with no double-deduction on duplicate callbacks
- [x] **AUDIT-05**: On Reject, the bot prompts the auditor for a text reason, sets `status: rejected`, and notifies the worker with the reason
- [x] **AUDIT-06**: With multiple auditors assigned, the first action wins; a later action on an already-decided submission is safely rejected and the auditor is told it is resolved

### Geospatial

- [x] **GEO-01**: A submission's shared lat/long is matched to the nearest segment of the project's pipeline route (PostGIS)
- [x] **GEO-02**: A submission located beyond a configured distance threshold from the route is flagged as a location anomaly

### Office Dashboard

- [x] **DASH-01**: Office Engineer sees the project's pipeline route rendered on a Mapbox map
- [x] **DASH-02**: Approved work logs render as point markers / colored segments overlaying the route
- [x] **DASH-03**: Office Engineer can view a list of submissions filterable by status (pending / approved / rejected)
- [x] **DASH-04**: Office Engineer sees live BOQ progress (contracted vs. remaining) per line item
- [x] **DASH-05**: The map and BOQ progress reflect approved submissions (refresh on load/focus)

### AI Assist (advisory)

- [ ] **AI-01**: On submission, AI vision analyzes the photo and flags anomalies (photo content inconsistent with the claimed work or location)
- [ ] **AI-02**: AI parses the worker's text notes to understand the work and auto-suggest the material / classification
- [ ] **AI-03**: AI flags (vision, location, text) appear in the auditor's Telegram message and on the dashboard as advisory hints; they never block or auto-decide
- [ ] **AI-04**: AI processing runs asynchronously and never delays the worker's confirmation or the auditor's notification
- [ ] **AI-05**: AI outputs are validated against a reference dataset with defined acceptance criteria before being shown to auditors (eval harness)

### Localization

- [x] **I18N-01**: The worker Telegram bot operates in Turkish
- [x] **I18N-02**: The office dashboard is switchable between Turkish and English

## v2.0 Requirements — Operations Intelligence & Hakkediş

Current milestone. Admin-grade performance + cost analytics, Turkish hakkediş billing, and a restructured dashboard. **Locked decisions:** hakkediş periods anchor on approval date (`decidedAt`); multi-currency supported; deduction rates (KDV / tevkifat / stopaj / teminat) are configurable per period, never hardcoded; money math runs in Postgres / decimal.js (never raw JS floats).

### Performance & Scorecards

- [ ] **PERF-01**: Admin can view a worker performance scorecard (submission volume, approval rate, rejection rate, location-compliance rate, output quantity, throughput) per project and across all projects
- [ ] **PERF-02**: Admin can view an auditor performance scorecard (decision count, approval/rejection split, mean decision turnaround `decidedAt − submittedAt`, pending backlog, SLA-breach rate)
- [x] **PERF-03**: Office-engineer actions (project create/edit, BOQ import, unit-price edits, person approval/assignment, hakkediş create/finalize) are recorded in an activity log and shown as an office-engineer activity scorecard
- [ ] **PERF-04**: Admin can open a per-employee profile page showing that person's metrics, an activity timeline, and (for workers) value contribution
- [ ] **PERF-05**: Admin can compare employees side-by-side in a leaderboard ranked by a chosen metric
- [ ] **PERF-06**: Admin sees performance & SLA alerts on the overview (audits slower than a threshold, rejection-rate spikes, location-warning spikes, stalled progress)

### Earned-Value Cost Analytics

- [x] **COST-01**: Office engineer can set a unit price (birim fiyat) and currency per BOQ line item (multi-currency; price nullable)
- [x] **COST-02**: System computes contracted value (BAC = Σ planned_qty × unit_price) and earned value (EV = Σ approved_qty × unit_price) per project and per BOQ item
- [x] **COST-03**: System shows % complete by value (EV / BAC) per project and per BOQ item
- [x] **COST-04**: System shows per-worker value contribution (Σ approved_qty × unit_price attributed to each worker)
- [x] **COST-05**: System shows rework / rejected value (Σ rejected_qty × unit_price) as a waste indicator

### Hakkediş / Billing

- [ ] **HAK-01**: Office engineer can create progress-payment periods (dönem) for a project with a cutoff date
- [ ] **HAK-02**: System computes per-period line items using cumulative (yeşil defter) quantities anchored on approval date: period qty = cumulative-to-cutoff − previous-period cumulative, with a locked unit-price snapshot
- [ ] **HAK-03**: System computes hakkediş deductions (KDV, KDV tevkifat, stopaj, teminat) using configurable per-period rates, producing gross and net payable
- [ ] **HAK-04**: Office engineer can track payment status per period (draft → submitted → paid)
- [ ] **HAK-05**: A finalized hakkediş period is locked as an immutable snapshot (quantities, prices, rates frozen)

### Exports

- [ ] **EXP-01**: Admin can export a submissions ledger to Excel using the canonical record shape, respecting active filters
- [ ] **EXP-02**: Admin can export BOQ / hakkediş progress to Excel in bilingual TR/EN yeşil-defter format
- [ ] **EXP-03**: Admin can export worker and auditor performance summaries to Excel
- [ ] **EXP-04**: Office engineer can export a finalized hakkediş certificate as a PDF with correct Turkish character rendering

### Experience & Information Architecture

- [ ] **UX-01**: Dashboard presents an admin shell with persistent navigation (Overview · Projects · People · Analytics · Hakkediş · Exports) without breaking existing project-scoped routes
- [ ] **UX-02**: Admin lands on a cross-project command-center overview (portfolio KPIs, alerts, recent activity)
- [ ] **UX-03**: All analytics views support global filters: date range, project, person, status
- [ ] **UX-04**: Analytics include trend charts (throughput, earned-value / value-complete over time, burn rate)
- [ ] **UX-05**: Every metric drills down to the underlying filtered records, and a structured submission detail view shows the full canonical record (photo, location, decision trail)
- [ ] **I18N-03**: All new v2.0 dashboard surfaces are localized TR/EN

## Future Requirements (post-v2.0)

Deferred. Tracked but not in the current roadmap.

### AI Assist (carried over from v1 Phase 6)

- **AI-01 … AI-05**: Async Claude vision anomaly flagging, notes classification, advisory dashboard/Telegram hints, eval-harness gate — listed under v1 Requirements above; Phase 6 deferred out of v2.0

### Drawings

- **CAD-01**: CAD/DWG viewer with manual pin-on-drawing mapping

### Forms

- **FORM-01**: H&S / legal / supplies form library (incident report, near-miss, toolbox talk, materials shortage)

### Platform

- **TEN-01**: Multi-tenant organization isolation (every domain row carries `tenant_id`)
- **AUDIT-V2-01**: Dedicated mobile-web auditor review view (richer than a Telegram message)
- **AUDIT-V2-02**: Per-segment auditor assignment (auditor scoped by chainage/segment)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| WhatsApp bot integration | Telegram is free, has free auth, and no per-message fees; explicit MVP exclusion |
| CAD symbol auto-detection / BOQ auto-extraction from drawings | Heavy ML, low MVP value (saha ADR-0002); manual BOQ entry instead |
| Real-time WebSocket map updates | Overkill for hourly field approvals; refresh-on-load is sufficient for v1 |
| Offline PWA for workers | Telegram's own message buffer handles momentary signal loss |
| Full EVM (SPI / CPI, schedule baseline, actual labor/material cost) | Inputs not captured — no schedule baseline, no actual-cost ledger; only EV/BAC/% are computable. Defer until cost-capture exists |
| Fiyat farkı (price-escalation) auto-calculation | Requires government index/coefficient APIs; a manual per-period override field is sufficient for v2.0 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| SETUP-01 | Phase 1 | Complete |
| SETUP-02 | Phase 1 | Complete |
| SETUP-03 | Phase 1 | Complete |
| SETUP-04 | Phase 1 | Complete |
| I18N-02 | Phase 1 | Complete |
| LOG-01 | Phase 2 | Complete |
| LOG-02 | Phase 2 | Complete |
| LOG-03 | Phase 2 | Complete |
| LOG-04 | Phase 2 | Complete |
| LOG-05 | Phase 2 | Complete |
| LOG-06 | Phase 2 | Complete |
| LOG-07 | Phase 2 | Complete |
| LOG-08 | Phase 2 | Complete |
| LOG-09 | Phase 2 | Complete |
| LOG-10 | Phase 2 | Complete |
| I18N-01 | Phase 2 | Complete |
| AUDIT-01 | Phase 3 | Complete |
| AUDIT-02 | Phase 3 | Complete |
| AUDIT-03 | Phase 3 | Complete |
| AUDIT-04 | Phase 3 | Complete |
| AUDIT-05 | Phase 3 | Complete |
| AUDIT-06 | Phase 3 | Complete |
| GEO-01 | Phase 4 | Complete |
| GEO-02 | Phase 4 | Complete |
| DASH-01 | Phase 5 | Complete |
| DASH-02 | Phase 5 | Complete |
| DASH-03 | Phase 5 | Complete |
| DASH-04 | Phase 5 | Complete |
| DASH-05 | Phase 5 | Complete |
| AI-01 | Phase 6 | Pending |
| AI-02 | Phase 6 | Pending |
| AI-03 | Phase 6 | Pending |
| AI-04 | Phase 6 | Pending |
| AI-05 | Phase 6 | Pending |
| COST-01 | Phase 7 | Complete |
| COST-02 | Phase 7 | Complete |
| COST-03 | Phase 7 | Complete |
| COST-04 | Phase 7 | Complete |
| COST-05 | Phase 7 | Complete |
| PERF-03 | Phase 7 | Complete |
| UX-01 | Phase 8 | Pending |
| UX-02 | Phase 8 | Pending |
| I18N-03 | Phase 8 | Pending |
| PERF-01 | Phase 9 | Pending |
| PERF-02 | Phase 9 | Pending |
| PERF-04 | Phase 9 | Pending |
| PERF-05 | Phase 9 | Pending |
| PERF-06 | Phase 9 | Pending |
| UX-03 | Phase 9 | Pending |
| UX-04 | Phase 9 | Pending |
| UX-05 | Phase 9 | Pending |
| HAK-01 | Phase 10 | Pending |
| HAK-02 | Phase 10 | Pending |
| HAK-03 | Phase 10 | Pending |
| HAK-04 | Phase 10 | Pending |
| HAK-05 | Phase 10 | Pending |
| EXP-01 | Phase 11 | Pending |
| EXP-02 | Phase 11 | Pending |
| EXP-03 | Phase 11 | Pending |
| EXP-04 | Phase 11 | Pending |

**Coverage:**
- v1 requirements: 38 total
- v1 mapped to phases: 38
- v2.0 requirements: 26 total
- v2.0 mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-23*
*Last updated: 2026-05-25 — v2.0 traceability populated (Phases 7–11, 26 requirements, 0 orphans)*
