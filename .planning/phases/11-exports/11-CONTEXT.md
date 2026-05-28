# Phase 11: Exports - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

The final phase of milestone v2.0. Delivers **four downloadable artefacts** from the admin layer:

1. **Submission ledger Excel** (EXP-01) — canonical-record rows from `getCanonicalSubmissions()`,
   respecting the global date-range + project filters from the Phase-8 filter bar, with bilingual
   TR/EN column headers.
2. **BOQ / hakkediş Excel** (EXP-02) — three-sheet workbook per finalized hakkediş period:
   *Yeşil Defter* (cumulative register), *Fiyat İcmali* (this period's qty × unit price), and
   *Hesap Özeti* (gross → KDV → tevkifat → stopaj → teminat → avans → net mirroring the on-screen
   detail summary).
3. **Performance summaries Excel** (EXP-03) — two-tab workbook (Workers, Auditors) with per-person
   KPI columns from `getPortfolioPeople()`.
4. **Hakkediş PDF certificate** (EXP-04) — cover info + line-item table + payment summary,
   rendered with embedded TTF font for correct Turkish glyphs (ğ ş ı ö ü ç).

Plus the **Exports trigger UI** at `/dashboard/(admin)/exports` (replaces the Phase 8 stub), and
the **Excel + PDF download affordances on the period detail page** (added to Phase 10's
`PeriodDetailControls`). Every export route handler is independently `auth()`-guarded — they do
NOT inherit layout auth (SC5).

**Already shipped — do NOT rebuild:**
- `src/actions/analytics.ts` (Phase 7/8): `getCanonicalSubmissions`, `getPortfolioPeople` — the
  ledger + performance data layer. Reuse.
- `src/actions/hakedis.ts` (Phase 10): `getPeriodDetail` — returns lines + the deduction object
  (gross / kdv / tevkifat / stopaj / teminat / avans / net as decimal strings already computed in
  Postgres). Reuse for both the hakkediş Excel and the PDF — do NOT re-derive deductions.
- `src/lib/log-office-activity.ts` (Phase 7): activity logging helper. Phase 11 extends the action
  type set with four export actions (D-109).
- `src/lib/format-money.ts` (Phase 10): precision-safe display formatter — useful for any
  on-screen mirroring of Excel content; NOT used inside the Excel cells themselves (D-116).
- `src/app/dashboard/(admin)/exports/page.tsx` (Phase 8): stub gets replaced.

**NOT this phase:** email/queue delivery of exports, Excel template branding (logo/watermark),
cross-language export variants (one click → both `*.tr.xlsx` + `*.en.xlsx`), and eager PDF
storage in Vercel Blob — all deferred.
</domain>

<decisions>
## Implementation Decisions

> Decision IDs continue the project sequence (Phase 10 ended at D-104).

### PDF stack (EXP-04)
- **D-105:** **`@react-pdf/renderer`** is the PDF library. Pure-Node generation; no Chromium
  binary on Vercel (deploy size + cold-start cost minimised). Render JSX with flex layouts,
  embed a TTF font via `Font.register`, stream the output to the route handler response.
  Pixel-fidelity to the on-screen detail page is NOT required — the PDF authors its own layout.
- **D-106 [Claude's Discretion — recommended DejaVu Sans]:** Embedded TTF font for the
  certificate = **DejaVu Sans** (well-tested for Turkish financial documents — full Latin
  Extended-A coverage; lowest risk for a legally-significant certificate). Planner may swap to
  the project's UI font (Inter or whatever base-nova actually bundles) if it's already in
  `node_modules` and renders crisply at PDF body sizes (9–11 pt). Font file lives in
  `public/fonts/` or `src/lib/pdf/fonts/` — planner's discretion.
- **D-107:** PDF is generated **on-demand each download click**, rendered from the period's
  frozen snapshot fields (`materialSnapshot`, `unitSnapshot`, `currencyCodeSnapshot`,
  `unitPriceSnapshot`, `cumulativeQtyApproved`, `previousCumulativeQty`, the DB-generated
  `periodQty`, `periodValue`, `cumulativeValue`, plus the period's deduction rates). The render
  code reads **ONLY** snapshot fields, **NEVER** the live BOQ / project records — preserves the
  D-95 / D-96 immutability story from Phase 10. No Vercel Blob storage; no eager generation at
  finalize.

### Exports page UX + triggers (EXP-01..EXP-04)
- **D-108:** **Distributed + hub UX.** Three trigger surfaces, single set of route handlers:
  - **`/dashboard/(admin)/exports`** (replaces the Phase 8 stub) hosts:
    submission ledger Excel + performance summaries Excel + a **period picker** that lets the
    user select any finalized / submitted / paid period and download its hakkediş Excel or PDF.
  - **Period detail page** (`/dashboard/(admin)/hakedis/[periodId]`) gains
    *"Excel'e Aktar / Export Excel"* and *"PDF İndir / Download PDF"* buttons in the
    `PeriodDetailControls` row — primary trigger immediately post-finalize.
  - **No duplication of generation logic** — both surfaces call the same `app/api/exports/...`
    route handlers (D-114).
- **D-109:** **Every successful export logs an `office_activity_log` row.** Four new
  `OFFICE_ACTION_TYPES` added: `hakedis_pdf_exported`, `hakedis_excel_exported`,
  `submission_ledger_exported`, `performance_summary_exported`. Each ships with TR + EN keys
  (`action_hakedis_pdf_exported`, etc.) and is mapped in the OE Scorecard's `actionTypeToKey()`
  (`src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx`). Audit-trail
  consistency with Phase 7's PERF-03 pattern.

### Performance summary scope (EXP-03)
- **D-110:** **SC3 literal — Workers + Auditors only.** Single workbook with two tabs:
  - **Workers tab:** submission volume, approval rate, rejection rate, location-compliance rate,
    output quantity (sum), value contribution by currency.
  - **Auditors tab:** decision count, approval/rejection split, mean turnaround
    (`decidedAt − submittedAt`), pending backlog, SLA-breach rate.
  Office engineers are **EXCLUDED** (their activity log is its own scorecard surface; the SC3
  wording is "worker and auditor"). Reuses Phase 9's `getPortfolioPeople({ role, dateRange,
  projectIds })` — no new SQL.

### Headers + filenames (EXP-01 / EXP-02 / EXP-04)
- **D-111:** **Bilingual column headers = joined "TR / EN" single header row** per sheet.
  Examples: `Dönem / Period`, `Bitiş Tarihi / End Date`, `Para Birimi / Currency`,
  `Net Ödeme / Net Payable`, `Gönderim Sayısı / Submission Volume`. Matches the project's
  existing UI label convention (`Aç / Open Period`, `Sil / Delete`). One header row; bold;
  tabular-nums where the data column is numeric.
- **D-112:** **Verbose filename pattern with project + date:**
  - Submission ledger: `submission-ledger-{projectSlug}-{fromDate}-{toDate}.xlsx`
  - BOQ / hakkediş Excel: `hakkedis-{periodNumber}-{projectSlug}.xlsx`
  - Performance summary: `performance-{projectSlug}-{fromDate}-{toDate}.xlsx`
    (use `-portfolio-` instead of a project slug when no project filter is active)
  - Hakkediş PDF: `hakkedis-{periodNumber}-{projectSlug}-{YYYYMMDD}.pdf`
    (YYYYMMDD = generation date, not the period end date)
  Office engineers managing multiple projects can find files later without opening them.

### Pre-decided technical (planner MUST honor)
- **D-113:** **ExcelJS is the Excel library** (already in CLAUDE.md tech stack; was used for BOQ
  import in Phase 1 — same library across read + write paths). Streamed to the response via the
  `workbook.xlsx.write(response)` pattern — lower memory than full in-memory build.
- **D-114:** **All export route handlers live under `src/app/api/exports/.../route.ts`**
  (additive; no existing routes moved). EVERY handler's **first statement** is
  `const session = await auth()` with the standard tenant lookup + `WHERE tenant_id =
  ${tenantId}` on every query (SC5 + the v2.0 lock). On no session → return HTTP **401**
  via `NextResponse` (NOT a redirect — these are binary content endpoints). Set
  `Content-Type` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` for
  Excel, `application/pdf` for PDF) and `Content-Disposition: attachment; filename="..."`
  with the D-112 filename.
- **D-115:** **BOQ / hakkediş Excel = three sheets per SC2:**
  1. **Yeşil Defter** — cumulative register across all periods of the project (TR sheet name
     mirrors the on-screen domain term; bilingual TR/EN column headers per D-111).
  2. **Fiyat İcmali** — this period's qty × unit price per BOQ line.
  3. **Hesap Özeti** — gross → KDV → KDV tevkifat → stopaj → teminat → avans → **Net Ödeme**
     (mirrors the on-screen SC3 deduction chain from Phase 10).
- **D-116:** **Money values in Excel cells use the cell `numFmt`** (e.g. `#,##0.00` or
  `[$TRY] #,##0.00`) — NEVER `parseFloat(value)` in the route handler. The value flows from
  Postgres `numeric` → decimal string → directly into the Excel cell with the format applied;
  Excel renders the locale-appropriate grouping. The currency code lives in a separate
  column. Aligns with the money-math lock + Phase 10's `formatMoney` precision pattern.

### Claude's Discretion
- **D-106** TTF font (DejaVu Sans recommended; planner may swap to the project's UI font if
  already bundled).
- ExcelJS streaming buffer size + flush cadence; freeze-pane behavior on header row; exact
  column ordering per sheet.
- `/dashboard/(admin)/exports` page layout — KpiCard-style trigger cards vs button list;
  decide during `/gsd:ui-phase 11`.
- Error-state UX (e.g. clicking "Download PDF" against a draft period — block server-side AND
  hide the trigger client-side via the existing `status !== 'draft'` gate pattern).
- Period picker on the Exports hub — filter by status (`status != 'draft'` so only finalized
  /submitted/paid periods appear, since the PDF is always on an immutable snapshot).
- PDF metadata: `Title`, `Author`, `CreationDate` (planner picks; suggest using
  `period.periodNumber` for Title and the office engineer's display name for Author).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 11: Exports" — goal + 5 success criteria.
- `.planning/ROADMAP.md` §"Milestone v2.0 — Locked decisions carried into all phases" — money
  math in Postgres + decimal.js, additive `(admin)` routes, **explicit `auth()` guard on every
  new `route.ts`** (load-bearing for SC5), TR/EN i18n parity.
- `.planning/REQUIREMENTS.md` — EXP-01..EXP-04 (Pending).

### Data sources to read (do NOT re-implement)
- `src/actions/analytics.ts` — `getCanonicalSubmissions({ dateRange, projectIds, personId,
  status, limit, offset })` is the submission ledger source; `getPortfolioPeople({ role,
  dateRange, projectIds })` is the performance summary source. Both `auth()` + tenant-scoped,
  money-in-Postgres, currency-grouped.
- `src/actions/hakedis.ts` — `getPeriodDetail(periodId)` returns
  `{ period, lines, deductions }` where `deductions` contains `gross / kdv / tevkifat / stopaj
  / teminat / avans / net` as decimal strings already computed via the D-90 Postgres chain.
  The Excel + PDF use this DIRECTLY; do NOT re-derive deductions.
- `src/db/schema/hakedis-periods.ts`, `hakedis-period-lines.ts` — the snapshot fields the PDF
  renders. `period_qty` is DB-`GENERATED` (D-104) — read it; never compute it client-side.
- `src/db/schema/office-activity-log.ts` + `src/lib/log-office-activity.ts` — Phase 7 helper
  for logging exports; extend `OFFICE_ACTION_TYPES` per D-109.
- `src/db/schema/submissions.ts`, `boq-items.ts`, `projects.ts`, `people.ts` — domain types
  for the ledger.

### Surfaces (existing stub + UI-SPEC scope)
- `src/app/dashboard/(admin)/exports/page.tsx` — current Phase 8 coming-soon stub; Phase 11
  replaces it (same pattern Phase 10 used for the `/hakedis` stub).
- `src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx` +
  `src/components/admin/PeriodDetailControls.tsx` — gain Excel + PDF download buttons in the
  controls row (additive — extend the existing JSX, do NOT redesign).
- `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx` — extend the
  `actionTypeToKey()` map with the four new export action types (D-109).
- `messages/en.json` + `messages/tr.json` — extend the `dashboard.admin.exports.*` namespace
  + add four `action_*_exported` keys under the activity-log section.

### Prior-phase patterns to honor
- `.planning/phases/08-admin-shell-information-architecture/08-CONTEXT.md` — D-67 currency
  selector default TRY; D-73 URL filter convention (`?from=&to=&project=&person=&status=`);
  D-74 6-item nav locked (Exports is one of the six — keep it).
- `.planning/phases/10-hakkedi-billing/10-CONTEXT.md` — D-90 deduction chain (the on-screen
  chain the PDF + Hesap Özeti mirror); D-95 / D-96 finalization immutability; D-101
  one-period-one-currency.
- `src/lib/format-money.ts` (Phase 10) — precision-safe display formatter pattern; mirror its
  rounding discipline when reflecting Excel values on screen (Excel itself handles the cell
  format via D-116).

### Project conventions
- `CLAUDE.md` — stack; ExcelJS already listed; money-in-Postgres + decimal.js (display only);
  Istanbul tz; next-intl 4.x; shadcn via `node_modules/.bin/shadcn add` (NOT `npx shadcn@latest`).
- ⚠ Phase 11 ships the **first `/api/...` routes inside the `(admin)` area**. Confirm Next.js
  App Router conventions for streaming binary responses (`Content-Type`,
  `Content-Disposition`, `NextResponse` body types). The `auth()` guard on the Telegram webhook
  route handler is the closest precedent (different shape — JSON not binary).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/actions/analytics.ts`** — `getCanonicalSubmissions` + `getPortfolioPeople` cover the
  ledger + performance data layer end-to-end (already auth + tenant + money-in-Postgres). The
  Excel route handlers transform these typed results into rows; no new SQL needed.
- **`src/actions/hakedis.ts`** — `getPeriodDetail` returns `{ period, lines, deductions }`. Both
  the BOQ/hakkediş Excel and the PDF read this DIRECTLY; the deduction chain (gross → ... → net)
  is already computed in Postgres `numeric` and returned as decimal strings.
- **`src/lib/log-office-activity.ts`** (Phase 7) + `office_activity_log` — Phase 11 calls this
  helper with the four new action types (D-109).
- **`src/components/admin/PeriodDetailControls.tsx`** (Phase 10) — extended with two new buttons
  (Excel + PDF). The `status !== 'draft'` gate already there protects against draft exports
  client-side.

### Established Patterns
- All actions / route handlers: `auth()` guard first + `WHERE tenant_id = ${tenantId}`; Drizzle
  `sql\`\`` bound params; money in Postgres numeric returned as strings; never cross-currency sum.
- Pages: `export const dynamic = 'force-dynamic'`; read `searchParams`; `useSearchParams()`
  clients wrapped in `<Suspense>`; full TR/EN i18n parity for every new label.
- Shared lib precedent — `src/lib/format-money.ts`, `src/lib/currencies.ts`,
  `src/lib/leaderboard-sort.ts` all carry helpers extracted from `'use server'` action files
  (the directive forbids non-async exports). Phase 11 helpers (PDF render component, Excel
  builder helpers) follow the same `src/lib/` placement.

### Integration Points
- **New route handlers** under `src/app/api/exports/` (paths planner's discretion — suggest
  `/api/exports/submissions/route.ts`, `/api/exports/hakedis/{periodId}/route.ts`,
  `/api/exports/hakedis/{periodId}/pdf/route.ts`, `/api/exports/performance/route.ts`).
- **Trigger surfaces** — `/dashboard/(admin)/exports/page.tsx` (replaces stub) +
  `PeriodDetailControls.tsx` (additive).
- **Activity log extension** — 4 new entries to `OFFICE_ACTION_TYPES` +
  `actionTypeToKey()` map.
- **i18n namespace extension** — `dashboard.admin.exports.*` (new keys) + 4 new
  `action_*_exported` keys under the existing activity-log section.
</code_context>

<specifics>
## Specific Ideas

- Joined "TR / EN" header style matches the existing UI button labels (`Aç / Open Period`,
  `Sil / Delete`) — single bold row, no merged cells, freeze pane on row 1.
- Sheet names in Turkish (`Yeşil Defter`, `Fiyat İcmali`, `Hesap Özeti`); column headers
  bilingual.
- Verbose filename pattern with project slug + date — see D-112 for exact patterns.
- Excel cells use `numFmt "#,##0.00"` for money; currency code in its own column.
- Hakkediş Excel + PDF: primary trigger lives in `PeriodDetailControls`, secondary entry in the
  Exports hub period picker. Same route handlers serve both surfaces.
</specifics>

<deferred>
## Deferred Ideas

- **Email / queue delivery of exports** — send the PDF / Excel directly to the office
  engineer's email or into a queue for batch generation. Out of scope; v1 is direct download
  only.
- **Excel template / branding** (logo, watermark, header band, custom colours) — out of scope;
  clean default styling for v1.
- **Cross-language export variants** (one click → both `*.tr.xlsx` + `*.en.xlsx`) — out of
  scope. Joined TR/EN headers satisfy SC1 with a single workbook.
- **Eager PDF storage in Vercel Blob** — explicitly deferred (D-107 = on-demand only).
- **Office-engineer performance summary** — explicitly out of SC3 (D-110 = workers + auditors
  only). Future extension would re-use `getOfficeActivityLog`.
- **Per-period audit log of who downloaded the PDF** (beyond a single
  `hakedis_pdf_exported` row) — the v1 log captures actor + period + timestamp; richer
  download analytics are a future enhancement.

### Reviewed Todos (not folded)
- `submission-detail-map-link.md` — Phase-8 records-detail follow-up (Google Maps link on the
  canonical submission detail page). Not Exports work; stays deferred.
- `tenant-settings-seed-fk-safe.md` — Phase-9 migration FK-safety follow-up. Not Exports work;
  stays deferred. (Phase 11 has no migration, so this is also opportunistically irrelevant
  here.)
</deferred>

---

*Phase: 11-exports*
*Context gathered: 2026-05-28*
</content>
