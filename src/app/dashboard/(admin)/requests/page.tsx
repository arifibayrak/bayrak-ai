/**
 * Telegram Join Requests — /dashboard/requests
 *
 * A dedicated, cross-project inbox where office engineers (authenticated via
 * bayrak.ai magic-link email) accept or reject field workers who started the
 * Telegram bot. Each pending person sent /start to the bot, which inserted a
 * pending_people row; approving assigns a name + role + project and creates the
 * people + assignment rows (approvePending), after which they can log work.
 *
 * Previously this approval surface only existed inside each project's Personel
 * tab; this page centralises it as a top-level section.
 *
 * Security: auth() guard first; getPendingPeople() / getProjects() are tenant-scoped.
 */

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { UserPlus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getPendingPeople } from '@/actions/people';
import { getProjects } from '@/actions/projects';
import { PendingPeopleTable } from '@/components/dashboard/PendingPeopleTable';
import { BrandBadge, BrandCard, BrandEmpty, BrandHeading } from '@/components/brand';

export const dynamic = 'force-dynamic';

export default async function RequestsPage() {
  const session = await auth();
  if (!session) redirect('/auth/signin');

  const t = await getTranslations('dashboard.admin.requests');

  const [pending, projects] = await Promise.all([getPendingPeople(), getProjects()]);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  if (pending.length === 0) {
    return (
      <div className="flex min-h-[70vh] flex-col">
        <BrandHeading as="h1" size="h1">{t('heading')}</BrandHeading>
        <BrandEmpty
          className="flex-1"
          icon={<UserPlus className="size-12 text-muted-foreground" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_body')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <BrandHeading as="h1" size="h1">{t('heading')}</BrandHeading>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <BrandBadge variant="info">{t('pending_count', { count: pending.length })}</BrandBadge>
      </div>

      <BrandCard>
        <BrandCard.Body className="p-0 overflow-x-auto">
          <PendingPeopleTable pendingPeople={pending} projects={projectOptions} />
        </BrandCard.Body>
      </BrandCard>
    </div>
  );
}
