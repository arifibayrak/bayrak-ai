'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
  FolderIcon,
  ClockIcon,
  LayersIcon,
  UsersIcon,
} from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { BrandBadge } from '@/components/brand';
import { deleteProject } from '@/actions/projects';
import { formatMoneySymbol } from '@/lib/format-money';
import {
  type ProjectStatus,
  projectStatusBadgeVariant,
} from '@/lib/project-status';
import { cn } from '@/lib/utils';

export type ProjectVM = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  status: ProjectStatus;
  progressPct: number | null;
  primaryCurrency: string | null;
  contractedValue: number | null;
  earnedValue: number | null;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  boqCount: number;
  workerCount: number;
  lastActivityAt: string | null;
};

const STATUS_BAR_CLASS: Record<ProjectStatus, string> = {
  complete: 'bg-emerald-500',
  on_track: 'bg-sky-500',
  at_risk: 'bg-orange-500',
  stalled: 'bg-red-500',
  not_started: 'bg-muted-foreground/40',
};

/** Short relative-time label ("2d ago") using the active locale. */
function relativeTime(iso: string, locale: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diffMs = then - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale === 'tr' ? 'tr' : 'en', {
    numeric: 'auto',
    style: 'short',
  });
  const mins = Math.round(diffMs / 60000);
  const absMins = Math.abs(mins);
  if (absMins < 60) return rtf.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(days, 'day');
  const months = Math.round(days / 30);
  return rtf.format(months, 'month');
}

export function ProjectPortfolioCard({ project }: { project: ProjectVM }) {
  const t = useTranslations('dashboard.projects');
  const tp = useTranslations('dashboard.projects.portfolio');
  const common = useTranslations('common');
  const locale = useLocale();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const statusLabel = tp(`status_${project.status}`);
  const pct = project.progressPct;
  const barPct = pct == null ? 0 : Math.max(0, Math.min(100, pct));

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteProject(project.id);
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <Card className="group flex flex-col transition-all hover:shadow-md hover:border-primary/40">
        <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <FolderIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <Link
                href={`/dashboard/projects/${project.id}`}
                className="block text-[1.05rem] font-semibold tracking-tight leading-tight hover:text-primary hover:underline truncate"
              >
                {project.name}
              </Link>
              {project.description ? (
                <p className="text-xs text-muted-foreground truncate">{project.description}</p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <BrandBadge variant={projectStatusBadgeVariant(project.status)}>
              {statusLabel}
            </BrandBadge>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm">
                    <MoreHorizontalIcon />
                    <span className="sr-only">{t('edit')}</span>
                  </Button>
                }
              />
              <DropdownMenuContent side="bottom" align="end">
                <DropdownMenuItem>
                  <Link href={`/dashboard/projects/${project.id}/edit`} className="flex items-center gap-2 w-full">
                    <PencilIcon className="size-3.5" />
                    {t('edit')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
                  <Trash2Icon className="size-3.5" />
                  {t('delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-3 pt-0">
          {/* Progress */}
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground uppercase tracking-wide text-[11px]">
                {tp('card_progress')}
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {pct == null ? '—' : `${pct.toFixed(0)}%`}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-all', STATUS_BAR_CLASS[project.status])}
                style={{ width: `${barPct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {project.primaryCurrency && project.contractedValue != null
                ? tp('card_earned_of', {
                    earned: formatMoneySymbol(
                      project.earnedValue != null ? String(project.earnedValue) : '0',
                      project.primaryCurrency,
                      locale,
                    ),
                    contract: formatMoneySymbol(
                      String(project.contractedValue),
                      project.primaryCurrency,
                      locale,
                    ),
                  })
                : tp('card_no_value')}
            </p>
          </div>

          {/* Stat chips */}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {project.pendingCount > 0 ? (
              <BrandBadge variant="warning">{tp('card_pending', { n: project.pendingCount })}</BrandBadge>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <LayersIcon className="size-3.5" aria-hidden="true" />
              <span className="tabular-nums">{tp('card_boq', { n: project.boqCount })}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <UsersIcon className="size-3.5" aria-hidden="true" />
              <span className="tabular-nums">{tp('card_workers', { n: project.workerCount })}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="size-3.5" aria-hidden="true" />
              {project.lastActivityAt
                ? tp('card_last_activity', { time: relativeTime(project.lastActivityAt, locale) })
                : tp('card_no_activity')}
            </span>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delete')}</DialogTitle>
            <DialogDescription>
              {common('delete_project_confirm', { projectName: project.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              {common('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? common('loading') : common('yes_delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
