import { getTranslations } from 'next-intl/server';
import { BrandHeading } from '@/components/brand';
import { ProjectForm } from '@/components/dashboard/ProjectForm';

export default async function NewProjectPage() {
  const t = await getTranslations('dashboard.projects');
  return (
    <div className="space-y-6">
      <BrandHeading as="h1" size="h2">{t('new')}</BrandHeading>
      <ProjectForm mode="new" />
    </div>
  );
}
