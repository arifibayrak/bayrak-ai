-- Re-seed the default-tenant settings row FK-safely (portable to fresh/preview/test DBs).
-- 0007 seeded this unconditionally with an FK to tenants.id, which violates on any DB
-- where the default tenant is absent (the test branch DB, fresh preview/branch DBs).
-- This conditional insert no-ops when the default tenant does not exist and seeds when
-- it does. On prod the row already exists, so ON CONFLICT DO NOTHING makes this a no-op
-- there. Do NOT edit 0007 (its drizzle migration hash is journaled on prod).
-- Convention: never seed FK-bound rows unconditionally in schema migrations — guard with WHERE EXISTS.
INSERT INTO "tenant_settings" (tenant_id, audit_sla_hours, rejection_rate_threshold, stalled_days)
SELECT '00000000-0000-0000-0000-000000000001', 48, '0.3000', 7
WHERE EXISTS (SELECT 1 FROM "tenants" WHERE id = '00000000-0000-0000-0000-000000000001')
ON CONFLICT (tenant_id) DO NOTHING;
