# Project Research Summary

**Project:** bayrak.ai
**Domain:** Linear-infrastructure field-ops platform — conversational Telegram bot + geospatial dashboard + BOQ auto-deduction + AI vision assist
**Researched:** 2026-05-23
**Confidence:** HIGH

---

## Executive Summary

bayrak.ai is a single-tenant B2B operational platform for pipeline and utility-network subcontractors in Turkey. The core loop is narrow and well-defined: a field worker submits a structured work log through a conversational Telegram bot; an on-site auditor approves or rejects from Telegram inline buttons; on approval the Bill of Quantities decrements atomically and the dashboard map updates with the geolocated point. All four research streams converge on the same architecture — a Next.js 15 App Router monolith on Vercel, Neon/PostGIS for spatial persistence, grammY for the Telegram bot, Drizzle ORM, Mapbox GL JS for the live map, and the Vercel AI SDK + Claude vision for the advisory AI layer. This stack is proven (saha project), serverless-native, and solo-build-friendly.

The recommended build order is fixed by hard dependency chains: data model and dashboard scaffold first (projects/BOQ/assignments must exist before the bot can function), then bot conversation layer, then audit approval loop, then PostGIS spatial layer, then map UI, then AI vision. Skipping this order is not an option — the audit transaction needs the BOQ schema; the map needs approved_points that only exist after the audit loop; the AI needs both a photo and the submission row. Every phase gate produces a usable, testable artifact before the next phase begins.

The most consequential risks are cross-cutting and must be addressed in Phase 1, not retrofitted. The grammY conversations replay engine will silently create duplicate submissions and double BOQ deductions unless every database call is wrapped in `conversation.external()` from the first commit. Webhook idempotency — respond 200 immediately via `after()`, guard BOQ deductions with `SELECT FOR UPDATE` — must be the architecture, not an afterthought. PostGIS coordinate order (`ST_MakePoint(longitude, latitude)` not `(latitude, longitude)`) and the geometry-vs-geography type distinction (use `::geography` casts for metre-accurate distance thresholds) are silent data-corruption bugs if missed. Three product decisions remain genuinely open and must be resolved in requirements before Phase 2 or 3 can be planned: (1) work-to-BOQ-line-item mapping mechanism, (2) auditor identity model (per-project vs per-segment), and (3) AI anomaly-flag acceptance criteria and eval gate before flags are shown to auditors.

---

## Key Findings

### Recommended Stack

The stack is pinned by constraints in PROJECT.md and confirmed at high confidence by official documentation. Every library is either saha-proven or the sole viable option for the integration point.

**Core technologies:**

- **Next.js 15.x (App Router)** — monolith host for dashboard RSCs, Telegram webhook route handler, AI vision route handler, Auth.js pages. Single Vercel deploy. Use stable 15.x, not the 16.x canary.
- **TypeScript 5.x** — all code. Type safety across BOQ schema, conversation state, PostGIS geometry, and AI response parsing is load-bearing.
- **Neon (PostgreSQL 16) + PostGIS** — primary database. Enable via `CREATE EXTENSION IF NOT EXISTS postgis` in migration 0000. Neon supports PostGIS on all plans.
- **drizzle-orm 0.45.x / drizzle-kit 0.31.x** — typed ORM. All PostGIS operations use `sql` tagged template literals. No native `geography` type or `ST_*` functions. LineString columns require a manual migration SQL edit (change generated `geometry(point,4326)` to `geometry(linestring,4326)`).
- **grammy 1.43.x** — Telegram bot. Webhook via `webhookCallback(bot, 'std/http')` exported as `POST` from `app/api/telegram/webhook/route.ts`. Set `maxDuration: 55` in `vercel.json`.
- **@grammyjs/conversations 2.1.x** — replay-engine state machine for the 6-step worker submission flow. All DB calls, time calls, and random calls MUST use `conversation.external()`.
- **@grammyjs/storage-psql 2.5.x** — Neon-backed conversation/session persistence. Mandatory for serverless; never use `MemorySessionStorage` in production.
- **next-auth 5.0.0-beta.31 + @auth/drizzle-adapter 1.11.x + resend 6.12.x** — email magic-link auth for office engineers. Beta stable >1 year; do not use next-auth v4 with App Router.
- **mapbox-gl 3.24.x + react-map-gl 8.1.x** — client-side map rendering. Must be `'use client'`. Restrict `NEXT_PUBLIC_MAPBOX_TOKEN` to `*.bayrak.ai` in Mapbox Studio before sharing any dashboard URL.
- **ai (Vercel AI SDK) 6.0.x + Vercel AI Gateway** — Claude vision (`anthropic/claude-sonnet-4.5`) for photo anomaly flagging. AI call fires via Next.js `after()` hook — never awaited in the webhook handler.
- **@vercel/blob 2.4.x** — photo storage. Photos downloaded from Telegram API and piped to Blob at submission; URL stored on `submissions.photo_url`.
- **next-intl 4.12.x** — TR/EN dashboard i18n. Turkish-only worker bot in v1.
- **shadcn/ui (shadcn@4.8.x CLI) + Tailwind CSS 4.3.x** — dashboard UI components.

### Expected Features

**Must have for launch (P1 — core loop):**
- Guided 6-step bot submission: project select → photo → native location → quantity → notes → confirm (Turkish)
- Input enforcement with reprompt loops: photo required, native Telegram location required (`Keyboard.requestLocation()`), numeric quantity required
- Turkish decimal normalisation: `"123,5"` → `123.5` before `parseFloat`
- `status: pending_audit` on insert; immediate auditor Telegram notification with photo, Google Maps link, quantity, notes, Approve/Reject inline buttons
- Auditor authorization check: `callback_query.from.id` must match the assigned auditor's `telegram_user_id` for the project
- Approve: atomic three-write transaction (submission status → approved, boq_items.approved_qty += qty, insert approved_points)
- Reject: auditor provides text reason, worker notified, status → rejected
- Office dashboard: create/edit projects, define BOQ line items, assign workers and auditors
- GeoJSON LineString upload per project
- PostGIS nearest-segment matching at submission time: `ST_DWithin` gate (500m), `ST_LineLocatePoint` for `segment_fraction`, `ST_ClosestPoint` for `snapped_point`
- Mapbox map overlay: route LineString layer + approved_points circle layer (color by status)
- Auth.js email magic-link for office engineers
- AI vision/anomaly assist (advisory, async via `after()`, requires eval gate before showing to auditors)
- TR/EN switchable dashboard; Turkish-only worker bot

**Should have after core loop is proven (P2):**
- Explicit BOQ line item selection by worker (State 2.5 keyboard) — needed when project has multiple active BOQ items
- `location_warning` flag surfaced in auditor Telegram notification
- Segment-level map coloring (colored LineString fractions, not just points)
- Dashboard BOQ summary stats (approved_qty / planned_qty per line item)
- Excel BOQ import via ExcelJS
- Worker submission history in bot (`/geçmiş` command)

**Defer to v2+:** Multi-tenancy, hakkediş PDF, mobile-web auditor UI, Gantt/TILOS visualization, WhatsApp bot.

### Architecture Approach

The system is a Next.js monolith with a single Vercel deploy. The Telegram webhook (`POST /api/telegram/webhook`) is a plain Next.js route handler that hosts the grammY bot instance. All worker dialog state lives in Neon via `@grammyjs/storage-psql`. The audit approval handler is a `callbackQuery` handler in the same bot instance, not a separate service. The AI vision route (`POST /api/ai/vision`) is a separate route handler invoked fire-and-forget via `after()` after the webhook returns 200. The dashboard is pure App Router — RSCs fetch data via Drizzle and pass GeoJSON to a `'use client'` Mapbox component. Auth.js guards the entire `/dashboard/*` subtree.

**Major components and responsibilities:**

1. **grammY webhook handler** (`/api/telegram/webhook`) — receives all Telegram updates; routes to BotConversation engine or AuditCallbackHandler; returns 200 before heavy processing
2. **BotConversation engine** (States 0–6) — worker dialog state machine; persists replay state in Neon sessions table; wraps all side effects in `conversation.external()`
3. **AuditCallbackHandler** — validates auditor identity; runs three-write approval transaction; `answerCallbackQuery` in every code path
4. **AuditService** — approval transaction: `UPDATE submissions WHERE status='pending_audit' RETURNING id` (optimistic lock) → `UPDATE boq_items SET approved_qty += qty` → `INSERT approved_points`
5. **SpatialService** — `ST_DWithin` + `ST_LineLocatePoint` + `ST_ClosestPoint` run synchronously before submission persists; sets `location_warning`, `segment_fraction`, `snapped_point`
6. **AI Vision route handler** (`/api/ai/vision`) — receives `{submission_id, photo_url, project_id}`; calls Claude vision; writes `vision_results`; sends follow-up Telegram message to auditor on high-confidence flag
7. **Dashboard (App Router RSC)** — project/BOQ CRUD, GeoJSON upload, map view; `ProjectMap` is `'use client'` Mapbox component
8. **NotificationService** — thin `bot.api.sendMessage` wrapper for outbound auditor ping and worker rejection notice

**Full data model entities:** `projects`, `workers`, `assignments`, `boq_items`, `submissions`, `approved_points`, `vision_results`, `sessions` (grammY). Add `tenant_id` to every domain table from migration 0000.

### Critical Pitfalls

All items below have "never acceptable" status per PITFALLS.md — deferring any of them risks data corruption.

1. **grammY conversations replay — `conversation.external()` for every side effect**: The conversation function re-executes from the top on every incoming message. Any DB write, read, `Date.now()`, or `Math.random()` outside `conversation.external()` fires on every replay, creating duplicate submission rows and double BOQ deductions. Write an integration test day one: send same update twice, assert one DB row.

2. **Webhook idempotency + BOQ double-deduction**: Telegram retries on non-200 or timeout; auditors double-tap on phones. Fix: (a) respond 200 immediately at route handler top, (b) run heavy processing via `after()`, (c) use `SELECT FOR UPDATE` inside serializable transaction with `WHERE status='pending_audit' RETURNING id` — if no rows returned, it was already processed. Add `CHECK (approved_qty <= planned_qty)` as last-resort DB guard.

3. **PostGIS coordinate order — `ST_MakePoint(longitude, latitude)`**: Telegram sends `{latitude, longitude}`; PostGIS and GeoJSON expect X=longitude, Y=latitude. Swapping places every submission in the wrong location. Unit test: store Istanbul coordinate, read with `ST_AsGeoJSON`, assert `[28.9, 41.0]` (lng first, not lat first).

4. **geometry vs geography — `::geography` cast for metre-accurate thresholds**: `ST_DWithin(geom_col, point, 500)` on `geometry` means 500 degrees, not 500 metres. Cast at query time: `ST_DWithin(col::geography, point::geography, 500)`. Store with SRID 4326 always; cast to geography in distance queries.

5. **Auditor authorization not enforced**: Any Telegram user who sees the auditor notification can tap Approve. Always: parse `submission_id` from `callback_data`, query `assignments` for the auditor's `telegram_user_id`, compare with `ctx.callbackQuery.from.id`, reject unauthorized with `answerCallbackQuery`. Call `answerCallbackQuery` in every code path including errors.

6. **AI vision in sync webhook path**: Claude vision takes 3–8 seconds, exceeding Vercel's 10-second free-tier limit and Telegram's timeout. Use `after(() => fetch('/api/ai/vision', ...))` after 200 is sent. Never `await` the AI call in the webhook handler.

7. **PostGIS extension not in migration 0000**: `CREATE EXTENSION IF NOT EXISTS postgis` must be the first migration file. Drizzle does not create extensions. Missing it means `ERROR: type "geometry" does not exist` on every geometry column and `ST_*` call, breaking CI on fresh Neon preview branches.

8. **No `tenant_id` on domain tables**: Adding `tenant_id NOT NULL` after data exists requires a multi-step migration across every domain table. Recovery cost is VERY HIGH. Add `tenant_id` to every domain table from migration 0000, with a `tenants` table and single seed row. Never query without `WHERE tenant_id = ?`.

---

## Implications for Roadmap

All four research files converge on the same 6-phase build order. Ordering is determined by hard dependency chains, not preference.

### Phase 1: Foundation — Data Model + Dashboard Scaffold + Auth

**Rationale:** Projects, BOQ items, and worker assignments must exist before any bot conversation can function. PostGIS schema (geometry columns, GiST indexes, SRID, `::geography` cast pattern) must be correct from day one — wrong types require full re-migration to fix. Auth gates the dashboard.

**Delivers:** Neon database with PostGIS enabled, full Drizzle schema (all 8 entities + `tenant_id` + `sessions` table), Next.js project scaffold, Auth.js magic-link login, office dashboard for project/BOQ/assignment CRUD, GeoJSON route upload endpoint.

**Addresses:** Office dashboard project + BOQ management, GeoJSON LineString upload, email magic-link auth, TR/EN dashboard i18n scaffold.

**Must resolve in this phase:** PostGIS extension in migration 0000, geometry vs geography type decision, GiST indexes on all spatial columns, `tenant_id` on every domain table, coordinate order unit test, Turkish decimal normalisation utility.

**Research flag:** Standard patterns — Next.js + Drizzle + Auth.js + PostGIS all have official documentation and working code in STACK.md. No additional research needed. Document the LineString migration SQL edit as a required manual step.

---

### Phase 2: Bot Core — Worker Conversation State Machine

**Rationale:** The bot depends only on Phase 1 schema. This phase delivers the grammY sessions infrastructure that must be proven durable before the audit loop is built on top of it.

**Delivers:** grammY bot instance + `@grammyjs/storage-psql` wired to Neon, worker conversation (States 0–6) with full reprompt loops, submission persistence with `status: pending_audit`, `conversation.external()` on all DB calls, `Keyboard.requestLocation()` at location step, Turkish decimal normalisation at quantity step, Vercel webhook route with `force-dynamic` and `maxDuration: 55`.

**Addresses:** Guided step-by-step submission, photo/location/quantity enforcement, project inline keyboard, pending audit status on insert.

**Must avoid:** grammY replay side effects. Verify: send same update twice, assert one DB row. Respond 200 before processing.

**Open decision blocking this phase:** Work-to-BOQ-line-item mapping mechanism (see Open Decisions below).

**Research flag:** Standard — grammY conversations official docs + working code examples in STACK.md.

---

### Phase 3: Audit Loop — Approve/Reject + BOQ Transaction

**Rationale:** The auditor approval gate is the trust mechanism and the transaction boundary for BOQ deductions. Depends on Phase 2 (submissions with `status: pending_audit` must exist). Completing this phase delivers the minimum viable core loop for real user validation.

**Delivers:** `AuditCallbackHandler` with auditor identity check, three-write approval transaction, worker rejection notification with reason, auditor Telegram notification (ping on submission), double-approval idempotency guard, `answerCallbackQuery` in all code paths.

**Addresses:** Auditor Telegram notification, inline Approve/Reject, BOQ line item decrement on approval, reject reason + worker notification.

**Must avoid:** BOQ double-deduction (`SELECT FOR UPDATE` in serializable transaction). Auditor authorization bypass. `answerCallbackQuery` in every path.

**Open decision blocking this phase:** Auditor identity model (see Open Decisions below).

**Research flag:** Standard — Drizzle transaction pattern + grammY callback query handling are well-documented.

---

### Phase 4: Spatial Layer — PostGIS Matching + Approved Points

**Rationale:** Spatial matching runs synchronously at submission time and provides real `segment_fraction` and `snapped_point` data for the `approved_points` insert in Phase 3's approval transaction.

**Delivers:** `SpatialService` with `ST_DWithin` proximity gate (500m), `ST_LineLocatePoint` for `segment_fraction`, `ST_ClosestPoint` for `snapped_point`, `location_warning` flag, real `approved_points` rows with geometry.

**Addresses:** PostGIS nearest-segment matching, GPS-proximity warning flag, `approved_points` populated correctly for map.

**Must avoid:** Coordinate order bug. Geometry vs geography distance thresholds. Missing GiST index (verify with `EXPLAIN ANALYZE`).

**Research flag:** Standard — all PostGIS queries have working SQL in STACK.md and ARCHITECTURE.md.

---

### Phase 5: Dashboard Map + BOQ Progress UI

**Rationale:** The map requires approved_points (Phase 4), route geometry (Phase 1), and Auth.js session (Phase 1). The office engineer's primary view of verified progress.

**Delivers:** `ProjectMap` client component (Mapbox GL JS, route LineString layer, approved_points circle layer colored by status), BOQ progress table (approved_qty / planned_qty), project list + per-project dashboard page, route GeoJSON served via Server Action with caching and `@turf/simplify` simplification on upload.

**Addresses:** Map overlay of approved submissions, BOQ progress dashboard, Mapbox route + point layers.

**Must avoid:** Mapbox token URL-restriction set before dashboard URL is shared. GeoJSON simplification on upload. `'use client'` component for Mapbox.

**Research flag:** Standard — Mapbox GL JS + react-map-gl + GeoJSON Source/Layer pattern has working code in STACK.md.

---

### Phase 6: AI Vision Assist

**Rationale:** AI vision is in-scope for v1 but purely additive — the core loop works without it. Placed last to allow time to define the eval harness with real submission photos from early testing. Requires: submission row (Phase 2), photo URL (Phase 2), `vision_results` table (Phase 1 schema), dashboard submission card (Phase 5).

**Delivers:** `/api/ai/vision` route handler, AI SDK `generateText` call with Claude vision, `vision_results` insert, anomaly badges on dashboard submission card, high-confidence flag follow-up Telegram message to auditor, eval dataset of ~20 real photos with ground truth measured before flags are shown to any auditor.

**Addresses:** AI vision/anomaly assist (advisory only, never auto-approve or auto-reject).

**Must avoid:** AI in sync webhook path (use `after()` always). Prompt injection via worker notes (treat notes as data in system prompt, not instructions). Showing AI flags to auditors before eval gate is passed.

**Open decision blocking this phase:** AI anomaly-flag acceptance criteria and eval gate (see Open Decisions below).

**Research flag:** Needs a targeted research spike on Claude vision prompt design for Turkish construction-site photos before writing the prompt. The AI SDK integration pattern is fully documented in STACK.md; the domain-specific prompt design and eval harness are not.

---

### Phase Ordering Rationale

The dependency chain is strict and non-negotiable:
- Phase 1 schema gates every other phase — no schema means no bot, no audit, no spatial, no map, no AI
- Phase 2 bot gates Phase 3 — no submissions means no approvals
- Phase 3 audit loop gates Phase 4 — the `approved_points` insert in the approval transaction is enriched by Phase 4's spatial data
- Phase 4 spatial data gates Phase 5 map — no snapped points means empty map
- Phase 5 dashboard gates Phase 6 AI — the submission card where AI flags are displayed must exist
- Phase 6 AI is independent of Phase 4 and could theoretically be moved earlier, but the dashboard card it writes to doesn't exist until Phase 5

Each phase corresponds to a named architecture component (SpatialService, AuditService, BotConversation, AI Vision route handler), making each phase independently testable before the next begins.

### Research Flags

**Needs deeper research during planning:**
- **Phase 6 (AI Vision):** Claude vision prompt design for Turkish construction-site photos. What constitutes a "location mismatch" anomaly in this domain? What structured output schema for anomaly flags? Recommend a light research spike with 5–10 example photos before writing the prompt.

**Standard patterns — skip research-phase:**
- **Phase 1:** Next.js + Drizzle + Auth.js + PostGIS schema — official documentation and working code in STACK.md
- **Phase 2:** grammY conversations + storage-psql — official docs + working code in STACK.md
- **Phase 3:** Drizzle transactions + grammY callback query — well-documented
- **Phase 4:** PostGIS ST_* functions — working SQL in STACK.md and ARCHITECTURE.md; verify by executing in Neon SQL editor
- **Phase 5:** Mapbox GL JS + react-map-gl — official tutorials + working code in STACK.md

---

## Open Decisions — Must Resolve in Requirements

These three decisions are genuinely unresolved across all four research files. Phases 2, 3, and 6 cannot be planned in detail until they are closed.

### Decision 1: Work → BOQ Line Item Mapping Mechanism

**Question:** At what point in the workflow, and by whom, is a submission linked to a specific BOQ line item?

**Options:**
- (A) **One BOQ item per project (auto-assign):** Simplest. State 0 (project selection) implicitly selects the only active BOQ item. Breaks if a project tracks multiple material types simultaneously.
- (B) **Worker selects activity at State 2.5:** Bot adds inline keyboard between Photo and Location steps. Worker picks "DN200 Boru" vs "Dolgu" etc. Requires clean BOQ item labels that field workers understand.
- (C) **Auditor assigns at approval time:** `boq_item_id` is null until approval. More flexible but adds friction to the audit step.

**Recommended:** Resolve in requirements session with a real MAFE KANAL BOQ example. If a single pipeline run has one dominant material, option A is correct for v1 with option B as a v1.x extension.

### Decision 2: Auditor Identity Model

**Question:** How is "the auditor for this submission" determined?

**Options:**
- (A) **One auditor per project:** Single `assignments` row with `role='auditor'` per project. Simple lookup. Works for small teams with dedicated auditors.
- (B) **Multiple auditors per project, any can approve:** Multiple auditor rows per project; any assigned auditor can approve any submission from that project.
- (C) **Auditor per pipeline segment:** Requires a `segments` table and auditor-segment assignments. Architecturally heavier.

**Recommended:** Option A is almost certainly correct for v1 given single-tenant, small-team context. Resolve before Phase 3 planning.

### Decision 3: AI Anomaly-Flag Acceptance Criteria and Eval Gate

**Question:** What criteria must be met before AI anomaly flags are shown to auditors?

**Sub-questions:**
- What precision/recall on the eval dataset constitutes "acceptable"?
- What risk levels trigger a Telegram follow-up message vs silent dashboard flag only?
- What is the minimum eval dataset size (research suggests ~20 photos with known ground truth)?
- Does the flag show confidence percentage? Does it use the word "anomaly" or softer language?

**Recommended:** Define before Phase 6 planning. The eval harness must be designed and the acceptance threshold agreed before writing the AI prompt, not after. This is the most domain-specific open decision and benefits from a targeted research spike.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry and official docs; all integration patterns have working code in STACK.md |
| Features | HIGH | Table stakes validated against industry tools; feature dependencies fully mapped; MVP definition is precise |
| Architecture | HIGH | Component boundaries confirmed by grammY/PostGIS/Drizzle official docs; data model is complete; build order is dependency-driven |
| Pitfalls | HIGH | All critical pitfalls sourced from official docs (grammY replay semantics, Telegram retry behavior, PostGIS geometry/geography) and saha ADR precedents |

**Overall confidence: HIGH**

### Gaps to Address

- **Work-to-BOQ line item mapping mechanism** — open; must close in requirements before Phase 2 planning
- **Auditor identity model** — open; must close before Phase 3 planning
- **AI anomaly-flag acceptance criteria / eval gate** — open; must close before Phase 6 planning; targeted research spike on Claude vision prompt design for construction-site photos recommended
- **Drizzle LineString migration edit** — known limitation documented in STACK.md; must be included as an explicit required step in Phase 1 task definition, not discovered as a surprise
- **Mapbox pricing** — generous free tier for low-traffic dashboards; monitor in Mapbox Studio; Leaflet fallback is architecturally ready if needed

---

## Sources

### Primary (HIGH confidence)
- Neon PostGIS: https://neon.com/docs/extensions/postgis
- Drizzle PostGIS geometry point: https://orm.drizzle.team/docs/guides/postgis-geometry-point
- Drizzle LineString (Atomic Object): https://spin.atomicobject.com/linestring-geometry-drizzle/
- grammY Conversations plugin: https://grammy.dev/plugins/conversations
- grammY Sessions plugin: https://grammy.dev/plugins/session
- grammY Vercel hosting: https://grammy.dev/hosting/vercel
- grammY storages (psql): https://github.com/grammyjs/storages/tree/main/packages
- Vercel AI Gateway: https://vercel.com/docs/ai-gateway/getting-started/text
- Auth.js Resend provider: https://authjs.dev/getting-started/providers/resend
- Auth.js Drizzle adapter: https://authjs.dev/getting-started/adapters/drizzle
- Mapbox GL JS React tutorial: https://docs.mapbox.com/help/tutorials/use-mapbox-gl-js-with-react/
- next-intl App Router: https://next-intl.dev/docs/getting-started/app-router
- PostGIS ST_LineLocatePoint: https://postgis.net/docs/ST_LineLocatePoint.html
- Telegram Bot API: https://core.telegram.org/bots/api

### Secondary (MEDIUM confidence)
- Vitruvi Software — Top Pipeline Construction Software: https://vitruvisoftware.com/blog/top-pipeline-construction-software
- TrueContext — AI-assisted field inspection: https://truecontext.com/blog/field-teams-smarter-inspections-ai-in-construction/
- Mapbox large GeoJSON troubleshooting: https://docs.mapbox.com/help/troubleshooting/working-with-large-geojson-data/
- Multi-tenant Postgres patterns: https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy
- Webhook idempotency: https://hookreplay.dev/blog/webhook-idempotency

### Internal Reference
- saha ADR-0001 through ADR-0009 (multi-tenancy, AI deferral, Telegram channel, stack, i18n patterns)
- saha GLOSSARY.md (Project, Branch, Chainage, BOQ, Activity, Workflow Stage — domain vocabulary)
- bayrak.ai PROJECT.md — constraints, in/out of scope, validated decisions

---
*Research completed: 2026-05-23*
*Ready for roadmap: yes*
