'use server';

/**
 * src/actions/settings.ts
 *
 * Tenant-scoped, auth-guarded server actions for reading and writing
 * configurable alert thresholds stored in the `tenant_settings` table.
 *
 * Security:
 *   T-09-04-EoP: auth() guard throws 'Unauthorized' before any DB access (D-89)
 *   T-09-04-ID: WHERE tenant_id = ${tenantId} first condition in every query (V4)
 *   T-09-04-T: Zod validates all input ranges before any DB write (V5)
 *   T-09-04-SQLi: All values bound via Drizzle sql`` params, never sql.raw() (CR-03)
 */

import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * TenantSettings — the configurable alert thresholds for the tenant.
 *
 * - auditSlaHours: audit decisions taking longer than this are SLA breaches (D-84: 48h)
 * - rejectionRateThreshold: rejection rate exceeding this triggers an alert (D-84: 0.3000)
 *   Returned as string (Postgres numeric — callers parse with Number() for comparisons)
 * - stalledDays: projects with no approved submission in this many days are stalled (D-84: 7)
 */
export type TenantSettings = {
  auditSlaHours: number;
  rejectionRateThreshold: string;  // numeric(5,4) as string — money-math safe
  stalledDays: number;
};

// ── Validation schema (RESEARCH Pattern 8) ───────────────────────────────────

const settingsSchema = z.object({
  auditSlaHours: z.number().int().min(1).max(720),
  rejectionRateThreshold: z.number().min(0).max(1),
  stalledDays: z.number().int().min(1).max(365),
});

// ── D-84 code-level defaults (Moderate) ──────────────────────────────────────
// Returned by getTenantSettings() when no row exists for the tenant (test DB / fresh tenants).
// These mirror the migration seed values — single source of truth.

const D84_DEFAULTS: TenantSettings = {
  auditSlaHours: 48,
  rejectionRateThreshold: '0.3000',
  stalledDays: 7,
};

// ── getTenantSettings ─────────────────────────────────────────────────────────

/**
 * getTenantSettings — read the configured thresholds for the current tenant.
 *
 * Returns the seeded Moderate defaults (D-84) when no row exists for the tenant
 * (safe fallback for test DB / fresh deployments — Pitfall 1 prevention).
 *
 * Security: auth-guarded; tenant-scoped.
 */
export async function getTenantSettings(): Promise<TenantSettings> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  const result = await db.execute(sql`
    SELECT audit_sla_hours, rejection_rate_threshold, stalled_days
    FROM tenant_settings
    WHERE tenant_id = ${tenantId}
    LIMIT 1
  `);

  const row = result.rows[0];
  if (!row) {
    // No row yet — return D-84 Moderate defaults as a safe code-level fallback
    return D84_DEFAULTS;
  }

  return {
    auditSlaHours: Number(row.audit_sla_hours),
    rejectionRateThreshold: String(row.rejection_rate_threshold),
    stalledDays: Number(row.stalled_days),
  };
}

// ── updateTenantSettings ──────────────────────────────────────────────────────

/**
 * updateTenantSettings — upsert the threshold settings for the current tenant.
 *
 * D-89: office-engineer-only — throws 'Unauthorized' when auth() returns null.
 * Zod validation rejects out-of-range values before any DB write (V5).
 * Uses INSERT ... ON CONFLICT (tenant_id) DO UPDATE for idempotent upsert.
 *
 * Security: auth-guarded (throws 'Unauthorized'); tenant-scoped; zod-validated.
 * CR-03: all values bound via Drizzle sql`` params, never sql.raw().
 */
export async function updateTenantSettings(input: {
  auditSlaHours: number;
  rejectionRateThreshold: number;  // 0–1 fraction (stored as numeric in DB)
  stalledDays: number;
}): Promise<{ ok: true }> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  // Zod validation — rejects out-of-range values before any DB write (V5)
  const parsed = settingsSchema.parse(input);

  // Upsert: INSERT with ON CONFLICT DO UPDATE (idempotent, tenant-scoped)
  // All values are bound parameters (CR-03)
  await db.execute(sql`
    INSERT INTO tenant_settings (tenant_id, audit_sla_hours, rejection_rate_threshold, stalled_days, updated_at)
    VALUES (${tenantId}, ${parsed.auditSlaHours}, ${parsed.rejectionRateThreshold}, ${parsed.stalledDays}, NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      audit_sla_hours            = EXCLUDED.audit_sla_hours,
      rejection_rate_threshold   = EXCLUDED.rejection_rate_threshold,
      stalled_days               = EXCLUDED.stalled_days,
      updated_at                 = NOW()
  `);

  revalidatePath('/dashboard/overview');
  revalidatePath('/dashboard/settings');
  // WR-04 (09-REVIEW): revalidate people routes whose SLA breach display depends on
  // auditSlaHours, and stalled-project badge depends on stalledDays.
  // These pages are force-dynamic (re-fetch on every request) so cache revalidation
  // is not strictly required today, but adding it now makes the invalidation boundary
  // explicit and future-proof if caching is later added to these pages.
  revalidatePath('/dashboard/people');
  revalidatePath('/dashboard/people/[personId]', 'page');

  return { ok: true };
}
