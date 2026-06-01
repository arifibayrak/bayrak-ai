'use client';

/**
 * HakedisProjectFilter.tsx
 *
 * Client component: a <Select> that updates the ?project= URL param.
 * Wrapped in <Suspense> by the parent RSC page (CSR bailout: useSearchParams).
 *
 * Mirrors the FilterBar project select pattern.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
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

interface HakedisProjectFilterProps {
  projects: ProjectOption[];
  selectedProjectId: string;
}

export function HakedisProjectFilter({
  projects,
  selectedProjectId,
}: HakedisProjectFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('dashboard.admin.hakedis');

  function handleChange(value: string | null) {
    const v = value ?? '';
    const params = new URLSearchParams(searchParams.toString());
    if (v) {
      params.set('project', v);
    } else {
      params.delete('project');
    }
    router.push(`/dashboard/hakedis?${params.toString()}`);
  }

  // base-ui resolves the trigger label from `items` without opening the popup
  // (its <Select.Item>s live in an unmounted Portal) — otherwise the trigger
  // renders the raw project UUID instead of the project name.
  const items: Record<string, string> = Object.fromEntries(
    projects.map((p) => [p.id, p.name])
  );

  return (
    <Select items={items} value={selectedProjectId} onValueChange={handleChange}>
      <SelectTrigger className="w-[200px]" aria-label={t('col_period')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
