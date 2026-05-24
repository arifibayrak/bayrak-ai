// Holds /start captures awaiting office approval.
// On approval: row deleted here, inserted into people + assignments.
// On rejection: row deleted here.
import { pgTable, uuid, text, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const pendingPeople = pgTable('pending_people', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  telegramUserId: bigint('telegram_user_id', { mode: 'bigint' }).notNull().unique(),
  telegramName: text('telegram_name'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('pending_people_tenant_idx').on(t.tenantId),
  index('pending_people_telegram_idx').on(t.telegramUserId),
]);
