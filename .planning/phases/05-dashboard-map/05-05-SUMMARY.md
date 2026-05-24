---
phase: 05-dashboard-map
plan: "05"
subsystem: dashboard/boq-table
tags: [dashboard, boq, progress, completion, ui, DASH-04]
dependency_graph:
  requires: [05-01]
  provides: [DASH-04-ui]
  affects: [src/components/dashboard/BoqTable.tsx]
tech_stack:
  added: []
  patterns:
    - progressColorClass helper (completion direction, mirrors balanceColorClass)
    - shadcn Progress component inline in table row
    - Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }) for % column
key_files:
  modified:
    - src/components/dashboard/BoqTable.tsx
decisions:
  - "Progress bar inserted between col_approved_qty and col_remaining in both TableHeader and TableBody — per UI-SPEC insertion point spec"
  - "progressColorClass is a pure helper: >=90 success, >0&&<=10 warning, else empty — mirrors balanceColorClass class idiom"
  - "completionPct formula: planned>0 ? Math.min((approved/planned)*100,100) : 0 — matches Plan 01 boq.test.ts assertions exactly"
  - "Intl.NumberFormat created inline per-cell (not a module-level const) to allow maximumFractionDigits:1 without shadowing trFmt (3 decimal places)"
  - "Progress value prop receives raw 0-100 number; shadcn Progress (base-ui) renders fill via --primary accent color natively"
metrics:
  duration: "5 minutes"
  completed: "2026-05-25"
  tasks: 1
  files: 1
---

# Phase 05 Plan 05: BOQ Completion Column + Progress Bar Summary

**One-liner:** Per-row % Tamamlanan column and shadcn Progress bar added inline to BoqTable (DASH-04 / D-50), capped at 100, divide-by-zero safe, i18n-driven header.

## What Was Built

Extended `src/components/dashboard/BoqTable.tsx` in place with two new columns inserted between the Approved Qty and Remaining columns:

1. **% Tamamlanan column** — renders completion percentage formatted with `Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })` plus `%`. Color-coded via `progressColorClass`: green at >=90%, amber at >0%&&<=10%, default otherwise.

2. **Progress bar column** — renders `<Progress value={completionPct} className="min-w-[80px] h-2" />` per row. The shadcn Progress component (base-ui backed) fills with `--primary` accent color automatically.

The completion formula is `planned > 0 ? Math.min((approved / planned) * 100, 100) : 0` — identical to the formula asserted in `tests/boq.test.ts` (Plan 01 extension).

A `progressColorClass(pct: number): string` helper was added next to the existing `balanceColorClass`, following the same return-Tailwind-class-string pattern.

## Verification Results

- `npx vitest run tests/boq.test.ts`: 7 pure-unit tests PASS (4 remainingBalance + 3 BOQ completion %). 6 DB-integration tests fail with `TRUNCATE` query error — pre-existing condition, no `TEST_DATABASE_URL` in this environment, unrelated to this plan.
- `npx tsc --noEmit`: exits 0
- `npx eslint src/components/dashboard/BoqTable.tsx`: no issues
- `grep "@/components/ui/progress"`: present
- `grep "col_completion_pct"`: present

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes. The plan adds a derived display column (`completionPct`) from `approvedQty/plannedQty` already auth-guarded and tenant-scoped server-side (established in Phase 1). The `planned > 0` guard and `Math.min(..., 100)` cap ensure no `NaN` / `Infinity` reaches the `<Progress value>` prop (T-05-DIV mitigated as planned).

## Known Stubs

None. Progress bar receives live data from the `approvedQty` / `plannedQty` values passed via props from `getBoqItems`. Liveness (force-dynamic + RefreshOnFocus) is wired in Plan 06 per the plan output note.

## Self-Check: PASSED

- [x] `src/components/dashboard/BoqTable.tsx` — modified and confirmed present
- [x] Commit 69b51f9 exists in git log
- [x] 7 pure unit tests pass (progress % edge cases + remainingBalance helper)
- [x] TypeScript: 0 errors
- [x] ESLint: 0 issues
