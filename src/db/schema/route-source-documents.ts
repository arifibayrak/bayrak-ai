// route_source_documents — D-05 source-drawing version history audit table.
//
// Requirement D-05: "Keep ALL prior source drawings as version history."
// This table stores one IMMUTABLE row per import — re-imports INSERT a new row, never overwrite.
// routes.source_blob_url is a convenience "latest" pointer; this table is the audit trail of record.
//
// doc_type: 'dxf' for geometry-bearing drawings; 'pdf' for reference-only documents.
// source_crs / source_layer: null for pdf-type reference docs (no reprojection needed).
// geometry_version: null for pdf-only reference docs; set to routes.geometry_version for dxf imports.
//   Ties this source document to the route geometry version it produced.
//
// DO NOT add a UNIQUE constraint on project_id — re-imports must insert new rows.
// The INSERT-per-import write behavior is owned by Plan 14-04 (uploadDxf Server Action).
// tenant_id must be supplied on every INSERT (CLAUDE.md constraint).
import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { projects } from './projects';

export const routeSourceDocuments = pgTable('route_source_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  // tenant_id on every new table (CLAUDE.md constraint) — notNull for source documents
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  // project_id FK with cascade delete — history row deleted when the project is deleted
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  // blobUrl: the Vercel Blob public URL of the uploaded file (never changes after insert)
  blobUrl: text('blob_url').notNull(),
  // docType: 'dxf' | 'pdf' — determines whether CRS/layer/geometryVersion fields apply
  docType: text('doc_type').notNull(),
  // sourceCrs: null for pdf-only reference documents (no CRS needed)
  sourceCrs: text('source_crs'),
  // sourceLayer: the DXF layer selected during import; null for pdf-only reference docs
  sourceLayer: text('source_layer'),
  // geometryVersion: the routes.geometry_version this import produced.
  // null for pdf-only reference docs that do not generate a new route geometry.
  geometryVersion: integer('geometry_version'),
  // uploadedAt: set at insert time — immutable; used for chronological ordering
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Composite index on (project_id, uploaded_at DESC) for the version history list query.
  // "Show all source drawings for this project, newest first."
  index('route_source_documents_project_uploaded_idx').on(t.projectId, t.uploadedAt),
  // Note: NO unique on project_id — re-imports INSERT new rows (this IS the version history)
]);
