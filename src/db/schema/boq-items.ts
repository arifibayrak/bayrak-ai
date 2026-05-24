import { pgTable, uuid, text, numeric, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { tenants } from './tenants';

export const boqItems = pgTable('boq_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),  // nullable D-09
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  material: text('material').notNull(),       // e.g. "DN200 HDPE Boru"
  unit: text('unit').notNull(),               // e.g. "m", "m³", "adet"
  plannedQty: numeric('planned_qty', { precision: 12, scale: 3 }).notNull(),
  approvedQty: numeric('approved_qty', { precision: 12, scale: 3 }).notNull().default('0'),
  // unit_price omitted per D-06; add nullable column in v2 for hakkediş
  // unit_price: numeric('unit_price', { precision: 12, scale: 2 }),
  sortOrder: integer('sort_order').notNull().default(0),  // preserves import row order
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('boq_items_project_idx').on(t.projectId),
]);
