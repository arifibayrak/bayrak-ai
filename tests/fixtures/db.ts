/**
 * DB test helper + describeIfDb guard.
 *
 * describeIfDb skips the test suite when TEST_DATABASE_URL is not set,
 * so unit tests stay runnable without a database connection.
 * When TEST_DATABASE_URL is set, the full suite runs against the test DB.
 */

import { describe } from "vitest";

/** True when a test database URL is available in the environment */
export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

/**
 * describeIfDb — use instead of `describe` for any test suite that requires
 * a live database.  When TEST_DATABASE_URL is not set, the suite is skipped
 * automatically; this keeps `npx vitest run` green on machines without a DB.
 *
 * Usage:
 *   describeIfDb("my DB integration test", () => { ... });
 */
export const describeIfDb = hasTestDb ? describe : describe.skip;

/**
 * getTestDb — returns a Drizzle client bound to TEST_DATABASE_URL.
 * Only call inside a describeIfDb block (TEST_DATABASE_URL is guaranteed set).
 */
export async function getTestDb() {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error(
      "getTestDb() called without TEST_DATABASE_URL — use describeIfDb to gate this test"
    );
  }

  // Lazy import to avoid loading neon/drizzle in environments without the dep
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { neon } = await import("@neondatabase/serverless");

  const sql = neon(process.env.TEST_DATABASE_URL);
  return drizzle(sql);
}

/**
 * truncateAllTables — resets test data between tests.
 * Call in beforeEach / afterEach inside a describeIfDb block.
 *
 * Tables are truncated in dependency-safe order (children first).
 * Extend this list as new tables are added in later plans.
 */
export async function truncateAllTables(db: Awaited<ReturnType<typeof getTestDb>>) {
  const { sql } = await import("drizzle-orm");

  // Truncate in reverse FK dependency order (most dependent first)
  const tables = [
    // Phase 3 tables (most dependent — references submissions/people/tenants)
    "audit_notifications",   // references submissions → must truncate before submissions
    // Phase 2 tables (most dependent — references people/projects/boq_items/tenants)
    "submissions",
    "conversation_state",
    "processed_updates",
    "assignments",
    "pending_people",
    "people",
    "boq_items",
    "routes",
    "projects",
    "tenants",
    // Auth.js tables
    "verification_tokens",
    "sessions",
    "accounts",
    "users",
  ];

  // TRUNCATE TABLE IF EXISTS is not valid PostgreSQL syntax (IF EXISTS is only for DROP TABLE).
  // RESTART IDENTITY is only relevant for SERIAL/IDENTITY columns; all our tables use UUID PKs.
  //
  // Wave strategy: some tables in the list (e.g. audit_notifications) are registered here at
  // schema-definition time (Plan 03-01) but not yet migrated to the test DB until Plan 03-02.
  // To keep Phase 1/2 tests green before the migration lands, we attempt the full truncation
  // first; if it fails with "relation does not exist" (Postgres error code 42P01), we fall back
  // to truncating only the tables that existed before Plan 03-02.
  const tableList = tables.map(t => `"${t}"`).join(', ');
  try {
    await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} CASCADE`));
  } catch (err: unknown) {
    // 42P01 = undefined_table — a Phase 3 table hasn't been migrated yet.
    // Retry with only the pre-Phase-3 tables so existing tests stay green.
    // NeonDbError wraps the PG code in .code; drizzle may also wrap it in .cause.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    const pgCode = e?.code ?? e?.cause?.code ?? '';
    const isUndefinedTable = pgCode === '42P01' ||
      (typeof e?.message === 'string' && e.message.includes('does not exist'));
    if (isUndefinedTable) {
      const phase2Tables = tables.filter(t => t !== 'audit_notifications');
      const phase2List = phase2Tables.map(t => `"${t}"`).join(', ');
      await db.execute(sql.raw(`TRUNCATE TABLE ${phase2List} CASCADE`));
    } else {
      throw err;
    }
  }
}

/**
 * Deterministic UUIDs for Phase 4 spatial fixture rows.
 * Shared between seedSpatialFixture and test assertions.
 */
export const SPATIAL_FIXTURE_IDS = {
  tenantId:   '00000000-0000-0000-0000-000000000001',
  projectId:  '00000000-0000-0000-0000-000000000002',
  routeId:    '00000000-0000-0000-0000-000000000003',
  boqItemId:  '00000000-0000-0000-0000-000000000010',
  personId:   '00000000-0000-0000-0000-000000000011',
} as const;

/**
 * seedSpatialFixture — inserts the minimal fixture rows needed by Phase 4 snap tests.
 *
 * Inserts (all with ON CONFLICT DO NOTHING for idempotent seeding):
 *   - tenant  (id 0000...0001)
 *   - project (id 0000...0002, tenant_id = above)
 *   - BOQ item (id 0000...0010, project_id = above)
 *   - person   (id 0000...0011, tenant_id = above)
 *   - routes row with Istanbul LineString [[28.9, 41.0], [28.95, 41.05]] (id 0000...0003)
 *
 * Does NOT insert a submissions row — individual tests build their own submissions
 * so near/far/no_route fixture locations can vary independently.
 *
 * Returns the deterministic IDs for use in test assertions.
 */
export async function seedSpatialFixture(
  db: Awaited<ReturnType<typeof getTestDb>>
): Promise<typeof SPATIAL_FIXTURE_IDS> {
  // Lazy import consistent with truncateAllTables pattern
  const { sql } = await import("drizzle-orm");

  const { tenantId, projectId, routeId, boqItemId, personId } = SPATIAL_FIXTURE_IDS;

  // 1. Tenant
  await db.execute(
    sql.raw(`
      INSERT INTO tenants (id, name)
      VALUES ('${tenantId}', 'Spatial Test Tenant')
      ON CONFLICT DO NOTHING
    `)
  );

  // 2. Project
  await db.execute(
    sql.raw(`
      INSERT INTO projects (id, tenant_id, name)
      VALUES ('${projectId}', '${tenantId}', 'Spatial Test Project')
      ON CONFLICT DO NOTHING
    `)
  );

  // 3. BOQ item — submissions has notNull FK to boq_item_id
  await db.execute(
    sql.raw(`
      INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order)
      VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'DN200 HDPE Boru', 'm', 1000, 0, 1)
      ON CONFLICT DO NOTHING
    `)
  );

  // 4. Person — submissions has notNull FK to person_id
  await db.execute(
    sql.raw(`
      INSERT INTO people (id, tenant_id, telegram_user_id, display_name)
      VALUES ('${personId}', '${tenantId}', 999999901, 'Spatial Test Worker')
      ON CONFLICT DO NOTHING
    `)
  );

  // 5. Route — Istanbul LineString [[28.9, 41.0], [28.95, 41.05]]
  // Uses parameterized sql`` (NOT string interpolation) for the GeoJSON argument,
  // mirroring tests/postgis.test.ts line 73 — prevents any injection risk.
  const istanbulLineString = JSON.stringify({
    type: 'LineString',
    coordinates: [
      [28.9, 41.0],    // Istanbul reference point (lng first, per GeoJSON / D-48)
      [28.95, 41.05],  // second point ~6 km northeast
    ],
  });
  await db.execute(
    sql`
      INSERT INTO routes (id, tenant_id, project_id, geom, coordinate_count)
      VALUES (
        ${routeId},
        ${tenantId},
        ${projectId},
        ST_GeomFromGeoJSON(${istanbulLineString}),
        2
      )
      ON CONFLICT DO NOTHING
    `
  );

  return SPATIAL_FIXTURE_IDS;
}
