# bayrak.ai

## What This Is

A single-tenant B2B operational platform for linear-infrastructure subcontractors (pipeline and utility-network construction) that replaces unstructured field communication — WhatsApp messages and phone calls — with a structured, trackable, geospatially-aware, AI-assisted communication loop. Field workers log work through a conversational Telegram bot; on-site auditors approve or reject from Telegram; an office dashboard shows live progress on a map and the Bill of Quantities deducts automatically as work is approved.

## Core Value

Every unit of field work flows through one trustworthy loop — **worker submits → auditor approves on-site → central project data (BOQ + map) updates automatically** — so the office always sees real, verified, geolocated progress without chasing anyone on WhatsApp.

## Current Milestone: v3.0 Submission-Driven Hakkediş & UX Brand Pass

**Goal:** Close two outstanding gaps surfaced at the end of v2.0 — (1) connect the worker-submission loop directly to the hakkediş artefact so the office sees billing grow with each approved submission, not only at period rollup; (2) bring every dashboard surface in line with the bayrak.ai brand so the product looks as deliberate as it works.

**Target features:**

*Data & functionality:*
- Submission-driven hakkediş — each approved Telegram work-application submission contributes to the in-progress hakkediş period in real time; every hakkediş line item is traceable to the source submission(s)

*Experience & brand:*
- Dashboard UX / brand pass — every existing surface (overview, project pages, people, analytics, hakkediş, exports, period detail) re-skinned to follow the bayrak.ai brand (logos, color palette, typography, layout structure); brand reference checked into the repo so future surfaces inherit the same language

**Deferred:** Phase 6 (AI Vision Assist) still carries over from v1.0 — not part of this milestone.

## Previous Milestone: v2.0 Operations Intelligence & Hakkediş — Complete (2026-05-28)

Shipped: role-based performance scorecards (worker / auditor / office-engineer), canonical submission record + drill-down detail page, admin shell with `(admin)` route group + global filters, performance/SLA alerts + leaderboard, hakkediş period CRUD + yeşil-defter computation + Turkish deduction chain + finalization lock, and bilingual TR/EN Excel + Turkish-glyph PDF exports — all auth-guarded. See Validated requirements below.

## Requirements

### Validated

- [x] PostGIS matches a submission's lat/long to the nearest pipeline segment at submission time, storing a snapped point + segment fraction; submissions beyond a configurable 500 m threshold are flagged so the auditor's Telegram notification carries a distance-anomaly line — *Validated in Phase 4: Spatial Layer (GEO-01, GEO-02). Live-Telegram render deferred to a manual smoke-test (04-HUMAN-UAT.md).*
- [x] Dashboard renders approved work logs as point markers / colored segments overlaying the GeoJSON route (Mapbox GL JS), with live BOQ progress per line item and a status-filterable submissions list that refreshes on focus — *Validated in Phase 5: Dashboard & Map (DASH-01..05). Canvas rendering + Mapbox token domain restriction (SC4) deferred to manual checks (05-HUMAN-UAT.md).*
- [x] Admin experience layer: a persistent sidebar shell on every dashboard page, a fully-filterable cross-project Overview (portfolio KPIs + trend charts + currency selector), a People directory with per-person profile and activity timeline, a canonical submission detail page reachable from every surface, global URL-persisted filters with metric drill-down, and full TR/EN localization — without breaking existing project-scoped routes — *Validated in Phase 8: Admin Shell & Information Architecture (UX-01..05, PERF-04, I18N-03). 6/6 code truths verified; 7 browser behaviors deferred to manual checks (08-HUMAN-UAT.md). Known follow-up: Google Maps link on submission detail (no lat/lon on CanonicalSubmission) — todo logged.*
- [x] Performance scorecards (worker + auditor), a cross-project leaderboard, and admin-configurable SLA/performance alerts on the Overview (inline KPI badges + Stalled Projects card), plus a read-only office-engineer scorecard — *Validated in Phase 9: Performance Scorecards, Leaderboard & Alerts (PERF-01/02/03/05/06). New `tenant_settings` table (configurable thresholds). 13/13 code truths verified; 6 browser behaviors deferred to manual checks (09-HUMAN-UAT.md). Known follow-up: make the 0007 seed FK-safe for fresh/preview DBs — todo logged.*
- [x] Hakkediş billing: office engineer can create draft progress-payment periods (D-92 construction-typical deduction preset), compute the yeşil-defter cumulative model (Istanbul-tz cutoff, chained off the latest finalized period only), apply the configurable Turkish deduction chain (KDV + tevkifat + stopaj toggle + teminat + avans → Net Ödeme) in Postgres `numeric`, advance payment status (`draft → finalized → submitted → paid`) under a typed transition map, and finalize an irreversible immutable snapshot — *Validated in Phase 10: Hakkediş Billing (HAK-01..HAK-05). Migration 0008 applied on both Neon branches (4 deduction columns + DB-generated `period_qty`); 288/288 vitest suite green; SECURITY threats_open: 0 (14/14 closed, ASVS L1); HUMAN-UAT complete (5/5). Known follow-ups: WR-03 aria-label key, WR-05 double-auth in createPeriod, WR-06 CurrencySelector desync, plus 4 info notes — non-blocking, tracked in 10-REVIEW.md for `/gsd:code-review 10 --fix`.*
- [x] Bilingual TR/EN Excel exports + Turkish-glyph PDF hakkediş certificate, all auth-guarded: submission ledger Excel with active filters and canonical record shape, three-sheet hakkediş Excel (Yeşil Defter / Fiyat İcmali / Hesap Özeti), worker + auditor performance summary Excel (OE excluded per D-110), and a hakkediş PDF rendered with embedded DejaVu Sans for full Turkish glyph coverage; all four route handlers explicitly call `auth()` first and return 401 JSON on no session — *Validated in Phase 11: Exports (EXP-01..EXP-04). 33/33 phase-level tests + 341/341 full suite green; TypeScript clean; 5/5 must-haves verified; 4 human visual gates approved live during Wave 6 UATs (11-HUMAN-UAT.md status: resolved). Distributed trigger surface (D-108) shipped via both the Exports hub page and the period-detail controls. **Follow-up — UX/brand pass:** user has flagged that the broader dashboard UI/UX feels off bayrak.ai brand; a dedicated style/brand phase is owed before further surfaces ship. **Follow-up — submission-driven hakkediş:** user has surfaced a new requirement that approved Telegram work-application messages should drive hakkediş creation (today it's period-rollup only). Both items are scoped for the next milestone, not for Phase 11.*

### Active

- [ ] Worker submits a daily work log via a step-by-step conversational Telegram bot (photo → location share → quantity → notes → confirm), guided sequentially with reprompts on skipped/invalid steps
- [ ] System identifies a worker by their Telegram User ID, mapped to a project assignment in the database
- [ ] Worker selects an active project from an inline keyboard of projects assigned to them
- [ ] Bot enforces input types: photo required (reject text), native Telegram location share required, numeric quantity required
- [ ] On confirmation, submission is persisted with `status: pending_audit` and a webhook pings the assigned auditor
- [ ] Auditor receives a Telegram summary (photo, location/map link, quantity, notes) with inline [✅ Approve] and [❌ Reject] buttons
- [ ] On Approve → `status: approved`, BOQ line for that material auto-decrements, dashboard map updates
- [ ] On Reject → bot prompts auditor for a text reason, sets `status: rejected`, notifies the worker
- [ ] Office Engineer manages projects and Bill of Quantities (BOQ_Items) in a Next.js dashboard
- [ ] Office Engineer uploads the pipeline route as a GeoJSON LineString
- [ ] Office Engineer authenticates to the dashboard via email magic-link (Auth.js)
- [ ] AI assist (vision/LLM) flags photo/location anomalies and auto-classifies submitted work to help the auditor decide
- [ ] Worker bot operates in Turkish; dashboard is TR/EN switchable

### Out of Scope

- WhatsApp bot integration — explicitly excluded for MVP; Telegram is free, has free auth, and no per-message fees (inherited from saha ADR-0005)
- Hakkediş (interim payment certificate) PDF generation — saha already does this; deferred until the core comms+geo+audit loop is proven
- CAD/DWG viewer and manual pin-on-drawing mapping — superseded by the GeoJSON+PostGIS geospatial approach; deferred
- H&S / legal / supplies form library — saha feature, not core to the bayrak.ai loop
- Multi-tenancy — building single-tenant first; multi-tenant chassis is a known v2 path (saha ADR-0001)
- Dedicated mobile-web auditor review view — Telegram inline approval covers v1; richer mobile-web audit deferred to v2
- CAD symbol auto-detection / BOQ auto-extraction from drawings — heavy ML, out of scope (saha ADR-0002)

## Context

**Lineage — evolution of `saha` (clean-room).** bayrak.ai is the productized evolution of the user's existing `saha` project (`~/saha/`), a production-live Next.js app deployed on Vercel and used by the MAFE KANAL family firm. bayrak.ai is being built **clean-room**: saha's code is **not** copied; instead saha's 8 ADRs, glossary (`~/saha/GLOSSARY.md`), and proven patterns serve as reference. Key saha learnings carried forward conceptually:
- Telegram is the right field channel (free, free auth, no per-message fees) — ADR-0005
- AI-buildable stack: Next.js + TypeScript + Drizzle + Tailwind + shadcn/ui + grammY + Vercel + Neon — ADR-0007
- Turkish-first UI with English available — ADR-0009-era i18n work
- Domain vocabulary: Project, Branch/Sub-Branch, Chainage, BOQ/Contract Line Item, Activity

**Deliberate divergences from saha** (decided during questioning):
- saha skipped geospatial (PostGIS/Mapbox) in favor of manual CAD pins + chainage; **bayrak.ai makes a real geospatial layer (PostGIS + GeoJSON + Mapbox + GPS capture) its core differentiator**
- saha uses a Telegram **Mini App**; bayrak.ai uses a **conversational state-machine bot** (needed for native location sharing)
- saha is described as monolith; bayrak.ai's brief mentioned Express but we chose a **Next.js monolith** (one deploy, solo-friendly)
- bayrak.ai adds a **formal on-site auditor approval gate** (`pending_audit → approved/rejected`) that saha lacks

**Domain.** Linear infrastructure construction (pipelines, utility networks). Region: Turkey (Trakya). Workers in the field; engineers auditing on-site; office planners remote. The user has the `bayrak.ai` domain.

## Constraints

- **Tech stack**: Next.js (App Router) monolith on Vercel; Node/TypeScript route handlers for the Telegram webhook — chosen for single-deploy simplicity and solo+AI build velocity (saha ADR-0007)
- **Database**: PostgreSQL with the **PostGIS** extension (Neon supports PostGIS) — required for native nearest-segment spatial queries
- **ORM**: Drizzle — typed, lightweight, proven in saha
- **Telegram**: grammY framework; bot must support inline keyboards, photo/location message types, and inline callback buttons; field auth via Telegram User ID (HMAC where applicable)
- **Mapping**: Mapbox GL JS (Leaflet is an acceptable fallback); requires a Mapbox token
- **AI**: AI SDK via Vercel AI Gateway, default to latest Claude models for vision/anomaly assist; eval rigor required since AI is in v1
- **Auth (web)**: Auth.js email magic-link for Office Engineers
- **Localization**: Turkish-first worker bot; TR/EN switchable dashboard (i18n-ready from the start)
- **Team**: Solo founder build with AI assistance
- **Tenancy**: Single-tenant MVP; do not hardcode tenant identity in a way that blocks a future multi-tenant migration

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Clean-room build; saha as reference only | New geospatial + conversational-bot architecture diverges enough from saha that forking would mean replacing large parts; ADRs/glossary still reusable | — Pending |
| Next.js monolith (not separate Express API) | One deploy on Vercel, solo-friendly, proven in saha; Telegram webhook = a route handler | — Pending |
| Conversational state-machine bot (not Mini App) | Native Telegram location sharing works cleanly in a chat flow; Mini Apps handle GPS share awkwardly | — Pending |
| PostGIS + GeoJSON + Mapbox + GPS as core | The defining differentiator over saha; enables nearest-segment matching and live map progress | — Pending |
| Formal auditor approval gate via Telegram inline buttons | Trustworthy verified loop is the core value; on-site auditor is the human check | — Pending |
| AI vision/anomaly assist in v1 | User wants auditor decision support from the start; accept the added eval rigor | — Pending |
| Auth.js email magic-link for office dashboard | Passwordless, low-maintenance for a small office team; saha-proven | — Pending |
| Single-tenant MVP | Faster to real usage with the family-firm context; multi-tenant is a known v2 path | — Pending |
| Lean scope (defer hakkediş/CAD/forms) | Prove the comms+geo+audit loop first; saha already has the deferred features if needed | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-28 — v3.0 milestone opened (Submission-Driven Hakkediş & UX Brand Pass) following Phase 11 close.*
