/**
 * People Directory — /dashboard/people
 *
 * Lists approved people (workers + auditors) across all projects as one
 * aggregated row per person, in Workers / Auditors tabs (D-69).
 *
 * A person who holds both roles appears in BOTH tabs (D-69 dual-role).
 *
 * PERF-05: Leaderboard mode — each tab has a "Rank by" selector that re-sorts
 * the already-fetched arrays using TypeScript sort helpers (no new SQL).
 * Rank column added to both tables with competition ranking (1,1,3).
 *
 * Security (T-08-05-IV): dates validated with isNaN before SQL.
 * Security (T-08-05-ID): project IDs passed as bound params through getPortfolioPeople.
 * Security (T-09-05-T): sortBy mapped through fixed allowlist in getWorkerSortFn/getAuditorSortFn.
 * FilterBar MUST be wrapped in <Suspense> (useSearchParams CSR bailout — RESEARCH Pitfall 3).
 * LeaderboardSortSelect MUST also be wrapped in <Suspense> (same reason).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowDown, ArrowUp, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FilterBar } from '@/components/admin/FilterBar';
import { LeaderboardSortSelect } from '@/components/admin/LeaderboardSortSelect';
import { getPortfolioPeople } from '@/actions/analytics';
import {
  getWorkerSortFn,
  getAuditorSortFn,
  addWorkerRanks,
  addAuditorRanks,
} from '@/lib/leaderboard-sort';
import { getProjects } from '@/actions/projects';
import { getTenantSettings } from '@/actions/settings';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{
    from?: string;
    to?: string;
    project?: string;
    role?: string;
    sortBy?: string;
  }>;
}

export default async function PeoplePage({ searchParams }: Props) {
  const { from, to, project, role, sortBy } = await searchParams;

  // T-08-05-IV: validate date strings before constructing Date objects
  const validatedFrom = from && !isNaN(Date.parse(from)) ? new Date(from) : undefined;
  const validatedTo = to && !isNaN(Date.parse(to)) ? new Date(to) : undefined;
  const dateRange =
    validatedFrom && validatedTo
      ? { from: validatedFrom, to: validatedTo }
      : undefined;
  const projectIds = project ? [project] : undefined;

  const t = await getTranslations('dashboard.admin.people');
  const tLeaderboard = await getTranslations('dashboard.admin.leaderboard');

  // CR-01 (09-REVIEW): fetch tenant settings to get auditSlaHours for the SLA breach rate column.
  // Fetch settings first, then run remaining queries in parallel — one extra serial step but
  // settings is a lightweight single-row query and the extra latency is negligible.
  const tenantSettings = await getTenantSettings();

  // Parallel fetch: workers tab + auditors tab + project options for FilterBar
  // auditSlaHours threads the threshold into the auditor bulk query so slaBreachRateDecided
  // is populated on each PortfolioAuditor row. The sort helper (getAuditorSortFn) then uses
  // that field when sortBy==='sla_breach'.
  const [workers, auditors, projectsData] = await Promise.all([
    getPortfolioPeople({ role: 'worker', dateRange, projectIds }),
    getPortfolioPeople({ role: 'auditor', dateRange, projectIds, auditSlaHours: tenantSettings.auditSlaHours }),
    getProjects(),
  ]);

  const activeTab = role === 'auditor' ? 'auditor' : 'worker';

  const projectOptions = projectsData.map((p) => ({ id: p.id, name: p.name }));

  // PERF-05: Sort workers and auditors using the sort helpers
  // T-09-05-T: sortBy is mapped through a fixed allowlist inside getWorkerSortFn/getAuditorSortFn
  const workerSortFn = getWorkerSortFn(sortBy);
  const sortedWorkers = [...workers].sort(workerSortFn);
  const rankedWorkers = addWorkerRanks(sortedWorkers, workerSortFn);

  const auditorSortFn = getAuditorSortFn(sortBy);
  const sortedAuditors = [...auditors].sort(auditorSortFn);
  const rankedAuditors = addAuditorRanks(sortedAuditors, auditorSortFn);

  // Active sort column tracking for header indicator
  const effectiveWorkerSort = sortBy && ['approved', 'rejected', 'rejection_rate', 'value'].includes(sortBy)
    ? sortBy
    : 'approved';
  const effectiveAuditorSort = sortBy && ['turnaround', 'decisions', 'backlog', 'sla_breach'].includes(sortBy)
    ? sortBy
    : 'turnaround';

  // Selector options — per tab
  const workerSortOptions = [
    { value: 'approved', label: tLeaderboard('worker_approved') },
    { value: 'rejected', label: tLeaderboard('worker_rejected') },
    { value: 'rejection_rate', label: tLeaderboard('worker_rejection_rate') },
    { value: 'value', label: tLeaderboard('worker_value') },
  ];
  const auditorSortOptions = [
    { value: 'turnaround', label: tLeaderboard('auditor_turnaround') },
    { value: 'decisions', label: tLeaderboard('auditor_decisions') },
    { value: 'backlog', label: tLeaderboard('auditor_backlog') },
    { value: 'sla_breach', label: tLeaderboard('auditor_sla_breach') },
  ];

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Filter bar — MUST be in Suspense (useSearchParams) */}
      <Suspense fallback={<div className="h-12 animate-pulse bg-muted rounded" />}>
        <FilterBar projectOptions={projectOptions} />
      </Suspense>

      {/* Workers / Auditors tabs */}
      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="worker">{t('tab_workers')}</TabsTrigger>
          <TabsTrigger value="auditor">{t('tab_auditors')}</TabsTrigger>
        </TabsList>

        {/* Workers tab */}
        <TabsContent value="worker" className="mt-4">
          {/* Rank-by selector row — right aligned */}
          <div className="flex justify-end mb-3">
            <Suspense fallback={<div className="h-9 w-48 animate-pulse bg-muted rounded" />}>
              <LeaderboardSortSelect
                options={workerSortOptions}
                currentValue={effectiveWorkerSort}
                label={tLeaderboard('rank_by_label')}
              />
            </Suspense>
          </div>

          {rankedWorkers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
              <Users className="size-12" />
              <p className="text-sm">{t('empty_state')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Rank column — no sort indicator */}
                    <TableHead scope="col" aria-label="Rank" className="w-12">
                      {t('col_rank')}
                    </TableHead>
                    <TableHead>{t('col_name')}</TableHead>
                    <TableHead className="text-right tabular-nums">{t('col_submissions')}</TableHead>
                    <TableHead className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {t('col_approved')}
                        {effectiveWorkerSort === 'approved' && (
                          <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        )}
                      </span>
                    </TableHead>
                    <TableHead className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {t('col_rejected')}
                        {effectiveWorkerSort === 'rejected' && (
                          <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        )}
                      </span>
                    </TableHead>
                    <TableHead className="text-right tabular-nums">{t('col_pending')}</TableHead>
                    <TableHead className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {t('col_value')}
                        {effectiveWorkerSort === 'value' && (
                          <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        )}
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankedWorkers.map((w) => {
                    const total =
                      w.submissionsApproved + w.submissionsRejected + w.submissionsPending;
                    // Display first available currency value or "—"
                    const currencies = Object.keys(w.valueContributedByCurrency);
                    const valueDisplay =
                      currencies.length > 0
                        ? w.valueContributedByCurrency[currencies[0]]
                        : '—';

                    return (
                      <TableRow key={w.personId}>
                        {/* Rank cell */}
                        <TableCell>
                          {w.rank === 1 && (
                            <Badge className="bg-primary text-primary-foreground">{w.rank}</Badge>
                          )}
                          {w.rank > 1 && w.rank <= 3 && (
                            <Badge variant="secondary">{w.rank}</Badge>
                          )}
                          {w.rank > 3 && (
                            <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                              {w.rank}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/dashboard/people/${w.personId}`}
                            className="hover:underline font-medium"
                          >
                            {w.displayName}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {new Intl.NumberFormat('tr-TR').format(total)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-emerald-100 text-emerald-800">
                            {new Intl.NumberFormat('tr-TR').format(w.submissionsApproved)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="destructive">
                            {new Intl.NumberFormat('tr-TR').format(w.submissionsRejected)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">
                            {new Intl.NumberFormat('tr-TR').format(w.submissionsPending)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {valueDisplay}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Auditors tab */}
        <TabsContent value="auditor" className="mt-4">
          {/* Rank-by selector row — right aligned */}
          <div className="flex justify-end mb-3">
            <Suspense fallback={<div className="h-9 w-48 animate-pulse bg-muted rounded" />}>
              <LeaderboardSortSelect
                options={auditorSortOptions}
                currentValue={effectiveAuditorSort}
                label={tLeaderboard('rank_by_label')}
              />
            </Suspense>
          </div>

          {rankedAuditors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
              <Users className="size-12" />
              <p className="text-sm">{t('empty_state')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Rank column — no sort indicator */}
                    <TableHead scope="col" aria-label="Rank" className="w-12">
                      {t('col_rank')}
                    </TableHead>
                    <TableHead>{t('col_name')}</TableHead>
                    <TableHead className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {t('col_decisions')}
                        {effectiveAuditorSort === 'decisions' && (
                          <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        )}
                      </span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="inline-flex items-center gap-1">
                        {t('col_turnaround')}
                        {effectiveAuditorSort === 'turnaround' && (
                          <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        )}
                      </span>
                    </TableHead>
                    <TableHead className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {t('col_backlog')}
                        {effectiveAuditorSort === 'backlog' && (
                          <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        )}
                      </span>
                    </TableHead>
                    {/* WR-05 (09-REVIEW): SLA breach rate column — only visible when threshold is configured.
                        Provides a sort-direction indicator when effectiveAuditorSort==='sla_breach'. */}
                    <TableHead className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {tLeaderboard('auditor_sla_breach')}
                        {effectiveAuditorSort === 'sla_breach' && (
                          <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        )}
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankedAuditors.map((a) => {
                    const turnaroundDisplay =
                      a.avgDecisionLatencyHours !== null
                        ? `${a.avgDecisionLatencyHours.toFixed(1)} sa`
                        : '—';
                    const backlogVariant =
                      a.pendingBacklogCount > 5 ? 'destructive' : 'secondary';
                    // WR-05 / CR-01: display breach rate as percentage; null → '—'
                    const breachRateDisplay =
                      a.slaBreachRateDecided !== null
                        ? `${(a.slaBreachRateDecided * 100).toFixed(0)}%`
                        : '—';
                    const breachVariant =
                      a.slaBreachRateDecided !== null && a.slaBreachRateDecided > 0.2
                        ? 'destructive'
                        : 'secondary';

                    return (
                      <TableRow key={a.personId}>
                        {/* Rank cell */}
                        <TableCell>
                          {a.rank === 1 && (
                            <Badge className="bg-primary text-primary-foreground">{a.rank}</Badge>
                          )}
                          {a.rank > 1 && a.rank <= 3 && (
                            <Badge variant="secondary">{a.rank}</Badge>
                          )}
                          {a.rank > 3 && (
                            <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                              {a.rank}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/dashboard/people/${a.personId}`}
                            className="hover:underline font-medium"
                          >
                            {a.displayName}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {new Intl.NumberFormat('tr-TR').format(a.decisionsCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {turnaroundDisplay}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={backlogVariant}>
                            {new Intl.NumberFormat('tr-TR').format(a.pendingBacklogCount)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {breachRateDisplay !== '—' ? (
                            <Badge variant={breachVariant}>{breachRateDisplay}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
