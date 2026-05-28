---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Operations Intelligence & Hakkediş
status: planning
stopped_at: Phase 11 UI-SPEC approved
last_updated: "2026-05-28T13:46:51.949Z"
last_activity: 2026-05-28
progress:
  total_phases: 11
  completed_phases: 9
  total_plans: 49
  completed_plans: 49
  percent: 82
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-25)

**Core value:** Every unit of field work flows through one trustworthy loop — worker submits → auditor approves on-site → central project data (BOQ + map) updates automatically
**Current focus:** Phase 11 — exports

## Current Position

Phase: 11
Plan: Not started
Status: Ready to plan
Last activity: 2026-05-28

**Progress bar (v2.0 phases only):**

```
Phase 7  [          ] 0%
Phase 8  [          ] 0%
Phase 9  [          ] 0%
Phase 10 [          ] 0%
Phase 11 [          ] 0%
```

## Performance Metrics

**Velocity:**

- Total plans completed: 37
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 02 | 6 | - | - |
| 03 | 5 | - | - |
| 4 | 4 | - | - |
| 05 | 6 | - | - |
| 08 | 6 | - | - |
| 09 | 6 | - | - |
| 10 | 4 | - | - |

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
| Phase 03-audit-loop P03-01 | 25 | 3 tasks | 6 files |
| Phase 03-audit-loop P03-03 | 8min | 2 tasks | 2 files |
| Phase 03-audit-loop P03-04 | 20m | 2 tasks | 3 files |
| Phase 03-audit-loop P05 | 180 | 3 tasks | 3 files |
| Phase 04-spatial-layer P01 | 7 | 3 tasks | 3 files |
| Phase 04-spatial-layer P02 | 8 | 2 tasks | 3 files |
| Phase 04-spatial-layer P03 | 30 | 3 tasks | 3 files |
| Phase 04-spatial-layer P04 | 5 | 3 tasks | 3 files |
| Phase 05-dashboard-map P05-01 | 60 | 4 tasks | 7 files |
| Phase 05 P02 | 580 | 2 tasks | 3 files |
| Phase 05 P05-05 | 5 | 1 tasks | 1 files |
| Phase 05 P04 | 20 | 2 tasks | 2 files |
| Phase 05-dashboard-map P03 | 30 | 3 tasks | 3 files |
| Phase 05-dashboard-map P06 | 25 | 3 tasks | 2 files |
| Phase 07-data-foundation-canonical-record P01 | 5 minutes | 3 tasks | 10 files |
| Phase 07-data-foundation-canonical-record P02 | 7 minutes | 2 tasks | 5 files |
| Phase 07-data-foundation-canonical-record P04 | 15 minutes | 4 tasks | 12 files |
| Phase 08-admin-shell-information-architecture P01 | 8 | 2 tasks | 10 files |
| Phase 08 P02 | 120 | 3 tasks | 2 files |
| Phase 08 P04 | 5 minutes | 3 tasks | 6 files |
| Phase 08 P06 | 6 minutes | 3 tasks | 7 files |
| Phase 09 P01 | 8 | 2 tasks | 4 files |
| Phase 09 P04 | 7 | 3 tasks | 3 files |
| Phase 09 P06 | 25 | 3 tasks | 6 files |
| Phase 10-hakkedi-billing P02 | 90 | 2 tasks | 2 files |
| Phase 10 P03 | 9 minutes | 2 tasks | 5 files |

## Accumulated Context

### Roadmap Evolution

- Phase 8 edited: rescope: absorbed UX-03/04/05 + PERF-04 from Phase 9; new goal/SC for full admin experience layer
- Phase 9 edited: trimmed to PERF-01/02/03/05/06 (scorecards, leaderboard, SLA alerts); UX-03/04/05 + PERF-04 moved to Phase 8

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
- [Phase 04-01]: Five Phase 4 spatial columns on submissions — all nullable; locationMatch text enum {near,far,no_route} is three-state source of truth (D-43/D-44); locationWarning bool for SC2 filtering; locationDistanceM stored to avoid re-querying PostGIS in fanOutToAuditors
- [Phase 04-01]: SPATIAL_FIXTURE_IDS const exported alongside seedSpatialFixture so test files import UUIDs without duplicating them
- [Phase ?]: D-49: drizzle-kit push unusable for this project — spatial_ref_sys permission error; migrate.ts (Drizzle migrate()) is the project migration runner
- [Phase ?]: [Phase 05-02]: getRouteGeoJSON exported from both submissions.ts and routes.ts — test imports from submissions, plan artifacts spec includes routes
- [Phase ?]: [Phase 05-02]: VALID_STATUSES whitelist at module scope in submissions.ts, throws on non-whitelisted status (T-05-IV / V5)
- [Phase ?]: [Phase 05-02]: flow_id test INSERTs must use valid UUIDs — uuid() column type rejects non-UUID strings (Rule 1 fix, deterministic UUIDs applied)
- [Phase ?]: [Phase 05-05]: progressColorClass for completion direction — >=90% success, >0&&<=10% warning, else empty; formula matches boq.test.ts assertions exactly
- [Phase ?]: [Phase 05-03]: react-map-gl v8 exports MapMouseEvent (not MapLayerMouseEvent) for onClick handler type
- [Phase ?]: [Phase 05-03]: MapView reads boqPaletteSlot from Plan 02 GeoJSON feature.properties — no client-side BOQ lookup needed
- [Phase ?]: [Phase 05-03]: Non-Turbopack dev server required for all map work (mapbox-gl worker breaks under Turbopack)
- [v2.0 Roadmap]: Money math rule — all earned-value multiplication in Postgres SUM(quantity * unit_price); decimal.js for any JS-side display; never accumulate money in a JS number loop
- [v2.0 Roadmap]: Hakkediş period lines store both cumulative_qty_approved and previous_cumulative_qty as separate snapshot columns; CHECK (cumulative_qty >= previous_cumulative_qty) enforced at DB level
- [v2.0 Roadmap]: KDV tevkifat fraction (4/10 vs 3/10) is an open conflict — accountant confirmation required before Phase 10 billing code is written; store as configurable per-period numeric field
- [v2.0 Roadmap]: PDF library choice deferred to Phase 11 planning — re-verify @react-pdf/renderer issue #3074 status at implementation time; pdf-lib is the safer fallback
- [v2.0 Roadmap]: All new analytics/hakedis/export pages use export const dynamic = 'force-dynamic' — financial data must never be statically cached
- [v2.0 Roadmap]: (admin) route group is additive only — no existing dashboard/projects/* routes are moved or renamed
- [v2.0 Roadmap]: Istanbul timezone in date-range filters — all date boundaries use AT TIME ZONE 'Europe/Istanbul' in Postgres or explicit +03:00 offset in UI
- [v2.0 Roadmap]: NULL decidedAt handling — always split: AVG latency WHERE decided_at IS NOT NULL (decided), COUNT for pending backlog separately; never let NULL poison SLA averages
- [v2.0 Roadmap]: Role lives on assignments not people — all scorecard queries join assignments table and include project_id scope
- [Phase ?]: [Phase 07-01]
- [Phase 07-02]: 0005_v2_indexes.sql requires --> statement-breakpoint markers — neon-http driver cannot execute multiple commands in one prepared statement (send each CREATE INDEX separately)
- [Phase 07-02]: TEST_DATABASE_URL requires its own migrate.ts apply — it is a separate Neon branch; 0004+0005 must be applied there too for integration tests to pass
- [Phase ?]: [Phase 07-04]: setUnitPrice fetches old row before UPDATE to capture oldPrice in logOfficeActivity metadata — audit trail carries oldPrice/newPrice/currencyCode
- [Phase ?]: [Phase 07-04]: Empty unit price submits as null (clears), never '0'; dialog initialises from item?.unitPrice ?? '' so null shows placeholder not zero
- [Phase ?]: [Phase 07-04]: after() mock needed in boq/people/projects test suites after logOfficeActivity wiring — all Server Action tests importing wired actions need vi.mock('next/server')
- [Phase ?]: [Phase 08-01]: shadcn CLI must be invoked as node_modules/.bin/shadcn — npx shadcn@latest triggers npm script lookup and fails
- [Phase ?]: [Phase 08-01]: sidebar.tsx SidebarMenuButton has isActive prop + asChild — downstream plans use these for active nav item detection
- [Phase ?]: [Phase 08-01]: dashboard.admin.stubs.exports_heading = Dışa Aktarma vs nav.exports = Dışa Aktar — kept distinct per UI-SPEC
- [Phase ?]: D-66: pending backlog never date-filtered — point-in-time snapshot always
- [Phase ?]: D-Istanbul: sql.raw() for date_trunc literal; to_char() for Istanbul-local timestamp string
- [Phase ?]: D-AuditorSource: getAuditorDecisions reads submissions only — never office_activity_log (Pitfall 7)
- [Phase ?]: tenant_settings default '0.3000' is string literal not float (Pitfall 5 prevention)
- [Phase ?]: [Phase 09-01]: phase9Tables fallback set in truncateAllTables mirrors phase7Tables pattern for graceful pre-migration test runs
- [Phase 09-03]: Applied migrations must not be edited post-apply — drizzle migration-hash integrity is broken by post-apply edits; test-DB FK-safe seed reconcile required manual temp-tenant insert workaround; follow-up todo filed to use WHERE EXISTS guard in future FK-bound seeds
- [Phase 09-04]: trim_scale() applied to output_quantity_sum to strip trailing zeros (e.g. 10.000 → 10) so test assertion toBe('10') passes
- [Phase 09-04]: auditSlaHours bound as null when not provided, causing sla_breach_rate > null to always be false — safe null-result without conditional SQL
- [Phase 09-04]: getTenantSettings returns D-84 Moderate code-level defaults when no row exists — enables test DB (no seed row) and production safety
- [Phase ?]: Phase 09 Plan 06

### Open Questions / Conflicts (surface before relevant phases)

**Phase 10 (Hakkediş Billing) — must resolve before planning:**

- KDV tevkifat fraction: FEATURES.md cites 4/10 (multi-source verified); PITFALLS.md example used 3/10 without citation. Accountant must confirm before any billing calculation is written.
- Stopaj applicability: 5% applies only to multi-year (yıllara yaygın) contracts. Confirm contract type with user before Phase 10 planning.
- Avans kesintisi rate: no default — office engineer enters recovery rate per period.

**Phase 11 (Exports) — must resolve before planning:**

- PDF library: re-verify @react-pdf/renderer GitHub issue #3074 status. If still unresolved in Next.js 15 App Router route handlers, use pdf-lib + @pdf-lib/fontkit instead.
- Turkish font coverage: confirm whether Noto Sans, Open Sans, or DejaVu has full ğ ş ı ö ü ç glyph support.

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2: grammY conversations replay semantics — all DB calls must use `conversation.external()`; write duplicate-update integration test on day one
- Phase 3: BOQ double-deduction — use `SELECT FOR UPDATE` with `WHERE status='pending_audit' RETURNING id`; `CHECK (approved_qty <= planned_qty)` as DB guard
- Phase 4: PostGIS coordinate order — `ST_MakePoint(longitude, latitude)`; unit test required before merging
- Phase 4: Geometry vs geography — use `::geography` cast for metre-accurate distance thresholds
- Phase 1: Drizzle LineString migration requires manual SQL edit to change generated type from `geometry(point,4326)` to `geometry(linestring,4326)`
- Phase 7: Partial index syntax not emitted by drizzle-kit generate — hand-edit migration 0007 for `WHERE status = 'pending_audit'` and `WHERE decided_by IS NOT NULL` indexes (same precedent as 0003_slippery_prowler.sql)
- Phase 7: drizzle-kit push is unusable (D-49) — all migrations must go through tsx src/db/migrate.ts

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260525-2uq | Bilingual TR/EN marketing landing page at root route | 2026-05-25 | 5717e6b | [260525-2uq-bilingual-tr-en-marketing-landing-page-a](./quick/260525-2uq-bilingual-tr-en-marketing-landing-page-a/) |
| 260525-3fc | Polish UI/UX — typography, fonts, spacing, visual hierarchy across landing + dashboard | 2026-05-25 | fc1e92c | [260525-3fc-polish-ui-ux-typography-fonts-spacing-vi](./quick/260525-3fc-polish-ui-ux-typography-fonts-spacing-vi/) |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| AI Assist | Phase 6 (AI-01..AI-05) — async Claude vision, eval harness | Deferred from v1; not part of v2.0 | v1 milestone end |

## Session Continuity

Last session: 2026-05-28T13:46:51.943Z
Stopped at: Phase 11 UI-SPEC approved
Resume file: .planning/phases/11-exports/11-UI-SPEC.md
