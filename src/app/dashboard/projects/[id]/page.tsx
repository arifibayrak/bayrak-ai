import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BoqTab } from '@/components/dashboard/BoqTab';
import { RouteTab } from '@/components/dashboard/RouteTab';
import { PeopleTab } from '@/components/dashboard/PeopleTab';
import { getProject } from '@/actions/projects';
import { getPendingPeople, getActivePeople } from '@/actions/people';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab } = await searchParams;

  const t = await getTranslations('dashboard.projects');
  const boqT = await getTranslations('dashboard.boq');
  const routeT = await getTranslations('dashboard.route');
  const peopleT = await getTranslations('dashboard.people');

  const project = await getProject(id);
  if (!project) notFound();

  const [pendingPeople, activePeople, projects] = await Promise.all([
    getPendingPeople(),
    getActivePeople(),
    // Projects are needed for the People tab project selects
    import('@/actions/projects').then(m => m.getProjects()),
  ]);

  // Determine active tab — default to 'boq'
  const activeTab = tab === 'rota' ? 'rota' : tab === 'personel' ? 'personel' : 'boq';

  return (
    <div className="space-y-0">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground mb-4">
        <Link href="/dashboard/projects" className="hover:underline">
          {t('title')}
        </Link>
        <span className="mx-1">/</span>
        <span className="text-foreground font-medium">{project.name}</span>
      </nav>

      {/* Page heading */}
      <h1 className="text-xl font-semibold mb-4">{project.name}</h1>

      {/* Tab strip — tab state in URL ?tab=boq|rota|personel */}
      <Tabs defaultValue={activeTab} className="w-full">
        <div className="border-b border-border sticky top-14 bg-background z-10 -mx-6 px-6">
          <TabsList variant="line" className="h-10 w-auto">
            <TabsTrigger value="boq">
              <Link href={`/dashboard/projects/${id}?tab=boq`} className="contents" prefetch={false}>
                {boqT('title')}
              </Link>
            </TabsTrigger>
            <TabsTrigger value="rota">
              <Link href={`/dashboard/projects/${id}?tab=rota`} className="contents" prefetch={false}>
                {routeT('title')}
              </Link>
            </TabsTrigger>
            <TabsTrigger value="personel">
              <Link href={`/dashboard/projects/${id}?tab=personel`} className="contents" prefetch={false}>
                {peopleT('active_title')}
              </Link>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="boq" className="pt-12">
          <BoqTab projectId={id} />
        </TabsContent>

        <TabsContent value="rota" className="pt-12">
          <RouteTab projectId={id} />
        </TabsContent>

        <TabsContent value="personel" className="pt-12">
          <PeopleTab
            projectId={id}
            pendingPeople={pendingPeople}
            activePeople={activePeople}
            projects={projects}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
