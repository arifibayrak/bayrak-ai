---
phase: 14
slug: schema-foundation-dxf-route-import
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-30
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 14-RESEARCH.md "## Validation Architecture" + "## Security Domain".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (confirmed in `vitest.config.ts`, `environment: node`, `fileParallelism: false`) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx vitest run tests/dxf-parser.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~quick < 5s (pure unit, no DB); full suite ~ existing 358-test baseline |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/dxf-parser.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds (quick) / full suite for wave merges

---

## Per-Task Verification Map

> Plan/Task IDs are filled by the planner; rows below are the requirement→test contract the planner must honor.

| Requirement | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|------------|-----------------|-----------|-------------------|-------------|--------|
| RTE-01 (SC5) | `reprojectToWGS84(5254, 600000, 4570000)` → lng∈[25.7,44.8], lat∈[35.8,42.2] | — | — | unit | `npx vitest run tests/dxf-parser.test.ts -t "EPSG:5254"` | ❌ W0 | ⬜ pending |
| RTE-01 | Axis-swapped coords fail Turkey bbox validation | T-14-VAL | reject before any DB write | unit | `npx vitest run tests/dxf-parser.test.ts -t "axis-swapped"` | ❌ W0 | ⬜ pending |
| RTE-01 | All 7 EPSG codes produce Turkey-bbox-valid output | — | — | unit | `npx vitest run tests/dxf-parser.test.ts -t "all EPSG"` | ❌ W0 | ⬜ pending |
| RTE-01 | `parseDxfToLineString` extracts LWPOLYLINE from fixture | — | — | unit | `npx vitest run tests/dxf-parser.test.ts -t "LWPOLYLINE"` | ❌ W0 | ⬜ pending |
| RTE-01 | Out-of-Turkey coords return `COORDS_OUTSIDE_TURKEY` | T-14-VAL | structured error, no write | unit | `npx vitest run tests/dxf-parser.test.ts -t "outside Turkey"` | ❌ W0 | ⬜ pending |
| RTE-01 (D-03) | Multi-polyline stitching produces ordered vertices + gap warning | — | — | unit | `npx vitest run tests/dxf-parser.test.ts -t "stitch"` | ❌ W0 | ⬜ pending |
| RTE-01 (D-03) | SPLINE entity in layer triggers `hasSpline=true` (non-blocking) | — | — | unit | `npx vitest run tests/dxf-parser.test.ts -t "SPLINE"` | ❌ W0 | ⬜ pending |
| RTE-01 | < 2 vertices after filter → `TOO_FEW_VERTICES` error | T-14-VAL | reject, no write | unit | `npx vitest run tests/dxf-parser.test.ts -t "too few"` | ❌ W0 | ⬜ pending |
| RTE-01 | Malicious/non-DXF input caught (parseSync wrapped in try/catch) | T-14-PARSE | structured error, never crash | unit | `npx vitest run tests/dxf-parser.test.ts -t "malformed"` | ❌ W0 | ⬜ pending |
| RTE-01/03 | `uploadDxf` requires session (auth() guard) + ownership (CR-02) | T-14-AUTHZ | 401/deny on no session or cross-tenant | manual / integration | DB + manual session check | — | ⬜ pending |
| RTE-02 | Satellite preview: "Onayla" disabled until map `onLoad` | — | — | manual | UI smoke | — | ⬜ pending |
| RTE-02 | Satellite preview renders reprojected route on satellite basemap; Cancel writes nothing | T-14-PREVIEW | no DB write until Confirm | manual | UI smoke + DB check | — | ⬜ pending |
| RTE-03 | DXF `source_blob_url` stored on routes row after upload; "Kaynak Belge" download works; PDF renders inline | — | — | integration | manual SQL + UI | — | ⬜ pending |
| RTE-04 | GeoJSON upload path still returns `ok:true`; `total_length_m` non-null after upload | — | — | unit + integration | `npx vitest run tests/routes.test.ts` + SQL | ❌ W0 | ⬜ pending |
| RTE-05 | Re-import increments `geometry_version`; columns exist without error (Phase 14 adds columns, Phase 15 writes them) | — | — | migration smoke | `npx vitest run tests/dxf-parser.test.ts -t "schema"` + SQL | ❌ W0 | ⬜ pending |
| RTE-05 | Blob upload token gated by `auth()` in `onBeforeGenerateToken`; 50MB size cap | T-14-BLOB | unauth PUT rejected; OOM-size rejected | manual | route inspection + manual | — | ⬜ pending |
| SC6 | PROJECT.md v1 capabilities moved Active→Validated | — | — | manual | doc review | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/dxf-parser.test.ts` — all RTE-01 automated cases + `reprojectToWGS84` unit tests (SC5) + schema smoke
- [ ] DXF fixture (programmatic hand-authored DXF text strings OR `tests/fixtures/sample-route-epsg5254.dxf`) — required for parse tests
- [ ] Second-CRS fixture (`sample-route-epsg32635.dxf`, WGS84/UTM35N) for the "all EPSG" case
- [ ] Confirm `tests/setup.ts` needs no change — dxf-parser tests are pure unit (no DB)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Satellite preview renders route correctly + Confirm-gates the DB write | RTE-02 | Requires live Mapbox token + WebGL render + visual georeference judgment | Upload a known TUREF/TM30 DXF, confirm route lands on the correct Trakya location on satellite basemap; Cancel and verify no `routes` row written |
| Kaynak Belge: DXF download + inline PDF view | RTE-03 | Requires live Blob URL + react-pdf render in browser | Upload DXF (+optional PDF), verify download link and inline PDF viewer beside map |
| Re-import warning with existing approvals | RTE-05 | Needs seeded approved submissions + visual dialog | Re-import on a project with approved work; confirm warning names N approved, proceeds under new `geometry_version` |
| Blob token auth gate | RTE-05 | Server-route auth behavior, not unit-testable in isolation | Confirm `onBeforeGenerateToken` calls `auth()` and throws without a session |
| PROJECT.md bookkeeping reconciliation | SC6 | Doc edit, not code | Verify v1 REQ-IDs moved Active→Validated |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`tests/dxf-parser.test.ts` + fixtures)
- [ ] No watch-mode flags (use `vitest run`, never `vitest` watch)
- [ ] Feedback latency < 5s (quick)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
