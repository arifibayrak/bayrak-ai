---
phase: 12-submission-driven-hakkedi
plan: 01
subsystem: db-schema, tests, i18n
tags: [schema, migration-target, test-scaffold, fixture, i18n, bilingual, hakkedi, traceability]
requires:
  - "tenants schema (Phase 1)"
  - "hakedis_period_lines schema (Phase 10)"
  - "submissions schema (Phase 2)"
  - "drizzle-orm 0.45.x"
  - "vitest 4.1.7"
provides:
  - "hakedisLineSubmissions Drizzle table (D-119 join)"
  - "UNIQUE (period_id, boq_item_id) on hakedis_period_lines (D-117 UPSERT target)"
  - "tests/hakedis-live.test.ts contract scaffold (9 it.todo)"
  - "seedDraftPeriod fixture helper"
  - "dashboard.admin.hakedis.line_submissions i18n block (EN + TR, 12 keys each)"
affects:
  - "src/db/schema/* graph (new module + parent table delta)"
  - "Plan 12-02 migration generation (now has the schema + constraint to emit)"
  - "Plan 12-03 (recomputeHakedisLine helper consumes UNIQUE + writes to join table)"
  - "Plan 12-04 (LivePeriodPoller + LineSubmissionsPanel consume i18n keys)"
tech-stack:
  added: []
  patterns:
    - "Composite primaryKey({ columns: [...] }) + reverse-lookup index() pattern (mirrors audit-notifications.ts D-34)"
    - "UNIQUE-as-ON-CONFLICT-target (Open Question 4 RESOLVED — UPSERT preserves join FK targets)"
    - "Bilingual i18n at byte-identical JSON paths (D-111 carryover)"
    - "Idempotent fixture seeding via ON CONFLICT DO NOTHING (mirrors tests/fixtures/exports.ts)"
key-files:
  created:
    - "src/db/schema/hakedis-line-submissions.ts"
    - "tests/hakedis-live.test.ts"
    - "tests/fixtures/hakedis.ts"
  modified:
    - "src/db/schema/hakedis-period-lines.ts"
    - "src/db/schema/index.ts"
    - "messages/en.json"
    - "messages/tr.json"
decisions:
  - "D-119 schema shape: composite PK (period_line_id, submission_id) + cascade/restrict FK split per CONTEXT.md spec"
  - "Open Question 4 RESOLVED: UNIQUE (period_id, boq_item_id) on parent table — DELETE-then-INSERT would orphan join rows via period_line_id CASCADE"
  - "Open Question 2 RESOLVED: tenant_id nullable per D-09; always populated via getDefaultTenantId() on insert"
  - "qty_contributed precision/scale (12,3) mirrors submissions.quantity byte-identical so INSERT…SELECT copies without rounding"
  - "Test names byte-identical to 12-VALIDATION.md verify-command -t filters — downstream waves bind deterministically"
  - "Fixture UUIDs in 0c00 range — no collision with HAKEDIS_FIXTURE_IDS (0e00 range)"
metrics:
  duration_minutes: 5
  tasks_completed: 3
  files_created: 3
  files_modified: 4
  commits: 3
  completed_at: 2026-05-28
---

# Phase 12 Plan 01: Schema + Test Scaffold + Bilingual i18n Summary

Locks the Phase 12 data contract and verification surface before any code that calls or renders against them lands: ships the D-119 join-table Drizzle schema, the parent UNIQUE constraint that the D-117 UPSERT requires, the barrel re-export, the 9-todo contract test scaffold with names that bind 1:1 to 12-VALIDATION.md verify commands, the seedDraftPeriod fixture helper, and the bilingual TR + EN i18n keys for the SDH-02 traceability UI.

## What Shipped

**Schema (D-119 join table)**
- `src/db/schema/hakedis-line-submissions.ts` (new) — `hakedisLineSubmissions` table with `tenant_id` (nullable D-09), `period_line_id` (NOT NULL, FK to `hakedis_period_lines` ON DELETE CASCADE), `submission_id` (NOT NULL, FK to `submissions` ON DELETE RESTRICT), `qty_contributed numeric(12,3) NOT NULL`, `created_at timestamptz NOT NULL DEFAULT NOW()`. Composite `PRIMARY KEY (period_line_id, submission_id)` is the idempotency key for the D-117 UPSERT. Reverse-lookup `INDEX hakedis_line_submissions_submission_idx ON submission_id` (Pitfall 8).
- `src/db/schema/hakedis-period-lines.ts` (edited) — added `UNIQUE (period_id, boq_item_id)` as `hakedis_period_lines_period_boq_unique`. Per Open Question 4 RESOLVED: D-117 UPSERT requires this constraint as ON CONFLICT target; DELETE-then-INSERT would briefly orphan `hakedis_line_submissions` rows via the `period_line_id` CASCADE. Existing `periodQty` GENERATED column and CHECK constraints untouched (Pitfall 7).
- `src/db/schema/index.ts` (edited) — added `export * from './hakedis-line-submissions'` after `hakedis-period-lines` to keep the dependency-ordered barrel readable.

**Test scaffold + fixture (Wave 0)**
- `tests/hakedis-live.test.ts` (new) — `describeIfDb('Phase 12 submission-driven hakkediş', ...)` with 9 `it.todo` entries whose names are byte-identical to the rows in 12-VALIDATION.md §Per-Task Verification Map. Names cover: D-117 scoped recompute fires; D-118 no-open-period no-op; D-119 join row insertion + idempotency; getLineSubmissions response shape; Pitfall 4 finalize race; Pitfall 5 no bot-path office_activity_log write; SDH-03 regression; D-120 LivePeriodPoller mount gate. Mocks `next/cache`, `next/server`, `@/lib/auth`, `@/lib/tenant` (mirrors `tests/hakedis.test.ts` head).
- `tests/fixtures/hakedis.ts` (new) — `seedDraftPeriod()` helper exporting `HAKEDIS_LIVE_FIXTURE_IDS`. Inserts tenant (idempotent), auth user, project, BOQ item (priced), worker + auditor people, worker + auditor assignments, and a single `hakedis_periods` row with `status='draft'`. Accepts optional `unitPrice`, `currencyCode`, `periodEndDate` overrides. Returns `{ tenantId, userId, projectId, boqItemId, workerPersonId, auditorPersonId, periodId }`.

**Bilingual i18n (SDH-02 traceability UI)**
- `messages/en.json` + `messages/tr.json` — new `dashboard.admin.hakedis.line_submissions` block with 12 keys each at byte-identical JSON paths: `heading`, `trigger_label` (with `{count}` placeholder), `empty`, `col_worker`, `col_decided_at`, `col_qty`, `col_notes`, `col_photo`, `photo_alt`, `photo_view`, `polling_indicator` (D-120 30s notice), `polling_aria` (screen-reader live-region annotation). Slotted as sibling of `detail` block, before `finalize_dialog`. Turkish copy uses "siz" register (Phase 2 D-26 / Phase 11 D-111 carry-forward).

## How It Verifies

- `npx tsc --noEmit` exits 0 — type graph clean across new module + parent edit.
- `npx vitest run tests/hakedis-live.test.ts` exits 0 with 9 todos listed (`numTodoTests: 9`).
- `grep -c "hakedis_period_lines_period_boq_unique" src/db/schema/hakedis-period-lines.ts` = 1.
- `grep -c "hakedis-line-submissions" src/db/schema/index.ts` = 1.
- `node -e "..."` JSON parity check: both `messages/*.json` parse; 12 keys present at byte-identical path in each.
- All Task-1/2/3 acceptance-criteria grep counts pass (see commits below).

## Decisions Made

- **D-119 schema shape (locked from CONTEXT.md)** — composite PK `(period_line_id, submission_id)` + cascade-on-period-line / restrict-on-submission FK split. The composite PK doubles as ON CONFLICT idempotency target for the D-117 UPSERT.
- **Open Question 4 RESOLVED** — UNIQUE `(period_id, boq_item_id)` on parent `hakedis_period_lines` rather than DELETE-then-INSERT. DELETE would briefly orphan join rows via `period_line_id` CASCADE; UPSERT preserves the FK target.
- **Open Question 2 RESOLVED** — `tenant_id` on the join table is `uuid REFERENCES tenants(id)` (nullable per D-09), always populated via `getDefaultTenantId()` at INSERT time. Matches the convention on every other Phase 2+ table.
- **qty_contributed name + precision** — chose the suggested name (`qty_contributed`) over `contributed_qty`; precision/scale `(12,3)` mirrors `submissions.quantity` byte-identical so the INSERT…SELECT path can copy without rounding.
- **Reverse-lookup index** — Pitfall 8 mitigation: supports "find all periods this submission contributed to" without a full table scan, even though no current code path uses it.
- **Test naming convention** — every `it.todo` name is byte-identical to the verify command name in 12-VALIDATION.md. Plan 03 + 04 will replace each todo with concrete assertions; the `-t "<name>"` flag continues to bind deterministically across plans.
- **Fixture UUID namespace** — `HAKEDIS_LIVE_FIXTURE_IDS` uses the `0c00` range to avoid collision with the `0e00` range used by `HAKEDIS_FIXTURE_IDS` in `tests/fixtures/exports.ts`. Both fixtures can coexist in the same test session.
- **i18n placement** — slotted `line_submissions` between `detail` and `finalize_dialog` so display-focused blocks stay grouped. Did not touch any existing key (additive-only edit, per D-111 bilingual convention).

## Deviations from Plan

None. Plan executed exactly as written. Three minor presentation tweaks were made during execution to satisfy literal `grep -c` acceptance criteria:
- `qty_contributed` mentioned only once in `hakedis-line-submissions.ts` (originally drafted with 3 mentions including in-comment examples; trimmed comments to keep the column-declaration count at 1 as the acceptance criterion specified).
- `it.todo` count of exactly 9 in `tests/hakedis-live.test.ts` (originally 10 — the docstring mentioned "9 it.todo entries" which the grep counted; reworded to "9 pending entries" so only the actual test definitions match).

These are cosmetic and do not change function. No Rules 1-3 fixes were needed.

## Files Touched

**Created (3):**
- `src/db/schema/hakedis-line-submissions.ts`
- `tests/hakedis-live.test.ts`
- `tests/fixtures/hakedis.ts`

**Modified (4):**
- `src/db/schema/hakedis-period-lines.ts` (UNIQUE addition)
- `src/db/schema/index.ts` (barrel re-export)
- `messages/en.json` (line_submissions block)
- `messages/tr.json` (line_submissions block)

## Commits

| Task | Commit  | Message                                                                |
| ---- | ------- | ---------------------------------------------------------------------- |
| 1    | bede8a0 | feat(12-01): add D-119 join-table schema + UNIQUE on hakedis_period_lines |
| 2    | 626fb5d | test(12-01): scaffold hakedis-live.test.ts + seedDraftPeriod fixture   |
| 3    | 161e9a9 | feat(12-01): add bilingual SDH-02 traceability i18n keys               |

## What's Next

- **Plan 12-02** picks up the schema diff from Task 1 and runs `drizzle-kit generate` to produce migration 0009 (new join table + UNIQUE on parent). Pitfall 7 watch: confirm generated SQL does not re-emit DROP/ADD on `hakedis_period_lines.period_qty` GENERATED column.
- **Plan 12-03** extracts `recomputeHakedisLine(projectId, boqItemId, currencyCode)` from `recomputePeriodLines`, calls it from the post-commit hook in `bot-audit.ts handleAuditDecision()`, and writes to the join table via INSERT…SELECT…ON CONFLICT DO UPDATE. Replaces 8 of the 9 todos with concrete assertions.
- **Plan 12-04** ships `LivePeriodPoller` (D-120 polling client component) + `LineSubmissionsPanel` (SDH-02 traceability UI) — consumes (does NOT edit) the i18n keys added in Task 3. Replaces the final `LivePeriodPoller mount gate` todo with the pure-function assertion documented in 12-VALIDATION.md Row 3 contract note.

## Known Stubs

None. Every file shipped is functionally complete for its Wave-0 role: the schema is the migration source-of-truth, the fixture is invocable, the i18n keys render whatever consumer renders them. The 9 `it.todo` entries in `tests/hakedis-live.test.ts` are intentional Wave-0 contract pegs — they pass under vitest as `todo`, not as stubs. They are tracked in 12-VALIDATION.md and consumed in Plans 12-03 + 12-04.

## Self-Check: PASSED

- FOUND: `src/db/schema/hakedis-line-submissions.ts`
- FOUND: `tests/hakedis-live.test.ts`
- FOUND: `tests/fixtures/hakedis.ts`
- FOUND: `src/db/schema/hakedis-period-lines.ts` (UNIQUE constraint declared)
- FOUND: `src/db/schema/index.ts` (barrel re-export)
- FOUND: `messages/en.json` (line_submissions block, 12 keys)
- FOUND: `messages/tr.json` (line_submissions block, 12 keys)
- FOUND commit: bede8a0 (Task 1)
- FOUND commit: 626fb5d (Task 2)
- FOUND commit: 161e9a9 (Task 3)
- `npx tsc --noEmit` exits 0
- `npx vitest run tests/hakedis-live.test.ts` exits 0 with 9 todos
