/**
 * ChainageTab.tsx
 *
 * As-Built tab — Server Component (Phase 15 Plan 07, CHN-04/05/06).
 * Fetches chainage buckets + route via Promise.all, renders KPI row,
 * calibration offset form, and delegates to ChainageTable (client).
 *
 * force-dynamic: chainage reflects live approval state (Phase 15 note #8).
 */

export const dynamic = 'force-dynamic';

import { getTranslations } from 'next-intl/server';
import { MapPin, Route } from 'lucide-react';
import { getChainageBuckets } from '@/actions/chainage';
import { getRoute } from '@/actions/routes';
import { KpiCard } from '@/components/admin/KpiCard';
import { BrandEmpty } from '@/components/brand';
import { ChainageTable } from './ChainageTable';
import { ChainageOffsetForm } from './ChainageOffsetForm';

interface ChainageTabProps {
  projectId: string;
}

export async function ChainageTab({ projectId }: ChainageTabProps) {
  const t = await getTranslations('dashboard.asbuilt');

  const [chainageResult, route] = await Promise.all([
    getChainageBuckets(projectId, 1000),
    getRoute(projectId),
  ]);

  const { buckets, totalLengthM, chainageOffsetM, completionPct } = chainageResult;

  // Approved km = buckets with approved status × 1000m default (from completionPct)
  const approvedBucketCount = buckets.filter(b => b.approvedCount > 0).length;
  const approvedKm = totalLengthM > 0
    ? ((approvedBucketCount / buckets.length) * totalLengthM / 1000)
    : 0;
  const totalKm = totalLengthM / 1000;

  const valueColor =
    completionPct >= 80 ? 'success' :
    completionPct >= 1  ? 'warning' :
    'default';

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          label={t('kpi_completion_label')}
          subLabel={t('kpi_completion_sublabel')}
          value={`${completionPct}%`}
          icon={<Route className="size-4" />}
          valueColor={valueColor}
        />
        <KpiCard
          label={t('kpi_approved_km_label')}
          subLabel={t('kpi_completion_sublabel')}
          value={`${approvedKm.toFixed(1)} km`}
          icon={<Route className="size-4" />}
        />
        <KpiCard
          label={t('kpi_total_km_label')}
          subLabel={t('kpi_completion_sublabel')}
          value={`${totalKm.toFixed(1)} km`}
          icon={<Route className="size-4" />}
        />
      </div>

      {/* Calibration offset form */}
      <ChainageOffsetForm
        projectId={projectId}
        currentOffsetM={chainageOffsetM}
      />

      {/* Table + colour bar (or empty state) */}
      {buckets.length === 0 ? (
        <BrandEmpty
          icon={<MapPin className="size-12 text-slate-400" />}
          title={t('empty_heading')}
          description={t('empty_body')}
        />
      ) : (
        <ChainageTable
          projectId={projectId}
          initialBuckets={buckets}
          totalLengthM={totalLengthM}
        />
      )}
    </div>
  );
}
