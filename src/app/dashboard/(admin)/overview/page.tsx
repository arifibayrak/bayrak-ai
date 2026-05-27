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
 * Decision D-87/D-88 (Phase 9): alert badges driven by tenant thresholds; Stalled Projects card.
 *   - pendingColor: destructive when pendingBacklog > 0 AND avgDecisionLatencyHours > auditSlaHours;
 *     warning when pendingBacklog > 0 but latency within threshold (or null); else default.
 *   - rejectionAlertFires: only when date filter active (Pitfall 4) AND rate > threshold.
 *   - stalledColor: destructive when stalledProjects.length >= 1.
 *   Alert colors: --destructive / amber ONLY — NEVER --primary (UI-SPEC hard rule).
 */

import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Clock, CheckCircle2, XCircle, HardHat, TriangleAlert, PauseCircle } from 'lucide-react';
import { getPortfolioKPIs, getPortfolioTrends, getPortfolioOverview, getStalledProjects } from '@/actions/analytics';
import { getProjects } from '@/actions/projects';
import { getActivePeople } from '@/actions/people';
import { getTenantSettings } from '@/actions/settings';
import { FilterBar } from '@/components/admin/FilterBar';
import { KpiCard } from '@/components/admin/KpiCard';
import { Badge } from '@/components/ui/badge';
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

  // Two-phase fetch: Phase 1 — parallel fetch (settings needed for stalledDays before getStalledProjects)
  const [kpis, trends, overview, projectsData, activePeople, settings] = await Promise.all([
    getPortfolioKPIs(filters),
    getPortfolioTrends(filters),
    getPortfolioOverview(),
    getProjects(),
    getActivePeople(),
    getTenantSettings(),
  ]);

  // Phase 2 — stalledProjects depends on settings.stalledDays (point-in-time, NOT date-filtered — D-66/D-88)
  const stalledProjects = await getStalledProjects(settings.stalledDays);

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

  // ── D-87 Alert state (pure TS — no extra DB round-trip, UI-SPEC Surface 5) ──────────────────

  // Pending-backlog: two-condition severity rule (D-87, UI-SPEC Surface 5)
  //   destructive: pendingBacklog > 0 AND avgDecisionLatencyHours != null AND > auditSlaHours
  //   warning:     pendingBacklog > 0 (latency null or within threshold — caution state)
  //   default:     no pending backlog
  const pendingColor: 'destructive' | 'warning' | 'default' =
    kpis.pendingBacklog > 0
      ? (kpis.avgDecisionLatencyHours != null && kpis.avgDecisionLatencyHours > settings.auditSlaHours
        ? 'destructive'
        : 'warning')
      : 'default';

  // pendingAlertFires: alertBadge shown only on destructive SLA breach, not on amber caution
  const pendingAlertFires = pendingColor === 'destructive';

  // Rejection alert: suppressed entirely when no date filter active (Pitfall 4 / research recommendation)
  // Rate = rejectionsInRange / (approvalsInRange + rejectionsInRange) compared to threshold
  const rejectionAlertFires = isDateFiltered &&
    (kpis.rejectionsInRange / Math.max(kpis.approvalsInRange + kpis.rejectionsInRange, 1)) >
    Number(settings.rejectionRateThreshold);

  const rejectionColor: 'destructive' | 'default' = rejectionAlertFires ? 'destructive' : 'default';

  // Stalled projects: destructive when >= 1 stalled project (D-88)
  const stalledColor: 'destructive' | 'default' = stalledProjects.length >= 1 ? 'destructive' : 'default';

  // ── Shared alert badge element (icon-only, destructive, per UI-SPEC Surface 5) ─────────────
  // aria-label on the wrapping span (in KpiCard) — icon itself is aria-hidden
  const alertBadgeEl = (
    <Badge variant="destructive" className="p-1">
      <TriangleAlert className="h-3 w-3" aria-hidden="true" />
    </Badge>
  );

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

      {/* KPI card row: 2-col mobile / 3-col md / 5-col desktop (D-88: Stalled Projects 5th card) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-8">
        {/* Pending backlog — point-in-time (D-66): no date filter in drill link
            Alert: destructive when avgDecisionLatencyHours > auditSlaHours; warning (amber) otherwise */}
        <KpiCard
          label={t('kpi_pending_label')}
          subLabel={t('kpi_pending_sub')}
          value={kpis.pendingBacklog}
          icon={<Clock className="h-5 w-5" />}
          drillHref={pendingDrillHref}
          valueColor={pendingColor}
          alertBadge={pendingAlertFires ? alertBadgeEl : undefined}
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

        {/* Rejections in range — alert badge only when date filter active AND rate > threshold (Pitfall 4) */}
        <KpiCard
          label={t('kpi_rejections_label')}
          subLabel={dateSubLabel}
          value={kpis.rejectionsInRange}
          icon={<XCircle className="h-5 w-5" />}
          drillHref={buildRecordsHref('rejected')}
          valueColor={rejectionColor}
          alertBadge={rejectionAlertFires ? alertBadgeEl : undefined}
        />

        {/* Active workers in range */}
        <KpiCard
          label={t('kpi_workers_label')}
          subLabel={dateSubLabel}
          value={kpis.activeWorkers}
          icon={<HardHat className="h-5 w-5" />}
          drillHref={buildPeopleHref()}
        />

        {/* Stalled Projects (D-88) — 5th card, point-in-time, never date-filtered */}
        <KpiCard
          label={t('kpi_stalled_label')}
          subLabel={
            stalledProjects.length >= 1
              ? t('kpi_stalled_sub_alert', { days: settings.stalledDays })
              : t('kpi_stalled_sub_healthy')
          }
          value={stalledProjects.length}
          icon={<PauseCircle className="h-5 w-5" />}
          drillHref={stalledProjects.length >= 1 ? '/dashboard/projects?stalled=true' : undefined}
          valueColor={stalledColor}
          alertBadge={stalledColor !== 'default' ? alertBadgeEl : undefined}
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
      />
    </div>
  );
}
