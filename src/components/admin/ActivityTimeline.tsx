'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TimelineEntry = {
  /** submission ID — used as drill-through key and link target */
  id: string;
  status: 'approved' | 'rejected' | 'pending_audit';
  material: string;
  unit: string;
  quantity: string;
  /** ISO-8601 date string; formatted by parent before passing */
  dateStr: string;
  /** Raw Date used for month grouping */
  date: Date;
  /** Auditor mode only: name of the worker who made the submission */
  workerName?: string;
  /** Auditor mode only: e.g. "2.3 sa" / "2.3 h" — pre-formatted by parent */
  latencyLabel?: string;
};

interface ActivityTimelineProps {
  entries: TimelineEntry[];
  mode: 'worker' | 'auditor';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

function StatusDot({ status }: { status: TimelineEntry['status'] }) {
  const colorClass =
    status === 'approved'
      ? 'bg-emerald-500'
      : status === 'rejected'
        ? 'bg-destructive'
        : 'bg-amber-500'; // pending_audit

  return (
    <span
      className={`inline-block size-2 rounded-full shrink-0 ${colorClass}`}
      aria-hidden="true"
    />
  );
}

function groupByMonth(entries: TimelineEntry[]): Map<string, TimelineEntry[]> {
  const map = new Map<string, TimelineEntry[]>();
  for (const entry of entries) {
    // "Mayıs 2026" — use tr-TR locale matching the UI-SPEC requirement
    const key = entry.date.toLocaleDateString('tr-TR', {
      month: 'long',
      year: 'numeric',
    });
    const existing = map.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      map.set(key, [entry]);
    }
  }
  return map;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActivityTimeline({ entries, mode }: ActivityTimelineProps) {
  const t = useTranslations('dashboard.admin.timeline');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6">{t('empty')}</p>
    );
  }

  // Newest first — sort by date descending
  const sorted = [...entries].sort((a, b) => b.date.getTime() - a.date.getTime());
  const visible = sorted.slice(0, visibleCount);
  const grouped = groupByMonth(visible);
  const hasMore = visibleCount < entries.length;

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([monthLabel, monthEntries]) => (
        <section key={monthLabel}>
          {/* Month heading — Label 14px/600, muted */}
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            {monthLabel}
          </h3>

          <ol className="divide-y divide-border rounded-md border">
            {monthEntries.map((entry) => {
              const centerText =
                mode === 'worker'
                  ? `${entry.material} — ${entry.quantity} ${entry.unit}`
                  : `${entry.material} — ${entry.quantity} ${entry.unit}${entry.workerName ? ` (${entry.workerName})` : ''}`;

              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 px-3 py-3 min-h-[44px]"
                >
                  {/* Status dot */}
                  <StatusDot status={entry.status} />

                  {/* Center text — grows to fill available space */}
                  <span className="flex-1 text-sm truncate">{centerText}</span>

                  {/* Right: date + optional latency + drill link */}
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {entry.dateStr}
                    </span>
                    {mode === 'auditor' && entry.latencyLabel && (
                      <span className="text-sm text-muted-foreground">
                        {t('decided_in')} {entry.latencyLabel}
                      </span>
                    )}
                    <Link
                      href={`/dashboard/records/${entry.id}`}
                      aria-label={t('view_detail')}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </Link>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {hasMore && (
        <div className="pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            {t('load_more')}
          </Button>
        </div>
      )}
    </div>
  );
}
