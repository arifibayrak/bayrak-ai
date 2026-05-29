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

export type HakedisStatus = 'draft' | 'finalized' | 'submitted' | 'paid';

const STATUS_VARIANT_MAP: Record<
  HakedisStatus,
  'warning' | 'info' | 'primary' | 'success'
> = {
  draft: 'warning',
  finalized: 'info',
  submitted: 'primary',
  paid: 'success',
};

/**
 * Allowlist guard for raw DB status strings (WR-04).
 * Returns the typed status if it is one of the four known values, else `null`.
 * Lets call sites avoid the unsafe `as HakedisStatus` cast that asserts a
 * guarantee the data layer does not enforce at the render boundary.
 */
export function asHakedisStatus(s: string | null | undefined): HakedisStatus | null {
  return s != null && s in STATUS_VARIANT_MAP ? (s as HakedisStatus) : null;
}

interface HakedisStatusBadgeProps {
  // Accepts a raw string: unknown values render a neutral badge with the raw
  // label instead of silently falling through to an undefined variant (WR-04).
  status: string;
}

export function HakedisStatusBadge({ status }: HakedisStatusBadgeProps) {
  const t = useTranslations('dashboard.admin.hakedis');
  const known = asHakedisStatus(status);

  // Known status → translated label + semantic variant.
  // Unknown status → raw string label + neutral variant (no missing-key throw).
  const label = known
    ? t(`status_${known}` as `status_${HakedisStatus}`)
    : status;
  const variant = known ? STATUS_VARIANT_MAP[known] : 'neutral';

  return (
    <BrandBadge variant={variant} aria-label={`Status: ${label}`}>
      {label}
    </BrandBadge>
  );
}
