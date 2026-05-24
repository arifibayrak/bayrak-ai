/**
 * tests/postgis.test.ts
 *
 * PostGIS integration tests — gated by describeIfDb (requires TEST_DATABASE_URL).
 *
 * Tests:
 *   (a) PostGIS extension present: SELECT postgis_version() returns a non-null value (D-10)
 *   (b) Coordinate order guard: insert an Istanbul LineString via ST_GeomFromGeoJSON,
 *       read back via ST_AsGeoJSON, assert first coordinate is longitude (28.9) not latitude.
 *       This is the canonical GEO coordinate-order guard for SETUP-03.
 *
 * Istanbul reference point: longitude 28.9, latitude 41.0 (WGS-84, lng-first GeoJSON)
 */

import { beforeEach, afterEach, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';

describeIfDb('PostGIS extension + coordinate order (SETUP-03 / D-10)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
    // Seed the required tenant so FK constraints on routes are satisfied
    await db.execute(
      sql.raw(`
        INSERT INTO tenants (id, name)
        VALUES ('00000000-0000-0000-0000-000000000001', 'Test Tenant')
        ON CONFLICT DO NOTHING
      `)
    );
    // Seed a project so routes.project_id FK is satisfied
    await db.execute(
      sql.raw(`
        INSERT INTO projects (id, tenant_id, name)
        VALUES (
          '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000001',
          'Test Project'
        )
        ON CONFLICT DO NOTHING
      `)
    );
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('(a) postgis_version() returns a non-null value — extension present (D-10)', async () => {
    const result = await db.execute(sql.raw(`SELECT postgis_version() AS version`));
    const rows = result.rows as Array<{ version: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBeTruthy();
    // Must be a real PostGIS version string, e.g. "3.4.2 ..."
    expect(typeof rows[0].version).toBe('string');
    expect(rows[0].version.length).toBeGreaterThan(0);
  });

  it('(b) Istanbul coordinate order: lng (28.9) reads back first in ST_AsGeoJSON output (SETUP-03)', async () => {
    // Istanbul GeoJSON LineString: two points, both near Istanbul
    // GeoJSON coordinate order is [longitude, latitude] per RFC 7946
    const istanbulLineString = JSON.stringify({
      type: 'LineString',
      coordinates: [
        [28.9, 41.0],   // Istanbul centre, longitude first
        [29.0, 41.1],   // second point nearby
      ],
    });

    // Insert via ST_GeomFromGeoJSON (parameterized via tagged-template literal)
    await db.execute(
      sql`
        INSERT INTO routes (id, tenant_id, project_id, geom, coordinate_count)
        VALUES (
          '00000000-0000-0000-0000-000000000003',
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002',
          ST_GeomFromGeoJSON(${istanbulLineString}),
          2
        )
      `
    );

    // Read back as GeoJSON and inspect first coordinate
    const result = await db.execute(
      sql.raw(`
        SELECT ST_AsGeoJSON(geom)::json AS geojson
        FROM routes
        WHERE id = '00000000-0000-0000-0000-000000000003'
      `)
    );

    const rows = result.rows as Array<{ geojson: { type: string; coordinates: number[][] } }>;
    expect(rows).toHaveLength(1);

    const geojson = rows[0].geojson;
    expect(geojson.type).toBe('LineString');
    expect(Array.isArray(geojson.coordinates)).toBe(true);
    expect(geojson.coordinates.length).toBeGreaterThanOrEqual(1);

    // First coordinate must be [longitude, latitude] per GeoJSON / PostGIS convention
    const firstCoord = geojson.coordinates[0];
    // longitude = 28.9 should be first
    expect(firstCoord[0]).toBeCloseTo(28.9, 5);
    // latitude = 41.0 should be second
    expect(firstCoord[1]).toBeCloseTo(41.0, 5);
  });
});
