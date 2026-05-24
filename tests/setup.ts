// Vitest global setup — runs before each test file
// Loads environment variables from .env.local if present (for local dev)
// Note: TEST_DATABASE_URL must be set externally for DB integration tests

// No watch mode flags — this file runs in `vitest run` (non-interactive) mode only

// Ensure NODE_ENV is set for test environment
// NODE_ENV is set by vitest automatically; this comment documents expected value is "test"
