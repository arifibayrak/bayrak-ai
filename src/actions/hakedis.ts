'use server';

/**
 * src/actions/hakedis.ts
 *
 * All hakkediş (progress-payment) server actions.
 *
 * Financial core: every number computed in Postgres `numeric` (money-math lock — D-90).
 * Istanbul-tz inclusive cutoff for approved-qty aggregation (D-100 / Pitfall 3).
 * Finalized-only chaining for previous-cumulative (D-99 / Pitfall 4).
 * period_qty is GENERATED ALWAYS AS STORED — never inserted explicitly (D-104 / Pitfall 1).
 * COALESCE on nullable tevkifat_fraction / stopaj_rate (Pitfall 5).
 *
 * Security:
 *   T-10-02-EoP: `const session = await auth()` is the FIRST statement of every exported fn
 *   T-10-02-IDOR-P: every query includes `AND tenant_id = ${tenantId}`; projectId IDOR-verified
 *   T-10-02-IMM: finalize/recompute/delete check status === 'draft' before any write
 *   T-10-02-FLOAT: all arithmetic in Postgres numeric; decimal.js for display only
 *   T-10-02-SQLi: all values bound via Drizzle sql`` params; never sql.raw() for user input
 *   T-10-02-XCUR: only BOQ items with currency_code = period.currencyCode included (D-101)
 *   T-10-02-NULL: COALESCE(tevkifat_fraction, 0) and COALESCE(stopaj_rate, 0) in deduction SQL
 */

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';
import { logOfficeActivity } from '@/lib/log-office-activity';
import { ALLOWED_CURRENCIES } from '@/lib/currencies';
import type { HakedisStatus } from '@/db/schema/hakedis-periods';

// ── Validation schemas ────────────────────────────────────────────────────────

/**
 * createPeriodSchema — validates inputs for createPeriod.
 * Rates arrive as 0-1 fractions (form converts % → fraction before calling).
 */
const createPeriodSchema = z.object({
  projectId: z.string().uuid(),
  periodNumber: z.string().min(1).max(50).optional(),
  periodStartDate: z.string().optional(),
  periodEndDate: z.string().min(1),
  currencyCode: z.enum(ALLOWED_CURRENCIES),
  kdvRate: z.string().refine(s => {
    const n = Number(s); return !isNaN(n) && n >= 0 && n <= 1;
  }).default('0.2000'),
  tevkifatFraction: z.string().refine(s => {
    const n = Number(s); return !isNaN(n) && n >= 0 && n <= 1;
  }).default('0.4000'),
  retentionRate: z.string().refine(s => {
    const n = Number(s); return !isNaN(n) && n >= 0 && n <= 1;
  }).default('0.0500'),
  avansKesintisiRate: z.string().refine(s => {
    const n = Number(s); return !isNaN(n) && n >= 0 && n <= 1;
  }).default('0.0000'),
  stopajEnabled: z.boolean().default(false),
  stopajRate: z.string().optional().refine(s => {
    if (s === undefined || s === null) return true;
    const n = Number(s); return !isNaN(n) && n >= 0 && n <= 1;
  }).default('0.0200'),
});

// ── Lifecycle transition table (D-95) ─────────────────────────────────────────

/**
 * VALID_TRANSITIONS — the allowed payment-status advance for updatePaymentStatus().
 * draft is terminal here (use finalizePeriod()); paid is terminal everywhere.
 */
const VALID_TRANSITIONS: Record<HakedisStatus, HakedisStatus | null> = {
  draft: null,         // draft → use finalizePeriod(), not updatePaymentStatus()
  finalized: 'submitted',
  submitted: 'paid',
  paid: null,          // terminal — no further transitions
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type PeriodDeductions = {
  gross: string;
  kdv: string;
  tevkifat: string;
  stopaj: string;
  teminat: string;
  avans: string;
  net: string;
};

export type PeriodLine = {
  id: string;
  boqItemId: string;
  materialSnapshot: string;
  unitSnapshot: string;
  currencyCodeSnapshot: string;
  unitPriceSnapshot: string;
  cumulativeQtyApproved: string;
  previousCumulativeQty: string;
  periodQty: string;
  periodValue: string;
  cumulativeValue: string;
};

export type PeriodHeader = {
  id: string;
  tenantId: string | null;
  projectId: string;
  periodNumber: string;
  periodStartDate: string | null;
  periodEndDate: string;
  currencyCode: string;
  status: string;
  kdvRate: string;
  retentionRate: string;
  tevkifatFraction: string | null;
  stopajEnabled: boolean;
  stopajRate: string | null;
  avansKesintisiRate: string;
  createdByUserId: string | null;
  finalizedAt: string | null;
};

export type PeriodListRow = {
  id: string;
  periodNumber: string;
  periodEndDate: string;
  currencyCode: string;
  status: string;
  netByDisplay: string | null;
};

export type UnpricedItem = {
  id: string;
  material: string;
  unit: string;
};

/**
 * LineSubmission — SDH-02 traceability row for getLineSubmissions().
 *
 * Returned by the new Phase 12 getter and consumed by Plan 04's
 * LineSubmissionsPanel UI. decidedAt is an ISO string (Postgres timestamptz
 * round-tripped through Date → toISOString) so the client can format with
 * Intl.DateTimeFormat without an extra parse step.
 */
export type LineSubmission = {
  submissionId: string;
  workerName: string;
  decidedAt: string;
  qtyContributed: string;
  photoUrl: string;
  notes: string | null;
};

// ── recomputeHakedisLine ──────────────────────────────────────────────────────

/**
 * recomputeHakedisLine — scoped recompute for ONE (project_id, boq_item_id, currency_code).
 *
 * D-117 / Phase 12: the auditor-approval post-commit hook in src/lib/bot-audit.ts
 * calls this AFTER the submissions UPDATE has COMMITTED. It is ALSO called from the
 * manual recomputePeriodLines loop below — single body, two callers, zero math drift.
 *
 * D-118: silently no-ops when no draft period exists for (project_id, currency_code).
 *         The approval still feeds the cumulative count via D-100; the next draft
 *         period the office creates will pick it up naturally.
 *
 * D-119: writes hakedis_line_submissions rows alongside the UPSERT (INSERT…SELECT
 *         FROM submissions ON CONFLICT DO UPDATE) so the per-line traceability
 *         surface (SDH-02) is populated atomically with the line itself.
 *
 * Pitfall 4 (finalize-during-approve race): re-checks period.status = 'draft' on
 *           the loaded row. If a Finalize landed between the approve commit and
 *           this call, SKIP cleanly — no write to a finalized snapshot. The
 *           approval still increments approved_qty and writes decided_at, so on
 *           the NEXT period the office creates this submission is counted via D-100.
 *
 * Pitfall 5 (no Auth.js session): NOT auth-guarded. Bot path has no Next.js
 *           request scope and no Auth.js session. NEVER calls logOfficeActivity
 *           from inside this function — the actor_user_id FK to users would
 *           violate, and after() requires request scope.
 *
 * Money math: every multiplication runs in Postgres numeric (qty * unit_price).
 *             qty_contributed is copied byte-identical from submissions.quantity
 *             via INSERT…SELECT — never multiplied in JS.
 *
 * Idempotency: ON CONFLICT (period_id, boq_item_id) DO UPDATE on hakedis_period_lines
 *              + ON CONFLICT (period_line_id, submission_id) DO UPDATE on
 *              hakedis_line_submissions. Re-firing for the same submission yields
 *              the same final state (D-13 audit-handler replay safe).
 */
export async function recomputeHakedisLine(
  projectId: string,
  boqItemId: string,
  currencyCode: string,
): Promise<{ updated: boolean; periodLineId: string | null }> {
  const tenantId = getDefaultTenantId();

  // Step 1: Find the open draft period for (project, currency). D-118: no-op if none.
  const draftPeriod = await db.execute(sql`
    SELECT id, status, period_end_date
    FROM hakedis_periods
    WHERE project_id    = ${projectId}
      AND tenant_id     = ${tenantId}
      AND currency_code = ${currencyCode}
      AND status        = 'draft'
    ORDER BY period_end_date DESC
    LIMIT 1
  `);
  if (draftPeriod.rows.length === 0) {
    return { updated: false, periodLineId: null };  // D-118
  }

  // Pitfall 4 defense-in-depth: re-check status on the loaded row.
  // The WHERE clause above already filters status='draft', so this is a no-op
  // for the WHERE-matched path. Kept explicit so a future code-shape refactor
  // (e.g., dropping the WHERE filter) cannot silently introduce a finalize-race.
  if (String(draftPeriod.rows[0].status) !== 'draft') {
    return { updated: false, periodLineId: null };
  }

  const periodId      = String(draftPeriod.rows[0].id);
  const periodEndDate = String(draftPeriod.rows[0].period_end_date);

  // Step 2: Cumulative aggregation scoped to this single BOQ item.
  //   - D-100: SUM(approved WHERE decided_at <= period_end_date Istanbul tz)
  //   - D-103: unit_price IS NOT NULL excludes unpriced items
  //   - D-101: only the period's currency_code (no cross-currency sums)
  // If the result is empty (no approved submissions OR unpriced item) → no-op.
  const cumulativeResult = await db.execute(sql`
    SELECT
      b.id              AS boq_item_id,
      b.material,
      b.unit,
      b.currency_code,
      b.unit_price,
      COALESCE(
        SUM(s.quantity::numeric)
          FILTER (
            WHERE s.status = 'approved'
              AND s.decided_at <= (${periodEndDate}::date + interval '1 day')
                AT TIME ZONE 'Europe/Istanbul'
          ),
        0
      ) AS cumulative_qty_approved
    FROM boq_items b
    LEFT JOIN submissions s
      ON s.boq_item_id = b.id
      AND s.tenant_id  = ${tenantId}
    WHERE b.project_id    = ${projectId}
      AND b.id = ${boqItemId}
      AND b.tenant_id     = ${tenantId}
      AND b.currency_code = ${currencyCode}
      AND b.unit_price IS NOT NULL
    GROUP BY b.id, b.material, b.unit, b.currency_code, b.unit_price
    HAVING COALESCE(
      SUM(s.quantity::numeric)
        FILTER (
          WHERE s.status = 'approved'
            AND s.decided_at <= (${periodEndDate}::date + interval '1 day')
              AT TIME ZONE 'Europe/Istanbul'
        ),
      0
    ) > 0
  `);
  if (cumulativeResult.rows.length === 0) {
    return { updated: false, periodLineId: null };
  }

  const row = cumulativeResult.rows[0];
  const cumulative = String(row.cumulative_qty_approved);
  const unitPrice  = String(row.unit_price);
  const material   = String(row.material);
  const unit       = String(row.unit);
  const currCode   = String(row.currency_code);

  // Step 3: Previous-cumulative from the most recent FINALIZED period for this BOQ item.
  // D-99: previous always comes from the most recent finalized period (sequential
  // finalization). status != 'draft' excludes draft periods; only locked
  // finalized/submitted/paid count toward previous_cumulative_qty.
  const prevResult = await db.execute(sql`
    SELECT hpl.cumulative_qty_approved
    FROM hakedis_period_lines hpl
    JOIN hakedis_periods hp ON hp.id = hpl.period_id
    WHERE hp.project_id      = ${projectId}
      AND hp.tenant_id       = ${tenantId}
      AND hp.currency_code   = ${currencyCode}
      AND hp.status          != 'draft'
      AND hp.period_end_date < ${periodEndDate}
      AND hpl.boq_item_id = ${boqItemId}
    ORDER BY hp.period_end_date DESC
    LIMIT 1
  `);
  const previous = prevResult.rows.length > 0
    ? String(prevResult.rows[0].cumulative_qty_approved)
    : '0';

  // Step 4: UPSERT the hakedis_period_lines row.
  // Open Question 4 RESOLVED: ON CONFLICT (period_id, boq_item_id) DO UPDATE.
  // The UNIQUE constraint hakedis_period_lines_period_boq_unique (added in Plan 01,
  // applied in Plan 02 migration 0009) is the ON CONFLICT target.
  // period_qty is GENERATED — never supply (D-104 / Pitfall 1).
  const upsertResult = await db.execute(sql`
    INSERT INTO hakedis_period_lines (
      tenant_id,
      period_id,
      boq_item_id,
      material_snapshot,
      unit_snapshot,
      currency_code_snapshot,
      unit_price_snapshot,
      cumulative_qty_approved,
      previous_cumulative_qty,
      period_value,
      cumulative_value
    ) VALUES (
      ${tenantId},
      ${periodId},
      ${boqItemId},
      ${material},
      ${unit},
      ${currCode},
      ${unitPrice},
      ${cumulative},
      ${previous},
      ((${cumulative}::numeric - ${previous}::numeric) * ${unitPrice}::numeric),
      (${cumulative}::numeric * ${unitPrice}::numeric)
    )
    ON CONFLICT ON CONSTRAINT "hakedis_period_lines_period_boq_unique"
    DO UPDATE SET
      cumulative_qty_approved = EXCLUDED.cumulative_qty_approved,
      previous_cumulative_qty = EXCLUDED.previous_cumulative_qty,
      period_value            = EXCLUDED.period_value,
      cumulative_value        = EXCLUDED.cumulative_value,
      unit_price_snapshot     = EXCLUDED.unit_price_snapshot,
      material_snapshot       = EXCLUDED.material_snapshot,
      unit_snapshot           = EXCLUDED.unit_snapshot,
      currency_code_snapshot  = EXCLUDED.currency_code_snapshot
    RETURNING id
  `);
  const periodLineId = String(upsertResult.rows[0].id);

  // Step 5: Populate the D-119 join table — INSERT…SELECT from submissions.
  //
  // Delta-only semantic (Open Question 1 RESOLVED): exclude submissions already
  // counted by a prior FINALIZED period's line. The join table represents the
  // CURRENT period's delta (what produced period_qty), not the cumulative.
  //
  // qty_contributed comes straight from submissions.quantity — Postgres numeric
  // round-tripped without any JS-side multiplication (money-math lock D-90).
  //
  // ON CONFLICT (period_line_id, submission_id) DO UPDATE makes this idempotent
  // under D-13 audit-handler replay: re-firing for the same submission UPDATEs
  // qty_contributed (no-op if quantity is immutable; future-safe for any "edit
  // approved qty" flow that may land later).
  await db.execute(sql`
    INSERT INTO hakedis_line_submissions (tenant_id, period_line_id, submission_id, qty_contributed)
    SELECT
      ${tenantId},
      ${periodLineId},
      s.id,
      s.quantity
    FROM submissions s
    WHERE s.boq_item_id = ${boqItemId}
      AND s.tenant_id   = ${tenantId}
      AND s.status      = 'approved'
      AND s.decided_at <= (${periodEndDate}::date + interval '1 day')
            AT TIME ZONE 'Europe/Istanbul'
      AND NOT EXISTS (
        SELECT 1
        FROM hakedis_line_submissions hls2
        JOIN hakedis_period_lines hpl2 ON hpl2.id = hls2.period_line_id
        JOIN hakedis_periods hp2 ON hp2.id = hpl2.period_id
        WHERE hls2.submission_id = s.id
          AND hp2.status        != 'draft'
          AND hp2.period_end_date < ${periodEndDate}
      )
    ON CONFLICT (period_line_id, submission_id)
    DO UPDATE SET qty_contributed = EXCLUDED.qty_contributed
  `);

  return { updated: true, periodLineId };
}

// ── getLineSubmissions ────────────────────────────────────────────────────────

/**
 * getLineSubmissions — SDH-02 traceability: list every approved submission that
 * contributed to a hakkediş line, with worker name + photo + decided_at + qty.
 *
 * Auth-guarded; tenant-scoped via the period_line join.
 * Returns rows sorted by decided_at DESC (most recent contribution first).
 *
 * Plan 04 consumes this from LineSubmissionsPanel — the expand-row UI shows
 * one row per contributing submission with the auditor's decision timestamp.
 *
 * Security: T-10-02-IDOR-P — the tenant_id filter is enforced via the
 * hakedis_period_lines join (already tenant-scoped) so direct cross-tenant
 * reads are impossible.
 */
export async function getLineSubmissions(periodLineId: string): Promise<LineSubmission[]> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  const result = await db.execute(sql`
    SELECT
      hls.submission_id,
      hls.qty_contributed,
      s.decided_at,
      s.photo_url,
      s.notes,
      p.display_name AS worker_name
    FROM hakedis_line_submissions hls
    JOIN submissions s        ON s.id  = hls.submission_id
    JOIN people      p        ON p.id  = s.person_id
    JOIN hakedis_period_lines hpl ON hpl.id = hls.period_line_id
    WHERE hls.period_line_id = ${periodLineId}
      AND hpl.tenant_id      = ${tenantId}
    ORDER BY s.decided_at DESC
  `);

  return result.rows.map(r => ({
    submissionId:   String(r.submission_id),
    workerName:     String(r.worker_name),
    decidedAt:      r.decided_at instanceof Date
                      ? r.decided_at.toISOString()
                      : String(r.decided_at),
    qtyContributed: String(r.qty_contributed),
    photoUrl:       String(r.photo_url),
    notes:          r.notes != null ? String(r.notes) : null,
  }));
}

// ── recomputePeriodLines ──────────────────────────────────────────────────────

/**
 * recomputePeriodLines — aggregate approved-qty per BOQ item and (re-)insert all
 * period lines. Safe to call from createPeriod (compute-on-create, D-98) or via
 * the "Yeniden Hesapla" UI button (draft-only manual recompute).
 *
 * Immutability lock: throws if period.status !== 'draft' (D-96 / Pitfall 7).
 * Currency scope: only BOQ items where currency_code = period.currencyCode (D-101).
 * Istanbul cutoff: decided_at ≤ (period_end_date + 1 day) AT TIME ZONE 'Europe/Istanbul' (D-100 / Pitfall 3).
 * Previous-cumulative: from the most recent FINALIZED period for the same project+currency (D-99 / Pitfall 4).
 * INSERT: never writes period_qty — it is GENERATED ALWAYS AS STORED (D-104 / Pitfall 1).
 *
 * Security: auth-guarded; tenant-scoped.
 */
export async function recomputePeriodLines(periodId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  // Fetch period metadata — scoped to tenant (T-10-02-IDOR-P)
  const periodResult = await db.execute(sql`
    SELECT id, status, project_id, currency_code, period_end_date
    FROM hakedis_periods
    WHERE id = ${periodId}
      AND tenant_id = ${tenantId}
  `);
  const period = periodResult.rows[0];
  if (!period) throw new Error('Period not found');
  if (period.status !== 'draft') throw new Error('Period is not in draft status');

  const projectId = String(period.project_id);
  const currencyCode = String(period.currency_code);
  const periodEndDate = String(period.period_end_date);

  // DELETE existing lines (idempotent re-compute).
  // The hakedis_period_lines.period_id FK on hakedis_line_submissions CASCADEs,
  // so any join rows for this draft period are dropped here too — recomputeHakedisLine
  // below re-populates them via INSERT…SELECT (Phase 12 D-119).
  await db.execute(sql`
    DELETE FROM hakedis_period_lines
    WHERE period_id = ${periodId}
      AND tenant_id = ${tenantId}
  `);

  // Phase 12 refactor (Plan 12-03): math now lives in recomputeHakedisLine — the
  // SAME helper the audit-handler post-commit hook calls (D-117). Single body,
  // two callers, zero math drift.
  //
  // Step 1: enumerate (boq_item, currency) pairs with cumulative > 0. The HAVING
  // clause + unit_price IS NOT NULL filter mirrors the previous body so the v2.0
  // selection set (Phase 10's HAK-02 / D-102 / D-103 / D-101 invariants) is
  // preserved byte-identical.
  const itemsResult = await db.execute(sql`
    SELECT
      b.id            AS boq_item_id,
      b.currency_code
    FROM boq_items b
    LEFT JOIN submissions s
      ON s.boq_item_id = b.id
      AND s.tenant_id  = ${tenantId}
    WHERE b.project_id    = ${projectId}
      AND b.tenant_id     = ${tenantId}
      AND b.currency_code = ${currencyCode}
      AND b.unit_price IS NOT NULL
    GROUP BY b.id, b.currency_code
    HAVING COALESCE(
      SUM(s.quantity::numeric)
        FILTER (
          WHERE s.status = 'approved'
            AND s.decided_at <= (${periodEndDate}::date + interval '1 day')
              AT TIME ZONE 'Europe/Istanbul'
        ),
      0
    ) > 0
  `);

  // Step 2: For each priced item with cumulative > 0, call the scoped helper.
  // The helper handles UPSERT semantics (ON CONFLICT) but the prior DELETE
  // guarantees a clean INSERT path — equivalent to v2.0's DELETE-then-INSERT
  // shape for the manual Recompute UX.
  for (const row of itemsResult.rows) {
    const itemId   = String(row.boq_item_id);
    const itemCurr = String(row.currency_code);
    await recomputeHakedisLine(projectId, itemId, itemCurr);
  }

  return { ok: true };
}

// ── createPeriod ──────────────────────────────────────────────────────────────

/**
 * createPeriod — insert a draft hakedis_period and immediately compute its lines (D-98).
 *
 * IDOR guard: verifies projectId belongs to the current tenant before INSERT (CR-01).
 * Period-number auto-suggest: HK-{YYYY}-{NN} derived from COUNT of periods in the year (OQ-3).
 * Activity log: hakedis_period_created (D-97).
 *
 * Security: auth-guarded; tenant-scoped; zod-validated.
 */
export async function createPeriod(input: {
  projectId: string;
  periodNumber?: string;
  periodStartDate?: string;
  periodEndDate: string;
  currencyCode: string;
  kdvRate?: string;
  tevkifatFraction?: string;
  retentionRate?: string;
  avansKesintisiRate?: string;
  stopajEnabled?: boolean;
  stopajRate?: string;
}): Promise<{ ok: true; periodId: string }> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  const parsed = createPeriodSchema.parse(input);

  // CR-01: IDOR guard — verify project belongs to this tenant (T-10-02-IDOR-P)
  const projectCheck = await db.execute(sql`
    SELECT id FROM projects
    WHERE id = ${parsed.projectId}
      AND tenant_id = ${tenantId}
  `);
  if (projectCheck.rows.length === 0) throw new Error('Project not found');

  // Auto-suggest period number if not provided (OQ-3: HK-{YYYY}-{NN})
  let periodNumber = parsed.periodNumber;
  if (!periodNumber) {
    const year = parsed.periodEndDate.slice(0, 4);
    const countResult = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM hakedis_periods
      WHERE project_id = ${parsed.projectId}
        AND tenant_id  = ${tenantId}
        AND period_end_date >= ${year + '-01-01'}
    `);
    const cnt = Number(countResult.rows[0]?.cnt ?? 0);
    const nn = String(cnt + 1).padStart(2, '0');
    periodNumber = `HK-${year}-${nn}`;
  }

  // INSERT the draft period (status defaults to 'draft' in schema)
  const insertResult = await db.execute(sql`
    INSERT INTO hakedis_periods (
      tenant_id,
      project_id,
      period_number,
      period_start_date,
      period_end_date,
      currency_code,
      status,
      kdv_rate,
      tevkifat_fraction,
      retention_rate,
      avans_kesintisi_rate,
      stopaj_enabled,
      stopaj_rate,
      created_by_user_id
    ) VALUES (
      ${tenantId},
      ${parsed.projectId},
      ${periodNumber},
      ${parsed.periodStartDate ?? null},
      ${parsed.periodEndDate},
      ${parsed.currencyCode},
      'draft',
      ${parsed.kdvRate},
      ${parsed.tevkifatFraction},
      ${parsed.retentionRate},
      ${parsed.avansKesintisiRate},
      ${parsed.stopajEnabled},
      ${parsed.stopajRate ?? null},
      ${session.user?.id ?? null}
    )
    RETURNING id
  `);
  const periodId = String(insertResult.rows[0].id);

  // Compute lines immediately (D-98: compute on create)
  await recomputePeriodLines(periodId);

  // Fire-and-forget activity log (CR-04: guard empty actorUserId)
  if (session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'hakedis_period_created',
      entityType: 'hakedis_period',
      entityId: periodId,
      projectId: parsed.projectId,
      metadata: { periodNumber, currencyCode: parsed.currencyCode },
    });
  }

  revalidatePath('/dashboard/hakedis');
  return { ok: true, periodId };
}

// ── getPeriodsByProject ───────────────────────────────────────────────────────

/**
 * getPeriodsByProject — list all periods for a project, including the computed
 * net payable per period (null when no lines exist, e.g. fresh draft with no approved items).
 *
 * Net is computed in Postgres numeric via the D-90 deduction formula applied to
 * SUM(period_value) for each period (same formula as getPeriodDetail deductions).
 *
 * Security: auth-guarded; tenant-scoped (T-10-02-IDOR-P, Pitfall 8).
 */
export async function getPeriodsByProject(projectId: string): Promise<PeriodListRow[]> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  const result = await db.execute(sql`
    SELECT
      hp.id,
      hp.period_number,
      hp.period_end_date,
      hp.currency_code,
      hp.status,
      -- Compute net payable in Postgres numeric via D-90 deduction chain
      -- COALESCE on nullable rates (Pitfall 5 prevention)
      -- Returns NULL when no lines exist (no approved items / empty draft)
      (
        SELECT
          SUM(hpl.period_value::numeric)
            + (SUM(hpl.period_value::numeric) * COALESCE(hp2.kdv_rate::numeric, 0)
               - SUM(hpl.period_value::numeric) * COALESCE(hp2.kdv_rate::numeric, 0)
                 * COALESCE(hp2.tevkifat_fraction::numeric, 0))
            - CASE WHEN hp2.stopaj_enabled
                THEN SUM(hpl.period_value::numeric) * COALESCE(hp2.stopaj_rate::numeric, 0)
                ELSE 0
              END
            - SUM(hpl.period_value::numeric) * COALESCE(hp2.retention_rate::numeric, 0)
            - SUM(hpl.period_value::numeric) * COALESCE(hp2.avans_kesintisi_rate::numeric, 0)
        FROM hakedis_period_lines hpl
        JOIN hakedis_periods hp2 ON hp2.id = hpl.period_id
        WHERE hpl.period_id = hp.id
          AND hpl.tenant_id = ${tenantId}
        GROUP BY hp2.id
      ) AS net_by_display
    FROM hakedis_periods hp
    WHERE hp.project_id = ${projectId}
      AND hp.tenant_id  = ${tenantId}
    ORDER BY hp.period_end_date DESC
  `);

  return result.rows.map(row => ({
    id: String(row.id),
    periodNumber: String(row.period_number),
    periodEndDate: String(row.period_end_date),
    currencyCode: String(row.currency_code),
    status: String(row.status),
    netByDisplay: row.net_by_display != null ? String(row.net_by_display) : null,
  }));
}

// ── getPeriodDetail ───────────────────────────────────────────────────────────

/**
 * getPeriodDetail — return the full period header, stored lines, D-90 deduction chain,
 * and a list of unpriced BOQ items (D-103 warning).
 *
 * Deduction chain computed in a single Postgres query over SUM(period_value)
 * using COALESCE for nullable rates (Pitfall 5) and CASE for stopaj_enabled.
 * Returns null for deductions when period has no lines.
 *
 * Security: auth-guarded; tenant-scoped (T-10-02-IDOR-P).
 */
export async function getPeriodDetail(periodId: string): Promise<{
  period: PeriodHeader;
  lines: PeriodLine[];
  deductions: PeriodDeductions | null;
  unpricedItems: UnpricedItem[];
}> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  // Fetch period header
  const periodResult = await db.execute(sql`
    SELECT
      id, tenant_id, project_id, period_number, period_start_date, period_end_date,
      currency_code, status, kdv_rate, retention_rate, tevkifat_fraction,
      stopaj_enabled, stopaj_rate, avans_kesintisi_rate, created_by_user_id, finalized_at
    FROM hakedis_periods
    WHERE id = ${periodId}
      AND tenant_id = ${tenantId}
  `);
  const periodRow = periodResult.rows[0];
  if (!periodRow) throw new Error('Period not found');

  const period: PeriodHeader = {
    id: String(periodRow.id),
    tenantId: periodRow.tenant_id != null ? String(periodRow.tenant_id) : null,
    projectId: String(periodRow.project_id),
    periodNumber: String(periodRow.period_number),
    periodStartDate: periodRow.period_start_date != null ? String(periodRow.period_start_date) : null,
    periodEndDate: String(periodRow.period_end_date),
    currencyCode: String(periodRow.currency_code),
    status: String(periodRow.status),
    kdvRate: String(periodRow.kdv_rate),
    retentionRate: String(periodRow.retention_rate),
    tevkifatFraction: periodRow.tevkifat_fraction != null ? String(periodRow.tevkifat_fraction) : null,
    stopajEnabled: Boolean(periodRow.stopaj_enabled),
    stopajRate: periodRow.stopaj_rate != null ? String(periodRow.stopaj_rate) : null,
    avansKesintisiRate: String(periodRow.avans_kesintisi_rate),
    createdByUserId: periodRow.created_by_user_id != null ? String(periodRow.created_by_user_id) : null,
    finalizedAt: periodRow.finalized_at != null ? String(periodRow.finalized_at) : null,
  };

  // Fetch stored lines ordered by material
  const linesResult = await db.execute(sql`
    SELECT
      id, boq_item_id, material_snapshot, unit_snapshot, currency_code_snapshot,
      unit_price_snapshot, cumulative_qty_approved, previous_cumulative_qty,
      period_qty, period_value, cumulative_value
    FROM hakedis_period_lines
    WHERE period_id = ${periodId}
      AND tenant_id = ${tenantId}
    ORDER BY material_snapshot ASC
  `);

  const lines: PeriodLine[] = linesResult.rows.map(row => ({
    id: String(row.id),
    boqItemId: String(row.boq_item_id),
    materialSnapshot: String(row.material_snapshot),
    unitSnapshot: String(row.unit_snapshot),
    currencyCodeSnapshot: String(row.currency_code_snapshot),
    unitPriceSnapshot: String(row.unit_price_snapshot),
    cumulativeQtyApproved: String(row.cumulative_qty_approved),
    previousCumulativeQty: String(row.previous_cumulative_qty),
    periodQty: String(row.period_qty),
    periodValue: String(row.period_value),
    cumulativeValue: String(row.cumulative_value),
  }));

  // Compute D-90 deduction chain in Postgres numeric (single query — T-10-02-FLOAT)
  // COALESCE for nullable tevkifat_fraction + stopaj_rate (Pitfall 5 / T-10-02-NULL)
  // CASE WHEN for stopaj_enabled (D-93)
  let deductions: PeriodDeductions | null = null;
  if (lines.length > 0) {
    const dedResult = await db.execute(sql`
      SELECT
        SUM(hpl.period_value::numeric)
          AS gross,
        SUM(hpl.period_value::numeric)
          * COALESCE(hp.kdv_rate::numeric, 0)
          AS kdv,
        SUM(hpl.period_value::numeric)
          * COALESCE(hp.kdv_rate::numeric, 0)
          * COALESCE(hp.tevkifat_fraction::numeric, 0)
          AS tevkifat,
        CASE WHEN hp.stopaj_enabled
          THEN SUM(hpl.period_value::numeric) * COALESCE(hp.stopaj_rate::numeric, 0)
          ELSE 0
        END AS stopaj,
        SUM(hpl.period_value::numeric)
          * COALESCE(hp.retention_rate::numeric, 0)
          AS teminat,
        SUM(hpl.period_value::numeric)
          * COALESCE(hp.avans_kesintisi_rate::numeric, 0)
          AS avans,
        -- D-90 net = gross + (KDV - KDV tevkifat) - stopaj - teminat - avans
        SUM(hpl.period_value::numeric)
          + (SUM(hpl.period_value::numeric) * COALESCE(hp.kdv_rate::numeric, 0)
             - SUM(hpl.period_value::numeric) * COALESCE(hp.kdv_rate::numeric, 0)
               * COALESCE(hp.tevkifat_fraction::numeric, 0))
          - CASE WHEN hp.stopaj_enabled
              THEN SUM(hpl.period_value::numeric) * COALESCE(hp.stopaj_rate::numeric, 0)
              ELSE 0
            END
          - SUM(hpl.period_value::numeric) * COALESCE(hp.retention_rate::numeric, 0)
          - SUM(hpl.period_value::numeric) * COALESCE(hp.avans_kesintisi_rate::numeric, 0)
          AS net
      FROM hakedis_period_lines hpl
      JOIN hakedis_periods hp ON hp.id = hpl.period_id
      WHERE hpl.period_id = ${periodId}
        AND hpl.tenant_id = ${tenantId}
      GROUP BY
        hp.id,
        hp.kdv_rate,
        hp.tevkifat_fraction,
        hp.stopaj_enabled,
        hp.stopaj_rate,
        hp.retention_rate,
        hp.avans_kesintisi_rate
    `);
    const d = dedResult.rows[0];
    if (d && d.gross != null) {
      deductions = {
        gross: String(d.gross),
        kdv: String(d.kdv),
        tevkifat: String(d.tevkifat),
        stopaj: String(d.stopaj),
        teminat: String(d.teminat),
        avans: String(d.avans),
        net: String(d.net),
      };
    }
  }

  // Unpriced BOQ items (D-103 warning list)
  const unpricedResult = await db.execute(sql`
    SELECT id, material, unit
    FROM boq_items
    WHERE project_id    = ${period.projectId}
      AND tenant_id     = ${tenantId}
      AND currency_code = ${period.currencyCode}
      AND unit_price IS NULL
    ORDER BY material ASC
  `);
  const unpricedItems: UnpricedItem[] = unpricedResult.rows.map(row => ({
    id: String(row.id),
    material: String(row.material),
    unit: String(row.unit),
  }));

  return { period, lines, deductions, unpricedItems };
}

// ── finalizePeriod ────────────────────────────────────────────────────────────

/**
 * finalizePeriod — lock the period as an immutable snapshot (D-95 / D-96 / HAK-05).
 *
 * Irreversible: once finalized, recomputePeriodLines and deletePeriod both throw.
 * The finalized period is then eligible for payment-status advance via updatePaymentStatus.
 * Activity log: hakedis_period_finalized (D-97).
 *
 * Security: auth-guarded; tenant-scoped; draft-only guard.
 */
export async function finalizePeriod(periodId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  const periodResult = await db.execute(sql`
    SELECT id, status, project_id
    FROM hakedis_periods
    WHERE id = ${periodId}
      AND tenant_id = ${tenantId}
  `);
  const period = periodResult.rows[0];
  if (!period) throw new Error('Period not found');
  if (period.status !== 'draft') throw new Error('Period is not in draft status');

  await db.execute(sql`
    UPDATE hakedis_periods
    SET status = 'finalized', finalized_at = NOW(), updated_at = NOW()
    WHERE id = ${periodId}
      AND tenant_id = ${tenantId}
  `);

  // Fire-and-forget activity log (CR-04: guard empty actorUserId)
  if (session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'hakedis_period_finalized',
      entityType: 'hakedis_period',
      entityId: periodId,
      projectId: String(period.project_id),
    });
  }

  revalidatePath('/dashboard/hakedis');
  revalidatePath(`/dashboard/hakedis/${periodId}`);
  return { ok: true };
}

// ── updatePaymentStatus ───────────────────────────────────────────────────────

/**
 * updatePaymentStatus — advance the period payment status along the linear chain (D-95 / HAK-04).
 *
 * Valid transitions: finalized → submitted → paid.
 * draft → submitted is rejected (must use finalizePeriod first).
 * paid → anything is rejected (terminal state).
 * No activity log for payment status updates (not a PERF-03 action type).
 *
 * Security: auth-guarded; tenant-scoped.
 */
export async function updatePaymentStatus(
  periodId: string,
  target: HakedisStatus,
): Promise<{ ok: true }> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  const periodResult = await db.execute(sql`
    SELECT id, status
    FROM hakedis_periods
    WHERE id = ${periodId}
      AND tenant_id = ${tenantId}
  `);
  const period = periodResult.rows[0];
  if (!period) throw new Error('Period not found');

  const current = period.status as HakedisStatus;
  const expected = VALID_TRANSITIONS[current];
  if (expected === null || target !== expected) {
    throw new Error(`Invalid status transition: ${current} → ${target}`);
  }

  await db.execute(sql`
    UPDATE hakedis_periods
    SET status = ${target}, updated_at = NOW()
    WHERE id = ${periodId}
      AND tenant_id = ${tenantId}
  `);

  revalidatePath('/dashboard/hakedis');
  revalidatePath(`/dashboard/hakedis/${periodId}`);
  return { ok: true };
}

// ── deletePeriod ──────────────────────────────────────────────────────────────

/**
 * deletePeriod — delete a draft period and cascade its lines (D-97 / HAK-01).
 *
 * Non-draft periods are never deletable (immutable financial record).
 * Lines are cascade-deleted via the period_id FK ON DELETE CASCADE.
 * Activity log: hakedis_period_deleted (D-97).
 *
 * Security: auth-guarded; tenant-scoped; draft-only guard.
 */
export async function deletePeriod(periodId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  const periodResult = await db.execute(sql`
    SELECT id, status, project_id
    FROM hakedis_periods
    WHERE id = ${periodId}
      AND tenant_id = ${tenantId}
  `);
  const period = periodResult.rows[0];
  if (!period) throw new Error('Period not found');
  if (period.status !== 'draft') throw new Error('Cannot delete a finalized period');

  await db.execute(sql`
    DELETE FROM hakedis_periods
    WHERE id = ${periodId}
      AND tenant_id = ${tenantId}
  `);

  // Fire-and-forget activity log (CR-04: guard empty actorUserId)
  if (session.user?.id) {
    logOfficeActivity({
      actorUserId: session.user.id,
      actionType: 'hakedis_period_deleted',
      entityType: 'hakedis_period',
      entityId: periodId,
      projectId: String(period.project_id),
    });
  }

  revalidatePath('/dashboard/hakedis');
  return { ok: true };
}
