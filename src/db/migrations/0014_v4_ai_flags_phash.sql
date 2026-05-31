-- HAND-WRITTEN: adds phash_hex + anomaly_detected columns to submission_ai_flags.
-- phash_hex: 64-char binary string from sharp-phash for perceptual-hash near-duplicate detection (AI-06).
-- anomaly_detected: multi-signal gate boolean (REVIEWS HIGH-3) — TRUE when ANY of the five D-01
--   advisory signals fired (photo mismatch, quality, location, duplicate, classification).
--   Downstream gate (Plan 04), read (Plan 05), and chainage join (Plan 05) key on THIS column,
--   not photoAnomalyScore alone (which only captures mismatch confidence, not all five signals).
-- Partial index on phash_hex: WHERE phash_hex IS NOT NULL AND status = 'done' — filters to
--   completed rows only; keeps index small and fast for the near-duplicate pre-filter query.
--
-- Apply only via `npx tsx src/db/migrate.ts` (D-49 — never drizzle-kit push;
-- drizzle-kit push is forbidden on this project due to spatial_ref_sys permission error).
-- Apply to BOTH Neon branches (dev + test):
--   npm run migrate          (dev: DATABASE_URL from .env.local)
--   npm run migrate:test     (test: TEST_DATABASE_URL from .env.local)
-- Do NOT re-run drizzle-kit generate over this file.
ALTER TABLE "submission_ai_flags" ADD COLUMN "phash_hex" text;
--> statement-breakpoint
ALTER TABLE "submission_ai_flags" ADD COLUMN "anomaly_detected" boolean;
--> statement-breakpoint
CREATE INDEX "submission_ai_flags_phash_idx" ON "submission_ai_flags" USING btree ("phash_hex") WHERE "phash_hex" IS NOT NULL AND "status" = 'done';
