import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BrandCard, BrandHeading } from '@/components/brand';
import { ProjectForm } from '@/components/dashboard/ProjectForm';
import { getProject } from '@/actions/projects';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProjectPage({ params }: Props) {
  const { id } = await params;
  const t = await getTranslations('dashboard.projects');

  const project = await getProject(id);
  if (!project) notFound();

  return (
    <div className="space-y-6">
      <BrandHeading as="h1" size="h2">
        {t('edit')}: {project.name}
      </BrandHeading>
      <BrandCard>
        <BrandCard.Body>
          <ProjectForm
            mode="edit"
            projectId={project.id}
            defaultName={project.name}
            defaultDescription={project.description ?? ''}
          />
        </BrandCard.Body>
      </BrandCard>
    </div>
  );
}
