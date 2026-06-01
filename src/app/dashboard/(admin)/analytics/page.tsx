/**
 * Analytics page — /dashboard/analytics
 *
 * Extended in Phase 9 (Plan 05): adds tenant-scoped list of office engineers
 * as an entry point to the per-engineer activity scorecard.
 *
 * Preserves the Phase-8 heading + coming-soon badge (analytics stub copy retained
 * for features not yet implemented beyond office-engineer scorecards).
 *
 * Office engineers are Auth.js `users` table rows.
 * They are NOT in the `people` table.
 *
 * Security: auth-guarded; tenant-scoped user query.
 * T-09-05-AC: auth() guard at RSC level.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BarChart2 } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { getDefaultTenantId } from '@/lib/tenant';
import { BrandBadge, BrandCard, BrandEmpty, BrandHeading, BrandTable } from '@/components/brand';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session) {
    redirect('/auth/signin');
  }

  const tenantId = getDefaultTenantId();
  const t = await getTranslations('dashboard.admin.stubs');
  const tOe = await getTranslations('dashboard.admin.oe_scorecard');

  // Fetch users (office engineers) who have activity in this tenant.
  // This is a safe tenant-scoped query — users with no activity in this tenant
  // are not listed. A user that exists globally but has no tenant activity will
  // not appear, preventing cross-tenant information disclosure.
  const engineersResult = await db.execute(sql`
    SELECT DISTINCT u.id, u.name, u.email
    FROM users u
    INNER JOIN office_activity_log al ON al.actor_user_id = u.id
    WHERE al.tenant_id = ${tenantId}
    ORDER BY u.name, u.email
  `);

  const engineers = engineersResult.rows.map((r) => ({
    id: String(r.id),
    name: r.name != null ? String(r.name) : null,
    email: r.email != null ? String(r.email) : null,
    displayName: (r.name != null ? String(r.name) : null) ?? String(r.email ?? r.id),
  }));

  // When there are no office engineers with activity yet (the common case until
  // OEs start acting), the page is a forward-looking placeholder — render a
  // full-page-fit empty state at the same scale as the Personnel/Projeler
  // surfaces instead of a tiny note. The office-engineers scorecard table
  // (a shipped feature) takes over once engineers exist.
  if (engineers.length === 0) {
    return (
      <div className="flex min-h-[70vh] flex-col">
        <BrandHeading as="h1" size="h1">{t('analytics_heading')}</BrandHeading>
        <BrandEmpty
          className="flex-1"
          icon={<BarChart2 className="size-12 text-muted-foreground" aria-hidden="true" />}
          title={t('analytics_heading')}
          description={t('analytics_body')}
          action={<BrandBadge variant="neutral">{t('coming_soon')}</BrandBadge>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="space-y-1">
        <BrandHeading as="h1" size="h1">{t('analytics_heading')}</BrandHeading>
        <p className="text-sm text-muted-foreground">{t('analytics_body')}</p>
      </div>

      {/* Office engineers list — entry point to scorecard views */}
      <section className="space-y-3">
        <BrandHeading as="h2" size="h3">{tOe('engineers_table_heading')}</BrandHeading>

        <BrandCard>
          <BrandCard.Body className="p-0">
            <div className="overflow-x-auto">
              <BrandTable.Root>
                <BrandTable.Header>
                  <BrandTable.Row>
                    <BrandTable.Head scope="col">{tOe('engineers_table_name')}</BrandTable.Head>
                    <BrandTable.Head scope="col">{tOe('engineers_table_email')}</BrandTable.Head>
                    <BrandTable.Head scope="col">{tOe('engineers_table_view')}</BrandTable.Head>
                  </BrandTable.Row>
                </BrandTable.Header>
                <BrandTable.Body>
                  {engineers.map((eng) => (
                    <BrandTable.Row key={eng.id}>
                      <BrandTable.Cell className="font-medium">{eng.displayName}</BrandTable.Cell>
                      <BrandTable.Cell className="text-muted-foreground">{eng.email ?? '—'}</BrandTable.Cell>
                      <BrandTable.Cell>
                        <Link
                          href={`/dashboard/analytics/office-engineers/${eng.id}`}
                          className="text-sm hover:underline"
                        >
                          {tOe('engineers_table_view')}
                        </Link>
                      </BrandTable.Cell>
                    </BrandTable.Row>
                  ))}
                </BrandTable.Body>
              </BrandTable.Root>
            </div>
          </BrandCard.Body>
        </BrandCard>
      </section>
    </div>
  );
}
