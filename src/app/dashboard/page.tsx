import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  Clock,
  CheckCircle2,
  XCircle,
  HardHat,
  PauseCircle,
  LayoutDashboard,
  BarChart2,
  FolderOpen,
  Users,
  UserPlus,
  FileText,
  Download,
  ShieldCheck,
  Plus,
  ChevronRight,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { sessionRole } from '@/lib/rbac';
import { ROLES, type Role } from '@/lib/authz';
import { getPortfolioKPIs, getStalledProjects, getProjectsPortfolio } from '@/actions/analytics';
import { getTenantSettings } from '@/actions/settings';
import {
  deriveProjectStatus,
  projectStatusBadgeVariant,
  PROJECT_STATUS,
  type ProjectStatus,
} from '@/lib/project-status';
import { BrandBadge, BrandCard, BrandHeading } from '@/components/brand';
import { KpiCard } from '@/components/admin/KpiCard';

export const dynamic = 'force-dynamic';

/**
 * /dashboard root — role-tailored home (the dedicated per-role landing).
 * Admin/office land here with portfolio KPIs + an attention list + quick links;
 * audit_engineer gets a read-only monitoring home that only links to their
 * allowed surfaces (overview, records, analytics). The session guard lives in
 * dashboard/layout.tsx; this page is intentionally NOT write-guarded so audit
 * engineers can use it as their home.
 */
export default async function DashboardHomePage() {
  const session = await auth();
  const role = sessionRole(session);
  const t = await getTranslations('dashboard.home');
  const tStatus = await getTranslations('dashboard.projects.portfolio');

  const userLabel = session?.user?.name || session?.user?.email || '';
  const isAudit = role === ROLES.AUDIT;

  const settings = await getTenantSettings();
  const [kpis, stalled] = await Promise.all([
    getPortfolioKPIs({}),
    getStalledProjects(settings.stalledDays),
  ]);

  // Attention list only for write-roles (project detail pages are office-only,
  // so linking them for an audit_engineer would just bounce to overview).
  let attention: Array<{ id: string; name: string; status: ProjectStatus; pending: number }> = [];
  if (!isAudit) {
    const rows = await getProjectsPortfolio();
    const now = new Date();
    attention = rows
      .map((r) => {
        const s = deriveProjectStatus(
          r,
          { stalledDays: settings.stalledDays, rejectionRateThreshold: Number(settings.rejectionRateThreshold) },
          now,
        );
        return { id: r.projectId, name: r.projectName, status: s.status, pending: r.pendingCount };
      })
      .filter((p) => p.status === PROJECT_STATUS.AT_RISK || p.status === PROJECT_STATUS.STALLED)
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 5);
  }

  const quickLinks = quickLinksForRole(role);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BrandHeading as="h1" size="h1">
          {t('greeting')}{userLabel ? `, ${userLabel}` : ''}
        </BrandHeading>
        <p className="text-sm text-muted-foreground">
          {t(`role_${role}`)}
          {isAudit ? ` · ${t('readonly_note')}` : ''}
        </p>
      </div>

      {/* Snapshot KPIs */}
      <section className="space-y-3">
        <BrandHeading as="h2" size="h3">{t('section_snapshot')}</BrandHeading>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label={t('kpi_pending')}
            subLabel=""
            value={kpis.pendingBacklog}
            icon={<Clock className="size-4" aria-hidden="true" />}
            valueColor={kpis.pendingBacklog > 0 ? 'warning' : 'default'}
            drillHref="/dashboard/records?status=pending_audit"
          />
          <KpiCard
            label={t('kpi_approvals')}
            subLabel=""
            value={kpis.approvalsInRange}
            icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
            valueColor="success"
            drillHref="/dashboard/records?status=approved"
          />
          {isAudit ? (
            <KpiCard
              label={t('kpi_rejections')}
              subLabel=""
              value={kpis.rejectionsInRange}
              icon={<XCircle className="size-4" aria-hidden="true" />}
              drillHref="/dashboard/records?status=rejected"
            />
          ) : (
            <KpiCard
              label={t('kpi_workers')}
              subLabel=""
              value={kpis.activeWorkers}
              icon={<HardHat className="size-4" aria-hidden="true" />}
            />
          )}
          <KpiCard
            label={t('kpi_stalled')}
            subLabel=""
            value={stalled.length}
            icon={<PauseCircle className="size-4" aria-hidden="true" />}
            valueColor={stalled.length > 0 ? 'destructive' : 'default'}
          />
        </div>
      </section>

      {/* Attention list (write-roles only) */}
      {!isAudit ? (
        <section className="space-y-3">
          <BrandHeading as="h2" size="h3">{t('section_attention')}</BrandHeading>
          <BrandCard>
            <BrandCard.Body className="p-0">
              {attention.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">{t('attention_none')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {attention.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/dashboard/projects/${p.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <BrandBadge variant={projectStatusBadgeVariant(p.status)}>
                            {tStatus(`status_${p.status}`)}
                          </BrandBadge>
                          <span className="truncate font-medium">{p.name}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                          {p.pending > 0 ? <span className="tabular-nums">{p.pending}</span> : null}
                          <ChevronRight className="size-4" aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </BrandCard.Body>
          </BrandCard>
        </section>
      ) : null}

      {/* Quick links */}
      <section className="space-y-3">
        <BrandHeading as="h2" size="h3">{t('section_quicklinks')}</BrandHeading>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {quickLinks.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <q.icon className="size-4" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium">{t(q.labelKey)}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

type QuickLink = { href: string; icon: typeof LayoutDashboard; labelKey: string };

function quickLinksForRole(role: Role): QuickLink[] {
  if (role === ROLES.AUDIT) {
    return [
      { href: '/dashboard/overview', icon: LayoutDashboard, labelKey: 'link_overview' },
      { href: '/dashboard/records', icon: FileText, labelKey: 'link_records' },
      { href: '/dashboard/analytics', icon: BarChart2, labelKey: 'link_analytics' },
    ];
  }

  const common: QuickLink[] = [
    { href: '/dashboard/projects', icon: FolderOpen, labelKey: 'link_projects' },
    { href: '/dashboard/projects/new', icon: Plus, labelKey: 'link_new_project' },
    { href: '/dashboard/overview', icon: LayoutDashboard, labelKey: 'link_overview' },
    { href: '/dashboard/analytics', icon: BarChart2, labelKey: 'link_analytics' },
    { href: '/dashboard/people', icon: Users, labelKey: 'link_people' },
    { href: '/dashboard/requests', icon: UserPlus, labelKey: 'link_requests' },
    { href: '/dashboard/hakedis', icon: FileText, labelKey: 'link_hakedis' },
    { href: '/dashboard/exports', icon: Download, labelKey: 'link_exports' },
  ];

  if (role === ROLES.ADMIN) {
    common.push({ href: '/dashboard/settings/users', icon: ShieldCheck, labelKey: 'link_accounts' });
  }
  return common;
}
