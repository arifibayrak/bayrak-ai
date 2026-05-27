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
import { Badge } from '@/components/ui/badge';
import { redirect } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
        <h1 className="text-xl font-semibold">{t('analytics_heading')}</h1>
        <Badge variant="secondary">{t('coming_soon')}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{t('analytics_body')}</p>

      {/* Office engineers list — entry point to scorecard views */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">{tOe('engineers_table_heading')}</h2>

        {engineers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tOe('no_engineers')}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{tOe('engineers_table_name')}</TableHead>
                  <TableHead scope="col">{tOe('engineers_table_email')}</TableHead>
                  <TableHead scope="col">{tOe('engineers_table_view')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {engineers.map((eng) => (
                  <TableRow key={eng.id}>
                    <TableCell className="font-medium">{eng.displayName}</TableCell>
                    <TableCell className="text-muted-foreground">{eng.email ?? '—'}</TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/analytics/office-engineers/${eng.id}`}
                        className="text-sm hover:underline"
                      >
                        {tOe('engineers_table_view')}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
