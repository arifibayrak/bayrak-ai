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
  // CR-05: combine both imports into one destructuring to reduce dynamic import calls (also fixes IN-01)
  const { eq, sql } = await import('drizzle-orm');

  const now = new Date();
  const resolvedFlowId = flowId ?? sql`gen_random_uuid()`;

  // CR-05: Replace UPDATE-then-INSERT with a single atomic upsert.
  // The old pattern had a race window: two concurrent /start requests could both
  // find zero rows on UPDATE and both attempt INSERT, causing a unique-constraint
  // violation on telegram_user_id that was never caught.
  // onConflictDoUpdate is atomic and eliminates the race entirely.
  await db
    .insert(conversationState)
    .values({
      telegramUserId,
      personId,
      tenantId: getDefaultTenantId(),
      flowId: resolvedFlowId,
      currentStep: step,
      data,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: conversationState.telegramUserId,
      set: { currentStep: step, data, updatedAt: now },
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
  // WR-01: store personId in the JSONB data so downstream handlers can read
  // data.personId reliably without falling back to the undefined fallback path.
  const { CONVERSATION_TTL_MS: _ttl } = await import('@/lib/bot-fsm');
  await saveState(
    db,
    BigInt(telegramUserId),
    STEPS.PROJECT,
    { step: STEPS.PROJECT, page: 0, personId: workerIdentity.person.id },
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

    // WR-01: store personId in the JSONB data on flow:restart as well
    await saveState(
      db,
      BigInt(telegramUserId),
      STEPS.PROJECT,
      { step: STEPS.PROJECT, page: 0, personId: workerIdentity.person.id },
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
 *
 * CR-01: For keyboard-driven steps (PROJECT, BOQ, CONFIRM) the plain-text
 * reprompt left workers with no actionable buttons. This version rebuilds the
 * appropriate inline keyboard so a resumed worker can always act.
 *
 * - STEPS.PROJECT: resolves worker and rebuilds the project selection keyboard.
 * - STEPS.BOQ: queries the stored projectId's BOQ items and rebuilds the BOQ keyboard.
 * - STEPS.CONFIRM: delegates to handleStepConfirm which sends the full confirm photo + keyboard.
 * - All other steps: plain-text reprompt (no keyboard needed — text/location/photo input).
 */
async function repromptStep(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  step: string,
  data: Record<string, unknown>
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { STEPS } = await import('@/lib/bot-fsm');
  const { db } = await import('@/db');

  const telegramUserId = ctx.from?.id;

  if (step === STEPS.PROJECT) {
    // CR-01: rebuild the project keyboard for the worker's assigned projects
    if (!telegramUserId) {
      await ctx.reply(MESSAGES.noActiveFlow);
      return;
    }
    const { buildProjectKeyboard } = await import('@/lib/bot-keyboards');
    const workerIdentity = await resolveWorker(db, BigInt(telegramUserId));
    const page = (data.page as number) ?? 0;
    await ctx.reply(MESSAGES.resumePrefix + MESSAGES.chooseProject, {
      reply_markup: buildProjectKeyboard(workerIdentity?.projects ?? [], page),
    });
    return;
  }

  if (step === STEPS.BOQ) {
    // CR-01: rebuild the BOQ keyboard from the stored projectId
    const projectId = data.projectId as string | undefined;
    if (!projectId) {
      await ctx.reply(MESSAGES.noActiveFlow);
      return;
    }
    const { buildBoqKeyboard } = await import('@/lib/bot-keyboards');
    const { boqItems } = await import('@/db/schema/boq-items');
    const { eq } = await import('drizzle-orm');
    const boqRows = await db.select().from(boqItems).where(eq(boqItems.projectId, projectId));
    const page = (data.page as number) ?? 0;
    await ctx.reply(MESSAGES.resumePrefix + MESSAGES.chooseBoqItem, {
      reply_markup: buildBoqKeyboard(boqRows, page),
    });
    return;
  }

  if (step === STEPS.CONFIRM) {
    // CR-01: delegate to the real confirm handler which sends the full summary + keyboard
    await handleStepConfirm(ctx, data, db);
    return;
  }

  // Text/media steps — plain-text reprompt (worker types/sends input, no inline keyboard needed)
  const stepPrompts: Record<string, string> = {
    [STEPS.PHOTO]: MESSAGES.promptPhoto,
    [STEPS.LOCATION]: MESSAGES.promptLocation,
    [STEPS.QUANTITY]: MESSAGES.promptQuantity((data.unit as string) ?? ''),
    [STEPS.NOTES]: MESSAGES.promptNotes,
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

  // Step-specific callback dispatchers (Plan 05 real bodies)
  if (data.startsWith('project:select:') || data.startsWith('project:page:')) {
    await handleStepProject(ctx, state.data as Record<string, unknown>, db);
    return;
  }
  if (
    data.startsWith('boq:select:') ||
    data.startsWith('boq:page:') ||
    data.startsWith('boq:confirm0:') ||
    data === 'boq:back'
  ) {
    await handleStepBoq(ctx, state.data as Record<string, unknown>, db);
    return;
  }
  if (data === 'notes:skip') {
    await handleStepNotes(ctx, state.data as Record<string, unknown>, db);
    return;
  }

  // D-16: edit:<field> callbacks — jump to chosen step, set editReturnStep=CONFIRM
  if (data.startsWith('edit:')) {
    const field = data.slice(5); // 'photo' | 'location' | 'quantity' | 'notes' | 'boq'
    const fieldStepMap: Record<string, string> = {
      photo: STEPS.PHOTO,
      location: STEPS.LOCATION,
      quantity: STEPS.QUANTITY,
      notes: STEPS.NOTES,
      boq: STEPS.BOQ,
    };
    const targetStep = fieldStepMap[field];
    if (targetStep) {
      const currentData = state.data as Record<string, unknown>;
      const newData = { ...currentData, editReturnStep: STEPS.CONFIRM };
      await saveState(db, BigInt(telegramUserId), targetStep, newData, state.personId as string);
      await repromptStep(ctx, targetStep, newData);
    }
    return;
  }

  // confirm:submit — transactional submission insert (LOG-08)
  if (data === 'confirm:submit') {
    await handleConfirmSubmit(ctx, db);
    return;
  }

  // flow:new — start a clean new flow after successful submission (D-18)
  if (data === 'flow:new') {
    const workerIdentity = await resolveWorker(db, BigInt(telegramUserId));
    if (!workerIdentity) {
      const { MESSAGES: MSG } = await import('@/lib/bot-messages');
      await ctx.reply(MSG.pendingApproval);
      return;
    }
    const { buildProjectKeyboard: bpk } = await import('@/lib/bot-keyboards');
    const { MESSAGES: MSG } = await import('@/lib/bot-messages');
    // WR-01: store personId in the JSONB data on flow:new as well
    await saveState(
      db,
      BigInt(telegramUserId),
      STEPS.PROJECT,
      { step: STEPS.PROJECT, page: 0, personId: workerIdentity.person.id },
      workerIdentity.person.id
    );
    await ctx.reply(MSG.greeting(workerIdentity.person.displayName), {
      reply_markup: bpk(workerIdentity.projects, 0),
    });
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

// ---------------------------------------------------------------------------
// Step handler implementations (Plan 05)
//
// Each handler enforces its expected input type:
//   - Valid input: advances exactly one step via saveState
//   - Invalid input: reprompts in Turkish WITHOUT advancing (LOG-09/D-19)
//
// Every callback_query handler calls ctx.answerCallbackQuery() FIRST (Pitfall 3)
// before any DB work to stop Telegram's loading spinner.
// ---------------------------------------------------------------------------

/**
 * handleStepProject — project selection step (LOG-02).
 *
 * Callback-driven. Parses project:select:<id> or project:page:<n>.
 * On select: re-validates the project ID against the worker's assignments (V4 anti-tamper).
 * On valid select: saves projectId, advances to STEP_BOQ, shows BOQ keyboard.
 * On page: re-renders the project keyboard at page n without advancing.
 * On tampered ID: reprompts chooseProject without advancing.
 */
export async function handleStepProject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { STEPS } = await import('@/lib/bot-fsm');
  const { buildProjectKeyboard, buildBoqKeyboard } = await import('@/lib/bot-keyboards');

  const callbackData: string = ctx.callbackQuery?.data ?? '';
  const parts = callbackData.split(':');
  // Expected shape: project:select:<id> or project:page:<n>
  const action = parts[1]; // 'select' | 'page'
  const value = parts.slice(2).join(':'); // id or page number

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    await ctx.reply(MESSAGES.noActiveFlow);
    return;
  }

  if (action === 'page') {
    // Re-render the project keyboard at page n — no step advance
    const pageNum = parseInt(value, 10);
    const workerIdentity = await resolveWorker(db, BigInt(telegramUserId));
    if (!workerIdentity) {
      await ctx.reply(MESSAGES.pendingApproval);
      return;
    }
    await ctx.reply(MESSAGES.chooseProject, {
      reply_markup: buildProjectKeyboard(workerIdentity.projects, isNaN(pageNum) ? 0 : pageNum),
    });
    return;
  }

  if (action === 'select') {
    // V4: Re-query the worker's assigned projects — never trust the callback_data ID
    const workerIdentity = await resolveWorker(db, BigInt(telegramUserId));
    if (!workerIdentity) {
      await ctx.reply(MESSAGES.pendingApproval);
      return;
    }

    const isAssigned = workerIdentity.projects.some(p => p.id === value);
    if (!isAssigned) {
      // Tampered ID — reject silently and reprompt (V4)
      await ctx.reply(MESSAGES.chooseProject, {
        reply_markup: buildProjectKeyboard(workerIdentity.projects, (data.page as number) ?? 0),
      });
      return;
    }

    // Valid assigned project — load its BOQ items
    const { boqItems } = await import('@/db/schema/boq-items');
    const { eq } = await import('drizzle-orm');

    const boqRows = await db
      .select()
      .from(boqItems)
      .where(eq(boqItems.projectId, value));

    // WR-03: store projectName alongside projectId so the confirm summary shows
    // the human-readable name instead of the raw UUID.
    const selectedProject = workerIdentity.projects.find(p => p.id === value);
    const newData = {
      ...data,
      projectId: value,
      projectName: selectedProject?.name ?? value,
    };
    await saveState(
      db,
      BigInt(telegramUserId),
      STEPS.BOQ,
      newData,
      workerIdentity.person.id
    );

    await ctx.reply(MESSAGES.chooseBoqItem, {
      reply_markup: buildBoqKeyboard(boqRows, 0),
    });
    return;
  }

  // Unknown action — reprompt
  const workerIdentity = await resolveWorker(db, BigInt(telegramUserId));
  await ctx.reply(MESSAGES.chooseProject, {
    reply_markup: buildProjectKeyboard(workerIdentity?.projects ?? [], (data.page as number) ?? 0),
  });
}

/**
 * handleStepBoq — BOQ item selection step (LOG-03, D-24, D-25).
 *
 * Callback-driven. Parses boq:select:<id>, boq:page:<n>, boq:confirm0:<id>.
 * On select: re-validates that the boq_item_id belongs to data.projectId's BOQ (V4).
 * On 0-balance select: shows exhaustedBoqWarning with confirm/back keyboard (D-25 soft warning).
 * On confirm0 callback: advances to PHOTO step regardless of balance.
 * On valid positive-balance select: saves boqItemId + unit, advances to PHOTO.
 * On page: re-renders without advancing.
 */
export async function handleStepBoq(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { STEPS } = await import('@/lib/bot-fsm');
  const { buildBoqKeyboard } = await import('@/lib/bot-keyboards');
  const { remainingBalance } = await import('@/lib/boq-balance');

  const callbackData: string = ctx.callbackQuery?.data ?? '';
  const parts = callbackData.split(':');
  const action = parts[1]; // 'select' | 'page' | 'confirm0' | 'back'
  const value = parts.slice(2).join(':');

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    await ctx.reply(MESSAGES.noActiveFlow);
    return;
  }

  const projectId = data.projectId as string;
  if (!projectId) {
    await ctx.reply(MESSAGES.noActiveFlow);
    return;
  }

  // Load the BOQ items for the current project (needed for page + select + back)
  const { boqItems } = await import('@/db/schema/boq-items');
  const { eq } = await import('drizzle-orm');

  const boqRows = await db
    .select()
    .from(boqItems)
    .where(eq(boqItems.projectId, projectId));

  if (action === 'page') {
    const pageNum = parseInt(value, 10);
    await ctx.reply(MESSAGES.chooseBoqItem, {
      reply_markup: buildBoqKeyboard(boqRows, isNaN(pageNum) ? 0 : pageNum),
    });
    return;
  }

  if (action === 'back') {
    // Re-list the BOQ keyboard (worker backed out from exhausted warning)
    await ctx.reply(MESSAGES.chooseBoqItem, {
      reply_markup: buildBoqKeyboard(boqRows, (data.page as number) ?? 0),
    });
    return;
  }

  if (action === 'confirm0') {
    // Worker confirmed they want to proceed despite 0 balance (D-25)
    // value is the boqItemId
    const selectedItem = boqRows.find((r: { id: string }) => r.id === value);
    if (!selectedItem) {
      await ctx.reply(MESSAGES.chooseBoqItem, { reply_markup: buildBoqKeyboard(boqRows, 0) });
      return;
    }

    const workerIdentityForConfirm = await resolveWorker(db, BigInt(telegramUserId));
    // WR-03: also store boqMaterial so the confirm summary is human-readable
    const newDataConfirm = {
      ...data,
      boqItemId: value,
      boqMaterial: selectedItem.material,
      unit: selectedItem.unit,
    };
    await saveState(
      db,
      BigInt(telegramUserId),
      STEPS.PHOTO,
      newDataConfirm,
      workerIdentityForConfirm?.person.id ?? (data.personId as string)
    );
    await ctx.reply(MESSAGES.promptPhoto);
    return;
  }

  if (action === 'select') {
    // V4: Validate the boq_item_id belongs to the current project's BOQ
    const selectedItem = boqRows.find((r: { id: string }) => r.id === value);
    if (!selectedItem) {
      // Tampered ID — reprompt
      await ctx.reply(MESSAGES.chooseBoqItem, {
        reply_markup: buildBoqKeyboard(boqRows, (data.page as number) ?? 0),
      });
      return;
    }

    const balance = remainingBalance(selectedItem.plannedQty, selectedItem.approvedQty);

    if (balance <= 0) {
      // D-25: soft warning — show confirm/back keyboard, do NOT advance step
      const confirmKeyboard = new InlineKeyboard()
        .text('Evet, devam et', `boq:confirm0:${value}`)
        .text('Geri', 'boq:back');

      await ctx.reply(MESSAGES.exhaustedBoqWarning, {
        reply_markup: confirmKeyboard,
      });
      return;
    }

    // Positive balance — advance to PHOTO step
    const workerIdentity = await resolveWorker(db, BigInt(telegramUserId));
    // WR-03: store boqMaterial so the confirm summary shows the item name, not the UUID
    const newData = {
      ...data,
      boqItemId: value,
      boqMaterial: selectedItem.material,
      unit: selectedItem.unit,
    };
    await saveState(
      db,
      BigInt(telegramUserId),
      STEPS.PHOTO,
      newData,
      workerIdentity?.person.id ?? (data.personId as string)
    );
    await ctx.reply(MESSAGES.promptPhoto);
    return;
  }

  // Unknown action — reprompt
  await ctx.reply(MESSAGES.chooseBoqItem, {
    reply_markup: buildBoqKeyboard(boqRows, (data.page as number) ?? 0),
  });
}

/**
 * handleStepPhoto — photo upload step (LOG-04, D-19, T-02-15).
 *
 * Message-driven. Checks for ctx.message?.photo array.
 * On photo: calls uploadPhotoToBlob (upload-on-receipt, Q1 resolution) wrapped
 *   in try/catch — on failure stays on the step with a Turkish error (T-02-15).
 *   On success: stores photoUrl + photoFileId, advances to STEP_LOCATION.
 * On non-photo: replies MESSAGES.rejectNotPhoto and does NOT advance (D-19).
 */
export async function handleStepPhoto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { STEPS } = await import('@/lib/bot-fsm');

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return;

  // Check if the message contains a photo (Pitfall 5: photo is an array, use last element)
  const photoSizes = ctx.message?.photo;
  if (!photoSizes || photoSizes.length === 0) {
    // Non-photo message — reject and reprompt (D-19, LOG-04)
    await ctx.reply(MESSAGES.rejectNotPhoto);
    return;
  }

  // Photo received — upload to Vercel Blob (upload-on-receipt, Q1)
  const { uploadPhotoToBlob } = await import('@/lib/bot-photo');
  // flowId lives on the conversation_state ROW (column), NOT in the JSONB `data`.
  // Reading `data.flowId` always yields undefined, so every photo collided at
  // `submissions/undefined/photo.jpg` (works once, then put() throws on the existing
  // path). Load the authoritative flowId from the row so each submission gets a unique path.
  const { conversationState } = await import('@/db/schema/conversation-state');
  const { eq } = await import('drizzle-orm');
  const stateRows = await db
    .select()
    .from(conversationState)
    .where(eq(conversationState.telegramUserId, BigInt(telegramUserId)));
  const flowId = stateRows?.[0]?.flowId as string | undefined;
  if (!flowId) {
    await ctx.reply(MESSAGES.genericError);
    return;
  }

  let photoUrl: string;
  try {
    photoUrl = await uploadPhotoToBlob(ctx, flowId);
  } catch (err) {
    // T-02-15: upload failure — stay on step with Turkish error.
    // Log the real error so upload failures are diagnosable (previously swallowed).
    console.error('[handleStepPhoto] uploadPhotoToBlob failed for flowId', flowId, ':', err);
    await ctx.reply(MESSAGES.photoUploadError);
    return;
  }

  // Get the highest-res photo file_id (last element — Pitfall 5)
  const highResPhoto = photoSizes[photoSizes.length - 1];
  const photoFileId: string = highResPhoto.file_id;

  // D-16: if editReturnStep is set, return to CONFIRM after re-capture
  const editReturn = data.editReturnStep as string | undefined;
  const newData = { ...data, photoUrl, photoFileId, editReturnStep: undefined };
  if (editReturn === STEPS.CONFIRM) {
    await saveState(db, BigInt(telegramUserId), STEPS.CONFIRM, newData, data.personId as string);
    await handleStepConfirm(ctx, newData, db);
    return;
  }

  // Advance to LOCATION step
  await saveState(
    db,
    BigInt(telegramUserId),
    STEPS.LOCATION,
    newData,
    data.personId as string
  );
  await ctx.reply(MESSAGES.promptLocation);
}

/**
 * handleStepLocation — location capture step (LOG-05, D-20).
 *
 * Message-driven. Checks for ctx.message?.location (native Telegram location).
 * On native location: stores lat/lon, advances to STEP_QUANTITY with promptQuantity(unit).
 * On any other message type (text, photo, typed coordinates): replies
 *   MESSAGES.rejectNotLocation with the 📎 → Konum hint and does NOT advance (D-20).
 * NOTE: Phase 2 accepts ANY native location — no geofence (Phase 4 / GEO-02).
 */
export async function handleStepLocation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { STEPS } = await import('@/lib/bot-fsm');

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return;

  const location = ctx.message?.location;
  if (!location) {
    // Non-location message (including typed coordinates as text) — reject (D-20, LOG-05)
    await ctx.reply(MESSAGES.rejectNotLocation);
    return;
  }

  // Native location received
  const editReturnLoc = data.editReturnStep as string | undefined;
  const newData = {
    ...data,
    locationLat: location.latitude,
    locationLon: location.longitude,
    editReturnStep: undefined,
  };

  // D-16: if editReturnStep is set, return to CONFIRM after re-capture
  if (editReturnLoc === STEPS.CONFIRM) {
    await saveState(db, BigInt(telegramUserId), STEPS.CONFIRM, newData, data.personId as string);
    await handleStepConfirm(ctx, newData, db);
    return;
  }

  // Advance to QUANTITY step
  await saveState(
    db,
    BigInt(telegramUserId),
    STEPS.QUANTITY,
    newData,
    data.personId as string
  );

  // Prompt for quantity — include the BOQ item's unit (e.g. "Kaç metre?")
  const unit = (data.unit as string) ?? '';
  await ctx.reply(MESSAGES.promptQuantity(unit));
}

/**
 * handleStepQuantity — quantity entry step (LOG-06, Pitfall 4).
 *
 * Message-driven. Reads ctx.message?.text.
 * Normalizes Turkish comma decimal: value.replace(',', '.') BEFORE parseFloat (Pitfall 4).
 * Validation: n must be a finite, positive number (!isNaN && n > 0).
 * On valid: stores quantity, advances to STEP_NOTES, replies promptNotes with Atla button.
 * On invalid: replies MESSAGES.rejectNotNumeric, does NOT advance (LOG-06).
 */
export async function handleStepQuantity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { STEPS } = await import('@/lib/bot-fsm');

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return;

  const rawText = ctx.message?.text ?? '';

  // WR-02: normalize Turkish decimal separator robustly.
  // Rule: Turkish field workers type "25,5" (comma = decimal separator).
  // Step 1 — replace ALL commas with periods (replaceAll, not the non-global String.replace).
  // Step 2 — if the result has more than one period the input is ambiguous
  //   (e.g. "1.234,5" → "1.234.5" — could be 1234.5 or a typo). Reject it.
  // Step 3 — parseFloat the normalized single-period string.
  // CR-02: use !isFinite() instead of isNaN() so "Infinity"/"-Infinity" are also rejected.
  const normalized = rawText.trim().replace(/,/g, '.');
  const dotCount = (normalized.match(/\./g) ?? []).length;
  if (dotCount > 1) {
    // Ambiguous format (e.g. "1.234,5" or "1,234.5") — reject with clear message (WR-02)
    await ctx.reply(MESSAGES.rejectNotNumeric);
    return;
  }
  const parsed = parseFloat(normalized);

  // CR-02: !isFinite rejects NaN, Infinity, and -Infinity in one check.
  // Previously isNaN passed Infinity through (parseFloat('Infinity') === Infinity).
  if (!isFinite(parsed) || parsed <= 0) {
    // Invalid quantity — reprompt (LOG-06)
    await ctx.reply(MESSAGES.rejectNotNumeric);
    return;
  }

  // Valid quantity
  const editReturnQty = data.editReturnStep as string | undefined;
  const newData = { ...data, quantity: parsed, editReturnStep: undefined };

  // D-16: if editReturnStep is set, return to CONFIRM after re-capture
  if (editReturnQty === STEPS.CONFIRM) {
    await saveState(db, BigInt(telegramUserId), STEPS.CONFIRM, newData, data.personId as string);
    await handleStepConfirm(ctx, newData, db);
    return;
  }

  // Advance to NOTES step
  await saveState(
    db,
    BigInt(telegramUserId),
    STEPS.NOTES,
    newData,
    data.personId as string
  );

  // Show notes prompt with Atla (skip) button (D-21)
  const skipKeyboard = new InlineKeyboard().text(MESSAGES.skipNotes, 'notes:skip');
  await ctx.reply(MESSAGES.promptNotes, { reply_markup: skipKeyboard });
}

/**
 * handleStepNotes — notes entry step (LOG-07, D-21).
 *
 * Dual-path: text message OR notes:skip callback.
 * On notes:skip callback: stores notes = null, advances to STEP_CONFIRM (D-21).
 * On text message: stores notes string (length-capped at 1000 chars — V5 injection
 *   surface bound), advances to STEP_CONFIRM.
 * Notes are stored as plain data only — Drizzle parameterized inserts prevent
 * SQL injection; the length cap bounds the free-text injection surface (V5).
 *
 * Called from BOTH the message dispatcher (text path) AND the callback dispatcher
 * (notes:skip path). The callback path calls ctx.answerCallbackQuery() FIRST
 * (already done in the top-level callback_query:data handler — Pitfall 3).
 */
export async function handleStepNotes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { STEPS } = await import('@/lib/bot-fsm');

  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return;

  // Check if this is the notes:skip callback
  const isSkip = ctx.callbackQuery?.data === 'notes:skip';

  const notes = isSkip ? null : (ctx.message?.text ?? null);

  // V5: length cap — bound free-text injection surface (D-21, notes stored via Drizzle parameterized insert)
  const cappedNotes = notes !== null ? notes.slice(0, 1000) : null;

  // Advance to CONFIRM step (notes always routes to CONFIRM — editReturnStep irrelevant here)
  const newData = { ...data, notes: cappedNotes, editReturnStep: undefined };
  await saveState(
    db,
    BigInt(telegramUserId),
    STEPS.CONFIRM,
    newData,
    data.personId as string
  );

  // Hand off to confirm step
  await handleStepConfirm(ctx, newData, db);
}

// ---------------------------------------------------------------------------
// getTxDb — neon-serverless Pool (WebSocket driver) for transactions.
//
// Copied EXACTLY from src/actions/people.ts lines 21-38.
// neon-http (default @/db) does NOT support transactions — this is the ONLY
// correct driver for the confirm:submit transactional insert (T-02-16, Pitfall 2).
// ---------------------------------------------------------------------------

async function getTxDb() {
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');

  // In Node.js (non-edge) environments, neon-serverless needs ws
  // Try to require ws if available, fall back gracefully if not
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ws = require('ws') as { default?: unknown } | unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    neonConfig.webSocketConstructor = (ws as any).default ?? ws;
  } catch (wsErr) {
    // ws not available — will use native WebSocket (browser/edge).
    // Log so a missing/unbundled ws is visible in runtime logs instead of failing silently.
    console.error('[getTxDb] require("ws") failed; falling back to native WebSocket:', wsErr);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  return drizzle(pool);
}

/**
 * handleStepConfirm — D-16 confirm summary + per-field edit buttons.
 *
 * Renders the captured submission as a photo (replyWithPhoto on the stored
 * blob URL) with a summary caption and per-field edit buttons + a confirm button.
 * Tapping an edit button sets editReturnStep and routes to the chosen step.
 * Tapping "Onayla ve Gönder" triggers the transactional submission insert (Task 2).
 */
export async function handleStepConfirm(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  const { InlineKeyboard: IK } = await import('grammy');

  const photoUrl = data.photoUrl as string | undefined;

  // Build the summary caption
  const projectName = (data.projectName as string) ?? (data.projectId as string) ?? '—';
  const boqMaterial = (data.boqMaterial as string) ?? (data.boqItemId as string) ?? '—';
  const quantity = data.quantity as number | undefined;
  const unit = (data.unit as string) ?? '';
  const notes = (data.notes as string | null) ?? '—';
  const hasLocation = Boolean(data.locationLat && data.locationLon);

  const caption = [
    MESSAGES.confirmSummary,
    '',
    `🏗 Proje: ${projectName}`,
    `📦 Kalem: ${boqMaterial}`,
    `📏 Miktar: ${quantity !== undefined ? `${quantity} ${unit}` : '—'}`,
    `📍 Konum: ${hasLocation ? '✓' : '—'}`,
    `📝 Not: ${notes}`,
  ].join('\n');

  // Build per-field edit keyboard + confirm button (D-16)
  const confirmKeyboard = new IK()
    .text(MESSAGES.editPhoto, 'edit:photo')
    .row()
    .text(MESSAGES.editLocation, 'edit:location')
    .row()
    .text(MESSAGES.editQuantity, 'edit:quantity')
    .row()
    .text(MESSAGES.editNotes, 'edit:notes')
    .row()
    .text('Onayla ve Gönder ✅', 'confirm:submit');

  if (photoUrl) {
    await ctx.replyWithPhoto(photoUrl, {
      caption,
      reply_markup: confirmKeyboard,
    });
  } else {
    // Fallback: no photo yet (should not happen in normal flow)
    await ctx.reply(caption, { reply_markup: confirmKeyboard });
  }
}

/**
 * handleConfirmSubmit — transactional submission insert (LOG-08, D-18).
 *
 * Inserts one submissions row (status pending_audit) and deletes the
 * conversation_state row in a single getTxDb() transaction.
 * Uses onConflictDoNothing on the flow_id unique constraint (D-13 Guard 2).
 * Replies "Gönderildi ✅" with a "Yeni kayıt" button (D-18 — no auto-loop).
 */
async function handleConfirmSubmit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<void> {
  const { MESSAGES } = await import('@/lib/bot-messages');
  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) return;

  // Re-load conversation_state from DB (get the authoritative flowId + personId)
  const { conversationState } = await import('@/db/schema/conversation-state');
  const { eq } = await import('drizzle-orm');

  const stateRows = await db
    .select()
    .from(conversationState)
    .where(eq(conversationState.telegramUserId, BigInt(telegramUserId)));

  const state = stateRows?.[0] ?? null;
  if (!state) {
    await ctx.reply(MESSAGES.noActiveFlow);
    return;
  }

  const data = state.data as Record<string, unknown>;
  const flowId = state.flowId as string;
  const personId = state.personId as string;

  // Validate required fields before transactional insert (T-02-17)
  if (!data.projectId || !data.boqItemId || !data.photoUrl || data.quantity === undefined) {
    await ctx.reply(MESSAGES.genericError);
    return;
  }

  // Transactional insert: submissions row + conversation_state delete in ONE transaction.
  // getTxDb() uses the neon-serverless Pool (WebSocket) driver which supports transactions.
  // neon-http (default @/db) throws on .transaction() — Pitfall 2.
  const { submissions } = await import('@/db/schema/submissions');
  const txDb = await getTxDb();

  // CR-03: wrap the transaction in try/catch.
  // On any failure (network blip, DB constraint, Infinity quantity value, etc.)
  // the transaction rolls back automatically. We reply with a Turkish error message
  // and return WITHOUT deleting conversation_state so the worker can retry "Onayla ve Gönder".
  try {
    await txDb.transaction(async (tx) => {
      // Insert submissions row — .onConflictDoNothing() on flow_id (D-13 Guard 2)
      await tx
        .insert(submissions)
        .values({
          tenantId: getDefaultTenantId(),
          flowId,
          personId,
          projectId: data.projectId as string,
          boqItemId: data.boqItemId as string,
          photoUrl: data.photoUrl as string,
          photoFileId: (data.photoFileId as string) ?? null,
          locationLat: data.locationLat != null ? String(data.locationLat) : null,
          locationLon: data.locationLon != null ? String(data.locationLon) : null,
          quantity: String(data.quantity),
          notes: (data.notes as string | null) ?? null,
          status: 'pending_audit',
          submittedAt: new Date(),
        })
        .onConflictDoNothing();

      // Delete the conversation_state row — atomically with the insert
      await tx
        .delete(conversationState)
        .where(eq(conversationState.telegramUserId, BigInt(telegramUserId)));
    });
  } catch (txErr) {
    // Transaction failed — reply with a Turkish error and leave conversation_state intact
    // so the worker can tap "Onayla ve Gönder" again (CR-03).
    // Log the real error so confirm-submit failures are diagnosable in runtime logs
    // (previously swallowed — a Vercel-runtime failure was invisible).
    console.error('[handleConfirmSubmit] transaction failed for flowId', flowId, ':', txErr);
    await ctx.reply(MESSAGES.genericError);
    return;
  }

  // Reply "Gönderildi ✅" with a single "Yeni kayıt" button (D-18 — no auto-loop)
  const doneKeyboard = new InlineKeyboard().text(MESSAGES.newLog, 'flow:new');
  await ctx.reply(MESSAGES.sent, { reply_markup: doneKeyboard });
}
