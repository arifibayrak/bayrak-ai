import { pgTable, uuid, text, numeric, boolean, timestamp, date, index } from 'drizzle-orm/pg-core';
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
  kdvRate:            numeric('kdv_rate', { precision: 5, scale: 4 }).notNull().default('0.2000'),
  retentionRate:      numeric('retention_rate', { precision: 5, scale: 4 }).notNull().default('0.0500'),
  // D-91 (Phase 10): missing deduction-rate columns added via migration 0008_v2_hakedis_deductions.sql
  // tevkifat: fraction OF KDV withheld by the employer (e.g. 0.4000 = 4/10 yapım işi, D-92 default)
  tevkifatFraction:   numeric('tevkifat_fraction', { precision: 5, scale: 4 }),          // nullable — old periods may not have it
  // D-93: stopaj modeled as explicit boolean toggle + separate rate; the toggle controls
  // whether the stopaj line appears at all, independent of the rate value.
  stopajEnabled:      boolean('stopaj_enabled').notNull().default(false),
  stopajRate:         numeric('stopaj_rate', { precision: 5, scale: 4 }),                 // nullable — only relevant when stopajEnabled
  // avans kesintisi: flat rate × period gross (D-94); 0 by default (D-92)
  avansKesintisiRate: numeric('avans_kesintisi_rate', { precision: 5, scale: 4 }).notNull().default('0.0000'),
  createdByUserId:    text('created_by_user_id').references(() => users.id),  // Auth.js user; nullable
  finalizedAt:     timestamp('finalized_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('hakedis_periods_project_idx').on(t.projectId),
  index('hakedis_periods_status_idx').on(t.status),
  index('hakedis_periods_currency_idx').on(t.projectId, t.currencyCode),
]);
