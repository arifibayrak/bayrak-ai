import { getTranslations } from 'next-intl/server';
import { BrandHeading } from '@/components/brand';
import { ProjectForm } from '@/components/dashboard/ProjectForm';
import { requireWriteAccess } from '@/lib/rbac';

export default async function NewProjectPage() {
  // RBAC: office-only page — redirects audit_engineer (and unauthenticated)
  await requireWriteAccess();
  const t = await getTranslations('dashboard.projects');
  return (
    <div className="space-y-6">
      <BrandHeading as="h1" size="h2">{t('new')}</BrandHeading>
      <ProjectForm mode="new" />
    </div>
  );
}
