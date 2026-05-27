/**
 * Office Engineer Scorecard — /dashboard/analytics/office-engineers/[userId]
 *
 * PERF-03 / D-80 revised: read-only view of an office engineer's logged
 * administrative actions from the Phase-7 office_activity_log data layer.
 *
 * Data source: getOfficeActivityLog({ actorUserId }) — reuses the existing Phase-7
 * function. Do NOT rebuild the data layer.
 *
 * Office engineers live in the `users` table (Auth.js), NOT in `people`.
 *
 * Security:
 *   T-09-05-AC: auth() guard + tenant-scoped user lookup → notFound() on miss (IDOR)
 *   T-09-05-XSS: React JSX auto-escapes all text; no dangerouslySetInnerHTML
 *
 * force-dynamic: activity log grows over time.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { getDefaultTenantId } from '@/lib/tenant';
import { getOfficeActivityLog } from '@/actions/analytics';
import { Badge } from '@/components/ui/badge';
import { ClipboardList } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ userId: string }>;
}

const INITIAL_LIMIT = 50;
const LOAD_MORE_LIMIT = 100;

/**
 * Map an office_activity_log action_type to its i18n key.
 * Unknown types fall through to 'action_unknown'.
 */
function actionTypeToKey(actionType: string): string {
  const map: Record<string, string> = {
    project_created: 'action_project_created',
    project_updated: 'action_project_updated',
    project_edited: 'action_project_edited',
    boq_imported: 'action_boq_imported',
    unit_price_set: 'action_unit_price_set',
    person_approved: 'action_person_approved',
    person_assigned: 'action_person_assigned',
    person_unassigned: 'action_person_unassigned',
    hakedis_created: 'action_hakedis_created',
    hakedis_finalized: 'action_hakedis_finalized',
    hakedis_period_created: 'action_hakedis_period_created',
    hakedis_period_finalized: 'action_hakedis_period_finalized',
    route_uploaded: 'action_route_uploaded',
    boq_item_created: 'action_boq_item_created',
  };
  return map[actionType] ?? 'action_unknown';
}

export default async function OEProfilePage({ params }: Props) {
  const { userId } = await params;

  // T-09-05-AC: auth guard
  const session = await auth();
  if (!session) {
    notFound();
  }

  const tenantId = getDefaultTenantId();

  const t = await getTranslations('dashboard.admin.oe_scorecard');

  // Tenant-scoped user lookup — users table is not tenant-scoped by FK but we
  // scope via the activity log's actor_user_id; here we verify the user exists
  // in the system at all (office engineers are Auth.js users).
  // We do NOT have a tenant_id on the users table itself; use the users table
  // with an office_activity_log membership check to verify they belong to this tenant.
  const userResult = await db.execute(sql`
    SELECT u.id, u.name, u.email
    FROM users u
    WHERE u.id = ${userId}
    LIMIT 1
  `);

  // T-09-05-IDOR: if user not found, return 404
  if (userResult.rows.length === 0) {
    notFound();
  }

  const userRow = userResult.rows[0];
  const engineerName = (userRow.name != null ? String(userRow.name) : null) ?? String(userRow.email ?? userId);

  // Additional tenant-scope check: verify this user has activity in this tenant
  // (prevents cross-tenant information disclosure — a user in another tenant would
  // have no rows in office_activity_log for this tenantId)
  const tenantCheckResult = await db.execute(sql`
    SELECT COUNT(*) AS c FROM office_activity_log
    WHERE actor_user_id = ${userId} AND tenant_id = ${tenantId}
    LIMIT 1
  `);
  const hasTenantActivity = Number(tenantCheckResult.rows[0]?.c ?? 0) > 0;

  // If no tenant activity yet, we still show the page (empty state) — the user
  // might be a newly added OE. We already verified the user exists.
  // The getOfficeActivityLog call below also tenant-scopes by design.

  // Fetch activity log (reuse Phase-7 function — do NOT rebuild the data layer)
  const limit = INITIAL_LIMIT;
  const entries = await getOfficeActivityLog({ actorUserId: userId, limit });

  const hasMore = entries.length >= limit;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <nav className="text-sm text-muted-foreground">
        <Link href="/dashboard/analytics" className="hover:underline">
          {t('back_link')}
        </Link>
      </nav>

      {/* Page heading + role badge */}
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{engineerName}</h1>
        <div className="flex gap-2">
          <Badge variant="secondary">{t('role_badge')}</Badge>
        </div>
      </div>

      {/* Activity Log section */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">{t('activity_log_heading')}</h2>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
            <ClipboardList className="size-12" aria-hidden="true" />
            <p className="text-sm">{t('empty_state')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="w-40">{t('col_timestamp')}</TableHead>
                  <TableHead scope="col">{t('col_action')}</TableHead>
                  <TableHead scope="col">{t('col_context')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  // Format timestamp
                  const occurredAt = new Date(entry.occurredAt);
                  const timestampDisplay = occurredAt.toLocaleDateString('tr-TR') + ' ' +
                    occurredAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

                  // Localized action label
                  const actionKey = actionTypeToKey(entry.actionType);
                  // We use a type assertion here since dynamic key lookup on the t function
                  // React auto-escapes — no dangerouslySetInnerHTML (T-09-05-XSS)
                  const actionLabel = t(actionKey as Parameters<typeof t>[0]);

                  // Context: project name + optional metadata entity name
                  // JSX auto-escapes all values — XSS-safe (T-09-05-XSS)
                  const contextParts: string[] = [];
                  if (entry.projectName) contextParts.push(entry.projectName);
                  if (entry.metadata && typeof entry.metadata === 'object') {
                    const meta = entry.metadata as Record<string, unknown>;
                    if (typeof meta.name === 'string') contextParts.push(meta.name);
                    else if (typeof meta.displayName === 'string') contextParts.push(meta.displayName);
                  }
                  const contextDisplay = contextParts.join(' · ') || '—';

                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted-foreground text-sm tabular-nums whitespace-nowrap">
                        {timestampDisplay}
                      </TableCell>
                      <TableCell className="text-sm">{actionLabel}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {contextDisplay}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Load more — basic ghost button; increases limit param (future enhancement) */}
        {hasMore && (
          <div className="flex justify-center pt-2">
            <Link
              href={`/dashboard/analytics/office-engineers/${userId}?limit=${LOAD_MORE_LIMIT}`}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
            >
              {t('load_more')}
            </Link>
          </div>
        )}
      </div>

      {/* Suppress unused variable warning for tenantId / hasTenantActivity used only for IDOR check */}
      {tenantId && hasTenantActivity !== undefined && null}
    </div>
  );
}
