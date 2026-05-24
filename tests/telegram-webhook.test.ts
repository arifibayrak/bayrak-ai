/**
 * tests/telegram-webhook.test.ts
 *
 * Plan 01-04: Telegram /start webhook — idempotency + secret-token tests.
 *
 * Test groups:
 *   (a) describeIfDb — /start handler inserts one pending_people row; replay leaves
 *       exactly one row (idempotency via ON CONFLICT DO NOTHING).
 *   (b) pure unit test — POST with wrong / missing X-Telegram-Bot-Api-Secret-Token
 *       is rejected 401-class; NO pending_people insert is attempted (spy on db.insert).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';

// ---------------------------------------------------------------------------
// (b) Secret-token verification — pure unit tests (no DB needed)
// ---------------------------------------------------------------------------

describe('webhook secret-token verification (T-04-01)', () => {
  /**
   * Build a minimal grammY-compatible update payload for a /start command from
   * Telegram user id `userId` named `name`.
   */
  function makeStartUpdate(userId: number, name: string) {
    return {
      update_id: 100000 + userId,
      message: {
        message_id: userId,
        from: {
          id: userId,
          is_bot: false,
          first_name: name,
          language_code: 'tr',
        },
        chat: { id: userId, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: '/start',
        entities: [{ offset: 0, length: 6, type: 'bot_command' }],
      },
    };
  }

  /**
   * Build a Request that mimics what Telegram sends to the webhook.
   * If `secret` is provided it is placed in the X-Telegram-Bot-Api-Secret-Token header;
   * otherwise the header is omitted (simulating a spoofed / unauthenticated call).
   */
  function buildWebhookRequest(update: object, secret?: string): Request {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (secret !== undefined) {
      headers['x-telegram-bot-api-secret-token'] = secret;
    }
    return new Request('http://localhost/api/telegram/webhook', {
      method: 'POST',
      headers,
      body: JSON.stringify(update),
    });
  }

  beforeEach(() => {
    // Provide a fake bot token so the module loads without throwing.
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_for_unit_tests';
    // Provide a known secret we can test with.
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret-value';
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    // Reset module registry so re-import picks up fresh env on each test
    vi.resetModules();
  });

  it('rejects a POST with wrong X-Telegram-Bot-Api-Secret-Token (401-class)', async () => {
    // Import the route handler under the faked env
    const { POST } = await import('@/app/api/telegram/webhook/route');

    // Spy on db to confirm the /start handler did NOT run (no insert attempted)
    const dbModule = await import('@/db');
    const insertSpy = vi.spyOn(dbModule.db, 'insert');

    const update = makeStartUpdate(999, 'Spy Test User');
    const req = buildWebhookRequest(update, 'WRONG_SECRET');

    const response = await POST(req);

    // grammY returns 401 for a bad secret token
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    // The /start handler must NOT have run — no DB insert attempted
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('rejects a POST with missing X-Telegram-Bot-Api-Secret-Token header (401-class)', async () => {
    const { POST } = await import('@/app/api/telegram/webhook/route');

    const dbModule = await import('@/db');
    const insertSpy = vi.spyOn(dbModule.db, 'insert');

    const update = makeStartUpdate(998, 'No Header User');
    // No secret header at all
    const req = buildWebhookRequest(update);

    const response = await POST(req);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    expect(insertSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (a) DB integration tests — idempotency (skipped without TEST_DATABASE_URL)
// ---------------------------------------------------------------------------

describeIfDb('/start handler — pending_people upsert idempotency (AUTH-02)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);

    // Provide fake env so the telegram modules load cleanly.
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_for_db_tests';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'db-test-secret';

    vi.resetModules();
  });

  afterEach(async () => {
    await truncateAllTables(db);
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
  });

  /**
   * Exercise the /start command handler logic directly against the test DB.
   * We mock db to point to our test DB so the handler writes to the right place.
   */
  async function triggerStart(userId: number, firstName: string) {
    // Re-import fresh modules (vi.resetModules ensures each test is clean)
    const dbModule = await import('@/db');

    // Patch the db export to point at the test database connection
    (dbModule as { db: typeof db }).db = db;

    // Now import the bot (which depends on @/db at module scope)
    const { bot } = await import('@/lib/telegram');

    // Build a fake context for /start
    const fakeCtx = {
      from: {
        id: userId,
        first_name: firstName,
        username: undefined,
        is_bot: false,
        language_code: 'tr',
      },
      reply: vi.fn().mockResolvedValue({}),
      message: {
        text: '/start',
      },
    } as unknown as Parameters<Parameters<typeof bot.command>[1]>[0];

    // Fire the /start command handler(s)
    // Access the internal router to find command handlers
    // We call handleUpdate with a fake update to trigger the registered handler.
    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        from: {
          id: userId,
          first_name: firstName,
          is_bot: false,
          language_code: 'tr',
        },
        chat: { id: userId, type: 'private' as const },
        date: Math.floor(Date.now() / 1000),
        text: '/start',
        entities: [{ offset: 0, length: 6, type: 'bot_command' as const }],
      },
    });

    return fakeCtx;
  }

  it('first /start from new user creates exactly one pending_people row', async () => {
    const { pendingPeople } = await import('@/db/schema/pending-people');
    const { eq } = await import('drizzle-orm');

    await triggerStart(123456789, 'Ahmet');

    const rows = await db.select().from(pendingPeople)
      .where(eq(pendingPeople.telegramUserId, BigInt(123456789)));

    expect(rows).toHaveLength(1);
    expect(rows[0].telegramName).toBe('Ahmet');
  });

  it('replaying /start (same user) leaves exactly one row (idempotent)', async () => {
    const { pendingPeople } = await import('@/db/schema/pending-people');
    const { eq } = await import('drizzle-orm');

    // First /start
    await triggerStart(987654321, 'Mehmet');

    // Second /start (same user id)
    await triggerStart(987654321, 'Mehmet');

    const rows = await db.select().from(pendingPeople)
      .where(eq(pendingPeople.telegramUserId, BigInt(987654321)));

    expect(rows).toHaveLength(1);
  });
});
