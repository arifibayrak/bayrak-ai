-- HAND-WRITTEN: backfill chainage_m + route_geometry_version for existing approved submissions.
-- These values are ESTIMATED snapshots — they use current route geometry at migration-apply time,
-- NOT the route geometry that was active at each submission's original approval time.
-- A true snapshot would require the route geometry at the time of approval, which was not stored
-- for pre-Phase-15 approvals. This is a best-effort historical reconstruction.
--
-- Apply only via `npx tsx src/db/migrate.ts` (D-49 — never drizzle-kit push).
-- Apply to BOTH Neon branches: dev (DATABASE_URL) + test (TEST_DATABASE_URL):
--   npx tsx src/db/migrate.ts
--   DATABASE_URL=$DATABASE_URL_TEST npx tsx src/db/migrate.ts
--
-- WARNING: Do NOT re-run drizzle-kit generate over this file — it is pure DML with no DDL.
-- Do NOT edit 0010–0012 (applied, hash-locked — Phase 09-03 immutability decision).
--
-- Single DML statement — no `-- > statement-breakpoint` separator needed.
-- If a future editor adds a second DML statement, they MUST add the separator between them
-- (neon-http driver cannot execute multiple statements in one prepared call, D-07-02).
--
-- Guard clauses:
--   AND s.chainage_m IS NULL         — skip rows already backfilled (idempotent re-run safe)
--   AND s.segment_fraction IS NOT NULL — skip no_route submissions (no spatial data)
--   AND r.total_length_m IS NOT NULL  — skip projects with no route upload post-Phase-14
--
-- Post-apply verification (run manually after apply):
--   SELECT COUNT(*) FROM submissions
--   WHERE status = 'approved'
--     AND chainage_m IS NULL
--     AND segment_fraction IS NOT NULL;
-- Result should be 0. Non-zero means routes need re-upload to populate total_length_m.
UPDATE submissions s
SET
  chainage_m = ROUND(
    s.segment_fraction::numeric * r.total_length_m::numeric,
  2),
  route_geometry_version = r.geometry_version
FROM routes r
WHERE r.project_id = s.project_id
  AND s.status = 'approved'
  AND s.chainage_m IS NULL
  AND s.segment_fraction IS NOT NULL
  AND r.total_length_m IS NOT NULL;
