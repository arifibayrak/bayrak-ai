/**
 * KpiCard.tsx
 *
 * Server-compatible stat card for the Overview command center.
 * Phase 13 (Plan 13-03a): composes BrandCard internally (D-125 compact density,
 * flat depth, rounded-md, no shadow). Phase 9 D-87 contract preserved byte-identical:
 *   - valueColor ('default' | 'success' | 'destructive' | 'warning')
 *   - alertBadge (ReactNode corner slot at top-right)
 *
 * Consumers (overview, scorecards, people profile) continue to use
 * <KpiCard title=… value=… /> unchanged.
 *
 * Accessibility: stat uses <dl><dt><dd> definition-list semantics
 * (per UI-SPEC § KPI card anatomy).
 */

import Link from 'next/link';
import { BrandCard } from '@/components/brand';

type ValueColor = 'default' | 'success' | 'destructive' | 'warning';

interface KpiCardProps {
  label: string;
  subLabel: string;
  value: number | string;
  icon: React.ReactNode;
  drillHref?: string;
  valueColor?: ValueColor;
  alertBadge?: React.ReactNode; // optional — absolute top-right corner badge (D-87)
}

function colorClass(color: ValueColor): string {
  if (color === 'success') return 'text-emerald-700';
  if (color === 'destructive') return 'text-destructive';
  if (color === 'warning') return 'text-amber-600';
  return 'text-foreground';
}

export function KpiCard({
  label,
  subLabel,
  value,
  icon,
  drillHref,
  valueColor = 'default',
  alertBadge,
}: KpiCardProps) {
  const cls = colorClass(valueColor);

  const statEl = (
    <span className={`text-3xl font-semibold tabular-nums ${cls}`}>
      {value}
    </span>
  );

  return (
    <BrandCard className={alertBadge ? 'relative' : undefined}>
      {alertBadge && (
        <span className="absolute top-2 right-2" aria-label="Alert: threshold exceeded">
          {alertBadge}
        </span>
      )}
      <BrandCard.Body className="p-3">
        <div className="flex flex-row items-center gap-2 pb-2">
          <span className="text-muted-foreground" aria-hidden="true">
            {icon}
          </span>
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <dl>
          <dt className="sr-only">{label}</dt>
          <dd>
            {drillHref ? (
              <Link href={drillHref} className="hover:underline">
                {statEl}
              </Link>
            ) : (
              statEl
            )}
          </dd>
        </dl>
        <p className="text-sm text-muted-foreground mt-1">{subLabel}</p>
      </BrandCard.Body>
    </BrandCard>
  );
}
