---
phase: 07-data-foundation-canonical-record
plan: "04"
subsystem: database
tags: [server-actions, boq, activity-log, drizzle, grammY, unit-price, currency, telegram, next-intl]

# Dependency graph
requires:
  - phase: 07-data-foundation-canonical-record/07-03
    provides: logOfficeActivity() helper + getOfficeActivityLog() analytics reader
  - phase: 07-data-foundation-canonical-record/07-01
    provides: DB schema with unit_price/currency_code columns on boq_items and office_activity_log table
provides:
  - setUnitPrice() Server Action — auth-guarded, tenant-scoped, validates non-negative, logs unit_price_set
  - logOfficeActivity() wired (un-awaited) across all 5 BOQ mutations, 3 project mutations, 3 people mutations, 1 route mutation
  - BOQ edit dialog with unit price (optional, comma-tolerant) + currency select (TRY/USD/EUR, TRY default)
  - Unpriced items display placeholder "—" not "0" in the dialog and table
  - COST-01 + PERF-03 requirements closed
affects:
  - phase-09-office-scorecard (reads office_activity_log for scorecard data)
  - phase-10-hakedis-billing (reads unit_price + currency_code for earned-value calculations)
  - phase-11-exports (BOQ line items now carry price + currency for export)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "setUnitPrice pattern: auth() guard → validate parseFloat(isNaN/negative) → fetch old row (tenant-scoped) → UPDATE SET → logOfficeActivity (void, un-awaited) → revalidatePath"
    - "All office-engineer mutations end with an un-awaited logOfficeActivity() call; never await, never let it fail the primary mutation"
    - "Empty price field submits as null (clearable), never '0'; form state keeps empty string as '' not '0'"
    - "Currency select defaults to 'TRY'; new fields use next-intl keys col_unit_price / col_currency / unit_price_placeholder / unit_price_hint"

key-files:
  created: []
  modified:
    - src/actions/boq.ts
    - src/actions/projects.ts
    - src/actions/people.ts
    - src/actions/routes.ts
    - src/components/dashboard/BoqItemDialog.tsx
    - src/components/dashboard/BoqTable.tsx
    - tests/analytics.test.ts
    - messages/en.json
    - messages/tr.json
    - tests/boq.test.ts
    - tests/people.test.ts
    - tests/projects.test.ts

key-decisions:
  - "setUnitPrice fetches old row (unit_price + project_id) before UPDATE so logOfficeActivity can record oldPrice in metadata — metadata carries oldPrice/newPrice/currencyCode, not PII"
  - "TDD RED commits (20ac2bd, f6285e9) precede GREEN commits (b2c703c, a5344ba) — TDD gate sequence maintained"
  - "next/server after() mock added to boq.test.ts / people.test.ts / projects.test.ts (Rule 1 fix: logOfficeActivity wiring caused 'store missing' errors in existing test suites)"

patterns-established:
  - "Tenant-scoped setUnitPrice: UPDATE WHERE id=boqItemId AND tenantId=getDefaultTenantId() — never update by id alone"
  - "logOfficeActivity void wiring: call placed after the primary write succeeds, before revalidatePath, never awaited"
  - "BOQ dialog empty-price discipline: treat null/undefined unitPrice as '' (empty), not '0'; normalize comma→period on parse"

requirements-completed: [COST-01, PERF-03]

# Metrics
duration: 15min
completed: "2026-05-26"
---

# Phase 07 Plan 04: Unit price + currency persistence and full activity-log wiring Summary

**setUnitPrice() Server Action with auth/tenant/validation, logOfficeActivity() wired un-awaited across all 12 office-engineer mutations (boq/projects/people/routes), and BOQ dialog with optional price + TRY-default currency (COST-01 + PERF-03 closed)**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-26T11:49:19Z
- **Completed:** 2026-05-26T12:00:23Z
- **Tasks:** 4 (3 auto + 1 human-verify checkpoint)
- **Files modified:** 12

## Accomplishments

- `setUnitPrice()` added to `src/actions/boq.ts`: auth-guarded, tenant-scoped WHERE clause, parseFloat/isNaN/negative validation before any write, logs `unit_price_set` with `oldPrice`/`newPrice`/`currencyCode` metadata
- `logOfficeActivity()` wired (un-awaited) into all 12 office-engineer write paths: `addBoqItem`, `updateBoqItem`, `deleteBoqItem`, `confirmBoqImport`, `setUnitPrice` (boq.ts); `createProject`, `updateProject`, `deleteProject` (projects.ts); `approvePending`, `addManualPerson`, `removeAssignment` (people.ts); `uploadRoute` (routes.ts)
- BOQ edit dialog extended with unit price input (decimal, comma-tolerant, optional, null-on-empty) and currency select (TRY default; TRY/USD/EUR options); unpriced items show placeholder "—" not "0"
- Human-verify checkpoint approved: price 1000 + currency TRY persist on reload; unpriced item shows "—"
- Full Vitest suite 188/188 pass

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: COST-01 setUnitPrice + PERF-03 non-blocking failing tests** - `20ac2bd` (test)
2. **Task 1 GREEN: setUnitPrice() + logOfficeActivity wiring in boq.ts + projects.ts** - `b2c703c` (feat)
3. **Task 2 RED: PERF-03 wiring tests for people.ts + routes.ts** - `f6285e9` (test)
4. **Task 2 GREEN: logOfficeActivity wiring in people.ts + routes.ts** - `a5344ba` (feat)
5. **Task 3: Unit price + currency fields in BOQ edit dialog** - `b379f43` (feat)
6. **Task 4: Human-verify checkpoint — APPROVED by user**

_TDD tasks have separate RED/GREEN commits per TDD gate protocol._

## Files Created/Modified

- `src/actions/boq.ts` — `setUnitPrice()` added; `logOfficeActivity()` wired into all 5 BOQ mutations
- `src/actions/projects.ts` — `logOfficeActivity()` wired into createProject/updateProject/deleteProject
- `src/actions/people.ts` — `logOfficeActivity()` wired into approvePending/addManualPerson/removeAssignment
- `src/actions/routes.ts` — `logOfficeActivity()` wired into uploadRoute
- `src/components/dashboard/BoqItemDialog.tsx` — unit price input + currency select; setUnitPrice call on submit
- `src/components/dashboard/BoqTable.tsx` — `BoqItem` type extended with `unitPrice?: string | null`, `currencyCode?: string | null`
- `tests/analytics.test.ts` — COST-01 (persist, auth, null, negative) + PERF-03 (non-blocking, e2e insert→read) tests
- `messages/en.json` / `messages/tr.json` — i18n keys: col_unit_price, col_currency, unit_price_placeholder, unit_price_hint
- `tests/boq.test.ts` / `tests/people.test.ts` / `tests/projects.test.ts` — next/server after() mock added

## Decisions Made

- `setUnitPrice` fetches `{ unitPrice: oldPrice, projectId }` **before** the UPDATE so `logOfficeActivity` metadata can record `oldPrice` alongside `newPrice` — useful for audit trail and change tracking in Phase 9.
- Empty price field submits as `null` (not `'0'`), clearing any previously stored price. The dialog initialises from `item?.unitPrice ?? ''`, so null/undefined shows empty placeholder, never the string "0".
- `next/server after()` mock added to three existing test files as a Rule 1 fix — the logOfficeActivity wiring introduced `after()` calls that triggered `'static generation store missing'` errors in previously passing tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added `next/server` after() mock to existing test suites**
- **Found during:** Task 3 (BOQ dialog + full suite run)
- **Issue:** After wiring `logOfficeActivity()` (which calls `after()` internally via `src/lib/log-office-activity.ts`) into boq.ts/people.ts/projects.ts, the existing test files `boq.test.ts`, `people.test.ts`, `projects.test.ts` threw `'static generation store missing'` errors because they imported the wired Server Actions without the required `vi.mock('next/server')` that `analytics.test.ts` already had.
- **Fix:** Added `vi.mock('next/server', () => ({ after: vi.fn((fn) => fn()) }))` to each of the three test files.
- **Files modified:** `tests/boq.test.ts`, `tests/people.test.ts`, `tests/projects.test.ts`
- **Verification:** Full suite 188/188 pass.
- **Committed in:** `b379f43` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug)
**Impact on plan:** Necessary correctness fix to keep existing test suites green after logOfficeActivity wiring. No scope creep.

## Issues Encountered

None beyond the Rule 1 fix documented above.

## User Setup Required

None — no new external services or environment variables required. All changes use existing DB schema columns (unit_price, currency_code on boq_items; office_activity_log table) provisioned in Phase 07-01.

## Next Phase Readiness

- COST-01 and PERF-03 requirements are closed; Phase 07 data-foundation layer is complete (all 4 plans done).
- Phase 08 (analytics query layer) can read `office_activity_log` rows written by every office-engineer mutation — the write path is fully populated.
- Phase 09 (office scorecard) has real actorUserId-filtered activity data to aggregate.
- Phase 10 (hakkediş billing) can multiply `unit_price × approved_qty` in Postgres using the now-persisted `unit_price` and `currency_code` columns on `boq_items`.
- No blockers for Phase 08.

---
*Phase: 07-data-foundation-canonical-record*
*Completed: 2026-05-26*
