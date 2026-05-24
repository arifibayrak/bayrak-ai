/**
 * tests/spatial.test.ts
 *
 * Phase 4 spatial snap tests (GEO-01, GEO-02) — Wave 3 implementation.
 *
 * Tests:
 *   D-48  — coordinate-order guard (SC3 — MANDATORY before merge): Istanbul
 *            (lng 28.9, lat 41.0) reads back longitude-first in ST_AsGeoJSON.
 *   GEO-01 — near submission stores non-null snapped_point and segment_fraction
 *             in [0.0, 1.0].
 *   GEO-02 — near/far/no_route classification + location_warning flag.
 *   GEO-02 no_route — no route project: submission still persists (D-42).
 *
 * All tests are wrapped in describeIfDb — skipped when TEST_DATABASE_URL is absent
 * so `npx vitest run` stays green on machines without a database connection.
 *
 * Drive snap by calling snapToRoute(db, flowId, lon, lat) — the neon-http `db`
 * client exposes `.execute()` which is the only method snapToRoute uses, so it
 * works as the tx-like argument.
 *
 * Istanbul reference: longitude 28.9, latitude 41.0 (WGS-84, lng-first per D-48/D-07)
 * Route fixture:      [[28.9, 41.0], [28.95, 41.05]] — ~6 km Istanbul segment
 */

import { beforeEach, afterEach, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  describeIfDb,
  getTestDb,
  truncateAllTables,
  seedSpatialFixture,
  SPATIAL_FIXTURE_IDS,
} from './fixtures/db';
import { snapToRoute } from '../src/lib/spatial';

// Deterministic flow_id UUIDs for each test scenario (no collisions)
const FLOW_ID_NEAR    = 'eeeeeeee-0000-0000-0000-000000000001';
const FLOW_ID_FAR     = 'eeeeeeee-0000-0000-0000-000000000002';
const FLOW_ID_NOROUTE = 'eeeeeeee-0000-0000-0000-000000000003';

// Second project for no_route scenario (no routes row)
const NO_ROUTE_PROJECT_ID  = 'ffffffff-0000-0000-0000-000000000002';
const NO_ROUTE_BOQ_ITEM_ID = 'ffffffff-0000-0000-0000-000000000010';

describeIfDb('Phase 4 spatial snap (GEO-01, GEO-02)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
    await seedSpatialFixture(db);

    // Set PROXIMITY_THRESHOLD_M so getProximityThresholdM() returns 500 m (D-45)
    process.env.PROXIMITY_THRESHOLD_M = '500';

    // ── Seed a second project with NO routes row for the no_route test case ──
    await db.execute(
      sql.raw(`
        INSERT INTO projects (id, tenant_id, name)
        VALUES ('${NO_ROUTE_PROJECT_ID}', '${SPATIAL_FIXTURE_IDS.tenantId}', 'No-Route Project')
        ON CONFLICT DO NOTHING
      `)
    );
    await db.execute(
      sql.raw(`
        INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order)
        VALUES ('${NO_ROUTE_BOQ_ITEM_ID}', '${SPATIAL_FIXTURE_IDS.tenantId}', '${NO_ROUTE_PROJECT_ID}',
                'DN200 HDPE Boru', 'm', 500, 0, 1)
        ON CONFLICT DO NOTHING
      `)
    );
  });

  afterEach(async () => {
    delete process.env.PROXIMITY_THRESHOLD_M;
    await truncateAllTables(db);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // D-48: Coordinate-order guard (SC3 — MANDATORY before merge)
  //
  // This test does not depend on snapToRoute — it queries PostGIS directly.
  // ST_MakePoint(longitude, latitude): X = longitude, Y = latitude.
  // ST_AsGeoJSON must output [longitude, latitude] per GeoJSON spec (RFC 7946).
  // ─────────────────────────────────────────────────────────────────────────

  it('(D-48) Istanbul point (lng 28.9, lat 41.0) reads back longitude-first in GeoJSON', async () => {
    // ST_MakePoint(lon, lat) → ST_SetSRID → ST_AsGeoJSON must output coordinates[0] = longitude
    const result = await db.execute(sql`
      SELECT ST_AsGeoJSON(
        ST_SetSRID(ST_MakePoint(28.9, 41.0), 4326)
      )::json AS geojson
    `);

    const geojson = (result.rows[0] as { geojson: { coordinates: number[] } }).geojson;

    // longitude (28.9) must be first — X axis (ST_MakePoint x=lon, y=lat)
    expect(geojson.coordinates[0]).toBeCloseTo(28.9, 5);
    // latitude (41.0) must be second — Y axis
    expect(geojson.coordinates[1]).toBeCloseTo(41.0, 5);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: insert a submissions row for a specific scenario.
  // Uses sql.raw with literal values (consistent with postgis.test.ts seed pattern)
  // to avoid neon-http UUID parameter-binding edge cases.
  // ─────────────────────────────────────────────────────────────────────────
  async function insertSubmission(opts: {
    flowId: string;
    projectId: string;
    boqItemId: string;
    lon: number;
    lat: number;
  }): Promise<void> {
    await db.execute(
      sql.raw(`
        INSERT INTO submissions (
          id, tenant_id, flow_id, person_id, project_id, boq_item_id,
          photo_url, location_lat, location_lon, quantity, status, submitted_at
        ) VALUES (
          gen_random_uuid(),
          '${SPATIAL_FIXTURE_IDS.tenantId}',
          '${opts.flowId}',
          '${SPATIAL_FIXTURE_IDS.personId}',
          '${opts.projectId}',
          '${opts.boqItemId}',
          'https://example.com/photo.jpg',
          '${opts.lat}',
          '${opts.lon}',
          '1',
          'pending_audit',
          NOW()
        )
        ON CONFLICT DO NOTHING
      `)
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GEO-01: Nearest-segment match
  // ─────────────────────────────────────────────────────────────────────────

  it('(GEO-01) submission within 500m stores non-null snapped_point and segment_fraction', async () => {
    // lon=28.9, lat=41.005 — ~500m north of the route start (28.9, 41.0)
    const lon = 28.9;
    const lat = 41.005;

    await insertSubmission({
      flowId: FLOW_ID_NEAR,
      projectId: SPATIAL_FIXTURE_IDS.projectId,
      boqItemId: SPATIAL_FIXTURE_IDS.boqItemId,
      lon,
      lat,
    });

    // Call snapToRoute — passes db as tx-like client (only tx.execute() is used)
    await snapToRoute(db, FLOW_ID_NEAR, lon, lat);

    // Read back spatial columns using sql.raw with literal flow_id
    const result = await db.execute(
      sql.raw(`
        SELECT
          snapped_point IS NOT NULL AS has_snapped_point,
          segment_fraction IS NOT NULL AS has_segment_fraction,
          ST_AsGeoJSON(snapped_point)::json AS snapped_geojson,
          segment_fraction::float8 AS frac
        FROM submissions
        WHERE flow_id = '${FLOW_ID_NEAR}'
      `)
    );

    const row = result.rows[0] as {
      has_snapped_point: boolean;
      has_segment_fraction: boolean;
      snapped_geojson: { type: string; coordinates: number[] } | null;
      frac: number | null;
    };

    expect(row.has_snapped_point).toBe(true);
    expect(row.has_segment_fraction).toBe(true);
    expect(row.snapped_geojson).not.toBeNull();
    expect(row.snapped_geojson?.type).toBe('Point');
    // snapped point longitude should be within the route's longitude range [28.9, 28.95]
    expect(row.snapped_geojson?.coordinates[0]).toBeGreaterThanOrEqual(28.88);
    expect(row.snapped_geojson?.coordinates[0]).toBeLessThanOrEqual(28.96);
  });

  it('(GEO-01) segment_fraction is within [0.0, 1.0]', async () => {
    const lon = 28.9;
    const lat = 41.005;

    await insertSubmission({
      flowId: FLOW_ID_NEAR,
      projectId: SPATIAL_FIXTURE_IDS.projectId,
      boqItemId: SPATIAL_FIXTURE_IDS.boqItemId,
      lon,
      lat,
    });

    await snapToRoute(db, FLOW_ID_NEAR, lon, lat);

    const result = await db.execute(
      sql.raw(`
        SELECT segment_fraction::float8 AS frac
        FROM submissions
        WHERE flow_id = '${FLOW_ID_NEAR}'
      `)
    );

    const { frac } = result.rows[0] as { frac: number };
    expect(frac).toBeGreaterThanOrEqual(0.0);
    expect(frac).toBeLessThanOrEqual(1.0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GEO-02: Threshold anomaly flag
  // ─────────────────────────────────────────────────────────────────────────

  it("(GEO-02) near submission → location_match='near' and location_warning=false", async () => {
    // lon=28.9, lat=41.005 — within ~500m of the route start
    const lon = 28.9;
    const lat = 41.005;

    await insertSubmission({
      flowId: FLOW_ID_NEAR,
      projectId: SPATIAL_FIXTURE_IDS.projectId,
      boqItemId: SPATIAL_FIXTURE_IDS.boqItemId,
      lon,
      lat,
    });

    await snapToRoute(db, FLOW_ID_NEAR, lon, lat);

    const result = await db.execute(
      sql.raw(`
        SELECT location_match, location_warning, location_distance_m::float8 AS dist_m
        FROM submissions
        WHERE flow_id = '${FLOW_ID_NEAR}'
      `)
    );

    const row = result.rows[0] as {
      location_match: string;
      location_warning: boolean;
      dist_m: number;
    };

    expect(row.location_match).toBe('near');
    expect(row.location_warning).toBe(false);
    expect(row.dist_m).toBeLessThanOrEqual(500);
  });

  it("(GEO-02) far submission → location_match='far' and location_warning=true", async () => {
    // lon=29.5, lat=41.0 — ~50km east of the route; well beyond 500m threshold
    const lon = 29.5;
    const lat = 41.0;

    await insertSubmission({
      flowId: FLOW_ID_FAR,
      projectId: SPATIAL_FIXTURE_IDS.projectId,
      boqItemId: SPATIAL_FIXTURE_IDS.boqItemId,
      lon,
      lat,
    });

    await snapToRoute(db, FLOW_ID_FAR, lon, lat);

    const result = await db.execute(
      sql.raw(`
        SELECT location_match, location_warning, location_distance_m::float8 AS dist_m
        FROM submissions
        WHERE flow_id = '${FLOW_ID_FAR}'
      `)
    );

    const row = result.rows[0] as {
      location_match: string;
      location_warning: boolean;
      dist_m: number;
    };

    expect(row.location_match).toBe('far');
    expect(row.location_warning).toBe(true);
    expect(row.dist_m).toBeGreaterThan(500);
  });

  it(
    "(GEO-02) no-route project → location_match='no_route', null snapped_point/segment_fraction, submission still persists",
    async () => {
      // Submission for the project with NO routes row
      const lon = 28.9;
      const lat = 41.0;

      await insertSubmission({
        flowId: FLOW_ID_NOROUTE,
        projectId: NO_ROUTE_PROJECT_ID,
        boqItemId: NO_ROUTE_BOQ_ITEM_ID,
        lon,
        lat,
      });

      await snapToRoute(db, FLOW_ID_NOROUTE, lon, lat);

      const result = await db.execute(
        sql.raw(`
          SELECT
            location_match,
            location_warning,
            snapped_point IS NULL AS snapped_null,
            segment_fraction IS NULL AS frac_null,
            status
          FROM submissions
          WHERE flow_id = '${FLOW_ID_NOROUTE}'
        `)
      );

      const row = result.rows[0] as {
        location_match: string;
        location_warning: boolean;
        snapped_null: boolean;
        frac_null: boolean;
        status: string;
      };

      // D-43: no_route is the neutral state (not 'far')
      expect(row.location_match).toBe('no_route');
      // D-44: location_warning is false for no_route (no alarm)
      expect(row.location_warning).toBe(false);
      // D-44: snapped_point and segment_fraction null when no_route
      expect(row.snapped_null).toBe(true);
      expect(row.frac_null).toBe(true);
      // D-42 best-effort: submission still persists with status=pending_audit
      expect(row.status).toBe('pending_audit');
    }
  );
});
