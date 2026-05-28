---
phase: 11-exports
verified: 2026-05-28T18:10:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open the downloaded hakkediş PDF in a real PDF viewer (Preview / Acrobat)"
    expected: "Turkish glyphs ğ ş ı ö ü ç İ Ş Ğ Ü Ö Ç render correctly (no missing-glyph rectangles / tofu)"
    why_human: "Automated pdf-parse text extraction confirms presence in the byte stream; visual glyph rendering requires a human looking at the rasterised output"
  - test: "Open the downloaded ledger / hakkediş / performance .xlsx in Excel or LibreOffice under tr-TR locale"
    expected: "Money cells display Turkish grouping (1.234,56) via the column-level numFmt; bilingual headers visible in row 1; freeze pane active"
    why_human: "Excel applies the cell numFmt at render time using the host locale; this cannot be inspected from the workbook binary"
  - test: "Visit /dashboard/exports in both TR and EN locales, confirm hub renders three trigger cards + period picker with all labels translated"
    expected: "All headings, section titles, table columns, button labels switch between TR and EN; no fallback strings visible"
    why_human: "Server-component rendering + next-intl locale switching is a visual / interaction check"
  - test: "On the period detail page, view one draft period and one finalized period; confirm Excel + PDF buttons are present ONLY on the finalized one (state-gated removal)"
    expected: "Buttons are removed (not just disabled) on draft; present on finalized/submitted/paid"
    why_human: "Conditional rendering is testable via grep on the source but the actual rendered surface requires a browser check"
---

# Phase 11: Exports Verification Report

**Phase Goal:** Admin can download submission ledger, BOQ/hakkediş, and performance data as multi-sheet bilingual Excel files, and a finalized hakkediş period as a PDF certificate with correct Turkish character rendering; all export route handlers are protected by explicit auth guards.

**Verified:** 2026-05-28T18:10:00Z
**Status:** human_needed (all 5 truths VERIFIED automatically; 4 visual/locale-dependent items routed to human UAT)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin can trigger a submission ledger Excel download with active filters; bilingual TR/EN headers; full canonical record shape | VERIFIED | `src/app/api/exports/submissions/route.ts` GET handler exists; reads `from / to / project` from query string (matches filters forwarded by Hub page `qs` builder, page.tsx:101-104); calls `getCanonicalSubmissions({ limit: 100_000 })` for full row coverage (Pitfall 3); `buildSubmissionLedger` in `src/lib/excel.ts:175-232` emits 14 columns each with TR/EN slash separator (test "builds a workbook with 14 bilingual headers each containing ' / '" passes); canonical shape: id, projectName, workerName, auditorName, material, unit, quantity, unitPrice, currencyCode, earnedValue, status, submittedAt, decidedAt, locationMatch |
| 2 | Admin can export BOQ/hakkediş Excel: Yeşil Defter + Fiyat İcmali + Hesap Özeti, formatted as Turkish-locale currency | VERIFIED | `src/app/api/exports/hakedis/[periodId]/route.ts` GET handler exists; calls `buildHakedisExcel` in `src/lib/excel.ts:401-505`; three sheets added in order via `workbook.addWorksheet('Yeşil Defter')`, `addWorksheet('Fiyat İcmali')`, `addWorksheet('Hesap Özeti')`; test "three sheets present in order: Yeşil Defter, Fiyat İcmali, Hesap Özeti (D-115)" passes; Hesap Özeti contains all 7 D-90 deduction rows (gross/kdv/tevkifat/stopaj/teminat/avans/net); column-level `numFmt = '#,##0.00'` applied per D-116; deduction strings flow direct from Postgres without parseFloat (test "Hesap Özeti cell values string-equal getPeriodDetail().deductions (no precision loss)" passes) |
| 3 | Admin can export worker + auditor performance summaries to Excel with per-person KPI columns matching the scorecard | VERIFIED | `src/app/api/exports/performance/route.ts` exists; calls `buildPerformanceSummary` in `src/lib/excel.ts:283-371`; produces exactly 2 sheets `Workers - Personel` + `Auditors - Denetçiler` (D-110 OE-excluded; sheet-name `/` replaced with ` - ` because Excel forbids `/` in sheet names but TR/EN parity preserved in headers); Workers sheet has 8 KPI columns matching `PortfolioWorker` shape; Auditors sheet has 5 KPI columns matching `PortfolioAuditor`; test "workbook contains exactly two sheets" passes; test "Workers tab row count equals getPortfolioPeople({role:'worker'}).length" passes (DB integration) |
| 4 | Admin can download finalized hakkediş PDF where Turkish ğ ş ı ö ü ç render correctly via embedded TTF font; includes cover info, line items, payment summary | VERIFIED | `src/app/api/exports/hakedis/[periodId]/pdf/route.ts` exists; uses `@react-pdf/renderer` (D-105); `src/lib/pdf/fonts.ts` calls `Font.register({ family: 'DejaVuSans', fonts: [{src: '.../DejaVuSans.ttf'}, {src: '.../DejaVuSans-Bold.ttf', fontWeight: 'bold'}] })` at module scope (D-106); `public/fonts/DejaVuSans.ttf` (739KB) + `DejaVuSans-Bold.ttf` (689KB) present; `src/lib/pdf/hakedis-pdf.tsx` renders cover (Hakkediş Belgesi / Hakkediş Certificate + project + period + end date + currency + status), Yeşil Defter table (material/unit/periodQty/unitPrice/periodValue), Hesap Özeti with all 7 deduction rows + Net Ödeme bold; reads ONLY snapshot fields (D-107 immutability); test "public/fonts/DejaVuSans.ttf exists with size >100KB before importing the route module" passes; tests for Turkish glyph rendering in PDF text extraction pass |
| 5 | Export endpoints require auth — unauthed returns HTTP 401 (no layout-level inheritance, explicit auth() guard per handler) | VERIFIED | All 4 route handlers begin with `const session = await auth(); if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });` as the FIRST executable statement: submissions/route.ts:50-53, performance/route.ts:57-60, hakedis/[periodId]/route.ts:52-55, hakedis/[periodId]/pdf/route.ts:57-60; returns JSON 401 (not redirect — binary endpoints per D-114); tests "returns 401 without session" pass in all four describe blocks (EXP-01, EXP-02 route, EXP-03, EXP-04) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/api/exports/submissions/route.ts` | EXP-01 GET handler | VERIFIED | 139 LOC; auth-first, tenant scope via action, limit:100_000, D-112 filename, D-109 activity log |
| `src/app/api/exports/hakedis/[periodId]/route.ts` | EXP-02 GET handler | VERIFIED | 122 LOC; auth-first, UUID validation, draft 422 guard, D-115 3-sheet workbook |
| `src/app/api/exports/hakedis/[periodId]/pdf/route.ts` | EXP-04 GET handler | VERIFIED | 128 LOC; auth-first, registerFonts() at module scope, draft 422 guard, D-112 filename with YYYYMMDD |
| `src/app/api/exports/performance/route.ts` | EXP-03 GET handler | VERIFIED | 149 LOC; auth-first, parallel `getPortfolioPeople({role: 'worker'})` + `{role: 'auditor'}`, OE excluded (D-110) |
| `src/lib/excel.ts` | buildSubmissionLedger + buildHakedisExcel + buildPerformanceSummary | VERIFIED | 506 LOC; 3 new exported helpers; sanitizeExcelCell mitigates CVE-2014-3524 formula injection on all string cells |
| `src/lib/pdf/fonts.ts` | DejaVu Sans font registration | VERIFIED | 51 LOC; idempotent register() + try/catch with operator-friendly error |
| `src/lib/pdf/hakedis-pdf.tsx` | HakedisPdf component + renderHakedisPdf | VERIFIED | 152 LOC; reads ONLY snapshot fields (D-107); fontFamily: 'DejaVuSans' on page style |
| `src/lib/slug.ts` | toSlug ASCII normalization | VERIFIED | 33 LOC; explicit Turkish-character map BEFORE toLowerCase (handles dotted-I) |
| `public/fonts/DejaVuSans.ttf` | TTF font asset | VERIFIED | 739 KB |
| `public/fonts/DejaVuSans-Bold.ttf` | TTF bold font asset | VERIFIED | 689 KB |
| `src/app/dashboard/(admin)/exports/page.tsx` | Hub page replaces stub | VERIFIED | 286 LOC; 3 trigger cards + period picker table; FilterBar in Suspense |
| `src/components/admin/PeriodDetailControls.tsx` | Excel + PDF buttons in period detail | VERIFIED | Excel + PDF anchors rendered only when `status !== 'draft'` (D-96 state-gated removal); links target same 4 route handlers (D-108) |
| `tests/exports.test.ts` | Phase 11 test suite | VERIFIED | 1206 LOC; 33 it() blocks across 6 describe blocks; full suite green |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| submissions/route.ts | getCanonicalSubmissions | direct import + await call | WIRED | line 81-86: `getCanonicalSubmissions({ from, to, projectIds, limit: 100_000 })`; data flows into `buildSubmissionLedger(rows)` |
| performance/route.ts | getPortfolioPeople | Promise.all worker + auditor | WIRED | lines 90-93; both calls dispatched, results flow into `buildPerformanceSummary({ workers, auditors })` |
| hakedis/[periodId]/route.ts | getPeriodDetail | direct import + try/catch | WIRED | line 66; detail.period/lines/deductions flow into `buildHakedisExcel({ period, lines, deductions, projectName })` |
| hakedis/[periodId]/pdf/route.ts | renderHakedisPdf → renderToBuffer | direct import + await call | WIRED | line 97-103; reads detail.period/lines/deductions + generatedAt |
| All 4 routes | logOfficeActivity | fire-and-forget after response | WIRED | 4 unique actionType values map 1:1 to OFFICE_ACTION_TYPES tuple in `src/db/schema/office-activity-log.ts:25-28` |
| Hub page (exports/page.tsx) | All 4 route handlers | `<a href download>` anchors | WIRED | lines 139, 163, 250, 263; URL-encoded `qs` query string forwarded for ledger + performance triggers (line 105) |
| PeriodDetailControls.tsx | hakedis Excel + PDF endpoints | `<a href download>` | WIRED | lines 145, 155; only rendered when `status !== 'draft'` (gate at line 142) |
| OE Scorecard actionTypeToKey | 4 new action_*_exported i18n keys | static map literal | WIRED | analytics/office-engineers/[userId]/page.tsx:69-72 maps all 4 new action types |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| Hub page (exports/page.tsx) | `periods` | `getAllFinishedPeriods()` (analytics.ts:1373+) — Drizzle SQL query, tenant-scoped | Yes (real DB rows) | FLOWING |
| Hub page (exports/page.tsx) | `projects` | `getProjects()` action | Yes | FLOWING |
| submissions/route.ts | `rows` | `getCanonicalSubmissions({ limit:100_000 })` — tenant-scoped Postgres query | Yes | FLOWING |
| performance/route.ts | `workers, auditors` | `getPortfolioPeople({ role, dateRange, projectIds })` — tenant-scoped Postgres queries with aggregations | Yes | FLOWING |
| hakedis/[periodId]/route.ts | `detail` | `getPeriodDetail(periodId)` — Postgres-computed deduction chain (D-90) returned as decimal strings | Yes | FLOWING |
| hakedis/[periodId]/pdf/route.ts | `detail` | Same as above; only snapshot fields read (D-107) | Yes | FLOWING |
| PeriodDetailControls.tsx | period status from props | server-rendered parent page passes from `getPeriodDetail` | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Module exports buildSubmissionLedger | `grep -c "export async function buildSubmissionLedger" src/lib/excel.ts` | 1 | PASS |
| Module exports buildHakedisExcel | `grep -c "export async function buildHakedisExcel" src/lib/excel.ts` | 1 | PASS |
| Module exports buildPerformanceSummary | `grep -c "export async function buildPerformanceSummary" src/lib/excel.ts` | 1 | PASS |
| Module exports renderHakedisPdf | `grep -c "export async function renderHakedisPdf" src/lib/pdf/hakedis-pdf.tsx` | 1 | PASS |
| 4 new OFFICE_ACTION_TYPES present | grep on schema/office-activity-log.ts | 4 matches | PASS |
| TR i18n parity for 4 action keys | grep messages/tr.json | 4 matches | PASS |
| EN i18n parity for 4 action keys | grep messages/en.json | 4 matches | PASS |
| All 4 routes use auth-first 401 JSON | grep `NextResponse.json.*Unauthorized.*401` across 4 route files | 4 matches | PASS |
| TypeScript clean | `node_modules/.bin/tsc --noEmit` | no output (clean) | PASS |
| Phase 11 test file passes | `vitest run tests/exports.test.ts` | 33 passed in 37.49s | PASS |
| Full suite passes | `vitest run` | 341 passed in 282.34s | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| EXP-01 | 11-02-PLAN.md | Admin can export a submissions ledger to Excel using the canonical record shape, respecting active filters | SATISFIED | submissions/route.ts + buildSubmissionLedger + 6 EXP-01 tests in exports.test.ts pass |
| EXP-02 | 11-04-PLAN.md | Admin can export BOQ / hakkediş progress to Excel in bilingual TR/EN yeşil-defter format | SATISFIED | hakedis/[periodId]/route.ts + buildHakedisExcel (3 sheets) + EXP-02 tests pass |
| EXP-03 | 11-03-PLAN.md | Admin can export worker and auditor performance summaries to Excel | SATISFIED | performance/route.ts + buildPerformanceSummary (2 sheets: Workers + Auditors) + EXP-03 tests pass |
| EXP-04 | 11-04-PLAN.md | Office engineer can export a finalized hakkediş certificate as a PDF with correct Turkish character rendering | SATISFIED | hakedis/[periodId]/pdf/route.ts + renderHakedisPdf + DejaVu TTF embedded + EXP-04 tests pass (font name in PDF binary + Turkish-glyph text extraction) |

No orphaned requirements: REQUIREMENTS.md lists EXP-01..EXP-04 marked as Complete; the verification confirms all four are actually delivered.

### Anti-Patterns Found

None. Scan against all phase-11 modified source files returned:
- No `TODO / FIXME / TBD / XXX / HACK / PLACEHOLDER` markers
- No `return null` / `return []` / `return {}` stubs
- No empty handlers (`onClick={() => {}}` only)
- No `console.log` placeholders in production code paths
- The single `console.error` in `src/lib/pdf/fonts.ts:42-48` is an intentional operator-facing error message for missing-font deployment failures, not a stub

### Verification Override Decisions (D-100..D-116 honoured)

| Decision | Check | Status |
|----------|-------|--------|
| D-105 @react-pdf/renderer | `import { Document, Page, ... renderToBuffer } from '@react-pdf/renderer'` in hakedis-pdf.tsx | HONOURED |
| D-106 DejaVu Sans embedded TTF | Font.register family 'DejaVuSans' + TTF files present in public/fonts/ | HONOURED |
| D-107 snapshot-only PDF | hakedis-pdf.tsx renders ONLY materialSnapshot/unitSnapshot/unitPriceSnapshot/currencyCodeSnapshot/periodQty/periodValue/cumulativeValue + deductions; no BOQ-items import | HONOURED |
| D-108 distributed + hub UX | Hub page (3 cards + picker) + PeriodDetailControls (2 buttons) both link to the same 4 routes | HONOURED |
| D-109 4 new export action types | `hakedis_pdf_exported`, `hakedis_excel_exported`, `submission_ledger_exported`, `performance_summary_exported` in OFFICE_ACTION_TYPES + mapped in OE scorecard + TR+EN i18n keys present | HONOURED |
| D-110 OE excluded from performance | performance/route.ts only calls `getPortfolioPeople({role:'worker'})` + `{role:'auditor'}`; workbook has exactly 2 sheets | HONOURED |
| D-111 joined TR/EN headers | Every header string in 3 builder helpers contains ' / '; test "headers in both sheets contain ' / ' separator" passes | HONOURED (sheet TAB names use ' - ' because Excel forbids '/' in sheet names — bilingual intent preserved in column headers; documented in code comments) |
| D-112 verbose filenames | submission-ledger-{slug}-{from}-{to}.xlsx, hakkedis-{n}-{slug}.xlsx, performance-{slug}-{from}-{to}.xlsx, hakkedis-{n}-{slug}-{YYYYMMDD}.pdf — all 4 patterns implemented | HONOURED |
| D-114 auth-first + 401 JSON per handler | Verified in all 4 route handlers (first executable statement); tests pass | HONOURED |
| D-115 3-sheet hakedis workbook | Yeşil Defter / Fiyat İcmali / Hesap Özeti in that order | HONOURED |
| D-116 column-level numFmt, no parseFloat | All builder helpers apply `sheet.getColumn(key).numFmt = '#,##0.00'`; no `parseFloat` / `Number()` in any builder | HONOURED |

### Flaky-Test Investigation

User reported: 340/341 passed in original run (1 failure in 1 file), 341/341 passed on immediate rerun → flaky.

My re-verification run: 341/341 passed in 282.34s.

**Likely flaky test identified:** `tests/exports.test.ts:413` — "each successful export writes exactly one office_activity_log row of the right action_type" (D-109 submission_ledger_exported describe).

**Why:** Line 421 uses `await new Promise((r) => setTimeout(r, 50));` to wait for the fire-and-forget `after()` callback that writes to `office_activity_log` to complete. The three sibling D-109 tests (lines 887, 1049, 1195) use **200ms** for the same wait. On a slow CI machine or under load, 50ms is not enough for the async DB write to settle, causing the `expect(rows.rows).toHaveLength(1)` assertion to see 0 rows.

**Recommendation:** Raise the wait at line 421 from 50ms to 200ms to match the sibling tests, or — better — replace setTimeout with a deterministic wait (`await vi.waitFor(() => db.execute(...).rows.length === 1)`). This is a low-risk stabilisation change.

Severity: Warning (not blocker — does not affect goal achievement; only test stability).

### Human Verification Required

#### 1. PDF Turkish glyph rendering

**Test:** Trigger the PDF download for any finalized period; open in Preview / Acrobat / Chrome
**Expected:** Turkish characters ğ ş ı ö ü ç İ Ş Ğ Ü Ö Ç render correctly with no missing-glyph rectangles or tofu boxes; header reads "Hakkediş Belgesi / Hakkediş Certificate"; Hesap Özeti shows "Brüt Hakediş", "KDV Tevkifat", "Avans Kesintisi", "Net Ödeme"
**Why human:** The pdf-parse test confirms the glyph code points are in the byte stream and the DejaVu Sans font family is referenced; visual rasterisation correctness requires a human looking at the output

#### 2. Excel locale-aware money grouping

**Test:** Open the downloaded ledger / hakkediş / performance .xlsx in Excel or LibreOffice under tr-TR locale
**Expected:** Money cells display Turkish grouping (e.g. `1.234,56`) via the column-level `numFmt = '#,##0.00'`; bilingual header row 1 visible; freeze pane active; currency code in its own column
**Why human:** Excel applies the cell numFmt at render time using the host locale; this cannot be inspected from the workbook binary (the binary stores the format string, not the rendered text)

#### 3. Hub page TR/EN locale switch

**Test:** Visit /dashboard/exports in both TR and EN locales; confirm hub renders three trigger cards (Submission Ledger / Performance Summary / Hakkediş Files) + period picker table with all labels translated
**Expected:** All headings, section titles, table columns, button labels switch between TR and EN; no fallback strings visible; chip text formatting renders correctly
**Why human:** Server-component rendering + next-intl locale switching is an interaction check across the rendered DOM

#### 4. Period detail draft-state gating

**Test:** On the period detail page, view one draft period and one finalized period
**Expected:** Excel + PDF buttons are REMOVED (not just disabled) on draft; present on finalized/submitted/paid (UI-SPEC Surface 2 + D-96 state-gated removal)
**Why human:** Conditional rendering is provable via grep (`status !== 'draft' &&` at PeriodDetailControls.tsx:142) but the actual rendered surface requires a browser visit

### Gaps Summary

No gaps. All five must-haves verified by:
- Source-file inspection of 4 route handlers + 3 lib files + hub page + period-detail component
- Wiring verification: all 4 route handlers correctly call into reused Phase-7/9/10 actions; both UI surfaces correctly link to the route handlers; activity-log fire-and-forget covers 4 new action types
- Test evidence: 33 EXP-01..04 tests pass, 341/341 in full suite
- Static checks: TypeScript clean; no debt markers in any phase-11 modified file
- Decision honour: D-105 through D-116 all honoured; one minor deviation (D-111 sheet TAB separator `/` → ` - ` because Excel forbids `/` in sheet names) is documented in source comments and preserves the bilingual intent in the column headers

The 4 human-verification items are intrinsic to the binary-content output domain — Excel's locale-dependent rendering, PDF rasterisation visual fidelity, and browser-rendered locale switching cannot be inspected from compiled output without human eyes. They are routed to end-of-phase HUMAN-UAT.md.

One stability concern (50ms vs 200ms wait at exports.test.ts:421) is flagged but does not block the phase — it is a low-risk follow-up.

---

_Verified: 2026-05-28T18:10:00Z_
_Verifier: Claude (gsd-verifier)_
