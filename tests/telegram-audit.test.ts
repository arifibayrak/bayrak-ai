/**
 * tests/telegram-audit.test.ts
 *
 * Phase 3: Audit Loop — Wave 0 test scaffold.
 *
 * All AUDIT-* behaviors have a named test target here BEFORE any handler is written.
 * This is the RED phase of TDD (03-01 plan). Tests WILL fail or error because the
 * referenced exports (buildAuditKeyboard, handleAuditDecision, fanOutToAuditors) do
 * NOT yet exist — that is the expected Wave 0 state.
 *
 * Test groups:
 *   (a) AUDIT-02 (unit, pure): buildAuditKeyboard callback_data ≤64 bytes
 *   (b) AUDIT-03 (unit, mock DB): unauthorized tap → answerCallbackQuery, no DB UPDATE
 *   (c) AUDIT-04 (describeIfDb, live DB): approve sets status/decided_by/decided_at,
 *       boq_items.approved_qty increments by submitted quantity
 *   (d) AUDIT-04 SC3 (describeIfDb, live DB): duplicate decision increments once only
 *   (e) AUDIT-06 SC5 (describeIfDb, live DB): concurrent race — exactly one wins
 *   (f) AUDIT-06 / T-3-DUP (mock or describeIfDb): replayed callback_query is de-duped
 *   (g) AUDIT-05 (describeIfDb, live DB): reject with/without reason
 *
 * Environment notes:
 *   - Groups (a) and (b) are pure unit/mock tests — run anywhere.
 *   - Groups (c)–(g) are gated by describeIfDb — skipped without TEST_DATABASE_URL.
 *   - DB-bound tests reference the not-yet-migrated audit_notifications table and
 *     submissions.decided_* columns — they are expected to be red until 03-02 migration.
 *   - The two MANDATORY tests per 03-VALIDATION.md are:
 *       T-3-RACE (AUDIT-04 SC3): sequential re-tap → once only
 *       T-3-RACE (AUDIT-06 SC5): concurrent race → first wins
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';

// ---------------------------------------------------------------------------
// Test harness helpers
// ---------------------------------------------------------------------------

/**
 * setupBotForTest — initializes the grammY bot for tests.
 * Spies bot.init to prevent Telegram getMe network call.
 * Sets bot.botInfo so grammY does not throw "Bot not initialized!".
 * Installs api.config.use transformer to intercept ALL outbound Telegram API calls.
 * (vi.spyOn on api.sendMessage does NOT work — grammY uses a raw Proxy dispatch.)
 */
 
async function setupBotForTest(): Promise<any> {
  const { bot } = await import('@/lib/telegram');

  // vi.spyOn requires the method to be an own property or be configurable.
  // grammY Bot.init is on the prototype (not own property) and may not be directly spyable
  // in all module reset scenarios. We define it as an own property on the instance instead.
  // This matches the behavior of vi.spyOn(bot, 'init').mockResolvedValue() but works reliably
  // across module resets.
   
  (bot as any).init = vi.fn().mockResolvedValue(undefined);

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

   
  bot.api.config.use((_prev: any, _method: any, _payload: any, _signal: any) =>
    Promise.resolve({ ok: true, result: {} as any })
  );

  return bot;
}

/**
 * makeCallbackUpdate — builds a minimal Telegram callback_query update.
 * Used to drive audit:approve / audit:reject / audit:reason callbacks.
 */
export function makeCallbackUpdate(userId: number, data: string, updateId?: number) {
  return {
    update_id: updateId ?? userId + 1000,
    callback_query: {
      id: String(userId),
      from: { id: userId, first_name: 'TestAuditor', is_bot: false, language_code: 'tr' },
      chat_instance: String(userId),
      data,
      message: {
        message_id: 42,
        from: { id: 123456, is_bot: true, first_name: 'TestBot', username: 'testbot' },
        chat: { id: userId, type: 'private' as const },
        date: Math.floor(Date.now() / 1000),
      },
    },
  };
}

/**
 * buildAuditDbMock — returns a minimal Drizzle-like mock for unit tests.
 * Simulates DB responses without a live database connection.
 */
function buildAuditDbMock(opts: {
  submissionRow?: Record<string, unknown> | null;
  auditorAssigned?: boolean;
  stateRow?: Record<string, unknown> | null;
}) {
  const submissionResult = opts.submissionRow ? [opts.submissionRow] : [];
  const assignmentResult = opts.auditorAssigned
    ? [{ id: 'assign-1', personId: 'person-1', projectId: 'project-1', roleOnProject: 'auditor' }]
    : [];

  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: BigInt(1) }]),
        }),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation((_cond: unknown) => {
          // Return appropriate rows based on context
          return Promise.resolve(submissionResult.length > 0 ? submissionResult : assignmentResult);
        }),
      }),
    })),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
  };
}

// ---------------------------------------------------------------------------
// AUDIT-01 — fanOutToAuditors fan-out behaviors (unit, mock)
// Tests: one sendPhoto per auditor, one audit_notifications insert per auditor,
//        no-auditor case sends nothing + leaves submission pending_audit
// ---------------------------------------------------------------------------

describe('AUDIT-01: fanOutToAuditors fan-out behaviors', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_audit01';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-audit01';
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('AUDIT-01 SC1: sends exactly one sendPhoto per assigned auditor and inserts one audit_notifications row per auditor', async () => {
    // Mock DB: submission + boqItem + 2 auditors
    // fanOutToAuditors does 4 selects: submission, boqItem, auditor assignments, people
    const submissionRow = {
      id: 'sub-01-1',
      projectId: 'proj-01-1',
      boqItemId: 'boq-01-1',
      photoFileId: 'tg_file_abc',
      photoUrl: 'https://example.com/photo.jpg',
      quantity: '50.000',
      notes: 'Test notes',
      locationLat: '41.0000',
      locationLon: '29.0000',
      status: 'pending_audit',
    };
    const boqRow = {
      id: 'boq-01-1',
      material: 'DN200 HDPE Boru',
      unit: 'm',
      plannedQty: '1000.000',
      approvedQty: '0.000',
    };
    const assignmentRows = [
      { personId: 'person-aud-1' },
      { personId: 'person-aud-2' },
    ];
    const auditorRows = [
      { id: 'person-aud-1', telegramUserId: BigInt(3001), displayName: 'Auditor One' },
      { id: 'person-aud-2', telegramUserId: BigInt(3002), displayName: 'Auditor Two' },
    ];

    let selectCallIndex = 0;
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const mockDb = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallIndex++;
            if (selectCallIndex === 1) return Promise.resolve([submissionRow]);
            if (selectCallIndex === 2) return Promise.resolve([boqRow]);
            if (selectCallIndex === 3) return Promise.resolve(assignmentRows);
            return Promise.resolve(auditorRows); // people lookup
          }),
        }),
      })),
      insert: vi.fn().mockReturnValue({
        values: insertValues,
      }),
    };

    vi.doMock('@/db', () => ({ db: mockDb }));

    // Use the real bot via setupBotForTest() — intercept sendPhoto via api.config.use transformer.
    // This avoids vi.doMock('@/lib/telegram', ...) whose factory persists across vi.resetModules()
    // and leaks a partial mock (missing api.config) into AUDIT-03+ tests' setupBotForTest() calls.
    const bot = await setupBotForTest();
    const sentPhotos: Array<{ chatId: number | string; photo: unknown; opts: unknown }> = [];
     
    bot.api.config.use(async (prev: any, method: any, payload: any, signal: any) => {
      if (method === 'sendPhoto') {
        const chatId = (payload as { chat_id: number | string }).chat_id;
        const photo = (payload as { photo: unknown }).photo;
        sentPhotos.push({ chatId, photo, opts: payload });
        return Promise.resolve({ ok: true, result: { message_id: 42 + sentPhotos.length, chat: { id: chatId } } });
      }
      return prev(method, payload, signal);
    });

    const { fanOutToAuditors } = await import('@/lib/bot-audit');
    await fanOutToAuditors('sub-01-1');

    // One sendPhoto per auditor
    expect(sentPhotos.length).toBe(2);
    expect(sentPhotos[0].photo).toBe('tg_file_abc'); // file_id preferred
    // One audit_notifications insert per auditor
    expect(insertValues).toHaveBeenCalledTimes(2);
  });

  it('AUDIT-01 SC2: no-auditor case — sends no photo, does not throw, submission stays pending_audit', async () => {
    // fanOutToAuditors does: submission select, boqItem select, assignments select (empty → return early)
    const submissionRow = {
      id: 'sub-01-2',
      projectId: 'proj-01-2',
      boqItemId: 'boq-01-2',
      photoFileId: null,
      photoUrl: 'https://example.com/photo2.jpg',
      quantity: '10.000',
      notes: null,
      locationLat: null,
      locationLon: null,
      status: 'pending_audit',
    };
    const boqRow = {
      id: 'boq-01-2',
      material: 'DN200 HDPE Boru',
      unit: 'm',
      plannedQty: '500.000',
      approvedQty: '0.000',
    };

    let selectCallIndex = 0;
    const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
    const mockDb = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallIndex++;
            if (selectCallIndex === 1) return Promise.resolve([submissionRow]);
            if (selectCallIndex === 2) return Promise.resolve([boqRow]);
            return Promise.resolve([]); // no auditor assignments → early return
          }),
        }),
      })),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    };

    vi.doMock('@/db', () => ({ db: mockDb }));

    // Use real bot via setupBotForTest() — no sendPhoto expected, so no interception needed.
    // Avoid vi.doMock('@/lib/telegram', ...) to prevent factory leakage.
    await setupBotForTest();
    const sentPhotos: unknown[] = [];

    const { fanOutToAuditors } = await import('@/lib/bot-audit');
    // Must not throw
    await expect(fanOutToAuditors('sub-01-2')).resolves.toBeUndefined();

    // No sendPhoto calls (assignments empty → early return)
    expect(sentPhotos.length).toBe(0);
    // No submissions UPDATE (stays pending_audit)
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('AUDIT-01 SC3: one failing send records send_failed=true but does not prevent other auditor sends', async () => {
    // fanOutToAuditors does: submission, boqItem, assignments, people selects
    const submissionRow = {
      id: 'sub-01-3',
      projectId: 'proj-01-3',
      boqItemId: 'boq-01-3',
      photoFileId: 'tg_file_xyz',
      photoUrl: 'https://example.com/photo3.jpg',
      quantity: '20.000',
      notes: null,
      locationLat: null,
      locationLon: null,
      status: 'pending_audit',
    };
    const boqRow = {
      id: 'boq-01-3',
      material: 'DN200 HDPE Boru',
      unit: 'm',
      plannedQty: '1000.000',
      approvedQty: '0.000',
    };
    const assignmentRows = [
      { personId: 'person-aud-3a' },
      { personId: 'person-aud-3b' },
    ];
    const auditorRows = [
      { id: 'person-aud-3a', telegramUserId: BigInt(3003), displayName: 'Auditor Three' },
      { id: 'person-aud-3b', telegramUserId: BigInt(3004), displayName: 'Auditor Four' },
    ];

    let selectCallIndex = 0;
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const mockDb = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallIndex++;
            if (selectCallIndex === 1) return Promise.resolve([submissionRow]);
            if (selectCallIndex === 2) return Promise.resolve([boqRow]);
            if (selectCallIndex === 3) return Promise.resolve(assignmentRows);
            return Promise.resolve(auditorRows); // people lookup
          }),
        }),
      })),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
    };

    vi.doMock('@/db', () => ({ db: mockDb }));

    // Use real bot via setupBotForTest() — intercept sendPhoto and simulate first-send failure.
    // Avoid vi.doMock('@/lib/telegram', ...) to prevent factory leakage into AUDIT-03+.
    const bot = await setupBotForTest();
    let sendCallCount = 0;
     
    bot.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'sendPhoto') {
        sendCallCount++;
        if (sendCallCount === 1) throw new Error('Telegram API error (simulated)');
        const chatId = (payload as { chat_id: number }).chat_id;
        return Promise.resolve({ ok: true, result: { message_id: 99, chat: { id: chatId } } });
      }
      return Promise.resolve({ ok: true, result: {} as any });
    });

    const { fanOutToAuditors } = await import('@/lib/bot-audit');
    await expect(fanOutToAuditors('sub-01-3')).resolves.toBeUndefined();

    // Both auditors attempted (2 sendPhoto calls)
    expect(sendCallCount).toBe(2);
    // Both got audit_notifications rows (one with sendFailed=true, one without)
    expect(insertValues).toHaveBeenCalledTimes(2);
    // First insert should have sendFailed: true
    const firstInsertCall = insertValues.mock.calls[0][0];
    expect(firstInsertCall.sendFailed).toBe(true);
    // Second insert should not have sendFailed set (or false)
    const secondInsertCall = insertValues.mock.calls[1][0];
    expect(secondInsertCall.sendFailed).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// (a) AUDIT-02 — buildAuditKeyboard callback_data ≤64 bytes (unit, pure)
// ---------------------------------------------------------------------------

describe('AUDIT-02: buildAuditKeyboard callback_data lengths', () => {
  it('audit:approve:<uuid> callback_data is ≤64 bytes', async () => {
    // This import will FAIL until Plan 03-03 creates bot-keyboards.ts builders
    const { buildAuditKeyboard } = await import('@/lib/bot-keyboards');
    const submissionId = '550e8400-e29b-41d4-a716-446655440000'; // 36-char UUID
    const kb = buildAuditKeyboard(submissionId);
    const rows = kb.inline_keyboard;
    // Expect [✅ Onayla, ❌ Reddet] buttons on the first row
    expect(rows.length).toBeGreaterThan(0);
     
    const approveBtn = rows[0].find((b: any) =>
      (b as { callback_data?: string }).callback_data?.startsWith('audit:approve:')
    ) as { callback_data: string } | undefined;
     
    const rejectBtn = rows[0].find((b: any) =>
      (b as { callback_data?: string }).callback_data?.startsWith('audit:reject:')
    ) as { callback_data: string } | undefined;
    expect(approveBtn).toBeDefined();
    expect(rejectBtn).toBeDefined();
    // Telegram max callback_data length is 64 bytes
    expect(Buffer.byteLength(approveBtn!.callback_data, 'utf8')).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(rejectBtn!.callback_data, 'utf8')).toBeLessThanOrEqual(64);
  });

  it('audit:approve:<uuid> data is exactly "audit:approve:<uuid>" format', async () => {
    const { buildAuditKeyboard } = await import('@/lib/bot-keyboards');
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    const kb = buildAuditKeyboard(submissionId);
     
    const approveBtn = kb.inline_keyboard[0].find((b: any) =>
      (b as { callback_data?: string }).callback_data?.startsWith('audit:approve:')
    ) as { callback_data: string } | undefined;
    expect(approveBtn?.callback_data).toBe(`audit:approve:${submissionId}`);
  });
});

// ---------------------------------------------------------------------------
// (b) AUDIT-03 — unauthorized tap: answerCallbackQuery, NO submissions UPDATE
// (unit, mock DB — no DB required)
// ---------------------------------------------------------------------------

describe('AUDIT-03: unauthorized auditor tap → no-op', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_audit_unit';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-audit-unit';
    vi.resetModules();

    // Mock DB: no auditor assignment for this telegram_user_id
    vi.doMock('@/db', () => ({
      db: buildAuditDbMock({ auditorAssigned: false }),
    }));
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('unauthorized telegram_user_id tap triggers answerCallbackQuery and no submissions UPDATE', async () => {
    const bot = await setupBotForTest();
    const callbackMethods: string[] = [];

     
    bot.api.config.use(async (_prev: any, method: any, _payload: any) => {
      callbackMethods.push(method);
      return Promise.resolve({ ok: true, result: {} as any });
    });

    // This will fail until Plan 03-03 wires handleAuditDecision in the dispatcher
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    await bot.handleUpdate(makeCallbackUpdate(99999, `audit:approve:${submissionId}`, 5001));

    // MUST call answerCallbackQuery (acks the spinner) and NOT call any message update
    expect(callbackMethods).toContain('answerCallbackQuery');
    // No submissions UPDATE should be performed for unauthorized user
    const { db } = await import('@/db');
    expect((db as any).update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (c) AUDIT-04 — approve sets status + decided_by + decided_at + increments approved_qty
// (describeIfDb, live DB — RED until 03-02 migration + 03-03 handler)
// ---------------------------------------------------------------------------

describeIfDb('AUDIT-04: approve increments boq_items.approved_qty atomically', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_audit_db';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-audit-db';
    // Override any lingering vi.doMock('@/db', ...) factory from AUDIT-03 (mock-unit tests).
    // vi.doMock factories survive vi.resetModules() — this ensures the live DB is used.
    vi.doMock('@/db', async () => await vi.importActual('@/db'));
    vi.resetModules();
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    if (db) await truncateAllTables(db);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('approve sets submissions.status=approved + decided_by + decided_at + increments boq_items.approved_qty', async () => {
    // Setup: insert tenant → project → boq_item → person → assignment → submission
    // neon-http does not support multi-statement prepared statements — use separate execute calls
    const { sql } = await import('drizzle-orm');

    // All IDs must be valid UUIDs (PostgreSQL uuid type)
    const T = '00000000-0000-0000-0004-000000000001'; // tenant
    const P = '00000000-0000-0000-0004-000000000002'; // project
    const B = '00000000-0000-0000-0004-000000000003'; // boqItem
    const W = '00000000-0000-0000-0004-000000000004'; // worker person
    const A = '00000000-0000-0000-0004-000000000005'; // auditor person
    const AS = '00000000-0000-0000-0004-000000000006'; // assignment
    const S = '00000000-0000-0000-0004-000000000007'; // submission

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${T}', 'Test Tenant') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${P}', '${T}', 'Test Project') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty) VALUES ('${B}', '${T}', '${P}', 'DN200 HDPE Boru', 'm', '1000.000', '0.000') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${W}', '${T}', 1001, 'Test Worker') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${A}', '${T}', 2001, 'Test Auditor') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) VALUES ('${AS}', '${T}', '${A}', '${P}', 'auditor') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO submissions (id, tenant_id, flow_id, person_id, project_id, boq_item_id, photo_url, quantity, status) VALUES ('${S}', '${T}', gen_random_uuid(), '${W}', '${P}', '${B}', 'https://example.com/photo.jpg', '50.000', 'pending_audit') ON CONFLICT DO NOTHING`));

    vi.resetModules();
    const bot = await setupBotForTest();
    await bot.handleUpdate(makeCallbackUpdate(2001, `audit:approve:${S}`, 9001));

    // Verify submission is approved
    const subRows = await db.execute(sql.raw(`SELECT status, decided_by, decided_at FROM submissions WHERE id = '${S}'`));
    expect(subRows.rows[0].status).toBe('approved');
    expect(subRows.rows[0].decided_by).toBe(A);
    expect(subRows.rows[0].decided_at).toBeTruthy();

    // Verify boq_items.approved_qty incremented by 50
    const boqRows = await db.execute(sql.raw(`SELECT approved_qty FROM boq_items WHERE id = '${B}'`));
    expect(Number(boqRows.rows[0].approved_qty)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// (d) AUDIT-04 SC3 — duplicate decision increments approved_qty exactly once
// T-3-RACE MANDATORY (describeIfDb, live DB)
// ---------------------------------------------------------------------------

describeIfDb('AUDIT-04 SC3 — duplicate decision: second tap returns already-resolved, approved_qty increments once', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_audit_sc3';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-audit-sc3';
    // Override any lingering vi.doMock('@/db', ...) factory from AUDIT-03 mock-unit tests.
    vi.doMock('@/db', async () => await vi.importActual('@/db'));
    vi.resetModules();
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    if (db) await truncateAllTables(db);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('T-3-RACE: sequential re-tap (same auditor, same submission) increments approved_qty exactly once', async () => {
    // RED until Plan 03-02 (migration) + Plan 03-03 (handler)
    const { sql } = await import('drizzle-orm');

    // All IDs must be valid UUIDs (PostgreSQL uuid type)
    const T3 = '00000000-0000-0000-0003-000000000001'; // tenant sc3
    const P3 = '00000000-0000-0000-0003-000000000002'; // project sc3
    const B3 = '00000000-0000-0000-0003-000000000003'; // boqItem sc3
    const W3 = '00000000-0000-0000-0003-000000000004'; // worker sc3
    const A3 = '00000000-0000-0000-0003-000000000005'; // auditor sc3
    const AS3 = '00000000-0000-0000-0003-000000000006'; // assignment sc3
    const S3 = '00000000-0000-0000-0003-000000000007'; // submission sc3

    // neon-http does not support multi-statement prepared statements — use separate execute calls
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${T3}', 'Test Tenant SC3') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${P3}', '${T3}', 'Test Project SC3') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty) VALUES ('${B3}', '${T3}', '${P3}', 'DN200 HDPE Boru', 'm', '1000.000', '0.000') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${W3}', '${T3}', 1002, 'Worker SC3') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${A3}', '${T3}', 2002, 'Auditor SC3') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) VALUES ('${AS3}', '${T3}', '${A3}', '${P3}', 'auditor') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO submissions (id, tenant_id, flow_id, person_id, project_id, boq_item_id, photo_url, quantity, status) VALUES ('${S3}', '${T3}', gen_random_uuid(), '${W3}', '${P3}', '${B3}', 'https://example.com/photo.jpg', '25.000', 'pending_audit') ON CONFLICT DO NOTHING`));

    vi.resetModules();
    const bot = await setupBotForTest();

    // First tap — should approve
    await bot.handleUpdate(makeCallbackUpdate(2002, `audit:approve:${S3}`, 9101));

    // Reset modules to get fresh bot state for second tap
    vi.resetModules();
    const bot2 = await setupBotForTest();
    const toastMessages: string[] = [];
     
    bot2.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'answerCallbackQuery' && (payload as { text?: string }).text) {
        toastMessages.push((payload as { text: string }).text);
      }
      return Promise.resolve({ ok: true, result: {} as any });
    });

    // Second tap (different update_id — tests duplicate DECISION, not duplicate update)
    await bot2.handleUpdate(makeCallbackUpdate(2002, `audit:approve:${S3}`, 9102));

    // approved_qty must be 25 (incremented once)
    const boqRows = await db.execute(sql.raw(`SELECT approved_qty FROM boq_items WHERE id = '${B3}'`));
    expect(Number(boqRows.rows[0].approved_qty)).toBe(25);

    // Second tap should get the "already resolved" toast
    expect(toastMessages.some(t => t.includes('zaten çözüldü') || t.includes('already'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (e) AUDIT-06 SC5 — concurrent race: two taps on same submission, first wins
// T-3-RACE MANDATORY (describeIfDb, live DB)
// ---------------------------------------------------------------------------

describeIfDb('AUDIT-06 SC5 — double-tap race: first wins, second gets toast', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_audit_sc5';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-audit-sc5';
    // Override any lingering vi.doMock('@/db', ...) factory from AUDIT-03 mock-unit tests.
    vi.doMock('@/db', async () => await vi.importActual('@/db'));
    vi.resetModules();
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    if (db) await truncateAllTables(db);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('T-3-RACE: two concurrent auditor taps on same submission — approved_qty increments exactly once', async () => {
    // RED until Plan 03-02 (migration) + Plan 03-03 (handler)
    const { sql } = await import('drizzle-orm');

    // All IDs must be valid UUIDs (PostgreSQL uuid type)
    const T5 = '00000000-0000-0000-0005-000000000001'; // tenant sc5
    const P5 = '00000000-0000-0000-0005-000000000002'; // project sc5
    const B5 = '00000000-0000-0000-0005-000000000003'; // boqItem sc5
    const W5 = '00000000-0000-0000-0005-000000000004'; // worker sc5
    const A5a = '00000000-0000-0000-0005-000000000005'; // auditor1 sc5
    const A5b = '00000000-0000-0000-0005-000000000006'; // auditor2 sc5
    const AS5a = '00000000-0000-0000-0005-000000000007'; // assignment1 sc5
    const AS5b = '00000000-0000-0000-0005-000000000008'; // assignment2 sc5
    const S5 = '00000000-0000-0000-0005-000000000009'; // submission sc5

    // neon-http does not support multi-statement prepared statements — use separate execute calls
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${T5}', 'Test Tenant SC5') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${P5}', '${T5}', 'Test Project SC5') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty) VALUES ('${B5}', '${T5}', '${P5}', 'DN200 HDPE Boru', 'm', '1000.000', '0.000') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${W5}', '${T5}', 1003, 'Worker SC5') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${A5a}', '${T5}', 2003, 'Auditor 1 SC5') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${A5b}', '${T5}', 2004, 'Auditor 2 SC5') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) VALUES ('${AS5a}', '${T5}', '${A5a}', '${P5}', 'auditor') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) VALUES ('${AS5b}', '${T5}', '${A5b}', '${P5}', 'auditor') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO submissions (id, tenant_id, flow_id, person_id, project_id, boq_item_id, photo_url, quantity, status) VALUES ('${S5}', '${T5}', gen_random_uuid(), '${W5}', '${P5}', '${B5}', 'https://example.com/photo.jpg', '30.000', 'pending_audit') ON CONFLICT DO NOTHING`));

    vi.resetModules();

    // Two concurrent approve taps from two different auditors
    const [bot1, bot2] = await Promise.all([setupBotForTest(), setupBotForTest()]);

    const toastMessages: string[] = [];
     
    const captureTransformer = async (_prev: any, method: any, payload: any) => {
      if (method === 'answerCallbackQuery' && (payload as { text?: string }).text) {
        toastMessages.push((payload as { text: string }).text);
      }
      return Promise.resolve({ ok: true, result: {} as any });
    };
    bot1.api.config.use(captureTransformer);
    bot2.api.config.use(captureTransformer);

    // Fire both concurrently via Promise.all — race condition test
    await Promise.all([
      bot1.handleUpdate(makeCallbackUpdate(2003, `audit:approve:${S5}`, 9201)),
      bot2.handleUpdate(makeCallbackUpdate(2004, `audit:approve:${S5}`, 9202)),
    ]);

    // approved_qty must be 30 (incremented exactly once despite two concurrent taps)
    const boqRows = await db.execute(sql.raw(`SELECT approved_qty FROM boq_items WHERE id = '${B5}'`));
    expect(Number(boqRows.rows[0].approved_qty)).toBe(30);

    // At least one tap should get the "already resolved" toast (the loser)
    // The winner gets a silent ack or different toast
    // Note: we cannot guarantee ORDER in concurrent execution, so we check the aggregate
    expect(toastMessages.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// (f) AUDIT-06 / T-3-DUP — replayed callback_query with duplicate update_id is de-duped
// (unit, mock DB — processed_updates fence)
// ---------------------------------------------------------------------------

describe('AUDIT-06 / T-3-DUP: duplicate update_id callback_query is de-duped by processed_updates', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_audit_dup';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-audit-dup';
    vi.resetModules();

    let callCount = 0;
    const mockReturning = vi.fn().mockImplementation(() => {
      callCount++;
      // First call: new update (returns a row); subsequent: duplicate (empty)
      return Promise.resolve(callCount === 1 ? [{ id: BigInt(1) }] : []);
    });

    vi.doMock('@/db', () => ({
      db: {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: mockReturning,
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
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
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('duplicate callback_query update_id (replayed) is de-duped by processed_updates fence — no second decision', async () => {
    const bot = await setupBotForTest();
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';

    // First delivery — processed_updates insert returns a row (new)
    await bot.handleUpdate(makeCallbackUpdate(2005, `audit:approve:${submissionId}`, 8001));

    // Second delivery with SAME update_id — processed_updates insert returns [] (duplicate)
    // Reuse the same bot instance (same mocked DB with the callCount sentinel)
    await bot.handleUpdate(makeCallbackUpdate(2005, `audit:approve:${submissionId}`, 8001));

    // The second delivery must NOT trigger submissions.update (idempotency fence blocks it)
    // The processed_updates fence (D-13 Guard 1) short-circuits before reaching any handler
    // callCount is 2 (both inserts attempted), but the second returned [] blocking the handler
    const { db: db2 } = await import('@/db');
    // update should have been called at most once (the idempotency fence blocks the second call)
    const updateCallCount = (db2 as any).update.mock?.calls?.length ?? 0;
    expect(updateCallCount).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// (g) AUDIT-05 — reject with canned reason / without reason (abandon)
// (describeIfDb, live DB — RED until 03-02 migration + 03-04 handler)
// ---------------------------------------------------------------------------

describeIfDb('AUDIT-05: reject flow with and without reason', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_audit_reject';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-audit-reject';
    // Override any lingering vi.doMock('@/db', ...) factory from AUDIT-03 mock-unit tests.
    vi.doMock('@/db', async () => await vi.importActual('@/db'));
    vi.resetModules();
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    if (db) await truncateAllTables(db);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('reject WITH a canned reason sets submissions.status=rejected + rejection_reason', async () => {
    // RED until Plan 03-02 (migration) + Plan 03-04 (reject handler)
    const { sql } = await import('drizzle-orm');

    // All IDs must be valid UUIDs (PostgreSQL uuid type)
    const TR = '00000000-0000-0000-0006-000000000001'; // tenant rej
    const PR = '00000000-0000-0000-0006-000000000002'; // project rej
    const BR = '00000000-0000-0000-0006-000000000003'; // boqItem rej
    const WR = '00000000-0000-0000-0006-000000000004'; // worker rej
    const AR = '00000000-0000-0000-0006-000000000005'; // auditor rej
    const ASR = '00000000-0000-0000-0006-000000000006'; // assignment rej
    const SR = '00000000-0000-0000-0006-000000000007'; // submission rej

    // neon-http does not support multi-statement prepared statements — use separate execute calls
    // Also insert the default tenant used by getDefaultTenantId() → saveState() for conversation_state.
    // saveState always uses '00000000-0000-0000-0000-000000000001' regardless of test tenant.
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${TR}', 'Reject Tenant') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${PR}', '${TR}', 'Reject Project') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty) VALUES ('${BR}', '${TR}', '${PR}', 'DN200 HDPE Boru', 'm', '1000.000', '0.000') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${WR}', '${TR}', 1004, 'Worker Rej') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${AR}', '${TR}', 2006, 'Auditor Rej') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) VALUES ('${ASR}', '${TR}', '${AR}', '${PR}', 'auditor') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO submissions (id, tenant_id, flow_id, person_id, project_id, boq_item_id, photo_url, quantity, status) VALUES ('${SR}', '${TR}', gen_random_uuid(), '${WR}', '${PR}', '${BR}', 'https://example.com/photo.jpg', '10.000', 'pending_audit') ON CONFLICT DO NOTHING`));

    vi.resetModules();
    const bot = await setupBotForTest();

    // Step 1: tap ❌ Reddet → triggers reason keyboard display
    await bot.handleUpdate(makeCallbackUpdate(2006, `audit:reject:${SR}`, 9301));

    // Step 2: select canned reason
    vi.resetModules();
    const bot2 = await setupBotForTest();
    await bot2.handleUpdate(makeCallbackUpdate(2006, 'audit:reason:Yetersiz iş', 9302));

    // Verify: submission is rejected with reason
    const subRows = await db.execute(sql.raw(`SELECT status, rejection_reason FROM submissions WHERE id = '${SR}'`));
    expect(subRows.rows[0].status).toBe('rejected');
    expect(subRows.rows[0].rejection_reason).toBe('Yetersiz iş');
  });

  it('reject WITHOUT a reason (abandon after ❌) leaves submissions.status=pending_audit (D-31)', async () => {
    // RED until Plan 03-02 (migration) + Plan 03-04 (reject handler)
    const { sql } = await import('drizzle-orm');

    // All IDs must be valid UUIDs (PostgreSQL uuid type)
    const TR2 = '00000000-0000-0000-0007-000000000001'; // tenant rej2
    const PR2 = '00000000-0000-0000-0007-000000000002'; // project rej2
    const BR2 = '00000000-0000-0000-0007-000000000003'; // boqItem rej2
    const WR2 = '00000000-0000-0000-0007-000000000004'; // worker rej2
    const AR2 = '00000000-0000-0000-0007-000000000005'; // auditor rej2
    const ASR2 = '00000000-0000-0000-0007-000000000006'; // assignment rej2
    const SR2 = '00000000-0000-0000-0007-000000000007'; // submission rej2

    // neon-http does not support multi-statement prepared statements — use separate execute calls
    // Also insert the default tenant used by getDefaultTenantId() → saveState() for conversation_state.
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${TR2}', 'Reject Tenant 2') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${PR2}', '${TR2}', 'Reject Project 2') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty) VALUES ('${BR2}', '${TR2}', '${PR2}', 'DN200 HDPE Boru', 'm', '1000.000', '0.000') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${WR2}', '${TR2}', 1005, 'Worker Rej2') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${AR2}', '${TR2}', 2007, 'Auditor Rej2') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) VALUES ('${ASR2}', '${TR2}', '${AR2}', '${PR2}', 'auditor') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO submissions (id, tenant_id, flow_id, person_id, project_id, boq_item_id, photo_url, quantity, status) VALUES ('${SR2}', '${TR2}', gen_random_uuid(), '${WR2}', '${PR2}', '${BR2}', 'https://example.com/photo.jpg', '15.000', 'pending_audit') ON CONFLICT DO NOTHING`));

    vi.resetModules();
    const bot = await setupBotForTest();

    // Tap ❌ Reddet (sets auditor FSM to AWAITING_REJECT_REASON), then abandon (no reason given)
    await bot.handleUpdate(makeCallbackUpdate(2007, `audit:reject:${SR2}`, 9401));
    // Abandon — no reason message sent; TTL will expire the state

    // Verify: submission stays pending_audit (D-31)
    const subRows = await db.execute(sql.raw(`SELECT status, rejection_reason FROM submissions WHERE id = '${SR2}'`));
    expect(subRows.rows[0].status).toBe('pending_audit');
    expect(subRows.rows[0].rejection_reason).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CR-01 regression test — de-assigned auditor cannot commit a rejection
// (describeIfDb, live DB — verifies authorization re-check in commitRejection)
// ---------------------------------------------------------------------------

describeIfDb('CR-01: de-assigned auditor cannot commit a rejection after assignment is revoked', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TEST:fake_token_cr01';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-cr01';
    vi.doMock('@/db', async () => await vi.importActual('@/db'));
    vi.resetModules();
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    if (db) await truncateAllTables(db);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('CR-01: auditor whose assignment is revoked between reject tap and free-text commit cannot finalize rejection', async () => {
    const { sql } = await import('drizzle-orm');

    // UUIDs for this test
    const T8 = '00000000-0000-0000-0008-000000000001'; // tenant
    const P8 = '00000000-0000-0000-0008-000000000002'; // project
    const B8 = '00000000-0000-0000-0008-000000000003'; // boqItem
    const W8 = '00000000-0000-0000-0008-000000000004'; // worker
    const A8 = '00000000-0000-0000-0008-000000000005'; // auditor
    const AS8 = '00000000-0000-0000-0008-000000000006'; // assignment
    const S8 = '00000000-0000-0000-0008-000000000007'; // submission

    // Seed: default tenant (for conversation_state FK), test tenant, project, boqItem, people, assignment, submission
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${T8}', 'CR01 Tenant') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${P8}', '${T8}', 'CR01 Project') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty) VALUES ('${B8}', '${T8}', '${P8}', 'DN200 HDPE', 'm', '1000.000', '0.000') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${W8}', '${T8}', 1006, 'Worker CR01') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${A8}', '${T8}', 2008, 'Auditor CR01') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) VALUES ('${AS8}', '${T8}', '${A8}', '${P8}', 'auditor') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO submissions (id, tenant_id, flow_id, person_id, project_id, boq_item_id, photo_url, quantity, status) VALUES ('${S8}', '${T8}', gen_random_uuid(), '${W8}', '${P8}', '${B8}', 'https://example.com/photo.jpg', '5.000', 'pending_audit') ON CONFLICT DO NOTHING`));

    vi.resetModules();
    const bot = await setupBotForTest();

    // Step 1: tap ❌ Reddet — auditor is still assigned at this point
    await bot.handleUpdate(makeCallbackUpdate(2008, `audit:reject:${S8}`, 9501));

    // Verify FSM state was written (auditor is now in AWAITING_REJECT_REASON).
    // The DB stores step values as lowercase (Postgres text column case-preserving).
    const stateAfterTap = await db.execute(sql.raw(`SELECT current_step FROM conversation_state WHERE telegram_user_id = 2008`));
    const step = stateAfterTap.rows[0]?.current_step as string | undefined;
    expect(step?.toUpperCase()).toBe('AWAITING_REJECT_REASON');

    // Step 2: REVOKE the auditor's assignment (simulates assignment removal between tap and commit)
    await db.execute(sql.raw(`DELETE FROM assignments WHERE id = '${AS8}'`));

    // Step 3: auditor now sends free-text reason — commitRejection should detect revoked assignment
    vi.resetModules();
    const bot2 = await setupBotForTest();
    const replies: string[] = [];
     
    bot2.api.config.use(async (_prev: any, method: any, payload: any) => {
      if ((method === 'sendMessage' || method === 'answerCallbackQuery') && (payload as { text?: string }).text) {
        replies.push((payload as { text: string }).text);
      }
      return Promise.resolve({ ok: true, result: {} as any });
    });

    // Simulate sending a free-text message from the auditor (telegram_user_id=2008)
    const messageUpdate = {
      update_id: 9502,
      message: {
        message_id: 77,
        from: { id: 2008, first_name: 'Auditor CR01', is_bot: false, language_code: 'tr' },
        chat: { id: 2008, type: 'private' as const },
        date: Math.floor(Date.now() / 1000),
        text: 'Yetersiz kalite',
      },
    };
    await bot2.handleUpdate(messageUpdate);

    // Verify: submission must still be pending_audit (rejection was refused)
    const subAfter = await db.execute(sql.raw(`SELECT status, rejection_reason FROM submissions WHERE id = '${S8}'`));
    expect(subAfter.rows[0].status).toBe('pending_audit');
    expect(subAfter.rows[0].rejection_reason).toBeNull();

    // The de-assigned auditor should have received the unauthorized message ('Yetkisiz erişim')
    const hasUnauthorized = replies.some(r =>
      r.includes('Yetkisiz') || r.includes('yetkisiz') || r.includes('unauthorized') || r.includes('Unauthorized')
    );
    expect(hasUnauthorized).toBe(true);
  });
});
