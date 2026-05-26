'use server';

/**
 * src/actions/analytics.ts
 *
 * Typed aggregation functions for the bayrak.ai analytics layer.
 *
 * All value aggregates are grouped by currency_code — never cross-currency summed.
 * All money multiplication happens in Postgres (SUM(qty::numeric * price::numeric)).
 * Every exported function is auth-guarded and tenant-scoped.
 *
 * CURRENCY SAFETY: All value rollups return Record<string, string> maps keyed by
 * ISO-4217 currency_code. A project with TRY + USD BOQ items returns two separate
 * totals — never a single cross-currency sum. Callers MUST iterate keys to render
 * per-currency values.
 *
 * MONEY MATH: Drizzle returns numeric columns as JS strings. All arithmetic stays
 * in Postgres. For display, parse the result string once with `new Decimal(str)`.
 * NEVER parseFloat() on DB numeric strings in a multiplication loop.
 *
 * Security:
 *   T-07-05: Every export starts with auth() guard (Elevation of Privilege)
 *   T-07-06: Every query includes WHERE tenant_id (Information Disclosure / cross-tenant)
 *   T-07-07: metadata stores entity IDs + numeric values; PII reconstructed at read time
 *   T-07-08: All multiplication in Postgres numeric; GROUP BY currency_code (float drift / bad sums)
 */

import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';
import type { CanonicalSubmission } from '@/lib/types';

// ── Types ────────────────────────────────────────────────────────────────────

export type ProjectMetrics = {
  projectId: string;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  avgAuditLatencyHours: number | null;   // decided submissions only — NULL never poisons average
  locationWarningCount: number;
  rejectionRate: number | null;          // rejected / (approved + rejected); null if none decided
  // Currency-grouped value maps — never a single cross-currency total field
  evByCurrency: Record<string, string>;
  bacByCurrency: Record<string, string>;
  reworkValueByCurrency: Record<string, string>;  // COST-05: rejected value only
};

export type PersonMetrics = {
  personId: string;
  displayName: string;
  // Worker metrics
  submissionsApproved: number;
  submissionsRejected: number;
  submissionsPending: number;
  locationComplianceRate: number | null;  // approved near / total approved; null if no approved
  // Value contribution — currency-grouped (COST-04)
  valueContributedByCurrency: Record<string, string>;
  // Auditor metrics (only populated when asAuditor: true)
  decisionsCount?: number;
  avgDecisionLatencyHours?: number | null;
  pendingBacklogCount?: number;
};

export type ProjectSummary = {
  projectId: string;
  projectName: string;
  approvedCount: number;
  pendingCount: number;
  // Value grouped by currency — cannot sum across currencies
  contractedValueByCurrency: Record<string, string>;
  earnedValueByCurrency: Record<string, string>;
};

export type ActivityLogEntry = {
  id: string;
  actorUserId: string;
  actorEmail: string | null;    // joined from users table
  actionType: string;
  entityType: string;
  entityId: string | null;
  projectId: string | null;
  projectName: string | null;   // joined from projects
  metadata: Record<string, unknown> | null;
  occurredAt: string;
};

type SubmissionFilters = {
  projectIds?: string[];
  from?: Date;
  to?: Date;
  status?: 'pending_audit' | 'approved' | 'rejected';
  personId?: string;
  // UX-05: single-record detail page lookup
  submissionId?: string;
  // UX-05: pagination — LIMIT/OFFSET as bound params (never string-concatenated, T-08-02-IV)
  limit?: number;
  offset?: number;
};

// ── getAuditorDecisions types ─────────────────────────────────────────────────

/**
 * AuditorDecision — one approve/reject decision record for an auditor's timeline.
 *
 * Sources ONLY from submissions (status IN approved/rejected, decided_by = personId).
 * NEVER reads office_activity_log (Pitfall 7 — that table is office-engineer-only).
 *
 * - submissionId: the submission being decided on
 * - status: 'approved' | 'rejected'
 * - material / unit: from boq_items join
 * - quantity: submission quantity as string (money-math safe)
 * - workerName: display_name of the submitting person
 * - projectName: project name from projects join
 * - decidedAt: ISO datetime string of the decision
 * - auditLatencyHours: EXTRACT(EPOCH...) / 3600; null if decided_at IS NULL
 */
export type AuditorDecision = {
  submissionId: string;
  status: 'approved' | 'rejected';
  material: string;
  unit: string;
  quantity: string;
  workerName: string;
  projectName: string;
  decidedAt: string;
  auditLatencyHours: number | null;
};

// ── Portfolio trend + KPI types ───────────────────────────────────────────────

/**
 * TrendPoint — one time bucket in a portfolio trend series.
 *
 * - bucket: ISO date-time string representing the start of the period (Istanbul tz)
 * - currencyCode: ISO-4217 currency for the earnedValue aggregation in this bucket
 * - approvedCount / rejectedCount / totalCount: submission counts in this bucket
 * - earnedValue: SUM(quantity * unit_price) for approved submissions; null when no priced rows
 *
 * Note: each currency generates a separate TrendPoint per bucket. Callers filter by
 * currencyCode to display one series at a time — never cross-currency summed.
 */
export type TrendPoint = {
  bucket: string;
  currencyCode: string;
  approvedCount: number;
  rejectedCount: number;
  totalCount: number;
  earnedValue: string | null;
};

/**
 * PortfolioKPIs — cross-project command-center overview counts.
 *
 * - pendingBacklog: point-in-time count of status='pending_audit' with NO date condition (D-66)
 * - approvalsInRange / rejectionsInRange: counts scoped to the active date range
 * - activeWorkers: distinct submitters within the date range (D-65); all-time when no range
 */
export type PortfolioKPIs = {
  pendingBacklog: number;
  approvalsInRange: number;
  rejectionsInRange: number;
  activeWorkers: number;
};

// ── getCanonicalSubmissions ──────────────────────────────────────────────────

/**
 * getCanonicalSubmissions — fetch submissions as the canonical CanonicalSubmission shape.
 *
 * Returns all submissions for the tenant, optionally filtered.
 * All numeric fields (quantity, unitPrice, earnedValue) are returned as strings —
 * callers must use decimal.js for any arithmetic.
 *
 * Security: auth-guarded; tenant-scoped.
 * COST-02: earned_value computed in Postgres (quantity * unit_price as numeric — no float casts).
 */
export async function getCanonicalSubmissions(
  filters: SubmissionFilters = {}
): Promise<CanonicalSubmission[]> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  // CR-03: build the WHERE clause from PARAMETERIZED Drizzle sql`` fragments.
  // Every caller-supplied value is interpolated as a bound parameter (${value}),
  // never string-concatenated, so a crafted Server Action payload cannot inject SQL.
  const conditions = [sql`s.tenant_id = ${tenantId}`];

  if (filters.projectIds && filters.projectIds.length > 0) {
    // = ANY(${array}) binds the whole array as a single parameter
    conditions.push(sql`s.project_id = ANY(${filters.projectIds})`);
  }
  if (filters.from) {
    conditions.push(sql`s.submitted_at >= ${filters.from.toISOString()}`);
  }
  if (filters.to) {
    conditions.push(sql`s.submitted_at < ${filters.to.toISOString()}`);
  }
  if (filters.status) {
    conditions.push(sql`s.status = ${filters.status}`);
  }
  if (filters.personId) {
    conditions.push(sql`s.person_id = ${filters.personId}`);
  }
  if (filters.submissionId) {
    conditions.push(sql`s.id = ${filters.submissionId}`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  // T-08-02-IV: LIMIT/OFFSET are bound parameters — never string-concatenated.
  // Default limit=1000 preserves pre-pagination behaviour for callers not passing limit.
  const limitVal = filters.limit ?? 1000;
  const offsetVal = filters.offset ?? 0;

  const result = await db.execute(sql`
    SELECT
      s.id,
      s.project_id,
      p.name                                                    AS project_name,
      s.person_id,
      w.display_name                                            AS worker_name,
      aud.display_name                                          AS auditor_name,
      s.boq_item_id,
      b.material,
      b.unit,
      b.unit_price,
      b.currency_code,
      s.quantity,
      CASE
        WHEN b.unit_price IS NOT NULL
        THEN (s.quantity::numeric * b.unit_price::numeric)::text
        ELSE NULL
      END                                                       AS earned_value,
      s.status,
      s.submitted_at,
      s.decided_at,
      CASE
        WHEN s.decided_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (s.decided_at - s.submitted_at)) / 3600.0
        ELSE NULL
      END                                                       AS audit_latency_hours,
      s.location_match,
      s.location_distance_m,
      s.photo_url,
      s.notes,
      s.rejection_reason
    FROM submissions s
    JOIN   projects  p   ON p.id = s.project_id
    JOIN   people    w   ON w.id = s.person_id
    JOIN   boq_items b   ON b.id = s.boq_item_id
    LEFT JOIN people aud ON aud.id = s.decided_by
    WHERE  ${whereClause}
    ORDER BY s.submitted_at DESC
    LIMIT  ${limitVal} OFFSET ${offsetVal}
  `);

  return result.rows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    projectName: String(r.project_name),
    personId: String(r.person_id),
    workerName: String(r.worker_name),
    auditorName: r.auditor_name != null ? String(r.auditor_name) : null,
    boqItemId: String(r.boq_item_id),
    material: String(r.material),
    unit: String(r.unit),
    unitPrice: r.unit_price != null ? String(r.unit_price) : null,
    currencyCode: String(r.currency_code ?? 'TRY'),
    quantity: String(r.quantity),
    earnedValue: r.earned_value != null ? String(r.earned_value) : null,
    status: r.status as 'pending_audit' | 'approved' | 'rejected',
    submittedAt: r.submitted_at instanceof Date
      ? r.submitted_at.toISOString()
      : String(r.submitted_at),
    decidedAt: r.decided_at != null
      ? (r.decided_at instanceof Date ? r.decided_at.toISOString() : String(r.decided_at))
      : null,
    auditLatencyHours: r.audit_latency_hours != null ? Number(r.audit_latency_hours) : null,
    locationMatch: r.location_match != null
      ? (r.location_match as 'near' | 'far' | 'no_route')
      : null,
    locationDistanceM: r.location_distance_m != null ? String(r.location_distance_m) : null,
    photoUrl: String(r.photo_url),
    notes: r.notes != null ? String(r.notes) : null,
    rejectionReason: r.rejection_reason != null ? String(r.rejection_reason) : null,
  }));
}

// ── getPortfolioKPIs ──────────────────────────────────────────────────────────

/**
 * getPortfolioKPIs — cross-project command-centre KPI counts.
 *
 * D-66: pendingBacklog is ALWAYS point-in-time (no date condition applied).
 * D-65: activeWorkers = distinct submitters within the active filter range;
 *       all-time when no range is set.
 *
 * Security: auth-guarded; tenant-scoped (T-08-02-ID).
 * T-08-02-IV: all filter values bound as parameters via Drizzle sql`` template literals.
 */
export async function getPortfolioKPIs(
  filters: SubmissionFilters = {}
): Promise<PortfolioKPIs> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  // Base conditions (tenant scope + optional projectIds/personId filters)
  const baseConditions = [sql`s.tenant_id = ${tenantId}`];
  if (filters.projectIds && filters.projectIds.length > 0) {
    baseConditions.push(sql`s.project_id = ANY(${filters.projectIds})`);
  }
  if (filters.personId) {
    baseConditions.push(sql`s.person_id = ${filters.personId}`);
  }
  const baseWhere = sql.join(baseConditions, sql` AND `);

  // D-66: dateCondition applied ONLY to approvals/rejections/activeWorkers counts.
  // pendingBacklog is NEVER date-filtered — it is a point-in-time snapshot.
  const dateCondition = (filters.from && filters.to)
    ? sql` AND s.submitted_at >= ${filters.from.toISOString()} AND s.submitted_at < ${filters.to.toISOString()}`
    : sql``;

  // Run two queries in parallel:
  // Query 1: pending backlog (no date condition) + approvals/rejections in range (with date condition)
  // Query 2: active workers — distinct submitters within range (with date condition)
  const [countsResult, workersResult] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE s.status = 'pending_audit')                              AS pending_backlog,
        COUNT(*) FILTER (WHERE s.status = 'approved' ${dateCondition})                 AS approvals_in_range,
        COUNT(*) FILTER (WHERE s.status = 'rejected' ${dateCondition})                 AS rejections_in_range
      FROM submissions s
      WHERE ${baseWhere}
    `),
    db.execute(sql`
      SELECT COUNT(DISTINCT s.person_id) AS active_workers
      FROM submissions s
      WHERE ${baseWhere}
        ${dateCondition}
    `),
  ]);

  const counts = countsResult.rows[0] ?? {};
  const workers = workersResult.rows[0] ?? {};

  return {
    pendingBacklog:    Number(counts.pending_backlog    ?? 0),
    approvalsInRange:  Number(counts.approvals_in_range ?? 0),
    rejectionsInRange: Number(counts.rejections_in_range ?? 0),
    activeWorkers:     Number(workers.active_workers    ?? 0),
  };
}

// ── getPortfolioTrends ────────────────────────────────────────────────────────

/**
 * getPortfolioTrends — time-bucketed throughput + earned value series.
 *
 * Bucketing uses Istanbul timezone (AT TIME ZONE 'Europe/Istanbul' — v2.0 locked rule).
 * Granularity: weekly (date_trunc 'week') when from/to range ≤ 60 days; monthly otherwise.
 * Money: SUM(quantity * unit_price) for approved, grouped by currency_code — never cross-currency.
 * Returns per-bucket, per-currency TrendPoint rows ordered by bucket ASC.
 *
 * Security: auth-guarded; tenant-scoped (T-08-02-ID).
 * T-08-02-IV: all filter values bound as parameters.
 */
export async function getPortfolioTrends(
  filters: SubmissionFilters = {}
): Promise<TrendPoint[]> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  // Choose weekly vs monthly bucketing from the date range delta (UI-SPEC + D-68)
  const useWeekly = Boolean(
    filters.from && filters.to &&
    (filters.to.getTime() - filters.from.getTime()) <= 60 * 24 * 60 * 60 * 1000
  );
  const bucketTrunc = useWeekly ? 'week' : 'month';

  // CR-03: parameterized WHERE clause fragments
  const conditions = [sql`s.tenant_id = ${tenantId}`];
  if (filters.projectIds && filters.projectIds.length > 0) {
    conditions.push(sql`s.project_id = ANY(${filters.projectIds})`);
  }
  if (filters.from) {
    conditions.push(sql`s.submitted_at >= ${filters.from.toISOString()}`);
  }
  if (filters.to) {
    conditions.push(sql`s.submitted_at < ${filters.to.toISOString()}`);
  }
  if (filters.personId) {
    conditions.push(sql`s.person_id = ${filters.personId}`);
  }
  const whereClause = sql.join(conditions, sql` AND `);

  // Istanbul tz bucketing — bucketTrunc is a safe TS-derived string ('week' | 'month'),
  // NOT a user-supplied value. date_trunc() requires a string LITERAL (not a bound param)
  // so we use sql.raw() for the truncation type only. All user-supplied filter values
  // remain bound parameters via ${...} (T-08-02-IV).
  //
  // We cast the truncated Istanbul local timestamp to TEXT directly in Postgres to preserve
  // the local date (e.g. '2025-04-01 00:00:00') — avoids the UTC conversion that would
  // change '2025-04-01 00:00:00 Istanbul' → '2025-03-31 21:00:00 UTC'.
  const bucketExpr = sql.raw(`date_trunc('${bucketTrunc}', s.submitted_at AT TIME ZONE 'Europe/Istanbul')`);
  const result = await db.execute(sql`
    SELECT
      to_char(${bucketExpr}, 'YYYY-MM-DD"T"HH24:MI:SS') AS bucket,
      b.currency_code,
      COUNT(*) FILTER (WHERE s.status = 'approved')                                    AS approved_count,
      COUNT(*) FILTER (WHERE s.status = 'rejected')                                    AS rejected_count,
      COUNT(*)                                                                          AS total_count,
      SUM(s.quantity::numeric * b.unit_price::numeric)
        FILTER (WHERE s.status = 'approved' AND b.unit_price IS NOT NULL)              AS earned_value
    FROM submissions s
    JOIN boq_items b ON b.id = s.boq_item_id
    WHERE ${whereClause}
    GROUP BY ${bucketExpr}, b.currency_code
    ORDER BY ${bucketExpr} ASC
  `);

  return result.rows.map((r) => ({
    bucket: r.bucket instanceof Date
      ? r.bucket.toISOString()
      : String(r.bucket),
    currencyCode: r.currency_code != null ? String(r.currency_code) : 'TRY',
    approvedCount: Number(r.approved_count ?? 0),
    rejectedCount: Number(r.rejected_count ?? 0),
    totalCount: Number(r.total_count ?? 0),
    earnedValue: r.earned_value != null ? String(r.earned_value) : null,
  }));
}

// ── getProjectMetrics ────────────────────────────────────────────────────────

/**
 * getProjectMetrics — compute approved/rejected/pending counts + currency-grouped values.
 *
 * Runs two queries in parallel:
 *   Query 1: counts, SLA latency, location warnings, rejection rate (no currency grouping)
 *   Query 2: EV + BAC + rework value, GROUP BY currency_code
 *
 * Returns currency-keyed Record<string, string> maps — never a cross-currency total.
 *
 * Security: auth-guarded; tenant-scoped.
 * COST-02: SUM(qty::numeric * price::numeric) in Postgres; GROUP BY currency_code.
 * COST-05: rework counts ONLY rejected submissions.
 */
export async function getProjectMetrics(
  projectId: string,
  dateRange?: { from: Date; to: Date }
): Promise<ProjectMetrics> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  const dateConditions = dateRange
    ? sql` AND s.submitted_at >= ${dateRange.from.toISOString()} AND s.submitted_at < ${dateRange.to.toISOString()}`
    : sql``;

  // Run all three queries in parallel.
  //
  // CR-01: BAC (Budget at Completion) MUST be computed from boq_items directly,
  // NOT through the submissions join. Driving BAC from submissions fans the
  // per-BOQ-item planned_qty * unit_price out once per submission, over-counting
  // BAC by a factor equal to the submission count. EV + rework stay joined to
  // submissions (they correctly sum per-submission s.quantity).
  const [countsResult, valuesResult, bacResult] = await Promise.all([
    // Query 1: counts + SLA (no currency grouping)
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE s.status = 'approved')                        AS approved_count,
        COUNT(*) FILTER (WHERE s.status = 'rejected')                        AS rejected_count,
        COUNT(*) FILTER (WHERE s.status = 'pending_audit')                   AS pending_count,
        ROUND(
          AVG(EXTRACT(EPOCH FROM (s.decided_at - s.submitted_at)) / 3600.0)
          FILTER (WHERE s.decided_at IS NOT NULL), 2
        )                                                                    AS avg_audit_latency_hours,
        COUNT(*) FILTER (WHERE s.location_warning = true)                    AS location_warning_count,
        COUNT(*) FILTER (WHERE s.status = 'rejected')::float
          / NULLIF(COUNT(*) FILTER (WHERE s.status IN ('approved', 'rejected')), 0)
                                                                             AS rejection_rate
      FROM submissions s
      WHERE s.project_id = ${projectId}
        AND s.tenant_id  = ${tenantId}
        ${dateConditions}
    `),

    // Query 2: EV + rework — driven from submissions (correct: sums per-submission s.quantity)
    // GROUP BY b.currency_code — no cross-currency summation ever occurs
    db.execute(sql`
      SELECT
        b.currency_code,
        SUM(s.quantity::numeric * b.unit_price::numeric)
          FILTER (WHERE s.status = 'approved' AND b.unit_price IS NOT NULL)  AS earned_value,
        SUM(s.quantity::numeric * b.unit_price::numeric)
          FILTER (WHERE s.status = 'rejected' AND b.unit_price IS NOT NULL)  AS rework_value
      FROM submissions s
      JOIN boq_items b ON b.id = s.boq_item_id
      WHERE s.project_id = ${projectId}
        AND s.tenant_id  = ${tenantId}
        ${dateConditions}
      GROUP BY b.currency_code
    `),

    // Query 3 (CR-01): BAC — aggregated directly from boq_items, NOT through submissions.
    // Each BOQ item's planned_qty * unit_price is summed exactly once per currency.
    db.execute(sql`
      SELECT
        currency_code,
        SUM(planned_qty::numeric * unit_price::numeric)
          FILTER (WHERE unit_price IS NOT NULL)                              AS bac
      FROM boq_items
      WHERE project_id = ${projectId}
        AND tenant_id  = ${tenantId}
      GROUP BY currency_code
    `),
  ]);

  const counts = countsResult.rows[0] ?? {};

  // Merge currency rows into Record<string, string> maps
  // Never sum across currencies — each key is a separate ISO-4217 code
  const evByCurrency: Record<string, string> = {};
  const bacByCurrency: Record<string, string> = {};
  const reworkValueByCurrency: Record<string, string> = {};

  for (const row of valuesResult.rows) {
    const currency = String(row.currency_code);
    if (!currency) continue;
    if (row.earned_value != null) {
      evByCurrency[currency] = String(row.earned_value);
    }
    if (row.rework_value != null) {
      reworkValueByCurrency[currency] = String(row.rework_value);
    }
  }

  // BAC merged from the separate boq_items aggregate (CR-01)
  for (const row of bacResult.rows) {
    const currency = String(row.currency_code);
    if (!currency) continue;
    if (row.bac != null) {
      bacByCurrency[currency] = String(row.bac);
    }
  }

  return {
    projectId,
    approvedCount: Number(counts.approved_count ?? 0),
    rejectedCount: Number(counts.rejected_count ?? 0),
    pendingCount: Number(counts.pending_count ?? 0),
    avgAuditLatencyHours: counts.avg_audit_latency_hours != null
      ? Number(counts.avg_audit_latency_hours)
      : null,
    locationWarningCount: Number(counts.location_warning_count ?? 0),
    rejectionRate: counts.rejection_rate != null ? Number(counts.rejection_rate) : null,
    evByCurrency,
    bacByCurrency,
    reworkValueByCurrency,
  };
}

// ── getOfficeActivityLog ─────────────────────────────────────────────────────

/**
 * getOfficeActivityLog — query the office engineer activity log.
 *
 * Joins users (for actorEmail) and projects (for projectName).
 * Default limit: 50 entries, ordered by occurred_at DESC.
 * Optionally filter by actorUserId, projectId, date range.
 *
 * Security: auth-guarded; tenant-scoped.
 * T-07-07: names/emails reconstructed at read time by join — not stored in log rows.
 */
export async function getOfficeActivityLog(options?: {
  actorUserId?: string;
  projectId?: string;
  limit?: number;
  from?: Date;
  to?: Date;
}): Promise<ActivityLogEntry[]> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  const limit = options?.limit ?? 50;

  // CR-03: build the WHERE clause from PARAMETERIZED Drizzle sql`` fragments.
  // Caller-supplied actorUserId / projectId / dates are bound as parameters,
  // never string-concatenated, eliminating the SQL-injection surface.
  const conditions = [sql`al.tenant_id = ${tenantId}`];

  if (options?.actorUserId) {
    conditions.push(sql`al.actor_user_id = ${options.actorUserId}`);
  }
  if (options?.projectId) {
    conditions.push(sql`al.project_id = ${options.projectId}`);
  }
  if (options?.from) {
    conditions.push(sql`al.occurred_at >= ${options.from.toISOString()}`);
  }
  if (options?.to) {
    conditions.push(sql`al.occurred_at < ${options.to.toISOString()}`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const result = await db.execute(sql`
    SELECT
      al.id,
      al.actor_user_id,
      u.email                                                   AS actor_email,
      al.action_type,
      al.entity_type,
      al.entity_id,
      al.project_id,
      p.name                                                    AS project_name,
      al.metadata,
      al.occurred_at
    FROM office_activity_log al
    LEFT JOIN users    u ON u.id  = al.actor_user_id
    LEFT JOIN projects p ON p.id  = al.project_id
    WHERE ${whereClause}
    ORDER BY al.occurred_at DESC
    LIMIT ${limit}
  `);

  return result.rows.map((r) => ({
    id: String(r.id),
    actorUserId: String(r.actor_user_id),
    actorEmail: r.actor_email != null ? String(r.actor_email) : null,
    actionType: String(r.action_type),
    entityType: String(r.entity_type),
    entityId: r.entity_id != null ? String(r.entity_id) : null,
    projectId: r.project_id != null ? String(r.project_id) : null,
    projectName: r.project_name != null ? String(r.project_name) : null,
    metadata: r.metadata != null ? (r.metadata as Record<string, unknown>) : null,
    occurredAt: r.occurred_at instanceof Date
      ? r.occurred_at.toISOString()
      : String(r.occurred_at),
  }));
}

// ── getPersonMetrics ─────────────────────────────────────────────────────────

/**
 * getPersonMetrics — worker + optional auditor scorecard for a person.
 *
 * Worker metrics scoped to person_id as submitter (never bleeds auditor decisions).
 * When asAuditor: true, adds auditor aggregate and pending-backlog count in SEPARATE
 * queries — NULL decidedAt never poisons the avg latency (split query pattern).
 *
 * Security: auth-guarded; tenant-scoped.
 * COST-04: valueContributedByCurrency grouped by currency; no cross-currency sum.
 */
export async function getPersonMetrics(
  personId: string,
  options?: { projectIds?: string[]; asAuditor?: boolean; dateRange?: { from: Date; to: Date } }
): Promise<PersonMetrics> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  // CR-03: parameterized project filter — caller-supplied projectIds are bound
  // as a single array parameter via = ANY(${array}), never string-concatenated.
  const projectFilter = options?.projectIds && options.projectIds.length > 0
    ? sql` AND s.project_id = ANY(${options.projectIds})`
    : sql``;

  // D-75: optional dateRange scopes all sub-queries. Empty fragment when not set (all-time).
  const dateConditions = options?.dateRange
    ? sql` AND s.submitted_at >= ${options.dateRange.from.toISOString()} AND s.submitted_at < ${options.dateRange.to.toISOString()}`
    : sql``;

  // Query 1: worker submission counts (scoped to person as submitter only)
  const workerResult = await db.execute(sql`
    SELECT
      s.person_id,
      w.display_name,
      COUNT(*) FILTER (WHERE s.status = 'approved')                        AS submissions_approved,
      COUNT(*) FILTER (WHERE s.status = 'rejected')                        AS submissions_rejected,
      COUNT(*) FILTER (WHERE s.status = 'pending_audit')                   AS submissions_pending,
      COUNT(*) FILTER (WHERE s.status = 'approved' AND s.location_match = 'near')::float
        / NULLIF(COUNT(*) FILTER (WHERE s.status = 'approved'), 0)         AS location_compliance_rate
    FROM submissions s
    JOIN people w ON w.id = s.person_id
    WHERE s.person_id = ${personId}
      AND s.tenant_id = ${tenantId}
      ${projectFilter}
      ${dateConditions}
    GROUP BY s.person_id, w.display_name
  `);

  // Query 2: value contribution — currency-grouped, approved only (COST-04)
  // GROUP BY b.currency_code — no cross-currency summation
  const valueResult = await db.execute(sql`
    SELECT
      b.currency_code,
      SUM(s.quantity::numeric * b.unit_price::numeric)
        FILTER (WHERE s.status = 'approved' AND b.unit_price IS NOT NULL)  AS value_contributed
    FROM submissions s
    JOIN boq_items b ON b.id = s.boq_item_id
    WHERE s.person_id = ${personId}
      AND s.tenant_id = ${tenantId}
      AND s.status = 'approved'
      ${projectFilter}
      ${dateConditions}
    GROUP BY b.currency_code
  `);

  const workerRow = workerResult.rows[0];
  const displayName = workerRow?.display_name != null ? String(workerRow.display_name) : '';

  const valueContributedByCurrency: Record<string, string> = {};
  for (const row of valueResult.rows) {
    const currency = String(row.currency_code);
    if (!currency) continue;
    if (row.value_contributed != null) {
      valueContributedByCurrency[currency] = String(row.value_contributed);
    }
  }

  const metrics: PersonMetrics = {
    personId,
    displayName,
    submissionsApproved: Number(workerRow?.submissions_approved ?? 0),
    submissionsRejected: Number(workerRow?.submissions_rejected ?? 0),
    submissionsPending: Number(workerRow?.submissions_pending ?? 0),
    locationComplianceRate: workerRow?.location_compliance_rate != null
      ? Number(workerRow.location_compliance_rate)
      : null,
    valueContributedByCurrency,
  };

  if (options?.asAuditor) {
    // Query 3: auditor decisions count + avg latency (FILTER decided_at IS NOT NULL)
    // NEVER mix this aggregate with pending-backlog count — NULL decidedAt poisons avg
    const auditorResult = await db.execute(sql`
      SELECT
        COUNT(*)                                                             AS decisions_count,
        ROUND(
          AVG(EXTRACT(EPOCH FROM (s.decided_at - s.submitted_at)) / 3600.0)
          FILTER (WHERE s.decided_at IS NOT NULL), 2
        )                                                                   AS avg_decision_latency_hours
      FROM submissions s
      WHERE s.decided_by = ${personId}
        AND s.tenant_id  = ${tenantId}
        AND s.status IN ('approved', 'rejected')
        ${dateConditions}
    `);

    // Query 4: pending-backlog count — separate from decided avg (NULL decidedAt isolation)
    const pendingBacklogResult = await db.execute(sql`
      SELECT COUNT(*) AS pending_backlog_count
      FROM submissions s
      WHERE s.project_id IN (
        SELECT project_id FROM assignments
        WHERE person_id = ${personId} AND role_on_project = 'auditor'
      )
      AND s.status = 'pending_audit'
      AND s.tenant_id = ${tenantId}
      ${dateConditions}
    `);

    const auditorRow = auditorResult.rows[0];
    metrics.decisionsCount = Number(auditorRow?.decisions_count ?? 0);
    metrics.avgDecisionLatencyHours = auditorRow?.avg_decision_latency_hours != null
      ? Number(auditorRow.avg_decision_latency_hours)
      : null;
    metrics.pendingBacklogCount = Number(pendingBacklogResult.rows[0]?.pending_backlog_count ?? 0);
  }

  return metrics;
}

// ── getPortfolioOverview ─────────────────────────────────────────────────────

/**
 * getPortfolioOverview — one ProjectSummary per project for the whole tenant.
 *
 * Returns per-project currency maps for contracted and earned value.
 * Single SQL query returning one row per project-currency combination;
 * merged in TypeScript into contractedValueByCurrency / earnedValueByCurrency maps.
 *
 * Security: auth-guarded; tenant-scoped.
 * COST-03: % complete can be derived by caller per currency pair from ev/contracted maps.
 * WR-02: earnedValueByCurrency is derived from APPROVED submissions (same source
 *   as getProjectMetrics.evByCurrency) — never from boq_items.approved_qty — so
 *   the portfolio EV and the project-detail EV are identical on the same data.
 */
export async function getPortfolioOverview(): Promise<ProjectSummary[]> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  // CR-02: aggregate each side independently in CTEs, then join to projects.
  // A naive double LEFT JOIN (projects → submissions, projects → boq_items)
  // produces a Cartesian product per project (S submissions × B BOQ items),
  // inflating both the submission counts and the BOQ value sums. Pre-aggregating
  // each side in its own CTE removes the fan-out entirely.
  //
  // WR-02 (re-review): Earned Value MUST be derived the SAME way as
  // getProjectMetrics Query 2 — SUM(s.quantity * b.unit_price) over APPROVED
  // submissions — NOT from the denormalized boq_items.approved_qty. The prior
  // version read approved_qty here, which is a separate source maintained by the
  // bot audit flow; if that field ever diverges from the submissions ledger
  // (partial-commit bug, manual edit) the portfolio EV and the project-detail EV
  // would silently disagree for the same project. Sourcing both from approved
  // submissions makes the two views provably identical on the same data.
  //
  // ev_agg is pre-aggregated per (project_id, currency_code) so it cannot
  // fan out the boq_agg or sub_agg rows. A project/currency that has approved
  // submissions but no priced BOQ item (or vice versa) is preserved via the
  // FULL OUTER JOIN between boq_agg and ev_agg on (project_id, currency_code).
  const result = await db.execute(sql`
    WITH boq_agg AS (
      SELECT
        project_id,
        currency_code,
        SUM(planned_qty::numeric * unit_price::numeric)
          FILTER (WHERE unit_price IS NOT NULL)                          AS contracted_value
      FROM boq_items
      WHERE tenant_id = ${tenantId}
      GROUP BY project_id, currency_code
    ),
    ev_agg AS (
      SELECT
        s.project_id,
        b.currency_code,
        SUM(s.quantity::numeric * b.unit_price::numeric)
          FILTER (WHERE s.status = 'approved' AND b.unit_price IS NOT NULL) AS earned_value
      FROM submissions s
      JOIN boq_items b ON b.id = s.boq_item_id
      WHERE s.tenant_id = ${tenantId}
      GROUP BY s.project_id, b.currency_code
    ),
    val_agg AS (
      SELECT
        COALESCE(ba.project_id, ea.project_id)        AS project_id,
        COALESCE(ba.currency_code, ea.currency_code)  AS currency_code,
        ba.contracted_value,
        ea.earned_value
      FROM boq_agg ba
      FULL OUTER JOIN ev_agg ea
        ON ea.project_id = ba.project_id
       AND ea.currency_code = ba.currency_code
    ),
    sub_agg AS (
      SELECT
        project_id,
        COUNT(*) FILTER (WHERE status = 'approved')                      AS approved_count,
        COUNT(*) FILTER (WHERE status = 'pending_audit')                 AS pending_count
      FROM submissions
      WHERE tenant_id = ${tenantId}
      GROUP BY project_id
    )
    SELECT
      p.id                            AS project_id,
      p.name                          AS project_name,
      va.currency_code,
      COALESCE(sa.approved_count, 0)  AS approved_count,
      COALESCE(sa.pending_count, 0)   AS pending_count,
      va.contracted_value,
      va.earned_value
    FROM projects p
    LEFT JOIN val_agg va ON va.project_id = p.id
    LEFT JOIN sub_agg sa ON sa.project_id = p.id
    WHERE p.tenant_id = ${tenantId}
    ORDER BY p.name, va.currency_code
  `);

  // Merge rows by projectId into per-project currency maps
  const projectMap = new Map<string, ProjectSummary>();

  for (const row of result.rows) {
    const projectId = String(row.project_id);
    const currency = row.currency_code != null ? String(row.currency_code) : null;

    if (!projectMap.has(projectId)) {
      projectMap.set(projectId, {
        projectId,
        projectName: String(row.project_name),
        approvedCount: Number(row.approved_count ?? 0),
        pendingCount: Number(row.pending_count ?? 0),
        contractedValueByCurrency: {},
        earnedValueByCurrency: {},
      });
    }

    const summary = projectMap.get(projectId)!;

    // Counts are now per-project (sub_agg), identical across the project's
    // currency rows. Assigning is safe — no fan-out to de-duplicate.
    summary.approvedCount = Number(row.approved_count ?? 0);
    summary.pendingCount = Number(row.pending_count ?? 0);

    if (currency) {
      if (row.contracted_value != null) {
        summary.contractedValueByCurrency[currency] = String(row.contracted_value);
      }
      if (row.earned_value != null) {
        summary.earnedValueByCurrency[currency] = String(row.earned_value);
      }
    }
  }

  return Array.from(projectMap.values());
}

// ── getPortfolioPeople ────────────────────────────────────────────────────────

/**
 * PortfolioWorker — one row per approved person who has a 'worker' assignment.
 *
 * Aggregated in a SINGLE SQL query (no N× getPersonMetrics). D-69/PERF-04.
 * - valueContributedByCurrency: approved EV grouped by currency_code — NEVER cross-currency summed.
 *   Returned as separate rows (one per currency) and merged in JS into a Record map.
 */
export type PortfolioWorker = {
  personId: string;
  displayName: string;
  submissionsApproved: number;
  submissionsRejected: number;
  submissionsPending: number;
  /** Approved EV grouped by ISO-4217 currency — never cross-currency summed */
  valueContributedByCurrency: Record<string, string>;
};

/**
 * PortfolioAuditor — one row per approved person who has an 'auditor' assignment.
 *
 * Aggregated in a SINGLE SQL query. pendingBacklogCount is point-in-time (D-66).
 * avgDecisionLatencyHours: computed via FILTER (WHERE decided_at IS NOT NULL) —
 * NULL decidedAt never poisons the average (split-query pattern from D-AuditorSource).
 */
export type PortfolioAuditor = {
  personId: string;
  displayName: string;
  decisionsCount: number;
  avgDecisionLatencyHours: number | null;
  pendingBacklogCount: number;
};

/**
 * getPortfolioPeople — bulk directory query. ONE round-trip per role.
 *
 * Workers: JOIN people → assignments (role='worker') → submissions grouped by person.
 *   Counts: FILTER WHERE status=... for approved/rejected/pending.
 *   Value: a sub-query per person-currency pair — returned as extra rows and merged in JS.
 *
 * Auditors: JOIN people → assignments (role='auditor').
 *   decisionsCount: submissions WHERE decided_by=person AND status IN ('approved','rejected').
 *   avgDecisionLatencyHours: AVG FILTER (WHERE decided_at IS NOT NULL) — NULL-safe.
 *   pendingBacklogCount: submissions pending on the auditor's projects (point-in-time, D-66).
 *
 * Security: auth-guarded + tenant-scoped (T-08-05-ID).
 * T-08-05-IV: all filter values bound as Drizzle sql`` parameters (CR-03).
 * D-69: person with worker + auditor assignments appears in BOTH result sets.
 * D-66: pending backlog is NOT date-filtered (point-in-time snapshot).
 * COST-04: valueContributedByCurrency grouped by currency — never cross-currency summed.
 */
export async function getPortfolioPeople(options: {
  role: 'worker';
  dateRange?: { from: Date; to: Date };
  projectIds?: string[];
}): Promise<PortfolioWorker[]>;
export async function getPortfolioPeople(options: {
  role: 'auditor';
  dateRange?: { from: Date; to: Date };
  projectIds?: string[];
}): Promise<PortfolioAuditor[]>;
export async function getPortfolioPeople(options: {
  role: 'worker' | 'auditor';
  dateRange?: { from: Date; to: Date };
  projectIds?: string[];
}): Promise<PortfolioWorker[] | PortfolioAuditor[]> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  // T-08-05-IV: CR-03 parameterized filters
  const dateCondition = options.dateRange
    ? sql` AND s.submitted_at >= ${options.dateRange.from.toISOString()} AND s.submitted_at < ${options.dateRange.to.toISOString()}`
    : sql``;

  const projectFilter = options.projectIds && options.projectIds.length > 0
    ? sql` AND s.project_id = ANY(${options.projectIds})`
    : sql``;

  if (options.role === 'worker') {
    // ── Workers bulk query ─────────────────────────────────────────────────
    // One row per person (submission counts only, no currency in this result set).
    // Currency-grouped value is fetched in a separate query and merged in JS (COST-04).
    // We JOIN to assignments to ensure only people with a worker assignment are included
    // (not every person who submitted — they must have an explicit assignment).
    // pending_people are in a separate table; people join excludes them automatically.
    const [countsResult, valueResult] = await Promise.all([
      db.execute(sql`
        SELECT
          p.id                                                            AS person_id,
          p.display_name,
          COUNT(s.id) FILTER (WHERE s.status = 'approved' ${dateCondition} ${projectFilter})   AS submissions_approved,
          COUNT(s.id) FILTER (WHERE s.status = 'rejected' ${dateCondition} ${projectFilter})   AS submissions_rejected,
          COUNT(s.id) FILTER (WHERE s.status = 'pending_audit' ${dateCondition} ${projectFilter}) AS submissions_pending
        FROM people p
        JOIN assignments a
          ON a.person_id    = p.id
         AND a.tenant_id    = ${tenantId}
         AND a.role_on_project = 'worker'
        LEFT JOIN submissions s
          ON s.person_id  = p.id
         AND s.tenant_id  = ${tenantId}
        WHERE p.tenant_id = ${tenantId}
        GROUP BY p.id, p.display_name
        ORDER BY p.display_name
      `),
      db.execute(sql`
        SELECT
          p.id              AS person_id,
          b.currency_code,
          SUM(s.quantity::numeric * b.unit_price::numeric)
            FILTER (WHERE s.status = 'approved' AND b.unit_price IS NOT NULL ${dateCondition} ${projectFilter}) AS value_contributed
        FROM people p
        JOIN assignments a
          ON a.person_id       = p.id
         AND a.tenant_id       = ${tenantId}
         AND a.role_on_project = 'worker'
        LEFT JOIN submissions s
          ON s.person_id  = p.id
         AND s.tenant_id  = ${tenantId}
        LEFT JOIN boq_items b ON b.id = s.boq_item_id
        WHERE p.tenant_id = ${tenantId}
          AND b.currency_code IS NOT NULL
        GROUP BY p.id, b.currency_code
      `),
    ]);

    // Build currency map keyed by personId
    const valueMap = new Map<string, Record<string, string>>();
    for (const row of valueResult.rows) {
      const personId = String(row.person_id);
      const currency = row.currency_code != null ? String(row.currency_code) : null;
      if (!currency) continue;
      if (row.value_contributed == null) continue;
      if (!valueMap.has(personId)) valueMap.set(personId, {});
      valueMap.get(personId)![currency] = String(row.value_contributed);
    }

    return countsResult.rows.map((r): PortfolioWorker => ({
      personId: String(r.person_id),
      displayName: String(r.display_name),
      submissionsApproved: Number(r.submissions_approved ?? 0),
      submissionsRejected: Number(r.submissions_rejected ?? 0),
      submissionsPending: Number(r.submissions_pending ?? 0),
      valueContributedByCurrency: valueMap.get(String(r.person_id)) ?? {},
    }));
  } else {
    // ── Auditors bulk query ────────────────────────────────────────────────
    // decisionsCount + avgDecisionLatencyHours: decisions by this auditor.
    //   FILTER (WHERE decided_at IS NOT NULL) ensures NULL decidedAt never poisons avg.
    // pendingBacklogCount: pending on the auditor's assigned projects (D-66: point-in-time,
    //   NO dateCondition applied to pending count).
    const [decisionsResult, backlogResult] = await Promise.all([
      db.execute(sql`
        SELECT
          p.id                                                            AS person_id,
          p.display_name,
          COUNT(s.id) FILTER (WHERE s.status IN ('approved', 'rejected') ${dateCondition}) AS decisions_count,
          ROUND(
            AVG(
              EXTRACT(EPOCH FROM (s.decided_at - s.submitted_at)) / 3600.0
            ) FILTER (WHERE s.decided_at IS NOT NULL AND s.status IN ('approved', 'rejected') ${dateCondition}),
            2
          )                                                               AS avg_decision_latency_hours
        FROM people p
        JOIN assignments a
          ON a.person_id       = p.id
         AND a.tenant_id       = ${tenantId}
         AND a.role_on_project = 'auditor'
        LEFT JOIN submissions s
          ON s.decided_by = p.id
         AND s.tenant_id  = ${tenantId}
        WHERE p.tenant_id = ${tenantId}
        GROUP BY p.id, p.display_name
        ORDER BY p.display_name
      `),
      db.execute(sql`
        SELECT
          a.person_id,
          COUNT(s.id) AS pending_backlog_count
        FROM assignments a
        JOIN submissions s
          ON s.project_id = a.project_id
         AND s.tenant_id  = ${tenantId}
         AND s.status     = 'pending_audit'
        WHERE a.tenant_id       = ${tenantId}
          AND a.role_on_project = 'auditor'
        GROUP BY a.person_id
      `),
    ]);

    // Build backlog map keyed by personId
    const backlogMap = new Map<string, number>();
    for (const row of backlogResult.rows) {
      backlogMap.set(String(row.person_id), Number(row.pending_backlog_count ?? 0));
    }

    return decisionsResult.rows.map((r): PortfolioAuditor => ({
      personId: String(r.person_id),
      displayName: String(r.display_name),
      decisionsCount: Number(r.decisions_count ?? 0),
      avgDecisionLatencyHours: r.avg_decision_latency_hours != null
        ? Number(r.avg_decision_latency_hours)
        : null,
      pendingBacklogCount: backlogMap.get(String(r.person_id)) ?? 0,
    }));
  }
}

// ── getAuditorDecisions ───────────────────────────────────────────────────────

/**
 * getAuditorDecisions — return the approve/reject decision history for an auditor.
 *
 * Reads ONLY from submissions (WHERE decided_by = personId AND status IN approved/rejected).
 * MUST NOT read office_activity_log (Pitfall 7 — that table is for office engineer events).
 *
 * Security:
 *   T-08-02-ID: auth-guarded + tenant-scoped; tenant_id first condition.
 *   T-08-02-IV: all caller-supplied values are bound parameters (never string-concat).
 *   T-08-02-AV: latency computed via EXTRACT; decided_at IS NOT NULL guard on computation.
 *
 * Returns rows ordered by decided_at DESC.
 * Supports optional dateRange (on submitted_at), projectIds, limit, offset.
 */
export async function getAuditorDecisions(options: {
  personId: string;
  dateRange?: { from: Date; to: Date };
  projectIds?: string[];
  limit?: number;
  offset?: number;
}): Promise<AuditorDecision[]> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  // T-08-02-ID: tenant scope is the FIRST condition (Information Disclosure guard)
  const conditions = [
    sql`s.tenant_id = ${tenantId}`,
    sql`s.decided_by = ${options.personId}`,
    sql`s.status IN ('approved', 'rejected')`,
  ];

  if (options.projectIds && options.projectIds.length > 0) {
    conditions.push(sql`s.project_id = ANY(${options.projectIds})`);
  }
  if (options.dateRange) {
    conditions.push(sql`s.submitted_at >= ${options.dateRange.from.toISOString()}`);
    conditions.push(sql`s.submitted_at < ${options.dateRange.to.toISOString()}`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  // T-08-02-IV: LIMIT/OFFSET as bound params — never string-concatenated
  const limitVal = options.limit ?? 1000;
  const offsetVal = options.offset ?? 0;

  const result = await db.execute(sql`
    SELECT
      s.id                                                               AS submission_id,
      s.status,
      b.material,
      b.unit,
      s.quantity,
      w.display_name                                                     AS worker_name,
      p.name                                                             AS project_name,
      s.decided_at,
      CASE
        WHEN s.decided_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (s.decided_at - s.submitted_at)) / 3600.0
        ELSE NULL
      END                                                                AS audit_latency_hours
    FROM submissions s
    JOIN people    w ON w.id = s.person_id
    JOIN boq_items b ON b.id = s.boq_item_id
    JOIN projects  p ON p.id = s.project_id
    WHERE ${whereClause}
    ORDER BY s.decided_at DESC
    LIMIT  ${limitVal} OFFSET ${offsetVal}
  `);

  return result.rows.map((r) => ({
    submissionId: String(r.submission_id),
    status: r.status as 'approved' | 'rejected',
    material: String(r.material),
    unit: String(r.unit),
    quantity: String(r.quantity),
    workerName: String(r.worker_name),
    projectName: String(r.project_name),
    decidedAt: r.decided_at instanceof Date
      ? r.decided_at.toISOString()
      : String(r.decided_at),
    auditLatencyHours: r.audit_latency_hours != null
      ? Number(r.audit_latency_hours)
      : null,
  }));
}
