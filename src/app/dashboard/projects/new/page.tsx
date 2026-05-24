import { getTranslations } from 'next-intl/server';
import { ProjectForm } from '@/components/dashboard/ProjectForm';

export default async function NewProjectPage() {
  const t = await getTranslations('dashboard.projects');
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('new')}</h1>
      <ProjectForm mode="new" />
    </div>
  );
}
