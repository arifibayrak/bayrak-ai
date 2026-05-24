# bayrak.ai

## What This Is

A single-tenant B2B operational platform for linear-infrastructure subcontractors (pipeline and utility-network construction) that replaces unstructured field communication — WhatsApp messages and phone calls — with a structured, trackable, geospatially-aware, AI-assisted communication loop. Field workers log work through a conversational Telegram bot; on-site auditors approve or reject from Telegram; an office dashboard shows live progress on a map and the Bill of Quantities deducts automatically as work is approved.

## Core Value

Every unit of field work flows through one trustworthy loop — **worker submits → auditor approves on-site → central project data (BOQ + map) updates automatically** — so the office always sees real, verified, geolocated progress without chasing anyone on WhatsApp.

## Requirements

### Validated

- [x] PostGIS matches a submission's lat/long to the nearest pipeline segment at submission time, storing a snapped point + segment fraction; submissions beyond a configurable 500 m threshold are flagged so the auditor's Telegram notification carries a distance-anomaly line — *Validated in Phase 4: Spatial Layer (GEO-01, GEO-02). Live-Telegram render deferred to a manual smoke-test (04-HUMAN-UAT.md).*

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
- [ ] Dashboard renders approved work logs as point markers / colored segments overlaying the GeoJSON route (Mapbox GL JS)
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
*Last updated: 2026-05-24 after Phase 4 (Spatial Layer) completion*
