import { pgTable, uuid, text, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { hakedisPeriods } from './hakedis-periods';
import { boqItems } from './boq-items';

// NOTE: CHECK constraints are hand-written in the migration SQL (drizzle-kit cannot
// emit CHECK constraints on numeric columns):
//   - cumulative_qty_approved >= previous_cumulative_qty  (0004_v2_data_foundation.sql)
//   - period_qty >= 0  and  unit_price_snapshot >= 0  (WR-05: 0006_v2_period_qty_check.sql)
// The 0006 constraints prevent a negative period_qty / negative period_value from
// entering a hakkediş certificate.
export const hakedisPeriodLines = pgTable('hakedis_period_lines', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  tenantId:              uuid('tenant_id').references(() => tenants.id),              // nullable D-09
  periodId:              uuid('period_id').notNull().references(() => hakedisPeriods.id, { onDelete: 'cascade' }),
  boqItemId:             uuid('boq_item_id').notNull().references(() => boqItems.id, { onDelete: 'restrict' }),

  // ── Snapshot fields — immutable after finalization ─────────────────────────
  // These snapshot the BOQ item state at compute time so hakkediş lines remain
  // auditable even if the BOQ item is later updated or deleted.
  materialSnapshot:      text('material_snapshot').notNull(),
  unitSnapshot:          text('unit_snapshot').notNull(),
  currencyCodeSnapshot:  text('currency_code_snapshot').notNull(),   // locked at compute time
  unitPriceSnapshot:     numeric('unit_price_snapshot', { precision: 15, scale: 4 }).notNull(),

  // ── Quantity columns ────────────────────────────────────────────────────────
  // Both stored so the cumulative model (yeşil defter) is auditable.
  // DB CHECK: cumulative_qty_approved >= previous_cumulative_qty (0004 migration)
  cumulativeQtyApproved: numeric('cumulative_qty_approved', { precision: 12, scale: 3 }).notNull(),
  previousCumulativeQty: numeric('previous_cumulative_qty', { precision: 12, scale: 3 }).notNull().default('0'),
  // periodQty = cumulativeQtyApproved - previousCumulativeQty (enforced in computePeriodLines())
  // DB CHECK (WR-05): period_qty >= 0 — guards against negative period quantities /
  // negative period_value (added in 0006_v2_period_qty_check.sql).
  periodQty:             numeric('period_qty', { precision: 12, scale: 3 }).notNull(),

  // ── Computed value columns — stored for post-finalization immutability ──────
  // All multiplication happens in Postgres (money-math rule: never multiply numeric strings in JS).
  periodValue:           numeric('period_value', { precision: 15, scale: 2 }).notNull(),
  cumulativeValue:       numeric('cumulative_value', { precision: 15, scale: 2 }).notNull(),

  createdAt:             timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('hakedis_period_lines_period_idx').on(t.periodId),
  index('hakedis_period_lines_boq_idx').on(t.boqItemId),
]);
