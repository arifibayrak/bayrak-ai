/**
 * src/lib/bot-fsm.ts
 *
 * FSM step constants, state type, and TTL staleness helper for the worker
 * Telegram bot (D-12, D-22).
 *
 * PURE MODULE — no top-level DB imports, no async at module scope.
 * This file is safe to import in unit tests without DATABASE_URL.
 *
 * Design rationale (D-12):
 *   Explicit DB-row finite-state machine instead of @grammyjs/conversations.
 *   One conversation_state row per worker holds current_step + partial
 *   submission JSON. Sidesteps the grammY conversations replay footgun.
 *
 * TTL (D-22):
 *   Staleness is checked on read — zero infra, lazy eviction on next message.
 */

// ---------------------------------------------------------------------------
// Step constants
// ---------------------------------------------------------------------------

export const STEPS = {
  PROJECT:  'project',
  BOQ:      'boq',
  PHOTO:    'photo',
  LOCATION: 'location',
  QUANTITY: 'quantity',
  NOTES:    'notes',
  CONFIRM:  'confirm',
} as const;

export type Step = typeof STEPS[keyof typeof STEPS];

// ---------------------------------------------------------------------------
// Conversation state shape (stored as JSONB in conversation_state.data)
// ---------------------------------------------------------------------------

/**
 * ConversationData — the partial submission payload carried between FSM steps.
 *
 * Consumed by every step handler in Plans 04-06.
 * editReturnStep enables the D-16 jump-to-edit → return-to-confirm flow.
 * page tracks the current paginated keyboard page for BOQ/project lists.
 *
 * WR-01: personId is stored in JSONB at flow start so all downstream saveState
 *   calls can read data.personId reliably instead of relying on an undefined fallback.
 * WR-03: projectName and boqMaterial are stored when each step advances so the
 *   confirm summary shows human-readable labels, not raw UUIDs.
 */
export interface ConversationData {
  step: Step;
  personId?: string;      // WR-01: person UUID — stored at flow start
  projectId?: string;
  projectName?: string;   // WR-03: project display name stored when project is selected
  boqItemId?: string;
  boqMaterial?: string;   // WR-03: BOQ item material label stored when BOQ item is selected
  photoUrl?: string;      // Vercel Blob URL (upload-on-receipt per Q1 resolution)
  photoFileId?: string;   // Telegram file_id reference
  locationLat?: number;
  locationLon?: number;
  quantity?: number;
  notes?: string | null;
  editReturnStep?: Step;  // D-16: jump-to-edit return target
  page?: number;          // paginated keyboard page index (D-23)
}

// ---------------------------------------------------------------------------
// TTL helper (D-22)
// ---------------------------------------------------------------------------

/** TTL: 24 hours in milliseconds (D-22) */
export const CONVERSATION_TTL_MS = 86_400_000;

/**
 * isStaleState — returns true if the conversation_state row is older than
 * CONVERSATION_TTL_MS and should be treated as abandoned.
 *
 * Called on every FSM dispatch before routing to a step handler.
 * Stale rows trigger a clean restart rather than resuming a day-old flow.
 *
 * @param updatedAt - The updatedAt timestamp from the conversation_state row
 * @returns true if the state has expired and must be reset
 */
export function isStaleState(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() > CONVERSATION_TTL_MS;
}
