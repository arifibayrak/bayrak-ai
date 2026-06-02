import Link from 'next/link';
import { FolderOpenIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { BrandButton, BrandCard, BrandHeading } from '@/components/brand';
import { ProjectsPortfolioClient } from '@/components/dashboard/ProjectsPortfolioClient';
import type { ProjectVM } from '@/components/dashboard/ProjectPortfolioCard';
import { getProjectsPortfolio } from '@/actions/analytics';
import { getTenantSettings } from '@/actions/settings';
import { requireWriteAccess } from '@/lib/rbac';
import { deriveProjectStatus } from '@/lib/project-status';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  // RBAC: office-only page — redirects audit_engineer (and unauthenticated)
  await requireWriteAccess();
  const t = await getTranslations('dashboard.projects');

  const [rows, settings] = await Promise.all([
    getProjectsPortfolio(),
    getTenantSettings(),
  ]);

  // Derive status server-side (single source of truth) and shape view-models.
  const now = new Date();
  const projects: ProjectVM[] = rows.map((r) => {
    const s = deriveProjectStatus(
      r,
      {
        stalledDays: settings.stalledDays,
        rejectionRateThreshold: Number(settings.rejectionRateThreshold),
      },
      now,
    );
    return {
      id: r.projectId,
      name: r.projectName,
      description: r.description,
      createdAt: r.createdAt,
      status: s.status,
      progressPct: s.progressPct,
      primaryCurrency: s.primaryCurrency,
      contractedValue: s.contractedValue,
      earnedValue: s.earnedValue,
      approvedCount: r.approvedCount,
      pendingCount: r.pendingCount,
      rejectedCount: r.rejectedCount,
      boqCount: r.boqCount,
      workerCount: r.workerCount,
      lastActivityAt: r.lastActivityAt,
    };
  });

  return (
    <div className="space-y-6">
      {/* Page heading + CTA */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <BrandHeading as="h1" size="h1">{t('title')}</BrandHeading>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <BrandButton variant="primary" size="md" render={<Link href="/dashboard/projects/new" />}>
          {t('create_project')}
        </BrandButton>
      </div>

      {/* Portfolio dashboard / empty state */}
      {projects.length === 0 ? (
        <BrandCard>
          <BrandCard.Body className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
            <FolderOpenIcon className="size-12" />
            <p className="text-sm">{t('empty_state')}</p>
          </BrandCard.Body>
        </BrandCard>
      ) : (
        <ProjectsPortfolioClient projects={projects} />
      )}
    </div>
  );
}
