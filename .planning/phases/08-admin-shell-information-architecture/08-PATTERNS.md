# Phase 8: Admin Shell & Information Architecture — Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 22 new/modified files
**Analogs found:** 22 / 22 (all files have strong real-codebase analogs)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/dashboard/layout.tsx` | layout | request-response | `src/app/dashboard/layout.tsx` (self — modify) | exact |
| `src/app/dashboard/page.tsx` | page/redirect | request-response | `src/app/dashboard/projects/[id]/page.tsx` | role-match |
| `src/app/dashboard/(admin)/layout.tsx` | layout (passthrough) | request-response | `src/app/dashboard/layout.tsx` | role-match |
| `src/app/dashboard/(admin)/overview/page.tsx` | page (RSC) | request-response | `src/app/dashboard/projects/[id]/page.tsx` | exact |
| `src/app/dashboard/(admin)/people/page.tsx` | page (RSC) | request-response | `src/app/dashboard/projects/page.tsx` | exact |
| `src/app/dashboard/(admin)/people/[personId]/page.tsx` | page (RSC) | request-response | `src/app/dashboard/projects/[id]/page.tsx` | exact |
| `src/app/dashboard/(admin)/analytics/page.tsx` | page (stub) | request-response | `src/app/dashboard/projects/page.tsx` | role-match |
| `src/app/dashboard/(admin)/hakedis/page.tsx` | page (stub) | request-response | `src/app/dashboard/projects/page.tsx` | role-match |
| `src/app/dashboard/(admin)/exports/page.tsx` | page (stub) | request-response | `src/app/dashboard/projects/page.tsx` | role-match |
| `src/app/dashboard/records/page.tsx` | page (RSC) | request-response | `src/app/dashboard/projects/[id]/page.tsx` | exact |
| `src/app/dashboard/records/[id]/page.tsx` | page (RSC) | request-response | `src/app/dashboard/projects/[id]/page.tsx` | exact |
| `src/components/admin/SidebarNav.tsx` | component ('use client') | event-driven | `src/components/dashboard/KayitlarTabClient.tsx` | role-match |
| `src/components/admin/FilterBar.tsx` | component ('use client') | event-driven | `src/components/dashboard/KayitlarTabClient.tsx` | exact |
| `src/components/admin/CurrencySelector.tsx` | component ('use client') | event-driven | `src/components/dashboard/KayitlarTabClient.tsx` | role-match |
| `src/components/admin/KpiCard.tsx` | component (server) | request-response | `src/app/dashboard/projects/page.tsx` | role-match |
| `src/components/admin/TrendChartsClient.tsx` | component ('use client') | event-driven | `src/components/dashboard/KayitlarTabClient.tsx` | role-match |
| `src/components/admin/ActivityTimeline.tsx` | component (server+client) | request-response | `src/components/dashboard/KayitlarTabClient.tsx` | role-match |
| `src/components/admin/SubmissionDetailView.tsx` | component (server) | request-response | `src/components/dashboard/KayitlarTabClient.tsx` | role-match |
| `src/components/layout/TopNav.tsx` | component (server — modify) | request-response | `src/components/layout/TopNav.tsx` (self) | exact |
| `src/actions/analytics.ts` | server action (modify) | CRUD | `src/actions/analytics.ts` (self — extend) | exact |
| `messages/en.json` | config (i18n) | transform | `messages/en.json` (self — extend) | exact |
| `messages/tr.json` | config (i18n) | transform | `messages/tr.json` (self — extend) | exact |
| `tests/analytics.test.ts` | test | CRUD | `tests/analytics.test.ts` (self — extend) | exact |

---

## Pattern Assignments

### `src/app/dashboard/layout.tsx` (layout — MODIFIED)

**Analog:** `src/app/dashboard/layout.tsx` (the file being modified — current state is the baseline)

**Current auth pattern** (lines 1–31 of current file — preserve exactly):
```typescript
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect('/auth/signin');

  const { TopNav } = await import('@/components/layout/TopNav');
  const userEmail = session.user?.email ?? '';
  // ...
}
```

**Phase 8 modification — replace the return block only.** The `await auth()` guard and session extraction stay verbatim. Replace just the JSX return:

```typescript
// BEFORE (current):
return (
  <div className="min-h-screen bg-background">
    <TopNav userEmail={userEmail} />
    <main className="max-w-5xl mx-auto px-6 py-8 sm:py-10">{children}</main>
  </div>
);

// AFTER (Phase 8 — SidebarProvider wraps everything; TopNav moves inside SidebarInset):
// New imports to add at top:
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/admin/AppSidebar';

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
```

**Critical rules:**
- `await auth()` MUST remain before the `SidebarProvider` render — auth guard runs server-side
- Dynamic import of TopNav can become a static import once AppSidebar exists (both committed together)
- `SidebarProvider` is a Client Component; the async Server Component `DashboardLayout` can render it — this is valid RSC composition

---

### `src/app/dashboard/page.tsx` (redirect page — NEW)

**Analog:** `src/app/dashboard/projects/[id]/page.tsx` (simpler redirect pattern)

**Full file — single redirect, no HTML rendered:**
```typescript
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function DashboardRootPage() {
  redirect('/dashboard/overview');
}
```

---

### `src/app/dashboard/(admin)/layout.tsx` (passthrough layout — NEW)

**Analog:** `src/app/dashboard/layout.tsx` (auth is already handled by parent — this is a thin wrapper)

**Full file — passthrough only, no SidebarProvider (avoids double sidebar):**
```typescript
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

**Anti-pattern to avoid:** Do NOT add another `SidebarProvider` here. The sidebar lives only in the root `dashboard/layout.tsx`.

---

### `src/app/dashboard/(admin)/overview/page.tsx` (RSC, force-dynamic — NEW)

**Analog:** `src/app/dashboard/projects/[id]/page.tsx` — exact match: async RSC, `await searchParams`, `await getTranslations`, parallel `Promise.all` data fetching, passes data to client component.

**Imports pattern** (copy from `projects/[id]/page.tsx` lines 1–11, adapt):
```typescript
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { getPortfolioKPIs, getPortfolioTrends, getPortfolioOverview } from '@/actions/analytics';
// shadcn components as needed
```

**force-dynamic + async searchParams pattern** (from `projects/[id]/page.tsx` lines 15–24):
```typescript
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{
    from?: string;
    to?: string;
    project?: string;
    person?: string;
    status?: string;
  }>;
}

export default async function OverviewPage({ searchParams }: Props) {
  const { from, to, project, person, status } = await searchParams;
  const t = await getTranslations('dashboard.admin.overview');
  // ...
}
```

**Parallel data fetch pattern** (from `projects/[id]/page.tsx` lines 35–40):
```typescript
const filters = {
  from: from && !isNaN(Date.parse(from)) ? new Date(from) : undefined,
  to: to && !isNaN(Date.parse(to)) ? new Date(to) : undefined,
  projectIds: project ? [project] : undefined,
  personId: person || undefined,
};

const [kpis, trends, overview] = await Promise.all([
  getPortfolioKPIs(filters),
  getPortfolioTrends(filters),
  getPortfolioOverview(),
]);
```

**FilterBar Suspense wrapping** (anti-pattern from RESEARCH.md Pitfall 3):
```typescript
// FilterBar uses useSearchParams() — MUST be wrapped in Suspense
<Suspense fallback={<div className="h-12 animate-pulse bg-muted rounded" />}>
  <FilterBar currentFilters={filters} />
</Suspense>
```

**i18n pattern** (from `projects/page.tsx` lines 9, 17):
```typescript
const t = await getTranslations('dashboard.admin.overview');
// Usage: {t('heading')}, {t('kpi_pending')}, etc.
```

---

### `src/app/dashboard/(admin)/people/page.tsx` (RSC, force-dynamic — NEW)

**Analog:** `src/app/dashboard/projects/page.tsx` — async RSC, `getTranslations`, single data call, empty state pattern.

**Key additions over the analog:**
- `export const dynamic = 'force-dynamic'`  
- `searchParams` prop (date/project filter params — same pattern as overview page)
- `Promise.all` for workers + auditors tab data
- Tabs via shadcn `<Tabs>` (already used in `projects/[id]/page.tsx` lines 66–112)

**Empty state pattern** (from `projects/page.tsx` lines 26–32):
```typescript
{people.length === 0 ? (
  <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
    <Users className="size-12" />
    <p className="text-sm">{t('empty_state')}</p>
  </div>
) : (
  // table
)}
```

---

### `src/app/dashboard/(admin)/people/[personId]/page.tsx` (RSC, force-dynamic — NEW)

**Analog:** `src/app/dashboard/projects/[id]/page.tsx` — exact match: dynamic route, `await params`, `notFound()`, multiple data fetches.

**Dynamic route + notFound pattern** (from `projects/[id]/page.tsx` lines 22–33):
```typescript
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ from?: string; to?: string; project?: string }>;
}

export default async function PersonProfilePage({ params, searchParams }: Props) {
  const { personId } = await params;
  const { from, to, project } = await searchParams;
  // ...
  // If person not found:
  // notFound();
}
```

**Breadcrumb pattern** (from `projects/[id]/page.tsx` lines 51–57):
```typescript
<nav className="text-sm text-muted-foreground mb-4">
  <Link href="/dashboard/people" className="hover:underline">
    {t('back_to_people')}
  </Link>
</nav>
```

---

### `src/app/dashboard/(admin)/analytics/page.tsx`, `hakedis/page.tsx`, `exports/page.tsx` (stubs — NEW)

**Analog:** `src/app/dashboard/projects/page.tsx` — minimal RSC with heading, i18n.

**Stub pattern:**
```typescript
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const t = await getTranslations('dashboard.admin.stubs');
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('analytics_heading')}</h1>
        <Badge variant="secondary">{t('coming_soon')}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{t('analytics_body')}</p>
    </div>
  );
}
```

---

### `src/app/dashboard/records/page.tsx` (RSC, force-dynamic, drill-only — NEW)

**Analog:** `src/app/dashboard/projects/[id]/page.tsx` — searchParams, data fetch, passes to table client component.

**Pagination params pattern** (extends `projects/[id]/page.tsx` searchParams):
```typescript
interface Props {
  searchParams: Promise<{
    from?: string; to?: string; project?: string; person?: string;
    status?: string; page?: string;
  }>;
}

export default async function RecordsPage({ searchParams }: Props) {
  const { from, to, project, person, status, page } = await searchParams;
  const pageNum = page ? Math.max(1, parseInt(page, 10)) : 1;
  const PAGE_SIZE = 25;
  // Pass limit + offset to getCanonicalSubmissions
}
```

---

### `src/app/dashboard/records/[id]/page.tsx` (RSC, force-dynamic — NEW)

**Analog:** `src/app/dashboard/projects/[id]/page.tsx` — `await params`, `notFound()`, single data fetch.

**notFound pattern** (from `projects/[id]/page.tsx` line 33):
```typescript
const submissions = await getCanonicalSubmissions({ submissionId: id });
if (submissions.length === 0) notFound();
const submission = submissions[0];
```

---

### `src/components/admin/SidebarNav.tsx` ('use client' — NEW)

**Analog:** `src/components/dashboard/KayitlarTabClient.tsx` — client component with `useRouter`, `useTranslations`, active-state detection.

**Imports pattern** (adapt from `KayitlarTabClient.tsx` lines 1–26):
```typescript
'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LayoutDashboard, FolderOpen, Users, BarChart2, FileText, Download } from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
```

**Active item detection pattern** (role-analog of `KayitlarTabClient.tsx` filter chip active detection, lines 72–78):
```typescript
const NAV_ITEMS = [
  { key: 'overview', href: '/dashboard/overview', icon: LayoutDashboard, exact: true },
  { key: 'projects', href: '/dashboard/projects', icon: FolderOpen, exact: false },
  { key: 'people',   href: '/dashboard/people',   icon: Users,          exact: false },
  { key: 'analytics',href: '/dashboard/analytics',icon: BarChart2,      exact: true },
  { key: 'hakedis',  href: '/dashboard/hakedis',  icon: FileText,       exact: true },
  { key: 'exports',  href: '/dashboard/exports',  icon: Download,       exact: true },
] as const;

export function SidebarNav() {
  const pathname = usePathname();
  const t = useTranslations('dashboard.admin.nav');

  return (
    <nav aria-label={t('main_nav_aria')}>
      <SidebarMenu>
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <SidebarMenuItem key={item.key}>
              <SidebarMenuButton asChild isActive={isActive}>
                <a href={item.href} aria-current={isActive ? 'page' : undefined}>
                  <item.icon aria-hidden="true" />
                  <span>{t(item.key)}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}
```

---

### `src/components/admin/FilterBar.tsx` ('use client' — NEW)

**Analog:** `src/components/dashboard/KayitlarTabClient.tsx` — exact match: `useRouter`, `usePathname`, `useSearchParams`, `router.push` for URL state updates.

**URL state update pattern** (from `KayitlarTabClient.tsx` lines 120–129):
```typescript
'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
// Select from @/components/ui/select

export function FilterBar({ projectOptions, personOptions }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('dashboard.admin.filters');

  function applyFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearFilters() {
    router.push(pathname);
  }
  // ...
}
```

**MUST be wrapped in `<Suspense>` by every parent page** (RESEARCH.md Pitfall 3) because `useSearchParams()` causes CSR bailout without it.

---

### `src/components/admin/CurrencySelector.tsx` ('use client' — NEW)

**Analog:** `src/components/dashboard/KayitlarTabClient.tsx` (FilterChips sub-component pattern, lines 322–351) — local state, no URL params.

**Local state pattern** (currency is NOT a URL param — page-local display preference per D-67):
```typescript
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface CurrencySelectorProps {
  availableCurrencies: string[];   // e.g. ['TRY', 'USD']
  onCurrencyChange: (currency: string) => void;
}

export function CurrencySelector({ availableCurrencies, onCurrencyChange }: CurrencySelectorProps) {
  const [selected, setSelected] = useState('TRY');
  const t = useTranslations('dashboard.admin.currency');

  function handleChange(value: string) {
    setSelected(value);
    onCurrencyChange(value);
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-semibold text-muted-foreground">{t('label')}</label>
      <Select value={selected} onValueChange={handleChange}>
        <SelectTrigger className="w-[100px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableCurrencies.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

---

### `src/components/admin/KpiCard.tsx` (server-compatible — NEW)

**Analog:** `src/app/dashboard/projects/page.tsx` + `src/components/dashboard/KayitlarTabClient.tsx` (StatusBadge pattern, lines 90–104)

**KPI card pattern using shadcn Card:**
```typescript
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
// lucide icon passed as prop

interface KpiCardProps {
  label: string;
  subLabel: string;
  value: number | string;
  icon: React.ReactNode;
  drillHref?: string;   // undefined = not clickable
  valueColor?: 'default' | 'success' | 'destructive';
}

export function KpiCard({ label, subLabel, value, icon, drillHref, valueColor = 'default' }: KpiCardProps) {
  const colorClass =
    valueColor === 'success'      ? 'text-emerald-700' :
    valueColor === 'destructive'  ? 'text-destructive' :
    'text-foreground';

  const statEl = (
    <span className={`text-3xl font-semibold tabular-nums ${colorClass}`}>
      {value}
    </span>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </CardHeader>
      <CardContent>
        {drillHref ? (
          <Link href={drillHref} className="hover:underline">
            {statEl}
          </Link>
        ) : statEl}
        <p className="text-sm text-muted-foreground mt-1">{subLabel}</p>
      </CardContent>
    </Card>
  );
}
```

---

### `src/components/admin/TrendChartsClient.tsx` ('use client' — NEW)

**Analog:** `src/components/dashboard/KayitlarTabClient.tsx` — client component receiving server-prefetched data as props (XTab/XTabClient split pattern from Phase 5 D-68). Recharts renders client-side; data never re-fetched from this component.

**Imports pattern:**
```typescript
'use client';

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useTranslations } from 'next-intl';
```

**ChartContainer pattern** (install via `npx shadcn@latest add chart` first):
```typescript
const chartConfig = {
  approved_count: { label: 'Approvals', color: 'var(--chart-1)' },
  rejected_count: { label: 'Rejections', color: 'var(--chart-3)' },
};

export function ThroughputChart({ data }: { data: TrendPoint[] }) {
  return (
    <ChartContainer
      config={chartConfig}
      className="h-[240px]"
      aria-label="Throughput trend chart"
    >
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="bucket" tick={{ fontSize: 14 }} />
        <YAxis tick={{ fontSize: 14 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          type="monotone"
          dataKey="approved_count"
          stroke="var(--chart-1)"
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
```

**Empty state pattern** (consistent with `KayitlarTabClient.tsx` empty state lines 136–164):
```typescript
if (!data || data.length === 0) {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
      {t('no_data')}
    </div>
  );
}
```

---

### `src/components/admin/ActivityTimeline.tsx` (server render + client load-more — NEW)

**Analog:** `src/components/dashboard/KayitlarTabClient.tsx` — pagination pattern (lines 273–296), status badge (lines 90–104), table row pattern.

**Status dot pattern** (adapts `StatusBadge` from `KayitlarTabClient.tsx` lines 90–104):
```typescript
function StatusDot({ status }: { status: 'approved' | 'rejected' | 'pending_audit' }) {
  const cls =
    status === 'approved'     ? 'bg-emerald-500' :
    status === 'rejected'     ? 'bg-destructive'  :
    'bg-amber-500';
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} aria-hidden="true" />;
}
```

**Ordered list semantic pattern** (per UI-SPEC accessibility requirements):
```typescript
<ol className="space-y-0">
  {groupedEntries.map(({ month, entries }) => (
    <li key={month}>
      <h3 className="text-sm font-semibold text-muted-foreground py-2">{month}</h3>
      <ol className="divide-y divide-border">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center gap-3 py-3 min-h-[44px]">
            <StatusDot status={entry.status} />
            <span className="flex-1 text-sm">{entry.material} — {entry.quantity} {entry.unit}</span>
            <span className="text-sm text-muted-foreground tabular-nums">{entry.dateStr}</span>
            <Link href={`/dashboard/records/${entry.id}`} aria-label={t('view_detail')}>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
    </li>
  ))}
</ol>
```

---

### `src/components/admin/SubmissionDetailView.tsx` (server component — NEW)

**Analog:** `src/components/dashboard/KayitlarTabClient.tsx` — photo lightbox (lines 203–216, 298–317), Google Maps link (lines 244–258), StatusBadge (lines 90–104).

**Photo lightbox pattern** (from `KayitlarTabClient.tsx` lines 203–216 — photoUrl via next/image + Dialog):
```typescript
// Server component handles the dl/dt/dd layout; lightbox is a client sub-component
// Photo block (reuse D-61 pattern exactly):
<button
  type="button"
  onClick={() => { setLightboxUrl(submission.photoUrl); }}
  className="relative block h-[200px] w-[200px] rounded overflow-hidden cursor-pointer"
>
  <Image
    src={submission.photoUrl}
    alt={t('photo_alt')}
    width={200}
    height={200}
    className="object-cover"
  />
</button>

// Lightbox (from KayitlarTabClient.tsx lines 298–317):
<Dialog open={!!lightboxUrl} onOpenChange={(open) => { if (!open) setLightboxUrl(null); }}>
  <DialogContent className="max-w-3xl">
    {lightboxUrl && (
      <Image src={lightboxUrl} alt={lightboxAlt} width={800} height={600} style={{ objectFit: 'contain' }} />
    )}
  </DialogContent>
</Dialog>
```

**Google Maps link pattern** (from `KayitlarTabClient.tsx` lines 244–258):
```typescript
{submission.locationLat != null && submission.locationLon != null ? (
  <a
    href={`https://maps.google.com/?q=${submission.locationLat},${submission.locationLon}`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 text-primary hover:underline"
  >
    <ExternalLink className="h-4 w-4" aria-hidden="true" />
    {t('view_on_maps')}
  </a>
) : '—'}
```

**dl/dt/dd semantic pair pattern** (per UI-SPEC accessibility spec):
```typescript
<dl className="space-y-3">
  <div>
    <dt className="text-sm font-semibold text-muted-foreground">{t('field_worker')}</dt>
    <dd className="text-sm">{submission.workerName}</dd>
  </div>
  {/* ... repeat for all fields ... */}
</dl>
```

---

### `src/components/layout/TopNav.tsx` (server component — MODIFIED)

**Analog:** `src/components/layout/TopNav.tsx` (self — add SidebarTrigger to existing header)

**Current structure** (lines 18–48 — preserve header + flex layout, add SidebarTrigger left of wordmark):
```typescript
// Import to add:
import { SidebarTrigger } from '@/components/ui/sidebar';

// Modify left side of the header flex row only:
// BEFORE:
<span className="text-xl font-bold tracking-tight">{t('wordmark')}</span>

// AFTER (SidebarTrigger on mobile, wordmark stays):
<div className="flex items-center gap-2">
  <SidebarTrigger className="md:hidden" aria-label={t('open_nav')} />
  <span className="text-xl font-bold tracking-tight">{t('wordmark')}</span>
</div>
```

**Constraint:** `SidebarTrigger` must render inside the `<SidebarInset>` tree (satisfied because TopNav is now rendered inside `<SidebarInset>` in the modified layout).

---

### `src/actions/analytics.ts` (server action — MODIFIED: add 4 new functions)

**Analog:** `src/actions/analytics.ts` (self — add to end of file following identical structure)

**Function signature pattern** (copy from `getProjectMetrics` lines 228–231):
```typescript
export async function getPortfolioKPIs(filters: SubmissionFilters = {}): Promise<PortfolioKPIs> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();
  // ...
}
```

**Parameterized WHERE clause pattern** (from `getCanonicalSubmissions` lines 116–138 — copy verbatim):
```typescript
const conditions = [sql`s.tenant_id = ${tenantId}`];

if (filters.projectIds && filters.projectIds.length > 0) {
  conditions.push(sql`s.project_id = ANY(${filters.projectIds})`);
}
if (filters.from) {
  conditions.push(sql`s.submitted_at >= ${filters.from.toISOString()}`);
}
if (filters.to) {
  conditions.push(sql`s.submitted_at < ${filters.to.toISOString()}`);
}
const whereClause = sql.join(conditions, sql` AND `);
```

**DATE CONDITION variant for portfolio KPIs** (pending backlog uses NO date condition — D-66):
```typescript
// Approved/rejected counts use the date filter:
const dateCondition = (filters.from && filters.to)
  ? sql` AND s.submitted_at >= ${filters.from.toISOString()} AND s.submitted_at < ${filters.to.toISOString()}`
  : sql``;

// Pending backlog is point-in-time — NO date condition applied to it:
COUNT(*) FILTER (WHERE s.status = 'pending_audit')  AS pending_backlog   -- no dateCondition
COUNT(*) FILTER (WHERE s.status = 'approved' ${dateCondition})  AS approvals_in_range
COUNT(*) FILTER (WHERE s.status = 'rejected' ${dateCondition})  AS rejections_in_range
```

**Istanbul timezone bucketing** (for `getPortfolioTrends`):
```typescript
// Monthly (default / >60d range):
sql`date_trunc('month', s.submitted_at AT TIME ZONE 'Europe/Istanbul')`
// Weekly (≤60d range):
sql`date_trunc('week', s.submitted_at AT TIME ZONE 'Europe/Istanbul')`
```

**Split-query pattern for NULL-safe aggregates** (from `getPersonMetrics` lines 508–541):
```typescript
// NEVER mix AVG(latency) with COUNT(pending) in same query — NULL decidedAt poisons avg
const [auditorResult, pendingBacklogResult] = await Promise.all([
  db.execute(sql`
    SELECT COUNT(*) AS decisions_count,
      ROUND(AVG(EXTRACT(EPOCH FROM (s.decided_at - s.submitted_at)) / 3600.0)
        FILTER (WHERE s.decided_at IS NOT NULL), 2) AS avg_decision_latency_hours
    FROM submissions s
    WHERE s.decided_by = ${personId} AND s.status IN ('approved', 'rejected')
  `),
  db.execute(sql`
    SELECT COUNT(*) AS pending_backlog_count
    FROM submissions s
    WHERE s.project_id IN (
      SELECT project_id FROM assignments
      WHERE person_id = ${personId} AND role_on_project = 'auditor'
    )
    AND s.status = 'pending_audit'
  `),
]);
```

**`getPersonMetrics` extension with dateRange** (D-75 — add optional param; all sub-queries get the same date condition):
```typescript
// Extend signature (existing function — add dateRange to options):
export async function getPersonMetrics(
  personId: string,
  options?: { projectIds?: string[]; asAuditor?: boolean; dateRange?: { from: Date; to: Date } }
): Promise<PersonMetrics>

// Add dateRange condition (same pattern as getProjectMetrics lines 237–239):
const dateConditions = options?.dateRange
  ? sql` AND s.submitted_at >= ${options.dateRange.from.toISOString()} AND s.submitted_at < ${options.dateRange.to.toISOString()}`
  : sql``;
// Append ${dateConditions} to WHERE clause in all 4 sub-queries
```

**Currency map merge pattern** (from `getProjectMetrics` lines 302–325 — copy verbatim for any new currency-grouped results):
```typescript
const evByCurrency: Record<string, string> = {};
for (const row of valuesResult.rows) {
  const currency = String(row.currency_code);
  if (!currency) continue;
  if (row.earned_value != null) {
    evByCurrency[currency] = String(row.earned_value);
  }
}
```

**Numeric column coercion pattern** (from `getCanonicalSubmissions` lines 181–210 — every DB row value):
```typescript
// Numeric strings returned by Drizzle — NEVER parseFloat()
quantity: String(r.quantity),
earnedValue: r.earned_value != null ? String(r.earned_value) : null,
// Number() only for count/integer fields:
approvedCount: Number(counts.approved_count ?? 0),
```

**`getCanonicalSubmissions` pagination extension** (add `limit`/`offset` params):
```typescript
type SubmissionFilters = {
  // existing fields...
  submissionId?: string;   // for single-record detail page lookup
  limit?: number;
  offset?: number;
};

// In the SQL query, add at end:
// LIMIT ${filters.limit ?? 1000} OFFSET ${filters.offset ?? 0}
```

---

### `messages/en.json` and `messages/tr.json` (i18n — MODIFIED)

**Analog:** `messages/en.json` existing structure (lines 1–40 of en.json)

**Namespace pattern** (copy nesting depth from existing `dashboard.projects.*`):
```json
{
  "dashboard": {
    "admin": {
      "nav": {
        "overview": "Overview",
        "projects": "Projects",
        "people": "People",
        "analytics": "Analytics",
        "hakedis": "Hakkediş",
        "exports": "Exports",
        "main_nav_aria": "Main navigation",
        "open_nav": "Open navigation",
        "close_nav": "Close navigation"
      },
      "overview": {
        "heading": "Overview",
        "subtitle_all_time": "All-time portfolio summary",
        "subtitle_filtered": "Portfolio — selected period",
        "kpi_pending_label": "Pending Audits",
        "kpi_pending_sub": "Current backlog",
        "kpi_approvals_label": "Approvals",
        "kpi_rejections_label": "Rejections",
        "kpi_workers_label": "Active Workers",
        "kpi_sub_all_time": "All time",
        "kpi_sub_filtered": "In selected period"
      },
      "filters": {
        "from": "From",
        "to": "To",
        "all_projects": "All Projects",
        "all_people": "All People",
        "clear": "Clear filters"
      },
      "currency": {
        "label": "Currency"
      },
      "people": {
        "heading": "People",
        "subtitle": "Approved workers and auditors",
        "tab_workers": "Workers",
        "tab_auditors": "Auditors",
        "empty_state": "No people yet.",
        "col_name": "Name",
        "col_submissions": "Submissions"
      },
      "records": {
        "heading": "Records",
        "col_status": "Status",
        "col_worker": "Worker",
        "col_project": "Project",
        "col_boq": "Item",
        "col_quantity": "Quantity",
        "col_submitted": "Submitted",
        "col_auditor": "Auditor",
        "details": "Details",
        "prev": "Previous",
        "next": "Next",
        "empty": "No records match the current filters."
      },
      "detail": {
        "heading": "Submission Detail",
        "back": "← Records",
        "field_worker": "Worker",
        "field_project": "Project",
        "field_boq": "Item",
        "field_quantity": "Quantity",
        "field_submitted": "Submitted",
        "field_location": "Location",
        "field_location_warning": "Location warning",
        "field_auditor": "Auditor",
        "field_decided": "Decided",
        "field_rejection_reason": "Rejection reason",
        "ai_slot_label": "AI Analysis",
        "ai_slot_body": "AI analysis will be available in a future phase.",
        "view_on_maps": "View on Maps"
      },
      "stubs": {
        "coming_soon": "Coming soon",
        "analytics_heading": "Analytics",
        "analytics_body": "This section is under construction and will be available in a future phase.",
        "hakedis_heading": "Hakkediş",
        "hakedis_body": "This section is under construction and will be available in a future phase.",
        "exports_heading": "Exports",
        "exports_body": "This section is under construction and will be available in a future phase."
      }
    }
  }
}
```

**Server component i18n usage** (from `projects/page.tsx` line 9):
```typescript
const t = await getTranslations('dashboard.admin.overview');
```

**Client component i18n usage** (from `KayitlarTabClient.tsx` line 113):
```typescript
const t = useTranslations('dashboard.admin.nav');
```

---

### `tests/analytics.test.ts` (test file — MODIFIED: add new describe blocks)

**Analog:** `tests/analytics.test.ts` (self — add blocks following the identical structure)

**Test file header pattern** (lines 1–38 — copy mock blocks verbatim for any new test block file):
```typescript
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id', email: 'test@example.com' } }),
}));
```

**describeIfDb + fixture pattern** (from `analytics.test.ts` lines 41–56 — copy structure):
```typescript
describeIfDb('UX-02: getPortfolioKPIs() — pending backlog + in-range counts', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('pending backlog is NOT scoped by date filter (D-66)', async () => {
    const { getPortfolioKPIs } = await import('@/actions/analytics');
    // seed: insert submission with status='pending_audit' outside date range
    // assert: kpis.pendingBacklog > 0 even with narrow date filter
  });
});
```

**UUID fixture pattern** (from `analytics.test.ts` lines 57–64):
```typescript
const tenantId  = '00000000-0000-0000-0000-000000000001';
const projectId = '00000000-0000-0000-0000-000000000120';
// Use sql.raw() for fixture inserts (test fixtures only — production code uses parameterized sql``)
await db.execute(sql.raw(`INSERT INTO ... ON CONFLICT DO NOTHING`));
```

**Auth-guard test pattern** (from `analytics.test.ts` lines 74–78):
```typescript
it('throws Unauthorized when auth() returns null', async () => {
  const { auth } = await import('@/lib/auth');
  (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
  const { getPortfolioKPIs } = await import('@/actions/analytics');
  await expect(getPortfolioKPIs()).rejects.toThrow('Unauthorized');
});
```

---

## Shared Patterns

### Authentication guard
**Source:** `src/app/dashboard/layout.tsx` lines 15–16 + `src/actions/analytics.ts` lines 113–114
**Apply to:** All new `page.tsx` files (inherited from root layout) AND all new functions in `analytics.ts`
```typescript
// In layout (inherited — not repeated in child pages):
const session = await auth();
if (!session) redirect('/auth/signin');

// In every analytics function:
const session = await auth();
if (!session) throw new Error('Unauthorized');
const tenantId = getDefaultTenantId();
```

### Tenant scoping
**Source:** `src/actions/analytics.ts` lines 114, 119
**Apply to:** Every new SQL query in `analytics.ts`
```typescript
const tenantId = getDefaultTenantId();
// First condition in every WHERE clause:
const conditions = [sql`s.tenant_id = ${tenantId}`];
```

### force-dynamic export
**Source:** `src/app/dashboard/projects/[id]/page.tsx` line 15
**Apply to:** Every new `page.tsx` in this phase
```typescript
export const dynamic = 'force-dynamic';
```

### Async searchParams (Next.js 15)
**Source:** `src/app/dashboard/projects/[id]/page.tsx` lines 17–24
**Apply to:** All new page files that read URL filter params
```typescript
interface Props {
  searchParams: Promise<{ /* filter keys */ }>;
}
export default async function SomePage({ searchParams }: Props) {
  const { from, to } = await searchParams;  // MUST await in Next.js 15
}
```

### Parameterized SQL template literals (CR-03)
**Source:** `src/actions/analytics.ts` lines 116–138
**Apply to:** All new SQL queries in `analytics.ts`
```typescript
// Always interpolate user-supplied values as ${value} — never string concat:
conditions.push(sql`s.submitted_at >= ${filters.from.toISOString()}`);
const whereClause = sql.join(conditions, sql` AND `);
```

### Money-safe numeric handling
**Source:** `src/actions/analytics.ts` lines 190–210 (return mapping) + `src/lib/types/canonical-submission.ts`
**Apply to:** All new query functions returning monetary values
```typescript
// Return as string from DB query:
earnedValue: r.earned_value != null ? String(r.earned_value) : null,
// Display with Decimal.js (never parseFloat in arithmetic):
// new Decimal(row.earnedValue ?? '0').toNumber()
// Format: new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 })
```

### Currency-grouped value maps
**Source:** `src/actions/analytics.ts` lines 302–325
**Apply to:** All new functions returning financial aggregates
```typescript
const evByCurrency: Record<string, string> = {};
for (const row of result.rows) {
  const currency = String(row.currency_code);
  if (!currency) continue;
  if (row.earned_value != null) evByCurrency[currency] = String(row.earned_value);
}
// Never sum across currencies. Caller picks one key via currency selector.
```

### next-intl getTranslations (server)
**Source:** `src/app/dashboard/projects/[id]/page.tsx` lines 3, 26–29
**Apply to:** All new RSC page files
```typescript
import { getTranslations } from 'next-intl/server';
const t = await getTranslations('dashboard.admin.overview');
// Usage: {t('heading')}
```

### next-intl useTranslations (client)
**Source:** `src/components/dashboard/KayitlarTabClient.tsx` lines 25, 113
**Apply to:** All new `'use client'` components
```typescript
import { useTranslations } from 'next-intl';
const t = useTranslations('dashboard.admin.nav');
```

### router.push URL state (client)
**Source:** `src/components/dashboard/KayitlarTabClient.tsx` lines 120–128
**Apply to:** `FilterBar.tsx`, `SidebarNav.tsx`, any client component driving URL navigation
```typescript
const router = useRouter();
function navigate(status: string, page: number) {
  router.push(`/dashboard/projects/${projectId}?tab=kayitlar&status=${status}&page=${page}`);
}
```

### StatusBadge color mapping
**Source:** `src/components/dashboard/KayitlarTabClient.tsx` lines 90–104
**Apply to:** All new components rendering submission status
```typescript
if (status === 'approved') return <Badge className="bg-emerald-100 text-emerald-800">{label}</Badge>;
if (status === 'rejected') return <Badge variant="destructive">{label}</Badge>;
return <Badge variant="secondary">{label}</Badge>;  // pending_audit
```

### Date locale formatting
**Source:** `src/components/dashboard/KayitlarTabClient.tsx` line 191
**Apply to:** All date display in new components
```typescript
new Date(row.submittedAt).toLocaleDateString('tr-TR')
// Quantities:
new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(qty)
```

### Pagination prev/next (shadcn Button)
**Source:** `src/components/dashboard/KayitlarTabClient.tsx` lines 273–296
**Apply to:** `records/page.tsx` record list pagination
```typescript
<div className="flex items-center justify-between gap-4 pt-2">
  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
    {t('prev')}
  </Button>
  <span className="text-sm text-muted-foreground tabular-nums">
    {t('pagination', { page, pages: Math.max(1, pageCount) })}
  </span>
  <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => handlePageChange(page + 1)}>
    {t('next')}
  </Button>
</div>
```

### next/image + Dialog lightbox (D-61)
**Source:** `src/components/dashboard/KayitlarTabClient.tsx` lines 203–216, 298–317
**Apply to:** `SubmissionDetailView.tsx` photo block
```typescript
// Thumbnail triggers Dialog lightbox — copy D-61 pattern exactly (do not reimagine)
```

### Google Maps external link
**Source:** `src/components/dashboard/KayitlarTabClient.tsx` lines 244–258
**Apply to:** `SubmissionDetailView.tsx` location field
```typescript
href={`https://maps.google.com/?q=${lat},${lon}`}
target="_blank"
rel="noopener noreferrer"  // T-05-TN: prevent tab hijacking
```

### overflow-x-auto mobile table scroll
**Source:** `src/components/dashboard/KayitlarTabClient.tsx` line 176
**Apply to:** All new table components
```typescript
<div className="overflow-x-auto">
  <Table>...</Table>
</div>
```

### Empty state with icon
**Source:** `src/app/dashboard/projects/page.tsx` lines 26–32
**Apply to:** All new list/table components
```typescript
<div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
  <SomeIcon className="size-12" />
  <p className="text-sm">{t('empty_state')}</p>
</div>
```

---

## No Analog Found

All Phase 8 files have real codebase analogs. The following are NEW patterns with no prior codebase example — use RESEARCH.md code examples as the reference:

| File/Pattern | Role | Data Flow | Reason | Reference |
|---|---|---|---|---|
| `src/components/ui/sidebar.tsx` (after install) | UI primitive | event-driven | Installed fresh by `npx shadcn@latest add sidebar`; no existing sidebar in codebase | RESEARCH.md Pattern 1 + Pattern 2 |
| `src/components/ui/chart.tsx` (after install) | UI primitive | event-driven | Installed fresh by `npx shadcn@latest add chart`; no existing Recharts wrapper | RESEARCH.md Code Examples §Chart |
| `src/components/admin/AppSidebar.tsx` | component (server) | request-response | Wrapper composing `<Sidebar>` + `<SidebarNav>`; no existing app sidebar shell | RESEARCH.md Pattern 1 |
| Istanbul tz date bucketing in SQL | query fragment | CRUD | No existing time-bucket query in codebase | RESEARCH.md Pattern 6 |
| `getPortfolioKPIs` / `getPortfolioTrends` / `getAuditorDecisions` function bodies | server action | CRUD | New functions; function structure follows existing analogs but SQL is novel | RESEARCH.md Patterns 5–8 |

---

## Metadata

**Analog search scope:** `src/app/dashboard/**`, `src/actions/analytics.ts`, `src/components/dashboard/**`, `src/components/layout/**`, `src/lib/types/**`, `messages/*.json`, `tests/analytics.test.ts`
**Files scanned:** 12 analog files read in full or targeted sections
**Pattern extraction date:** 2026-05-26

### Install prerequisites (before any implementation)

```bash
npx shadcn@latest add sidebar   # creates src/components/ui/sidebar.tsx
npx shadcn@latest add chart     # creates src/components/ui/chart.tsx + installs recharts
```

Verify both commands complete and inspect the created files for exact export names (`SidebarProvider`, `SidebarInset`, `SidebarTrigger`, `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`) before writing import statements.
