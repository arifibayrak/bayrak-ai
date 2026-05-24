/**
 * src/app/api/telegram/webhook/route.ts
 *
 * Telegram webhook route handler — Next.js App Router, Node.js runtime.
 *
 * Security contract (T-04-01):
 *   grammY validates the X-Telegram-Bot-Api-Secret-Token header against
 *   TELEGRAM_WEBHOOK_SECRET BEFORE running any bot handlers. A request
 *   with a wrong or missing header is rejected with a 401-class response
 *   and the /start handler does NOT run.
 *
 *   The secretToken option is explicitly passed to webhookCallback — grammY
 *   does NOT auto-read TELEGRAM_WEBHOOK_SECRET from the environment.
 *
 * Runtime:
 *   Must be 'nodejs' — grammY requires the Node.js runtime (not Edge).
 *   Memory (512 MB) and maxDuration (55 s) are set in vercel.json, not here.
 *
 * Fail-fast:
 *   Module throws at load time if TELEGRAM_WEBHOOK_SECRET is unset so a
 *   misconfigured deploy surfaces immediately rather than serving an
 *   unauthenticated webhook.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { webhookCallback } from 'grammy';
import { bot } from '@/lib/telegram';

// Fail-fast at module load if the secret is not configured (T-04-01, T-04-03).
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!webhookSecret) {
  throw new Error(
    'TELEGRAM_WEBHOOK_SECRET is not set — set it in .env.local (development) ' +
    'or as a Vercel environment variable (production).'
  );
}

/**
 * POST — Telegram webhook receiver.
 *
 * grammY's webhookCallback with the 'std/http' adapter handles:
 *   1. Parsing the JSON update from the request body.
 *   2. Validating the X-Telegram-Bot-Api-Secret-Token header against `secretToken`.
 *      If the header is wrong or missing → 401-class response; no bot handlers run.
 *   3. Dispatching the update to the bot's registered handlers (e.g. /start).
 */
export const POST = webhookCallback(bot, 'std/http', {
  secretToken: webhookSecret,
});

/**
 * GET — Lightweight health probe (phase marker).
 *
 * Returns { ok: true, phase: 1 } so the deployment health check and
 * Telegram setWebhook verification calls get a meaningful response.
 */
export async function GET(): Promise<Response> {
  return Response.json({ ok: true, phase: 1 });
}
