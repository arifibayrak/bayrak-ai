import Link from 'next/link';
import { FolderOpenIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { getProjects } from '@/actions/projects';

export default async function ProjectsPage() {
  const t = await getTranslations('dashboard.projects');
  const projects = await getProjects();

  return (
    <div className="space-y-6">
      {/* Page heading + CTA */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button render={<Link href="/dashboard/projects/new" />}>
          {t('create_project')}
        </Button>
      </div>

      {/* Project list / empty state */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
          <FolderOpenIcon className="size-12" />
          <p className="text-sm">{t('empty_state')}</p>
        </div>
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
