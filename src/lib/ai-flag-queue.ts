/**
 * src/lib/ai-flag-queue.ts — AI flag async enqueue (Phase 16).
 *
 * Exports:
 *   enqueueAiFlag(submissionId, photoUrl) — inserts a 'pending' flag row then
 *     dispatches runAiAnalysis via Vercel waitUntil (CONTEXT OVERRIDE 2026-05-31).
 *
 * Dispatch discipline:
 *   - waitUntil (from '@vercel/functions') keeps the Fluid-Compute function alive
 *     for the detached work. A bare detached promise may never run after the webhook
 *     response flushes — waitUntil is the correct primitive for this use case.
 *   - runAiAnalysis is NOT awaited inline; enqueueAiFlag returns immediately so the
 *     caller (handleAuditDecision) does not block the Telegram webhook response (SC2).
 *   - The analysis promise has a .catch(log) belt-and-suspenders guard; runAiAnalysis
 *     itself never throws, but the catch covers the waitUntil dispatch edge.
 *
 * PITFALL 5 — HARD RULE:
 *   NEVER import auth(), office-activity loggers, or after() here.
 *   This function runs in the Telegram webhook path which has NO Auth.js session.
 *   waitUntil (@vercel/functions) is request-scoped and adds NO session — it does
 *   NOT relax Pitfall 5.
 *
 * Photo buffer fetch happens INSIDE runAiAnalysis, NOT here. Fetching in
 * enqueueAiFlag would block the webhook response path (RESEARCH anti-pattern).
 *
 * All imports are lazy (inside function body) — mirrors bot-audit.ts discipline.
 */

/**
 * enqueueAiFlag — idempotent pending-row insert + waitUntil-dispatched analysis.
 *
 * Step 1: INSERT submission_ai_flags (submissionId, tenantId, status='pending')
 *         ON CONFLICT DO NOTHING — idempotent; safe to call multiple times.
 *         The UNIQUE constraint on submission_id (ai-flags.ts) prevents duplicates.
 *
 * Step 2: dispatch runAiAnalysis via waitUntil(promise.catch(log)):
 *         - NOT awaited inline (enqueueAiFlag resolves immediately)
 *         - waitUntil keeps the Fluid-Compute function alive for the async work
 *         - .catch(log) is belt-and-suspenders; runAiAnalysis itself never throws
 *
 * Called from handleAuditDecision after the approval TX commits (bot-audit.ts).
 */
export async function enqueueAiFlag(
  submissionId: string,
  photoUrl: string,
): Promise<void> {
  // ── Step 1: insert pending row (idempotent) ───────────────────────────────
  const { db } = await import('@/db');
  const { submissionAiFlags } = await import('@/db/schema/ai-flags');
  const { getDefaultTenantId } = await import('@/lib/tenant');

  await db
    .insert(submissionAiFlags)
    .values({
      submissionId,
      tenantId: getDefaultTenantId(),
      status: 'pending',
    })
    .onConflictDoNothing();

  // ── Step 2: dispatch runAiAnalysis via waitUntil (CONTEXT OVERRIDE 2026-05-31) ──
  // Lazy imports keep @vercel/functions and @/lib/ai-vision out of module-load scope.
  const { waitUntil } = await import('@vercel/functions');
  const { runAiAnalysis } = await import('@/lib/ai-vision');

  waitUntil(
    runAiAnalysis(submissionId, photoUrl).catch((err) => {
      console.error('[enqueueAiFlag] runAiAnalysis error:', err);
    }),
  );
  // enqueueAiFlag returns here — caller is not blocked by the analysis
}
