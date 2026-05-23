# Phase 1: Foundation - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers the **data foundation + office control plane** for bayrak.ai:
- The complete Drizzle + PostGIS schema that all downstream phases build on (PostGIS enabled in the first migration; `geography` for distance, `geometry(linestring,4326)` for routes via a manual migration-SQL edit).
- Office Engineer authentication via Auth.js v5 magic-link, restricted to an allowlist.
- Office CRUD for: projects, BOQ line items (manual + Excel import), GeoJSON route upload, and people (workers/auditors) registration + project assignment.
- A minimal Telegram `/start` webhook handler that captures a person's Telegram ID into a "pending people" list (the full conversational flow is Phase 2).
- TR/EN dashboard language toggle (next-intl).

Requirements in scope: AUTH-01, AUTH-02, AUTH-03, AUTH-04, SETUP-01, SETUP-02, SETUP-03, SETUP-04, I18N-02.

**Not this phase:** the conversational worker bot (Phase 2), the audit loop (Phase 3), PostGIS nearest-segment matching logic (Phase 4 — schema columns exist here, matching does not), the Mapbox dashboard (Phase 5), AI assist (Phase 6).
</domain>

<decisions>
## Implementation Decisions

### Worker/Auditor Onboarding & Identity
- **D-01:** Onboarding is **self-start + office approval**. A person opens the bot and taps Start; the bot's `/start` handler captures their Telegram user ID (and Telegram name) into a `pending_people` list. The office then sets their display name, role (worker/auditor), and project assignment(s) from the dashboard, which promotes them to an active person. No manual entry of raw numeric Telegram IDs.
- **D-02:** This requires a **minimal Telegram webhook + `/start` handler in Phase 1** — just enough to register a pending person and acknowledge them. The full conversational state machine is Phase 2. (This is the implementation of in-scope AUTH-02/03, not new scope.)
- **D-03:** A person can hold a role (worker and/or auditor) and be assigned to one or more projects (AUTH-04). Model the person↔project assignment as a join table carrying the role, so the same person could be a worker on one project and an auditor on another if needed.

### BOQ Setup
- **D-04:** Phase 1 ships **both** manual BOQ line-item CRUD **and** a spreadsheet importer.
- **D-05:** Import format is **Excel `.xlsx`** (ExcelJS) with a **downloadable template**; columns map to material, unit, contracted quantity. Show a preview-then-confirm step before committing imported rows. CSV import is a nice-to-have, not required for Phase 1.
- **D-06:** BOQ line item fields for v1: material/description, unit (e.g., m, m³, pc), contracted quantity, and a derived/maintained remaining balance. **Unit price is omitted in v1** (only needed for the deferred hakkediş feature) — leave the schema able to add a nullable `unit_price` later.

### Route (GeoJSON) Ingestion
- **D-07:** The pipeline route enters via **`.geojson` file upload**. The server validates it is a single WGS84 **LineString** (coordinate order `lng,lat`) before saving; reject anything else with a clear error.
- **D-08:** Store the route as `geometry(linestring,4326)`. Because Drizzle generates `geometry(point,4326)` by default, the generated migration SQL **must be hand-edited** to `linestring` — document this in the migration file as a comment so it isn't silently regressed.

### Data Model & Multi-Tenancy
- **D-09:** Add a **nullable `tenant_id`** to every domain table now, with a single default tenant seeded for v1. This keeps the future multi-tenant migration cheap (saha ADR-0001 lesson) at negligible upfront cost. Do not build any tenant-switching UI in v1.
- **D-10:** PostGIS extension is created in the **first migration** (`CREATE EXTENSION IF NOT EXISTS postgis;` as the first statement). Spatial columns use `geography` where metre-accurate distance is needed (downstream phases); the route is `geometry(linestring,4326)`. GiST indexes on spatial columns.

### Office Authentication
- **D-11:** Magic-link login (Auth.js v5 beta + `@auth/drizzle-adapter`) is **restricted to an allowlist** of office emails (env-configured list and/or an `office_users` table). A magic-link request for a non-allowlisted address must not grant access. This is mandatory — open magic-link would let anyone sign in.

### Claude's Discretion
- Exact table/column names, indexes, and Drizzle schema organization — planner/executor decide, honoring D-06/D-09/D-10.
- Dashboard information architecture (project list → project detail with BOQ / route / people sections) — sensible shadcn/ui layout; `/gsd:ui-phase 1` can refine if run.
- Where the allowlist lives (env var vs DB table) — pick the simpler robust option during planning.
- Excel template column headers and validation error copy (TR/EN).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — product vision, locked decisions, constraints (single-tenant hedge, stack)
- `.planning/REQUIREMENTS.md` — v1 requirements; Phase 1 = AUTH-01–04, SETUP-01–04, I18N-02
- `.planning/ROADMAP.md` §"Phase 1: Foundation" — goal + 5 success criteria

### Research (stack, architecture, pitfalls)
- `.planning/research/STACK.md` — exact libraries/versions: Neon+PostGIS enablement, Drizzle geometry/geography patterns + LineString manual-migration caveat, Auth.js v5 beta + Drizzle adapter, grammY webhook on Vercel, next-intl 4.x
- `.planning/research/ARCHITECTURE.md` — entity/data-model sketch, component boundaries, build order
- `.planning/research/PITFALLS.md` — coordinate order (lng,lat), geography vs geometry, PostGIS extension migration, tenant_id-from-day-one, idempotency table groundwork
- `.planning/research/SUMMARY.md` — cross-cutting risk table + resolved open decisions

### Reference only (sibling project — DO NOT copy code; clean-room build)
- `/Users/arifismailbayrak/saha/docs/adr/0001-*.md` — multi-tenant chassis rationale (informs D-09)
- `/Users/arifismailbayrak/saha/docs/adr/0004-data-model-project-hierarchy-structures-parties.md` — proven project/BOQ data-model shape
- `/Users/arifismailbayrak/saha/GLOSSARY.md` — domain vocabulary (BOQ/Contract Line Item, Project, Branch, Chainage)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None in this repo — greenfield, clean-room build. No code copied from saha; saha serves as a pattern/ADR reference only (see canonical refs).

### Established Patterns
- None yet. Phase 1 establishes the foundational patterns (Drizzle schema conventions, Server Actions for office CRUD, Auth.js session handling, next-intl setup) that later phases follow.

### Integration Points
- The `/api/telegram/webhook` route handler created here (minimal `/start`) is the same entry point Phase 2 extends into the full conversational flow.
- The `people` / `pending_people` and `assignments` tables defined here are read by Phase 2 (worker identification) and Phase 3 (auditor authorization).
- The `boq_items` table defined here is decremented by Phase 3's atomic approval transaction.
- The route `geometry(linestring,4326)` column defined here is queried by Phase 4 (nearest-segment) and rendered by Phase 5 (Mapbox).
</code_context>

<specifics>
## Specific Ideas

- Self-start onboarding: the bot's first reply to `/start` from an unknown user should be a friendly "you're pending approval" message (TR), so workers aren't confused before the office activates them.
- Excel import mirrors saha's proven preview→confirm UX, but built fresh.
</specifics>

<deferred>
## Deferred Ideas

- **Draw-route-on-map** ingestion — nicer UX than file upload; revisit alongside the Phase 5 Mapbox dashboard or later.
- **CSV BOQ import** — only Excel `.xlsx` is required for Phase 1; add CSV if real BOQs arrive that way.
- **BOQ unit price** — needed only for hakkediş (v2); schema leaves room.
- **Tenant-switching / multi-tenant UI** — schema hedge only in v1; full multi-tenancy is v2 (TEN-01).
</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-05-23*
