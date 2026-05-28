---
phase: 11
plan: 01b
subsystem: exports
tags: [setup, helpers, i18n, test-scaffold, warning-4-fix, warning-5-fix]
requires:
  - "Plan 11-01a complete (deps + schema/i18n action keys installed)"
  - "src/lib/slug.ts does not exist"
  - "src/lib/excel.ts lacks sanitizeExcelCell()"
  - "src/actions/analytics.ts lacks getAllFinishedPeriods() + PortfolioWorker.locationComplianceRate"
  - "messages/{en,tr}.json lack dashboard.admin.exports.* block + hakedis.detail.{export_excel,download_pdf}"
  - "tests/exports.test.ts + tests/fixtures/exports.ts do not exist"
provides:
  - "src/lib/slug.ts exporting toSlug() — D-112 ASCII slug helper"
  - "src/lib/excel.ts adds sanitizeExcelCell() — CVE-2014-3524 formula-injection mitigation (WARNING 5 fix)"
  - "src/actions/analytics.ts exports getAllFinishedPeriods() + PeriodPickerRow type"
  - "PortfolioWorker type gains locationComplianceRate: number | null (D-110 / WARNING 4 fix)"
  - "messages/en.json + messages/tr.json: 21 exports.* keys + 2 hakedis.detail keys per locale"
  - "tests/exports.test.ts scaffold with 16 it.todo entries (covers 12 VALIDATION.md critical truths)"
  - "tests/fixtures/exports.ts seedFinalizedHakedisFixture stub"
affects:
  - Plan 11-02 (EXP-01 submission ledger — will consume toSlug + sanitizeExcelCell)
  - Plan 11-03 (EXP-03 performance summary — will consume PortfolioWorker.locationComplianceRate + sanitizeExcelCell)
  - Plan 11-04 (EXP-02 hakedis Excel + EXP-04 PDF — will consume sanitizeExcelCell + toSlug)
  - Plan 11-05 (Exports hub page — will consume getAllFinishedPeriods + dashboard.admin.exports.*)
  - Plan 11-06 (PeriodDetailControls extension — will consume hakedis.detail.{export_excel,download_pdf})
tech-stack:
  added: []
  patterns:
    - "toSlug placed in src/lib/ alongside format-money / currencies / leaderboard-sort (existing 'use server'-free lib pattern from Phase 10)"
    - "sanitizeExcelCell co-located with parseBoqExcel + generateBoqTemplate in src/lib/excel.ts (single Excel helper file)"
    - "getAllFinishedPeriods + PeriodPickerRow in src/actions/analytics.ts (planner-recommended placement next to getPortfolioPeople); PeriodListRow imported from @/actions/hakedis"
    - "PortfolioWorker.locationComplianceRate populated via inline aggregation in the existing countsResult SQL — same FILTER + NULLIF pattern as getPersonMetrics line 773"
    - "D-111 bilingual joined labels stored byte-identical across en.json + tr.json (locale-neutral pattern)"
    - "exports.test.ts is the unified Wave-2 scaffold (single file, multiple describe blocks per requirement) instead of split per-handler files — matches VALIDATION.md ## Per-Task Verification Map naming"
key-files:
  created:
    - src/lib/slug.ts
    - tests/slug.test.ts
    - tests/exports.test.ts
    - tests/fixtures/exports.ts
    - .planning/phases/11-exports/11-01b-SUMMARY.md
  modified:
    - src/lib/excel.ts
    - tests/excel.test.ts
    - src/actions/analytics.ts
    - tests/analytics.test.ts
    - messages/en.json
    - messages/tr.json
decisions:
  - "getAllFinishedPeriods + PeriodPickerRow placed in src/actions/analytics.ts (planner recommendation honored) — PeriodListRow imported from @/actions/hakedis"
  - "PortfolioWorker.locationComplianceRate populated via inline aggregation path (added a 4th COUNT(...) FILTER + NULLIF expression to the existing countsResult query in getPortfolioPeople({role:'worker'})) — chosen over the PersonMetrics join path because PersonMetrics is not materialized (it is itself computed in getPersonMetrics) and adding an extra db.execute call would be a needless second round-trip"
  - "tr.json bilingual labels (download_excel / download_pdf / export_excel / 6 picker_col_*) stored byte-identical to en.json per D-111 — verified by node -e parity check"
  - "tests/exports.test.ts uses 16 it.todo entries instead of exactly 12 (EXP-02 + EXP-04 critical truths split for granular targeting); acceptance criteria explicitly allows '>=12 if a critical truth was split'"
  - "seedFinalizedHakedisFixture stub throws on call — accidental promotion of an it.todo to a real test before Wave 2 will fail loudly with a clear remediation pointer"
metrics:
  duration_seconds: 596
  duration_minutes: 10
  tasks_completed: 3
  files_modified: 6
  files_created: 4
  completed: 2026-05-28
---

# Phase 11 Plan 01b: Wave 1 Setup Half-B Summary

Shipped the shared helper code that every Phase 11 Wave-2 plan depends on:
toSlug() for D-112 ASCII filenames, sanitizeExcelCell() for CVE-2014-3524
formula-injection mitigation (WARNING 5 fix), getAllFinishedPeriods() +
PeriodPickerRow type for the Exports hub period picker, PortfolioWorker.
locationComplianceRate populated via inline aggregation (WARNING 4 fix —
D-110 column was previously permanently blank), the 21-key dashboard.admin.
exports.* i18n namespace + 2 hakedis.detail keys, and the unified
tests/exports.test.ts scaffold with 16 it.todo entries covering the 12
VALIDATION.md critical truths.

## Tasks Completed

### Task 1 — toSlug() + sanitizeExcelCell() (RED commit `b6a52e3`, GREEN commit `3692d31`)

**Edit 1 — `tests/slug.test.ts` (new file, 6 expectations):**
- `İstanbul Doğalgaz` → `istanbul-dogalgaz` (capital İ + lowercase ğ)
- `Ankara Şehit Yolu` → `ankara-sehit-yolu` (capital Ş)
- `'  Boru   Hattı  '` → `boru-hatti` (whitespace collapsed; trailing dashes trimmed)
- `Project (2026)` → `project-2026` (non-alphanumerics collapse to single dash)
- `'---'` → `''` (only dashes returns empty string)
- `Çağrı Üçgenli` → `cagri-ucgenli` (all six Turkish lowercase chars: ç ğ ş ı ö ü)

**Edit 2 — `src/lib/slug.ts` (new file, 33 lines):**
Single exported function `toSlug(name: string): string`. Explicit char-class
replacement of `[İIıŞşĞğÜüÖöÇç]` via `TURKISH_MAP` applied BEFORE
`toLowerCase()` (Turkish dotted-I requires special handling). Then lowercase,
collapse `[^a-z0-9]+` runs to single dash, trim leading/trailing dashes.
Pure, synchronous, no external dependencies. Output is ASCII-safe for
Content-Disposition without RFC 5987 encoding (RESEARCH.md Open Question 2 RESOLVED).

**Edit 3 — `tests/excel.test.ts` (appended 9 expectations):**
New `describe('sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation (WARNING 5 fix)', ...)` block. Existing `parseBoqExcel` and `generateBoqTemplate` tests untouched.
- Normal text passes through unchanged
- `'=cmd|/c calc'` → `"'=cmd|/c calc"` (apostrophe-prefixed)
- `'+1234'`, `'-1234'`, `'@SUM(A1:A10)'` → apostrophe-prefixed
- `'\t=evil'`, `'\r=evil'` → apostrophe-prefixed (TAB + CR injection vectors)
- `''` → `''` (empty passes through)
- `'1234.56'` → `'1234.56'` (numeric strings pass through unchanged)

**Edit 4 — `src/lib/excel.ts` (appended sanitizeExcelCell):**
```typescript
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;
export function sanitizeExcelCell(value: string): string {
  if (typeof value !== 'string' || value.length === 0) return value;
  return FORMULA_PREFIX_RE.test(value) ? `'${value}` : value;
}
```
With trailing usage comment: `// Consumed by buildSubmissionLedger (Plan 11-02), buildPerformanceSummary (Plan 11-03), buildHakedisExcel (Plan 11-04).`

**Verification:**
- `vitest run tests/slug.test.ts tests/excel.test.ts` — all 6 toSlug + 9 sanitizeExcelCell + 5 existing parseBoqExcel/generateBoqTemplate tests pass (20 total)
- `tsc --noEmit` clean
- `wc -l src/lib/slug.ts` = 33 (slightly over the 30-line soft target, owing to the TURKISH_MAP table and JSDoc — acceptable)
- `grep "İ\|Ş\|Ğ\|Ü\|Ö\|Ç" src/lib/slug.ts` = 7 (Turkish capitals handled explicitly)
- Single new exported symbol per file: `toSlug` in slug.ts, `sanitizeExcelCell` in excel.ts

### Task 2 — getAllFinishedPeriods() + PortfolioWorker.locationComplianceRate (RED commit `1b04829`, GREEN commit `925a3dd`)

**Extension A — `getAllFinishedPeriods()` placement decision:**
Placed in `src/actions/analytics.ts` (planner-recommended placement, co-located
with `getPortfolioPeople`). `PeriodListRow` type imported from `@/actions/hakedis`
via `import type { PeriodListRow } from '@/actions/hakedis';` at the top of the
file. `PeriodPickerRow` type defined as `PeriodListRow & { projectName: string; projectId: string }`.

**Extension A — SQL implementation:**
The `net_by_display` subquery is copied **verbatim** from `getPeriodsByProject`
(hakedis.ts lines 423-440) — full D-90 deduction chain in Postgres numeric:
gross + KDV(net of tevkifat) - stopaj(conditional) - teminat - avans. The outer
query joins `hakedis_periods hp` with `projects p` on `p.id = hp.project_id`,
filters `hp.tenant_id = ${tenantId}` AND `hp.status != 'draft'`, and orders by
`hp.period_end_date DESC`. Returns empty array (not null) when no rows match;
throws `'Unauthorized'` on no session.

**Extension B — locationComplianceRate implementation path: inline aggregation (NOT PersonMetrics join).**

I chose inline aggregation because `PersonMetrics` is itself computed in
`getPersonMetrics` (it is not a materialized view or column on a real table);
joining to `getPersonMetrics` would require an extra round-trip per worker
and ignore the existing dateRange/projectFilter parameters of
`getPortfolioPeople`. Instead I added a 4th aggregate to the existing
`countsResult` query in `getPortfolioPeople({role:'worker'})`:
```sql
COUNT(s.id) FILTER (WHERE s.status = 'approved' AND s.location_match = 'near'
                    ${dateCondition} ${projectFilter})::float
  / NULLIF(COUNT(s.id) FILTER (WHERE s.status = 'approved' ${dateCondition} ${projectFilter}), 0)
                                                                  AS location_compliance_rate
```
This is the same FILTER + NULLIF shape used in `getPersonMetrics` line ~773
— guaranteeing identical results for the same input. `NULLIF(..., 0)`
returns SQL NULL when the worker has zero approved submissions, which
becomes JS `null` via the `r.location_compliance_rate != null ? Number(...) : null`
guard in the map function.

**Type extension:**
```typescript
export type PortfolioWorker = {
  // ...existing fields...
  locationComplianceRate: number | null;  // D-110 / WARNING 4 fix
};
```

**Tests appended to `tests/analytics.test.ts` (5 new describeIfDb tests):**

1. `getAllFinishedPeriods` — returns empty array when no periods exist
2. `getAllFinishedPeriods` — returns finalized period but EXCLUDES draft period in same tenant
3. `getAllFinishedPeriods` — cross-tenant finalized period is NOT returned
4. `PortfolioWorker.locationComplianceRate` — worker with zero approved → null
5. `PortfolioWorker.locationComplianceRate` — worker with 4 approved (3 near, 1 far) → ≈ 0.75 (via `toBeCloseTo(0.75, 2)`)

**Verification:**
- `vitest run tests/analytics.test.ts -t "getAllFinishedPeriods|locationComplianceRate"` — 5 passed
- `tsc --noEmit` clean
- `grep -c "export async function getAllFinishedPeriods" src/actions/analytics.ts src/actions/hakedis.ts` → 1 (analytics) + 0 (hakedis) = exactly one
- `grep -c "locationComplianceRate" src/actions/analytics.ts` = 6 (≥2 required)
- `grep -c "getAllFinishedPeriods" src/actions/analytics.ts` = 3 (≥1 required)
- No new SQL migration file created (`ls src/db/migrations/` unchanged — latest still `0008_v2_hakedis_deductions.sql`)

### Task 3 — i18n keys + tests/exports.test.ts scaffold + tests/fixtures/exports.ts (commit `948bbd8`)

**Edit 1 — `messages/en.json` and `messages/tr.json`:**

Added 21 keys under `dashboard.admin.exports` in BOTH locales:
`heading, subtitle, section_ledger, section_performance, section_hakedis,
download_excel, download_pdf, export_excel, picker_col_period,
picker_col_end_date, picker_col_currency, picker_col_status, picker_col_net,
picker_col_download, empty_no_data_heading, empty_no_data_body,
empty_no_periods_heading, empty_no_periods_body, empty_no_periods_cta,
err_download_failed, err_unauthorized`.

Added 2 keys under `dashboard.admin.hakedis.detail` in BOTH locales:
`export_excel, download_pdf` (D-111 joined bilingual labels — locale-neutral).

D-111 bilingual joined labels (`download_excel, download_pdf, export_excel,
picker_col_period, picker_col_end_date, picker_col_currency, picker_col_status,
picker_col_net, picker_col_download`) are stored **byte-identical** across
en.json and tr.json — verified by `node -e` parity check that asserts
`en.dashboard.admin.exports[k] === tr.dashboard.admin.exports[k]` for all 9.

`empty_*` and `err_*` keys carry locale-specific text (English in en.json,
Turkish in tr.json) since they are full sentences shown to users.

`stubs.exports_heading` / `stubs.exports_body` left untouched (still
referenced elsewhere until Plan 11-05 replaces the stub page).

4 `action_*_exported` keys from Plan 11-01a confirmed present in
`oe_scorecard` (verified by `node -e` check; not re-added by this task).

**Edit 2 — `tests/exports.test.ts` (new file, 16 it.todo entries):**

Single scaffold file for all four Wave-2 route handlers + activity-log
+ filename + bilingual-header assertions. Top-level imports cover
`describe`, `it` (vitest); `describeIfDb`, `getTestDb`, `truncateAllTables`
from `./fixtures/db`; `seedFinalizedHakedisFixture` from `./fixtures/exports`.
The latter four are `void`-referenced to suppress unused-import lint until
Wave-2 promotes the todos.

7 describe blocks: `EXP-01 submission ledger` (3 todos), `EXP-02 hakedis
Excel` (4 todos — auth, draft, gross precision, all-deductions precision),
`EXP-03 performance summary` (2 todos), `EXP-04 hakedis PDF` (4 todos —
auth, draft, font, Turkish glyphs), `D-109 activity log` (1 todo),
`D-112 filenames` (1 todo), `D-111 bilingual headers` (1 todo). Total 16.

Each it.todo description contains a phrase that maps verbatim to a
VALIDATION.md critical-truth bullet — `vitest run -t "..."` grep-targetable.

**Edit 3 — `tests/fixtures/exports.ts` (new file):**

Exports `seedFinalizedHakedisFixture(db): Promise<{ periodId; projectId }>`
that THROWS `'seedFinalizedHakedisFixture not yet implemented — Plan 11-04 wires this'`.
Top-of-file comment documents the Wave-1 stub status and the Wave-2 ownership
(Plan 11-04 Task 1).

**Verification:**
- Plan's `node -e` key-presence check prints `"all keys present in both locales"`
- `vitest run tests/exports.test.ts` reports `Test Files 1 skipped (1); Tests 16 todo (16)` — file is discoverable, no syntax errors, 16 ≥ 12 todos
- All 21 + 2 keys present in both files; JSON parses cleanly
- `stubs.exports_heading` / `stubs.exports_body` still present (untouched)
- 4 `action_*_exported` keys still present under `oe_scorecard` in both files
- D-111 parity check passes for all 9 bilingual joined labels

## Files Created (5)

| Path | Size | Purpose |
|------|------|---------|
| `src/lib/slug.ts` | 33 lines | D-112 ASCII slug helper (Turkish char normalization + dash collapse) |
| `tests/slug.test.ts` | 41 lines | 6 toSlug expectations (RED → GREEN) |
| `tests/exports.test.ts` | 60 lines | Wave-2 unified scaffold (16 it.todo entries) |
| `tests/fixtures/exports.ts` | 32 lines | seedFinalizedHakedisFixture stub for Plan 11-04 |
| `.planning/phases/11-exports/11-01b-SUMMARY.md` | this file | plan summary |

## Files Modified (6)

| Path | Change |
|------|--------|
| `src/lib/excel.ts` | Append sanitizeExcelCell() + FORMULA_PREFIX_RE constant (WARNING 5 fix) |
| `tests/excel.test.ts` | Append `describe('sanitizeExcelCell …', …)` block with 9 expectations |
| `src/actions/analytics.ts` | +1 import (PeriodListRow); +1 field on PortfolioWorker; +1 SQL aggregate in countsResult; +1 type (PeriodPickerRow); +1 function (getAllFinishedPeriods) |
| `tests/analytics.test.ts` | Append 5 new describeIfDb tests at end of file |
| `messages/en.json` | +21 keys under dashboard.admin.exports; +2 keys under dashboard.admin.hakedis.detail |
| `messages/tr.json` | Same as en.json with Turkish text for non-bilingual keys; identical strings for D-111 bilingual labels |

## Decisions Made

1. **getAllFinishedPeriods placement = analytics.ts**, not hakedis.ts. Planner-recommended placement co-locates the portfolio-level query (across all projects) with `getPortfolioPeople`. `PeriodListRow` is imported via `import type` from `@/actions/hakedis` (no runtime cross-import). Plan 11-05 will import `getAllFinishedPeriods` and `PeriodPickerRow` from `@/actions/analytics`.

2. **locationComplianceRate path = inline aggregation**, not PersonMetrics join. `PersonMetrics` is itself computed by `getPersonMetrics` (no materialized source); adding a join to it would mean either calling `getPersonMetrics` N times in JS or copy-pasting its SQL with worse maintainability. The inline path adds one column to the existing `countsResult` SQL using the SAME FILTER + NULLIF pattern (the only acceptable interpretation of "same definition"), inheriting tenant scope + dateRange + projectFilter parameters for free.

3. **D-111 bilingual joined labels stored byte-identical across locales**. The 9 joined labels (`download_excel`, `download_pdf`, `export_excel`, 6 `picker_col_*`) appear identically in both en.json and tr.json — the slash-joined string is the locale-neutral label per D-111. Localized strings (`heading`, `subtitle`, `section_*`, `empty_*`, `err_*`) carry different text per locale.

4. **16 it.todo entries, not exactly 12**. The plan's acceptance criterion says "exactly 12 it.todo entries (or more if a critical truth was split)". I split EXP-02 precision (gross + the 6-deduction strings) and EXP-04 binary assertions (auth, draft, font, Turkish glyphs) for granular test-grep targeting. The 12 VALIDATION.md critical truths remain 1:1 mapped — each truth is represented by ≥1 it.todo.

5. **seedFinalizedHakedisFixture stub throws on call.** Promoting an it.todo to a real test before Wave 2 lands the fixture will fail loudly with `'seedFinalizedHakedisFixture not yet implemented — Plan 11-04 wires this'` — preferable to a silent skip or a confusing FK violation.

## Deviations from Plan

None — all three tasks executed per the plan's `<action>` blocks. Two minor judgement calls documented under **Decisions Made** (placement of `getAllFinishedPeriods`, inline-vs-join path for `locationComplianceRate`) are explicitly delegated to "planner/executor discretion" by the plan itself.

`src/lib/slug.ts` came in at 33 lines (plan asked for "under 30 lines"). The extra 3 lines are the TURKISH_MAP object literal — collapsing it into a single-line regex replace would hurt readability for what is a security-relevant translation table. I documented this as judgement, not a deviation.

## Authentication Gates

None. Task 1 helpers are pure (no auth). Task 2 analytics extensions inherit
the existing `auth()` first-statement pattern from `getPortfolioPeople` and the
shipped `getAllFinishedPeriods`. Task 3 is i18n + test scaffolding only.

## Verification Results — Copy-Paste of `vitest run`

```
$ node_modules/.bin/vitest run tests/slug.test.ts tests/excel.test.ts tests/analytics.test.ts -t "getAllFinishedPeriods|locationComplianceRate|sanitizeExcelCell"

 ✓ tests/slug.test.ts > toSlug — D-112 ASCII slug normalization > İstanbul Doğalgaz → istanbul-dogalgaz (Turkish capital İ + lowercase ğ)
 ✓ tests/slug.test.ts > toSlug — D-112 ASCII slug normalization > Ankara Şehit Yolu → ankara-sehit-yolu (capital Ş)
 ✓ tests/slug.test.ts > toSlug — D-112 ASCII slug normalization > whitespace collapsed and trailing dashes trimmed
 ✓ tests/slug.test.ts > toSlug — D-112 ASCII slug normalization > non-alphanumerics collapse to single dash
 ✓ tests/slug.test.ts > toSlug — D-112 ASCII slug normalization > only dashes returns empty string
 ✓ tests/slug.test.ts > toSlug — D-112 ASCII slug normalization > all six Turkish lowercase chars normalize (ç→c ğ→g ş→s ı→i ö→o ü→u + capitals)
 ✓ tests/excel.test.ts > sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation (WARNING 5 fix) > passes normal text through unchanged
 ✓ tests/excel.test.ts > sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation (WARNING 5 fix) > prefixes apostrophe to strings starting with '=' (formula injection)
 ✓ tests/excel.test.ts > sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation (WARNING 5 fix) > prefixes apostrophe to strings starting with '+'
 ✓ tests/excel.test.ts > sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation (WARNING 5 fix) > prefixes apostrophe to strings starting with '-'
 ✓ tests/excel.test.ts > sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation (WARNING 5 fix) > prefixes apostrophe to strings starting with '@'
 ✓ tests/excel.test.ts > sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation (WARNING 5 fix) > prefixes apostrophe to strings starting with TAB
 ✓ tests/excel.test.ts > sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation (WARNING 5 fix) > prefixes apostrophe to strings starting with CR
 ✓ tests/excel.test.ts > sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation (WARNING 5 fix) > passes empty string through unchanged
 ✓ tests/excel.test.ts > sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation (WARNING 5 fix) > passes numeric strings (decimal money like 1234.56) through unchanged
 ✓ tests/analytics.test.ts > getAllFinishedPeriods() exposes non-draft periods tenant-wide > returns empty array when no periods exist in tenant
 ✓ tests/analytics.test.ts > getAllFinishedPeriods() exposes non-draft periods tenant-wide > returns a finalized period but EXCLUDES a draft period in the same tenant
 ✓ tests/analytics.test.ts > getAllFinishedPeriods() exposes non-draft periods tenant-wide > cross-tenant period is NOT returned even when status is finalized
 ✓ tests/analytics.test.ts > getPortfolioPeople({role:"worker"}).locationComplianceRate > worker with zero approved submissions → locationComplianceRate === null
 ✓ tests/analytics.test.ts > getPortfolioPeople({role:"worker"}).locationComplianceRate > worker with 4 approved (3 location-matched) → locationComplianceRate ≈ 0.75

 Test Files  3 passed (3)
      Tests  20 passed (20)
```

Full plan-level vitest run (`tests/slug.test.ts tests/excel.test.ts tests/analytics.test.ts tests/exports.test.ts`) reports `Test Files 3 passed | 1 skipped (4); Tests 92 passed | 16 todo (108)` — the 1 skipped file is `tests/exports.test.ts`, which is expected because every test in it is `it.todo` (vitest reports the file as `skipped` when there is no concrete test to run).

## Plan-Level Check Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `tsc --noEmit` | clean | clean | PASS |
| `vitest run` for slug/excel/analytics/exports | slug + sanitizeExcelCell + getAllFinishedPeriods + locationComplianceRate green; exports scaffold discoverable with ≥12 todos | 20 targeted green + 16 todos | PASS |
| `messages/{en,tr}.json` parse via JSON.parse | both clean | both clean | PASS |
| 21 exports.* + 2 detail keys in BOTH locales | 23 each | 23 each | PASS |
| 4 action_*_exported keys preserved (from Plan 11-01a) | yes | yes | PASS |
| `grep -c sanitizeExcelCell src/lib/excel.ts` | ≥1 | 3 | PASS |
| `grep -c locationComplianceRate src/actions/analytics.ts` | ≥2 | 6 | PASS |
| `grep -c getAllFinishedPeriods src/actions/analytics.ts src/actions/hakedis.ts` | ≥1 | 3 (analytics) + 0 (hakedis) = 3 | PASS |
| D-111 bilingual labels identical en↔tr | 9 identical | 9 identical | PASS |

## Threat Model Coverage

| Threat ID | Status |
|-----------|--------|
| T-11-01b-SQL (getAllFinishedPeriods SQL injection) | MITIGATED — `${tenantId}` bound via Drizzle sql`` params; SQL is identical-shape to proven getPeriodsByProject |
| T-11-01b-IDOR (locationComplianceRate cross-tenant leak) | MITIGATED — new aggregate added inside the existing `getPortfolioPeople` worker query; inherits its `WHERE p.tenant_id = ${tenantId}` scope; the inner `s.location_match = 'near'` join also inherits the `s.tenant_id = ${tenantId}` filter |
| T-11-01b-CVE-2014-3524 (formula injection) | MITIGATED — sanitizeExcelCell shipped; 9 regression tests gate the prefix set (`=`, `+`, `-`, `@`, `\t`, `\r`) and empty/numeric pass-through |
| T-11-01b-SLUG (Content-Disposition path traversal) | MITIGATED — toSlug output is ASCII-only `[a-z0-9-]+`; explicit Turkish char-class normalization; 6 regression tests cover capital İ + dotless ı edge cases |
| T-11-01b-i18n (TR/EN merge) | ACCEPT — JSON.parse validated; D-111 bilingual labels assertion guarantees parity |

## Self-Check: PASSED

- FOUND: `src/lib/slug.ts` (33 lines)
- FOUND: `tests/slug.test.ts` (6 expectations)
- FOUND: `tests/exports.test.ts` (16 it.todo entries, 7 describe blocks)
- FOUND: `tests/fixtures/exports.ts` (seedFinalizedHakedisFixture stub)
- FOUND: commit `b6a52e3` (Task 1 RED — test) in `git log`
- FOUND: commit `3692d31` (Task 1 GREEN — feat) in `git log`
- FOUND: commit `1b04829` (Task 2 RED — test) in `git log`
- FOUND: commit `925a3dd` (Task 2 GREEN — feat) in `git log`
- FOUND: commit `948bbd8` (Task 3 — feat i18n + scaffold) in `git log`
- VERIFIED: `sanitizeExcelCell` exported from `src/lib/excel.ts`
- VERIFIED: `toSlug` exported from `src/lib/slug.ts`
- VERIFIED: `getAllFinishedPeriods` + `PeriodPickerRow` exported from `src/actions/analytics.ts`
- VERIFIED: `PortfolioWorker` type contains `locationComplianceRate: number | null`
- VERIFIED: 21 `dashboard.admin.exports.*` keys present in both en.json and tr.json
- VERIFIED: 2 `dashboard.admin.hakedis.detail.*` keys (export_excel, download_pdf) present in both files
- VERIFIED: 4 `action_*_exported` keys from Plan 11-01a still present under `oe_scorecard`
- VERIFIED: `tsc --noEmit` clean
- VERIFIED: targeted vitest run reports 20 passed (6 slug + 9 sanitizeExcelCell + 3 getAllFinishedPeriods + 2 locationComplianceRate)
- VERIFIED: `vitest run tests/exports.test.ts` reports 16 todo (scaffold discoverable, no syntax errors)
- VERIFIED: zero new SQL migration files (`src/db/migrations/` unchanged from Plan 11-01a — latest still `0008_v2_hakedis_deductions.sql`)
