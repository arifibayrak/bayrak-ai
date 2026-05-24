// Vitest global setup — runs before each test file
// Loads environment variables from .env.local so DB integration tests can connect
// to the Neon database without requiring env vars to be set externally.

import { config } from 'dotenv';
import path from 'path';

// Load .env.local from the project root (one level above tests/)
// dotenv ignores keys already set in process.env so CI-injected vars take precedence.
config({
  path: path.resolve(__dirname, '..', '.env.local'),
  override: false, // never overwrite env vars already set (e.g. CI)
});

// Route the app's db client at the dedicated test branch during tests.
// Server Actions under test import `db` from `@/db`, which binds to DATABASE_URL.
// The test fixtures (getTestDb) use TEST_DATABASE_URL. If those point at different
// databases, action writes and fixture reads diverge (FK violations / "not found").
// Overriding DATABASE_URL here makes BOTH use the isolated test branch — and
// guarantees the test suite can never touch the production database.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
