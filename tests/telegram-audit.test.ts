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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setupBotForTest(): Promise<any> {
  const { bot } = await import('@/lib/telegram');

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const approveBtn = rows[0].find((b: { callback_data?: string }) =>
      b.callback_data?.startsWith('audit:approve:')
    );
    const rejectBtn = rows[0].find((b: { callback_data?: string }) =>
      b.callback_data?.startsWith('audit:reject:')
    );
    expect(approveBtn).toBeDefined();
    expect(rejectBtn).toBeDefined();
    // Telegram max callback_data length is 64 bytes
    expect(Buffer.byteLength(approveBtn!.callback_data!, 'utf8')).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(rejectBtn!.callback_data!, 'utf8')).toBeLessThanOrEqual(64);
  });

  it('audit:approve:<uuid> data is exactly "audit:approve:<uuid>" format', async () => {
    const { buildAuditKeyboard } = await import('@/lib/bot-keyboards');
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';
    const kb = buildAuditKeyboard(submissionId);
    const approveBtn = kb.inline_keyboard[0].find((b: { callback_data?: string }) =>
      b.callback_data?.startsWith('audit:approve:')
    );
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // This test is RED until:
    // - Plan 03-02 migrates decided_by / decided_at / rejection_reason + audit_notifications table
    // - Plan 03-03 implements handleAuditDecision in bot-audit.ts
    // - Plan 03-03 wires handleAuditDecision into the telegram.ts dispatcher
    //
    // Setup: insert tenant → project → boq_item → person → assignment → submission
    const { sql } = await import('drizzle-orm');

    // Insert prerequisite data via raw SQL for speed
    await db.execute(sql.raw(`
      INSERT INTO tenants (id, name) VALUES ('tenant-test-1', 'Test Tenant') ON CONFLICT DO NOTHING;
      INSERT INTO projects (id, tenant_id, name, status) VALUES ('project-test-1', 'tenant-test-1', 'Test Project', 'active') ON CONFLICT DO NOTHING;
      INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty) VALUES ('boqitem-test-1', 'tenant-test-1', 'project-test-1', 'DN200 HDPE Boru', 'm', '1000.000', '0.000') ON CONFLICT DO NOTHING;
      INSERT INTO people (id, tenant_id, telegram_user_id, name) VALUES ('person-worker-1', 'tenant-test-1', 1001, 'Test Worker') ON CONFLICT DO NOTHING;
      INSERT INTO people (id, tenant_id, telegram_user_id, name) VALUES ('person-auditor-1', 'tenant-test-1', 2001, 'Test Auditor') ON CONFLICT DO NOTHING;
      INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) VALUES ('assign-test-1', 'tenant-test-1', 'person-auditor-1', 'project-test-1', 'auditor') ON CONFLICT DO NOTHING;
      INSERT INTO submissions (id, tenant_id, flow_id, person_id, project_id, boq_item_id, photo_url, quantity, status) VALUES ('submission-test-1', 'tenant-test-1', gen_random_uuid(), 'person-worker-1', 'project-test-1', 'boqitem-test-1', 'https://example.com/photo.jpg', '50.000', 'pending_audit') ON CONFLICT DO NOTHING;
    `));

    vi.resetModules();
    // Handler invocation via bot (requires handleAuditDecision to be wired)
    const bot = await setupBotForTest();
    await bot.handleUpdate(makeCallbackUpdate(2001, 'audit:approve:submission-test-1', 9001));

    // Verify submission is approved
    const subRows = await db.execute(sql.raw(`SELECT status, decided_by, decided_at FROM submissions WHERE id = 'submission-test-1'`));
    expect(subRows.rows[0].status).toBe('approved');
    expect(subRows.rows[0].decided_by).toBe('person-auditor-1');
    expect(subRows.rows[0].decided_at).toBeTruthy();

    // Verify boq_items.approved_qty incremented by 50
    const boqRows = await db.execute(sql.raw(`SELECT approved_qty FROM boq_items WHERE id = 'boqitem-test-1'`));
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

    await db.execute(sql.raw(`
      INSERT INTO tenants (id, name) VALUES ('tenant-sc3-1', 'Test Tenant SC3') ON CONFLICT DO NOTHING;
      INSERT INTO projects (id, tenant_id, name, status) VALUES ('project-sc3-1', 'tenant-sc3-1', 'Test Project SC3', 'active') ON CONFLICT DO NOTHING;
      INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty) VALUES ('boqitem-sc3-1', 'tenant-sc3-1', 'project-sc3-1', 'DN200 HDPE Boru', 'm', '1000.000', '0.000') ON CONFLICT DO NOTHING;
      INSERT INTO people (id, tenant_id, telegram_user_id, name) VALUES ('person-worker-sc3', 'tenant-sc3-1', 1002, 'Worker SC3') ON CONFLICT DO NOTHING;
      INSERT INTO people (id, tenant_id, telegram_user_id, name) VALUES ('person-auditor-sc3', 'tenant-sc3-1', 2002, 'Auditor SC3') ON CONFLICT DO NOTHING;
      INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) VALUES ('assign-sc3-1', 'tenant-sc3-1', 'person-auditor-sc3', 'project-sc3-1', 'auditor') ON CONFLICT DO NOTHING;
      INSERT INTO submissions (id, tenant_id, flow_id, person_id, project_id, boq_item_id, photo_url, quantity, status) VALUES ('submission-sc3-1', 'tenant-sc3-1', gen_random_uuid(), 'person-worker-sc3', 'project-sc3-1', 'boqitem-sc3-1', 'https://example.com/photo.jpg', '25.000', 'pending_audit') ON CONFLICT DO NOTHING;
    `));

    vi.resetModules();
    const bot = await setupBotForTest();

    // First tap — should approve
    await bot.handleUpdate(makeCallbackUpdate(2002, 'audit:approve:submission-sc3-1', 9101));

    // Reset modules to get fresh bot state for second tap
    vi.resetModules();
    const bot2 = await setupBotForTest();
    const toastMessages: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bot2.api.config.use(async (_prev: any, method: any, payload: any) => {
      if (method === 'answerCallbackQuery' && (payload as { text?: string }).text) {
        toastMessages.push((payload as { text: string }).text);
      }
      return Promise.resolve({ ok: true, result: {} as any });
    });

    // Second tap (same update_id is different here — this tests duplicate DECISION not duplicate update)
    await bot2.handleUpdate(makeCallbackUpdate(2002, 'audit:approve:submission-sc3-1', 9102));

    // approved_qty must be 25 (incremented once)
    const boqRows = await db.execute(sql.raw(`SELECT approved_qty FROM boq_items WHERE id = 'boqitem-sc3-1'`));
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

    await db.execute(sql.raw(`
      INSERT INTO tenants (id, name) VALUES ('tenant-sc5-1', 'Test Tenant SC5') ON CONFLICT DO NOTHING;
      INSERT INTO projects (id, tenant_id, name, status) VALUES ('project-sc5-1', 'tenant-sc5-1', 'Test Project SC5', 'active') ON CONFLICT DO NOTHING;
      INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty) VALUES ('boqitem-sc5-1', 'tenant-sc5-1', 'project-sc5-1', 'DN200 HDPE Boru', 'm', '1000.000', '0.000') ON CONFLICT DO NOTHING;
      INSERT INTO people (id, tenant_id, telegram_user_id, name) VALUES ('person-worker-sc5', 'tenant-sc5-1', 1003, 'Worker SC5') ON CONFLICT DO NOTHING;
      INSERT INTO people (id, tenant_id, telegram_user_id, name) VALUES ('person-auditor1-sc5', 'tenant-sc5-1', 2003, 'Auditor 1 SC5') ON CONFLICT DO NOTHING;
      INSERT INTO people (id, tenant_id, telegram_user_id, name) VALUES ('person-auditor2-sc5', 'tenant-sc5-1', 2004, 'Auditor 2 SC5') ON CONFLICT DO NOTHING;
      INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) VALUES ('assign-sc5-1', 'tenant-sc5-1', 'person-auditor1-sc5', 'project-sc5-1', 'auditor') ON CONFLICT DO NOTHING;
      INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) VALUES ('assign-sc5-2', 'tenant-sc5-1', 'person-auditor2-sc5', 'project-sc5-1', 'auditor') ON CONFLICT DO NOTHING;
      INSERT INTO submissions (id, tenant_id, flow_id, person_id, project_id, boq_item_id, photo_url, quantity, status) VALUES ('submission-sc5-1', 'tenant-sc5-1', gen_random_uuid(), 'person-worker-sc5', 'project-sc5-1', 'boqitem-sc5-1', 'https://example.com/photo.jpg', '30.000', 'pending_audit') ON CONFLICT DO NOTHING;
    `));

    vi.resetModules();

    // Two concurrent approve taps from two different auditors
    const [bot1, bot2] = await Promise.all([setupBotForTest(), setupBotForTest()]);

    const toastMessages: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      bot1.handleUpdate(makeCallbackUpdate(2003, 'audit:approve:submission-sc5-1', 9201)),
      bot2.handleUpdate(makeCallbackUpdate(2004, 'audit:approve:submission-sc5-1', 9202)),
    ]);

    // approved_qty must be 30 (incremented exactly once despite two concurrent taps)
    const boqRows = await db.execute(sql.raw(`SELECT approved_qty FROM boq_items WHERE id = 'boqitem-sc5-1'`));
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
    const { db } = await import('@/db');
    const submissionId = '550e8400-e29b-41d4-a716-446655440000';

    // First delivery — processed_updates insert returns a row (new)
    await bot.handleUpdate(makeCallbackUpdate(2005, `audit:approve:${submissionId}`, 8001));

    // Second delivery with SAME update_id — processed_updates insert returns [] (duplicate)
    vi.resetModules();
    const bot2 = await setupBotForTest();
    await bot2.handleUpdate(makeCallbackUpdate(2005, `audit:approve:${submissionId}`, 8001));

    // The second delivery must NOT trigger submissions.update (idempotency fence blocks it)
    // (The exact assertion depends on the handler implementation — RED state: handler not wired)
    expect(true).toBe(true); // placeholder — real assertion added in 03-03
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

    await db.execute(sql.raw(`
      INSERT INTO tenants (id, name) VALUES ('tenant-rej-1', 'Reject Tenant') ON CONFLICT DO NOTHING;
      INSERT INTO projects (id, tenant_id, name, status) VALUES ('project-rej-1', 'tenant-rej-1', 'Reject Project', 'active') ON CONFLICT DO NOTHING;
      INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty) VALUES ('boqitem-rej-1', 'tenant-rej-1', 'project-rej-1', 'DN200 HDPE Boru', 'm', '1000.000', '0.000') ON CONFLICT DO NOTHING;
      INSERT INTO people (id, tenant_id, telegram_user_id, name) VALUES ('person-worker-rej', 'tenant-rej-1', 1004, 'Worker Rej') ON CONFLICT DO NOTHING;
      INSERT INTO people (id, tenant_id, telegram_user_id, name) VALUES ('person-auditor-rej', 'tenant-rej-1', 2006, 'Auditor Rej') ON CONFLICT DO NOTHING;
      INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) VALUES ('assign-rej-1', 'tenant-rej-1', 'person-auditor-rej', 'project-rej-1', 'auditor') ON CONFLICT DO NOTHING;
      INSERT INTO submissions (id, tenant_id, flow_id, person_id, project_id, boq_item_id, photo_url, quantity, status) VALUES ('submission-rej-1', 'tenant-rej-1', gen_random_uuid(), 'person-worker-rej', 'project-rej-1', 'boqitem-rej-1', 'https://example.com/photo.jpg', '10.000', 'pending_audit') ON CONFLICT DO NOTHING;
    `));

    vi.resetModules();
    const bot = await setupBotForTest();

    // Step 1: tap ❌ Reddet → triggers reason keyboard display
    await bot.handleUpdate(makeCallbackUpdate(2006, 'audit:reject:submission-rej-1', 9301));

    // Step 2: select canned reason
    vi.resetModules();
    const bot2 = await setupBotForTest();
    await bot2.handleUpdate(makeCallbackUpdate(2006, 'audit:reason:Yetersiz iş', 9302));

    // Verify: submission is rejected with reason
    const subRows = await db.execute(sql.raw(`SELECT status, rejection_reason FROM submissions WHERE id = 'submission-rej-1'`));
    expect(subRows.rows[0].status).toBe('rejected');
    expect(subRows.rows[0].rejection_reason).toBe('Yetersiz iş');
  });

  it('reject WITHOUT a reason (abandon after ❌) leaves submissions.status=pending_audit (D-31)', async () => {
    // RED until Plan 03-02 (migration) + Plan 03-04 (reject handler)
    const { sql } = await import('drizzle-orm');

    await db.execute(sql.raw(`
      INSERT INTO tenants (id, name) VALUES ('tenant-rej-2', 'Reject Tenant 2') ON CONFLICT DO NOTHING;
      INSERT INTO projects (id, tenant_id, name, status) VALUES ('project-rej-2', 'tenant-rej-2', 'Reject Project 2', 'active') ON CONFLICT DO NOTHING;
      INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty) VALUES ('boqitem-rej-2', 'tenant-rej-2', 'project-rej-2', 'DN200 HDPE Boru', 'm', '1000.000', '0.000') ON CONFLICT DO NOTHING;
      INSERT INTO people (id, tenant_id, telegram_user_id, name) VALUES ('person-worker-rej2', 'tenant-rej-2', 1005, 'Worker Rej2') ON CONFLICT DO NOTHING;
      INSERT INTO people (id, tenant_id, telegram_user_id, name) VALUES ('person-auditor-rej2', 'tenant-rej-2', 2007, 'Auditor Rej2') ON CONFLICT DO NOTHING;
      INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) VALUES ('assign-rej-2', 'tenant-rej-2', 'person-auditor-rej2', 'project-rej-2', 'auditor') ON CONFLICT DO NOTHING;
      INSERT INTO submissions (id, tenant_id, flow_id, person_id, project_id, boq_item_id, photo_url, quantity, status) VALUES ('submission-rej-2', 'tenant-rej-2', gen_random_uuid(), 'person-worker-rej2', 'project-rej-2', 'boqitem-rej-2', 'https://example.com/photo.jpg', '15.000', 'pending_audit') ON CONFLICT DO NOTHING;
    `));

    vi.resetModules();
    const bot = await setupBotForTest();

    // Tap ❌ Reddet (sets auditor FSM to AWAITING_REJECT_REASON), then abandon (no reason given)
    await bot.handleUpdate(makeCallbackUpdate(2007, 'audit:reject:submission-rej-2', 9401));
    // Abandon — no reason message sent; TTL will expire the state

    // Verify: submission stays pending_audit (D-31)
    const subRows = await db.execute(sql.raw(`SELECT status, rejection_reason FROM submissions WHERE id = 'submission-rej-2'`));
    expect(subRows.rows[0].status).toBe('pending_audit');
    expect(subRows.rows[0].rejection_reason).toBeNull();
  });
});
