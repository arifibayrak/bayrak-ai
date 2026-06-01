/**
 * tests/telegram-webhook.test.ts
 *
 * Plan 01-04: Telegram /start webhook — idempotency + secret-token tests.
 *
 * Test groups:
 *   (a) describeIfDb — /start handler inserts one pending_people row; replay leaves
 *       exactly one row (idempotency via ON CONFLICT DO NOTHING).
 *   (b) pure unit tests — POST with wrong / missing X-Telegram-Bot-Api-Secret-Token
 *       is rejected 401-class; NO pending_people insert is attempted.
 *
 * Environment notes:
 *   - No live DATABASE_URL is available in this environment (plan 01-02b pushes the DB).
 *   - The pure unit tests mock @/db and grammy's bot.init() to avoid network calls.
 *   - The DB integration tests use describeIfDb and skip without TEST_DATABASE_URL.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';

// ---------------------------------------------------------------------------
// (b) Secret-token verification — pure unit tests (no DB, no network)
//
// Strategy:
//   1. vi.doMock('@/db') — stub the Drizzle client so Neon never initialises.
//   2. Import the route's POST handler after the mock is installed.
//   3. Spy on bot.init (via @/lib/telegram) to prevent the network call to
//      Telegram's getMe API that grammY makes on the first webhook invocation.
//   4. Send a POST with a wrong / missing secret token and assert 401-class.
//   5. Assert the mocked db.insert was NOT called (handler never ran).
// ---------------------------------------------------------------------------

describe('webhook secret-token verification (T-04-01)', () => {
  // Mocked insert chain — lets us assert no insert was attempted
  const mockOnConflictDoNothing = vi.fn().mockResolvedValue([]);
  const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

  beforeEach(() => {
    // Provide fake env BEFORE any module is imported so both telegram.ts and
    // route.ts see the values at module-evaluation time.
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_for_unit_tests';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret-value';

    // Clear mocked call history
    mockInsert.mockClear();
    mockValues.mockClear();
    mockOnConflictDoNothing.mockClear();

    // Fresh module registry per test so doMock applies cleanly
    vi.resetModules();

    // Stub @/db to prevent neon() from throwing (no DATABASE_URL set here)
    vi.doMock('@/db', () => ({ db: { insert: mockInsert } }));
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  /**
   * Build a minimal Telegram /start update payload.
   */
  function makeStartUpdate(userId: number, name: string) {
    return {
      update_id: 100000 + userId,
      message: {
        message_id: userId,
        from: { id: userId, is_bot: false, first_name: name, language_code: 'tr' },
        chat: { id: userId, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: '/start',
        entities: [{ offset: 0, length: 6, type: 'bot_command' }],
      },
    };
  }

  /**
   * Build a Request mimicking a Telegram webhook delivery.
   * Omit `secret` to simulate a spoofed / unauthenticated call.
   */
  function buildWebhookRequest(update: object, secret?: string): Request {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (secret !== undefined) {
      headers['x-telegram-bot-api-secret-token'] = secret;
    }
    return new Request('http://localhost/api/telegram/webhook', {
      method: 'POST',
      headers,
      body: JSON.stringify(update),
    });
  }

  /**
   * Get the POST handler with bot.init() stubbed to avoid network calls.
   * grammY calls bot.init() (getMe) on the FIRST webhook invocation.
   * We stub it to resolve immediately so the secret-token comparison runs.
   */
  async function getPostHandler() {
    // Import bot first (after mocks are installed) so we can stub init()
    const { bot } = await import('@/lib/telegram');

    // Stub bot.init() to a no-op so no getMe call reaches Telegram's API
    vi.spyOn(bot, 'init').mockResolvedValue();

    // Now import the route — it uses the same bot instance
    const { POST } = await import('@/app/api/telegram/webhook/route');
    return { POST, bot };
  }

  it('rejects a POST with wrong X-Telegram-Bot-Api-Secret-Token (401-class)', async () => {
    const { POST } = await getPostHandler();

    const update = makeStartUpdate(999, 'Spy Test User');
    const req = buildWebhookRequest(update, 'WRONG_SECRET');

    const response = await POST(req);

    // grammY returns 401 for a bad secret token (unauthorized handler returns
    // a response with the '\"unauthorized\"' body and 401-class status)
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    // The /start handler must NOT have run — no DB insert attempted
    expect(mockInsert).not.toHaveBeenCalled();
  }, 10000);

  it('rejects a POST with missing X-Telegram-Bot-Api-Secret-Token header (401-class)', async () => {
    const { POST } = await getPostHandler();

    const update = makeStartUpdate(998, 'No Header User');
    // No secret header — simulates a spoofed/unauthenticated request
    const req = buildWebhookRequest(update);

    const response = await POST(req);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    expect(mockInsert).not.toHaveBeenCalled();
  }, 10000);
});

// ---------------------------------------------------------------------------
// (a) DB integration tests — idempotency (skipped without TEST_DATABASE_URL)
// ---------------------------------------------------------------------------

describeIfDb('/start handler — pending_people upsert idempotency (AUTH-02)', () => {
  let testDb: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    testDb = await getTestDb();
    await truncateAllTables(testDb);

    // Re-seed the default tenant after truncation — the /start handler inserts
    // pending_people rows with tenantId = getDefaultTenantId() which references
    // this row via FK constraint.
    const { sql } = await import('drizzle-orm');
    await testDb.execute(sql.raw(`
      INSERT INTO tenants (id, name)
      VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant (test)')
      ON CONFLICT DO NOTHING
    `));

    // Provide fake env so the telegram modules load cleanly
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_for_db_tests';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'db-test-secret-value';

    vi.resetModules();

    // Point @/db at the test database so the /start handler writes to the test DB
    vi.doMock('@/db', () => ({ db: testDb }));
  });

  afterEach(async () => {
    await truncateAllTables(testDb);
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  /**
   * Fire the bot's /start handler via handleUpdate with a fake update.
   * @/db is mocked to testDb, so the insert goes to the test database.
   */
  async function triggerStart(userId: number, firstName: string): Promise<void> {
    // Import bot AFTER mock is installed (fresh module from vi.resetModules)
    const { bot } = await import('@/lib/telegram');

    // Stub bot.init() to prevent getMe network call AND set bot.botInfo
    // so grammY's handleUpdate doesn't throw "Bot not initialized!".
    // grammY checks this.me (exposed as bot.botInfo setter) before creating context.
    vi.spyOn(bot, 'init').mockResolvedValue();
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

    // Install a grammY transformer that intercepts ALL outgoing API calls so
    // ctx.reply() (and any other bot.api call) doesn't hit real Telegram servers.
    // Transformers are the official grammY intercept mechanism (api.config.use).
    // Returning { ok: true, result: {} } satisfies the Bot API response shape.
     
    bot.api.config.use((_prev, _method, _payload, _signal) =>
      Promise.resolve({ ok: true, result: {} as any })
    );

    await bot.handleUpdate({
      update_id: userId,
      message: {
        message_id: userId,
        from: { id: userId, first_name: firstName, is_bot: false, language_code: 'tr' },
        chat: { id: userId, type: 'private' as const, first_name: firstName },
        date: Math.floor(Date.now() / 1000),
        text: '/start',
        entities: [{ offset: 0, length: 6, type: 'bot_command' as const }],
      },
    });
  }

  it('first /start from new user creates exactly one pending_people row', async () => {
    const { pendingPeople } = await import('@/db/schema/pending-people');
    const { eq } = await import('drizzle-orm');

    await triggerStart(123456789, 'Ahmet');

    const rows = await testDb.select().from(pendingPeople)
      .where(eq(pendingPeople.telegramUserId, BigInt(123456789)));

    expect(rows).toHaveLength(1);
    expect(rows[0].telegramName).toBe('Ahmet');
  }, 15000);

  it('replaying /start (same user) leaves exactly one row (idempotent)', async () => {
    const { pendingPeople } = await import('@/db/schema/pending-people');
    const { eq } = await import('drizzle-orm');

    // First /start
    await triggerStart(987654321, 'Mehmet');
    // Second /start — same user id
    await triggerStart(987654321, 'Mehmet');

    const rows = await testDb.select().from(pendingPeople)
      .where(eq(pendingPeople.telegramUserId, BigInt(987654321)));

    expect(rows).toHaveLength(1);
  }, 15000);
});
