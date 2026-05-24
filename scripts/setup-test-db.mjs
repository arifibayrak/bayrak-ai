// Idempotent test-DB setup:
//   1. Ensure an isolated `neondb_test` database exists on the same Neon project.
//   2. Ensure TEST_DATABASE_URL is written to .env.local (pooled endpoint).
//   3. Migrate the test DB to the current schema (PostGIS + all drizzle migrations).
//
// Tests (describeIfDb) require TEST_DATABASE_URL to point at a fully migrated,
// ISOLATED database — never the dev DATABASE_URL (the suite TRUNCATEs tables).
//
// Usage: node scripts/setup-test-db.mjs
import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env.local");
const TEST_DB_NAME = "neondb_test";

config({ path: ENV_PATH, override: false });

const adminUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!adminUrl) {
  console.error("FATAL: neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set");
  process.exit(1);
}

const deriveDbName = (url) => new URL(url).pathname.replace(/^\//, "").split("?")[0];
const sourceDb = deriveDbName(adminUrl);
if (sourceDb === TEST_DB_NAME) {
  console.error(`FATAL: source DB is already '${TEST_DB_NAME}' — refusing`);
  process.exit(1);
}

const deriveTestUrl = (url) => {
  const u = new URL(url);
  u.pathname = `/${TEST_DB_NAME}`;
  return u.toString();
};
const testUrl = deriveTestUrl(process.env.DATABASE_URL || adminUrl);

// 1. Ensure the test database exists.
const { neon } = await import("@neondatabase/serverless");
const sql = neon(adminUrl);
const existing = await sql.query("SELECT 1 FROM pg_database WHERE datname = $1", [TEST_DB_NAME]);
if (existing.length > 0) {
  console.log(`[1/3] OK: database '${TEST_DB_NAME}' already exists`);
} else {
  await sql.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  console.log(`[1/3] CREATED: database '${TEST_DB_NAME}'`);
}

// 2. Ensure TEST_DATABASE_URL is in .env.local (no secret printed to stdout).
let envText = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
if (/^TEST_DATABASE_URL=/m.test(envText)) {
  console.log("[2/3] OK: TEST_DATABASE_URL already present in .env.local");
} else {
  const sep = envText.length && !envText.endsWith("\n") ? "\n" : "";
  envText += `${sep}# Isolated Neon test database for vitest DB-integration tests (describeIfDb)\nTEST_DATABASE_URL=${testUrl}\n`;
  fs.writeFileSync(ENV_PATH, envText);
  console.log("[2/3] WROTE: TEST_DATABASE_URL appended to .env.local");
}

// 3. Migrate the test DB to current schema (re-run safe; drizzle tracks applied migrations).
console.log("[3/3] Migrating test DB to current schema...");
const r = spawnSync("npx", ["tsx", "src/db/migrate.ts"], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl },
});
if (r.status !== 0) {
  console.error(`FATAL: test-DB migration failed (exit ${r.status})`);
  process.exit(r.status ?? 1);
}
console.log("DONE: neondb_test is ready and migrated.");
