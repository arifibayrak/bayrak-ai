'use client';

/**
 * LeaderboardSortSelect — "Rank by" metric selector for the People leaderboard.
 *
 * Updates the `sortBy` URL param using useRouter().push() — mirrors FilterBar.tsx pattern.
 * MUST be wrapped in <Suspense> by the page (useSearchParams CSR bailout prevention).
 *
 * Security (T-09-05-T): sortBy value is only used as a URL parameter passed to the RSC;
 * the RSC maps it through a fixed allowlist (getWorkerSortFn / getAuditorSortFn),
 * never interpolated into SQL.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SortOption {
  value: string;
  label: string;
}

interface LeaderboardSortSelectProps {
  options: SortOption[];
  currentValue: string;
  /** aria-label / visible label for the selector */
  label: string;
}

export function LeaderboardSortSelect({
  options,
  currentValue,
  label,
}: LeaderboardSortSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(value: string | null) {
    if (!value) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('sortBy', value);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground whitespace-nowrap">{label}</span>
      <Select value={currentValue} onValueChange={handleChange}>
        <SelectTrigger className="w-[200px]" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
