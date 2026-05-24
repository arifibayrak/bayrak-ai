---
phase: 01-foundation
plan: "06"
subsystem: boq-route-upload
tags: [server-actions, exceljs, geojson, postgis, tdd, drizzle, zod, next-intl]
dependency_graph:
  requires:
    - 01-02a (boq_items/routes schema, remainingBalance helper, getDefaultTenantId)
    - 01-02b (live DB state, routes.geom = geometry(LineString,4326))
    - 01-03 (auth() guard, next-intl messages)
    - 01-05 (BoqTab/RouteTab stubs, tabbed detail page)
  provides:
    - validateLineStringGeoJSON: WGS84 LineString validation with NOT_VALID_JSON/NOT_LINESTRING/NOT_GEOJSON errors
    - uploadRoute Server Action: ST_GeomFromGeoJSON insert with onConflictDoUpdate replace
    - getRoute Server Action: reads saved route metadata
    - addBoqItem / updateBoqItem / deleteBoqItem: manual BOQ CRUD, auth-guarded, tenant-scoped
    - previewBoqImport / confirmBoqImport: Excel preview→confirm import flow, .xlsx-only
    - parseBoqExcel + generateBoqTemplate: ExcelJS parser with Turkish decimal + downloadable template
    - BoqTab / BoqTabClient / BoqTable / BoqItemDialog / BoqImportDialog: full BOQ tab UI
    - RouteTab / RouteTabClient / RouteUpload: full GeoJSON route upload UI
    - /dashboard/projects/[id]/boq-template route.ts: auth-guarded .xlsx template download
  affects:
    - Phase 3 (BOQ approvals will update approvedQty; remainingBalance updates automatically)
    - Phase 4 (route geometry used by PostGIS nearest-segment queries)
    - Phase 5 (route geometry rendered on Mapbox map)
tech_stack:
  added: []
  patterns:
    - ExcelJS Buffer: workbook.xlsx.load requires ArrayBuffer — Node 24 Buffer must be sliced via .buffer.slice(byteOffset, byteOffset+byteLength)
    - Zod v4 z.record(): requires key schema argument — z.record(z.string(), z.unknown())
    - Base UI DropdownMenuTrigger uses render prop for polymorphism, not asChild
    - NextResponse with binary body: use new Uint8Array(buffer) not Buffer directly (BodyInit type mismatch)
    - ST_GeomFromGeoJSON: parameterized sql`ST_GeomFromGeoJSON(${geojsonString})` — never string-concatenated (T-06-01)
    - onConflictDoUpdate on routes.projectId: implements route replace (D-07) without delete+insert race
key_files:
  created:
    - src/lib/geojson.ts
    - src/lib/excel.ts
    - src/actions/routes.ts
    - src/actions/boq.ts
    - src/components/dashboard/RouteUpload.tsx
    - src/components/dashboard/RouteTabClient.tsx
    - src/components/dashboard/BoqTabClient.tsx
    - src/components/dashboard/BoqTable.tsx
    - src/components/dashboard/BoqItemDialog.tsx
    - src/components/dashboard/BoqImportDialog.tsx
    - src/app/dashboard/projects/[id]/boq-template/route.ts
    - tests/geojson.test.ts
    - tests/excel.test.ts
    - tests/boq.test.ts
  modified:
    - src/components/dashboard/BoqTab.tsx (stub replaced with async RSC)
    - src/components/dashboard/RouteTab.tsx (stub replaced with async RSC)
decisions:
  - "ExcelJS declares its own Buffer interface extending ArrayBuffer — use buffer.buffer.slice(...) to extract underlying ArrayBuffer before passing to workbook.xlsx.load()"
  - "Zod v4 z.record() requires 2 arguments: z.record(z.string(), z.unknown()) not z.record(z.unknown())"
  - "NextResponse body must be BodyInit — Buffer<ArrayBufferLike> fails; use new Uint8Array(buffer) for xlsx download response"
  - "Base UI DropdownMenuTrigger uses render prop (not asChild) for polymorphism — consistent with Button pattern established in 01-05"
  - "RouteTab split into async RSC (RouteTab.tsx) + client state manager (RouteTabClient.tsx) to avoid async client component (RSC boundary)"
  - "BoqTab split into async RSC (BoqTab.tsx) + BoqTabClient.tsx for same RSC boundary reason"
metrics:
  duration: "~90 minutes"
  completed: "2026-05-24"
  tasks_completed: 2
  files_created: 14
  files_modified: 2
---

# Phase 01 Plan 06: BOQ CRUD + Excel Import + GeoJSON Route Upload Summary

**One-liner:** Auth-guarded Server Actions for BOQ manual CRUD and Excel xlsx import (preview→confirm, Turkish decimal normalize, downloadable template) plus GeoJSON WGS84 LineString validation and route upload via ST_GeomFromGeoJSON with replace-on-re-upload — replacing the BoqTab and RouteTab stubs with full working UI.

---

## Tasks Completed

| Task | Description | Commit | Tests |
|------|-------------|--------|-------|
| RED gate (Task 1) | Failing geojson tests | 21909ca | 0/5 RED |
| Task 1 GREEN | GeoJSON lib + uploadRoute + RouteTab UI | a552d7f | 5/5 GREEN |
| RED gate (Task 2) | Failing excel + boq tests | 6e0d4e7 | 4/15 RED (pure units pass, DB + excel fail) |
| Task 2 GREEN | Excel parser + BOQ actions + BOQ tab UI | bef0885 | 20/20 GREEN (69/69 full suite) |

---

## What Was Built

### Task 1: GeoJSON Validation Library + Route Upload Action + Route Tab UI

**src/lib/geojson.ts:**
- `validateLineStringGeoJSON(rawJson)` — Zod-based validator: lngLat tuple with lng -180..180 + lat -90..90; accepts Feature and FeatureCollection; returns geometry-only JSON string (NOT the Feature wrapper — Pitfall 4 prevention).
- Error codes: `NOT_VALID_JSON`, `NOT_LINESTRING` (with `actualType`), `NOT_GEOJSON`.
- Security T-06-01: validation runs before any DB write; geometry passed to PostGIS only via `ST_GeomFromGeoJSON(${...})`.

**src/actions/routes.ts** (`'use server'`):
- `uploadRoute(projectId, fileContent)` — auth-guarded, validates via `validateLineStringGeoJSON`, inserts with `sql\`ST_GeomFromGeoJSON(${result.geojsonString})\`` + `onConflictDoUpdate` on `routes.projectId` (replace path per D-07).
- `getRoute(projectId)` — reads coordinate count + uploadedAt for saved route display.

**Route Tab components:**
- `RouteTab.tsx` — async Server Component; fetches existing route, renders RouteTabClient.
- `RouteTabClient.tsx` — client state manager; shows upload zone (no route) or metadata card + "Rotayı Değiştir" (route exists).
- `RouteUpload.tsx` — file drop zone with .geojson-only accept; client-side pre-validation for immediate feedback; Validating/success/error Alert states with UI-SPEC copy (actualType interpolated).

**tests/geojson.test.ts:** 5 passing unit tests covering valid accept, Polygon reject with actualType, lat-swapped out-of-range, non-JSON, and non-GeoJSON.

---

### Task 2: ExcelJS Parser + BOQ Server Actions + BOQ Tab UI

**src/lib/excel.ts:**
- `parseBoqExcel(buffer)` — skips header row 1; trims cells; Turkish decimal `String(qty).replace(',','.')` then parseFloat (Pitfall 16); collects row-level errors for missing material/unit and non-positive/non-numeric qty; returns `{ ok: true, rows }` or `{ ok: false, errors }`.
- `generateBoqTemplate()` — creates .xlsx with Malzeme/Birim/Sözleşme Miktarı columns + DN200 HDPE example row.

**src/actions/boq.ts** (`'use server'`):
- `addBoqItem({projectId, material, unit, plannedQty})` — auth-guarded, tenant-scoped, sort_order = current max+1.
- `updateBoqItem(id, {material?, unit?, plannedQty?})` — auth-guarded, partial update.
- `deleteBoqItem(id)` — auth-guarded, revalidates project path.
- `getBoqItems(projectId)` — auth-guarded, ordered by sort_order.
- `previewBoqImport(formData)` — auth-guarded; rejects non-.xlsx (ONLY_XLSX per T-06-05); `Buffer.from(await file.arrayBuffer())` (Pitfall 5); returns parsed rows without DB write.
- `confirmBoqImport(projectId, rows)` — auth-guarded; batch insert with sort_order; revalidates path.

**src/app/dashboard/projects/[id]/boq-template/route.ts:**
- GET returns `generateBoqTemplate()` as .xlsx with correct Content-Type + Content-Disposition; auth-guarded (T-06-04).

**BOQ Tab components:**
- `BoqTab.tsx` — async Server Component; fetches items via `getBoqItems`, renders BoqTabClient.
- `BoqTabClient.tsx` — client shell; section heading + "Kalem Ekle" + "Excel'den İçe Aktar"; empty state; `router.refresh()` on mutation.
- `BoqTable.tsx` — columns: #, Material (wraps), Unit, Contracted Qty, Approved Qty, Remaining Balance (color+numeric per UI-SPEC thresholds), Actions dropdown. `Intl.NumberFormat('tr-TR')` for locale formatting. Balance: success (>10%), warning (≤10%), destructive (≤0).
- `BoqItemDialog.tsx` — add/edit dialog; validation on submit (not blur); supports both add and edit modes.
- `BoqImportDialog.tsx` — 6-step flow: file input (.xlsx) + template download link → previewBoqImport → preview table (read-only) → count + Confirm/Cancel → confirmBoqImport → toast + refresh. Row-level errors in destructive Alert. 4MB sub-label (T-06-03 UX).

**Tests:**
- `tests/excel.test.ts`: 5 unit tests (parse valid/Turkish decimal/row errors, template round-trip).
- `tests/boq.test.ts`: 4 pure unit tests (remainingBalance) + 6 DB integration tests (CRUD, remaining balance, import row count, unauthorized guard).

---

## Commits

| Commit | Description |
|--------|-------------|
| 21909ca | test(01-06): add failing geojson validation tests (RED gate) |
| a552d7f | feat(01-06): GeoJSON validation lib + uploadRoute action + Route tab UI (GREEN) |
| 6e0d4e7 | test(01-06): add failing excel parser + BOQ action tests (RED gate) |
| bef0885 | feat(01-06): ExcelJS parser + BOQ CRUD/import actions + BOQ tab UI (GREEN) |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod v4 `z.record()` requires 2 arguments**
- **Found during:** Task 1 TypeScript check
- **Issue:** `z.record(z.unknown())` — Zod v4 changed `.record()` to require an explicit key schema. TypeScript error TS2554 "Expected 2-3 arguments, but got 1."
- **Fix:** Changed to `z.record(z.string(), z.unknown())`.
- **Files modified:** src/lib/geojson.ts
- **Commit:** a552d7f

**2. [Rule 1 - Bug] `result.error` accessed without type narrowing in test**
- **Found during:** Task 1 TypeScript check
- **Issue:** TS2339 — `result.error` is only present on the `ok: false` branch of the discriminated union. Accessing it without `if (!result.ok)` guard fails.
- **Fix:** Added `if (result.ok) return;` guard before `expect(result.error)` in the lat-swapped test case.
- **Files modified:** tests/geojson.test.ts
- **Commit:** a552d7f

**3. [Rule 1 - Bug] Base UI `DropdownMenuTrigger` does not have `asChild` prop**
- **Found during:** Task 2 TypeScript check
- **Issue:** TS2322 "Property 'asChild' does not exist" — Base UI uses `render` prop for polymorphism, not Radix's `asChild`. Consistent with Button pattern established in plan 01-05.
- **Fix:** Changed `<DropdownMenuTrigger asChild><Button ...>` to `<DropdownMenuTrigger render={<Button ...>} />`.
- **Files modified:** src/components/dashboard/BoqTable.tsx
- **Commit:** bef0885

**4. [Rule 1 - Bug] `NextResponse` body type mismatch with `Buffer<ArrayBufferLike>`**
- **Found during:** Task 2 TypeScript check
- **Issue:** TS2345 — `Buffer<ArrayBufferLike>` is not assignable to `BodyInit` (missing URLSearchParams-specific properties). `NextResponse(buffer, ...)` fails.
- **Fix:** Wrapped with `new Uint8Array(buffer)` which satisfies `BodyInit`.
- **Files modified:** src/app/dashboard/projects/[id]/boq-template/route.ts
- **Commit:** bef0885

**5. [Rule 1 - Bug] ExcelJS `workbook.xlsx.load()` type mismatch with Node 24 Buffer**
- **Found during:** Task 2 TypeScript check
- **Issue:** ExcelJS declares its own `Buffer` interface extending `ArrayBuffer` (not Node's `Buffer<ArrayBufferLike>`). Node 24's more generic Buffer type is not assignable to ExcelJS's narrower `Buffer` declaration.
- **Fix:** Extract underlying `ArrayBuffer` via `buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)` then cast `as any` for ExcelJS compatibility.
- **Files modified:** src/lib/excel.ts
- **Commit:** bef0885

---

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED gate (Task 1) | 21909ca | PASS — test(01-06) committed with import-fail errors |
| GREEN gate (Task 1) | a552d7f | PASS — feat(01-06) committed with 5/5 geojson tests passing |
| RED gate (Task 2) | 6e0d4e7 | PASS — test(01-06) committed; excel fails module-not-found, boq DB tests fail network |
| GREEN gate (Task 2) | bef0885 | PASS — feat(01-06) committed with 20/20 plan tests, 69/69 full suite passing |
| REFACTOR | Not required | — |

---

## Security / Threat Model Coverage

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-06-01 GeoJSON injection via upload | Mitigated | `validateLineStringGeoJSON` runs before any DB write; geometry inserted only via parameterized `ST_GeomFromGeoJSON(${result.geojsonString})` — no string concatenation |
| T-06-02 BOQ quantity/material injection via Excel | Mitigated | `parseFloat` after comma→period normalization; cell values read as typed strings, never eval()'d; inserted via Drizzle parameterized values |
| T-06-03 Denial of Service (oversized upload) | Mitigated | .xlsx-only + .geojson-only accept filters; Next.js Server Action 4MB body limit enforced by framework; 4MB note shown in BoqImportDialog sub-label |
| T-06-04 Unauthenticated BOQ/route/template actions | Mitigated | `uploadRoute`, all BOQ actions, and the template download route call `auth()` and throw/return 401 when unauthenticated |
| T-06-05 Wrong-type file masquerading | Mitigated | `previewBoqImport` rejects non-.xlsx by extension check (ONLY_XLSX); GeoJSON validator rejects non-LineString with specific errors |

---

## Known Stubs

None — all stubs from plan 01-05 have been replaced:
- `BoqTab.tsx`: stub replaced with async RSC + BoqTabClient + full table/dialog UI
- `RouteTab.tsx`: stub replaced with async RSC + RouteTabClient + upload/replace UI

---

## Threat Flags

None — no new network endpoints, auth paths, or schema changes beyond what was planned in the threat model.

---

## Self-Check: PASSED

Files verified present:
- src/lib/geojson.ts: FOUND
- src/lib/excel.ts: FOUND
- src/actions/routes.ts: FOUND
- src/actions/boq.ts: FOUND
- src/components/dashboard/RouteTab.tsx: FOUND (stub replaced)
- src/components/dashboard/RouteTabClient.tsx: FOUND
- src/components/dashboard/RouteUpload.tsx: FOUND
- src/components/dashboard/BoqTab.tsx: FOUND (stub replaced)
- src/components/dashboard/BoqTabClient.tsx: FOUND
- src/components/dashboard/BoqTable.tsx: FOUND
- src/components/dashboard/BoqItemDialog.tsx: FOUND
- src/components/dashboard/BoqImportDialog.tsx: FOUND
- src/app/dashboard/projects/[id]/boq-template/route.ts: FOUND
- tests/geojson.test.ts: FOUND
- tests/excel.test.ts: FOUND
- tests/boq.test.ts: FOUND

Commits verified:
- 21909ca RED gate (geojson): FOUND
- a552d7f GREEN gate (Task 1): FOUND
- 6e0d4e7 RED gate (excel+boq): FOUND
- bef0885 GREEN gate (Task 2): FOUND

Tests: 69/69 PASS (20 new plan tests + 49 existing)
TypeScript: 0 errors
