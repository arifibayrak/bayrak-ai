'use server';

/**
 * src/actions/chainage.ts
 *
 * Server Actions for chainage as-built view (CHN-02, CHN-04, CHN-06).
 *
 * getChainageBuckets — auth + tenant wrapper around fetchChainageBucketsRaw.
 * setChainageOffset  — writes routes.chainage_offset_m (auth + CR-02 ownership).
 *
 * Security:
 *   T-15-05-AUTHZ: auth() first in both actions; throw Unauthorized on null session
 *   T-15-05-IDOR:  tenant scoped via getDefaultTenantId() on all queries
 *   T-15-05-SQLI:  bucketSizeM whitelist-validated to {100, 500, 1000} before DB call
 *                  (Drizzle ${bucketSizeM} is a bound param — not string-concatenated —
 *                   but the whitelist is the defence-in-depth guard per plan threat model)
 *   T-15-05-FLOAT: offset stored as STRING for numeric precision; never JS float arithmetic
 *
 * NOTE: fetchChainageBucketsRaw is imported from src/lib/chainage-data.ts (NOT re-declared
 * here) so that the export Route Handler at /api/exports/chainage can also import it
 * without calling a 'use server' action (Pitfall 6, 15-RESEARCH.md).
 */

import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { routes } from '@/db/schema/routes';
import { projects } from '@/db/schema/projects';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';
import { logOfficeActivity } from '@/lib/log-office-activity';
import { fetchChainageBucketsRaw } from '@/lib/chainage-data';
import type { ChainageBucketsResult } from '@/lib/chainage-data';

// Re-export ChainageBucket type for convenience (UI components import from here)
export type { ChainageBucket, ChainageBucketsResult } from '@/lib/chainage-data';

// ── Whitelist (V5 / T-15-05-SQLI) ───────────────────────────────────────────

/** Allowed bucket sizes in metres. Any other value is rejected. */
const VALID_BUCKET_SIZES = [100, 500, 1000] as const;
type ValidBucketSize = (typeof VALID_BUCKET_SIZES)[number];

function isValidBucketSize(n: number): n is ValidBucketSize {
  return (VALID_BUCKET_SIZES as readonly number[]).includes(n);
}

// ── getChainageBuckets ───────────────────────────────────────────────────────

/**
 * getChainageBuckets — returns all buckets for a project's as-built chainage view.
 *
 * Auth-guarded. Delegates to fetchChainageBucketsRaw with the active tenant.
 *
 * @param projectId   - UUID of the project
 * @param bucketSizeM - bucket width in metres; must be one of {100, 500, 1000}
 *                      (default 1000; invalid values default to 1000 — never rejected silently)
 */
export async function getChainageBuckets(
  projectId: string,
  bucketSizeM: number = 1000,
): Promise<ChainageBucketsResult> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // V5: whitelist validate. Invalid values fall back to 1000 (safe default per plan).
  const safeBucketSizeM: number = isValidBucketSize(bucketSizeM) ? bucketSizeM : 1000;

  const tenantId = getDefaultTenantId();

  return fetchChainageBucketsRaw(projectId, safeBucketSizeM, tenantId);
}

// ── setChainageOffset ────────────────────────────────────────────────────────

/**
 * setChainageOffset — writes chainage_offset_m on the route for a project.
 *
 * The offset is applied at QUERY time only (inside Postgres FLOOR in fetchChainageBucketsRaw).
 * Stored chainage_m values on submissions are NEVER recomputed on offset change —
 * the snapshot remains immutable (15-RESEARCH.md §Don't Hand-Roll key insight).
 *
 * Auth-guarded + CR-02 ownership check (mirrors uploadRoute in src/actions/routes.ts).
 *
 * @param projectId - UUID of the project
 * @param offsetM   - new chainage offset in metres (can be negative for backwards calibration)
 */
export async function setChainageOffset(
  projectId: string,
  offsetM: number,
): Promise<{ ok: true }> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const tenantId = getDefaultTenantId();

  // CR-02: verify project belongs to the active tenant before writing (IDOR mitigation).
  // Mirrors the ownership check in uploadRoute (src/actions/routes.ts lines 50-57).
  const owned = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  if (!owned.length) throw new Error('Not found');

  // Store as STRING for numeric precision (T-15-05-FLOAT mitigation).
  // Never write the offset back to chainage_m on submissions — query-time only.
  await db
    .update(routes)
    .set({ chainageOffsetM: String(offsetM) })
    .where(
      and(
        eq(routes.projectId, projectId),
        eq(routes.tenantId, tenantId),
      ),
    );

  // CR-04: skip log when session.user.id is absent (never pass empty-string FK)
  if (session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType:  'chainage_offset_set',
      entityType:  'project',
      entityId:    projectId,
      projectId,
      metadata:    { offsetM },
    });
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
