/**
 * src/lib/spatial.ts
 *
 * Spatial helpers for Phase 4 nearest-segment matching (GEO-01, GEO-02).
 * Pure module: no top-level DB access (lazy import discipline).
 *
 * Exports:
 *   getProximityThresholdM()    — env-configured threshold (D-45, default 500)
 *   snapToRoute(tx, flowId, lon, lat) — runs the guarded PostGIS snap inside a tx
 *   formatDistance(m)           — human-readable distance string for D-47 caption
 */
import { sql } from 'drizzle-orm';

/**
 * getProximityThresholdM — returns the proximity threshold in metres.
 * Reads PROXIMITY_THRESHOLD_M at call time (NOT module load) so tests stay
 * runnable without env.  Default: 500 metres (D-45).
 */
export function getProximityThresholdM(): number {
  return parseInt(process.env.PROXIMITY_THRESHOLD_M ?? '500', 10);
}

/**
 * formatDistance — human-readable distance for D-47 auditor caption.
 * >= 1000 m → "~X.X km" (one decimal); < 1000 m → "~N m" (rounded integer).
 *
 * Examples: formatDistance(1234) → "~1.2 km", formatDistance(420) → "~420 m"
 */
export function formatDistance(distanceM: number): string {
  if (distanceM >= 1000) {
    return `~${(distanceM / 1000).toFixed(1)} km`;
  }
  return `~${Math.round(distanceM)} m`;
}

/**
 * snapToRoute — runs the PostGIS nearest-segment UPDATE inside `tx`.
 *
 * Best-effort (D-42): catches all errors, sets location_match='no_route' on
 * failure.  Never throws — caller's transaction commit is preserved.
 *
 * D-41: must run inside the existing getTxDb() transaction so spatial values
 *       are committed atomically with the submission row.
 *
 * Security (T-04-04): all dynamic values (lon, lat, flowId, threshold) are
 * bound via Drizzle sql`` template parameters — never string-concatenated.
 *
 * @param tx      - The active getTxDb() transaction client (typed as any per
 *                  PATTERNS — avoids circular import with drizzle-orm types)
 * @param flowId  - The submissions.flow_id being snapped
 * @param lon     - Worker longitude (from Telegram location.longitude) — FIRST
 * @param lat     - Worker latitude  (from Telegram location.latitude)  — SECOND
 */
export async function snapToRoute(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  flowId: string,
  lon: number,
  lat: number
): Promise<void> {
  const threshold = getProximityThresholdM();

  try {
    // CTE-based UPDATE — lon FIRST per ST_MakePoint(X=longitude, Y=latitude) (D-48).
    // The snap CTE finds the nearest route row for the submission's project (LIMIT 1).
    // ::geography cast is MANDATORY for metre-accurate distance (Pitfall 2 / D-10).
    // routes/submissions referenced as raw SQL table names to avoid circular imports.
    const snapResult = await tx.execute(sql`
      WITH sub_pt AS (
        SELECT ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326) AS pt
      ),
      snap AS (
        SELECT
          r.geom,
          ST_LineLocatePoint(r.geom, (SELECT pt FROM sub_pt)) AS frac,
          ST_Distance(
            r.geom::geography,
            (SELECT pt FROM sub_pt)::geography
          ) AS dist_m
        FROM routes r
        WHERE r.project_id = (
          SELECT project_id FROM submissions WHERE flow_id = ${flowId}
        )
        LIMIT 1
      )
      UPDATE submissions s
      SET
        location            = (SELECT pt FROM sub_pt),
        snapped_point       = ST_SetSRID(
                                ST_LineInterpolatePoint(
                                  (SELECT geom FROM snap),
                                  (SELECT frac FROM snap)
                                ),
                                4326
                              ),
        segment_fraction    = (SELECT frac FROM snap),
        location_distance_m = (SELECT dist_m FROM snap),
        location_match      = CASE
                                WHEN (SELECT dist_m FROM snap) <= ${threshold}
                                THEN 'near'
                                ELSE 'far'
                              END,
        location_warning    = ((SELECT dist_m FROM snap) > ${threshold})
      WHERE s.flow_id = ${flowId}
        AND EXISTS (SELECT 1 FROM snap)
      RETURNING s.id, s.location_match, s.location_distance_m
    `);

    const snapped = (snapResult.rows as Array<{
      id: string;
      location_match: 'near' | 'far';
      location_distance_m: string;
    }>)[0];

    if (!snapped) {
      // No route row exists for this project — set neutral no_route state (D-43)
      await tx.execute(sql`
        UPDATE submissions
        SET location_match = 'no_route', location_warning = false
        WHERE flow_id = ${flowId}
      `);
    }
  } catch (geoErr) {
    // D-42: any PostGIS error (missing route, invalid geometry, network blip)
    // → best-effort no_route, NEVER abort the outer transaction or re-throw.
    console.error('[snapToRoute] spatial snap failed (best-effort):', geoErr);
    try {
      await tx.execute(sql`
        UPDATE submissions
        SET location_match = 'no_route', location_warning = false
        WHERE flow_id = ${flowId}
      `);
    } catch (_) {
      // Even the no_route fallback failed — let the transaction commit with
      // null spatial columns.  Submission is never lost (D-42).
    }
  }
}
