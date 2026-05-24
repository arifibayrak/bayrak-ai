-- HAND-VERIFIED (2026-05-24): Phase 4 spatial layer migration.
-- 1. snapped_point: geometry(point,4326) — SRID 4326 added manually (drizzle-kit emitted geometry(point) without SRID).
-- 2. location_match: CHECK constraint added manually (drizzle-kit emitted bare text column; CHECK required per T-04-01 threat mitigation).
-- 3. GiST index on snapped_point: emitted correctly by drizzle-kit — no change.
-- WARNING: Do NOT re-run drizzle-kit generate on this file — the CHECK and SRID will be dropped.
ALTER TABLE "submissions" ADD COLUMN "snapped_point" geometry(point, 4326);--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "segment_fraction" numeric(10, 8);--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "location_match" text CHECK ("location_match" IN ('near', 'far', 'no_route'));--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "location_warning" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "location_distance_m" numeric(12, 2);--> statement-breakpoint
CREATE INDEX "submissions_snapped_point_gist" ON "submissions" USING gist ("snapped_point");
