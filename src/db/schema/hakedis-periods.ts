import { pgTable, uuid, text, numeric, timestamp, date, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { projects } from './projects';
import { users } from './auth';

export const HAKEDIS_STATUSES = ['draft', 'finalized', 'submitted', 'paid'] as const;
export type HakedisStatus = (typeof HAKEDIS_STATUSES)[number];

export const hakedisPeriods = pgTable('hakedis_periods', {
  id:              uuid('id').primaryKey().defaultRandom(),
  tenantId:        uuid('tenant_id').references(() => tenants.id),              // nullable D-09
  projectId:       uuid('project_id').notNull().references(() => projects.id, { onDelete: 'restrict' }),
  periodNumber:    text('period_number').notNull(),          // "HK-2026-01" — human label
  // Open Question 3: periodStartDate is informational only — nullable to allow open-ended periods.
  // periodEndDate is required (defines the cumulative approval cutoff for the period).
  periodStartDate: date('period_start_date'),                // nullable — informational only
  periodEndDate:   date('period_end_date').notNull(),        // inclusive; stored as calendar date (Istanbul tz)
  // Currency scope: period only aggregates BOQ items with this currency_code.
  // Prevents mixed-currency summation in a single hakkediş certificate.
  currencyCode:    text('currency_code').notNull().default('TRY'),
  status:          text('status').notNull().default('draft'),  // values: draft | finalized | submitted | paid
  notes:           text('notes'),
  // Configurable deduction rates — stored as numeric strings, not hardcoded.
  // KDV: 20% default (Turkish VAT); Retention: 5% default (teminat kesintisi)
  kdvRate:         numeric('kdv_rate', { precision: 5, scale: 4 }).notNull().default('0.2000'),
  retentionRate:   numeric('retention_rate', { precision: 5, scale: 4 }).notNull().default('0.0500'),
  // tevkifat fraction stored separately — requires accountant confirmation (Phase 10 only)
  // tevkifatFraction: numeric('tevkifat_fraction', { precision: 5, scale: 4 }) — Phase 10 only
  createdByUserId: text('created_by_user_id').references(() => users.id),  // Auth.js user; nullable
  finalizedAt:     timestamp('finalized_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('hakedis_periods_project_idx').on(t.projectId),
  index('hakedis_periods_status_idx').on(t.status),
  index('hakedis_periods_currency_idx').on(t.projectId, t.currencyCode),
]);
