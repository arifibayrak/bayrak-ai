import Link from 'next/link';
import { FolderOpenIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { BrandButton, BrandCard, BrandHeading } from '@/components/brand';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { getProjects } from '@/actions/projects';
import { requireWriteAccess } from '@/lib/rbac';

export default async function ProjectsPage() {
  // RBAC: office-only page — redirects audit_engineer (and unauthenticated)
  await requireWriteAccess();
  const t = await getTranslations('dashboard.projects');
  const projects = await getProjects();

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

      {/* Project list / empty state */}
      {projects.length === 0 ? (
        <BrandCard>
          <BrandCard.Body className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
            <FolderOpenIcon className="size-12" />
            <p className="text-sm">{t('empty_state')}</p>
          </BrandCard.Body>
        </BrandCard>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              id={project.id}
              name={project.name}
              createdAt={project.createdAt}
              boqCount={project.boqCount}
              peopleCount={project.peopleCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}
