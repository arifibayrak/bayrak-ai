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
 *   The required secrets are validated at REQUEST time (first webhook delivery),
 *   not at module load. Next.js imports this route during `next build` to collect
 *   metadata with no runtime env present, so a module-load throw would break the
 *   build. Request-time validation still surfaces a misconfigured deploy on the
 *   first request rather than serving an unauthenticated webhook.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { webhookCallback } from 'grammy';
import { bot } from '@/lib/telegram';

// Lazily build (and cache) the grammY webhook handler on the first request, so
// the required secrets are validated at request time rather than module load
// (T-04-01, T-04-03).
let cachedHandler: ((req: Request) => Promise<Response>) | null = null;

function getWebhookHandler(): (req: Request) => Promise<Response> {
  if (cachedHandler) return cachedHandler;

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error(
      'TELEGRAM_WEBHOOK_SECRET is not set — set it in .env.local (development) ' +
      'or as a Vercel environment variable (production).'
    );
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN is not set — set it in .env.local (development) ' +
      'or as a Vercel environment variable (production).'
    );
  }

  cachedHandler = webhookCallback(bot, 'std/http', { secretToken: webhookSecret });
  return cachedHandler;
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
export async function POST(req: Request): Promise<Response> {
  return getWebhookHandler()(req);
}

/**
 * GET — Lightweight health probe (phase marker).
 *
 * Returns { ok: true, phase: 1 } so the deployment health check and
 * Telegram setWebhook verification calls get a meaningful response.
 */
export async function GET(): Promise<Response> {
  return Response.json({ ok: true, phase: 1 });
}
