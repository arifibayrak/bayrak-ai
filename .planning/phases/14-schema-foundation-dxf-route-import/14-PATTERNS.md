# Phase 14: Schema Foundation + DXF Route Import — Pattern Map

**Mapped:** 2026-05-30
**Files analyzed:** 14 new/modified files
**Analogs found:** 13 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/crs.ts` | utility | transform | `src/lib/geojson.ts` | role-match |
| `src/lib/dxf-parser.ts` | utility | transform | `src/lib/geojson.ts` | role-match |
| `src/actions/routes.ts` (add `uploadDxf`, patch `uploadRoute`) | service | CRUD | `src/actions/routes.ts` itself (existing `uploadRoute`) | exact |
| `src/app/api/dxf-upload/route.ts` | route | request-response | `src/app/api/exports/submissions/route.ts` | role-match |
| `src/db/schema/routes.ts` (extend) | model | CRUD | `src/db/schema/routes.ts` itself | exact |
| `src/db/schema/submissions.ts` (extend) | model | CRUD | `src/db/schema/submissions.ts` itself | exact |
| `src/db/schema/ai-flags.ts` | model | CRUD | `src/db/schema/submissions.ts` | role-match |
| `src/db/migrations/0010_v4_routes_ext.sql` | migration | batch | `src/db/migrations/0007_v2_tenant_settings.sql` | exact |
| `src/db/migrations/0011_v4_ai_flags.sql` | migration | batch | `src/db/migrations/0009_v3_line_submissions.sql` | exact |
| `src/components/dashboard/DxfUpload.tsx` | component | request-response | `src/components/dashboard/RouteUpload.tsx` | exact |
| `src/components/dashboard/PdfViewer.tsx` | component | file-I/O | `src/components/dashboard/RouteUpload.tsx` (client + dynamic) | partial-match |
| `src/components/dashboard/RouteTabClient.tsx` (modify) | component | request-response | `src/components/dashboard/RouteTabClient.tsx` itself | exact |
| `src/components/dashboard/RouteTab.tsx` (modify) | component | CRUD | `src/components/dashboard/RouteTabClient.tsx` | role-match |
| `tests/dxf-parser.test.ts` | test | — | `tests/geojson.test.ts` | exact |

---

## Pattern Assignments

### `src/lib/crs.ts` (utility, transform)

**Analog:** `src/lib/geojson.ts`

**Imports pattern** (`src/lib/geojson.ts` lines 1–12):
```typescript
// geojson.ts uses only zod for validation — no external lib imports
// crs.ts pattern: one external library, one named export per concern
import { z } from 'zod';
```

**Core pattern** — pure utility module with named exports, no default export, no side effects. Mirror the JSDoc comment block header from `src/lib/geojson.ts` lines 1–12:
```typescript
/**
 * src/lib/crs.ts
 *
 * Turkey EPSG lookup table + reprojectToWGS84 utility (RTE-01, SC5).
 * Called by parseDxfToLineString in the uploadDxf Server Action.
 *
 * Axis order contract:
 *   INPUT:  [easting, northing] in the source CRS (metres)
 *   OUTPUT: [lng, lat] in WGS84 degrees — matches ST_MakePoint(lng, lat) convention.
 */
import proj4 from 'proj4';
```

**Exported shape to produce:**
```typescript
export const TURKEY_CRS: Record<number, string> = { /* 7 EPSG proj4 strings */ };
export function reprojectToWGS84(epsg: number, easting: number, northing: number): [lng: number, lat: number]
export function validateTurkeyBbox(lng: number, lat: number): boolean
```

**Error handling pattern** (mirror `geojson.ts` lines 55–60):
```typescript
// Throw with descriptive message on unsupported input — no silent fallbacks
if (!srcDef) throw new Error(`Unsupported EPSG: ${epsg}`);
```

**No analog for the 7 proj4 strings** — use the verified strings from RESEARCH.md Pattern 2 verbatim (EPSG 5254, 5253, 5255, 23035, 23036, 32635, 32636).

---

### `src/lib/dxf-parser.ts` (utility, transform)

**Analog:** `src/lib/geojson.ts`

**Imports pattern** (`src/lib/geojson.ts` lines 11–12):
```typescript
import { z } from 'zod';
```
Mirror structure — single library import + internal imports:
```typescript
import DxfParser from 'dxf-parser';
import { reprojectToWGS84, validateTurkeyBbox } from './crs';
```

**Core pattern** — discriminated union result type (mirror `geojson.ts` lines 36–38):
```typescript
// geojson.ts result type pattern:
export type LineStringValidationResult =
  | { ok: true; coordinates: [number, number][]; count: number; geojsonString: string }
  | { ok: false; error: string; actualType?: string };

// dxf-parser.ts mirrors exactly:
export type ParseDxfResult =
  | { ok: true; geojsonString: string; count: number; gaps: number[]; hasSpline: boolean }
  | { ok: false; error: string };
```

**Error handling pattern** (mirror `geojson.ts` lines 55–104 — try/catch + structured error return):
```typescript
// geojson.ts precedent — no throw to caller; return { ok: false, error: 'ERROR_CODE' }
let dxf;
try {
  const parser = new DxfParser();
  dxf = parser.parseSync(dxfText);
} catch {
  return { ok: false, error: 'DXF_PARSE_FAILED' };
}
```

**LayerInfo export** — add a named interface + export alongside the main function (mirrors `geojson.ts` exporting `LineStringValidationResult`):
```typescript
export interface LayerInfo {
  name: string;
  entityCount: number;
  vertexCount: number;
  hasSpline: boolean;
  suggested: boolean;
}
export function extractDxfLayers(dxfText: string): LayerInfo[] | null
export function parseDxfToLineString(dxfText: string, epsg: number, layerName: string): ParseDxfResult
```

**Critical note from RESEARCH Pitfall 1:** `parseSync()` takes a UTF-8 string, not an ArrayBuffer. In the Server Action, use `response.text()` after fetching from the blob URL — never `response.arrayBuffer()`.

---

### `src/actions/routes.ts` — add `uploadDxf`, patch `uploadRoute` (service, CRUD)

**Analog:** `src/actions/routes.ts` — existing `uploadRoute` (lines 1–82 — read in full above)

**Directive + header** (lines 1–12):
```typescript
'use server';
// Same file — add uploadDxf below existing exports.
// Keep 'use server' directive at the top of the file.
```

**Imports to add** (after existing imports at lines 14–22):
```typescript
import { parseDxfToLineString, extractDxfLayers } from '@/lib/dxf-parser';
```

**Auth + ownership pattern** (lines 35–44 — copy verbatim into `uploadDxf`):
```typescript
const session = await auth();
if (!session) throw new Error('Unauthorized');

// CR-02: Verify project belongs to the active tenant before writing (IDOR mitigation).
const owned = await db
  .select({ id: projects.id })
  .from(projects)
  .where(and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId())))
  .limit(1);
if (!owned.length) throw new Error('Not found');
```

**Core DB upsert pattern** (lines 54–66 — `onConflictDoUpdate` on `routes.projectId`):
```typescript
// Existing uploadRoute pattern — mirror in uploadDxf with added columns:
const [row] = await db.insert(routes).values({
  projectId,
  tenantId: getDefaultTenantId(),
  geom: sql`ST_GeomFromGeoJSON(${result.geojsonString})`,
  coordinateCount: result.count,
}).onConflictDoUpdate({
  target: routes.projectId,
  set: {
    geom: sql`ST_GeomFromGeoJSON(${result.geojsonString})`,
    coordinateCount: result.count,
    uploadedAt: sql`now()`,
  },
}).returning({ id: routes.id });
```

**uploadRoute patch** — add to the `onConflictDoUpdate` set block (lines 59–65):
```typescript
// NEW Phase 14 additions to the existing set block:
totalLengthM: sql`ST_Length(ST_GeomFromGeoJSON(${result.geojsonString})::geography)`,
geometryVersion: sql`COALESCE(${routes.geometryVersion}, 0) + 1`,
// Also add to VALUES (first insert):
totalLengthM: sql`ST_Length(ST_GeomFromGeoJSON(${result.geojsonString})::geography)`,
geometryVersion: 1,
```

**Activity log pattern** (lines 68–78 — copy verbatim into `uploadDxf`, change actionType):
```typescript
if (session.user?.id) {
  logOfficeActivity({
    actorUserId: session.user.id,
    actionType: 'route_uploaded',   // change to 'dxf_route_uploaded' in uploadDxf
    entityType: 'project',
    entityId: projectId,
    projectId,
    metadata: { coordinateCount: result.count },
  });
}
revalidatePath(`/dashboard/projects/${projectId}`);
return { ok: true as const, count: result.count, id: row.id };
```

**`getRoute` + `getRouteGeoJSON` modification** — extend the `select()` projection to include new columns (`totalLengthM`, `sourceCrs`, `sourceLayer`, `geometryVersion`). Mirror existing select pattern (lines 89–109):
```typescript
const result = await db
  .select({
    id: routes.id,
    coordinateCount: routes.coordinateCount,
    uploadedAt: routes.uploadedAt,
    // Phase 14 additions:
    totalLengthM: routes.totalLengthM,
    sourceCrs: routes.sourceCrs,
    sourceLayer: routes.sourceLayer,
    geometryVersion: routes.geometryVersion,
    sourceBlobUrl: routes.sourceBlobUrl,
  })
  .from(routes)
  .where(
    and(
      eq(routes.projectId, projectId),
      eq(routes.tenantId, getDefaultTenantId()),
    )
  )
  .limit(1);
```

---

### `src/app/api/dxf-upload/route.ts` (route, request-response)

**Analog:** `src/app/api/exports/submissions/route.ts` (lines 1–139 — read in full above)

**Runtime declaration** (line 46 of analog):
```typescript
export const runtime = 'nodejs';
// Note: do NOT add dynamic='force-dynamic' — Blob token exchange route
// needs to be dynamic by nature (no caching), but not force-dynamic.
```

**Auth-first pattern** (analog lines 49–53):
```typescript
export async function POST(request: Request): Promise<NextResponse> {
  // Auth gate — handleUpload calls onBeforeGenerateToken which throws if no session.
  // This is the Vercel Blob client-upload pattern — NOT the same as auth() at route level.
  // Auth check is inside onBeforeGenerateToken (RESEARCH Pattern 3).
```

**Error response shape** (analog lines — follow NextResponse.json pattern):
```typescript
return NextResponse.json({ error: (error as Error).message }, { status: 400 });
```

**Full structure** (no analog exists in codebase for `handleUpload` — use RESEARCH Pattern 3 verbatim):
```typescript
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname) => {
        const session = await auth();
        if (!session) throw new Error('Not authenticated');
        return {
          allowedContentTypes: ['application/octet-stream', 'application/dxf'],
          addRandomSuffix: true,
          maximumSizeInBytes: 50 * 1024 * 1024,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('[dxf-upload] blob complete:', blob.url);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
```

---

### `src/db/schema/routes.ts` — extend (model, CRUD)

**Analog:** `src/db/schema/routes.ts` itself (lines 1–43 — read in full above)

**Custom type declaration** (lines 12–20 — pattern for the `geomLinestring` custom type):
```typescript
const geomLinestring = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(LineString, 4326)';
  },
  toDriver(v: string) { return v; },
  fromDriver(v: string) { return v; },
});
```

**Table columns addition pattern** (lines 22–33 — add after `uploadedAt`):
```typescript
// Phase 14: v4.0 schema foundation — provenance + length + versioning columns
// These columns are additive — existing uploadRoute still works unchanged.
// geometry_version: incremented on each re-import (D-04, D-05, RTE-05)
geometryVersion: integer('geometry_version').notNull().default(1),
totalLengthM: numeric('total_length_m', { precision: 12, scale: 2 }),
sourceBlobUrl: text('source_blob_url'),
sourceCrs: text('source_crs'),
sourceLayer: text('source_layer'),
chainageOffsetM: numeric('chainage_offset_m', { precision: 12, scale: 2 }).default('0'),
```

**Import additions** — add `numeric`, `text` to the existing import from `drizzle-orm/pg-core` (line 4):
```typescript
import { pgTable, uuid, integer, numeric, text, timestamp, customType, index } from 'drizzle-orm/pg-core';
```

---

### `src/db/schema/submissions.ts` — extend (model, CRUD)

**Analog:** `src/db/schema/submissions.ts` itself (lines 1–67 — read in full above)

**Pattern for additive columns** (follow existing nullable-column comments at lines 26–43):
```typescript
// Phase 14: v4.0 chainage foundation — columns added here; values written at approval (Phase 15)
// All nullable — pre-Phase-14 rows have no chainage data.
chainageM: numeric('chainage_m', { precision: 10, scale: 2 }),
routeGeometryVersion: integer('route_geometry_version'),
```

**Comment convention** (mirror the Phase 4 / Phase 3 phase-attribution comments in submissions.ts):
```typescript
// Phase 14: chainage snapshotted at approval (Phase 15 writes this — column exists here)
// routeGeometryVersion ties the submission to the specific route version at approval time (D-04)
```

**Imports** — `integer` is already imported (line 5); `numeric` is already imported. No new imports needed.

---

### `src/db/schema/ai-flags.ts` (model, CRUD)

**Analog:** `src/db/schema/submissions.ts` (lines 1–67 — read in full above)

**Imports pattern** (submissions.ts lines 5–9):
```typescript
import { pgTable, uuid, text, numeric, boolean, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { submissions } from './submissions';  // ← FK reference for ai-flags.ts
```

**Table definition pattern** (submissions.ts lines 11–66 — follow UUID PK + tenantId + FK + status + timestamps + index):
```typescript
export const submissionAiFlags = pgTable('submission_ai_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  submissionId: uuid('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  photoAnomalyScore: numeric('photo_anomaly_score', { precision: 4, scale: 3 }),
  workClassification: text('work_classification'),
  anomalyDescription: text('anomaly_description'),
  evalPassed: boolean('eval_passed'),
  rawResponse: jsonb('raw_response'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique('submission_ai_flags_submission_id_unique').on(t.submissionId),
  index('submission_ai_flags_submission_idx').on(t.submissionId),
  index('submission_ai_flags_status_idx').on(t.status),
]);
```

**Note:** `jsonb` import — add to the `drizzle-orm/pg-core` import line. This is the only table in the project that uses `jsonb`.

---

### `src/db/migrations/0010_v4_routes_ext.sql` (migration, batch)

**Analog:** `src/db/migrations/0007_v2_tenant_settings.sql` (lines 1–29 — read in full above)

**Hand-written header comment pattern** (lines 1–11 of `0007`):
```sql
-- HAND-WRITTEN (WR-06): drizzle-kit generate is used as a template source, but the output
-- requires hand-verification and editing per established project precedent (see 0005, 0006).
-- Key hand-edits applied: [list edits]
-- WARNING: Do NOT re-run drizzle-kit generate over this file ...
-- Apply only via `npx tsx src/db/migrate.ts` (D-49).
```

**Statement-breakpoint separator** (lines 20–23 of `0007` and throughout `0009`):
```sql
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "geometry_version" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
```

**FK-safe seed pattern** (folded todo `tenant-settings-seed-fk-safe` — pattern from `0007` lines 26–28):
```sql
-- FK-safe seed: INSERT only when the tenant row exists (portable to fresh/test DBs)
INSERT INTO "tenant_settings" (...)
VALUES (...)
ON CONFLICT (tenant_id) DO NOTHING;

-- Phase 14 FK-safe pattern equivalent for any new seed rows:
INSERT INTO ... SELECT ... WHERE EXISTS (SELECT 1 FROM tenants WHERE id = '...');
```

**Full migration column list** — the `ALTER TABLE` statements to emit (RESEARCH Pattern 5):
```sql
ALTER TABLE "routes" ADD COLUMN "geometry_version" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "total_length_m" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "source_blob_url" text;
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "source_crs" text;
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "source_layer" text;
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "chainage_offset_m" numeric(12, 2) DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "chainage_m" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "route_geometry_version" integer;
--> statement-breakpoint
CREATE INDEX "submissions_chainage_m_idx" ON "submissions" ("chainage_m") WHERE "status" = 'approved';
```

**No geometry hand-edit needed** — all new columns in 0010 are `numeric`, `text`, or `integer`. The existing `routes.geom` was already hand-edited in `0000_lame_silver_sable.sql`. No new geometry columns in this migration.

---

### `src/db/migrations/0011_v4_ai_flags.sql` (migration, batch)

**Analog:** `src/db/migrations/0009_v3_line_submissions.sql` (lines 1–14 — read in full above)

**CREATE TABLE + FK constraints + indexes pattern** (entire `0009` file):
```sql
CREATE TABLE "submission_ai_flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "submission_id" uuid NOT NULL,
  ...
);
--> statement-breakpoint
ALTER TABLE "submission_ai_flags" ADD CONSTRAINT "..." FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "submission_ai_flags" ADD CONSTRAINT "..." FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "submission_ai_flags_submission_idx" ON "submission_ai_flags" USING btree ("submission_id");
--> statement-breakpoint
CREATE INDEX "submission_ai_flags_status_idx" ON "submission_ai_flags" USING btree ("status");
--> statement-breakpoint
ALTER TABLE "submission_ai_flags" ADD CONSTRAINT "submission_ai_flags_submission_id_unique" UNIQUE("submission_id");
```

---

### `src/components/dashboard/DxfUpload.tsx` (component, request-response)

**Analog:** `src/components/dashboard/RouteUpload.tsx` (lines 1–252 — read in full above) — direct template, highest-confidence analog.

**Directive + imports pattern** (lines 1–19):
```typescript
'use client';

import { useRef, useState, useTransition } from 'react';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
// DxfUpload additions vs RouteUpload:
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { upload } from '@vercel/blob/client';
import { uploadDxf } from '@/actions/routes';
import { extractDxfLayers } from '@/lib/dxf-parser';
```

**State machine type pattern** (lines 28–33 — discriminated union):
```typescript
// RouteUpload pattern — discriminated union with status field:
type UploadState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'valid'; count: number; fileContent: string }
  | { status: 'error'; errorCode: string; actualType?: string }
  | { status: 'saving' }
  | { status: 'saved'; count: number };

// DxfUpload extension — add DXF-specific states:
type DxfUploadState =
  | { status: 'idle' }
  | { status: 'parsing' }
  | { status: 'layer-picker'; layers: LayerInfo[]; file: File }
  | { status: 'crs-select'; layers: LayerInfo[]; selectedLayer: string; file: File }
  | { status: 'previewing'; geojson: GeoJSON.LineString; blobUrl: string; selectedLayer: string; selectedCrs: number; totalLengthM: number }
  | { status: 'saving' }
  | { status: 'saved'; count: number }
  | { status: 'error'; errorCode: string };
```

**useState + useRef + useTransition pattern** (lines 37–39):
```typescript
const fileInputRef = useRef<HTMLInputElement>(null);
const [uploadState, setUploadState] = useState<DxfUploadState>({ status: 'idle' });
const [isDragOver, setIsDragOver] = useState(false);
const [isPending, startTransition] = useTransition();
```

**File selection + drag-drop pattern** (lines 99–111 — copy verbatim, change accept to `.dxf`):
```typescript
function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (file) handleFileSelect(file);
  e.target.value = '';  // reset so same file can be re-selected
}

function handleDrop(e: React.DragEvent<HTMLDivElement>) {
  e.preventDefault();
  setIsDragOver(false);
  const file = e.dataTransfer.files?.[0];
  if (file) handleFileSelect(file);
}
```

**Drop zone JSX pattern** (lines 211–249 — copy verbatim, change `accept=".geojson"` to `accept=".dxf"`):
```typescript
<input
  ref={fileInputRef}
  type="file"
  accept=".dxf"
  className="hidden"
  onChange={handleInputChange}
  aria-label={t('dxf_drop_label')}
/>
<div
  role="button"
  tabIndex={0}
  aria-label={t('dxf_drop_label')}
  onClick={() => fileInputRef.current?.click()}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
  onDrop={handleDrop}
  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
  onDragLeave={() => setIsDragOver(false)}
  className={[
    'flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3',
    'rounded-lg border-2 border-dashed transition-colors',
    isDragOver
      ? 'border-primary bg-primary/5'
      : 'border-border hover:border-primary hover:bg-primary/5',
  ].join(' ')}
>
```

**Error render pattern** (lines 185–209):
```typescript
if (uploadState.status === 'error') {
  const { errorCode } = uploadState;
  // Map errorCode → i18n key; use t('error_dxf_parse') etc. per UI-SPEC copywriting
  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
      <Button variant="outline" onClick={reset}>{t('dxf_choose_file')}</Button>
    </div>
  );
}
```

**Blob upload call** — the two-step upload pattern (RESEARCH Pattern 3, no existing codebase analog for the client-side `upload()` call — use RESEARCH pattern directly):
```typescript
// Inside DxfUpload — called after file is parsed client-side for layers
async function handleBlobUpload(file: File): Promise<string> {
  const { url } = await upload(
    `routes/${projectId}/source-${Date.now()}.dxf`,
    file,
    {
      access: 'public',
      handleUploadUrl: '/api/dxf-upload',
    }
  );
  return url;
}
```

**SatellitePreviewModal** — embed as a local function component inside `DxfUpload.tsx` OR as a named export from the same file. Use conditional render (`{open && <SatellitePreviewModal ... />}`) — NOT Dialog's `open` prop alone. Map ref and onLoad pattern from `MapView.tsx` lines 159–185:

```typescript
// From MapView.tsx — exact fitBounds pattern to mirror in SatellitePreviewModal:
const mapRef = useRef<MapRef>(null);
const onLoad = useCallback(() => {
  if (!routeGeoJSON || !mapRef.current) return;
  // ... compute minLng, maxLng, minLat, maxLat from coordinates ...
  mapRef.current.getMap().fitBounds(       // Must use .getMap() — not .fitBounds() directly
    [[minLng, minLat], [maxLng, maxLat]],
    { padding: 48, animate: false }        // UI-SPEC says 60px padding for preview modal
  );
}, [routeGeoJSON]);
```

**Map import** (from `MapView.tsx` lines 30–31):
```typescript
import Map, { Source, Layer, Marker } from 'react-map-gl/mapbox';  // '/mapbox' adapter is mandatory
import type { MapRef } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';  // MANDATORY — controls broken without it
```

**Map token guard** (from `MapView.tsx` lines 199–205):
```typescript
// Mirror MapView.tsx empty-state pattern when token is absent:
if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
  return <div className="...">Mapbox token eksik</div>;
}
```

---

### `src/components/dashboard/PdfViewer.tsx` (component, file-I/O)

**Analog:** `src/components/dashboard/RouteUpload.tsx` — partial match for the `'use client'` + `useRef`/`useState` shell. No existing PDF viewer in codebase.

**Directive** (mirror `RouteUpload.tsx` line 1):
```typescript
'use client';
```

**react-pdf import pattern** (RESEARCH no codebase analog — use UI-SPEC pattern directly):
```typescript
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// Worker setup — must be at module level, outside the component
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
```

**State pattern** (mirror `RouteUpload.tsx` lines 37–38):
```typescript
const [numPages, setNumPages] = useState<number>(0);
const [currentPage, setCurrentPage] = useState<number>(1);
```

**Dynamic import in parent** — parent RSC (RouteTab.tsx) must use:
```typescript
// Follow Next.js dynamic import pattern — mirrors how mapbox-gl is handled to avoid SSR issues
const PdfViewer = dynamic(() => import('./PdfViewer'), { ssr: false });
```

---

### `src/components/dashboard/RouteTabClient.tsx` — modify (component, request-response)

**Analog:** `src/components/dashboard/RouteTabClient.tsx` itself (lines 1–130 — read in full above)

**Props interface extension** (lines 36–43 — extend `ExistingRoute` and `RouteTabClientProps`):
```typescript
// Existing ExistingRoute interface — extend with Phase 14 columns:
interface ExistingRoute {
  id: string;
  coordinateCount: number;
  uploadedAt: string;
  // Phase 14 additions:
  totalLengthM: string | null;
  sourceCrs: string | null;
  sourceLayer: string | null;
  geometryVersion: number | null;
  sourceBlobUrl: string | null;
}
```

**DxfUpload insertion point** — after `<RouteUpload>` in the upload zone render (lines 116–129):
```typescript
// Insert below RouteUpload in the upload zone (no savedRoute or isReplacing):
<RouteUpload projectId={projectId} onSuccess={handleUploadSuccess} />

{/* Phase 14: DXF upload section — separated by a visual divider */}
<Separator className="my-4" />
<p className="text-xs text-muted-foreground text-center">{t('dxf_section_label')}</p>
<DxfUpload projectId={projectId} onSuccess={handleUploadSuccess} />
```

**Metadata card extension** (lines 79–102 — add new rows after existing `upload_date` row):
```typescript
// Mirror existing metadata row pattern:
<div className="flex items-center gap-2">
  <span className="text-muted-foreground">{t('coord_count')}</span>
  <span className="font-medium tabular-nums">
    {savedRoute.coordinateCount.toLocaleString('tr-TR')}
  </span>
</div>

// Phase 14 additions — conditional on non-null values:
{savedRoute.totalLengthM && (
  <div className="flex items-center gap-2">
    <span className="text-muted-foreground">{t('meta_total_length')}</span>
    <span className="font-medium font-mono tabular-nums">
      {(parseFloat(savedRoute.totalLengthM) / 1000).toFixed(2)} km
    </span>
  </div>
)}
{savedRoute.sourceCrs && (
  <div className="flex items-center gap-2">
    <span className="text-muted-foreground">{t('meta_crs')}</span>
    <span className="font-medium">{savedRoute.sourceCrs}</span>
  </div>
)}
```

**i18n hook** (line 51 — already uses `useTranslations('dashboard.route')`):
```typescript
const t = useTranslations('dashboard.route');
// All new i18n keys are in the 'dashboard.route' namespace per UI-SPEC i18n section.
```

---

### `tests/dxf-parser.test.ts` (test, —)

**Analog:** `tests/geojson.test.ts` (lines 1–77 — read in full above) — exact match in structure.

**Imports pattern** (lines 1–15 of `geojson.test.ts`):
```typescript
import { describe, it, expect } from 'vitest';
import { validateLineStringGeoJSON } from '@/lib/geojson';
import {
  validLineStringFeature,
  // ...
} from './fixtures/geojson';

// Mirror for dxf-parser.test.ts:
import { describe, it, expect } from 'vitest';
import { reprojectToWGS84, validateTurkeyBbox } from '@/lib/crs';
import { parseDxfToLineString, extractDxfLayers } from '@/lib/dxf-parser';
// Fixture: synthetic DXF text string (hand-authored — see RESEARCH Open Question 1)
import { SAMPLE_DXF_EPSG5254, SAMPLE_DXF_EPSG32635 } from './fixtures/dxf';
```

**describe/it/expect pattern** (lines 17–77):
```typescript
describe('reprojectToWGS84', () => {
  it('SC5: EPSG:5254 known Istanbul area coordinate', () => {
    const [lng, lat] = reprojectToWGS84(5254, 600000, 4570000);
    expect(lng).toBeGreaterThan(28.5);
    expect(lng).toBeLessThan(29.5);
    expect(lat).toBeGreaterThan(40.8);
    expect(lat).toBeLessThan(41.8);
    expect(validateTurkeyBbox(lng, lat)).toBe(true);
  });

  it('axis-swapped coords fail Turkey bbox', () => {
    const [lng, lat] = reprojectToWGS84(5254, 4570000, 600000);
    expect(validateTurkeyBbox(lng, lat)).toBe(false);
  });
});

describe('parseDxfToLineString', () => {
  it('extracts LWPOLYLINE from fixture DXF → ok:true with geojsonString', () => {
    const result = parseDxfToLineString(SAMPLE_DXF_EPSG5254, 5254, 'AXIS');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count).toBeGreaterThanOrEqual(2);
    const geojson = JSON.parse(result.geojsonString);
    expect(geojson.type).toBe('LineString');
  });
  // ... additional test cases per RESEARCH Validation Architecture table
});
```

**No-DB note** (mirror `geojson.test.ts` comment line 8): pure unit tests — no `tests/setup.ts` DB connection needed. `vitest.config.ts` `environment: node` is sufficient.

**Fixture file to create:** `tests/fixtures/dxf.ts` — exports `SAMPLE_DXF_EPSG5254` as a minimal hand-authored DXF text string with one LWPOLYLINE entity on layer `AXIS` with 3 vertices in valid TUREF/TM30 coordinates. No binary required — DXF is a text format. A minimal DXF has: `SECTION`, `ENTITIES`, `LWPOLYLINE` with group codes 8 (layer), 90 (vertex count), 10/20 pairs (x/y).

---

## Shared Patterns

### Authentication Guard
**Source:** `src/actions/routes.ts` lines 35–36
**Apply to:** `uploadDxf` Server Action, `/api/dxf-upload` route handler (via `onBeforeGenerateToken`)
```typescript
const session = await auth();
if (!session) throw new Error('Unauthorized');
```

### Ownership Check (CR-02)
**Source:** `src/actions/routes.ts` lines 38–44
**Apply to:** `uploadDxf` Server Action
```typescript
const owned = await db
  .select({ id: projects.id })
  .from(projects)
  .where(and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId())))
  .limit(1);
if (!owned.length) throw new Error('Not found');
```

### Tenant ID Injection
**Source:** `src/actions/routes.ts` lines 54–57 (`getDefaultTenantId()`)
**Apply to:** `uploadDxf` Server Action insert, `submissionAiFlags` table inserts (Phase 16)
```typescript
tenantId: getDefaultTenantId(),
```

### Parameterized PostGIS Geometry
**Source:** `src/actions/routes.ts` lines 57–58
**Apply to:** `uploadDxf` DB insert — never concatenate geometry strings
```typescript
geom: sql`ST_GeomFromGeoJSON(${result.geojsonString})`,  // parameterized — no string concat
```

### Activity Log (fire-and-forget)
**Source:** `src/actions/routes.ts` lines 68–78
**Apply to:** `uploadDxf` Server Action (change `actionType` to `'dxf_route_uploaded'`)
```typescript
if (session.user?.id) {
  logOfficeActivity({
    actorUserId: session.user.id,
    actionType: 'route_uploaded',
    entityType: 'project',
    entityId: projectId,
    projectId,
    metadata: { coordinateCount: result.count },
  });
}
```

### revalidatePath After Mutation
**Source:** `src/actions/routes.ts` line 80
**Apply to:** `uploadDxf` Server Action
```typescript
revalidatePath(`/dashboard/projects/${projectId}`);
```

### Vercel Blob `put()` env token pattern
**Source:** `src/lib/bot-photo.ts` lines 31, 76–80
**Apply to:** `/api/dxf-upload` route — `BLOB_READ_WRITE_TOKEN` is read automatically by `@vercel/blob`; no explicit token passing in `handleUpload` or `upload()` calls.
```typescript
// bot-photo.ts precedent: BLOB_READ_WRITE_TOKEN not passed explicitly
const { url } = await put(
  `submissions/${submissionFlowId}/photo.${ext}`,
  response.body!,
  { access: 'public', addRandomSuffix: false, allowOverwrite: true }
);
```

### Migration Statement Breakpoint Format
**Source:** `src/db/migrations/0009_v3_line_submissions.sql` throughout
**Apply to:** `0010_v4_routes_ext.sql`, `0011_v4_ai_flags.sql`
```sql
ALTER TABLE "..." ADD COLUMN "...";
--> statement-breakpoint
ALTER TABLE "..." ADD CONSTRAINT "...";
--> statement-breakpoint
CREATE INDEX "..." ON "..." USING btree ("...");
```

### Migration Idempotent Seed
**Source:** `src/db/migrations/0007_v2_tenant_settings.sql` lines 26–28
**Apply to:** `0010_v4_routes_ext.sql` for any new tenant_settings seed rows (folded todo)
```sql
INSERT INTO "..." (...) VALUES (...) ON CONFLICT (...) DO NOTHING;
-- FK-safe variant for fresh DBs:
INSERT INTO ... SELECT ... WHERE EXISTS (SELECT 1 FROM tenants WHERE id = '...');
```

### react-map-gl Import + fitBounds
**Source:** `src/components/dashboard/MapView.tsx` lines 30–31, 159–185
**Apply to:** `SatellitePreviewModal` inside `DxfUpload.tsx`
```typescript
import Map, { Source, Layer, Marker } from 'react-map-gl/mapbox';  // '/mapbox' adapter — mandatory
import type { MapRef } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
// ...
mapRef.current.getMap().fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, animate: false });
```

### i18n Hook
**Source:** `src/components/dashboard/RouteTabClient.tsx` line 51
**Apply to:** `DxfUpload.tsx`, modified `RouteTabClient.tsx`, `PdfViewer.tsx`
```typescript
const t = useTranslations('dashboard.route');  // all new keys go in this namespace
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `tests/fixtures/dxf.ts` | fixture | — | No DXF test fixtures exist; must hand-author minimal DXF text strings for the LWPOLYLINE test cases (RESEARCH Open Question 1) |

The `src/app/api/dxf-upload/route.ts` file uses `handleUpload` from `@vercel/blob/client` — a pattern not yet used in this codebase. The `bot-photo.ts` file uses `put()` (server-side), while the new route needs `handleUpload` (token exchange for browser direct PUT). Use RESEARCH Pattern 3 verbatim for this piece.

---

## Metadata

**Analog search scope:** `src/actions/`, `src/db/schema/`, `src/db/migrations/`, `src/lib/`, `src/components/dashboard/`, `src/app/api/`, `tests/`
**Files scanned:** 14 analog files read in full
**Key pattern extractions:** `uploadRoute` (exact server action template), `RouteUpload.tsx` (exact UI state machine template), `MapView.tsx` (exact fitBounds + react-map-gl/mapbox import), `geojson.ts` (discriminated union result type + error pattern), `0007`/`0009` migrations (statement-breakpoint + hand-written comment headers), `bot-photo.ts` (Vercel Blob env token convention)
**Pattern extraction date:** 2026-05-30
