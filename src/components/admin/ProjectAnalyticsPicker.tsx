'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

type Option = { id: string; name: string };

/**
 * ProjectAnalyticsPicker — navigates to ?project=<id> on the analytics page.
 * Read-only-safe: only mutates a URL query param (no server action), so it works
 * for audit_engineer too.
 */
export function ProjectAnalyticsPicker({
  projects,
  selectedId,
}: {
  projects: Option[];
  selectedId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('dashboard.admin.analytics');

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      {t('picker_label')}
      <select
        value={selectedId}
        onChange={(e) => {
          const params = new URLSearchParams();
          params.set('project', e.target.value);
          router.push(`${pathname}?${params.toString()}`);
        }}
        className="h-9 max-w-[18rem] rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
