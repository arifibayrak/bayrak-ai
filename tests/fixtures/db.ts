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
  // truncateAllTables is only called inside describeIfDb blocks which require TEST_DATABASE_URL
  // pointing at a fully migrated DB — all tables are guaranteed to exist at call time.
  // Truncate all at once in dependency-safe order with CASCADE to handle FK relationships.
  const tableList = tables.map(t => `"${t}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} CASCADE`));
}
