-- HAND-WRITTEN (WR-07): drizzle-kit generate is used as a template source, but the output
-- requires hand-verification and editing per established project precedent (see 0006, 0007).
-- Key hand-edits applied:
--   1. Removed the spurious CREATE TABLE tenant_settings DDL emitted by drizzle-kit
--      (tenant_settings was created in 0007_v2_tenant_settings.sql; drizzle-kit re-emits it
--      because the snapshot diverges — do NOT apply it again).
--   2. Part A: four deduction columns on hakedis_periods (D-91 / Phase 10):
--      tevkifat_fraction (nullable), stopaj_enabled (boolean, NOT NULL DEFAULT false),
--      stopaj_rate (nullable — only relevant when stopaj_enabled), avans_kesintisi_rate
--      (NOT NULL DEFAULT '0.0000'). The stopaj_enabled/stopaj_rate pair implements D-93.
--   3. Part B: DROP COLUMN "period_qty" then ADD COLUMN "period_qty" GENERATED ALWAYS AS
--      (cumulative_qty_approved - previous_cumulative_qty) STORED (D-104 / WR-03 DONE).
--      The DROP auto-removes the hakedis_period_lines_period_qty_nonneg CHECK constraint
--      (added in 0006_v2_period_qty_check.sql). The retained cumulative_check
--      (cumulative_qty_approved >= previous_cumulative_qty, from 0004_v2_data_foundation.sql)
--      mathematically guarantees period_qty >= 0 by GENERATED arithmetic.
--   4. The ALTER COLUMN DROP NOT NULL is a drizzle-kit artefact before dropping the column;
--      kept for correctness but the DROP COLUMN makes it effectively a no-op.
-- WARNING: Do NOT re-run drizzle-kit generate over this file — the hand-edits will be lost
--          and the spurious tenant_settings DDL will reappear. Apply only via
--          `npx tsx src/db/migrate.ts` (D-49; drizzle-kit push is blocked on this project).

-- Part A: Add missing deduction-rate columns to hakedis_periods (D-91 / Phase 10)
ALTER TABLE "hakedis_periods" ADD COLUMN "tevkifat_fraction" numeric(5, 4);
--> statement-breakpoint
ALTER TABLE "hakedis_periods" ADD COLUMN "stopaj_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "hakedis_periods" ADD COLUMN "stopaj_rate" numeric(5, 4);
--> statement-breakpoint
ALTER TABLE "hakedis_periods" ADD COLUMN "avans_kesintisi_rate" numeric(5, 4) DEFAULT '0.0000' NOT NULL;
--> statement-breakpoint

-- Part B: Convert period_qty to GENERATED ALWAYS AS STORED (D-104 / WR-03 DONE)
-- Table is empty until Phase 10 — no data migration needed.
-- Dropping the column also auto-drops the CHECK constraint
-- hakedis_period_lines_period_qty_nonneg (from 0006_v2_period_qty_check.sql).
ALTER TABLE "hakedis_period_lines" ALTER COLUMN "period_qty" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "hakedis_period_lines" DROP COLUMN "period_qty";
--> statement-breakpoint
ALTER TABLE "hakedis_period_lines" ADD COLUMN "period_qty" numeric(12, 3) GENERATED ALWAYS AS (cumulative_qty_approved - previous_cumulative_qty) STORED;
