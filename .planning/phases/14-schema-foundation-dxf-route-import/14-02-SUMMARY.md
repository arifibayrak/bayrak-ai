---
phase: 14-schema-foundation-dxf-route-import
plan: "02"
subsystem: database-schema
tags: [schema, drizzle, migrations, ai-flags, route-source-documents, chainage, versioning]
dependency_graph:
  requires: ["14-01"]
  provides: ["14-03"]
  affects: [routes-table, submissions-table, submission_ai_flags-table, route_source_documents-table]
tech_stack:
  added: []
  patterns: [drizzle-pg-table, statement-breakpoint-migration, fk-cascade, partial-index]
key_files:
  created:
    - src/db/schema/ai-flags.ts
    - src/db/schema/route-source-documents.ts
    - src/db/migrations/0010_v4_routes_ext.sql
    - src/db/migrations/0011_v4_ai_flags.sql
    - src/db/migrations/0012_v4_route_source_documents.sql
  modified:
    - src/db/schema/routes.ts
    - src/db/schema/submissions.ts
    - src/db/schema/index.ts
    - src/db/schema/office-activity-log.ts
    - tests/fixtures/db.ts
    - src/db/migrations/meta/_journal.json
decisions:
  - "route_source_documents has no UNIQUE on project_id — re-imports INSERT new rows by design (D-05 audit trail)"
  - "submission_ai_flags.submission_id is UNIQUE — one AI flag row per submission (eval gate AI-05)"
  - "chainage_m + route_geometry_version columns on submissions are nullable — Phase 15 writes them"
  - "OFFICE_ACTION_TYPES gains dxf_route_uploaded as TypeScript tuple change — no migration needed (text column)"
  - "Phase 14 tables added to truncateAllTables fallback set so pre-migration test runs stay green"
metrics:
  duration_minutes: 35
  completed_date: "2026-05-30"
  tasks_completed: 2
  files_changed: 11
---

# Phase 14 Plan 02: v4.0 Schema Foundation Summary

One-liner: Drizzle schema extended with 6 routes columns + 2 submissions columns + new submission_ai_flags table + new route_source_documents D-05 audit table + matching 0010/0011/0012 migration SQL with statement-breakpoints.

## What Was Built

### Task 1: Schema TypeScript (RTE-03/04/05, D-05)

**routes.ts extended** (6 new columns after `uploadedAt`):
- `geometry_version integer NOT NULL DEFAULT 1` — incremented on every re-import (D-04, RTE-05)
- `total_length_m numeric(12,2)` — materialized at upload time via `ST_Length(::geography)`
- `source_blob_url text` — convenience "latest" pointer; route_source_documents is the audit trail
- `source_crs text` — EPSG string stored for display in RouteTab metadata card (Plan 14-05)
- `source_layer text` — DXF layer name stored alongside the geometry
- `chainage_offset_m numeric(12,2) DEFAULT '0'` — user-calibration offset applied at display time

**submissions.ts extended** (2 new columns after `rejectionReason`):
- `chainage_m numeric(10,2)` — nullable; Phase 15 writes at approval time in the same transaction
- `route_geometry_version integer` — nullable; ties approval to the route version active at that moment

**ai-flags.ts created** (`submissionAiFlags` table):
- UUID PK, tenant_id FK (nullable D-09), submission_id FK (NOT NULL, ON DELETE CASCADE)
- status text DEFAULT 'pending', photoAnomalyScore numeric(4,3), workClassification text
- anomalyDescription text, evalPassed boolean, rawResponse jsonb (first jsonb table in project)
- createdAt + updatedAt timestamptz; UNIQUE(submission_id); 2 btree indexes (submission_id, status)

**route-source-documents.ts created** (`routeSourceDocuments` table — D-05 version history):
- UUID PK, tenantId NOT NULL FK, projectId NOT NULL FK (ON DELETE CASCADE)
- blobUrl text NOT NULL, docType text NOT NULL ('dxf'|'pdf')
- sourceCrs text (null for pdf), sourceLayer text (null for pdf), geometryVersion integer (null for pdf)
- uploadedAt timestamptz NOT NULL DEFAULT now()
- Composite index: (projectId, uploadedAt DESC) named `route_source_documents_project_uploaded_idx`
- NO UNIQUE on projectId — re-imports INSERT new rows; this IS the history

**Barrel (index.ts)**: added `export * from './ai-flags'` + `export * from './route-source-documents'`

**office-activity-log.ts**: OFFICE_ACTION_TYPES tuple gains `'dxf_route_uploaded'` (Plan 14-04 consumes)

**tests/fixtures/db.ts**:
- `'submission_ai_flags'` added before `'submissions'` in truncate order
- `'route_source_documents'` added before `'projects'` in truncate order
- Phase 14 fallback set (`phase14Tables`) added to `laterTables` so pre-migration tests stay green

### Task 2: Migration SQL (NOT yet applied — Plan 14-03 applies)

**0010_v4_routes_ext.sql**: 8 ALTER TABLE statements (6 on routes, 2 on submissions), each separated by `--\> statement-breakpoint`; partial index on submissions.chainage_m WHERE status='approved'; FK-safe seed pattern documented in header (no seed rows added); hand-written header comment.

**0011_v4_ai_flags.sql**: CREATE TABLE submission_ai_flags + 2 FK ALTER (tenant_id no-action, submission_id cascade) + 2 btree indexes + UNIQUE(submission_id); statement-breakpoints throughout (5 breakpoints = 6 DDL statements).

**0012_v4_route_source_documents.sql**: CREATE TABLE route_source_documents + 2 FK ALTER (tenant_id no-action, project_id cascade) + composite btree index (project_id, uploaded_at DESC); 3 statement-breakpoints; no UNIQUE on project_id by design (D-05).

**_journal.json**: entries idx 10/11/12 registered with breakpoints:true so `migrate()` picks them up in Plan 14-03.

## Verification

- `npx tsc --noEmit`: PASSED — all schema TypeScript compiles cleanly
- 0010 contains geometry_version + 8 ALTERs + partial index: VERIFIED
- 0011 creates submission_ai_flags with cascade FK + 2 indexes + unique: VERIFIED
- 0012 creates route_source_documents with project_id cascade + composite index + NO project_id unique: VERIFIED
- No change to bot-audit.ts / handleAuditDecision: VERIFIED (chainage write is Phase 15)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. This plan only authors DDL files (schema + SQL). The write behavior for:
- chainage_m + route_geometry_version → Phase 15 (handleAuditDecision transaction)
- routeSourceDocuments INSERT per import → Plan 14-04 (uploadDxf Server Action)
- submissionAiFlags INSERT → Phase 16 (enqueueAiFlag)

These are intentional column-only stubs; the plan explicitly scopes out the write behavior.

## Threat Flags

All T-14-* mitigations from the plan's threat model are addressed:
- T-14-FKSEED: No new seed rows in 0010; FK-safe pattern documented in header
- T-14-IMMUTABLE: Hand-written header on all three migrations forbids drizzle-kit regeneration
- T-14-MULTISTMT: All DDL statements separated by `--\> statement-breakpoint`
- T-14-SRCDOC-FK: project_id FK ON DELETE cascade + tenant_id NOT NULL enforced in schema

## Self-Check: PASSED
