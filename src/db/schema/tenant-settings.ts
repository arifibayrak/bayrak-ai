import { pgTable, uuid, integer, numeric, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * tenant_settings — admin-configurable alert thresholds (D-83/D-84).
 * One row per tenant (enforced by UNIQUE on tenant_id).
 * Defaults match D-84 "Moderate" thresholds:
 *   auditSlaHours             = 48   (2 days)
 *   rejectionRateThreshold    = 0.3000 (30%)
 *   stalledDays               = 7    (1 week)
 */
export const tenantSettings = pgTable('tenant_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id).unique(),
  // D-84: Moderate defaults — audit pending > 48h = SLA breach
  auditSlaHours: integer('audit_sla_hours').notNull().default(48),
  // D-84: rejection rate > 30%; stored as numeric(5,4); default is string literal NOT float (Pitfall 5)
  rejectionRateThreshold: numeric('rejection_rate_threshold', { precision: 5, scale: 4 }).notNull().default('0.3000'),
  // D-84: stalled = no approved submission in 7 days
  stalledDays: integer('stalled_days').notNull().default(7),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
