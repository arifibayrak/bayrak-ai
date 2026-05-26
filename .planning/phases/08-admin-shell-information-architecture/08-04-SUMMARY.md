---
phase: 08-admin-shell-information-architecture
plan: 04
subsystem: admin-ui
tags: [overview, kpi-cards, filter-bar, trend-charts, earned-value, recharts, url-state, currency-selector]
dependency_graph:
  requires: [08-01, 08-02, 08-03]
  provides: [FilterBar, CurrencySelector, KpiCard, TrendChartsClient, overview-page, EVTableClient]
  affects: [08-05, 08-06]
tech_stack:
  added: []
  patterns: [RSC-parallel-fetch, Suspense-CSR-bailout-guard, URL-param-filter-state, page-local-currency-state, server-props-to-client-charts]
key_files:
  created:
    - src/components/admin/FilterBar.tsx
    - src/components/admin/CurrencySelector.tsx
    - src/components/admin/KpiCard.tsx
    - src/components/admin/TrendChartsClient.tsx
    - src/app/dashboard/(admin)/overview/page.tsx
    - src/app/dashboard/(admin)/overview/EVTableClient.tsx
  modified: []
decisions:
  - FilterBar props: { projectOptions: {id,name}[]; personOptions?: {id,name}[]; showStatus?: boolean } — all options populated from server-fetched getProjects + getActivePeople
  - EVTableClient: client wrapper combining CurrencySelector + TrendChartsClient + EV table — single useState(currency) governs all three; placed in overview/EVTableClient.tsx (co-located with the page, not in components/admin/)
  - TrendChartsClient count aggregation: Throughput + Rejection Rate aggregate across all currencies per bucket (count-based, no cross-currency sum risk); EV series filters to selected currencyCode
  - EV table empty row: projects with no data in selected currency render all cells as dash without progress bar
  - No new shadcn installs needed: all components use previously installed primitives
metrics:
  duration: "5 minutes"
  completed: "2026-05-26"
  tasks_completed: 3
  tasks_blocked_at_checkpoint: 1
  files_created: 6
  files_modified: 0
---

# Phase 08 Plan 04: Overview Command Center Page Summary

Builds the Overview command-center page (`/dashboard/(admin)/overview`) and its four supporting client components — FilterBar, CurrencySelector, KpiCard, and TrendChartsClient — completing the UX-02/UX-03/UX-04 requirements.

## One-Liner

URL-param-filtered Overview page with 4 range-aware KPI cards, page-local currency selector, three Recharts trend charts, and a per-project EV table — all data server-prefetched, charts client-rendered.

## What Was Built

### Task 1 — FilterBar + CurrencySelector + KpiCard

**`src/components/admin/FilterBar.tsx`** (`'use client'`)
- Props: `{ projectOptions: {id,name}[]; personOptions?: {id,name}[]; showStatus?: boolean }`
- `useRouter` + `usePathname` + `useSearchParams` URL-state idiom (exact analog: KayitlarTabClient.tsx)
- `applyFilter(key, value)`: clones `new URLSearchParams(searchParams.toString())`, sets/deletes key, `router.push(pathname?params)`
- `clearFilters()`: `router.push(pathname)` — strips all query params
- Controls: From `<Input type="date">` (160px desktop), To `<Input type="date">`, Project `<Select>` (200px), Person `<Select>` (optional)
- Mobile: `grid grid-cols-2 gap-2`, desktop: `flex flex-wrap`
- Each input has explicit `<label>` (accessibility)
- Select uses `__all__` sentinel value to handle null-coalesce (STATE.md 01-05 note)
- MUST be wrapped in `<Suspense>` by every parent page (CSR bailout pitfall)

**`src/components/admin/CurrencySelector.tsx`** (`'use client'`)
- Props: `{ availableCurrencies: string[]; onCurrencyChange: (c: string) => void }`
- Local `useState('TRY')` — NOT a URL param (D-67)
- Ensures 'TRY' always present in currency list
- Width: 100px `<Select>`; label from `t('label')`

**`src/components/admin/KpiCard.tsx`** (server-compatible, no hooks)
- Props: `{ label, subLabel, value, icon, drillHref?, valueColor? }`
- shadcn `<Card>` with `<CardHeader>` (icon + muted label) + `<CardContent>` (stat + sub-label)
- `<dl><dt class="sr-only"><dd>` definition-list semantics (UI-SPEC accessibility)
- `drillHref` wraps stat in `<Link className="hover:underline">`
- `valueColor`: success→`text-emerald-700`, destructive→`text-destructive`, default→`text-foreground`

### Task 2 — TrendChartsClient

**`src/components/admin/TrendChartsClient.tsx`** (`'use client'`)
- Props: `{ data: TrendPoint[]; currencyCode: string }`
- Three chart components in a `grid grid-cols-1 md:grid-cols-3 gap-6` row
- **Throughput**: `approvedCount` (solid --chart-1) + `totalCount` (dashed --chart-3); count data aggregated across all currencies per bucket
- **Earned Value**: `earnedValue` for selected `currencyCode` only (--chart-2); `connectNulls={false}` preserves gaps
- **Rejection Rate**: `rejectedCount / totalCount × 100` per bucket (--chart-3); Y-axis domain 0-100
- Each uses `<ChartContainer config={...} className="h-[240px] w-full" aria-label={title}>`
- `<ChartTooltip content={<ChartTooltipContent />}>` with currency-aware EV formatter
- Empty state: 240px centered `t('chart_no_data')` block when data is empty or no EV for currency
- Recharts imports confined to this client component — zero server-component import surface
- CountBucket interface for aggregated per-bucket count data (separate from TrendPoint)

### Task 3 — Overview RSC page + EVTableClient

**`src/app/dashboard/(admin)/overview/page.tsx`** (RSC, `force-dynamic`)
- `export const dynamic = 'force-dynamic'`
- `Props { searchParams: Promise<{from?,to?,project?,person?,status?}> }` — awaited (Next.js 15)
- T-08-04-DATE: `from && !isNaN(Date.parse(from)) ? new Date(from) : undefined` — raw strings never reach SQL
- `Promise.all([getPortfolioKPIs, getPortfolioTrends, getPortfolioOverview, getProjects, getActivePeople])`
- Deduplicates `activePeople` into `personOptions` via `Map` keyed on `personId`
- Range-aware subtitle: `(from||to||project||person)` → `subtitle_filtered` else `subtitle_all_time`
- Range-aware sub-labels: date filter active → `kpi_sub_filtered` else `kpi_sub_all_time`
- `pendingDrillHref = '/dashboard/records?status=pending_audit'` — NO date params (D-66)
- Approvals/rejections drill: builds `URLSearchParams` with `status + from + to`
- People drill: builds href with `from + to` only
- `pendingColor`: `'destructive'` when `kpis.pendingBacklog > 20` else `'default'`
- `availableCurrencies`: union of all contractedValueByCurrency + earnedValueByCurrency keys + 'TRY', sorted
- FilterBar wrapped in `<Suspense>` with pulse fallback (Pitfall 3)
- All translated strings passed as props to EVTableClient (avoids duplicate getTranslations call in client)

**`src/app/dashboard/(admin)/overview/EVTableClient.tsx`** (`'use client'`, co-located)
- Client wrapper managing single `useState('TRY')` currency state shared by CurrencySelector + TrendChartsClient + EV table
- CurrencySelector right-aligned above the charts section
- EV table: per-project rows with BAC / EV in selected currency; `formatMoney()` via Intl.NumberFormat tr-TR 2dp
- `computeCompletePct(bac, ev)`: `Math.min(100, evN/bacN*100)` — null when BAC=0 or missing
- Missing-currency rows: project name linked to `/dashboard/projects/[id]`, all value cells show "—", no progress bar
- Empty state when no project has any data in selected currency: `LayoutDashboard` 48px icon + `tEmptyNoProjects`

## FilterBar Prop Shape (for plans 05/06 reuse)

```typescript
interface FilterBarProps {
  projectOptions: Array<{ id: string; name: string }>;
  personOptions?: Array<{ id: string; name: string }>;
  showStatus?: boolean;   // not yet wired — reserved for records list page
}
```

FilterBar reads current values from `useSearchParams()` directly — no `currentFilters` prop needed. Callers supply only the option lists; current selections come from the URL.

## EV Table Approach

EVTableClient is a **client wrapper** (not a full page re-fetch). It receives all data as serialized props from the RSC, then re-renders the EV table and charts when currency changes — no fetch, no router.push. This satisfies D-67 (currency not in URL) and D-68 (charts fed server-prefetched data only).

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 50a7e5e | feat | Task 1 — FilterBar + CurrencySelector + KpiCard |
| d731359 | feat | Task 2 — TrendChartsClient three Recharts line charts |
| f6209e1 | feat | Task 3 — Overview RSC page + EVTableClient |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TrendChartsClient type mismatch — ThroughputChart received CountBucket not TrendPoint**
- **Found during:** Task 2 type-check
- **Issue:** `ThroughputChart` props typed as `data: TrendPoint[]` but the component receives aggregated `countDataByBucket` (currencies collapsed, no currencyCode field)
- **Fix:** Extracted `CountBucket` interface `{ bucket, approvedCount, rejectedCount, totalCount }` and typed `ThroughputChartProps.data` as `CountBucket[]`
- **Files modified:** `src/components/admin/TrendChartsClient.tsx`
- **Commit:** d731359

### Structural Decision

**EVTableClient co-location:** Plan specified `TrendChartsClient` handles currency switching, but the overview page needs one `useState(currency)` driving both the charts AND the EV table. Created `EVTableClient.tsx` co-located with `overview/page.tsx` (not in `components/admin/`) as a thin composition wrapper. This avoids prop-drilling currency state across unrelated component boundaries and keeps the page's client surface minimal.

## Known Stubs

None — all data flows from real analytics functions. The `currencyLabel` prop passed to `EVTableClient` is an empty string (the CurrencySelector renders its own label from i18n); this is an artifact of the translation-passing pattern, not a stub.

## Threat Surface Scan

No new network endpoints introduced. The overview page is a standard Next.js RSC route protected by the existing `dashboard/layout.tsx` auth guard. All threat mitigations from the plan are implemented:

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-08-04-DATE | MITIGATED — `!isNaN(Date.parse(str))` guard in page.tsx; only `new Date(...)` objects reach analytics |
| T-08-04-ID | MITIGATED — project/person IDs flow through analytics functions as Drizzle bound params; tenant-scoped |
| T-08-04-MONEY | MITIGATED — EV displayed via `parseFloat(string)` + Intl.NumberFormat; currency selector picks one map; no cross-currency sums |

## Self-Check: PASSED
