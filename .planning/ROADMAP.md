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
- [ ] **Phase 3: Audit Loop** - Auditor notification, Approve/Reject handling, atomic BOQ deduction, race-safe idempotency, and worker rejection notification
- [ ] **Phase 4: Spatial Layer** - PostGIS nearest-segment matching, location proximity warning, and `approved_points` population
- [ ] **Phase 5: Dashboard & Map** - Mapbox route and approved-points overlay, BOQ progress view, and submission list with status filtering
- [ ] **Phase 6: AI Vision Assist** - Async Claude vision analysis, eval harness gate, anomaly badges on dashboard and advisory Telegram follow-up

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

- [ ] 03-02-PLAN.md — [BLOCKING] generate + apply Phase 3 migration (closes the false-positive verification trap)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 03-04-PLAN.md — Auditor fan-out service (fanOutToAuditors + editAllSiblingMessages) + non-blocking after() wiring (AUDIT-01/02)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 03-05-PLAN.md — Decision handlers: server-side authz, atomic first-wins approve + approved_qty increment, two-tier mandatory reject reason FSM, worker notify, dispatcher wiring (AUDIT-03/04/05/06)

### Phase 4: Spatial Layer

**Goal**: Every submission is matched to its nearest pipeline segment using PostGIS at the moment of submission; submissions outside the 500 m proximity threshold are flagged; approved points carry accurate snapped coordinates for map rendering
**Depends on**: Phase 3
**Requirements**: GEO-01, GEO-02
**Success Criteria** (what must be TRUE):

  1. When a worker shares location within 500 m of the project route, the submission row stores a `segment_fraction` (0.0–1.0) and a `snapped_point` geometry aligned to the route
  2. When a worker shares location more than 500 m from the route, the submission is persisted with `location_warning = true` and the auditor's Telegram notification includes a distance-anomaly flag
  3. A unit test verifies coordinate order: storing an Istanbul coordinate (lng 28.9, lat 41.0) reads back with longitude first in GeoJSON output

**Plans**: TBD

### Phase 5: Dashboard & Map

**Goal**: The office engineer can view a live Mapbox map overlaying the pipeline route and all approved work-log points, monitor BOQ progress per line item, and browse submissions filtered by status
**Depends on**: Phase 4
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05
**Success Criteria** (what must be TRUE):

  1. The project dashboard renders the GeoJSON pipeline route as a Mapbox line layer and approved submissions as circle markers snapped to the route, color-coded by BOQ item
  2. The BOQ progress table shows each line item's contracted quantity alongside approved quantity, with a completion percentage that updates on page load/focus
  3. The submissions list can be filtered by status (pending / approved / rejected) and shows photo, location, quantity, and notes for each entry
  4. The Mapbox token is restricted to the bayrak.ai domain before any dashboard URL is shared externally

**Plans**: TBD
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

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 7/7 | Complete | 2026-05-24 |
| 2. Worker Bot | 6/6 | Complete   | 2026-05-24 |
| 3. Audit Loop | 2/5 | In Progress|  |
| 4. Spatial Layer | 0/TBD | Not started | - |
| 5. Dashboard & Map | 0/TBD | Not started | - |
| 6. AI Vision Assist | 0/TBD | Not started | - |
