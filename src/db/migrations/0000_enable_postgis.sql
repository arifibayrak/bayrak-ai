-- IMPORTANT: This must run before any CREATE TABLE with geometry columns.
-- On Neon, PostGIS is available but not enabled per-database by default.
-- This file is executed by src/db/migrate.ts BEFORE drizzle migrate() runs.
CREATE EXTENSION IF NOT EXISTS postgis;
