---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 2 context gathered
last_updated: "2026-05-24T13:00:27.561Z"
last_activity: 2026-05-24
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 13
  completed_plans: 13
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-23)

**Core value:** Every unit of field work flows through one trustworthy loop — worker submits → auditor approves on-site → central project data (BOQ + map) updates automatically
**Current focus:** Phase 02 — worker-bot

## Current Position

Phase: 02 (worker-bot) — EXECUTING
Plan: 6 of 6
Status: Ready to execute
Last activity: 2026-05-24

Progress: [██████████] 100%

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
| Phase 01-foundation P05 | 21 | 2 tasks | 15 files |
| Phase 01-foundation P06 | 90 | 2 tasks | 14 files |
| Phase 02-worker-bot P01 | 3 | 3 tasks | 6 files |
| Phase 02-worker-bot P02 | 6 minutes | 3 tasks | 5 files |
| Phase 02-worker-bot P04 | 25 minutes | 3 tasks | 2 files |
| Phase 02-worker-bot P05 | 20 | 3 tasks | 2 files |
| Phase 02-worker-bot P06 | 40 minutes | 3 tasks | 2 files |

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
- [Phase 01-05]: neon-serverless Pool (WebSocket driver) required for db.transaction() — neon-http does not support transactions
- [Phase 01-05]: vi.mock('next/cache') required in Server Action tests — revalidatePath throws 'static generation store missing' outside Next.js rendering context
- [Phase 01-05]: Base UI Select onValueChange callback is (value: string | null, ...) — all setState callers must null-coalesce with ?? ''
- [Phase 01-05]: Zod v4 z.enum() parameter is 'error' not 'errorMap'
- [Phase 01-06]: Zod v4 z.record() requires 2 arguments: z.record(z.string(), z.unknown()) not z.record(z.unknown())
- [Phase 01-06]: ExcelJS Buffer typing — Node 24 Buffer<ArrayBufferLike> not assignable to ExcelJS's ArrayBuffer-based Buffer; use buffer.buffer.slice(byteOffset, byteOffset+byteLength) to extract underlying ArrayBuffer
- [Phase 01-06]: NextResponse body must be BodyInit — use new Uint8Array(buffer) not Buffer directly for xlsx download routes
- [Phase 01-06]: Base UI DropdownMenuTrigger uses render prop for polymorphism (no asChild — consistent with Button pattern from 01-05)

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

Last session: 2026-05-24T13:00:27.555Z
Stopped at: Phase 2 context gathered
Resume file: None
