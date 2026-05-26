-- HAND-WRITTEN (WR-05): drizzle-kit cannot emit CHECK constraints on numeric columns.
-- The hakedis_period_lines table is EMPTY in Phase 7 (populated in Phase 10), so adding
-- these CHECK constraints now is safe — there are no existing rows to violate them.
--
-- WR-05: 0004_v2_data_foundation.sql only guarded cumulative_qty_approved >= previous_cumulative_qty.
-- That does NOT prevent a negative period_qty (e.g. period_qty = -5 with a still-valid
-- cumulative >= previous), which would generate a negative period_value — a financial
-- integrity defect in a hakkediş certificate. These constraints close that gap.
-- WARNING: Do NOT re-run drizzle-kit generate over this file — the CHECK constraints will be dropped.
ALTER TABLE "hakedis_period_lines"
  ADD CONSTRAINT "hakedis_period_lines_period_qty_nonneg"
  CHECK (period_qty >= 0);
--> statement-breakpoint
ALTER TABLE "hakedis_period_lines"
  ADD CONSTRAINT "hakedis_period_lines_unit_price_snapshot_nonneg"
  CHECK (unit_price_snapshot >= 0);
