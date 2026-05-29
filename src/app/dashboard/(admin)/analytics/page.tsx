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
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { getDefaultTenantId } from '@/lib/tenant';
import { BrandBadge, BrandCard, BrandHeading, BrandTable } from '@/components/brand';
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

  return (
    <div className="space-y-6">
      {/* Page heading — preserve Phase-8 stub copy */}
      <div className="space-y-1">
        <BrandHeading as="h1" size="h1">{t('analytics_heading')}</BrandHeading>
        <BrandBadge variant="neutral">{t('coming_soon')}</BrandBadge>
      </div>
      <p className="text-sm text-muted-foreground">{t('analytics_body')}</p>

      {/* Office engineers list — entry point to scorecard views */}
      <section className="space-y-3">
        <BrandHeading as="h2" size="h3">{tOe('engineers_table_heading')}</BrandHeading>

        {engineers.length === 0 ? (
          <BrandCard>
            <BrandCard.Body>
              <p className="text-sm text-muted-foreground">{tOe('no_engineers')}</p>
            </BrandCard.Body>
          </BrandCard>
        ) : (
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
        )}
      </section>
    </div>
  );
}
