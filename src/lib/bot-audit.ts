/**
 * src/lib/bot-audit.ts
 *
 * Phase 3: Auditor fan-out + sibling-edit service (D-33, D-34, D-39, D-40).
 *
 * Exports:
 *   fanOutToAuditors(submissionId)   — sends photo messages to all project auditors
 *   editAllSiblingMessages(submissionId, outcomeCaption) — edits all fan-out messages on decision
 *   AlreadyResolvedError             — used by Plan 05 decision transaction control flow
 *
 * LAZY IMPORT DISCIPLINE:
 *   Never import @/db or schema at module top — all DB access is inside handler bodies.
 *   Import `bot` from '@/lib/telegram' lazily inside each function.
 *
 * getTxDb() is defined here as a module-local async function (NOT imported from telegram.ts,
 * which is unexported there). Plan 05 extends this file and opens decision transactions
 * through this local helper — neon-http (@/db) throws on .transaction().
 */

// ---------------------------------------------------------------------------
// getTxDb — neon-serverless Pool for transactions (MANDATORY, D-29)
//
// Copied exactly from the pattern in src/lib/telegram.ts (lines 1156-1175).
// The default @/db (neon-http) throws "cannot use database transaction on a HTTP
// connection" — this Pool driver is the only correct driver for .transaction().
//
// CR-04: Returns { db, cleanup } so callers MUST call cleanup() in a finally
// block. This ensures the Pool is closed after each transaction, preventing
// connection exhaustion on Neon's serverless tier under sustained load.
// ---------------------------------------------------------------------------

async function getTxDb() {
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');

  // In Node.js (non-edge) environments, neon-serverless needs ws
  // Try to require ws if available, fall back gracefully if not
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ws = require('ws') as { default?: unknown } | unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    neonConfig.webSocketConstructor = (ws as any).default ?? ws;
  } catch (wsErr) {
    // ws not available — will use native WebSocket (browser/edge).
    console.error('[getTxDb] require("ws") failed; falling back to native WebSocket:', wsErr);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  // CR-04: expose cleanup so the caller can end() the pool in a finally block.
  return { db: drizzle(pool), cleanup: () => pool.end() };
}

// ---------------------------------------------------------------------------
// AlreadyResolvedError — Plan 05 imports this for decision transaction control flow
// ---------------------------------------------------------------------------

/**
 * AlreadyResolvedError — thrown inside the decision transaction when the
 * submission is no longer in pending_audit status (D-29, AUDIT-06).
 * Plan 05's handleAuditDecision catches this and replies with the "already resolved" toast.
 */
export class AlreadyResolvedError extends Error {
  constructor() {
    super('Submission already resolved');
    this.name = 'AlreadyResolvedError';
  }
}

// ---------------------------------------------------------------------------
// fanOutToAuditors — sends one photo message per assigned auditor (D-33, D-40)
// ---------------------------------------------------------------------------

/**
 * fanOutToAuditors — loads the submission, finds all auditors assigned to the
 * project, and sends each a Telegram photo message with BOQ item, quantity,
 * notes, Google Maps link, over-delivery warning (when applicable), and the
 * ✅ Onayla / ❌ Reddet inline keyboard (AUDIT-01, AUDIT-02).
 *
 * Persists each send's (chat_id, message_id) in audit_notifications (D-34).
 * Best-effort per auditor: a failing send does not block others (D-40).
 * No-auditor edge case: logs a warning, does NOT modify the submission (D-39).
 *
 * @param submissionId - UUID of the submissions row to fan out
 */
export async function fanOutToAuditors(submissionId: string): Promise<void> {
  const { db } = await import('@/db');
  const { submissions } = await import('@/db/schema/submissions');
  const { boqItems } = await import('@/db/schema/boq-items');
  const { assignments } = await import('@/db/schema/assignments');
  const { people } = await import('@/db/schema/people');
  const { auditNotifications } = await import('@/db/schema/audit-notifications');
  const { eq, and } = await import('drizzle-orm');
  const { getDefaultTenantId } = await import('@/lib/tenant');
  const { buildAuditKeyboard } = await import('@/lib/bot-keyboards');
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { bot } = await import('@/lib/telegram');

  // Load the submission row
  const subRows = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId));

  const submission = subRows[0];
  if (!submission) {
    console.error('[fanOutToAuditors] submission not found:', submissionId);
    return;
  }

  // Load the BOQ item (material, unit, planned_qty, approved_qty)
  const boqRows = await db
    .select()
    .from(boqItems)
    .where(eq(boqItems.id, submission.boqItemId));

  const boqItem = boqRows[0];
  if (!boqItem) {
    console.error('[fanOutToAuditors] boqItem not found for submission:', submissionId);
    return;
  }

  // Load auditors: assignments WHERE role_on_project='auditor' on submission.projectId,
  // then lookup people rows for telegram_user_id + display_name.
  // Two-step query to avoid innerJoin complexity in unit test mocks.
  const auditorAssignments = await db
    .select({ personId: assignments.personId })
    .from(assignments)
    .where(
      and(
        eq(assignments.projectId, submission.projectId),
        eq(assignments.roleOnProject, 'auditor')
      )
    );

  if (auditorAssignments.length === 0) {
    // D-39: No auditor assigned — log warning, do NOT modify submission, do NOT throw
    console.warn(
      `[fanOutToAuditors] no auditor assigned to project ${submission.projectId} for submission ${submissionId}`
    );
    return;
  }

  const { inArray } = await import('drizzle-orm');
  const auditorPersonIds = auditorAssignments.map((a: { personId: string }) => a.personId);
  const auditorRows = await db
    .select({
      id: people.id,
      telegramUserId: people.telegramUserId,
      displayName: people.displayName,
    })
    .from(people)
    .where(inArray(people.id, auditorPersonIds));

  // Build caption
  const quantity = parseFloat(submission.quantity as string);
  const plannedQty = parseFloat(boqItem.plannedQty as string);
  const approvedQty = parseFloat(boqItem.approvedQty as string);
  const newTotal = approvedQty + quantity;

  const captionLines: string[] = [
    `📦 ${boqItem.material} — ${quantity} ${boqItem.unit}`,
  ];

  if (submission.notes) {
    captionLines.push(`📝 ${submission.notes}`);
  }

  // WR-01: use != null (not falsy) so lat/lon of 0 is not silently dropped
  if (submission.locationLat != null && submission.locationLon != null) {
    captionLines.push(
      `📍 https://maps.google.com/?q=${submission.locationLat},${submission.locationLon}`
    );
  }

  // D-28: Over-delivery warning when approving would push approved_qty past planned_qty
  if (newTotal > plannedQty) {
    captionLines.push(MESSAGES.auditOverDelivery(newTotal, plannedQty, boqItem.unit));
  }

  // D-47: Location anomaly flag — mirrors D-28 over-delivery pattern (show the number, D-26 Turkish tone)
  // Three states: 'far' → distance warning; 'no_route' → neutral note; 'near'/null → silent (D-43/D-44)
  // buildLocationCaptionLine encapsulates the pure decision and is unit-tested in tests/spatial.test.ts.
  const locationMatch = submission.locationMatch as 'near' | 'far' | 'no_route' | null;
  const distanceM = submission.locationDistanceM != null
    ? parseFloat(String(submission.locationDistanceM))
    : null;

  // lazy-import per file discipline (no top-level import of @/lib/spatial)
  const { buildLocationCaptionLine } = await import('@/lib/spatial');
  const locationLine = buildLocationCaptionLine(locationMatch, distanceM);
  if (locationLine !== null) {
    captionLines.push(locationLine);
  }
  // Google Maps link is already in captionLines above — kept in all cases (D-47)

  const captionText = captionLines.join('\n');
  const photo = (submission.photoFileId as string | null) ?? (submission.photoUrl as string);
  const replyMarkup = buildAuditKeyboard(submissionId);

  // D-40: Best-effort fan-out — one failing send does not block others
  for (const auditor of auditorRows) {
    const auditorChatId = Number(auditor.telegramUserId);
    try {
      const sent = await bot.api.sendPhoto(auditorChatId, photo, {
        caption: captionText,
        reply_markup: replyMarkup,
      });

      // Persist (chat_id, message_id) in audit_notifications (D-34)
      await db.insert(auditNotifications).values({
        tenantId: getDefaultTenantId(),
        submissionId,
        auditorPersonId: auditor.id,
        chatId: BigInt(sent.chat.id),
        messageId: sent.message_id,
        sentAt: new Date(),
      });
    } catch (err) {
      // D-40: best-effort — record failure, do not throw
      console.error(
        '[fanOutToAuditors] send failed for auditor',
        auditor.id,
        'on submission',
        submissionId,
        ':',
        err
      );
      await db.insert(auditNotifications).values({
        tenantId: getDefaultTenantId(),
        submissionId,
        auditorPersonId: auditor.id,
        chatId: BigInt(auditorChatId),
        messageId: 0,
        sendFailed: true,
        sentAt: new Date(),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// editAllSiblingMessages — edits all fan-out messages on first decision (D-34)
// ---------------------------------------------------------------------------

/**
 * editAllSiblingMessages — loads all audit_notifications refs for the submission
 * and edits each one: updates the photo caption and strips the inline keyboard.
 *
 * Called by Plan 05's handleAuditDecision after the approval/rejection transaction
 * commits. Best-effort per ref: a >48h old message or already-edited message
 * does not stop the others (D-40).
 *
 * IMPORTANT: For photo messages, use editMessageCaption + editMessageReplyMarkup
 * separately — Pitfall 4: using the plain text edit method 400s on photo messages.
 *
 * @param submissionId    - UUID of the submission whose sibling messages to edit
 * @param outcomeCaption  - The resolved caption to replace the current caption
 */
export async function editAllSiblingMessages(
  submissionId: string,
  outcomeCaption: string
): Promise<void> {
  const { db } = await import('@/db');
  const { auditNotifications } = await import('@/db/schema/audit-notifications');
  const { eq } = await import('drizzle-orm');
  const { bot } = await import('@/lib/telegram');

  const refs = await db
    .select()
    .from(auditNotifications)
    .where(eq(auditNotifications.submissionId, submissionId));

  for (const ref of refs) {
    // Skip refs that were never sent (D-40: sendFailed records)
    if (ref.sendFailed) continue;

    // WR-03: Strip the reply markup FIRST so a resolved submission can never keep
    // tappable buttons, even if the caption edit subsequently fails.
    // Each call is independently guarded per D-40 (best-effort per sibling).
    const chatId = Number(ref.chatId);
    const msgId = ref.messageId;

    try {
      await bot.api.editMessageReplyMarkup(chatId, msgId, {
        reply_markup: { inline_keyboard: [] },
      });
    } catch (markupErr) {
      // Message may be >48h old or already edited — log and continue (D-40)
      console.error('[editAllSiblingMessages] markup strip failed chatId=%s msgId=%s:', chatId, msgId, markupErr);
    }

    try {
      // For photo messages: editMessageCaption changes the caption.
      // The plain text edit method 400s on photo messages (Pitfall 4).
      await bot.api.editMessageCaption(chatId, msgId, {
        caption: outcomeCaption,
      });
    } catch (captionErr) {
      // Markup already stripped above — caption failure leaves a resolved-looking (buttonless)
      // message which is acceptable. Log and continue (D-40).
      console.error('[editAllSiblingMessages] caption edit failed chatId=%s msgId=%s:', chatId, msgId, captionErr);
    }
  }
}

// Re-export getTxDb for Plan 05 use (decision transaction needs it)
export { getTxDb };

// ---------------------------------------------------------------------------
// handleAuditDecision — authorize + atomic approve / reject-reason entry (D-29, D-36)
// ---------------------------------------------------------------------------

/**
 * handleAuditDecision — entry point for audit:approve:<id> and audit:reject:<id> taps.
 *
 * Step 0: answerCallbackQuery is already called generically in telegram.ts:316 for all
 *   callbacks. We still call it with a toast on the unauthorized / already-resolved /
 *   error paths (Pattern 3 / Pitfall 2).
 *
 * Step 1 — AUTHORIZATION (D-36): re-query assignments every tap. Never trust callback_data.
 *   Non-assigned tap → answerCallbackQuery({text: auditUnauthorized, show_alert:true}) + return.
 *
 * Step 2a — approve: atomic UPDATE-RETURNING WHERE status='pending_audit' (D-29).
 *   Empty RETURNING → AlreadyResolvedError → toast + return.
 *   Commit: approved_qty += quantity (D-27 increment-only).
 *   After commit: editAllSiblingMessages + notify worker.
 *
 * Step 2b — reject (D-30/D-31): do NOT touch submissions. saveState to
 *   AWAITING_REJECT_REASON, reply with reason keyboard. Submission stays pending_audit.
 *
 * @param ctx           - grammY Context
 * @param action        - 'approve' | 'reject'
 * @param submissionId  - UUID from callback_data
 * @param db            - Drizzle neon-http client (lazy-imported in dispatcher)
 */
export async function handleAuditDecision(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  action: 'approve' | 'reject',
  submissionId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { submissions } = await import('@/db/schema/submissions');
  const { people } = await import('@/db/schema/people');
  const { assignments } = await import('@/db/schema/assignments');
  const { eq, and } = await import('drizzle-orm');
  const { STEPS } = await import('@/lib/bot-fsm');
  const { saveState } = await import('@/lib/telegram');
  const { buildRejectReasonKeyboard } = await import('@/lib/bot-keyboards');

  // ── Step 1: Authorization ────────────────────────────────────────────────

  // Load the submission's projectId + personId (personId is the worker)
  const subRows = await db
    .select({
      projectId: submissions.projectId,
      personId: submissions.personId,
      status: submissions.status,
    })
    .from(submissions)
    .where(eq(submissions.id, submissionId));

  if (!subRows.length) {
    await ctx.answerCallbackQuery({ text: 'Kayıt bulunamadı', show_alert: true });
    return;
  }

  const submission = subRows[0];

  // Resolve the tapping auditor's person row by telegram_user_id
  const auditorPersonRows = await db
    .select({ id: people.id, displayName: people.displayName })
    .from(people)
    .where(eq(people.telegramUserId, BigInt(ctx.from.id)));

  if (!auditorPersonRows.length) {
    await ctx.answerCallbackQuery({ text: MESSAGES.auditUnauthorized, show_alert: true });
    return;
  }

  const auditorPerson = auditorPersonRows[0];

  // Check active auditor assignment on this project (D-36)
  const assignmentRows = await db
    .select({ id: assignments.id })
    .from(assignments)
    .where(
      and(
        eq(assignments.personId, auditorPerson.id),
        eq(assignments.projectId, submission.projectId),
        eq(assignments.roleOnProject, 'auditor')
      )
    );

  if (!assignmentRows.length) {
    await ctx.answerCallbackQuery({ text: MESSAGES.auditUnauthorized, show_alert: true });
    return;
  }

  // ── Step 2a: APPROVE ─────────────────────────────────────────────────────

  if (action === 'approve') {
    const { boqItems } = await import('@/db/schema/boq-items');
    const { sql } = await import('drizzle-orm');

    const { db: txDb, cleanup: txCleanup } = await getTxDb();

    let approvedQuantity: string | number = 0;
    let boqItemId = '';
    const workerPersonId = submission.personId;
    // Phase 15: chainage snapshot values captured from tx for worker notification (Task 2)
    let capturedChainageM: string | null = null;
    let capturedChainageOffsetM: string | null = null;

    try {
      await txDb.transaction(async (tx) => {
        const { submissions: sub2 } = await import('@/db/schema/submissions');
        const { boqItems: boq2 } = await import('@/db/schema/boq-items');
        const { eq: eq2, and: and2, sql: sql2 } = await import('drizzle-orm');

        // Atomic first-wins guard: WHERE status='pending_audit' is the race barrier (D-29)
        const affected = await tx
          .update(sub2)
          .set({
            status: 'approved',
            decidedBy: auditorPerson.id,
            decidedAt: new Date(),
          })
          .where(and2(eq2(sub2.id, submissionId), eq2(sub2.status, 'pending_audit')))
          .returning({
            id: sub2.id,
            quantity: sub2.quantity,
            boqItemId: sub2.boqItemId,
            // [Phase 15] needed for chainage snapshot computation
            segmentFraction: sub2.segmentFraction,
            projectId: sub2.projectId,
          });

        if (affected.length === 0) {
          // Already decided by a prior/concurrent tap (D-29, AUDIT-06)
          throw new AlreadyResolvedError();
        }

        approvedQuantity = affected[0].quantity;
        boqItemId = affected[0].boqItemId;

        // D-27: increment approved_qty atomically (increment-only, never subtractive)
        await tx
          .update(boq2)
          .set({
            approvedQty: sql2`approved_qty + ${affected[0].quantity}`,
          })
          .where(eq2(boq2.id, affected[0].boqItemId));

        // [Phase 15] CHN-03: write chainage_m + route_geometry_version immutably at approval
        // T-15-02-WINDOW: both writes are inside the SAME transaction as the status flip —
        // no window where status='approved' but chainage_m IS NULL (Pitfall 1).
        // T-15-02-FLOAT: ROUND executed in Postgres via sql2 template, not JS float math.
        // Pitfall 5: no auth(), no office-activity logging, or after() — bot path has no Auth.js session.
        if (affected[0].segmentFraction != null && affected[0].projectId) {
          const { routes: rte } = await import('@/db/schema/routes');
          const routeRows = await tx
            .select({
              totalLengthM: rte.totalLengthM,
              geometryVersion: rte.geometryVersion,
              chainageOffsetM: rte.chainageOffsetM,
            })
            .from(rte)
            .where(eq2(rte.projectId, affected[0].projectId))
            .limit(1);

          const route = routeRows[0];

          if (route?.totalLengthM != null) {
            // Postgres-side ROUND — money-math discipline: never multiply numeric strings in JS
            const updatedRows = await tx
              .update(sub2)
              .set({
                chainageM: sql2`ROUND(${affected[0].segmentFraction}::numeric * ${route.totalLengthM}::numeric, 2)`,
                routeGeometryVersion: route.geometryVersion,
              })
              .where(eq2(sub2.id, submissionId))
              .returning({ chainageM: sub2.chainageM });

            // WR-02: Capture the EXACT Postgres-computed chainage_m for the worker
            // notification. Re-deriving via JS float math (Number(frac) * Number(len))
            // could diverge from the persisted/exported value by 0.01 m at the 0.005
            // rounding boundary. Use the returned numeric string verbatim.
            capturedChainageM = updatedRows[0]?.chainageM ?? null;
            capturedChainageOffsetM = route.chainageOffsetM != null ? String(route.chainageOffsetM) : '0';
          }
        }
      });
    } catch (err) {
      if (err instanceof AlreadyResolvedError) {
        await ctx.answerCallbackQuery({ text: MESSAGES.auditAlreadyResolved });
        return;
      }
      console.error('[handleAuditDecision] approve transaction failed for submissionId', submissionId, ':', err);
      await ctx.answerCallbackQuery({ text: MESSAGES.genericError, show_alert: true });
      return;
    } finally {
      // CR-04: always close the Pool to prevent connection exhaustion on Neon
      await txCleanup();
    }

    // Post-commit: edit all sibling messages FIRST (D-34).
    // This runs before the worker notification so a DB read failure on the
    // notification path (CR-02) can never leave stale keyboards on auditor messages.
    const auditorDisplayName = auditorPerson.displayName;
    await editAllSiblingMessages(submissionId, MESSAGES.auditApprovedOutcome(auditorDisplayName));

    // D-117 post-commit hook (Phase 12): scoped hakkediş recompute for the just-approved
    // submission's (project_id, boq_item_id, currency_code) triplet. Lands here AFTER
    // editAllSiblingMessages and BEFORE the worker notification so a failed recompute
    // does not leave stale auditor keyboards.
    //
    // Best-effort per D-40 + CR-02: a transient hakkediş failure MUST NOT propagate
    // back to the auditor (the approval is already committed atomically). The next
    // approval OR the manual Recompute button self-heals via the helper's ON CONFLICT
    // DO UPDATE idempotency.
    //
    // NEVER inside the approve TX (Pitfall 1): the approve transaction is already
    // holding row locks on submissions + boq_items; extending it to also do a
    // multi-row aggregate INSERT triples the lock window during a Telegram webhook
    // that has a 60s server retry budget.
    //
    // NEVER calls the office-activity logger (Pitfall 5): the bot path has no
    // Auth.js session, so actor_user_id FK to users would violate, and after()
    // requires Next.js request scope which the webhook handler does not have.
    // See src/lib/log-office-activity.ts and Phase 12 RESEARCH §Pitfall 5.
    try {
      const hakedisActions = await import('@/actions/hakedis');
      const { boqItems } = await import('@/db/schema/boq-items');
      const { eq: eqHak } = await import('drizzle-orm');
      const boqRows = await db
        .select({ currencyCode: boqItems.currencyCode, projectId: boqItems.projectId })
        .from(boqItems)
        .where(eqHak(boqItems.id, boqItemId));
      if (boqRows.length > 0) {
        await hakedisActions.recomputeHakedisLine(
          boqRows[0].projectId,
          boqItemId,
          boqRows[0].currencyCode,
        );
      }
    } catch (hakErr) {
      // D-40 best-effort: log, do not throw. The approval is already committed.
      console.error('[handleAuditDecision] hakkediş recompute failed for submission', submissionId, ':', hakErr);
    }

    // CR-02: wrap the post-commit worker lookup + notification in try/catch.
    // The decision is already committed; a transient read failure must not propagate
    // back to the handler (D-40 best-effort semantics for post-commit side effects).
    try {
      const workerRows = await db
        .select({ telegramUserId: people.telegramUserId })
        .from(people)
        .where(eq(people.id, workerPersonId));

      if (workerRows.length) {
        const { bot } = await import('@/lib/telegram');
        // [Phase 15] Compute calibrated chainage label for worker notification (Open Question 1).
        // formatChainage is a pure zero-import utility — safe to import here (no Auth.js dep).
        // Pitfall 13: same calibrated value (raw + offset) as dashboard + export.
        let chainageLabel: string | undefined;
        if (capturedChainageM != null && capturedChainageOffsetM != null) {
          const { formatChainage } = await import('@/lib/format-chainage');
          chainageLabel = formatChainage(Number(capturedChainageM) + Number(capturedChainageOffsetM));
        }
        try {
          await bot.api.sendMessage(
            Number(workerRows[0].telegramUserId),
            MESSAGES.workerApproved(chainageLabel)
          );
        } catch (notifyErr) {
          // D-40: best-effort — log and continue
          console.error('[handleAuditDecision] worker notification failed:', notifyErr);
        }
      }
    } catch (lookupErr) {
      // D-40: transient DB read failure on post-commit notification — log and continue.
      // The decision is committed; the worker notification is best-effort.
      console.error('[handleAuditDecision] worker lookup failed (notification skipped):', lookupErr);
    }

    return;
  }

  // ── Step 2b: REJECT ──────────────────────────────────────────────────────

  if (action === 'reject') {
    // D-30/D-31: do NOT modify submissions — only write conversation_state
    // The submission stays pending_audit until a reason is provided and commitRejection runs.
    // D-32: saveState upsert overwrites any active worker flow (one active flow per telegram_user_id)
    await saveState(
      db,
      BigInt(ctx.from.id),
      STEPS.AWAITING_REJECT_REASON,
      {
        submissionId,
        auditorPersonId: auditorPerson.id,
        workerPersonId: submission.personId,
      },
      auditorPerson.id
    );

    await ctx.reply(MESSAGES.auditRejectPrompt, {
      reply_markup: buildRejectReasonKeyboard(),
    });
  }
}

// ---------------------------------------------------------------------------
// commitRejection — the SINGLE rejection commit point (Pitfall 3 / D-31)
// ---------------------------------------------------------------------------

/**
 * commitRejection — atomically commits a rejection with a mandatory reason.
 *
 * Only called after a reason exists (canned or free-text). This is the single
 * rejection commit point — Pitfall 3 ensures no status='rejected' is ever set
 * before a reason is captured.
 *
 * On AlreadyResolvedError: replies already-resolved toast + returns.
 * On success: clears auditor's conversation_state, edits sibling messages, notifies worker.
 *
 * @param ctx             - grammY Context
 * @param submissionId    - UUID from conversation_state data
 * @param auditorPersonId - Person UUID of the deciding auditor
 * @param reason          - Canned or free-text rejection reason
 * @param db              - Drizzle neon-http client
 */
export async function commitRejection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  submissionId: string,
  auditorPersonId: string,
  reason: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { people } = await import('@/db/schema/people');
  const { submissions } = await import('@/db/schema/submissions');
  const { assignments } = await import('@/db/schema/assignments');
  const { eq, and } = await import('drizzle-orm');
  const { conversationState } = await import('@/db/schema/conversation-state');

  // ── CR-01: Re-validate authorization at the mutation point ──────────────
  // D-36: never trust FSM data alone — re-resolve the caller's identity from
  // ctx.from.id and re-check that the caller is still an active auditor on the
  // submission's project. An auditor whose assignment is revoked between tapping
  // ❌ and typing a reason must NOT be able to commit the rejection.

  // Re-resolve caller identity from ctx.from.id (do NOT trust auditorPersonId from FSM data alone)
  const callerRows = await db
    .select({ id: people.id, displayName: people.displayName })
    .from(people)
    .where(eq(people.telegramUserId, BigInt(ctx.from.id)));

  if (!callerRows.length || callerRows[0].id !== auditorPersonId) {
    // The caller's identity does not match the FSM's recorded auditor — reject silently
    await ctx.reply(MESSAGES.auditUnauthorized);
    // Clear stale FSM state for safety
    await db
      .delete(conversationState)
      .where(eq(conversationState.telegramUserId, BigInt(ctx.from.id)));
    return;
  }

  // Re-check the auditor is still assigned to the submission's project (D-36)
  const subForAuthRows = await db
    .select({ projectId: submissions.projectId })
    .from(submissions)
    .where(eq(submissions.id, submissionId));

  if (!subForAuthRows.length) {
    // Submission not found — toast and clear state
    await ctx.reply(MESSAGES.auditAlreadyResolved);
    await db
      .delete(conversationState)
      .where(eq(conversationState.telegramUserId, BigInt(ctx.from.id)));
    return;
  }

  const assignedRows = await db
    .select({ id: assignments.id })
    .from(assignments)
    .where(
      and(
        eq(assignments.personId, auditorPersonId),
        eq(assignments.projectId, subForAuthRows[0].projectId),
        eq(assignments.roleOnProject, 'auditor')
      )
    );

  if (!assignedRows.length) {
    // Auditor assignment has been revoked since the reject tap — refuse the commit
    await ctx.reply(MESSAGES.auditUnauthorized);
    await db
      .delete(conversationState)
      .where(eq(conversationState.telegramUserId, BigInt(ctx.from.id)));
    return;
  }

  // ── Authorization passed ─────────────────────────────────────────────────

  // Get auditor's display name for post-commit caption (already resolved above)
  const auditorDisplayName = callerRows[0].displayName ?? 'Denetçi';

  const { db: txDb, cleanup: txCleanup } = await getTxDb();
  let workerPersonId: string | null = null;

  try {
    await txDb.transaction(async (tx) => {
      const { submissions } = await import('@/db/schema/submissions');
      const { eq: eq2, and: and2 } = await import('drizzle-orm');

      // Atomic first-wins guard for rejection (same UPDATE-RETURNING pattern as approve)
      const affected = await tx
        .update(submissions)
        .set({
          status: 'rejected',
          decidedBy: auditorPersonId,
          decidedAt: new Date(),
          rejectionReason: reason,
        })
        .where(and2(eq2(submissions.id, submissionId), eq2(submissions.status, 'pending_audit')))
        .returning({ id: submissions.id, personId: submissions.personId });

      if (affected.length === 0) {
        throw new AlreadyResolvedError();
      }

      workerPersonId = affected[0].personId;
    });
  } catch (err) {
    if (err instanceof AlreadyResolvedError) {
      await ctx.answerCallbackQuery({ text: MESSAGES.auditAlreadyResolved });
      // Clean up auditor's conversation_state even on already-resolved
      await db
        .delete(conversationState)
        .where(eq(conversationState.telegramUserId, BigInt(ctx.from.id)));
      return;
    }
    console.error('[commitRejection] transaction failed for submissionId', submissionId, ':', err);
    await ctx.answerCallbackQuery({ text: MESSAGES.genericError, show_alert: true });
    return;
  } finally {
    // CR-04: always close the Pool to prevent connection exhaustion on Neon
    await txCleanup();
  }

  // Clear auditor's conversation_state (reject flow complete)
  await db
    .delete(conversationState)
    .where(eq(conversationState.telegramUserId, BigInt(ctx.from.id)));

  // Post-commit: edit all sibling messages FIRST (D-34), then notify worker (D-37).
  // Sibling edit runs before the worker lookup so a transient DB read failure on
  // the notification path (CR-02) cannot leave stale keyboards on auditor messages.
  await editAllSiblingMessages(submissionId, MESSAGES.auditRejectedOutcome(auditorDisplayName, reason));

  // CR-02: wrap the post-commit worker lookup + notification in try/catch.
  // The decision is already committed; a transient read failure must not propagate
  // back to the handler (D-40 best-effort semantics for post-commit side effects).
  if (workerPersonId) {
    try {
      const workerRows = await db
        .select({ telegramUserId: people.telegramUserId })
        .from(people)
        .where(eq(people.id, workerPersonId));

      if (workerRows.length) {
        const { bot } = await import('@/lib/telegram');
        try {
          await bot.api.sendMessage(
            Number(workerRows[0].telegramUserId),
            MESSAGES.workerRejected(reason)
          );
        } catch (notifyErr) {
          // D-40: best-effort
          console.error('[commitRejection] worker notification failed:', notifyErr);
        }
      }
    } catch (lookupErr) {
      // D-40: transient DB read failure on post-commit notification — log and continue.
      // The decision is committed; the worker notification is best-effort.
      console.error('[commitRejection] worker lookup failed (notification skipped):', lookupErr);
    }
  }
}

// ---------------------------------------------------------------------------
// handleAuditReasonSelect — canned reason tap / free-text sentinel (D-30)
// ---------------------------------------------------------------------------

/**
 * handleAuditReasonSelect — handles audit:reason:<value> callbacks.
 *
 * If reasonOrFree === 'free': update FSM to AWAITING_REJECT_REASON (keeping data),
 *   reply free-text prompt, do NOT commit.
 * Else: treat as canned reason → commitRejection.
 *
 * submissionId + auditorPersonId come from conversation_state.data (never callback_data).
 *
 * @param ctx           - grammY Context
 * @param reasonOrFree  - Parsed reason string or 'free' sentinel
 * @param db            - Drizzle neon-http client
 */
export async function handleAuditReasonSelect(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  reasonOrFree: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { conversationState } = await import('@/db/schema/conversation-state');
  const { eq } = await import('drizzle-orm');
  const { isStaleState, STEPS } = await import('@/lib/bot-fsm');
  const { saveState } = await import('@/lib/telegram');

  // Load auditor's conversation_state by telegram_user_id
  const stateRows = await db
    .select()
    .from(conversationState)
    .where(eq(conversationState.telegramUserId, BigInt(ctx.from.id)));

  const state = stateRows?.[0] ?? null;

  if (!state || isStaleState(state.updatedAt)) {
    await ctx.answerCallbackQuery({ text: MESSAGES.auditAlreadyResolved });
    return;
  }

  const stateData = state.data as { submissionId: string; auditorPersonId: string; workerPersonId: string };

  if (reasonOrFree === 'free') {
    // Başka (yaz) path: keep same data, update step to AWAITING_REJECT_REASON_FREE equivalent
    // We reuse AWAITING_REJECT_REASON step to keep the message switch routing consistent
    await saveState(
      db,
      BigInt(ctx.from.id),
      STEPS.AWAITING_REJECT_REASON,
      stateData,
      stateData.auditorPersonId
    );
    await ctx.reply(MESSAGES.auditRejectFreeTextPrompt);
    return;
  }

  // Canned reason — commit rejection immediately
  await commitRejection(ctx, stateData.submissionId, stateData.auditorPersonId, reasonOrFree, db);
}

// ---------------------------------------------------------------------------
// handleAuditRejectFreeText — free-text reason message handler (D-31)
// ---------------------------------------------------------------------------

/**
 * handleAuditRejectFreeText — processes a free-text message in AWAITING_REJECT_REASON step.
 *
 * Trims and caps at 500 chars (V5 input validation).
 * Empty/whitespace → reprompt, keep state (reason is mandatory, D-31).
 * Non-empty → commitRejection.
 *
 * @param ctx       - grammY Context (bot.on('message') handler context)
 * @param stateData - The conversation_state.data object from the auditor's FSM row
 * @param db        - Drizzle neon-http client
 */
export async function handleAuditRejectFreeText(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  stateData: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');

  const rawText = (ctx.message?.text as string | undefined) ?? '';
  const trimmed = rawText.trim();

  if (!trimmed) {
    // Empty/whitespace → reprompt (reason is mandatory, D-31)
    await ctx.reply(MESSAGES.auditRejectFreeTextPrompt);
    return;
  }

  // V5: cap at 500 chars
  const cappedReason = trimmed.slice(0, 500);

  const { submissionId, auditorPersonId } = stateData as {
    submissionId: string;
    auditorPersonId: string;
  };

  await commitRejection(ctx, submissionId, auditorPersonId, cappedReason, db);
}
