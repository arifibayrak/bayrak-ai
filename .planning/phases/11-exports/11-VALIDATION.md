---
phase: 11
slug: exports
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from the `## Validation Architecture` section of `11-RESEARCH.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing — see `vitest.config.ts`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `node_modules/.bin/vitest run <file>` |
| **Full suite command** | `node_modules/.bin/vitest run` |
| **DB integration tests** | Guarded by `describeIfDb` (skips when `TEST_DATABASE_URL` not set) |
| **Binary asset tests** | Read the PDF buffer with `pdf-parse` (text content) and a simple stream check for the embedded font name; read the ExcelJS buffer back via `ExcelJS.Workbook().xlsx.load(buf)` and assert cell-level identities |
| **Parallelism** | `fileParallelism: false` (sequential — shared DB, FK-safe TRUNCATE) |

---

## Sampling Rate

- **After every task commit:** Run `node_modules/.bin/vitest run <relevant file>`
- **After every plan wave:** Run `node_modules/.bin/vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** targeted file run is fast; full suite is the gate

---

## Per-Task Verification Map

> Critical truths to test (from research). UI-only tasks (page render, button placement) carry a
> build/typecheck gate plus an end-of-phase manual check. Task IDs are `{phase}-{plan}-{task}`,
> filled in by the planner.

| Critical Truth | Coverage | Test Type | Automated Command |
|----------------|----------|-----------|-------------------|
| `/api/exports/*` returns HTTP 401 on no session | required | unit (route handler) | `vitest run tests/exports.test.ts` |
| Every handler scopes by `tenant_id` (no cross-tenant leak) | required | DB integration | `vitest run tests/exports.test.ts` |
| Submission ledger row count == `getCanonicalSubmissions({limit:100_000}).length` | required | DB integration | `vitest run tests/exports.test.ts` |
| Workers tab row count == `getPortfolioPeople({role:'worker'}).length`; Auditors tab same | required | DB integration | `vitest run tests/exports.test.ts` |
| Hakkediş PDF embeds DejaVu Sans font name (PDF binary inspection) | required | unit (binary) | `vitest run tests/exports.test.ts` |
| Hakkediş PDF renders Turkish glyphs (`ğ ş ı ö ü ç`) in extracted text | required | unit (binary) | `vitest run tests/exports.test.ts` |
| Hesap Özeti `gross` cell exactly == `getPeriodDetail().deductions.gross` (decimal-string equality) | required | DB integration | `vitest run tests/exports.test.ts` |
| Same precision identity for `kdv`, `tevkifat`, `stopaj`, `teminat`, `avans`, `net` cells | required | DB integration | `vitest run tests/exports.test.ts` |
| Each successful export writes exactly one `office_activity_log` row of the right `action_type` | required | DB integration | `vitest run tests/exports.test.ts` |
| Draft-period hakkediş export endpoints return non-2xx (403 or 422) | required | DB integration | `vitest run tests/exports.test.ts` |
| `Content-Disposition` filename matches the D-112 pattern (verbose with project + date) | required | unit (route handler) | `vitest run tests/exports.test.ts` |
| Bilingual TR/EN header parity in each generated workbook (every TR/EN cell has a slash) | required | unit (binary) | `vitest run tests/exports.test.ts` |

*Status legend (during execution): ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> Note: the financial behaviors (precision, tenant scope, draft rejection, activity log,
> filename pattern) are fully covered by automated tests in `tests/exports.test.ts`. The hub
> page + period-detail button additions are typecheck + build gated; their visual rendering +
> TR/EN locale + download UX are end-of-phase manual UAT checks.

---

## Wave 0 Requirements

> Wave 0 completes at execution. These items are scaffolded by Plan 11-01 (or whichever wave
> the planner picks for setup); `wave_0_complete: false` until the plans actually run.

- [ ] `tests/exports.test.ts` — new file; scaffold + it.todo entries for the 12 critical truths
- [ ] `public/fonts/DejaVuSans.ttf` — installed via `dejavu-fonts-ttf@2.37.3` and copied (or symlinked) into `public/fonts/`
- [ ] `pdf-parse` dev dependency installed (for PDF text-extraction assertions in tests)
- [ ] Shared fixtures: a finalized hakkediş period with priced BOQ items + non-zero approved submissions in the test DB

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Exports hub page renders the 3 trigger sections + period picker in both TR and EN locales | EXP-01..04 | Browser-rendered UI | Open `/dashboard/(admin)/exports`, switch locale, confirm all labels update |
| Period detail page exposes the Excel + PDF buttons only when `status !== 'draft'` | EXP-02 / EXP-04 | Browser-rendered UI | View one draft + one finalized period; confirm the buttons are present only on the finalized one |
| Downloaded PDF opens in a real PDF viewer with crisp Turkish characters (no missing glyphs / tofu) | EXP-04 | PDF viewer rendering | Open the downloaded `.pdf` in Preview/Acrobat; verify ş ı ğ ç render correctly |
| Downloaded Excel opens in Excel/LibreOffice with locale-aware money grouping | EXP-01 / EXP-02 / EXP-03 | Excel locale rendering | Open the downloaded `.xlsx`; verify money cells use Turkish grouping (`1.234,56`) under tr-TR Excel locale |

*Server-side enforcement (auth, tenant scope, draft rejection, precision identity, activity log)
is covered by automated tests in `tests/exports.test.ts`; the manual checks verify only the
binary-content rendering layer that automation cannot inspect.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (test scaffold + DejaVu font + pdf-parse + fixtures)
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter
- [ ] `wave_0_complete` — set to true at execution once the scaffold + font + dep + fixtures land

**Approval:** pending
</content>
