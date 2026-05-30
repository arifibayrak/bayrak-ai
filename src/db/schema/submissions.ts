// submissions holds completed work-log entries created by the worker bot.
// status 'pending_audit' is the default — Phase 3 transitions to approved/rejected.
// D-13 Guard 2: unique('submissions_flow_id_unique') prevents double-confirm inserts.
// Phase 4 ready: geometry(location) column + GiST index for PostGIS nearest-segment.
import { pgTable, uuid, text, numeric, integer, boolean, timestamp, index, unique, geometry } from 'drizzle-orm/pg-core';
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
  // Phase 4: nearest-segment snap results (GEO-01, GEO-02)
  // All five columns are nullable — pre-Phase-4 rows have no spatial data (backfill out of scope).
  // snapped_point: the closest point on routes.geom to this submission's location.
  // Null when location_match = 'no_route' (no route on project or snap failed).
  snappedPoint: geometry('snapped_point', { type: 'point', mode: 'xy', srid: 4326 }),
  // segment_fraction: ST_LineLocatePoint result in [0.0, 1.0].
  // Null when location_match = 'no_route'.
  segmentFraction: numeric('segment_fraction', { precision: 10, scale: 8 }),
  // location_match: three-state source of truth (D-43/D-44).
  // 'near' = within threshold | 'far' = beyond threshold | 'no_route' = no route
  locationMatch: text('location_match', { enum: ['near', 'far', 'no_route'] }),
  // location_warning: true ONLY when location_match = 'far' (D-44).
  // Kept for SC2 compatibility and cheap boolean filtering.
  locationWarning: boolean('location_warning').default(false),
  // location_distance_m: metre distance from worker location to route.
  // Stored so fanOutToAuditors can format the D-47 caption without re-querying PostGIS.
  // Null when location_match = 'no_route'.
  locationDistanceM: numeric('location_distance_m', { precision: 12, scale: 2 }),
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
  // Phase 14: v4.0 chainage foundation — columns added here; values written at approval (Phase 15).
  // All nullable — pre-Phase-14 rows have no chainage data. Do NOT write these from bot-audit.ts.
  // chainage_m: the route chainage (in metres) at the snapped point, snapshotted at approval time.
  chainageM: numeric('chainage_m', { precision: 10, scale: 2 }),
  // routeGeometryVersion: ties the submission to the specific route version at approval time (D-04).
  // Enables audit trail: if the route is re-imported, we know which geometry version was active.
  routeGeometryVersion: integer('route_geometry_version'),
}, (t) => [
  // D-13 Guard 2: named UNIQUE on flow_id prevents double-confirm duplicate inserts
  unique('submissions_flow_id_unique').on(t.flowId),
  index('submissions_project_idx').on(t.projectId),
  index('submissions_person_idx').on(t.personId),
  index('submissions_status_idx').on(t.status),
  // GiST index mandatory for Phase 4 spatial queries (ST_DWithin, ST_ClosestPoint)
  index('submissions_location_gist').using('gist', t.location),
  // Phase 4: GiST index on snapped_point for Phase 5 map queries
  // (WHERE status='approved' AND snapped_point IS NOT NULL) — D-46
  index('submissions_snapped_point_gist').using('gist', t.snappedPoint),
]);
