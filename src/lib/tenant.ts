/**
 * src/lib/tenant.ts
 *
 * Tenant ID helper — always supplies a deterministic tenant_id for all inserts.
 *
 * Design rationale (D-09, Pitfall 3):
 * - tenant_id is nullable in schema to ease a future multi-tenant migration.
 * - In v1, application code ALWAYS supplies the tenant_id on insert — never
 *   leaves it NULL — so Phase 2+ lookups by tenant_id find all historical data.
 * - The fixed seed UUID is hardcoded as fallback so early bootstrap works
 *   before DATABASE_URL is provisioned (unit tests, CI, local dev).
 */

/** Fixed seed tenant UUID — matches the row seeded by src/db/seed.ts */
const FIXED_SEED_TENANT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * getDefaultTenantId — returns the active tenant UUID for v1 single-tenant operation.
 *
 * Reads BAYRAK_TENANT_ID env var with the hardcoded fallback so:
 * 1. Production: set BAYRAK_TENANT_ID=00000000-0000-0000-0000-000000000001 in .env.local
 * 2. Tests / CI: no env var needed — returns the fixed UUID deterministically
 * 3. Future multi-tenant: replace this function with a per-request tenant resolver
 */
export function getDefaultTenantId(): string {
  return process.env.BAYRAK_TENANT_ID ?? FIXED_SEED_TENANT_ID;
}
