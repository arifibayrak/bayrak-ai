import { getTranslations } from 'next-intl/server';
import { PendingPeopleTable } from './PendingPeopleTable';
import { ActivePeopleTable } from './ActivePeopleTable';

interface PendingPerson {
  id: string;
  telegramUserId: bigint;
  telegramName: string | null;
  startedAt: Date;
  tenantId: string | null;
}

interface ActivePersonRow {
  personId: string;
  displayName: string;
  telegramUserId: bigint;
  telegramName: string | null;
  assignmentId: string | null;
  roleOnProject: string | null;
  projectId: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface PeopleTabProps {
  projectId: string;
  pendingPeople: PendingPerson[];
  activePeople: ActivePersonRow[];
  projects: ProjectOption[];
}

export async function PeopleTab({
  projectId: _projectId,
  pendingPeople,
  activePeople,
  projects,
}: PeopleTabProps) {
  const t = await getTranslations('dashboard.people');

  return (
    <div className="space-y-8">
      {/* Pending Approvals — only shown when count > 0 */}
      {pendingPeople.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-semibold text-[hsl(38_92%_50%)]">
              {t('pending_title')}
            </h2>
            <span className="inline-flex items-center rounded-full bg-[hsl(38_92%_50%)] text-white text-xs font-medium px-2 py-0.5">
              {pendingPeople.length}
            </span>
          </div>
          <PendingPeopleTable
            pendingPeople={pendingPeople}
            projects={projects}
          />
        </section>
      )}

      {/* Active People */}
      <section>
        <h2 className="text-xl font-semibold mb-4">{t('active_title')}</h2>
        <ActivePeopleTable
          activePeople={activePeople}
          projects={projects}
        />
      </section>
    </div>
  );
}
