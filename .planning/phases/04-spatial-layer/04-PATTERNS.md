# Phase 4: Spatial Layer - Pattern Map

**Mapped:** 2026-05-24
**Files analyzed:** 6 new/modified files
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/db/schema/submissions.ts` (MODIFY) | model | CRUD | `src/db/schema/submissions.ts` — existing `location` geometry column + GiST index block | exact — extend same file |
| `src/db/migrations/0003_spatial_layer.sql` (CREATE) | migration | batch | `src/db/migrations/0002_normal_mach_iv.sql` — ALTER TABLE ADD COLUMN × multiple columns | exact |
| `src/lib/spatial.ts` (CREATE) | utility | transform | `src/lib/boq-balance.ts` — pure helper, no top-level DB import | role-match |
| `src/lib/telegram.ts` (MODIFY `handleConfirmSubmit`) | service | request-response | same file — existing `getTxDb().transaction()` block (lines 1324–1365) | exact — extend same function |
| `src/lib/bot-audit.ts` (MODIFY `fanOutToAuditors`) | service | event-driven | same file — `captionLines.push(MESSAGES.auditOverDelivery(...))` block (lines 169–172) | exact — extend same function |
| `tests/spatial.test.ts` (CREATE) | test | CRUD | `tests/postgis.test.ts` — `describeIfDb`, `getTestDb`, `truncateAllTables`, Istanbul coordinate fixture | exact |

---

## Pattern Assignments

### `src/db/schema/submissions.ts` (MODIFY — add 5 columns + 1 GiST index)

**Analog:** `src/db/schema/submissions.ts` lines 1–45 (the file being extended)

**Existing geometry column + GiST index pattern** (lines 21–44) — copy this style for the five new columns and the new index:

```typescript
// existing — the column being joined by the five new columns
location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }),

// ...

// GiST index mandatory for Phase 4 spatial queries (ST_DWithin, ST_ClosestPoint)
index('submissions_location_gist').using('gist', t.location),
```

**New columns to add** (insert after `location`/`locationLon` block, before `quantity`):

```typescript
// Phase 4: nearest-segment snap results (GEO-01, GEO-02)
snappedPoint: geometry('snapped_point', { type: 'point', mode: 'xy', srid: 4326 }),
segmentFraction: numeric('segment_fraction', { precision: 10, scale: 8 }),
// Three-state source of truth (D-43/D-44)
locationMatch: text('location_match', { enum: ['near', 'far', 'no_route'] }),
locationWarning: boolean('location_warning').default(false),
locationDistanceM: numeric('location_distance_m', { precision: 12, scale: 2 }),
```

**Import additions** — `boolean` is not yet imported; add it to the existing import from `drizzle-orm/pg-core`:

```typescript
// Before (line 5):
import { pgTable, uuid, text, numeric, timestamp, index, unique, geometry } from 'drizzle-orm/pg-core';
// After:
import { pgTable, uuid, text, numeric, boolean, timestamp, index, unique, geometry } from 'drizzle-orm/pg-core';
```

**New GiST index** — append inside the table options array after the existing `submissions_location_gist` entry (line 44):

```typescript
index('submissions_snapped_point_gist').using('gist', t.snappedPoint),
```

**Sibling reference for `boolean` column convention:** `src/db/schema/audit-notifications.ts` line 18:

```typescript
sendFailed: boolean('send_failed').notNull().default(false),
```

**Sibling reference for `text` enum column convention:** `src/db/schema/submissions.ts` lines 28–31:

```typescript
status: text('status', { enum: ['pending_audit', 'approved', 'rejected'] })
  .notNull()
  .default('pending_audit'),
```

---

### `src/db/migrations/0003_spatial_layer.sql` (CREATE)

**Analog:** `src/db/migrations/0002_normal_mach_iv.sql` — ALTER TABLE ADD COLUMN pattern for extending `submissions`

**Prior migration excerpt** (0002, lines 12–14):

```sql
ALTER TABLE "submissions" ADD COLUMN "decided_by" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
```

**Expected shape for Phase 4 migration** (hand-verify after `npx drizzle-kit generate`):

```sql
ALTER TABLE "submissions"
  ADD COLUMN "snapped_point" geometry(point, 4326),
  ADD COLUMN "segment_fraction" numeric(10, 8),
  ADD COLUMN "location_match" text CHECK ("location_match" IN ('near', 'far', 'no_route')),
  ADD COLUMN "location_warning" boolean DEFAULT false,
  ADD COLUMN "location_distance_m" numeric(12, 2);
--> statement-breakpoint
CREATE INDEX "submissions_snapped_point_gist"
  ON "submissions" USING gist ("snapped_point");
```

**BLOCKING caveat — hand-edit required (from `src/db/schema/routes.ts` lines 1–2 comment):**

```
// CRITICAL: After `drizzle-kit generate`, open the generated migration SQL
// and change geometry(point,4326) → geometry(point, 4326) for the `snapped_point` column.
// Verify the location_match CHECK constraint is present (Drizzle may omit it).
// Add the GiST index line if not generated.
```

The `routes.ts` pattern shows Drizzle may emit `geometry(point,4326)` without a space — PostGIS is case-insensitive but spacing should match project convention. More critically, check that the `text CHECK (... IN ('near','far','no_route'))` constraint appears; if Drizzle generates a Postgres enum instead, hand-edit back to a CHECK constraint.

---

### `src/lib/spatial.ts` (CREATE — new pure helper module)

**Analog:** `src/lib/boq-balance.ts` — pure utility, no top-level DB import, single responsibility

**boq-balance.ts structure to copy** (lines 1–27):

```typescript
/**
 * src/lib/spatial.ts
 *
 * Spatial helpers for Phase 4 nearest-segment matching (GEO-01, GEO-02).
 * Pure module: no top-level DB access (lazy import discipline).
 *
 * Exports:
 *   PROXIMITY_THRESHOLD_M  — env-configured threshold (D-45, default 500)
 *   snapToRoute(tx, flowId, lon, lat) — runs the guarded PostGIS snap inside a tx
 *   formatDistance(m)      — human-readable distance string for D-47 caption
 */
```

**Env constant pattern** — read at function call time (NOT module load) to keep tests runnable without env:

```typescript
export function getProximityThresholdM(): number {
  return parseInt(process.env.PROXIMITY_THRESHOLD_M ?? '500', 10);
}
```

**`formatDistance` pure helper** (no DB, no imports):

```typescript
export function formatDistance(distanceM: number): string {
  if (distanceM >= 1000) {
    return `~${(distanceM / 1000).toFixed(1)} km`;
  }
  return `~${Math.round(distanceM)} m`;
}
```

**`snapToRoute` function signature** — accepts the `tx` Drizzle transaction client (passed in, not imported inside the function), mirrors how `boq-balance.ts` accepts pre-resolved values rather than re-fetching:

```typescript
import { sql } from 'drizzle-orm';

/**
 * snapToRoute — runs the PostGIS nearest-segment UPDATE inside `tx`.
 * Best-effort (D-42): catches all errors, sets location_match='no_route' on failure.
 * Never throws — caller's transaction is preserved.
 *
 * @param tx      - The active getTxDb() transaction client
 * @param flowId  - The submissions.flow_id being snapped
 * @param lon     - Worker longitude (from Telegram location.longitude)
 * @param lat     - Worker latitude  (from Telegram location.latitude)
 */
export async function snapToRoute(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  flowId: string,
  lon: number,
  lat: number
): Promise<void> {
  const threshold = getProximityThresholdM();
  try {
    const snapResult = await tx.execute(sql`
      WITH sub_pt AS (
        SELECT ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326) AS pt
      ),
      snap AS (
        SELECT
          r.geom,
          ST_LineLocatePoint(r.geom, (SELECT pt FROM sub_pt)) AS frac,
          ST_Distance(
            r.geom::geography,
            (SELECT pt FROM sub_pt)::geography
          ) AS dist_m
        FROM routes r
        WHERE r.project_id = (
          SELECT project_id FROM submissions WHERE flow_id = ${flowId}
        )
        LIMIT 1
      )
      UPDATE submissions s
      SET
        location          = (SELECT pt FROM sub_pt),
        snapped_point     = ST_SetSRID(
                              ST_LineInterpolatePoint(
                                (SELECT geom FROM snap),
                                (SELECT frac FROM snap)
                              ),
                              4326
                            ),
        segment_fraction  = (SELECT frac FROM snap),
        location_distance_m = (SELECT dist_m FROM snap),
        location_match    = CASE
                              WHEN (SELECT dist_m FROM snap) <= ${threshold}
                              THEN 'near'
                              ELSE 'far'
                            END,
        location_warning  = ((SELECT dist_m FROM snap) > ${threshold})
      WHERE s.flow_id = ${flowId}
        AND EXISTS (SELECT 1 FROM snap)
      RETURNING s.id, s.location_match, s.location_distance_m
    `);

    const snapped = (snapResult.rows as Array<{
      id: string;
      location_match: 'near' | 'far';
      location_distance_m: string;
    }>)[0];

    if (!snapped) {
      // No route row for this project — set no_route state (D-43)
      await tx.execute(sql`
        UPDATE submissions
        SET location_match = 'no_route', location_warning = false
        WHERE flow_id = ${flowId}
      `);
    }
  } catch (geoErr) {
    // D-42: any PostGIS error → best-effort no_route, never abort the outer transaction
    console.error('[snapToRoute] spatial snap failed (best-effort):', geoErr);
    try {
      await tx.execute(sql`
        UPDATE submissions
        SET location_match = 'no_route', location_warning = false
        WHERE flow_id = ${flowId}
      `);
    } catch (_) {
      // Even the no_route fallback failed — log and let transaction commit with nulls (D-42)
    }
  }
}
```

**Key note:** `routes` and `submissions` are referenced as raw table names in the SQL strings (not Drizzle schema objects), consistent with how `bot-audit.ts` uses `sql\`\`` for raw PostGIS expressions (e.g., `sql2\`approved_qty + ${affected[0].quantity}\`` at line 426). This avoids circular imports between `spatial.ts` and the schema barrel.

---

### `src/lib/telegram.ts` (MODIFY `handleConfirmSubmit` — add guarded spatial step)

**Analog:** Same file. The block to extend is lines 1330–1365 — the existing `getTxDb().transaction()` call.

**Existing transaction structure** (lines 1330–1365) — the spatial step hooks in after line 1351 (`.onConflictDoNothing()`):

```typescript
// EXISTING — do not change
try {
  await txDb.transaction(async (tx) => {
    // Insert submissions row
    await tx
      .insert(submissions)
      .values({ ... })
      .onConflictDoNothing();   // ← line 1350

    // DELETE conversation_state ... ← line 1353

    // ═══ PHASE 4 ADDITION (D-41/D-42): spatial snap goes between INSERT and DELETE ═══
    // Call snapToRoute — best-effort, never throws out of the transaction
    // Import lazily (lazy import discipline):
    //   const { snapToRoute } = await import('@/lib/spatial');
    //   await snapToRoute(tx, flowId, lon, lat);
    // lon/lat are available as:
    //   const lon = data.locationLon as number;
    //   const lat = data.locationLat as number;
    // ═════════════════════════════════════════════════════════════════════════════════
  });
} catch (txErr) { ... }
```

**`getTxDb` helper** — already defined at lines 1195–1214 (module-local, not exported). `bot-audit.ts` has its own copy at lines 28–46. Do NOT import across files; each module keeps its own copy per the existing pattern.

**Lazy import discipline** — the call to `snapToRoute` must use a lazy dynamic import inside the handler body, matching every other import in this file:

```typescript
// Inside the transaction callback, after the submissions INSERT:
const { snapToRoute } = await import('@/lib/spatial');
const lon = data.locationLon as number;
const lat = data.locationLat as number;
await snapToRoute(tx, flowId, lon, lat);
```

**`getDefaultTenantId` import convention** — already imported at top of file (line 25):

```typescript
import { getDefaultTenantId } from '@/lib/tenant';
```

This is the ONLY non-lazy import in the file. Do not add more top-level imports.

---

### `src/lib/bot-audit.ts` (MODIFY `fanOutToAuditors` — add D-47 caption line)

**Analog:** Same file, lines 169–172 — the D-28 over-delivery warning caption line. The D-47 distance flag follows the exact same `if (condition) { captionLines.push(...) }` pattern.

**Existing D-28 over-delivery pattern** (lines 169–172):

```typescript
// D-28: Over-delivery warning when approving would push approved_qty past planned_qty
if (newTotal > plannedQty) {
  captionLines.push(MESSAGES.auditOverDelivery(newTotal, plannedQty, boqItem.unit));
}
```

**D-47 distance flag — add immediately after the D-28 block** (after line 172):

```typescript
// D-47: Location anomaly flag — mirrors D-28 over-delivery pattern (show the number)
const locationMatch = submission.locationMatch as 'near' | 'far' | 'no_route' | null;
const distanceM = submission.locationDistanceM != null
  ? parseFloat(String(submission.locationDistanceM))
  : null;

if (locationMatch === 'far' && distanceM !== null) {
  const { formatDistance } = await import('@/lib/spatial');
  captionLines.push(`⚠ Konum rotadan uzak (${formatDistance(distanceM)})`);
} else if (locationMatch === 'no_route') {
  captionLines.push(`ℹ Rota yüklenmemiş — konum doğrulanamadı`);
}
// locationMatch === 'near' or null (pre-Phase-4 rows) → no caption line (silent)
// Google Maps link is already in captionLines above — kept in all cases (D-47)
```

**Lazy import for `formatDistance`** — `fanOutToAuditors` uses only lazy imports (all `await import(...)` inside the function body, matching the pattern at lines 81–91). `formatDistance` must follow this convention.

**`submission.locationMatch` / `submission.locationDistanceM` column names** — Drizzle camelCases the snake_case DB columns. The new columns `location_match` and `location_distance_m` on `submissions` will be accessed as `submission.locationMatch` and `submission.locationDistanceM` in the already-selected `submission` row (line 99 of `bot-audit.ts` loads the full row with `db.select().from(submissions).where(...)`).

---

### `tests/spatial.test.ts` (CREATE)

**Analog:** `tests/postgis.test.ts` — identical test harness structure

**Test harness pattern to copy verbatim** (lines 1–18):

```typescript
import { beforeEach, afterEach, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';

describeIfDb('Phase 4 spatial snap (GEO-01, GEO-02)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
    // Seed tenant + project + route (near/far test fixture)
    // ...
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });
  // ... test cases
});
```

**D-48 coordinate-order test** (mirrors `postgis.test.ts` lines 61–109, but tests a Point, not a LineString):

```typescript
it('(D-48) Istanbul point (lng 28.9, lat 41.0) reads back longitude-first in GeoJSON', async () => {
  const result = await db.execute(sql`
    SELECT ST_AsGeoJSON(
      ST_SetSRID(ST_MakePoint(28.9, 41.0), 4326)
    )::json AS geojson
  `);
  const geojson = (result.rows[0] as { geojson: { coordinates: number[] } }).geojson;
  expect(geojson.coordinates[0]).toBeCloseTo(28.9, 5); // longitude first
  expect(geojson.coordinates[1]).toBeCloseTo(41.0, 5); // latitude second
});
```

**`sql.raw` vs `sql` tagged template** — `postgis.test.ts` uses `sql.raw(...)` for parameter-free queries (lines 27–44, 89–93) and `sql\`...\`` for parameterized queries (lines 73–85). Follow the same distinction.

**Seed fixture pattern** — `postgis.test.ts` lines 26–44 show the minimal tenant + project seed via `sql.raw(INSERT INTO ... ON CONFLICT DO NOTHING)`. Phase 4 tests additionally need a `routes` row with a known Istanbul LineString and a `submissions` row with a known `flow_id`. Copy the `ON CONFLICT DO NOTHING` upsert style for deterministic seed UUIDs.

**`truncateAllTables` update** — `tests/fixtures/db.ts` line 54 currently has `submissions` in the table list. The new Phase 4 columns are on `submissions` (already there). No new tables are added, so `truncateAllTables` does not need to change for Phase 4.

**`fileParallelism: false`** — already set in `vitest.config.ts` line 14. No change needed; new test file inherits it.

---

## Shared Patterns

### Lazy Import Discipline
**Source:** `src/lib/telegram.ts` lines 18–21 (module comment) + every handler in the file
**Apply to:** `src/lib/spatial.ts`, any new imports in `handleConfirmSubmit`, the D-47 addition in `fanOutToAuditors`

```typescript
// NEVER import @/db or schema at the top level — neon() at module load breaks builds
// and unit tests that run without DATABASE_URL.
// ALL DB access must be done with `await import('@/db')` inside handler bodies.
```

The only allowed top-level import of a project module in `telegram.ts` is `getDefaultTenantId` from `@/lib/tenant` (line 25), because `tenant.ts` has no DB dependency at load time.

### `getTxDb` — neon-serverless Pool for transactions
**Source:** `src/lib/telegram.ts` lines 1195–1214; exact copy in `src/lib/bot-audit.ts` lines 28–46
**Apply to:** Phase 4 does not add a new `getTxDb`. The spatial snap runs inside the existing transaction in `handleConfirmSubmit` which already calls `getTxDb()`. Do NOT define another `getTxDb` for Phase 4.

```typescript
// Pattern (bot-audit.ts lines 28-46):
async function getTxDb() {
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  try {
    const ws = require('ws') as { default?: unknown } | unknown;
    neonConfig.webSocketConstructor = (ws as any).default ?? ws;
  } catch (wsErr) {
    console.error('[getTxDb] require("ws") failed; falling back to native WebSocket:', wsErr);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  return drizzle(pool);
}
```

### `getDefaultTenantId` on every insert
**Source:** `src/lib/tenant.ts` lines 25–27; used in `telegram.ts` line 1337 and `bot-audit.ts` line 189
**Apply to:** `spatial.ts` does not insert rows directly — the `snapToRoute` function only UPDATEs an existing row that was inserted by `handleConfirmSubmit` with `tenantId: getDefaultTenantId()`. No new insert requires `getDefaultTenantId()` in Phase 4.

### Raw `sql\`\`` escape hatch for PostGIS
**Source:** `src/lib/bot-audit.ts` line 426 (`sql2\`approved_qty + ${affected[0].quantity}\``) + `tests/postgis.test.ts` line 73 (`sql\`INSERT INTO routes ... ST_GeomFromGeoJSON(${istanbulLineString})\``)
**Apply to:** All PostGIS `ST_*` calls in `spatial.ts` (the entire `snapToRoute` body)

```typescript
// Correct parameterized PostGIS call:
await tx.execute(sql`
  SELECT ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326) ...
`);
// ${lon}, ${lat} → bound as prepared statement parameters, not string interpolation
```

### Best-effort guard pattern
**Source:** `src/lib/bot-audit.ts` lines 178–215 (per-auditor try/catch in the fan-out loop); `src/lib/telegram.ts` lines 1357–1365 (txErr try/catch)
**Apply to:** The `snapToRoute` function in `spatial.ts` — the outer try/catch catches all PostGIS failures, the inner try/catch catches the no_route fallback failure (D-42)

```typescript
// D-40 / D-42 pattern:
try {
  // primary operation
} catch (err) {
  console.error('[location] primary failed:', err);
  try {
    // fallback (no_route set)
  } catch (_) {
    // even fallback failed — log, do NOT propagate
  }
}
```

### `describeIfDb` test gating
**Source:** `tests/fixtures/db.ts` lines 12–22; `tests/postgis.test.ts` line 19
**Apply to:** `tests/spatial.test.ts` — all DB-dependent tests must use `describeIfDb` not bare `describe`

```typescript
export const describeIfDb = hasTestDb ? describe : describe.skip;
// Usage:
describeIfDb('Phase 4 spatial snap', () => { ... });
```

---

## No Analog Found

All Phase 4 files have close analogs. No entries.

---

## Metadata

**Analog search scope:** `src/db/schema/`, `src/lib/`, `src/db/migrations/`, `tests/`, `tests/fixtures/`
**Files scanned:** 13 source files read directly
**Pattern extraction date:** 2026-05-24

### Critical Coordinate-Order Note

`ST_MakePoint(lon, lat)` — longitude FIRST (X axis). Telegram's `message.location` returns `{ latitude, longitude }` — the property name `latitude` tempts callers to put it first. In `handleStepLocation` (telegram.ts lines 1038–1040), the values are stored as `locationLat: location.latitude` and `locationLon: location.longitude`. In `snapToRoute`, the caller must pass them as `snapToRoute(tx, flowId, data.locationLon, data.locationLat)` — lon first, lat second. D-48 test is the structural guard.
