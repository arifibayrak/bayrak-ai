# Architecture Research: v4.0 Integration Design

**Domain:** Linear-infrastructure field operations platform — document-driven route import, chainage as-built tracking, AI vision assist
**Researched:** 2026-05-29
**Confidence:** HIGH (based on direct reading of all named source files)

---

## Context: What Already Exists (Do Not Redesign)

All of the below is shipped and immutable in schema terms (migrations 0001–0009 are applied and hash-locked):

- `routes` table: `geometry(LineString,4326)`, `coordinate_count`, `uploaded_at`, tenant/project-scoped. GiST index on `geom`. One row per project (unique on `project_id`).
- `submissions` table: `location geometry(point,4326)`, `snapped_point geometry(point,4326)`, `segment_fraction numeric(10,8)` (ST_LineLocatePoint result in [0,1]), `location_match enum(near|far|no_route)`, `location_distance_m`, `status enum(pending_audit|approved|rejected)`, `decided_by`, `decided_at`. Two GiST indexes.
- `uploadRoute` Server Action: validates GeoJSON LineString, calls `ST_GeomFromGeoJSON`, upserts via `onConflictDoUpdate` on `project_id`. Auth-guarded. Activity-logged.
- `RouteUpload.tsx`: client component, `.geojson`-only accept attribute, reads file as text, sends content string to `uploadRoute`.
- `RouteTab.tsx`: RSC, Promise.all over `getRoute` + `getRouteGeoJSON` + `getApprovedPoints` + `getBoqLegend`, passes to `RouteTabClient`.
- `MapView.tsx`: react-map-gl v8, `import from 'react-map-gl/mapbox'`, `mapRef.current.getMap().fitBounds(...)`, GeoJSON LineString source + approved points source.
- Export route handlers: `runtime='nodejs'`, `dynamic='force-dynamic'`, `auth()` first, `NextResponse(new Uint8Array(buffer))`, `after()` for activity logging.
- Approval path: `handleAuditDecision` in `src/lib/bot-audit.ts`. After commit it calls `recomputeHakedisLine` best-effort. Never calls `logOfficeActivity` (no session in bot path). Never uses `after()`.

---

## System Overview — v4.0 Additions

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Browser (Office Engineer)                                                    │
│  ┌─────────────────────┐  ┌──────────────────────────────────────────────┐   │
│  │ RouteUpload.tsx [M] │  │ ChainageTab.tsx [NEW RSC]                    │   │
│  │ + DxfUpload.tsx[NEW]│  │  └─ ChainageTable.tsx [NEW client]           │   │
│  └────────┬────────────┘  └───────────────┬──────────────────────────────┘   │
│           │ Server Action                  │ Server Action                    │
├───────────┼────────────────────────────────┼──────────────────────────────────┤
│  Server Actions / Route Handlers           │                                  │
│  ┌────────▼────────────┐  ┌───────────────▼──────────────────────────────┐   │
│  │ uploadRoute [M]     │  │ getChainageBuckets [NEW]                      │   │
│  │ uploadDxf [NEW]     │  │  (src/actions/chainage.ts)                    │   │
│  └────────┬────────────┘  └──────────────────────────────────────────────┘   │
│           │                                                                   │
│  ┌────────▼──────────────────────────────────────────────────────────────┐   │
│  │  src/lib/dxf-parser.ts [NEW]  — parseDxfToLineString(buffer, crs)     │   │
│  │  Node.js runtime only; runs inside uploadDxf Server Action             │   │
│  └────────┬──────────────────────────────────────────────────────────────┘   │
├───────────┼────────────────────────────────────────────────────────────────── │
│  Database (Neon + PostGIS)                                                    │
│  ┌────────▼────────────────────────────────────────────────────────────────┐ │
│  │ routes [MODIFIED — add source_blob_url, source_crs, source_layer]      │ │
│  │ submissions [UNCHANGED]                                                 │ │
│  │ submission_ai_flags [NEW]                                               │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  Telegram Bot path (no session, no after())                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ handleAuditDecision [M — add AI flag trigger]                          │ │
│  │  └─ enqueueAiFlag(submissionId) — best-effort, never awaited in hot    │ │
│  │      path, writes to submission_ai_flags with status='pending'          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. DXF Import Pipeline

### Decision: Server Action, Not Route Handler

Use a **new Server Action `uploadDxf`** (not a route handler) for the same reason `uploadRoute` is a Server Action: it keeps the auth guard in-process (`auth()` call), allows `revalidatePath`, and is called from a client component with `useTransition`. The Server Action runs on the Node.js runtime (not edge) because DXF parsing requires Node.js Buffer API and `proj4` uses `Math`-heavy reprojection that is not edge-safe.

The `.geojson` path through `uploadRoute` is **unchanged**. `RouteUpload.tsx` keeps `accept=".geojson"`.

### New Components

**`src/actions/routes.ts` [MODIFIED]** — add `uploadDxf` export:

```typescript
// New export alongside existing uploadRoute
export async function uploadDxf(
  projectId: string,
  fileContent: ArrayBuffer,  // DXF binary as ArrayBuffer passed from client
  sourceCrs: string,          // e.g. "EPSG:5254" (TUREF/TM30) or "EPSG:32635"
  sourceLayer?: string,       // optional: DXF layer name to extract
): Promise<{ ok: boolean; count?: number; id?: string; blobUrl?: string; error?: string }>
```

The action:
1. `auth()` guard first.
2. Ownership check against tenant (same CR-02 pattern as `uploadRoute`).
3. Upload raw DXF bytes to `@vercel/blob` — returns `blobUrl`. Store this.
4. Call `parseDxfToLineString(buffer, sourceCrs, sourceLayer)` from `src/lib/dxf-parser.ts`.
5. Validate result is a LineString with >= 2 coordinates (reuse `validateLineStringGeoJSON` on the output).
6. Insert via `ST_GeomFromGeoJSON` with `onConflictDoUpdate` — same pattern as `uploadRoute`.
7. Also store `sourceBlobUrl`, `sourceCrs`, `sourceLayer` in the `routes` row (schema addition — see section 2).
8. `logOfficeActivity` + `revalidatePath`.

**`src/lib/dxf-parser.ts` [NEW]** — pure parsing function:

```typescript
// parseDxfToLineString: accepts DXF buffer + CRS code, returns GeoJSON LineString in WGS84
// Uses dxf-parser npm package for entity extraction, proj4 for reprojection
// sourceLayer: if supplied, only POLYLINE/LWPOLYLINE/SPLINE entities on that layer
// Returns { ok: true; geojsonString: string; count: number } | { ok: false; error: string }
export function parseDxfToLineString(
  buffer: Buffer,
  sourceCrs: string,
  sourceLayer?: string,
): ParseResult
```

Library choices (to be confirmed during implementation phase — these are recommendations, not validated against current npm):
- `dxf-parser` npm package for entity extraction (reads POLYLINE, LWPOLYLINE, SPLINE entities)
- `proj4` npm package for CRS reprojection to WGS84 — defines source CRS from EPSG code, projects each coordinate pair

This function is pure (no DB, no Telegram, no auth). Unit-testable in vitest with a fixture DXF file.

**`src/components/dashboard/DxfUpload.tsx` [NEW]** — client component:

- `accept=".dxf"` on the file input.
- Reads file as `ArrayBuffer` (not text — DXF is binary/mixed).
- Shows a CRS selector dropdown (list of common Turkish CRSes: TUREF/TM27=EPSG:5253, TUREF/TM30=EPSG:5254, TUREF/TM33=EPSG:5255, UTM 35N=EPSG:32635, WGS84=EPSG:4326 for already-projected files).
- Optional layer name text input.
- On confirm: calls `uploadDxf(projectId, arrayBuffer, selectedCrs, layerName)` via `useTransition`.
- Same states as `RouteUpload.tsx`: idle / validating / valid / saving / saved / error.

**`RouteUpload.tsx` [MODIFIED]** — wrap both upload options in a tab/toggle: "GeoJSON" | "DXF (CAD)". Keep existing GeoJSON path byte-for-byte identical; add DxfUpload below a format selector. Alternatively keep them as two separate UI sections in `RouteTabClient` — preferred because it avoids risking the validated GeoJSON path.

### DXF Source Document View

Store the raw DXF blob URL in `routes.source_blob_url` (new column). Add a "Kaynak Belge" link in the `RouteTab` UI that opens the blob URL in a new tab. No in-browser DXF viewer — the engineer downloads/opens it in their CAD tool. This satisfies "view the source drawing/document alongside the map as a reference" at zero extra complexity.

### CRS + Layer Choice Persistence

Store `source_crs` and `source_layer` in the `routes` row. This allows auditing of what CRS was used for a given route and is necessary if the engineer re-uploads. Shown in the RouteTab metadata card alongside `coordinate_count` and `uploaded_at`.

---

## 2. Chainage Data Model

### Recommendation: Derived On-the-Fly from Existing `segment_fraction` + Route Length

**Do not add a `route_segments` table.** The `submissions` table already stores `segment_fraction` as a ST_LineLocatePoint result in [0.0, 1.0]. A chainage in metres is:

```sql
chainage_m = segment_fraction * ST_Length(routes.geom::geography)
```

This is computable at query time with a join to `routes`. It is accurate to metre-level because `::geography` cast uses ellipsoidal distance.

The total route length should be **materialized** in the `routes` table as `total_length_m numeric(12,2)` (new column). Compute it once at upload time via `ST_Length(geom::geography)` and store it. This avoids recomputing it on every chainage bucket query.

**Schema additions to `routes` table (one migration: 0010_v4_route_extensions.sql)**:

```sql
-- HAND-EDITED: see notes below
ALTER TABLE routes ADD COLUMN total_length_m numeric(12,2);
ALTER TABLE routes ADD COLUMN source_blob_url text;
ALTER TABLE routes ADD COLUMN source_crs text;
ALTER TABLE routes ADD COLUMN source_layer text;
ALTER TABLE routes ADD COLUMN chainage_offset_m numeric(12,2) DEFAULT 0;
-- chainage_offset_m: calibration offset. Effective chainage = (segment_fraction * total_length_m) + chainage_offset_m
-- Set to 0 by default (km 0 = route start). Engineer can override to calibrate against a known station.
```

Populate `total_length_m` in the `uploadRoute` and `uploadDxf` actions at insert time:

```typescript
// In the onConflictDoUpdate values:
totalLengthM: sql`ST_Length(ST_GeomFromGeoJSON(${result.geojsonString})::geography)`,
```

**No `route_segments` table.** Reasons:
- Segments are implicit in the LineString's vertex sequence. Adding an explicit segment table would require keeping it in sync with every route re-upload.
- The bucket rollup query (per-km) works cleanly from `segment_fraction * total_length_m` grouped into `floor(chainage_m / 1000)` buckets.
- BOQ completion % by chainage: `sum(quantity) WHERE chainage_m BETWEEN X AND Y` — no segment table needed.

**Chainage calibration** is stored as `routes.chainage_offset_m`. Effective chainage for display = `(segment_fraction * total_length_m) + chainage_offset_m`. The offset is set by a Server Action `setChainageOffset(projectId, offsetM)` guarded by `auth()`. It never affects spatial queries; it only shifts the displayed km label.

**New table: `submission_ai_flags` (migration 0010 or separate 0011)**:

```sql
CREATE TABLE submission_ai_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- pending | running | complete | failed
  photo_anomaly_score numeric(4,3),       -- 0.0–1.0, null until complete
  work_classification text,               -- AI-inferred BOQ category, null until complete
  anomaly_description text,               -- human-readable flag text in Turkish, null until complete
  eval_passed boolean,                    -- null until evaluated; true = shown to auditor
  raw_response jsonb,                     -- full AI SDK response for eval harness
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT submission_ai_flags_submission_id_unique UNIQUE(submission_id)
);
CREATE INDEX submission_ai_flags_submission_idx ON submission_ai_flags(submission_id);
CREATE INDEX submission_ai_flags_status_idx ON submission_ai_flags(status);
```

---

## 3. As-Built Strip / Progress View

### Query Design

**New Server Action: `getChainageBuckets(projectId, bucketSizeM = 1000)`** in `src/actions/chainage.ts` [NEW]:

```typescript
// Returns array of chainage buckets with attribution
type ChainageBucket = {
  bucketStart: number;   // metres from km 0 (after offset applied)
  bucketEnd: number;
  approvedCount: number;
  totalQuantity: number; // sum of approved quantities
  boqBreakdown: Array<{ material: string; unit: string; quantity: number }>;
  workers: string[];     // distinct worker display names
  auditors: string[];    // distinct auditor display names
  submissionIds: string[]; // for link-to-detail
};
```

Core SQL pattern (Drizzle `sql` tag):

```sql
SELECT
  floor(
    ((s.segment_fraction * r.total_length_m) + r.chainage_offset_m) / ${bucketSizeM}
  ) * ${bucketSizeM} AS bucket_start,
  floor(
    ((s.segment_fraction * r.total_length_m) + r.chainage_offset_m) / ${bucketSizeM}
  ) * ${bucketSizeM} + ${bucketSizeM} AS bucket_end,
  count(*) AS approved_count,
  sum(s.quantity) AS total_quantity,
  -- ...worker/auditor/boq aggregations via JSON_AGG
FROM submissions s
JOIN routes r ON r.project_id = s.project_id
WHERE s.project_id = ${projectId}
  AND s.tenant_id = ${tenantId}
  AND s.status = 'approved'
  AND s.segment_fraction IS NOT NULL
GROUP BY bucket_start, bucket_end
ORDER BY bucket_start
```

This query joins `submissions` to `routes` to get `total_length_m` and `chainage_offset_m`. It does NOT require a `route_segments` table.

### UI Placement

**New tab "As-Built" in the project page tab bar** (`/dashboard/projects/[id]` — the existing `RouteTab`/`KayitlarTab`/`BoqTab` page). Tab key: `asbuilt`.

Component tree:
- `ChainageTab.tsx` [NEW RSC] — calls `getChainageBuckets` in parallel with `getRoute`. Auth via `auth()` in the Server Action.
- `ChainageTable.tsx` [NEW client] — renders bucket rows as a table. Each row shows: km range, work count, total quantity by BOQ item, worker names, auditor names. Clicking a submission ID navigates to the existing canonical submission detail page (`/dashboard/records/[id]`). Export buttons trigger the export route handler.

### Link to Canonical Submission Detail

The `submissionIds` array in each bucket enables a "Detay" link per row that routes to `/dashboard/records/[submissionId]` — the existing canonical submission detail page. No new page needed.

### Export Reuse

**New route handler: `GET /api/exports/chainage/route.ts` [NEW]**:

```typescript
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // ... same pattern as submissions/route.ts
  // ExcelJS workbook with one sheet per format (Excel) or @react-pdf/renderer (PDF)
  // Returns NextResponse(new Uint8Array(buffer))
}
```

The chainage Excel sheet columns: Km Başlangıç | Km Bitiş | İş Adedi | Malzeme | Miktar | Birim | İşçi | Denetçi.

For PDF: same `@react-pdf/renderer` pattern with DejaVu Sans embed (same font file already in the project from Phase 11 PDF export). The chainage PDF is a linear strip — one row per bucket — matching the existing hakkediş PDF aesthetic.

No new ExcelJS import: already a dependency. No new PDF library: `@react-pdf/renderer` already used.

---

## 4. AI Vision Assist

### Async Pattern: Decouple from the Telegram Critical Path

The AI flag is triggered **after `submissions` row is committed** and **outside the Telegram webhook response cycle**. The bot-audit approval path already follows the pattern of post-commit side effects (hakkediş recompute, auditor message edit, worker notification). AI flagging fits the same slot.

**Trigger point**: immediately after `handleAuditDecision` commits the approval transaction and before notifying the worker. Add a best-effort call:

```typescript
// In bot-audit.ts handleAuditDecision, after hakkediş recompute block:
try {
  const { enqueueAiFlag } = await import('@/lib/ai-flag-queue');
  await enqueueAiFlag(submissionId, submission.photoUrl);
} catch (aiFlagErr) {
  // D-40 best-effort: AI flag failure never blocks approval
  console.error('[handleAuditDecision] AI flag enqueue failed:', aiFlagErr);
}
```

**Why not trigger on submission creation (before audit)?** The auditor decision is what the AI assist informs. Flagging before the auditor sees the submission is the correct timing — the auditor opens the notification, the AI flag is either ready or shows "analyzing". However, since the Telegram webhook response must complete within 60s and AI SDK calls can take 5–30s, the AI call must NOT be awaited in the webhook handler.

**`src/lib/ai-flag-queue.ts` [NEW]**:

```typescript
// enqueueAiFlag: writes a 'pending' row to submission_ai_flags then
// immediately fires the AI analysis in a Promise that is NOT awaited.
// This is the correct pattern for Vercel serverless: the webhook handler
// returns quickly; the AI call runs on the same function invocation's
// event loop but does not block the HTTP response.
//
// IMPORTANT: On Vercel, after the HTTP response is sent, the Node.js
// event loop is frozen (not killed). The detached Promise will complete
// IF the function stays warm, but is NOT guaranteed. For guaranteed
// delivery, a queue (e.g. Vercel Queue or a cron job picking up 'pending'
// rows) is the production-safe approach. In v4.0 MVP, accept the best-effort
// fire-and-forget; a cron-based retry picks up stuck 'pending' rows.

export async function enqueueAiFlag(submissionId: string, photoUrl: string): Promise<void> {
  // 1. Insert a pending row (idempotent via ON CONFLICT DO NOTHING on unique submission_id)
  await db.insert(submissionAiFlags).values({
    tenantId: getDefaultTenantId(),
    submissionId,
    status: 'pending',
  }).onConflictDoNothing();

  // 2. Fire-and-forget: start the analysis without awaiting
  runAiAnalysis(submissionId, photoUrl).catch((err) => {
    console.error('[enqueueAiFlag] AI analysis failed:', err);
  });
}
```

**`src/lib/ai-vision.ts` [NEW]** — pure AI SDK call:

```typescript
// runAiAnalysis: fetches photo, calls Claude vision via AI SDK v6, writes result
// to submission_ai_flags. Eval gate: only sets eval_passed=true if score passes
// acceptance criteria (AI-01..AI-05 thresholds).
//
// Never imports auth(), logOfficeActivity, or after() — bot path has no session.
// Never throws (caller already wrapped in .catch).
export async function runAiAnalysis(submissionId: string, photoUrl: string): Promise<void>
```

**Eval harness**: `tests/ai-vision.test.ts` [NEW] — vitest fixtures with real photo URLs (or local fixture JPEGs), runs against the AI SDK using a test API key, validates that `eval_passed` aligns with manual ground truth for a set of AI-01..AI-05 test cases. Acceptance criteria must pass before `eval_passed` flags are shown in the auditor surface (gate: `eval_passed = true` is required in the `getSubmissionAiFlag` query).

**Cron retry for stuck 'pending' rows**: `src/app/api/cron/ai-flags/route.ts` [NEW] — a GET handler protected by `CRON_SECRET` header, picks up `submission_ai_flags WHERE status='pending' AND created_at < now() - interval '5 minutes'`, runs `runAiAnalysis` for each. Registered in `vercel.json` as a cron job. This is the production-safe delivery guarantee.

### Auditor Surface

The auditor sees AI flags in two places:

1. **Submission detail page** (`/dashboard/records/[id]`): a new `AiFlagCard` [NEW client component] fetched by `getSubmissionAiFlag(submissionId)` [NEW Server Action in `src/actions/chainage.ts` or a dedicated `src/actions/ai-flags.ts`]. Shows only when `eval_passed = true`. Display: anomaly description in Turkish + confidence indicator (traffic-light badge based on `photo_anomaly_score`).

2. **ChainageTable**: an amber dot on rows where at least one submission has an `eval_passed` AI flag.

### No Auth.js / after() in Bot Path

`enqueueAiFlag` and `runAiAnalysis` must never import `auth`, `logOfficeActivity`, or `after`. They use the plain `@/db` client (neon-http) directly. This is the same discipline already established in `bot-audit.ts` (see Phase 12 Pitfall 5 comment in the file).

---

## Component Inventory: New vs. Modified

### NEW Components

| Component | Location | Type | Responsibility |
|-----------|----------|------|----------------|
| `uploadDxf` | `src/actions/routes.ts` | Server Action export | DXF upload → blob → parse → upsert route |
| `setChainageOffset` | `src/actions/routes.ts` | Server Action export | Write `chainage_offset_m` to routes row |
| `getChainageBuckets` | `src/actions/chainage.ts` | Server Action | Per-km bucket rollup query |
| `getSubmissionAiFlag` | `src/actions/ai-flags.ts` | Server Action | Read `submission_ai_flags` for one submission |
| `src/lib/dxf-parser.ts` | — | Pure lib | DXF → WGS84 LineString reprojection |
| `src/lib/ai-flag-queue.ts` | — | Lib | Enqueue + fire-and-forget AI analysis |
| `src/lib/ai-vision.ts` | — | Lib | AI SDK call + eval gate + DB write |
| `DxfUpload.tsx` | `src/components/dashboard/` | Client component | DXF file + CRS selector UI |
| `ChainageTab.tsx` | `src/components/dashboard/` | RSC | Data-fetching shell for as-built tab |
| `ChainageTable.tsx` | `src/components/dashboard/` | Client component | Bucket table with sort + detail links |
| `AiFlagCard.tsx` | `src/components/dashboard/` | Client component | AI flag display on submission detail |
| `ChainageOffsetForm.tsx` | `src/components/dashboard/` | Client component | Calibration override input |
| `/api/exports/chainage/route.ts` | `src/app/api/exports/chainage/` | Route handler | Excel/PDF chainage export |
| `/api/cron/ai-flags/route.ts` | `src/app/api/cron/ai-flags/` | Route handler | Cron retry for stuck pending AI flags |
| `tests/ai-vision.test.ts` | `tests/` | Vitest | Eval harness for AI-01..AI-05 |

### MODIFIED Components

| Component | Location | What Changes |
|-----------|----------|--------------|
| `uploadRoute` | `src/actions/routes.ts` | Add `totalLengthM: sql\`ST_Length(...::geography)\`` to insert/upsert values |
| `routes` schema | `src/db/schema/routes.ts` | Add 5 columns: `totalLengthM`, `sourceBlobUrl`, `sourceCrs`, `sourceLayer`, `chainageOffsetM` |
| `RouteTab.tsx` | `src/components/dashboard/RouteTab.tsx` | Add "As-Built" tab render, pass `chainageData` |
| `RouteTabClient.tsx` | `src/components/dashboard/RouteTabClient.tsx` | Add DxfUpload section + tab switch |
| `handleAuditDecision` | `src/lib/bot-audit.ts` | Add `enqueueAiFlag` call after hakkediş recompute block |

### UNCHANGED Components

`submissions` schema, `MapView.tsx`, `getApprovedPoints`, `getBoqLegend`, `getSubmissions`, all existing export route handlers, all hakkediş actions, all auth flows, the Telegram webhook handler, `fanOutToAuditors`, `commitRejection`.

---

## Data Flow: DXF Import

```
Engineer (browser)
  → selects .dxf file + CRS + optional layer
  → DxfUpload.tsx reads as ArrayBuffer
  → calls uploadDxf(projectId, buffer, crs, layer) [Server Action]
    → auth() guard
    → CR-02 ownership check
    → @vercel/blob upload → blobUrl
    → parseDxfToLineString(buffer, crs, layer)
        → dxf-parser: extract POLYLINE/LWPOLYLINE entities
        → proj4: reproject each coordinate (srcCRS → WGS84)
        → return GeoJSON LineString string
    → validateLineStringGeoJSON(geojsonString) [existing validator]
    → db.insert(routes).onConflictDoUpdate:
        geom: ST_GeomFromGeoJSON(geojsonString)
        total_length_m: ST_Length(geom::geography)
        source_blob_url, source_crs, source_layer
    → logOfficeActivity + revalidatePath
  → DxfUpload shows saved state with coordinate count
  → RouteTab RSC re-renders: map shows new route
```

## Data Flow: Chainage Bucket Query

```
ChainageTab RSC (server)
  → getChainageBuckets(projectId, bucketSizeM=1000)
      → auth() guard
      → JOIN submissions + routes on project_id
      → WHERE status='approved' AND segment_fraction IS NOT NULL
      → chainage_m = segment_fraction * total_length_m + chainage_offset_m
      → GROUP BY floor(chainage_m / 1000)
      → JSON_AGG workers + auditors + boq breakdown
      → returns ChainageBucket[]
  → ChainageTab passes array to ChainageTable (client)
  → ChainageTable renders rows, links to /dashboard/records/[id]
  → Export button → GET /api/exports/chainage?project=...&format=xlsx
```

## Data Flow: AI Vision (Async)

```
Telegram: auditor taps Approve
  → handleAuditDecision (bot-audit.ts)
      → approval TX commits (submissions.status = 'approved')
      → recomputeHakedisLine (existing, best-effort)
      → enqueueAiFlag(submissionId, photoUrl) ← NEW, best-effort
          → INSERT submission_ai_flags(status='pending') ON CONFLICT DO NOTHING
          → runAiAnalysis().catch(log) ← fire-and-forget
              → fetch photo from Vercel Blob URL
              → AI SDK generateText with image content (Claude vision)
              → parse response: score, classification, description
              → eval gate: score vs AI-01..AI-05 thresholds
              → UPDATE submission_ai_flags SET status='complete', eval_passed=..., ...
      → editAllSiblingMessages (existing)
      → notify worker (existing)
  → webhook returns 200

[5–30s later, same or next invocation]
  Cron job /api/cron/ai-flags (if still pending after 5 min)
      → SELECT FROM submission_ai_flags WHERE status='pending' AND created_at < now()-5min
      → runAiAnalysis for each

Auditor opens submission detail page
  → getSubmissionAiFlag(submissionId)
      → SELECT FROM submission_ai_flags WHERE submission_id=? AND eval_passed=true
  → AiFlagCard renders anomaly description + score badge
```

---

## Migration Strategy

All schema changes go into **one migration file: `0010_v4_schema.sql`** (or split into `0010_v4_routes_ext.sql` + `0011_v4_ai_flags.sql` if the build order requires AI to be implemented after routes are stable — see Build Order below).

Migration rules (immutable, hash-locked after apply):
- Use `npx tsx src/db/migrate.ts` to apply — never `drizzle-kit push` (D-49: spatial_ref_sys permission issue).
- `geometry` column additions: Drizzle generates `geometry(point,4326)`; hand-edit migration SQL to correct type if needed. For non-geometry columns (numeric, text) Drizzle generates correctly — no edit needed.
- All `ALTER TABLE ADD COLUMN` statements with `DEFAULT` are non-blocking on Postgres 16 (instant metadata change, no table rewrite for nullable columns with a constant default).

---

## Build Order (Dependency-Ordered)

```
Phase A: Schema + Route Extension (foundation for all other phases)
  → migration 0010: ADD COLUMN total_length_m, source_blob_url, source_crs,
                    source_layer, chainage_offset_m to routes
  → migration 0011: CREATE TABLE submission_ai_flags
  → uploadRoute MODIFIED to populate total_length_m on upsert

Phase B: DXF Import Pipeline (depends on Phase A schema)
  → src/lib/dxf-parser.ts [NEW]
  → uploadDxf Server Action [NEW export in routes.ts]
  → DxfUpload.tsx [NEW]
  → RouteTabClient [MODIFIED to show DxfUpload]
  → Manual smoke test: upload a Turkish TUREF/TM30 DXF, verify route appears on map

Phase C: Chainage View + Export (depends on Phase A; independent of Phase B)
  → src/actions/chainage.ts: getChainageBuckets [NEW]
  → ChainageTab.tsx + ChainageTable.tsx [NEW]
  → setChainageOffset Server Action [NEW]
  → ChainageOffsetForm.tsx [NEW]
  → /api/exports/chainage/route.ts [NEW]
  → Project page tab bar MODIFIED to add "As-Built" tab

Phase D: AI Vision Assist (depends on Phase A schema; parallel-safe after submission_ai_flags exists)
  → src/lib/ai-vision.ts [NEW] — AI SDK call + eval gate
  → src/lib/ai-flag-queue.ts [NEW] — enqueue + fire-and-forget
  → tests/ai-vision.test.ts [NEW] — eval harness, acceptance criteria AI-01..AI-05
  → [GATE: all 5 acceptance criteria pass]
  → handleAuditDecision [MODIFIED] — add enqueueAiFlag after hakedis block
  → /api/cron/ai-flags/route.ts [NEW] — retry cron
  → src/actions/ai-flags.ts [NEW] — getSubmissionAiFlag
  → AiFlagCard.tsx [NEW] — auditor surface
```

Phase B and Phase C are independent of each other and can be built in parallel or in either order. Phase D requires the `submission_ai_flags` table (Phase A) but does not require Phase B or Phase C.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Reprojecting DXF on the Edge Runtime

**What people do:** Put `dxf-parser.ts` in a file that gets imported by an edge route or middleware.
**Why it's wrong:** `proj4` uses `Math.hypot`, `Buffer`, and dynamic `require` that are not available on the Vercel Edge Runtime. The build will succeed but runtime will throw.
**Do this instead:** Keep `dxf-parser.ts` in a Server Action or Node.js route handler with `export const runtime = 'nodejs'`. Server Actions in the App Router run on Node.js by default.

### Anti-Pattern 2: Calling `after()` or `logOfficeActivity` from the Bot Path

**What people do:** Try to log the AI flag enqueue as an office activity to get visibility.
**Why it's wrong:** `after()` requires an active Next.js request scope. `logOfficeActivity` does a DB insert with `actor_user_id` (FK to `users.id`). The bot webhook path has no Auth.js session, so `actor_user_id` would be null, violating the FK constraint. This is an existing established pitfall (Pitfall 5 in Phase 12 RESEARCH, enforced in `bot-audit.ts`).
**Do this instead:** The `submission_ai_flags` table itself is the audit trail. Query it from the admin shell if visibility is needed.

### Anti-Pattern 3: Awaiting `runAiAnalysis` in the Webhook Handler

**What people do:** `await runAiAnalysis(...)` inside `handleAuditDecision` to guarantee flag creation.
**Why it's wrong:** Claude vision calls take 5–30s. Telegram retries webhooks after 15s if no 200 is received. This will cause duplicate re-delivery of the audit decision with non-idempotent side effects (double hakedis recompute, double worker notification attempts).
**Do this instead:** Fire-and-forget with `.catch(log)`. The cron job catches anything that didn't complete.

### Anti-Pattern 4: Computing `chainage_m` on the Client from Coordinates

**What people do:** Send the full LineString coordinates to the client, compute the fraction × length in JavaScript.
**Why it's wrong:** Redundant data transfer (a long pipeline route can have thousands of coordinates). The `segment_fraction` is already stored per submission. The route `total_length_m` is a single scalar. All math belongs in the SQL query on the server.
**Do this instead:** `getChainageBuckets` does the computation in SQL and returns only the bucket aggregates.

### Anti-Pattern 5: A New `route_segments` Table

**What people do:** Pre-segment the LineString into fixed-length segments at upload time and store them in a table.
**Why it's wrong:** It duplicates data that is derivable from `segment_fraction * total_length_m`. Every re-upload (DXF or GeoJSON) would require regenerating and re-linking all submissions' segment pointers. The existing `segment_fraction` in [0,1] is the correct linear-referencing primitive — it is dimensionless and survives route re-uploads (though the absolute chainage position shifts if the route geometry changes, which is expected).
**Do this instead:** Compute chainage in the bucket query as shown above.

### Anti-Pattern 6: Showing AI Flags Before the Eval Gate Passes

**What people do:** Show `submission_ai_flags` rows with `status='complete'` regardless of `eval_passed`.
**Why it's wrong:** The eval harness exists to prevent false positives from misleading auditors. A flag shown before the threshold is validated erodes trust in the AI assist and violates AI-01..AI-05 acceptance criteria.
**Do this instead:** `getSubmissionAiFlag` queries `WHERE eval_passed = true`. The `AiFlagCard` only renders when this returns a row.

---

## Integration Points

### Existing → New

| Existing | Integration Point | New |
|----------|-------------------|-----|
| `uploadRoute` (routes.ts) | Add `totalLengthM` to insert/upsert values | `total_length_m` column (migration 0010) |
| `handleAuditDecision` (bot-audit.ts) | Post-commit, after hakkediş block | `enqueueAiFlag` in `ai-flag-queue.ts` |
| RouteTabClient | Add DxfUpload section + "As-Built" tab | `DxfUpload.tsx`, `ChainageTab.tsx` |
| Submission detail page `/dashboard/records/[id]` | Add `AiFlagCard` below existing fields | `getSubmissionAiFlag`, `AiFlagCard.tsx` |
| Existing export handlers pattern | Copy `auth()` + `runtime='nodejs'` + `Uint8Array` + `logOfficeActivity` | `/api/exports/chainage/route.ts` |
| Existing ExcelJS + `@react-pdf/renderer` in `src/lib/excel.ts` / `pdf.ts` | Add `buildChainageLedger` + `buildChainagePdf` functions | New functions in existing files |

### Tenant Scoping

All new queries must include `eq(table.tenantId, getDefaultTenantId())` — same as every existing query. `submission_ai_flags` carries `tenant_id` nullable (same pattern as `submissions`) and is always filtered via the JOIN to `submissions` which is tenant-scoped.

### Money Math

No monetary values in v4.0 additions. Chainage quantities are `numeric(12,3)` — same type as `submissions.quantity`. All aggregations use `sum()` in SQL (never float arithmetic in application code). This is consistent with the existing money-math discipline.

---

## Confidence Notes

| Area | Confidence | Basis |
|------|------------|-------|
| DXF → Node.js runtime placement | HIGH | Read `webhook/route.ts` — established `runtime='nodejs'` pattern; `dxf-parser` + `proj4` both npm packages, no edge constraint |
| `segment_fraction * total_length_m` chainage derivation | HIGH | Read `submissions.ts` schema — `segment_fraction numeric(10,8)` is ST_LineLocatePoint result; PostGIS `ST_Length(::geography)` is metre-accurate |
| No `route_segments` table | HIGH | The existing [0,1] fraction is the correct linear-referencing primitive; verified by reading spatial.ts and submissions schema |
| `enqueueAiFlag` post-commit fire-and-forget | HIGH | Read `bot-audit.ts` — established best-effort post-commit pattern for hakedis, worker notification; no `after()` or session in bot path |
| `eval_passed` gate before showing flags | HIGH | PROJECT.md explicitly states "eval rigor required since AI is in v1" and "AI-01..AI-05 acceptance criteria" |
| DXF library selection (`dxf-parser` + `proj4`) | MEDIUM | Reasonable npm packages for this use case; specific API compatibility with current versions needs verification during implementation phase |
| Cron-based retry guarantee | MEDIUM | Vercel cron is a real primitive; the exact cold-start/warm behavior of fire-and-forget Promises in Vercel serverless functions is not guaranteed — cron is the safety net |

---

*Architecture research for: bayrak.ai v4.0 integration design*
*Researched: 2026-05-29*
