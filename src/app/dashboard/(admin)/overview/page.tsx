/**
 * Overview page — Admin Command Center
 *
 * Force-dynamic RSC reading searchParams; parallel data fetch; Suspense-wrapped FilterBar.
 *
 * Security (T-08-04-DATE): dates validated with isNaN(Date.parse) before SQL — raw strings
 * never reach the database.
 * Security (T-08-04-ID): project/person IDs passed as bound params through analytics functions.
 * Security (T-08-04-MONEY): EV displayed via Decimal-safe parse; currency selector picks one map.
 *
 * Decision D-66: pending backlog uses NO date filter (point-in-time).
 * Decision D-67: currency selector is page-local (not a URL param).
 * Decision D-68: charts receive server-prefetched data as props — never re-fetched client-side.
 * Decision D-73: filters persist in URL params; default all-time when unset.
 */

import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Clock, CheckCircle2, XCircle, HardHat } from 'lucide-react';
import { getPortfolioKPIs, getPortfolioTrends, getPortfolioOverview } from '@/actions/analytics';
import { getProjects } from '@/actions/projects';
import { getActivePeople } from '@/actions/people';
import { FilterBar } from '@/components/admin/FilterBar';
import { KpiCard } from '@/components/admin/KpiCard';
import { EVTableClient } from './EVTableClient';

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
  const { from, to, project, person } = await searchParams;

  // T-08-04-DATE: validate date strings before passing to SQL — never pass raw bad string to analytics
  const validatedFrom =
    from && !isNaN(Date.parse(from)) ? new Date(from) : undefined;
  const validatedTo =
    to && !isNaN(Date.parse(to)) ? new Date(to) : undefined;

  const filters = {
    from: validatedFrom,
    to: validatedTo,
    projectIds: project ? [project] : undefined,
    personId: person || undefined,
  };

  const t = await getTranslations('dashboard.admin.overview');

  // Parallel data fetch (D-68) — all three analytics + support lists
  const [kpis, trends, overview, projectsData, activePeople] = await Promise.all([
    getPortfolioKPIs(filters),
    getPortfolioTrends(filters),
    getPortfolioOverview(),
    getProjects(),
    getActivePeople(),
  ]);

  // Build deduplicated person options for FilterBar
  const personOptions = Array.from(
    new Map(
      activePeople.map((p) => [
        p.personId,
        { id: p.personId, name: p.displayName ?? p.telegramName ?? p.personId },
      ])
    ).values()
  );

  const projectOptions = projectsData.map((p) => ({ id: p.id, name: p.name }));

  // Range-aware subtitle — "filtered" when any filter is active
  const hasFilter = !!(from || to || project || person);
  const subtitle = hasFilter ? t('subtitle_filtered') : t('subtitle_all_time');

  // WR-01: getPortfolioKPIs only applies the date filter when BOTH from AND to are present
  // (analytics.ts line 323: dateCondition = filters.from && filters.to ? ... : sql``).
  // Show "selected period" sub-label only when both dates are set so the label matches the
  // actual query behavior — a one-sided date param leaves KPI counts as all-time.
  const isDateFiltered = !!(validatedFrom && validatedTo);
  const dateSubLabel = isDateFiltered ? t('kpi_sub_filtered') : t('kpi_sub_all_time');

  // Pending backlog drill: NO date filter (D-66 / Pitfall 5)
  const pendingDrillHref = '/dashboard/records?status=pending_audit';

  // Approvals/rejections drill: include current from/to
  const buildRecordsHref = (status: string): string => {
    const params = new URLSearchParams({ status });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return `/dashboard/records?${params.toString()}`;
  };

  // Active workers drill: people directory with date scope
  const buildPeopleHref = (): string => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return qs ? `/dashboard/people?${qs}` : '/dashboard/people';
  };

  // Pending backlog color: destructive if > 20
  const pendingColor: 'destructive' | 'default' =
    kpis.pendingBacklog > 20 ? 'destructive' : 'default';

  // Collect all available currencies from the overview data for the currency selector
  const availableCurrencies = Array.from(
    new Set([
      ...overview.flatMap((p) => Object.keys(p.contractedValueByCurrency)),
      ...overview.flatMap((p) => Object.keys(p.earnedValueByCurrency)),
      'TRY',
    ])
  ).sort();

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('heading')}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {/* Filter bar row (Suspense required — FilterBar uses useSearchParams) */}
      <Suspense
        fallback={
          <div className="h-12 animate-pulse bg-muted rounded" />
        }
      >
        <FilterBar
          projectOptions={projectOptions}
          personOptions={personOptions}
        />
      </Suspense>

      {/* KPI card row: 2-col mobile / 4-col desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
        {/* Pending backlog — point-in-time (D-66): no date filter in drill link */}
        <KpiCard
          label={t('kpi_pending_label')}
          subLabel={t('kpi_pending_sub')}
          value={kpis.pendingBacklog}
          icon={<Clock className="h-5 w-5" />}
          drillHref={pendingDrillHref}
          valueColor={pendingColor}
        />

        {/* Approvals in range */}
        <KpiCard
          label={t('kpi_approvals_label')}
          subLabel={dateSubLabel}
          value={kpis.approvalsInRange}
          icon={<CheckCircle2 className="h-5 w-5" />}
          drillHref={buildRecordsHref('approved')}
          valueColor="success"
        />

        {/* Rejections in range */}
        <KpiCard
          label={t('kpi_rejections_label')}
          subLabel={dateSubLabel}
          value={kpis.rejectionsInRange}
          icon={<XCircle className="h-5 w-5" />}
          drillHref={buildRecordsHref('rejected')}
          valueColor="destructive"
        />

        {/* Active workers in range */}
        <KpiCard
          label={t('kpi_workers_label')}
          subLabel={dateSubLabel}
          value={kpis.activeWorkers}
          icon={<HardHat className="h-5 w-5" />}
          drillHref={buildPeopleHref()}
        />
      </div>

      {/* Currency selector + Trend charts + EV table (all client — share currency state) */}
      <EVTableClient
        overview={overview}
        trends={trends}
        availableCurrencies={availableCurrencies}
        tEVHeading={t('ev_heading')}
        tColProject={t('ev_col_project')}
        tColBAC={t('ev_col_bac')}
        tColEV={t('ev_col_ev')}
        tColComplete={t('ev_col_complete')}
        tEmptyNoProjects={t('empty_no_projects')}
        tChartNoData={t('chart_no_data')}
        tChartThroughput={t('chart_throughput')}
        tChartEV={t('chart_earned_value')}
        tChartRejection={t('chart_rejection_rate')}
        currencyLabel=""
      />
    </div>
  );
}
