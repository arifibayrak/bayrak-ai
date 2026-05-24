/**
 * src/lib/bot-photo.ts
 *
 * Downloads a photo from Telegram's file API and uploads it to Vercel Blob.
 * First use of @vercel/blob `put()` in this codebase.
 *
 * @vercel/blob reads BLOB_READ_WRITE_TOKEN from env automatically — no explicit
 * token passing required in the put() call.
 *
 * Design (Open Question 1 resolution — upload-on-receipt):
 *   Photo is uploaded as soon as it is received (photo step), not deferred to
 *   the confirm step. Orphaned blobs from cancelled flows are logged ops debt.
 *   A cleanup script (list Vercel Blob by prefix, delete those with no matching
 *   submission) is trivial to add in a later phase.
 *
 * Security (T-02-05):
 *   TELEGRAM_BOT_TOKEN is used only server-side to build the Telegram file URL.
 *   It is never stored in conversation_state, never logged, never returned to
 *   the client.
 *
 * Security (T-02-06):
 *   The fetched URL is constructed only from Telegram's own getFile() response
 *   (api.telegram.org host) — not from arbitrary user input. SSRF surface is
 *   bounded to Telegram's CDN.
 *
 * Error handling — no internal try/catch (matches excel.ts / boq-balance.ts
 * pattern). Caller (step handler in telegram.ts) catches and sends a Turkish
 * error reply.
 */

import { put } from '@vercel/blob';
import type { Context } from 'grammy';

/**
 * uploadPhotoToBlob — downloads the highest-resolution photo from a Telegram
 * message and uploads it to Vercel Blob at a flow-scoped path.
 *
 * Pitfall 5 (RESEARCH.md): ctx.msg.photo is an array of PhotoSize objects at
 * different resolutions. The LAST element is always the highest resolution.
 * Never use photo[0] (thumbnail).
 *
 * @param ctx              - grammY context (must have ctx.msg.photo present)
 * @param submissionFlowId - the conversation_state.flowId UUID for path scoping
 * @returns The public Vercel Blob URL of the uploaded photo
 */
export async function uploadPhotoToBlob(
  ctx: Context,
  submissionFlowId: string
): Promise<string> {
  // Take the LAST element — highest resolution (Pitfall 5)
  const photoSizes = ctx.msg!.photo!;
  const photo = photoSizes[photoSizes.length - 1];

  // Get Telegram's internal file path for this photo
  const file = await ctx.api.getFile(photo.file_id);

  // Build the download URL — TELEGRAM_BOT_TOKEN is server-side only (T-02-05)
  const telegramFileUrl =
    `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

  // Download from Telegram — throw on HTTP error (caller handles, no try/catch here)
  const response = await fetch(telegramFileUrl);
  if (!response.ok) {
    throw new Error(`Telegram file fetch failed: ${response.status} ${response.statusText}`);
  }

  // Derive extension from file_path (default 'jpg' if absent)
  const ext = file.file_path?.split('.').pop() ?? 'jpg';

  // Upload to Vercel Blob under a flow-scoped path for easy retrieval
  // access: 'public' — photo URL is stored in submissions table for dashboard (Phase 5)
  // addRandomSuffix: false — deterministic path, one photo per flow
  const { url } = await put(
    `submissions/${submissionFlowId}/photo.${ext}`,
    response.body!,
    { access: 'public', addRandomSuffix: false }
  );

  return url;
}
