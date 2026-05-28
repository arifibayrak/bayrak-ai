---
phase: "10"
plan: "03"
subsystem: hakedis-billing-ui
tags: [hakedis, billing, ui, list, dialog, badge, i18n, wave-3]
dependency_graph:
  requires:
    - "10-01 (schema + Switch component + i18n namespace)"
    - "10-02 (server actions: createPeriod, getPeriodsByProject, deletePeriod)"
  provides:
    - "HakedisStatusBadge (reusable by list + detail)"
    - "HakedisCreateDialog (Create Period form, HAK-01)"
    - "DeletePeriodDialog (Sil affordance, reused by Wave 4 detail page)"
    - "/dashboard/hakedis period list page (replaces Phase 8 stub)"
  affects:
    - "src/app/dashboard/(admin)/hakedis/page.tsx (stub replaced)"
tech_stack:
  added: []
  patterns:
    - "Client dialog calling server action + router.push (createPeriod → detail navigate)"
    - "% to fraction conversion: pctToFraction(x) = (x/100).toFixed(4)"
    - "Draft-only affordance: period.status === 'draft' guard (controls absent, not disabled)"
    - "Suspense wrapping useSearchParams client in RSC page (CSR bailout prevention)"
key_files:
  created:
    - src/components/admin/HakedisStatusBadge.tsx
    - src/components/admin/HakedisCreateDialog.tsx
    - src/components/admin/DeletePeriodDialog.tsx
    - src/components/admin/HakedisProjectFilter.tsx
  modified:
    - src/app/dashboard/(admin)/hakedis/page.tsx
decisions:
  - "HakedisStatusBadge marked 'use client' to allow reuse from both RSC pages and client dialogs (useTranslations works in both)"
  - "HakedisProjectFilter extracted as separate client component (not inlined in RSC) to keep the Suspense boundary clean"
  - "pctToFraction uses parseFloat + toFixed(4) — simple string math, not Decimal (rates are not money, only display conversion)"
  - "Dialog onOpenChange resets form state on close (Discard and X-button both trigger reset)"
metrics:
  duration: "9 minutes"
  completed_date: "2026-05-28"
  tasks_completed: 2
  files_created: 4
  files_modified: 1
---

# Phase 10 Plan 03: Hakkediş List Page + Create/Delete Dialogs Summary

**One-liner:** Replaced Phase 8 stub with full period list page — project filter, status badges (amber/blue/violet/emerald), net payable table, draft-only Sil affordance, Create Period dialog (D-92 defaults + stopaj Switch D-93), and reusable DeletePeriodDialog.

---

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | HakedisStatusBadge + HakedisCreateDialog + DeletePeriodDialog | 4b59fe5 | 3 new |
| 2 | Period list page (replaces stub) + HakedisProjectFilter | 9fc3656 | 1 new + 1 replaced |

---

## Artifacts Produced

### src/components/admin/HakedisStatusBadge.tsx
- Props: `{ status: 'draft' | 'finalized' | 'submitted' | 'paid' }`
- Renders shadcn `<Badge variant="secondary">` with UI-SPEC color map
- `aria-label="Status: {label}"` per accessibility contract
- All four status classes: `text-amber-600 bg-amber-50`, `text-blue-700 bg-blue-50`, `text-violet-700 bg-violet-50`, `text-emerald-700 bg-emerald-50`

### src/components/admin/HakedisCreateDialog.tsx
- D-92 defaults: KDV 20%, tevkifat 40%, teminat 5%, avans 0% (all editable)
- D-93: stopaj `<Switch>` toggle (off by default); rate input (2%) appears only when enabled
- `pctToFraction()` converts % to 0-1 fraction strings (e.g. "20" → "0.2000") before calling `createPeriod`
- On `{ ok: true }` → `router.push('/dashboard/hakedis/${periodId}')`
- Dismiss: "Vazgeç/Discard" ghost (closes + resets); Confirm: "Oluştur ve Hesapla/Create & Compute" primary
- Error state: `<Alert variant="destructive">` for validation and general errors

### src/components/admin/DeletePeriodDialog.tsx
- Reusable — consumed by list page (Wave 3) and detail page (Wave 4 PeriodDetailControls)
- Trigger: `<Button variant="destructive" size="sm">` with `aria-label="Delete period {periodNumber}"`
- Dialog: `<DialogTitle>` + `<DialogDescription>` always present (a11y)
- Footer: "Hayır, Koru/No, Keep It" ghost + "Evet, Sil/Yes, Delete" destructive
- On confirm: `deletePeriod(periodId)` → `router.refresh()` (list page re-fetches)

### src/app/dashboard/(admin)/hakedis/page.tsx
- Replaces Phase 8 stub (removed `dashboard.admin.stubs` import)
- `export const dynamic = 'force-dynamic'` retained
- First statement: `const session = await auth(); if (!session) redirect('/auth/signin');` (T-10-03-EoP)
- Project filter Select (HakedisProjectFilter) wrapped in `<Suspense>` (CSR bailout)
- Table columns: Dönem (links to detail), Bitiş Tarihi (dd.MM.yyyy), Para Birimi, Durum, Net Ödeme, Actions
- Actions column: "Aç / Open Period" link on every row; `<DeletePeriodDialog>` ONLY inside `period.status === 'draft'` conditional (D-97)
- Net payable: `tabular-nums text-right`; renders "—" when `netByDisplay === null`
- Empty state: `<FileX>` icon + i18n `empty_heading` / `empty_body`

---

## Deviations from Plan

**None for Task 1 or Task 2.** Plan executed as written.

**Pre-existing build blocker (out of scope, not introduced by this plan):**
`src/actions/analytics.ts` has non-async exported functions (`getWorkerSortFn`, `getAuditorSortFn`, `addWorkerRanks`, `addAuditorRanks`) inside a `'use server'` file. The Next.js build emits: "Server Actions must be async functions." This error was present before this plan (Phase 9 Phase 02 committed these functions; they are pure sort helpers exported from a `'use server'` file). The hakedis route itself has no build errors — the failure comes from `analytics.ts` being imported by `records/page.tsx`.

This is logged in deferred-items.md scope for a future fix. The hakedis route `tsc --noEmit` passes cleanly.

---

## Threat Model Compliance

| Threat | Mitigation Status |
|--------|------------------|
| T-10-03-EoP (list page auth) | auth() redirect as first statement — confirmed |
| T-10-03-IDOR (?project param) | getPeriodsByProject tenant-scoped — confirmed (Wave 2) |
| T-10-03-IV (rate inputs) | createPeriod Zod-validates fractions server-side; client % conversion is UX only — confirmed |
| T-10-03-DEL (delete non-draft) | UI gates Sil to status==='draft'; deletePeriod throws server-side — confirmed |
| T-10-03-XSS (label render) | React auto-escapes; no dangerouslySetInnerHTML — confirmed |

---

## i18n Parity

All labels consumed from `dashboard.admin.hakedis.*` namespace established in Wave 1 (10-01). No new keys were needed — Wave 1 pre-populated: `heading`, `subtitle`, `empty_heading`, `empty_body`, `col_*`, `create_cta`, `open_link`, `delete_link`, `status_*`, `form.*`, `delete_dialog.*`. Both `messages/en.json` and `messages/tr.json` are in parity.

---

## Known Stubs

None. The list page renders real data from `getPeriodsByProject`. The empty state ("—" for net payable) reflects a legitimate DB null (no computed lines), not a stub.

---

## Self-Check: PASSED

- [x] `src/components/admin/HakedisStatusBadge.tsx` exists
- [x] `src/components/admin/HakedisCreateDialog.tsx` exists
- [x] `src/components/admin/DeletePeriodDialog.tsx` exists
- [x] `src/components/admin/HakedisProjectFilter.tsx` exists
- [x] `src/app/dashboard/(admin)/hakedis/page.tsx` replaced stub
- [x] Commit 4b59fe5 exists (Task 1)
- [x] Commit 9fc3656 exists (Task 2)
- [x] `tsc --noEmit` passes (clean output)
- [x] `next build` fails on pre-existing analytics.ts issue (not hakedis)
