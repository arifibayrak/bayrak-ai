'use client';

/**
 * TrendChartsClient.tsx
 *
 * Three Recharts LineCharts for the Overview command center.
 * Data is server-prefetched and passed as props — NEVER re-fetched client-side (D-68).
 *
 * Charts:
 *   1. Throughput — approvedCount + totalCount (--chart-1)
 *   2. Earned Value — earnedValue in selected currency (--chart-2)
 *   3. Rejection Rate — rejectedCount / totalCount × 100 (--chart-3)
 *
 * Empty state: centered "No data"/"Veri yok" block at same height.
 *
 * Security: no re-fetch; data is read-only props from RSC.
 * Accessibility: each ChartContainer has aria-label describing the chart subject.
 *
 * DO NOT import this from any server component — recharts must stay client-only.
 */

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { TrendPoint } from '@/actions/analytics';

// ── Chart config maps (color tokens wired to --chart-* CSS variables) ──────────

const throughputConfig: ChartConfig = {
  approvedCount: { label: 'Approved', color: 'var(--chart-1)' },
  totalCount: { label: 'Total', color: 'var(--chart-3)' },
};

const evConfig: ChartConfig = {
  earnedValue: { label: 'EV', color: 'var(--chart-2)' },
};

const rejectionConfig: ChartConfig = {
  rejectionRate: { label: 'Rejection %', color: 'var(--chart-3)' },
};

// ── Empty state block ─────────────────────────────────────────────────────────

function EmptyChartState({ label }: { label: string }) {
  return (
    <div className="h-[240px] md:h-[240px] flex items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

// ── Individual chart components ────────────────────────────────────────────────

interface CountBucket {
  bucket: string;
  approvedCount: number;
  rejectedCount: number;
  totalCount: number;
}

interface ThroughputChartProps {
  data: CountBucket[];
  noDataLabel: string;
  title: string;
}

function ThroughputChart({ data, noDataLabel, title }: ThroughputChartProps) {
  if (data.length === 0) {
    return <EmptyChartState label={noDataLabel} />;
  }

  return (
    <ChartContainer
      config={throughputConfig}
      className="h-[240px] w-full"
      aria-label={title}
    >
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="bucket"
          tick={{ fontSize: 12 }}
          tickFormatter={(v: string) => v.slice(0, 10)}
        />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          type="monotone"
          dataKey="approvedCount"
          stroke="var(--chart-1)"
          dot={false}
          strokeWidth={2}
        />
        <Line
          type="monotone"
          dataKey="totalCount"
          stroke="var(--chart-3)"
          dot={false}
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />
      </LineChart>
    </ChartContainer>
  );
}

interface EarnedValueChartProps {
  data: Array<{ bucket: string; earnedValue: number | null }>;
  currencyCode: string;
  noDataLabel: string;
  title: string;
}

function EarnedValueChart({ data, currencyCode, noDataLabel, title }: EarnedValueChartProps) {
  if (data.length === 0) {
    return <EmptyChartState label={noDataLabel} />;
  }

  const hasAnyValue = data.some((d) => d.earnedValue != null);
  if (!hasAnyValue) {
    return <EmptyChartState label={noDataLabel} />;
  }

  const fmt = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <ChartContainer
      config={evConfig}
      className="h-[240px] w-full"
      aria-label={`${title} (${currencyCode})`}
    >
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="bucket"
          tick={{ fontSize: 12 }}
          tickFormatter={(v: string) => v.slice(0, 10)}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickFormatter={(v: number) => fmt.format(v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) =>
                typeof value === 'number'
                  ? `${fmt.format(value)} ${currencyCode}`
                  : String(value)
              }
            />
          }
        />
        <Line
          type="monotone"
          dataKey="earnedValue"
          stroke="var(--chart-2)"
          dot={false}
          strokeWidth={2}
          connectNulls={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

interface RejectionRateChartProps {
  data: Array<{ bucket: string; rejectionRate: number }>;
  noDataLabel: string;
  title: string;
}

function RejectionRateChart({ data, noDataLabel, title }: RejectionRateChartProps) {
  if (data.length === 0) {
    return <EmptyChartState label={noDataLabel} />;
  }

  return (
    <ChartContainer
      config={rejectionConfig}
      className="h-[240px] w-full"
      aria-label={title}
    >
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="bucket"
          tick={{ fontSize: 12 }}
          tickFormatter={(v: string) => v.slice(0, 10)}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) =>
                typeof value === 'number'
                  ? `${value.toFixed(1)}%`
                  : String(value)
              }
            />
          }
        />
        <Line
          type="monotone"
          dataKey="rejectionRate"
          stroke="var(--chart-3)"
          dot={false}
          strokeWidth={2}
        />
      </LineChart>
    </ChartContainer>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

interface TrendChartsClientProps {
  data: TrendPoint[];
  currencyCode: string;
}

export function TrendChartsClient({ data, currencyCode }: TrendChartsClientProps) {
  const t = useTranslations('dashboard.admin.overview');
  const noDataLabel = t('chart_no_data');

  // Filter data to selected currency for the EV chart
  const currencyData = useMemo(
    () => data.filter((d) => d.currencyCode === currencyCode),
    [data, currencyCode],
  );

  // For throughput + rejection rate, aggregate across all currencies per bucket
  // (these are count-based, not money-based — no cross-currency sum risk)
  const countDataByBucket = useMemo(() => {
    const map = new Map<string, { bucket: string; approvedCount: number; rejectedCount: number; totalCount: number }>();
    for (const d of data) {
      const existing = map.get(d.bucket);
      if (existing) {
        existing.approvedCount += d.approvedCount;
        existing.rejectedCount += d.rejectedCount;
        existing.totalCount += d.totalCount;
      } else {
        map.set(d.bucket, {
          bucket: d.bucket,
          approvedCount: d.approvedCount,
          rejectedCount: d.rejectedCount,
          totalCount: d.totalCount,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  }, [data]);

  // Compute rejection rate per bucket
  const rejectionRateData = useMemo(
    () =>
      countDataByBucket.map((d) => ({
        bucket: d.bucket,
        rejectionRate:
          d.totalCount > 0
            ? Math.round((d.rejectedCount / d.totalCount) * 10000) / 100
            : 0,
      })),
    [countDataByBucket],
  );

  // EV data for the selected currency (parsed from decimal string to number)
  const evData = useMemo(
    () =>
      currencyData.map((d) => ({
        bucket: d.bucket,
        earnedValue: d.earnedValue != null ? parseFloat(d.earnedValue) : null,
      })),
    [currencyData],
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* 1. Throughput chart */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {t('chart_throughput')}
        </h3>
        <ThroughputChart
          data={countDataByBucket}
          noDataLabel={noDataLabel}
          title={t('chart_throughput')}
        />
      </div>

      {/* 2. Earned Value chart */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {t('chart_earned_value')}
        </h3>
        <EarnedValueChart
          data={evData}
          currencyCode={currencyCode}
          noDataLabel={noDataLabel}
          title={t('chart_earned_value')}
        />
      </div>

      {/* 3. Rejection Rate chart */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {t('chart_rejection_rate')}
        </h3>
        <RejectionRateChart
          data={rejectionRateData}
          noDataLabel={noDataLabel}
          title={t('chart_rejection_rate')}
        />
      </div>
    </div>
  );
}
