import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { formatMoneyAmount } from '@/lib/format-money';
import { FileX } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { auth } from '@/lib/auth';
import { getPeriodsByProject } from '@/actions/hakedis';
import { getProjects } from '@/actions/projects';
import { HakedisCreateDialog } from '@/components/admin/HakedisCreateDialog';
import { HakedisStatusBadge } from '@/components/admin/HakedisStatusBadge';
import { DeletePeriodDialog } from '@/components/admin/DeletePeriodDialog';
import { HakedisProjectFilter } from '@/components/admin/HakedisProjectFilter';

export const dynamic = 'force-dynamic';

/**
 * Hakkediş Period List Page
 *
 * Replaces the Phase 8 coming-soon stub.
 * UI-SPEC Surface 1: project filter, period table, status badges, net payable,
 * Actions column (Aç / Open Period always; Sil only for draft rows per D-97).
 *
 * Security (T-10-03-EoP): auth() redirect is the first statement.
 * Security (T-10-03-IDOR): getPeriodsByProject is tenant-scoped server-side.
 * CSR bailout: HakedisProjectFilter (useSearchParams) is wrapped in <Suspense>.
 */

interface Props {
  searchParams: Promise<{
    project?: string;
  }>;
}

// Format a date string (YYYY-MM-DD or ISO) as dd.MM.yyyy (Turkish format)
function formatDateTR(dateStr: string): string {
  // Handles both YYYY-MM-DD and ISO with time
  const raw = dateStr.split('T')[0];
  const parts = raw.split('-');
  if (parts.length !== 3) return dateStr;
  const [yyyy, mm, dd] = parts;
  return `${dd}.${mm}.${yyyy}`;
}

export default async function HakedisPage({ searchParams }: Props) {
  // T-10-03-EoP: auth guard — first statement
  const session = await auth();
  if (!session) redirect('/auth/signin');

  const t = await getTranslations('dashboard.admin.hakedis');
  const locale = await getLocale();

  const { project: projectParam } = await searchParams;

  // Fetch projects for the filter select
  const allProjects = await getProjects();

  // Sort alphabetically by name for the default selection
  const sortedProjects = [...allProjects].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Default to the param project, or the first alphabetically
  const selectedProjectId =
    projectParam && sortedProjects.some((p) => p.id === projectParam)
      ? projectParam
      : sortedProjects[0]?.id ?? '';

  // Fetch periods for the selected project (auth + tenant-scoped in action)
  const periods =
    selectedProjectId ? await getPeriodsByProject(selectedProjectId) : [];

  const projectOptions = sortedProjects.map((p) => ({
    id: p.id,
    name: p.name,
  }));

  return (
    <div className="space-y-6">
      {/* Heading row: title/subtitle left, Create CTA right */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{t('heading')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {selectedProjectId && (
          <HakedisCreateDialog projectId={selectedProjectId} />
        )}
      </div>

      {/* Project filter (client component — uses useSearchParams, must be in Suspense) */}
      {projectOptions.length > 0 && (
        <Suspense fallback={
          <div className="h-9 w-[200px] animate-pulse rounded-md bg-muted" />
        }>
          <HakedisProjectFilter
            projects={projectOptions}
            selectedProjectId={selectedProjectId}
          />
        </Suspense>
      )}

      {/* Period table or empty state */}
      {selectedProjectId && periods.length === 0 ? (
        /* Empty state (no periods for project) */
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FileX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-semibold">{t('empty_heading')}</p>
          <p className="text-sm text-muted-foreground">{t('empty_body')}</p>
        </div>
      ) : !selectedProjectId ? (
        /* No projects at all */
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FileX className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-semibold">{t('empty_heading')}</p>
          <p className="text-sm text-muted-foreground">{t('empty_body')}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('col_period')}</TableHead>
              <TableHead scope="col" className="w-[140px]">{t('col_end_date')}</TableHead>
              <TableHead scope="col" className="w-[80px]">{t('col_currency')}</TableHead>
              <TableHead scope="col" className="w-[120px]">{t('col_status')}</TableHead>
              <TableHead
                scope="col"
                className="w-[140px] text-right tabular-nums"
              >
                {t('col_net_payment')}
              </TableHead>
              <TableHead scope="col" className="w-[120px]">{t('col_actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.map((period) => (
              <TableRow key={period.id}>
                {/* Dönem — links to detail */}
                <TableCell>
                  <Link
                    href={`/dashboard/hakedis/${period.id}`}
                    className="font-medium hover:underline"
                  >
                    {period.periodNumber}
                  </Link>
                </TableCell>

                {/* Bitiş Tarihi — dd.MM.yyyy */}
                <TableCell className="text-sm">
                  {formatDateTR(period.periodEndDate)}
                </TableCell>

                {/* Para Birimi */}
                <TableCell className="text-sm">
                  {period.currencyCode}
                </TableCell>

                {/* Durum — status badge */}
                <TableCell>
                  <HakedisStatusBadge
                    status={period.status as 'draft' | 'finalized' | 'submitted' | 'paid'}
                  />
                </TableCell>

                {/* Net Ödeme — tabular-nums, right-aligned; "—" when null.
                    Money math (CR-01): precision-safe via formatMoneyAmount
                    (decimal.js round → BigInt locale grouping; no JS float). */}
                <TableCell
                  className="text-right tabular-nums text-sm"
                  aria-label={`${t('col_net_payment')}: ${formatMoneyAmount(period.netByDisplay, locale)} ${period.currencyCode}`}
                >
                  {formatMoneyAmount(period.netByDisplay, locale)}
                </TableCell>

                {/* Actions: "Aç / Open Period" always + "Sil" only for draft */}
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/hakedis/${period.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {t('open_link')}
                    </Link>
                    {period.status === 'draft' && (
                      <DeletePeriodDialog
                        periodId={period.id}
                        periodNumber={period.periodNumber}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
