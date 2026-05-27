-- HAND-WRITTEN (WR-06): drizzle-kit generate is used as a template source, but the output
-- requires hand-verification and editing per established project precedent (see 0005, 0006).
-- Key hand-edits applied:
--   1. numeric(5,4) precision and DEFAULT '0.3000' (string literal) explicitly verified —
--      drizzle-kit has been known to emit DEFAULT 0.3 (float) or drop precision (Pitfall 5).
--   2. UNIQUE constraint on tenant_id added (one row per tenant — drizzle-kit may not emit
--      inline UNIQUE as a separate ALTER TABLE constraint).
--   3. Idempotent seed INSERT for default tenant Moderate thresholds (D-84) appended.
--   4. FK reference "tenants"("id") included — matches tenant-settings.ts schema exactly.
-- WARNING: Do NOT re-run drizzle-kit generate over this file — the UNIQUE constraint and
--          seed INSERT will be lost. Apply only via `npx tsx src/db/migrate.ts` (D-49).
CREATE TABLE "tenant_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "audit_sla_hours" integer NOT NULL DEFAULT 48,
  "rejection_rate_threshold" numeric(5,4) NOT NULL DEFAULT '0.3000',
  "stalled_days" integer NOT NULL DEFAULT 7,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_tenant_id_unique" UNIQUE ("tenant_id");
--> statement-breakpoint
-- Seed default tenant Moderate thresholds (D-84): audit_sla_hours=48, rejection_rate=30%, stalled=7 days.
-- ON CONFLICT DO NOTHING makes this idempotent — re-running migrate.ts never creates a duplicate row.
INSERT INTO "tenant_settings" (tenant_id, audit_sla_hours, rejection_rate_threshold, stalled_days)
VALUES ('00000000-0000-0000-0000-000000000001', 48, '0.3000', 7)
ON CONFLICT (tenant_id) DO NOTHING;
