# Phase 5: Dashboard & Map - Pattern Map

**Mapped:** 2026-05-24
**Files analyzed:** 11 new/modified files
**Analogs found:** 10 / 11

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/actions/submissions.ts` | service | CRUD + request-response | `src/actions/boq.ts` | exact |
| `src/actions/routes.ts` (extend) | service | CRUD + request-response | `src/actions/routes.ts` (self) | exact |
| `src/components/dashboard/MapView.tsx` | component | event-driven | `src/components/dashboard/RouteTabClient.tsx` | role-match (client boundary) |
| `src/components/dashboard/RouteTab.tsx` (extend) | component | request-response | `src/components/dashboard/RouteTab.tsx` (self) | exact |
| `src/components/dashboard/RouteTabClient.tsx` (extend) | component | event-driven | `src/components/dashboard/RouteTabClient.tsx` (self) | exact |
| `src/components/dashboard/KayitlarTab.tsx` | component | request-response | `src/components/dashboard/BoqTab.tsx` | exact |
| `src/components/dashboard/KayitlarTabClient.tsx` | component | event-driven | `src/components/dashboard/BoqTable.tsx` | role-match |
| `src/components/dashboard/RefreshOnFocus.tsx` | utility | event-driven | `src/components/dashboard/RouteTabClient.tsx` | partial |
| `src/components/dashboard/BoqTable.tsx` (extend) | component | CRUD | `src/components/dashboard/BoqTable.tsx` (self) | exact |
| `src/app/dashboard/projects/[id]/page.tsx` (extend) | route | request-response | `src/app/dashboard/projects/[id]/page.tsx` (self) | exact |
| `next.config.ts` (extend) | config | — | `next.config.ts` (self) | exact |
| `tests/submissions.test.ts` | test | CRUD | `tests/boq.test.ts` | exact |

---

## Pattern Assignments

### `src/actions/submissions.ts` (service, CRUD + request-response)

**Analog:** `src/actions/boq.ts` and `src/actions/routes.ts`

**Imports pattern** (`src/actions/boq.ts` lines 1–22):
```typescript
'use server';

import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { submissions } from '@/db/schema/submissions';
import { boqItems } from '@/db/schema/boq-items';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';
```

**Auth guard pattern** (`src/actions/boq.ts` lines 149–151):
```typescript
export async function getBoqItems(projectId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  // ...
}
```

**Paginated read with join pattern** (`src/actions/boq.ts` lines 148–157 as structural model; see Research Pattern 8 for the paginated query):
```typescript
// getSubmissions: filter + paginate + join boq_items for material name
export async function getSubmissions(
  projectId: string,
  { status, page = 1, pageSize = 25 }: { status?: string; page?: number; pageSize?: number }
) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const conditions = [eq(submissions.projectId, projectId)];
  if (status && status !== 'all') {
    const VALID_STATUSES = ['pending_audit', 'approved', 'rejected'] as const;
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      throw new Error('Invalid status filter');  // V5: whitelist validation
    }
    conditions.push(eq(submissions.status, status as 'pending_audit' | 'approved' | 'rejected'));
  }

  const offset = Math.max(0, (Math.floor(page) - 1) * pageSize); // V5: clamp

  const [rows, [{ count: total }]] = await Promise.all([
    db.select({ /* selected fields */ })
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

**ST_AsGeoJSON read-back pattern** (`src/lib/spatial.ts` line 97 + `src/db/schema/routes.ts` line 12 as precedent; `tests/postgis.test.ts` lines 73–89):
```typescript
// getApprovedPoints: approved submissions with snapped_point as GeoJSON
// Route: same sql`` escape-hatch used in snapToRoute (spatial.ts line 97)
import { sql, eq, and, isNotNull } from 'drizzle-orm';

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
  })
  .from(submissions)
  .where(and(
    eq(submissions.projectId, projectId),
    eq(submissions.status, 'approved'),
    isNotNull(submissions.snappedPoint),   // D-46
  ));
```

**getRouteGeoJSON pattern** (extends `src/actions/routes.ts` line 64):
```typescript
// Extend existing getRoute to also return the geometry as GeoJSON
// Mirror the ST_AsGeoJSON pattern from tests/postgis.test.ts line 89
export async function getRouteGeoJSON(projectId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const { eq } = await import('drizzle-orm');
  const result = await db
    .select({
      id: routes.id,
      coordinateCount: routes.coordinateCount,
      uploadedAt: routes.uploadedAt,
      geomJson: sql<string>`ST_AsGeoJSON(${routes.geom})`,
    })
    .from(routes)
    .where(eq(routes.projectId, projectId))
    .limit(1);

  if (!result[0]) return null;
  const geojson = JSON.parse(result[0].geomJson);   // { type: 'LineString', coordinates: [...] }
  return { ...result[0], geojson };
}
```

---

### `src/actions/routes.ts` (extend — add `getRouteGeoJSON`)

**Analog:** `src/actions/routes.ts` (self, lines 64–80)

**Core extension pattern** (lines 64–80, add `geomJson` column alongside existing select):
```typescript
// Existing getRoute pattern to copy for the extended getRouteGeoJSON variant:
export async function getRoute(projectId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const { eq } = await import('drizzle-orm');
  const result = await db
    .select({
      id: routes.id,
      coordinateCount: routes.coordinateCount,
      uploadedAt: routes.uploadedAt,
      // Phase 5 addition: read geom as GeoJSON string
      // geomJson: sql<string>`ST_AsGeoJSON(${routes.geom})`,
    })
    .from(routes)
    .where(eq(routes.projectId, projectId))
    .limit(1);

  return result[0] ?? null;
}
```

Note: The existing `routes.ts` already uses top-level `import { sql } from 'drizzle-orm'` (line 14). The `sql`` `` template pattern for geometry is confirmed by `tests/postgis.test.ts` lines 73–89 and the existing `snapToRoute` in `src/lib/spatial.ts` line 97. The `geomLinestring` custom type uses `fromDriver(v) { return v; }` (routes.ts line 18) — meaning Drizzle returns raw WKB or a driver string, not parsed GeoJSON. `ST_AsGeoJSON()` is mandatory.

---

### `src/components/dashboard/MapView.tsx` (component, event-driven, `'use client'`)

**Analog:** `src/components/dashboard/RouteTabClient.tsx` (client boundary pattern)

**`'use client'` + imports pattern** (`src/components/dashboard/RouteTabClient.tsx` lines 1–14):
```typescript
'use client';

// RouteTabClient.tsx uses useState + useTranslations at the top.
// MapView.tsx will use useState + useCallback + useRef + useTranslations.
import { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
// react-map-gl v8: ALL imports from 'react-map-gl/mapbox' (not 'react-map-gl')
import Map, { Source, Layer, Popup } from 'react-map-gl/mapbox';
import type { MapRef, LayerProps, MapLayerMouseEvent } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css'; // MUST — map invisible without this
```

**Props interface pattern** (`src/components/dashboard/RouteTabClient.tsx` lines 17–23):
```typescript
// RouteTabClient.tsx defines explicit typed interface for server-passed props.
// MapView.tsx will follow the same interface pattern.
interface MapViewProps {
  routeGeoJSON: GeoJSON.LineString | null;      // from getRouteGeoJSON(), pre-parsed
  approvedPoints: GeoJSON.FeatureCollection;    // from getApprovedPoints(), pre-built
  boqLegend: Array<{ id: string; material: string; paletteSlot: number }>; // for legend
}
```

**State initialization from props** (`src/components/dashboard/RouteTabClient.tsx` lines 30–32):
```typescript
// Pattern: initialize state from prop on mount, no useEffect needed for static init.
// RouteTabClient: const [savedRoute, setSavedRoute] = useState(existingRoute);
// MapView: const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null);
```

**onClick → popup state pattern** (Research Pattern 3):
```typescript
const handleMapClick = useCallback((event: MapLayerMouseEvent) => {
  const feature = event.features?.[0];
  if (!feature || feature.geometry.type !== 'Point') return;
  const coords = feature.geometry.coordinates as [number, number];
  setPopupInfo({
    lng: coords[0],
    lat: coords[1],
    ...feature.properties,
  });
}, []);
```

**fitBounds on load** (Research Pattern 1):
```typescript
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

**Empty state pattern** (`src/components/dashboard/RouteTabClient.tsx` lines 79–86):
```typescript
// RouteTabClient returns early with upload zone when no route.
// MapView follows same pattern: return <EmptyState> when routeGeoJSON is null.
if (!routeGeoJSON) {
  return (
    <div className="text-sm text-muted-foreground">
      {t('empty_no_route')} {/* i18n key — no hardcoded string */}
    </div>
  );
}
```

---

### `src/components/dashboard/RouteTab.tsx` (extend — pass map data props)

**Analog:** `src/components/dashboard/RouteTab.tsx` (self, all lines)

**Full current file pattern** (lines 1–33):
```typescript
import { getTranslations } from 'next-intl/server';
import { getRoute } from '@/actions/routes';
import { RouteTabClient } from './RouteTabClient';

export async function RouteTab({ projectId }: RouteTabProps) {
  const t = await getTranslations('dashboard.route');
  const existingRoute = await getRoute(projectId);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{t('title')}</h2>
      <RouteTabClient
        projectId={projectId}
        existingRoute={existingRoute}
      />
    </div>
  );
}
```

**Extension:** add `getRouteGeoJSON` and `getApprovedPoints` fetches; pass to `RouteTabClient`. Follow the same `Promise.all` parallel-fetch pattern used in `[id]/page.tsx` lines 28–33.

**Date serialization rule** (from Research anti-patterns): convert `existingRoute.uploadedAt` (`Date`) to `uploadedAt: existingRoute.uploadedAt.toISOString()` before passing to client component. Current code passes `Date` directly — this must be fixed when adding map props.

---

### `src/components/dashboard/RouteTabClient.tsx` (extend — mount MapView)

**Analog:** `src/components/dashboard/RouteTabClient.tsx` (self, all lines)

**Client boundary + conditional render pattern** (lines 1–93):
```typescript
'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RouteUpload } from './RouteUpload';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
// Phase 5 addition: import MapView

// Extension: when savedRoute exists, render MapView instead of the metadata card.
// Keep the upload control visible below the map as a collapsible secondary action (D-49).
if (savedRoute && !isReplacing) {
  return (
    <div className="space-y-4">
      <MapView routeGeoJSON={...} approvedPoints={...} boqLegend={...} />
      <Button variant="outline" ...>{t('replace_route')}</Button>
    </div>
  );
}
```

---

### `src/components/dashboard/KayitlarTab.tsx` (new Server Component)

**Analog:** `src/components/dashboard/BoqTab.tsx` (lines 1–30) — exact match: thin server component that fetches + delegates.

**Full BoqTab pattern to copy** (lines 1–30):
```typescript
/**
 * KayitlarTab.tsx
 *
 * Submissions list tab — Server Component.
 * Fetches submissions with default params and passes to KayitlarTabClient.
 * D-53, D-54: shadcn Table, filter chips, pagination.
 */

import { getTranslations } from 'next-intl/server';
import { getSubmissions } from '@/actions/submissions';
import { KayitlarTabClient } from './KayitlarTabClient';

interface KayitlarTabProps {
  projectId: string;
  searchParams: { status?: string; page?: string };  // passed from page.tsx
}

export async function KayitlarTab({ projectId, searchParams }: KayitlarTabProps) {
  const t = await getTranslations('dashboard.submissions');

  const status = searchParams.status ?? 'all';
  const page = parseInt(searchParams.page ?? '1', 10);

  const data = await getSubmissions(projectId, { status, page, pageSize: 25 });

  return (
    <KayitlarTabClient
      projectId={projectId}
      initialData={data}
      initialStatus={status}
    />
  );
}
```

---

### `src/components/dashboard/KayitlarTabClient.tsx` (new `'use client'` component)

**Analog:** `src/components/dashboard/BoqTable.tsx` (all lines) — same shadcn Table + `useTranslations` + `tabular-nums` pattern.

**Imports pattern** (`src/components/dashboard/BoqTable.tsx` lines 1–43):
```typescript
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
// For photo thumbnails (D-61):
import Image from 'next/image';
// For location link (Phase 3 pattern from bot-audit.ts line 164):
// https://maps.google.com/?q=${locationLat},${locationLon}
import { ExternalLink } from 'lucide-react';
```

**`tabular-nums` + locale number format pattern** (`src/components/dashboard/BoqTable.tsx` lines 60–66):
```typescript
// Established project pattern — copy directly.
const trFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });

function formatQty(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return '—';
  return trFmt.format(n);
}
// TableCell usage: className="text-right tabular-nums"
```

**`useTranslations` dual namespace pattern** (`src/components/dashboard/BoqTable.tsx` lines 85–87):
```typescript
// BoqTable uses two translation namespaces. KayitlarTabClient does the same.
const t = useTranslations('dashboard.submissions');
const tc = useTranslations('common');
```

**Google Maps link pattern** (`src/lib/bot-audit.ts` lines 163–165):
```typescript
// Phase 3 established pattern — reuse exactly for location column (D-53).
`https://maps.google.com/?q=${submission.locationLat},${submission.locationLon}`
// In JSX: <a href={...} target="_blank" rel="noopener noreferrer">
//           <ExternalLink className="h-4 w-4" />
//         </a>
```

**Filter chip state pattern** — use URL search params (`?status=`) matching the existing `?tab=` URL-state pattern from `[id]/page.tsx` lines 17–36. KayitlarTabClient reads the `status` and `page` props (passed from KayitlarTab server component) rather than maintaining local state. Navigation calls `router.push` or `router.replace` with updated params.

**Shadcn Dialog lightbox pattern** (`src/components/dashboard/BoqTable.tsx` lines 184–200):
```typescript
// BoqTable uses Dialog for delete confirmation. KayitlarTabClient uses Dialog for photo lightbox.
// Same Dialog open/close pattern:
const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

<Dialog open={!!lightboxUrl} onOpenChange={(open) => { if (!open) setLightboxUrl(null); }}>
  <DialogContent className="max-w-3xl">
    {lightboxUrl && (
      <Image src={lightboxUrl} alt="..." width={800} height={600} style={{ objectFit: 'contain' }} />
    )}
  </DialogContent>
</Dialog>
```

---

### `src/components/dashboard/RefreshOnFocus.tsx` (new `'use client'` utility)

**Analog:** `src/components/dashboard/RouteTabClient.tsx` (client boundary pattern) — partial match (no direct analog; based on Research Pattern 5).

**Pattern** (Research Pattern 5 — verified against Next.js App Router docs):
```typescript
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
  return null;  // renders nothing — pure side-effect component
}
```

Mount once inside the page Client wrapper — applies to all tabs automatically. Pattern mirrors how `RouteUpload.tsx` is imported into `RouteTabClient.tsx` as a pure-behavior sub-component.

---

### `src/components/dashboard/BoqTable.tsx` (extend — add progress columns)

**Analog:** `src/components/dashboard/BoqTable.tsx` (self, all lines) — extend, do not replace.

**`balanceColorClass` to extend for progress direction** (lines 77–82):
```typescript
// Existing pattern — copy the threshold logic but invert direction for completion:
function balanceColorClass(balance: number, planned: number): string {
  if (balance <= 0) return 'text-destructive';
  const pct = planned > 0 ? balance / planned : 0;
  if (pct <= 0.1) return 'text-[hsl(38_92%_50%)]'; // warning
  return 'text-[hsl(142_76%_36%)]'; // success
}

// New progressColorClass for % Tamamlanan (completion direction):
function progressColorClass(completionPct: number): string {
  if (completionPct >= 90) return 'text-[hsl(142_76%_36%)]'; // success — nearly done
  if (completionPct > 0 && completionPct <= 10) return 'text-[hsl(38_92%_50%)]'; // warning — barely started
  return ''; // default
}
```

**`remainingBalance` import already in file** (line 41):
```typescript
import { remainingBalance } from '@/lib/boq-balance';
// New: const completionPct = planned > 0 ? Math.min((approved / planned) * 100, 100) : 0;
```

**TableHead insertion point** (lines 115–118 — insert after `col_approved_qty`):
```typescript
// Existing:
<TableHead scope="col" className="w-[120px] text-right">{t('col_approved_qty')}</TableHead>
<TableHead scope="col" className="w-[120px] text-right">{t('col_remaining')}</TableHead>

// After extension (insert between approved_qty and remaining):
<TableHead scope="col" className="w-[120px] text-right">{t('col_approved_qty')}</TableHead>
<TableHead scope="col" className="w-20 text-right">{t('col_completion_pct')}</TableHead>
<TableHead scope="col" className="min-w-[80px]">{/* Progress bar — no header text */}</TableHead>
<TableHead scope="col" className="w-[120px] text-right">{t('col_remaining')}</TableHead>
```

**Progress bar shadcn component** (already installed, see UI-SPEC Component Inventory):
```typescript
import { Progress } from '@/components/ui/progress';
// Usage: <Progress value={completionPct} className="min-w-[80px] h-2" />
```

---

### `src/app/dashboard/projects/[id]/page.tsx` (extend)

**Analog:** `src/app/dashboard/projects/[id]/page.tsx` (self, all lines)

**`force-dynamic` export** (add at top of file — Research Pattern 5):
```typescript
// Add immediately before the Props interface (line 11):
export const dynamic = 'force-dynamic';
```

**Tab registration pattern** (lines 36, 53–71 — add Kayıtlar tab):
```typescript
// Existing pattern:
const activeTab = tab === 'rota' ? 'rota' : tab === 'personel' ? 'personel' : 'boq';

// After extension:
const activeTab =
  tab === 'rota'     ? 'rota'     :
  tab === 'kayitlar' ? 'kayitlar' :
  tab === 'personel' ? 'personel' : 'boq';
```

**TabsTrigger link pattern** (lines 57–70 — copy for Kayıtlar tab):
```typescript
<TabsTrigger value="kayitlar">
  <Link href={`/dashboard/projects/${id}?tab=kayitlar`} className="contents" prefetch={false}>
    {submissionsT('tab_label')}  {/* next-intl — no hardcoded string */}
  </Link>
</TabsTrigger>
```

**TabsContent pattern** (lines 74–89):
```typescript
<TabsContent value="kayitlar" className="pt-12">
  <KayitlarTab projectId={id} searchParams={{ status: statusFilter, page: pageParam }} />
</TabsContent>
```

**RefreshOnFocus placement** — add `<RefreshOnFocus />` inside the JSX return, outside `<Tabs>` but inside the page div, so it applies to all tabs.

**Parallel data fetching pattern** (lines 28–33):
```typescript
// Existing Promise.all pattern — extend by adding submissions/route-GeoJSON fetches
// or defer them to the individual tab Server Components (KayitlarTab, RouteTab).
// Preferred: fetch inside each tab Server Component (established BoqTab pattern) to
// avoid loading map/submissions data when the user is on a different tab.
```

---

### `next.config.ts` (extend — add `images.remotePatterns`)

**Analog:** `next.config.ts` (self, lines 1–10)

**Current config** (lines 1–10):
```typescript
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["grammy", "pg", "ws", "@neondatabase/serverless"],
};

export default withNextIntl(nextConfig);
```

**Extension — add `images.remotePatterns`** (Research Pattern 6 — D-61):
```typescript
const nextConfig: NextConfig = {
  serverExternalPackages: ["grammy", "pg", "ws", "@neondatabase/serverless"],
  // D-61: Required for next/image to optimize Vercel Blob photos in Kayıtlar + map popup.
  // Do NOT add mapbox-gl to transpilePackages — conflicts with serverExternalPackages (Pitfall anti-pattern).
  images: {
    remotePatterns: [
      new URL('https://*.public.blob.vercel-storage.com/**'),
    ],
  },
};
```

---

### `tests/submissions.test.ts` (new test file)

**Analog:** `tests/boq.test.ts` (all lines) — exact match in structure.

**Test file scaffold** (`tests/boq.test.ts` lines 1–28):
```typescript
/**
 * tests/submissions.test.ts
 *
 * DB integration tests for submissions Server Actions (src/actions/submissions.ts).
 * Gated behind describeIfDb — skips cleanly without TEST_DATABASE_URL.
 *
 * Covers DASH-01, DASH-02, DASH-03 (see RESEARCH.md Validation Architecture).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables, seedSpatialFixture } from './fixtures/db';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'test@example.com' } }),
}));
```

**beforeEach/afterEach DB pattern** (`tests/boq.test.ts` lines 49–80):
```typescript
// Use seedSpatialFixture (already in tests/fixtures/db.ts) — it seeds
// tenant + project + BOQ item + person + route row needed for approved-point tests.
beforeEach(async () => {
  db = await getTestDb();
  await truncateAllTables(db);
  await seedSpatialFixture(db);
});

afterEach(async () => {
  await truncateAllTables(db);
});
```

**Test for getApprovedPoints filter** (DASH-02 — mirrors `tests/postgis.test.ts` pattern):
```typescript
it('getApprovedPoints returns only status=approved AND snapped_point IS NOT NULL rows (D-46)', async () => {
  // Insert: one approved+snapped, one approved+no snapped, one pending
  // Assert: only the approved+snapped row appears in result
});
```

**Test for getSubmissions pagination** (DASH-03):
```typescript
it('getSubmissions paginates correctly — page 2 returns offset rows', async () => {
  // Insert pageSize+1 rows, request page 2 → returns 1 row
});

it('getSubmissions rejects invalid status filter', async () => {
  await expect(getSubmissions(projectId, { status: 'invalid' })).rejects.toThrow();
});
```

**BOQ progress extension tests** — add to `tests/boq.test.ts` (extend, do not create a new file):
```typescript
// Extend the existing 'remainingBalance helper' describe block:
it('completion percentage is capped at 100 when over-approved', () => {
  const planned = 100; const approved = 150;
  const pct = Math.min((approved / planned) * 100, 100);
  expect(pct).toBe(100);
});

it('completion percentage is 0 when planned is 0 (division guard)', () => {
  const planned = 0; const approved = 0;
  const pct = planned > 0 ? Math.min((approved / planned) * 100, 100) : 0;
  expect(pct).toBe(0);
});
```

---

## Shared Patterns

### Authentication Guard
**Source:** `src/actions/projects.ts` lines 27–29 (and every other action file)
**Apply to:** `src/actions/submissions.ts` — every exported function
```typescript
const session = await auth();
if (!session) throw new Error('Unauthorized');
```

### Tenant Scoping
**Source:** `src/actions/projects.ts` lines 66–70
**Apply to:** `src/actions/submissions.ts`
```typescript
import { getDefaultTenantId } from '@/lib/tenant';
// Use in where clauses: eq(submissions.tenantId, getDefaultTenantId())
// or scope via projectId (already tenant-scoped through projects table).
```

### next-intl Server Component Translation
**Source:** `src/components/dashboard/RouteTab.tsx` lines 12–13, `src/components/dashboard/PeopleTab.tsx` lines 36–42
**Apply to:** `KayitlarTab.tsx`, extensions to `RouteTab.tsx`
```typescript
import { getTranslations } from 'next-intl/server';
const t = await getTranslations('dashboard.submissions'); // server component
```

### next-intl Client Component Translation
**Source:** `src/components/dashboard/BoqTable.tsx` lines 85–87
**Apply to:** `KayitlarTabClient.tsx`, `MapView.tsx`, extended `RouteTabClient.tsx`
```typescript
import { useTranslations } from 'next-intl'; // client component — no 'server' subpath
const t = useTranslations('dashboard.submissions');
```

### Error Handling (Server Actions)
**Source:** `src/actions/boq.ts` lines 44–46
**Apply to:** `src/actions/submissions.ts`
```typescript
// Actions return discriminated unions { ok: true, ... } | { ok: false, error: string }
// for mutation paths. Query-only functions (getSubmissions, getApprovedPoints)
// throw directly on auth failure — consistent with getBoqItems (boq.ts line 149).
```

### ST_AsGeoJSON Geometry Read Pattern
**Source:** `tests/postgis.test.ts` lines 86–96; `src/lib/spatial.ts` line 97 (sql`` template)
**Apply to:** `src/actions/submissions.ts` (`getApprovedPoints`, `getRouteGeoJSON`), `src/actions/routes.ts` extension
```typescript
import { sql } from 'drizzle-orm';
// Column read:
sql<string>`ST_AsGeoJSON(${table.geometryColumn})`
// Post-query:
const parsed = JSON.parse(row.geomJson); // { type: 'Point'/'LineString', coordinates: [...] }
```

### Date → ISO String Serialization (RSC → Client Props)
**Source:** Identified anti-pattern (Research Pitfall 5); NOT yet done in existing code
**Apply to:** Any server-fetched `Date` passed to `'use client'` components
```typescript
// Convert before passing as props:
decidedAt: row.decidedAt?.toISOString() ?? null,
submittedAt: row.submittedAt.toISOString(),
uploadedAt: route.uploadedAt.toISOString(),
```

### `tabular-nums` + `Intl.NumberFormat('tr-TR')` for numeric table cells
**Source:** `src/components/dashboard/BoqTable.tsx` lines 60–66, 133–135
**Apply to:** `KayitlarTabClient.tsx` (quantity, distance), `BoqTable.tsx` extension (% column)
```typescript
const trFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });
// TableCell: className="text-right tabular-nums"
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/components/dashboard/MapView.tsx` (map layers) | component | event-driven | No Mapbox/react-map-gl component exists yet; map library is not yet installed. Use Research Patterns 1–4 as the reference implementation. The client-boundary pattern is well-established (`RouteTabClient.tsx`) but the Mapbox-specific `<Source>`/`<Layer>`/`<Popup>` API is net-new. |

---

## Key Implementation Notes for Planner

1. **Turbopack dev workaround (Research Pitfall 1):** The project's `"dev": "next dev --turbopack"` script will break mapbox-gl in dev. Planning must include a step to switch to `npm run dev -- --no-turbopack` during Phase 5 development. Production builds are unaffected.

2. **`routes.geom` custom type returns raw driver string** (`src/db/schema/routes.ts` lines 12–20): `fromDriver(v) { return v; }` returns the WKB/hex string directly. `ST_AsGeoJSON()` is mandatory for every geometry read — never pass a raw Drizzle geometry column to the map component.

3. **Stable palette slot assignment** (Research Pitfall 6): `getBoqItems` in `src/actions/boq.ts` line 152 already orders by `boqItems.sortOrder`. Build the `Map<boqItemId, slotIndex>` from this ordered result before constructing the FeatureCollection.

4. **`truncateAllTables` in `tests/fixtures/db.ts`** must be extended to handle future FK-dependency order if submissions tests need it — the existing table list (line 58) already includes `submissions` and `audit_notifications` in the correct order.

5. **`NEXT_PUBLIC_MAPBOX_TOKEN` checklist item (D-62):** Planning should surface this as an explicit Wave 0 / pre-development verification step, not a code task.

---

## Metadata

**Analog search scope:** `src/actions/`, `src/components/dashboard/`, `src/lib/`, `src/db/schema/`, `tests/`, `next.config.ts`
**Files read:** 18 source files
**Pattern extraction date:** 2026-05-24
