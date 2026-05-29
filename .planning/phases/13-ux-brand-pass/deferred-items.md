# Phase 13 — Deferred items (out-of-scope discoveries)

## Pre-existing Neon serverless flakiness in DB-integration vitest suites

**Found during:** Plan 13-01 Task 4 (full regression sweep)

**Symptoms:**
- 11 of 358 tests fail with `STACK_TRACE_ERROR` from `node_modules/@vitest/runner/dist/chunk-artifact.js`
- All failures are in `describeIfDb`-gated suites that connect to Neon serverless (Phase 10 hakedis, Phase 12 hakedis-live, Phase 11 exports)
- Failures appear in tests with run-time > 5000ms — consistent with Neon cold-start / serverless connection lifecycle
- Re-running the same test in isolation passes (verified: `npx vitest run tests/hakedis.test.ts` shows 27/28 pass vs 1 transient flake)
- Running `npx vitest run tests/excel.test.ts` alone passes 100%

**Scope analysis:**
- Phase 13 did NOT touch any test file, any DB schema, any server action, any Neon connection layer
- Phase 13 changes: token CSS, layout.tsx font, AppSidebar wordmark, new `src/components/brand/*`, new app/icon.tsx, opengraph-image.tsx, not-found.tsx, error.tsx, BRAND.md, messages/*.json `meta` keys
- None of those files are imported by the failing tests

**Phase 11 / Phase 12 frozen contracts verified intact via grep:**
- `LivePeriodPoller` null-on-disabled gate (1 match)
- `LineSubmissionsPanel` 8-column footprint (`colSpan={8}` = 1 match)
- Hakedis page footer math (`colSpan={7}` = 1 match)
- `PeriodDetailControls` draft gate (`status !== 'draft'` = 1 match)
- Phase 11 DejaVu PDF font (`DejaVu` in `src/lib/pdf/fonts.ts` = 7 matches)

**Disposition:** Deferred — not a Phase 13 regression. Likely needs a future maintenance phase to:
1. Investigate Neon serverless cold-start retry strategy in `tests/fixtures/db.ts`
2. Add explicit retry-on-stack-trace-error wrapper or bump vitest test timeouts above the Neon cold-start window
3. Possibly migrate to a local Postgres + pg_pool for vitest CI determinism

**Not fixed in this plan** per executor scope boundary (pre-existing failures in files unrelated to current task changes).

---

## Plan 13-03b Wave 3 Task 2 (re-encountered same flake class)

**Found during:** Plan 13-03b Task 2 — full vitest run after ThresholdSettingsForm + TrendChartsClient + settings/page.tsx restyle.

**Symptoms identical to Plan 13-01:**
- `tests/people.test.ts` — 2 of 9 tests failed with "Test timed out in 5000ms"
  - `D-03: same person can be worker on P1 and auditor on P2 — two assignment rows` (6436ms)
  - `removeAssignment deletes the assignment row` (5785ms)

**Isolation re-run:** `rtk proxy npx vitest run tests/people.test.ts` → 9/9 PASS (11.82s total).

**Scope analysis:** Plan 13-03b Task 2 touched only:
- `src/components/admin/ThresholdSettingsForm.tsx` (Button → BrandButton + BrandCard wrapper)
- `src/components/admin/TrendChartsClient.tsx` (3 BrandCard wrappers around chart containers; chart-N color tokens already in place pre-Phase 13)
- `src/app/dashboard/(admin)/settings/page.tsx` (Card → BrandCard + BrandHeading)

None of those files are imported by `tests/people.test.ts` — same flake class as Plan 13-01.

**Disposition:** Deferred — not a Plan 13-03b regression. Same root cause as Plan 13-01: Neon serverless cold-start under vitest fileParallelism=false but with cross-suite connection contention. Future stability pass per Plan 13-01 deferred note.
