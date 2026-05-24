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
  return drizzle(pool);
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

  if (submission.locationLat && submission.locationLon) {
    captionLines.push(
      `📍 https://maps.google.com/?q=${submission.locationLat},${submission.locationLon}`
    );
  }

  // D-28: Over-delivery warning when approving would push approved_qty past planned_qty
  if (newTotal > plannedQty) {
    captionLines.push(MESSAGES.auditOverDelivery(newTotal, plannedQty, boqItem.unit));
  }

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

    try {
      // For photo messages: editMessageCaption changes the caption.
      // editMessageReplyMarkup strips the inline buttons.
      // The plain text edit method 400s on photo messages (Pitfall 4).
      await bot.api.editMessageCaption(Number(ref.chatId), ref.messageId, {
        caption: outcomeCaption,
      });
      await bot.api.editMessageReplyMarkup(Number(ref.chatId), ref.messageId, {
        reply_markup: { inline_keyboard: [] },
      });
    } catch (err) {
      // Message may be >48h old or already edited — log and continue (D-40)
      console.error(
        '[editAllSiblingMessages] failed chatId=%s msgId=%s:',
        ref.chatId,
        ref.messageId,
        err
      );
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

    const txDb = await getTxDb();

    let approvedQuantity: string | number = 0;
    let boqItemId = '';
    let workerPersonId = submission.personId;

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
      });
    } catch (err) {
      if (err instanceof AlreadyResolvedError) {
        await ctx.answerCallbackQuery({ text: MESSAGES.auditAlreadyResolved });
        return;
      }
      console.error('[handleAuditDecision] approve transaction failed for submissionId', submissionId, ':', err);
      await ctx.answerCallbackQuery({ text: MESSAGES.genericError, show_alert: true });
      return;
    }

    // Resolve worker telegram_user_id for notification (D-37)
    const workerRows = await db
      .select({ telegramUserId: people.telegramUserId })
      .from(people)
      .where(eq(people.id, workerPersonId));

    // Post-commit: edit all sibling messages + notify worker (D-34, D-37)
    const auditorDisplayName = auditorPerson.displayName;
    await editAllSiblingMessages(submissionId, MESSAGES.auditApprovedOutcome(auditorDisplayName));

    if (workerRows.length) {
      const { bot } = await import('@/lib/telegram');
      try {
        await bot.api.sendMessage(
          Number(workerRows[0].telegramUserId),
          MESSAGES.workerApproved
        );
      } catch (notifyErr) {
        // D-40: best-effort — log and continue
        console.error('[handleAuditDecision] worker notification failed:', notifyErr);
      }
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
  const { eq } = await import('drizzle-orm');
  const { conversationState } = await import('@/db/schema/conversation-state');

  // Get auditor's display name + the worker's telegramUserId (need it for notify after commit)
  const auditorRows = await db
    .select({ displayName: people.displayName })
    .from(people)
    .where(eq(people.id, auditorPersonId));

  const auditorDisplayName = auditorRows[0]?.displayName ?? 'Denetçi';

  const txDb = await getTxDb();
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
  }

  // Clear auditor's conversation_state (reject flow complete)
  await db
    .delete(conversationState)
    .where(eq(conversationState.telegramUserId, BigInt(ctx.from.id)));

  // Post-commit: edit all sibling messages + notify worker (D-34, D-37)
  await editAllSiblingMessages(submissionId, MESSAGES.auditRejectedOutcome(auditorDisplayName, reason));

  if (workerPersonId) {
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
