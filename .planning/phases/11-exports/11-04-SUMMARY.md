---
phase: 11
plan: 04
subsystem: exports
tags: [route-handler, excel, pdf, exp-02, exp-04, d-105, d-106, d-107, d-109, d-111, d-112, d-114, d-115, d-116, warning-5-binding, warning-6-binding]
requires:
  - "Plan 11-01a complete (@react-pdf/renderer + dejavu-fonts-ttf + pdf-parse installed; DejaVu TTFs in public/fonts/)"
  - "Plan 11-01b complete (toSlug, sanitizeExcelCell, tests/exports.test.ts scaffold, seedFinalizedHakedisFixture stub)"
  - "Plan 11-02 complete (binary route-handler skeleton + buildSubmissionLedger)"
  - "Plan 11-03 complete (buildPerformanceSummary + EXP-03 route handler)"
provides:
  - "tests/fixtures/exports.ts seedFinalizedHakedisFixture() implemented (replaces Wave-1 throwing stub)"
  - "src/lib/excel.ts buildHakedisExcel() exported (~135 LOC; three sheets per D-115)"
  - "src/lib/pdf/fonts.ts registerFonts() — D-106 DejaVu Sans + Bold Font.register at module scope"
  - "src/lib/pdf/hakedis-pdf.tsx HakedisPdf component + renderHakedisPdf helper (D-105 + D-107 snapshot-only)"
  - "src/app/api/exports/hakedis/[periodId]/route.ts — GET binary handler (EXP-02 hakkediş Excel)"
  - "src/app/api/exports/hakedis/[periodId]/pdf/route.ts — GET binary handler (EXP-04 hakkediş PDF)"
  - "11 new tests green in tests/exports.test.ts (4 buildHakedisExcel unit + 5 Excel route + 6 PDF route, including 2 D-109 activity log gates)"
  - "@vitejs/plugin-react installed in vitest config (Rule 3 — required to parse JSX in src/lib/pdf/hakedis-pdf.tsx under vitest's rolldown loader)"
  - "@types/pdf-parse@1.1.5 installed (Rule 3 — pdf-parse Turkish-text assertion in tests required types)"
affects:
  - "Plan 11-05 (Exports hub page — will wire <a href='/api/exports/hakedis/{periodId}'>+<a href='/api/exports/hakedis/{periodId}/pdf'>)"
  - "Plan 11-06 (PeriodDetailControls extension — primary trigger surface for these two endpoints)"
tech-stack:
  added:
    - "@vitejs/plugin-react (vitest devDep — JSX parser for src/lib/pdf/hakedis-pdf.tsx)"
    - "@types/pdf-parse@1.1.5 (vitest devDep — Turkish-text assertion types)"
  patterns:
    - "D-105: renderToBuffer wrapped in renderHakedisPdf helper (src/lib/pdf/hakedis-pdf.tsx) so the route file stays pure-TS (route.ts not route.tsx) — sidesteps vitest/rolldown JSX-parse failure under [periodId] dynamic-path resolution"
    - "D-106: Font.register at module scope via registerFonts() with try/catch deployment-precondition log (T-11-04-FONT-MISSING mitigation)"
    - "D-107: HakedisPdf imports ONLY @react-pdf symbols + @/actions/hakedis types — grep gate enforces zero @/actions/boq or @/db/schema/boq imports"
    - "D-115: ExcelJS workbook with three sheets in mandatory order: Yeşil Defter / Fiyat İcmali / Hesap Özeti"
    - "D-116 + Pitfall 2: Postgres decimal strings flow DIRECTLY into ExcelJS cells; numFmt at column level drives display; ZERO parseFloat in buildHakedisExcel"
    - "Both route handlers mirror Plan 11-02's skeleton (auth-first, NextResponse.json 401, runtime='nodejs', dynamic='force-dynamic', logOfficeActivity AFTER response)"
key-files:
  created:
    - src/app/api/exports/hakedis/[periodId]/route.ts
    - src/app/api/exports/hakedis/[periodId]/pdf/route.ts
    - src/lib/pdf/fonts.ts
    - src/lib/pdf/hakedis-pdf.tsx
    - .planning/phases/11-exports/11-04-SUMMARY.md
  modified:
    - tests/fixtures/exports.ts
    - src/lib/excel.ts
    - tests/exports.test.ts
    - vitest.config.ts
    - package.json
    - package-lock.json
decisions:
  - "Route handlers use auth() FIRST statement (D-114); 401 returns NextResponse.json (NOT redirect — binary endpoint)"
  - "UUID regex pre-validation rejects malformed periodId with 400 BEFORE the DB call (saves a query, no error-surface diffing)"
  - "getPeriodDetail throws 'Period not found' for both missing and cross-tenant IDOR — route collapses both into 404 with no info leak (T-11-04-IDOR)"
  - "Server-side draft guard (Pitfall 5): status==='draft' → 422 even though PeriodDetailControls hides the button client-side — defense in depth; server is source of truth"
  - "buildHakedisExcel writes Postgres decimal strings DIRECTLY to Hesap Özeti cells (no parseFloat, no Number()) — D-107 + D-116 + Pitfall 2 contract preserved end-to-end"
  - "Net Ödeme row uses Excel font={bold:true} for visual emphasis matching the UI-SPEC highlight (single sheet-3 affordance)"
  - "Route file kept as pure .ts (not .tsx): JSX wrapping isolated in renderHakedisPdf helper inside hakedis-pdf.tsx. Vitest's rolldown loader fails to parse .tsx files at dynamic-segment paths (/[periodId]/pdf/route.tsx); the helper indirection sidesteps the parser issue while keeping the route handler ergonomic."
  - "@vitejs/plugin-react added to vitest config (Rule 3) so the test loader can parse JSX in src/lib/pdf/hakedis-pdf.tsx — without it rolldown threw 'Failed to parse source ... jsx to preserve'"
  - "pdf-parse imported from lib/pdf-parse.js path in tests (Rule 1) — the package root index.js has a debug-mode block that auto-runs when module.parent is null (i.e. always in vitest), throwing ENOENT on a missing test fixture"
  - "@types/pdf-parse@1.1.5 installed (Rule 3) so the test types resolve cleanly without an inline declare module"
metrics:
  duration_seconds: 1080
  duration_minutes: 18
  tasks_completed: 4
  files_created: 5
  files_modified: 6
  excel_loc_added: 135
  pdf_loc_added: 192
  tests_green: 11
  total_suite_green: 341
  total_suite_files: 20
  pdf_buffer_size_bytes: 25305
  excel_buffer_size_bytes: 8916
  completed: 2026-05-28
---

# Phase 11 Plan 04: EXP-02 hakkediş Excel + EXP-04 hakkediş PDF Summary

Built the third and final pair of Wave-2 binary route handlers — `GET
/api/exports/hakedis/[periodId]` (three-sheet hakkediş Excel per D-115) and `GET
/api/exports/hakedis/[periodId]/pdf` (A4 hakkediş certificate with embedded
DejaVu Sans for Turkish glyph rendering per D-106). Both handlers reuse
`getPeriodDetail()` (D-107 snapshot-only contract; deductions already computed in
Postgres numeric per D-90) and follow Plan 11-02's auth-first skeleton verbatim.
The PDF integrates `@react-pdf/renderer` with a `registerFonts()` module-scope
hook that loads DejaVu Sans + Bold from `public/fonts/`. The Excel writes
deduction decimal strings DIRECTLY into Hesap Özeti cells (no `parseFloat`)
preserving the D-107 + D-116 + Pitfall 2 precision contract end-to-end.

After this plan, all four Phase 11 export endpoints exist and return 401
without auth. Plan 11-05 (Exports hub) and Plan 11-06 (PeriodDetailControls
extension) only need to wire `<a download>` triggers.

## Tasks Completed

### Task 1 — `seedFinalizedHakedisFixture()` (commit `ed4e5d8`)

Replaced the Wave-1 throwing stub in `tests/fixtures/exports.ts` with a real
implementation that seeds:

- Default tenant (`0000…0001`) + Auth.js user (`test-user-id` — matches the
  `auth()` mock in `tests/exports.test.ts`)
- Project `'İstanbul Doğalgaz'` (the Turkish-character name exercises both
  D-112 `toSlug` → `istanbul-dogalgaz` AND D-106 PDF Turkish glyph rendering
  — the period's project name flows verbatim into the PDF header text)
- 2 BOQ items with `unit_price` `'100.00'` + `'200.00'`, `currency_code = 'TRY'`
- 1 worker (people row) — required for submissions FK
- 2 approved submissions (decided `2026-01-20`, before the `2026-01-31` period
  cutoff)
- 1 hakkediş period with `status = 'finalized'`, `periodNumber 'HK-2026-01'`,
  `kdvRate 0.20`, `retentionRate 0.05`, `tevkifatFraction 0.4`,
  `stopajEnabled false`, `avansKesintisiRate 0`
- 2 `hakedis_period_lines` (one per BOQ item) — DOES NOT supply `period_qty`
  (D-104 GENERATED column rejects explicit INSERT values)

Exports `HAKEDIS_FIXTURE_IDS` so downstream EXP-02/EXP-04 tests can assert
against deterministic UUIDs without re-deriving anything. Comment at the top
documents `previousCumulativeQty = '0'` invariant — Plan 11-04 tests rely on
this when computing deductions against the SUM of `period_value` via
`getPeriodDetail()`.

### Task 2 — `buildHakedisExcel()` (TDD; RED `f14ba01`, GREEN `c4c4da7`)

**RED commit `f14ba01`** — added 4 new unit tests at `EXP-02 hakedis Excel —
buildHakedisExcel unit`:

1. *three sheets present in order: Yeşil Defter, Fiyat İcmali, Hesap Özeti
   (D-115)* — loads workbook, asserts `worksheets.map(s => s.name)` equals
   `['Yeşil Defter','Fiyat İcmali','Hesap Özeti']`.
2. *Hesap Özeti cell values string-equal getPeriodDetail().deductions (no
   precision loss)* — passes `{ gross:'12345.67',kdv:'2469.13',… }`, loads
   back, asserts `Number(cell.value) === Number(expected)` for each of 7
   deduction rows (Pitfall 2 acceptable: numFmt at column level drives display,
   underlying numeric equality is the precision gate).
3. *sanitizeExcelCell prefixes apostrophe on formula-prefix materialSnapshot
   (WARNING 5 / T-11-04-FORMULA regression gate)* — passes
   `materialSnapshot:'=cmd|/c calc'` + `'@SUM(A1:A10)'`; asserts both Yeşil
   Defter and Fiyat İcmali rows have the cell value apostrophe-prefixed.
4. *public/fonts/DejaVuSans.ttf exists with size >100KB (WARNING 6 /
   T-11-04-FONT-MISSING gate)* — `fs.statSync` on both TTFs; size > 100 KB
   asserts Plan 11-01a precondition.

All 3 first tests failed with `buildHakedisExcel is not a function`; the font
test passed immediately (Plan 11-01a precondition already met). RED gate
confirmed.

**GREEN commit `c4c4da7`** — appended `buildHakedisExcel({ period, lines,
deductions, projectName }): Promise<Buffer>` to `src/lib/excel.ts` (135 LOC):

- Imports `PeriodHeader`, `PeriodLine`, `PeriodDeductions` from
  `@/actions/hakedis` (single source of truth — types match
  `getPeriodDetail()`'s return signature verbatim).
- **Sheet 1 'Yeşil Defter'**: 9 bilingual TR/EN columns (each header contains
  ` / `); rows from `input.lines`; `numFmt='#,##0.00'` on 6 numeric columns;
  bold + frozen row 1.
- **Sheet 2 'Fiyat İcmali'**: 6 bilingual TR/EN columns; same row source;
  `numFmt='#,##0.00'` on 3 numeric columns; bold + frozen row 1.
- **Sheet 3 'Hesap Özeti'**: 2 columns (`Kalem / Item` | `Tutar / Amount`);
  7 rows reading `input.deductions.{gross|kdv|tevkifat|stopaj|teminat|avans|net}`
  as STRINGS directly (D-107 + D-116 + Pitfall 2). Net Ödeme row
  `font={bold:true}` per UI-SPEC highlight.
- **WARNING 5 / T-11-04-FORMULA**: `sanitizeExcelCell()` wraps every
  `materialSnapshot` and `unitSnapshot` write in Sheets 1 + 2 (Hesap Özeti
  labels are static literals so no wrap needed there).
- **D-116 enforcement**: zero `parseFloat` in `buildHakedisExcel` body; only
  legacy `parseBoqExcel` retains its `parseFloat` for BOQ import qty parsing.

All 4 unit tests green. tsc clean. Excel buffer for the fixture period is
~8,916 bytes (with 2 lines + headers).

### Task 3 — `src/lib/pdf/fonts.ts` + `src/lib/pdf/hakedis-pdf.tsx` (commit `bc0eb96`)

**`src/lib/pdf/fonts.ts`** (49 LOC):

- Exports `registerFonts()` — single-call wrapper around `Font.register`.
- Uses `path.join(process.cwd(), 'public/fonts/DejaVuSans.ttf')` (Research A3
  pattern) + `'public/fonts/DejaVuSans-Bold.ttf'` for `fontWeight: 'bold'`.
- Module-scope `registered` boolean idempotency gate — second call is no-op.
- **WARNING 6 / T-11-04-FONT-MISSING mitigation**: try/catch wraps
  `Font.register`; on missing TTF logs an explicit deployment-precondition
  error pointing at the Plan 11-01a TTF copy step BEFORE re-throwing. Avoids
  a cryptic ENOENT stack trace if the bundle is ever shipped without TTFs.

**`src/lib/pdf/hakedis-pdf.tsx`** (143 LOC):

- Top-of-file comment: `// D-107: this component reads ONLY snapshot fields…`
- Imports ONLY `@react-pdf/renderer` symbols + types from `@/actions/hakedis`
  (verified by grep: zero `@/actions/boq` or `@/db/schema/boq` imports).
- Exports `HakedisPdf({ data })` function component returning a
  `<Document><Page size="A4">…</Page></Document>`.
- Header block: bilingual title, project name, period number, end date,
  currency code, status.
- Yeşil Defter table: bilingual section header + 5 columns × N lines (read
  from `materialSnapshot`, `unitSnapshot`, `periodQty`, `unitPriceSnapshot`,
  `periodValue` — snapshot-only).
- Hesap Özeti summary: 7 deduction rows + Net Ödeme row with bold styling
  and inline currency code suffix.
- All styled via `StyleSheet.create` with `fontFamily: 'DejaVuSans'` on the
  page so all text uses the registered TTF.
- Exports `renderHakedisPdf(data)` convenience function — wraps `<HakedisPdf
  data={data} />` in `renderToBuffer`. Returns Node `Buffer`.

The helper indirection was added during Task 4 GREEN (see Deviations §
Decision 4 below) so the route file could remain pure-TS (`route.ts`, not
`route.tsx`).

### Task 4 — EXP-02 + EXP-04 route handlers (TDD; RED `0e858cd`, GREEN `08ce02c`)

**RED commit `0e858cd`** — added 10 new tests across 4 describe blocks
(EXP-02 hakedis Excel route + DB integration + D-109 log; EXP-04 hakedis PDF
route + DB integration + D-109 log). All failed with
`ERR_MODULE_NOT_FOUND` — route files did not yet exist.

**GREEN commit `08ce02c`** — created both route files (mirroring Plan 11-02's
auth-first skeleton) and ran the matching gates:

**`src/app/api/exports/hakedis/[periodId]/route.ts`** (137 LOC):

1. `const session = await auth();` — D-114 FIRST statement.
2. `if (!session) return NextResponse.json({error:'Unauthorized'},{status:401})`
   — NOT redirect (binary endpoint).
3. `const { periodId } = await params;` — Next.js 15 async params.
4. UUID regex validation; malformed → 400.
5. `try { detail = await getPeriodDetail(periodId); } catch { return 404; }`
   — both missing and cross-tenant IDOR collapse to 404 (T-11-04-IDOR).
6. `if (period.status === 'draft') return 422` — Pitfall 5 defense-in-depth.
7. `if (deductions === null) return 422` — empty period gate.
8. `getProjects()` lookup for project name → `toSlug()` for ASCII filename.
9. `filename = 'hakkedis-{periodNumber}-{slug}.xlsx'` — D-112 (no date).
10. `buildHakedisExcel(…)` → Buffer → `new Uint8Array(buffer)` body.
11. `logOfficeActivity({ actionType: 'hakedis_excel_exported', … })` AFTER
    response construction (D-109).

**`src/app/api/exports/hakedis/[periodId]/pdf/route.ts`** (132 LOC):

- Same skeleton 1–8 above.
- Module-scope `registerFonts();` BEFORE the GET function so the TTF parse
  is amortised across warm Vercel-function invocations.
- `filename = 'hakkedis-{periodNumber}-{slug}-{YYYYMMDD}.pdf'` — D-112 with
  generation-date YYYYMMDD (not period end).
- `renderHakedisPdf({ period, lines, deductions, projectName, generatedAt: now })`
  → Buffer → `new Uint8Array(buffer)` body.
- `Content-Type: 'application/pdf'`.
- `logOfficeActivity({ actionType: 'hakedis_pdf_exported', … })` AFTER
  response.

Both files start with `export const runtime = 'nodejs';` +
`export const dynamic = 'force-dynamic';` at module scope (Pitfall 1 +
Pitfall 6 — react-pdf and ExcelJS are Node-only; exports must never be cached).

## EXP-02 + EXP-04 Tests Green

| # | Test | Type |
|---|------|------|
| 1 | `EXP-02 hakedis Excel — buildHakedisExcel unit > three sheets in order (D-115)` | Unit (helper) |
| 2 | `… > Hesap Özeti cell values match deductions (D-107 + D-116 + Pitfall 2)` | Unit (helper) |
| 3 | `… > sanitizeExcelCell apostrophe-prefix on materialSnapshot (WARNING 5)` | Unit (helper) |
| 4 | `… > public/fonts/DejaVuSans.ttf >100KB (WARNING 6)` | Unit (precondition) |
| 5 | `EXP-02 hakedis Excel route > returns 401 without session` | Unit (route) |
| 6 | `EXP-02 hakedis Excel route — DB integration > returns 422 for draft period` | DB integration |
| 7 | `… > Hesap Özeti cells match getPeriodDetail().deductions (no precision loss)` | DB integration |
| 8 | `… > D-111: every header in all 3 sheets contains " / " bilingual separator` | DB integration |
| 9 | `… > D-112: filename hakkedis-{periodNumber}-{projectSlug}.xlsx` | DB integration |
| 10 | `D-109 activity log — hakedis_excel_exported > exactly one office_activity_log row` | DB integration |
| 11 | `EXP-04 hakedis PDF route > returns 401 without session` | Unit (route) |
| 12 | `EXP-04 hakedis PDF route — DB integration > returns 422 for draft period` | DB integration |
| 13 | `… > PDF binary contains the DejaVu font name (D-106 embedded-font gate)` | DB integration |
| 14 | `… > PDF binary contains Turkish text (project name + hakkediş literal)` | DB integration |
| 15 | `… > D-112 PDF filename hakkedis-{periodNumber}-{projectSlug}-{YYYYMMDD}.pdf` | DB integration |
| 16 | `D-109 activity log — hakedis_pdf_exported > exactly one office_activity_log row` | DB integration |

Full plan-level test run: `vitest run tests/exports.test.ts` → 33 passed, 0
failed, 0 skipped (16 new tests from Plan 11-04 + 17 from prior plans).

Full project test suite: `vitest run` → **341 passed across 20 files; 0
failures**. No regressions from the `@vitejs/plugin-react` config change.

## 7 Hesap Özeti Precision Assertions

The Hesap Özeti DB-integration test seeds the fixture, fetches
`getPeriodDetail(periodId).deductions`, builds the workbook via the EXP-02
route handler, and walks rows 2..8 column 2 asserting numeric equality:

| # | Row | DB field | Status |
|---|-----|----------|--------|
| 1 | 2 | `deductions.gross` | PASS — `Number(cell.value) === Number(expected.gross)` |
| 2 | 3 | `deductions.kdv` | PASS |
| 3 | 4 | `deductions.tevkifat` | PASS |
| 4 | 5 | `deductions.stopaj` | PASS |
| 5 | 6 | `deductions.teminat` | PASS |
| 6 | 7 | `deductions.avans` | PASS |
| 7 | 8 | `deductions.net` | PASS |

Fixture deductions (from Postgres D-90 chain on gross = 2000):
- gross = `'2000.00'`
- kdv = `'400.0000'` (`gross × 0.20`)
- tevkifat = `'160.0000'` (`kdv × 0.40`)
- stopaj = `'0.0000'` (stopajEnabled=false → CASE → 0)
- teminat = `'100.0000'` (`gross × 0.05`)
- avans = `'0.0000'` (avansKesintisiRate=0)
- net = `'2140.0000'` (`gross + (kdv - tevkifat) - stopaj - teminat - avans = 2000 + 240 - 100 = 2140`)

All 7 cells round-trip through ExcelJS's writeBuffer/load with full numerical
precision. The `numFmt = '#,##0.00'` at the column level drives the rendered
display (locale-aware grouping inside Excel) without touching the underlying
value.

## Sample Content-Disposition Headers Produced

```
# EXP-02 Excel (no date suffix per D-112)
Content-Disposition: attachment; filename="hakkedis-HK-2026-01-istanbul-dogalgaz.xlsx"

# EXP-04 PDF (YYYYMMDD generation date)
Content-Disposition: attachment; filename="hakkedis-HK-2026-01-istanbul-dogalgaz-20260528.pdf"
```

Fixture project name `İstanbul Doğalgaz` → `toSlug(name)` → `istanbul-dogalgaz`
(ASCII-safe, filesystem-portable; no RFC 5987 encoding needed). The Turkish
capital `İ` (dotted I) and lowercase `ğ` survive end-to-end via the
character-class map in `src/lib/slug.ts`.

## D-106 PDF End-to-End Turkish-Glyph Validation

The seeded period uses project name `'İstanbul Doğalgaz'`. The EXP-04 PDF
binary is parsed via `pdf-parse` (`require('pdf-parse/lib/pdf-parse.js')`)
and the extracted text is asserted to contain:

- `'İstanbul'` (Turkish capital İ + lowercase a + n + b + u + l)
- `'Hakkediş'` (Turkish ş + literal title text)

Both assertions pass. The DejaVu Sans font name also appears as the literal
ASCII substring `'DejaVu'` inside the PDF binary's font dictionary
(`buf.includes(Buffer.from('DejaVu'))`).

PDF buffer size for the fixture (1 line, 7 deduction rows, A4 page,
embedded DejaVu Sans + Bold subset): **25,305 bytes (~25 KB)**.

Excel buffer size for the fixture (1 line, 3 sheets, all formatting): **8,916
bytes (~9 KB)**.

## D-111 Bilingual Header Coverage

The `D-111: every header in all 3 sheets contains " / " bilingual separator`
integration test loads the workbook produced by the EXP-02 route handler and
asserts:

- 3 sheets total (Yeşil Defter, Fiyat İcmali, Hesap Özeti)
- Every header string in row 1 of each sheet contains ` / `

All 17 column headers across the 3 sheets (`9 + 6 + 2`) match the gate.

## Files Created (5)

| Path | Lines | Purpose |
|------|-------|---------|
| `src/app/api/exports/hakedis/[periodId]/route.ts` | 137 | EXP-02 hakkediş Excel route handler |
| `src/app/api/exports/hakedis/[periodId]/pdf/route.ts` | 132 | EXP-04 hakkediş PDF route handler |
| `src/lib/pdf/fonts.ts` | 49 | D-106 Font.register helper (DejaVu Sans + Bold) |
| `src/lib/pdf/hakedis-pdf.tsx` | 143 | D-105 + D-107 React-PDF document component + renderHakedisPdf wrapper |
| `.planning/phases/11-exports/11-04-SUMMARY.md` | this file | plan summary |

## Files Modified (6)

| Path | Change |
|------|--------|
| `tests/fixtures/exports.ts` | Replaced throwing stub with real `seedFinalizedHakedisFixture` (+135 LOC) |
| `src/lib/excel.ts` | +1 import (`PeriodHeader/Line/Deductions`); +135 LOC `buildHakedisExcel` |
| `tests/exports.test.ts` | +14 real tests (4 unit + 5 EXP-02 + 5 EXP-04); 0 remaining `it.todo` |
| `vitest.config.ts` | Added `@vitejs/plugin-react` plugin (Rule 3 — JSX parser for `hakedis-pdf.tsx`) |
| `package.json` | +2 devDeps: `@vitejs/plugin-react`, `@types/pdf-parse@1.1.5` |
| `package-lock.json` | Transitive lockfile updates for the 2 devDeps |

## Deviations from Plan

### [Rule 3 — Blocking Issue] vitest/rolldown could not parse JSX in `route.tsx` under `/[periodId]/`

- **Found during:** Task 4 GREEN — initial `vitest run -t "EXP-04"` after creating `route.tsx` for the PDF handler.
- **Issue:** Vitest's rolldown source-parser threw `RolldownError: Parse failure: Parse failed with 1 error: Unexpected JSX expression` when loading `src/app/api/exports/hakedis/[periodId]/pdf/route.tsx`, even though `tsc --noEmit` was clean. Rolldown was treating the dynamic-segment-bracketed path differently from a regular `.tsx` import.
- **Fix:** Two-part fix —
  1. Moved the `renderToBuffer(<HakedisPdf data={…} />)` call out of the route handler and into a `renderHakedisPdf(data)` helper exported from `src/lib/pdf/hakedis-pdf.tsx`. The route file is now pure-TypeScript (`route.ts`, no JSX).
  2. Even with the route as `.ts`, the import chain still loads `hakedis-pdf.tsx`, and vitest's default rolldown loader does not handle JSX without a transform. Installed `@vitejs/plugin-react` and added `plugins: [react()]` to `vitest.config.ts` so the test loader can parse JSX in `.tsx` files at import time.
- **Files modified:** `src/lib/pdf/hakedis-pdf.tsx` (added `renderHakedisPdf` export + `renderToBuffer` import); `src/app/api/exports/hakedis/[periodId]/pdf/route.ts` (was `.tsx`; rewritten as pure-TS via the helper); `vitest.config.ts` (+ `react()` plugin); `package.json` + `package-lock.json` (devDep).
- **Commit:** `08ce02c` (Task 4 GREEN — folded into the same commit).
- **Why this is correct:** The user-facing contract is unchanged — same imports, same route paths, same response shape, same auth/draft/D-109 behaviour. The helper indirection is a thin wrapper that makes the route file ergonomic for ALL test runners (vitest, Next.js dev, Vercel deploy). The `@vitejs/plugin-react` plugin is a standard vitest addition and does not affect production code.

### [Rule 1 — Bug] pdf-parse root entry point auto-runs a debug block under vitest

- **Found during:** Task 4 GREEN — `PDF binary contains Turkish text` integration test threw `ENOENT: no such file or directory, open './test/data/05-versions-space.pdf'` from inside `node_modules/pdf-parse/index.js`.
- **Issue:** `node_modules/pdf-parse/index.js` has an unconditional debug-mode block that fires when `module.parent === null`:
  ```js
  let isDebugMode = !module.parent;
  if (isDebugMode) { ... Fs.readFileSync('./test/data/05-versions-space.pdf') ... }
  ```
  Under vitest's ESM loader `module.parent` is always `null`, so importing the package root immediately hits the debug branch and crashes on a fixture file that is not shipped in the npm package.
- **Fix:** Import the actual library entry point directly:
  ```ts
  const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer) => Promise<{ text: string }>;
  ```
  This is the documented vitest workaround for this well-known pdf-parse v1.1.1 issue. Bypasses the debug block entirely.
- **Files modified:** `tests/exports.test.ts` (one line in the EXP-04 Turkish-text assertion).
- **Commit:** `08ce02c` (Task 4 GREEN).
- **Why this is correct:** This is a long-standing pdf-parse maintenance issue, not a project-specific bug. The fix uses the package's own lib path (not a fork). Test now passes; production code is unaffected (production never imports `pdf-parse`).

### [Rule 3 — Blocking Issue] `@types/pdf-parse` was not installed alongside `pdf-parse`

- **Found during:** Task 4 RED — `tsc --noEmit` after writing the Turkish-text assertion.
- **Issue:** Plan 11-01a installed `pdf-parse@1.1.1` as a runtime/devDep but did not install `@types/pdf-parse`. Importing it triggered `error TS7016: Could not find a declaration file for module 'pdf-parse'`.
- **Fix:** `npm install --save-dev @types/pdf-parse@1.1.5`. Standard `@types/*` install; no code changes.
- **Files modified:** `package.json` + `package-lock.json`.
- **Commit:** `08ce02c`.
- **Why this is correct:** Standard practice for any TypeScript project using an untyped JS dependency. The types package matches the runtime version (`@types/pdf-parse@1.1.5` covers `pdf-parse@1.1.1`).

## Authentication Gates

None. All four tasks proceeded autonomously. Tests use the same `vi.mock('@/lib/auth')` pattern as Plans 11-02 and 11-03; production code uses `auth()` from Auth.js v5 (same shape as the existing `boq-template/route.ts` precedent).

## Threat Model Coverage

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-11-04-AUTH (Spoofing) | MITIGATED | Both routes: `auth()` first statement; 401 JSON test green for Excel + PDF. |
| T-11-04-IDOR (Information Disclosure) | MITIGATED | `getPeriodDetail` is tenant-scoped; cross-tenant + missing both throw `'Period not found'` → 404. UUID regex pre-validation rejects malformed IDs at 400 (avoids unnecessary DB load + error-surface diffing). |
| T-11-04-DRAFT (Tampering) | MITIGATED | Both routes: `status === 'draft'` → 422 JSON `{error:'Period is not finalized'}`. Both `returns 422 for draft period` tests green. PeriodDetailControls hides the button client-side (UI-SPEC) — defense in depth. |
| T-11-04-FLOAT (Tampering) | MITIGATED | D-107 + D-116 contract: `deductions.*` decimal strings flow DIRECTLY into ExcelJS cells (no `parseFloat`) and react-pdf `<Text>` (rendered as text). Hesap Özeti precision test green for all 7 deduction fields. PDF cells likewise — gross/kdv/tevkifat/stopaj/teminat/avans/net render verbatim. |
| T-11-04-SNAPSHOT (Tampering) | MITIGATED | `HakedisPdf` imports ONLY `@react-pdf/renderer` symbols + types from `@/actions/hakedis`. Grep gate confirms zero `@/actions/boq` or `@/db/schema/boq` imports. D-107 contract preserved by code structure, not by review. |
| T-11-04-FONT-PATH (Information Disclosure) | ACCEPTED | Path is hardcoded `path.join(process.cwd(), 'public/fonts/DejaVuSans.ttf')`. No user input flows in. Vercel `public/` is read-only at runtime. |
| T-11-04-FILENAME (Tampering) | MITIGATED | `projectName` → `toSlug()` (ASCII-only output, regex strips all non-[a-z0-9]). `periodNumber` is internal-system identifier (validated at create time, length-bounded). Both flow into `Content-Disposition` after slugging. |
| T-11-04-COLD-RENDER (DoS) | ACCEPTED | `registerFonts()` module-scope `registered` flag caches the TTF parse across warm invocations on the same Vercel instance. First cold start pays the load cost once. |
| T-11-04-PDF-INJ (Information Disclosure) | ACCEPTED | react-pdf `<Text>` renders content as plain text — no script execution, no PDF actions. Worker-controlled `materialSnapshot` content is displayed verbatim; worst case is visible text in the PDF, not an attack surface. |
| T-11-04-FORMULA (Tampering) | MITIGATED | All Yeşil Defter + Fiyat İcmali `materialSnapshot` + `unitSnapshot` writes wrapped in `sanitizeExcelCell()`. Regression test asserts apostrophe-prefix on `'=cmd|/c calc'` and `'@SUM(A1:A10)'` in both sheets. |
| T-11-04-FONT-MISSING (DoS) | MITIGATED | Three-layer mitigation: (a) Plan 11-01a Task 1 verified TTFs >100 KB; (b) `registerFonts()` try/catch logs deployment-precondition error before re-throwing; (c) Task 2 test asserts TTFs >100 KB before importing the PDF route module. |

All 11 threats resolved per the plan's threat-model dispositions.

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `vitest run tests/exports.test.ts -t "EXP-02\|EXP-04\|hakedis_(excel\|pdf)_exported"` | all green | 11 EXP-02/EXP-04 + 2 D-109 = 13 green | PASS |
| `vitest run tests/exports.test.ts` (full file) | green | 33 passed, 0 failed, 0 skipped | PASS |
| `vitest run` (full suite) | green | 341 passed, 20 files | PASS |
| `tsc --noEmit` | clean | clean | PASS |
| `grep -c "export async function buildHakedisExcel" src/lib/excel.ts` | 1 | 1 | PASS |
| `grep -c "Yeşil Defter\|Fiyat İcmali\|Hesap Özeti" src/lib/excel.ts` | ≥3 | 10 (code + JSDoc + section comments) | PASS |
| `grep -c "parseFloat" src/lib/excel.ts` (call sites) | 1 (legacy parseBoqExcel only) | 1 actual call + comments documenting prohibition | PASS |
| `grep -c "sanitizeExcelCell(" src/lib/excel.ts` | ≥8 | 12 | PASS |
| Both route files first statement is `const session = await auth()` | yes | confirmed via awk | PASS |
| `grep -c "runtime = 'nodejs'"` on both routes | 1 each | 1 each | PASS |
| `grep -c "dynamic = 'force-dynamic'"` on both routes | 1 each | 1 each | PASS |
| `grep -c "status === 'draft'"` Excel route | ≥1 | 3 (1 code + 2 JSDoc) | PASS |
| `grep -c "status === 'draft'"` PDF route | ≥1 | 2 (1 code + 1 JSDoc) | PASS |
| `grep -c "hakedis_excel_exported"` Excel route | ≥1 | 2 (call + JSDoc) | PASS |
| `grep -c "hakedis_pdf_exported"` PDF route | ≥1 | 2 (call + JSDoc) | PASS |
| `grep -c "registerFonts" pdf/route.ts` | ≥1 (module scope) | 3 (1 import + 1 call + 1 JSDoc) | PASS |
| `grep -E "@/actions/boq\|@/db/schema/boq" hakedis-pdf.tsx` | 0 | 0 (D-107 enforcement) | PASS |
| `grep -c "snapshot\|Snapshot" hakedis-pdf.tsx` | ≥4 | 7 | PASS |
| Zero remaining `it.todo` in EXP-02 + EXP-04 describe blocks | 0 | 0 | PASS |
| Excel buffer size for fixture | non-zero, <50 KB | 8,916 bytes | PASS |
| PDF buffer size for fixture | non-zero, <100 KB | 25,305 bytes | PASS |
| Fixture project name 'İstanbul Doğalgaz' → slug 'istanbul-dogalgaz' end-to-end | yes | confirmed in both filename tests | PASS |
| PDF binary contains literal 'İstanbul' (via pdf-parse) | yes | confirmed via test 14 | PASS |
| PDF binary contains literal 'Hakkediş' (Turkish ş) | yes | confirmed via test 14 | PASS |
| PDF binary contains 'DejaVu' font name | yes | confirmed via test 13 | PASS |

## Decisions Made

1. **getPeriodDetail throws collapse to 404 (no info leak)** — Cross-tenant probes return the same 404 as malformed/missing IDs. UUID regex pre-validation rejects obviously-bad input at 400 BEFORE the DB call, but the 404 surface for valid-shaped UUIDs is identical regardless of tenancy. T-11-04-IDOR mitigation.

2. **Draft guard server-side even though UI hides the button** — Pitfall 5 explicit: PeriodDetailControls hides the export trigger for draft periods (UI-SPEC); the route handlers nevertheless reject draft periods with 422. Server is the source of truth.

3. **`buildHakedisExcel` writes deduction STRINGS, not numbers** — D-107 + D-116 + Pitfall 2 contract. Postgres `numeric` → decimal string → ExcelJS cell value (as string). `numFmt = '#,##0.00'` at the column level drives Excel's locale-aware display. Zero `parseFloat` or `Number()` in the helper body. The Hesap Özeti precision test asserts no precision loss via numeric equality.

4. **renderHakedisPdf helper wraps JSX so the route is pure-TS** — Vitest's rolldown loader has trouble parsing JSX in `.tsx` files at dynamic-segment paths (`/[periodId]/pdf/route.tsx`). Moving the `<HakedisPdf>` element into a helper function in `src/lib/pdf/hakedis-pdf.tsx` keeps the route file as `route.ts` (no JSX). Production behaviour identical; user-facing API unchanged.

5. **@vitejs/plugin-react added to vitest config** — Once the JSX is inside `hakedis-pdf.tsx` (not in the route file), the test loader still loads that file when it imports the route. Without the plugin vitest's default rolldown loader cannot parse the JSX. Added as a devDep + config change; production untouched.

6. **pdf-parse imported from lib path** — The package root `index.js` has a debug block that auto-runs under vitest (`module.parent === null`) and crashes on a missing fixture file. Documented vitest workaround: import `pdf-parse/lib/pdf-parse.js` directly. No package change; production never imports pdf-parse.

7. **Net Ödeme row visual emphasis** — The Hesap Özeti Net row uses `font={bold:true}` on the row to match the UI-SPEC highlight. PDF uses larger fontSize + border + bold on the Net Ödeme summary line for the same effect.

## Self-Check: PASSED

- FOUND: `src/app/api/exports/hakedis/[periodId]/route.ts` (137 LOC)
- FOUND: `src/app/api/exports/hakedis/[periodId]/pdf/route.ts` (132 LOC)
- FOUND: `src/lib/pdf/fonts.ts` (49 LOC)
- FOUND: `src/lib/pdf/hakedis-pdf.tsx` (143 LOC)
- FOUND: commit `ed4e5d8` (Task 1 — seedFinalizedHakedisFixture) in git log
- FOUND: commit `f14ba01` (Task 2 RED — buildHakedisExcel tests) in git log
- FOUND: commit `c4c4da7` (Task 2 GREEN — buildHakedisExcel impl) in git log
- FOUND: commit `bc0eb96` (Task 3 — PDF lib files) in git log
- FOUND: commit `0e858cd` (Task 4 RED — route handler tests) in git log
- FOUND: commit `08ce02c` (Task 4 GREEN — route handlers + test infra) in git log
- VERIFIED: `buildHakedisExcel` exported from `src/lib/excel.ts`
- VERIFIED: `HakedisPdf` + `renderHakedisPdf` exported from `src/lib/pdf/hakedis-pdf.tsx`
- VERIFIED: `registerFonts` exported from `src/lib/pdf/fonts.ts`
- VERIFIED: 3 sheets in D-115 order produced by `buildHakedisExcel`
- VERIFIED: 7 Hesap Özeti deduction rows numerically equal `getPeriodDetail().deductions.*`
- VERIFIED: Excel formula-injection regression test green (apostrophe prefix on `=`, `@`)
- VERIFIED: PDF binary contains literal `'DejaVu'` (font name in embedded dictionary)
- VERIFIED: PDF binary contains literal `'İstanbul'` and `'Hakkediş'` via pdf-parse
- VERIFIED: D-112 Excel filename `hakkedis-HK-2026-01-istanbul-dogalgaz.xlsx` matches expected
- VERIFIED: D-112 PDF filename `hakkedis-HK-2026-01-istanbul-dogalgaz-YYYYMMDD.pdf` matches regex
- VERIFIED: Both `D-109 activity log` tests green (exactly one row per export)
- VERIFIED: `tsc --noEmit` clean
- VERIFIED: full suite `vitest run` green (341 / 20 files)
- VERIFIED: zero remaining `it.todo` in EXP-02 + EXP-04 describe blocks
