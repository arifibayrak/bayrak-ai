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
import {
  BrandBadge,
  BrandCard,
  BrandHeading,
  BrandTable,
} from '@/components/brand';
import { ClipboardList } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ limit?: string }>;
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
    hakedis_period_deleted: 'action_hakedis_period_deleted',
    route_uploaded: 'action_route_uploaded',
    boq_item_created: 'action_boq_item_created',
    hakedis_pdf_exported: 'action_hakedis_pdf_exported',
    hakedis_excel_exported: 'action_hakedis_excel_exported',
    submission_ledger_exported: 'action_submission_ledger_exported',
    performance_summary_exported: 'action_performance_summary_exported',
  };
  return map[actionType] ?? 'action_unknown';
}

export default async function OEProfilePage({ params, searchParams }: Props) {
  const { userId } = await params;
  const { limit: limitParam } = await searchParams;

  // T-09-05-AC: auth guard
  const session = await auth();
  if (!session) {
    notFound();
  }

  const tenantId = getDefaultTenantId();

  const t = await getTranslations('dashboard.admin.oe_scorecard');

  // CR-02 (09-REVIEW): tenant-scoped user lookup via INNER JOIN to office_activity_log.
  // The users/Auth.js table has no tenant_id FK, so we enforce tenant membership by
  // requiring at least one activity row for this user in this tenant. A user whose
  // userId belongs to a different tenant returns 0 rows → notFound() → IDOR boundary.
  // This replaces the previous two-query pattern (global user lookup + separate count check)
  // that revealed name/email before the tenant check was evaluated.
  //
  // NOTE: newly-invited OEs with zero activity will NOT appear (empty state) until they
  // perform their first logged action. This is the correct security posture — presence
  // in office_activity_log is the tenant-membership signal for Auth.js users.
  // T-09-05-IDOR + T-09-05-AC enforced.
  const userResult = await db.execute(sql`
    SELECT DISTINCT u.id, u.name, u.email
    FROM users u
    INNER JOIN office_activity_log al
      ON al.actor_user_id = u.id
     AND al.tenant_id = ${tenantId}
    WHERE u.id = ${userId}
    LIMIT 1
  `);

  if (userResult.rows.length === 0) {
    notFound();  // user not found OR not a member of this tenant
  }

  const userRow = userResult.rows[0];
  const engineerName = (userRow.name != null ? String(userRow.name) : null) ?? String(userRow.email ?? userId);

  // CR-04 (09-REVIEW): read limit from searchParams (default INITIAL_LIMIT, max 500).
  // Clamp to avoid runaway queries. The Load more link emits ?limit=N to increment.
  const limit = Math.min(Math.max(Number(limitParam ?? INITIAL_LIMIT) || INITIAL_LIMIT, INITIAL_LIMIT), 500);

  // Fetch activity log (reuse Phase-7 function — do NOT rebuild the data layer).
  // WR-05: lookahead pattern — request limit + 1 so we can distinguish "exactly
  // limit rows, no more pages" from "more pages exist" without a phantom Load more
  // when the total is an exact multiple of limit. Slice to `limit` for display.
  const fetched = await getOfficeActivityLog({ actorUserId: userId, limit: limit + 1 });
  const hasMore = fetched.length > limit;
  const entries = hasMore ? fetched.slice(0, limit) : fetched;

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
        <BrandHeading as="h1" size="h1">{engineerName}</BrandHeading>
        <div className="flex gap-2">
          <BrandBadge variant="neutral">{t('role_badge')}</BrandBadge>
        </div>
      </div>

      {/* Activity Log section */}
      <section className="space-y-3">
        <BrandHeading as="h2" size="h3">{t('activity_log_heading')}</BrandHeading>

        {entries.length === 0 ? (
          <BrandCard>
            <BrandCard.Body>
              <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
                <ClipboardList className="size-12" aria-hidden="true" />
                <p className="text-sm">{t('empty_state')}</p>
              </div>
            </BrandCard.Body>
          </BrandCard>
        ) : (
          <BrandCard>
            <BrandCard.Body className="p-0">
              <div className="overflow-x-auto">
                <BrandTable.Root>
                  <BrandTable.Header>
                    <BrandTable.Row>
                      <BrandTable.Head scope="col" className="w-40">{t('col_timestamp')}</BrandTable.Head>
                      <BrandTable.Head scope="col">{t('col_action')}</BrandTable.Head>
                      <BrandTable.Head scope="col">{t('col_context')}</BrandTable.Head>
                    </BrandTable.Row>
                  </BrandTable.Header>
                  <BrandTable.Body>
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
                        <BrandTable.Row key={entry.id}>
                          <BrandTable.Cell className="text-muted-foreground text-sm tabular-nums whitespace-nowrap">
                            {timestampDisplay}
                          </BrandTable.Cell>
                          <BrandTable.Cell className="text-sm">{actionLabel}</BrandTable.Cell>
                          <BrandTable.Cell className="text-sm text-muted-foreground">
                            {contextDisplay}
                          </BrandTable.Cell>
                        </BrandTable.Row>
                      );
                    })}
                  </BrandTable.Body>
                </BrandTable.Root>
              </div>
            </BrandCard.Body>
          </BrandCard>
        )}

        {/* CR-04 (09-REVIEW): Load more — only shown when `hasMore` (lookahead row exists, WR-05).
            Navigates to ?limit=<current+LOAD_MORE_LIMIT> so the page fetches more on next render.
            Styled to match BrandButton variant="outline" size="md" (brand outline classes inlined
            because base-ui Button has no asChild slot — Link must remain a native <a>). */}
        {hasMore && (
          <div className="flex justify-center pt-2">
            <Link
              href={`/dashboard/analytics/office-engineers/${userId}?limit=${limit + LOAD_MORE_LIMIT}`}
              className="inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 h-9 px-4 text-sm gap-2"
            >
              {t('load_more')}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
