# Phase 15: Chainage As-Built View + Approval Snapshot — Research

**Researched:** 2026-05-30
**Domain:** PostGIS linear-referencing snapshot, Drizzle sql-template aggregation, Next.js App Router RSC+client tab pattern, ExcelJS + @react-pdf/renderer export, Telegram bot post-commit hook
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Bucket size is engineer-selectable, defaulting to 1 km (1000 m), with a toggle for 500 m / 100 m. `getChainageBuckets` takes `bucketSizeM` param; completion % denominator and colour bar recompute against the selected granularity.
- **D-02:** Route completion % = (count of buckets with ≥1 approved submission) ÷ (total buckets spanning the route length), clamped at 100%. Total buckets = `ceil(total_length_m / bucketSizeM)`.
- **D-03:** As-built strip is table-first with a thin colour-coded chainage bar across the top. CSS flex only — no charting library.
- **D-04:** Three-state per bucket: ≥1 approved → approved (green); else ≥1 pending_audit → in progress (amber); else → not started (grey).
- **Chainage snapshot at approval:** `chainage_m = ROUND(segment_fraction × total_length_m, 2)` + `route_geometry_version` in SAME transaction as `status='approved'`.
- **One-time backfill migration:** UPDATE existing approved submissions' `chainage_m` from current route geometry; marked as estimated. NEW migration (0013), applied to BOTH branches via tsx.
- **Calibration consistency:** `chainage_offset_m` on `routes`; applied as `calibrated_chainage_m = chainage_m + offset` across dashboard strip, Telegram notifications, Excel/PDF exports.
- **Chainage display:** Turkish stationing "km X+YYY" everywhere.
- **Export:** `GET /api/exports/chainage` reusing Phase 11 skeleton. Excel columns fixed: Km Başlangıç, Km Bitiş, İş Adedi, Malzeme, Miktar, Birim, İşçi, Denetçi. PDF matches hakkediş certificate aesthetic.
- **Folded todo `submission-detail-map-link`:** extend `getCanonicalSubmissions` + `CanonicalSubmission` with snapped-point lat/lon; render Google Maps link in `SubmissionDetailView.tsx`.

### Claude's Discretion
- Exact granularity-toggle control (segmented control vs select).
- Colour-bar implementation (prefer CSS, no charting dep).
- Whether the colour bar segments are clickable (table rows are the primary drill-down per CHN-05).
- Where the calibration offset input lives (As-Built tab vs route metadata card) — UI-SPEC resolves this: calibration goes inside the As-Built tab, below the KPI row.

### Deferred Ideas (OUT OF SCOPE)
- Anchor-on-map calibration UX (pick GPS point, enter known station, system solves offset) → v4.x.
- Chainage-aware AI anomaly flag → v5.
- Time-chainage / Gantt overlay → v5.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHN-01 | Every point along the route has a chainage value derived from cumulative length from route start (km 0 = start) | Derived from `segment_fraction × total_length_m`; `total_length_m` already materialized on `routes` (Phase 14 migration 0010) |
| CHN-02 | Office engineer can calibrate chainage by anchoring a known station value | `chainage_offset_m` on `routes` (Phase 14); `setChainageOffset` Server Action + `ChainageOffsetForm` client component |
| CHN-03 | Each approved submission's chainage is snapshotted at auditor approval (immutable) | Write `chainage_m` + `route_geometry_version` inside `handleAuditDecision` approval transaction |
| CHN-04 | Per-km as-built strip: status, work, worker, auditor per segment | `getChainageBuckets` + `ChainageTab.tsx` RSC + `ChainageTable.tsx` client; D-03 table-first + colour bar |
| CHN-05 | Selecting a chainage segment drills to underlying submissions | "Detay →" link to `/dashboard/records/[firstSubmissionId]?from=asbuilt`; back-link in `SubmissionDetailView` |
| CHN-06 | Per-segment approved work feeds route completion % | D-02 covered-buckets / total-buckets formula; KpiCard in ChainageTab |
| CHN-07 | Per-km as-built breakdown exportable to Excel/PDF | `GET /api/exports/chainage` Route Handler; ExcelJS + @react-pdf/renderer; mirrors Phase 11 submissions export skeleton |
</phase_requirements>

---

## Summary

Phase 15 has three integration domains: (1) a one-line surgical modification to `handleAuditDecision` to write `chainage_m` and `route_geometry_version` inside the existing approval transaction; (2) a new `getChainageBuckets` Server Action doing Postgres-side GROUP BY aggregation with full attribution; and (3) new UI surfaces: As-Built tab, calibration form, colour bar, and chainage export route handler. All patterns exist verbatim in the codebase: the approval hook placement mirrors Phase 12's `recomputeHakedisLine` insertion point, the aggregation query mirrors Phases 4, 9, and 10 Drizzle `sql` template patterns, and the export route handler mirrors the Phase 11 submissions export skeleton byte-for-byte.

The non-trivial mechanics are: (a) enumerating empty (not-started) buckets via `generate_series` so the colour bar has correct proportions; (b) computing the three-state bucket status (approved / in-progress / not-started) requiring a conditional aggregate over both `approved` and `pending_audit` submissions; (c) applying `chainage_offset_m` consistently in every Postgres query and export so all three surfaces show the same calibrated value. The backfill migration (migration 0013) is straightforward but must be new and additive — must not edit 0010–0012.

The folded `submission-detail-map-link` todo is additive: extend `CanonicalSubmission` with nullable `snappedLat` + `snappedLon` from `ST_X`/`ST_Y`, render a Google Maps anchor only when both are non-null.

**Primary recommendation:** Write `chainage_m` snapshot code in `handleAuditDecision` first (Wave 0 / migration wave), then backfill migration, then `getChainageBuckets`, then UI, then export — in that order to ensure each wave has real data to test against.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Chainage snapshot at approval | API / Backend (bot webhook, Neon DB) | — | Writes to DB inside approval TX; no browser involved |
| Backfill migration | Database / Storage | — | Additive UPDATE migration; run via `npx tsx src/db/migrate.ts` |
| `getChainageBuckets` aggregation | API / Backend (Server Action) | — | Heavy GROUP BY + JSON_AGG; must not run on client |
| `setChainageOffset` | API / Backend (Server Action) | — | Auth-guarded DB write; no edge |
| `ChainageTab` (RSC) | Frontend Server (SSR) | — | Calls Server Actions at render time; no client state |
| `ChainageTable`, `ChainageOffsetForm`, granularity toggle | Browser / Client | — | State (bucketSizeM, offset form input), `useTransition` |
| Chainage colour bar | Browser / Client | — | Pure CSS flex rendering, no server involvement |
| `GET /api/exports/chainage` | API / Backend (Route Handler) | — | `runtime='nodejs'`, ExcelJS + @react-pdf/renderer |
| `formatChainage` utility | Browser + Server | — | Pure function; shared across RSC, client, export |
| Map link in SubmissionDetailView | Browser / Client | — | Plain anchor element; data extended from Server Action |
| `getCanonicalSubmissions` extension | API / Backend (Server Action) | — | Add ST_X/ST_Y columns; tenant-scoped |

---

## Standard Stack

### Core (all already installed — Phase 15 installs NOTHING new)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.x (installed) | `sql` template for GROUP BY aggregation | [ASSUMED] — confirmed installed in codebase |
| @neondatabase/serverless | installed | WebSocket pool for approval transaction | Required for `db.transaction()` — neon-http throws on transactions |
| ExcelJS | installed | Chainage Excel workbook | Already used in Phase 11 `buildSubmissionLedger` |
| @react-pdf/renderer | installed (4.5.1) | Chainage PDF via `renderToBuffer` | Already used in Phase 11 `hakedis-pdf.tsx` |
| next-intl | 4.12.x (installed) | TR/EN i18n keys for As-Built tab | Already used across all tabs |

### No New Dependencies

Phase 15 installs zero new packages. Every capability reuses libraries already in the project.

**Installation:** `npm install` — nothing to add.

---

## Package Legitimacy Audit

No packages are installed in this phase. All capabilities use existing dependencies confirmed in the Phase 11–14 codebase.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Telegram: auditor taps Approve
  → handleAuditDecision (src/lib/bot-audit.ts)
      ┌── txDb.transaction ─────────────────────────────────────┐
      │  UPDATE submissions SET status='approved',              │
      │    chainage_m = ROUND(segment_fraction * total_length_m, 2),  ← NEW (Phase 15)
      │    route_geometry_version = routes.geometry_version     │    ← NEW (Phase 15)
      └────────────────────────────────────────────────────────┘
      → recomputeHakedisLine (existing, best-effort)
      → editAllSiblingMessages (existing)
      → worker notification (existing)
      → [Phase 16 will add enqueueAiFlag here]
  → 200 OK

Office dashboard: /dashboard/projects/[id]?tab=asbuilt
  Browser
    → ChainageTab.tsx (RSC)
        Promise.all([
          getChainageBuckets(projectId, bucketSizeM),   ← NEW Server Action
          getRoute(projectId),
        ])
        → ChainageTable.tsx (client, 'use client')
            state: bucketSizeM (1000 | 500 | 100)
            ├── KPI row: completion %, approved km, total km
            ├── ChainageOffsetForm.tsx
            │     → setChainageOffset Server Action  ← NEW
            │     → router.refresh() on success
            ├── Granularity toggle (three BrandButtons)
            │     → useTransition → re-call getChainageBuckets
            ├── Colour bar (CSS flex divs, no charting lib)
            └── BrandTable: one row per bucket
                  → "Detay →" link → /dashboard/records/[submissionId]?from=asbuilt

GET /api/exports/chainage?projectId=&format=xlsx|pdf&bucketSizeM=
  → auth() guard → 401 if no session
  → getChainageBuckets(projectId, bucketSizeM)
  → buildChainageLedger() (ExcelJS) | renderChainagePdf() (@react-pdf/renderer)
  → NextResponse(new Uint8Array(buffer))

src/actions/analytics.ts: getCanonicalSubmissions (MODIFIED)
  → adds ST_X(snapped_point) AS snapped_lat, ST_Y(snapped_point) AS snapped_lon
src/lib/types/canonical-submission.ts (MODIFIED)
  → adds snappedLat: number | null, snappedLon: number | null
src/components/admin/SubmissionDetailView.tsx (MODIFIED)
  → renders Google Maps link when snappedLat + snappedLon non-null
```

### Recommended Project Structure (new files only)

```
src/
├── actions/
│   └── chainage.ts        # getChainageBuckets, setChainageOffset [NEW]
├── lib/
│   ├── format-chainage.ts # formatChainage(m: number): string [NEW]
│   └── pdf/
│       └── chainage-pdf.tsx  # ChainagePdf + renderChainagePdf [NEW]
├── components/
│   └── dashboard/
│       ├── ChainageTab.tsx         # RSC data shell [NEW]
│       ├── ChainageTable.tsx       # client: colour bar + table + export buttons [NEW]
│       └── ChainageOffsetForm.tsx  # client: calibration input [NEW]
├── app/
│   └── api/
│       └── exports/
│           └── chainage/
│               └── route.ts        # [NEW]
└── db/
    └── migrations/
        └── 0013_v4_chainage_backfill.sql  # [NEW — additive UPDATE]
```

### Pattern 1: Chainage Snapshot Inside the Approval Transaction

**What:** Write `chainage_m` and `route_geometry_version` inside the existing `txDb.transaction` block in `handleAuditDecision`, in the same `UPDATE submissions SET ...` call that flips `status = 'approved'`.

**Why:** The chainage must be immutable-at-approval. Writing it in the same transaction as the status flip means there is no window where status is `approved` but `chainage_m` is NULL.

**Where in the file:** After `decidedAt: new Date()` and before `.returning(...)`. The route data (`total_length_m`, `geometry_version`) must be joined or fetched inside the transaction.

**The decision: stored `segment_fraction × total_length_m` vs recompute via ST_LineLocatePoint.**

After studying both approaches:
- The submission already has `snapped_point` (geometry) and `segment_fraction` (numeric(10,8)) stored at submission time (Phase 4).
- `total_length_m` and `geometry_version` are on the `routes` row for the project.
- Using **stored `segment_fraction × total_length_m`** is correct and sufficient. The fraction was computed via `ST_LineLocatePoint` at submission time against the geometry that was current then. Recomputing `ST_LineLocatePoint(current_route_geom, snapped_point)` at approval time would produce a slightly different result if the route was re-imported between submission and approval — which is exactly the version-drift scenario Pitfall 2 guards against.
- Therefore: use `ROUND(segment_fraction * total_length_m, 2)` from the stored fraction × the route's current `total_length_m`. The `route_geometry_version` captures which route version was active at approval time.

**Concrete implementation inside the approval transaction:**

```typescript
// Inside txDb.transaction(async (tx) => { ... })
// After the submissions UPDATE .returning():

// Fetch route data for chainage snapshot (within the same transaction = consistent read)
const { routes: rte } = await import('@/db/schema/routes');
const routeRows = await tx
  .select({
    totalLengthM: rte.totalLengthM,
    geometryVersion: rte.geometryVersion,
  })
  .from(rte)
  .where(eq2(rte.projectId, submission.projectId))   // submission.projectId from pre-auth lookup
  .limit(1);

const routeRow = routeRows[0];
const chainageM = routeRow?.totalLengthM && affected[0].segmentFraction
  ? sql2`ROUND(${affected[0].segmentFraction}::numeric * ${routeRow.totalLengthM}::numeric, 2)`
  : null;

await tx
  .update(sub2)
  .set({
    chainageM: chainageM,
    routeGeometryVersion: routeRow?.geometryVersion ?? null,
  })
  .where(eq2(sub2.id, submissionId));
```

However: the `.returning()` from the first UPDATE only returns `id`, `quantity`, `boqItemId` — it does NOT return `segmentFraction` or `projectId`. A cleaner approach is to include `segmentFraction` and `projectId` in the `.returning()` and then do the second UPDATE with computed values. OR: do a single UPDATE with a subquery join.

**Simplest correct approach — single UPDATE with subquery:**

```typescript
// Source: Pattern derived from existing bot-audit.ts transaction discipline
// [ASSUMED] — exact Drizzle sql template syntax

await tx.update(sub2).set({
  status: 'approved',
  decidedBy: auditorPerson.id,
  decidedAt: new Date(),
  chainageM: sql2`ROUND(
    (SELECT s2.segment_fraction FROM submissions s2 WHERE s2.id = ${submissionId}) *
    (SELECT r.total_length_m FROM routes r WHERE r.project_id = (
      SELECT s3.project_id FROM submissions s3 WHERE s3.id = ${submissionId}
    )),
  2)`,
  routeGeometryVersion: sql2`(SELECT r2.geometry_version FROM routes r2 WHERE r2.project_id = (
    SELECT s4.project_id FROM submissions s4 WHERE s4.id = ${submissionId}
  ))`,
}).where(and2(eq2(sub2.id, submissionId), eq2(sub2.status, 'pending_audit')))
.returning({ id: sub2.id, quantity: sub2.quantity, boqItemId: sub2.boqItemId });
```

**Recommended cleaner approach — return segmentFraction + projectId from first UPDATE, then compute:**

```typescript
// Step 1: UPDATE with RETURNING that includes segment_fraction + project_id
const affected = await tx
  .update(sub2)
  .set({ status: 'approved', decidedBy: auditorPerson.id, decidedAt: new Date() })
  .where(and2(eq2(sub2.id, submissionId), eq2(sub2.status, 'pending_audit')))
  .returning({
    id: sub2.id,
    quantity: sub2.quantity,
    boqItemId: sub2.boqItemId,
    segmentFraction: sub2.segmentFraction,   // ADD to returning
    projectId: sub2.projectId,               // ADD to returning
  });

if (affected.length === 0) throw new AlreadyResolvedError();

// Step 2: fetch route snapshot within same transaction
const routeRows = await tx
  .select({ totalLengthM: routes.totalLengthM, geometryVersion: routes.geometryVersion })
  .from(routes)
  .where(eq2(routes.projectId, affected[0].projectId))
  .limit(1);

const route = routeRows[0];

// Step 3: write chainage snapshot (second UPDATE, same TX)
if (route?.totalLengthM && affected[0].segmentFraction) {
  const frac = Number(affected[0].segmentFraction);
  const len = Number(route.totalLengthM);
  const chainageM = String(Math.round(frac * len * 100) / 100); // ROUND to 2 dp in JS numeric
  await tx
    .update(sub2)
    .set({
      chainageM: chainageM,
      routeGeometryVersion: route.geometryVersion,
    })
    .where(eq2(sub2.id, submissionId));
}
```

**IMPORTANT:** The JS-side `Math.round(frac * len * 100) / 100` introduces IEEE 754 risk for the rounding step. The safest approach is to pass `segment_fraction` and `total_length_m` as Postgres `numeric` strings and let Postgres do the `ROUND(..., 2)`. Use:

```typescript
chainageM: sql2`ROUND(${affected[0].segmentFraction}::numeric * ${route.totalLengthM}::numeric, 2)`,
```

This guarantees Postgres-side decimal arithmetic — consistent with the project's money-math discipline (v2.0 decision: never float arithmetic in JS for numeric values).

**Bot path constraints (Pitfall 5 — confirmed by code inspection):**
- Never call `auth()`, `logOfficeActivity`, or `after()` from `bot-audit.ts`.
- Never import `auth` from `@/lib/auth` in this path.
- The chainage write uses the existing `txDb` transaction pool — same pool already used for the approval UPDATE.

### Pattern 2: Backfill Migration (migration 0013)

**What:** Additive UPDATE migration for existing approved submissions that have `chainage_m IS NULL`.

**Critical constraint:** Must NOT edit 0010–0012 (applied, hash-locked). New file: `0013_v4_chainage_backfill.sql`.

```sql
-- 0013_v4_chainage_backfill.sql
-- HAND-WRITTEN: backfill chainage_m for existing approved submissions.
-- These are ESTIMATED values (not true snapshots) — they use current route geometry.
-- A true snapshot would require the route geometry at the time of approval,
-- which was not stored for pre-Phase-15 approvals.
-- Applied via: npx tsx src/db/migrate.ts (D-49 — never drizzle-kit push)
-- Applied to BOTH Neon branches: dev (neondb) + test (neondb_test).
UPDATE submissions s
SET
  chainage_m = ROUND(
    s.segment_fraction::numeric * r.total_length_m::numeric,
  2),
  route_geometry_version = r.geometry_version
FROM routes r
WHERE r.project_id = s.project_id
  AND s.status = 'approved'
  AND s.chainage_m IS NULL
  AND s.segment_fraction IS NOT NULL
  AND r.total_length_m IS NOT NULL;
-- NOTE: statement-breakpoint not needed here — single DML statement.
-- NOTE: submissions with segment_fraction IS NULL (no_route status) are left NULL — correct.
```

**Apply command (both branches, in order):**
```bash
npx tsx src/db/migrate.ts                         # dev branch (DATABASE_URL)
DATABASE_URL=$DATABASE_URL_TEST npx tsx src/db/migrate.ts  # test branch
```

### Pattern 3: `getChainageBuckets` Server Action

**What:** Postgres GROUP BY aggregation returning per-bucket attribution with empty bucket enumeration.

**Key design challenge — three-state status per bucket:**

The D-04 three-state rule requires querying BOTH `approved` AND `pending_audit` submissions to determine bucket status. The bucket status is: approved ≥ 1 → approved; else pending_audit ≥ 1 → in-progress; else → not started.

**Empty bucket enumeration with `generate_series`:**

The colour bar requires ALL buckets (including not-started) to have correct proportions. Without `generate_series`, buckets with no submissions are absent from GROUP BY output.

**Complete query design (Drizzle `sql` template pattern):**

```typescript
// Source: [ASSUMED] — derived from ARCHITECTURE.md + Drizzle patterns in Phases 4, 9, 10
// Confirmed pattern: sql`...` tag with ${param} interpolation as bound params

type ChainageBucket = {
  bucketIndex: number;       // 0-based index; bucketStart = bucketIndex * bucketSizeM
  bucketStart: number;       // calibrated metres
  bucketEnd: number;         // calibrated metres
  status: 'approved' | 'in_progress' | 'not_started';
  approvedCount: number;
  pendingCount: number;
  boqBreakdown: Array<{ material: string; unit: string; quantity: number }>;
  workers: string[];
  auditors: string[];
  firstSubmissionId: string | null;  // for "Detay →" link
};

const bucketSizeM = params.bucketSizeM ?? 1000;

const rows = await db.execute(sql`
  WITH
  -- Generate all bucket indices covering the full route length
  all_buckets AS (
    SELECT generate_series(0, CEIL(r.total_length_m / ${bucketSizeM})::int - 1) AS bucket_idx
    FROM routes r
    WHERE r.project_id = ${projectId}
      AND r.tenant_id = ${tenantId}
    LIMIT 1
  ),
  -- Aggregate submissions per bucket (both approved and pending_audit)
  sub_agg AS (
    SELECT
      FLOOR((s.chainage_m + r.chainage_offset_m) / ${bucketSizeM})::int AS bucket_idx,
      COUNT(*) FILTER (WHERE s.status = 'approved') AS approved_count,
      COUNT(*) FILTER (WHERE s.status = 'pending_audit') AS pending_count,
      -- BOQ breakdown for approved submissions only
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'material', b.material,
          'unit', b.unit,
          'quantity', s.quantity
        )
      ) FILTER (WHERE s.status = 'approved') AS boq_rows,
      -- Worker names (approved submissions only)
      ARRAY_AGG(DISTINCT pw.display_name) FILTER (WHERE s.status = 'approved' AND pw.display_name IS NOT NULL) AS worker_names,
      -- Auditor names (approved submissions only)
      ARRAY_AGG(DISTINCT pa.display_name) FILTER (WHERE s.status = 'approved' AND pa.display_name IS NOT NULL) AS auditor_names,
      -- First submission ID for drill-down link (approved first, fall back to pending)
      MIN(s.id) FILTER (WHERE s.status = 'approved') AS first_approved_id,
      MIN(s.id) FILTER (WHERE s.status = 'pending_audit') AS first_pending_id
    FROM submissions s
    JOIN routes r ON r.project_id = s.project_id
    JOIN boq_items b ON b.id = s.boq_item_id
    JOIN people pw ON pw.id = s.person_id
    LEFT JOIN people pa ON pa.id = s.decided_by
    WHERE s.project_id = ${projectId}
      AND s.tenant_id = ${tenantId}
      AND s.status IN ('approved', 'pending_audit')
      AND s.chainage_m IS NOT NULL
    GROUP BY FLOOR((s.chainage_m + r.chainage_offset_m) / ${bucketSizeM})::int
  )
  SELECT
    ab.bucket_idx,
    ab.bucket_idx * ${bucketSizeM} AS bucket_start,
    (ab.bucket_idx + 1) * ${bucketSizeM} AS bucket_end,
    COALESCE(sa.approved_count, 0) AS approved_count,
    COALESCE(sa.pending_count, 0) AS pending_count,
    sa.boq_rows,
    sa.worker_names,
    sa.auditor_names,
    COALESCE(sa.first_approved_id, sa.first_pending_id) AS first_submission_id
  FROM all_buckets ab
  LEFT JOIN sub_agg sa ON sa.bucket_idx = ab.bucket_idx
  ORDER BY ab.bucket_idx
`);
```

**Calibration application:**
The `chainage_offset_m` from `routes` is applied in the `FLOOR((s.chainage_m + r.chainage_offset_m) / ${bucketSizeM})` expression. This ensures all three surfaces (dashboard, Telegram, export) use the same offset. The `bucketStart` and `bucketEnd` in the result are also calibrated (`bucket_idx * bucketSizeM` where the bucket_idx was derived using the offset).

**Completion % computation (D-02):**
```typescript
const totalBuckets = Math.ceil(totalLengthM / bucketSizeM);
const coveredBuckets = rows.filter(r => r.approved_count > 0).length;
const completionPct = Math.min(100, Math.round((coveredBuckets / totalBuckets) * 100));
```

**Note on chainage_m NULL for pending submissions:**
Pending submissions do NOT have `chainage_m` set (it is only written at approval). For in-progress bucket detection, we need to derive a dynamic chainage for pending submissions at query time: `FLOOR((s.segment_fraction * r.total_length_m + r.chainage_offset_m) / bucketSizeM)`. The sub_agg query above must handle this:

```sql
-- For approved: use stored chainage_m (immutable snapshot)
-- For pending: derive dynamically from segment_fraction * total_length_m
FLOOR((
  COALESCE(s.chainage_m, s.segment_fraction * r.total_length_m) + r.chainage_offset_m
) / ${bucketSizeM})::int AS bucket_idx
```

This distinction is critical: approved rows read from the immutable snapshot; pending rows compute dynamically. Only pending rows with a non-null `segment_fraction` can be bucketed (those with `location_match = 'no_route'` will have null `segment_fraction` and be excluded by the IS NOT NULL guard).

**Updated WHERE clause:**
```sql
AND (s.chainage_m IS NOT NULL OR (s.status = 'pending_audit' AND s.segment_fraction IS NOT NULL))
```

### Pattern 4: `setChainageOffset` Server Action

```typescript
// Source: [ASSUMED] — derived from existing Server Action patterns in routes.ts / boq.ts
'use server';

export async function setChainageOffset(projectId: string, offsetM: number) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  // ownership check (same pattern as uploadRoute)
  await db
    .update(routes)
    .set({ chainageOffsetM: String(offsetM) })  // store as string for numeric precision
    .where(and(eq(routes.projectId, projectId), eq(routes.tenantId, getDefaultTenantId())));
  // logOfficeActivity + revalidatePath
  logOfficeActivity({ ... });
  revalidatePath(`/dashboard/projects/${projectId}`);
}
```

**No recompute of stored `chainage_m`:** The stored snapshot (`chainage_m`) is raw metres, never includes the offset. The offset is applied at query time in `getChainageBuckets` and at display time via `formatChainage(row.bucketStart)`. This is consistent with the CONTEXT.md locked decision.

### Pattern 5: `formatChainage` Utility

```typescript
// Source: 15-UI-SPEC.md §Copywriting Contract — verbatim
// [CITED: .planning/phases/15-chainage-as-built-view-approval-snapshot/15-UI-SPEC.md]
// Location: src/lib/format-chainage.ts (new file, shared across RSC, client, export)

export function formatChainage(m: number): string {
  const km = Math.floor(m / 1000);
  const remainder = Math.round(m % 1000).toString().padStart(3, '0');
  return `km ${km}+${remainder}`;
}
```

This is a pure function with no dependencies. Used in `ChainageTable.tsx` (client), `buildChainageLedger` (Excel), `renderChainagePdf` (PDF), and the Telegram notification line (if Phase 15 adds one).

**Note on Telegram notification:** The CONTEXT.md §Carried Forward mentions calibration should be applied in "Telegram notifications for NEW approvals." However, `handleAuditDecision` currently does NOT send a chainage line in the worker approval message (confirmed by reading `MESSAGES.workerApproved` usage). Adding a chainage line to the worker notification is optional — if done, format as `formatChainage(Number(chainageM) + Number(chainageOffsetM))`. This should be planned as a separate task within the approval-snapshot wave.

### Pattern 6: Export Route Handler

The Phase 11 submissions export skeleton is the exact template:

```
auth() first → 401 JSON (not redirect) on null session
Parse query params: projectId, format (xlsx|pdf), bucketSizeM
Fetch data: getChainageBuckets(projectId, bucketSizeM)
Build buffer: buildChainageLedger(rows) | renderChainagePdf(data)
Return: new NextResponse(new Uint8Array(buffer), { headers })
Fire-and-forget: logOfficeActivity(...) — NOT awaited
```

**Key differences from submissions export:**
- This handler calls the `getChainageBuckets` Server Action (or a shared data function) — but Route Handlers cannot call Server Actions directly. The pattern is to extract the DB query into a shared helper and call it from both the Server Action and the Route Handler.
- Excel columns (fixed by CONTEXT.md): Km Başlangıç | Km Bitiş | İş Adedi | Malzeme | Miktar | Birim | İşçi | Denetçi.
- PDF: mirror `hakedis-pdf.tsx` structure — `Document > Page > View (header) > View (table rows)`. New file: `src/lib/pdf/chainage-pdf.tsx`.

**Shared data layer:** Create `src/lib/chainage-data.ts` (or co-locate in `src/actions/chainage.ts`) exporting a `fetchChainageBuckets(projectId, bucketSizeM, tenantId)` function that takes `tenantId` as a parameter instead of calling `getDefaultTenantId()` + `auth()` internally, so it can be called from both the Server Action and the Route Handler.

### Pattern 7: As-Built Tab Integration (project page)

The existing `ProjectDetailPage` tab pattern (confirmed by reading `src/app/dashboard/projects/[id]/page.tsx`):

1. Add `tab === 'asbuilt' ? 'asbuilt' : ...` to the `activeTab` ternary.
2. Add a `TabsTrigger value="asbuilt"` with a `Link href=...?tab=asbuilt` inside.
3. Add a `TabsContent value="asbuilt"` rendering `<ChainageTab projectId={id} />` inside a `BrandCard`.
4. Add `asbuilt` to the i18n key `dashboard.projects.tab_asbuilt`.

**No restructuring of existing tabs** — purely additive.

### Pattern 8: Google Maps Link in SubmissionDetailView (folded todo)

**What changes:**

1. `CanonicalSubmission` type (`src/lib/types/canonical-submission.ts`): add `snappedLat: number | null`, `snappedLon: number | null`.
2. `getCanonicalSubmissions` (`src/actions/analytics.ts`): add `ST_X(s.snapped_point) AS snapped_lat` and `ST_Y(s.snapped_point) AS snapped_lon` to the SELECT. These return `null` when `snapped_point IS NULL` (no_route submissions). Serialize as `Number(r.snappedLat)` (or `null`).
3. `SubmissionDetailView.tsx`: In the Location `<dd>`, after the distance/warning badge, add:
   ```tsx
   {submission.snappedLat != null && submission.snappedLon != null && (
     <a
       href={`https://www.google.com/maps?q=${submission.snappedLat},${submission.snappedLon}`}
       target="_blank"
       rel="noopener noreferrer"
       className="inline-flex items-center gap-1 text-xs text-primary underline"
     >
       <MapPin className="size-3" aria-hidden="true" />
       {t('view_on_map')}
     </a>
   )}
   ```

The existing `SubmissionDetailView.tsx` already imports `MapPin` from lucide-react (confirmed: line 34). The `t('view_on_map')` key is new — add to both `en.json` and `tr.json` under `dashboard.records.view_on_map`.

**Coordinate precision:** `ST_X`/`ST_Y` return double-precision float. Serialize to `Number()` is correct — coordinates do not require decimal.js (they are not money values). Verify these return the correct WGS84 order: `ST_X` = longitude, `ST_Y` = latitude. The Google Maps link requires `?q=lat,lon`, so pass `?q=${snappedLat},${snappedLon}` where `snappedLat = ST_Y(...)` and `snappedLon = ST_X(...)`. **This axis order must not be confused.**

**Confirmed:** `snapped_point` is stored as `geometry(point, 4326)` with `ST_MakePoint(longitude, latitude)` (Phase 4 decision, confirmed in STATE.md). Therefore: `ST_X(snapped_point) = longitude` and `ST_Y(snapped_point) = latitude`. The Google Maps link must be `?q=${ST_Y(snapped_point)},${ST_X(snapped_point)}`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Empty bucket enumeration | JS loop filling missing buckets after GROUP BY | `generate_series` in Postgres | Single query, correct proportions, no N+1 |
| Turkish decimal number formatting | `parseFloat().toString()` | `Intl.NumberFormat('tr-TR')` | Turkish uses comma as decimal separator |
| "km X+YYY" formatting | Inline ternary in JSX | `formatChainage(m)` shared util | All three surfaces must agree exactly |
| PDF rendering | Raw HTML/CSS PDF | `@react-pdf/renderer` + `renderToBuffer` | Already used in Phase 11; DejaVu fonts already registered |
| Colour bar | recharts / d3 / visx | CSS `flex` divs, `width: ${pct}%` | D-03 locked; ~60 KB bundle savings |
| Numeric DB values in JS arithmetic | `parseFloat(row.chainageM) * 2` | `sql` template for Postgres-side computation | Float drift on `numeric(10,2)` values |
| Chainage offset recompute on stored values | UPDATE all `chainage_m` values when offset changes | Apply offset at query time in Postgres `COALESCE(chainage_m, ...) + chainage_offset_m` | Offset changes are instant; no UPDATE needed |

**Key insight:** The chainage offset does NOT need to be written back to `chainage_m` on every change. The stored value is always raw arc-length metres. The offset is added at query time, display time, and export time. This keeps the historical snapshot immutable while allowing calibration to be changed instantly.

---

## Common Pitfalls

### Pitfall 1: Writing chainage_m OUTSIDE the approval transaction
**What goes wrong:** A second UPDATE to `chainage_m` after the transaction commits means there is a window where `status='approved'` but `chainage_m IS NULL`. If the process crashes between commits, the snapshot is permanently lost.
**How to avoid:** The chainage write and the status flip must be in the exact same `txDb.transaction()` block. Use a second `.update()` call within the same transaction after the RETURNING confirms the row was affected.
**Warning signs:** `submissions WHERE status='approved' AND chainage_m IS NULL` rows appearing after Phase 15 is deployed.

### Pitfall 2: Pending submissions have no chainage_m — bucketing them requires dynamic derivation
**What goes wrong:** The query filters `WHERE s.chainage_m IS NOT NULL` and misses all in-progress (pending_audit) submissions. The bucket status D-04 rule cannot identify "in-progress" buckets.
**How to avoid:** For pending submissions, compute chainage dynamically: `COALESCE(s.chainage_m, s.segment_fraction * r.total_length_m)`. Apply the offset to both: `COALESCE(s.chainage_m, s.segment_fraction * r.total_length_m) + r.chainage_offset_m`.
**Warning signs:** Buckets never show amber "in-progress" status even when pending submissions exist in that km range.

### Pitfall 3: generate_series produces too many buckets (off-by-one on final bucket)
**What goes wrong:** `generate_series(0, CEIL(12347.5 / 1000)::int - 1)` generates 13 buckets (indices 0..12). This is correct: the final bucket (index 12) covers 12000–12347.5 m. But the bucket_end displayed for the last bucket would be `13 × 1000 = 13000` m, not `12347.5` m.
**How to avoid:** In the TypeScript layer, cap `bucketEnd` at `totalLengthM` for the last bucket: `Math.min(bucket.bucketEnd, totalLengthM)`. Also: the completion % denominator uses `CEIL(totalLengthM / bucketSizeM)` which matches `generate_series` count — consistent.
**Warning signs:** Last bucket shows "km 12+000 – km 13+000" on a route that ends at km 12+347.

### Pitfall 4: Calibration offset applied in JavaScript instead of Postgres
**What goes wrong:** `bucketStart = row.bucketIndex * bucketSizeM + chainageOffsetM` applied in TypeScript after the query. The bucket INDEX was derived without the offset in Postgres, so two submissions 50m apart may land in different calibrated buckets from what they appear in when displayed.
**How to avoid:** Apply `chainage_offset_m` INSIDE the Postgres `FLOOR(... / bucketSizeM)` expression so bucket assignment and display are both based on calibrated chainage. The `generate_series` indices then represent calibrated km ranges directly.
**Warning signs:** Granularity toggle at 100 m shows different bucket assignments than expected based on the calibrated km values shown in the table.

### Pitfall 5: Google Maps link with swapped lat/lon
**What goes wrong:** `ST_X(snapped_point)` = longitude; `ST_Y(snapped_point)` = latitude. The Google Maps URL requires `?q=latitude,longitude`. Passing `?q=${ST_X},${ST_Y}` puts longitude first and the pin lands in the wrong location.
**How to avoid:** In `getCanonicalSubmissions`: `SELECT ST_Y(s.snapped_point) AS snapped_lat, ST_X(s.snapped_point) AS snapped_lon`. Name them explicitly with semantic meaning. Verify against a known submission coordinate.
**Warning signs:** Google Maps link opens but the pin is in a geographically incorrect location (often a mirror image across the equator or prime meridian axis).

### Pitfall 6: Route Handler calling Server Action directly
**What goes wrong:** The chainage export Route Handler at `GET /api/exports/chainage` tries to call `getChainageBuckets(...)` which is a `'use server'` Server Action. Route Handlers and Server Actions live in different execution contexts; calling a Server Action from a Route Handler fails silently or throws.
**How to avoid:** Extract the DB query logic into a shared helper function in `src/lib/chainage-data.ts` that accepts `tenantId` as an argument (instead of calling `getDefaultTenantId()` internally). Both the Server Action (`'use server'` wrapper + auth) and the Route Handler (`auth()` first + call the shared helper) call this function.
**Warning signs:** Export route returns empty data or crashes with "Cannot call Server Action from Route Handler" type error.

### Pitfall 7: Missing `-- > statement-breakpoint` in migration 0013
**What goes wrong:** The backfill migration 0013 contains a single UPDATE statement. If a future developer adds a second statement without the `-- > statement-breakpoint` separator, neon-http driver rejects multi-statement prepared calls (D-07-02 precedent, confirmed in 0010 migration comment).
**How to avoid:** Add the `-- > statement-breakpoint` comment rule to the migration file header. For the current single-statement backfill, no separator is needed — but document it so the next editor knows.

### Pitfall 8: Not-started buckets missing from colour bar
**What goes wrong:** The colour bar renders only buckets returned from the GROUP BY query. Buckets with no submissions are absent. The colour bar shows only 3 of 15 km as having any colour, with gaps — instead of a full-width bar with grey segments.
**How to avoid:** The `generate_series` LEFT JOIN approach described in Pattern 3 produces ALL bucket indices. The React colour bar renders all rows (including those with `approvedCount === 0` and `pendingCount === 0`) as grey segments.

---

## Runtime State Inventory

> Not applicable — this phase is additive (new columns are written for the first time; no rename or migration of existing non-null data). The backfill migration writes to previously-NULL columns.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `submissions.chainage_m` — currently NULL for all rows (Phase 14 added column but never wrote it) | Backfill migration 0013: UPDATE approved rows |
| Live service config | None | — |
| OS-registered state | None | — |
| Secrets/env vars | None — no new env vars needed | — |
| Build artifacts | None | — |

---

## Code Examples

### formatChainage — verified spec from 15-UI-SPEC.md

```typescript
// Source: [CITED: 15-UI-SPEC.md §Copywriting Contract]
export function formatChainage(m: number): string {
  const km = Math.floor(m / 1000);
  const remainder = Math.round(m % 1000).toString().padStart(3, '0');
  return `km ${km}+${remainder}`;
}
// Examples: formatChainage(0) = "km 0+000"
//           formatChainage(500) = "km 0+500"
//           formatChainage(1000) = "km 1+000"
//           formatChainage(2347) = "km 2+347"
//           formatChainage(12480) = "km 12+480"
```

### `handleAuditDecision` insertion point (confirmed by reading source)

```typescript
// Source: [VERIFIED: src/lib/bot-audit.ts lines 464–507]
// The chainage snapshot write goes BETWEEN the BOQ update and the hakkediş block:

// Inside txDb.transaction():
//   1. UPDATE submissions SET status='approved', decidedBy, decidedAt  ← existing
//   2. UPDATE boq_items SET approved_qty += quantity                    ← existing
//   3. [NEW Phase 15] fetch route totalLengthM + geometryVersion
//   4. [NEW Phase 15] UPDATE submissions SET chainage_m, route_geometry_version

// After txDb.transaction() (post-commit, in try/catch):
//   5. editAllSiblingMessages (existing)
//   6. recomputeHakedisLine (existing)
//   7. [Phase 16 will add enqueueAiFlag here]
//   8. worker notification (existing)
```

### Colour bar CSS (from 15-UI-SPEC.md)

```tsx
// Source: [CITED: 15-UI-SPEC.md §Chainage Colour Bar]
// No charting library. Pure CSS flex.
<div
  className="w-full h-2 rounded-full overflow-hidden border border-slate-200 my-3"
  role="img"
  aria-label="Güzergah tamamlanma durumu"
>
  {buckets.map((bucket, i) => (
    <div
      key={i}
      style={{ width: `${(1 / totalBuckets) * 100}%` }}
      className={
        bucket.status === 'approved'    ? 'bg-emerald-400' :
        bucket.status === 'in_progress' ? 'bg-amber-300'   :
        'bg-slate-200'
      }
    />
  ))}
</div>
```

### Export Route Handler skeleton (from Phase 11 pattern)

```typescript
// Source: [VERIFIED: src/app/api/exports/submissions/route.ts]
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const projectId = params.get('projectId') ?? '';
  const format = params.get('format') ?? 'xlsx';
  const bucketSizeM = Number(params.get('bucketSizeM') ?? '1000') || 1000;

  // Call shared data helper (NOT the Server Action directly)
  const { rows, totalLengthM, chainageOffsetM } = await fetchChainageBucketsForExport(
    projectId, bucketSizeM, getDefaultTenantId()
  );

  let buffer: Buffer;
  let contentType: string;
  let filename: string;

  if (format === 'pdf') {
    buffer = await renderChainagePdf({ rows, totalLengthM, generatedAt: new Date() });
    contentType = 'application/pdf';
    filename = `chainage-asbuilt-${projectId}.pdf`;
  } else {
    buffer = await buildChainageLedger(rows);
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    filename = `chainage-asbuilt-${projectId}.xlsx`;
  }

  const response = new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });

  logOfficeActivity({ actorUserId: session.user!.id!, actionType: 'chainage_exported', ... });
  return response;
}
```

### Drizzle `sql` pattern for Postgres-side ROUND (money-math discipline)

```typescript
// Source: [VERIFIED: existing pattern in bot-audit.ts lines 446-449]
// The existing BOQ update uses sql2`approved_qty + ${affected[0].quantity}`
// The chainage snapshot mirrors this pattern:
await tx.update(sub2).set({
  chainageM: sql2`ROUND(${affected[0].segmentFraction}::numeric * ${routeRow.totalLengthM}::numeric, 2)`,
  routeGeometryVersion: routeRow.geometryVersion,
}).where(eq2(sub2.id, submissionId));
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Derive chainage at read time from segment_fraction × route geom | Snapshot chainage_m at approval; derive only for pending display | RESOLVED in v4.0 research (2026-05-29) | Historical as-built is immutable; re-import cannot corrupt records |
| Chainage calibration as display-time offset in JS | chainage_offset_m stored in DB, applied in Postgres GROUP BY | Phase 14 schema + Phase 15 query | All surfaces (dashboard, Telegram, export) consistent |

**Deprecated/outdated:**
- Dynamic chainage computation at query time for approved submissions: Never compute `segment_fraction * total_length_m` in the as-built strip query for approved rows. Read `submissions.chainage_m` (the snapshot). The dynamic expression is only for pending rows.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The chainage snapshot should use stored `segment_fraction × total_length_m` (not recompute ST_LineLocatePoint at approval time) | Pattern 1 | Very low risk — this is consistent with the v4.0 RESOLVED decision and avoids geometry dependency at approval time |
| A2 | Two UPDATE calls within the same transaction (one for status/decidedBy/decidedAt, one for chainageM/routeGeometryVersion) is safe in Drizzle neon-serverless Pool | Pattern 1 | If Drizzle transaction doesn't allow multiple updates, collapse into a single UPDATE with all fields |
| A3 | `formatChainage` as a shared utility in `src/lib/format-chainage.ts` is importable from RSC, client components, and the PDF helper without circular dependencies | Pattern 5 | No risk — it has zero imports |
| A4 | The Route Handler at `/api/exports/chainage` can share the DB query logic with the Server Action via a shared `fetchChainageBucketsForExport` helper function (not calling the Server Action directly) | Pattern 6 | If wrong, restructure: inline the query in the Route Handler, or make getChainageBuckets work without 'use server' context |
| A5 | `ST_Y(snapped_point) = latitude` and `ST_X(snapped_point) = longitude` for WGS84 points stored as `ST_MakePoint(longitude, latitude)` | Pattern 8 | Verified by reading Phase 4 spatial conventions in STATE.md. Extremely low risk |
| A6 | `generate_series(0, CEIL(totalLengthM / bucketSizeM)::int - 1)` in a subquery joining `routes` WHERE `project_id = $1` LIMIT 1 correctly handles a project with no route (returns empty) | Pattern 3 | If no route exists, `getChainageBuckets` should return an empty array — the empty state renders `BrandEmpty` |

---

## Open Questions

1. **Telegram notification for chainage at approval**
   - What we know: CONTEXT.md §Carried Forward says "applying consistently to Telegram notifications for NEW approvals." The current `MESSAGES.workerApproved` is a fixed string, not parameterized.
   - What's unclear: Should Phase 15 add a chainage line to the worker's approval notification message? This requires passing `chainageM + chainageOffsetM` to the message builder.
   - Recommendation: Include a task to add chainage to the worker notification. It requires: (a) fetching `chainageOffsetM` from `routes` in the post-commit block, (b) extending `MESSAGES.workerApproved` to accept an optional chainage param, (c) calling `formatChainage(chainageM + offsetM)`.

2. **`getCanonicalSubmissions` coordinate extension impact**
   - What we know: `getCanonicalSubmissions` is used by analytics, export, and the detail page — all callers.
   - What's unclear: Adding `snappedLat` + `snappedLon` to the SELECT may increase row size marginally; does it affect any existing callers?
   - Recommendation: The columns are nullable and additive. All existing callers ignore unknown fields in TypeScript. No breaking change.

3. **Backfill migration 0013 — what if `total_length_m` is NULL for some routes?**
   - What we know: `total_length_m` was added in migration 0010 but only populated by `uploadRoute` calls AFTER Phase 14 was deployed. Pre-Phase-14 routes have `total_length_m IS NULL`.
   - What's unclear: Were any routes re-uploaded after Phase 14 deployment? If not, `total_length_m` may be NULL for the project route, making the backfill a no-op.
   - Recommendation: The backfill migration already guards with `AND r.total_length_m IS NOT NULL`. If `total_length_m` is NULL, those rows are left with `chainage_m IS NULL` and the phase-15 deployment of the approval snapshot path will populate them going forward. Add a verification step: `SELECT COUNT(*) FROM submissions WHERE status='approved' AND chainage_m IS NULL` — if non-zero after backfill, the route needs a re-upload to populate `total_length_m`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL `generate_series` | Empty bucket enumeration | ✓ | Built-in Postgres function | None — essential for correct colour bar |
| `@react-pdf/renderer` | Chainage PDF export | ✓ | 4.5.1 (confirmed installed) | — |
| ExcelJS | Chainage Excel export | ✓ | Installed (confirmed in src/lib/excel.ts) | — |
| DejaVu Sans fonts | PDF Turkish glyph rendering | ✓ | In `public/fonts/` (Phase 11) | — |
| Neon WebSocket pool (`@neondatabase/serverless`) | `getTxDb()` for approval transaction | ✓ | Installed (confirmed in bot-audit.ts) | — |

No missing dependencies.

---

## Validation Architecture

> `workflow.nyquist_validation: true` in `.planning/config.json` — section required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing, confirmed in project) |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `npx vitest run --reporter=verbose -t "chainage"` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHN-01 | `formatChainage(0)` = "km 0+000", `formatChainage(2347)` = "km 2+347", `formatChainage(12480)` = "km 12+480", `formatChainage(1000)` = "km 1+000" | unit | `npx vitest run -t "formatChainage"` | ❌ Wave 0 |
| CHN-02 | `setChainageOffset` Server Action writes `chainage_offset_m` to `routes`; `getChainageBuckets` applies offset in bucket start/end values | integration | `npx vitest run -t "chainage offset"` | ❌ Wave 0 |
| CHN-03 | After approval in integration test, `submissions.chainage_m` IS NOT NULL and equals expected value; `route_geometry_version` matches route's `geometry_version` | integration | `npx vitest run -t "chainage snapshot"` | ❌ Wave 0 |
| CHN-03 | Backfill migration 0013: after apply, `SELECT COUNT(*) FROM submissions WHERE status='approved' AND chainage_m IS NULL AND segment_fraction IS NOT NULL` = 0 | manual SQL check | `psql -c "SELECT ..."` | manual-only |
| CHN-04 | `getChainageBuckets` returns correct bucket count for a route of known length; each bucket has correct `bucketStart`/`bucketEnd`; not-started buckets are present | unit/integration | `npx vitest run -t "getChainageBuckets"` | ❌ Wave 0 |
| CHN-04 | D-04 three-state rule: bucket with 1 approved + 1 pending → status `approved`; bucket with 0 approved + 1 pending → status `in_progress`; bucket with 0 of each → status `not_started` | unit | `npx vitest run -t "bucket status"` | ❌ Wave 0 |
| CHN-06 | Completion % = covered buckets / total buckets × 100, clamped at 100 — test with all buckets covered + 1 submission over-covering 2 buckets | unit | `npx vitest run -t "completion"` | ❌ Wave 0 |
| CHN-06 | Over-completion clamp: route 1000 m with 2 submissions both in km 0–1 → completion = 100% (not 200%) | unit | `npx vitest run -t "completion clamp"` | ❌ Wave 0 |
| CHN-07 | Export route handler: `GET /api/exports/chainage?projectId=...&format=xlsx` returns 200 with correct Content-Type header | integration (manual) | manual-only | manual-only |
| CHN-07 | Excel output: sheet has 8 columns in correct order (Km Başlangıç, Km Bitiş, İş Adedi, Malzeme, Miktar, Birim, İşçi, Denetçi) | unit (ExcelJS parse) | `npx vitest run -t "chainage excel columns"` | ❌ Wave 0 |
| CHN-05 | Back-link in SubmissionDetailView renders when `searchParams.from === 'asbuilt'` | unit (render test) | manual-only — client component interaction | manual-only |
| Pitfall 5 | Calibration consistency: same `chainage_m + chainage_offset_m` value appears in dashboard bucketStart AND Excel export first column | integration (manual) | manual-only | manual-only |
| Pitfall 2 | Chainage snapshot boundary: exact 1000.0 m → bucket index 1 (not 0) | unit | `npx vitest run -t "bucket boundary"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose -t "chainage" -t "formatChainage" -t "completion"`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/chainage.test.ts` — covers CHN-01 (formatChainage), CHN-03 (snapshot integration), CHN-04 (bucket aggregation), CHN-06 (completion clamp), Pitfall 2 (boundary), Pitfall 7 (offset consistency)
- [ ] `tests/chainage.test.ts` — fixture: seed a route with `total_length_m = 3000`, seed 3 approved submissions at `segment_fraction` 0.166/0.5/0.833, verify bucket output
- [ ] No new framework install needed — vitest already configured

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `auth()` first in all Server Actions and Route Handler |
| V3 Session Management | no | No new sessions |
| V4 Access Control | yes | Tenant scope `eq(table.tenantId, getDefaultTenantId())` on all reads |
| V5 Input Validation | yes | `bucketSizeM` must be one of `[100, 500, 1000]` — whitelist validate in Server Action; `projectId` is a UUID — validate format before DB query |
| V6 Cryptography | no | No crypto in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR via projectId param | Information Disclosure | `eq(routes.tenantId, getDefaultTenantId())` on all queries; tenant scope enforced in data layer |
| SQL injection via bucketSizeM | Tampering | Whitelist validate: only accept `100 \| 500 \| 1000`; Drizzle `${bucketSizeM}` interpolation is bound params (not string concat) |
| Export access without auth | Elevation of Privilege | `auth()` first in Route Handler; 401 JSON (not redirect) |
| Reverse tabnabbing via Google Maps link | Repudiation | `rel="noopener noreferrer"` on all `target="_blank"` anchors — already established pattern in existing SubmissionDetailView |
| Excel formula injection via material/worker names | Tampering | Apply `sanitizeExcelCell()` (existing util in `src/lib/excel.ts`) to all string values written to Excel cells |

---

## Project Constraints (from CLAUDE.md)

| Directive | Applies to Phase 15 |
|-----------|---------------------|
| Tech stack: Next.js App Router + Node.js route handlers | Export handler uses `runtime='nodejs'` |
| Database: PostgreSQL + PostGIS on Neon | All spatial queries via Drizzle `sql` template |
| ORM: Drizzle | All DB access via drizzle-orm |
| Migration runner: `npx tsx src/db/migrate.ts` (D-49, never `drizzle-kit push`) | Migration 0013 applied via migrate.ts |
| Money/qty in Postgres numeric, never JS floats | Chainage ROUND via `sql` template; no JS-side multiplication of DB numeric strings |
| `force-dynamic` on all analytics/financial surfaces | `ChainageTab.tsx` exports `export const dynamic = 'force-dynamic'` |
| Never call `auth()`, `logOfficeActivity`, `after()` from bot path | chainage snapshot write inside `handleAuditDecision` uses `txDb` only |
| Single-tenant MVP: `getDefaultTenantId()` on all inserts/queries | All new queries include tenant scope |
| Migrations immutable post-apply: new migration file for backfill (0013) | Do NOT edit 0010–0012 |
| Apply migrations to BOTH Neon branches (dev + test) | 0013 requires two migrate.ts runs |
| No `route_segments` table | Chainage derived from `segment_fraction × total_length_m` in SQL |
| Turkish-first display: "km X+YYY" format | `formatChainage` utility used everywhere |

---

## Sources

### Primary (HIGH confidence)

- `src/lib/bot-audit.ts` — exact approval transaction structure, post-commit hook insertion point, Pitfall 5 (no auth/after in bot path) — [VERIFIED: direct file read]
- `src/db/schema/submissions.ts` — `chainage_m numeric(10,2)`, `route_geometry_version integer`, `segment_fraction numeric(10,8)`, `snapped_point geometry` — [VERIFIED: direct file read]
- `src/db/schema/routes.ts` — `total_length_m`, `geometry_version`, `chainage_offset_m` — [VERIFIED: direct file read]
- `src/db/migrations/0010_v4_routes_ext.sql` — confirms both columns applied to dev + test; partial index on `chainage_m WHERE status='approved'` already exists — [VERIFIED: direct file read]
- `src/app/api/exports/submissions/route.ts` — export Route Handler skeleton (auth first, Uint8Array, logOfficeActivity fire-and-forget) — [VERIFIED: direct file read]
- `src/app/dashboard/projects/[id]/page.tsx` — exact tab pattern (TabsTrigger + TabsContent + URL ?tab= param) — [VERIFIED: direct file read]
- `src/lib/pdf/hakedis-pdf.tsx` — PDF pattern (`renderToBuffer`, `DejaVu Sans`, `Document > Page > View`) — [VERIFIED: direct file read]
- `src/lib/types/canonical-submission.ts` — `CanonicalSubmission` type (confirmed does NOT yet have `snappedLat`/`snappedLon`) — [VERIFIED: direct file read]
- `src/components/admin/SubmissionDetailView.tsx` — existing location rendering, `MapPin` import, no Google Maps link yet — [VERIFIED: direct file read]
- `.planning/phases/15-chainage-as-built-view-approval-snapshot/15-CONTEXT.md` — all locked decisions — [VERIFIED: direct file read]
- `.planning/phases/15-chainage-as-built-view-approval-snapshot/15-UI-SPEC.md` — component specs, copywriting, formatChainage implementation — [VERIFIED: direct file read]
- `.planning/research/SUMMARY.md` — RESOLVED: snapshot vs dynamic decision — [VERIFIED: direct file read]
- `.planning/research/ARCHITECTURE.md` — `getChainageBuckets` shape, ChainageTab component tree — [VERIFIED: direct file read]
- `.planning/research/PITFALLS.md` — Pitfall 2 (re-import shift), 7 (float precision), 9 (over-completion), 13 (calibration consistency) — [VERIFIED: direct file read]
- `.planning/STATE.md` — Phase 15 key constraints, D-49 migration protocol, both Neon branches — [VERIFIED: direct file read]
- `.planning/config.json` — `nyquist_validation: true` — [VERIFIED: direct file read]

### Secondary (MEDIUM confidence)

- PostGIS `generate_series` for empty bucket enumeration — standard Postgres set-returning function, well-documented PostgreSQL feature [ASSUMED — not verified via Context7 for this specific use case]
- Drizzle `sql` template with multi-statement subqueries in GROUP BY — established project pattern from Phases 4, 9, 10 [ASSUMED — exact API unchanged across project phases]

---

## Metadata

**Confidence breakdown:**
- Approval transaction modification: HIGH — read exact source; pattern mirrors Phase 12 exactly
- Backfill migration: HIGH — simple UPDATE; confirmed migration format from 0010
- `getChainageBuckets` query: MEDIUM-HIGH — pattern confirmed from existing Drizzle `sql` usage; `generate_series` approach is standard Postgres but specific SQL template syntax is [ASSUMED]
- Colour bar + UI: HIGH — fully specified in 15-UI-SPEC.md; pure CSS implementation
- Export: HIGH — Phase 11 skeleton verbatim; same libraries
- Google Maps link: HIGH — read all affected files; change is purely additive

**Research date:** 2026-05-30
**Valid until:** 2026-06-30 (stable libraries; no fast-moving dependencies)
