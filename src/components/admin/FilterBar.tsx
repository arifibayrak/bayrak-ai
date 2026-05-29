'use client';

/**
 * FilterBar.tsx
 *
 * Global filter bar for admin pages: date range (from/to), project, person, clear.
 * URL-state driven: updates query params via router.push (D-73).
 *
 * MUST be wrapped in <Suspense> by every parent page (useSearchParams CSR bailout).
 *
 * Security (T-08-04-DATE): date validation happens server-side in page.tsx before SQL.
 * Security (T-08-04-ID): project/person IDs are passed to analytics functions as bound params.
 */

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { BrandButton } from '@/components/brand';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProjectOption {
  id: string;
  name: string;
}

interface PersonOption {
  id: string;
  name: string;
}

interface FilterBarProps {
  projectOptions: ProjectOption[];
  personOptions?: PersonOption[];
  showStatus?: boolean;
}

export function FilterBar({ projectOptions, personOptions, showStatus = false }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('dashboard.admin.filters');

  // Clone params, set or delete a key, then navigate
  function applyFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearFilters() {
    router.push(pathname);
  }

  const currentFrom = searchParams.get('from') ?? '';
  const currentTo = searchParams.get('to') ?? '';
  const currentProject = searchParams.get('project') ?? '';
  const currentPerson = searchParams.get('person') ?? '';
  const currentStatus = searchParams.get('status') ?? '';

  const STATUS_OPTIONS = [
    { value: 'pending_audit', label: t('status_pending') },
    { value: 'approved', label: t('status_approved') },
    { value: 'rejected', label: t('status_rejected') },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-end md:gap-3">
      {/* From date */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-from"
          className="text-sm font-semibold text-muted-foreground"
        >
          {t('from')}
        </label>
        <Input
          id="filter-from"
          type="date"
          className="w-full md:w-[160px]"
          value={currentFrom}
          onChange={(e) => applyFilter('from', e.target.value || null)}
        />
      </div>

      {/* To date */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-to"
          className="text-sm font-semibold text-muted-foreground"
        >
          {t('to')}
        </label>
        <Input
          id="filter-to"
          type="date"
          className="w-full md:w-[160px]"
          value={currentTo}
          onChange={(e) => applyFilter('to', e.target.value || null)}
        />
      </div>

      {/* Project select */}
      {projectOptions.length > 0 && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-project"
            className="text-sm font-semibold text-muted-foreground"
          >
            {/* visually hidden — select has placeholder */}
          </label>
          <Select
            value={currentProject || '__all__'}
            onValueChange={(value: string | null) => {
              const v = value ?? '';
              applyFilter('project', v === '__all__' ? null : v);
            }}
          >
            <SelectTrigger id="filter-project" className="w-full md:w-[200px]">
              <SelectValue placeholder={t('all_projects')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('all_projects')}</SelectItem>
              {projectOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Person select (optional) */}
      {personOptions && personOptions.length > 0 && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-person"
            className="text-sm font-semibold text-muted-foreground"
          >
            {/* visually hidden — select has placeholder */}
          </label>
          <Select
            value={currentPerson || '__all__'}
            onValueChange={(value: string | null) => {
              const v = value ?? '';
              applyFilter('person', v === '__all__' ? null : v);
            }}
          >
            <SelectTrigger id="filter-person" className="w-full md:w-[200px]">
              <SelectValue placeholder={t('all_people')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('all_people')}</SelectItem>
              {personOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Status select (optional — records list only) */}
      {showStatus && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-status"
            className="text-sm font-semibold text-muted-foreground"
          >
            {/* visually hidden — select has placeholder */}
          </label>
          <Select
            value={currentStatus || '__all__'}
            onValueChange={(value: string | null) => {
              const v = value ?? '';
              applyFilter('status', v === '__all__' ? null : v);
            }}
          >
            <SelectTrigger id="filter-status" className="w-full md:w-[180px]">
              <SelectValue placeholder={t('all_statuses')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('all_statuses')}</SelectItem>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Clear button */}
      <div className="flex flex-col justify-end">
        <BrandButton
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          aria-label={t('clear')}
        >
          {t('clear')}
        </BrandButton>
      </div>
    </div>
  );
}
