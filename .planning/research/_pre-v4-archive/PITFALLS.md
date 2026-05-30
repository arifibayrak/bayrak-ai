# Pitfalls Research

**Domain:** v2.0 Operations Intelligence & Hakkediş — adding analytics, earned-value cost math, Turkish hakkediş billing, and Excel/PDF export to a shipped Next.js + Drizzle + PostGIS + Vercel app.
**Researched:** 2026-05-25
**Confidence:** HIGH — grounded in actual schema (boq-items.ts, submissions.ts, assignments.ts), known v1 gotchas from STATE.md, and the existing excel.ts import convention.

> **Note on v1 pitfalls:** The original 18 pitfalls (grammY replay, serverless sessions, idempotency, PostGIS types, coordinate order, etc.) remain valid and are not repeated here. This file is additive — it covers only what changes or is introduced by v2 features.

---

## Critical Pitfalls

### Pitfall 1: Money Math — `numeric` Columns Are Strings in Drizzle, Not JS Numbers

**What goes wrong:**
Drizzle returns `numeric` column values as JavaScript **strings**, not numbers. `boqItems.plannedQty` is `"5000.000"`, not `5000`. Adding `unit_price` as `numeric(12,2)` means `unitPrice` will also be a string. Multiplying two Drizzle-returned numeric strings naively — `boqItem.plannedQty * boqItem.unitPrice` — silently does NaN in JavaScript if the value hasn't been parsed, or produces a string concatenation if coercion is wrong.

In practice: earned value = `approvedQty × unitPrice`. If you do `parseFloat(approvedQty) * parseFloat(unitPrice)` in JS and then accumulate across dozens of BOQ lines, floating-point drift accumulates. A project with 80 BOQ items, each calculated in JS floats, can show a total earned value off by several lira — acceptable aesthetically, unacceptable in a hakkediş document that goes to a client.

**Why it happens:**
Developers write `const earned = row.approvedQty * row.unitPrice` without knowing Drizzle's numeric type returns strings. The `*` operator coerces both sides with `Number()`, which loses the decimal precision that `numeric(12,2)` was supposed to preserve. The bug only shows at scale — unit tests with small integers hide it.

**How to avoid:**
- Do all earned-value arithmetic in Postgres, not JavaScript. Use a computed column query: `SUM(approved_qty::numeric * unit_price::numeric)` in SQL. Return the result as a single `numeric` from the DB; parse it exactly once at the boundary.
- Never accumulate money in a JS `number` loop. Use a Postgres aggregation: `SELECT boq_item_id, SUM(quantity) AS approved_qty FROM submissions WHERE status='approved' GROUP BY boq_item_id` then join with `boq_items.unit_price` in SQL for a single multiplied sum per item.
- If you must do math in JS (e.g., for display), use a decimal library (e.g., `decimal.js` or `big.js`) — never native float arithmetic on money.
- Enforce this in a utility function: `toDecimal(drizzleNumeric: string): Decimal` — forces all callers to go through a typed conversion.

**Warning signs:**
- Hakkediş totals that differ between Excel export and the dashboard summary by a few kuruş.
- `NaN` appearing in KDV or tevkifat calculations.
- Unit tests that use round integers passing, real data revealing a discrepancy.

**Phase to address:** Phase covering unit_price addition + earned-value analytics (first phase that writes financial math). Establish the DB-aggregation pattern before any cost display is built.

---

### Pitfall 2: Rounding Order for KDV and Tevkifat — Sequence Matters

**What goes wrong:**
Turkish hakkediş math has a specific legal rounding order:

```
Ara Toplam (subtotal)      = SUM(line_item amounts)
KDV Matrahı (VAT base)     = Ara Toplam − Tevkifat
KDV (VAT 20%)              = KDV Matrahı × 0.20
Tevkifat (withholding 3/10 of KDV) = KDV × (3/10)
Teminat (retention %)      = Ara Toplam × retention_rate
Net Ödenecek               = Ara Toplam + KDV − Tevkifat − Teminat
```

The trap: rounding each line item *before* summing, versus summing exact values and rounding once at the end, produces different totals. Tevkifat on KDV is commonly `3/10` (yani 2% effective rate on matrah), rounded to the nearest kuruş. If you round KDV first then apply `3/10`, you may get ±0.01 TRY vs the legally correct figure. Turkish tax law defines the rounding point — the auditor's accountant will catch this.

**Why it happens:**
Developers apply rounding at each step for display, then feed rounded values into the next calculation. This is mathematically wrong for the final document. The hakkediş certificate must match the official calculation exactly or the client's finance team rejects it.

**How to avoid:**
- Accumulate all intermediate values at full Postgres `numeric(12,3)` precision.
- Apply `ROUND(..., 2)` exactly once per aggregate field, at the final SELECT that populates the hakkediş line items — nowhere earlier.
- Hardcode the rounding sequence in a single server-side function (`computeHakkedis(lines, vatRate, tevkifatFraction, retentionRate)`); no callers may apply their own rounding.
- Include a test fixture with known Turkish hakkediş numbers (taken from a real hakedis document) that asserts the output to the exact kuruş.

**Warning signs:**
- KDV Matrahı + Tevkifat ≠ KDV (rounding applied out of order).
- Totals on Excel export differ from totals on dashboard by 0.01-0.05 TRY.
- Client finance team reporting discrepancies in issued hakkediş certificates.

**Phase to address:** Hakkediş billing phase. The rounding function must be signed off before the first PDF/Excel export is built — changing rounding order after documents are issued is an accounting correction event.

---

### Pitfall 3: Cumulative vs Period Quantities in Hakkediş — The Double-Billing Trap

**What goes wrong:**
Turkish hakkediş certificates are issued per period (hakedis dönem). Each period's invoiceable amount is:

```
Bu Dönem Miktarı = Toplam Onaylı Miktar (cumulative) − Önceki Dönem Toplam Onaylı Miktar
```

The trap: if you query `SUM(quantity WHERE status='approved')` without restricting by period boundary, you get the cumulative total, not the period delta. If the same cumulative total is invoiced on two consecutive periods without subtracting the previous period's approved qty, the same work is billed twice.

This is the most financially damaging v2 pitfall — it means submitting a hakkediş certificate for work that was already paid in a previous period.

**Why it happens:**
The mental model for approved quantity is cumulative (total work done). The billing model is delta (what's new since last hakedis). Confusing these two is easy when both feel like "approved quantity."

**How to avoid:**
- Store a `hakkediş_periods` table with: `id`, `project_id`, `period_number`, `cutoff_at` (timestamp), `status` (draft/issued/paid). Each period has a `cutoff_at` that is immutable once the period is closed.
- Store `hakkediş_line_items` with: `period_id`, `boq_item_id`, `cumulative_qty_at_cutoff`, `previous_cumulative_qty`, `period_qty` (derived = cumulative − previous).
- `period_qty` is the invoiceable quantity; never query raw `SUM(submissions.quantity)` for billing.
- Add a DB constraint: `CHECK (cumulative_qty_at_cutoff >= previous_cumulative_qty)` to prevent negative period quantities.
- Closing a period must be an idempotent, transactional operation: calculate cutoff quantities, lock the period, prohibit edits to `cutoff_at` after `status = 'issued'`.

**Warning signs:**
- Period quantity exceeding planned quantity on a line item.
- Two periods showing the same cumulative total (previous not stored correctly).
- Negative period quantity on a BOQ item (regression in audit approval).

**Phase to address:** Hakkediş periods/billing phase — the data model must enforce cumulative vs period distinction before any line-item calculation is written.

---

### Pitfall 4: Aggregating Quantities Across BOQ Items with Different Units

**What goes wrong:**
The BOQ has items in mixed units: `m` (metres of pipe), `m³` (cubic metres of concrete), `adet` (number of valves). Summing quantities across items — `SUM(approved_qty)` without grouping by unit — produces a dimensionless number that has no physical meaning. Displaying "Total approved: 8,432 units" in a cross-project KPI is silently meaningless.

The safe aggregate is **value** (TRY): `SUM(approved_qty * unit_price)`. This is always summable across items because it's always in the same unit (currency).

**Why it happens:**
Dashboard KPIs want a single number. Developers reach for `SUM(quantity)` because it's simple. The semantic invalidity isn't caught by the database.

**How to avoid:**
- Never expose a sum of `quantity` across BOQ items of different units in any dashboard card, chart, or API endpoint. The query must always `GROUP BY unit` if quantities are summed.
- The only cross-item aggregate that is valid without grouping by unit is `SUM(approved_qty * unit_price)` — document this as a team rule.
- For progress metrics, express completeness as a value percentage: `SUM(approved_qty * unit_price) / SUM(planned_qty * unit_price)` per project. This already exists conceptually in v1's BOQ progress display but must be extended for cross-project portfolio KPIs.
- If showing "quantity" in a performance scorecard for a worker, always show the unit alongside it: "123.5 m installed" not "123.5 units."

**Warning signs:**
- Any `GROUP BY` query on `submissions` or `boq_items` that sums quantities without also grouping or filtering by `unit`.
- Dashboard card labeled "Total Installed" with a naked number and no unit.
- Worker scorecard showing a combined quantity across projects with different BOQ units.

**Phase to address:** Analytics/scorecards phase — add a lint rule to code review: any `SUM(quantity)` or `SUM(approved_qty)` that isn't paired with a `GROUP BY unit` or a `JOIN boq_items ON unit = 'X'` filter must be flagged.

---

### Pitfall 5: Time-Zone Errors in Date-Range Filters — Turkey Is UTC+3

**What goes wrong:**
`submissions.submitted_at` is stored as `timestamp with time zone` (UTC in Postgres). Turkey is UTC+3 (Europe/Istanbul, no DST since 2016). A date-range filter for "this week" constructed in the browser (JavaScript `new Date()`) or in a Next.js server component without explicit timezone handling will use UTC midnight, not Istanbul midnight. A submission logged by a worker at 23:30 Istanbul time (20:30 UTC) will appear in the wrong day's report.

For hakkediş period cutoffs stored as UTC timestamps, a period defined as "ending 31 May 23:59" must be interpreted as 31 May 23:59 **Istanbul time** (= 31 May 20:59 UTC), or the last 3 hours of the day's work is silently included in or excluded from the period.

**Why it happens:**
`Date.now()` and `new Date()` in Node.js on Vercel return UTC. Developers write `WHERE submitted_at >= '2026-05-01'::date` which Postgres interprets as midnight UTC, not midnight Istanbul.

**How to avoid:**
- All date-range filter boundaries that originate from the UI must be computed with explicit timezone: `Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul' })` or `new Date(dateStr + 'T00:00:00+03:00')`.
- In Postgres queries, use `AT TIME ZONE 'Europe/Istanbul'` when filtering by calendar date: `WHERE submitted_at AT TIME ZONE 'Europe/Istanbul' >= '2026-05-01'`.
- Hakkediş period `cutoff_at` must be stored in UTC after converting from the Istanbul time the user selected in the UI. Include a `cutoff_at_display` text column (ISO 8601 with `+03:00` offset) so the displayed cutoff is unambiguous.
- Add a unit test: insert a submission at `2026-05-31T21:30:00Z` (= 2026-06-01 00:30 Istanbul), assert it appears in the June report, not the May report, when filtered by Istanbul calendar date.

**Warning signs:**
- Reports showing different totals depending on whether the filter is applied server-side vs client-side.
- Period cutoff appearing to include/exclude the last few hours of work differently than the UI shows.
- Workers on night shifts (22:00–01:00 Istanbul) having their submissions appear on the "wrong" date in daily reports.

**Phase to address:** Any phase that introduces date-range filters or hakkediş period boundaries — establish the Istanbul timezone conversion utility before the first filtered query is written.

---

### Pitfall 6: Per-Person Attribution — Role Lives on Assignments, Not on People

**What goes wrong:**
`people` has no `role` column. Role is on `assignments.role_on_project`. A person can be `worker` on Project A and `auditor` on Project B simultaneously. A cross-project performance scorecard that filters "all workers" by joining `people` and looking for a role field will fail to find the right records — because the role is project-scoped.

Concretely: a query like `SELECT person_id FROM assignments WHERE role_on_project = 'worker'` returns a person multiple times if they are a worker on multiple projects, and excludes their auditor assignments on other projects. If the scorecard then groups all submissions by `person_id` without filtering by project context, auditor-driven approvals are mixed into worker submission counts.

**Why it happens:**
The v1 schema is correct (role on assignments, not people — per STATE.md decision D-03). But analytics queries naturally want to say "show me all workers" and reach for a simpler join. The subtlety of project-scoped role is easy to miss when writing aggregation queries.

**How to avoid:**
- All scorecard queries must join `assignments` and filter `role_on_project` per project, not globally. Example: a worker scorecard shows submissions where `submissions.project_id = assignments.project_id AND assignments.person_id = submissions.person_id AND assignments.role_on_project = 'worker'`.
- For cross-project "portfolio" views, use a DISTINCT on `person_id` with an aggregation per project, not a flat sum.
- An "auditor scorecard" must query `audit_notifications` or `submissions.decided_by`, never infer auditor status from submissions.
- Write a test: Person P is worker on Project A (3 submissions), auditor on Project B (5 decisions). Worker scorecard for P must show 3 submissions, not 8.

**Warning signs:**
- Worker scorecard submission count doubling for people assigned to multiple projects.
- Auditor decision metrics appearing in worker submission metrics for dual-role people.
- `GROUP BY person_id` without a `GROUP BY project_id` in a cross-project analytics query.

**Phase to address:** Analytics/scorecards phase — establish role-scoped query patterns before building any cross-project aggregation.

---

### Pitfall 7: SLA / Time Metrics — NULL `decidedAt` Poisons Averages

**What goes wrong:**
`submissions.decided_at` is NULL for any submission still in `pending_audit`. Computing audit SLA with `AVG(decided_at - submitted_at)` in SQL silently excludes NULLs from the average — which means the average is only over *decided* submissions. A project with a large backlog of undecided submissions shows a falsely good average SLA because the longest-pending submissions are excluded.

Separately: `EXTRACT(EPOCH FROM (decided_at - submitted_at))` returns NULL when `decided_at` IS NULL, and NULL propagates through arithmetic — any sum, count, or comparison involving it produces NULL or is silently dropped.

**Why it happens:**
SQL's NULL semantics surprise developers. `AVG()` ignores NULLs by spec; this is "correct" behavior but produces misleading KPIs for SLA. Developers test with a dataset where all submissions are decided and miss the NULL case entirely.

**How to avoid:**
- Always compute SLA metrics in two separate queries: (1) "median/average decision time for decided submissions" using `WHERE status IN ('approved', 'rejected') AND decided_at IS NOT NULL`, (2) "backlog" = count and age of `pending_audit` submissions using `WHERE status = 'pending_audit'`.
- Never combine both into a single `AVG()` that mixes decided and pending.
- Display "backlog" as a separate dashboard metric: "Bekleyen: 12 onay (en eskisi: 3 gün)" — do not fold pending submissions into the SLA average.
- For alerting on stalled submissions: use `NOW() - submitted_at > INTERVAL '48 hours' AND status = 'pending_audit'` as the alert condition — not a comparison against `decided_at`.

**Warning signs:**
- SLA average drops mysteriously when a project accumulates a backlog (because pending NULLs excluded).
- Alert fires only after a submission is decided (because the alert query referenced `decided_at`).
- Dashboard shows "Average audit time: 2h" for a project that has 5 submissions pending for 10 days.

**Phase to address:** SLA/performance metrics phase — define the decided vs pending split as the first rule of any SLA query.

---

### Pitfall 8: Office Activity Log — Over-Logging, Blocking Request Path, PII

**What goes wrong:**
Three related failure modes:

1. **Blocking:** If the activity log `INSERT` runs synchronously inside a Server Action or route handler, it adds latency to every office action. If the DB insert fails (network hiccup), the Server Action returns an error even though the primary action (e.g., project creation) succeeded. The user sees an error for something that actually worked.

2. **Over-logging:** Logging every page view, every filter change, every sorting click creates a firehose that makes the log meaningless and the table enormous. The table becomes a performance liability with no analytical value.

3. **PII/Retention:** The activity log may capture `description` fields like "Updated project X to name: [full project name]" or "Searched for person: [full name]". In a GDPR/KVKK context (Turkey has KVKK — Kişisel Verilerin Korunması Kanunu), storing searchable personal data in a log table without a defined retention policy is a compliance risk.

**Why it happens:**
Logging feels like a "just add one INSERT" feature. The PII and retention concerns only emerge when the log grows in production.

**How to avoid:**
- Use `next/server`'s `after()` to fire the log INSERT after the response is sent — the primary action is never blocked by or coupled to the log write.
- Define a narrow event taxonomy before building: only log *state transitions* that are auditable (project created, BOQ item updated, hakkediş period opened/closed, user assigned). Never log reads, views, or filter changes.
- Log `event_type` (enum) + `entity_type` + `entity_id` + `actor_person_id` + `occurred_at`. Avoid free-text descriptions that capture personal data inline; reconstruct human-readable descriptions at read time by joining entity tables.
- Add `CHECK` constraint on `event_type` so the schema enforces the taxonomy.
- Set a `occurred_at` index and add a comment: "Rows older than 90 days may be archived." Implement a nightly Postgres cron (pg_cron on Neon) or a Vercel cron route that deletes rows beyond the retention window.

**Warning signs:**
- Server Action `try/catch` that catches log failures and surfaces them as user-facing errors.
- Log table growing at 10x the rate of the submissions table.
- `description` column containing full names, phone numbers, or email addresses.

**Phase to address:** Office activity log phase (new table). Wire `after()` pattern on day one; define the event taxonomy before the first INSERT is written.

---

### Pitfall 9: Vercel Serverless Export — Memory Limits and Streaming for Large Workbooks

**What goes wrong:**
ExcelJS builds the entire workbook in memory before writing. A hakkediş Excel with 500 BOQ line items per project × 20 projects = 10,000 rows is manageable. But a "full submission history" export with 50,000 submission rows (cross-project, date range unbounded) allocates a large in-memory workbook. Vercel serverless functions have a 1 GB memory limit but the practical soft limit before cold-start costs spike is ~256 MB. ExcelJS's in-memory model for large workbooks can exceed this.

Separately: the known v1 gotcha — `NextResponse` body must be `BodyInit` — means the `Buffer` from ExcelJS must be wrapped in `new Uint8Array(buffer)` before returning. The same constraint applies to PDF generation.

**Why it happens:**
Exports are added late as "simple" features. The dataset size is only discovered in production when an office engineer exports the first full-project history.

**How to avoid:**
- **Cap exports at the server:** Accept `from_date` and `to_date` as required parameters for any export that queries submissions. Reject requests with no date range or a range exceeding 90 days in a single export. Return HTTP 400 with a clear message.
- **Use ExcelJS streaming mode for large exports:** `workbook.csv.write(stream)` or the streaming XLSX writer. Alternatively, use ExcelJS's `stream.xlsx.WorkbookWriter` which writes rows directly to a stream without buffering the full workbook in memory.
- **BodyInit reminder:** Export route handlers must return `new Uint8Array(await workbook.xlsx.writeBuffer())` — not `Buffer.from(buf)` — to satisfy Next.js route handler `NextResponse` type (v1 gotcha, carries forward).
- **Avoid returning large `Response` objects:** For exports >5 MB, consider returning a signed Vercel Blob URL instead of streaming the file directly from the function.
- **Vercel function timeout for exports:** Set `export const maxDuration = 60;` in the export route handler to use the 60-second limit on Pro tier (default is 15s). Document this in the file. If a job exceeds 60s, it must be split.

**Warning signs:**
- `FUNCTION_INVOCATION_TIMEOUT` in Vercel logs on export routes.
- `JavaScript heap out of memory` in Vercel function logs.
- Office engineers exporting full history and seeing HTTP 504.

**Phase to address:** Exports phase. Apply the streaming writer and date-range cap before the first production export is enabled.

---

### Pitfall 10: Turkish Characters in PDF — Font Must Be Embedded

**What goes wrong:**
Turkish uses characters outside Latin-1: `ğ Ğ ş Ş ı İ ç Ç ö Ö ü Ü`. Most PDF generation libraries (pdfmake, PDFKit) default to the 14 built-in Helvetica/Times fonts, which do not cover these glyphs. Turkish characters in a hakkediş PDF appear as blank boxes, question marks, or are silently dropped — making the PDF legally invalid.

**Why it happens:**
Development happens on English-locale machines. Test data uses Latin characters. The glyph coverage gap only surfaces when real Turkish project names and material names appear in the PDF.

**How to avoid:**
- Embed a Unicode-capable font in the PDF generator. The safest choice is the DejaVu font family (open-source, full Unicode support including Turkish). Alternatively, embed a subset of a system font that covers the Turkish character block (U+011E–U+015F).
- With `pdfmake`: register the font in `vfs_fonts` and set it as the `defaultFont`. With `PDFKit`: call `doc.font('./fonts/DejaVuSans.ttf')` before any text call.
- Test with a fixture that includes all 12 Turkish-specific characters in a project name and material description, assert the PDF bytes contain the correct UTF-8 sequences.
- Keep the font file in `src/assets/fonts/` and import it at build time — do not fetch it from a CDN at PDF generation time (adds latency + network dependency).

**Warning signs:**
- Hakkediş PDF showing empty boxes for `ğ`, `ş`, or `ı` characters.
- PDF rendering correctly on the developer's machine but incorrectly in Vercel production (different system font availability).

**Phase to address:** PDF hakkediş certificate phase. Font embedding must be the first step; do not build any PDF layout until the character test passes.

---

### Pitfall 11: Financial Route Authorization — Analytics and Hakkediş Expose Sensitive Data Without Auth Guards

**What goes wrong:**
v2 adds routes such as `/dashboard/analytics`, `/dashboard/hakkediş`, `/dashboard/people/[id]`, and `/api/export/*`. These expose contract values, unit prices, earned value totals, employee performance metrics, and billing documents. The existing `dashboard/layout.tsx` Auth.js guard protects the current v1 dashboard. However, new route segments added under new paths (e.g., `/analytics/` as a new top-level segment outside `dashboard/`) or new API routes under `/api/export/` may not be covered by the existing layout guard.

The hakkediş PDF/Excel export route is particularly dangerous: it is a `route.ts` (not a `page.tsx`), so it does not inherit the `dashboard/layout.tsx` session check. An unauthenticated request to `/api/export/hakkediş?period_id=X` could return a complete billing document.

**Why it happens:**
Layout-based auth guards in Next.js App Router only protect page segments in the same route group. Route handlers (`route.ts`) do not inherit layout guards. Middleware is the correct layer for route handler protection, but middleware was not required for v1's simpler structure.

**How to avoid:**
- Add a centralized auth check at the top of every `route.ts` that returns financial data:
  ```typescript
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  ```
- Use Next.js middleware (`src/middleware.ts`) to protect all `/api/export/*` and any new top-level dashboard segment that is outside the existing `(dashboard)` route group. The existing `auth-allowlist.ts` pattern from v1 can be extended.
- Add an integration test for every export route: assert that a request without a session cookie returns HTTP 401, not HTTP 200.
- Do not rely on "it's behind the dashboard" as protection for API routes — route handlers have independent URL space.

**Warning signs:**
- `curl https://bayrak.ai/api/export/hakkediş?period_id=X` returning HTTP 200 without a cookie.
- Any new `route.ts` file without a session check at line 1-5 of the handler.
- New route segments added outside `src/app/dashboard/` without a corresponding middleware rule.

**Phase to address:** IA restructure / navigation phase (which creates new route segments) AND any export phase that adds `route.ts` files. Auth guard on every new route handler is a PR-merge requirement, not a future cleanup.

---

### Pitfall 12: Navigation / IA Restructure — Breaking Existing Links and Bookmarks

**What goes wrong:**
v2 restructures the nav to an admin shell: Overview · Projects · People · Analytics · Hakkediş · Exports. The existing v1 URLs are `dashboard/projects/[id]` and `dashboard/projects/[id]/edit`. If the v2 IA moves projects under a different segment (e.g., `dashboard/projects` stays but `dashboard/analytics` and `dashboard/hakkediş` are added as siblings), internal links in existing pages and direct URLs bookmarked by office engineers will still work. But if any existing route is *moved* (e.g., project detail from `/dashboard/projects/[id]` to `/dashboard/admin/projects/[id]`), all existing links break silently (404 with no redirect).

Additionally, v1's `boq-template/route.ts` under `dashboard/projects/[id]/boq-template/` must survive the IA restructure. If the file is moved as part of a directory reorganization, the download link in the existing dashboard page breaks.

**Why it happens:**
IA restructure looks like a "just move files" operation. Next.js App Router maps filesystem to URLs exactly; moving a directory changes the URL.

**How to avoid:**
- Adopt an **additive-only** strategy for v2 route changes: add new segments (`/dashboard/analytics`, `/dashboard/hakkediş`, `/dashboard/people`) without moving any existing `dashboard/projects/*` route.
- For any segment that must move, add a `redirect()` in the old location's page or a Next.js `rewrites` in `next.config.ts` before removing the old path.
- Keep `dashboard/projects/[id]/boq-template/route.ts` in its exact current location.
- After any file system reorganization that changes route structure, run `grep -r 'href=' src/` and assert no links point to non-existent routes.
- Add a smoke test: after IA refactor, visit the 5 main v1 URLs and assert HTTP 200 (not 404 or redirect).

**Warning signs:**
- Git diff showing a directory rename under `src/app/dashboard/` that changes the route path.
- Next.js build completing without error but runtime navigation producing 404.
- `href="/dashboard/projects"` links in existing pages breaking after restructure.

**Phase to address:** IA/navigation restructure phase — the "additive only" constraint must be established as the rule before any file moves begin.

---

### Pitfall 13: Currency and Locale in Exports — Decimal Separator Consistency

**What goes wrong:**
The v1 `excel.ts` import normalizes Turkish comma decimals to periods (`"123,5"` → `123.5`) on the way *in*. The v2 export must go the other direction: financial figures exported to Excel for Turkish users should use Turkish number formatting (`1.234,56` not `1,234.56`), and column headers should be bilingual as established in the template convention.

If the export uses JavaScript's `Number.toFixed(2)` and writes the result as a string cell, Excel may or may not recognize it as a number depending on the locale of the user's Excel installation. A Turkish Excel expects `1.234,56` as the numeric format — `1234.56` will be parsed correctly only if the cell type is set to `numeric` (not string) in ExcelJS.

Separately: TRY amounts in a hakkediş export should include the currency symbol. Using `₺` (U+20BA) requires the embedded font to support it — same glyph-coverage issue as the PDF pitfall above.

**How to avoid:**
- Write monetary values to ExcelJS as **numbers** (not strings): `row.getCell('amount').value = 1234.56; row.getCell('amount').numFmt = '#,##0.00 ₺';`. ExcelJS `numFmt` applies the locale-aware formatting on the Excel side, which respects the user's regional settings.
- Do not format numbers as strings before writing to ExcelJS. The string `"1.234,56"` will not sort or sum correctly in Excel.
- Bilingual column headers: follow the `src/lib/excel.ts` convention already established: `'Sözleşme Miktarı / Contracted Qty'`. Apply the same `Türkçe / English` pattern for all v2 export columns.
- Add a smoke test: open the generated Excel in LibreOffice (CI-safe) and assert the monetary columns have numeric cell type.

**Warning signs:**
- SUM formulas in Excel returning 0 on exported financial columns (cells are string-typed, not numeric).
- `₺` symbol appearing as a box in the exported file.
- Bilingual header convention inconsistently applied (some columns Turkish-only, some English-only).

**Phase to address:** Exports phase — extend `excel.ts` with a `numFmt` convention before the first hakkediş export is built.

---

### Pitfall 14: N+1 on Per-Person and Per-Project Rollups — Missing Aggregate Indexes

**What goes wrong:**
Performance scorecard queries for each person: for N people in the system, loading each person's submission count, approval rate, and rejection rate in a loop (N individual queries) is an N+1 pattern. At 50 people this is 50 queries per page load. At 200 people it is noticeable latency.

The `submissions` table already has indexes on `project_id`, `person_id`, and `status` individually. But cross-project analytics queries join on multiple conditions: `person_id AND status AND submitted_at (range)`. The individual indexes are not a composite — Postgres may use one index and scan the result for the second condition, or fall back to a bitmap index scan that is slower than a composite index.

**Why it happens:**
Drizzle queries are written one-at-a-time in components. The individual page works fast with a small dataset. The N+1 pattern only surfaces when the page renders for a real office with 50 employees.

**How to avoid:**
- Write a single SQL query that returns all people's rollup data in one round trip: `SELECT person_id, COUNT(*) FILTER (WHERE status = 'approved') AS approved, COUNT(*) FILTER (WHERE status = 'rejected') AS rejected FROM submissions GROUP BY person_id`. Join this result to `people` once.
- Add a composite index for the analytics query: `CREATE INDEX submissions_person_status_date_idx ON submissions (person_id, status, submitted_at DESC)`. The `submitted_at DESC` tail enables efficient date-range filtering.
- Add a composite index for project-level value aggregation: `CREATE INDEX submissions_project_status_boq_idx ON submissions (project_id, status, boq_item_id)`.
- Run `EXPLAIN ANALYZE` on all analytics queries in a staging DB with realistic data volumes (>1,000 rows) before shipping. Document the query plan in the PR.

**Warning signs:**
- React dev tools showing 50+ Suspense waterfalls in the people list page.
- Server component logs showing >20 DB queries per page load.
- People scorecard page taking >3s with 30 employees in the system.

**Phase to address:** Analytics phase — establish single-query rollup patterns and add composite indexes in the migration before the first analytics page is built.

---

### Pitfall 15: `force-dynamic` and Revalidation for Financial Data — Stale Caches on Live Dashboards

**What goes wrong:**
The v1 dashboard uses `export const dynamic = 'force-dynamic'` on live data pages (per STATE.md). If v2 analytics pages or hakkediş pages are built without this export, Next.js may statically render them at build time and cache the result indefinitely. A hakkediş summary page showing the approved totals at the time of last build — not the current approved totals — is a silent data integrity failure.

Additionally, `generateStaticParams` or page-level caching on an analytics route segment will cache financial totals. A submission approved 10 minutes ago will not appear in the dashboard until the cache is invalidated.

**Why it happens:**
Next.js App Router defaults to static rendering for server components that have no dynamic function calls. Developers add analytics queries but forget to mark the segment as dynamic.

**How to avoid:**
- Every server component that reads from `submissions`, `boq_items`, or any financial table must have `export const dynamic = 'force-dynamic'` at the top of its module, or must call a dynamic function (`cookies()`, `headers()`) to opt out of static rendering.
- Alternatively, use `revalidate = 0` for financial pages.
- For data that can be slightly stale (e.g., a trend chart updated every 5 minutes is acceptable), use `revalidate = 300`. But hakkediş summaries and approved-quantity totals must be `force-dynamic` — stale financial data is worse than slightly slower load times.
- Add a CI check: `grep -r "export const dynamic" src/app/dashboard/` and assert every new analytics/hakkediş page file contains it.

**Warning signs:**
- Dashboard showing yesterday's approval count after new approvals come in.
- Vercel dashboard showing the analytics page as a "static" route (green dot in the deployment output).
- `cache: 'no-store'` missing from `fetch` calls inside analytics server components.

**Phase to address:** Every phase that introduces a new server-rendered analytics or billing page — add `force-dynamic` as the first line of every new page file as a convention, enforced in PR review.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Calculate earned value in JS floats instead of Postgres `numeric` aggregation | Simpler component code | Kuruş-level discrepancies in hakkediş documents; client rejects certificate | Never for billing data |
| Round KDV at each line item instead of once at total | Matches display | Legal rounding discrepancy; accountant rejects document | Never |
| Skip `force-dynamic` on financial pages | Faster cold-start | Stale balance shown; audited submission not reflected in dashboard | Never for financial totals |
| Log every user action (including reads) | "Complete" audit trail | Log table becomes noise; query performance impact; KVKK compliance risk | Never; only log state-transitions |
| Run activity log INSERT synchronously in Server Action | Simpler code | Adds latency; log failure surfaces as user-facing error on primary action | Never; use `after()` |
| Emit `SUM(quantity)` across mixed-unit BOQ items | Simple KPI number | Dimensionless total with no semantic meaning; misleads office engineers | Never in public-facing KPIs |
| Export full submission history without date cap | Simpler UX (no date picker required) | Memory exhaustion / timeout in Vercel function for large datasets | Acceptable only in dev/internal |
| Skip font embedding in PDF, rely on system fonts | Zero font setup effort | Turkish characters missing on Vercel Linux environment | Never for production PDF |
| Add analytics routes outside `dashboard/` without middleware guard | Faster dev iteration | Financial data exposed without auth | Never |
| Inline `period_qty = cumulative_qty` without storing `previous_cumulative_qty` | Simpler hakkediş model | Double-billing on second period if previous not subtracted | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Drizzle `numeric` return | Treating returned string as JS number for arithmetic | Parse with `parseFloat()` or pass to Postgres for aggregation; never multiply raw Drizzle numeric strings |
| ExcelJS cell type | Writing monetary values as formatted strings (`"1.234,56"`) | Set cell `.value = number` and `.numFmt = '#,##0.00 ₺'` — let Excel format |
| ExcelJS + Node 24 Buffer | `buffer.buffer` (full `ArrayBuffer`) not sliced | Use `buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)` — v1 gotcha, carries forward |
| Next.js route handler body | `Buffer` passed to `NextResponse` | Wrap in `new Uint8Array(buffer)` — v1 gotcha, carries forward |
| Postgres date filter | `WHERE submitted_at >= '2026-05-01'` uses UTC midnight | `WHERE submitted_at AT TIME ZONE 'Europe/Istanbul' >= '2026-05-01'` |
| Auth.js + route handler | `route.ts` does not inherit `layout.tsx` session guard | Call `await auth()` at the top of every export/analytics route handler |
| ExcelJS + Turkish characters | Default Helvetica font has no Turkish glyphs | Set explicit font with Turkish coverage; same issue in PDF generation |
| Vercel export timeout | Default 15s function timeout | Add `export const maxDuration = 60` to export route handlers; add date-range cap |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 per-person scorecard queries | People list page slow (>3s for 50 people) | Single `GROUP BY person_id` query; load all rollups in one round trip | ~30 people |
| Missing composite index for analytics (person + status + date) | Analytics page slow with date-range filter | `CREATE INDEX submissions_person_status_date_idx ON submissions (person_id, status, submitted_at DESC)` | ~5,000 submissions |
| ExcelJS full in-memory workbook for large exports | `FUNCTION_INVOCATION_TIMEOUT` or heap OOM | Use ExcelJS streaming writer; cap date range | ~10,000 submission rows |
| Cross-project `SUM(submissions.quantity)` without index | Portfolio KPI page slow | Composite index `(project_id, status, boq_item_id)` | ~20,000 submissions |
| Analytics page statically cached | Stale financial data in dashboard | `export const dynamic = 'force-dynamic'` on every financial page | Build time (silent) |
| Hakkediş line-item join without index on `period_id` | Hakkediş detail page slow | Index on `hakkediş_line_items.period_id` in initial migration | ~100 periods |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| No auth check in export route handlers (`route.ts`) | Financial documents accessible without login | `const session = await auth(); if (!session) return 401` at line 1 of every export handler |
| Hakkediş period `cutoff_at` mutable after `status = 'issued'` | Retroactive period manipulation; billing fraud risk | DB-level immutability: trigger or application guard that rejects `UPDATE` on `cutoff_at` when `status != 'draft'` |
| Activity log capturing personal data in free-text `description` | KVKK compliance risk; data minimization violation | Log `event_type + entity_id`; reconstruct human-readable description at read time by joining entity tables |
| Analytics API endpoints not scoped to tenant | Cross-tenant data leakage in future multi-tenant path | All analytics queries must include `WHERE tenant_id = ?`; even single-tenant builds must enforce this pattern (from v1 schema decision) |
| Unsigned export URLs | Anyone with the URL can download a signed financial document | Require session on every export request; do not generate public Vercel Blob URLs for hakkediş documents |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Mixed-unit quantity totals in portfolio KPIs | Office engineer sees meaningless "total installed" number | Show only value-based progress (TRY earned vs TRY contracted); never sum quantities across units |
| SLA average that excludes pending submissions | Falsely good SLA metric; backlog invisible | Show "Decided avg: X hours" + "Backlog: N pending (oldest: Y days)" as separate metrics |
| Hakkediş export with no billing period selector | Cumulative vs period confusion for user | Period selector is required before any hakkediş export; default to current open period |
| Turkish decimal in exported figures shown as US decimal | Client's finance team reads `1234.56` as 1234.56 TRY (correct) but Excel SUM fails if cell is string | Write numeric cells + TRY `numFmt`; let Excel handle locale display |
| IA restructure breaking existing project deep links | Office engineers' bookmarks 404 | Additive-only route strategy; redirect any moved segment before deleting old path |
| Financial route loading without auth prompt (just blank page) | User confused; security gap appears as UX issue | Return 401 JSON from route handler; Auth.js middleware redirects page routes to sign-in |

---

## "Looks Done But Isn't" Checklist

- [ ] **Earned value math:** `SUM(approved_qty * unit_price)` computed in Postgres — verify by checking no `*` operator in JS on Drizzle numeric strings
- [ ] **Hakkediş rounding:** KDV, Tevkifat, Teminat computed from full-precision totals, rounded once at output — verify with a known fixture document
- [ ] **Period double-billing guard:** `hakkediş_line_items.period_qty` = `cumulative_qty_at_cutoff − previous_cumulative_qty` — verify second period does not re-include first period's quantity
- [ ] **Istanbul timezone filters:** Date-range analytics queries use `AT TIME ZONE 'Europe/Istanbul'` — verify with a submission logged at 23:30 Istanbul time appears in the correct calendar day
- [ ] **Activity log non-blocking:** Log INSERT uses `after()` — verify primary Server Action still returns success if log INSERT throws
- [ ] **Export auth guard:** `curl` without a session cookie to every export route returns HTTP 401 — verify for each `route.ts` added in exports phase
- [ ] **Export BodyInit:** Export routes return `new Uint8Array(buffer)` not `Buffer` — verify no `TypeError: body must be BodyInit` in Vercel function logs
- [ ] **Turkish characters in PDF:** All 12 Turkish-specific characters render correctly — verify with a fixture that includes `ğĞşŞıİçÇöÖüÜ` in project name + material description
- [ ] **ExcelJS numeric cells:** Monetary columns in export have `.value = number` (not string) — verify SUM formula on the column returns correct total in Excel/LibreOffice
- [ ] **Force-dynamic on financial pages:** Every new analytics/hakkediş page file has `export const dynamic = 'force-dynamic'` — verify with `grep -r "export const dynamic" src/app/dashboard/`
- [ ] **Role-scoped scorecards:** Worker scorecard for a dual-role person shows only worker submissions — verify with a person assigned worker on Project A and auditor on Project B
- [ ] **SLA backlog separation:** Pending submissions excluded from SLA average; backlog shown as separate metric — verify with a dataset of 3 decided + 5 pending submissions
- [ ] **Navigation additive-only:** Existing `/dashboard/projects/[id]` URL returns HTTP 200 after IA restructure — verify with a smoke test on v1 URLs post-restructure

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Double-billing across periods (cumulative not subtracted) | VERY HIGH | Audit all issued hakkediş; recompute correct period quantities; issue credit notes for over-billed periods; correct DB records |
| Earned value in JS floats causing kuruş drift | MEDIUM | Migrate all earned-value computation to Postgres aggregation; recompute all stored summaries; diff vs previously issued documents |
| KDV rounding out of order (documents already issued) | HIGH | Reissue corrected hakkediş certificates; notify client finance team; correct accounting records |
| Export auth missing (financial data accessed without auth) | HIGH | Rotate Vercel Blob prefixes or move documents; add auth guard immediately; notify affected parties if data was accessed |
| Activity log PII captured in description field | MEDIUM | Migrate free-text descriptions to entity-reference model; delete old description column after migration; document KVKK basis |
| Font missing in PDF (blank characters) | LOW | Add font file + re-deploy; re-generate affected PDFs |
| IA restructure broke existing links (no redirects) | LOW | Add `redirect()` or `next.config.ts` rewrites; no data loss |
| NULLs poisoning SLA average (wrong KPI displayed) | LOW | Fix query to split decided vs pending; historical KPI data was misleading but not financially damaging |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Money math — Drizzle numeric strings in JS arithmetic | Unit price addition / earned value analytics phase | Unit test: `computeEarnedValue(items)` with known decimal inputs returns exact expected TRY total |
| KDV/tevkifat rounding order | Hakkediş billing phase | Fixture test with a real hakkediş document; assert to the exact kuruş |
| Cumulative vs period double-billing | Hakkediş periods data model phase | Integration test: two periods; assert period 2 total = cumulative total − period 1 total |
| Mixed-unit quantity aggregation | Analytics / scorecards phase | Code review rule: any `SUM(quantity)` without `GROUP BY unit` is a merge blocker |
| Istanbul timezone in date filters | Date-range filter phase (analytics or filters) | Unit test: submission at 23:30 Istanbul time appears in Istanbul calendar day's report |
| Role-scoped attribution | Analytics / scorecards phase | Test: dual-role person's worker scorecard shows only worker submissions |
| SLA NULL handling for pending submissions | SLA / performance metrics phase | Unit test: 5 pending submissions not included in SLA average; shown in backlog count |
| Office activity log blocking / PII | Office activity log phase (new table) | Load test: Server Action succeeds when log INSERT is mocked to throw; PII grep on log table schema |
| Vercel export memory / timeout | Exports phase | Load test: export with 10,000 rows completes within function timeout; memory <256MB |
| Turkish characters in PDF | PDF generation phase | Render fixture with all 12 Turkish characters; assert no blank glyphs |
| Export route auth guard | Exports phase (and IA restructure phase) | `curl` without session cookie returns 401 on every export route handler |
| Navigation breaking existing links | IA restructure phase | Smoke test: all v1 URLs return 200 after restructure |
| Currency/locale in Excel exports | Exports phase | LibreOffice CI check: monetary columns are numeric type; SUM formula returns correct total |
| N+1 scorecard queries | Analytics phase | `EXPLAIN ANALYZE` on people scorecard query; assert single query, no per-person loop |
| Missing composite indexes | Analytics phase | `EXPLAIN ANALYZE` with 5,000+ row dataset; assert index scan not seq scan |
| `force-dynamic` missing on financial pages | Every analytics/hakkediş page addition | `grep -r "export const dynamic" src/app/dashboard/` in CI |
| Hakkediş period immutability after issue | Hakkediş billing phase | Attempt SQL `UPDATE hakkediş_periods SET cutoff_at = NOW() WHERE status = 'issued'`; assert rejected |

---

## Sources

- Drizzle ORM numeric type behavior: https://orm.drizzle.team/docs/column-types/pg#numeric
- Turkish KDV/tevkifat rounding rules: Turkish Revenue Administration (GİB) KDV Genel Uygulama Tebliği, Madde 11
- KVKK (Turkey Personal Data Protection Law): https://www.kvkk.gov.tr/
- ExcelJS streaming writer: https://github.com/exceljs/exceljs#streaming-xlsx-writer
- ExcelJS number format strings: https://github.com/exceljs/exceljs#number-formats
- Next.js `after()` for post-response work: https://nextjs.org/docs/app/api-reference/functions/after
- Next.js route handler auth pattern: https://authjs.dev/getting-started/migrating-to-v5#authenticating-server-side
- Vercel function memory limits: https://vercel.com/docs/functions/runtimes/node-js#memory
- Vercel `maxDuration` config: https://vercel.com/docs/functions/configuring-functions/duration
- PostGIS timezone-aware filtering: https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-ZONECONVERT
- DejaVu fonts for PDF Turkish glyph coverage: https://dejavu-fonts.github.io/
- pdfmake font embedding: https://pdfmake.github.io/docs/0.1/fonts/custom-fonts-client-side/
- Postgres FILTER clause for conditional aggregation: https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-AGGREGATES
- next-intl number formatting (Turkish locale): https://next-intl.dev/docs/usage/numbers
- v1 excel.ts (this project): src/lib/excel.ts — Buffer/BodyInit gotchas already resolved; numFmt convention to extend

---
*Pitfalls research for: bayrak.ai v2.0 — Operations Intelligence & Hakkediş (analytics, earned value, Turkish hakkediş billing, Excel/PDF export)*
*Researched: 2026-05-25*
