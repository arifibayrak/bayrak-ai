import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BoqTab } from '@/components/dashboard/BoqTab';
import { RouteTab } from '@/components/dashboard/RouteTab';
import { PeopleTab } from '@/components/dashboard/PeopleTab';
import { KayitlarTab } from '@/components/dashboard/KayitlarTab';
import { RefreshOnFocus } from '@/components/dashboard/RefreshOnFocus';
import { getProject } from '@/actions/projects';
import { getPendingPeople, getActivePeople } from '@/actions/people';

// D-55 / RESEARCH Open Q1: force-dynamic on the page segment ensures every
// load/navigation re-fetches fresh data (map points + BOQ %) from the server.
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; status?: string; page?: string }>;
}

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab, status, page } = await searchParams;

  const t = await getTranslations('dashboard.projects');
  const boqT = await getTranslations('dashboard.boq');
  const routeT = await getTranslations('dashboard.route');
  const peopleT = await getTranslations('dashboard.people');
  const submissionsT = await getTranslations('dashboard.submissions');

  const project = await getProject(id);
  if (!project) notFound();

  const [pendingPeople, activePeople, projects] = await Promise.all([
    getPendingPeople(),
    getActivePeople(),
    // Projects are needed for the People tab project selects
    import('@/actions/projects').then(m => m.getProjects()),
  ]);

  // Determine active tab — default to 'boq' (D-49 order: BOQ · Rota · Kayıtlar · Personel)
  const activeTab =
    tab === 'rota'     ? 'rota'     :
    tab === 'kayitlar' ? 'kayitlar' :
    tab === 'personel' ? 'personel' : 'boq';

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
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-5">{project.name}</h1>

      {/* Refresh on window focus / visibility regain so map + BOQ % update (DASH-05 / D-55) */}
      <RefreshOnFocus />

      {/* Tab strip — tab state in URL ?tab=boq|rota|kayitlar|personel (D-49) */}
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
            <TabsTrigger value="kayitlar">
              <Link href={`/dashboard/projects/${id}?tab=kayitlar`} className="contents" prefetch={false}>
                {submissionsT('tab_label')}
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

        <TabsContent value="kayitlar" className="pt-12">
          <KayitlarTab projectId={id} searchParams={{ status, page }} />
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
