/**
 * Records list page — /dashboard/records
 *
 * Cross-project filterable and paginated records list. D-74: drill-only (no sidebar item).
 * Reachable from any metric drill-down on the Overview page and from the project Kayitlar tab.
 *
 * Pagination: limit+1 lookahead approach — getCanonicalSubmissions returns no total count.
 * Fetch PAGE_SIZE+1 rows; if rows.length > PAGE_SIZE then a next page exists. Trim to PAGE_SIZE
 * before rendering. This avoids an extra COUNT(*) query at the cost of not knowing exact page total.
 *
 * Security (T-08-06-IV):
 *   - from/to strings validated with isNaN guard before Date construction
 *   - status cast to union type or undefined; invalid strings produce undefined (no SQL reach)
 *   - page parsed with parseInt + Math.max (guarantees >= 1, NaN → 1)
 *   - All values reach SQL only as Drizzle bound params via getCanonicalSubmissions
 *
 * Filters propagate to the detail page so the back link can restore the user's context.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { FileSearch } from 'lucide-react';
import { getCanonicalSubmissions } from '@/actions/analytics';
import { getProjects } from '@/actions/projects';
import { getActivePeople } from '@/actions/people';
import { FilterBar } from '@/components/admin/FilterBar';
import {
  BrandBadge,
  BrandCard,
  BrandHeading,
  BrandTable,
  brandButtonVariants,
} from '@/components/brand';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

const VALID_STATUSES = new Set(['pending_audit', 'approved', 'rejected'] as const);

function parseStatus(s: string | undefined): 'pending_audit' | 'approved' | 'rejected' | undefined {
  if (s && VALID_STATUSES.has(s as 'pending_audit' | 'approved' | 'rejected')) {
    return s as 'pending_audit' | 'approved' | 'rejected';
  }
  return undefined;
}

interface Props {
  searchParams: Promise<{
    from?: string;
    to?: string;
    project?: string;
    person?: string;
    status?: string;
    page?: string;
  }>;
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status, t }: {
  status: 'pending_audit' | 'approved' | 'rejected';
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const label =
    status === 'approved' ? t('filters.status_approved') :
    status === 'rejected' ? t('filters.status_rejected') :
    t('filters.status_pending');

  if (status === 'approved') {
    return <BrandBadge variant="success">{label}</BrandBadge>;
  }
  if (status === 'rejected') {
    return <BrandBadge variant="destructive">{label}</BrandBadge>;
  }
  return <BrandBadge variant="info">{label}</BrandBadge>;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function RecordsPage({ searchParams }: Props) {
  const { from, to, project, person, status, page } = await searchParams;

  // T-08-06-IV: validate date strings before creating Date objects
  const validatedFrom =
    from && !isNaN(Date.parse(from)) ? new Date(from) : undefined;
  const validatedTo =
    to && !isNaN(Date.parse(to)) ? new Date(to) : undefined;

  // T-08-06-IV: validate status enum
  const validatedStatus = parseStatus(status);

  // T-08-06-IV: validate page number
  const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;

  const t = await getTranslations('dashboard.admin');

  // Parallel fetch: records (with +1 lookahead) + filter option lists
  const [rowsRaw, projectsData, activePeople] = await Promise.all([
    getCanonicalSubmissions({
      from: validatedFrom,
      to: validatedTo,
      projectIds: project ? [project] : undefined,
      personId: person || undefined,
      status: validatedStatus,
      limit: PAGE_SIZE + 1,
      offset: (pageNum - 1) * PAGE_SIZE,
    }),
    getProjects(),
    getActivePeople(),
  ]);

  // Lookahead: does a next page exist?
  const hasNextPage = rowsRaw.length > PAGE_SIZE;
  const rows = hasNextPage ? rowsRaw.slice(0, PAGE_SIZE) : rowsRaw;

  // Build filter option lists for FilterBar
  const projectOptions = projectsData.map((p) => ({ id: p.id, name: p.name }));
  const personOptions = Array.from(
    new Map(
      activePeople.map((p) => [
        p.personId,
        { id: p.personId, name: p.displayName ?? p.telegramName ?? p.personId },
      ])
    ).values()
  );

  // Build a query string from active filter params so the detail page can offer
  // a filter-preserving back link
  const activeParams = new URLSearchParams();
  if (from) activeParams.set('from', from);
  if (to) activeParams.set('to', to);
  if (project) activeParams.set('project', project);
  if (person) activeParams.set('person', person);
  if (status) activeParams.set('status', status);
  const filterQs = activeParams.toString();

  // Pagination hrefs — preserve all filters except page
  const buildPageHref = (p: number): string => {
    const params = new URLSearchParams(activeParams);
    params.set('page', String(p));
    return `/dashboard/records?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <BrandHeading as="h1" size="h1">{t('records.heading')}</BrandHeading>
      </div>

      {/* Filter bar — Suspense required (useSearchParams CSR bailout) */}
      <BrandCard>
        <BrandCard.Body className="p-3">
          <Suspense
            fallback={
              <div className="h-12 animate-pulse bg-muted rounded" />
            }
          >
            <FilterBar
              projectOptions={projectOptions}
              personOptions={personOptions}
              showStatus
            />
          </Suspense>
        </BrandCard.Body>
      </BrandCard>

      {/* Records table */}
      {rows.length === 0 ? (
        <BrandCard>
          <BrandCard.Body className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
            <FileSearch className="size-12" aria-hidden="true" />
            <p className="text-sm">{t('records.empty')}</p>
          </BrandCard.Body>
        </BrandCard>
      ) : (
        <>
          <BrandCard>
            <BrandCard.Body className="p-0 overflow-x-auto">
              <BrandTable.Root>
                <BrandTable.Header>
                  <BrandTable.Row>
                    <BrandTable.Head scope="col">{t('records.col_status')}</BrandTable.Head>
                    <BrandTable.Head scope="col">{t('records.col_worker')}</BrandTable.Head>
                    <BrandTable.Head scope="col">{t('records.col_project')}</BrandTable.Head>
                    <BrandTable.Head scope="col">{t('records.col_boq')}</BrandTable.Head>
                    <BrandTable.Head scope="col" className="text-right">{t('records.col_quantity')}</BrandTable.Head>
                    <BrandTable.Head scope="col">{t('records.col_submitted')}</BrandTable.Head>
                    <BrandTable.Head scope="col">{t('records.col_auditor')}</BrandTable.Head>
                    {/* sr-only for Actions column per UI-SPEC accessibility */}
                    <BrandTable.Head scope="col" className="sr-only">{t('records.details_header')}</BrandTable.Head>
                  </BrandTable.Row>
                </BrandTable.Header>
                <BrandTable.Body>
                  {rows.map((row) => {
                    const detailHref = filterQs
                      ? `/dashboard/records/${row.id}?${filterQs}`
                      : `/dashboard/records/${row.id}`;
                    const qty = parseFloat(row.quantity);
                    const qtyStr = isNaN(qty)
                      ? row.quantity
                      : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(qty);

                    return (
                      <BrandTable.Row key={row.id}>
                        <BrandTable.Cell>
                          <StatusBadge status={row.status} t={t} />
                        </BrandTable.Cell>
                        <BrandTable.Cell className="text-sm">{row.workerName}</BrandTable.Cell>
                        <BrandTable.Cell className="text-sm">{row.projectName}</BrandTable.Cell>
                        <BrandTable.Cell className="text-sm">{row.material}</BrandTable.Cell>
                        <BrandTable.Cell className="text-sm text-right tabular-nums">
                          {qtyStr} {row.unit}
                        </BrandTable.Cell>
                        <BrandTable.Cell className="text-sm tabular-nums text-muted-foreground">
                          {new Date(row.submittedAt).toLocaleDateString('tr-TR')}
                        </BrandTable.Cell>
                        <BrandTable.Cell className="text-sm">{row.auditorName ?? '—'}</BrandTable.Cell>
                        <BrandTable.Cell>
                          <Link
                            href={detailHref}
                            className={cn(brandButtonVariants({ variant: 'ghost', size: 'sm' }))}
                          >
                            {t('records.details')}
                          </Link>
                        </BrandTable.Cell>
                      </BrandTable.Row>
                    );
                  })}
                </BrandTable.Body>
              </BrandTable.Root>
            </BrandCard.Body>
          </BrandCard>

          {/* Pagination: prev/next (lookahead approach — no exact page count) */}
          <div className="flex items-center justify-between gap-4 pt-2">
            {pageNum > 1 ? (
              <Link
                href={buildPageHref(pageNum - 1)}
                className={cn(brandButtonVariants({ variant: 'outline', size: 'sm' }))}
              >
                {t('records.prev')}
              </Link>
            ) : (
              <span
                className={cn(brandButtonVariants({ variant: 'outline', size: 'sm' }), 'pointer-events-none opacity-50')}
                aria-disabled="true"
              >
                {t('records.prev')}
              </span>
            )}

            {/* WR-05: show current page number only — lookahead gives no real total page count.
                Fabricating "Page N of N+1" is actively misleading on large datasets. */}
            <span className="text-sm text-muted-foreground tabular-nums">
              {t('records.pagination_page_only', { page: pageNum })}
            </span>

            {hasNextPage ? (
              <Link
                href={buildPageHref(pageNum + 1)}
                className={cn(brandButtonVariants({ variant: 'outline', size: 'sm' }))}
              >
                {t('records.next')}
              </Link>
            ) : (
              <span
                className={cn(brandButtonVariants({ variant: 'outline', size: 'sm' }), 'pointer-events-none opacity-50')}
                aria-disabled="true"
              >
                {t('records.next')}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
