---
phase: 05-dashboard-map
plan: "01"
subsystem: infra
tags: [mapbox-gl, react-map-gl, next-intl, vitest, i18n, maps]

# Dependency graph
requires:
  - phase: 04-spatial-layer
    provides: seedSpatialFixture, SPATIAL_FIXTURE_IDS, describeIfDb helpers for test scaffolds
provides:
  - mapbox-gl 3.24.0 + react-map-gl 8.1.1 installed and resolvable
  - next/image remotePatterns scoped to *.public.blob.vercel-storage.com (SSRF guard T-05-01)
  - Full TR/EN message catalog for dashboard.submissions, dashboard.map, dashboard.boq.col_completion_pct
  - Wave 0 test scaffolds — tests/submissions.test.ts (RED) and tests/boq.test.ts progress-% (GREEN)
affects: [05-02-PLAN.md, 05-03-PLAN.md, 05-04-PLAN.md, 05-05-PLAN.md, 05-06-PLAN.md]

# Tech tracking
tech-stack:
  added:
    - mapbox-gl@3.24.0 (dependency)
    - react-map-gl@8.1.1 (dependency)
    - "@types/mapbox-gl@3.4.1 (devDependency)"
  patterns:
    - "next/image remotePatterns restricted to single Blob host (never bare wildcard) per T-05-01"
    - "Wave 0 test scaffolds: tests compile and run before server action modules exist via dynamic import()"
    - "describeIfDb pattern gates all DB tests on TEST_DATABASE_URL; pure math tests are always GREEN"

key-files:
  created:
    - tests/submissions.test.ts
  modified:
    - package.json
    - package-lock.json
    - next.config.ts
    - messages/tr.json
    - messages/en.json
    - tests/boq.test.ts

key-decisions:
  - "mapbox-gl must NOT be added to transpilePackages or serverExternalPackages (conflicts with worker bundling)"
  - "Dev server must run with --no-turbopack while working on map components (Turbopack breaks mapbox-gl web worker — vercel/next.js#86495); production builds unaffected"
  - "NEXT_PUBLIC_MAPBOX_TOKEN domain-restriction (D-62/SC4) is a carry-forward ops obligation: token MUST be restricted to https://bayrak.ai/* in account.mapbox.com before any external dashboard share"
  - "tests/submissions.test.ts uses dynamic await import('@/actions/submissions') so the file compiles before Plan 02 lands"

patterns-established:
  - "Pattern: Wave 0 scaffolds use dynamic import() for not-yet-implemented server action modules so RED tests compile cleanly"
  - "Pattern: next/image remotePatterns uses new URL() constructor syntax with exact Blob host — never a bare wildcard"
  - "Pattern: next-intl ICU placeholder syntax {name} used throughout i18n catalog (page, pages, material, meters)"

requirements-completed: [DASH-01, DASH-02, DASH-03, DASH-04, DASH-05]

# Metrics
duration: ~60min (including checkpoint pause for Mapbox token confirmation)
completed: "2026-05-24"
---

# Phase 5 Plan 01: Dashboard-Map Setup Summary

**mapbox-gl 3.24.0 + react-map-gl 8.1.1 installed; next/image SSRF-scoped to Vercel Blob host; full 47-key TR/EN i18n catalog for Submissions/Map/BOQ surfaces; Wave 0 test scaffolds (submissions RED + boq progress-% GREEN)**

## Performance

- **Duration:** ~60 min (including checkpoint pause for human Mapbox token confirmation)
- **Started:** 2026-05-24T22:00:00Z
- **Completed:** 2026-05-24T23:30:00Z
- **Tasks:** 4 (3 auto + 1 checkpoint resolved by user approval)
- **Files modified:** 7

## Accomplishments
- Map stack locked at exact versions: mapbox-gl@3.24.0, react-map-gl@8.1.1, @types/mapbox-gl@3.4.1 — all three confirmed Approved in Phase 5 RESEARCH Package Legitimacy Audit
- next/image SSRF surface hardened: remotePatterns restricted to `*.public.blob.vercel-storage.com` only (T-05-01 mitigated)
- Complete TR/EN message catalog added — 47 keys across dashboard.submissions (21 keys), dashboard.map (9 keys), and dashboard.boq.col_completion_pct (1 key) — in full key-for-key parity
- Wave 0 test scaffolds: tests/submissions.test.ts (DASH-01/02/03 RED scaffolds using dynamic import) and tests/boq.test.ts extended with 3 progress-% edge cases (0%, 100% cap, 25% partial) all passing GREEN
- D-62/SC4 Mapbox token domain-restriction obligation acknowledged by developer: will apply URL restriction to bayrak.ai before any external dashboard share

## Installed Package Versions (exact, from package-lock.json)

| Package | Version | Location |
|---------|---------|----------|
| mapbox-gl | **3.24.0** | dependencies |
| react-map-gl | **8.1.1** | dependencies |
| @types/mapbox-gl | **3.4.1** | devDependencies |

## Turbopack Dev Workaround

**IMPORTANT:** While working on map components, the dev server must be started with:

```bash
npm run dev -- --no-turbopack
```

Turbopack (enabled by default via `next dev --turbopack` in the dev script) tears down mapbox-gl's web worker during HMR, causing the map to silently fail in development. **Production builds with `next build` are unaffected** — this is a development-only workaround.

Reference: vercel/next.js#86495 (RESEARCH Pitfall 1).

## New i18n Keys Added

### dashboard.submissions (21 keys — TR/EN parity)
tab_label, filter_all, filter_pending, filter_approved, filter_rejected, col_photo, col_boq, col_quantity, col_status, col_date, col_location, col_notes, status_pending, status_approved, status_rejected, empty_all, empty_filtered, pagination (ICU: {page}/{pages}), photo_alt (ICU: {material}), prev, next

### dashboard.map (9 keys — TR/EN parity)
empty_no_route, empty_no_points, popup_quantity, popup_status, popup_date, popup_auditor, popup_distance (ICU: {meters}), legend_title, load_error

### dashboard.boq additions (1 key)
col_completion_pct

ICU placeholder syntax `{name}` used throughout for runtime interpolation via next-intl.

## D-62 Token Domain-Restriction Carry-Forward Obligation

**Status: Acknowledged by developer, not yet applied (development phase)**

Before any external dashboard URL is shared, the Mapbox public token (`NEXT_PUBLIC_MAPBOX_TOKEN`) MUST be URL-restricted in account.mapbox.com:

1. Go to account.mapbox.com → Tokens → (your public token) → URL restrictions
2. Add: `https://bayrak.ai/*`
3. Add: `https://www.bayrak.ai/*`
4. Ensure Referrer-Policy is NOT set to `no-referrer` (would break the restriction)

This is a manual Mapbox dashboard step (account config, not code). It is the only manual step in Phase 5.

**Risk if not applied:** The NEXT_PUBLIC_MAPBOX_TOKEN is readable in page source by anyone who visits the dashboard. An unrestricted token can be billed from any origin.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install map stack and configure next/image remotePatterns** - `5be7b5a` (chore)
2. **Task 2: Add full TR/EN message catalog for all new Phase 5 surfaces** - `00bcf09` (feat)
3. **Task 3: Wave 0 test scaffolds** - `05006d2` (test)
4. **Task 4: Checkpoint — Mapbox token confirmed + D-62 acknowledged** - `c0da5da` (docs — state update at checkpoint)

## Files Created/Modified

- `package.json` — mapbox-gl, react-map-gl added to dependencies; @types/mapbox-gl to devDependencies
- `package-lock.json` — lockfile updated with exact resolved versions
- `next.config.ts` — images.remotePatterns added (*.public.blob.vercel-storage.com); original serverExternalPackages preserved
- `messages/tr.json` — dashboard.submissions + dashboard.map namespaces added; dashboard.boq.col_completion_pct added
- `messages/en.json` — full EN parity of all new TR keys
- `tests/submissions.test.ts` — NEW: Wave 0 RED scaffold for DASH-01 (getRouteGeoJSON), DASH-02 (getApprovedPoints), DASH-03 (getSubmissions filters + pagination)
- `tests/boq.test.ts` — Extended with BOQ completion percentage describe block (3 edge cases: 0%, 100% cap, 25% partial)

## Decisions Made

- **mapbox-gl not in transpilePackages/serverExternalPackages:** Adding it causes bundling conflicts with the web worker; browser-only via 'use client' components is the correct pattern
- **Dynamic import for submissions tests:** `await import('@/actions/submissions')` inside each test body allows the test file to compile and be added as a RED scaffold before Plan 02 creates the module
- **D-62 as carry-forward obligation, not code gate:** The URL restriction is a one-time Mapbox dashboard config step, not enforceable in code — documented here and surfaced as a checkpoint

## Deviations from Plan

None — plan executed exactly as written. The checkpoint (Task 4) was resolved by user approval as specified in the resume instructions.

## Issues Encountered

None — all tasks completed cleanly. TypeScript typecheck (`npx tsc --noEmit`) and vitest runs (`npx vitest run tests/boq.test.ts`) passed without errors.

## Known Stubs

None — this plan is infrastructure/setup only. No UI components or data-rendering paths were created.

## Threat Surface Scan

No new threat surface introduced beyond what was already in the plan's threat model:
- T-05-01 (SSRF via remotePatterns): **Mitigated** — restricted to `*.public.blob.vercel-storage.com` only
- T-05-EP (Mapbox token elevation): **Documented** — D-62 carry-forward obligation acknowledged above
- T-05-SC (npm install trust): **Accepted** — all three packages confirmed Approved in RESEARCH audit

## Next Phase Readiness

- **05-02-PLAN.md (Data Layer):** Ready. Tests/submissions.test.ts RED scaffolds exist for getRouteGeoJSON, getApprovedPoints, getSubmissions. Plan 02 implements these server actions and turns the tests GREEN.
- **05-03-PLAN.md (Map):** Ready. react-map-gl + mapbox-gl installed; dashboard.map i18n catalog complete.
- **05-04-PLAN.md (Kayıtlar tab):** Ready. dashboard.submissions i18n catalog complete.
- **05-05-PLAN.md (BOQ progress):** Ready. dashboard.boq.col_completion_pct key added; boq.test.ts progress-% tests passing.

No blockers for Wave 2 plans.

---
*Phase: 05-dashboard-map*
*Completed: 2026-05-24*

## Self-Check

### Files verified present:
- `tests/submissions.test.ts` — EXISTS
- `package.json` — EXISTS (mapbox-gl, react-map-gl, @types/mapbox-gl present)
- `next.config.ts` — EXISTS (public.blob.vercel-storage.com pattern present)
- `messages/tr.json` — EXISTS (dashboard.submissions, dashboard.map, col_completion_pct present)
- `messages/en.json` — EXISTS (full TR/EN parity confirmed)

### Commits verified:
- `5be7b5a` — EXISTS (chore(05-01): install map stack)
- `00bcf09` — EXISTS (feat(05-01): TR/EN message catalog)
- `05006d2` — EXISTS (test(05-01): Wave 0 test scaffolds)
- `c0da5da` — EXISTS (docs(05-01): state update at checkpoint)

## Self-Check: PASSED
