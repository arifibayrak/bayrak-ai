---
phase: 7
plan: "07-05"
subsystem: boq-display
tags: [boq, currency, decimal-js, value-display, gap-closure]
dependency_graph:
  requires: ["07-04"]
  provides: ["COST-02-display", "SC2-gap-closure"]
  affects: ["src/components/dashboard/BoqTable.tsx", "src/lib/boq-value.ts"]
tech_stack:
  added: []
  patterns: ["decimal.js for money math at display layer", "Intl.NumberFormat tr-TR for currency formatting"]
key_files:
  created:
    - src/lib/boq-value.ts
    - tests/boq-value.test.ts
  modified:
    - src/components/dashboard/BoqTable.tsx
    - messages/tr.json
    - messages/en.json
decisions:
  - "Used decimal.js Decimal.times() for qty × unitPrice — never raw JS float multiplication"
  - "lineValue returns null (not 0) for unpriced rows; formatCurrency renders em-dash '—'"
  - "Columns inserted between approved-qty and completion-pct to preserve visual flow"
  - "getProjectMetrics NOT called — per-line value is row-local; project rollups deferred to Phase 9"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-26"
  tasks_completed: 2
  files_changed: 5
---

# Phase 7 Plan 05: BOQ per-line value display (gap closure for SC2) Summary

## One-liner

Currency-aware BAC + EV columns added to BoqTable using decimal.js per-line multiply, with em-dash placeholder for unpriced rows.

## What Was Built

### Task 1 — src/lib/boq-value.ts + tests/boq-value.test.ts (commit dbe0832)

Two pure helpers for per-line monetary value computation:

- **`lineValue(qty, unitPrice)`** — computes `new Decimal(qty).times(unitPrice).toFixed(2)` when both operands are present and numeric; returns `null` otherwise. Handles null, undefined, and non-numeric strings safely via try/catch around the Decimal constructor.
- **`formatCurrency(value, currencyCode)`** — returns the em-dash literal `'—'` when value is null; otherwise uses `Intl.NumberFormat('tr-TR', { style: 'currency', currency: code })` with a fallback to `number + code` string when an invalid ISO-4217 code is supplied.

14 tests covering: null propagation for both operands, float precision correctness (0.1 × 0.2 = 0.02), TRY + USD formatting, invalid currency fallback, and the em-dash placeholder.

### Task 2 — BoqTable.tsx + i18n keys (commit 9d66c59)

- Imported `lineValue` + `formatCurrency` from `@/lib/boq-value` at the top of BoqTable.tsx.
- In the row render loop, computed `bac = formatCurrency(lineValue(item.plannedQty, item.unitPrice), item.currencyCode)` and `ev = formatCurrency(lineValue(item.approvedQty, item.unitPrice), item.currencyCode)` as local variables — no state, no effects.
- Added two `<TableHead>` + `<TableCell>` pairs (right-aligned, tabular-nums) after the approved-qty column and before completion-pct.
- Added `col_contracted_value` ("Sözleşme Bedeli") and `col_earned_value` ("Hakediş Değeri") to `messages/tr.json`.
- Added `col_contracted_value` ("Contracted Value") and `col_earned_value` ("Earned Value") to `messages/en.json`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — both columns render live data from row fields (`plannedQty`, `approvedQty`, `unitPrice`, `currencyCode`). Rows without a unitPrice correctly show `—`.

## Threat Flags

None — display-only change. BAC/EV derive from data already visible in the same table row, same project scope. No new route handlers, no new auth paths.

## Verification

- `npx tsc --noEmit`: clean
- `npx vitest run tests/boq-value.test.ts`: 14/14 pass
- `npx vitest run` (full suite): 201 pass, 0 new failures (1 pre-existing STACK_TRACE_ERROR in telegram-audit.test.ts at line 555 — unrelated infrastructure issue present before this plan)

## Self-Check: PASSED

Files exist:
- src/lib/boq-value.ts: FOUND
- tests/boq-value.test.ts: FOUND
- src/components/dashboard/BoqTable.tsx: modified FOUND

Commits exist:
- dbe0832 (Task 1): FOUND
- 9d66c59 (Task 2): FOUND
