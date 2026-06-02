import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { sessionRole } from '@/lib/rbac';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/admin/AppSidebar';
import { TopNav } from '@/components/layout/TopNav';

/**
 * Dashboard layout — session guard (T-03-02) + admin shell (UX-01, D-64).
 * Any unauthenticated request to /dashboard/* is redirected to /auth/signin.
 * Auth guard runs BEFORE any client tree mounts (server-side).
 * SidebarProvider + AppSidebar wrap ALL dashboard routes (including projects/*)
 * via this root layout — no project page files are touched (D-64 compliance).
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect('/auth/signin');

  const userEmail = session.user?.email ?? '';
  const role = sessionRole(session);

  return (
    <SidebarProvider>
      <AppSidebar role={role} />
      <SidebarInset>
        <TopNav userEmail={userEmail} />
        <main className="max-w-5xl mx-auto px-6 py-8 sm:py-10">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
