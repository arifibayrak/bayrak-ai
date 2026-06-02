/**
 * Period Detail Page — /dashboard/(admin)/hakedis/[periodId]
 *
 * HAK-02: Yeşil defter line-item table (snapshot quantities + values)
 * HAK-03: D-90 deduction chain summary (gross → KDV → tevkifat → stopaj → teminat → avans → net)
 * HAK-04: State-gated payment controls (PeriodDetailControls)
 * HAK-05: Finalization immutability banner (non-draft only)
 * D-96: Controls REMOVED (not disabled) for non-draft states
 * D-103: Unpriced-item warning when draft has BOQ items with unit_price IS NULL
 *
 * Money: all values arrive as Postgres numeric strings → decimal.js display.
 * NEVER parseFloat for money (T-10-04-FLOAT / UI-SPEC Money Display Rules).
 *
 * Security:
 *   T-10-04-EoP: `auth()` is the FIRST statement — redirect on null
 *   T-10-04-IDOR: getPeriodDetail is tenant-scoped; cross-tenant → no period → notFound()
 *   T-10-04-XSS: no dangerouslySetInnerHTML; React auto-escapes all string values
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getLocale } from 'next-intl/server';
import { ChevronLeft, Lock, TriangleAlert } from 'lucide-react';
import Decimal from 'decimal.js';
import { formatMoney } from '@/lib/format-money';
import { requireWriteAccess } from '@/lib/rbac';
import { getPeriodDetail } from '@/actions/hakedis';
import { getProjects } from '@/actions/projects';
import { HakedisStatusBadge } from '@/components/admin/HakedisStatusBadge';
import { asHakedisStatus } from '@/lib/hakedis-status';
import { LineSubmissionsPanel } from '@/components/admin/LineSubmissionsPanel';
import { LivePeriodPoller } from '@/components/admin/LivePeriodPoller';
import { PeriodDetailControls } from '@/components/admin/PeriodDetailControls';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BrandCard, BrandHeading, BrandTable } from '@/components/brand';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ periodId: string }>;
}

// ── Money display helper ──────────────────────────────────────────────────────
//
// The money formatter lives in `src/lib/format-money.ts` (imported above). It
// uses decimal.js for rounding + BigInt + Intl.NumberFormat for locale
// grouping, so the value never re-enters the JS-float domain on the display
// path (T-10-04-FLOAT / 10-REVIEW WR-01).

// ── Date formatting ────────────────────────────────────────────────────────────

/** Format a date string as dd.MM.yyyy */
function formatDateTR(dateStr: string | null): string {
  if (!dateStr) return '—';
  const raw = dateStr.split('T')[0];
  const parts = raw.split('-');
  if (parts.length !== 3) return dateStr;
  const [yyyy, mm, dd] = parts;
  return `${dd}.${mm}.${yyyy}`;
}

// ── Rate display helper ────────────────────────────────────────────────────────

/** Convert a 0–1 fraction string to a % string for label interpolation */
function toPercent(fraction: string | null): string {
  if (!fraction) return '0';
  try {
    return new Decimal(fraction).mul(100).toFixed(2).replace(/\.?0+$/, '');
  } catch {
    return '0';
  }
}

// ── Page component ─────────────────────────────────────────────────────────────

export default async function PeriodDetailPage({ params }: Props) {
  // RBAC: office-only page — redirects audit_engineer (and unauthenticated)
  await requireWriteAccess();

  const { periodId } = await params;

  const t = await getTranslations('dashboard.admin.hakedis');
  const locale = await getLocale();

  // Fetch period detail (auth-guarded, tenant-scoped — returns { period, lines, deductions, unpricedItems })
  let detail: Awaited<ReturnType<typeof getPeriodDetail>>;
  try {
    detail = await getPeriodDetail(periodId);
  } catch {
    // Period not found or unauthorized → 404
    notFound();
  }

  if (!detail?.period) {
    notFound();
  }

  const { period, lines, deductions, unpricedItems } = detail;

  // Fetch project name for the header sub-label
  const projects = await getProjects();
  const project = projects.find((p) => p.id === period.projectId);
  const projectName = project?.name ?? period.projectId;

  // WR-04: never assert an unguarded `as` cast on a raw DB string. Narrow via the
  // allowlist guard; an unknown status falls back to 'finalized' for control-flow
  // purposes — the conservative read-only path that removes destructive draft-only
  // actions (poller, finalize). The badge below receives the RAW string so an
  // unknown value still renders honestly (neutral pill + raw label).
  const rawStatus = period.status;
  const status = asHakedisStatus(rawStatus) ?? 'finalized';
  const currency = period.currencyCode;
  const formattedEndDate = formatDateTR(period.periodEndDate);
  const formattedFinalizedAt = period.finalizedAt ? formatDateTR(period.finalizedAt) : '—';

  // Rate percent strings for deduction summary labels
  const kdvPct = toPercent(period.kdvRate);
  const tevkifatPct = toPercent(period.tevkifatFraction);
  const stopajPct = toPercent(period.stopajRate);
  const retentionPct = toPercent(period.retentionRate);
  const avansPct = toPercent(period.avansKesintisiRate);

  return (
    <div className="space-y-4">
      {/* ── Back link ── */}
      <Link
        href={`/dashboard/hakedis?project=${period.projectId}`}
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {t('detail.back')}
      </Link>

      {/* ── 3a: Period Header ── */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <BrandHeading as="h1" size="h1">{period.periodNumber}</BrandHeading>
            <HakedisStatusBadge status={rawStatus} />
          </div>
          <p className="text-sm text-muted-foreground">
            {projectName} · {t('detail.end_date_label')}: {formattedEndDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodDetailControls
            periodId={period.id}
            periodNumber={period.periodNumber}
            status={status}
          />
        </div>
      </div>

      {/* ── D-120: 30-second polling on draft periods only (SDH-01 live update) ──
          Headless client component: sr-only role=status span + setInterval(router.refresh, 30s).
          UI-side guard mounts only when status === 'draft'; the helper itself also re-checks
          status='draft' (Pitfall 4 / defense-in-depth). The component's null-on-disabled
          contract means an accidental enabled={false} renders zero DOM. */}
      {status === 'draft' && <LivePeriodPoller enabled={true} />}

      {/* ── 3b: Finalized immutability banner (non-draft only) ── */}
      {status !== 'draft' && (
        <Alert role="status" className="p-3">
          <Lock className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            {t('detail.finalized_notice', { date: formattedFinalizedAt })}
          </AlertDescription>
        </Alert>
      )}

      {/* ── 3c: Unpriced-item warning (draft only, when applicable) ── */}
      {status === 'draft' && unpricedItems.length > 0 && (
        <Alert
          role="alert"
          className="border-amber-200 bg-amber-50 p-3"
        >
          <TriangleAlert className="h-4 w-4 text-amber-600" aria-hidden="true" />
          <AlertDescription className="text-amber-800">
            {t('detail.unpriced_warning', { count: unpricedItems.length })}
            {' '}
            <Link
              href={`/dashboard/projects/${period.projectId}?tab=boq`}
              className="underline"
            >
              {t('detail.unpriced_cta')}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* ── 3e: Yeşil Defter Line-Item Table (HAK-02) ── */}
      <BrandCard>
        <BrandCard.Header>
          <h2 className="text-base font-semibold">
            {t('detail.lines_heading')}
          </h2>
        </BrandCard.Header>
        <BrandCard.Body className="p-0">
          <BrandTable.Root>
            <BrandTable.Header>
              <BrandTable.Row>
                <BrandTable.Head scope="col">{t('detail.lines_col_material')}</BrandTable.Head>
                <BrandTable.Head scope="col" className="w-[80px]">
                  {t('detail.lines_col_unit')}
                </BrandTable.Head>
                <BrandTable.Head scope="col" className="w-[120px] text-right tabular-nums">
                  {t('detail.lines_col_unit_price')}
                </BrandTable.Head>
                <BrandTable.Head scope="col" className="w-[120px] text-right tabular-nums">
                  {t('detail.lines_col_prev_cumulative')}
                </BrandTable.Head>
                <BrandTable.Head scope="col" className="w-[120px] text-right tabular-nums">
                  {t('detail.lines_col_cumulative')}
                </BrandTable.Head>
                <BrandTable.Head scope="col" className="w-[120px] text-right tabular-nums">
                  {t('detail.lines_col_period_qty')}
                </BrandTable.Head>
                <BrandTable.Head scope="col" className="w-[140px] text-right tabular-nums">
                  {t('detail.lines_col_period_value')}
                </BrandTable.Head>
                {/* SDH-02 traceability column — chevron-expand affordance per row.
                    aria-only label keeps the visual footprint minimal. */}
                <BrandTable.Head scope="col" className="w-[180px]">
                  <span className="sr-only">
                    {t('detail.lines_col_period_value')}
                  </span>
                </BrandTable.Head>
              </BrandTable.Row>
            </BrandTable.Header>
            <BrandTable.Body>
              {lines.length === 0 ? (
                <BrandTable.Row>
                  <BrandTable.Cell
                    colSpan={8}
                    className="text-center py-10 text-muted-foreground text-sm"
                  >
                    {t('detail.lines_empty')}
                  </BrandTable.Cell>
                </BrandTable.Row>
              ) : (
                lines.map((line) => {
                  const periodQtyNum = Number(line.periodQty);
                  const hasWork = periodQtyNum > 0;
                  return (
                    <BrandTable.Row
                      key={line.id}
                      className={hasWork ? undefined : 'text-muted-foreground'}
                    >
                      <BrandTable.Cell className="text-sm">{line.materialSnapshot}</BrandTable.Cell>
                      <BrandTable.Cell className="text-sm w-[80px]">{line.unitSnapshot}</BrandTable.Cell>
                      <BrandTable.Cell
                        className="text-right tabular-nums text-sm w-[120px]"
                        aria-label={`${t('detail.lines_col_unit_price')}: ${line.unitPriceSnapshot} ${line.currencyCodeSnapshot}`}
                      >
                        {line.unitPriceSnapshot} {line.currencyCodeSnapshot}
                      </BrandTable.Cell>
                      <BrandTable.Cell className="text-right tabular-nums text-sm w-[120px]">
                        {line.previousCumulativeQty}
                      </BrandTable.Cell>
                      <BrandTable.Cell className="text-right tabular-nums text-sm w-[120px]">
                        {line.cumulativeQtyApproved}
                      </BrandTable.Cell>
                      <BrandTable.Cell
                        className={`text-right tabular-nums text-sm w-[120px]${hasWork ? ' font-bold' : ''}`}
                      >
                        {line.periodQty}
                      </BrandTable.Cell>
                      <BrandTable.Cell
                        className="text-right tabular-nums font-semibold text-sm w-[140px]"
                        aria-label={`${t('detail.lines_col_period_value')}: ${formatMoney(line.periodValue, currency, locale)}`}
                      >
                        {formatMoney(line.periodValue, currency, locale)}
                      </BrandTable.Cell>
                      {/* SDH-02 traceability column: inline-expand-row panel.
                          Lazy-fetches getLineSubmissions(periodLineId) on first click;
                          the parent's LivePeriodPoller-driven router.refresh() resets state naturally. */}
                      <BrandTable.Cell className="text-sm w-[180px]">
                        <LineSubmissionsPanel
                          periodLineId={line.id}
                          periodQty={line.periodQty}
                          unitSnapshot={line.unitSnapshot}
                        />
                      </BrandTable.Cell>
                    </BrandTable.Row>
                  );
                })
              )}
            </BrandTable.Body>
            {lines.length > 0 && (
              <BrandTable.Footer>
                <BrandTable.Row className="font-semibold border-t-2">
                  {/* Label span 7 columns → Gross value cell at column 7 (period_value) → traceability column 8 empty. */}
                  <BrandTable.Cell colSpan={7} className="text-right text-sm">
                    {t('detail.gross_total')}
                  </BrandTable.Cell>
                  <BrandTable.Cell
                    className="text-right tabular-nums text-sm"
                    aria-label={`${t('detail.gross_total')}: ${formatMoney(deductions?.gross ?? null, currency, locale)}`}
                  >
                    {formatMoney(deductions?.gross ?? null, currency, locale)}
                  </BrandTable.Cell>
                </BrandTable.Row>
              </BrandTable.Footer>
            )}
          </BrandTable.Root>
        </BrandCard.Body>
      </BrandCard>

      {/* ── 3f: Deduction Summary Card (HAK-03) ── */}
      <BrandCard>
        <BrandCard.Header>
          <h2 className="text-base font-semibold">
            {t('detail.summary_heading')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('detail.summary_period', {
              periodNumber: period.periodNumber,
              endDate: formattedEndDate,
            })}
          </p>
        </BrandCard.Header>
        <BrandCard.Body>
          <div className="space-y-0">
            {/* Row 1: Gross */}
            <div className="flex justify-between py-3 border-b">
              <span className="text-sm">{t('detail.row_gross')}</span>
              <span
                className="text-sm tabular-nums"
                aria-label={`${t('detail.row_gross')}: ${formatMoney(deductions?.gross ?? null, currency, locale)}`}
              >
                {formatMoney(deductions?.gross ?? null, currency, locale)}
              </span>
            </div>

            {/* Row 2: KDV (indented 16px) */}
            <div className="flex justify-between py-3 border-b">
              <span className="text-sm pl-4">
                {t('detail.row_kdv', { kdvRate: kdvPct })}
              </span>
              <span
                className="text-sm tabular-nums"
                aria-label={`${t('detail.row_kdv', { kdvRate: kdvPct })}: ${formatMoney(deductions?.kdv ?? null, currency, locale)}`}
              >
                {formatMoney(deductions?.kdv ?? null, currency, locale)}
              </span>
            </div>

            {/* Row 3: KDV Tevkifat (indented, negative) */}
            <div className="flex justify-between py-3 border-b">
              <span className="text-sm pl-4">
                {t('detail.row_tevkifat', { tevkifatFraction: tevkifatPct })}
              </span>
              <span
                className="text-sm tabular-nums"
                aria-label={`${t('detail.row_tevkifat', { tevkifatFraction: tevkifatPct })}: -${formatMoney(deductions?.tevkifat ?? null, currency, locale)}`}
              >
                {deductions?.tevkifat != null
                  ? `-${formatMoney(deductions.tevkifat, currency, locale)}`
                  : '—'}
              </span>
            </div>

            {/* Row 4: Stopaj (only when stopajEnabled) */}
            {period.stopajEnabled && (
              <div className="flex justify-between py-3 border-b">
                <span className="text-sm">
                  {t('detail.row_stopaj', { stopajRate: stopajPct })}
                </span>
                <span
                  className="text-sm tabular-nums"
                  aria-label={`${t('detail.row_stopaj', { stopajRate: stopajPct })}: -${formatMoney(deductions?.stopaj ?? null, currency, locale)}`}
                >
                  {deductions?.stopaj != null
                    ? `-${formatMoney(deductions.stopaj, currency, locale)}`
                    : '—'}
                </span>
              </div>
            )}

            {/* Row 5: Teminat (indented, negative) */}
            <div className="flex justify-between py-3 border-b">
              <span className="text-sm pl-4">
                {t('detail.row_teminat', { retentionRate: retentionPct })}
              </span>
              <span
                className="text-sm tabular-nums"
                aria-label={`${t('detail.row_teminat', { retentionRate: retentionPct })}: -${formatMoney(deductions?.teminat ?? null, currency, locale)}`}
              >
                {deductions?.teminat != null
                  ? `-${formatMoney(deductions.teminat, currency, locale)}`
                  : '—'}
              </span>
            </div>

            {/* Row 6: Avans Kesintisi (only when avansKesintisiRate > 0) */}
            {Number(period.avansKesintisiRate) > 0 && (
              <div className="flex justify-between py-3 border-b">
                <span className="text-sm">
                  {t('detail.row_avans', { avansRate: avansPct })}
                </span>
                <span
                  className="text-sm tabular-nums"
                  aria-label={`${t('detail.row_avans', { avansRate: avansPct })}: -${formatMoney(deductions?.avans ?? null, currency, locale)}`}
                >
                  {deductions?.avans != null
                    ? `-${formatMoney(deductions.avans, currency, locale)}`
                    : '—'}
                </span>
              </div>
            )}

            {/* Row 7: Net Ödeme — FOCAL POINT (text-2xl, border-t-2 border-foreground) */}
            <div className="flex justify-between py-3 font-semibold text-lg border-t-2 border-foreground pt-3 mt-1">
              <span>{t('detail.row_net')}</span>
              <span
                className="text-2xl font-semibold tabular-nums"
                aria-label={`${t('detail.row_net')}: ${formatMoney(deductions?.net ?? null, currency, locale)}`}
              >
                {formatMoney(deductions?.net ?? null, currency, locale)}
              </span>
            </div>
          </div>
        </BrandCard.Body>
      </BrandCard>
    </div>
  );
}
