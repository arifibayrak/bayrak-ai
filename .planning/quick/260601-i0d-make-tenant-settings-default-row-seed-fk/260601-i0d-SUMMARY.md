---
quick_id: 260601-i0d
status: complete
description: Make tenant_settings default-row seed FK-safe via new migration 0015 (conditional WHERE EXISTS insert)
resolves_todo: tenant-settings-seed-fk-safe
completed: 2026-06-01
---

# Quick Task 260601-i0d: FK-safe tenant_settings seed migration

**Added migration `0015_v4_tenant_settings_seed_fk_safe.sql` that re-seeds the default-tenant `tenant_settings` row with a conditional `WHERE EXISTS` insert — fresh/preview/test DBs (where the default tenant is absent) now migrate cleanly instead of dying on the FK violation that `0007`'s unconditional `VALUES` insert caused.**

## What changed

- **`src/db/migrations/0015_v4_tenant_settings_seed_fk_safe.sql`** (new) — portable conditional seed:
  ```sql
  INSERT INTO "tenant_settings" (tenant_id, audit_sla_hours, rejection_rate_threshold, stalled_days)
  SELECT '00000000-0000-0000-0000-000000000001', 48, '0.3000', 7
  WHERE EXISTS (SELECT 1 FROM "tenants" WHERE id = '00000000-0000-0000-0000-000000000001')
  ON CONFLICT (tenant_id) DO NOTHING;
  ```
  No-ops when the default tenant is absent (test/preview), seeds when present (fresh prod-like), and is a no-op on existing prod via `ON CONFLICT DO NOTHING`.
- **`src/db/migrations/meta/_journal.json`** — appended idx 15 entry (`0015_v4_tenant_settings_seed_fk_safe`), matching the existing 2-space / no-trailing-newline drizzle format so the diff is a clean 7-line append (no whole-file reformat).
- **`0007_v2_tenant_settings.sql` left untouched** — its migration hash is journaled on prod; editing an applied migration breaks drizzle integrity.

## Verification

- Applied to **dev** branch (`npm run migrate`) → "Migrations complete".
- Applied to **test** branch (`npm run migrate:test`) → "Migrations complete" — this is the branch that previously broke with the FK violation; it now applies cleanly. **Bug fixed.**
- **Idempotent**: re-running `npm run migrate` → "Migrations complete" (drizzle skips applied migrations; the `ON CONFLICT` guard makes the INSERT itself idempotent).
- File-level: conditional `WHERE EXISTS` + `ON CONFLICT (tenant_id) DO NOTHING` present; SELECT-based (no `VALUES`).
- `npx tsc --noEmit` clean (no code changes).
- Dev DB confirmed: default-tenant settings row present (1).
- `drizzle-kit push` not used (D-49) — applied via the `migrate.ts` runner only.

## Notes

- Standing convention to carry forward: **never seed FK-bound rows unconditionally in schema migrations — always guard with `WHERE EXISTS`.**
- Closes pending todo `tenant-settings-seed-fk-safe` (origin phase 09, resolves_phase 14).
- Production impact: none (the row already exists there; new migration is a no-op). Value is dev-experience / migration portability for fresh, preview, and test DBs.
