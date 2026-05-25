---
status: partial
phase: 05-dashboard-map
source: [05-VERIFICATION.md]
started: 2026-05-25T01:20:00Z
updated: 2026-05-25T01:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Mapbox map renders (DASH-01 / DASH-02 visual)
expected: On a project's Rota tab, the GeoJSON pipeline route renders as a slate line layer and approved submissions render as circle markers color-coded by BOQ item, snapped to the route. Run `npm run dev -- --no-turbopack`.
result: [pending]

### 2. Marker popup content (DASH-02 / D-51)
expected: Clicking a marker opens a popup showing photo thumbnail, BOQ item, quantity, status badge, date (tr-TR), and deciding auditor. Far points (location_match='far') show an amber warning ring and a "Güzergahtan uzak — {N} m" distance line.
result: [pending]

### 3. Map empty states (D-57)
expected: A project with a route but no approved points renders the route line + "Henüz onaylı iş noktası yok." note and no legend. A project with no route shows the guided upload empty state (no blank/broken map).
result: [pending]

### 4. Liveness — refresh on focus (DASH-05)
expected: Approve a pending submission in another tab (Telegram audit flow or DB update); return to the dashboard tab — after the window regains focus the new approved point appears on the map and the BOQ % increases without a manual reload.
result: [pending]

### 5. Mapbox token domain restriction (SC4 ops gate / D-62)
expected: Before sharing any dashboard URL externally, the NEXT_PUBLIC_MAPBOX_TOKEN is URL-restricted to https://bayrak.ai/* (and www) in account.mapbox.com → Tokens → URL restrictions, with Referrer-Policy not set to no-referrer.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
