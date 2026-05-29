import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { FileSpreadsheet, FileText, FileX, Download } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getProjects } from '@/actions/projects';
import { getAllFinishedPeriods } from '@/actions/analytics';
import { FilterBar } from '@/components/admin/FilterBar';
import { HakedisStatusBadge } from '@/components/admin/HakedisStatusBadge';
import { formatMoneyAmount } from '@/lib/format-money';
import {
  BrandButton,
  BrandCard,
  BrandHeading,
  BrandTable,
} from '@/components/brand';

export const dynamic = 'force-dynamic';

/**
 * Exports Hub Page — Phase 11 / Plan 11-05.
 *
 * Replaces the Phase 8 coming-soon stub at `/dashboard/exports`.
 * Implements UI-SPEC Surface 1 (Exports Hub Page): three trigger sections
 * (Submission Ledger, Performance Summary, Hakkediş Files) plus the global
 * FilterBar wrapped in <Suspense> for the useSearchParams CSR bailout.
 *
 * D-108 distributed + hub UX: hub hosts the three trigger surfaces; all four
 * route handlers (EXP-01 / EXP-02 / EXP-03 / EXP-04) are linked via simple
 * <a href download> anchors — NO duplication of generation logic.
 *
 * Security:
 *   T-11-05-AUTH (Spoofing): auth() is the FIRST statement; redirect on null.
 *                            Page-level redirect mirrors hakedis/page.tsx
 *                            (D-114). Route handlers are independently
 *                            auth-guarded (defense in depth).
 *   T-11-05-IDOR (Info Disclosure): getAllFinishedPeriods is tenant-scoped
 *                                   in src/actions/analytics.ts.
 *   T-11-05-DRAFT (Tampering): getAllFinishedPeriods filters status != 'draft'
 *                              server-side; route handlers also reject draft.
 *   T-11-05-XSS (Tampering): React JSX auto-escapes all interpolated values
 *                            (project name, period number, etc.).
 *   T-11-05-FILTER-INJ (Tampering): URLSearchParams correctly escapes any
 *                                   payload; route handlers re-validate every
 *                                   parameter (Plan 02 + Plan 03).
 *
 * Money math: formatMoneyAmount uses decimal.js + BigInt for locale-aware
 * grouping; never passes through Number() (CR-01 lock).
 *
 * Force-dynamic: financial data must never be statically cached (v2.0 lock).
 */

interface SearchParams {
  from?: string;
  to?: string;
  project?: string;
}

export default async function ExportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // T-11-05-AUTH: auth guard — first statement
  const session = await auth();
  if (!session) redirect('/auth/signin');

  const sp = await searchParams;
  const t = await getTranslations('dashboard.admin.exports');
  const locale = await getLocale();

  // Parallel data fetch — both queries are tenant-scoped in their action layer
  const [projects, periods] = await Promise.all([
    getProjects(),
    getAllFinishedPeriods(),
  ]);

  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  // Build the active-filter chip text (project name + date range)
  const activeProject = sp.project
    ? projects.find((p) => p.id === sp.project)?.name
    : undefined;
  const fromStr = sp.from ?? '';
  const toStr = sp.to ?? '';
  const dateRangePart =
    fromStr || toStr ? `${fromStr || '—'} → ${toStr || '—'}` : '—';
  const chip = `${activeProject ?? '—'} · ${dateRangePart}`;

  // Build the URL-encoded query string to forward to download handlers
  const qs = new URLSearchParams();
  if (sp.from) qs.set('from', sp.from);
  if (sp.to) qs.set('to', sp.to);
  if (sp.project) qs.set('project', sp.project);
  const qsString = qs.toString() ? `?${qs.toString()}` : '';

  return (
    <div className="space-y-4">
      {/* Heading row */}
      <div className="space-y-1">
        <BrandHeading as="h1" size="h1">{t('heading')}</BrandHeading>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Global FilterBar — useSearchParams CSR bailout requires Suspense */}
      <Suspense
        fallback={
          <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
        }
      >
        <FilterBar projectOptions={projectOptions} personOptions={[]} />
      </Suspense>

      {/* Surface 1a — Submission Ledger trigger card (EXP-01) */}
      <BrandCard>
        <BrandCard.Header>
          <div className="flex items-center gap-2">
            <FileSpreadsheet
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="text-sm font-semibold">
              {t('section_ledger')}
            </h2>
          </div>
        </BrandCard.Header>
        <BrandCard.Body className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">{chip}</p>
          <a href={`/api/exports/submissions${qsString}`} download>
            <BrandButton variant="primary" size="sm">
              <Download className="h-4 w-4 mr-1" aria-hidden="true" />
              {t('download_excel')}
            </BrandButton>
          </a>
        </BrandCard.Body>
      </BrandCard>

      {/* Surface 1b — Performance Summary trigger card (EXP-03) */}
      <BrandCard>
        <BrandCard.Header>
          <div className="flex items-center gap-2">
            <FileSpreadsheet
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="text-sm font-semibold">
              {t('section_performance')}
            </h2>
          </div>
        </BrandCard.Header>
        <BrandCard.Body className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">{chip}</p>
          <a href={`/api/exports/performance${qsString}`} download>
            <BrandButton variant="primary" size="sm">
              <Download className="h-4 w-4 mr-1" aria-hidden="true" />
              {t('download_excel')}
            </BrandButton>
          </a>
        </BrandCard.Body>
      </BrandCard>

      {/* Surface 1c — Hakkediş Files period picker (EXP-02 + EXP-04) */}
      <BrandCard>
        <BrandCard.Header>
          <div className="flex items-center gap-2">
            <FileText
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="text-sm font-semibold">
              {t('section_hakedis')}
            </h2>
          </div>
        </BrandCard.Header>
        <BrandCard.Body className="p-0">
          {periods.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FileX
                className="h-8 w-8 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t('empty_no_periods_heading')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('empty_no_periods_body')}
                </p>
              </div>
              <Link
                href="/dashboard/hakedis"
                className="text-sm text-primary hover:underline"
              >
                {t('empty_no_periods_cta')}
              </Link>
            </div>
          ) : (
            <BrandTable.Root>
              <BrandTable.Header>
                <BrandTable.Row>
                  <BrandTable.Head scope="col">{t('picker_col_period')}</BrandTable.Head>
                  <BrandTable.Head scope="col">{t('picker_col_end_date')}</BrandTable.Head>
                  <BrandTable.Head scope="col">{t('picker_col_currency')}</BrandTable.Head>
                  <BrandTable.Head scope="col">{t('picker_col_status')}</BrandTable.Head>
                  <BrandTable.Head scope="col" className="text-right">
                    {t('picker_col_net')}
                  </BrandTable.Head>
                  <BrandTable.Head scope="col">{t('picker_col_download')}</BrandTable.Head>
                </BrandTable.Row>
              </BrandTable.Header>
              <BrandTable.Body>
                {periods.map((period) => (
                  <BrandTable.Row key={period.id}>
                    <BrandTable.Cell className="font-medium">
                      {period.periodNumber}
                    </BrandTable.Cell>
                    <BrandTable.Cell className="text-sm">
                      {period.periodEndDate}
                    </BrandTable.Cell>
                    <BrandTable.Cell className="text-sm">
                      {period.currencyCode}
                    </BrandTable.Cell>
                    <BrandTable.Cell>
                      <HakedisStatusBadge status={period.status} />
                    </BrandTable.Cell>
                    <BrandTable.Cell className="text-right tabular-nums text-sm">
                      {formatMoneyAmount(period.netByDisplay, locale)}
                    </BrandTable.Cell>
                    <BrandTable.Cell>
                      <div className="flex items-center gap-2">
                        <a
                          href={`/api/exports/hakedis/${period.id}`}
                          download
                          aria-label={`Excel İndir — ${period.periodNumber}`}
                        >
                          <BrandButton variant="outline" size="sm">
                            <FileSpreadsheet
                              className="h-4 w-4 mr-1"
                              aria-hidden="true"
                            />
                            Excel
                          </BrandButton>
                        </a>
                        <a
                          href={`/api/exports/hakedis/${period.id}/pdf`}
                          download
                          aria-label={`PDF İndir — ${period.periodNumber}`}
                        >
                          <BrandButton variant="outline" size="sm">
                            <FileText
                              className="h-4 w-4 mr-1"
                              aria-hidden="true"
                            />
                            PDF
                          </BrandButton>
                        </a>
                      </div>
                    </BrandTable.Cell>
                  </BrandTable.Row>
                ))}
              </BrandTable.Body>
            </BrandTable.Root>
          )}
        </BrandCard.Body>
      </BrandCard>
    </div>
  );
}
