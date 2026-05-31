/**
 * src/app/api/cron/ai-flags/route.ts
 *
 * GET /api/cron/ai-flags — hourly cron safety-net that reclaims AI flag rows
 * orphaned by a mid-call function death (REVIEWS HIGH-1b / MEDIUM-4).
 *
 * Reclaims TWO classes of stale rows:
 *   1. status='pending'    AND createdAt  < now() - interval '5 minutes'
 *      → never started (e.g. waitUntil flushed before the lambda warmed)
 *   2. status='processing' AND updatedAt  < now() - interval '15 minutes'
 *      → started but orphaned mid-call (the Fluid-Compute function died after
 *        the webhook response flushed, before runAiAnalysis completed).
 *      The 15-minute window safely exceeds a normal analysis duration so an
 *      in-flight call is NOT double-dispatched (runAiAnalysis sets status to
 *      'processing' + refreshes updatedAt at step 0; a row still 'processing'
 *      after 15 min is provably orphaned).
 *
 * Security (T-16-CR):
 *   FIRST statement checks Authorization: Bearer $CRON_SECRET (SC6).
 *   Returns 401 before any DB access — blocks unauthenticated analysis-trigger
 *   / cost-amplification. auth() is NOT used — CRON_SECRET replaces it.
 *
 * Pitfall 5 (Phase 16): NO auth(), NO logOfficeActivity(), NO after() here.
 *   The cron path has no Auth.js session; CRON_SECRET is the auth primitive.
 *
 * runtime='nodejs': runAiAnalysis uses Node.js-only modules (sharp, fetch).
 * dynamic='force-dynamic': cron responses must never be cached.
 *
 * Analog: src/app/api/exports/chainage/route.ts (same runtime/dynamic directives).
 *
 * Threat model:
 *   T-16-CR   mitigated (Bearer check is FIRST statement, 401 before DB)
 *   T-16-OR   mitigated (reclaims processing rows orphaned after function death)
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // T-16-CR (SC6): CRON_SECRET check is the FIRST statement — 401 before any DB access.
  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET> on every invocation.
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Lazy imports — mirrors bot-audit.ts discipline; keeps Edge/module-load scope clean.
  const { db } = await import('@/db');
  const { submissionAiFlags } = await import('@/db/schema/ai-flags');
  const { submissions } = await import('@/db/schema/submissions');
  const { or, and, eq, lt, sql } = await import('drizzle-orm');
  const { runAiAnalysis } = await import('@/lib/ai-vision');

  // Reclaim BOTH classes of stale rows (REVIEWS HIGH-1b / MEDIUM-4):
  //   Class 1: never-started pending rows (> 5 min since insert)
  //   Class 2: orphaned processing rows (> 15 min since last updatedAt —
  //            provably dead because runAiAnalysis refreshes updatedAt at step 0)
  const staleRows = await db
    .select({
      id: submissionAiFlags.submissionId,
      photoUrl: submissions.photoUrl,
    })
    .from(submissionAiFlags)
    .innerJoin(submissions, eq(submissionAiFlags.submissionId, submissions.id))
    .where(
      or(
        and(
          eq(submissionAiFlags.status, 'pending'),
          lt(submissionAiFlags.createdAt, sql`now() - interval '5 minutes'`),
        ),
        and(
          eq(submissionAiFlags.status, 'processing'),
          lt(submissionAiFlags.updatedAt, sql`now() - interval '15 minutes'`),
        ),
      ),
    );

  let processed = 0;
  for (const row of staleRows) {
    // runAiAnalysis never throws (it handles its own errors internally).
    // .catch(console.error) is belt-and-suspenders for any unexpected rejection.
    await runAiAnalysis(row.id, row.photoUrl).catch(console.error);
    processed++;
  }

  return Response.json({ processed });
}
