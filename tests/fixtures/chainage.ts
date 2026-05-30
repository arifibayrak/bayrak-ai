/**
 * tests/fixtures/chainage.ts
 *
 * Phase 15 chainage fixture — 3000m route + 3 approved submissions.
 *
 * UUID range: 0f00 (to avoid collision with existing fixtures):
 *   - HAKEDIS_FIXTURE_IDS       uses 0e00 range (exports.ts)
 *   - HAKEDIS_LIVE_FIXTURE_IDS  uses 0c00 range (hakedis.ts)
 *   - SPATIAL_FIXTURE_IDS       uses 0000 range (db.ts)
 *   - DXF_FIXTURE_IDS           uses 0d00 range (dxf.ts)
 *   - CHAINAGE_FIXTURE_IDS      uses 0f00 range (this file)
 *
 * Fixture state after seedChainageFixture(db):
 *   - 1 tenant            (0f00...0001)
 *   - 1 project           (0f00...0002)
 *   - 1 route             (0f00...0003) — total_length_m=3000, geometry_version=1, chainage_offset_m=0
 *   - 1 BOQ item          (0f00...0010)
 *   - 1 worker person     (0f00...0011) — the submitter
 *   - 1 auditor person    (0f00...0012) — decided_by on all 3 submissions
 *   - 3 submissions       (0f00...0020/0021/0022)
 *       segment_fraction = 0.166 / 0.5 / 0.833  (→ 498 / 1500 / 2499 m on a 3000m route)
 *       status = 'approved'
 *       chainage_m = NULL (left NULL so snapshot/backfill tests can assert the write)
 *       decided_by = auditor person id
 *
 * Why chainage_m is NULL on seed:
 *   The real write happens in handleAuditDecision (bot-audit.ts) inside the approval TX.
 *   Integration tests for CHN-03 (Plan 15-02) call that function and assert chainage_m is non-NULL.
 *   Seeding it here pre-written would make the test trivially pass without exercising the code path.
 */

import type { getTestDb } from './db';

type Db = Awaited<ReturnType<typeof getTestDb>>;

/**
 * CHAINAGE_FIXTURE_IDS — deterministic UUIDs shared between fixture and test assertions.
 *
 * tenantId matches getDefaultTenantId() so the fixture integrates with the default
 * tenant guard in Server Actions without any override.
 */
export const CHAINAGE_FIXTURE_IDS = {
  tenantId:      '00000000-0000-0000-0000-000000000001', // same default tenant as other fixtures
  projectId:     '00000000-0000-0000-0000-00000f000002',
  routeId:       '00000000-0000-0000-0000-00000f000003',
  boqItemId:     '00000000-0000-0000-0000-00000f000010',
  workerPersonId:'00000000-0000-0000-0000-00000f000011',
  auditorPersonId:'00000000-0000-0000-0000-00000f000012',
  submissionAId: '00000000-0000-0000-0000-00000f000020', // segment_fraction = 0.166 (~498m)
  submissionBId: '00000000-0000-0000-0000-00000f000021', // segment_fraction = 0.500 (1500m)
  submissionCId: '00000000-0000-0000-0000-00000f000022', // segment_fraction = 0.833 (~2499m)
  // Fake flow IDs (required by submissions.flow_id UNIQUE constraint)
  flowAId:       '0f000000-0000-0000-0000-00000f000020',
  flowBId:       '0f000000-0000-0000-0000-00000f000021',
  flowCId:       '0f000000-0000-0000-0000-00000f000022',
} as const;

/**
 * seedChainageFixture — inserts Phase 15 test fixtures into the test DB.
 *
 * Idempotent: all INSERTs use ON CONFLICT DO NOTHING so repeated calls
 * within a describeIfDb block are safe.
 *
 * Call pattern (mirrors spatial.test.ts + postgis.test.ts):
 *   beforeEach(async () => {
 *     db = await getTestDb();
 *     await truncateAllTables(db);
 *     await seedChainageFixture(db);
 *   });
 */
export async function seedChainageFixture(db: Db): Promise<typeof CHAINAGE_FIXTURE_IDS> {
  const { sql } = await import('drizzle-orm');

  const {
    tenantId,
    projectId,
    routeId,
    boqItemId,
    workerPersonId,
    auditorPersonId,
    submissionAId,
    submissionBId,
    submissionCId,
    flowAId,
    flowBId,
    flowCId,
  } = CHAINAGE_FIXTURE_IDS;

  // 1. Tenant
  await db.execute(
    sql.raw(`
      INSERT INTO tenants (id, name)
      VALUES ('${tenantId}', 'Chainage Test Tenant')
      ON CONFLICT DO NOTHING
    `)
  );

  // 2. Project
  await db.execute(
    sql.raw(`
      INSERT INTO projects (id, tenant_id, name)
      VALUES ('${projectId}', '${tenantId}', 'Chainage Test Project')
      ON CONFLICT DO NOTHING
    `)
  );

  // 3. Route — 3000m total_length_m, geometry_version=1, chainage_offset_m=0
  //    Minimal geometry: Istanbul LineString with enough points to be valid.
  //    The geometry does not need to be exactly 3000m; total_length_m is stored explicitly
  //    (computed at DXF/GeoJSON import time). Tests that compute chainage_m use total_length_m,
  //    not ST_Length(geom).
  const minimalLineString = JSON.stringify({
    type: 'LineString',
    coordinates: [
      [28.90, 41.00],
      [28.93, 41.03],
    ],
  });

  await db.execute(
    sql`
      INSERT INTO routes (id, tenant_id, project_id, geom, coordinate_count,
                          total_length_m, geometry_version, chainage_offset_m)
      VALUES (
        ${routeId},
        ${tenantId},
        ${projectId},
        ST_GeomFromGeoJSON(${minimalLineString}),
        2,
        3000,
        1,
        0
      )
      ON CONFLICT DO NOTHING
    `
  );

  // 4. BOQ item — submissions FK to boq_item_id is NOT NULL
  await db.execute(
    sql.raw(`
      INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order)
      VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'DN300 Çelik Boru', 'm', 3000, 0, 1)
      ON CONFLICT DO NOTHING
    `)
  );

  // 5. Worker person — submissions FK to person_id is NOT NULL
  await db.execute(
    sql.raw(`
      INSERT INTO people (id, tenant_id, telegram_user_id, display_name)
      VALUES ('${workerPersonId}', '${tenantId}', 999990011, 'Chainage Test Worker')
      ON CONFLICT DO NOTHING
    `)
  );

  // 6. Auditor person — decided_by FK references people
  await db.execute(
    sql.raw(`
      INSERT INTO people (id, tenant_id, telegram_user_id, display_name)
      VALUES ('${auditorPersonId}', '${tenantId}', 999990012, 'Chainage Test Auditor')
      ON CONFLICT DO NOTHING
    `)
  );

  // 7. Three approved submissions
  //    chainage_m is NULL — Plan 15-02 snapshot integration tests will write it.
  //    segment_fraction: 0.166 / 0.5 / 0.833
  //    decided_by: auditorPersonId
  //    photo_url must be non-null (NOT NULL constraint)
  const submissionRows = [
    { id: submissionAId, flowId: flowAId, segmentFraction: '0.16600000', label: 'A' },
    { id: submissionBId, flowId: flowBId, segmentFraction: '0.50000000', label: 'B' },
    { id: submissionCId, flowId: flowCId, segmentFraction: '0.83300000', label: 'C' },
  ];

  for (const row of submissionRows) {
    await db.execute(
      sql.raw(`
        INSERT INTO submissions (
          id, tenant_id, flow_id, person_id, project_id, boq_item_id,
          photo_url, quantity, status,
          segment_fraction, chainage_m, route_geometry_version,
          decided_by, decided_at
        )
        VALUES (
          '${row.id}',
          '${tenantId}',
          '${row.flowId}',
          '${workerPersonId}',
          '${projectId}',
          '${boqItemId}',
          'https://example.com/photos/chainage-fixture-${row.label}.jpg',
          '100.000',
          'approved',
          ${row.segmentFraction},
          NULL,
          NULL,
          '${auditorPersonId}',
          NOW()
        )
        ON CONFLICT DO NOTHING
      `)
    );
  }

  return CHAINAGE_FIXTURE_IDS;
}
