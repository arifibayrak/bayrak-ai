# Roadmap: bayrak.ai

## Overview

bayrak.ai is built in six phases ordered by hard dependency chains. The data model and office scaffold come first — projects, BOQ items, and worker assignments must exist before any bot conversation can function. The worker bot arrives in Phase 2, delivering the submission flow and durable conversation state. Phase 3 closes the audit loop (approve/reject with atomic BOQ deduction), completing the minimum viable core loop. Phase 4 wires PostGIS spatial matching into the submission and approval paths, giving every approved point a snapped location on the route. Phase 5 surfaces that data in the office dashboard: a live Mapbox map and a BOQ progress view. Phase 6 adds the AI vision assist layer — advisory only, gated behind an eval harness — capping the v1 feature set.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Database schema, Next.js scaffold, Auth.js magic-link login, and office CRUD for projects/BOQ/assignments
- [x] **Phase 2: Worker Bot** - grammY conversation state machine (States 0–6) with durable Postgres sessions, input enforcement, and submission persistence (completed 2026-05-24)
- [x] **Phase 3: Audit Loop** - Auditor notification, Approve/Reject handling, atomic BOQ deduction, race-safe idempotency, and worker rejection notification (completed 2026-05-24)
- [x] **Phase 4: Spatial Layer** - PostGIS nearest-segment matching, location proximity warning, and `approved_points` population (completed 2026-05-24)
- [x] **Phase 5: Dashboard & Map** - Mapbox route and approved-points overlay, BOQ progress view, and submission list with status filtering (completed 2026-05-24)
- [ ] **Phase 6: AI Vision Assist** - Async Claude vision analysis, eval harness gate, anomaly badges on dashboard and advisory Telegram follow-up

---

## Milestone v2.0 — Operations Intelligence & Hakkediş

Turn raw submission/audit data into an admin-grade operations console: role-based performance scorecards, earned-value cost analytics, and hakkediş billing documents, delivered through a restructured drill-down dashboard with standardized records and Excel/PDF export.

**Locked decisions carried into all phases:**
- Hakkediş periods anchor on approval date (`decidedAt`); cumulative yeşil-defter model (period qty = cumulative − previous)
- Multi-currency: `unit_price` carries a `currency_code` column; aggregates are currency-aware
- Deduction rates (KDV / tevkifat / stopaj / teminat) are configurable per period, never hardcoded
- Money math in Postgres `numeric` aggregation and `decimal.js` for JS-side display; never raw JS float arithmetic
- All aggregation in typed TS query functions via `db.execute(sql...)` — no materialized views (neon-http cannot refresh them)
- Additive IA via `(admin)` route group; existing `/dashboard/projects/*` routes are preserved unchanged
- Every new `route.ts` (export/analytics APIs) must carry an explicit `auth()` guard as its first statement (financial data)

- [x] **Phase 7: Data Foundation & Canonical Record** - Add `unit_price` + currency to BOQ items, create activity-log and hakkediş schema tables, define the CanonicalSubmission type, build the typed aggregation query layer, and wire activity logging into existing Server Actions (completed 2026-05-26)
- [x] **Phase 8: Admin Shell & Information Architecture** - Build the `(admin)` route group with persistent sidebar nav (Overview · Projects · People · Analytics · Hakkediş · Exports), cross-project Overview command-center page, and all TR/EN i18n strings for new surfaces (completed 2026-05-26)
- [x] **Phase 9: Performance Analytics & Scorecards** - Worker/auditor/office-engineer scorecards, global date-range and project/person filters, trend charts, drill-down submission detail page, per-employee profile pages, leaderboard, and SLA alerts (completed 2026-05-27)
- [x] **Phase 10: Hakkediş Billing** - Hakkediş period CRUD, yeşil-defter computation (cumulative−previous period delta), configurable KDV/tevkifat/stopaj/teminat deductions, payment status tracking, and finalization lock (completed 2026-05-28)
- [x] **Phase 11: Exports** - Multi-sheet bilingual Excel exports (submission ledger, BOQ/hakkediş yeşil defter, performance summaries), PDF hakkediş certificate with Turkish font rendering, and authenticated route handlers with Exports trigger UI (completed 2026-05-28)

---

## Milestone v3.0 — Submission-Driven Hakkediş & UX Brand Pass

Close two outstanding gaps surfaced at the end of v2.0: (1) connect the worker-submission loop directly to the hakkediş artefact so the office sees billing grow with each approved submission, not only at period rollup; (2) bring every dashboard surface in line with the bayrak.ai brand so the product looks as deliberate as it works.

**Locked decisions carried into all v3.0 phases:**
- Submission-driven hakkediş is **additive** to the existing period-finalization flow — must never break the v2.0 yeşil-defter cumulative model, the configurable deduction chain, or the immutable-snapshot guarantee
- Brand pass is **restyling-only** on shipped surfaces — no functional regression to v1/v2 capabilities; new shared brand primitives so future phases inherit the brand language by default
- Approved Telegram submissions are the only trigger for submission-driven hakkediş contribution — manual entries / Excel imports stay routed through the existing period flow

- [x] **Phase 12: Submission-Driven Hakkediş** - Each approved Telegram work-application submission contributes to the in-progress hakkediş period in real time with full traceability back to the source submission(s), without breaking the existing v2.0 period-rollup model (completed 2026-05-28)
- [x] **Phase 13: UX & Brand Pass** - Check in the bayrak.ai brand reference, build shared brand component primitives, re-skin every existing dashboard surface so the product looks as deliberate as it works (completed 2026-05-29)

---

## Milestone v4.0 — Document-Driven Route Import, Chainage As-Built Tracking & AI Vision Assist

Turn the imported pipeline drawing into a living chainage-based as-built record — the office can see, for any kilometre of the route, what work happened, who did it, and who audited it — and ship the deferred AI vision assist so the auditor gets decision support at the point of approval.

**Locked decisions carried into all v4.0 phases:**
- DWG handled via engineer-exported DXF — no binary parser; source CRS declared explicitly per import (no auto-detect) and reprojected to WGS84 via `proj4` (JS-side, Node.js runtime only)
- Mandatory satellite preview before any DB write — the critical safety net for CRS errors; no route save without engineer confirmation
- Chainage is **snapshotted at auditor approval** in the same transaction as `status = 'approved'`; re-import never rewrites history; live derived chainage only for pending work
- Route geometry is versioned (`geometry_version` on `routes`); re-import increments the version and warns the office engineer that existing chainage snapshots are unchanged
- Chainage stored as `numeric(10,2)` (centimetre precision); all bucketing in Postgres `FLOOR()`; completion capped with `LEAST(..., 100.00)`
- AI flags are advisory-only, async (never in the Telegram webhook critical path), and **eval-gated** — flags visible only after eval harness confirms precision ≥ 0.80 on the "anomaly" class
- BOQ ingestion stays on the existing Excel importer — drawing-based BOQ extraction remains Out of Scope (saha ADR-0002)
- All new schema changes via `npx tsx src/db/migrate.ts` applied to BOTH Neon branches (dev + test); geometry columns hand-edited to `geometry(LineString, 4326)`; GIST index hand-added
- `tenant_id` on every new table insert; money/quantity math in Postgres `numeric`; no `after()` or `logOfficeActivity` from the bot path

- [x] **Phase 14: Schema Foundation + DXF Route Import** - Migrate schema (routes extended, submissions chainage columns, submission_ai_flags table), DXF parsing pipeline with CRS reprojection, satellite preview confirmation, and source document reference storage (completed 2026-05-30)
- [ ] **Phase 15: Chainage As-Built View + Approval Snapshot** - Approval path snapshots chainage_m at decision time, per-kilometre as-built strip view with drill-down, chainage calibration offset, route completion % KPI, and chainage Excel/PDF export
- [ ] **Phase 16: AI Vision Assist** - Eval harness + labeled dataset first, then async Claude vision analysis wired to the approval path, advisory flag display on submission detail and as-built strip, perceptual-hash duplicate photo detection, and cron retry for stuck pending rows

---

## Phase Details

### Phase 1: Foundation

**Goal**: The office engineer can authenticate, manage projects and BOQ line items, register workers and auditors, and assign them to projects — and the full Drizzle/PostGIS schema is in place for all downstream phases
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, SETUP-01, SETUP-02, SETUP-03, SETUP-04, I18N-02
**Success Criteria** (what must be TRUE):

  1. Office engineer can sign in to the dashboard via an email magic-link and is redirected to the project list
  2. Office engineer can create a project, define BOQ line items with material/unit/contracted quantity, and upload a GeoJSON LineString route
  3. Office engineer can register a worker or auditor by Telegram User ID and name, and assign them to a project
  4. Office engineer can view remaining balance per BOQ line item on the project page
  5. Dashboard language can be toggled between Turkish and English and the preference persists across pages

**Plans**: 7 plans
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Next.js 15 scaffold, deps, shadcn, Vitest harness + fixtures (Wave 0)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02a-PLAN.md — Author Drizzle/PostGIS schema + 0000 PostGIS migration + migrate runner + seed + tenant/balance helpers

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-02b-PLAN.md — Generate migration + hand-edit LineString + coordinate-order test + [BLOCKING] live schema push
- [x] 01-03-PLAN.md — Auth.js allowlist magic-link + dashboard guard + next-intl TR/EN
- [x] 01-04-PLAN.md — Minimal Telegram /start webhook (pending_people, idempotent, secretToken-verified)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-05-PLAN.md — Project CRUD + people approval/assignment + tabbed detail shell

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-06-PLAN.md — BOQ CRUD + Excel import + GeoJSON route upload

**UI hint**: yes

### Phase 2: Worker Bot

**Goal**: A field worker can complete the full six-step submission flow (project → BOQ item → photo → location → quantity → notes → confirm) in Turkish with input enforcement, and the submission persists durably as `pending_audit` without duplication across serverless restarts
**Depends on**: Phase 1
**Requirements**: LOG-01, LOG-02, LOG-03, LOG-04, LOG-05, LOG-06, LOG-07, LOG-08, LOG-09, LOG-10, I18N-01
**Success Criteria** (what must be TRUE):

  1. Worker types `/start` and the bot greets them by name in Turkish and presents their assigned projects as an inline keyboard
  2. Worker is guided step-by-step through project, BOQ item, photo, location, quantity, and notes; any invalid input (non-photo, non-native-location, non-numeric) is rejected with a Turkish reprompt and the step does not advance
  3. Worker can confirm the submission and receives "Gönderildi" confirmation; the submission row exists in the database with `status: pending_audit`
  4. Sending the same Telegram update twice results in exactly one submission row (idempotency/replay guard verified)
  5. A mid-flow conversation survives a serverless cold start and resumes at the correct step without data loss

**Plans**: 6 plans
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Three new Drizzle schema files (conversation_state, processed_updates, submissions) + barrel + FK-safe truncate + Wave 0 test scaffold

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Pure libs: Turkish message catalog, FSM step types + TTL, paginated keyboards, photo→Blob helper
- [x] 02-03-PLAN.md — [BLOCKING] live `drizzle-kit push` of the three new tables (closes the false-positive verification trap)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-04-PLAN.md — Bot pipeline scaffold: idempotency middleware (D-13 Guard 1), identity guard, /start + Devam/Baştan, /iptal, FSM dispatcher + cold-start resume (SC5) + TTL

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-05-PLAN.md — Six step handlers: project, BOQ (balance + 0-balance soft warn), photo, location, quantity (Turkish decimal), notes (skip) with input enforcement

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 02-06-PLAN.md — Confirm summary + per-field edit (D-16), transactional pending_audit insert (getTxDb), Gönderildi/Yeni kayıt, [SC4 MANDATORY] duplicate-update + persistence live-DB tests

### Phase 3: Audit Loop

**Goal**: Every assigned auditor receives a Telegram summary of each new submission and can approve or reject it; approved submissions atomically increment the BOQ counter; rejected submissions notify the worker with a reason; double-approval is safely rejected
**Depends on**: Phase 2
**Requirements**: AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04, AUDIT-05, AUDIT-06
**Success Criteria** (what must be TRUE):

  1. When a worker confirms, all auditors assigned to that project receive a Telegram message with photo, Google Maps link, BOQ item, quantity, notes, and inline Approve/Reject buttons
  2. A non-assigned Telegram user tapping Approve or Reject receives a rejection message and no database change occurs
  3. Tapping Approve sets the submission to `approved` and the BOQ line item's `approved_qty` increments by exactly the submitted quantity — verified with a second tap that is rejected as already-decided
  4. Tapping Reject prompts the auditor for a text reason, sets the submission to `rejected`, and the worker receives the reason via Telegram
  5. When two auditors tap simultaneously, exactly one action succeeds and the other receives "already resolved" without any double-deduction

**Plans**: 5 plans
Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Schema additions (submissions decided_* + audit_notifications table), reject-reason FSM steps, test truncation order + Wave 0 audit test scaffold
- [x] 03-03-PLAN.md — Pure libs: buildAuditKeyboard + buildRejectReasonKeyboard, Turkish auditor/worker decision message strings

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — [BLOCKING] generate + apply Phase 3 migration (closes the false-positive verification trap)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-04-PLAN.md — Auditor fan-out service (fanOutToAuditors + editAllSiblingMessages) + non-blocking after() wiring (AUDIT-01/02)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-05-PLAN.md — Decision handlers: server-side authz, atomic first-wins approve + approved_qty increment, two-tier mandatory reject reason FSM, worker notify, dispatcher wiring (AUDIT-03/04/05/06)

### Phase 4: Spatial Layer

**Goal**: Every submission is matched to its nearest pipeline segment using PostGIS at the moment of submission; submissions outside the 500 m proximity threshold are flagged; approved points carry accurate snapped coordinates for map rendering
**Depends on**: Phase 3
**Requirements**: GEO-01, GEO-02
**Success Criteria** (what must be TRUE):

  1. When a worker shares location within 500 m of the project route, the submission row stores a `segment_fraction` (0.0–1.0) and a `snapped_point` geometry aligned to the route
  2. When a worker shares location more than 500 m from the route, the submission is persisted with `location_warning = true` and the auditor's Telegram notification includes a distance-anomaly flag
  3. A unit test verifies coordinate order: storing an Istanbul coordinate (lng 28.9, lat 41.0) reads back with longitude first in GeoJSON output

**Plans**: 4 plans
Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Add 5 spatial columns + snapped_point GiST index to submissions; Wave 0 test scaffold (D-48) + seedSpatialFixture

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md — [BLOCKING] generate + hand-verify (location_match CHECK + GiST) + live drizzle-kit push (closes the false-positive verification trap)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-03-PLAN.md — spatial.ts guarded in-tx PostGIS snap (D-41/D-42) + wire into handleConfirmSubmit + GEO-01/GEO-02 integration tests

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 04-04-PLAN.md — D-47 auditor caption anomaly line in fanOutToAuditors + caption unit tests + live-notification human-verify checkpoint

### Phase 5: Dashboard & Map

**Goal**: The office engineer can view a live Mapbox map overlaying the pipeline route and all approved work-log points, monitor BOQ progress per line item, and browse submissions filtered by status
**Depends on**: Phase 4
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05
**Success Criteria** (what must be TRUE):

  1. The project dashboard renders the GeoJSON pipeline route as a Mapbox line layer and approved submissions as circle markers snapped to the route, color-coded by BOQ item
  2. The BOQ progress table shows each line item's contracted quantity alongside approved quantity, with a completion percentage that updates on page load/focus
  3. The submissions list can be filtered by status (pending / approved / rejected) and shows photo, location, quantity, and notes for each entry
  4. The Mapbox token is restricted to the bayrak.ai domain before any dashboard URL is shared externally

**Plans**: 6 plans
Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Setup: install map stack, next/image Blob config, full TR/EN catalog, Wave 0 test scaffolds

**Wave 2** *(blocked on Wave 1)*

- [x] 05-02-PLAN.md — Data layer: getApprovedPoints + getSubmissions + getRouteGeoJSON (ST_AsGeoJSON, status filter, pagination)
- [x] 05-05-PLAN.md — BOQ progress: % Tamamlanan column + Progress bar inline in BoqTable (DASH-04)

**Wave 3** *(blocked on Wave 2)*

- [x] 05-03-PLAN.md — Map: MapView (react-map-gl route line + color-coded points + anomaly ring + popup + legend) wired into Rota tab
- [x] 05-04-PLAN.md — Kayıtlar tab: filterable/paginated submissions table + photo lightbox + Maps link

**Wave 4** *(blocked on Wave 3)*

- [x] 05-06-PLAN.md — Page wiring: force-dynamic, Kayıtlar tab registration, searchParams plumbing, RefreshOnFocus (DASH-05)

**UI hint**: yes

### Phase 6: AI Vision Assist

**Goal**: Photo and notes submitted by workers are analyzed asynchronously by Claude vision; anomaly flags appear as advisory hints in the dashboard auditor card and as a follow-up Telegram message for high-confidence flags; no AI output is shown to auditors until an eval harness confirms acceptable precision/recall
**Depends on**: Phase 5
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05
**Success Criteria** (what must be TRUE):

  1. After a worker confirms, the AI vision route fires asynchronously (never in the webhook path) and writes a `vision_results` row without delaying the worker's confirmation or auditor notification
  2. The auditor review card on the dashboard displays AI anomaly badges (photo mismatch, location mismatch, text classification) labeled as advisory with confidence level; they are absent when no anomaly is detected
  3. A high-confidence flag triggers a follow-up Telegram message to the auditor after the vision result is written, without modifying the original auditor notification
  4. AI text parsing of worker notes returns a suggested BOQ material/work classification visible as an advisory hint alongside the auditor decision buttons
  5. AI flags are only shown to auditors after an eval dataset of real submission photos with ground-truth labels passes defined precision/recall acceptance criteria (eval harness gate documented and run)

**Plans**: TBD
**UI hint**: yes

---

## Milestone v2.0 Phase Details

### Phase 7: Data Foundation & Canonical Record

**Goal**: Every BOQ item carries a unit price and currency; office-engineer actions are logged; hakkediş schema tables exist with the correct constraints; a single `CanonicalSubmission` type and typed aggregation functions give every downstream phase a stable, money-safe data contract
**Depends on**: Phase 5 (v1 complete; BOQ + submission data must exist)
**Requirements**: COST-01, COST-02, COST-03, COST-04, COST-05, PERF-03
**Success Criteria** (what must be TRUE):

  1. Office engineer can enter a unit price and currency per BOQ line item in the existing BOQ edit form, and the value persists; BOQ items with no price entered show a placeholder rather than zero
  2. The BOQ detail view shows contracted value (BAC = plannedQty × unit_price) and earned value (EV = approvedQty × unit_price) per line item alongside existing quantity columns, computed via a Postgres `SUM` query (no JS float arithmetic)
  3. Hakkediş schema tables (`hakedis_periods`, `hakedis_period_lines`) and `office_activity_log` are created in the database with all required columns, indexes, and constraints — including the `CHECK (cumulative_qty >= previous_cumulative_qty)` guard
  4. Every office-engineer mutation (project create/update, BOQ edit, unit-price set, person assignment) writes a corresponding row to `office_activity_log` with actor, action type, entity reference, and timestamp
  5. `getCanonicalSubmissions()`, `getProjectMetrics()`, `getPersonMetrics()`, and `getPortfolioOverview()` are callable from the application with auth-guard and tenant scope, returning typed results

**Plans**: 4 plans
Plans:
**Wave 1**

- [x] 07-01-PLAN.md — Install decimal.js + author all 4 schema changes (unit_price/currency + 3 new tables) + CanonicalSubmission type + barrel + FK-safe truncate + Wave 0 test scaffold

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 07-02-PLAN.md — [BLOCKING] generate migration + hand-edit CHECK constraint + hand-write partial-index migration + apply via tsx migrate.ts (closes the false-positive verification trap); decimal.js legitimacy gate

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 07-03-PLAN.md — logOfficeActivity() after()-deferred helper + analytics.ts (getCanonicalSubmissions, getProjectMetrics, getPersonMetrics, getPortfolioOverview, getOfficeActivityLog) — currency-grouped, money-in-Postgres, auth+tenant guarded

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 07-04-PLAN.md — setUnitPrice() + logOfficeActivity wiring across boq/projects/people/routes + BOQ dialog price/currency fields (COST-01 UI) + human-verify persistence checkpoint

### Phase 8: Admin Shell & Information Architecture

**Goal**: The admin experience layer is live — a persistent sidebar shell on every dashboard page, a fully-filterable cross-project Overview with portfolio KPIs and trend charts, a People directory with per-person profile and activity timeline, a canonical submission detail page reachable from every surface, global URL-persisted filters with metric drill-down, and full TR/EN localization — without breaking any existing project-scoped route
**Depends on**: Phase 7
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, PERF-04, I18N-03
**Success Criteria** (what must be TRUE):

  1. A persistent sidebar navigation (Overview · Projects · People · Analytics · Hakkediş · Exports) is visible on ALL dashboard pages including `/dashboard/projects/*`; the active item is highlighted; navigating to `/dashboard` redirects to `/dashboard/overview`; existing project routes and page files are unmodified
  2. The Overview page displays portfolio KPIs (pending-audit backlog, approvals, rejections, earned value vs contracted value, active workers) and trend charts; a global filter bar (date range · project · person · status) re-scopes the page and a currency selector governs all money displays
  3. The People directory lists approved people across all projects (Workers/Auditors tabs); each person's profile page shows KPI cards and an activity timeline (worker submissions / auditor decisions) that drills through to the submission detail page
  4. A canonical submission detail page shows the full record (photo, location, BOQ item, quantity, status, auditor decision, rejection reason) and is reachable from the cross-project records list, the profile timeline, metric drill-downs, and the existing project Kayıtlar tab
  5. Global filters persist across navigation via URL query parameters and scope the Overview, People, and a new cross-project `/dashboard/records` list; clicking any metric drills down to the underlying filtered records
  6. Every new page label, column header, button, and status string on admin surfaces appears correctly in both Turkish and English when the dashboard locale is switched

**Plans**: 6 plans

Plans:
**Wave 1**

- [x] 08-01-PLAN.md — Install shadcn sidebar+chart; full dashboard.admin.* TR/EN i18n namespace; i18n key-coverage tests (I18N-03)
- [x] 08-02-PLAN.md — Data layer (TDD): getPortfolioKPIs, getPortfolioTrends, getAuditorDecisions; extend getPersonMetrics(dateRange) + getCanonicalSubmissions(submissionId/limit/offset)

**Wave 2** *(blocked on Wave 1)*

- [x] 08-03-PLAN.md — Admin shell: SidebarProvider in root layout, AppSidebar + SidebarNav, TopNav hamburger, /dashboard redirect, (admin) passthrough, 3 stub pages (UX-01)

**Wave 3** *(blocked on Wave 2)*

- [x] 08-04-PLAN.md — Overview command center: FilterBar + CurrencySelector + KpiCard + TrendChartsClient + overview page (UX-02/03/04)

**Wave 4** *(blocked on Wave 3)*

- [x] 08-05-PLAN.md — People directory + person profile + activity timeline; getPortfolioPeople bulk query (PERF-04, UX-03)
- [x] 08-06-PLAN.md — Cross-project records list + canonical submission detail page + additive Kayıtlar Details link (UX-05)
**UI hint**: yes

### Phase 9: Performance Scorecards, Leaderboard & Alerts

**Goal**: Admin can view and compare worker, auditor, and office-engineer performance through full scorecards and a leaderboard, and SLA-breach alerts surface on the Overview — building on the filter, drill-down, and profile surfaces delivered in Phase 8
**Depends on**: Phase 8
**Requirements**: PERF-01, PERF-02, PERF-03, PERF-05, PERF-06
**Success Criteria** (what must be TRUE):

  1. Worker scorecard shows submission volume, approval rate, rejection rate, location-compliance rate, output quantity, and value contribution — scoped per project and across all projects
  2. Auditor scorecard shows decision count, approval/rejection split, mean decision turnaround, pending backlog, and SLA-breach rate — scoped per project and across all projects
  3. Office-engineer scorecard displays a list of logged actions (project creates/edits, BOQ changes, unit-price sets, person assignments) with timestamps, derived from `office_activity_log`
  4. Admin can compare employees side-by-side in a leaderboard ranked by a chosen metric
  5. Overview page displays SLA / performance alerts — submissions pending beyond a threshold, rejection-rate spikes above threshold, and projects with no approved submissions beyond a threshold

**Plans**: 6 plans

Plans:
**Wave 1**

- [x] 09-01-PLAN.md — tenant_settings schema (D-83/84 thresholds) + barrel + truncate helper + Wave-0 test scaffolds
- [x] 09-02-PLAN.md — KpiCard extension: 'warning' (amber) valueColor + alertBadge corner slot (D-87)

**Wave 2** *(blocked on Wave 1)*

- [x] 09-03-PLAN.md — [BLOCKING] generate + hand-verify 0007 migration + seed Moderate defaults + apply via tsx migrate.ts (D-49/D-84)

**Wave 3** *(blocked on Wave 2)*

- [x] 09-04-PLAN.md — analytics extensions (outputQuantitySum, slaBreachRateDecided, getStalledProjects) + settings.ts actions (PERF-01/02/06)

**Wave 4** *(blocked on Wave 3)*

- [x] 09-05-PLAN.md — profile scorecards (PERF-01/02) + leaderboard rank/sort (PERF-05) + read-only office-engineer scorecard (PERF-03)

**Wave 5** *(blocked on Wave 4)*

- [x] 09-06-PLAN.md — Overview alert badges + Stalled Projects KPI card + /dashboard/settings form + TopNav gear (PERF-06)

**UI hint**: yes

### Phase 10: Hakkediş Billing

**Goal**: Office engineer can create, compute, and finalize progress-payment periods using the yeşil-defter cumulative model; all deduction rates are configurable per period; a finalized period is an immutable snapshot that cannot be recomputed or overwritten
**Depends on**: Phase 9 (analytics validates aggregation queries before higher-stakes billing uses the same data)
**Requirements**: HAK-01, HAK-02, HAK-03, HAK-04, HAK-05
**Success Criteria** (what must be TRUE):

  1. Office engineer can create a hakkediş period for a project by specifying a period label, start date, end date, and configurable deduction rates (KDV rate, tevkifat fraction, stopaj toggle, teminat rate, avans kesintisi rate); the period is created with status `draft`
  2. For a draft period, the system computes per-BOQ-item line items using the yeşil-defter model: cumulative approved quantity up to period end date minus the previous period's cumulative quantity, multiplied by the locked unit-price snapshot — and stores both `cumulative_qty_approved` and `previous_cumulative_qty` as separate columns
  3. The period detail page shows a summary table: gross dönem tutarı → KDV → KDV tevkifat → stopaj → teminat → avans kesintisi → net ödeme, with each intermediate value displayed to two decimal places computed in Postgres arithmetic (not JS float)
  4. Office engineer can update a draft period's payment status through the lifecycle (`draft → submitted → paid`) and the current status is visible on the period list page
  5. After an office engineer clicks Finalize, the period's status becomes `finalized`; all snapshot columns (material name, unit, unit price, quantities, computed values) are frozen; any attempt to recompute or edit a finalized period returns an error

**Plans**: 4 plans
Plans:
**Wave 1**

- [x] 10-01-PLAN.md — Schema: 4 deduction columns (D-91) + GENERATED period_qty (D-104) + 0008 migration + [BLOCKING] live apply + OFFICE_ACTION_TYPES delete + Switch + full hakedis i18n + Wave 0 scaffold

**Wave 2** *(blocked on Wave 1)*

- [x] 10-02-PLAN.md — src/actions/hakedis.ts: computePeriodLines (yeşil-defter, Istanbul cutoff, finalized-only chaining) + deduction chain in getPeriodDetail + create/recompute/finalize/advance/delete actions + HAK tests

**Wave 3** *(blocked on Wave 2)*

- [x] 10-03-PLAN.md — Period list page (replace stub) + project filter + status badge + Create Period dialog (D-92 defaults, D-93 stopaj toggle, % → fraction, create+compute+navigate)

**Wave 4** *(blocked on Wave 2 + Wave 3)*

- [x] 10-04-PLAN.md — Period detail page (yeşil-defter line table + D-90 deduction summary, Net Ödeme focal point) + state-gated controls + Finalize/Delete confirmation dialogs + immutability banner + unpriced warning

**UI hint**: yes

### Phase 11: Exports

**Goal**: Admin can download submission ledger, BOQ/hakkediş, and performance data as multi-sheet bilingual Excel files, and a finalized hakkediş period as a PDF certificate with correct Turkish character rendering; all export route handlers are protected by explicit auth guards
**Depends on**: Phase 10 (exports render validated billing data; PDF depends on finalized hakkediş data)
**Requirements**: EXP-01, EXP-02, EXP-03, EXP-04
**Success Criteria** (what must be TRUE):

  1. Admin can trigger a submission ledger Excel download from the Exports page with active date-range and project filters applied; the resulting file contains the full canonical record shape (worker, project, BOQ item, quantity, status, timestamps, auditor, rejection reason, location flag) with bilingual TR/EN column headers
  2. Admin can export a BOQ/hakkediş Excel file for a period that includes a yeşil defter sheet (cumulative register), a fiyat icmali sheet (period qty × unit price per line item), and a hesap özeti sheet (gross → deductions → net ödeme) — formatted as Turkish-locale currency cells
  3. Admin can export worker and auditor performance summaries to Excel with per-person KPI columns (approval rate, throughput, turnaround, value contribution) matching the scorecard display
  4. Office engineer can download a finalized hakkediş period as a PDF document where Turkish characters (ğ ş ı ö ü ç) render correctly using an embedded TTF font; the PDF includes cover information (project, period dates, contractor), line-item table, and payment summary
  5. Requesting any export endpoint without a valid session returns HTTP 401; the export route handlers do not inherit layout-level auth and carry their own explicit `auth()` guard

**Plans**: 7 plans (across 5 waves; old Plan 11-01 split into 11-01a + 11-01b during revision)
Plans:
**Wave 1**

- [x] 11-01a-PLAN.md — Package install + schema/OE-scorecard map + 4 oe_scorecard i18n action keys: install @react-pdf/renderer + dejavu-fonts-ttf + pdf-parse (blocking-human legitimacy checkpoint first), copy DejaVu TTFs to public/fonts/, extend OFFICE_ACTION_TYPES with 4 new types (D-109), hoist OE-Scorecard actionTypeToKey() map extension here (so Wave 2 activity-log rows render specific labels immediately), add the 4 action_*_exported keys to messages/{en,tr}.json
- [x] 11-01b-PLAN.md — *(depends on 11-01a)* Shared helpers + exports.* i18n namespace + test scaffold: create toSlug() (D-112), add sanitizeExcelCell() (WARNING 5 / CVE-2014-3524 mitigation consumed by Plans 02/03/04), add getAllFinishedPeriods() (status!='draft' tenant-wide), extend PortfolioWorker with locationComplianceRate (WARNING 4 fix — D-110 column was previously left blank), add dashboard.admin.exports.* namespace (21 keys) + hakedis.detail.{export_excel,download_pdf}, scaffold tests/exports.test.ts with 12 it.todo entries

**Wave 2** *(blocked on Wave 1)*

- [x] 11-02-PLAN.md — EXP-01: GET /api/exports/submissions binary handler + buildSubmissionLedger() in src/lib/excel.ts (auth-first per D-114, limit:100_000 per Pitfall 3, numFmt per D-116, D-112 filename, D-109 activity log, sanitizeExcelCell wraps user-content cells — T-11-02-FORMULA mitigate)

**Wave 3** *(blocked on Wave 2 — both edit src/lib/excel.ts)*

- [x] 11-03-PLAN.md — EXP-03: GET /api/exports/performance binary handler + buildPerformanceSummary() two-sheet workbook (Workers + Auditors, NO OE per D-110, D-110 layout one-row-per-worker with JSON-stringified multi-currency map per RESEARCH Open Question 3 RESOLVED, locationComplianceRate populated per WARNING 4 fix, sanitizeExcelCell on displayName per T-11-03-FORMULA, D-109 logging)

**Wave 4** *(blocked on Wave 3 — both edit src/lib/excel.ts)*

- [x] 11-04-PLAN.md — EXP-02 + EXP-04: GET /api/exports/hakedis/[periodId] (three sheets per D-115) + GET /api/exports/hakedis/[periodId]/pdf (DejaVu Sans embedded per D-106, registerFonts try/catch for T-11-04-FONT-MISSING per WARNING 6 fix, snapshot-only per D-107, Pitfall 5 draft guard, sanitizeExcelCell on materialSnapshot/unitSnapshot per T-11-04-FORMULA, D-109 logging) + HakedisPdf React component

**Wave 5** *(blocked on Wave 4)*

- [x] 11-05-PLAN.md — Replace Phase 8 Exports stub at src/app/dashboard/(admin)/exports/page.tsx with the hub UI: 3 trigger surfaces per D-108 + UI-SPEC Surface 1 (Submission Ledger card, Performance Summary card, Hakkediş Files period picker), force-dynamic, auth-redirect, FilterBar in Suspense (dead getPortfolioPeople import removed per WARNING 3 fix)
- [x] 11-06-PLAN.md — Extend PeriodDetailControls.tsx with Excel + PDF outline buttons gated on status!=='draft' (D-108 primary trigger) + end-of-phase UAT (OE Scorecard actionTypeToKey() extension was hoisted to Plan 11-01a Task 2 during revision; UAT verifies labels render correctly)
**UI hint**: yes

### Phase 12: Submission-Driven Hakkediş

**Goal**: Each approved Telegram work-application submission contributes immediately to the in-progress hakkediş period — the office sees billing artefacts grow with each approval, and every hakkediş line-item quantity is traceable back to the source submission(s) — without breaking the v2.0 yeşil-defter cumulative model, the configurable deduction chain, or the immutable-snapshot guarantee
**Depends on**: Phase 10 (Hakkediş Billing) + Phase 3 (Audit Loop — approval path is the trigger)
**Requirements**: SDH-01, SDH-02, SDH-03
**Success Criteria** (what must be TRUE):

  1. When an auditor approves a work-application submission via Telegram, the office sees the in-progress hakkediş period for the matching project + BOQ line item update within seconds — without waiting for period finalization
  2. Office engineer can open a hakkediş line and see the list of approved submissions that contributed to its quantity (submission ↔ hakkediş traceability), including the worker, approval timestamp, and source quantity
  3. Existing period-finalization flow continues to work unchanged on a fresh period — finalize still produces the same immutable snapshot, the cumulative `period qty = cumulative − previous` math holds, and the deduction chain (KDV / tevkifat / stopaj / teminat) is unaffected
  4. A finalized period rejects further submission-driven contribution — approvals that land after finalization flow into the next draft period (or surface as "no draft period exists" if none is open), never mutating the finalized snapshot

**Plans**: 4 plans
Plans:
**Wave 1**

- [x] 12-01-PLAN.md — D-119 join-table schema + UNIQUE on hakedis_period_lines + barrel export + tests/hakedis-live.test.ts scaffold (9 it.todo) + seedDraftPeriod fixture + bilingual SDH-02 i18n keys

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 12-02-PLAN.md — [BLOCKING] generate + hand-verify Pitfall-7-clean 0009_v3_line_submissions migration + live apply to dev DB and test DB

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 12-03-PLAN.md — Extract recomputeHakedisLine helper from recomputePeriodLines + add getLineSubmissions Server Action + wire D-117 post-commit hook into bot-audit handleAuditDecision approve branch + replace 8/9 it.todo with concrete tests

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 12-04-PLAN.md — LivePeriodPoller (D-120 30s) + LineSubmissionsPanel (SDH-02 expand-row) + page wire + end-of-phase blocking-human UAT

**UI hint**: yes

### Phase 13: UX & Brand Pass

**Goal**: Every existing dashboard surface follows the bayrak.ai brand — the brand reference is checked into the repo, shared brand component primitives exist so future phases inherit the brand language by default, and the product looks as deliberate as it works
**Depends on**: Phase 12 (so the brand pass covers Phase 12's new traceability UI as well)
**Requirements**: BRAND-01, BRAND-02, BRAND-03
**Success Criteria** (what must be TRUE):

  1. The bayrak.ai brand reference (logos, color palette, typography, layout primitives) is checked into the repo or linked from a single source of truth, readable by both humans and downstream planners
  2. Shared brand component primitives (logo, brand button variants, brand heading, brand empty-state, brand card) exist in `src/components/brand/` (or equivalent) and are documented well enough that future phases reach for them instead of raw shadcn defaults
  3. Every existing dashboard surface (overview, project pages, people, analytics, hakkediş, exports, period detail) is re-skinned using the brand primitives — no functional regression vs v2.0
  4. A side-by-side before/after audit confirms each restyled surface against the brand reference; user accepts each surface visually

**Plans**: 5 plans
Plans:
**Wave 1**

- [x] 13-01-PLAN.md — Brand spine: token slot override (industrial blue → slate + amber), Geist Sans/Mono via `geist` package, 7 brand primitives (BrandButton/Card/Heading/Badge/Empty/Logo/Table) + tests, BRAND.md, AppSidebar wordmark, app/icon.png + opengraph-image.tsx + not-found.tsx + error.tsx, nested meta.not_found + meta.error i18n keys (BRAND-01/02/03)

**Wave 2** *(blocked on Wave 1)*

- [x] 13-02-PLAN.md — Hakkediş + Exports re-skin: hakkediş hub, period detail (8-column line table + deduction summary frozen), PeriodDetailControls (draft-gate frozen), LivePeriodPoller (null-on-disabled + sr-only frozen + ADDITIVE visible BrandBadge sibling), LineSubmissionsPanel (colSpan math frozen), exports hub 3-trigger surface (BRAND-02)

**Wave 3** *(blocked on Wave 1 — 13-03a and 13-03b run in parallel)*

- [x] 13-03a-PLAN.md — Command-center re-skin: overview + analytics hub + OE scorecard + KpiCard refactor (composes BrandCard internally; D-87 contract preserved) + FilterBar + CurrencySelector + EVTableClient (BRAND-02)
- [x] 13-03b-PLAN.md — Directory + settings re-skin: people directory + per-person profile + ActivityTimeline + LeaderboardSortSelect + records list/detail + SubmissionDetailView (reverse-tabnabbing preserved) + ThresholdSettingsForm + TrendChartsClient (token-bound) + settings page (BRAND-02)

**Wave 4** *(blocked on Wave 1 + Wave 2 + Wave 3a + Wave 3b)*

- [x] 13-04-PLAN.md — Projects + Auth + Marketing re-skin: projects list/detail/edit/new/BOQ template (SETUP-04 balance + GeoJSON + people-assignment preserved), auth signin (BrandLogo lg + magic-link form) + auth error, marketing landing root (`/`), end-of-phase blocking-human UAT (Manual UAT rows 4-7) (BRAND-02)
**UI hint**: yes

---

## Milestone v4.0 Phase Details

### Phase 14: Schema Foundation + DXF Route Import

**Goal**: The schema foundation for all v4.0 capabilities is in place and office engineers can import a pipeline route from a DXF file — with mandatory CRS declaration, satellite preview confirmation, and the original source document stored for reference — while the existing GeoJSON path continues to work unchanged
**Depends on**: Phase 13
**Requirements**: RTE-01, RTE-02, RTE-03, RTE-04, RTE-05
**Success Criteria** (what must be TRUE):

  1. Office engineer can upload a DXF file, select the centerline layer from a list of detected layers, and declare the source coordinate system (TUREF/TM30, UTM 35N/36N, ED50, or WGS84); the route is reprojected to WGS84 and displayed on the satellite basemap for confirmation before any database write occurs
  2. If the engineer cancels the satellite preview, no route record is written; if they confirm, the reprojected route appears on the project map tab identical to a GeoJSON-uploaded route — and the existing GeoJSON upload path continues to work without any regression
  3. Re-importing a route on a project that already has approved submissions shows a warning naming the number of existing approved submissions; after confirmation, the new route geometry is stored under an incremented `geometry_version`, and a direct database check confirms existing approved submissions' `chainage_m` values are unchanged
  4. The original DXF (and PDF where provided) is accessible from the project route tab as a "Kaynak Belge" download link, and the declared CRS and layer name are shown in the route metadata card
  5. A unit test for `reprojectToWGS84(5254, 600000, 4570000)` asserts output longitude is in [25.7, 44.8] and latitude is in [35.8, 42.2]; uploading a DXF with axis-swapped or out-of-Turkey coordinates is rejected with a clear error before any DB write
  6. v1 core-loop capabilities (AUTH-01..04, SETUP-01..04, LOG-01..10, AUDIT-01..06, GEO-01..02, DASH-01..05, I18N-01..02) are moved from Active to Validated in PROJECT.md

**Plans**: 6 plans (across 5 waves)
Plans:
**Wave 1**

- [x] 14-01-PLAN.md — Wave 0: install dxf-parser/proj4/react-pdf + src/lib/crs.ts (7 Turkey EPSG, reprojectToWGS84, SC5) + DXF fixtures + full Nyquist test scaffold
- [x] 14-02-PLAN.md — Schema authoring: extend routes (6 cols) + submissions (2 cols) + new submission_ai_flags table + barrel/truncate/action-type + 0010/0011 migration SQL

**Wave 2** *(blocked on 14-02)*

- [x] 14-03-PLAN.md — [BLOCKING] apply 0010 + 0011 via `npx tsx src/db/migrate.ts` to BOTH Neon branches (dev + test) + DB-level verify

**Wave 3** *(blocked on 14-01 + 14-03)*

- [x] 14-04-PLAN.md — Backend pipeline: dxf-parser.ts impl (tests→GREEN) + uploadDxf + uploadRoute total_length_m/geometry_version patch + /api/dxf-upload Blob token route + i18n keys

**Wave 4** *(blocked on 14-04)*

- [x] 14-05-PLAN.md — UI: DxfUpload state machine + satellite preview confirmation modal + PdfViewer + RouteTabClient/RouteTab integration + metadata card + Kaynak Belge (GeoJSON path unchanged)

**Wave 5** *(blocked on 14-05)*

- [x] 14-06-PLAN.md — SC6 bookkeeping reconciliation: PROJECT.md Active→Validated for v1 capabilities + RTE-01..05 Done in REQUIREMENTS.md

**UI hint**: yes

### Phase 15: Chainage As-Built View + Approval Snapshot

**Goal**: Every approved submission carries an immutable chainage snapshot taken at the moment of auditor approval, and the office can view a per-kilometre as-built strip of the route showing what work was done at each segment, drill into the underlying submissions, see route completion %, and export the as-built record to Excel and PDF
**Depends on**: Phase 14
**Requirements**: CHN-01, CHN-02, CHN-03, CHN-04, CHN-05, CHN-06, CHN-07
**Success Criteria** (what must be TRUE):

  1. When an auditor approves a submission via Telegram, a direct database check confirms `submissions.chainage_m` is populated (non-NULL, `numeric(10,2)`) and `submissions.route_geometry_version` matches the current route version — without any additional action from the office
  2. Office engineer can open the "As-Built" tab on a project and see a per-kilometre strip table with colour-coded status (not started / in progress / approved), work count, total quantity by BOQ item, worker names, and auditor names for each km bucket; chainages displayed in "km 2+347" Turkish convention
  3. Clicking a row in the as-built strip opens the canonical submission detail page for that segment's submissions, and the back-link returns to the strip view
  4. The project overview KPI shows route completion % by chainage (approved metres / total route length, clamped at 100%) — and a bucket with over-100% approved work shows 100%, not a value above it
  5. Office engineer can calibrate chainage by entering a numeric offset in metres; after saving, all user-facing displays (dashboard strip, Telegram notifications for new approvals, Excel/PDF exports) show the calibrated chainage — a direct spot-check confirms the same value appears across all three surfaces
  6. Office engineer can export the as-built breakdown to Excel (columns: Km Başlangıç, Km Bitiş, İş Adedi, Malzeme, Miktar, Birim, İşçi, Denetçi) and PDF consistent with the existing hakkediş export aesthetic; the exported file passes the same auth guard (401 on no session) as all other export route handlers

**Plans**: 7 plans (across 5 waves)
Plans:
**Wave 1**

- [x] 15-01-PLAN.md — Wave 0: formatChainage util + tests/chainage.test.ts scaffold + 3000m route fixture

**Wave 2** *(blocked on 15-01)*

- [x] 15-02-PLAN.md — Chainage snapshot write in handleAuditDecision + calibrated Telegram line + backfill migration 0013 (authored)
- [x] 15-03-PLAN.md — Folded map-link: snapped lat/lon on CanonicalSubmission + Google Maps link + As-Built back-link (CHN-05)

**Wave 3** *(blocked on 15-02)*

- [x] 15-04-PLAN.md — [BLOCKING] apply migration 0013 to BOTH Neon branches + backfill verify

**Wave 4** *(blocked on 15-04)*

- [x] 15-05-PLAN.md — Backend: fetchChainageBucketsRaw (generate_series + 3-state + completion clamp) + getChainageBuckets/setChainageOffset

**Wave 5** *(blocked on 15-05)*

- [x] 15-06-PLAN.md — Export: chainage Excel (8 cols) + PDF (DejaVu) + auth-guarded /api/exports/chainage route (CHN-07)
- [ ] 15-07-PLAN.md — UI: As-Built tab (colour bar + table + granularity toggle + completion KPI + calibration form) + tab wire + i18n + end-of-phase UAT
**UI hint**: yes

### Phase 16: AI Vision Assist

**Goal**: Photo and notes from every approved submission are analyzed asynchronously by Claude vision — anomaly flags and work classifications appear as advisory hints on the submission detail page and as amber indicators in the as-built strip — with the eval harness built first, so no flag is ever shown to an auditor before precision ≥ 0.80 is confirmed on the labeled reference dataset
**Depends on**: Phase 14 (submission_ai_flags schema) and Phase 15 (as-built strip for flag indicators)
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05, AI-06
**Success Criteria** (what must be TRUE):

  1. The eval harness (`tests/ai-vision.test.ts`) runs against a labeled fixture dataset of real submission photos with ground-truth anomaly labels; the test suite reports precision ≥ 0.80 on the "anomaly" class before any flag UI is enabled — and a flag in the codebase confirms the eval gate is the single switch controlling flag display
  2. After an auditor approves a submission via Telegram, Vercel function logs confirm the webhook response is sent before the AI analysis log line appears — proving vision runs off the critical path; the worker confirmation and auditor notification are never delayed by AI processing
  3. When a submission has an `eval_passed = true` flag in `submission_ai_flags`, the submission detail page displays an `AiFlagCard` with the anomaly description in Turkish, a confidence badge (traffic-light color by score), and the auto-suggested BOQ material classification; when no eval-passed flag exists, the card is absent entirely
  4. When two submissions share the same perceptual hash (near-duplicate photos), the second submission's AI flag record carries a "duplicate photo" advisory and the first analysis result is reused — no second Claude vision API call is made
  5. An auditor can approve or reject a submission regardless of what the AI flag says — no code path connects `submission_ai_flags` to `submissions.status`; a grep of the codebase confirms this
  6. A cron job at `/api/cron/ai-flags` picks up `submission_ai_flags` rows with `status = 'pending'` older than 5 minutes and retries the analysis; the cron is registered in `vercel.json` and protected by `CRON_SECRET`

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 7/7 | Complete | 2026-05-24 |
| 2. Worker Bot | 6/6 | Complete   | 2026-05-24 |
| 3. Audit Loop | 5/5 | Complete   | 2026-05-24 |
| 4. Spatial Layer | 4/4 | Complete    | 2026-05-24 |
| 5. Dashboard & Map | 6/6 | Complete   | 2026-05-24 |
| 6. AI Vision Assist | 0/TBD | Not started | - |
| 7. Data Foundation & Canonical Record | 5/5 | Complete   | 2026-05-26 |
| 8. Admin Shell & Information Architecture | 6/6 | Complete   | 2026-05-26 |
| 9. Performance Analytics & Scorecards | 6/6 | Complete   | 2026-05-27 |
| 10. Hakkediş Billing | 4/4 | Complete    | 2026-05-28 |
| 11. Exports | 7/7 | Complete    | 2026-05-28 |
| 12. Submission-Driven Hakkediş | 4/4 | Complete    | 2026-05-28 |
| 13. UX & Brand Pass | 5/5 | Complete    | 2026-05-29 |
| 14. Schema Foundation + DXF Route Import | 6/6 | Complete   | 2026-05-30 |
| 15. Chainage As-Built View + Approval Snapshot | 6/7 | In Progress|  |
| 16. AI Vision Assist | 0/TBD | Not started | - |
