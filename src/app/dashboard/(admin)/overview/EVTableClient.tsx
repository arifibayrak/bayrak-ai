'use client';

/**
 * EVTableClient.tsx
 *
 * Client wrapper for the EV table + trend charts on the Overview page.
 * Manages the currency selector state (page-local, not a URL param — D-67).
 * Receives server-prefetched data as props — never re-fetches (D-68).
 *
 * Security (T-08-04-MONEY): Decimal-safe string parsing via parseFloat from DB string;
 * never cross-currency sums; currency selector picks one currency-keyed map.
 */

import { useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { BrandTable, BrandCard, BrandHeading } from '@/components/brand';
import { Progress } from '@/components/ui/progress';
import { CurrencySelector } from '@/components/admin/CurrencySelector';
import { TrendChartsClient } from '@/components/admin/TrendChartsClient';
import type { ProjectSummary, TrendPoint } from '@/actions/analytics';

// ── Number formatter ──────────────────────────────────────────────────────────

const numFmt = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: string | undefined): string {
  if (!value) return '—';
  const n = parseFloat(value);
  if (isNaN(n)) return '—';
  return numFmt.format(n);
}

function computeCompletePct(bac: string | undefined, ev: string | undefined): number | null {
  if (!bac || !ev) return null;
  const bacN = parseFloat(bac);
  const evN = parseFloat(ev);
  if (isNaN(bacN) || isNaN(evN) || bacN === 0) return null;
  return Math.min(100, Math.max(0, (evN / bacN) * 100));
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface EVTableClientProps {
  overview: ProjectSummary[];
  trends: TrendPoint[];
  availableCurrencies: string[];
  // Translated strings from server component (avoids useTranslations in client when data is ready)
  tEVHeading: string;
  tColProject: string;
  tColBAC: string;
  tColEV: string;
  tColComplete: string;
  tEmptyNoProjects: string;
  tChartNoData: string;
  tChartThroughput: string;
}

export function EVTableClient({
  overview,
  trends,
  availableCurrencies,
  tEVHeading,
  tColProject,
  tColBAC,
  tColEV,
  tColComplete,
  tEmptyNoProjects,
  tChartNoData,
  tChartThroughput,
}: EVTableClientProps) {
  const [currency, setCurrency] = useState('TRY');

  // Projects that have any value data in the selected currency
  const hasAnyProjectData = overview.some(
    (p) =>
      p.contractedValueByCurrency[currency] !== undefined ||
      p.earnedValueByCurrency[currency] !== undefined
  );

  return (
    <>
      {/* Currency selector — right-aligned, page-local */}
      <div className="flex justify-end">
        <CurrencySelector
          availableCurrencies={availableCurrencies}
          onCurrencyChange={setCurrency}
        />
      </div>

      {/* Trend charts (3-col desktop / 1-col mobile) */}
      <TrendChartsClient data={trends} currencyCode={currency} />

      {/* Earned Value table */}
      <section aria-label={tEVHeading} className="space-y-3">
        <BrandHeading as="h2" size="h3">{tEVHeading}</BrandHeading>

        {!hasAnyProjectData ? (
          <BrandCard>
            <BrandCard.Body>
              <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
                <LayoutDashboard className="size-12" aria-hidden="true" />
                <p className="text-sm">{tEmptyNoProjects}</p>
              </div>
            </BrandCard.Body>
          </BrandCard>
        ) : (
          <BrandCard>
            <BrandCard.Body className="p-0">
              <div className="overflow-x-auto">
                <BrandTable.Root>
                  <BrandTable.Header>
                    <BrandTable.Row>
                      <BrandTable.Head scope="col">{tColProject}</BrandTable.Head>
                      <BrandTable.Head scope="col" className="text-right tabular-nums">
                        {tColBAC}
                      </BrandTable.Head>
                      <BrandTable.Head scope="col" className="text-right tabular-nums">
                        {tColEV}
                      </BrandTable.Head>
                      <BrandTable.Head scope="col" className="w-[200px]">
                        {tColComplete}
                      </BrandTable.Head>
                    </BrandTable.Row>
                  </BrandTable.Header>
                  <BrandTable.Body>
                    {overview.map((project) => {
                      const bac = project.contractedValueByCurrency[currency];
                      const ev = project.earnedValueByCurrency[currency];
                      const pct = computeCompletePct(bac, ev);
                      const hasCurrencyData = bac !== undefined || ev !== undefined;

                      // If project has no data for the selected currency, show dashes
                      if (!hasCurrencyData) {
                        return (
                          <BrandTable.Row key={project.projectId}>
                            <BrandTable.Cell>
                              <Link
                                href={`/dashboard/projects/${project.projectId}`}
                                className="hover:underline"
                              >
                                {project.projectName}
                              </Link>
                            </BrandTable.Cell>
                            <BrandTable.Cell className="text-right tabular-nums text-muted-foreground">
                              —
                            </BrandTable.Cell>
                            <BrandTable.Cell className="text-right tabular-nums text-muted-foreground">
                              —
                            </BrandTable.Cell>
                            <BrandTable.Cell className="text-muted-foreground">—</BrandTable.Cell>
                          </BrandTable.Row>
                        );
                      }

                      return (
                        <BrandTable.Row key={project.projectId}>
                          <BrandTable.Cell>
                            <Link
                              href={`/dashboard/projects/${project.projectId}`}
                              className="hover:underline"
                            >
                              {project.projectName}
                            </Link>
                          </BrandTable.Cell>
                          <BrandTable.Cell className="text-right tabular-nums">
                            {formatMoney(bac)}
                          </BrandTable.Cell>
                          <BrandTable.Cell className="text-right tabular-nums">
                            {formatMoney(ev)}
                          </BrandTable.Cell>
                          <BrandTable.Cell>
                            {pct != null ? (
                              <div className="flex items-center gap-2">
                                <Progress
                                  value={pct}
                                  className="h-2 flex-1"
                                  aria-label={`${pct.toFixed(1)}%`}
                                />
                                <span className="tabular-nums text-sm w-[48px] text-right">
                                  {pct.toFixed(1)}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </BrandTable.Cell>
                        </BrandTable.Row>
                      );
                    })}
                  </BrandTable.Body>
                </BrandTable.Root>
              </div>
            </BrandCard.Body>
          </BrandCard>
        )}
      </section>
    </>
  );
}
