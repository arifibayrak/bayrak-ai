-- HAND-WRITTEN (WR-06): follows 0009_v3_line_submissions.sql structure exactly.
-- Creates submission_ai_flags table for Phase 16 AI vision assist (AI-01..AI-06).
-- Key design notes:
--   - UNIQUE on submission_id: one AI flag row per submission (enforced at DB level, AI-05 gate).
--   - submission_id FK ON DELETE CASCADE: flag row deleted when its submission is deleted.
--   - tenant_id is nullable (D-09 single-tenant MVP pattern) but always supplied on insert (CLAUDE.md).
--   - raw_response jsonb: full Claude generateObject output stored for eval harness audit (AI-05).
--   - eval_passed: null until eval harness runs; flag UI hidden when null or false (AI-05 gate).
-- WARNING: Do NOT re-run drizzle-kit generate over this file.
-- Apply only via `npx tsx src/db/migrate.ts` (D-49).
CREATE TABLE "submission_ai_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"submission_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"photo_anomaly_score" numeric(4, 3),
	"work_classification" text,
	"anomaly_description" text,
	"eval_passed" boolean,
	"raw_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submission_ai_flags" ADD CONSTRAINT "submission_ai_flags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "submission_ai_flags" ADD CONSTRAINT "submission_ai_flags_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "submission_ai_flags_submission_idx" ON "submission_ai_flags" USING btree ("submission_id");
--> statement-breakpoint
CREATE INDEX "submission_ai_flags_status_idx" ON "submission_ai_flags" USING btree ("status");
--> statement-breakpoint
ALTER TABLE "submission_ai_flags" ADD CONSTRAINT "submission_ai_flags_submission_id_unique" UNIQUE("submission_id");
