# Phase 5: Dashboard & Map - Research

**Researched:** 2026-05-24
**Domain:** react-map-gl v8 + Mapbox GL JS 3.24, Next.js App Router RSC/client boundaries, PostGIS GeoJSON read-back, Vercel Blob + next/image, router.refresh liveness
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-49:** Rota tab becomes the live Mapbox map (route line + approved points, interactive). New "Kayıtlar" tab for submissions list. BOQ progress enhances the existing BOQ tab. Tab order: BOQ · Rota · Kayıtlar · Personel. Reuse `XTab`/`XTabClient` + URL-state (`?tab=`) pattern.
- **D-50:** BOQ progress shown inline in `BoqTable` — add `Approved` and `% Tamamlanan` columns plus a per-row progress bar, computed from `remainingBalance()` / `approved_qty` / `planned_qty`.
- **D-51:** Clicking an approved point opens a rich Mapbox popup: photo thumbnail, BOQ item, quantity, status, date, deciding auditor.
- **D-52:** `location_match='far'` points get a warning ring/outline (amber) layered over the BOQ-item color. Popup shows `location_distance_m`. `no_route` approved points do not plot on the map.
- **D-53:** shadcn `Table` with columns: photo thumbnail, BOQ item, quantity, status badge, date, location (Google Maps link), notes.
- **D-54:** Default "all statuses" filter chips (Tümü / Bekliyor / Onaylandı / Reddedildi), newest-first, pagination (page size 25–50).
- **D-55:** Dynamic Server Components (`force-dynamic`) + client `router.refresh()` on `visibilitychange`/focus.
- **D-56:** Auto-fit (`fitBounds`) to route LineString bounding box on load; no route → empty state.
- **D-57:** Graceful empty states via next-intl: no route → upload CTA; no approved points → subtle note; empty Kayıtlar → "Henüz kayıt yok"; 0% BOQ → empty bar.
- **D-58:** Curated color-blind-safe palette (6 hex slots) assigned to BOQ items in stable creation-order; legend; cycle with numbered superscript beyond 6 items.
- **D-59:** Practical accessibility: color never sole signal, sufficient contrast, Mapbox built-in keyboard pan/zoom, data fully in Kayıtlar table.
- **D-60:** Desktop-first but genuinely mobile-responsive: map fills width with touch controls, tables scrollable, tabs wrap.
- **D-61:** Photo thumbnails with `next/image` (lazy, explicitly sized); clicking opens shadcn `Dialog` lightbox. Requires adding Vercel Blob hostname to `next.config` `images.remotePatterns`.
- **D-62:** `NEXT_PUBLIC_MAPBOX_TOKEN` must be URL-restricted to bayrak.ai domain in Mapbox account dashboard before any external URL sharing. Explicit planning checklist item.
- **D-63:** Full next-intl TR/EN coverage of every new surface. No hardcoded strings.

**Locked stack (from CLAUDE.md):** `mapbox-gl@3.24.x`, `react-map-gl@8.1.x`, `wkx` for WKB→GeoJSON, `@vercel/blob`, `next-intl 4.x`.

### Claude's Discretion

- Exact BOQ color palette hex values (within color-blind-safe + legend constraints, D-58)
- Route line styling/width/color, marker size, popup layout
- Reading `snapped_point`/route geometry back as GeoJSON (`ST_AsGeoJSON` / `wkx` per custom-type pattern) and the FeatureCollection shape passed to the client map component
- Whether the map client component uses `<Source>`/`<Layer>` vs individual `<Marker>`s — honor locked mapbox-gl 3.24 + react-map-gl 8.1 stack
- next-intl message-key organization for new namespaces
- Pagination page-size number (D-54) and pagination mechanism

### Deferred Ideas (OUT OF SCOPE)

- Export / print of BOQ progress (PDF/report) — HAK-01, v2
- Real-time / WebSocket live map updates — explicitly Out of Scope
- Project-level BOQ progress rollup card — deferred from D-50
- Full WCAG 2.1 AA audit — D-59 is practical a11y; formal AA later
- Dedicated mobile-web auditor review view — AUDIT-V2-01, v2
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | Office Engineer sees the project's pipeline route rendered on a Mapbox map | react-map-gl `<Source>`+`<Layer>` for GeoJSON LineString; `ST_AsGeoJSON` to read `routes.geom`; `fitBounds` on load |
| DASH-02 | Approved work logs render as point markers / colored segments overlaying the route | Circle layer with Mapbox data-driven `match` expression for BOQ palette; second circle layer for anomaly ring |
| DASH-03 | Office Engineer can view a list of submissions filterable by status | New Kayıtlar tab with shadcn Table + filter chips + pagination; Drizzle query with `WHERE status=?` and `OFFSET`/`LIMIT` |
| DASH-04 | Office Engineer sees live BOQ progress (contracted vs. remaining) per line item | Extend `BoqTable` with `% Tamamlanan` column + `<Progress>` bar; `approved_qty / planned_qty` math using existing `remainingBalance()` |
| DASH-05 | Map and BOQ progress reflect approved submissions; refresh on load/focus | `export const dynamic = 'force-dynamic'`; `useEffect` + `window.addEventListener('focus', ...)` → `router.refresh()` |
</phase_requirements>

---

## Summary

Phase 5 adds a live read-only monitoring surface onto the existing project-detail dashboard. Three capabilities are delivered: (1) the existing Rota tab is upgraded from a static upload widget to a full react-map-gl map showing the route LineString and approved submission points; (2) the BOQ tab gains two inline progress columns (`% Tamamlanan` + `<Progress>` bar); (3) a new Kayıtlar tab provides a filterable, paginated submissions table. No new write paths exist.

The primary architectural challenge is the RSC/client boundary: map rendering requires `'use client'` (Mapbox GL JS uses the DOM, workers, and WebGL), while all data fetching stays in Server Components and is passed as props. Data read-back from PostGIS geometry columns (`routes.geom` LineString, `submissions.snapped_point` Point) must use `ST_AsGeoJSON(col)` in a `sql\`\`` expression since Drizzle does not natively serialize geometry to GeoJSON — it returns raw WKB hex by default. This is an established pattern in the codebase (`wkx` is already installed).

Liveness is achieved cheaply: `export const dynamic = 'force-dynamic'` on the detail page Server Component ensures no caching, and a `'use client'` hook adds `window.addEventListener('focus', refresh)` to call `router.refresh()` on tab regain-focus. A known Turbopack issue (mapbox-gl worker teardown) requires switching to `next dev` (webpack) during development; production builds are unaffected.

**Primary recommendation:** Use react-map-gl v8 `<Source>`/`<Layer>` API (not individual `<Marker>`s) for the route line and approved-points layers — this is GPU-accelerated, data-driven, and scales to hundreds of points without React re-render overhead. Use a single `Popup` component rendered conditionally on click.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fetch route GeoJSON + approved points | API / Backend (Server Action) | — | Auth-guarded DB read; geometry serialized server-side |
| Fetch BOQ items + approved quantities | API / Backend (Server Action) | — | Existing `getBoqItems` pattern; add `approvedQty` to return |
| Fetch submissions list (Kayıtlar) | API / Backend (Server Action) | — | New paginated+filtered server action |
| Render Mapbox map + layers | Browser / Client | — | Mapbox GL JS requires DOM + WebGL; `'use client'` mandatory |
| Popup on marker click | Browser / Client | — | Click state is local UI state |
| router.refresh on focus | Browser / Client | — | `useEffect` + `window.addEventListener` |
| BOQ progress columns math | Browser / Client | — | Pure JS math in `BoqTable` (already client) |
| Filter chips state (Kayıtlar) | Browser / Client | — | URL search param or local state for active filter |
| Photo lightbox (Dialog) | Browser / Client | — | shadcn Dialog is client interactivity |
| next/image thumbnails | Frontend Server (SSR) + CDN | Browser | next/image optimization pipeline + Vercel CDN |
| force-dynamic RSC rendering | Frontend Server (SSR) | — | `export const dynamic = 'force-dynamic'` on page.tsx |

---

## Standard Stack

### Core (already installed — no new installs for these)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.x | DB ORM + raw sql`` for ST_AsGeoJSON | Already installed; used project-wide |
| wkx | 0.5.x | WKB hex → GeoJSON (fromDriver fallback) | Already installed; project-wide PostGIS pattern |
| next-intl | 4.12.x | TR/EN translations | Already installed; required I18N-02 |
| shadcn/ui (table, badge, dialog, progress) | CLI-managed | UI components | All pre-installed per UI-SPEC |

### New npm dependencies (Phase 5 installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mapbox-gl | 3.24.x (current: 3.24.0) | Map rendering engine | Locked in CLAUDE.md; official Mapbox package |
| react-map-gl | 8.1.x (current: 8.1.1) | React wrapper for Mapbox GL JS | Locked in CLAUDE.md; React-first API for `<Source>`/`<Layer>`/`<Popup>` |
| @types/mapbox-gl | 3.5.x (current: 3.5.0) | TypeScript types for mapbox-gl | Required for typed Map ref operations |

[VERIFIED: npm registry] — `mapbox-gl@3.24.0`, `react-map-gl@8.1.1`, `@types/mapbox-gl@3.5.0` confirmed via `npm view`.

**Installation:**
```bash
npm install mapbox-gl@3.24.x react-map-gl@8.1.x
npm install --save-dev @types/mapbox-gl
```

**Version verification (run pre-plan):**
```bash
npm view mapbox-gl version        # should show 3.24.0
npm view react-map-gl version     # should show 8.1.1
npm view @types/mapbox-gl version # should show 3.5.0
```

---

## Package Legitimacy Audit

slopcheck was unavailable at research time. Manual verification performed instead.

| Package | Registry | Age | Source Repo | Postinstall | Disposition |
|---------|----------|-----|-------------|-------------|-------------|
| `mapbox-gl` | npm | 11.6 yrs (created 2014-10) | github.com/mapbox/mapbox-gl-js | none | Approved — official Mapbox package |
| `react-map-gl` | npm | 10.6 yrs (created 2015-10) | github.com/visgl/react-map-gl | none | Approved — vis.gl/Mapbox-adjacent, long-standing ecosystem package |
| `@types/mapbox-gl` | npm | DefinitelyTyped project | github.com/DefinitelyTyped | none | Approved — standard DefinitelyTyped package |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable. The packages above are well-established packages verified by npm view against the official registries and confirmed via official documentation. The planner may optionally add a checkpoint:human-verify before install if preferred.*

---

## Architecture Patterns

### System Architecture Diagram

```
[Page Server Component]
  export const dynamic = 'force-dynamic'
  ├── getRouteGeoJSON(projectId)  → { linestring: GeoJSON, bounds: LngLatBounds }
  ├── getApprovedPoints(projectId) → GeoJSON FeatureCollection (snapped_point + properties)
  ├── getBoqItems(projectId)       → rows with plannedQty + approvedQty
  └── getSubmissions(projectId, { status, page }) → rows + totalCount
           ↓ props (serializable GeoJSON + plain objects)
[RotaTab Server]          [BoqTab Server]       [KayitlarTab Server]
  └─ [MapClient 'use client']   └─ [BoqTable]       └─ [KayitlarTabClient]
       mapbox-gl + react-map-gl      + progress cols       filter chips + table
       ├── <Source> route line
       ├── <Source> approved pts
       │    ├── <Layer> circle (BOQ color)
       │    └── <Layer> anomaly ring
       └── <Popup> on click

[RefreshOnFocus 'use client']  ← placed once in page Client wrapper
  window 'focus' → router.refresh()
  visibilitychange (visible) → router.refresh()
```

### Recommended Project Structure

```
src/
├── actions/
│   └── submissions.ts          # NEW — getSubmissions() + getApprovedPoints()
│   └── routes.ts               # EXTEND — add getRouteGeoJSON() returning parsed GeoJSON
├── components/dashboard/
│   ├── MapView.tsx             # NEW 'use client' — react-map-gl map with Source/Layer/Popup
│   ├── RouteTab.tsx            # EXTEND — pass routeGeoJSON + approvedPoints to MapView
│   ├── RouteTabClient.tsx      # EXTEND (or replace) — mount MapView when route exists
│   ├── KayitlarTab.tsx         # NEW Server Component — fetches + passes to KayitlarTabClient
│   ├── KayitlarTabClient.tsx   # NEW 'use client' — filter chips + table + pagination state
│   ├── BoqTable.tsx            # EXTEND — add % Tamamlanan + Progress columns
│   └── RefreshOnFocus.tsx      # NEW 'use client' — router.refresh() on focus/visibility
└── app/dashboard/projects/[id]/
    └── page.tsx                # EXTEND — add Kayıtlar tab, dynamic export, RefreshOnFocus
```

### Pattern 1: react-map-gl v8 Map Component with `'use client'`

**What:** All Mapbox GL JS code lives in a `'use client'` component. Data (GeoJSON) is fetched in a Server Component and passed as props.

**When to use:** Any time a Mapbox map is rendered in the App Router.

**Critical v8 import change:** React-map-gl v8 splits imports by backend library. For `mapbox-gl >= 3.5.0`, ALL imports come from `'react-map-gl/mapbox'` — not `'react-map-gl'`.

```typescript
// Source: https://visgl.github.io/react-map-gl/docs/whats-new (v8 import path change)
'use client';

import Map, { Source, Layer, Popup } from 'react-map-gl/mapbox';
import type { MapRef, LayerProps } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css'; // MUST import CSS — map invisible without it
import { useRef, useState, useCallback } from 'react';

// MapRef gives access to underlying Mapbox Map instance
const mapRef = useRef<MapRef>(null);

// fitBounds via MapRef (D-56)
const onLoad = useCallback(() => {
  if (routeGeoJSON && mapRef.current) {
    const coords = routeGeoJSON.coordinates as [number, number][];
    const lngs = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    mapRef.current.getMap().fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 48, animate: false }
    );
  }
}, [routeGeoJSON]);
```

### Pattern 2: `<Source>` + `<Layer>` for Route Line + Approved Points

**What:** Two GeoJSON sources — one for the LineString route, one for approved point FeatureCollection. Three layers: route line, BOQ-color circles, anomaly ring.

**When to use:** Rendering pipeline route + submission markers at scale.

```typescript
// Source: https://visgl.github.io/react-map-gl/docs/upgrade-guide (v8)
// Source: https://docs.mapbox.com/mapbox-gl-js/example/data-driven-circle-colors/

// Route line layer paint
const routeLayerStyle: LayerProps = {
  id: 'route-line',
  type: 'line',
  paint: {
    'line-color': '#64748B', // slate-500 (UI-SPEC)
    'line-width': 3,
    'line-opacity': 0.8,
  },
};

// Circle layer — color driven by BOQ item id (match expression)
// BOQ_PALETTE maps boqItemId → hex. Build the match array from palette.
const circleLayerStyle: LayerProps = {
  id: 'approved-points',
  type: 'circle',
  paint: {
    'circle-radius': 8,
    'circle-color': [
      'match',
      ['get', 'boqPaletteSlot'], // integer 0–5 stored in feature.properties
      0, '#2563EB',
      1, '#D97706',
      2, '#7C3AED',
      3, '#059669',
      4, '#DB2777',
      5, '#0891B2',
      '#94A3B8' // fallback (overflow slots use numbered superscript separately)
    ],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#FFFFFF',
  },
};

// Anomaly ring layer — separate circle rendered only for location_warning=true points
// Larger radius, amber stroke, transparent fill — creates a visible ring effect
const anomalyRingStyle: LayerProps = {
  id: 'anomaly-ring',
  type: 'circle',
  filter: ['==', ['get', 'locationWarning'], true], // only far points
  paint: {
    'circle-radius': 14,
    'circle-color': 'transparent',
    'circle-stroke-width': 3,
    'circle-stroke-color': 'hsl(38, 92%, 50%)', // amber (UI-SPEC)
  },
};

// JSX
<Map
  ref={mapRef}
  mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
  mapStyle="mapbox://styles/mapbox/streets-v12"
  style={{ width: '100%', height: '600px' }}  // desktop; mobile uses h-[400px] via className
  onLoad={onLoad}
  onClick={handleMapClick}
  interactiveLayerIds={['approved-points']}  // enables layer click with features in event
>
  <Source id="route" type="geojson" data={routeGeoJSON}>
    <Layer {...routeLayerStyle} />
  </Source>
  <Source id="approved" type="geojson" data={approvedPointsGeoJSON}>
    <Layer {...anomalyRingStyle} />   {/* anomaly ring FIRST (behind) */}
    <Layer {...circleLayerStyle} />  {/* BOQ color circle on top */}
  </Source>

  {popupInfo && (
    <Popup
      longitude={popupInfo.lng}
      latitude={popupInfo.lat}
      anchor="bottom"
      onClose={() => setPopupInfo(null)}
      maxWidth="320px"
    >
      {/* Photo, BOQ item, quantity, status, date, auditor, optional distance */}
    </Popup>
  )}
</Map>
```

### Pattern 3: Layer Click → Popup

**What:** `onClick` on the `<Map>` with `interactiveLayerIds` set populates popup state from the clicked feature's properties.

```typescript
// Source: https://visgl.github.io/react-map-gl/docs/api-reference/mapbox/map
const handleMapClick = useCallback((event: MapLayerMouseEvent) => {
  const feature = event.features?.[0];
  if (!feature || feature.geometry.type !== 'Point') return;
  const coords = feature.geometry.coordinates as [number, number];
  setPopupInfo({
    lng: coords[0],
    lat: coords[1],
    ...feature.properties, // photoUrl, boqItem, quantity, status, decidedAt, auditorName, distanceM
  });
}, []);
```

### Pattern 4: Reading Route + Snapped Points as GeoJSON from PostGIS

**What:** Drizzle's `geometry()` column returns raw WKB hex by default. Use `sql\`ST_AsGeoJSON(col)\`` in a `select()` to receive a JSON string, then `JSON.parse()` it.

**When to use:** Every server-side read of `routes.geom` or `submissions.snapped_point`.

```typescript
// Source: https://orm.drizzle.team/docs/guides/postgis-geometry-point (sql`` escape hatch)
// Established project pattern — see src/lib/spatial.ts for sql`` usage
import { sql } from 'drizzle-orm';

// Read route as GeoJSON
const [route] = await db
  .select({
    id: routes.id,
    coordinateCount: routes.coordinateCount,
    geomJson: sql<string>`ST_AsGeoJSON(${routes.geom})`,
  })
  .from(routes)
  .where(eq(routes.projectId, projectId))
  .limit(1);

const routeGeoJSON = route ? JSON.parse(route.geomJson) : null;
// routeGeoJSON is { type: 'LineString', coordinates: [[lng, lat], ...] }

// Read approved snapped points as GeoJSON FeatureCollection
const rows = await db
  .select({
    id: submissions.id,
    snappedPointJson: sql<string>`ST_AsGeoJSON(${submissions.snappedPoint})`,
    locationWarning: submissions.locationWarning,
    locationDistanceM: submissions.locationDistanceM,
    boqItemId: submissions.boqItemId,
    quantity: submissions.quantity,
    photoUrl: submissions.photoUrl,
    status: submissions.status,
    decidedAt: submissions.decidedAt,
    // join to people for auditor name, boq_items for material
  })
  .from(submissions)
  .where(and(
    eq(submissions.projectId, projectId),
    eq(submissions.status, 'approved'),
    isNotNull(submissions.snappedPoint),   // D-46: snapped_point IS NOT NULL
  ));

// Build FeatureCollection — assign palette slot by BOQ item creation order (D-58)
const features = rows
  .filter(r => r.snappedPointJson)
  .map(r => ({
    type: 'Feature',
    geometry: JSON.parse(r.snappedPointJson!),
    properties: {
      id: r.id,
      boqItemId: r.boqItemId,
      boqPaletteSlot: paletteSlotMap.get(r.boqItemId) ?? 5,
      locationWarning: r.locationWarning ?? false,
      locationDistanceM: r.locationDistanceM ? Number(r.locationDistanceM) : null,
      quantity: Number(r.quantity),
      photoUrl: r.photoUrl,
      status: r.status,
      // ... etc
    },
  }));
```

**Note on coordinate order:** `ST_AsGeoJSON` returns `[longitude, latitude]` (GeoJSON spec / x,y order). This matches the Mapbox GL JS expectation. No conversion needed.

### Pattern 5: `force-dynamic` + `RefreshOnFocus` (D-55)

**What:** Opt the detail page out of all caching, then re-run the server fetch when the window regains focus.

```typescript
// In src/app/dashboard/projects/[id]/page.tsx (Server Component)
export const dynamic = 'force-dynamic';
// Source: https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config

// RefreshOnFocus.tsx — client component
// Source: https://buildui.com/recipes/refresh-react-server-component-on-focus
'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function RefreshOnFocus() {
  const { refresh } = useRouter();
  useEffect(() => {
    const onFocus = () => refresh();
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);
  return null;
}
// Mount once inside the page's Client wrapper — applies to all tabs automatically.
```

### Pattern 6: Vercel Blob + next/image remotePatterns

**What:** Add the Vercel Blob public hostname to `next.config` so `next/image` can optimize photos.

**When to use:** Before any photo thumbnail renders. This is a required config change (D-61).

```typescript
// next.config.ts — extend existing nextConfig
// Source: https://vercel.com/docs/vercel-blob/public-storage (verified 2026-03-16)
const nextConfig: NextConfig = {
  serverExternalPackages: ['grammy', 'pg', 'ws', '@neondatabase/serverless'],
  images: {
    remotePatterns: [
      // Vercel Blob public store hostname pattern
      new URL('https://*.public.blob.vercel-storage.com/**'),
    ],
  },
};
```

**Note:** The Vercel Blob URL format is `https://<store-id>.public.blob.vercel-storage.com/<path>`. The wildcard pattern `*.public.blob.vercel-storage.com` covers all store IDs. [CITED: vercel.com/docs/vercel-blob/public-storage]

### Pattern 7: BOQ Progress Columns Extension

**What:** Add `% Tamamlanan` and `<Progress>` to the existing `BoqTable` without rebuilding it. Math is `approvedQty / plannedQty * 100`.

```typescript
// Extend BoqTable.tsx — add two columns after col_approved_qty
// Progress bar color mirrors existing balanceColorClass logic but for completion direction
function progressColorClass(pct: number): string {
  if (pct >= 90) return 'text-[hsl(142_76%_36%)]'; // success — nearly done
  if (pct <= 10 && pct > 0) return 'text-[hsl(38_92%_50%)]'; // warning — barely started
  return ''; // default accent via Progress component
}

// UI-SPEC: progress bar fill uses --primary (0–89%), success (90–100%), warning (≤10%)
// <Progress value={completionPct} className="min-w-[80px] h-2" />
const completionPct = planned > 0 ? Math.min((approved / planned) * 100, 100) : 0;
```

### Pattern 8: Paginated Submissions Query (Kayıtlar)

**What:** Server Action fetching submissions with status filter, newest-first, paginated at 25 per page.

```typescript
// src/actions/submissions.ts (new)
export async function getSubmissions(
  projectId: string,
  { status, page = 1, pageSize = 25 }: { status?: string; page?: number; pageSize?: number }
) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const conditions = [eq(submissions.projectId, projectId)];
  if (status && status !== 'all') {
    conditions.push(eq(submissions.status, status as 'pending_audit' | 'approved' | 'rejected'));
  }

  const offset = (page - 1) * pageSize;

  const [rows, [{ count: total }]] = await Promise.all([
    db.select({ ...submissionsFields, boqMaterial: boqItems.material })
      .from(submissions)
      .leftJoin(boqItems, eq(submissions.boqItemId, boqItems.id))
      .where(and(...conditions))
      .orderBy(desc(submissions.submittedAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(submissions)
      .where(and(...conditions)),
  ]);

  return { rows, total: Number(total), page, pageSize, pageCount: Math.ceil(Number(total) / pageSize) };
}
```

### Anti-Patterns to Avoid

- **Importing from `'react-map-gl'` (not `'react-map-gl/mapbox'`):** In v8, the default export from `'react-map-gl'` is ambiguous. For mapbox-gl >= 3.5, always import from `'react-map-gl/mapbox'`. Using the wrong path gives wrong types and may fail at runtime. [CITED: visgl.github.io/react-map-gl/docs/whats-new]
- **Using `<Marker>` components for hundreds of points:** Individual React `<Marker>` components mount DOM nodes per point and re-render with React. Use `<Source>`/`<Layer>` (circle layer) for bulk points — GPU-accelerated, does not re-render React tree on map interaction.
- **`mapRef.current.fitBounds()` without `getMap()`:** MapRef exposes only "safe" React-binding methods. To call `fitBounds`, use `mapRef.current.getMap().fitBounds(...)`. Calling it directly on `mapRef.current` throws TypeScript errors and may not exist.
- **Forgetting `mapbox-gl/dist/mapbox-gl.css`:** Without this import, the map container, popup close button, navigation controls, and markers render with broken layout. The CSS must be imported in the `'use client'` map component file.
- **`transpilePackages: ['mapbox-gl']` conflicts with `serverExternalPackages`:** Do not add `mapbox-gl` to `transpilePackages` if it is already in (or needs to be in) `serverExternalPackages`. These two config arrays conflict in Next.js/Turbopack. Mapbox GL is a client-only package and does not need to appear in either.
- **Returning WKB hex directly from Drizzle geometry columns:** Without `ST_AsGeoJSON()`, Drizzle returns raw WKB hex strings for geometry columns. The map component expects GeoJSON objects. Always wrap geometry column reads in `sql\`ST_AsGeoJSON(${col})\`` on the server.
- **Passing non-serializable objects as RSC → Client props:** GeoJSON objects (plain JS objects) are serializable. Do not pass Drizzle row objects or Date instances — convert dates to ISO strings or numbers before passing to `'use client'` components.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Route bounding box for fitBounds | Custom bbox loop | Derive from `ST_Extent(geom)` in SQL or compute min/max from `coordinates` array server-side | `ST_Extent` available; coordinate min/max is 3 lines of JS |
| BOQ progress % math | New formula | `approvedQty / plannedQty * 100` with existing `remainingBalance()` | `boq-balance.ts` already exists |
| Pagination UI | Custom prev/next | shadcn `<Button>` primitive for prev/next; page count computed from `Math.ceil(total/pageSize)` | No shadcn pagination component needed; plain buttons |
| Color-blind palette | Custom palette algorithm | Fixed 6-slot hex palette from UI-SPEC (hardcoded in `MapView.tsx`) | UI-SPEC decided the values |
| Marker click → popup state | Custom event bus | `onClick` on `<Map>` with `interactiveLayerIds` + `useState` for popup coords | react-map-gl built-in layer click event |
| WKB → GeoJSON conversion | Hand-parse WKB hex | `ST_AsGeoJSON(col)` in SQL expression | PostGIS native; `wkx` already installed as fallback |
| Data-driven marker color | Per-marker JSX styling | Mapbox GL `match` expression in `circle-color` paint | GPU-side; no React re-renders per color update |

**Key insight:** Mapbox GL JS's data-driven styling expressions replace the entire category of "map state driving React re-renders" — palette, anomaly indicator, and even overflow numbering all live in GL expressions or as feature properties, not in React state.

---

## Common Pitfalls

### Pitfall 1: Turbopack Worker Teardown (DEV ONLY)

**What goes wrong:** Running `next dev --turbopack` (the project's default dev script: `"dev": "next dev --turbopack"`) causes mapbox-gl's internal Web Worker to be torn down by Turbopack's HMR system. The map renders a blank tile or never loads tiles. Cluster features never appear (if any).

**Why it happens:** Turbopack does not recognize Mapbox GL's worker "ping" HMR message and tears down the worker. This is a known upstream issue (vercel/next.js#86495) affecting mapbox-gl and maplibre-gl.

**How to avoid:** During development, run `next dev` (webpack mode) instead: `npm run dev -- --no-turbopack` or temporarily change the dev script. Production builds are unaffected.

**Warning signs:** Map container renders (grey or blank), browser console shows repeated worker errors, tiles never appear, only happening in `next dev --turbopack`.

### Pitfall 2: Wrong react-map-gl Import Path

**What goes wrong:** `import Map from 'react-map-gl'` works in older versions but in v8 you get wrong types or runtime failures.

**Why it happens:** v8 separates endpoints by map library backend. The generic import path behavior changed.

**How to avoid:** Always use `import Map, { Source, Layer, Popup } from 'react-map-gl/mapbox'` for the mapbox-gl backend. [CITED: visgl.github.io/react-map-gl/docs/whats-new]

**Warning signs:** TypeScript errors about missing `mapboxAccessToken` prop; map styles don't apply correctly.

### Pitfall 3: `mapbox-gl/dist/mapbox-gl.css` Not Imported

**What goes wrong:** Map renders without controls, popup styling is broken, zoom buttons are invisible or mispositioned.

**Why it happens:** The map CSS is a peer requirement — it's not auto-injected.

**How to avoid:** Import `'mapbox-gl/dist/mapbox-gl.css'` inside the `'use client'` map component file (not in `app/layout.tsx` — that runs server-side first and Next.js may not resolve it for client bundles).

**Warning signs:** Map canvas renders correctly but controls (zoom buttons, compass) are invisible or floating incorrectly; popup appears as unstyled text.

### Pitfall 4: `ST_AsGeoJSON` Omitted on Geometry Read

**What goes wrong:** Server Action returns raw WKB hex string for `routes.geom` or `submissions.snappedPoint`. Passing this to react-map-gl's `<Source data={...}>` causes it to fail silently (invalid GeoJSON).

**Why it happens:** Drizzle's `geometry()` column type returns the database's native binary representation (WKB hex) unless explicitly wrapped in `ST_AsGeoJSON()`.

**How to avoid:** Always select geometry columns as `sql\`ST_AsGeoJSON(${submissions.snappedPoint})\`` and `JSON.parse()` the result. See Pattern 4 above.

**Warning signs:** `<Source>` renders no features; no console error (Mapbox silently ignores invalid data).

### Pitfall 5: Non-Serializable Props Passed to Client Component

**What goes wrong:** Passing `Date` objects, `BigInt`, or Drizzle row objects directly from an RSC to a `'use client'` map or table component throws a Next.js serialization error.

**Why it happens:** RSC → Client prop serialization uses JSON-like rules; only plain objects, strings, numbers, booleans, arrays are safe.

**How to avoid:** Convert `Date` to `.toISOString()` or timestamp number. Convert Drizzle `numeric` strings to `Number()`. Keep all conversions in the Server Action before returning.

**Warning signs:** "Props from Server Component to Client Component must be serializable" error in Next.js dev overlay.

### Pitfall 6: BOQ Palette Slot Assignment Must Be Stable

**What goes wrong:** If the palette slot is assigned based on array index in the query result (which may be unordered), the same BOQ item gets a different color on each page reload.

**Why it happens:** SQL query result order is non-deterministic without ORDER BY.

**How to avoid:** Assign palette slots by `boq_items.sort_order` (which is set at import time, already used in `getBoqItems`). Build a `Map<boqItemId, slotIndex>` server-side from the ordered BOQ items list, then annotate features with their slot index as a property. [ASSUMED — based on D-58 specification that "stable creation-order" is required]

**Warning signs:** Map legend color ↔ material mapping changes between refreshes; colors inconsistent with the Kayıtlar table color references.

### Pitfall 7: Mapbox Token Not Restricted Before External Sharing (D-62)

**What goes wrong:** A Mapbox token with no URL restrictions is billable by anyone who finds it in the page source. Mapbox public tokens are readable in the browser.

**Why it happens:** `NEXT_PUBLIC_MAPBOX_TOKEN` is intentionally public (required for client-side map rendering). Without URL restrictions in the Mapbox account dashboard, the token works from any origin.

**How to avoid:** Before sharing any dashboard URL externally: log into `account.mapbox.com`, open the token, add URL restriction `https://bayrak.ai/*` (and `https://www.bayrak.ai/*` if applicable). Token needs scopes `styles:read` + `fonts:read` for GL JS. Token must NOT have `no-referrer` Referrer-Policy to work with restrictions. [CITED: docs.mapbox.com/accounts/guides/tokens/]

**Warning signs:** No immediate warning; billing anomaly detected later. SC4 is not met until restriction is applied.

---

## Code Examples

### BOQ Palette Slot Map (server-side, stable order)

```typescript
// Source: D-58 specification — stable creation-order
// boqItemsOrdered is the result of getBoqItems() which uses .orderBy(boqItems.sortOrder)
const paletteSlotMap = new Map(
  boqItemsOrdered.map((item, idx) => [item.id, idx % 6])
);
// idx % 6 handles overflow — features beyond slot 5 cycle back to slot 0
// A numbered superscript (Math.floor(idx / 6) + 1) is appended for distinguishability (D-58)
```

### Approved Points as GeoJSON FeatureCollection (server-side)

```typescript
// Source: Pattern 4 above; D-46 query criteria
const pointRows = await db
  .select({
    id: submissions.id,
    snappedPointJson: sql<string>`ST_AsGeoJSON(${submissions.snappedPoint})`,
    locationWarning: submissions.locationWarning,
    locationDistanceM: submissions.locationDistanceM,
    boqItemId: submissions.boqItemId,
    quantity: submissions.quantity,
    photoUrl: submissions.photoUrl,
    status: submissions.status,
    decidedAt: submissions.decidedAt,
  })
  .from(submissions)
  .where(and(
    eq(submissions.projectId, projectId),
    eq(submissions.status, 'approved'),
    isNotNull(submissions.snappedPoint),
  ));

const featureCollection: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: pointRows
    .filter(r => r.snappedPointJson)
    .map(r => ({
      type: 'Feature',
      geometry: JSON.parse(r.snappedPointJson!),
      properties: {
        id: r.id,
        boqItemId: r.boqItemId,
        boqPaletteSlot: paletteSlotMap.get(r.boqItemId) ?? 0,
        locationWarning: r.locationWarning ?? false,
        locationDistanceM: r.locationDistanceM ? Number(r.locationDistanceM) : null,
        quantity: Number(r.quantity),
        photoUrl: r.photoUrl,
        status: r.status,
        decidedAt: r.decidedAt?.toISOString() ?? null,
      },
    })),
};
```

### Route LineString Bounds for fitBounds

```typescript
// Source: Pattern 1 — deriving bounds from coordinates array
function getLinestringBounds(coords: [number, number][]): [[number, number], [number, number]] {
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)], // SW
    [Math.max(...lngs), Math.max(...lats)], // NE
  ];
}
// Usage in onLoad callback:
// mapRef.current.getMap().fitBounds(bounds, { padding: 48, animate: false });
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `import Map from 'react-map-gl'` | `import Map from 'react-map-gl/mapbox'` | react-map-gl v8 (2024) | Wrong import = wrong types and potential runtime failures |
| `mapRef.current.fitBounds()` | `mapRef.current.getMap().fitBounds()` | react-map-gl v8 | Direct MapRef no longer exposes all Mapbox Map methods |
| `@types/mapbox-gl` separate package | Still needed for v3 | mapbox-gl v3 | Official types in mapbox-gl v3 not fully replacing DefinitelyTyped types for react-map-gl patterns |
| `images.remotePatterns` with `hostname` string | `new URL(...)` pattern | Next.js 14+ | URL object syntax is preferred; both work |

**Deprecated/outdated:**
- `react-map-gl/mapbox-legacy`: For `mapbox-gl` v1/v2 only. This project uses v3.24 — use `react-map-gl/mapbox`.
- `react-map-gl/maplibre`: For MapLibre GL JS. Not relevant for this project (mapbox-gl locked).
- Individual `<Marker>` components for bulk data: Viable for < 20 markers; for approved submissions at scale use `<Layer>` circle type.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Palette slot stability relies on `boq_items.sort_order` for stable BOQ item ordering | Pattern 4, Pitfall 6 | Colors flip between page loads; user confusion; not a data error |
| A2 | `mapRef.current.getMap().fitBounds()` is the correct API for v8 `MapRef` | Pattern 1 | `fitBounds` call throws TypeScript error or does nothing; need to find alternative MapRef method |
| A3 | Turbopack issue affects mapbox-gl in addition to maplibre-gl | Pitfall 1 | If only maplibre-gl is affected, no workaround needed for dev; but `next dev` (webpack) still works |
| A4 | `circle` layer `filter` expression `['==', ['get', 'locationWarning'], true]` works on boolean feature properties | Pattern 2 | Anomaly ring layer shows no rings; may need integer 1/0 instead of boolean |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

*(4 assumptions — all low-risk and easily corrected during implementation)*

---

## Open Questions (RESOLVED)

1. **Should `force-dynamic` go on `[id]/page.tsx` or on individual tab Server Components?** — **RESOLVED** (Plan 06): `export const dynamic = 'force-dynamic'` goes on the PAGE segment (`[id]/page.tsx`), not on leaf tab components. Plan 06's `<interfaces>` block locks this in (D-55 alignment).
   - What we know: `export const dynamic = 'force-dynamic'` on a page disables caching for that page and all its Server Component children.
   - What's unclear: Whether putting it on the leaf tab components (e.g., `BoqTab`) instead of the page is sufficient, or whether it needs to be on the page to affect `router.refresh()` behavior.
   - Recommendation: Put it on `[id]/page.tsx` (the page segment) — this is the most reliable location and ensures the entire page route is uncached. [ASSUMED — based on Next.js route segment config docs]

2. **Filter chips: URL search param state vs. React `useState`?** — **RESOLVED** (Plan 04): use a URL search param (`?status=`). `KayitlarTabClient` reads `searchParams` and navigates on filter change, matching the existing `?tab=` URL-state pattern.
   - What we know: Other tabs use URL state (`?tab=`). Filter chips are within Kayıtlar tab content.
   - What's unclear: Whether the active status filter should be a URL search param (`?status=approved`) or local React state in `KayitlarTabClient`.
   - Recommendation: Use URL search param (`?status=`) so filter state survives page refresh and is shareable. This means `KayitlarTabClient` reads `searchParams` and navigates on filter change. [ASSUMED — matches existing URL-state tab pattern; planner should confirm]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build + dev | ✓ | v24.13.0 | — |
| npm | Package install | ✓ | 11.6.2 | — |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Map rendering | unknown at research time | — | Map shows empty state; dev can use a free Mapbox account token |
| Vercel Blob public store | Photo thumbnails | ✓ (already used in Phase 3) | @vercel/blob 2.4.x | — |
| PostGIS `ST_AsGeoJSON` | Route + points read | ✓ (PostGIS already enabled, confirmed Phase 1) | Neon PostGIS bundled | — |
| `mapbox-gl` | Map rendering | ✗ (not yet installed) | — | Install in Wave 0 |
| `react-map-gl` | Map React wrapper | ✗ (not yet installed) | — | Install in Wave 0 |
| `@types/mapbox-gl` | TypeScript types | ✗ (not yet installed) | — | Install in Wave 0 |

**Missing dependencies with no fallback:**
- `NEXT_PUBLIC_MAPBOX_TOKEN` — must be set in `.env.local` before map development. Free Mapbox account token works for dev.

**Missing dependencies with fallback:**
- `mapbox-gl`, `react-map-gl`, `@types/mapbox-gl` — must be npm-installed in Wave 0; this is already planned.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.x |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| DASH-01 | Route GeoJSON read-back from PostGIS returns valid GeoJSON LineString | unit | `npx vitest run tests/submissions.test.ts` | New — `getRouteGeoJSON` server action |
| DASH-02 | Approved points FeatureCollection — only `snapped_point IS NOT NULL` + `status='approved'` | unit | `npx vitest run tests/submissions.test.ts` | New — `getApprovedPoints` query |
| DASH-03 | `getSubmissions` filter by status returns only matching rows; pagination `OFFSET`/`LIMIT` correct | unit | `npx vitest run tests/submissions.test.ts` | New test file |
| DASH-04 | BOQ progress `%` is `approvedQty / plannedQty * 100`, capped at 100 | unit | `npx vitest run tests/boq.test.ts` | Extend existing boq.test.ts |
| DASH-05 | `dynamic = 'force-dynamic'` — manual smoke test only; no automated way to assert RSC cache behavior | smoke/manual | — | Manual only: confirm fresh data after mutation |

**Map rendering (DASH-01, DASH-02):** react-map-gl + canvas rendering cannot be unit-tested in vitest's node environment without heavy mocking. The data layer (server actions, GeoJSON shape) is unit-testable; the visual rendering is manually verified.

### Sampling Rate
- **Per task commit:** `npx vitest run tests/submissions.test.ts tests/boq.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/submissions.test.ts` — covers DASH-01, DASH-02, DASH-03 (new server actions)
- [ ] `tests/boq.test.ts` extension — add tests for progress % calculation edge cases (0%, 100%+, null planned)

*(Existing test infrastructure: vitest.config.ts, tests/setup.ts, tests/fixtures/ — no new framework setup needed)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `auth()` check at top of every server action (established project pattern) |
| V3 Session Management | yes | Auth.js v5 session (established) |
| V4 Access Control | yes | Tenant-scoped queries with `getDefaultTenantId()` (established pattern) |
| V5 Input Validation | yes | `status` filter: validate against enum `['pending_audit','approved','rejected','all']` before using in query; `page` must be positive integer |
| V6 Cryptography | no | No new crypto surface |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via status filter | Tampering | Whitelist-validate `status` before passing to Drizzle `eq()` — never string-interpolate into SQL |
| SQL injection via page/pageSize | Tampering | Parse as integer with `parseInt()`, clamp to valid range before use in `LIMIT`/`OFFSET` |
| Mapbox token abuse (no domain restriction) | Elevation of Privilege | D-62: restrict token to `bayrak.ai` domain in Mapbox account dashboard before external sharing; explicit planning checklist item |
| next/image SSRF via unconstrained `remotePatterns` | Tampering | Restrict `remotePatterns` to `*.public.blob.vercel-storage.com` only — not a wildcard `**` across all domains |
| Photo URL injection in Popup (XSS) | Tampering | Use `next/image` with `src={photoUrl}` — Next.js validates against `remotePatterns`, blocks off-domain URLs |

---

## Sources

### Primary (HIGH confidence)

- [CITED: visgl.github.io/react-map-gl/docs/whats-new] — v8 import path change (`react-map-gl/mapbox`)
- [CITED: visgl.github.io/react-map-gl/docs/upgrade-guide] — v7→v8 breaking changes, TypeScript type renames
- [CITED: visgl.github.io/react-map-gl/docs/api-reference/mapbox/map] — Map props: `mapboxAccessToken`, `interactiveLayerIds`, `onClick`, `onLoad`, `MapRef.getMap().fitBounds()`
- [CITED: visgl.github.io/react-map-gl/docs/api-reference/mapbox/popup] — Popup props: `longitude`, `latitude`, `anchor`, `onClose`, `maxWidth`
- [CITED: docs.mapbox.com/mapbox-gl-js/example/data-driven-circle-colors/] — `match` expression for data-driven circle color
- [CITED: vercel.com/docs/vercel-blob/public-storage] — Blob URL format `*.public.blob.vercel-storage.com`, `remotePatterns` with `new URL()`
- [CITED: docs.mapbox.com/accounts/guides/tokens/] — URL restrictions, scopes (`styles:read`, `fonts:read`), referrer policy requirements
- [CITED: buildui.com/recipes/refresh-react-server-component-on-focus] — `RefreshOnFocus` pattern with `window.addEventListener('focus', refresh)`
- [CITED: orm.drizzle.team/docs/guides/postgis-geometry-point] — `sql\`\`` escape hatch for PostGIS functions in Drizzle
- [VERIFIED: npm registry] — `mapbox-gl@3.24.0` (published 2026-05-18, no postinstall), `react-map-gl@8.1.1` (10.6yr old package, no postinstall), `@types/mapbox-gl@3.5.0`

### Secondary (MEDIUM confidence)

- [github.com/vercel/next.js/issues/86495] — Turbopack drops mapbox/maplibre inline worker in dev; workaround: `next dev` (webpack)
- [nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages] — `transpilePackages` conflicts with `serverExternalPackages` in same config

### Tertiary (LOW confidence — training knowledge, not fully re-verified)

- Layer ordering (anomaly ring behind BOQ circle): standard Mapbox GL JS behavior — layers rendered in declaration order, last = topmost. [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — packages verified on npm registry; import paths confirmed via official docs
- Architecture: HIGH — RSC/client boundaries, ST_AsGeoJSON pattern, force-dynamic all confirmed via official sources
- Pitfalls: HIGH (Turbopack issue: MEDIUM — confirmed for maplibre, extrapolated to mapbox-gl; others HIGH from official docs)

**Research date:** 2026-05-24
**Valid until:** 2026-06-24 (react-map-gl and mapbox-gl release frequently; re-verify exact versions before install)
