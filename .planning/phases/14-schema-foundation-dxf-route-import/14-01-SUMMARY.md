---
phase: 14-schema-foundation-dxf-route-import
plan: "01"
subsystem: testing
tags: [proj4, dxf-parser, crs, vitest, turkey-epsg, reprojection]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: vitest test infrastructure, src/lib/ module pattern, TypeScript config
provides:
  - src/lib/crs.ts with TURKEY_CRS (7 EPSG codes), reprojectToWGS84, validateTurkeyBbox
  - tests/fixtures/dxf.ts with 5 hand-authored DXF text fixtures
  - tests/dxf-parser.test.ts Nyquist scaffold (10 crs GREEN + 10 dxf-parser RED until Plan 04)
  - dxf-parser, proj4, react-pdf, @types/proj4 installed in package.json
affects:
  - 14-04 (dxf-parser implementation must turn the RED scaffold GREEN)
  - 14-02 (migration plan; crs.ts establishes Turkey bbox gate contract)
  - 14-03 (upload UI relies on parseDxfToLineString contract defined here)

# Tech tracking
tech-stack:
  added: [dxf-parser@1.1.2, proj4@2.20.8, react-pdf@10.4.1, "@types/proj4@2.19.0"]
  patterns:
    - "crs.ts: named-export module-local TURKEY_BBOX const, throw on unsupported EPSG, [easting, northing] → [lng, lat] axis contract"
    - "DXF fixtures as plain TypeScript string exports (no binary files)"
    - "RED/GREEN split scaffold: crs tests fully asserted and passing; parseDxfToLineString tests real expects that Plan 04 must satisfy"

key-files:
  created:
    - src/lib/crs.ts
    - src/lib/dxf-parser.ts
    - tests/fixtures/dxf.ts
    - tests/dxf-parser.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "EPSG:5254 SC5 test asserts lng in [30.5, 32.0] (not the RESEARCH.md example of ~29°E which was mathematically wrong for TM30 false_easting=500000 + easting=600000 → ~31.2°E)"
  - "dxf-parser.ts ships as NOT_IMPLEMENTED stub; Plan 04 owns the real implementation"
  - "All 7 Turkey CRS proj4 strings verbatim from RESEARCH Pattern 2 (EPSG 5253/5254/5255/23035/23036/32635/32636)"

patterns-established:
  - "Turkey bbox gate: validateTurkeyBbox(lng, lat) checks lng∈[25.7,44.8] AND lat∈[35.8,42.2]; used by Plan 04 parseDxfToLineString"
  - "reprojectToWGS84(epsg, easting, northing) → [lng, lat]: throws on unsupported EPSG; axis contract matches ST_MakePoint(lng,lat)"

requirements-completed: [RTE-01]

# Metrics
duration: 30min
completed: "2026-05-30"
---

# Phase 14 Plan 01: CRS Library + DXF Test Scaffold Summary

**proj4-backed TURKEY_CRS for 7 EPSG codes with Turkey bbox validation, plus complete Nyquist test scaffold (crs GREEN / dxf-parser RED) driving Plan 04's parseDxfToLineString implementation**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-29T23:00:00Z
- **Completed:** 2026-05-30T01:26:34Z
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify approved)
- **Files modified:** 6

## Accomplishments

- Installed dxf-parser/proj4/react-pdf/@types/proj4; tsc clean with all new packages
- Authored `src/lib/crs.ts` with verbatim proj4 strings for all 7 Turkey EPSG codes; `reprojectToWGS84` and `validateTurkeyBbox` fully implemented and tested GREEN
- Laid complete Nyquist test scaffold: 10 crs-only tests GREEN (including SC5 EPSG:5254 bbox assertion), 10 dxf-parser tests RED purely because `parseDxfToLineString` is a NOT_IMPLEMENTED stub — exactly as designed for Plan 04

## Task Commits

1. **Task 1: Install packages + author src/lib/crs.ts** - `d5666b2` (feat)
2. **Task 2: DXF fixtures + Nyquist test scaffold** - `625df67` (test)
3. **Task 3: Checkpoint human-verify (Wave 0 RED verification)** - `a1c555c` (docs — state checkpoint commit)

## Files Created/Modified

- `src/lib/crs.ts` - TURKEY_CRS Record<number,string> (7 EPSG), reprojectToWGS84, validateTurkeyBbox
- `src/lib/dxf-parser.ts` - NOT_IMPLEMENTED stub; exports ParseDxfResult type, extractDxfLayers, parseDxfToLineString
- `tests/fixtures/dxf.ts` - 5 DXF text fixtures: SAMPLE_DXF_EPSG5254, SAMPLE_DXF_EPSG32635, SAMPLE_DXF_SPLINE, SAMPLE_DXF_MULTI_POLYLINE, SAMPLE_DXF_OUT_OF_TURKEY
- `tests/dxf-parser.test.ts` - 20 tests: 10 crs GREEN (EPSG:5254, axis-swapped, all EPSG), 10 dxf-parser RED (LWPOLYLINE, outside Turkey, stitch, SPLINE, too few, malformed, schema)
- `package.json` - dxf-parser, proj4, react-pdf, @types/proj4 added
- `package-lock.json` - lockfile updated

## Decisions Made

- **SC5 coordinate correction:** RESEARCH.md claimed EPSG:5254 (600000, 4570000) → lng ~29°E. Mathematically wrong: TM30 central meridian lon_0=30, false_easting=500000, so easting 600000 = ~31.2°E. The SC5 test was corrected to assert `lng in [30.5, 32.0]`, which is inside the Turkey bbox. This deviation was reviewed and approved at the human-verify checkpoint.
- **No binary DXF fixtures:** All DXF fixtures are hand-authored TypeScript string exports; no binary fixture files needed for the test scaffold phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RESEARCH.md EPSG:5254 example coordinate longitude was wrong**
- **Found during:** Task 2 (DXF fixtures + Nyquist test scaffold)
- **Issue:** RESEARCH.md stated EPSG:5254 (600000, 4570000) → lng ~29°E. For TUREF/TM30 (lon_0=30, false_easting=500000), easting 600000 means 100 km east of central meridian 30°, placing longitude near ~31.2°E — not 29°E. Using 29°E as the expected value would have caused a false test failure.
- **Fix:** SC5 test asserts `lng` in `[30.5, 32.0]` (inside Turkey bbox) instead of a hardcoded 29°E value. Verified with proj4 runtime output.
- **Files modified:** tests/dxf-parser.test.ts
- **Verification:** `npx vitest run tests/dxf-parser.test.ts -t "EPSG:5254"` passes GREEN; human-verify checkpoint approved.
- **Committed in:** `625df67` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — math bug in RESEARCH example coordinate)
**Impact on plan:** Required correction for SC5 correctness. No scope creep; CRS behavior is unchanged.

## Issues Encountered

None beyond the EPSG:5254 coordinate correction documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/lib/crs.ts` is complete and production-ready; Plan 04 may import it directly
- `tests/dxf-parser.test.ts` defines the full contract for `parseDxfToLineString` — Plan 04 must turn the 10 RED dxf-parser tests GREEN without modifying test assertions
- All 10 VALIDATION.md `-t` filter strings resolve to named test cases
- Packages installed; tsc clean; ready for Plan 02 (migration) and Plan 03 (upload UI scaffold) in parallel with Plan 04 (parser implementation)

## Threat Flags

No new threat surface beyond what is documented in the plan's threat model.

---
*Phase: 14-schema-foundation-dxf-route-import*
*Completed: 2026-05-30*
