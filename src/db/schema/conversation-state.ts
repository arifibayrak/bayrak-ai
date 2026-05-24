// conversation_state holds the DB-row FSM state for in-progress work log flows.
// One row per worker (telegram_user_id UNIQUE — only one active flow per worker).
// D-12: DB-row FSM instead of @grammyjs/conversations — avoids replay footgun.
// D-22: updatedAt is used for TTL staleness check — must be bumped on every state write.
import { pgTable, uuid, text, bigint, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { people } from './people';

export const conversationState = pgTable('conversation_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id), // nullable D-09
  telegramUserId: bigint('telegram_user_id', { mode: 'bigint' }).notNull().unique(), // one active flow per worker
  personId: uuid('person_id').notNull().references(() => people.id),
  flowId: uuid('flow_id').notNull().defaultRandom(), // natural key carried to submissions (D-13 Guard 2)
  currentStep: text('current_step').notNull(),
  data: jsonb('data').notNull().default('{}'), // partial submission data as JSON
  // updatedAt (NOT createdAt/startedAt) — D-22 TTL check reads this; bump on every state write.
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('conversation_state_telegram_idx').on(t.telegramUserId),
]);
