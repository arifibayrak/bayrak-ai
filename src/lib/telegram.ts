/**
 * src/lib/telegram.ts
 *
 * PHASE 2: Full worker-bot pipeline scaffold.
 *
 * Architecture (D-12 DB-row FSM):
 *   Every update flows through:
 *     1. Idempotency middleware (D-13 Guard 1) — fences duplicate update_ids
 *     2. /start handler — greet registered workers, offer Devam/Baştan mid-flow (D-15)
 *     3. /iptal handler — cancel at any step (D-17)
 *     4. FSM dispatcher — loads conversation_state, enforces TTL (D-22), reprompts step (D-14/SC5)
 *
 * Security (T-04-03):
 *   TELEGRAM_BOT_TOKEN is read from env only; never logged.
 *   Module throws at load time if token is unset so a misconfigured deploy fails fast.
 *
 * LAZY IMPORT DISCIPLINE:
 *   Never import @/db or schema at the top level — neon() at module load breaks builds
 *   and unit tests that run without DATABASE_URL.
 *   ALL DB access must be done with `await import('@/db')` inside handler bodies.
 */

import { Bot, InlineKeyboard } from 'grammy';
import { getDefaultTenantId } from '@/lib/tenant';

// ---------------------------------------------------------------------------
// Bot instance
// ---------------------------------------------------------------------------

// The token is validated at REQUEST time in the webhook route handler, NOT here.
// Next.js imports route modules during `next build` with no runtime env present —
// a module-load throw would break the build. When the token is absent we construct
// a non-functional placeholder bot; the route handler fails fast on a real request.
const token = process.env.TELEGRAM_BOT_TOKEN;
export const bot = new Bot(token || '0:TELEGRAM_BOT_TOKEN_NOT_CONFIGURED');

// ---------------------------------------------------------------------------
// Middleware 1: Idempotency fence (D-13 Guard 1, T-02-02)
//
// Registered FIRST so no handler can run on a replayed update.
// INSERT INTO processed_updates ON CONFLICT DO NOTHING.
// If the returned array is empty → already processed → skip all handlers.
// ---------------------------------------------------------------------------

bot.use(async (ctx, next) => {
  const updateId = ctx.update.update_id;

  // Lazy imports — must NOT be at top level (lazy import discipline)
  const { db } = await import('@/db');
  const { processedUpdates } = await import('@/db/schema/processed-updates');

  const inserted = await db
    .insert(processedUpdates)
    .values({ updateId: BigInt(updateId), processedAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: processedUpdates.updateId });

  if (inserted.length === 0) {
    // Already processed — acknowledge Telegram with 200 (grammY handles response)
    // but do NOT invoke any downstream handlers.
    return;
  }

  await next();
});

// ---------------------------------------------------------------------------
// Worker identity resolution helper
//
// Resolves ctx.from.id → active people row + worker-role assigned projects.
// Returns null when the user is not registered as an active worker.
// Used by /start and the FSM dispatcher.
// ---------------------------------------------------------------------------

export interface WorkerIdentity {
  person: {
    id: string;
    telegramUserId: bigint;
    telegramName: string | null;
    displayName: string;
  };
  projects: Array<{ id: string; name: string }>;
}

/**
 * resolveWorker — looks up the active people row for the given Telegram user ID
 * and their worker-role project assignments.
 *
 * @param db - The drizzle db client (lazy-imported inside the caller)
 * @param telegramUserId - BigInt Telegram user ID (wrap ctx.from.id with BigInt())
 * @returns WorkerIdentity or null if the user is not an active registered worker
 */
export async function resolveWorker(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  telegramUserId: bigint
): Promise<WorkerIdentity | null> {
  const { people } = await import('@/db/schema/people');
  const { assignments } = await import('@/db/schema/assignments');
  const { projects } = await import('@/db/schema/projects');
  const { eq, and } = await import('drizzle-orm');

  // Look up the active people row by telegram_user_id
  const personRows = await db
    .select()
    .from(people)
    .where(eq(people.telegramUserId, telegramUserId));

  if (!personRows || personRows.length === 0) {
    return null; // No active person — unregistered user
  }

  const person = personRows[0];

  // Fetch worker-role project assignments
  const assignmentRows = await db
    .select({
      id: projects.id,
      name: projects.name,
    })
    .from(assignments)
    .innerJoin(projects, eq(assignments.projectId, projects.id))
    .where(
      and(
        eq(assignments.personId, person.id),
        eq(assignments.roleOnProject, 'worker')
      )
    );

  return {
    person: {
      id: person.id,
      telegramUserId: person.telegramUserId,
      telegramName: person.telegramName,
      displayName: person.displayName,
    },
    projects: assignmentRows ?? [],
  };
}

// ---------------------------------------------------------------------------
// saveState helper — upserts conversation_state row (bumps updatedAt every time)
//
// Called by /start (clean start) and by Plan 05 step handlers after each advance.
// Exported so Plan 05 can call it directly.
// ---------------------------------------------------------------------------

/**
 * saveState — upserts the conversation_state row for a worker and bumps updatedAt.
 *
 * @param db - The drizzle db client (lazy-imported inside callers)
 * @param telegramUserId - BigInt Telegram user ID
 * @param step - The current FSM step (from STEPS)
 * @param data - The ConversationData payload to persist
 * @param personId - Person UUID (required on first insert; re-used on update)
 * @param flowId - Flow UUID (required on first insert; preserved on update)
 */
export async function saveState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  telegramUserId: bigint,
  step: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, unknown>,
  personId: string,
  flowId?: string
): Promise<void> {
  const { conversationState } = await import('@/db/schema/conversation-state');
  const { eq } = await import('drizzle-orm');
  const { sql } = await import('drizzle-orm');

  const now = new Date();

  // Try to UPDATE an existing row first (most common path — mid-flow step advance)
  const updateResult = await db
    .update(conversationState)
    .set({ currentStep: step, data, updatedAt: now })
    .where(eq(conversationState.telegramUserId, telegramUserId))
    .returning({ id: conversationState.id });

  if (updateResult && updateResult.length > 0) {
    return; // Row existed and was updated
  }

  // No existing row → INSERT (first save for this flow)
  const resolvedFlowId = flowId ?? sql`gen_random_uuid()`;
  await db.insert(conversationState).values({
    telegramUserId,
    personId,
    tenantId: getDefaultTenantId(),
    flowId: resolvedFlowId,
    currentStep: step,
    data,
    updatedAt: now,
  });
}

// ---------------------------------------------------------------------------
// /start handler (D-01, D-15, AUTH-02, AUTH-03)
//
// Registered workers: load conversation_state; if none or stale → clean start;
// if active non-stale → offer Devam/Baştan (D-15).
// Unregistered users: insert pending_people (Phase 1 preserved) + reply pendingApproval.
// ---------------------------------------------------------------------------

bot.command('start', async (ctx) => {
  const telegramUserId = ctx.from?.id;
  const telegramName =
    ctx.from?.first_name ??
    ctx.from?.username ??
    null;

  if (!telegramUserId) {
    // Safety guard — ctx.from should always be present in private chats
    await ctx.reply('Bir hata oluştu. Lütfen tekrar deneyin.');
    return;
  }

  // Lazy-import DB + schema (lazy import discipline — never at module top)
  const { db } = await import('@/db');

  // Try to resolve the worker identity
  const workerIdentity = await resolveWorker(db, BigInt(telegramUserId));

  if (!workerIdentity) {
    // UNREGISTERED USER — preserve Phase 1 behavior: insert pending_people + reply pendingApproval
    const { pendingPeople } = await import('@/db/schema/pending-people');
    const { MESSAGES } = await import('@/lib/bot-messages');

    await db.insert(pendingPeople).values({
      telegramUserId: BigInt(telegramUserId),
      telegramName,
      tenantId: getDefaultTenantId(),
    }).onConflictDoNothing();

    await ctx.reply(MESSAGES.pendingApproval);
    return;
  }

  // REGISTERED WORKER — check for an existing active flow
  const { conversationState } = await import('@/db/schema/conversation-state');
  const { eq } = await import('drizzle-orm');
  const { isStaleState, STEPS } = await import('@/lib/bot-fsm');
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { buildProjectKeyboard } = await import('@/lib/bot-keyboards');

  const stateRows = await db
    .select()
    .from(conversationState)
    .where(eq(conversationState.telegramUserId, BigInt(telegramUserId)));

  const existingState = stateRows?.[0] ?? null;

  if (existingState && !isStaleState(existingState.updatedAt)) {
    // Active non-stale flow in progress — offer Devam/Baştan (D-15)
    const resumeKeyboard = new InlineKeyboard()
      .text(MESSAGES.continueFlow, 'flow:resume')
      .text(MESSAGES.restartFlow, 'flow:restart');

    await ctx.reply(MESSAGES.startInProgress, {
      reply_markup: resumeKeyboard,
    });
    return;
  }

  // No active flow (or stale) — start a clean flow (D-15 clean start path)
  // Upsert conversation_state: set currentStep to PROJECT, page 0
  const { CONVERSATION_TTL_MS: _ttl } = await import('@/lib/bot-fsm');
  await saveState(
    db,
    BigInt(telegramUserId),
    STEPS.PROJECT,
    { step: STEPS.PROJECT, page: 0 },
    workerIdentity.person.id
  );

  await ctx.reply(MESSAGES.greeting(workerIdentity.person.displayName), {
    reply_markup: buildProjectKeyboard(workerIdentity.projects, 0),
  });
});

// ---------------------------------------------------------------------------
// /iptal handler — cancel at any step (D-17)
// ---------------------------------------------------------------------------

bot.command('iptal', async (ctx) => {
  const telegramUserId = ctx.from?.id;

  if (!telegramUserId) {
    await ctx.reply('Bir hata oluştu. Lütfen tekrar deneyin.');
    return;
  }

  const { db } = await import('@/db');
  const { conversationState } = await import('@/db/schema/conversation-state');
  const { eq } = await import('drizzle-orm');
  const { MESSAGES } = await import('@/lib/bot-messages');

  // Delete the conversation_state row for this worker
  await db
    .delete(conversationState)
    .where(eq(conversationState.telegramUserId, BigInt(telegramUserId)));

  await ctx.reply(MESSAGES.cancelled);
});

// ---------------------------------------------------------------------------
// Callback query routing: flow:resume / flow:restart (D-15)
//
// MUST call ctx.answerCallbackQuery() FIRST (Pitfall 3 / T-02-12)
// ---------------------------------------------------------------------------

bot.on('callback_query:data', async (ctx) => {
  // Answer the callback query immediately to stop Telegram's loading spinner
  await ctx.answerCallbackQuery();

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return;

  const data = ctx.callbackQuery.data;

  const { db } = await import('@/db');
  const { conversationState } = await import('@/db/schema/conversation-state');
  const { eq } = await import('drizzle-orm');
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { STEPS, isStaleState } = await import('@/lib/bot-fsm');
  const { buildProjectKeyboard } = await import('@/lib/bot-keyboards');

  if (data === 'flow:resume') {
    // Load the current state and reprompt its step
    const stateRows = await db
      .select()
      .from(conversationState)
      .where(eq(conversationState.telegramUserId, BigInt(telegramUserId)));

    const state = stateRows?.[0] ?? null;

    if (!state || isStaleState(state.updatedAt)) {
      await ctx.reply(MESSAGES.noActiveFlow);
      return;
    }

    // Reprompt current step with resume prefix (D-14)
    await repromptStep(ctx, state.currentStep, state.data as Record<string, unknown>);
    return;
  }

  if (data === 'flow:restart') {
    // Resolve worker identity and restart the flow from PROJECT step
    const workerIdentity = await resolveWorker(db, BigInt(telegramUserId));

    if (!workerIdentity) {
      await ctx.reply(MESSAGES.pendingApproval);
      return;
    }

    await saveState(
      db,
      BigInt(telegramUserId),
      STEPS.PROJECT,
      { step: STEPS.PROJECT, page: 0 },
      workerIdentity.person.id
    );

    await ctx.reply(MESSAGES.greeting(workerIdentity.person.displayName), {
      reply_markup: buildProjectKeyboard(workerIdentity.projects, 0),
    });
    return;
  }

  // Step-specific callback_query dispatch (project:select, boq:select, etc.)
  // Delegated to FSM dispatcher below — handled by the catch-all dispatcher
  await dispatchCallbackQuery(ctx, data, db, telegramUserId);
});

// ---------------------------------------------------------------------------
// FSM dispatcher helpers
// ---------------------------------------------------------------------------

/**
 * repromptStep — sends a resume-prefixed prompt for the given step.
 * Used on cold-start resume (D-14, SC5) and by flow:resume.
 */
async function repromptStep(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  step: string,
  _data: Record<string, unknown>
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { STEPS } = await import('@/lib/bot-fsm');

  const stepPrompts: Record<string, string> = {
    [STEPS.PROJECT]: MESSAGES.chooseProject,
    [STEPS.BOQ]: MESSAGES.chooseBoqItem,
    [STEPS.PHOTO]: MESSAGES.promptPhoto,
    [STEPS.LOCATION]: MESSAGES.promptLocation,
    [STEPS.QUANTITY]: MESSAGES.promptNotes, // placeholder — Plan 05 fills real logic
    [STEPS.NOTES]: MESSAGES.promptNotes,
    [STEPS.CONFIRM]: MESSAGES.confirmSummary,
  };

  const stepPrompt = stepPrompts[step] ?? MESSAGES.noActiveFlow;
  await ctx.reply(MESSAGES.resumePrefix + stepPrompt);
}

/**
 * dispatchCallbackQuery — routes step-specific callback queries to their stub handlers.
 * Plan 05 fills the real bodies; this plan establishes the dispatch frame.
 */
async function dispatchCallbackQuery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  data: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  telegramUserId: number
): Promise<void> {
  const { conversationState } = await import('@/db/schema/conversation-state');
  const { eq } = await import('drizzle-orm');
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { isStaleState, STEPS } = await import('@/lib/bot-fsm');

  const stateRows = await db
    .select()
    .from(conversationState)
    .where(eq(conversationState.telegramUserId, BigInt(telegramUserId)));

  const state = stateRows?.[0] ?? null;

  if (!state || isStaleState(state.updatedAt)) {
    await ctx.reply(MESSAGES.noActiveFlow);
    return;
  }

  // Stub dispatchers for step-specific callbacks — Plan 05 fills real bodies
  if (data.startsWith('project:select:')) {
    await handleStepProject(ctx, state.data as Record<string, unknown>, db);
    return;
  }
  if (data.startsWith('project:page:')) {
    await handleStepProject(ctx, state.data as Record<string, unknown>, db);
    return;
  }
  if (data.startsWith('boq:select:')) {
    await handleStepBoq(ctx, state.data as Record<string, unknown>, db);
    return;
  }
  if (data.startsWith('boq:page:')) {
    await handleStepBoq(ctx, state.data as Record<string, unknown>, db);
    return;
  }

  // Unknown callback — reprompt current step
  await repromptStep(ctx, state.currentStep, state.data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// FSM message dispatcher (D-14, SC5)
//
// Registered AFTER /start and /iptal so commands take precedence.
// Loads conversation_state, enforces TTL (D-22), dispatches to step handler.
// ---------------------------------------------------------------------------

bot.on('message', async (ctx) => {
  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return;

  const { db } = await import('@/db');
  const { conversationState } = await import('@/db/schema/conversation-state');
  const { eq } = await import('drizzle-orm');
  const { isStaleState } = await import('@/lib/bot-fsm');
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { STEPS } = await import('@/lib/bot-fsm');

  // Load conversation_state from DB (SC5: state lives in DB, not memory)
  const stateRows = await db
    .select()
    .from(conversationState)
    .where(eq(conversationState.telegramUserId, BigInt(telegramUserId)));

  const state = stateRows?.[0] ?? null;

  // D-22 TTL check — stale state treated as absent
  if (!state || isStaleState(state.updatedAt)) {
    await ctx.reply(MESSAGES.noActiveFlow);
    return;
  }

  // Dispatch to step handler by currentStep
  const conversationData = state.data as Record<string, unknown>;

  switch (state.currentStep) {
    case STEPS.PROJECT:
      await handleStepProject(ctx, conversationData, db);
      break;
    case STEPS.BOQ:
      await handleStepBoq(ctx, conversationData, db);
      break;
    case STEPS.PHOTO:
      await handleStepPhoto(ctx, conversationData, db);
      break;
    case STEPS.LOCATION:
      await handleStepLocation(ctx, conversationData, db);
      break;
    case STEPS.QUANTITY:
      await handleStepQuantity(ctx, conversationData, db);
      break;
    case STEPS.NOTES:
      await handleStepNotes(ctx, conversationData, db);
      break;
    case STEPS.CONFIRM:
      await handleStepConfirm(ctx, conversationData, db);
      break;
    default:
      await ctx.reply(MESSAGES.noActiveFlow);
  }
});

// ---------------------------------------------------------------------------
// Step handler stubs (Plan 05 fills the real bodies)
//
// Each stub reprompts the CURRENT step with the resume prefix (D-14 cold-start contract).
// Plan 05 replaces each body with real input validation + state advance logic.
// ---------------------------------------------------------------------------

/**
 * handleStepProject — stub for project selection step (LOG-02).
 * Plan 05: parse project:select:<id> callback, save projectId, advance to BOQ.
 */
export async function handleStepProject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  _data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  await ctx.reply(MESSAGES.resumePrefix + MESSAGES.chooseProject);
}

/**
 * handleStepBoq — stub for BOQ item selection step (LOG-03).
 * Plan 05: parse boq:select:<id> callback, save boqItemId, advance to PHOTO.
 */
export async function handleStepBoq(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  _data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  await ctx.reply(MESSAGES.resumePrefix + MESSAGES.chooseBoqItem);
}

/**
 * handleStepPhoto — stub for photo upload step (LOG-04).
 * Plan 05: require photo message type, upload to Blob, advance to LOCATION.
 */
export async function handleStepPhoto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  _data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  await ctx.reply(MESSAGES.resumePrefix + MESSAGES.promptPhoto);
}

/**
 * handleStepLocation — stub for location step (LOG-05).
 * Plan 05: require native location message, save lat/lon, advance to QUANTITY.
 */
export async function handleStepLocation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  _data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  await ctx.reply(MESSAGES.resumePrefix + MESSAGES.promptLocation);
}

/**
 * handleStepQuantity — stub for quantity entry step (LOG-06).
 * Plan 05: validate numeric (Turkish comma), save quantity, advance to NOTES.
 */
export async function handleStepQuantity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  _data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  await ctx.reply(MESSAGES.resumePrefix + MESSAGES.promptNotes);
}

/**
 * handleStepNotes — stub for notes step (LOG-07, D-21 skip allowed).
 * Plan 05: accept text or skip-button callback, save notes, advance to CONFIRM.
 */
export async function handleStepNotes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  _data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  await ctx.reply(MESSAGES.resumePrefix + MESSAGES.promptNotes);
}

/**
 * handleStepConfirm — stub for confirmation step (D-16, D-18).
 * Plan 05: render confirm summary, handle confirm/edit callbacks, insert submission.
 */
export async function handleStepConfirm(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  _data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  await ctx.reply(MESSAGES.resumePrefix + MESSAGES.confirmSummary);
}
