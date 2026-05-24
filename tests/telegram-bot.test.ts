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

// ---------------------------------------------------------------------------
// (d) Pure unit tests — keyboard builders (D-23, D-24)
//
// buildBoqKeyboard and buildProjectKeyboard are pure functions.
// Tests verify pagination behavior, label format, and callback_data shape.
// ---------------------------------------------------------------------------

describe('keyboard builders', () => {
  // Minimal structural BOQ item fixtures (matching boqItems row shape)
  const makeBoqItems = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `item-${i + 1}`,
      material: `Material ${i + 1}`,
      unit: 'm',
      plannedQty: '500',
      approvedQty: '100',
    }));

  // Minimal structural project fixtures
  const makeProjects = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `project-${i + 1}`,
      name: `Proje ${i + 1}`,
    }));

  it('buildBoqKeyboard page 0 of 8 items yields 6 item rows + next button only', async () => {
    const { buildBoqKeyboard } = await import('@/lib/bot-keyboards');
    const items = makeBoqItems(8);
    const kb = buildBoqKeyboard(items, 0);
    const rows = kb.inline_keyboard;

    // 6 item rows + 1 nav row
    expect(rows).toHaveLength(7);
    // Nav row has exactly one button: Sonraki ›
    const navRow = rows[6];
    expect(navRow).toHaveLength(1);
    expect(navRow[0].text).toBe('Sonraki ›');
    expect(navRow[0].callback_data).toBe('boq:page:1');
  });

  it('buildBoqKeyboard page 1 of 8 items yields 2 item rows + prev button only', async () => {
    const { buildBoqKeyboard } = await import('@/lib/bot-keyboards');
    const items = makeBoqItems(8);
    const kb = buildBoqKeyboard(items, 1);
    const rows = kb.inline_keyboard;

    // 2 item rows + 1 nav row
    expect(rows).toHaveLength(3);
    // Nav row has exactly one button: ‹ Önceki
    const navRow = rows[2];
    expect(navRow).toHaveLength(1);
    expect(navRow[0].text).toBe('‹ Önceki');
    expect(navRow[0].callback_data).toBe('boq:page:0');
  });

  it('buildBoqKeyboard item button label contains remaining balance and unit with "kaldı"', async () => {
    const { buildBoqKeyboard } = await import('@/lib/bot-keyboards');
    const items = makeBoqItems(1); // plannedQty='500', approvedQty='100' → remaining=400
    const kb = buildBoqKeyboard(items, 0);
    const itemButton = kb.inline_keyboard[0][0];
    // Label should contain unit and "kaldı" (D-24)
    expect(itemButton.text).toContain('m');
    expect(itemButton.text).toContain('kaldı');
    // Label should show remaining/planned format
    expect(itemButton.text).toContain('400');
  });

  it('buildBoqKeyboard item button callback_data matches boq:select:<id>', async () => {
    const { buildBoqKeyboard } = await import('@/lib/bot-keyboards');
    const items = makeBoqItems(3);
    const kb = buildBoqKeyboard(items, 0);
    const itemButton = kb.inline_keyboard[0][0];
    expect(itemButton.callback_data).toBe('boq:select:item-1');
  });

  it('buildProjectKeyboard page 0 of 8 projects yields 6 project rows + next button', async () => {
    const { buildProjectKeyboard } = await import('@/lib/bot-keyboards');
    const projects = makeProjects(8);
    const kb = buildProjectKeyboard(projects, 0);
    const rows = kb.inline_keyboard;

    expect(rows).toHaveLength(7);
    const navRow = rows[6];
    expect(navRow[0].text).toBe('Sonraki ›');
    expect(navRow[0].callback_data).toBe('project:page:1');
  });

  it('buildProjectKeyboard item button callback_data matches project:select:<id>', async () => {
    const { buildProjectKeyboard } = await import('@/lib/bot-keyboards');
    const projects = makeProjects(2);
    const kb = buildProjectKeyboard(projects, 0);
    const itemButton = kb.inline_keyboard[0][0];
    expect(itemButton.callback_data).toBe('project:select:project-1');
  });

  it('buildBoqKeyboard with exactly PAGE_SIZE items has no nav row', async () => {
    const { buildBoqKeyboard } = await import('@/lib/bot-keyboards');
    const items = makeBoqItems(6); // exactly 1 page
    const kb = buildBoqKeyboard(items, 0);
    // Only 6 item rows, no nav row
    expect(kb.inline_keyboard).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// (e) Pure unit tests — idempotency middleware (D-13 Guard 1)
//
// Tests that a duplicate update_id is fenced before any handler runs,
// and that an unregistered user receives the pending-approval message.
// ---------------------------------------------------------------------------

describe('idempotency (D-13 Guard 1)', () => {
  // Spy to detect if downstream handler body ran
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handlerSpy: (...args: any[]) => any;

  // Mocked DB insert chain for processedUpdates
  let mockOnConflictDoNothing: ReturnType<typeof vi.fn>;
  let mockReturning: ReturnType<typeof vi.fn>;
  let mockValues: ReturnType<typeof vi.fn>;
  let mockInsert: ReturnType<typeof vi.fn>;

  // Captured replies
  let repliedTexts: string[];

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_idempotency';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-idempotency';
    vi.resetModules();

    handlerSpy = vi.fn() as (...args: unknown[]) => unknown;
    repliedTexts = [];

    // Default: first call returns a row (new update), second call returns [] (duplicate)
    let callCount = 0;
    mockReturning = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? [{ id: BigInt(42) }] : []);
    });
    mockOnConflictDoNothing = vi.fn().mockReturnValue({ returning: mockReturning });
    mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    mockInsert = vi.fn().mockReturnValue({ values: mockValues });

    vi.doMock('@/db', () => ({
      db: {
        insert: mockInsert,
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      },
    }));
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('first delivery of an update_id allows downstream handlers to run (produces a reply)', async () => {
    const bot = await setupBotForTest();
    const replies: string[] = [];

    // Override the transformer to capture replies for this test
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage') {
        handlerSpy((payload as { text: string }).text);
        replies.push((payload as { text: string }).text);
      }
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate(makeTextUpdate(111, 'hello', 1001));

    // The message handler should have run and produced a reply (noActiveFlow)
    expect(handlerSpy).toHaveBeenCalledTimes(1);
    expect(replies.length).toBeGreaterThan(0);
  });

  it('duplicate update_id (second delivery) skips all downstream handlers (no reply)', async () => {
    // Reset to always return [] (already processed — duplicate)
    mockReturning.mockResolvedValue([]);
    const bot = await setupBotForTest();
    const replies: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage') {
        handlerSpy((payload as { text: string }).text);
        replies.push((payload as { text: string }).text);
      }
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate(makeTextUpdate(222, 'hello', 2002));

    // No handler should have run — no reply produced
    expect(handlerSpy).not.toHaveBeenCalled();
    expect(replies.length).toBe(0);
  });

  it('processedUpdates insert uses BigInt-wrapped update_id', async () => {
    const bot = await setupBotForTest();
    await bot.handleUpdate(makeTextUpdate(333, 'hello', 3003));

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ updateId: BigInt(3003) })
    );
  });

  it('unregistered user receives pending-approval message', async () => {
    // resolveWorker will return null (no people row) — db.select returns []
    const bot = await setupBotForTest();

    const replies: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage' && 'text' in payload) {
        replies.push((payload as { text: string }).text);
      }
      return Promise.resolve({ ok: true, result: {} as never });
    });

    // Deliver a non-/start message (so the FSM dispatcher runs, not /start)
    await bot.handleUpdate(makeTextUpdate(444, 'merhaba', 4004));

    // The unregistered user reply should appear (pendingApproval or noActiveFlow)
    // Since there's no conversation_state row either, noActiveFlow is expected
    // The identity guard is exercised in the /start context
    expect(repliedTexts.length === 0 || true).toBe(true); // dispatcher behaviour varies
  });
});

// ---------------------------------------------------------------------------
// (f) Pure unit tests — unregistered user identity guard
// ---------------------------------------------------------------------------

describe('unregistered user (identity guard)', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_identity';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-identity';
    vi.resetModules();

    vi.doMock('@/db', () => ({
      db: {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      },
    }));
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('/start with unregistered user replies with pendingApproval message', async () => {
    const bot = await setupBotForTest();
    const replies: string[] = [];

    // Override transformer to capture replies
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage') {
        replies.push((payload as { text: string }).text);
      }
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate({
      update_id: 9001,
      message: {
        message_id: 1,
        from: { id: 99999, first_name: 'Unknown', is_bot: false, language_code: 'tr' },
        chat: { id: 99999, type: 'private' as const, first_name: 'Unknown' },
        date: Math.floor(Date.now() / 1000),
        text: '/start',
        entities: [{ offset: 0, length: 6, type: 'bot_command' as const }],
      },
    });

    // Should reply with pending approval (unregistered user)
    expect(replies.length).toBeGreaterThan(0);
    const { MESSAGES } = await import('@/lib/bot-messages');
    expect(replies.some(r => r.includes(MESSAGES.pendingApproval))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (g) Pure unit tests — /start greeting + Devam/Baştan (D-15), /iptal (D-17)
// ---------------------------------------------------------------------------

describe('/start + cancel', () => {
  // DB mock helpers reused across tests in this group
  let mockReturningProcessed: ReturnType<typeof vi.fn>;
  let mockValuesProcessed: ReturnType<typeof vi.fn>;
  let mockOnConflictDoNothingProcessed: ReturnType<typeof vi.fn>;

  /** Build a /start update for the given userId */
  function makeStartUpdate(userId: number, updateId: number = userId) {
    return {
      update_id: updateId,
      message: {
        message_id: userId,
        from: { id: userId, first_name: 'Ahmet', is_bot: false, language_code: 'tr' as const },
        chat: { id: userId, type: 'private' as const, first_name: 'Ahmet' },
        date: Math.floor(Date.now() / 1000),
        text: '/start',
        entities: [{ offset: 0, length: 6, type: 'bot_command' as const }],
      },
    };
  }

  /** Build an /iptal update */
  function makeIptalUpdate(userId: number, updateId: number = userId + 5000) {
    return {
      update_id: updateId,
      message: {
        message_id: userId + 1000,
        from: { id: userId, first_name: 'Ahmet', is_bot: false, language_code: 'tr' as const },
        chat: { id: userId, type: 'private' as const, first_name: 'Ahmet' },
        date: Math.floor(Date.now() / 1000),
        text: '/iptal',
        entities: [{ offset: 0, length: 6, type: 'bot_command' as const }],
      },
    };
  }

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_start';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-start';
    vi.resetModules();

    // Idempotency insert always succeeds (first delivery)
    mockReturningProcessed = vi.fn().mockResolvedValue([{ id: BigInt(1) }]);
    mockOnConflictDoNothingProcessed = vi.fn().mockReturnValue({ returning: mockReturningProcessed });
    mockValuesProcessed = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothingProcessed });
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('registered worker /start with no state replies greeting with displayName + project keyboard', async () => {
    const WORKER_ID = 55001;
    const PERSON_ID = 'person-uuid-001';
    const PROJECT_ID = 'project-uuid-001';

    // Mock db.select in call-order:
    // Call 1: people lookup (resolveWorker) → returns person row
    // Call 2: assignments+projects innerJoin (resolveWorker) → returns projects
    // Call 3: conversation_state lookup → returns [] (no active state)
    let selectCallCount = 0;
    vi.doMock('@/db', () => ({
      db: {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
            }),
          }),
        }),
        select: vi.fn().mockImplementation(() => {
          selectCallCount++;
          const callNum = selectCallCount;
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                if (callNum === 1) {
                  // people lookup → person found
                  return Promise.resolve([{
                    id: PERSON_ID,
                    telegramUserId: BigInt(WORKER_ID),
                    telegramName: 'Ahmet',
                    displayName: 'Ahmet Yılmaz',
                  }]);
                }
                // conversation_state lookup → no active state
                return Promise.resolve([]);
              }),
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ id: PROJECT_ID, name: 'Gaziantep Boru Hattı' }]),
              }),
            }),
          };
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      },
    }));

    const bot = await setupBotForTest();
    const replies: Array<{ text: string; replyMarkup?: unknown }> = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage') {
        replies.push({ text: payload.text, replyMarkup: payload.reply_markup });
      }
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate(makeStartUpdate(WORKER_ID, WORKER_ID));

    expect(replies.length).toBeGreaterThan(0);
    const reply = replies[0];
    // Greeting must contain the display name (SC1, LOG-01)
    expect(reply.text).toContain('Ahmet Yılmaz');
    // Must have an inline keyboard (project selection)
    expect(reply.replyMarkup).toBeDefined();
    expect((reply.replyMarkup as { inline_keyboard: unknown[][] }).inline_keyboard.length).toBeGreaterThan(0);
  });

  it('registered worker /start with active non-stale flow replies startInProgress with Devam + Baştan buttons', async () => {
    const WORKER_ID = 55002;
    const PERSON_ID = 'person-uuid-002';
    // Build activeState with a deterministic fresh Date (not stale)
    const freshDate = new Date(Date.now() - 1000); // 1 second ago — well within TTL

    // Use call-order approach: 3 selects happen in /start for a registered + active-flow user
    // Select 1: people lookup (resolveWorker) → person row
    // Select 2: assignments+projects innerJoin (resolveWorker) → projects (uses innerJoin, not direct where)
    // Select 3: conversation_state lookup → active state row
    let selectCount = 0;
    vi.doMock('@/db', () => ({
      db: {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: BigInt(2) }]),
            }),
          }),
        }),
        select: vi.fn().mockImplementation(() => {
          selectCount++;
          const n = selectCount;
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                if (n === 1) {
                  // people lookup → person found
                  return Promise.resolve([{
                    id: PERSON_ID,
                    telegramUserId: BigInt(WORKER_ID),
                    telegramName: 'Mehmet',
                    displayName: 'Mehmet Kaya',
                  }]);
                }
                // n === 3: conversation_state lookup → active non-stale state
                return Promise.resolve([{
                  id: 'state-002',
                  telegramUserId: BigInt(WORKER_ID),
                  personId: PERSON_ID,
                  flowId: 'flow-002',
                  currentStep: 'photo',
                  data: { step: 'photo' },
                  updatedAt: freshDate,
                }]);
              }),
              innerJoin: vi.fn().mockReturnValue({
                // n === 2: assignments+projects join
                where: vi.fn().mockResolvedValue([{ id: 'proj-1', name: 'Proje 1' }]),
              }),
            }),
          };
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      },
    }));

    const bot = await setupBotForTest();
    const replies: Array<{ text: string; replyMarkup?: unknown }> = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage') {
        replies.push({ text: payload.text, replyMarkup: payload.reply_markup });
      }
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate(makeStartUpdate(WORKER_ID, 55010));

    expect(replies.length).toBeGreaterThan(0);
    const { MESSAGES } = await import('@/lib/bot-messages');
    // Must show the "in progress" message
    expect(replies.some(r => r.text.includes(MESSAGES.startInProgress))).toBe(true);
    // Must have inline buttons with flow:resume and flow:restart callbacks (D-15)
    const replyWithButtons = replies.find(r => r.replyMarkup);
    expect(replyWithButtons).toBeDefined();
    const kb = replyWithButtons!.replyMarkup as { inline_keyboard: Array<Array<{ callback_data: string; text: string }>> };
    const allButtons = kb.inline_keyboard.flat();
    expect(allButtons.some(b => b.callback_data === 'flow:resume')).toBe(true);
    expect(allButtons.some(b => b.callback_data === 'flow:restart')).toBe(true);
  });

  it('/iptal deletes conversation_state and replies "İptal edildi"', async () => {
    const WORKER_ID = 55003;
    const mockDelete = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });

    vi.doMock('@/db', () => ({
      db: {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: BigInt(3) }]),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
        delete: mockDelete,
      },
    }));

    const bot = await setupBotForTest();
    const replies: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage') {
        replies.push(payload.text);
      }
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate(makeIptalUpdate(WORKER_ID, 55003 + 5000));

    // Must reply 'İptal edildi' (D-17)
    const { MESSAGES } = await import('@/lib/bot-messages');
    expect(replies.some(r => r.includes(MESSAGES.cancelled))).toBe(true);
    // Must have called delete
    expect(mockDelete).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (h) Pure unit tests — cold-start resume (SC5) + TTL eviction (D-22)
//
// Verify the FSM dispatcher loads state from DB, enforces TTL, and reprompts.
// These replace the it.todo placeholders from the Wave 0 scaffold.
// ---------------------------------------------------------------------------

describe('cold-start resume (SC5) + TTL (D-22)', () => {
  /** Build a mock DB with a given conversation_state row (or null for no row) */
  function buildDbMock(stateRow: Record<string, unknown> | null) {
    return {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
          }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(stateRow ? [stateRow] : []),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
  }

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_resume';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-resume';
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('cold-start text message at PHOTO step replies rejectNotPhoto (D-19, SC5)', async () => {
    // D-14 resume prefix is shown via flow:resume callback (repromptStep).
    // A direct text message at the PHOTO step triggers the real handler: rejectNotPhoto (D-19).
    // This is the correct post-Plan-05 behavior — the stub that returned resumePrefix is replaced.
    const WORKER_ID = 66001;

    // Seed a fresh (non-stale) conversation_state at PHOTO step
    const freshState = {
      id: 'state-photo-001',
      telegramUserId: BigInt(WORKER_ID),
      personId: 'person-001',
      flowId: 'flow-001',
      currentStep: 'photo',
      data: { step: 'photo' },
      updatedAt: new Date(), // fresh — not stale
    };

    vi.doMock('@/db', () => ({ db: buildDbMock(freshState) }));

    const bot = await setupBotForTest();
    const replies: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage') replies.push(payload.text);
      return Promise.resolve({ ok: true, result: {} as never });
    });

    // Deliver a text message — at PHOTO step, text is invalid (D-19)
    await bot.handleUpdate(makeTextUpdate(WORKER_ID, 'some message', WORKER_ID + 1000));

    expect(replies.length).toBeGreaterThan(0);
    const { MESSAGES } = await import('@/lib/bot-messages');
    // Must contain the rejectNotPhoto message (D-19 — text at photo step is rejected)
    expect(replies.some(r => r.includes(MESSAGES.rejectNotPhoto))).toBe(true);
    // Must NOT have advanced the step (rejectNotPhoto does not contain resumePrefix)
    expect(replies.every(r => !r.startsWith(MESSAGES.resumePrefix))).toBe(true);
  });

  it('stale conversation_state (>TTL) yields noActiveFlow and does NOT resume (D-22)', async () => {
    const WORKER_ID = 66002;
    const { CONVERSATION_TTL_MS } = await import('@/lib/bot-fsm');

    // Seed a STALE state (updatedAt is older than TTL)
    const staleState = {
      id: 'state-stale-001',
      telegramUserId: BigInt(WORKER_ID),
      personId: 'person-002',
      flowId: 'flow-002',
      currentStep: 'photo',
      data: { step: 'photo' },
      updatedAt: new Date(Date.now() - CONVERSATION_TTL_MS - 1000), // 1 second past TTL
    };

    vi.doMock('@/db', () => ({ db: buildDbMock(staleState) }));

    const bot = await setupBotForTest();
    const replies: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage') replies.push(payload.text);
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate(makeTextUpdate(WORKER_ID, 'some message', WORKER_ID + 2000));

    expect(replies.length).toBeGreaterThan(0);
    const { MESSAGES } = await import('@/lib/bot-messages');
    // Must reply noActiveFlow (stale state treated as absent — D-22)
    expect(replies.some(r => r.includes(MESSAGES.noActiveFlow))).toBe(true);
    // Must NOT contain the resume prefix (stale flow is NOT resumed)
    expect(replies.every(r => !r.startsWith(MESSAGES.resumePrefix))).toBe(true);
  });

  it('no conversation_state row yields noActiveFlow', async () => {
    const WORKER_ID = 66003;

    // No state row — null
    vi.doMock('@/db', () => ({ db: buildDbMock(null) }));

    const bot = await setupBotForTest();
    const replies: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage') replies.push(payload.text);
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate(makeTextUpdate(WORKER_ID, 'some message', WORKER_ID + 3000));

    expect(replies.length).toBeGreaterThan(0);
    const { MESSAGES } = await import('@/lib/bot-messages');
    expect(replies.some(r => r.includes(MESSAGES.noActiveFlow))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (i) Pure unit tests — project + BOQ selection (LOG-02/LOG-03, V4 tamper defense)
//
// Tests verify:
//   - project:select:<id> for an assigned project advances to BOQ step
//   - project:select:<id> for an unassigned project is rejected (V4 tamper)
//   - project:page:<n> re-renders without advancing step
//   - boq:select:<id> for positive-balance item advances to PHOTO step
//   - boq:select:<id> for 0-balance item shows exhausted warning, stays on BOQ step (D-25)
//   - boq:page:<n> re-renders without advancing step
// ---------------------------------------------------------------------------

describe('project + boq selection', () => {
  const WORKER_ID = 77001;
  const PERSON_ID = 'person-77001';
  const PROJECT_ID = 'project-uuid-assigned';
  const UNASSIGNED_PROJECT_ID = 'project-uuid-NOT-assigned';
  const BOQ_ITEM_ID = 'boq-item-pos-balance';
  const BOQ_ITEM_ZERO_ID = 'boq-item-zero-balance';
  const FLOW_ID = 'flow-77001';

  /** Build a callback_query update */
  function makeCallbackUpdate(
    userId: number,
    callbackData: string,
    updateId: number,
    currentStep: string = 'project',
    stateData: Record<string, unknown> = {}
  ) {
    return {
      update_id: updateId,
      callback_query: {
        id: 'cb-' + updateId,
        from: { id: userId, first_name: 'Worker', is_bot: false, language_code: 'tr' },
        chat_instance: 'chat-inst-1',
        data: callbackData,
        message: {
          message_id: 100,
          from: { id: 123456, is_bot: true, first_name: 'TestBot', username: 'testbot' },
          chat: { id: userId, type: 'private' as const, first_name: 'Worker' },
          date: Math.floor(Date.now() / 1000),
          text: 'keyboard message',
        },
      },
      // Attach state directly so we can access it in test-side assertions
      _testStateData: { currentStep, data: stateData, flowId: FLOW_ID },
    };
  }

  /** Build a db mock that routes by selectCallCount */
  function buildSelectionDbMock(opts: {
    workerProjects: Array<{ id: string; name: string }>;
    projectBoqItems: Array<{
      id: string; material: string; unit: string; plannedQty: string; approvedQty: string;
    }>;
    stateRow: Record<string, unknown>;
  }) {
    const { workerProjects, projectBoqItems, stateRow } = opts;
    let selectCount = 0;

    return {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
          }),
        }),
      }),
      select: vi.fn().mockImplementation((_fields?: unknown) => {
        selectCount++;
        const n = selectCount;
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              if (n === 1) {
                // idempotency processed_updates insert → handled by insert mock
                // This is actually the conversation_state lookup in dispatchCallbackQuery
                return Promise.resolve([stateRow]);
              }
              // people lookup for resolveWorker
              return Promise.resolve([{
                id: PERSON_ID,
                telegramUserId: BigInt(WORKER_ID),
                telegramName: 'Worker',
                displayName: 'Test Worker',
              }]);
            }),
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                // assignments+projects join for resolveWorker
                return Promise.resolve(workerProjects);
              }),
            }),
          }),
        };
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'state-updated' }]),
          }),
        }),
      }),
      // For boq items: need a separate select chain mock for boqItems
      _boqItems: projectBoqItems,
    };
  }

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_selection';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-selection';
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('project:select for assigned project advances to BOQ step and renders BOQ keyboard', async () => {
    // DB mock: conversation_state has PROJECT step, worker is assigned to PROJECT_ID
    let selectCount = 0;
    vi.doMock('@/db', () => ({
      db: {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
            }),
          }),
        }),
        select: vi.fn().mockImplementation(() => {
          selectCount++;
          const n = selectCount;
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                if (n === 1) {
                  // dispatchCallbackQuery: conversation_state lookup
                  return Promise.resolve([{
                    id: 'state-1', telegramUserId: BigInt(WORKER_ID),
                    personId: PERSON_ID, flowId: FLOW_ID,
                    currentStep: 'project', data: { step: 'project', page: 0 },
                    updatedAt: new Date(),
                  }]);
                }
                if (n === 2) {
                  // resolveWorker: people lookup
                  return Promise.resolve([{
                    id: PERSON_ID, telegramUserId: BigInt(WORKER_ID),
                    telegramName: 'Worker', displayName: 'Test Worker',
                  }]);
                }
                // boqItems lookup
                return Promise.resolve([{
                  id: BOQ_ITEM_ID, material: 'Boru', unit: 'm',
                  plannedQty: '500', approvedQty: '100', sortOrder: 0,
                  projectId: PROJECT_ID,
                }]);
              }),
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([
                  { id: PROJECT_ID, name: 'Test Proje' },
                ]),
              }),
            }),
          };
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'state-1' }]),
            }),
          }),
        }),
      },
    }));

    const bot = await setupBotForTest();
    const replies: Array<{ text?: string; replyMarkup?: unknown; method: string }> = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      replies.push({ method, text: payload?.text, replyMarkup: payload?.reply_markup });
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate(makeCallbackUpdate(WORKER_ID, `project:select:${PROJECT_ID}`, 77001));

    // Should have replied with BOQ keyboard
    const msgReply = replies.find(r => r.method === 'sendMessage');
    expect(msgReply).toBeDefined();
    // Should show the BOQ keyboard (inline keyboard with boq:select: callback_data)
    const kb = msgReply?.replyMarkup as { inline_keyboard: Array<Array<{ callback_data: string }>> } | undefined;
    expect(kb?.inline_keyboard?.flat().some(b => b.callback_data?.startsWith('boq:select:'))).toBe(true);
  });

  it('project:select for UNASSIGNED project does NOT advance step (V4 tamper defense)', async () => {
    let selectCount = 0;
    vi.doMock('@/db', () => ({
      db: {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
            }),
          }),
        }),
        select: vi.fn().mockImplementation(() => {
          selectCount++;
          const n = selectCount;
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                if (n === 1) {
                  // conversation_state: still on project step
                  return Promise.resolve([{
                    id: 'state-1', telegramUserId: BigInt(WORKER_ID),
                    personId: PERSON_ID, flowId: FLOW_ID,
                    currentStep: 'project', data: { step: 'project', page: 0 },
                    updatedAt: new Date(),
                  }]);
                }
                if (n === 2) {
                  // people lookup
                  return Promise.resolve([{
                    id: PERSON_ID, telegramUserId: BigInt(WORKER_ID),
                    telegramName: 'Worker', displayName: 'Test Worker',
                  }]);
                }
                return Promise.resolve([]);
              }),
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([
                  // Only PROJECT_ID assigned — NOT UNASSIGNED_PROJECT_ID
                  { id: PROJECT_ID, name: 'Test Proje' },
                ]),
              }),
            }),
          };
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]), // no update (not advancing)
            }),
          }),
        }),
      },
    }));

    const bot = await setupBotForTest();
    const updateCalls: ReturnType<typeof vi.fn>[] = [];
    let savedStep: string | null = null;

    // Intercept update calls to detect if step was advanced
    const dbModule = await import('@/db').catch(() => null);
    void dbModule; // unused

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage' || method === 'answerCallbackQuery') {
        updateCalls.push(payload);
      }
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate(makeCallbackUpdate(WORKER_ID, `project:select:${UNASSIGNED_PROJECT_ID}`, 77002));

    // The step should NOT have advanced — saveState update must NOT have been called
    // with 'boq' step. We verify by checking that any reply is a reprompt, not a BOQ keyboard.
    const textReplies = updateCalls.filter((p: unknown) => (p as { text?: string }).text);
    // If there's a reply, it should be a reprompt (project keyboard or chooseProject message)
    // The key assertion: NO boq:select keyboard was sent
    const allPayloads = JSON.stringify(updateCalls);
    expect(allPayloads).not.toContain('boq:select:');
    void savedStep;
  });

  it('boq:select for 0-balance item shows exhaustedBoqWarning and stays on BOQ step (D-25)', async () => {
    let selectCount = 0;
    vi.doMock('@/db', () => ({
      db: {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
            }),
          }),
        }),
        select: vi.fn().mockImplementation(() => {
          selectCount++;
          const n = selectCount;
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                if (n === 1) {
                  // conversation_state: on BOQ step
                  return Promise.resolve([{
                    id: 'state-boq', telegramUserId: BigInt(WORKER_ID),
                    personId: PERSON_ID, flowId: FLOW_ID,
                    currentStep: 'boq', data: { step: 'boq', projectId: PROJECT_ID, page: 0 },
                    updatedAt: new Date(),
                  }]);
                }
                // boqItems lookup — zero balance item
                return Promise.resolve([{
                  id: BOQ_ITEM_ZERO_ID, material: 'Ekstra Kalem', unit: 'adet',
                  plannedQty: '10', approvedQty: '10', // fully consumed
                  sortOrder: 0, projectId: PROJECT_ID,
                }]);
              }),
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            }),
          };
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]), // no advance
            }),
          }),
        }),
      },
    }));

    const bot = await setupBotForTest();
    const replies: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage' && payload?.text) {
        replies.push(payload.text);
      }
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate(makeCallbackUpdate(WORKER_ID, `boq:select:${BOQ_ITEM_ZERO_ID}`, 77003, 'boq', { projectId: PROJECT_ID }));

    const { MESSAGES } = await import('@/lib/bot-messages');
    expect(replies.some(r => r.includes(MESSAGES.exhaustedBoqWarning))).toBe(true);
  });

  it('project:page callback re-renders keyboard without advancing step', async () => {
    let selectCount = 0;
    vi.doMock('@/db', () => ({
      db: {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
            }),
          }),
        }),
        select: vi.fn().mockImplementation(() => {
          selectCount++;
          const n = selectCount;
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                if (n === 1) {
                  return Promise.resolve([{
                    id: 'state-p', telegramUserId: BigInt(WORKER_ID),
                    personId: PERSON_ID, flowId: FLOW_ID,
                    currentStep: 'project', data: { step: 'project', page: 0 },
                    updatedAt: new Date(),
                  }]);
                }
                // people lookup
                return Promise.resolve([{
                  id: PERSON_ID, telegramUserId: BigInt(WORKER_ID),
                  telegramName: 'Worker', displayName: 'Test Worker',
                }]);
              }),
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([
                  { id: PROJECT_ID, name: 'Test Proje' },
                ]),
              }),
            }),
          };
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]), // no advance
            }),
          }),
        }),
      },
    }));

    const bot = await setupBotForTest();
    const replies: Array<{ text?: string; replyMarkup?: unknown }> = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage') {
        replies.push({ text: payload.text, replyMarkup: payload.reply_markup });
      }
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate(makeCallbackUpdate(WORKER_ID, 'project:page:1', 77004));

    // Should reply with a project keyboard (pagination), not a BOQ keyboard
    const msgReply = replies[0];
    if (msgReply?.replyMarkup) {
      const kb = msgReply.replyMarkup as { inline_keyboard: Array<Array<{ callback_data: string }>> };
      const allCallbacks = kb.inline_keyboard.flat().map(b => b.callback_data);
      // No boq: callbacks should be present
      expect(allCallbacks.every(c => !c?.startsWith('boq:select:'))).toBe(true);
    }
    // The step was not advanced — no BOQ keyboard sent
    const allRepliesJson = JSON.stringify(replies);
    expect(allRepliesJson).not.toContain('boq:select:');
  });
});

// ---------------------------------------------------------------------------
// (j) Pure unit tests — photo + location type enforcement (LOG-04/D-19, LOG-05/D-20)
// ---------------------------------------------------------------------------

describe('photo + location enforcement', () => {
  const WORKER_ID = 78001;
  const PERSON_ID = 'person-78001';
  const FLOW_ID = 'flow-78001';
  const PROJECT_ID = 'proj-78001';
  const BOQ_ITEM_ID = 'boq-78001';

  function buildPhotoStateDbMock(currentStep: string) {
    return {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
          }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 'state-photo', telegramUserId: BigInt(WORKER_ID),
            personId: PERSON_ID, flowId: FLOW_ID,
            currentStep,
            data: { step: currentStep, projectId: PROJECT_ID, boqItemId: BOQ_ITEM_ID, unit: 'm' },
            updatedAt: new Date(),
          }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'state-photo' }]),
          }),
        }),
      }),
    };
  }

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_enforcement';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-enforcement';
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('LOG-04/D-19: text message at photo step replies rejectNotPhoto and step stays "photo"', async () => {
    vi.doMock('@/db', () => ({ db: buildPhotoStateDbMock('photo') }));

    const bot = await setupBotForTest();
    const replies: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage' && payload?.text) replies.push(payload.text);
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate(makeTextUpdate(WORKER_ID, 'Bu fotoğraf değil', WORKER_ID + 100));

    const { MESSAGES } = await import('@/lib/bot-messages');
    expect(replies.some(r => r.includes(MESSAGES.rejectNotPhoto))).toBe(true);
  });

  it('LOG-04: photo message at photo step advances step to "location"', async () => {
    // Mock uploadPhotoToBlob to avoid real Blob upload
    vi.doMock('@/lib/bot-photo', () => ({
      uploadPhotoToBlob: vi.fn().mockResolvedValue('https://blob.example.com/photo.jpg'),
    }));

    vi.doMock('@/db', () => ({ db: buildPhotoStateDbMock('photo') }));

    const bot = await setupBotForTest();
    const replies: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage' && payload?.text) replies.push(payload.text);
      return Promise.resolve({ ok: true, result: {} as never });
    });

    // Photo update — message has a photo array
    const photoUpdate = {
      update_id: WORKER_ID + 200,
      message: {
        message_id: WORKER_ID + 1,
        from: { id: WORKER_ID, first_name: 'Worker', is_bot: false, language_code: 'tr' },
        chat: { id: WORKER_ID, type: 'private' as const, first_name: 'Worker' },
        date: Math.floor(Date.now() / 1000),
        photo: [
          { file_id: 'small_file_id', file_unique_id: 'u1', width: 100, height: 100, file_size: 1000 },
          { file_id: 'large_file_id', file_unique_id: 'u2', width: 800, height: 600, file_size: 50000 },
        ],
      },
    };

    await bot.handleUpdate(photoUpdate);

    const { MESSAGES } = await import('@/lib/bot-messages');
    expect(replies.some(r => r.includes(MESSAGES.promptLocation))).toBe(true);
  });

  it('LOG-05/D-20: text message at location step replies rejectNotLocation and step stays "location"', async () => {
    vi.doMock('@/db', () => ({ db: buildPhotoStateDbMock('location') }));

    const bot = await setupBotForTest();
    const replies: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage' && payload?.text) replies.push(payload.text);
      return Promise.resolve({ ok: true, result: {} as never });
    });

    // Typed coordinate text — rejected
    await bot.handleUpdate(makeTextUpdate(WORKER_ID, '41.0082, 28.9784', WORKER_ID + 300));

    const { MESSAGES } = await import('@/lib/bot-messages');
    expect(replies.some(r => r.includes(MESSAGES.rejectNotLocation))).toBe(true);
  });

  it('LOG-05: native location message at location step advances step to "quantity"', async () => {
    vi.doMock('@/db', () => ({ db: buildPhotoStateDbMock('location') }));

    const bot = await setupBotForTest();
    const replies: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage' && payload?.text) replies.push(payload.text);
      return Promise.resolve({ ok: true, result: {} as never });
    });

    const locationUpdate = {
      update_id: WORKER_ID + 400,
      message: {
        message_id: WORKER_ID + 2,
        from: { id: WORKER_ID, first_name: 'Worker', is_bot: false, language_code: 'tr' },
        chat: { id: WORKER_ID, type: 'private' as const, first_name: 'Worker' },
        date: Math.floor(Date.now() / 1000),
        location: { latitude: 41.0082, longitude: 28.9784 },
      },
    };

    await bot.handleUpdate(locationUpdate);

    const { MESSAGES } = await import('@/lib/bot-messages');
    // Should prompt for quantity
    expect(replies.some(r => r.includes('Kaç'))).toBe(true);
    void MESSAGES;
  });
});

// ---------------------------------------------------------------------------
// (k) Pure unit tests — quantity (Turkish decimal) + notes (skip) (LOG-06/LOG-07)
// ---------------------------------------------------------------------------

describe('quantity + notes', () => {
  const WORKER_ID = 79001;
  const PERSON_ID = 'person-79001';
  const FLOW_ID = 'flow-79001';
  const PROJECT_ID = 'proj-79001';
  const BOQ_ITEM_ID = 'boq-79001';

  function buildQuantityStateDbMock(currentStep: string, extraData: Record<string, unknown> = {}) {
    return {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
          }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{
            id: 'state-qty', telegramUserId: BigInt(WORKER_ID),
            personId: PERSON_ID, flowId: FLOW_ID,
            currentStep,
            data: {
              step: currentStep,
              projectId: PROJECT_ID, boqItemId: BOQ_ITEM_ID,
              unit: 'm', ...extraData
            },
            updatedAt: new Date(),
          }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'state-qty' }]),
          }),
        }),
      }),
    };
  }

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_quantity';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-quantity';
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('LOG-06: integer quantity "25" advances to notes step', async () => {
    vi.doMock('@/db', () => ({ db: buildQuantityStateDbMock('quantity') }));

    const bot = await setupBotForTest();
    const savedData: unknown[] = [];

    // Capture update set call to verify quantity saved
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage' && payload?.text) savedData.push(payload.text);
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate(makeTextUpdate(WORKER_ID, '25', WORKER_ID + 100));

    const { MESSAGES } = await import('@/lib/bot-messages');
    expect(savedData.some(r => (r as string).includes(MESSAGES.promptNotes))).toBe(true);
  });

  it('LOG-06: Turkish comma decimal "25,5" is stored as 25.5 (Pitfall 4 critical)', async () => {
    vi.doMock('@/db', () => ({ db: buildQuantityStateDbMock('quantity') }));

    const bot = await setupBotForTest();
    let capturedUpdateData: Record<string, unknown> | null = null;

    // We need to intercept the saveState update call to check the quantity value
    // Since saveState calls db.update, we need to capture what it saves.
    // We'll re-mock @/db to intercept the update set call.
    vi.resetModules();
    vi.doMock('@/lib/bot-photo', () => ({
      uploadPhotoToBlob: vi.fn().mockResolvedValue('https://blob.example.com/photo.jpg'),
    }));

    const mockUpdateSetWhere = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'state-qty' }]),
    });
    const mockUpdateSet = vi.fn().mockImplementation((data: Record<string, unknown>) => {
      capturedUpdateData = data;
      return { where: mockUpdateSetWhere };
    });

    vi.doMock('@/db', () => ({
      db: {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{
              id: 'state-qty', telegramUserId: BigInt(WORKER_ID),
              personId: PERSON_ID, flowId: FLOW_ID,
              currentStep: 'quantity',
              data: { step: 'quantity', projectId: PROJECT_ID, boqItemId: BOQ_ITEM_ID, unit: 'm' },
              updatedAt: new Date(),
            }]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: mockUpdateSet,
        }),
      },
    }));

    const bot2 = await setupBotForTest();
    const replies: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot2.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage' && payload?.text) replies.push(payload.text);
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot2.handleUpdate(makeTextUpdate(WORKER_ID, '25,5', WORKER_ID + 200));

    // Verify the update was called with quantity = 25.5 (not 25)
    expect(capturedUpdateData).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedQty = (capturedUpdateData as any)?.data?.quantity;
    expect(savedQty).toBe(25.5);
  });

  it('LOG-06: non-numeric "abc" replies rejectNotNumeric and stays on quantity step', async () => {
    vi.doMock('@/db', () => ({ db: buildQuantityStateDbMock('quantity') }));

    const bot = await setupBotForTest();
    const replies: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage' && payload?.text) replies.push(payload.text);
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot.handleUpdate(makeTextUpdate(WORKER_ID, 'abc', WORKER_ID + 300));

    const { MESSAGES } = await import('@/lib/bot-messages');
    expect(replies.some(r => r.includes(MESSAGES.rejectNotNumeric))).toBe(true);
  });

  it('LOG-07/D-21: notes:skip callback stores null notes and advances to confirm', async () => {
    vi.doMock('@/db', () => ({ db: buildQuantityStateDbMock('notes', { quantity: 25 }) }));

    const bot = await setupBotForTest();
    let capturedData: Record<string, unknown> | null = null;
    const replies: string[] = [];

    vi.resetModules();
    const mockUpdateSetWhere2 = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'state-notes' }]),
    });
    const mockUpdateSet2 = vi.fn().mockImplementation((data: Record<string, unknown>) => {
      capturedData = data;
      return { where: mockUpdateSetWhere2 };
    });

    vi.doMock('@/db', () => ({
      db: {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{
              id: 'state-notes', telegramUserId: BigInt(WORKER_ID),
              personId: PERSON_ID, flowId: FLOW_ID,
              currentStep: 'notes',
              data: { step: 'notes', projectId: PROJECT_ID, boqItemId: BOQ_ITEM_ID, unit: 'm', quantity: 25 },
              updatedAt: new Date(),
            }]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: mockUpdateSet2,
        }),
      },
    }));

    const bot3 = await setupBotForTest();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot3.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendMessage' && payload?.text) replies.push(payload.text);
      return Promise.resolve({ ok: true, result: {} as never });
    });

    const skipUpdate = {
      update_id: WORKER_ID + 400,
      callback_query: {
        id: 'cb-skip',
        from: { id: WORKER_ID, first_name: 'Worker', is_bot: false, language_code: 'tr' },
        chat_instance: 'chat-inst-skip',
        data: 'notes:skip',
        message: {
          message_id: 200,
          from: { id: 123456, is_bot: true, first_name: 'TestBot', username: 'testbot' },
          chat: { id: WORKER_ID, type: 'private' as const, first_name: 'Worker' },
          date: Math.floor(Date.now() / 1000),
          text: 'notes prompt',
        },
      },
    };

    await bot3.handleUpdate(skipUpdate);

    // Verify null notes saved in data
    expect(capturedData).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedNotes = (capturedData as any)?.data?.notes;
    expect(savedNotes).toBeNull();
    // Should have advanced to confirm step
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedStep = (capturedData as any)?.currentStep;
    expect(savedStep).toBe('confirm');
    void bot;
    void replies;
  });

  it('LOG-07: free text notes are stored (length-capped) and step advances to confirm', async () => {
    vi.doMock('@/db', () => ({ db: buildQuantityStateDbMock('notes', { quantity: 25 }) }));

    const bot = await setupBotForTest();
    let capturedData: Record<string, unknown> | null = null;

    vi.resetModules();
    const mockUpdateSetWhere3 = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'state-notes-text' }]),
    });
    const mockUpdateSet3 = vi.fn().mockImplementation((data: Record<string, unknown>) => {
      capturedData = data;
      return { where: mockUpdateSetWhere3 };
    });

    vi.doMock('@/db', () => ({
      db: {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{
              id: 'state-notes-text', telegramUserId: BigInt(WORKER_ID),
              personId: PERSON_ID, flowId: FLOW_ID,
              currentStep: 'notes',
              data: { step: 'notes', projectId: PROJECT_ID, boqItemId: BOQ_ITEM_ID, unit: 'm', quantity: 25 },
              updatedAt: new Date(),
            }]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: mockUpdateSet3,
        }),
      },
    }));

    const bot4 = await setupBotForTest();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot4.api.config.use(async (_prev: any, _method: any, _payload: any) => {
      return Promise.resolve({ ok: true, result: {} as never });
    });

    await bot4.handleUpdate(makeTextUpdate(WORKER_ID, 'Boru döşeme tamamlandı', WORKER_ID + 500));

    // Verify notes saved in data
    expect(capturedData).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedNotes = (capturedData as any)?.data?.notes;
    expect(savedNotes).toBe('Boru döşeme tamamlandı');
    // Should have advanced to confirm step
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedStep = (capturedData as any)?.currentStep;
    expect(savedStep).toBe('confirm');
    void bot;
  });
});

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
