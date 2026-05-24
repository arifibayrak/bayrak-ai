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
