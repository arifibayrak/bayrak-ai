---
phase: 04-spatial-layer
plan: 04
subsystem: spatial
tags: [postgis, spatial, telegram-bot, caption, vitest, unit-test, turkish-microcopy]

# Dependency graph
requires:
  - phase: 04-spatial-layer
    plan: 03
    provides: snapToRoute wired in handleConfirmSubmit; location_match/location_distance_m populated at submission time; formatDistance pure helper in spatial.ts
provides:
  - buildLocationCaptionLine(locationMatch, distanceM) — pure helper in src/lib/spatial.ts (GEO-02 user-facing half)
  - fanOutToAuditors D-47 caption block — '⚠ Konum rotadan uzak' for far, neutral note for no_route, silent for near/null
  - 9 pure D-47 unit tests in tests/spatial.test.ts (no DB required — plain describe block)
  - T3 human-verify checkpoint pending (live Telegram end-to-end confirmation)
affects: [05-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "buildLocationCaptionLine extracted from fanOutToAuditors — pure helper pattern keeps bot-audit.ts free of new test dependencies; mirrors D-28 over-delivery analog"
    - "TDD RED→GREEN cycle: tests committed at 39b2ede (RED) before implementation at 39691b8 (GREEN)"
    - "Pure describe (not describeIfDb) for D-47 unit tests — runs without TEST_DATABASE_URL per plan discipline"
    - "Lazy await import('@/lib/spatial') in fanOutToAuditors — consistent with file's lazy import discipline"

key-files:
  created: []
  modified:
    - src/lib/spatial.ts
    - src/lib/bot-audit.ts
    - tests/spatial.test.ts

key-decisions:
  - "Extracted buildLocationCaptionLine to spatial.ts (pure helper) so D-47 logic is unit-testable without mocking grammY; fanOutToAuditors delegates to it via lazy import"
  - "'far' + null distanceM → null (silent) — cannot format a distance warning without the distance value; matches T-04-06 mitigation intent"

requirements-completed: [GEO-02]

# Metrics
duration: ~5min (T1+T2 automated; T3 pending human-verify)
completed: 2026-05-24
---

# Phase 4 Plan 04: D-47 auditor caption line + caption unit tests Summary

**D-47 location-anomaly caption line wired into fanOutToAuditors ('⚠ Konum rotadan uzak' / 'ℹ Rota yüklenmemiş') with buildLocationCaptionLine pure helper and 9 passing no-DB unit tests; T3 human-verify checkpoint pending**

## Performance

- **Duration:** ~5 min (T1 + T2 automated; T3 checkpoint paused)
- **Started:** 2026-05-24T20:54:08Z
- **Completed:** 2026-05-24T20:58:56Z (automated tasks)
- **Tasks:** 2 of 3 complete (T3 = checkpoint:human-verify, blocked on live Telegram test)
- **Files modified:** 3

## Accomplishments

- Task 1 (feat): Added D-47 caption block to `fanOutToAuditors` — reads `locationMatch`/`locationDistanceM` off the already-loaded submission row; delegates to `buildLocationCaptionLine` for the three-state decision; keeps Google Maps link in all cases (D-47)
- Task 2 (TDD RED→GREEN): Added 9 pure unit tests in `tests/spatial.test.ts` in a plain `describe` block — 4 for `formatDistance`, 5 for `buildLocationCaptionLine`; all 15 spatial tests pass (9 pure + 6 DB-gated GEO-01/GEO-02/D-48)
- Extracted `buildLocationCaptionLine` to `src/lib/spatial.ts` — pure helper with no DB dependency, independently testable, avoids grammY mock complexity

## Task Commits

1. **Task 1: Add D-47 location-anomaly caption line to fanOutToAuditors** — `83e3e64` (feat)
2. **Task 2 RED: Add failing D-47 caption unit tests** — `39b2ede` (test)
3. **Task 2 GREEN: Implement buildLocationCaptionLine + refactor fanOutToAuditors** — `39691b8` (feat)
4. **Task 3: Human-verify checkpoint** — PENDING (awaiting live Telegram test)

## Files Created/Modified

- `src/lib/spatial.ts` — Added `buildLocationCaptionLine(locationMatch, distanceM): string | null`; pure helper, no DB import (T-04-06 mitigation: 'far' always emits warning, 'no_route' always emits neutral note)
- `src/lib/bot-audit.ts` — D-47 caption block in `fanOutToAuditors` refactored to call `buildLocationCaptionLine` via lazy `await import('@/lib/spatial')`; inline logic replaced with single helper call
- `tests/spatial.test.ts` — 9 new pure D-47 unit tests added in plain `describe` block (no describeIfDb); formatDistance boundary cases + buildLocationCaptionLine three-state assertions

## Decisions Made

- Extracted `buildLocationCaptionLine` to `spatial.ts` rather than keeping inline logic in `bot-audit.ts` — keeps the caption decision pure and testable without grammY mock complexity; fanOutToAuditors body stays free of test-specific exports
- `'far' + null distanceM → null` (silent) — if `location_match='far'` but `location_distance_m` is somehow null (should not happen but defensive), returning null is safer than formatting "~NaN km"

## Deviations from Plan

None — plan executed exactly as written. The `buildLocationCaptionLine` extraction was the recommended approach (a) from Task 2's `<action>` and matched PATTERNS.md exactly.

## Known Stubs

None — `buildLocationCaptionLine` is fully implemented; `fanOutToAuditors` calls it on every notification; no placeholder data flows.

## Threat Flags

No new threat surface beyond the planned D-47 caption in this plan. T-04-06 (silent warning drop) mitigation fully applied:
- 'far' always emits the distance warning line
- 'no_route' always emits the neutral note
- Only 'near'/null are silent (by design)
- `buildLocationCaptionLine` is unit-tested for all five branches including the defensive 'far'+null case

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `src/lib/spatial.ts` contains `buildLocationCaptionLine` | FOUND |
| `src/lib/bot-audit.ts` contains `Konum rotadan uzak` | FOUND |
| `src/lib/bot-audit.ts` contains `Rota yüklenmemiş` | FOUND |
| `tests/spatial.test.ts` D-47 pure describe block | FOUND |
| Commit 83e3e64 (Task 1) | FOUND |
| Commit 39b2ede (Task 2 RED) | FOUND |
| Commit 39691b8 (Task 2 GREEN) | FOUND |
| `npx vitest run tests/spatial.test.ts` (sandbox) | 9/9 pure PASS |
| `npx vitest run tests/spatial.test.ts` (live DB) | 15/15 PASS |
| `npx tsc --noEmit` | CLEAN |
| TDD gate: test commit before feat commit | CONFIRMED (39b2ede → 39691b8) |

## TDD Gate Compliance

- RED gate commit: `39b2ede` — `test(04-04)` with 5 failing buildLocationCaptionLine tests
- GREEN gate commit: `39691b8` — `feat(04-04)` with all 9 pure tests passing
- REFACTOR: Not needed — code was clean as written

---
*Phase: 04-spatial-layer*
*Completed: 2026-05-24 (T1+T2 automated; T3 human-verify pending)*
