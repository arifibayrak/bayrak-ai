import { after } from 'next/server';
import { db } from '@/db';
import { officeActivityLog, type OfficeActionType } from '@/db/schema/office-activity-log';
import { getDefaultTenantId } from '@/lib/tenant';

/**
 * LogParams — parameters for logOfficeActivity.
 *
 * actorUserId: Auth.js users.id (text PK, NOT people.id).
 *              Always pass session.user.id from the calling Server Action.
 */
type LogParams = {
  actorUserId: string;
  actionType: OfficeActionType;
  entityType: string;
  entityId?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * logOfficeActivity — fire-and-forget office-engineer action logger.
 *
 * Uses next/server `after()` to defer the DB INSERT until after the response
 * is sent. The primary Server Action NEVER blocks on or fails due to log writes.
 *
 * IMPORTANT: Call AFTER the primary DB write succeeds (not before).
 * NEVER await this function — it returns void synchronously.
 * Only valid inside a Server Action or Route Handler request scope (Pitfalls 4 & 5).
 *
 * Error handling: any error thrown by the INSERT is swallowed inside the after()
 * callback and never propagated to the caller. If the log write fails, the primary
 * mutation is unaffected.
 */
export function logOfficeActivity(params: LogParams): void {
  after(async () => {
    try {
      await db.insert(officeActivityLog).values({
        tenantId: getDefaultTenantId(),
        actorUserId: params.actorUserId,
        actionType: params.actionType,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        projectId: params.projectId ?? null,
        metadata: params.metadata ?? null,
      });
    } catch {
      // Swallow log errors — never propagate to the caller.
      // The primary mutation already succeeded.
    }
  });
}
