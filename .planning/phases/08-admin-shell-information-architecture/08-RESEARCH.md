# Phase 8: Admin Shell & Information Architecture - Research

**Researched:** 2026-05-26
**Domain:** Next.js App Router layout architecture, shadcn sidebar + chart components, URL-persisted filter state, cross-project Drizzle aggregation queries, next-intl i18n
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-64 — Shell coverage:** Persistent sidebar wraps ALL dashboard pages (including `/dashboard/projects/*`). Routes NOT renamed. Existing project page files NOT modified. Sidebar mounts at `dashboard/layout.tsx` level (wrapping TopNav's children). `(admin)` route group is additive-only.

**D-65 — "Active worker" definition:** Distinct workers who submitted ≥1 work log within the active filter range (Istanbul tz). With all-time default: lifetime distinct submitters.

**D-66 — Overview is fully filterable:** Global filter bar re-scopes KPI cards within selected date range. Remove hardcoded "(30 gün)" labels. "Pending backlog" = point-in-time count of `status='pending_audit'`.

**D-67 — Currency selector:** Defaults TRY; governs all money displays; state is page-local (NOT a URL param); projects with no data in selected currency show "—".

**D-68 — Trend charts:** Client components fed server-prefetched data (XTab/XTabClient split). shadcn `chart` component (Recharts-based) is the primary choice.

**D-69 — People directory:** Approved `people` only; one cross-project aggregated row per person; Workers/Auditors tabs; person in both roles appears in both tabs; `pending_people` excluded; office engineers excluded.

**D-70 — Person profile + timeline:** KPI stat cards + grouped visual activity timeline with drill-through. Worker timeline = submission history; auditor timeline = decisions where `decided_by = personId`. NOT `office_activity_log`.

**D-71 — Submission detail page:** `/dashboard/records/[id]` — full canonical record (photo/lightbox D-61, location/Google Maps link, BOQ item, quantity, status, auditor decision, rejection reason). Empty AI flags slot (Phase 6 deferred — do NOT implement).

**D-72 — All submission references link to detail page:** Including additive "Details" link on existing Kayıtlar tab rows (lightbox preserved).

**D-73 — Global filters:** date-range / project / person / status in URL query params; persisted across navigation; filter bar per-page (not shell-global); default = all time; paginated record lists.

**D-74 — `/dashboard/records` is drill-only:** No sidebar item; 6-item nav unchanged.

**D-75 — Global filters scope People directory and profiles:** Extend `getPersonMetrics` with date-range parameter.

**D-76 — Roadmap rescoped:** Phase 8 now covers UX-01, UX-02, UX-03, UX-04, UX-05, PERF-04, I18N-03. Phase 9 trimmed to PERF-01/02/05/06. Update ROADMAP.md and REQUIREMENTS.md traceability.

### Claude's Discretion

- Charting library for D-68: shadcn `chart` (Recharts-based, theme-token wired) is the recommended choice.
- Submission detail route path: `/dashboard/records/[id]` (exercised in UI-SPEC).
- Exact filter-bar component composition, chart series styling, pagination page size.
- Whether currency selector is global (one control) or per-section: keep simple, default TRY.
- next-intl key organization for `dashboard.admin.*` namespaces.

### Deferred Ideas (OUT OF SCOPE)

- PERF-01 / PERF-02 — full worker & auditor scorecard surfaces (beyond profile KPI cards) → Phase 9
- PERF-05 — leaderboard / side-by-side compare → Phase 9
- PERF-06 — SLA / performance alerts on Overview → Phase 9
- AI anomaly flags on submission detail page → Phase 6 (AI-01..AI-05); leave slot only
- Hakkediş / Exports real functionality → Phases 10 / 11 (stub pages only in Phase 8)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | Admin shell with persistent navigation (Overview · Projects · People · Analytics · Hakkediş · Exports) without breaking existing project-scoped routes | D-64 implementation via `dashboard/layout.tsx` modification; no existing files renamed |
| UX-02 | Cross-project command-center overview (portfolio KPIs, alerts, recent activity) | `getPortfolioOverview()` exists; two new query functions needed: `getPortfolioKPIs` + `getPortfolioTrends` |
| UX-03 | Global filters: date range, project, person, status — URL-persisted | RSC `searchParams` pattern (confirmed existing codebase pattern); nuqs optional add-on |
| UX-04 | Trend charts (throughput, EV over time, rejection rate) | shadcn `chart` + Recharts; XTab/XTabClient server-prefetch split (Phase 5 D-68 pattern) |
| UX-05 | Every metric drills down to filtered records; canonical submission detail page | `getCanonicalSubmissions` already exists; new `/dashboard/records` + `/dashboard/records/[id]` pages |
| PERF-04 | Per-employee profile page: metrics, activity timeline, value contribution | `getPersonMetrics()` exists; extend with `dateRange` param; new `getAuditorDecisions` query needed |
| I18N-03 | All new v2.0 dashboard surfaces localized TR/EN | `next-intl` pattern established; new `dashboard.admin.*` namespace in messages/en.json + messages/tr.json |
</phase_requirements>

---

## Summary

Phase 8 is a read-only display layer over the data foundation built in Phases 1–7. The implementation surface is large (7 new pages/routes, 1 layout modification, 1 additive component change, 2 new shadcn components, ~8 new query functions) but the technical risk is LOW because every pattern already exists in the codebase.

**Shell architecture:** The current `dashboard/layout.tsx` renders auth guard + TopNav + `<main>`. Phase 8 modifies it to wrap `SidebarProvider` around the entire body, rendering `<Sidebar>` on the left and `<SidebarInset>` for content — so every child route (including existing `/dashboard/projects/*`) inherits the sidebar with no route file changes.

**Data layer:** `getCanonicalSubmissions`, `getPersonMetrics`, `getPortfolioOverview`, and `getProjectMetrics` already exist in `src/actions/analytics.ts`. Two new aggregate functions are needed: `getPortfolioKPIs` (pending backlog, in-range approvals/rejections, active workers) and `getPortfolioTrends` (time-bucketed series for charts). `getPersonMetrics` must be extended with a `dateRange` option. A new `getAuditorDecisions` slim query replaces misuse of `office_activity_log` for auditor timelines.

**Filter state:** The codebase already uses URL `searchParams` for tab and filter state (Phase 5 D-49/D-55 pattern). Phase 8 extends this with `from`, `to`, `project`, `person`, `status` params — reading them in RSC `searchParams` and navigating via `router.push` in client components. nuqs is available as an optional add-on for type-safety but is NOT required; the existing `router.push` pattern is fully sufficient.

**Primary recommendation:** Modify `dashboard/layout.tsx` to mount `<SidebarProvider>` + `<Sidebar>`, install `npx shadcn@latest add sidebar chart`, add the two new aggregate functions, extend `getPersonMetrics` with dateRange, and build the 7 new pages following the established XTab/XTabClient server-fetch split and URL-state patterns.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sidebar layout shell | Frontend Server (SSR) | Browser/Client | `SidebarProvider` is Client component but `dashboard/layout.tsx` is an async Server Component that imports it |
| Active nav item detection | Browser/Client | — | `usePathname()` is a client-side hook; `SidebarNav` must be `'use client'` |
| Global filter bar | Browser/Client | Frontend Server (SSR) | Controls render server-side via URL params; filter input state is client-side |
| KPI cards data | API/Backend | — | `getPortfolioKPIs` Server Action; auth-guarded, tenant-scoped |
| Trend chart data | API/Backend | Browser/Client | Data fetched server-side (XTab pattern); Recharts renders client-side |
| Currency selector | Browser/Client | — | Display preference only; page-local state; not persisted in URL |
| People directory data | API/Backend | — | `getPersonMetrics` Server Action extended with dateRange |
| Activity timeline data | API/Backend | Browser/Client | Server-fetched; "load more" pagination is client-side |
| Submission detail page | API/Backend | Browser/Client | Server Component reads submission; photo lightbox is client-side Dialog |
| i18n TR/EN | Frontend Server (SSR) | Browser/Client | `getTranslations` in RSC; `useTranslations` in client components |

---

## Standard Stack

### Core (existing — verified in codebase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.5.18 | App Router, RSC, layout.tsx modification | Already installed [VERIFIED: package.json] |
| next-intl | ^4.12.0 | TR/EN localization | Already installed; `getTranslations` / `useTranslations` pattern established [VERIFIED: package.json] |
| shadcn/ui (base-nova) | CLI 4.8.x | Component library | Already initialized; `components.json` style = base-nova [VERIFIED: components.json] |
| Drizzle ORM | ^0.45.2 | Database queries via `sql` template | Already installed; analytics.ts pattern proven [VERIFIED: package.json] |
| lucide-react | ^1.16.0 | Icons (sidebar nav, KPI cards) | Already installed; used throughout codebase [VERIFIED: package.json] |
| decimal.js | ^10.6.0 | Money display formatting | Already installed; used in analytics [VERIFIED: package.json] |

### New for Phase 8 (install via shadcn CLI)

| Component | Install Command | Purpose | Why |
|-----------|----------------|---------|-----|
| shadcn sidebar | `npx shadcn@latest add sidebar` | Persistent nav shell; `SidebarProvider`, `Sidebar`, `SidebarInset`, `SidebarTrigger` | Theme-token wired to existing `--sidebar-*` CSS vars; collapsible + mobile Sheet built-in [CITED: ui.shadcn.com/docs/components/sidebar] |
| shadcn chart | `npx shadcn@latest add chart` | Trend charts; `ChartContainer`, `ChartTooltip`, `ChartTooltipContent` | Wires directly to `--chart-1..5` tokens already in globals.css; installs recharts as peer [CITED: ui.shadcn.com/docs/components/chart] |

### recharts (installed as peer by shadcn chart)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| recharts | 3.8.1 (latest) | SVG charting primitives | Installed automatically by `npx shadcn@latest add chart`; NOT installed separately [VERIFIED: npm registry] |

### URL State Management

**Recommendation: use the existing `router.push` + RSC `searchParams` pattern** — it's already established (KayitlarTabClient uses `router.push`, KayitlarTab reads `searchParams`). No additional library needed.

`nuqs` (v2.8.9) is available and legitimate [VERIFIED: npm registry, github.com/47ng/nuqs, Vercel OSS Program member] but adds a dependency and requires `NuqsAdapter` wrapping in `layout.tsx`. For Phase 8's filter params (`from`, `to`, `project`, `person`, `status`), the existing `router.push` + native `searchParams` pattern is sufficient and zero-friction. Recommend nuqs only if type-safety of param parsing becomes a maintenance concern.

### Supporting Libraries Considered and Declined

| Library | Reason Not Adding |
|---------|-------------------|
| nuqs | Existing router.push + searchParams pattern is sufficient; avoid new dependency |
| date-fns | Dates formatted with `toLocaleDateString('tr-TR')` — consistent with existing pattern |
| react-query / SWR | All Phase 8 pages are force-dynamic RSC; client-side fetching not needed |

---

## Package Legitimacy Audit

> slopcheck was unavailable at research time. Registry verification performed via `npm view`.

| Package | Registry | Age | Source Repo | npm view | Disposition |
|---------|----------|-----|-------------|----------|-------------|
| recharts | npm | 11 yrs (2015) | github.com/recharts/recharts | 3.8.1 — latest 2026-03-25 | Approved [ASSUMED] |
| nuqs | npm | ~2.5 yrs (Nov 2023) | github.com/47ng/nuqs | 2.8.9 — latest 2026-02-27; Vercel OSS | Approved (optional only) [ASSUMED] |

**Note:** recharts is installed automatically as a peer dep by `npx shadcn@latest add chart`. It does not need to be listed in package.json independently. The shadcn CLI handles the installation.

**Packages with [SLOP] verdict:** none
**Packages flagged [SUS]:** none
**slopcheck unavailable:** both packages above are tagged [ASSUMED]; treat as needing quick sanity check before install (download counts are very high for both from public knowledge).

---

## Architecture Patterns

### System Architecture Diagram

```
Browser navigation request
        │
        ▼
app/dashboard/layout.tsx  (async Server Component — auth guard)
        │  ├── auth() → redirect if no session
        │  ├── <SidebarProvider>  (Client Component wrapper — NEW Phase 8)
        │  │     ├── <Sidebar>  (Client Component — NEW Phase 8)
        │  │     │     └── <SidebarNav items=[...] />  ('use client', usePathname)
        │  │     └── <SidebarInset>
        │  │           ├── <TopNav />  (Server Component — MODIFIED: add SidebarTrigger)
        │  │           └── {children}  ← all dashboard routes render here
        │  └── (existing routes untouched: /projects, /projects/[id], etc.)
        │
        ▼
Route decisions (additive new routes):
  /dashboard              → redirect to /dashboard/overview
  /dashboard/overview     → OverviewPage (RSC, force-dynamic)
                              ├── getPortfolioKPIs(filters)      [NEW query]
                              ├── getPortfolioTrends(filters)    [NEW query]
                              ├── getPortfolioOverview()         [existing]
                              └── <TrendChartsClient data={...} />  ('use client', Recharts)
  /dashboard/people       → PeoplePage (RSC, force-dynamic)
                              └── getPersonMetrics(all, {dateRange, role})  [extended]
  /dashboard/people/[id]  → PersonProfilePage (RSC, force-dynamic)
                              ├── getPersonMetrics(id, {dateRange, asAuditor})
                              ├── getCanonicalSubmissions({personId})
                              └── getAuditorDecisions({personId})  [NEW slim query]
  /dashboard/records      → RecordsPage (RSC, force-dynamic, drill-only)
                              └── getCanonicalSubmissions(filters)  [existing + pagination]
  /dashboard/records/[id] → SubmissionDetailPage (RSC, force-dynamic)
                              └── getCanonicalSubmissions({submissionId: id})
  /dashboard/analytics    → stub page
  /dashboard/hakedis      → stub page
  /dashboard/exports      → stub page

Filter params flow:
  URL ?from=&to=&project=&person=&status=
        │
        ├── RSC page.tsx reads via searchParams prop → passes to query functions
        └── Client filter bar → router.push with updated params → RSC re-render
```

### Recommended Project Structure

```
src/app/dashboard/
  layout.tsx                     ← MODIFIED: SidebarProvider + Sidebar + SidebarInset
  page.tsx                       ← NEW: redirect('/dashboard/overview')
  (admin)/
    layout.tsx                   ← NEW: thin passthrough (no double sidebar)
    overview/page.tsx            ← NEW: filterable command center
    people/
      page.tsx                   ← NEW: cross-project people directory
      [personId]/page.tsx        ← NEW: person profile + activity timeline
    analytics/page.tsx           ← NEW: stub
    hakedis/page.tsx             ← NEW: stub
    exports/page.tsx             ← NEW: stub
  records/
    page.tsx                     ← NEW: drill-only cross-project records list
    [id]/page.tsx                ← NEW: canonical submission detail

src/components/
  admin/
    SidebarNav.tsx               ← 'use client': nav items + usePathname active detection
    FilterBar.tsx                ← 'use client': date/project/person/status inputs
    CurrencySelector.tsx         ← 'use client': TRY/USD etc. select
    KpiCard.tsx                  ← server or client: stat card with drill-down link
    TrendChartsClient.tsx        ← 'use client': Recharts LineChart wrapper
    ActivityTimeline.tsx         ← server + 'use client' for load-more
    SubmissionDetailView.tsx     ← server: dl/dt/dd layout + photo lightbox

src/actions/analytics.ts         ← MODIFIED: add getPortfolioKPIs, getPortfolioTrends,
                                    getAuditorDecisions; extend getPersonMetrics with dateRange

messages/
  en.json                        ← NEW keys: dashboard.admin.*
  tr.json                        ← NEW keys: dashboard.admin.*
```

### Pattern 1: Dashboard Layout Modification (Shell — D-64)

The current layout renders:
```
<div class="min-h-screen bg-background">
  <TopNav />
  <main class="max-w-5xl mx-auto px-6 py-8">{children}</main>
</div>
```

Phase 8 transforms it to:
```typescript
// Source: ui.shadcn.com/docs/components/sidebar
// dashboard/layout.tsx — async Server Component (auth guard preserved)
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/admin/AppSidebar';
// ...

return (
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <TopNav userEmail={userEmail} />  {/* TopNav gains <SidebarTrigger> for mobile */}
      <main className="max-w-5xl mx-auto px-6 py-8 sm:py-10">
        {children}
      </main>
    </SidebarInset>
  </SidebarProvider>
);
```

**Critical:** `SidebarProvider` is a Client Component. The async Server Component `DashboardLayout` can render it because React RSC allows server components to render client component trees. The auth guard (`await auth()`) runs server-side before the client boundary.

### Pattern 2: Active Sidebar Item Detection

```typescript
// Source: ui.shadcn.com/docs/components/sidebar + Phase 5 KayitlarTabClient pattern
// components/admin/SidebarNav.tsx
'use client';

import { usePathname } from 'next/navigation';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useTranslations } from 'next-intl';

const NAV_ITEMS = [
  { key: 'overview', href: '/dashboard/overview', icon: LayoutDashboard },
  { key: 'projects', href: '/dashboard/projects', icon: FolderOpen },
  // ...
];

export function SidebarNav() {
  const pathname = usePathname();
  const t = useTranslations('dashboard.admin.nav');

  return (
    <SidebarMenu>
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === '/dashboard/overview'
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <SidebarMenuItem key={item.key}>
            <SidebarMenuButton asChild isActive={isActive}>
              <a href={item.href} aria-current={isActive ? 'page' : undefined}>
                <item.icon />
                <span>{t(item.key)}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
```

### Pattern 3: URL-Persisted Filter State (existing RSC pattern)

Server Component page reads `searchParams`:
```typescript
// Source: existing pattern in src/app/dashboard/projects/[id]/page.tsx
// app/dashboard/overview/page.tsx
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{
    from?: string; to?: string; project?: string; person?: string; status?: string;
  }>;
}

export default async function OverviewPage({ searchParams }: Props) {
  const { from, to, project, person, status } = await searchParams;
  const filters = {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    projectIds: project ? [project] : undefined,
    personId: person,
    status: status as 'pending_audit' | 'approved' | 'rejected' | undefined,
  };
  const [kpis, trends, overview] = await Promise.all([
    getPortfolioKPIs(filters),
    getPortfolioTrends(filters),
    getPortfolioOverview(),
  ]);
  return <OverviewView kpis={kpis} trends={trends} overview={overview} filters={filters} />;
}
```

Client filter bar updates URL:
```typescript
// components/admin/FilterBar.tsx
'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

function FilterBar({ currentFilters }: { currentFilters: FilterValues }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function applyFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) { params.set(key, value); } else { params.delete(key); }
    router.push(`${pathname}?${params.toString()}`);
  }
  // ...
}
```

**Note:** `FilterBar` must be wrapped in a `<Suspense>` boundary in the parent page because `useSearchParams()` in a client component causes a CSR bailout if not wrapped. [CITED: nextjs.org/docs/app/api-reference/functions/use-search-params]

### Pattern 4: XTab/XTabClient Server-Prefetch Split (Phase 5 D-68 pattern)

```typescript
// Source: Phase 5 D-68 pattern (KayitlarTab.tsx / KayitlarTabClient.tsx)
// app/dashboard/overview/page.tsx — Server Component fetches data
const trendsData = await getPortfolioTrends(filters);

// Then passes to client component:
<TrendChartsClient data={trendsData} currencyCode={selectedCurrency} />

// components/admin/TrendChartsClient.tsx
'use client';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Area } from 'recharts';

export function TrendChartsClient({ data, currencyCode }) {
  // Recharts renders client-side; data is serialized props from server
}
```

### Pattern 5: New Portfolio KPI Query

```typescript
// New function in src/actions/analytics.ts
// Following the exact CR-03 parameterized pattern from existing queries

export async function getPortfolioKPIs(filters: {
  from?: Date; to?: Date; projectIds?: string[]; personId?: string;
}): Promise<PortfolioKPIs> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  const dateCondition = filters.from && filters.to
    ? sql` AND s.submitted_at >= ${filters.from.toISOString()} AT TIME ZONE 'UTC'
           AND s.submitted_at <  ${filters.to.toISOString()} AT TIME ZONE 'UTC'`
    : sql``;

  // Run 3 queries in parallel (split NULL decidedAt per v2.0 locked rule)
  const [countsResult, activeWorkersResult] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE s.status = 'pending_audit')  AS pending_backlog,
        COUNT(*) FILTER (WHERE s.status = 'approved' ${dateCondition})  AS approvals_in_range,
        COUNT(*) FILTER (WHERE s.status = 'rejected' ${dateCondition})  AS rejections_in_range
      FROM submissions s
      WHERE s.tenant_id = ${tenantId}
    `),
    db.execute(sql`
      SELECT COUNT(DISTINCT s.person_id) AS active_workers
      FROM submissions s
      WHERE s.tenant_id = ${tenantId}
        ${dateCondition}
    `),
  ]);
  // ...
}
```

**Note on pending backlog:** Pending backlog is always point-in-time (`status='pending_audit'` regardless of `submitted_at` range). The date condition applies ONLY to approvals and rejections counts. This matches D-66.

### Pattern 6: Trend Data Query (Date Bucketing)

```typescript
// Istanbul tz bucketing — AT TIME ZONE 'Europe/Istanbul' per v2.0 lock
// Monthly bucket: date_trunc('month', s.submitted_at AT TIME ZONE 'Europe/Istanbul')
// Weekly bucket: date_trunc('week', s.submitted_at AT TIME ZONE 'Europe/Istanbul')
// Bucket rule: ≤60 days → weekly, else → monthly (UI-SPEC)

export async function getPortfolioTrends(filters: SubmissionFilters): Promise<TrendPoint[]> {
  const bucketExpr = isWeekly(filters)
    ? sql`date_trunc('week', s.submitted_at AT TIME ZONE 'Europe/Istanbul')`
    : sql`date_trunc('month', s.submitted_at AT TIME ZONE 'Europe/Istanbul')`;

  const result = await db.execute(sql`
    SELECT
      ${bucketExpr}  AS bucket,
      b.currency_code,
      COUNT(*) FILTER (WHERE s.status = 'approved')  AS approved_count,
      COUNT(*) FILTER (WHERE s.status = 'rejected')  AS rejected_count,
      COUNT(*)                                         AS total_count,
      SUM(s.quantity::numeric * b.unit_price::numeric)
        FILTER (WHERE s.status = 'approved' AND b.unit_price IS NOT NULL) AS earned_value
    FROM submissions s
    JOIN boq_items b ON b.id = s.boq_item_id
    WHERE s.tenant_id = ${tenantId}
      ${whereClause}
    GROUP BY bucket, b.currency_code
    ORDER BY bucket ASC
  `);
  // ...
}
```

### Pattern 7: Extending getPersonMetrics with dateRange (D-75)

The existing `getPersonMetrics` accepts `{ projectIds?, asAuditor? }`. Add optional `dateRange`:

```typescript
export async function getPersonMetrics(
  personId: string,
  options?: { projectIds?: string[]; asAuditor?: boolean; dateRange?: { from: Date; to: Date } }
): Promise<PersonMetrics>
```

The `dateRange` condition is added to the WHERE clause of all three sub-queries using the same `sql` template literal CR-03 pattern used in `getProjectMetrics`.

### Pattern 8: New getAuditorDecisions Slim Query (D-70)

Auditor timeline ≠ `office_activity_log` (that's for office engineers). Auditor timeline = submissions WHERE `decided_by = personId`:

```typescript
export async function getAuditorDecisions(options: {
  personId: string;
  dateRange?: { from: Date; to: Date };
  projectIds?: string[];
  limit?: number;
  offset?: number;
}): Promise<AuditorDecision[]>
```

Queries `submissions` joined to `people` (worker name), `boq_items` (material/unit), `projects` (name) WHERE `s.decided_by = personId AND s.status IN ('approved', 'rejected')`. Returns shape similar to `CanonicalSubmission` but focused on auditor-decision fields.

### Anti-Patterns to Avoid

- **Double sidebar:** The `(admin)` route group gets a `layout.tsx` that is a thin passthrough — NO second `SidebarProvider`. The sidebar lives only in the root `dashboard/layout.tsx`.
- **Moving existing routes:** Never move `/dashboard/projects/*` files into `(admin)`. Route groups are filesystem-only; they don't change the URL. The sidebar wraps via the root layout.
- **Cross-currency sum:** Never sum EV/BAC values across currencies. The currency selector picks which `Record<string, string>` key to display.
- **money in JS floats:** Parse `unitPrice`, `quantity`, `earnedValue` strings with `new Decimal(str)` before any display formatting. Never `parseFloat()` on DB numeric strings in a loop.
- **NULL decidedAt in averages:** Always split: `AVG(latency) FILTER (WHERE decided_at IS NOT NULL)` and `COUNT(pending)` as separate operations.
- **`office_activity_log` for auditor timelines:** That table is ONLY for office-engineer actions. Auditor timelines come from `submissions WHERE decided_by = personId`.
- **`useSearchParams` without Suspense boundary:** Causes CSR bailout. Wrap `FilterBar` in `<Suspense>` in every page that uses it.
- **Static cache on financial pages:** All new pages MUST have `export const dynamic = 'force-dynamic'`.
- **Sending SidebarTrigger outside SidebarInset context:** `SidebarTrigger` must render inside the SidebarProvider tree. Place it in TopNav, which renders inside `<SidebarInset>`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sidebar with mobile sheet + collapsible | Custom drawer + resize logic | `npx shadcn@latest add sidebar` | Built-in mobile Sheet, collapsible states, keyboard navigation, ARIA |
| SVG trend charts | D3 or hand-rolled SVG | shadcn `chart` (Recharts wrapper) | Theme tokens wired, accessible, tooltip built-in, no extra config |
| URL state serialization | Custom URLSearchParams wrapper | Native `URLSearchParams` + `router.push` (or nuqs) | 2 lines; type parsers built-in or nuqs provides them |
| Decimal money formatting | `parseFloat()` + `.toFixed()` | `new Decimal(str)` + `Intl.NumberFormat('tr-TR', ...)` | Float drift on large Turkish lira amounts; already in codebase |
| Istanbul timezone date math | Custom offset calculation | `AT TIME ZONE 'Europe/Istanbul'` in Postgres | v2.0 locked rule; DST handled by PG correctly |
| Photo lightbox | Custom modal | shadcn `<Dialog>` + `next/image` | Already exists as D-61 pattern in KayitlarTabClient |

---

## Common Pitfalls

### Pitfall 1: Double Sidebar (thin layout.tsx in `(admin)` group)

**What goes wrong:** If `(admin)/layout.tsx` renders another `SidebarProvider`, pages in the admin group get two sidebars (nested providers) while projects pages get one.
**Why it happens:** Developer adds sidebar to the route group layout thinking it only affects admin routes.
**How to avoid:** `(admin)/layout.tsx` is a passthrough only — `return <>{children}</>` or simply the children prop. The root `dashboard/layout.tsx` is the only sidebar provider.
**Warning signs:** Sidebar appears twice on `/dashboard/overview`; sidebar missing on `/dashboard/projects`.

### Pitfall 2: SidebarProvider expects client context — await auth() before it

**What goes wrong:** `DashboardLayout` is an async Server Component. `SidebarProvider` is a Client Component. This is valid RSC composition. The pitfall is trying to make `SidebarProvider` async or importing it in a way that breaks the server/client boundary.
**How to avoid:** Keep `DashboardLayout` as an async function for `await auth()`. Import `SidebarProvider` from `@/components/ui/sidebar` — it will be a Client Component once the shadcn CLI installs it. RSC allows server components to pass children to client component wrappers.

### Pitfall 3: useSearchParams() without Suspense causes CSR bailout

**What goes wrong:** `FilterBar` uses `useSearchParams()`. Without a `<Suspense>` boundary around it, Next.js App Router degrades the entire page to client-side rendering.
**Why it happens:** `useSearchParams` is a dynamic hook that opts into CSR.
**How to avoid:** Wrap every `<FilterBar ... />` usage in `<Suspense fallback={<FilterBarSkeleton />}>` in the server component.

### Pitfall 4: Pending backlog includes date-filtered submissions

**What goes wrong:** Applying the date range filter to the pending-backlog count produces misleadingly low numbers ("0 pending in this week" when there are 50 pending across all time).
**Why it happens:** "Pending" is a point-in-time snapshot — records not yet acted on. It's not meaningful to scope it to a date range.
**How to avoid:** Per D-66: pending backlog = `COUNT(*) WHERE status = 'pending_audit'` with NO date condition. Only approvals and rejections counts use the date filter.

### Pitfall 5: KPI card pending backlog links to wrong status filter

**What goes wrong:** Clicking pending-backlog KPI navigates to `/dashboard/records?status=pending_audit&from=...&to=...` — including the date filter makes the drill-down list empty if pending records predate the filter range.
**How to avoid:** Per D-73 + UI-SPEC: pending backlog drill-down = `/dashboard/records?status=pending_audit` (no date filter). Approvals/rejections drill-downs include `&from=...&to=...`.

### Pitfall 6: getPersonMetrics called without dateRange returns cross-time metrics that don't match filter bar

**What goes wrong:** People directory shows all-time metrics even when a date filter is active.
**Why it happens:** Existing `getPersonMetrics` has no `dateRange` param.
**How to avoid:** Per D-75, extend `getPersonMetrics` with `dateRange` option before building the People directory. Pass the URL filter params through.

### Pitfall 7: Auditor timeline uses office_activity_log

**What goes wrong:** `office_activity_log` only tracks office-engineer UI actions (project create, BOQ edit, etc.) — not Telegram auditor decisions.
**Why it happens:** Developer conflates the two activity sources.
**How to avoid:** Auditor timeline = query `submissions WHERE decided_by = personId`. Worker timeline = `submissions WHERE person_id = personId`.

### Pitfall 8: recharts bundle size on server-rendered pages

**What goes wrong:** recharts is a large client bundle. If imported in a Server Component accidentally, it bloats the RSC payload.
**How to avoid:** All chart components MUST be `'use client'`. Server Components pass pre-fetched data as serialized props. The XTab/XTabClient split pattern already established in Phase 5 is the correct approach.

### Pitfall 9: `SidebarTrigger` mobile hamburger position

**What goes wrong:** `SidebarTrigger` renders outside `SidebarProvider` context and crashes or renders without functionality.
**Why it happens:** TopNav renders before the provider in the old layout structure.
**How to avoid:** With the new layout, TopNav renders inside `<SidebarInset>`, which is inside `<SidebarProvider>`. `SidebarTrigger` must be rendered in TopNav AFTER the layout change, not before.

---

## Code Examples

### Sidebar installation and shell structure

```typescript
// Install: npx shadcn@latest add sidebar
// Creates src/components/ui/sidebar.tsx with SidebarProvider, Sidebar, SidebarInset, etc.

// dashboard/layout.tsx (modified)
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/admin/AppSidebar';
import { TopNav } from '@/components/layout/TopNav';

export default async function DashboardLayout({ children }) {
  const session = await auth();
  if (!session) redirect('/auth/signin');
  const userEmail = session.user?.email ?? '';

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <TopNav userEmail={userEmail} />
        <main className="max-w-5xl mx-auto px-6 py-8 sm:py-10">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

### Chart component usage

```typescript
// Install: npx shadcn@latest add chart
// Creates src/components/ui/chart.tsx (wraps Recharts with theme tokens)

// components/admin/TrendChartsClient.tsx
'use client';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

const chartConfig = {
  approved: { label: 'Approvals', color: 'var(--chart-1)' },
  rejected: { label: 'Rejections', color: 'var(--chart-3)' },
};

export function ThroughputChart({ data }: { data: TrendPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-[240px]" aria-label="Throughput trend chart">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="bucket" />
        <YAxis />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line type="monotone" dataKey="approved_count" stroke="var(--chart-1)" />
      </LineChart>
    </ChartContainer>
  );
}
```

### Filter propagation on navigation links

```typescript
// Propagate current filters to detail links — do NOT propagate sidebar nav links
// In RecordsPage (RSC):
const currentParams = new URLSearchParams({ from, to, project, person, status }
  .filter(([, v]) => v != null));

// Row detail link:
<Link href={`/dashboard/records/${row.id}?${currentParams}`}>Details</Link>

// Back link on detail page:
<Link href={`/dashboard/records?${backParams}`}>← Records</Link>
```

### Kayıtlar tab additive Details link (D-72)

```typescript
// KayitlarTabClient.tsx — add ONE new column after existing columns
// New table header:
<TableHead scope="col" className="w-20 sr-only">{t('details_header')}</TableHead>

// New table cell in each row:
<TableCell>
  <Button variant="ghost" size="sm" asChild>
    <Link href={`/dashboard/records/${row.id}`}>
      {t('details_link')}
    </Link>
  </Button>
</TableCell>
// Existing photo lightbox onClick is UNCHANGED
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `(admin)` route group provides sidebar (v1 UI-SPEC assumption) | Root `dashboard/layout.tsx` provides sidebar (D-64) | Phase 8 context discussion | No existing routes moved; all pages inherit sidebar |
| Fixed "(30 gün)" KPI labels | Range-aware labels ("Tüm Zamanlarda" / "Seçili Dönemde") (D-66) | Phase 8 context discussion | KPI context matches active filter |
| Per-currency EV breakout on Overview | Currency selector picks one currency to display (D-67) | Phase 8 context discussion | Simpler UI; no cross-currency sum |
| Next.js 15 `searchParams` as `Record<string, string>` | Next.js 15 `searchParams` as `Promise<...>` (async) | Next.js 15 release | Must `await searchParams` in page components |
| Phase 5 `useRouter` + URL state for single param | Same `useRouter` + `URLSearchParams` for multi-param filter bar | Phase 8 | No new library needed |

**Deprecated/outdated:**
- `pages` router `useRouter` from `next/router`: never use — this is App Router. Use `next/navigation`.
- Direct recharts import without shadcn chart wrapper: don't do this; theme tokens won't wire correctly.

---

## Open Questions

1. **TopNav layout width after sidebar**
   - What we know: current TopNav is `max-w-5xl mx-auto` inside `<header>`. `<SidebarInset>` changes the layout so the header inside SidebarInset spans the full `SidebarInset` width minus sidebar.
   - What's unclear: should the TopNav `max-w-5xl` constraint be kept (so it matches the content width) or should the header go full-width like typical admin UIs?
   - Recommendation: match the UI-SPEC — TopNav renders inside SidebarInset header slot full-width; remove `max-w-5xl` from the header itself, keep it only on `<main>`. This is the standard shadcn sidebar pattern.

2. **`(admin)/layout.tsx` necessity**
   - What we know: Route groups don't affect URLs. `(admin)/layout.tsx` is optional.
   - What's unclear: Is there any shared metadata or loading state needed for admin pages only?
   - Recommendation: Create a minimal `(admin)/layout.tsx` that is just `({ children }) => <>{children}</>` — it makes the route grouping explicit and leaves room for future shared metadata without adding any sidebar complexity.

3. **`getPersonMetrics` called per person vs all persons for directory**
   - What we know: `getPersonMetrics` takes a single `personId`. The People directory needs metrics for ALL approved people.
   - What's unclear: Whether to call it N times in `Promise.all` or write a new bulk query.
   - Recommendation: Write a new `getPortfolioPeople` query that aggregates all approved people in one SQL (similar to how `getPortfolioOverview` returns all projects in one query). Calling `getPersonMetrics` N times would be N+1 style. The planner should specify this as a new bulk aggregation function.

4. **Pagination on `/dashboard/records` — LIMIT/OFFSET vs cursor**
   - What we know: UI-SPEC says 25 rows/page, prev/next buttons. `getCanonicalSubmissions` has no built-in pagination.
   - What's unclear: Whether to add LIMIT/OFFSET to `getCanonicalSubmissions` or a separate paginated variant.
   - Recommendation: Add `limit` and `offset` optional params to `getCanonicalSubmissions` for the records list. The existing function works for single-record lookups and timeline fetches without limit.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js runtime | ✓ | (Vercel managed) | — |
| npm / shadcn CLI | `npx shadcn@latest add sidebar chart` | ✓ | shadcn@4.8.x | — |
| Neon PostgreSQL | Drizzle queries | ✓ | 16 (Neon managed) | — |
| Vercel Blob | Photo display in detail page | ✓ | Already configured in next.config.ts remotePatterns | — |
| Mapbox / react-map-gl | Submission detail location display | ✓ | Already installed | Google Maps link is the primary; map is not required on detail page |

**No blocking missing dependencies.** The detail page shows location as a Google Maps link (already established pattern in KayitlarTabClient). A Mapbox map is not needed on the detail page per the UI-SPEC.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.x |
| Config file | vitest.config.ts (root) |
| Quick run command | `npx vitest run tests/analytics.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-01 | Sidebar renders on all dashboard routes; /dashboard redirects to /dashboard/overview | smoke / manual | manual browser check | ❌ Wave 0 (no E2E framework) |
| UX-02 | `getPortfolioKPIs` returns correct counts | integration | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 — new test block needed |
| UX-03 | Filter params scope query results | integration | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 — test `getCanonicalSubmissions` with filters |
| UX-04 | `getPortfolioTrends` returns correct bucketed data | integration | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |
| UX-05 | `getCanonicalSubmissions({ submissionId })` returns one record | integration | `npx vitest run tests/analytics.test.ts` | ✅ existing `getCanonicalSubmissions` tests cover filters; single-record variant needs a test |
| PERF-04 | `getPersonMetrics` with dateRange scopes correctly | integration | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 — existing tests don't cover dateRange param |
| I18N-03 | New `dashboard.admin.*` keys exist in both message files | unit | `npx vitest run tests/i18n.test.ts` | ❌ Wave 0 — i18n.test.ts needs new key assertions |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/analytics.test.ts` (data layer tasks)
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/analytics.test.ts` — new `describe` blocks for `getPortfolioKPIs`, `getPortfolioTrends`, `getAuditorDecisions`, and `getPersonMetrics` with `dateRange`
- [ ] `tests/i18n.test.ts` — add assertions for `dashboard.admin.*` namespace keys in en.json and tr.json

*(Existing `tests/analytics.test.ts` covers `getCanonicalSubmissions`, `getProjectMetrics`, `getPersonMetrics`, and `getPortfolioOverview` — those tests stay GREEN and are extended, not replaced.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `auth()` guard at top of every new Server Action; already in all analytics.ts functions |
| V3 Session Management | yes (inherited) | Auth.js session; no new session code |
| V4 Access Control | yes | Tenant-scoped queries (`WHERE tenant_id = ${tenantId}`); people directory shows only approved people (not pending_people) |
| V5 Input Validation | yes | URL params sanitized before use in queries; invalid dates → undefined; UUIDs validated by Postgres column type |
| V6 Cryptography | no new keys | No new secrets; Vercel Blob URLs already in remotePatterns |

### Known Threat Patterns for this Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed date strings in `?from=` / `?to=` params | Tampering | `new Date(str)` validation; if `isNaN`, treat as undefined; never pass raw string to SQL |
| Cross-tenant data leak via filter params | Information Disclosure | Every query includes `WHERE tenant_id = ${tenantId}` (established pattern T-07-06) |
| SQL injection via project/person UUID params | Tampering | Drizzle `sql` template literals bind all values as parameters (CR-03) |
| XSS via submission rejection_reason display | Tampering | React JSX auto-escapes; never use `dangerouslySetInnerHTML` |
| Open redirect via `?from=` URL param | Elevation of Privilege | Params are date strings / UUIDs, not redirect targets; no redirect built on them |
| Photo SSRF via Blob URL | Elevation of Privilege | `next/image` remotePatterns already locked to `*.public.blob.vercel-storage.com` |

---

## Project Constraints (from CLAUDE.md)

| Directive | Research Impact |
|-----------|----------------|
| Next.js App Router monolith, single deploy on Vercel | All new pages are Next.js App Router RSC + route handlers; no separate service |
| Drizzle ORM — no Prisma | All queries use Drizzle `sql` template literals (confirmed: existing analytics.ts pattern) |
| shadcn/ui base-nova preset | Components installed via `npx shadcn@latest add` only; no third-party shadcn registries |
| next-intl 4.x | `getTranslations` in RSC, `useTranslations` in client; `dashboard.admin.*` new namespace |
| `force-dynamic` on all analytics/financial pages | `export const dynamic = 'force-dynamic'` on every new page.tsx |
| Money math in Postgres / decimal.js | `SUM(qty::numeric * price::numeric)` in SQL; `new Decimal(str)` for JS display |
| Istanbul tz for date boundaries | `AT TIME ZONE 'Europe/Istanbul'` in all date-bucketing SQL |
| `(admin)` route group additive only — no existing routes moved | Sidebar mounts at root `dashboard/layout.tsx`; no file renames |
| NULL `decidedAt` split-query rule | Separate COUNT for pending vs AVG for latency; never mixed |
| Role on assignments, not people | `getPersonMetrics` joins `assignments` for auditor role detection |
| vitest + fileParallelism: false | New test blocks in `tests/analytics.test.ts`; DB tests sequential |
| `drizzle-kit push` unusable (D-49) | No schema changes in Phase 8 — data layer changes are code only (new query functions); no migrations needed |

---

## Sources

### Primary (HIGH confidence)
- `src/actions/analytics.ts` — verified existing query functions, types, patterns
- `src/app/dashboard/layout.tsx` — verified exact current structure to modify
- `src/components/dashboard/KayitlarTabClient.tsx` — verified URL state + lightbox pattern (D-61)
- `src/app/globals.css` — verified `--sidebar-*` and `--chart-*` tokens already defined (lines 18-26, 86-93)
- `components.json` — verified `style: base-nova`, `registries: {}`, `iconLibrary: lucide`
- `package.json` — verified all existing dependency versions
- `.planning/phases/08-admin-shell-information-architecture/08-CONTEXT.md` — locked decisions D-64..D-76
- `.planning/phases/08-admin-shell-information-architecture/08-UI-SPEC.md` — UI design contract

### Secondary (MEDIUM confidence)
- [CITED: ui.shadcn.com/docs/components/sidebar] — SidebarProvider, SidebarInset, SidebarTrigger exports; CSS variable names; Next.js layout pattern
- [CITED: ui.shadcn.com/docs/components/chart] — ChartContainer, ChartTooltip exports; recharts peer dep; CSS variable wiring

### Tertiary (LOW confidence)
- npm registry `npm view recharts version` → 3.8.1 [ASSUMED — slopcheck unavailable]
- npm registry `npm view nuqs version` → 2.8.9 [ASSUMED — slopcheck unavailable]
- github.com/47ng/nuqs — Vercel OSS Program, 10.5k stars [ASSUMED confirmation of legitimacy]
- nuqs.dev/docs/adapters — NuqsAdapter import path for Next.js App Router [ASSUMED — page 404'd; fallback from adapters page]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `recharts` 3.8.1 is the version installed by `npx shadcn@latest add chart` | Standard Stack | Different version may have API differences; low risk — recharts API stable across 3.x |
| A2 | `nuqs` 2.8.9 is the current stable version; NuqsAdapter required for Next.js App Router | Standard Stack | Not blocking — nuqs is optional; existing router.push pattern is the primary recommendation |
| A3 | shadcn sidebar creates `src/components/ui/sidebar.tsx` with `SidebarProvider`, `Sidebar`, `SidebarInset`, `SidebarTrigger` exports | Architecture Patterns | If export names differ, imports in layout.tsx would break; easily caught at install time |

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against actual package.json, components.json, globals.css
- Shell architecture: HIGH — read actual dashboard/layout.tsx; exact insertion point identified
- Data layer gaps: HIGH — read all of analytics.ts; exact missing functions identified
- shadcn components: MEDIUM — docs fetched but shadcn docs sometimes lag CLI behavior; install and inspect actual output
- URL filter state: HIGH — existing KayitlarTabClient + KayitlarTab pattern confirmed in codebase
- i18n: HIGH — existing pattern confirmed; new namespace structure is straightforward extension
- recharts/nuqs legitimacy: ASSUMED — slopcheck unavailable; registry existence + public knowledge

**Research date:** 2026-05-26
**Valid until:** 2026-06-26 (shadcn CLI is fast-moving; re-verify sidebar/chart component exports before install if more than 2 weeks have passed)
