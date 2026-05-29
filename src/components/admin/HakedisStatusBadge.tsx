'use client';

/**
 * HakedisStatusBadge.tsx
 *
 * Reusable status badge for hakkediş periods.
 *
 * Phase 13 (Plan 13-02) brand pass: wraps BrandBadge from src/components/brand/
 * with a semantic-variant mapping. The previous inline class palette is removed;
 * BrandBadge owns the colour token cascade (D-121).
 *
 * Status → BrandBadge variant mapping:
 *   draft      → warning  (orange — D-121 warning slot; amber is reserved for brand primary)
 *   finalized  → info     (sky)
 *   submitted  → primary  (amber — in-progress payment)
 *   paid       → success  (emerald)
 *
 * Marked 'use client' so it can be used both in RSC (imported by server page)
 * and in client components (dialogs). useTranslations works in both contexts.
 *
 * Accessibility: aria-label="Status: {statusLabel}" per UI-SPEC Accessibility Contract.
 */

import { useTranslations } from 'next-intl';
import { BrandBadge } from '@/components/brand';

type HakedisStatus = 'draft' | 'finalized' | 'submitted' | 'paid';

const STATUS_VARIANT_MAP: Record<
  HakedisStatus,
  'warning' | 'info' | 'primary' | 'success'
> = {
  draft: 'warning',
  finalized: 'info',
  submitted: 'primary',
  paid: 'success',
};

interface HakedisStatusBadgeProps {
  status: HakedisStatus;
}

export function HakedisStatusBadge({ status }: HakedisStatusBadgeProps) {
  const t = useTranslations('dashboard.admin.hakedis');
  const label = t(`status_${status}` as `status_${'draft' | 'finalized' | 'submitted' | 'paid'}`);

  return (
    <BrandBadge
      variant={STATUS_VARIANT_MAP[status]}
      aria-label={`Status: ${label}`}
    >
      {label}
    </BrandBadge>
  );
}
