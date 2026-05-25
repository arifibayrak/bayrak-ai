---
phase: 05-dashboard-map
fixed_at: 2026-05-25T00:00:00Z
review_path: .planning/phases/05-dashboard-map/05-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-05-25
**Source review:** .planning/phases/05-dashboard-map/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (4 Critical + 6 Warning; Info findings excluded per instructions)
- Fixed: 10
- Skipped: 0

## Fixed Issues

### CR-01: Tenant scope added to all read actions

**Files modified:** `src/actions/routes.ts`, `src/actions/submissions.ts`
**Commit:** `9a29a76`
**Applied fix:** Added `eq(<table>.tenantId, getDefaultTenantId())` to the WHERE clause of `getRoute` and `getRouteGeoJSON` in routes.ts, and `getRouteGeoJSON`, `getBoqLegend`, `buildPaletteSlotMap`, `getApprovedPoints`, and `getSubmissions` in submissions.ts. Matches the existing pattern in `getProject` in projects.ts. Also added `getDefaultTenantId` import to submissions.ts (was missing).

---

### CR-02: uploadRoute IDOR write check

**Files modified:** `src/actions/routes.ts`
**Commit:** `9a29a76`
**Applied fix:** Added project ownership verification before the route write: queries `projects` with `and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId()))` and throws `'Not found'` if the project does not belong to the calling tenant. Mirrors the exact pattern in `getProject`. Also added `projects` schema import and top-level `and` import to routes.ts.

---

### CR-03: JSON.parse null guard in getApprovedPoints and getRouteGeoJSON

**Files modified:** `src/actions/routes.ts`, `src/actions/submissions.ts`
**Commit:** `9a29a76`
**Applied fix:**
- `routes.ts` `getRouteGeoJSON`: returns `null` early if `geomJson` is falsy before calling `JSON.parse`.
- `submissions.ts` `getRouteGeoJSON`: same early-return guard on `geomJson`.
- `submissions.ts` `getApprovedPoints`: refactored `rows.map(...)` to return `null` for rows where `snappedPointJson` is falsy, then `.filter((f): f is NonNullable<typeof f> => f !== null)` to exclude them from the FeatureCollection.

---

### CR-04: Pool leak fix in bot-audit.ts getTxDb

**Files modified:** `src/lib/bot-audit.ts`
**Commit:** `1420dd9`
**Applied fix:** Changed `getTxDb()` return type from bare `drizzle(pool)` to `{ db: drizzle(pool), cleanup: () => pool.end() }`. Both call sites (`handleAuditDecision` approve path and `commitRejection`) were updated to destructure `{ db: txDb, cleanup: txCleanup }` and call `await txCleanup()` in a `finally` block after the `txDb.transaction(...)` try/catch. The Pool is now always closed after each transaction invocation.

---

### WR-01: != null check for locationLat/locationLon in bot-audit.ts

**Files modified:** `src/lib/bot-audit.ts`
**Commit:** `d613317`
**Applied fix:** Changed `if (submission.locationLat && submission.locationLon)` to `if (submission.locationLat != null && submission.locationLon != null)` so coordinates with value `0` (e.g. prime meridian) are not silently dropped from the audit caption.

---

### WR-02: next.config.ts remotePatterns plain-object form

**Files modified:** `next.config.ts`
**Commit:** `bffc849`
**Applied fix:** Replaced `new URL("https://*.public.blob.vercel-storage.com/**")` with the documented plain-object form `{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com', pathname: '/**' }`. Same host scope — no behaviour change. TypeScript and Next.js build continue to pass.

---

### WR-03: fitBounds guard for single-coordinate LineString in MapView.tsx

**Files modified:** `src/components/dashboard/MapView.tsx`
**Commit:** `830c43c`
**Applied fix:** Changed the `onLoad` guard from `if (coords.length === 0) return` to `if (coords.length < 2) return`. A single-coordinate LineString would produce identical SW/NE corners in `fitBounds`, causing Mapbox GL JS to throw `Invalid LngLatBounds`.

---

### WR-04: Use real route id from uploadRoute instead of fabricated UUID

**Files modified:** `src/actions/routes.ts`, `src/components/dashboard/RouteUpload.tsx`, `src/components/dashboard/RouteTabClient.tsx`
**Commit:** `5ff4dd0`
**Applied fix:**
- `routes.ts` `uploadRoute`: changed `db.insert(routes).values(...)` to use `.returning({ id: routes.id })` and returns `{ ok: true, count, id: row.id }`.
- `RouteUpload.tsx`: updated `onSuccess` prop signature from `(count: number) => void` to `(count: number, routeId: string) => void` and passes `result.id` to the callback.
- `RouteTabClient.tsx`: updated `handleUploadSuccess` signature to `(count: number, routeId: string)` and uses `routeId` (not `crypto.randomUUID()`) for the optimistic `savedRoute.id`.

---

### WR-05: Replace hardcoded Turkish strings with i18n keys in RouteTabClient.tsx

**Files modified:** `src/components/dashboard/RouteTabClient.tsx`, `messages/tr.json`, `messages/en.json`
**Commit:** `9439e64`
**Applied fix:**
- Added `tc = useTranslations('common')` alongside the existing `t = useTranslations('dashboard.route')`.
- `"Koordinat sayısı /"` → `{t('coord_count')}` (new `dashboard.route.coord_count` key).
- `"Yükleme tarihi /"` → `{t('upload_date')}` (new `dashboard.route.upload_date` key).
- `"İptal"` → `{tc('cancel')}` (reuses existing `common.cancel` key).
- Added `coord_count` and `upload_date` to both `messages/tr.json` and `messages/en.json`.

---

### WR-06: Tenant scope on deleteBoqItem and updateBoqItem in boq.ts

**Files modified:** `src/actions/boq.ts`
**Commit:** `a6f7354`
**Applied fix:** Added `and` to drizzle-orm imports. Both `updateBoqItem` and `deleteBoqItem` WHERE clauses now include `eq(boqItems.tenantId, getDefaultTenantId())`. The pre-delete projectId fetch also uses the tenant scope. Updated jsdoc comments to remove the broken-window UUID-not-guessable rationale and replace with the correct defence-in-depth explanation.

---

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-05-25_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
