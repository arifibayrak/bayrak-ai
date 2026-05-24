import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Seed: INSERT one row with a fixed UUID '00000000-0000-0000-0000-000000000001'
// This UUID becomes BAYRAK_TENANT_ID in .env.local
