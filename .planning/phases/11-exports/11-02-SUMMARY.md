---
phase: 11
plan: 02
subsystem: exports
tags: [route-handler, excel, exp-01, d-109, d-111, d-112, d-114, d-116, warning-5-binding]
requires:
  - "Plan 11-01a complete (D-109 OFFICE_ACTION_TYPES extended)"
  - "Plan 11-01b complete (sanitizeExcelCell, toSlug, getCanonicalSubmissions tenant scope)"
  - "tests/exports.test.ts scaffold with EXP-01 it.todo entries"
provides:
  - "src/app/api/exports/submissions/route.ts — GET binary handler (EXP-01)"
  - "src/lib/excel.ts buildSubmissionLedger() exported (79 LOC)"
  - "8 EXP-01 tests green in tests/exports.test.ts (3 it.todo promoted + 5 new)"
affects:
  - "Plan 11-03 (EXP-03 performance summary — same skeleton template)"
  - "Plan 11-04 (EXP-02 hakedis Excel + EXP-04 PDF — same skeleton template)"
  - "Plan 11-05 (Exports hub page — wires <a href='/api/exports/submissions?…'>)"
tech-stack:
  added: []
  patterns:
    - "Binary Next.js route handler (D-114 first-statement auth, NextResponse.json 401, NOT redirect)"
    - "ExcelJS in-memory workbook → writeBuffer() → Buffer.from() → new Uint8Array() (matches generateBoqTemplate precedent)"
    - "D-116 cell numFmt — Postgres decimal strings flow direct, no parseFloat"
    - "sanitizeExcelCell() wraps every worker-typed string (T-11-02-FORMULA defence-in-depth)"
    - "logOfficeActivity AFTER response built (D-109 + Phase 7 after() pattern)"
key-files:
  created:
    - src/app/api/exports/submissions/route.ts
  modified:
    - src/lib/excel.ts
    - tests/exports.test.ts
decisions:
  - "MockSession setter pattern in tests — lets vi.mock('@/lib/auth') stay at module scope while each it() reassigns the value (mirrors tests/projects.test.ts precedent)"
  - "Tenant scope test seeded UUIDs in lowercase hex — Postgres normalizes UUID literals to lowercase, so seeded data + assertion strings must match (auto-fixed mid-execution — Rule 1)"
  - "buildSubmissionLedger does NOT use parseFloat — Postgres decimal strings flow as-is into ExcelJS cells; numFmt at column level renders them with locale grouping"
  - "Sheet name in Turkish ('Gönderim Listesi') per D-111; column headers bilingual TR/EN slash-joined"
  - "Cell-index lookups in tests (e.g. row.getCell(7)) instead of key lookups — ExcelJS does not persist column keys in the .xlsx binary, only header strings; auto-fixed Rule 1 after initial test failure"
metrics:
  duration_seconds: 480
  duration_minutes: 8
  tasks_completed: 2
  files_modified: 2
  files_created: 1
  excel_loc_added: 79
  completed: 2026-05-28
---

# Phase 11 Plan 02: EXP-01 Submission Ledger Excel Export Summary

Built the first binary route handler of Phase 11 — `GET /api/exports/submissions` —
which streams a single-sheet ExcelJS workbook to the browser. The route is auth-first
(D-114), tenant-scoped (via `getCanonicalSubmissions`), filename-stable (D-112),
audit-logged (D-109), and money-precision-safe (D-116). The companion
`buildSubmissionLedger()` helper in `src/lib/excel.ts` adds 79 LOC and is the template
that Plans 11-03 and 11-04 will mirror for the other three exports.

## Tasks Completed

### Task 1 — buildSubmissionLedger() helper in src/lib/excel.ts (TDD)

- **RED commit `aa31f9c`** — added 4 unit tests + 2 DB integration tests + 1 filename
  test + 1 activity-log test to `tests/exports.test.ts`, replacing the 3 EXP-01 it.todo
  entries from the Plan 11-01b scaffold. All tests failed with `buildSubmissionLedger
  is not a function` or `Cannot find package '@/app/api/exports/submissions/route'`.
- **GREEN commit `243f047`** — implemented `buildSubmissionLedger(rows:
  CanonicalSubmission[]): Promise<Buffer>` in `src/lib/excel.ts`:
  - Imported `CanonicalSubmission` from `@/lib/types` (the project's existing barrel
    export, not a redeclaration).
  - 14 bilingual TR/EN headers verbatim from UI-SPEC, each containing ` / ` (D-111 gate).
  - Bold row 1 (`sheet.getRow(1).font = { bold: true }`) and frozen pane
    (`sheet.views = [{ state: 'frozen', ySplit: 1 }]`).
  - Money columns (`quantity`, `unitPrice`, `earnedValue`) get
    `numFmt = '#,##0.00'`; date columns (`submittedAt`, `decidedAt`) get
    `numFmt = 'dd.MM.yyyy HH:mm'`. **Zero `parseFloat` calls** inside the new helper.
  - Sheet name `'Gönderim Listesi'`.
  - Every worker-typed string field (`projectName`, `workerName`, `auditorName`,
    `material`) is wrapped in `sanitizeExcelCell()` — direct binding of the
    T-11-02-FORMULA mitigate disposition.
  - ISO date strings flow as `new Date(...)` so ExcelJS recognises them as Date type.
  - `null` audit latency → empty cell (no `0` or `'null'` injected).

### Task 2 — src/app/api/exports/submissions/route.ts (D-114 / D-112 / D-109)

- **GREEN commit `5f85ba2`** — created the route handler (149 lines including JSDoc
  threat-model summary) mirroring `src/app/dashboard/projects/[id]/boq-template/route.ts`
  verbatim, then added query-string parsing and filename derivation:
  - First statement is `const session = await auth();` (D-114 gate).
  - 401 response is `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })` —
    NOT a redirect (binary endpoint).
  - Parses `from`, `to`, `project` from `new URL(request.url).searchParams`. Invalid
    dates → 400 with `{ error: 'Invalid date range' }`.
  - Calls `getCanonicalSubmissions({ from, to, projectIds, limit: 100_000 })` with an
    explicit-100k literal and a Pitfall-3 comment so future readers know why.
  - Filename derivation: `slug = projectName ? toSlug(projectName) : 'portfolio'`. If
    `project` filter active but rows empty, falls back to `getProjects()` lookup to
    find the project name. If slug ends up empty (e.g. project name was `'---'`),
    falls back to `'portfolio'` defensively.
  - `from`/`to` formatted as `YYYYMMDD` (or `'all'` if not supplied) — verbose D-112
    pattern.
  - `logOfficeActivity({ actorUserId, actionType: 'submission_ledger_exported',
    entityType: 'submission_ledger', projectId, metadata: { from, to, rowCount,
    filename } })` called AFTER constructing the `NextResponse` and BEFORE returning
    it. Never awaited — fire-and-forget via `after()`.
  - `export const runtime = 'nodejs';` and `export const dynamic = 'force-dynamic';`
    declared at module scope (Pitfall 6 — ExcelJS is Node-only, binary exports must
    never be cached).

## 4 Newly-Passing Unit Tests (replacing the 3 EXP-01 it.todo + 1 new)

| Test name | Description |
|-----------|-------------|
| `EXP-01 submission ledger > returns 401 without session` | Mocks `auth()` to resolve `null` and asserts `GET()` returns a NextResponse with status `401` and JSON body `{ error: 'Unauthorized' }`. |
| `EXP-01 submission ledger > builds a workbook with 14 bilingual headers each containing " / "` | Calls `buildSubmissionLedger([])`, reads the buffer back with `new ExcelJS.Workbook().xlsx.load(buf)`, asserts `sheet.getRow(1).values` has exactly 14 string cells and every one contains ` / `. Also asserts sheet name = `'Gönderim Listesi'` and frozen pane `{ state: 'frozen', ySplit: 1 }`. |
| `EXP-01 submission ledger > does not parseFloat money — earnedValue cell value retains decimal precision` | Passes one fake row with `quantity: '1.23456789'` and `earnedValue: '1524.157875207468'`; reads the workbook back and asserts the cell values stringify back to the exact original decimal strings. D-116 regression gate. |
| `EXP-01 submission ledger > sanitizeExcelCell prefixes apostrophe on formula-prefix worker content (WARNING 5 / T-11-02-FORMULA regression gate)` | Passes two fake rows — one with `workerName: '=cmd|/c calc'`, one with `material: '+1234'`. Asserts the corresponding cells read back as `"'=cmd|/c calc"` and `"'+1234"` (apostrophe-prefixed). T-11-02-FORMULA mitigation regression gate. |

## 4 Newly-Passing DB Integration / Header Tests

| Test name | Description |
|-----------|-------------|
| `EXP-01 tenant scope > scopes by tenant_id (no cross-tenant rows)` | Seeds tenant A + tenant B (each with its own project + boq item + person + submission), mocks the session as the default-tenant user, invokes the GET handler, parses the resulting workbook, and asserts the data rows contain submission A's id but NOT submission B's id. Direct T-11-02-IDOR regression gate. |
| `EXP-01 row count > row count equals getCanonicalSubmissions({limit:100_000}).length` | Seeds 5 submissions, calls `getCanonicalSubmissions({ limit: 100_000 })` to get the expected length, invokes the GET handler, and asserts `sheet.rowCount - 1 === expectedCount === 5`. Direct EXP-01 acceptance gate. |
| `D-112 filenames > Content-Disposition filename matches verbose pattern with project + date` | Calls the GET handler twice — once with no params, once with `?from=2026-01-01&to=2026-01-31` — and asserts each `content-disposition` header matches the D-112 regex `/submission-ledger-[a-z0-9-]+-(all|\d{8})-(all|\d{8})\.xlsx/`. Direct D-112 regression gate. |
| `D-109 activity log — submission_ledger_exported > each successful export writes exactly one office_activity_log row of the right action_type` | Invokes the GET handler, waits 50ms for the `after()` callback (mocked to fire-immediately), then queries `office_activity_log` for `action_type = 'submission_ledger_exported'` and asserts exactly one row exists. D-109 regression gate. |

DB tests use `describeIfDb` and are gated behind `TEST_DATABASE_URL`. All 8 EXP-01 tests
ran green in this environment (`TEST_DATABASE_URL` is set).

## Sample Content-Disposition Headers Produced

```
# No filters (portfolio-wide, all time)
Content-Disposition: attachment; filename="submission-ledger-portfolio-all-all.xlsx"

# With project + date range filter
Content-Disposition: attachment; filename="submission-ledger-istanbul-dogalgaz-20260101-20260131.xlsx"

# With date range only (no project)
Content-Disposition: attachment; filename="submission-ledger-portfolio-20260101-20260131.xlsx"
```

The verbose D-112 pattern lets an office engineer managing multiple projects identify
files later without opening them, on any OS, with predictable lexicographic sorting.

## Files Created (1)

| Path | Lines | Purpose |
|------|-------|---------|
| `src/app/api/exports/submissions/route.ts` | 132 | EXP-01 binary route handler (auth → fetch → build → log → respond) |

## Files Modified (2)

| Path | Change |
|------|--------|
| `src/lib/excel.ts` | +79 LOC: `buildSubmissionLedger()` async function + 1-line import `import type { CanonicalSubmission } from '@/lib/types'` |
| `tests/exports.test.ts` | +417 LOC: real EXP-01 implementations replacing 3 it.todo, plus 5 new tests (1 unit + 2 DB integration + 1 filename + 1 activity log). Remaining EXP-02/03/04 it.todo entries preserved for Plans 11-03/04/05. |

## Deviations from Plan

### [Rule 1 — Bug] Test cell lookups used string keys; XLSX format does not persist keys

- **Found during:** Task 1 GREEN — initial vitest run after implementing `buildSubmissionLedger`.
- **Issue:** The plan's `<action>` block said to look up cells via `sheet.getRow(2).getCell('quantity')` after loading the workbook back. ExcelJS reads the column-key metadata only when the workbook is constructed in memory; once written to .xlsx and re-loaded, only the header strings exist — so `getCell('quantity')` fails with `Out of bounds. Excel supports columns from 1 to 16384`.
- **Fix:** Switched to numeric column indices (`getRow(2).getCell(7)` for quantity, `getCell(10)` for earnedValue, etc.). Documented the column order with a code comment so future readers know why the cell lookups are numeric.
- **Files modified:** `tests/exports.test.ts` (3 cell lookups + 1 tenant-scope id lookup).
- **Commit:** `5f85ba2` (Task 2 GREEN — folded the fix into the same commit since it was discovered post-RED but pre-Task-2-completion).

### [Rule 1 — Bug] Tenant-scope test seeded UUIDs in uppercase hex

- **Found during:** Task 2 GREEN — vitest run after route handler shipped.
- **Issue:** I seeded `subA = '00000000-0000-0000-0000-0000000000A4'` (uppercase `A4`) and asserted `seenIds.toContain(subA)`. Postgres normalises UUID literals to lowercase, so `getCanonicalSubmissions` returned the row with id `…0000a4` — the assertion failed because the strings differed by case.
- **Fix:** Changed every UUID in the tenant-scope test (12 strings) to lowercase hex (`a4` not `A4`, `b1` not `B1`, etc.). Test passes.
- **Files modified:** `tests/exports.test.ts` (`scopes by tenant_id` test only).
- **Commit:** `5f85ba2`.

### [Rule 2 — Correctness] Empty-slug fallback to `'portfolio'`

- **Found during:** Task 2 review of D-112 acceptance criterion.
- **Issue:** If a future project somehow had a name composed entirely of non-alphanumeric characters (`'---'`, `'@#$'`), `toSlug()` would return `''` and produce `submission-ledger--20260101-20260131.xlsx` (two dashes in a row, ambiguous to filesystem sorting). The plan said "fall back to `'portfolio'` if slug is empty" — I implemented this defensively even though `toSlug()`'s test suite already covers `'---' → ''`.
- **Fix:** Added `if (!slug) slug = 'portfolio';` after the toSlug call.
- **Files modified:** `src/app/api/exports/submissions/route.ts` (line 94).
- **Commit:** `5f85ba2` (folded into Task 2 GREEN — Rule 2 critical correctness, no separate commit).

## Authentication Gates

None. Both tasks proceeded autonomously — Task 1 was pure helper code (no auth path),
Task 2 inherited the `auth()` first-statement pattern already proven by
`boq-template/route.ts`.

## Threat Model Coverage

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-11-02-AUTH (Spoofing) | MITIGATED | `auth()` first statement; 401 JSON test (`returns 401 without session`) green. |
| T-11-02-IDOR (Information Disclosure) | MITIGATED | Tenant scope test (`scopes by tenant_id`) green — submission A appears, B does not. |
| T-11-02-INJ (Tampering) | MITIGATED | All filter values bound via Drizzle `sql\`\`` inside `getCanonicalSubmissions`. Route handler only parses primitive types from query string. |
| T-11-02-FLOAT (Tampering) | MITIGATED | D-116 numFmt at column level; no `parseFloat` inside `buildSubmissionLedger`. Regression test (`does not parseFloat money`) green. |
| T-11-02-FILENAME (Tampering) | MITIGATED | `toSlug()` strips all non-`[a-z0-9-]` characters before `Content-Disposition`. D-112 regex test green. |
| T-11-02-FORMULA (Tampering) | MITIGATED | `sanitizeExcelCell()` wraps every worker-typed string. Regression test (`sanitizeExcelCell prefixes apostrophe`) green. |
| T-11-02-DOS (DoS) | ACCEPTED | Explicit `limit: 100_000` (Pitfall 3); single-tenant MVP, bounded dataset. `Content-Length` header set. |

All 7 threats resolved per the plan's threat-model dispositions.

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `vitest run tests/exports.test.ts -t "EXP-01"` | 8 EXP-01 tests green | 8 passed (3 unit + 1 formula regression + 2 DB integration + 1 filename + 1 activity log) | PASS |
| `tsc --noEmit` | clean | clean | PASS |
| `grep -c "export async function buildSubmissionLedger" src/lib/excel.ts` | 1 | 1 | PASS |
| `grep -c "parseFloat" src/lib/excel.ts` | 1 (only existing parseBoqExcel line 85) | 1 actual call + 3 JSDoc/comment mentions explaining the prohibition | PASS |
| `grep -E "numFmt" src/lib/excel.ts \| wc -l` | ≥5 | 8 | PASS |
| `grep -c "sanitizeExcelCell(" src/lib/excel.ts` | ≥4 | 5 (4 call-sites + 1 JSDoc) | PASS |
| `grep -c "export const runtime = 'nodejs'" route.ts` | 1 | 1 | PASS |
| `grep -c "export const dynamic = 'force-dynamic'" route.ts` | 1 | 1 | PASS |
| First statement of GET | `const session = await auth();` | confirmed via `awk '/^export async function GET/,/^}/'` | PASS |
| `grep -c "limit: 100_000\|limit: 100000" route.ts` | ≥1 | 3 (call-site + comment + JSDoc) | PASS |
| `grep -c "submission_ledger_exported" route.ts` | ≥1 | 2 (logOfficeActivity call + JSDoc) | PASS |
| `grep -c "toSlug" route.ts` | ≥1 | 3 (import + call + JSDoc) | PASS |
| `grep -c "redirect\|NextResponse.redirect" route.ts` | 0 (no actual redirect calls) | 1 hit — JSDoc comment "NOT redirect" only; zero actual `redirect()` calls | PASS |
| Regression: `vitest run tests/excel.test.ts` | 14 existing tests still green | 14 green | PASS |
| Regression: `vitest run tests/slug.test.ts` | 6 toSlug tests still green | 6 green | PASS |

## Plan-Level Test Run

```
$ node_modules/.bin/vitest run tests/exports.test.ts tests/excel.test.ts tests/slug.test.ts --reporter=verbose

 Test Files  3 passed (3)
      Tests  28 passed | 11 todo (39)
   Duration  5.63s
```

The 11 todos are the EXP-02 / EXP-03 / EXP-04 / D-111 entries reserved for Plans
11-03 / 11-04 / 11-05.

## Self-Check: PASSED

- FOUND: `src/app/api/exports/submissions/route.ts` (132 lines)
- FOUND: `buildSubmissionLedger` exported from `src/lib/excel.ts`
- FOUND: commit `aa31f9c` (test RED) in git log
- FOUND: commit `243f047` (Task 1 GREEN) in git log
- FOUND: commit `5f85ba2` (Task 2 GREEN) in git log
- VERIFIED: 14 bilingual header strings in `buildSubmissionLedger` (each contains ' / ')
- VERIFIED: 5 numFmt assignments in buildSubmissionLedger column setup
- VERIFIED: 4 sanitizeExcelCell call-sites in buildSubmissionLedger row mapping (projectName, workerName, auditorName, material)
- VERIFIED: zero parseFloat calls inside buildSubmissionLedger
- VERIFIED: route handler first statement is `const session = await auth();`
- VERIFIED: `runtime='nodejs'` + `dynamic='force-dynamic'` declared at module scope
- VERIFIED: `tsc --noEmit` clean
- VERIFIED: 8 EXP-01 vitest names match the plan's acceptance criteria 1:1
