'use client';

/**
 * ElevationProfile.tsx — terrain-sampled vertical profile for a project route.
 *
 * Shows a "Sample elevation" action (office-only; the server action is
 * assertCanWrite-guarded) and, once sampled, an area chart of elevation vs
 * chainage plus min/max and 2D-vs-3D length stats. This is the user-facing
 * payoff of real 3D: the route's true terrain profile.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { MountainSnow } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { BrandButton, BrandCard, BrandHeading } from '@/components/brand';
import { sampleRouteElevation } from '@/actions/routes';
import { formatMoneyAmount } from '@/lib/format-money';
import type { ElevationProfilePoint } from '@/db/schema/routes';

export interface ElevationProfileProps {
  projectId: string;
  sampledAt: string | null;
  minM: string | null;
  maxM: string | null;
  length3dM: string | null;
  totalLengthM: string | null;
  profile: ElevationProfilePoint[] | null;
}

export function ElevationProfile({
  projectId,
  sampledAt,
  minM,
  maxM,
  length3dM,
  totalLengthM,
  profile,
}: ElevationProfileProps) {
  const t = useTranslations('dashboard.route.elevation');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasData = !!sampledAt && !!profile && profile.length > 0;

  function handleSample() {
    setError(null);
    startTransition(async () => {
      const res = await sampleRouteElevation(projectId);
      if (!res.ok) {
        setError(res.error || t('error'));
        return;
      }
      router.refresh();
    });
  }

  const fmt = (v: string | null) => (v != null ? `${formatMoneyAmount(v, locale)} m` : '—');

  // 2D length shown on the same basis as the 3D length (cumulative haversine =
  // the profile's final chainage), so 3D >= 2D always reads correctly. Falls
  // back to the route's stored geodesic length if the profile is unavailable.
  const length2dM =
    profile && profile.length > 0 ? String(profile[profile.length - 1].m) : totalLengthM;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <BrandHeading as="h2" size="h3">{t('heading')}</BrandHeading>
          <p className="text-sm text-muted-foreground">{t('sub')}</p>
        </div>
        <BrandButton
          variant="secondary"
          size="sm"
          onClick={handleSample}
          disabled={pending}
        >
          <MountainSnow className="size-4" aria-hidden="true" />
          {pending ? t('sampling') : hasData ? t('resample') : t('sample')}
        </BrandButton>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <BrandCard>
        <BrandCard.Body>
          {!hasData ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('not_sampled')}</p>
          ) : (
            <div className="space-y-4">
              {/* Stats */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <Stat label={t('min')} value={fmt(minM)} />
                <Stat label={t('max')} value={fmt(maxM)} />
                <Stat label={t('length_2d')} value={fmt(length2dM)} />
                <Stat label={t('length_3d')} value={fmt(length3dM)} />
              </div>

              {/* Profile chart */}
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={profile!} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                    <defs>
                      <linearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis
                      dataKey="m"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(v) => `${Math.round(Number(v))}`}
                      tick={{ fontSize: 11 }}
                      label={{ value: t('axis_distance'), position: 'insideBottom', offset: -2, fontSize: 11 }}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      width={44}
                      tickFormatter={(v) => `${Math.round(Number(v))}`}
                      label={{ value: t('axis_elevation'), angle: -90, position: 'insideLeft', fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(v) => [`${Math.round(Number(v))} m`, t('axis_elevation')]}
                      labelFormatter={(l) => `${Math.round(Number(l))} m`}
                    />
                    <Area
                      type="monotone"
                      dataKey="z"
                      stroke="#0284c7"
                      strokeWidth={2}
                      fill="url(#elevFill)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {sampledAt ? (
                <p className="text-xs text-muted-foreground">
                  {t('sampled_at', { date: new Date(sampledAt).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US') })}
                </p>
              ) : null}
            </div>
          )}
        </BrandCard.Body>
      </BrandCard>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
