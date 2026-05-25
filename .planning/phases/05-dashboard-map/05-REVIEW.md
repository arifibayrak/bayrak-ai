---
phase: 05-dashboard-map
reviewed: 2026-05-25T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - next.config.ts
  - src/actions/routes.ts
  - src/actions/submissions.ts
  - src/app/dashboard/projects/[id]/page.tsx
  - src/components/dashboard/BoqTable.tsx
  - src/components/dashboard/KayitlarTab.tsx
  - src/components/dashboard/KayitlarTabClient.tsx
  - src/components/dashboard/MapView.tsx
  - src/components/dashboard/RefreshOnFocus.tsx
  - src/components/dashboard/RouteTab.tsx
  - src/components/dashboard/RouteTabClient.tsx
  - src/lib/bot-audit.ts
  - tests/boq.test.ts
  - tests/submissions.test.ts
findings:
  critical: 4
  warning: 6
  info: 3
  total: 13
status: resolved
fixes_applied: "All 4 Critical + 6 Warning findings fixed (commits 9a29a76, 1420dd9, d613317, bffc849, 830c43c, 5ff4dd0, 9439e64, a6f7354). Info findings IN-01/IN-02/IN-03 left as-is. tsc + 155 tests + production build all green post-fix."
---

# Phase 5: Code Review Report

**Reviewed:** 2026-05-25
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Fourteen files reviewed covering the dashboard map tab (route GeoJSON, approved-point overlays, BOQ table, Kayıtlar list, RefreshOnFocus, bot-audit service, and tests). The UI rendering, geometry handling, and pagination plumbing are generally solid. Four blockers were found: missing tenant-scope filters on three server actions that allow cross-tenant reads; an unguarded `JSON.parse` that crashes the server action on a null geometry value from the DB; a connection-pool leak in `getTxDb` that will exhaust Neon's connection limit under sustained load; and a missing project-ownership check on `uploadRoute` that lets an authenticated user overwrite any project's route. Six quality warnings round out the report.

---

## Critical Issues

### CR-01: `getRoute` and `getRouteGeoJSON` in `routes.ts` lack tenant-scope filter — cross-tenant read

**File:** `src/actions/routes.ts:64–113`

**Issue:** Both `getRoute` and `getRouteGeoJSON` filter only on `routes.projectId`. The `routes` table carries a `tenant_id` column. An authenticated user who knows (or guesses) a UUID from another tenant's project can retrieve its route geometry. The upload action (`uploadRoute`) correctly writes `tenantId: getDefaultTenantId()` but the read path never verifies the row belongs to the calling tenant.

In the current single-tenant MVP this is harmless because all `project_id` values belong to the single tenant, but the schema comment says "nullable for multi-tenant migration" and the code notes explicitly preserve tenantId for future use. Any future multi-tenant extension of this code will silently leak route geometry across tenants the moment a second tenant is provisioned.

Similarly, `src/actions/submissions.ts` — `getRouteGeoJSON`, `getApprovedPoints`, `getBoqLegend`, and `getSubmissions` — filter only on `projectId` with no `tenantId` guard on reads.

**Fix:**
```typescript
// routes.ts — getRoute and getRouteGeoJSON
.where(
  and(
    eq(routes.projectId, projectId),
    eq(routes.tenantId, getDefaultTenantId()),   // add tenant scope
  )
)

// submissions.ts — getApprovedPoints, getBoqLegend, getSubmissions
// add to each query's where clause:
eq(submissions.tenantId, getDefaultTenantId())   // for submissions queries
eq(boqItems.tenantId, getDefaultTenantId())      // for boqItems queries
eq(routes.tenantId, getDefaultTenantId())        // for routes queries
```

---

### CR-02: `uploadRoute` does not verify the caller owns the target project — IDOR write

**File:** `src/actions/routes.ts:30–58`

**Issue:** `uploadRoute(projectId, fileContent)` checks only that a session exists. It does not verify that `projectId` belongs to the tenant returned by `getDefaultTenantId()`. An authenticated user can supply any valid project UUID and overwrite its route geometry. The projects action (`getProject`) correctly adds `eq(projects.tenantId, getDefaultTenantId())` to its WHERE clause; `uploadRoute` skips this check entirely.

**Fix:**
```typescript
export async function uploadRoute(projectId: string, fileContent: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // Verify project belongs to the active tenant before writing
  const { projects } = await import('@/db/schema/projects');
  const { eq, and } = await import('drizzle-orm');
  const owned = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId())))
    .limit(1);
  if (!owned.length) throw new Error('Not found');

  // ... existing validation + insert
}
```

---

### CR-03: `JSON.parse` on `ST_AsGeoJSON` result is unguarded — null crash in `getApprovedPoints`

**File:** `src/actions/submissions.ts:152`

**Issue:** `ST_AsGeoJSON(submissions.snappedPoint)` returns `null` (not a JSON string) when `snapped_point` is `NULL` in the database. The WHERE clause includes `isNotNull(submissions.snappedPoint)` to filter these rows, but `isNotNull` only filters at the Postgres level. If the query returns any row where `snappedPointJson` is `null` (for example, due to a Drizzle type mismatch, a race with `snappedPoint` being set to NULL after the WHERE evaluation, or a future schema change), `JSON.parse(null)` throws `SyntaxError: Unexpected token n` and crashes the entire server action, returning a 500 to the dashboard instead of a partial result.

The same pattern applies to `getRouteGeoJSON` (line 64): if `geomJson` is `null`, `JSON.parse(null)` throws.

**Fix:**
```typescript
// getApprovedPoints — wrap each parse defensively
const geometry = r.snappedPointJson
  ? (JSON.parse(r.snappedPointJson) as { type: 'Point'; coordinates: [number, number] })
  : null;
if (!geometry) return null;   // skip malformed rows

// ...inside features.map — filter(Boolean) the result
const features = rows
  .map((r) => {
    if (!r.snappedPointJson) return null;
    const geometry = JSON.parse(r.snappedPointJson) as { type: 'Point'; coordinates: [number, number] };
    return { type: 'Feature' as const, geometry, properties: { ... } };
  })
  .filter((f): f is NonNullable<typeof f> => f !== null);

// getRouteGeoJSON — guard similarly
if (!geomJson) return null;
const geojson = JSON.parse(geomJson) as { type: 'LineString'; coordinates: [number, number][] };
```

---

### CR-04: `getTxDb` creates a new `Pool` on every call and never closes it — connection-pool leak

**File:** `src/lib/bot-audit.ts:28–46`

**Issue:** `getTxDb()` runs `new Pool({ connectionString: ... })` and returns a `drizzle(pool)` instance. It is called once per `handleAuditDecision` approve path and once per `commitRejection` call. In Vercel's serverless environment each invocation gets a fresh cold-start or a reused warm execution context; in either case the `Pool` is never closed. Neon's serverless tier has a hard connection limit (typically 100 per project). Under sustained auditor activity — especially with multiple auditors approving in quick succession — each Telegram webhook invocation opens a new Pool, accumulates idle connections, and will hit the limit, causing `FATAL: too many connections` errors.

**Fix:**
```typescript
// Option A — close the pool after the transaction commits
async function runInTransaction<T>(fn: (tx: Parameters<typeof drizzle>[0]) => Promise<T>): Promise<T> {
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  // ... ws setup ...
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  try {
    const txDb = drizzle(pool);
    return await txDb.transaction(fn);
  } finally {
    await pool.end();   // always release
  }
}

// Option B — use the neon-http driver with explicit BEGIN/COMMIT via sql``
// (simpler for serverless; avoids the pool entirely)
```

---

## Warnings

### WR-01: `bot-audit.ts` falsy check on `locationLat`/`locationLon` silently drops coordinates of `0`

**File:** `src/lib/bot-audit.ts:163`

**Issue:**
```typescript
if (submission.locationLat && submission.locationLon) {
```
Both `locationLat` and `locationLon` are `numeric` columns (stored as strings in Drizzle). If either is the string `'0'` or the number `0`, the condition is false and the Google Maps link is silently omitted from the audit caption. Coordinates of `(0, 0)` (Gulf of Guinea) are unlikely in Turkish pipeline projects, but coordinates with `lon = 0` exactly (prime meridian) are not impossible, and the falsy check is semantically wrong regardless.

**Fix:**
```typescript
if (submission.locationLat != null && submission.locationLon != null) {
  captionLines.push(`📍 https://maps.google.com/?q=${submission.locationLat},${submission.locationLon}`);
}
```

---

### WR-02: `next.config.ts` `remotePatterns` uses `new URL(...)` constructor — Next.js 15 expects plain objects

**File:** `next.config.ts:13`

**Issue:**
```typescript
remotePatterns: [
  new URL("https://*.public.blob.vercel-storage.com/**"),
],
```
`next/image` `remotePatterns` expects an array of plain objects matching `{ protocol, hostname, port?, pathname? }`. Passing a `URL` instance is not the documented API; Next.js internally coerces it in some versions but this behaviour is undocumented and has broken silently in minor releases. The `/**` path component is not a valid `pathname` glob in the Next.js `remotePatterns` spec (which uses a separate `pathname` key), so the wildcard may not apply to path segments at all.

**Fix:**
```typescript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: '*.public.blob.vercel-storage.com',
      pathname: '/**',
    },
  ],
},
```

---

### WR-03: `MapView.tsx` — `onLoad` accesses `coords[0]` after a length check, but the length guard is too early; a one-coordinate LineString would not be caught

**File:** `src/components/dashboard/MapView.tsx:163–184`

**Issue:** The guard is `if (coords.length === 0) return;`. A LineString with a single coordinate (`coords.length === 1`) passes the guard, then `coords[0][0]` and `coords[0][1]` are used to initialise `minLng/maxLng/minLat/maxLat`, which is technically valid, but `fitBounds` is then called with `[[x,y],[x,y]]` — identical south-west and north-east corners. Mapbox GL JS throws `Error: Invalid LngLatBounds` on a zero-area bounding box. The GeoJSON spec requires a LineString to have at least 2 positions, but the incoming data is from `ST_AsGeoJSON` which can theoretically return a degenerate geometry, and there is no enforcement of the minimum at this call site.

**Fix:**
```typescript
if (coords.length < 2) return;  // LineString needs ≥ 2 points for a valid bbox
```

---

### WR-04: `RouteTabClient.tsx` uses `crypto.randomUUID()` for the optimistic `savedRoute.id` after upload

**File:** `src/components/dashboard/RouteTabClient.tsx:59`

**Issue:**
```typescript
setSavedRoute({
  id: crypto.randomUUID(),   // fabricated — does not match the DB row
  coordinateCount: count,
  uploadedAt: new Date().toISOString(),
});
```
The optimistic `id` is a freshly-generated UUID that will never match the actual database row. If any downstream code (for example, a future edit/delete route feature) reads `savedRoute.id` and sends it to a server action, it will send a phantom UUID and fail silently or produce a confusing 404/error. The `uploadRoute` server action already returns `{ ok: true, count }` — it should also return the new row's `id` (or `getRoute` should be called post-upload) so the client state is accurate.

**Fix:** Return the route `id` from `uploadRoute` and thread it through `onSuccess`:
```typescript
// routes.ts
const [row] = await db.insert(routes).values({...}).returning({ id: routes.id });
return { ok: true as const, count: result.count, id: row.id };

// RouteTabClient.tsx
function handleUploadSuccess(count: number, routeId: string) {
  setSavedRoute({ id: routeId, coordinateCount: count, uploadedAt: new Date().toISOString() });
  setIsReplacing(false);
}
```

---

### WR-05: Three hardcoded Turkish strings in `RouteTabClient.tsx` bypass the i18n system

**File:** `src/components/dashboard/RouteTabClient.tsx:81,87,123`

**Issue:** Three strings are hardcoded in Turkish directly in JSX, bypassing `next-intl`:
- `"Koordinat sayısı /"` (line 81)
- `"Yükleme tarihi /"` (line 87)
- `"İptal"` (line 123)

The project is declared TR/EN switchable from the start (CLAUDE.md constraint). These strings will not translate when `next-intl` locale is switched.

**Fix:** Add translation keys (e.g. `route.coord_count`, `route.upload_date`, `common.cancel`) and use `t('...')`. The `Cancel` button is especially notable because `tc('cancel')` already exists in `BoqTable.tsx` line 217.

---

### WR-06: `deleteBoqItem` and `updateBoqItem` in `boq.ts` do not enforce tenant ownership — cross-tenant write via guessed UUID

**File:** `src/actions/boq.ts:78–141` (referenced from `BoqTable.tsx`)

**Issue:** The comment at line 75 explicitly acknowledges this: _"Tenant-scoping not enforced here since item IDs are UUIDs (not guessable)"_. This is a broken-window rationale. UUIDs are generated with `defaultRandom()`, which uses a CSPRNG, so they are not practically guessable. But the defence-in-depth argument for tenant scope is not "guessability" — it is "correctness regardless of UUID exposure." If a UUID leaks (logs, error messages, network traces), an authenticated user from a different tenant could update or delete a BOQ item they do not own. The `deleteBoqItem` WHERE clause is `eq(boqItems.id, id)` with no tenant check. This is consistent with the broader missing-tenant-scope pattern noted in CR-01 but is a write path, making it more impactful.

**Fix:**
```typescript
// deleteBoqItem — add tenant ownership check
await db
  .delete(boqItems)
  .where(and(eq(boqItems.id, id), eq(boqItems.tenantId, getDefaultTenantId())));

// updateBoqItem — same pattern
await db
  .update(boqItems)
  .set(updates)
  .where(and(eq(boqItems.id, id), eq(boqItems.tenantId, getDefaultTenantId())));
```

---

## Info

### IN-01: `RefreshOnFocus` can cause a visible flash when tabbing quickly between browser tabs

**File:** `src/components/dashboard/RefreshOnFocus.tsx:22–25`

**Issue:** Both `focus` and `visibilitychange` events are subscribed. When the user switches back to the tab, the browser fires `visibilitychange` (visible) followed almost immediately by `focus` — this triggers `router.refresh()` twice in rapid succession. The second call makes a redundant full-page server render. This is a minor UX issue (brief double-fetch), not a correctness bug, but it wastes bandwidth and can produce a visible re-render flash on slow connections.

**Fix:**
```typescript
// Debounce or deduplicate — only listen to visibilitychange (covers focus too)
const onVisibility = () => {
  if (document.visibilityState === 'visible') refresh();
};
document.addEventListener('visibilitychange', onVisibility);
// Remove the separate 'focus' listener
```

---

### IN-02: `KayitlarTabClient.tsx` empty-state condition has a gap — `total > 0` but `rows.length === 0` falls through to table render with empty `rows`

**File:** `src/components/dashboard/KayitlarTabClient.tsx:136–165`

**Issue:** Two early returns are defined:
1. `total === 0 && initialStatus === 'all'` → empty_all
2. `rows.length === 0 && initialStatus !== 'all'` → empty_filtered

Neither handles `total > 0 && rows.length === 0 && initialStatus === 'all'` — which happens when the user navigates directly to a page number beyond `pageCount` (e.g., `?page=999`). In that case `rows` is empty but `total > 0` and `status === 'all'`, so neither early return fires and the component renders an empty `<TableBody>` with the pagination footer showing "Sayfa 999 / 4". This is not a crash but it is a confusing UI state.

**Fix:** Add a third guard:
```typescript
if (rows.length === 0) {
  // Covers out-of-range page with status=all and genuine filtered empty
  return <EmptyState message={initialStatus === 'all' ? t('empty_all') : t('empty_filtered')} />;
}
```

---

### IN-03: Duplicate `getRouteGeoJSON` export — same function name in two modules (`routes.ts` and `submissions.ts`)

**File:** `src/actions/routes.ts:90` and `src/actions/submissions.ts:43`

**Issue:** Both `src/actions/routes.ts` and `src/actions/submissions.ts` export a function named `getRouteGeoJSON`. `RouteTab.tsx` imports from `@/actions/routes` (line 17), but `KayitlarTab.tsx` and the test file import from `@/actions/submissions`. The two implementations are nearly identical in behaviour but differ in type annotations (`sql<string>` vs. untyped `sql`) and `uploadedAt` handling. Future maintainers will not know which to use, and any refactor touching one may miss the other. This is dead duplication that will silently diverge.

**Fix:** Remove `getRouteGeoJSON` from `src/actions/routes.ts` and have `RouteTab.tsx` import from `src/actions/submissions.ts` (or vice versa — pick one canonical location and delete the other).

---

_Reviewed: 2026-05-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
