---
title: Make the tenant_settings seed migration FK-safe (portable to fresh/preview DBs)
status: pending
priority: medium
created: 2026-05-27
origin_phase: "09"
area: db/migrations
resolves_phase: 14
---

# Make migration 0007 tenant_settings seed FK-safe

## Context

Migration `src/db/migrations/0007_v2_tenant_settings.sql` seeds a default-tenant settings row:

```sql
INSERT INTO tenant_settings (tenant_id, audit_sla_hours, rejection_rate_threshold, stalled_days)
VALUES ('00000000-0000-0000-0000-000000000001', 48, '0.3000', 7)
ON CONFLICT (tenant_id) DO NOTHING;
```

This INSERT has a foreign key to `tenants.id`. It succeeds on **production** (the default tenant
exists) but **fails with a FK violation on any DB where the default tenant is absent** — which is
the case on the **test branch DB** (tests create tenants dynamically, then truncate) and would also
break any fresh **preview/branch DB**.

During Phase 9 execution (plan 09-03), the test DB had to be reconciled manually: drop the partial
table → temporarily insert the default tenant → re-run `tsx src/db/migrate.ts` → delete the temp
rows. `0007` is already applied + journaled on both prod and test, so **`0007` itself must NOT be
edited** (changing an applied migration's SQL breaks the drizzle migration-hash integrity on prod).

## What's needed

Add a NEW follow-up migration (e.g. `0008_*`) — or fix the seed pattern for future tables — that
makes default-row seeding FK-safe. The portable pattern is a conditional insert:

```sql
INSERT INTO tenant_settings (tenant_id, audit_sla_hours, rejection_rate_threshold, stalled_days)
SELECT '00000000-0000-0000-0000-000000000001', 48, '0.3000', 7
WHERE EXISTS (SELECT 1 FROM tenants WHERE id = '00000000-0000-0000-0000-000000000001')
ON CONFLICT (tenant_id) DO NOTHING;
```

This no-ops gracefully when the default tenant is absent (test/preview) and seeds when present (prod).

## Notes

- `getTenantSettings` has a code-level default fallback, so a missing seed row is non-fatal at runtime
  — this is a migration-portability/dev-experience issue, not a production data bug.
- Consider adding a standing convention: never seed FK-bound rows unconditionally in schema migrations;
  always guard with `WHERE EXISTS`.
- Both prod and the test branch DB are currently correctly migrated (verified Phase 9 / plan 09-03).
