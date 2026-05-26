---
phase: 07-data-foundation-canonical-record
reviewed: 2026-05-26T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/actions/analytics.ts
  - src/actions/boq.ts
  - src/actions/projects.ts
  - src/actions/people.ts
  - src/actions/routes.ts
  - src/components/dashboard/BoqItemDialog.tsx
  - src/components/dashboard/BoqTable.tsx
  - src/lib/boq-value.ts
  - src/lib/log-office-activity.ts
  - src/db/migrations/0006_v2_period_qty_check.sql
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: resolved
resolution: "No critical/blocker (criticals fixed in passes 1-2). Both iteration-3 warnings fixed post-review: setUnitPrice now validates via decimal.js bounded to the numeric(15,4) range (rejects 1e308-class overflow); removeAssignment audit log gated on a matched row. 2 info items accepted as non-blocking (display-only parseFloat in BoqTable; two-step add-then-price UX). tsc clean; 216/216 tests green."
---

# Phase 07: Code Review Report (Iteration 3 — Final)

**Reviewed:** 2026-05-26
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Third-pass re-review after two rounds of fixes. The second fix pass addressed: CR-01 project tenant-ownership checks in `addBoqItem`/`confirmBoqImport`, WR-01 audit-log gate on `updateProject`/`deleteProject`, WR-02 portfolio EV sourced from approved submissions (not `boq_items.approved_qty`), IN-02 string `plannedQty` contract, and IN-01 currency error redaction. All of those fixes are present and correct. No CRITICAL/BLOCKER issues remain.

Two warnings remain: one is a surviving false-positive-emitting audit log path in `removeAssignment` — the same class of defect fixed in `updateProject`/`deleteProject` but not applied there — and one is a `parseFloat` still used in `setUnitPrice` unit-price validation, inconsistent with the `decimal.js` rule and capable of passing `Infinity` through to the DB layer. Two info items cover display-only `parseFloat` usage in `BoqTable` (no financial write, acceptable) and a UX gap in the add-mode error path of `BoqItemDialog`.

---

## First-Pass Fix Verification

| Finding ID | Description | Status |
|------------|-------------|--------|
| CR-01 (analytics) | BAC from `boq_items` directly; separate `Promise.all` query | VERIFIED |
| CR-01 (boq.ts) | Tenant ownership check in `addBoqItem` / `confirmBoqImport` | VERIFIED |
| CR-02 | Portfolio CTEs (`boq_agg`, `ev_agg`, `val_agg`, `sub_agg`) — no fan-out | VERIFIED |
| CR-03 | Parameterized SQL in all analytics filter paths | VERIFIED |
| CR-04 | `logOfficeActivity` guarded by `session.user?.id` at all call sites | VERIFIED |
| CR-05 | Currency allow-list (`ALLOWED_CURRENCIES.includes()`) before DB write | VERIFIED |
| IN-01 | Currency error redaction (generic message, raw input not echoed) | VERIFIED |
| WR-01 | Audit log gated on matched row in `updateProject` / `deleteProject` | VERIFIED |
| WR-02 | Portfolio EV from approved submissions (not `approved_qty`) | VERIFIED |
| IN-02 | `plannedQty` string contract — dialog sends string, server validates with `decimal.js` | VERIFIED |

---

## Warnings

### WR-01: `removeAssignment` Emits False Audit Log Entry on Cross-Tenant Probe

**File:** `src/actions/people.ts:232`
**Issue:** The `SELECT` before the `DELETE` is correctly tenant-scoped and returns `undefined` when `assignmentId` belongs to a different tenant. The `DELETE` is also tenant-scoped and is a silent no-op in that case. However, the `logOfficeActivity` call at line 232 fires unconditionally whenever `session.user?.id` is truthy — it is NOT gated on `assignmentRow` being defined. A cross-tenant probe with a valid UUID from another tenant therefore emits a `person_unassigned` audit entry with `entityId: undefined` and `projectId: undefined`, asserting that an action succeeded when nothing was actually deleted. This is the same defect fixed in `updateProject`/`deleteProject` (iteration-1 WR-01) but was not applied to `removeAssignment`.

**Fix:**
```typescript
// Gate on assignmentRow — mirrors the deleteProject pattern
if (assignmentRow && session.user?.id) {
  logOfficeActivity({
    actorUserId: session.user.id,
    actionType: 'person_unassigned',
    entityType: 'person',
    entityId: assignmentRow.personId,
    projectId: assignmentRow.projectId,
    metadata: { assignmentId },
  });
}
```

### WR-02: `setUnitPrice` Uses `parseFloat` for Unit Price Validation

**File:** `src/actions/boq.ts:273`
**Issue:** The project rule is "never `parseFloat` on numeric strings in the financial path." The `normalizePositiveQty` helper and `IN-02` fix both follow this rule using `decimal.js`. `setUnitPrice` was not updated and still uses `parseFloat(params.unitPrice)` at line 273 for its non-negative check. Two concrete failure modes:

1. A string like `"1e308"` evaluates to `Infinity` via `parseFloat`. The check `!isNaN(Infinity) && Infinity >= 0` is `true`, so validation passes. The raw string `"1e308"` then reaches the `db.update` and PostgreSQL will raise an error (numeric overflow). There is no `try/catch` around the `db.update` at line 292, so the unhandled DB error surfaces as an unhandled promise rejection in the Server Action, leaking a stack trace.

2. Precision: for very high-precision prices, the validation is made on a lossy float approximation rather than the actual string being stored, which is inconsistent with the established `decimal.js` standard.

**Fix:**
```typescript
import Decimal from 'decimal.js';

if (params.unitPrice !== null) {
  let d: Decimal;
  try {
    d = new Decimal(params.unitPrice);
  } catch {
    return { ok: false as const, error: 'Unit price must be a non-negative number' };
  }
  if (!d.isFinite() || d.lt(0)) {
    return { ok: false as const, error: 'Unit price must be a non-negative number' };
  }
}
```

---

## Info

### IN-01: `BoqTable.tsx` Uses `parseFloat` on Display Path

**File:** `src/components/dashboard/BoqTable.tsx:67,145-146`
**Issue:** `formatQty` and the per-row `planned`/`approved` variables use `parseFloat` on DB numeric strings. These are used solely for display rendering (`Intl.NumberFormat`, `completionPct`, `balanceColorClass`) and are never written back to the server. IEEE-754 loss at the display layer is harmless for 3-decimal quantities — the "no `parseFloat`" rule applies to the write/multiply path, which correctly uses `decimal.js` in `boq-value.ts`. The usage is safe.

The pattern is nonetheless inconsistent with the rest of the codebase and could mislead future contributors who do not know where the rule applies.

**Fix (optional):** Add a comment on lines 145-146 clarifying that display-only `parseFloat` is acceptable here, or use `new Decimal(value).toNumber()` to be visually consistent.

### IN-02: `BoqItemDialog` Add Mode — BOQ Item Orphaned When Price Step Fails

**File:** `src/components/dashboard/BoqItemDialog.tsx:118-128`
**Issue:** In the add flow, `addBoqItem` is called first (line 114). If it succeeds, `setUnitPriceAction` is called on the new item (line 124). If `setUnitPriceAction` fails (line 125), the function returns early with a generic `toast.error` (line 126). The dialog stays open so the user can retry — but the BOQ item has already been created in the database with no unit price. The generic error message gives no indication that the item was saved and only the price step failed. If the user closes and re-submits the whole form, a duplicate item is created.

This is a UX gap, not a data-corruption bug (the BOQ item is valid without a price). No state or financial integrity issue.

**Fix (optional):** Show a more specific error when the item was created but the price could not be set, e.g.:
```
"Item was saved. Price could not be set — edit the item to add a price."
```
Alternatively, structure the add flow so the item is created with the price in a single call to `addBoqItem` (merge the price params) to avoid the two-step partial-success state.

---

## Structural Notes

- `src/db/migrations/0006_v2_period_qty_check.sql`: Both `period_qty >= 0` and `unit_price_snapshot >= 0` CHECK constraints are correctly formed. The `--> statement-breakpoint` separator is correct Drizzle migration syntax. Safe to apply to an empty `hakedis_period_lines` table as documented. No issues.

- `src/lib/log-office-activity.ts`: The `after()` fire-and-forget pattern is correct. Errors swallowed in the `after()` callback; primary mutations are never blocked. No issues.

- `src/lib/boq-value.ts`: `lineValue` and `formatCurrency` are correct. `Number()` on an already-rounded 2dp `Decimal.toFixed(2)` string is the precise bridge to `Intl.NumberFormat`. No issues.

- `src/actions/analytics.ts` — `getPortfolioOverview` CTE: The FULL OUTER JOIN between `boq_agg` and `ev_agg` on `(project_id, currency_code)` correctly handles projects with contracted value but no approved submissions (and vice versa). `COALESCE(sa.approved_count, 0)` is correct. No issues.

---

_Reviewed: 2026-05-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
