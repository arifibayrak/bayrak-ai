-- HAND-WRITTEN (WR-06): drizzle-kit generate is used as a template source, but the output
-- requires hand-verification and editing per established project precedent (see 0005, 0007, 0009).
-- Key hand-edits applied:
--   1. All new columns in this migration are numeric/text/integer — no geometry hand-edit needed.
--      The existing routes.geom column is already geometry(LineString,4326) from 0000_lame_silver_sable.sql.
--   2. chainage_offset_m uses string literal DEFAULT '0' (not float) to avoid Pitfall 5 (numeric precision).
--   3. Partial index on submissions.chainage_m WHERE status = 'approved' — drizzle-kit does not emit
--      partial index predicates; this must be hand-authored (same precedent as 0005/0007 Pitfall 7).
--   4. FK-safe seed note (folded todo tenant-settings-seed-fk-safe): this migration adds NO new seed
--      rows referencing tenants. If a future edit adds a seed here, use the FK-safe pattern:
--        INSERT INTO ... SELECT ... WHERE EXISTS (SELECT 1 FROM tenants WHERE id = '...');
--      Do NOT edit 0007 (hash integrity — applied migration is immutable per Phase 09-03 decision).
-- WARNING: Do NOT re-run drizzle-kit generate over this file — the partial index and hand-verified
--          precision defaults will be lost. Apply only via `npx tsx src/db/migrate.ts` (D-49).
-- Note: statement-breakpoint separators (-- > statement-breakpoint) are MANDATORY — neon-http cannot execute multiple
--       DDL statements in a single prepared call (T-14-MULTISTMT mitigation, D-07-02 precedent).
ALTER TABLE "routes" ADD COLUMN "geometry_version" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "total_length_m" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "source_blob_url" text;
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "source_crs" text;
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "source_layer" text;
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "chainage_offset_m" numeric(12, 2) DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "chainage_m" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "route_geometry_version" integer;
--> statement-breakpoint
-- Partial index on submissions.chainage_m for Phase 15 chainage bucket queries.
-- WHERE status = 'approved' ensures the index only covers rows that have a chainage value.
-- Installed now (Phase 14), paid at query time (Phase 15) — same pattern as submissions_status_idx.
CREATE INDEX "submissions_chainage_m_idx" ON "submissions" ("chainage_m") WHERE "status" = 'approved';
