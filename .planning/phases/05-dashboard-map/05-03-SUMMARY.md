---
phase: 05-dashboard-map
plan: 03
subsystem: ui
tags: [react-map-gl, mapbox-gl, geojson, maps, dashboard, rota-tab, next-intl]

# Dependency graph
requires:
  - phase: 05-dashboard-map
    plan: 02
    provides: "getRouteGeoJSON + getApprovedPoints + getBoqLegend server actions returning typed GeoJSON"
  - phase: 05-dashboard-map
    plan: 01
    provides: "map stack installed (mapbox-gl, react-map-gl), mapbox CSS imported, NEXT_PUBLIC_MAPBOX_TOKEN confirmed"
provides:
  - "MapView.tsx — 'use client' react-map-gl/mapbox component: route line, color-coded approved-point circles, amber anomaly ring, click popup, legend, guided empty states"
  - "RouteTab.tsx extended — Server Component fetching route + approved points + legend via Promise.all"
  - "RouteTabClient.tsx extended — mounts MapView above upload/replace control when route exists (D-49)"
affects: [05-04, 05-05, 05-06, any future map feature work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "react-map-gl v8: import from 'react-map-gl/mapbox' NOT bare 'react-map-gl' (mapbox-gl >= 3.5 requirement)"
    - "mapbox-gl/dist/mapbox-gl.css mandatory import in the 'use client' component (controls/tiles invisible otherwise)"
    - "fitBounds via mapRef.current.getMap().fitBounds() — NOT mapRef.current.fitBounds() (react-map-gl v8 API)"
    - "Anomaly ring Layer declared BEFORE circle Layer inside same Source (renders behind)"
    - "Source+Layer for point rendering (no individual <Marker> components — avoids re-render cost)"
    - "Server Component serializes uploadedAt Date to ISO string before passing RSC→client (no Date objects across boundary)"
    - "Non-Turbopack dev server required for map: npm run dev -- --no-turbopack (Turbopack breaks mapbox-gl worker)"

key-files:
  created:
    - src/components/dashboard/MapView.tsx
  modified:
    - src/components/dashboard/RouteTab.tsx
    - src/components/dashboard/RouteTabClient.tsx

key-decisions:
  - "react-map-gl v8 type for mouse events is MapMouseEvent (not MapLayerMouseEvent) — fixed in Task 2 as Rule 1 deviation"
  - "boqPaletteSlot 0–5 color palette: 0=#2563EB, 1=#D97706, 2=#7C3AED, 3=#059669, 4=#DB2777, 5=#0891B2 (locked in UI-SPEC)"
  - "MapView reads boqPaletteSlot from feature.properties pre-computed by server-built GeoJSON (Plan 02 getApprovedPoints)"
  - "Map never shows blank canvas — null routeGeoJSON returns guided empty-state text, not an empty <Map>"
  - "Legend hidden (not shown empty) when approvedPoints.features.length === 0 (D-58)"
  - "D-49: MapView renders above the route-upload/replace control, not replacing it — field engineers can still replace route"

patterns-established:
  - "Pattern: react-map-gl/mapbox import path — all future map work must use this, never bare react-map-gl"
  - "Pattern: data-driven circle-color via ['match', ['get','boqPaletteSlot'], ...] expression — slot-based palette is locked"
  - "Pattern: mapRef.current.getMap().fitBounds() for programmatic map viewport control in react-map-gl v8"

requirements-completed: [DASH-01, DASH-02]

# Metrics
duration: ~30min
completed: 2026-05-25
---

# Phase 05 Plan 03: MapView + RouteTab Wiring Summary

**Live react-map-gl/mapbox Rota tab: route line, palette-colored approved-point circles, amber anomaly ring, rich click popup, color-material legend — all server-fetched and i18n-driven, reading boqPaletteSlot from Plan 02 GeoJSON**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-25T00:20:00Z
- **Completed:** 2026-05-25T00:26:40Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint, approved)
- **Files modified:** 3 (1 created, 2 extended)

## Accomplishments

- MapView.tsx created (333 lines): 'use client' react-map-gl/mapbox component with route line, 6-slot boqPaletteSlot circle layer, anomaly ring for location_match='far' points, click popup (photo thumbnail, BOQ material, quantity, status badge, date, auditor, amber distance), color-material legend, and guided empty states — no hardcoded strings (D-63)
- RouteTab.tsx extended: server fetches getRouteGeoJSON + getApprovedPoints + getBoqLegend via Promise.all and serializes uploadedAt to ISO string before passing to client (Pitfall 5 fix)
- RouteTabClient.tsx extended: mounts MapView above the existing upload/replace control when route exists (D-49), preserving RouteUpload flow and Replace button behavior exactly; ExistingRoute.uploadedAt typed as string
- Manual render-verification checkpoint approved: map renders correctly with route, points, ring, popup, and legend

## Task Commits

Each task was committed atomically:

1. **Task 1: MapView.tsx — react-map-gl map** - `b6627cc` (feat)
2. **Task 2: Wire RouteTab + RouteTabClient** - `92ce817` (feat)
3. **Task 3: Human-verify checkpoint** - Approved by user

**Plan metadata (STATE/checkpoint pause):** `5654921` (chore: paused at checkpoint)

## Files Created/Modified

- `src/components/dashboard/MapView.tsx` - 'use client' react-map-gl/mapbox map component; route line + circle + anomaly-ring layers + popup + legend + empty states
- `src/components/dashboard/RouteTab.tsx` - Extended: Promise.all server fetch for route GeoJSON + approved points + legend; uploadedAt serialized to ISO string
- `src/components/dashboard/RouteTabClient.tsx` - Extended: mounts MapView when route exists, keeps upload/replace control below (D-49); ExistingRoute.uploadedAt typed as string

## Decisions Made

- MapView reads `boqPaletteSlot` (integer 0–5) from server-built GeoJSON feature.properties; the data-driven `['match', ['get','boqPaletteSlot'], ...]` expression avoids any client-side BOQ lookup
- Non-Turbopack dev server required for all map testing (`npm run dev -- --no-turbopack`) — documented as a pattern for future map work
- Legend card uses `bg-background/90` (90% opacity) overlay positioned bottom-left; hidden entirely when no approved points (not shown empty)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MapLayerMouseEvent renamed to MapMouseEvent (correct react-map-gl v8 type)**
- **Found during:** Task 2 (Wire RouteTab + RouteTabClient — tsc --noEmit verification)
- **Issue:** Plan's interface contract specified `import type { MapLayerMouseEvent } from 'react-map-gl/mapbox'`; however the actual react-map-gl v8 package exports `MapMouseEvent` for this purpose. `MapLayerMouseEvent` does not exist as a named export, causing TypeScript to error.
- **Fix:** Changed `MapLayerMouseEvent` to `MapMouseEvent` in MapView.tsx; type applied to the `onClick` handler parameter
- **Files modified:** `src/components/dashboard/MapView.tsx`
- **Verification:** `npx tsc --noEmit` exits 0 after fix; eslint passes
- **Committed in:** `92ce817` (Task 2 commit — MapView.tsx 4-line diff)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type name correction)
**Impact on plan:** Purely a type-name correction in react-map-gl v8. No behavior change, no scope change. Plan's functional intent fully preserved.

## Issues Encountered

None beyond the MapMouseEvent type deviation above.

## User Setup Required

None — no new external services. Mapbox token already confirmed in Phase 05-01 checkpoint.

## Threat Surface Scan

No new security surface introduced beyond what the plan's threat model covers:
- photoUrl rendered only via `next/image src={photoUrl}` — remotePatterns block off-host URLs (T-05-XSS mitigated)
- approvedPoints/route data auth+tenant-scoped server-side before reaching MapView (T-05-AC accepted)
- NEXT_PUBLIC_MAPBOX_TOKEN domain-restriction carry-forward from Plan 01 (T-05-EP carry-forward, D-62)

## Next Phase Readiness

- DASH-01 and DASH-02 complete: live map with route + approved points is the visual core of the dashboard
- Map props contract (routeGeoJSON: GeoJSON.LineString | null, approvedPoints: GeoJSON.FeatureCollection, boqLegend: Array<{id,material,paletteSlot}>) is stable for future overlay additions
- Turbopack-incompatibility with mapbox-gl documented — any future map work must use `--no-turbopack` for dev verification

---
*Phase: 05-dashboard-map*
*Completed: 2026-05-25*
