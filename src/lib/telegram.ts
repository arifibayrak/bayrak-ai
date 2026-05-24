/**
 * src/lib/telegram.ts
 *
 * PHASE 1: Minimal grammY bot — /start command only.
 * Phase 2 will add @grammyjs/conversations, session middleware, and the full
 * work-log conversation flow. Do NOT import those plugins here.
 *
 * Design (D-01, D-02):
 *   /start captures the caller's Telegram ID + name into pending_people
 *   (idempotently via ON CONFLICT DO NOTHING) and replies with a Turkish
 *   pending-approval acknowledgement. The office then promotes the pending
 *   person to an active person via plan 01-05 Server Actions.
 *
 * Security (T-04-03):
 *   TELEGRAM_BOT_TOKEN is read from env only; never logged.
 *   Module throws at load time if the token is unset so a misconfigured
 *   deploy fails immediately rather than silently serving an unauthenticated bot.
 */

import { Bot } from 'grammy';
import { getDefaultTenantId } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// Bot instance
// ---------------------------------------------------------------------------

// The token is validated at REQUEST time in the webhook route handler, NOT here.
// Next.js imports route modules (and their dependencies, including this file)
// during `next build` to collect metadata, with no runtime env present — a
// module-load throw would break the build. When the token is absent we construct
// a non-functional placeholder bot; the route handler fails fast on a real
// request if TELEGRAM_BOT_TOKEN is unset (T-04-03).
const token = process.env.TELEGRAM_BOT_TOKEN;
export const bot = new Bot(token || '0:TELEGRAM_BOT_TOKEN_NOT_CONFIGURED');

// ---------------------------------------------------------------------------
// /start handler (D-01, AUTH-02, AUTH-03)
// ---------------------------------------------------------------------------

bot.command('start', async (ctx) => {
  const telegramUserId = ctx.from?.id;
  const telegramName =
    ctx.from?.first_name ??
    ctx.from?.username ??
    null;

  if (!telegramUserId) {
    // Safety guard — ctx.from should always be present in private chats,
    // but we degrade gracefully rather than crash the handler.
    await ctx.reply('Bir hata oluştu. Lütfen tekrar deneyin.');
    return;
  }

  // Lazy-import DB + schema to avoid triggering neon() at module load time
  // when DATABASE_URL is not set (e.g. unit tests, CI without a live DB).
  // The handler only runs during a real webhook invocation where DATABASE_URL
  // must be present; if it isn't, the neon() call will throw a clear error.
  const { db } = await import('@/db');
  const { pendingPeople } = await import('@/db/schema/pending-people');

  // Upsert into pending_people.
  // ON CONFLICT DO NOTHING ensures a repeated /start tap is idempotent:
  // the telegram_user_id UNIQUE constraint prevents a second row from being
  // inserted, and the existing row is left unchanged (T-04-02).
  await db.insert(pendingPeople).values({
    telegramUserId: BigInt(telegramUserId),
    telegramName,
    tenantId: getDefaultTenantId(),
  }).onConflictDoNothing();

  // Turkish pending-approval acknowledgement (CONTEXT § Specific Ideas, I18N-02).
  // Workers see this immediately — it must be clear, friendly, and in Turkish.
  const greeting = telegramName ? ` ${telegramName}` : '';
  await ctx.reply(
    `Merhaba${greeting}! 👋\n\n` +
    `Kayıt talebiniz ofis mühendisine iletildi. ` +
    `Onaylandıktan sonra iş kaydı yapmaya başlayabilirsiniz. ` +
    `Onay için lütfen bekleyiniz.`
  );
});
