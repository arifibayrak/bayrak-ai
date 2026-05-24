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
