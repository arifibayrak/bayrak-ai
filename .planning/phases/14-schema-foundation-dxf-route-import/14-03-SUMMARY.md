---
phase: 14-schema-foundation-dxf-route-import
plan: "03"
subsystem: database-migrations
tags:
  - migrations
  - neon
  - schema
  - drizzle
dependency_graph:
  requires:
    - "14-02: migration SQL files authored (0010/0011/0012)"
  provides:
    - "Live v4.0 schema on both Neon branches (dev + test)"
    - "submission_ai_flags and route_source_documents tables on both branches"
  affects:
    - "All Phase 15/16 consumers (chainage, AI flags, route version history)"
tech_stack:
  added: []
  patterns:
    - "drizzle migrate() timestamp-ordering: journal `when` must be monotonically increasing after last applied migration's created_at"
    - "Drizzle statement-breakpoint splitter: --> in any SQL comment triggers split — use alternate text"
key_files:
  created: []
  modified:
    - src/db/migrations/meta/_journal.json
    - src/db/migrations/0010_v4_routes_ext.sql
    - package.json
decisions:
  - "Journal timestamps for 0010/0011/0012 corrected to 2026 epoch (was 2025 — caused Drizzle to silently skip)"
  - "migrate and migrate:test npm scripts added for repeatability"
  - "Phase 09-03 hash immutability preserved: only comment text fixed, no SQL DDL statements changed"
metrics:
  duration: "12 minutes"
  completed: "2026-05-30"
---

# Phase 14 Plan 03: Live Migration Apply Summary

**One-liner:** Applied migrations 0010 (routes/submissions v4 columns), 0011 (submission_ai_flags), and 0012 (route_source_documents) to both Neon branches (neondb dev + neondb_test) after fixing two Plan 14-02 journal authoring bugs.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 0 | Checkpoint: human approval | (pre-approved) | — |
| 1 | [BLOCKING] Apply 0010+0011+0012 to both branches + verify | 8cdde0b | package.json, 0010_v4_routes_ext.sql, meta/_journal.json |

## Verification Results

### Dev branch (neondb)
- Total migrations in DB: 13 (was 10 before this plan)
- routes new columns: geometry_version, total_length_m, chainage_offset_m, source_blob_url, source_crs, source_layer
- submissions new columns: chainage_m, route_geometry_version
- New tables: submission_ai_flags, route_source_documents

### Test branch (neondb_test)
- Total migrations in DB: 13 (was 10 before this plan)
- Same columns and tables confirmed as dev

### Schema smoke test
```
npx vitest run tests/dxf-parser.test.ts -t "schema" → PASSED
schema: geometry_version and chainage_m columns are expected on routes/submissions (RTE-05)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Drizzle journal timestamps caused migrations to be silently skipped**
- **Found during:** Task 1 (first apply attempt said "Migrations complete" but 0 new migrations applied)
- **Issue:** Migrations 0010/0011/0012 had `when` timestamps of ~1748556000000 (2025-05-29 epoch). Drizzle's `migrate()` compares `Number(lastDbMigration.created_at) < migration.folderMillis` — since 0009 was applied in 2026 (`created_at = 1780002113500`), all three new migrations were skipped as already in the past.
- **Root cause:** These timestamps were authored in Plan 14-02 with 2025 values instead of 2026 values matching the project timeline.
- **Fix:** Updated `when` in `_journal.json` for entries 10/11/12:
  - 0010: `1748556000000` → `1780088513500` (2026-05-29T22:01:53.500Z, 0009 + 1 day)
  - 0011: `1748556060000` → `1780088573500` (+ 1 min)
  - 0012: `1748556120000` → `1780088633500` (+ 1 min)
- **No SQL DDL changed** — only journal metadata. Phase 09-03 hash integrity preserved.
- **Commit:** 8cdde0b

**2. [Rule 1 - Bug] `-->` in 0010 comment text triggered statement-breakpoint splitter**
- **Found during:** Task 1 (second apply attempt errored with `syntax error at or near "separators"`)
- **Issue:** The comment in 0010 contained `-- Note: --> statement-breakpoint separators are MANDATORY` — the `-->` substring is Drizzle's literal breakpoint marker. This caused the comment text fragment ` separators are MANDATORY — neon-http cannot execute...` to be treated as a standalone SQL statement, producing a syntax error.
- **Fix:** Changed `-->` in the comment note to `-- >` (broken apart) to avoid triggering the splitter. No DDL statements modified.
- **Commit:** 8cdde0b

## Known Stubs

None — this is a migration-apply plan with no UI/data stubs.

## Threat Flags

None — no new endpoints or trust-boundary surfaces introduced. Both threats from the threat register (T-14-BRANCH, T-14-IMMUTABLE2) are mitigated: all three migrations applied to both branches in one session, no SQL DDL edited post-apply.

## Self-Check: PASSED

- `_journal.json` modified: confirmed present and correct
- `0010_v4_routes_ext.sql` comment fix: confirmed (no DDL lines changed)
- `package.json` migrate scripts added: confirmed
- Commit 8cdde0b: confirmed in git log
- Dev branch: 13 migrations, all 4 schema additions confirmed
- Test branch: 13 migrations, all 4 schema additions confirmed
- Schema smoke test: PASSED
