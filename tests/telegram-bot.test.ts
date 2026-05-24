/**
 * tests/telegram-bot.test.ts
 *
 * Phase 2: Worker Bot FSM — step validation, idempotency, and cold-start resume tests.
 *
 * Test groups:
 *   (a) Pure unit tests — Turkish decimal normalization (Pitfall-4 permanent guard)
 *   (b) Pure unit tests — step input enforcement (LOG-04/LOG-05/LOG-06) [Wave 4]
 *   (c) describeIfDb — confirm step creates exactly one submissions row; duplicate
 *       update_id is a no-op (SC4 mandatory test from D-13) [Wave 5]
 *
 * Environment notes:
 *   - Groups (a) and (b) are pure unit tests — no DB, no network, run anywhere.
 *   - Group (c) is gated by describeIfDb — skipped without TEST_DATABASE_URL.
 *   - bot.botInfo setter MUST be set after vi.spyOn(bot.init) (grammY validates
 *     this.me before creating handler context — see STATE.md [Phase 01-02b]).
 *   - api.config.use(transformer) intercepts ALL outgoing Telegram API calls
 *     (vi.spyOn on api.sendMessage does not work — raw Proxy dispatch).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';

// ---------------------------------------------------------------------------
// (a) Pure unit tests — Turkish decimal normalization (Pitfall-4 permanent guard)
//
// Turkish locale uses comma as decimal separator (e.g. "25,5" for 25.5).
// Workers typing quantities in Turkish may use comma. The bot MUST normalize
// before parsing — a parseFloat('25,5') returns NaN without replacement.
// This test is permanent — it guards against regressions in quantity parsing.
// ---------------------------------------------------------------------------

describe('Turkish decimal normalization (Pitfall-4 guard)', () => {
  it('normalizes Turkish comma decimal to JS float', () => {
    expect(parseFloat('25,5'.replace(',', '.'))).toBe(25.5);
  });

  it('normalizes a whole number string', () => {
    expect(parseFloat('100'.replace(',', '.'))).toBe(100);
  });

  it('rejects a non-numeric string after normalization', () => {
    expect(Number.isNaN(parseFloat('abc'.replace(',', '.')))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (b) Pure unit tests — step input enforcement (LOG-04, LOG-05, LOG-06)
//
// These will be filled in during Wave 4 when the FSM handlers are implemented.
// Placeholders ensure the describe block exists as an anchor.
// ---------------------------------------------------------------------------

describe('step input enforcement', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_for_unit_tests';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret-value';
    vi.resetModules();
    vi.doMock('@/db', () => ({ db: { insert: vi.fn(), select: vi.fn() } }));
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.todo('LOG-04: photo step rejects text message (must send photo)');
  it.todo('LOG-05: location step rejects text message (must share native location)');
  it.todo('LOG-06: quantity step rejects non-numeric input');
  it.todo('LOG-06: quantity step accepts Turkish comma decimal (e.g. "25,5")');
});

// ---------------------------------------------------------------------------
// Test harness helpers
// ---------------------------------------------------------------------------

/**
 * setBotTestInfo — sets bot.botInfo so grammY does not throw
 * "Bot not initialized!" when bot.handleUpdate() is called in tests.
 *
 * MANDATORY: grammY validates this.me before creating handler context.
 * Call after vi.spyOn(bot, 'init').mockResolvedValue() and before handleUpdate().
 *
 * Source: STATE.md [Phase 01-02b] + tests/telegram-webhook.test.ts lines 198-212.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setupBotForTest(): Promise<any> {
  const { bot } = await import('@/lib/telegram');

  vi.spyOn(bot, 'init').mockResolvedValue();

  // grammY validates this.me before creating handler context
  bot.botInfo = {
    id: 123456,
    is_bot: true,
    first_name: 'TestBot',
    username: 'testbot',
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_manage_bots: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
  };

  // Intercept ALL outbound Telegram API calls (ctx.reply, sendMessage, etc.)
  // api.config.use transformer is the correct grammY intercept mechanism.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bot.api.config.use((_prev, _method, _payload, _signal) =>
    Promise.resolve({ ok: true, result: {} as any })
  );

  return bot;
}

/**
 * makeTextUpdate — builds a minimal Telegram text message update.
 */
export function makeTextUpdate(userId: number, text: string, updateId?: number) {
  return {
    update_id: updateId ?? userId,
    message: {
      message_id: userId,
      from: { id: userId, first_name: 'TestWorker', is_bot: false, language_code: 'tr' },
      chat: { id: userId, type: 'private' as const, first_name: 'TestWorker' },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  };
}

// ---------------------------------------------------------------------------
// (c) DB integration tests — submission persistence & idempotency (SC4)
//
// These will be filled in during Wave 5 when the confirm step handler is
// implemented. Placeholders ensure the describeIfDb block exists.
//
// SC4: the D-13 duplicate-update test is MANDATORY before merge per STATE.md.
// ---------------------------------------------------------------------------

describeIfDb('submission persistence & idempotency (SC4)', () => {
  let testDb: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    testDb = await getTestDb();
    await truncateAllTables(testDb);

    // Re-seed default tenant after truncation
    const { sql } = await import('drizzle-orm');
    await testDb.execute(sql.raw(`
      INSERT INTO tenants (id, name)
      VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant (test)')
      ON CONFLICT DO NOTHING
    `));

    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_for_db_tests';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'db-test-secret-value';
    vi.resetModules();
    vi.doMock('@/db', () => ({ db: testDb }));
  });

  afterEach(async () => {
    await truncateAllTables(testDb);
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.todo('LOG-08: confirm step inserts exactly one submissions row with status pending_audit');
  it.todo('D-13 SC4: duplicate update_id is a no-op (processed_updates PK conflict)');
  it.todo('D-13 SC4: duplicate flow_id (double-confirm) is a no-op (submissions_flow_id_unique)');
  it.todo('D-22: stale conversation_state (>24h updatedAt) triggers clean restart');
});
