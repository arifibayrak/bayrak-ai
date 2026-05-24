/**
 * tests/submissions.test.ts
 *
 * DB integration tests for submissions Server Actions (src/actions/submissions.ts).
 * Gated behind describeIfDb — skips cleanly without TEST_DATABASE_URL.
 *
 * Covers:
 * - DASH-01: getRouteGeoJSON returns valid GeoJSON LineString with [lng, lat] coordinate order
 * - DASH-02: getApprovedPoints returns FeatureCollection of approved + snapped rows only (D-46)
 * - DASH-03: getSubmissions filters by status, paginates, rejects invalid status string
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  describeIfDb,
  getTestDb,
  truncateAllTables,
  seedSpatialFixture,
  SPATIAL_FIXTURE_IDS,
} from './fixtures/db';

// Mock next/cache to prevent revalidatePath from throwing outside Next.js context
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Mock auth() — authorized by default for all tests
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'test@example.com' } }),
}));

// ── DB integration tests ────────────────────────────────────────────────────
describeIfDb('submissions Server Actions (DB)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
    await seedSpatialFixture(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  // ── DASH-01: getRouteGeoJSON ──────────────────────────────────────────────

  describe('DASH-01: getRouteGeoJSON', () => {
    it('returns a GeoJSON LineString object with [lng, lat] coordinate order', async () => {
      // Dynamic import — src/actions/submissions.ts does not exist yet (Wave 0 RED state).
      // This file compiles and the describeIfDb block skips without TEST_DATABASE_URL.
      const { getRouteGeoJSON } = await import('@/actions/submissions');

      const result = await getRouteGeoJSON(SPATIAL_FIXTURE_IDS.projectId);

      expect(result).not.toBeNull();
      expect(result!.geojson.type).toBe('LineString');
      expect(Array.isArray(result!.geojson.coordinates)).toBe(true);

      // Istanbul fixture: [[28.9, 41.0], [28.95, 41.05]]
      // GeoJSON + ST_AsGeoJSON both return [longitude, latitude] (x, y order).
      // Longitude (28.9) must appear BEFORE latitude (41.0) — D-48 / RESEARCH Pattern 4.
      const firstCoord = result!.geojson.coordinates[0] as [number, number];
      expect(firstCoord[0]).toBeCloseTo(28.9, 4);  // longitude first
      expect(firstCoord[1]).toBeCloseTo(41.0, 4);  // latitude second
    });

    it('returns null when the project has no route', async () => {
      const { getRouteGeoJSON } = await import('@/actions/submissions');

      // Use a project ID that has no route (different from the seeded fixture project)
      const nonExistentProjectId = '00000000-0000-0000-0000-000000000099';
      const result = await getRouteGeoJSON(nonExistentProjectId);

      expect(result).toBeNull();
    });
  });

  // ── DASH-02: getApprovedPoints ────────────────────────────────────────────

  describe('DASH-02: getApprovedPoints', () => {
    it('returns only approved + snapped_point IS NOT NULL submissions as GeoJSON FeatureCollection (D-46)', async () => {
      const { getApprovedPoints } = await import('@/actions/submissions');
      const { sql } = await import('drizzle-orm');

      const { tenantId, projectId, boqItemId, personId } = SPATIAL_FIXTURE_IDS;

      // Insert a snapped point GeoJSON for the Istanbul area
      const snappedPointJson = JSON.stringify({ type: 'Point', coordinates: [28.92, 41.02] });

      // Row 1: approved + snapped — should appear in result
      // NOTE: flow_id is uuid type — must use valid UUID values (Rule 1 fix)
      await db.execute(sql`
        INSERT INTO submissions (
          tenant_id, flow_id, person_id, project_id, boq_item_id,
          photo_url, location_lat, location_lon,
          snapped_point, segment_fraction,
          location_match, location_warning, location_distance_m,
          quantity, status, submitted_at
        ) VALUES (
          ${tenantId}, ${'00000000-0000-0000-0001-000000000001'}, ${personId}, ${projectId}, ${boqItemId},
          ${'https://example.blob.vercel-storage.com/photo1.jpg'}, 41.02, 28.92,
          ST_GeomFromGeoJSON(${snappedPointJson}), 0.3,
          'near', false, 50,
          10, 'approved', NOW()
        )
      `);

      // Row 2: approved + NO snapped_point — must NOT appear in result (D-46)
      await db.execute(sql`
        INSERT INTO submissions (
          tenant_id, flow_id, person_id, project_id, boq_item_id,
          photo_url, location_lat, location_lon,
          location_match, location_warning, location_distance_m,
          quantity, status, submitted_at
        ) VALUES (
          ${tenantId}, ${'00000000-0000-0000-0001-000000000002'}, ${personId}, ${projectId}, ${boqItemId},
          ${'https://example.blob.vercel-storage.com/photo2.jpg'}, 41.01, 28.91,
          'no_route', false, null,
          5, 'approved', NOW()
        )
      `);

      // Row 3: pending + snapped — must NOT appear in result (not approved)
      await db.execute(sql`
        INSERT INTO submissions (
          tenant_id, flow_id, person_id, project_id, boq_item_id,
          photo_url, location_lat, location_lon,
          snapped_point, segment_fraction,
          location_match, location_warning, location_distance_m,
          quantity, status, submitted_at
        ) VALUES (
          ${tenantId}, ${'00000000-0000-0000-0001-000000000003'}, ${personId}, ${projectId}, ${boqItemId},
          ${'https://example.blob.vercel-storage.com/photo3.jpg'}, 41.03, 28.93,
          ST_GeomFromGeoJSON(${snappedPointJson}), 0.6,
          'near', false, 80,
          7, 'pending_audit', NOW()
        )
      `);

      const result = await getApprovedPoints(projectId);

      // Only Row 1 should appear
      expect(result.type).toBe('FeatureCollection');
      expect(result.features).toHaveLength(1);

      const feature = result.features[0];
      expect(feature.type).toBe('Feature');
      expect(feature.geometry.type).toBe('Point');

      // Coordinates: [longitude, latitude] per GeoJSON spec / ST_AsGeoJSON
      const coords = feature.geometry.coordinates as [number, number];
      expect(coords[0]).toBeCloseTo(28.92, 4);  // longitude first
      expect(coords[1]).toBeCloseTo(41.02, 4);  // latitude second
    });
  });

  // ── DASH-03: getSubmissions ───────────────────────────────────────────────

  describe('DASH-03: getSubmissions', () => {
    it('filters to only matching status rows', async () => {
      const { getSubmissions } = await import('@/actions/submissions');
      const { sql } = await import('drizzle-orm');

      const { tenantId, projectId, boqItemId, personId } = SPATIAL_FIXTURE_IDS;

      // Insert one approved and one rejected
      // NOTE: flow_id is uuid type — must use valid UUID values (Rule 1 fix)
      await db.execute(sql`
        INSERT INTO submissions (
          tenant_id, flow_id, person_id, project_id, boq_item_id,
          photo_url, location_lat, location_lon,
          location_match, location_warning,
          quantity, status, submitted_at
        ) VALUES
          (${tenantId}, ${'00000000-0000-0000-0002-000000000001'}, ${personId}, ${projectId}, ${boqItemId},
           ${'https://example.blob.vercel-storage.com/a.jpg'}, 41.0, 28.9,
           'near', false, 10, 'approved', NOW()),
          (${tenantId}, ${'00000000-0000-0000-0002-000000000002'}, ${personId}, ${projectId}, ${boqItemId},
           ${'https://example.blob.vercel-storage.com/b.jpg'}, 41.01, 28.91,
           'near', false, 5, 'rejected', NOW())
      `);

      const result = await getSubmissions(projectId, { status: 'approved' });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('approved');
      expect(result.total).toBe(1);
    });

    it('paginates correctly — page 2 returns the overflow row', async () => {
      const { getSubmissions } = await import('@/actions/submissions');
      const { sql } = await import('drizzle-orm');

      const { tenantId, projectId, boqItemId, personId } = SPATIAL_FIXTURE_IDS;
      const pageSize = 3;

      // Insert pageSize + 1 = 4 rows (all approved)
      // NOTE: flow_id is uuid type — use padded deterministic UUIDs (Rule 1 fix)
      for (let i = 0; i < pageSize + 1; i++) {
        const flowUuid = `00000000-0000-0000-0003-${String(i).padStart(12, '0')}`;
        await db.execute(sql`
          INSERT INTO submissions (
            tenant_id, flow_id, person_id, project_id, boq_item_id,
            photo_url, location_lat, location_lon,
            location_match, location_warning,
            quantity, status, submitted_at
          ) VALUES (
            ${tenantId}, ${flowUuid}, ${personId}, ${projectId}, ${boqItemId},
            ${'https://example.blob.vercel-storage.com/page' + i + '.jpg'}, 41.0, 28.9,
            'near', false, ${i + 1}, 'approved', NOW()
          )
        `);
      }

      // Page 1 should have pageSize rows
      const page1 = await getSubmissions(projectId, { page: 1, pageSize });
      expect(page1.rows).toHaveLength(pageSize);
      expect(page1.total).toBe(pageSize + 1);
      expect(page1.pageCount).toBe(2);

      // Page 2 should have 1 row (the overflow)
      const page2 = await getSubmissions(projectId, { page: 2, pageSize });
      expect(page2.rows).toHaveLength(1);
    });

    it('rejects an invalid status string', async () => {
      const { getSubmissions } = await import('@/actions/submissions');

      await expect(
        getSubmissions(SPATIAL_FIXTURE_IDS.projectId, { status: 'invalid_status' })
      ).rejects.toThrow();
    });
  });
});
