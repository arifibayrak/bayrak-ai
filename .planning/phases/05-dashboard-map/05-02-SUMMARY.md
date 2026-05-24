---
phase: 05-dashboard-map
plan: "02"
subsystem: data-layer
tags: [server-actions, postgis, geojson, submissions, pagination, whitelist]
dependency_graph:
  requires: [05-01]
  provides: [getRouteGeoJSON, getApprovedPoints, getBoqLegend, getSubmissions]
  affects: [05-03-map, 05-04-kayitlar]
tech_stack:
  added: []
  patterns:
    - ST_AsGeoJSON via parameterized sql`` for geometry read-back
    - stable paletteSlot map from boqItems.sortOrder (D-58)
    - VALID_STATUSES whitelist for status filter (T-05-IV / V5)
    - Promise.all paginated select + count(*)::int
    - Date.toISOString() + Number() coercion before client prop pass
key_files:
  created:
    - src/actions/submissions.ts
  modified:
    - src/actions/routes.ts
    - tests/submissions.test.ts
decisions:
  - "getRouteGeoJSON exported from src/actions/submissions.ts (per test import) AND src/actions/routes.ts (per plan artifacts spec)"
  - "VALID_STATUSES whitelist at module scope for reuse across validation and typing"
  - "buildPaletteSlotMap internal helper avoids re-querying boqItems in both getApprovedPoints and getBoqLegend"
metrics:
  duration: "25 minutes"
  completed: "2026-05-24"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
requirements: [DASH-01, DASH-02, DASH-03, DASH-05]
---

# Phase 5 Plan 02: Data Layer — Submissions + Route GeoJSON Summary

Server actions that read PostGIS geometry back as parsed GeoJSON and serve the paginated submissions list; all six RED test stubs in tests/submissions.test.ts are GREEN.

## What Was Built

### src/actions/submissions.ts (new — 230 lines)

Complete Phase 5 read-only data layer. Every export has an `auth()` guard at the top.

**getRouteGeoJSON(projectId)**

Returns `{ id, coordinateCount, uploadedAt: string (ISO), geojson: { type: 'LineString', coordinates: [[lng, lat], ...] } }` or null.
- ST_AsGeoJSON mandatory because routes.geom `fromDriver` returns raw WKB hex
- uploadedAt serialized to ISO string before return

**getApprovedPoints(projectId)**

Returns `{ type: 'FeatureCollection', features: Feature[] }`.
- Filter: `status='approved' AND snapped_point IS NOT NULL` (D-46)
- geometry: `JSON.parse(ST_AsGeoJSON(submissions.snappedPoint))` → `{ type: 'Point', coordinates: [lng, lat] }`
- properties: `{ id, boqItemId, boqPaletteSlot (0–5), boqMaterial, locationWarning (bool), locationDistanceM (number|null), quantity (number), unit, photoUrl, status, decidedAt (ISO|null), auditorName (string|null) }`
- leftJoin boqItems → material, unit; leftJoin people (on decidedBy) → auditorName
- paletteSlot derived from boqItems.sortOrder via internal `buildPaletteSlotMap` (D-58, stable)

**getBoqLegend(projectId)**

Returns `[{ id: string, material: string, paletteSlot: number }]` ordered by sortOrder.
- Shares the same stable ordering as `buildPaletteSlotMap` used in getApprovedPoints
- Map legend and FeatureCollection always agree on slot assignment

**getSubmissions(projectId, { status?, page?, pageSize? })**

Returns `{ rows, total, page, pageSize, pageCount }`.
- `VALID_STATUSES = ['pending_audit', 'approved', 'rejected']` — any other non-'all' value throws `'Invalid status filter'` (T-05-IV / V5)
- page clamped to `Math.max(1, Math.floor(Number(page)) || 1)`
- pageSize clamped to `Math.min(100, Math.max(1, ...))`
- `Promise.all` of paginated select + `count(*)::int` select for O(1) total
- leftJoin boqItems → boqMaterial, unit
- All Date → ISO string, all numeric → Number before return
- Ordered newest-first by `desc(submissions.submittedAt)`

Row shape: `{ id, boqMaterial, quantity (number), unit, status, decidedAt (ISO|null), submittedAt (ISO), locationLat (number|null), locationLon (number|null), photoUrl, notes, rejectionReason }`

### src/actions/routes.ts (extended)

Added `getRouteGeoJSON` alongside existing `getRoute` and `uploadRoute`.
Same ST_AsGeoJSON pattern, same null-on-no-route behavior.
`uploadedAt` cast to ISO string for RSC→client serialization.

### tests/submissions.test.ts (fixed)

All six tests GREEN:
- DASH-01 (2): getRouteGeoJSON LineString + null cases
- DASH-02 (1): getApprovedPoints D-46 filter
- DASH-03 (3): status filter, pagination, invalid-status throw

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Invalid non-UUID flow_id values in test INSERTs**
- **Found during:** Task 2 (running tests)
- **Issue:** The Plan 01 RED scaffold used `'flow-approved-snapped'`, `'flow-a'`, `'flow-page-0'` etc. as flow_id values; the column is `uuid('flow_id')` — PostgreSQL rejects non-UUID strings with a failed query error
- **Fix:** Replaced all non-UUID flow_id literals with deterministic valid UUIDs (`00000000-0000-0000-000N-000000000XXX`) in the INSERT statements
- **Files modified:** tests/submissions.test.ts
- **Commit:** aaa6f9d

## Return Shapes for Plans 03/04

Plans 03 (MapView) and 04 (KayitlarTab) should consume these shapes directly.

```typescript
// getRouteGeoJSON return shape
{
  id: string;
  coordinateCount: number;
  uploadedAt: string;              // ISO-8601
  geojson: {
    type: 'LineString';
    coordinates: [number, number][];  // [lng, lat] per GeoJSON spec
  };
} | null

// getApprovedPoints return shape
{
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };  // [lng, lat]
    properties: {
      id: string;
      boqItemId: string;
      boqPaletteSlot: number;       // 0–5
      boqMaterial: string | null;
      locationWarning: boolean;
      locationDistanceM: number | null;
      quantity: number;
      unit: string | null;
      photoUrl: string;
      status: 'approved';
      decidedAt: string | null;     // ISO-8601 or null
      auditorName: string | null;
    };
  }>;
}

// getBoqLegend return shape
Array<{
  id: string;
  material: string;
  paletteSlot: number;  // 0–5, derived from sortOrder
}>

// getSubmissions return shape
{
  rows: Array<{
    id: string;
    boqMaterial: string | null;
    quantity: number;
    unit: string | null;
    status: 'pending_audit' | 'approved' | 'rejected';
    decidedAt: string | null;    // ISO-8601
    submittedAt: string;         // ISO-8601
    locationLat: number | null;
    locationLon: number | null;
    photoUrl: string;
    notes: string | null;
    rejectionReason: string | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
```

## Threat Coverage

| Threat ID | Status |
|-----------|--------|
| T-05-AC | Mitigated — auth() guard on every export |
| T-05-IV | Mitigated — VALID_STATUSES whitelist + integer clamping |
| T-05-GEO | Mitigated — ST_AsGeoJSON via parameterized sql`` on column ref only; no user input in geometry SQL |

## Self-Check

### Check created files exist
- src/actions/submissions.ts: FOUND
- src/actions/routes.ts (modified): FOUND
- tests/submissions.test.ts (modified): FOUND

### Check commits exist
- 5f71e38 (Task 1 geometry read-back): FOUND
- aaa6f9d (Task 2 getSubmissions + test fix): FOUND

## Self-Check: PASSED
