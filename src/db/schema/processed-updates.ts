// processed_updates is the D-13 Guard 1 dedup fence.
// update_id IS the natural primary key — no uuid PK, no tenantId.
// Dedup applies before tenant context is resolved.
// INSERT ON CONFLICT DO NOTHING (implemented in Plan 04 idempotency middleware).
import { pgTable, bigint, timestamp } from 'drizzle-orm/pg-core';

export const processedUpdates = pgTable('processed_updates', {
  updateId: bigint('update_id', { mode: 'bigint' }).primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
});
// No secondary indexes — PRIMARY KEY on update_id IS the unique index.
// No table-level constraint function needed (no secondary indexes).
