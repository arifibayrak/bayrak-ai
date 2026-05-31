/**
 * src/lib/chainage-data.ts
 *
 * Shared chainage aggregation helper — NOT a 'use server' action.
 * Callable from both the getChainageBuckets Server Action AND the
 * GET /api/exports/chainage Route Handler (Pitfall 6 from 15-RESEARCH.md).
 *
 * Design decisions (from 15-RESEARCH.md):
 *   - D-04: Three-state bucket status — approved / in_progress / not_started
 *   - D-02: Completion % = covered_buckets / total_buckets × 100, clamped LEAST(…,100)
 *   - Pitfall 2: Pending submissions have no chainage_m — derive dynamically via
 *       COALESCE(s.chainage_m, s.segment_fraction * r.total_length_m)
 *   - Pitfall 3: Cap last bucket end at totalLengthM (display only)
 *   - Pitfall 4: Apply chainage_offset_m INSIDE Postgres FLOOR (never in JS)
 *   - Pitfall 8: generate_series enumerates ALL buckets including not-started
 *   - Security T-15-05-IDOR: tenantId passed as explicit param; scoped on every table
 *   - Security T-15-05-SQLI: bucketSizeM is a bound param (${bucketSizeM}) — not concatenated;
 *       whitelist validation happens in the Server Action before this function is called
 *
 * All DB arithmetic stays in Postgres numeric. The completionPct is the only JS-side
 * computation and uses only integer counts (no float accumulation).
 */

import { sql } from 'drizzle-orm';
import { db } from '@/db';

// ── Types ────────────────────────────────────────────────────────────────────

export type ChainageBucket = {
  bucketIndex: number;
  bucketStart: number;   // calibrated metres (offset applied inside FLOOR)
  bucketEnd: number;     // calibrated metres; last bucket capped at totalLengthM (Pitfall 3)
  status: 'approved' | 'in_progress' | 'not_started';
  approvedCount: number;
  pendingCount: number;
  boqBreakdown: Array<{ material: string; unit: string; quantity: string }>;
  workers: string[];
  auditors: string[];
  firstSubmissionId: string | null;
};

export type ChainageBucketsResult = {
  buckets: ChainageBucket[];
  totalLengthM: number;
  chainageOffsetM: number;
  completionPct: number;
};

// ── fetchChainageBucketsRaw ──────────────────────────────────────────────────

/**
 * fetchChainageBucketsRaw — raw Postgres aggregation for chainage as-built view.
 *
 * Takes tenantId as an explicit parameter (no auth() / getDefaultTenantId() inside)
 * so it can be imported and called from both a Server Action and a Route Handler.
 *
 * @param projectId  - UUID of the project
 * @param bucketSizeM - bucket width in metres (whitelist: 100 | 500 | 1000)
 * @param tenantId  - tenant UUID (caller must supply; prevents IDOR)
 *
 * Returns empty buckets + completionPct 0 when no route exists for the project (A6).
 */
export async function fetchChainageBucketsRaw(
  projectId: string,
  bucketSizeM: number,
  tenantId: string,
): Promise<ChainageBucketsResult> {
  // Step 1: fetch route metadata needed for generate_series range + last-bucket cap
  const routeResult = await db.execute(sql`
    SELECT total_length_m, chainage_offset_m
    FROM routes
    WHERE project_id = ${projectId}
      AND tenant_id  = ${tenantId}
    LIMIT 1
  `);

  if (routeResult.rows.length === 0 || routeResult.rows[0].total_length_m == null) {
    // No route or route has no length — return empty result (Pitfall A6)
    return { buckets: [], totalLengthM: 0, chainageOffsetM: 0, completionPct: 0 };
  }

  const totalLengthM    = Number(routeResult.rows[0].total_length_m);
  const chainageOffsetM = Number(routeResult.rows[0].chainage_offset_m ?? 0);

  // Step 2: full aggregation with generate_series (Pitfall 8 — includes not-started buckets)
  //
  // bucketSizeM is already whitelist-validated by the Server Action caller ({100,500,1000}).
  // We embed it as a sql.raw() integer literal so that Neon HTTP's prepared-statement
  // deduplication does not create multiple $N params for the same value in a CTE query
  // (Neon HTTP driver limitation: each ${expr} creates a new positional param even if
  // the value is identical). totalLengthM comes from our own DB query so it is also safe
  // to embed as a literal — no user input reaches it.
  //
  // Security note: sql.raw() is acceptable here because:
  //   - bucketSizeM is whitelist-validated in getChainageBuckets before reaching this fn
  //   - totalLengthM is fetched from our own DB row (not user input)
  //   - tenantId and projectId remain as bound parameters (${...})
  const bsz = sql.raw(String(bucketSizeM));        // safe: whitelist-validated integer
  const tlen = sql.raw(String(totalLengthM));       // safe: our own DB numeric value
  const totalBucketCount = Math.ceil(totalLengthM / bucketSizeM);
  const nbuckets = sql.raw(String(totalBucketCount - 1)); // generate_series upper bound

  const result = await db.execute(sql`
    WITH
    all_buckets AS (
      SELECT generate_series(0, ${nbuckets}) AS bucket_idx
    ),
    sub_agg AS (
      SELECT
        -- CR-01: clamp the computed bucket into [0, nbuckets]. A submission whose
        -- calibrated chainage lands AT/BEYOND totalLengthM (e.g. segment_fraction=1.0,
        -- or a positive offset pushing it past the end) or BELOW 0 (negative offset)
        -- otherwise computes a bucket_idx outside the generate_series range and is
        -- silently dropped by the LEFT JOIN. LEAST/GREATEST folds it into the
        -- first/last bucket so the work is counted, not lost.
        LEAST(
          GREATEST(
            FLOOR((
              COALESCE(s.chainage_m, s.segment_fraction * ${tlen})
              + r.chainage_offset_m
            ) / ${bsz})::int,
            0
          ),
          ${nbuckets}
        )                                                            AS bucket_idx,

        COUNT(*) FILTER (WHERE s.status = 'approved')               AS approved_count,
        COUNT(*) FILTER (WHERE s.status = 'pending_audit')          AS pending_count,

        -- BOQ breakdown: approved submissions only (D-04 data fidelity)
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'material', b.material,
            'unit',     b.unit,
            'quantity', s.quantity
          )
        ) FILTER (WHERE s.status = 'approved')                      AS boq_rows,

        -- Worker display names: approved submissions only, distinct, non-null
        ARRAY_AGG(DISTINCT pw.display_name)
          FILTER (WHERE s.status = 'approved'
                    AND pw.display_name IS NOT NULL)                 AS worker_names,

        -- Auditor display names: approved submissions only, distinct, non-null
        ARRAY_AGG(DISTINCT pa.display_name)
          FILTER (WHERE s.status = 'approved'
                    AND pa.display_name IS NOT NULL)                 AS auditor_names,

        -- First submission ID for drill-down link: approved first, fall back to pending
        -- Cast uuid→text: Postgres has no built-in MIN aggregate for uuid type.
        MIN(s.id::text) FILTER (WHERE s.status = 'approved')        AS first_approved_id,
        MIN(s.id::text) FILTER (WHERE s.status = 'pending_audit')   AS first_pending_id

      FROM submissions s
      JOIN routes   r  ON r.project_id = s.project_id
                      AND r.tenant_id  = ${tenantId}
      JOIN boq_items b ON b.id = s.boq_item_id
      JOIN people   pw ON pw.id = s.person_id
      LEFT JOIN people pa ON pa.id = s.decided_by

      WHERE s.project_id = ${projectId}
        AND s.tenant_id  = ${tenantId}
        AND s.status IN ('approved', 'pending_audit')
        AND (
              s.chainage_m     IS NOT NULL
          OR (s.status = 'pending_audit' AND s.segment_fraction IS NOT NULL)
        )

      -- CR-01: GROUP BY must use the identical clamped expression as the SELECT
      -- above, otherwise the grouping key and the projected bucket_idx diverge.
      GROUP BY LEAST(
        GREATEST(
          FLOOR((
            COALESCE(s.chainage_m, s.segment_fraction * ${tlen})
            + r.chainage_offset_m
          ) / ${bsz})::int,
          0
        ),
        ${nbuckets}
      )
    )
    SELECT
      ab.bucket_idx,
      -- WR-01: bucket_start/bucket_end describe the CALIBRATED frame, identical to
      -- the value the bot reports to the worker. The submission was bucketed on its
      -- calibrated chainage (raw + chainage_offset_m, applied inside FLOOR above), so
      -- a calibrated value X always lies within [bucket_idx*size, (bucket_idx+1)*size).
      -- The displayed km range therefore already includes the offset — it is NOT raw
      -- stationing. Dashboard, bot notification, and export all use this one frame.
      ab.bucket_idx * ${bsz}                              AS bucket_start,
      (ab.bucket_idx + 1) * ${bsz}                       AS bucket_end,
      COALESCE(sa.approved_count, 0)                      AS approved_count,
      COALESCE(sa.pending_count,  0)                      AS pending_count,
      sa.boq_rows,
      sa.worker_names,
      sa.auditor_names,
      COALESCE(sa.first_approved_id, sa.first_pending_id) AS first_submission_id
    FROM all_buckets ab
    LEFT JOIN sub_agg sa ON sa.bucket_idx = ab.bucket_idx
    ORDER BY ab.bucket_idx
  `);

  // ── Map rows → ChainageBucket[] ─────────────────────────────────────────

  const totalBuckets = totalBucketCount; // computed above before sql.raw()

  const buckets: ChainageBucket[] = result.rows.map((r, i) => {
    const approvedCount = Number(r.approved_count ?? 0);
    const pendingCount  = Number(r.pending_count  ?? 0);

    // D-04 three-state status
    const status: ChainageBucket['status'] =
      approvedCount >= 1 ? 'approved'    :
      pendingCount  >= 1 ? 'in_progress' : 'not_started';

    // BOQ breakdown — approved only; quantities stay as strings (no float drift)
    const boqBreakdown: ChainageBucket['boqBreakdown'] = Array.isArray(r.boq_rows)
      ? r.boq_rows.map((row: Record<string, unknown>) => ({
          material: String(row.material ?? ''),
          unit:     String(row.unit     ?? ''),
          quantity: String(row.quantity ?? ''),
        }))
      : [];

    // Worker + auditor arrays
    const workers:  string[] = Array.isArray(r.worker_names)
      ? r.worker_names.map(String)
      : [];
    const auditors: string[] = Array.isArray(r.auditor_names)
      ? r.auditor_names.map(String)
      : [];

    // Pitfall 3: cap last bucket end at totalLengthM
    const isLastBucket = i === result.rows.length - 1;
    const rawEnd = Number(r.bucket_end);
    const bucketEnd = isLastBucket ? Math.min(rawEnd, totalLengthM) : rawEnd;

    return {
      bucketIndex:       Number(r.bucket_idx),
      bucketStart:       Number(r.bucket_start),
      bucketEnd,
      status,
      approvedCount,
      pendingCount,
      boqBreakdown,
      workers,
      auditors,
      firstSubmissionId: r.first_submission_id != null ? String(r.first_submission_id) : null,
    };
  });

  // ── Completion % (D-02) — Postgres counts feed JS integer arithmetic ──────
  // coveredBuckets = distinct buckets with ≥1 approved submission
  // completionPct  = LEAST(coveredBuckets / totalBuckets × 100, 100)
  const coveredBuckets = buckets.filter(b => b.approvedCount > 0).length;
  const completionPct  = totalBuckets > 0
    ? Math.min(100, Math.round((coveredBuckets / totalBuckets) * 100))
    : 0;

  return { buckets, totalLengthM, chainageOffsetM, completionPct };
}
