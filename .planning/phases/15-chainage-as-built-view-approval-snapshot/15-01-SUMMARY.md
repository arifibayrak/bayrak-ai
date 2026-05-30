---
phase: 15
plan: "01"
subsystem: chainage
tags: [utility, tdd, test-scaffold, fixture]
dependency_graph:
  requires: []
  provides:
    - formatChainage utility (src/lib/format-chainage.ts)
    - chainage test scaffold (tests/chainage.test.ts)
    - chainage fixture (tests/fixtures/chainage.ts)
  affects:
    - tests/chainage.test.ts (all Phase 15 plans bind to named -t tokens here)
    - src/lib/format-chainage.ts (used by ChainageTable, Telegram bot line, PDF, Excel)
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN (test-first scaffold then implementation)
    - Zero-import pure utility (formatChainage — no circular dep risk)
    - describeIfDb integration test gating (DB tests skip when TEST_DATABASE_URL absent)
    - Deterministic UUID range convention (0f00 range avoids collision with prior fixtures)
    - it.todo scaffold names byte-identical to 15-VALIDATION.md -t tokens
key_files:
  created:
    - src/lib/format-chainage.ts
    - tests/chainage.test.ts
    - tests/fixtures/chainage.ts
  modified: []
decisions:
  - "chainage_m left NULL on fixture seed so Plan 15-02 snapshot tests exercise the real write path"
  - "CHAINAGE_FIXTURE_IDS uses 0f00 UUID range to avoid collision with 0e00 (exports), 0c00 (hakedis), 0d00 (dxf) fixtures"
  - "it.todo scaffolds written in same commit as test file (RED gate) — -t tokens established atomically"
  - "describeIfDb block compiles without TEST_DATABASE_URL; fixture import does not break pure-unit suite"
metrics:
  duration: "~3 minutes"
  completed: "2026-05-31"
  tasks: 3
  files: 3
---

# Phase 15 Plan 01: formatChainage Utility + Test Scaffold Summary

**One-liner:** Pure `formatChainage(m) → "km X+YYY"` utility with zero imports + full Nyquist test scaffold whose `-t` names match 15-VALIDATION.md verbatim, backed by a 3000m fixture seeding 3 approved submissions at `segment_fraction` 0.166/0.5/0.833.

---

## What Was Built

### Task 1: formatChainage utility + GREEN unit tests (TDD)

**RED gate (commit d159aa4):** Created `tests/chainage.test.ts` importing `formatChainage` from a non-existent module — suite failed with `ERR_MODULE_NOT_FOUND`. Test names established for all 15-VALIDATION.md `-t` tokens in the same commit.

**GREEN gate (commit 0af81f7):** Created `src/lib/format-chainage.ts` with zero imports:
```typescript
export function formatChainage(m: number): string {
  const km = Math.floor(m / 1000);
  const remainder = Math.round(m % 1000).toString().padStart(3, '0');
  return `km ${km}+${remainder}`;
}
```
All 5 unit tests pass. Zero imports verified (`grep -c "^import"` returns 0).

### Task 2: Chainage fixture (3000m route + 3 approved submissions)

Created `tests/fixtures/chainage.ts` exporting:
- `CHAINAGE_FIXTURE_IDS` — deterministic UUIDs in 0f00 range
- `seedChainageFixture(db)` — inserts tenant, project, route (`total_length_m=3000`, `geometry_version=1`, `chainage_offset_m=0`), BOQ item, worker + auditor persons, and 3 approved submissions at `segment_fraction` 0.166/0.5/0.833 with `chainage_m=NULL`

`chainage_m` is intentionally NULL so Plan 15-02 snapshot integration tests can assert the write from `handleAuditDecision`.

### Task 3: Integration + unit test scaffolds matching 15-VALIDATION.md -t names

All scaffolds written in the RED commit. `-t` token coverage:

| Token | Type | Status |
|-------|------|--------|
| `formatChainage` | unit | GREEN (5/5) |
| `chainage snapshot` | integration it.todo | scaffold |
| `getChainageBuckets` | integration it.todo | scaffold |
| `bucket status` | unit it.todo | scaffold |
| `completion` | unit it.todo | scaffold |
| `completion clamp` | unit it.todo | scaffold |
| `bucket boundary` | unit it.todo | scaffold |
| `chainage offset` | integration it.todo | scaffold |
| `chainage excel columns` | integration it.todo | scaffold |
| `maps link` | unit it.todo | scaffold |

---

## Verification Results

```
npx vitest run tests/chainage.test.ts -t "formatChainage"
→ PASS (5) FAIL (0) EXIT:0

npx vitest run tests/chainage.test.ts
→ PASS (5) FAIL (0) EXIT:0

grep -c "^import" src/lib/format-chainage.ts
→ 0 (zero imports confirmed)
```

---

## Commits

| Hash | Type | Description |
|------|------|-------------|
| d159aa4 | test | add failing chainage test scaffold (RED gate) |
| 0af81f7 | feat | formatChainage utility + chainage fixture (GREEN gate) |

---

## Deviations from Plan

None — plan executed exactly as written. The RED/GREEN TDD gate sequence was followed: test file written first (failing), implementation written second (passing). All three tasks were executed atomically across two commits (RED: tests only; GREEN: utility + fixture).

---

## Known Stubs

None in production code. The `it.todo` entries in `tests/chainage.test.ts` are intentional RED scaffolds, not stubs — they are the hook points for Plans 15-02 through 15-06 to turn green without renaming.

---

## Threat Flags

None — this plan ships a pure utility and test scaffolds only. No untrusted input crosses a boundary at runtime (T-15-SC + T-15-01-FLOAT: both accepted in plan threat register).

---

## Self-Check: PASSED

- [x] `src/lib/format-chainage.ts` exists: FOUND
- [x] `tests/chainage.test.ts` exists: FOUND
- [x] `tests/fixtures/chainage.ts` exists: FOUND
- [x] Commit d159aa4 exists: FOUND
- [x] Commit 0af81f7 exists: FOUND
- [x] formatChainage tests GREEN: PASS (5) FAIL (0)
- [x] Full file zero failures: PASS (5) FAIL (0)
- [x] Zero imports in format-chainage.ts: confirmed (grep count = 0)
