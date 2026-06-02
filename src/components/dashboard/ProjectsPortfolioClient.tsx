'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { SearchIcon, FolderOpenIcon, AlertTriangleIcon, ClockIcon } from 'lucide-react';
import { ProjectPortfolioCard, type ProjectVM } from './ProjectPortfolioCard';
import { formatMoneySymbol } from '@/lib/format-money';
import { cn } from '@/lib/utils';

type SortKey = 'recent' | 'name' | 'progress' | 'pending' | 'value';

export function ProjectsPortfolioClient({ projects }: { projects: ProjectVM[] }) {
  const tp = useTranslations('dashboard.projects.portfolio');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');

  // Headline totals — grouped by primary currency (never summed across
  // currencies). The largest-contract currency group is shown.
  const summary = useMemo(() => {
    const byCurrency = new Map<string, { contract: number; earned: number }>();
    let pending = 0;
    let attention = 0;
    for (const p of projects) {
      pending += p.pendingCount;
      if (p.status === 'at_risk' || p.status === 'stalled') attention += 1;
      if (p.primaryCurrency) {
        const g = byCurrency.get(p.primaryCurrency) ?? { contract: 0, earned: 0 };
        g.contract += p.contractedValue ?? 0;
        g.earned += p.earnedValue ?? 0;
        byCurrency.set(p.primaryCurrency, g);
      }
    }
    const top = [...byCurrency.entries()].sort((a, b) => b[1].contract - a[1].contract)[0];
    return {
      count: projects.length,
      pending,
      attention,
      currency: top?.[0] ?? null,
      contract: top?.[1].contract ?? null,
      earned: top?.[1].earned ?? null,
    };
  }, [projects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.description ?? '').toLowerCase().includes(q),
        )
      : projects.slice();
    rows.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name, locale);
        case 'progress':
          return (b.progressPct ?? -1) - (a.progressPct ?? -1);
        case 'pending':
          return b.pendingCount - a.pendingCount;
        case 'value':
          return (b.earnedValue ?? 0) - (a.earnedValue ?? 0);
        case 'recent':
        default:
          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      }
    });
    return rows;
  }, [projects, query, sort, locale]);

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          icon={<FolderOpenIcon className="size-4" />}
          label={tp('summary_projects')}
          value={String(summary.count)}
        />
        <SummaryTile
          icon={<span className="text-sm font-semibold">₺</span>}
          label={tp('summary_contract')}
          value={
            summary.currency && summary.contract != null
              ? formatMoneySymbol(String(summary.contract), summary.currency, locale)
              : '—'
          }
        />
        <SummaryTile
          icon={<span className="text-sm font-semibold">✓</span>}
          label={tp('summary_earned')}
          value={
            summary.currency && summary.earned != null
              ? formatMoneySymbol(String(summary.earned), summary.currency, locale)
              : '—'
          }
        />
        <SummaryTile
          icon={summary.attention > 0 ? <AlertTriangleIcon className="size-4" /> : <ClockIcon className="size-4" />}
          label={summary.attention > 0 ? tp('summary_attention') : tp('summary_pending')}
          value={summary.attention > 0 ? String(summary.attention) : String(summary.pending)}
          tone={summary.attention > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tp('search_placeholder')}
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={tp('search_placeholder')}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {tp('sort_label')}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="recent">{tp('sort_recent')}</option>
            <option value="name">{tp('sort_name')}</option>
            <option value="progress">{tp('sort_progress')}</option>
            <option value="pending">{tp('sort_pending')}</option>
            <option value="value">{tp('sort_value')}</option>
          </select>
        </label>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{tp('no_results')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <ProjectPortfolioCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className={cn('inline-flex items-center justify-center', tone === 'warning' ? 'text-orange-500' : 'text-muted-foreground')}>
          {icon}
        </span>
        {label}
      </div>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums', tone === 'warning' ? 'text-orange-600' : 'text-foreground')}>
        {value}
      </p>
    </div>
  );
}
