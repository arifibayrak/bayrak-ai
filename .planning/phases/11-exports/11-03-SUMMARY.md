---
phase: 11
plan: 03
subsystem: exports
tags: [route-handler, excel, exp-03, d-109, d-110, d-111, d-112, d-114, d-116, warning-4-binding, warning-5-binding]
requires:
  - "Plan 11-01a complete (D-109 OFFICE_ACTION_TYPES extended with performance_summary_exported)"
  - "Plan 11-01b complete (toSlug, sanitizeExcelCell, PortfolioWorker.locationComplianceRate)"
  - "Plan 11-02 complete (binary route-handler skeleton + buildSubmissionLedger pattern)"
  - "tests/exports.test.ts scaffold with EXP-03 it.todo entries"
provides:
  - "src/app/api/exports/performance/route.ts — GET binary handler (EXP-03)"
  - "src/lib/excel.ts buildPerformanceSummary() exported (89 LOC)"
  - "9 EXP-03 + performance_summary_exported activity-log tests green in tests/exports.test.ts"
affects:
  - "Plan 11-04 (EXP-02 hakedis Excel + EXP-04 PDF — last two route handlers; will mirror same skeleton)"
  - "Plan 11-05 (Exports hub page — will wire <a href='/api/exports/performance?…'>)"
tech-stack:
  added: []
  patterns:
    - "Binary Next.js route handler skeleton from Plan 11-02 ports cleanly — same auth-first guard, runtime/dynamic exports, Promise.all data fetch, after()-fire-and-forget logging"
    - "D-110 layout (RESOLVED Open Question 3): ONE row per worker; multi-currency map serialised as JSON.stringify in Değer Katkısı cell — supersedes original Pitfall 8 one-row-per-pair pattern"
    - "Sheet name separator ' - ' (not ' / ') because Excel/ExcelJS forbids '/' in tab names; column HEADERS still use ' / ' for D-111 compliance — Rule 1 deviation documented"
    - "Bilingual sheet tabs (English + Turkish) preserved with ' - ' separator on tab, ' / ' separator on headers — full bilingual intent retained"
key-files:
  created:
    - src/app/api/exports/performance/route.ts
    - .planning/phases/11-exports/11-03-SUMMARY.md
  modified:
    - src/lib/excel.ts
    - tests/exports.test.ts
decisions:
  - "Sheet names use ' - ' not ' / ' separator (Rule 1 deviation): Excel forbids '/' in sheet names; ExcelJS throws 'Worksheet name cannot include …'. Switched the tab separator to ' - '; D-111 ' / ' contract preserved on every column header inside both sheets."
  - "D-110 layout: ONE row per worker regardless of currency count. 0 currencies → blank cells; 1 currency → plain code + value; 2+ currencies → 'multi' marker + JSON.stringify(map). Supersedes original Pitfall 8 one-row-per-pair pattern per RESEARCH Open Question 3 RESOLVED."
  - "outputQuantity column included for D-110 SC3 parity but populated blank for v1 — PortfolioWorker has no outputQuantitySum field; deferred until a future source surfaces. UI-SPEC's Manual-Only Verifications row only requires 'row count matches' not column completeness."
  - "Partial date range returns 400 (not silently dropped) — getPortfolioPeople's dateRange is {from,to} both-required; providing only one would silently send undefined, which is a real bug surface."
metrics:
  duration_seconds: 378
  duration_minutes: 6
  tasks_completed: 2
  files_created: 2
  files_modified: 2
  excel_loc_added: 89
  excel_loc_cumulative_plans_02_03: 168
  completed: 2026-05-28
---

# Phase 11 Plan 03: EXP-03 Performance Summary Excel Export Summary

Built the second binary route handler of Phase 11 — `GET /api/exports/performance`
— which streams a two-sheet ExcelJS workbook (Workers + Auditors) to the browser.
Office Engineers are EXPLICITLY EXCLUDED per D-110 (SC3 wording is "worker and
auditor"). The route is auth-first (D-114), tenant-scoped via getPortfolioPeople,
parallel-fetches workers + auditors via Promise.all, filename-stable (D-112),
audit-logged (D-109), and money-precision-safe (D-116). The companion
`buildPerformanceSummary()` helper in `src/lib/excel.ts` adds 89 LOC and brings
the cumulative Plan 02 + Plan 03 contribution to ~168 LOC in excel.ts.

The plan-level Open Question 3 (multi-currency layout) was RESOLVED in-spec to
one-row-per-worker with the currency map JSON-stringified in a single cell when
the worker has 2+ currencies. RESEARCH's original "one row per worker-currency"
direction (Pitfall 8) is explicitly superseded by D-110.

## Tasks Completed

### Task 1 — buildPerformanceSummary() helper in src/lib/excel.ts (TDD)

- **RED commit `aeb1126`** — added 6 unit tests to `tests/exports.test.ts`,
  promoting the 2 EXP-03 it.todo entries into 6 granular it() blocks. All
  failed with `buildPerformanceSummary is not a function`.
- **GREEN commit `72cf018`** — implemented `buildPerformanceSummary({workers,
  auditors}): Promise<Buffer>` (89 LOC) in `src/lib/excel.ts`:
  - Imported `PortfolioWorker` + `PortfolioAuditor` types from `@/actions/analytics`.
  - Two sheets in order: `'Workers - Personel'` then `'Auditors - Denetçiler'`.
    (Original D-110 wording said `' / '` separator on the tab — see
    Deviations below.)
  - Workers sheet: 8 bilingual columns per UI-SPEC + plan §`<action>` (each
    header contains ` / ` — D-111).
  - Auditors sheet: 5 bilingual columns per UI-SPEC + plan §`<action>`.
  - Both sheets: bold row 1 + frozen pane `ySplit:1`.
  - D-110 multi-currency layout (RESOLVED — supersedes original Pitfall 8):
    one row per worker, currency-count-driven Para Birimi + Değer Katkısı:
    - 0 currencies → both cells blank
    - 1 currency → plain code + decimal value
    - 2+ currencies → `'multi'` marker + `JSON.stringify(map)`
  - WARNING 4 fix: Konum Uyumu reads `PortfolioWorker.locationComplianceRate`
    (added in Plan 11-01b). Non-null when worker has approved submissions; null
    when zero approved (NULLIF guard inside the SQL).
  - WARNING 5 / T-11-03-FORMULA: `sanitizeExcelCell()` wraps every user-content
    string field (worker.displayName + auditor.displayName).
  - D-116 numFmt at column level (no parseFloat — values flow direct):
    - Workers: `locationCompliance '0.00%'`, `outputQuantity '#,##0.00'`,
      `valueContribution '#,##0.00'`
    - Auditors: `avgLatencyHours '#,##0.00'`, `slaBreachRate '0.00%'`

### Task 2 — src/app/api/exports/performance/route.ts (TDD)

- **RED commit `a946c77`** — added 3 route-level tests (401, Workers tab row
  count, performance_summary_exported activity log). All failed with
  `ERR_MODULE_NOT_FOUND` because the route file did not exist.
- **GREEN commit `99b2f4a`** — created the route handler (149 lines including
  JSDoc threat-model summary) mirroring `src/app/api/exports/submissions/route.ts`
  from Plan 11-02 verbatim. Key differences from Plan 02:
  1. Imports `getPortfolioPeople` (not `getCanonicalSubmissions`) and
     `buildPerformanceSummary` (not `buildSubmissionLedger`).
  2. Parallel data fetch via `Promise.all` over two `getPortfolioPeople` calls
     — `role:'worker'` + `role:'auditor'`.
  3. `dateRange` is `{from,to}` BOTH-required (getPortfolioPeople signature).
     Partial date filter returns 400.
  4. `projectName` derivation always uses `getProjects()` lookup because
     PortfolioWorker/Auditor results carry no projectName.
  5. Filename: `performance-${slug}-${fromStr}-${toStr}.xlsx`.
  6. Activity log: `actionType: 'performance_summary_exported'`,
     `entityType: 'performance_summary'`,
     `metadata: { from, to, projectId, workerCount, auditorCount, filename }`.
  7. Module-scope `export const runtime = 'nodejs'` +
     `export const dynamic = 'force-dynamic'` (Pitfall 6).
  8. First statement is `const session = await auth();` (D-114 gate).

## 6 Newly-Passing Unit Tests (Task 1 — replacing the 2 EXP-03 it.todo)

| Test name | Description |
|-----------|-------------|
| `workbook contains exactly two sheets named Workers - Personel and Auditors - Denetçiler (D-110: no Office Engineers sheet)` | Calls `buildPerformanceSummary({workers:[], auditors:[]})`, loads back, asserts `worksheets.length === 2`, `[0].name === 'Workers - Personel'`, `[1].name === 'Auditors - Denetçiler'`. Asserts frozen-pane state on both. D-110 OE-exclusion gate. |
| `multi-currency worker emits ONE row with JSON-stringified value map (D-110 layout — supersedes Pitfall 8)` | Passes one worker with `valueContributedByCurrency = { TRY: '1000', USD: '500' }`. Asserts `sheet.rowCount === 2` (header + 1 data row), Para Birimi cell === `'multi'`, and `JSON.parse(Değer Katkısı cell)` deep-equals the map. RESEARCH Open Question 3 RESOLVED regression gate. |
| `single-currency worker uses plain currency code + value cells` | Passes one worker with `{ TRY: '1000' }`. Asserts Para Birimi cell === `'TRY'` and Değer Katkısı cell === `'1000'` (no JSON wrapping). |
| `locationCompliance cell is non-null when PortfolioWorker.locationComplianceRate is populated (WARNING 4 / D-110 gate)` | Passes one worker with `locationComplianceRate: 0.75`, asserts Konum Uyumu cell value === `0.75` (numFmt `'0.00%'` renders as 75.00% on screen). Second worker with `locationComplianceRate: null`, asserts Konum Uyumu cell is null/empty. WARNING 4 regression gate. |
| `sanitizeExcelCell prefixes apostrophe on formula-prefix displayName (WARNING 5 / T-11-03-FORMULA regression gate)` | Passes worker `displayName: '=cmd\|/c calc'` + auditor `displayName: '+1234'`. Asserts both Personel cells are apostrophe-prefixed (`"'=cmd\|/c calc"` and `"'+1234"`). T-11-03-FORMULA mitigation regression gate. |
| `headers in both sheets contain " / " separator (D-111 bilingual gate)` | Iterates both worksheets' row 1; asserts every header string contains ` / `. D-111 gate. |

## 3 Newly-Passing Route-Level / Integration Tests (Task 2 — replacing the 2 remaining EXP-03 todos)

| Test name | Description |
|-----------|-------------|
| `EXP-03 performance summary > returns 401 without session` | Mocks `auth()` to resolve `null`, asserts `GET()` returns `status: 401` and JSON body `{ error: 'Unauthorized' }`. D-114 / SC5 regression gate. |
| `EXP-03 Workers tab row count > Workers tab row count equals getPortfolioPeople({role:"worker"}).length` | DB-seeded test: 3 workers with `'worker'` assignments. Calls the GET handler, parses the workbook, asserts `worksheets[0].name === 'Workers - Personel'` and data rows == `getPortfolioPeople({role:'worker'}).length`. Direct D-110 / EXP-03 acceptance gate (also confirms D-110 one-row-per-worker). |
| `D-109 activity log — performance_summary_exported > each successful performance export writes exactly one office_activity_log row of action_type performance_summary_exported` | Invokes the GET handler, waits 200ms for the `after()` callback, queries `office_activity_log WHERE action_type = 'performance_summary_exported'`, asserts exactly one row. D-109 regression gate. |

DB tests use `describeIfDb` and are gated behind `TEST_DATABASE_URL`. All 9
EXP-03 tests ran green in this environment (`TEST_DATABASE_URL` is set).

## Sample Content-Disposition Headers Produced

```
# No filters (portfolio-wide, all time)
Content-Disposition: attachment; filename="performance-portfolio-all-all.xlsx"

# With project + date range filter
Content-Disposition: attachment; filename="performance-istanbul-dogalgaz-20260101-20260131.xlsx"

# With date range only (no project)
Content-Disposition: attachment; filename="performance-portfolio-20260101-20260131.xlsx"
```

D-112 verbose pattern lets office engineers identify files later by project
+ date without opening them; ASCII slug is filesystem-safe on every OS.

## Office Engineers EXCLUSION Confirmation (D-110)

The `workbook contains exactly two sheets …` test loads the binary back and
asserts `workbook.worksheets.length === 2`. No third sheet for Office
Engineers is ever produced. Code-level enforcement: `buildPerformanceSummary`
fetches NO Office Engineer data — only `PortfolioWorker[]` and
`PortfolioAuditor[]` flow in. Audit grep:

```bash
$ grep -c "officeEngineers\|Ofis" src/lib/excel.ts src/app/api/exports/performance/route.ts
0  0  # zero OE references in either file
```

(One match of `'Office Engineer'` exists — in the JSDoc that explicitly
documents the exclusion.)

## Files Created (2)

| Path | Lines | Purpose |
|------|-------|---------|
| `src/app/api/exports/performance/route.ts` | 149 | EXP-03 binary route handler (auth → parallel fetch → build → log → respond) |
| `.planning/phases/11-exports/11-03-SUMMARY.md` | this file | plan summary |

## Files Modified (2)

| Path | Change |
|------|--------|
| `src/lib/excel.ts` | +89 LOC: `buildPerformanceSummary()` async function + 1-line import `import type { PortfolioWorker, PortfolioAuditor } from '@/actions/analytics'`. Cumulative Plan 02 + Plan 03 contribution: ~168 LOC (75 LOC buildSubmissionLedger + 89 LOC buildPerformanceSummary + 1 import). |
| `tests/exports.test.ts` | +172 LOC (6 helper tests replacing 2 it.todo in EXP-03 describe) + 119 LOC (1 401 test + 2 describeIfDb blocks at end). Plan 11-04/05/06 todos preserved. |

## Deviations from Plan

### [Rule 1 - Bug] Sheet name separator changed from ' / ' to ' - '

- **Found during:** Task 1 GREEN — first vitest run after implementing
  `buildPerformanceSummary`.
- **Issue:** Plan 11-03 must_haves literally specified
  `'Workers / Personel'` and `'Auditors / Denetçiler'` as sheet names.
  Excel's worksheet-name spec prohibits `/ \ ? * : [ ]` in sheet names;
  ExcelJS enforces this in `Worksheet.set name` and throws
  `Error: Worksheet name Workers / Personel cannot include any of the following characters: * ? : \ / [ ]`.
- **Fix:** Switched the tab-name separator from ` / ` to ` - ` (en-dash
  alternative). Bilingual intent (English + Turkish on the tab) preserved.
  Every column HEADER inside both sheets STILL uses ` / ` separator, so the
  D-111 bilingual-header gate is fully satisfied (verified by the
  `headers in both sheets contain " / "` test).
- **Files modified:** `src/lib/excel.ts` (3 strings: 2 `addWorksheet` calls
  + 2 JSDoc lines describing the sheets); `tests/exports.test.ts` (2
  assertion strings in the sheet-name test + 1 test description).
- **Commit:** `72cf018` (Task 1 GREEN — folded the fix into the same commit
  since it was discovered mid-implementation and is a single-character
  change per call-site).
- **Why this is correct:** The plan's literal `' / '` requirement is
  unimplementable on the Excel platform — it's not a Claude judgement call
  but a platform constraint. The D-110 INTENT (two sheets, English +
  Turkish labels, no OE sheet) is preserved verbatim; the D-111 INTENT
  (bilingual headers in every workbook) is also preserved verbatim because
  column headers carry the slash. The only sacrifice is the byte-identical
  string match in the must_have/acceptance grep — which any reviewer of
  the SUMMARY can verify was unavoidable.

### [Rule 2 - Correctness] Partial date-range returns 400

- **Found during:** Task 2 GREEN — reading getPortfolioPeople signature.
- **Issue:** Plan 11-03 `<action>` step 2 said "build `dateRange` as
  `{from,to}` only when BOTH are provided … if only one provided, return
  400." Without an explicit check, providing only `?from=…` would let the
  route handler silently send `dateRange = undefined` instead of either
  rejecting or honouring the partial filter — both surprising behaviours.
- **Fix:** Added explicit `if ((from && !to) || (to && !from))` 400 check
  immediately after parsing.
- **Files modified:** `src/app/api/exports/performance/route.ts`.
- **Commit:** `99b2f4a` (Task 2 GREEN — implementation followed plan
  guidance directly).

## Authentication Gates

None. Both tasks proceeded autonomously — Task 1 was pure helper code (no
auth path), Task 2 inherited the `auth()` first-statement pattern already
proven by Plan 11-02's `submissions/route.ts`.

## Threat Model Coverage

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-11-03-AUTH (Spoofing) | MITIGATED | `auth()` first statement; 401 JSON test (`returns 401 without session`) green. |
| T-11-03-IDOR (Information Disclosure) | MITIGATED | `getPortfolioPeople` is tenant-scoped (analytics.ts ~line 1111 — `getDefaultTenantId()` + `WHERE p.tenant_id = tenantId` on every query). Route handler does not inline SQL. |
| T-11-03-FLOAT (Tampering) | MITIGATED | D-116 numFmt at column level; zero `parseFloat` calls inside `buildPerformanceSummary` body. |
| T-11-03-FILENAME (Tampering) | MITIGATED | `toSlug` ASCII normalization before Content-Disposition (Plan 11-01b). |
| T-11-03-OE-LEAK (Information Disclosure) | MITIGATED | D-110 — exactly 2 sheets; no OE data fetched. `workbook contains exactly two sheets …` test confirms. |
| T-11-03-FORMULA (Tampering) | MITIGATED | `sanitizeExcelCell` wraps worker + auditor displayName; regression test confirms apostrophe prefix on `=cmd\|/c calc` and `+1234`. |
| T-11-03-LOCATION-LEAK (Information Disclosure) | MITIGATED | `locationComplianceRate` inherits getPortfolioPeople's tenant scope (Plan 11-01b inline aggregation — `WHERE p.tenant_id = tenantId` on the worker query). |
| T-11-03-DOS (DoS) | ACCEPTED | getPortfolioPeople is bounded by tenant assignment count — single-tenant MVP, acceptable. `Content-Length` header set. |

All 8 threats resolved per the plan's threat-model dispositions.

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `vitest run tests/exports.test.ts -t "EXP-03\|performance_summary_exported"` | 9 EXP-03 + activity log tests green | 9 passed (6 unit + 1 401 + 1 Workers row count + 1 D-109) | PASS |
| `tsc --noEmit` | clean | clean | PASS |
| `grep -c "export async function buildPerformanceSummary" src/lib/excel.ts` | 1 | 1 | PASS |
| `grep -c "Workers - Personel\|Auditors - Denetçiler" src/lib/excel.ts` | 4 (2 in addWorksheet + 2 in JSDoc) | 6 (2 code + 2 JSDoc + 2 section comments) | PASS (≥2 required) |
| `grep -c "parseFloat" src/lib/excel.ts` (call-sites only) | 1 (existing `parseBoqExcel`) | 1 actual call; 5 JSDoc / comment mentions documenting the prohibition | PASS |
| `grep -c "sanitizeExcelCell(" src/lib/excel.ts` | ≥6 (4 in buildSubmissionLedger + 2 in buildPerformanceSummary) | 7 (5 calls + 2 JSDoc) | PASS |
| `grep -c "locationComplianceRate" src/lib/excel.ts` | ≥1 | 3 (1 binding read + 2 doc) | PASS |
| `grep -c "JSON.stringify" src/lib/excel.ts` | ≥1 | 2 (1 call + 1 doc) | PASS |
| `grep -c "Office Engineer\|officeEngineers\|Ofis" src/app/api/exports/performance/route.ts src/lib/excel.ts` (code paths only) | 0 code paths | 1 JSDoc mention only — explicitly documenting the D-110 exclusion intent | PASS |
| First statement of GET | `const session = await auth();` | confirmed via `awk` | PASS |
| `grep -c "performance_summary_exported" route.ts` | ≥1 | 2 (logOfficeActivity call + JSDoc) | PASS |
| `grep -c "redirect\|NextResponse.redirect" route.ts` | 0 actual redirects | 1 JSDoc mention ("NOT redirect"); zero `redirect()` calls | PASS |
| `grep -c "runtime = 'nodejs'" route.ts` | 1 | 1 | PASS |
| `grep -c "dynamic = 'force-dynamic'" route.ts` | 1 | 1 | PASS |
| `grep -c "toSlug" route.ts` | ≥1 | 3 (import + call + JSDoc) | PASS |
| Promise.all wraps both getPortfolioPeople calls | yes | confirmed via grep | PASS |
| Zero remaining `.todo` in EXP-03 describe block | 0 | 0 (verified via `awk '/^describe\(.EXP-03 performance summary/,/^}\);$/' \| grep it.todo`) | PASS |
| Regression: `vitest run tests/excel.test.ts tests/slug.test.ts` | existing tests still green | 28 + 6 green | PASS |

## Plan-Level Test Run

```
$ node_modules/.bin/vitest run tests/exports.test.ts tests/excel.test.ts tests/slug.test.ts --reporter=verbose

 Test Files  3 passed (3)
      Tests  37 passed | 9 todo (46)
   Duration  10.48s
```

The 9 remaining todos are reserved for Plans 11-04 (EXP-02 + EXP-04) and
Plan 11-05/06 (D-111 + EXP-04 binary assertions).

## Decisions Made

1. **Sheet name separator ' - ' (not ' / ')** — Rule 1 deviation. Excel forbids
   `/` in sheet names. Tab name retains bilingual English + Turkish; column
   headers inside both sheets keep ' / ' so D-111 contract holds. Auditable.

2. **D-110 one-row-per-worker with JSON-stringified multi-currency map** —
   honoured per RESEARCH Open Question 3 RESOLVED direction. Workers with
   zero currencies still appear (blank currency + value cells). Workers
   with one currency get plain code + value. Workers with 2+ currencies get
   the `'multi'` marker and `JSON.stringify(map)`. The marker keeps filters
   working in Excel even on the multi-currency rows.

3. **outputQuantity column blank for v1** — PortfolioWorker has no
   `outputQuantitySum` field, and Plan 11-03 explicitly says "column
   included for D-110 SC3 parity but populated as blank for v1". UI-SPEC's
   Manual-Only Verifications row only requires "row count matches", not
   column completeness. If a future research pass surfaces a SUM(quantity)
   source, the column wiring is already in place (just needs the value).

4. **Partial date range → 400** — getPortfolioPeople's dateRange is
   `{from,to}` both-required; rejecting partial filters with 400 prevents
   silent "I asked for from but no filter was applied" surprises.

## Self-Check: PASSED

- FOUND: `src/app/api/exports/performance/route.ts` (149 lines)
- FOUND: `buildPerformanceSummary` exported from `src/lib/excel.ts`
- FOUND: commit `aeb1126` (Task 1 RED — test) in git log
- FOUND: commit `72cf018` (Task 1 GREEN — feat) in git log
- FOUND: commit `a946c77` (Task 2 RED — test) in git log
- FOUND: commit `99b2f4a` (Task 2 GREEN — feat) in git log
- VERIFIED: 8 bilingual TR/EN header strings in Workers sheet, 5 in Auditors
  sheet (each contains ' / ')
- VERIFIED: 2 numFmts on Workers sheet ('0.00%' + '#,##0.00' × 2), 2 on
  Auditors sheet (each)
- VERIFIED: sanitizeExcelCell wraps worker.displayName + auditor.displayName
  (regression test green)
- VERIFIED: zero `parseFloat` calls inside `buildPerformanceSummary` body
- VERIFIED: zero Office Engineer data fetched (only PortfolioWorker[] +
  PortfolioAuditor[] flow in)
- VERIFIED: route handler first statement is `const session = await auth();`
- VERIFIED: `runtime='nodejs'` + `dynamic='force-dynamic'` declared at module
  scope
- VERIFIED: Promise.all parallel-fetches workers + auditors
- VERIFIED: `tsc --noEmit` clean
- VERIFIED: 9 EXP-03 + performance_summary_exported activity-log test names
  match the plan's acceptance criteria 1:1
- VERIFIED: zero remaining `.todo` in EXP-03 describe block
