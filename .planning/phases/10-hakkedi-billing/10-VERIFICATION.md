---
phase: 10-hakkedi-billing
verified: 2026-05-28T13:10:00Z
status: human_needed
score: 13/13 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Create a draft period via the Create Period dialog (KDV 20%, tevkifat 40%, stopaj off, teminat 5%, avans 0%), then open the detail page and confirm the deduction summary shows all 7 rows (gross → KDV → KDV tevkifat → stopaj → teminat → avans → net) to exactly 2 decimal places in the TR locale (e.g. 1.234,56 TRY format)"
    expected: "All 7 rows render with 2 decimal places; Net Ödeme is visually prominent (text-2xl); stopaj row is absent since stopajEnabled=false"
    why_human: "Locale-aware number formatting (tr-TR), Decimal.js rendering, and visual prominence of Net Ödeme cannot be verified by grep"
  - test: "Toggle the dashboard locale from TR to EN (and back) while on the hakkediş list page and the period detail page"
    expected: "All labels, column headers, status badge strings, button text, and deduction row labels switch language immediately; no missing key placeholders appear"
    why_human: "next-intl locale switching and runtime string rendering cannot be verified statically"
  - test: "Finalize a draft period: click Kesinleştir, confirm in the dialog, then verify the detail page re-renders"
    expected: "Immutability banner (Lock icon + finalized_notice text) appears; Recompute, Finalize, and Delete controls are gone from the control row entirely (not just disabled); only non-destructive payment controls (Tahakkuk Et) appear"
    why_human: "Conditional rendering of control removal (D-96: removed not disabled) must be verified in a running browser; grep confirms the conditional exists but not that it works correctly end-to-end"
  - test: "On the hakkediş list page, verify the draft-only Sil affordance: a draft row shows the DeletePeriodDialog trigger; a finalized/submitted/paid row shows no Sil button at all"
    expected: "Draft rows: Aç link + Sil trigger visible. Non-draft rows: only Aç link, no Sil button in the DOM"
    why_human: "Conditional rendering of DeletePeriodDialog behind status === 'draft' must be verified in a running browser to confirm the element is truly absent, not just hidden"
  - test: "Advance a finalized period: click Tahakkuk Et (finalized → submitted), then Ödendi (submitted → paid). Verify status badge updates on the list page and detail page"
    expected: "Status badge changes from 'Finalized' → 'Tahakkuk' → 'Ödendi' correctly; paid state shows no further controls"
    why_human: "Payment status UX flow (updatePaymentStatus server round-trips, revalidatePath, badge re-render) requires a running browser to confirm the full loop"
---

# Phase 10: Hakkediş Billing Verification Report

**Phase Goal:** Office engineer can create, compute, and finalize progress-payment periods (hakkediş) using the yeşil-defter cumulative model; all deduction rates are configurable per period; a finalized period is an immutable snapshot that cannot be recomputed or overwritten.
**Verified:** 2026-05-28T13:10:00Z
**Status:** human_needed — all 13 code truths VERIFIED; 5 browser/UX items deferred to human UAT
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `src/actions/hakedis.ts` exports exactly 7 functions, each with `const session = await auth()` as first statement | ✓ VERIFIED | `grep -c "^export async function" hakedis.ts` → 7 (recomputePeriodLines, createPeriod, getPeriodsByProject, getPeriodDetail, finalizePeriod, updatePaymentStatus, deletePeriod); `grep -c "const session = await auth()"` → 8 (7 function guards + 1 comment) — all 7 exported functions have the guard |
| 2 | INSERT into `hakedis_period_lines` never references `period_qty` (D-104) | ✓ VERIFIED | Sole INSERT at line 256-281 lists 11 columns; `period_qty` is absent. All `period_qty` references in hakedis.ts are in comments, types, or SELECT/RETURNING contexts only |
| 3 | Previous-period query uses `status != 'draft'` (D-99 finalized-only chaining) | ✓ VERIFIED | Line 232: `AND hp.status != 'draft'` in the DISTINCT ON previous-cumulative query |
| 4 | `recomputePeriodLines` and `deletePeriod` guard on `status === 'draft'` server-side | ✓ VERIFIED | Line 167: `if (period.status !== 'draft') throw new Error('Period is not in draft status')` in recomputePeriodLines; line 741: `if (period.status !== 'draft') throw new Error('Cannot delete a finalized period')` in deletePeriod |
| 5 | `updatePaymentStatus` enforces VALID_TRANSITIONS table (no skipping, no reverting) | ✓ VERIFIED | Lines 71-76: `VALID_TRANSITIONS = { draft: null, finalized: 'submitted', submitted: 'paid', paid: null }`; lines 700-702 throw on `expected === null` or `target !== expected` |
| 6 | `finalizePeriod` is one-way; no un-finalize endpoint exists anywhere in src/ | ✓ VERIFIED | grep for `unfinalize`, `un-finalize`, `setDraft`, `revert.*finali` across src/ returns zero results |
| 7 | List page renders `DeletePeriodDialog` behind `status === 'draft'` guard | ✓ VERIFIED | `hakedis/page.tsx` line 193: `{period.status === 'draft' && (<DeletePeriodDialog .../>)}` — conditional rendering, not conditional disable |
| 8 | Detail page renders 7-row SC3 deduction chain with Net Ödeme as focal point (text-2xl tabular-nums) | ✓ VERIFIED | Detail page lines 320-415 render all 7 rows (row_gross, row_kdv, row_tevkifat, row_stopaj, row_teminat, row_avans, row_net); Net Ödeme span has `className="text-2xl font-semibold tabular-nums"` at line 410 |
| 9 | i18n parity: every `dashboard.admin.hakedis.*` key exists in BOTH en.json and tr.json | ✓ VERIFIED | Deep flatten check: EN=64 keys, TR=64 keys, 0 missing in either direction — PASS |
| 10 | D-91 deduction columns present in schema: tevkifat_fraction, stopaj_enabled, stopaj_rate, avans_kesintisi_rate | ✓ VERIFIED | `hakedis-periods.ts` lines 29-35 declare all four columns; migration 0008 adds them in Part A DDL |
| 11 | D-104: `period_qty` is `generatedAlwaysAs` in Drizzle schema + GENERATED ALWAYS AS STORED in migration 0008 | ✓ VERIFIED | `hakedis-period-lines.ts` lines 39-40: `.generatedAlwaysAs(sql\`cumulative_qty_approved - previous_cumulative_qty\`)`; migration 0008 line 41: `GENERATED ALWAYS AS (cumulative_qty_approved - previous_cumulative_qty) STORED` |
| 12 | `OFFICE_ACTION_TYPES` includes `'hakedis_period_deleted'` | ✓ VERIFIED | `office-activity-log.ts` lists `'hakedis_period_deleted'` in the const array |
| 13 | All 28 hakedis integration tests pass (vitest run tests/hakedis.test.ts) | ✓ VERIFIED | `npx vitest run tests/hakedis.test.ts` → 1 file passed, 28 tests passed, exit 0; full suite: PASS(288) FAIL(0) |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/actions/hakedis.ts` | 7 exported server actions, all auth-guarded | ✓ VERIFIED | 763 lines; 7 exports confirmed; auth guard on each |
| `src/db/schema/hakedis-periods.ts` | 4 new deduction columns (D-91) | ✓ VERIFIED | tevkifatFraction, stopajEnabled, stopajRate, avansKesintisiRate present |
| `src/db/schema/hakedis-period-lines.ts` | periodQty as generatedAlwaysAs (D-104) | ✓ VERIFIED | `.generatedAlwaysAs(sql\`cumulative_qty_approved - previous_cumulative_qty\`)` on line 39 |
| `src/db/migrations/0008_v2_hakedis_deductions.sql` | Deduction columns + GENERATED period_qty | ✓ VERIFIED | Part A adds 4 columns; Part B drops+re-adds period_qty as GENERATED ALWAYS AS STORED; statement-breakpoints present |
| `src/db/migrations/meta/_journal.json` | Entry idx=8 tag=0008_v2_hakedis_deductions | ✓ VERIFIED | Last entry: `{"idx":8,"version":"7","tag":"0008_v2_hakedis_deductions","breakpoints":true}` |
| `src/db/schema/office-activity-log.ts` | `'hakedis_period_deleted'` in OFFICE_ACTION_TYPES | ✓ VERIFIED | Present in the array |
| `src/components/ui/switch.tsx` | shadcn Switch component for stopaj toggle | ✓ VERIFIED | File exists (1.7K) |
| `src/app/dashboard/(admin)/hakedis/page.tsx` | Period list with force-dynamic, project filter, draft-only Sil | ✓ VERIFIED | force-dynamic on line 22; getPeriodsByProject wired; DeletePeriodDialog behind status === 'draft' guard |
| `src/components/admin/HakedisCreateDialog.tsx` | Create dialog with D-92 defaults and stopaj Switch toggle | ✓ VERIFIED | KDV 20%, tevkifat 40%, stopaj off, teminat 5%, avans 0%; Switch imported and used |
| `src/components/admin/HakedisStatusBadge.tsx` | Status badge with color map | ✓ VERIFIED | draft/finalized/submitted/paid → amber/blue/violet/emerald |
| `src/components/admin/DeletePeriodDialog.tsx` | Delete confirmation dialog calling deletePeriod | ✓ VERIFIED | deletePeriod imported and called on confirm |
| `src/components/admin/FinalizeDialog.tsx` | Finalize confirmation dialog calling finalizePeriod | ✓ VERIFIED | finalizePeriod imported and called on confirm |
| `src/components/admin/PeriodDetailControls.tsx` | State-gated controls (draft: recompute+finalize+delete; finalized: advance; submitted: advance; paid: none) | ✓ VERIFIED | Correct conditional rendering per status; controls removed not disabled |
| `src/components/admin/HakedisProjectFilter.tsx` | Project filter client component using useSearchParams | ✓ VERIFIED | useSearchParams + router.push wired; wrapped in Suspense in parent |
| `src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx` | Detail page with 7-row deduction chain + Net Ödeme focal point | ✓ VERIFIED | force-dynamic; getPeriodDetail wired; text-2xl on Net Ödeme span; immutability banner for non-draft |
| `tests/hakedis.test.ts` | 28 passing integration tests covering HAK-01..HAK-05 | ✓ VERIFIED | 929 lines; 28 tests (0 todos); all pass against live test DB |
| `messages/en.json` + `messages/tr.json` | Full dashboard.admin.hakedis namespace (64 keys each) | ✓ VERIFIED | Deep key parity: 64/64, 0 missing in either locale |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `HakedisCreateDialog.tsx` | `src/actions/hakedis.ts createPeriod` | import + form submit | ✓ WIRED | Line 43 import; line 134 call; navigates to detail on success |
| `hakedis/page.tsx` | `getPeriodsByProject` | RSC await | ✓ WIRED | Line 15 import; line 77 await |
| `hakedis/page.tsx` | `DeletePeriodDialog` | status==='draft' conditional | ✓ WIRED | Lines 193-198; draft-only guard |
| `DeletePeriodDialog.tsx` | `deletePeriod` | import + confirm button | ✓ WIRED | deletePeriod imported; called on confirm |
| `hakedis/[periodId]/page.tsx` | `getPeriodDetail` | RSC await | ✓ WIRED | Line 27 import; line 115 await |
| `PeriodDetailControls.tsx` | `recomputePeriodLines + updatePaymentStatus` | import + button handlers | ✓ WIRED | Line 30 import; called in handleRecompute + handleAdvanceStatus |
| `PeriodDetailControls.tsx` | `FinalizeDialog + DeletePeriodDialog` | import + render | ✓ WIRED | Lines 31-32 imports; rendered in draft-only block |
| `FinalizeDialog.tsx` | `finalizePeriod` | import + confirm | ✓ WIRED | Line 37 import; line 55 call |
| `hakedis-period-lines.ts periodQty` | migration 0008 GENERATED DDL | generatedAlwaysAs → STORED | ✓ WIRED | Schema and SQL both express `cumulative_qty_approved - previous_cumulative_qty`; journal idx=8 applied |
| `hakedis.ts INSERT` | `hakedis_period_lines` | cumulative+previous only (never period_qty) | ✓ WIRED | INSERT column list confirmed: 11 columns, period_qty absent |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `hakedis/page.tsx` | `periods` | `getPeriodsByProject(selectedProjectId)` → Postgres query with net computation subquery | Yes — Postgres SUM over hakedis_period_lines with D-90 deduction formula | ✓ FLOWING |
| `hakedis/[periodId]/page.tsx` | `detail.lines`, `detail.deductions` | `getPeriodDetail(periodId)` → 3 Postgres queries (header, lines, deduction chain) | Yes — hakedis_period_lines populated by computePeriodLines; deductions computed in single Postgres query | ✓ FLOWING |
| `hakedis.ts recomputePeriodLines` | `cumulativeResult.rows` | Postgres aggregation over submissions (status='approved', Istanbul-tz cutoff) | Yes — live submission data with `AT TIME ZONE 'Europe/Istanbul'` inclusive cutoff | ✓ FLOWING |
| `hakedis.ts recomputePeriodLines` | `prevMap` | Postgres DISTINCT ON over hakedis_period_lines WHERE status!='draft' | Yes — sourced from finalized period lines only (D-99) | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles clean | `npx tsc --noEmit` | exit 0, no errors | ✓ PASS |
| hakedis.test.ts (28 tests) | `npx vitest run tests/hakedis.test.ts` | 28 passed, 0 failed, exit 0 | ✓ PASS |
| Full vitest suite (regression) | `npx vitest run` | PASS(288) FAIL(0) | ✓ PASS |
| INSERT column list excludes period_qty | grep of INSERT statement | 11 columns listed; period_qty absent | ✓ PASS |
| VALID_TRANSITIONS prevents invalid advances | grep + code read | draft→null, finalized→submitted, submitted→paid, paid→null | ✓ PASS |
| i18n key parity | node -e deep flatten check | EN=64, TR=64, 0 missing | ✓ PASS |

---

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` files found; phase plans contain no probe references. The [BLOCKING] Task 3 (migration 0008 live apply) was a human-verify checkpoint completed by the executor, verified via information_schema (confirmed in 10-01-SUMMARY.md: 4 deduction columns + period_qty is_generated=ALWAYS).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HAK-01 | 10-01, 10-02, 10-03 | Office engineer can create progress-payment periods with cutoff date | ✓ SATISFIED | createPeriod() implemented and tested; Create dialog with all configurable fields wired; period inserted with status='draft' |
| HAK-02 | 10-02, 10-04 | Yeşil-defter computation: cumulative approved qty minus previous period cumulative × locked unit-price snapshot | ✓ SATISFIED | computePeriodLines() aggregates with Istanbul-tz cutoff; DISTINCT ON previous from finalized only; INSERT writes cumulative+previous (period_qty GENERATED); detail page shows line table with all snapshot columns |
| HAK-03 | 10-02, 10-04 | Configurable KDV/tevkifat/stopaj/teminat/avans deductions → gross + net | ✓ SATISFIED | getPeriodDetail() returns full D-90 deduction chain in Postgres numeric; detail page renders 7-row summary with COALESCE on nullable rates and CASE on stopaj_enabled |
| HAK-04 | 10-02, 10-03, 10-04 | Payment status tracking: draft → submitted → paid | ✓ SATISFIED | updatePaymentStatus() with VALID_TRANSITIONS table; PeriodDetailControls renders advance buttons per status; status badge on list page |
| HAK-05 | 10-02, 10-04 | Finalized period is immutable snapshot; recompute/edit blocked | ✓ SATISFIED | finalizePeriod() sets status='finalized'; recomputePeriodLines+deletePeriod guard status!=='draft'; no un-finalize endpoint; immutability banner on detail; controls removed (not disabled) for non-draft |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

Scanned: hakedis.ts, hakedis/page.tsx, hakedis/[periodId]/page.tsx, HakedisCreateDialog.tsx, HakedisStatusBadge.tsx, DeletePeriodDialog.tsx, FinalizeDialog.tsx, PeriodDetailControls.tsx

No TBD, FIXME, XXX, placeholder, coming soon, or return null/stub patterns found in phase 10 deliverables.

WR-03 DONE (noted in hakedis-period-lines.ts line 32) — this is a resolved marker documenting a previously deferred item that was completed in this phase. Not a blocker.
WR-05 (hakedis-period-lines.ts line 10) — documents an existing CHECK constraint from migration 0006; informational comment only, not a deferred action item.

---

### Human Verification Required

All code truths pass automated verification. The following items require browser/UX confirmation:

#### 1. Deduction Summary Locale Rendering

**Test:** Create a draft period → open detail page in TR locale. Verify the deduction summary card renders all 7 rows (gross → KDV → KDV tevkifat → stopaj → teminat → avans → net) with values to exactly 2 decimal places using Turkish number formatting (e.g., 1.234,56 TRY).
**Expected:** All 7 rows visible; Net Ödeme is visually larger (text-2xl); stopaj row absent when stopajEnabled=false; values show comma as decimal separator in TR locale
**Why human:** Locale-aware Decimal.js rendering and visual prominence of Net Ödeme row requires a running browser; also confirms Postgres numeric → Decimal.js → toFixed(2) → toLocaleString('tr-TR') chain works end-to-end

#### 2. Locale Toggle on Hakkediş Surfaces

**Test:** Switch dashboard locale from TR to EN and back while on the period list and period detail pages.
**Expected:** All labels, column headers, status badge strings (Taslak/Draft, Kesinleştirildi/Finalized, etc.), button text, and deduction row labels switch language; no missing-key placeholders (should not see raw key strings like "detail.row_net")
**Why human:** next-intl locale switching and runtime string rendering cannot be verified statically; the 64-key parity check confirms keys exist but not that they render correctly in the browser

#### 3. Finalization Immutability UX

**Test:** Finalize a draft period (Kesinleştir → confirm dialog → router.refresh). Verify the detail page after finalization.
**Expected:** Lock icon + finalized_notice banner appears. Recompute, Finalize, and Delete buttons are completely gone from the DOM (not disabled — D-96 removal not disabling). Only Tahakkuk Et button appears.
**Why human:** Conditional rendering removal (status === 'draft' block) must be confirmed in a running browser; grep confirms the code structure is correct but not that React renders it as expected end-to-end

#### 4. Draft-Only Sil Affordance on List Page

**Test:** Have at least one draft and one finalized period visible on the list page. Inspect each row's Actions column.
**Expected:** Draft row: "Aç" link + "Sil" trigger button both visible. Non-draft row: only "Aç" link, zero Sil triggers in the DOM
**Why human:** Conditional rendering of DeletePeriodDialog requires browser verification to confirm the button is absent from the DOM, not merely hidden

#### 5. Payment Status Advancement UX

**Test:** Advance a finalized period: Tahakkuk Et (finalized → submitted), then Ödendi (submitted → paid). Check status badge updates on both list and detail pages.
**Expected:** Status badge on both list and detail pages reflects each transition. After reaching paid status, no further controls appear on the detail page.
**Why human:** updatePaymentStatus server round-trips, revalidatePath, and status badge re-render must be verified in a running browser to confirm the full loop

---

### Gaps Summary

No gaps. All 13 code truths verified. Phase 10 goal is achieved at the code level:

- The yeşil-defter cumulative model is fully implemented (computePeriodLines with Istanbul-tz cutoff and finalized-only chaining)
- All 4 deduction columns (D-91) and the GENERATED period_qty column (D-104) are in schema and migration
- The 7-function hakedis.ts module is auth-guarded, tenant-scoped, and money-math compliant
- The period list and detail pages are wired to real data queries
- Finalization is irreversible with server-side enforcement
- 28 integration tests pass; full suite: 288 pass, 0 fail

Status is `human_needed` because 5 browser/UX behaviors require a running dashboard to confirm.

---

_Verified: 2026-05-28T13:10:00Z_
_Verifier: Claude (gsd-verifier)_
