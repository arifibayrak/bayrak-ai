---
phase: 10
plan: "04"
subsystem: hakedis-billing
tags: [hakedis, billing, ui, detail, deduction-summary, finalize, i18n]
requirements: [HAK-02, HAK-03, HAK-04, HAK-05]

dependency_graph:
  requires: ["10-02", "10-03"]
  provides: ["10-04"]
  affects: []

tech_stack:
  added: []
  patterns:
    - "decimal.js for money display (never parseFloat)"
    - "State-gated UI: controls REMOVED not disabled for non-draft (D-96)"
    - "Force-dynamic RSC + auth() first statement pattern"
    - "Shared dialog component import (DeletePeriodDialog from Wave 3)"

key_files:
  created:
    - src/components/admin/FinalizeDialog.tsx
    - src/components/admin/PeriodDetailControls.tsx
    - src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx
  modified: []

decisions:
  - "FinalizeDialog confirm uses variant='default' (primary) not destructive — finalizing is a positive commitment per D-96 and UI-SPEC Surface 4"
  - "PeriodDetailControls imports DeletePeriodDialog from Wave 3 (not recreated) — shared per planner intent"
  - "Detail page uses getProjects() to resolve project name for header sub-label (no new action needed)"
  - "formatMoney helper uses new Decimal(str).toFixed(2) + toLocaleString with locale from getLocale() for TR/EN formatting"
  - "Net Ödeme row styled as focal point: text-2xl font-semibold tabular-nums with border-t-2 border-foreground separator"

metrics:
  duration_minutes: 18
  completed_date: "2026-05-28"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 0
---

# Phase 10 Plan 04: Period Detail Page + State-Gated Controls Summary

**One-liner:** Period detail page with D-90 7-row deduction chain (Postgres numeric via decimal.js), state-gated controls (draft=recompute/finalize/delete; finalized→submitted→paid=none), finalize confirmation dialog (primary variant, irreversible), and unpriced-item warning.

## What Was Built

### Task 1: FinalizeDialog + PeriodDetailControls

**FinalizeDialog.tsx** (`src/components/admin/FinalizeDialog.tsx`):
- `'use client'` dialog triggered by the "Kesinleştir" button in the draft control row
- `variant="default"` (primary blue) confirm button — finalizing is a positive action, NOT destructive (per UI-SPEC Surface 4)
- Both `<DialogTitle>` and `<DialogDescription>` always rendered (a11y aria-labelledby/describedby)
- Dismiss label: "Hayır, Geri Dön / No, Go Back" (ghost variant)
- Confirm: calls `finalizePeriod(periodId)` → router.refresh() on success
- Inline `<Alert variant="destructive">` on error with `t('detail.err_finalize_blocked')`

**PeriodDetailControls.tsx** (`src/components/admin/PeriodDetailControls.tsx`):
- `'use client'` component with `{ periodId, periodNumber, status }` props
- State-gated per D-96 — controls REMOVED (not disabled) when not applicable:
  - `draft`: Recompute (outline, RefreshCw icon) + `<FinalizeDialog>` + `<DeletePeriodDialog>` (imported from Wave 3)
  - `finalized`: "Tahakkuk Et / Mark Submitted" → `updatePaymentStatus(periodId, 'submitted')`
  - `submitted`: "Ödendi / Mark Paid" → `updatePaymentStatus(periodId, 'paid')`
  - `paid`: no controls rendered
- `DeletePeriodDialog` IMPORTED from `@/components/admin/DeletePeriodDialog` (Wave 3 shared) — not recreated
- All labels via `useTranslations('dashboard.admin.hakedis')`

### Task 2: Period Detail Page

**`src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx`**:
- `export const dynamic = 'force-dynamic'`
- `auth()` is the FIRST statement (T-10-04-EoP); redirects to `/auth/signin` when null
- `notFound()` when period is not found or cross-tenant (T-10-04-IDOR)
- `formatMoney()` uses `new Decimal(value).toFixed(2)` + `toLocaleString(locale)` — never parseFloat (T-10-04-FLOAT)

**Layout sections:**
- **Back link**: ChevronLeft → `/dashboard/hakedis?project={projectId}`
- **3a Header**: periodNumber (text-xl) + HakedisStatusBadge inline + "projectName · End Date: dd.MM.yyyy" muted; PeriodDetailControls top-right
- **3b Finalized banner**: shown when `status !== 'draft'` — Lock icon, role="status", compact p-3
- **3c Unpriced warning**: shown when `status === 'draft' && unpricedItems.length > 0` — amber border/bg, TriangleAlert, role="alert", link to BOQ tab
- **3e Lines table** (Card): 7 columns (Malzeme/Birim/Birim Fiyat/Önceki/Kümülatif/Dönem Miktarı/Dönem Tutarı); `periodQty===0` rows get `text-muted-foreground`; TableFooter shows gross total (colSpan=6 label + formatMoney); empty state when `lines.length===0`
- **3f Deduction summary** (Card): D-90 SC3 chain in `flex justify-between py-3 border-b` rows:
  1. Gross (full width)
  2. KDV (pl-4 indented)
  3. KDV Tevkifat (pl-4 indented, negative display)
  4. Stopaj (gated on `period.stopajEnabled`, negative)
  5. Teminat (pl-4 indented, negative)
  6. Avans Kesintisi (gated on `Number(avansKesintisiRate) > 0`, negative)
  7. **Net Ödeme** — focal point: `font-semibold text-lg border-t-2 border-foreground pt-3 mt-1`; value in `text-2xl font-semibold tabular-nums`

## Deviations from Plan

None — plan executed exactly as written.

## Auth Gates

None — all server actions were already auth-guarded from Wave 2.

## Known Stubs

None — all data flows from the Wave 2 `getPeriodDetail` server action. The deduction summary displays live Postgres-computed values. Lines table renders stored snapshot data.

## Threat Flags

No new threat surfaces introduced beyond what the plan's threat model covers (T-10-04-EoP, T-10-04-IDOR, T-10-04-IMM, T-10-04-FLOAT, T-10-04-XSS all mitigated).

## i18n Parity

All labels consumed via `getTranslations`/`useTranslations('dashboard.admin.hakedis')`. All keys were pre-seeded in Wave 1 (`detail.*`, `finalize_dialog.*`, `delete_dialog.*`). Verified present in both `messages/en.json` and `messages/tr.json`.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| FinalizeDialog.tsx | FOUND |
| PeriodDetailControls.tsx | FOUND |
| [periodId]/page.tsx | FOUND |
| 10-04-SUMMARY.md | FOUND |
| Task 1 commit 7f6108d | FOUND |
| Task 2 commit e99bfbb | FOUND |
| tsc --noEmit | CLEAN |
| next build | GREEN — /dashboard/hakedis/[periodId] route present |
