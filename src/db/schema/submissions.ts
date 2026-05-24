// submissions holds completed work-log entries created by the worker bot.
// status 'pending_audit' is the default — Phase 3 transitions to approved/rejected.
// D-13 Guard 2: unique('submissions_flow_id_unique') prevents double-confirm inserts.
// Phase 4 ready: geometry(location) column + GiST index for PostGIS nearest-segment.
import { pgTable, uuid, text, numeric, timestamp, index, unique, geometry } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { people } from './people';
import { projects } from './projects';
import { boqItems } from './boq-items';

export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id), // nullable D-09
  flowId: uuid('flow_id').notNull(), // ties to conversation_state.flow_id (D-13 Guard 2)
  personId: uuid('person_id').notNull().references(() => people.id),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  boqItemId: uuid('boq_item_id').notNull().references(() => boqItems.id),
  photoUrl: text('photo_url').notNull(), // Vercel Blob URL
  photoFileId: text('photo_file_id'),    // Telegram file_id reference (nullable)
  // Phase 4 PostGIS: geometry point for nearest-segment matching (GEO-01/GEO-02)
  // Nullable until Phase 4 — location may be absent on older rows.
  location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }),
  locationLat: numeric('location_lat', { precision: 10, scale: 7 }),
  locationLon: numeric('location_lon', { precision: 10, scale: 7 }),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  notes: text('notes'), // nullable — LOG-07 allows skip (D-21)
  // status enum: pending_audit is the default after worker confirm (LOG-08)
  status: text('status', { enum: ['pending_audit', 'approved', 'rejected'] })
    .notNull()
    .default('pending_audit'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  // Phase 3: audit decision trail (D-38)
  // All three are nullable — no DEFAULT needed; backfill not required for existing pending_audit rows.
  decidedBy: uuid('decided_by').references(() => people.id),        // null until decided
  decidedAt: timestamp('decided_at', { withTimezone: true }),        // null until decided
  rejectionReason: text('rejection_reason'),                         // null unless rejected
}, (t) => [
  // D-13 Guard 2: named UNIQUE on flow_id prevents double-confirm duplicate inserts
  unique('submissions_flow_id_unique').on(t.flowId),
  index('submissions_project_idx').on(t.projectId),
  index('submissions_person_idx').on(t.personId),
  index('submissions_status_idx').on(t.status),
  // GiST index mandatory for Phase 4 spatial queries (ST_DWithin, ST_ClosestPoint)
  index('submissions_location_gist').using('gist', t.location),
]);
