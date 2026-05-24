import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

/**
 * Dashboard layout — session guard (T-03-02).
 * Any unauthenticated request to /dashboard/* is redirected to /auth/signin.
 * TopNav is rendered at the top of the layout after the guard passes.
 * TopNav is created in Task 2 (plan 01-03); imported here.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect('/auth/signin');

  // TopNav is imported lazily here because it is created in the same plan (Task 2).
  // Using a dynamic import with a fallback-free structure so TypeScript does not
  // error on the missing file before Task 2 runs. The layout file is committed
  // after TopNav exists (both are in the same Task 1 GREEN commit).
  const { TopNav } = await import('@/components/layout/TopNav');
  const userEmail = session.user?.email ?? '';

  return (
    <div className="min-h-screen bg-background">
      <TopNav userEmail={userEmail} />
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
