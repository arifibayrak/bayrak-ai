-- v5: route elevation sampling (terrain-sampled Z for real 3D).
-- Additive plain columns only — the `geom` column stays a 2D LineString.
-- Per-vertex Z + derived stats live here so we get an elevation profile, a true
-- 3D length, and min/max elevation without a risky geometry-typmod migration.
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "min_elevation_m" numeric(8,2);
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "max_elevation_m" numeric(8,2);
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "length_3d_m" numeric(12,2);
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "elevation_profile" jsonb;
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "elevation_sampled_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "elevation_source" text;
