import { pgTable, uuid, text, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  telegramUserId: bigint('telegram_user_id', { mode: 'bigint' }).notNull().unique(),
  telegramName: text('telegram_name'),        // from /start: ctx.from.first_name
  displayName: text('display_name').notNull(), // set by office on approval
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('people_tenant_idx').on(t.tenantId),
  index('people_telegram_idx').on(t.telegramUserId),
]);
