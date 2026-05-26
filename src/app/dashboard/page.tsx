import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * /dashboard root page — immediately redirects to /dashboard/overview.
 * The persistent sidebar and auth guard are inherited from dashboard/layout.tsx.
 */
export default function DashboardRootPage() {
  redirect('/dashboard/overview');
}
