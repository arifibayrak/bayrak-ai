/**
 * Person Profile Page — /dashboard/people/[personId]
 *
 * Shows KPI cards (worker + auditor, dual-role = 8 cards with Separator)
 * and a grouped activity timeline for both worker submissions and auditor decisions.
 *
 * Security (T-08-05-IV): personId/dates parameterized via analytics function bound params.
 * Security (T-08-05-ID): tenant-scoped queries; approved people only (pending_people excluded).
 * Security (T-08-05-XSS): no dangerouslySetInnerHTML; React auto-escapes all fields.
 *
 * FilterBar MUST be in Suspense (RESEARCH Pitfall 3 — useSearchParams CSR bailout).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle2,
  XCircle,
  MapPin,
  DollarSign,
  Gavel,
  Clock,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { getPersonMetrics, getCanonicalSubmissions, getAuditorDecisions } from '@/actions/analytics';
import { getActivePeople } from '@/actions/people';
import { getProjects } from '@/actions/projects';
import { FilterBar } from '@/components/admin/FilterBar';
import { KpiCard } from '@/components/admin/KpiCard';
import { ActivityTimeline, type TimelineEntry } from '@/components/admin/ActivityTimeline';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ from?: string; to?: string; project?: string }>;
}

export default async function PersonProfilePage({ params, searchParams }: Props) {
  const { personId } = await params;
  const { from, to, project } = await searchParams;

  // T-08-05-IV: validate date strings before constructing Date objects
  const validatedFrom = from && !isNaN(Date.parse(from)) ? new Date(from) : undefined;
  const validatedTo = to && !isNaN(Date.parse(to)) ? new Date(to) : undefined;
  const dateRange =
    validatedFrom && validatedTo
      ? { from: validatedFrom, to: validatedTo }
      : undefined;
  const projectIds = project ? [project] : undefined;

  const t = await getTranslations('dashboard.admin.people');
  const tTimeline = await getTranslations('dashboard.admin.timeline');

  // Check person existence + determine roles from assignments
  const [activePeople, projectsData] = await Promise.all([
    getActivePeople(),
    getProjects(),
  ]);

  const personRows = activePeople.filter((p) => p.personId === personId);
  if (personRows.length === 0) {
    notFound();
  }

  const displayName = personRows[0].displayName;
  const roles = new Set(
    personRows
      .map((r) => r.roleOnProject)
      .filter((role): role is 'worker' | 'auditor' => role === 'worker' || role === 'auditor'),
  );
  const isWorker = roles.has('worker');
  const isAuditor = roles.has('auditor');

  // Parallel fetch: metrics + timeline data (scoped by dateRange + projectIds)
  const [workerMetrics, auditorMetrics, workerSubmissions, auditorDecisions] = await Promise.all([
    isWorker
      ? getPersonMetrics(personId, { asAuditor: false, dateRange, projectIds })
      : null,
    isAuditor
      ? getPersonMetrics(personId, { asAuditor: true, dateRange, projectIds })
      : null,
    isWorker
      ? getCanonicalSubmissions({ personId, from: dateRange?.from, to: dateRange?.to, projectIds, limit: 100 })
      : Promise.resolve([]),
    isAuditor
      ? getAuditorDecisions({ personId, dateRange, projectIds, limit: 100 })
      : Promise.resolve([]),
  ]);

  const projectOptions = projectsData.map((p) => ({ id: p.id, name: p.name }));

  // Map worker submissions to TimelineEntry
  const workerEntries: TimelineEntry[] = workerSubmissions.map((s) => ({
    id: s.id,
    status: s.status,
    material: s.material,
    unit: s.unit,
    quantity: s.quantity,
    dateStr: new Date(s.submittedAt).toLocaleDateString('tr-TR'),
    date: new Date(s.submittedAt),
  }));

  // Map auditor decisions to TimelineEntry
  const auditorEntries: TimelineEntry[] = auditorDecisions.map((d) => ({
    id: d.submissionId,
    status: d.status,
    material: d.material,
    unit: d.unit,
    quantity: d.quantity,
    dateStr: new Date(d.decidedAt).toLocaleDateString('tr-TR'),
    date: new Date(d.decidedAt),
    workerName: d.workerName,
    latencyLabel:
      d.auditLatencyHours !== null ? `${d.auditLatencyHours.toFixed(1)} ${t('unit_hours')}` : undefined,
  }));

  // Worker KPI values
  const workerApproved = workerMetrics?.submissionsApproved ?? 0;
  const workerRejected = workerMetrics?.submissionsRejected ?? 0;
  const workerPending = workerMetrics?.submissionsPending ?? 0;
  const workerTotal = workerApproved + workerRejected + workerPending;
  const workerDecided = workerApproved + workerRejected;
  // WR-03: include '%' only when rate is a real number; omit it for the em-dash placeholder
  const workerRejectionRateLabel =
    workerDecided > 0 ? `${((workerRejected / workerDecided) * 100).toFixed(1)}%` : '—';
  const workerLocationRate =
    workerMetrics?.locationComplianceRate !== null && workerMetrics?.locationComplianceRate !== undefined
      ? `${(workerMetrics.locationComplianceRate * 100).toFixed(1)}%`
      : '—';
  const workerCurrencies = Object.keys(workerMetrics?.valueContributedByCurrency ?? {});
  const workerValueDisplay =
    workerCurrencies.length > 0
      ? workerMetrics!.valueContributedByCurrency[workerCurrencies[0]]
      : '—';

  // Auditor KPI values
  const auditorDecisionsCount = auditorMetrics?.decisionsCount ?? 0;
  // CR-02: count decisions with status='approved' from the already-fetched auditorDecisions array.
  // Using auditorMetrics.submissionsApproved was wrong — that field counts this person's OWN
  // worker submissions that got approved, not the decisions they made as an auditor.
  const auditorApprovedDecisions = auditorDecisions.filter((d) => d.status === 'approved').length;
  const auditorApprovalRate =
    auditorDecisionsCount > 0
      ? `${((auditorApprovedDecisions / auditorDecisionsCount) * 100).toFixed(1)}%`
      : '—';
  const auditorAvgTurnaround =
    auditorMetrics?.avgDecisionLatencyHours !== null &&
    auditorMetrics?.avgDecisionLatencyHours !== undefined
      ? `${(auditorMetrics.avgDecisionLatencyHours ?? 0).toFixed(1)} ${t('unit_hours')}`
      : '—';
  const auditorPendingBacklog = auditorMetrics?.pendingBacklogCount ?? 0;

  const hasNoRecords = !isWorker && !isAuditor;

  return (
    <div className="space-y-6">
      {/* Breadcrumb back link */}
      <nav className="text-sm text-muted-foreground">
        <Link href="/dashboard/people" className="hover:underline">
          {t('back_to_people')}
        </Link>
      </nav>

      {/* Person name + role badges */}
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{displayName}</h1>
        <div className="flex gap-2 flex-wrap">
          {isWorker && (
            <Badge variant="secondary">{t('role_worker')}</Badge>
          )}
          {isAuditor && (
            <Badge variant="secondary">{t('role_auditor')}</Badge>
          )}
        </div>
      </div>

      {/* Filter bar — MUST be in Suspense (useSearchParams) */}
      <Suspense fallback={<div className="h-12 animate-pulse bg-muted rounded" />}>
        <FilterBar projectOptions={projectOptions} />
      </Suspense>

      {/* KPI cards */}
      {hasNoRecords ? (
        <Alert>
          <AlertDescription>{t('no_records_alert')}</AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-6">
          {/* Worker KPI section */}
          {isWorker && workerMetrics && (
            <div className="space-y-3">
              {(isWorker && isAuditor) && (
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {t('kpi_worker_metrics')}
                </h2>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <KpiCard
                  label={t('col_approved')}
                  subLabel=""
                  value={new Intl.NumberFormat('tr-TR').format(workerApproved)}
                  icon={<CheckCircle2 className="size-5 text-muted-foreground" />}
                  valueColor="success"
                />
                <KpiCard
                  label={t('col_rejected')}
                  subLabel={workerRejectionRateLabel}
                  value={new Intl.NumberFormat('tr-TR').format(workerRejected)}
                  icon={<XCircle className="size-5 text-muted-foreground" />}
                  valueColor="destructive"
                />
                <KpiCard
                  label={t('col_location_compliance')}
                  subLabel=""
                  value={workerLocationRate}
                  icon={<MapPin className="size-5 text-muted-foreground" />}
                />
                <KpiCard
                  label={t('col_value')}
                  subLabel=""
                  value={workerValueDisplay}
                  icon={<DollarSign className="size-5 text-muted-foreground" />}
                />
              </div>
            </div>
          )}

          {/* Separator between worker and auditor sections */}
          {isWorker && isAuditor && <Separator />}

          {/* Auditor KPI section */}
          {isAuditor && auditorMetrics && (
            <div className="space-y-3">
              {(isWorker && isAuditor) && (
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {t('kpi_auditor_metrics')}
                </h2>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <KpiCard
                  label={t('col_decisions')}
                  subLabel=""
                  value={new Intl.NumberFormat('tr-TR').format(auditorDecisionsCount)}
                  icon={<Gavel className="size-5 text-muted-foreground" />}
                />
                <KpiCard
                  label={t('col_approval_rate')}
                  subLabel=""
                  value={auditorApprovalRate}
                  icon={<TrendingUp className="size-5 text-muted-foreground" />}
                  valueColor="success"
                />
                <KpiCard
                  label={t('col_turnaround')}
                  subLabel=""
                  value={auditorAvgTurnaround}
                  icon={<Clock className="size-5 text-muted-foreground" />}
                />
                <KpiCard
                  label={t('col_backlog')}
                  subLabel=""
                  value={new Intl.NumberFormat('tr-TR').format(auditorPendingBacklog)}
                  icon={<AlertTriangle className="size-5 text-muted-foreground" />}
                  valueColor={auditorPendingBacklog > 5 ? 'destructive' : 'default'}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activity timeline */}
      <div className="space-y-4">
        <Separator />
        <h2 className="text-base font-semibold">
          {tTimeline('heading')}
        </h2>

        {isWorker && (
          <div className="space-y-2">
            {isAuditor && (
              <h3 className="text-sm font-semibold text-muted-foreground">
                {t('role_worker')}
              </h3>
            )}
            <ActivityTimeline mode="worker" entries={workerEntries} />
          </div>
        )}

        {isAuditor && (
          <div className="space-y-2">
            {isWorker && (
              <h3 className="text-sm font-semibold text-muted-foreground">
                {t('role_auditor')}
              </h3>
            )}
            <ActivityTimeline mode="auditor" entries={auditorEntries} />
          </div>
        )}
      </div>
    </div>
  );
}
