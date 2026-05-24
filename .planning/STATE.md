---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 1 Plan 02b complete — live Neon DB migrated (PostGIS 3.5 + 11 tables + LineString geom + seed tenant); 31/31 tests green; ready for 01-05
last_updated: "2026-05-24T01:40:03.102Z"
last_activity: 2026-05-24
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 7
  completed_plans: 5
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-23)

**Core value:** Every unit of field work flows through one trustworthy loop — worker submits → auditor approves on-site → central project data (BOQ + map) updates automatically
**Current focus:** Phase 01 — foundation

## Current Position

Phase: 01 (foundation) — EXECUTING
Plan: 6 of 7 (02b next)
Status: Ready to execute
Last activity: 2026-05-24

Progress: [███████░░░] 71%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01-foundation P03 | 45 | - tasks | - files |
| Phase 01-foundation P04 | 7 minutes | 1 tasks | 3 files |
| Phase 01-foundation P02b | 35 | 2 tasks | 9 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: BOQ line item selected by worker via inline keyboard (State 2.5) between photo and location; AI parses notes to auto-suggest classification (advisory)
- Roadmap: Multiple auditors per project; first action wins; race-safe via SELECT FOR UPDATE + status guard
- Roadmap: AI flags are advisory only; eval harness with acceptance criteria required before flags shown to auditors (AI-05)
- Schema (01-02a): geometry(LineString,4326) generated correctly by drizzle-kit customType — Pitfall 1 hand-edit did not trigger for drizzle-kit 0.31.x
- Schema (01-02a): getDefaultTenantId() pattern established — all app code MUST supply tenant_id on insert (Pitfall 3 prevention)
- [Phase 01-03]: isAllowed() is pure exported helper in auth-allowlist.ts with no Auth.js runtime dependency
- [Phase 01-03]: signIn callback blocks both verificationRequest and link-click (Pitfall 2, T-03-01 mitigated)
- [Phase 01-03]: LanguageToggle sets locale cookie then page reloads for server-side getRequestConfig to pick up new locale
- [Phase 01-03]: TopNav sign-out uses Server Action form to keep signOut call server-side
- [Phase ?]: Lazy @/db import inside /start handler prevents neon() at module load — pure unit tests runnable without DATABASE_URL
- [Phase ?]: grammY webhookCallback secretToken option explicitly passed (does not auto-read env); bot.init() spy pattern prevents Telegram getMe network call in unit tests
- [Phase 01-02b]: TRUNCATE TABLE IF EXISTS is invalid PG syntax (only DROP TABLE supports IF EXISTS); use multi-table TRUNCATE ... CASCADE
- [Phase 01-02b]: vitest fileParallelism:false required when test files share a single Neon DB — parallel TRUNCATE races with inserts causing FK violations
- [Phase 01-02b]: grammY bot.botInfo setter must be set explicitly after vi.spyOn(bot.init) mock — grammY checks this.me before creating handler context
- [Phase 01-02b]: grammY api.config.use(transformer) is the correct intercept for ctx.reply() in tests; vi.spyOn on api.sendMessage doesn't work (raw Proxy dispatch)

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2: grammY conversations replay semantics — all DB calls must use `conversation.external()`; write duplicate-update integration test on day one
- Phase 3: BOQ double-deduction — use `SELECT FOR UPDATE` with `WHERE status='pending_audit' RETURNING id`; `CHECK (approved_qty <= planned_qty)` as DB guard
- Phase 4: PostGIS coordinate order — `ST_MakePoint(longitude, latitude)`; unit test required before merging
- Phase 4: Geometry vs geography — use `::geography` cast for metre-accurate distance thresholds
- Phase 1: Drizzle LineString migration requires manual SQL edit to change generated type from `geometry(point,4326)` to `geometry(linestring,4326)`

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-05-24T01:40:03.097Z
Stopped at: Phase 1 Plan 04 complete — /start webhook with secret-token verification shipped; ready for 01-05 (people approval Server Actions)
Resume file: None
