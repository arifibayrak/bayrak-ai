/**
 * People Directory — /dashboard/people
 *
 * Lists approved people (workers + auditors) across all projects as one
 * aggregated row per person, in Workers / Auditors tabs (D-69).
 *
 * A person who holds both roles appears in BOTH tabs (D-69 dual-role).
 *
 * Security (T-08-05-IV): dates validated with isNaN before SQL.
 * Security (T-08-05-ID): project IDs passed as bound params through getPortfolioPeople.
 * FilterBar MUST be wrapped in <Suspense> (useSearchParams CSR bailout — RESEARCH Pitfall 3).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Users } from 'lucide-react';
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
import { getPortfolioPeople } from '@/actions/analytics';
import { getProjects } from '@/actions/projects';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{
    from?: string;
    to?: string;
    project?: string;
    role?: string;
  }>;
}

export default async function PeoplePage({ searchParams }: Props) {
  const { from, to, project, role } = await searchParams;

  // T-08-05-IV: validate date strings before constructing Date objects
  const validatedFrom = from && !isNaN(Date.parse(from)) ? new Date(from) : undefined;
  const validatedTo = to && !isNaN(Date.parse(to)) ? new Date(to) : undefined;
  const dateRange =
    validatedFrom && validatedTo
      ? { from: validatedFrom, to: validatedTo }
      : undefined;
  const projectIds = project ? [project] : undefined;

  const t = await getTranslations('dashboard.admin.people');

  // Parallel fetch: workers tab + auditors tab + project options for FilterBar
  const [workers, auditors, projectsData] = await Promise.all([
    getPortfolioPeople({ role: 'worker', dateRange, projectIds }),
    getPortfolioPeople({ role: 'auditor', dateRange, projectIds }),
    getProjects(),
  ]);

  const activeTab = role === 'auditor' ? 'auditor' : 'worker';

  const projectOptions = projectsData.map((p) => ({ id: p.id, name: p.name }));

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
          {workers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
              <Users className="size-12" />
              <p className="text-sm">{t('empty_state')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('col_name')}</TableHead>
                    <TableHead className="text-right tabular-nums">{t('col_submissions')}</TableHead>
                    <TableHead className="text-right tabular-nums">{t('col_approved')}</TableHead>
                    <TableHead className="text-right tabular-nums">{t('col_rejected')}</TableHead>
                    <TableHead className="text-right tabular-nums">{t('col_pending')}</TableHead>
                    <TableHead className="text-right tabular-nums">{t('col_value')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workers.map((w) => {
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
          {auditors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
              <Users className="size-12" />
              <p className="text-sm">{t('empty_state')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('col_name')}</TableHead>
                    <TableHead className="text-right tabular-nums">{t('col_decisions')}</TableHead>
                    <TableHead className="text-right">{t('col_turnaround')}</TableHead>
                    <TableHead className="text-right tabular-nums">{t('col_backlog')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditors.map((a) => {
                    const turnaroundDisplay =
                      a.avgDecisionLatencyHours !== null
                        ? `${a.avgDecisionLatencyHours.toFixed(1)} sa`
                        : '—';
                    const backlogVariant =
                      a.pendingBacklogCount > 5 ? 'destructive' : 'secondary';

                    return (
                      <TableRow key={a.personId}>
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
