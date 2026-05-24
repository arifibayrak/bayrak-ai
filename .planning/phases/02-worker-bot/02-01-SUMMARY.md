---
phase: 02-worker-bot
plan: "01"
subsystem: db-schema
tags: [schema, drizzle, telegram-bot, idempotency, fsm]
dependency_graph:
  requires: [01-foundation]
  provides: [conversation_state, processed_updates, submissions, wave-0-test-scaffold]
  affects: [02-02, 02-03, 02-04, 02-05]
tech_stack:
  added: []
  patterns: [drizzle-pgTable, jsonb-column, geometry-point-gist, text-enum, named-unique-constraint, truncateAllTables-extension, vitest-describeIfDb]
key_files:
  created:
    - src/db/schema/conversation-state.ts
    - src/db/schema/processed-updates.ts
    - src/db/schema/submissions.ts
    - tests/telegram-bot.test.ts
  modified:
    - src/db/schema/index.ts
    - tests/fixtures/db.ts
decisions:
  - "D-12 honored: DB-row FSM (conversation_state) instead of @grammyjs/conversations — avoids replay footgun"
  - "D-13 Guard 1: processed_updates PRIMARY KEY on update_id (dedup fence before tenant resolution)"
  - "D-13 Guard 2: named unique('submissions_flow_id_unique') on submissions.flowId (double-confirm prevention)"
  - "D-22 honored: updatedAt column on conversation_state (not createdAt) — TTL staleness check reads this"
  - "Phase 4 ready: geometry(location, point, xy, 4326) + GiST index on submissions — no migration needed when PostGIS nearest-segment lands"
metrics:
  duration: "3 minutes"
  completed: "2026-05-24T12:01:33Z"
  tasks_completed: 3
  files_created: 4
  files_modified: 2
---

# Phase 2 Plan 1: Schema Foundation + Wave 0 Test Scaffold Summary

Three Drizzle schema files for the worker-bot FSM (conversation_state, processed_updates, submissions) with D-13 Guards 1 and 2, registered in the schema barrel, with FK-safe test truncation and a vitest Wave 0 scaffold that runs green.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Author conversation_state and processed_updates schema files | bed1f10 | src/db/schema/conversation-state.ts, src/db/schema/processed-updates.ts |
| 2 | Author submissions schema file + register all three in barrel | 0dbdcbd | src/db/schema/submissions.ts, src/db/schema/index.ts |
| 3 | Extend truncateAllTables + create Wave 0 test scaffold | 1e387b9 | tests/fixtures/db.ts, tests/telegram-bot.test.ts |

## Verification Evidence

- `npx tsc --noEmit` — TypeScript compilation completed (zero errors)
- `npx vitest run tests/telegram-bot.test.ts` — 3 pass, 0 fail

## Schema Summary

### conversation_state
- uuid PK + tenantId nullable FK (D-09 pattern)
- telegramUserId bigint UNIQUE — one active flow per worker (D-12)
- personId uuid FK to people
- flowId uuid defaultRandom — carried to submissions as D-13 Guard 2 key
- currentStep text, data jsonb default '{}'
- updatedAt timestamp with timezone — D-22 TTL check column; handlers MUST bump this on every state write
- index on telegram_user_id

### processed_updates
- updateId bigint PRIMARY KEY — D-13 Guard 1 dedup fence
- processedAt timestamp with timezone
- Intentionally: no uuid PK, no tenantId — dedup applies before tenant context is resolved
- No secondary indexes (PRIMARY KEY is the unique index)

### submissions
- uuid PK + tenantId nullable FK (D-09 pattern)
- flowId uuid notNull — D-13 Guard 2 key linking to conversation_state.flowId
- personId / projectId / boqItemId FKs
- photoUrl text notNull (Vercel Blob URL), photoFileId nullable (Telegram file_id)
- location geometry(point, xy, 4326) nullable + GiST index — Phase 4 PostGIS ready
- locationLat / locationLon numeric(10,7) nullable
- quantity numeric(12,3) notNull, notes text nullable (D-21 skip allowed)
- status text enum ['pending_audit','approved','rejected'] default 'pending_audit' (LOG-08)
- submittedAt timestamp with timezone
- Constraints: unique('submissions_flow_id_unique').on(flowId), plus indexes on project/person/status

### schema/index.ts barrel
Appended in FK dependency order:
```
export * from './conversation-state';  // references tenants, people
export * from './processed-updates';   // no FK references
export * from './submissions';         // references tenants, people, projects, boq-items
```

### tests/fixtures/db.ts
Three new tables prepended to truncation list (FK-safe, most dependent first):
`"submissions"`, `"conversation_state"`, `"processed_updates"` — placed before `"assignments"`

### tests/telegram-bot.test.ts Wave 0 Scaffold
- Group (a): Turkish decimal normalization — 3 real passing assertions (Pitfall-4 permanent guard)
- Group (b): step input enforcement — it.todo() placeholders for LOG-04/05/06 (Wave 4)
- Group (c): describeIfDb submission persistence & idempotency (SC4) — it.todo() for LOG-08 + D-13 tests (Wave 5)
- `setupBotForTest()` helper exported — bot.botInfo setter + api.config.use transformer pattern for later waves

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

No new security surface introduced. All schema changes are source-only (no live DB push in this plan — that is Plan 02-03's job). D-13 Guards 1 and 2 are expressed in schema source as required.

## Known Stubs

None. Schema files are complete definitions, not stubs. Test file contains it.todo() placeholders by design (Wave 4 and Wave 5 fill these in) — this is the intended Wave 0 state, not a data-wiring stub.

## Self-Check: PASSED
