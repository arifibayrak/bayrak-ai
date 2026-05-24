---
phase: 05
slug: dashboard-map
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-24
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.x |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `npx vitest run tests/submissions.test.ts tests/boq.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds (data-layer unit tests; no browser/canvas) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/submissions.test.ts tests/boq.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

> Task IDs are assigned by the planner. Each requirement's automated coverage is fixed below; the planner maps these onto its task breakdown.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| DASH-01 | Route GeoJSON read-back from PostGIS returns a valid GeoJSON LineString (`getRouteGeoJSON` server action, via `ST_AsGeoJSON`) | unit | `npx vitest run tests/submissions.test.ts` | ❌ W0 | ⬜ pending |
| DASH-02 | Approved-points FeatureCollection includes only rows with `snapped_point IS NOT NULL` AND `status='approved'` (`getApprovedPoints`) | unit | `npx vitest run tests/submissions.test.ts` | ❌ W0 | ⬜ pending |
| DASH-03 | `getSubmissions` filters by status (pending/approved/rejected) and paginates with correct `OFFSET`/`LIMIT` | unit | `npx vitest run tests/submissions.test.ts` | ❌ W0 | ⬜ pending |
| DASH-04 | BOQ progress `%` = `approvedQty / plannedQty * 100`, capped at 100; null/zero planned handled | unit | `npx vitest run tests/boq.test.ts` | ✅ (extend) | ⬜ pending |
| DASH-05 | Dashboard route uses `dynamic = 'force-dynamic'`; fresh data after mutation | smoke/manual | — | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/submissions.test.ts` — new file; stubs for DASH-01, DASH-02, DASH-03 (route GeoJSON read-back, approved-points filter, status filter + pagination)
- [ ] `tests/boq.test.ts` — extend existing; progress % edge cases (0%, ≥100% cap, null planned quantity)

*Existing infrastructure (`vitest.config.ts`, `tests/setup.ts`, `tests/fixtures/`) covers framework setup — no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mapbox line layer + circle markers render and snap to route | DASH-01, DASH-02 | react-map-gl canvas rendering cannot be unit-tested in vitest's node env without heavy mocking; the data layer is unit-tested, the visual layer is verified by eye | Load the project dashboard; confirm the GeoJSON route renders as a line and approved submissions render as circle markers color-coded by BOQ item, positioned on the route |
| `force-dynamic` liveness — fresh data on page load/focus | DASH-05 | No automated way to assert RSC cache behavior | Approve a submission in one tab; switch to the dashboard tab; confirm the new point/BOQ % appears after focus refresh |
| Mapbox token domain restriction active before external share | DASH-04 (success criterion 4) | Mapbox account-level URL referrer restriction — external config, not code | In the Mapbox account, confirm the public token is URL-restricted to the bayrak.ai domain before any dashboard URL is shared |

---

## Validation Sign-Off

- [ ] All data-layer tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`tests/submissions.test.ts`, `tests/boq.test.ts` extension)
- [ ] No watch-mode flags (`vitest run`, not `vitest`)
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
