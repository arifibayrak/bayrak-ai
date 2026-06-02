/**
 * Analytics page — /dashboard/analytics
 *
 * Construction execution analytics, by project (the "finish Analizler" build):
 *   - Project KPI row: % complete, earned value, contract value, pending,
 *     rejection rate, avg audit time (getProjectMetrics).
 *   - BOQ burn-down: approved vs contracted quantity per line item, with earned
 *     and remaining value (getBoqProgress — sourced from the approved-submissions
 *     ledger, WR-02, so it agrees with earned value everywhere else).
 *   - Largest-remaining-value insight.
 *   - Team activity: per office-engineer scorecard entry points (preserved).
 *
 * Distinct from Overview (portfolio KPIs + trends) — this is the per-project
 * execution deep-dive. Read-only and audit_engineer-safe: only a ?project query
 * param changes, no office-only links.
 *
 * Security: auth-guarded (RSC); tenant-scoped queries; projectId bound as param.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { sql } from 'drizzle-orm';
import {
  BarChart2,
  CheckCircle2,
  Wallet,
  FileSignature,
  Clock,
  XCircle,
  TrendingUp,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { getDefaultTenantId } from '@/lib/tenant';
import { getProjects } from '@/actions/projects';
import { getProjectMetrics, getBoqProgress } from '@/actions/analytics';
import { formatMoneySymbol, formatMoneyAmount } from '@/lib/format-money';
import {
  BrandBadge,
  BrandCard,
  BrandEmpty,
  BrandHeading,
} from '@/components/brand';
import { KpiCard } from '@/components/admin/KpiCard';
import { ProjectAnalyticsPicker } from '@/components/admin/ProjectAnalyticsPicker';

export const dynamic = 'force-dynamic';

function primaryCurrencyOf(
  bac: Record<string, string>,
  ev: Record<string, string>,
): string | null {
  const byBac = Object.entries(bac).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0];
  if (byBac) return byBac;
  return Object.entries(ev).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? null;
}

interface Props {
  searchParams: Promise<{ project?: string }>;
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session) redirect('/auth/signin');

  const tenantId = getDefaultTenantId();
  const t = await getTranslations('dashboard.admin.analytics');
  const tOe = await getTranslations('dashboard.admin.oe_scorecard');
  const locale = await getLocale();
  const { project: projectParam } = await searchParams;

  const projects = await getProjects();

  if (projects.length === 0) {
    return (
      <div className="flex min-h-[70vh] flex-col">
        <BrandHeading as="h1" size="h1">{t('heading')}</BrandHeading>
        <BrandEmpty
          className="flex-1"
          icon={<BarChart2 className="size-12 text-muted-foreground" aria-hidden="true" />}
          title={t('heading')}
          description={t('empty_no_projects')}
        />
      </div>
    );
  }

  const selected = projects.find((p) => p.id === projectParam) ?? projects[0];

  const [metrics, boq] = await Promise.all([
    getProjectMetrics(selected.id),
    getBoqProgress(selected.id),
  ]);

  const currency = primaryCurrencyOf(metrics.bacByCurrency, metrics.evByCurrency);
  const bac = currency ? metrics.bacByCurrency[currency] ?? null : null;
  const ev = currency ? metrics.evByCurrency[currency] ?? null : null;
  const pct =
    bac != null && Number(bac) > 0 && ev != null ? (Number(ev) / Number(bac)) * 100 : null;

  const topRemaining = [...boq]
    .filter((r) => r.remainingValue != null && Number(r.remainingValue) > 0)
    .sort((a, b) => Number(b.remainingValue) - Number(a.remainingValue))
    .slice(0, 5);

  // Office-engineer scorecard entry points (preserved feature) — tenant-scoped.
  const engineersResult = await db.execute(sql`
    SELECT DISTINCT u.id, u.name, u.email
    FROM users u
    INNER JOIN office_activity_log al ON al.actor_user_id = u.id
    WHERE al.tenant_id = ${tenantId}
    ORDER BY u.name, u.email
  `);
  const engineers = engineersResult.rows.map((r) => ({
    id: String(r.id),
    displayName: (r.name != null ? String(r.name) : null) ?? String(r.email ?? r.id),
    email: r.email != null ? String(r.email) : null,
  }));

  return (
    <div className="space-y-6">
      {/* Header + picker */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <BrandHeading as="h1" size="h1">{t('heading')}</BrandHeading>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <ProjectAnalyticsPicker
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          selectedId={selected.id}
        />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label={t('kpi_complete')}
          subLabel=""
          value={pct == null ? '—' : `${pct.toFixed(0)}%`}
          icon={<TrendingUp className="size-4" aria-hidden="true" />}
          valueColor={pct != null && pct >= 100 ? 'success' : 'default'}
        />
        <KpiCard
          label={t('kpi_earned')}
          subLabel=""
          value={currency ? formatMoneySymbol(ev ?? '0', currency, locale) : '—'}
          icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
          valueColor="success"
        />
        <KpiCard
          label={t('kpi_contract')}
          subLabel=""
          value={currency && bac != null ? formatMoneySymbol(bac, currency, locale) : '—'}
          icon={<FileSignature className="size-4" aria-hidden="true" />}
        />
        <KpiCard
          label={t('kpi_pending')}
          subLabel=""
          value={metrics.pendingCount}
          icon={<Clock className="size-4" aria-hidden="true" />}
          valueColor={metrics.pendingCount > 0 ? 'warning' : 'default'}
          drillHref="/dashboard/records?status=pending_audit"
        />
        <KpiCard
          label={t('kpi_rejection_rate')}
          subLabel=""
          value={metrics.rejectionRate == null ? '—' : `${(metrics.rejectionRate * 100).toFixed(0)}%`}
          icon={<XCircle className="size-4" aria-hidden="true" />}
          valueColor={metrics.rejectionRate != null && metrics.rejectionRate > 0.3 ? 'destructive' : 'default'}
        />
        <KpiCard
          label={t('kpi_avg_latency')}
          subLabel=""
          value={metrics.avgAuditLatencyHours == null ? '—' : `${metrics.avgAuditLatencyHours}${t('unit_hours')}`}
          icon={<Wallet className="size-4" aria-hidden="true" />}
        />
      </div>

      {/* BOQ burn-down */}
      <section className="space-y-3">
        <div className="space-y-1">
          <BrandHeading as="h2" size="h3">{t('burndown_heading')}</BrandHeading>
          <p className="text-sm text-muted-foreground">{t('burndown_sub')}</p>
        </div>
        <BrandCard>
          <BrandCard.Body className="p-0">
            {boq.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">{t('empty_no_boq')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {boq.map((item) => {
                  const pctItem = item.pctComplete;
                  const barPct = pctItem == null ? 0 : Math.max(0, Math.min(100, pctItem));
                  const complete = pctItem != null && pctItem >= 100;
                  return (
                    <li key={item.boqItemId} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                        <span className="min-w-0 truncate font-medium">{item.material}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatMoneyAmount(item.approvedQty, locale)} / {formatMoneyAmount(item.plannedQty, locale)} {item.unit}
                          {pctItem != null ? ` · ${pctItem.toFixed(0)}%` : ''}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-sky-500'}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {Number(item.pendingQty) > 0 ? (
                          <BrandBadge variant="warning">
                            {t('col_pending')}: {formatMoneyAmount(item.pendingQty, locale)} {item.unit}
                          </BrandBadge>
                        ) : null}
                        {item.earnedValue != null ? (
                          <span className="tabular-nums">
                            {t('col_earned')}: {formatMoneySymbol(item.earnedValue, item.currencyCode, locale)}
                          </span>
                        ) : null}
                        {item.remainingValue != null ? (
                          <span className="tabular-nums">
                            {t('col_remaining')}: {formatMoneySymbol(item.remainingValue, item.currencyCode, locale)}
                          </span>
                        ) : null}
                        {item.rejectedCount > 0 ? (
                          <BrandBadge variant="destructive">{item.rejectedCount}×</BrandBadge>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </BrandCard.Body>
        </BrandCard>
      </section>

      {/* Largest remaining value */}
      {topRemaining.length > 0 ? (
        <section className="space-y-3">
          <BrandHeading as="h2" size="h3">{t('insights_heading')}</BrandHeading>
          <BrandCard>
            <BrandCard.Body className="p-0">
              <ul className="divide-y divide-border">
                {topRemaining.map((item) => (
                  <li key={item.boqItemId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0 truncate text-sm">{item.material}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoneySymbol(item.remainingValue, item.currencyCode, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </BrandCard.Body>
          </BrandCard>
        </section>
      ) : null}

      {/* Team activity — office-engineer scorecards (preserved) */}
      {engineers.length > 0 ? (
        <section className="space-y-3">
          <div className="space-y-1">
            <BrandHeading as="h2" size="h3">{t('team_heading')}</BrandHeading>
            <p className="text-sm text-muted-foreground">{t('team_sub')}</p>
          </div>
          <BrandCard>
            <BrandCard.Body className="p-0">
              <ul className="divide-y divide-border">
                {engineers.map((eng) => (
                  <li key={eng.id}>
                    <Link
                      href={`/dashboard/analytics/office-engineers/${eng.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/50"
                    >
                      <span className="min-w-0 truncate text-sm font-medium">{eng.displayName}</span>
                      <span className="shrink-0 text-sm text-muted-foreground hover:underline">
                        {tOe('engineers_table_view')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </BrandCard.Body>
          </BrandCard>
        </section>
      ) : null}
    </div>
  );
}
