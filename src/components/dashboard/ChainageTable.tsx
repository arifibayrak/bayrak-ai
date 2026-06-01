'use client';

/**
 * ChainageTable.tsx
 *
 * As-Built tab client component — Phase 15 Plan 07 (CHN-04/05).
 * Renders: granularity toggle → colour bar → BrandTable + export buttons.
 * Granularity change re-queries via useTransition + getChainageBuckets.
 *
 * No charting library — colour bar is pure CSS flex (D-03 / UI-SPEC Note #1).
 */

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { BrandTable, BrandBadge, BrandButton } from '@/components/brand';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getChainageBuckets } from '@/actions/chainage';
import type { ChainageBucket } from '@/actions/chainage';
import { formatChainage } from '@/lib/format-chainage';

interface ChainageTableProps {
  projectId: string;
  initialBuckets: ChainageBucket[];
  totalLengthM?: number; // reserved for future use; colour bar uses bucket count proportions
}

type BucketSize = 100 | 500 | 1000;

const GRANULARITY_OPTIONS: { label: string; value: BucketSize }[] = [
  { label: '1 km',   value: 1000 },
  { label: '500 m',  value: 500  },
  { label: '100 m',  value: 100  },
];

export function ChainageTable({ projectId, initialBuckets }: ChainageTableProps) {
  const t = useTranslations('dashboard.asbuilt');
  const tAi = useTranslations('dashboard.admin.ai_flags');
  const [bucketSizeM, setBucketSizeM] = useState<BucketSize>(1000);
  const [buckets, setBuckets] = useState<ChainageBucket[]>(initialBuckets);
  const [isPending, startTransition] = useTransition();

  function handleGranularityChange(newSize: BucketSize) {
    if (newSize === bucketSizeM) return;
    setBucketSizeM(newSize);
    startTransition(async () => {
      const result = await getChainageBuckets(projectId, newSize);
      setBuckets(result.buckets);
    });
  }

  const totalBuckets = buckets.length;

  return (
    <div className="space-y-3">
      {/* Granularity toggle */}
      <div className="flex items-center gap-2">
        <span className="sr-only">{t('granularity_label')}</span>
        <div className="inline-flex gap-0">
          {GRANULARITY_OPTIONS.map((opt, idx) => {
            const isActive = bucketSizeM === opt.value;
            const isFirst = idx === 0;
            const isLast = idx === GRANULARITY_OPTIONS.length - 1;
            const radiusClass = isFirst
              ? 'rounded-l-md rounded-r-none'
              : isLast
              ? 'rounded-l-none rounded-r-md'
              : 'rounded-none';
            return (
              <BrandButton
                key={opt.value}
                variant={isActive ? 'primary' : 'outline'}
                size="sm"
                className={radiusClass}
                onClick={() => handleGranularityChange(opt.value)}
                disabled={isPending}
              >
                {opt.label}
              </BrandButton>
            );
          })}
        </div>
      </div>

      {/* Colour bar — CSS flex, no charting lib (UI-SPEC Note #1) */}
      <div
        className="w-full h-2 rounded-full overflow-hidden border border-slate-200 my-3"
        role="img"
        aria-label="Güzergah tamamlanma durumu"
      >
        {buckets.map((bucket, i) => (
          <div
            key={i}
            style={{ width: totalBuckets > 0 ? `${(1 / totalBuckets) * 100}%` : '0%' }}
            className={
              bucket.status === 'approved'    ? 'bg-emerald-400 h-full inline-block' :
              bucket.status === 'in_progress' ? 'bg-amber-300 h-full inline-block'   :
              'bg-slate-200 h-full inline-block'
            }
          />
        ))}
      </div>

      {/* Table wrapper with loading overlay */}
      <div className="relative">
        {isPending && (
          <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center rounded-md">
            <span className="text-xs text-muted-foreground">Yükleniyor…</span>
          </div>
        )}

        {/* Export buttons header */}
        <div className="flex justify-end gap-2 mb-2">
          <BrandButton
            variant="outline"
            size="sm"
            onClick={() => window.open(`/api/exports/chainage?projectId=${projectId}&format=xlsx&bucketSizeM=${bucketSizeM}`, '_blank')}
          >
            <FileSpreadsheet className="size-4" />
            {t('export_excel')}
          </BrandButton>
          <BrandButton
            variant="outline"
            size="sm"
            onClick={() => window.open(`/api/exports/chainage?projectId=${projectId}&format=pdf&bucketSizeM=${bucketSizeM}`, '_blank')}
          >
            <FileText className="size-4" />
            {t('export_pdf')}
          </BrandButton>
        </div>

        <BrandTable.Root>
          <BrandTable.Header>
            <BrandTable.Row>
              <BrandTable.Head className="font-semibold">{t('col_km_range')}</BrandTable.Head>
              <BrandTable.Head className="font-semibold">{t('col_status')}</BrandTable.Head>
              <BrandTable.Head className="font-semibold text-right">{t('col_work_count')}</BrandTable.Head>
              <BrandTable.Head className="font-semibold">{t('col_material_qty')}</BrandTable.Head>
              <BrandTable.Head className="font-semibold">{t('col_worker')}</BrandTable.Head>
              <BrandTable.Head className="font-semibold">{t('col_auditor')}</BrandTable.Head>
              <BrandTable.Head className="font-semibold">{t('col_detail')}</BrandTable.Head>
              <BrandTable.Head className="font-semibold w-6">
                <span className="sr-only">{tAi('col_ai_flag')}</span>
              </BrandTable.Head>
            </BrandTable.Row>
          </BrandTable.Header>
          <BrandTable.Body>
            {buckets.map((bucket) => {
              const isNotStarted = bucket.status === 'not_started';
              const badgeVariant =
                bucket.status === 'approved'    ? 'success'  :
                bucket.status === 'in_progress' ? 'primary'  :
                'neutral';
              const badgeLabel =
                bucket.status === 'approved'    ? t('status_approved')    :
                bucket.status === 'in_progress' ? t('status_in_progress') :
                t('status_not_started');

              const boqText = bucket.boqBreakdown.length > 0
                ? bucket.boqBreakdown
                    .map(b => `${b.material}: ${b.quantity} ${b.unit}`)
                    .join(', ')
                : null;

              const workersText = bucket.workers.length > 0
                ? bucket.workers.join(', ')
                : null;

              const auditorsText = bucket.auditors.length > 0
                ? bucket.auditors.join(', ')
                : null;

              return (
                <BrandTable.Row key={bucket.bucketIndex} className="hover:bg-slate-50">
                  <BrandTable.Cell className="font-mono text-sm tabular-nums">
                    {formatChainage(bucket.bucketStart)} – {formatChainage(bucket.bucketEnd)}
                  </BrandTable.Cell>
                  <BrandTable.Cell>
                    <BrandBadge variant={badgeVariant}>{badgeLabel}</BrandBadge>
                  </BrandTable.Cell>
                  <BrandTable.Cell className="text-sm tabular-nums text-right">
                    {isNotStarted ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      bucket.approvedCount + bucket.pendingCount
                    )}
                  </BrandTable.Cell>
                  <BrandTable.Cell className="text-sm font-mono tabular-nums">
                    {isNotStarted || !boqText ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      boqText
                    )}
                  </BrandTable.Cell>
                  <BrandTable.Cell className="text-sm">
                    {isNotStarted || !workersText ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      workersText
                    )}
                  </BrandTable.Cell>
                  <BrandTable.Cell className="text-sm">
                    {isNotStarted || !auditorsText ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      auditorsText
                    )}
                  </BrandTable.Cell>
                  <BrandTable.Cell>
                    {!isNotStarted && bucket.firstSubmissionId ? (
                      <a
                        href={`/dashboard/records/${bucket.firstSubmissionId}?from=asbuilt`}
                        className="text-xs text-primary underline"
                      >
                        {t('detail_link')}
                      </a>
                    ) : null}
                  </BrandTable.Cell>
                  <BrandTable.Cell>
                    {bucket.hasAiFlag ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span
                              className="inline-block size-2 rounded-full bg-amber-500"
                              aria-hidden="true"
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {tAi('strip_indicator_tooltip')}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}
                  </BrandTable.Cell>
                </BrandTable.Row>
              );
            })}
          </BrandTable.Body>
        </BrandTable.Root>
      </div>
    </div>
  );
}
