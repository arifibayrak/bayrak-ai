# Project Research Summary

**Project:** bayrak.ai — v2.0 Operations Intelligence & Hakkediş
**Domain:** Turkish linear-infrastructure subcontractor operations: analytics dashboards, earned-value cost intelligence, and Turkish hakkediş (progress payment) billing
**Researched:** 2026-05-25
**Confidence:** HIGH (all four research files grounded in official docs, codebase inspection, and multi-source Turkish tax authority verification)

---

## Executive Summary

v2.0 adds a financial and analytical layer on top of the v1 submission-audit-BOQ loop. The core product move is: every approved unit of field work already tracked in the database gains a monetary value through a single `unit_price` column on `boq_items`. Once that column exists, earned value (`approvedQty × unit_price`), budget at completion (`plannedQty × unit_price`), per-worker value contribution, and Turkish hakkediş billing calculations all become computable without any new data collection. The data foundation (`unit_price` + `hakedis_periods` table) is the single critical-path dependency — every financial and billing feature is blocked until it is in place.

The recommended approach is strictly additive: no existing v1 routes, schema tables, or Server Actions are moved or deleted. New analytics pages live in a `(admin)` Next.js App Router route group with a persistent sidebar shell; new hakkediş tables (`hakedis_periods`, `hakedis_period_lines`) snapshot approved quantities at period cutoff to prevent double-billing; all financial arithmetic happens in Postgres using `numeric` aggregation, never in JavaScript float arithmetic. The v2 technology additions are minimal: `recharts` (via the existing shadcn chart wrapper), `decimal.js` for any JS-side money display, and `pdf-lib` + `@pdf-lib/fontkit` for the hakkediş PDF certificate. ExcelJS, TanStack Table, and react-day-picker are already present or peer-installed.

The key risks are financial correctness and security. Turkish hakkediş math has legally mandated rounding order (round once at the final total, not per line item), and the KDV tevkifat fraction is a money-math item requiring accountant confirmation before any billing code is written (see Unresolved Decisions below). All new `/api/export/*` route handlers must carry explicit `auth()` guards — they do not inherit layout-level session checks. The double-billing trap (computing cumulative quantity instead of period-delta quantity) and Istanbul-timezone errors in date-range filters are the two silent correctness pitfalls most likely to reach production unnoticed.

---

## Unresolved Decisions / Open Questions

**These two conflicts must be surfaced before the relevant phases begin. Do not silently pick one side.**

### Conflict 1 — PDF Library

| | Recommendation | Cited Reasoning |
|---|---|---|
| **STACK.md** | `pdf-lib` + `@pdf-lib/fontkit` | `@react-pdf/renderer` 4.x has an unresolved `PDFDocument is not a constructor` error in Next.js 15 App Router route handlers (GitHub issue #3074, filed Feb 2025, closed without fix); memory leak warnings on repeated `renderToBuffer()` calls. Playwright/Chromium is ~300 MB, exceeds Vercel's 250 MB function bundle limit. |
| **ARCHITECTURE.md** | `@react-pdf/renderer` | Described as "Vercel-compatible, pure Node.js, no binary dependencies." The file did not cite issue #3074 and recommended `renderToBuffer()` directly. |

**Synthesis:** The STACK.md citation of GitHub issue #3074 is specific and externally verifiable. The ARCHITECTURE.md recommendation appears to have been written without awareness of the Next.js 15 App Router breakage. `pdf-lib` is the safer choice: pure JS, zero native deps, confirmed Vercel Functions compatible, and the Turkish font embedding via `@pdf-lib/fontkit` is well-documented. **Recommendation: lean toward `pdf-lib`, but defer the final pick to a `plan-phase --research-phase` investigation during the Exports phase** so the issue status can be re-verified at implementation time (the GitHub issue may be resolved by then).

### Conflict 2 — KDV Tevkifat Fraction (Money-Math)

| | Rate | Source |
|---|---|---|
| **FEATURES.md** | **4/10** of KDV withheld by employer (above 5,000,000 TL threshold for yapım işleri) | ozbekcpa.com, karenaudit.com, hakedis.org — multiple sources agree |
| **PITFALLS.md** | **3/10** of KDV | Presented in the rounding-order worked example without a source citation for the fraction |

**This is a money-math discrepancy in a legally issued billing document.** The FEATURES.md figure (4/10) is sourced from three external Turkish CPA and audit firm references and is consistent with the 2024 yapım işleri threshold. The PITFALLS.md figure (3/10) appears in a worked calculation example without citation. **Action required: the user's accountant must confirm the applicable fraction for their specific contract type before any KDV tevkifat code is written.** The hakkediş schema stores `kdv_rate` and `retention_rate` as configurable text columns per period — the tevkifat fraction should also be a per-period configurable field, not a hardcoded constant, so an incorrect rate can be corrected without a code deploy.

---

## Key Findings

### Recommended Stack

The v1 stack (Next.js 15, shadcn/ui, Drizzle, Neon/PostGIS, grammY, Auth.js, Mapbox, next-intl, ExcelJS) is unchanged. v2 requires four net-new additions:

**Core technology additions:**
- `recharts` 3.8.1 — charts and data visualisation, via `npx shadcn@latest add chart`; the shadcn chart wrapper uses Recharts v3 directly, keeping the design system unified
- `decimal.js` 10.6.0 — JS-side money display and KDV/retention calculation; Drizzle returns `numeric` columns as strings, making a decimal library mandatory for any JS arithmetic on financial figures
- `pdf-lib` 1.17.1 + `@pdf-lib/fontkit` 1.1.1 — hakkediş PDF certificate generation; pure JS, no native deps, Vercel Functions compatible; fontkit enables Turkish TTF embedding (`ğ ş ı ö ü ç` etc.)
- `@tanstack/react-table` 8.21.3 — server-side paginated analytics tables (likely already present via v1 shadcn data-table; check `package.json` first)

**No new installs needed for:**
- ExcelJS multi-sheet export — `addWorksheet()` calls on existing ExcelJS 4.4.0
- Date-range picker — shadcn `Calendar` + `react-day-picker` 10.x already peer-installed via shadcn
- SQL aggregation — raw `db.execute(sql...)` following the existing spatial query pattern; no new query library

**Critical version constraints:**
- TanStack Table: pin to `^8` — v9 is alpha-only (v9.0.0-alpha.50 as of May 2026); shadcn data-table targets v8
- ExcelJS `writeBuffer()` returns `ExcelJS.Buffer` (extends `ArrayBuffer`); pass directly to `Response()` — do NOT call `Buffer.from()` (corrupts file, ExcelJS issue #1032, unfixed in 4.4.0)
- All SQL aggregation for analytics: use `db.execute(sql...)` not `db.query.*` — Drizzle relational builder does not support `GROUP BY` and aggregation functions well

### Expected Features

**Must have (v2.0 table stakes):**
- `unit_price` on `boq_items` — schema migration + form field; gates every financial feature
- Navigation IA restructure — admin shell sidebar: Overview · Projects · People · Analytics · Hakkediş · Exports
- Admin command-center overview — pending backlog count, total approvals/rejections (rolling 30d), EV/BAC across projects
- Global date-range + project + person filters — applied across all analytics views
- BOQ progress view (qty-based % + value-based % once unit_price added)
- Per-worker scorecard — approval rate, rejection rate, output rate, value contribution, location compliance
- Per-auditor scorecard + SLA alert — decision throughput, avg turnaround, pending backlog, SLA breach count
- Hakkediş period management — create/close periods linking submissions to billing periods
- Hakkediş yeşil defter calculation — cumulative qty, previous period qty, this period qty per BOQ item
- Hakkediş fiyat icmali — this period qty × unit_price per item = period value
- Hakkediş summary — gross → KDV (20%) → KDV tevkifat (fraction TBD per Conflict 2) → stopaj (5% if multi-year) → teminat (5%) → avans kesintisi (configurable) → net ödeme
- Hakkediş Excel export — bilingual TR/EN, yeşil defter format
- Submission log + worker/auditor performance Excel exports

**Should have (v2.x differentiators, add after v2.0 validation):**
- Employee profile pages with activity timeline
- Drill-down from every metric to underlying submission records
- Hakkediş PDF certificate export (formal document delivery)
- Trend charts (throughput, rejection rate, turnaround over time)
- BOQ depletion alert (approvedQty approaching plannedQty)
- Rejection cost / rework value dashboard card

**Defer to v3+:**
- Full EVM (SPI, CPI, EAC) — requires project schedule baseline and actual cost capture not yet collected
- Fiyat farkı auto-calculation — requires monthly Turkish government coefficient tables (BIM/KGM)
- Multi-tenant hakkediş with per-tenant contract settings
- AI KPI narrative / anomaly explanation
- Gantt / TILOS time-distance chart

**Critical dependency chain:**
```
unit_price on boq_items
  → EV / BAC / % complete by value
  → Per-worker value contribution, rework value
  → Hakkediş line item calculation

hakedis_periods table
  → Hakkediş yeşil defter (cumulative vs period split)
  → Hakkediş summary (deductions → net)
  → Hakkediş Excel export
  → Hakkediş PDF certificate

Navigation IA restructure
  → All new v2 pages are reachable
```

### Architecture Approach

v2 is strictly additive to the v1 codebase. Existing `dashboard/projects/*` routes are untouched. New analytics and billing pages are added under a `(admin)` App Router route group (no URL segment) with a new `AdminSidebar` client component. A `CanonicalSubmission` TypeScript type defined in `src/lib/types/canonical-submission.ts` becomes the single shared shape used by analytics scorecards, Excel exports, and hakkediş period line computation. All financial aggregation happens in `src/actions/analytics.ts` using `db.execute(sql...)` raw queries with `FILTER (WHERE ...)` clauses — no Postgres materialized views (refresh-timing complexity in serverless), no Drizzle relational builder for aggregation.

**Major components:**

1. **Data foundation** (`src/db/schema/`) — Four schema changes: `boq_items.unit_price` column (nullable `numeric(15,4)`), `office_activity_log` table, `hakedis_periods` table, `hakedis_period_lines` table. Migration sequence: 0004 (unit_price) → 0005 (activity_log) → 0006 (hakedis tables) → 0007 (hand-edited partial indexes — drizzle-kit cannot emit partial index syntax). Run `tsx src/db/migrate.ts`, never `drizzle-kit push`.

2. **Aggregation layer** (`src/actions/analytics.ts`) — `getCanonicalSubmissions()`, `getProjectMetrics()`, `getPersonMetrics()`, `getPortfolioOverview()` as typed Server Actions with `auth()` guard and `getDefaultTenantId()` scope. Single JOIN queries, no per-row looping. Composite indexes needed: `(status, submitted_at DESC)`, partial index `WHERE status = 'pending_audit'`, `(decided_by, decided_at DESC)`.

3. **Admin shell IA** (`src/app/dashboard/(admin)/`) — Route group layout wraps Overview, People, Analytics, Hakkediş, and Exports pages. Sidebar is a `'use client'` component using `usePathname()`. All new pages: `export const dynamic = 'force-dynamic'` (financial data must never be statically cached).

4. **Hakkediş engine** (`src/actions/hakedis.ts`) — `createHakkedişPeriod()`, `computePeriodLines()`, `finalizeHakkedişPeriod()`. Period lines are computed by aggregating `approved` submissions `WHERE decided_at <= periodEndDate` per `boq_item_id`, then subtracting the previous period's cumulative quantities to get the period delta. Snapshot columns (`unitPriceSnapshot`, `materialSnapshot`) are immutable after `status = 'finalized'`.

5. **Export pipeline** (`src/lib/excel-exports.ts`, `src/app/api/exports/`) — In-memory buffer approach (Vercel function timeout 10–60s; typical hakkediş Excel < 1 MB). Every export `route.ts` carries an explicit `auth()` guard at line 1. ExcelJS monetary cells written as `number` type with `numFmt = '#,##0.00 ₺'`. Turkish TTF font embedded at module level (not per-request) for PDF export.

6. **Charts** (`src/components/dashboard/analytics/`) — `'use client'` Recharts components receiving pre-fetched data as props from parent Server Components. Three charts for v2.0: `ThroughputChart`, `EarnedValueChart`, `RejectionRateChart`.

### Critical Pitfalls

1. **Money math in JS float arithmetic** — Drizzle returns `numeric` columns as strings, not numbers. `row.approvedQty * row.unitPrice` silently produces IEEE 754 drift. Rule: all earned-value multiplication happens in Postgres (`SUM(quantity * unit_price)` in SQL); `decimal.js` for any JS-side display arithmetic. Never accumulate money in a JS `number` loop.

2. **Cumulative vs period double-billing** — If `hakedis_period_lines.period_qty` is computed as the raw `SUM(approved_qty)` rather than `cumulativeQtyApproved − previousCumulativeQty`, the same work gets billed twice across consecutive periods. Highest financial-damage pitfall. The `hakedis_period_lines` schema must store `previous_cumulative_qty` as a snapshot; add `CHECK (cumulative_qty >= previous_cumulative_qty)`. Finalized periods must be immutable.

3. **KDV rounding order** — Round once at the total level, not per line item. Compute all intermediate values at full `numeric(12,3)` precision; apply `ROUND(..., 2)` once at the final SELECT. A single server-side `computeHakkedis()` function owns the rounding sequence. Include a test fixture with a known real hakkediş document asserting exact kuruş output.

4. **Istanbul timezone in date-range filters** — Turkey is UTC+3 (Europe/Istanbul, no DST since 2016). `WHERE submitted_at >= '2026-05-01'` uses UTC midnight, not Istanbul midnight. All date-range filter boundaries must use `AT TIME ZONE 'Europe/Istanbul'` in Postgres, or be constructed with explicit `+03:00` offset in the UI. Hakkediş period `cutoff_at` must be stored in UTC after converting from Istanbul time.

5. **Export route handlers lack auth guards** — `route.ts` files do not inherit `dashboard/layout.tsx` session checks. Every export route handler must call `const session = await auth(); if (!session) return new Response('Unauthorized', { status: 401 })` as its first statement.

6. **NULL `decidedAt` poisons SLA averages** — `AVG(decided_at - submitted_at)` silently excludes pending submissions. Always split: average latency for decided submissions (`WHERE decided_at IS NOT NULL`) and a separate backlog count/age for pending submissions.

7. **Role lives on assignments, not on people** — A person can be `worker` on Project A and `auditor` on Project B. All scorecard queries must join `assignments` and include `project_id` scope.

---

## Implications for Roadmap

Based on the dependency graph and pitfall-to-phase mapping, five sequential phases are recommended.

### Phase 1: Data Foundation + Canonical Record

**Rationale:** `unit_price` is the critical-path blocker for every financial feature. The three new schema tables and the `CanonicalSubmission` type are the foundation every subsequent phase builds on. Nothing else can start until this phase is complete.

**Delivers:**
- `boq_items.unit_price` column (migration 0004)
- `office_activity_log` table (migration 0005)
- `hakedis_periods` + `hakedis_period_lines` tables (migration 0006)
- Hand-edited partial index migration (0007)
- `CanonicalSubmission` type in `src/lib/types/canonical-submission.ts`
- `src/actions/analytics.ts` — all four aggregation functions
- Unit price field in BOQ item create/edit UI
- `logOfficeActivity()` wired into existing Server Actions

**Features addressed:** unit_price schema migration (P1), earned value formulas foundation
**Pitfalls to prevent:** Money math in JS (establish Postgres aggregation pattern before any cost display); cumulative vs period double-billing (schema constraints locked in at table creation)
**Research flag:** Standard patterns — no `plan-phase --research-phase` needed.

---

### Phase 2: Admin Shell IA

**Rationale:** Without the navigation shell, all new pages are unreachable. This phase has no data layer work — it depends on Phase 1 actions being available.

**Delivers:**
- `(admin)` route group layout + `AdminSidebar` component
- Overview page (portfolio KPIs from `getPortfolioOverview()`)
- People list + employee profile pages (from `getPersonMetrics()`)
- Redirect `/dashboard` → `/dashboard/overview`
- i18n keys for all new nav items

**Features addressed:** Navigation IA restructure (P1), pending backlog view (P1), admin command-center overview (P1)
**Pitfalls to prevent:** Additive-only route strategy (no existing paths moved); auth guard confirmed on page routes
**Research flag:** Standard patterns — App Router route groups and sidebar navigation are well-documented Next.js patterns.

---

### Phase 3: Analytics UI + Scorecards

**Rationale:** The analytics page is the primary value demonstration of v2. Building this before hakkediş validates that aggregation queries are correct. Charts and scorecards are lower risk than billing calculations.

**Delivers:**
- `analytics/page.tsx` — date-range + global filters via URL `searchParams`
- Per-worker scorecard (approval rate, rejection rate, output rate, value contribution, location compliance)
- Per-auditor scorecard (decision throughput, avg turnaround, pending backlog, SLA breach count)
- Recharts client components: `ThroughputChart`, `EarnedValueChart`, `RejectionRateChart`
- SLA alert (submissions pending > 4h)
- Submission detail page
- All new pages: `export const dynamic = 'force-dynamic'`

**Features addressed:** Per-worker scorecard (P1), per-auditor scorecard + SLA (P1), global filters (P1), BOQ progress
**Pitfalls to prevent:** NULL decidedAt SLA poison; role-scoped attribution; N+1 per-person queries; Istanbul timezone in date filters; missing `force-dynamic`
**Research flag:** Standard patterns. Istanbul timezone utility and role-scoped query patterns should be established as utility functions before the first query is written — internal design decision, not external research.

---

### Phase 4: Hakkediş Billing

**Rationale:** Highest-complexity feature with highest financial risk. Must come after analytics is validated (engineers cross-check billing totals against dashboard KPIs). KDV rounding and tevkifat fraction must be accountant-confirmed before any export is built.

**Delivers:**
- `src/actions/hakedis.ts` — `createHakkedişPeriod()`, `computePeriodLines()`, `finalizeHakkedişPeriod()`
- Period list and period detail pages
- KDV and retention deduction summary (rates configurable per period)
- Finalization lock: `status = 'finalized'` makes snapshot columns immutable
- Activity log wiring

**Features addressed:** Hakkediş period management (P1), yeşil defter calculation (P1), fiyat icmali (P1), hakkediş summary (P1)
**Pitfalls to prevent:** Cumulative vs period double-billing (CHECK constraint, previousCumulativeQty snapshot); KDV rounding order (single `computeHakkedis()` with fixture test); tevkifat fraction configurable not hardcoded
**Research flag:** Needs `plan-phase --research-phase` — (1) accountant must confirm KDV tevkifat fraction (4/10 vs 3/10) and stopaj applicability (single-year vs multi-year) before any billing code is written.

---

### Phase 5: Exports

**Rationale:** Exports render calculated data — build the renderer after the calculations are validated. PDF library decision should be re-researched at this point with more information.

**Delivers:**
- `src/lib/excel-exports.ts` — `generateSubmissionsExcel()`, `generateHakkedişExcel()` (multi-sheet, bilingual)
- Submission log, hakkediş Excel export route handlers
- PDF export route handler (library TBD)
- PDF layout component with Turkish TTF embedded at module level
- Export trigger UI with required date-range selector
- `export const maxDuration = 60` on all export route handlers
- Date-range cap: reject requests with range > 90 days or no date range

**Features addressed:** Hakkediş Excel export (P1), submission log Excel export (P1), worker/auditor performance Excel export (P1), hakkediş PDF certificate (P2)
**Pitfalls to prevent:** Export route auth guards; Turkish characters in PDF (TTF at module level); ExcelJS numeric cell type; Vercel export memory/timeout; ExcelJS Buffer gotcha
**Research flag:** Needs `plan-phase --research-phase` — (1) re-verify @react-pdf/renderer issue #3074 status; (2) if unresolved, confirm pdf-lib approach and Turkish font strategy (Noto Sans vs Open Sans vs DejaVu glyph coverage).

---

### Phase Ordering Rationale

- Phase 1 before everything: `unit_price` gates all financial math; new schema tables must exist before any action function can reference them; `CanonicalSubmission` type must be defined before analytics queries and exports share a data shape
- Phase 2 before Phase 3: analytics pages need to be reachable before they can be validated; sidebar shell is prerequisite for usability
- Phase 3 before Phase 4: earned-value analytics validates aggregation queries before the higher-stakes hakkediş calculation uses the same data; office engineers cross-check billing totals against dashboard KPIs
- Phase 4 before Phase 5: exports render calculated data; PDF library decision can be made with more information after Phase 4 proves the data model
- Additive-only constraint throughout: no existing `dashboard/projects/*` routes, schema tables, or Server Actions are moved

### Research Flags

Phases requiring `plan-phase --research-phase`:
- **Phase 4 (Hakkediş Billing):** KDV tevkifat fraction must be confirmed (4/10 vs 3/10 — accountant required); stopaj applicability depends on contract type
- **Phase 5 (Exports):** PDF library decision (re-verify @react-pdf/renderer issue #3074 status; Turkish font strategy)

Phases with standard patterns (skip research-phase):
- **Phase 1 (Data Foundation):** Drizzle schema migration patterns and Postgres aggregation are well-documented; partial index hand-edit is an established codebase pattern
- **Phase 2 (Admin Shell IA):** App Router route groups and sidebar navigation are standard Next.js patterns
- **Phase 3 (Analytics UI):** Recharts via shadcn chart, TanStack Table server-side pagination, and URL-based filter state are all high-confidence patterns

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions npm-verified; pdf-lib vs @react-pdf/renderer conflict documented with specific GitHub issue; ExcelJS Buffer gotcha confirmed via open issue |
| Features | HIGH / MEDIUM | HIGH for hakkediş mechanics and EVM formulas (EY, PwC Turkey, KPMG verified); MEDIUM for exact KPI benchmarks (practitioner consensus); KDV tevkifat fraction requires accountant confirmation |
| Architecture | HIGH | Grounded in actual codebase inspection; additive strategy and neon-http driver constraints confirmed |
| Pitfalls | HIGH | 15 pitfalls covering financial correctness, security, performance, UX; all grounded in codebase-specific patterns |

**Overall confidence:** HIGH

### Gaps to Address

- **KDV tevkifat fraction (4/10 vs 3/10):** Accountant must confirm before any billing calculation is written. Store fraction as a configurable `numeric` per hakkediş period. Address in Phase 4 planning.
- **Stopaj applicability:** Stopaj (5%) applies only to multi-year contracts. Hakkediş summary UI should present stopaj as a toggle with tooltip. Confirm with accountant before Phase 4.
- **PDF library final pick:** Defer to Phase 5 planning. Re-verify @react-pdf/renderer issue #3074 status at implementation time.
- **Avans kesintisi rate:** No default should be hardcoded — office engineer enters advance recovery rate when creating a hakkediş period.
- **Office activity log retention policy:** KVKK compliance risk for long-retained logs. Document a 90-day retention window in the schema and scope a cleanup mechanism for Phase 1 or 2.

---

## Sources

### Primary (HIGH confidence)
- EY, PwC Turkey, KPMG, Grant Thornton — KDV rate (20%), stopaj (5%), tevkifat applicability
- ozbekcpa.com, karenaudit.com, hakedis.org — KDV tevkifat fraction (4/10) and 2024 yapım işleri threshold
- muhasebetr.com — hakkediş worked calculation example
- sanalsantiye.com, amp.com.tr, insaatgundemi.com — hakkediş document structure (yeşil defter, fiyat icmali)
- Drizzle ORM docs — `numeric` type string return behavior (issues #570, #1042)
- GitHub @react-pdf/renderer issue #3074 — `PDFDocument is not a constructor` in Next.js 15 App Router
- GitHub ExcelJS issue #1032 — `writeBuffer()` type mismatch (unfixed in 4.4.0)
- shadcn/ui chart docs — Recharts v3 confirmed as underlying engine
- TanStack Table v8 docs — `manualPagination`, `manualSorting`, `manualFiltering`
- pdf-lib GitHub — pure JS, fontkit embedding, Turkish font approach
- Wanago money storage guide — `decimal.js` with Drizzle numeric columns
- Next.js `after()` API reference — post-response activity log writes
- Auth.js v5 docs — `auth()` in route handlers
- Vercel function docs — `maxDuration`, memory limits, 4.5 MB body limit
- Actual codebase: `src/db/schema/*.ts`, `src/actions/submissions.ts`, `src/db/migrate.ts`, `src/lib/excel.ts`

### Secondary (MEDIUM confidence)
- famcod.com 2026 EVM guide — EVM benchmarks (CPI/SPI thresholds)
- Procore, iFieldSmart, Vitruvi — construction KPI benchmark ranges (85–90% approval rate, <15% rejection rate)
- Projul, SmartPM, BoldBI — operations dashboard structure conventions
- FlyDash, Domo, InetSoft — KPI dashboard best practices

### Tertiary (LOW confidence / needs validation)
- Neon materialized view refresh behavior — reasoning-based, no Neon-specific benchmark; revisit after v2 launch if dashboard page load > 2s
- Fiyat farkı scope — described as minority of private subcontracts; deferred to v3+ without formal survey of user's contract portfolio

---

*Research completed: 2026-05-25*
*Ready for roadmap: yes*
