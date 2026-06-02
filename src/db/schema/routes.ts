// CRITICAL: After `drizzle-kit generate`, open the generated migration SQL
// and change geometry(point,4326) → geometry(LineString,4326) for the `geom` column.
// Add this comment to the migration file to prevent silent regression.
import { pgTable, uuid, integer, numeric, text, timestamp, jsonb, customType, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { tenants } from './tenants';

/** One sampled point of the route's vertical profile (chainage metres → elevation metres). */
export type ElevationProfilePoint = { m: number; z: number };

// Drizzle's built-in geometry() defaults to 'point' in generated SQL.
// We declare 'LineString' here but MUST verify the generated migration SQL.
// After every `npx drizzle-kit generate`, grep the output for `geometry(point`
// and change it to `geometry(LineString`. See RESEARCH.md Pitfall 1.
const geomLinestring = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(LineString, 4326)';
  },
  // Insert: pass ST_GeomFromGeoJSON(?) string — handled in Server Action
  toDriver(v: string) { return v; },
  // Read: wrap in ST_AsGeoJSON() in select; parse JSON string to object
  fromDriver(v: string) { return v; },
});

export const routes = pgTable('routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  projectId: uuid('project_id').notNull().unique().references(() => projects.id, { onDelete: 'cascade' }),
  geom: geomLinestring('geom').notNull(),
  coordinateCount: integer('coordinate_count').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
  // Phase 14: v4.0 schema foundation — provenance + length + versioning columns
  // These columns are additive — existing uploadRoute still works unchanged.
  // geometry_version: incremented on each re-import (D-04, D-05, RTE-05)
  geometryVersion: integer('geometry_version').notNull().default(1),
  totalLengthM: numeric('total_length_m', { precision: 12, scale: 2 }),
  // sourceBlobUrl: convenience "latest" pointer to the uploaded drawing file.
  // route_source_documents is the D-05 audit trail of record for all prior versions.
  sourceBlobUrl: text('source_blob_url'),
  sourceCrs: text('source_crs'),
  sourceLayer: text('source_layer'),
  // chainage_offset_m: user-configurable calibration offset applied at display time.
  // All user-facing displays show: raw_chainage_m + offset (never store offset in submissions).
  chainageOffsetM: numeric('chainage_offset_m', { precision: 12, scale: 2 }).default('0'),
  // Phase: terrain elevation sampling (real 3D). Additive — geom stays 2D.
  // Populated by sampleRouteElevation() from a DEM (Mapbox Terrain-RGB).
  minElevationM: numeric('min_elevation_m', { precision: 8, scale: 2 }),
  maxElevationM: numeric('max_elevation_m', { precision: 8, scale: 2 }),
  length3dM: numeric('length_3d_m', { precision: 12, scale: 2 }),
  elevationProfile: jsonb('elevation_profile').$type<ElevationProfilePoint[]>(),
  elevationSampledAt: timestamp('elevation_sampled_at', { withTimezone: true }),
  elevationSource: text('elevation_source'),
}, (t) => [
  // GiST index mandatory for spatial queries (Phase 4+)
  index('routes_geom_gist').using('gist', t.geom),
  index('routes_project_idx').on(t.projectId),
]);

/*
 * MANUAL MIGRATION EDIT REQUIRED:
 * After `npx drizzle-kit generate`, open the generated .sql file.
 * Find: geometry(point, 4326)   ← Drizzle default
 * Change to: geometry(LineString, 4326)
 * Add this comment above the column: -- HAND-EDITED: Drizzle generates point; must be linestring
 * Do NOT re-run generate without re-applying this edit.
 */
