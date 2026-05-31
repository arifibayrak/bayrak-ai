---
phase: 15-chainage-as-built-view-approval-snapshot
plan: "06"
subsystem: exports
tags: [excel, pdf, chainage, export, auth-guard]
dependency_graph:
  requires: ["15-05"]
  provides: [GET /api/exports/chainage]
  affects: [office-activity-log]
tech_stack:
  added: []
  patterns: [Phase-11-export-skeleton, buildChainageLedger, renderChainagePdf, fetchChainageBucketsRaw]
key_files:
  created:
    - src/lib/chainage-excel.ts
    - src/lib/pdf/chainage-pdf.tsx
    - src/app/api/exports/chainage/route.ts
  modified:
    - tests/chainage.test.ts
decisions:
  - "chainage_exported already present in OFFICE_ACTION_TYPES from Plan 15-05 — no schema change needed"
  - "ExcelJS xlsx.load in tests requires `as any` cast for Node 24 Buffer<ArrayBufferLike> compatibility (same Phase 01-06 pitfall)"
  - "bucketSizeM whitelist-coerced to Set{100,500,1000} in route handler for T-15-06-SQLI mitigation"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-31"
  tasks: 3
  files: 4
---

# Phase 15 Plan 06: Chainage As-Built Excel/PDF Export Summary

**One-liner:** Auth-guarded `GET /api/exports/chainage` producing 8-column Excel (ExcelJS + sanitizeExcelCell) and hakkediş-aesthetic PDF (@react-pdf/renderer + DejaVu) via shared `fetchChainageBucketsRaw` helper (Pitfall 6).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | buildChainageLedger 8-column Excel + test green | feat(15-06) | src/lib/chainage-excel.ts, tests/chainage.test.ts |
| 2 | renderChainagePdf (DejaVu, hakkediş aesthetic) | feat(15-06) | src/lib/pdf/chainage-pdf.tsx |
| 3 | GET /api/exports/chainage route handler | feat(15-06) | src/app/api/exports/chainage/route.ts |

## Verification

- `npx vitest run tests/chainage.test.ts`: **21 passed / 0 failed** (includes "chainage excel columns" turned green)
- `npx tsc --noEmit`: **clean**
- Grep gates: `await auth()`, `fetchChainageBucketsRaw`, `401`, `runtime = 'nodejs'`, `force-dynamic` all present in route.ts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ExcelJS Buffer cast in test**
- **Found during:** Task 1/2 (tsc error in tests/chainage.test.ts)
- **Issue:** Node 24 `Buffer<ArrayBufferLike>` not assignable to ExcelJS's `Buffer` parameter type — same Phase 01-06 pitfall
- **Fix:** `as any` cast on `workbook.xlsx.load(buffer as any)` with eslint-disable comment
- **Files modified:** tests/chainage.test.ts
- **Commit:** included in Task 2 commit

**2. [Rule 1 - Bug] Spurious ChainageBucket import in test**
- **Found during:** Task 1 (tsc error: `Property 'ChainageBucket' does not exist on type '{}'`)
- **Issue:** Incorrect dynamic import destructure of a TypeScript type
- **Fix:** Removed the unused import; bucket type is inferred from the inline object literal
- **Files modified:** tests/chainage.test.ts

## Success Criteria Check

- [x] `/api/exports/chainage`: auth-first 401, tenant-scoped, runtime nodejs, imports shared helper (not server action)
- [x] Excel 8 columns in correct order; formula-injection sanitized; "chainage excel columns" test GREEN
- [x] PDF renders (DejaVu, hakkediş aesthetic); route.ts stays pure-TS via renderChainagePdf helper
- [x] Calibrated "km X+YYY" values via formatChainage(bucket.bucketStart/bucketEnd)
- [x] `npx tsc --noEmit` clean
- [x] `npx vitest run tests/chainage.test.ts` — 21 passed

## Known Stubs

None. All export paths are fully wired to real data via fetchChainageBucketsRaw.

## Threat Flags

No new threat surface beyond the plan's threat model. All mitigations applied:
- T-15-06-AUTH: auth() first → 401 JSON
- T-15-06-FORMULA: sanitizeExcelCell on all user-content Excel cells
- T-15-06-IDOR: fetchChainageBucketsRaw scoped with getDefaultTenantId()
- T-15-06-SQLI: bucketSizeM whitelist Set{100,500,1000}
- T-15-06-SA: fetchChainageBucketsRaw (plain helper), not getChainageBuckets Server Action

## Self-Check
