'use client';

/**
 * HakedisStatusBadge.tsx
 *
 * Reusable status badge for hakkediş periods.
 * UI-SPEC Surface 1 / Status badge color map:
 *   draft      → amber
 *   finalized  → blue
 *   submitted  → violet
 *   paid       → emerald
 *
 * Marked 'use client' so it can be used both in RSC (imported by server page)
 * and in client components (dialogs). useTranslations works in both contexts.
 *
 * Accessibility: aria-label="Status: {statusLabel}" per UI-SPEC Accessibility Contract.
 */

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type HakedisStatus = 'draft' | 'finalized' | 'submitted' | 'paid';

const STATUS_CLASS_MAP: Record<HakedisStatus, string> = {
  draft: 'text-amber-600 bg-amber-50 border border-amber-200',
  finalized: 'text-blue-700 bg-blue-50 border border-blue-200',
  submitted: 'text-violet-700 bg-violet-50 border border-violet-200',
  paid: 'text-emerald-700 bg-emerald-50 border border-emerald-200',
};

interface HakedisStatusBadgeProps {
  status: HakedisStatus;
}

export function HakedisStatusBadge({ status }: HakedisStatusBadgeProps) {
  const t = useTranslations('dashboard.admin.hakedis');
  const label = t(`status_${status}` as `status_${'draft' | 'finalized' | 'submitted' | 'paid'}`);

  return (
    <Badge
      variant="secondary"
      className={cn(STATUS_CLASS_MAP[status])}
      aria-label={`Status: ${label}`}
    >
      {label}
    </Badge>
  );
}
