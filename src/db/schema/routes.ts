// CRITICAL: After `drizzle-kit generate`, open the generated migration SQL
// and change geometry(point,4326) → geometry(LineString,4326) for the `geom` column.
// Add this comment to the migration file to prevent silent regression.
import { pgTable, uuid, integer, timestamp, customType, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { tenants } from './tenants';

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
