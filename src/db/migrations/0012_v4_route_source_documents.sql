-- HAND-WRITTEN (WR-06): follows 0009_v3_line_submissions.sql structure exactly.
-- Creates route_source_documents table for D-05 source-drawing version history audit trail.
-- Key design notes:
--   - D-05: "Keep ALL prior source drawings as version history."
--     Re-imports INSERT a new row — they never overwrite. This IS the version history.
--   - NO UNIQUE constraint on project_id (by design — re-imports create new history rows).
--   - project_id FK ON DELETE CASCADE: all history rows deleted when the project is deleted.
--   - tenant_id NOT NULL: all inserts must carry tenant_id (CLAUDE.md mandate + T-14-SRCDOC-FK).
--   - geometry_version: null for pdf-only reference docs; set for dxf imports that produce new geometry.
--   - Composite index on (project_id, uploaded_at DESC) for the version history list query.
--   - The INSERT-per-import write behavior is owned by Plan 14-04 (uploadDxf Server Action).
-- WARNING: Do NOT re-run drizzle-kit generate over this file.
-- Apply only via `npx tsx src/db/migrate.ts` (D-49).
CREATE TABLE "route_source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"blob_url" text NOT NULL,
	"doc_type" text NOT NULL,
	"source_crs" text,
	"source_layer" text,
	"geometry_version" integer,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "route_source_documents" ADD CONSTRAINT "route_source_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "route_source_documents" ADD CONSTRAINT "route_source_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Composite index: (project_id, uploaded_at DESC) for version history list — "newest import first".
-- USING btree is explicit per project precedent (0009 migration pattern).
CREATE INDEX "route_source_documents_project_uploaded_idx" ON "route_source_documents" USING btree ("project_id", "uploaded_at" DESC);
