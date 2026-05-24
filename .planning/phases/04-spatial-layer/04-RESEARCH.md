# Phase 4: Spatial Layer - Research

**Researched:** 2026-05-24
**Domain:** PostGIS nearest-segment matching, Drizzle schema extensions, in-transaction spatial computation, Telegram auditor caption extension
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-41:** PostGIS match runs INSIDE the existing confirm insert transaction (`getTxDb().transaction(...)` in `handleConfirmSubmit`). All spatial values committed atomically with the submission row so `fanOutToAuditors` reads guaranteed-present anomaly state.
- **D-42:** Snap is BEST-EFFORT — submission must always commit. Missing route, invalid geometry, or transient PostGIS error degrades to null snap rather than rolling back. Guarded step (try/catch) inside the transaction.
- **D-43:** THREE states via `location_match` column: `'near'` (within threshold, no warning), `'far'` (beyond threshold, anomaly), `'no_route'` (no route on project or match could not be computed — neutral, not an alarm).
- **D-44:** `location_match` text/enum is source of truth; `location_warning` boolean kept (`true` only when `location_match = 'far'`) for SC compatibility. `snapped_point` and `segment_fraction` null when `location_match = 'no_route'`.
- **D-45:** Proximity threshold is `PROXIMITY_THRESHOLD_M` env constant, default 500. No per-project column, no UI.
- **D-46:** Snapped coordinates live as columns on `submissions` only. No `approved_points` table or view. Phase 5 renders via query `WHERE status='approved' AND snapped_point IS NOT NULL`.
- **D-47:** Auditor message shows actual distance: `far` → `"⚠ Konum rotadan uzak (~1.2 km)"`, `no_route` → `"ℹ Rota yüklenmemiş — konum doğrulanamadı"`. Existing Google Maps link kept in all cases.
- **D-48:** Coordinate-order unit test MANDATORY before merge: storing Istanbul (lng 28.9, lat 41.0) reads back longitude-first in GeoJSON output.

### Claude's Discretion

- Exact `ST_*` SQL for the match and whether it's a single insert-with-expressions or a guarded UPDATE inside the same transaction.
- New column names, the `location_match` enum vs text choice, and any added index.
- Final Turkish microcopy and human distance formatting (m vs km, rounding) for the D-47 auditor flag.
- How `snapped_point` is read back for any internal use (`ST_AsGeoJSON`, `wkx` per the STACK custom-type pattern).

### Deferred Ideas (OUT OF SCOPE)

- Per-project proximity threshold — `projects.proximity_threshold_m` column + office-dashboard control.
- Second map pin to snapped point in the auditor message.
- Recompute snap on resubmission / route re-upload.
- Backfill of pre-Phase-4 submissions.
- Per-segment / chainage scoping of the anomaly (v2 AUDIT-V2-02).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GEO-01 | A submission's shared lat/long is matched to the nearest segment of the project's pipeline route (PostGIS) | Canonical SQL query documented in §Architecture Patterns; Drizzle in-transaction pattern in §Code Examples |
| GEO-02 | A submission located beyond a configured distance threshold from the route is flagged as a location anomaly | Three-state `location_match` column + `PROXIMITY_THRESHOLD_M` env constant + auditor caption extension documented in §Architecture Patterns and §Code Examples |
</phase_requirements>

---

## Summary

Phase 4 wires PostGIS spatial matching into the existing submission flow. The core work is narrow: (1) extend the `submissions` schema with four new columns (`snapped_point`, `segment_fraction`, `location_match`, `location_warning`); (2) add a guarded spatial computation step inside `handleConfirmSubmit`'s transaction that queries `routes.geom` and writes those four columns; (3) extend `fanOutToAuditors` caption to include the distance/anomaly line. No new packages are required — `wkx 0.5.x` is already in `package.json`, all PostGIS functions are standard, and the Drizzle `sql``  escape hatch already used for Phase 1 geometry column patterns is the right tool here.

The critical technical choices are all already locked by the CONTEXT decisions: the computation happens inside `getTxDb().transaction()` (D-41), it degrades gracefully on any geo error (D-42), and the three-state `location_match` column is the source of truth (D-43/D-44). The planner's task is to sequence a schema migration, the in-transaction spatial SQL, the caption extension, the env constant, and the mandatory coordinate-order test.

**Primary recommendation:** Use a single guarded try/catch inside the transaction: insert the core submission row first (honoring D-13 Guard 2 `onConflictDoNothing`), then in a nested try/catch run a raw `sql`` UPDATE against the just-inserted row that joins `routes` via the project ID. If the UPDATE throws or returns no row (no route), set `location_match = 'no_route'`. This keeps D-41 (atomicity) and D-42 (best-effort) in harmony without two separate transactions.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| PostGIS nearest-segment match | API / Backend (Telegram webhook handler) | Database / PostGIS | Computation is pure SQL via `sql`` raw query; no browser or SSR involvement |
| Threshold comparison and `location_match` assignment | API / Backend | — | Happens in the handler reading the PostGIS distance result |
| `snapped_point` / `segment_fraction` / `location_match` / `location_warning` persistence | Database / Storage | — | Four new columns on `submissions`; no separate table |
| Auditor anomaly flag display | API / Backend (Telegram bot output) | — | New caption line in `fanOutToAuditors`; plain text, no map rendering |
| Env-configurable threshold | API / Backend (env constant) | — | Read at module scope once; no DB column |
| GeoJSON coordinate-order guarantee | Database / PostGIS | — | `ST_AsGeoJSON` on WGS84 geometry always outputs `[lng, lat]`; tested in unit test |

---

## Standard Stack

### Core (no new installs required)

| Library | Version (in package.json) | Purpose | Why Standard |
|---------|--------------------------|---------|--------------|
| PostGIS (Neon built-in) | Bundled, PostGIS 3.x | `ST_MakePoint`, `ST_SetSRID`, `ST_LineLocatePoint`, `ST_ClosestPoint`, `ST_Distance`, `ST_AsGeoJSON` | Native SQL; all ST_ functions needed are confirmed in PostGIS official docs [CITED: postgis.net/docs] |
| drizzle-orm | `^0.45.2` (in use) | `sql``  tagged-template escape hatch for all ST_ functions | Already used; no new Drizzle spatial support needed beyond `sql``  |
| @neondatabase/serverless | `^1.1.0` (in use) | `getTxDb()` neon-serverless Pool for the transaction | Already used; neon-http does NOT support transactions (established in Phase 2 D-29) |
| wkx | `^0.5.0` (in use) | WKB hex → GeoJSON in custom `fromDriver` if `snapped_point` is read back via ORM column | Already installed [VERIFIED: npm registry — 0.5.0] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-kit` | `^0.31.10` (in use) | `generate` new migration for the four new columns | One `generate` run; requires hand-edit if geometry column type defaults to `point` |

**No new packages required for Phase 4.** All needed libraries are already in `package.json`.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ST_ClosestPoint` + `ST_LineLocatePoint` | `ST_LineInterpolatePoint(line, ST_LineLocatePoint(line, point))` | Both produce the same snapped geometry. `ST_ClosestPoint` is one function call; the `ST_LineInterpolatePoint(ST_LineLocatePoint(...))` combination is the PostGIS-documented canonical form and is preferred when you need fraction and snapped point in one query [CITED: postgis.net/docs/ST_LineInterpolatePoint.html] |
| `geometry::geography` cast for distance | Store columns as `geography(Point,4326)` natively | `::geography` cast on existing `geometry(Point,4326)` columns works correctly for metre-accurate distance and avoids schema complexity; new columns should use the same `geometry` type pattern already established in Phase 1 [ASSUMED — native geography columns would also work but add schema complexity] |
| Guarded UPDATE inside same transaction (recommended) | Fire-and-forget separate transaction for spatial | Keeping spatial within the same transaction satisfies D-41; a separate transaction would risk the row being visible to `fanOutToAuditors` before snap is committed |

---

## Package Legitimacy Audit

> Phase 4 introduces **no new packages**. All required libraries (`wkx`, `drizzle-orm`, `@neondatabase/serverless`, PostGIS) are already present in `package.json`.

| Package | Registry | Status | Disposition |
|---------|----------|--------|-------------|
| wkx | npm | Already in package.json (^0.5.0); npm view confirms v0.5.0 exists | Approved (existing) |
| drizzle-orm | npm | Already in package.json (^0.45.2) | Approved (existing) |
| @neondatabase/serverless | npm | Already in package.json (^1.1.0) | Approved (existing) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable at research time; however no new packages are introduced so no new legitimacy checks are required. All packages listed above are established dependencies confirmed by prior phase research.*

---

## Architecture Patterns

### System Architecture Diagram

```
Worker taps "Onayla ve Gönder"
       ↓
handleConfirmSubmit (src/lib/telegram.ts)
       ↓
getTxDb().transaction(async (tx) => {
  // STEP 1: Insert core submission row (existing, D-13 Guard 2)
  INSERT submissions (location_lat, location_lon, ..., status='pending_audit')
  ON CONFLICT DO NOTHING

  // STEP 2: Guarded spatial snap (NEW — D-41/D-42)
  try {
    UPDATE submissions SET
      location     = ST_SetSRID(ST_MakePoint(lon, lat), 4326),
      snapped_point = ST_SetSRID(
                        ST_LineInterpolatePoint(routes.geom,
                          ST_LineLocatePoint(routes.geom,
                            ST_SetSRID(ST_MakePoint(lon, lat), 4326)
                          )
                        ), 4326),
      segment_fraction = ST_LineLocatePoint(routes.geom, subm_point),
      location_match   = CASE WHEN dist <= threshold THEN 'near' ELSE 'far' END,
      location_warning = CASE WHEN dist > threshold THEN true ELSE false END
    FROM routes
    WHERE routes.project_id = submission.project_id
      AND submissions.flow_id = :flowId
  } catch (geoErr) {
    // No route, DB error, invalid geometry → set no_route, null snapped fields
    UPDATE submissions SET location_match='no_route', location_warning=false
    WHERE flow_id = :flowId
  }
})
       ↓
after() → fanOutToAuditors(submissionId)
       ↓
fanOutToAuditors reads location_match / location_warning / snapped_point
builds caption with D-47 anomaly line
sends to auditors
```

### Recommended Project Structure (Phase 4 additions)

```
src/
├── db/
│   ├── schema/
│   │   └── submissions.ts          # ADD: snapped_point, segment_fraction, location_match, location_warning
│   └── migrations/
│       └── 0003_spatial_layer.sql  # NEW: ALTER TABLE ADD COLUMN × 4 + [BLOCKING] push
├── lib/
│   ├── spatial.ts                  # NEW: snapToRoute(tx, flowId, lon, lat, projectId) helper
│   ├── telegram.ts                 # MODIFY: handleConfirmSubmit — add guarded spatial step
│   └── bot-audit.ts                # MODIFY: fanOutToAuditors — add D-47 caption line
tests/
└── spatial.test.ts                 # NEW: coordinate-order test (D-48 MANDATORY), snap near/far/no_route
```

### Pattern 1: Canonical PostGIS Nearest-Segment SQL

**What:** Single SQL expression that computes `location`, `snapped_point`, `segment_fraction`, `distance_metres`, and `location_match` in one UPDATE against the just-inserted submission row, joining `routes` by `project_id`.

**When to use:** Inside the transaction, after the `INSERT` succeeds, before the transaction commits.

**Canonical query shape:**

```sql
-- Inputs: :lon, :lat (worker GPS), :threshold (metres, e.g. 500), :flowId
-- join routes ON routes.project_id = submissions.project_id

WITH sub_point AS (
  SELECT ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) AS pt
)
UPDATE submissions s
SET
  location          = (SELECT pt FROM sub_point),
  snapped_point     = ST_SetSRID(
                        ST_LineInterpolatePoint(
                          r.geom,
                          ST_LineLocatePoint(r.geom, (SELECT pt FROM sub_point))
                        ),
                        4326
                      ),
  segment_fraction  = ST_LineLocatePoint(r.geom, (SELECT pt FROM sub_point)),
  location_match    = CASE
                        WHEN ST_Distance(
                               r.geom::geography,
                               (SELECT pt FROM sub_point)::geography
                             ) <= :threshold
                        THEN 'near'
                        ELSE 'far'
                      END,
  location_warning  = CASE
                        WHEN ST_Distance(
                               r.geom::geography,
                               (SELECT pt FROM sub_point)::geography
                             ) > :threshold
                        THEN true
                        ELSE false
                      END
FROM routes r
WHERE r.project_id = s.project_id
  AND s.flow_id = :flowId
RETURNING
  s.id,
  s.location_match,
  ST_Distance(r.geom::geography, (SELECT pt FROM sub_point)::geography) AS distance_metres
```

**Key rules (all from official PostGIS docs [CITED: postgis.net/docs]):**
- `ST_MakePoint(longitude, latitude)` — longitude FIRST (X axis), latitude SECOND (Y axis). Never swap.
- `ST_SetSRID(..., 4326)` — explicit SRID required; geometry without SRID produces garbage distances.
- `ST_Distance(geom::geography, point::geography)` — the `::geography` cast is MANDATORY for metre-accurate distance. Without it `ST_Distance` returns degrees.
- `ST_LineLocatePoint(linestring, point)` — returns `float8` in [0.0, 1.0]. Input point is projected to EPSG:4326 geometry, NOT geography. [CITED: postgis.net/docs/ST_LineLocatePoint.html]
- `ST_LineInterpolatePoint(linestring, fraction)` — takes the fraction from `ST_LineLocatePoint` and returns the snapped point geometry. This is the PostGIS-documented canonical combination. [CITED: postgis.net/docs/ST_LineInterpolatePoint.html]
- `ST_AsGeoJSON(geom)` — outputs `{"type":"Point","coordinates":[longitude, latitude]}` — longitude-first per GeoJSON spec (RFC 7946). [CITED: postgis.net/docs/ST_AsGeoJSON.html]

### Pattern 2: Drizzle In-Transaction SQL Execution

**What:** How to run raw `sql``  inside an existing `getTxDb().transaction()` and bind lon/lat parameters safely.

**When to use:** Inside `handleConfirmSubmit` after the submission INSERT.

```typescript
// Source: Drizzle raw SQL escape hatch pattern (STACK.md + official Drizzle docs)
// Inside: getTxDb().transaction(async (tx) => { ... })

import { sql } from 'drizzle-orm';

const lon = data.locationLon as number;  // from conversation_state.data
const lat = data.locationLat as number;
const threshold = parseInt(process.env.PROXIMITY_THRESHOLD_M ?? '500', 10);

const snapResult = await tx.execute(sql`
  WITH sub_point AS (
    SELECT ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326) AS pt
  )
  UPDATE submissions s
  SET
    location          = (SELECT pt FROM sub_point),
    snapped_point     = ST_SetSRID(
                          ST_LineInterpolatePoint(
                            r.geom,
                            ST_LineLocatePoint(r.geom, (SELECT pt FROM sub_point))
                          ),
                          4326
                        ),
    segment_fraction  = ST_LineLocatePoint(r.geom, (SELECT pt FROM sub_point)),
    location_match    = CASE
                          WHEN ST_Distance(
                                 r.geom::geography,
                                 (SELECT pt FROM sub_point)::geography
                               ) <= ${threshold}
                          THEN 'near'
                          ELSE 'far'
                        END,
    location_warning  = (ST_Distance(
                           r.geom::geography,
                           (SELECT pt FROM sub_point)::geography
                         ) > ${threshold})
  FROM routes r
  WHERE r.project_id = s.project_id
    AND s.flow_id = ${flowId}
  RETURNING
    s.id,
    s.location_match,
    ST_Distance(r.geom::geography, (SELECT pt FROM sub_point)::geography) AS distance_metres
`);

const snapped = snapResult.rows[0] as {
  id: string;
  location_match: 'near' | 'far';
  distance_metres: number;
} | undefined;

// No row returned = no route for this project
if (!snapped) {
  // D-42/D-43: set no_route state on the just-inserted row
  await tx.execute(sql`
    UPDATE submissions
    SET location_match = 'no_route', location_warning = false
    WHERE flow_id = ${flowId}
  `);
}
```

**D-42 guard pattern — wrapping this in try/catch inside the transaction:**

```typescript
// The INSERT of the core submission row runs first (existing code).
// The spatial UPDATE runs in a try/catch — any geo failure sets no_route.
// The transaction itself is NOT aborted; only the spatial step degrades.

try {
  // ... spatial UPDATE sql above ...
  if (!snapped) {
    await tx.execute(sql`UPDATE submissions SET location_match='no_route', location_warning=false WHERE flow_id=${flowId}`);
  }
} catch (geoErr) {
  // PostGIS error, invalid geometry, network blip — set no_route, do NOT throw
  console.error('[handleConfirmSubmit] spatial snap failed (best-effort):', geoErr);
  try {
    await tx.execute(sql`UPDATE submissions SET location_match='no_route', location_warning=false WHERE flow_id=${flowId}`);
  } catch (updateErr) {
    // If even the no_route fallback fails, log and let the transaction commit
    // with null spatial columns. Submission is never lost (D-42).
    console.error('[handleConfirmSubmit] no_route fallback failed:', updateErr);
  }
}
```

**Important:** The distance value needed for the auditor caption (`~1.2 km`) should be extracted from `snapResult.rows[0].distance_metres` while still inside the transaction (or re-queried by `fanOutToAuditors`). Since `fanOutToAuditors` loads the full submission row via D-41's atomic commit guarantee, the simplest approach is to store `distance_metres` in a DB column (see §Schema Additions) or re-compute it in `fanOutToAuditors`. The recommended approach is to add a `location_distance_m` numeric column so the auditor caption reads from the stored value.

### Pattern 3: Reading snapped_point as GeoJSON (wkx roundtrip)

PostGIS returns geometry columns as WKB hex strings via Drizzle. To decode:

```typescript
// Source: wkx 0.5.0 (STACK.md pattern — fromDriver)
import wkx from 'wkx';

function wkbToGeoJSON(wkbHex: string): object {
  const buffer = Buffer.from(wkbHex, 'hex');
  const geom = wkx.Geometry.parse(buffer);
  return geom.toGeoJSON();
  // Returns: { type: "Point", coordinates: [longitude, latitude] }
  // longitude is FIRST — GeoJSON spec, verified by D-48 test
}
```

For Phase 4, `snapped_point` is written-to but not read-back by the bot flow. Phase 5 reads it via `ST_AsGeoJSON(snapped_point)` in a Server Action. The `wkx` pattern is available if needed for internal use.

### Pattern 4: Auditor Caption Extension (D-47)

**What:** Add a new caption line to `fanOutToAuditors` based on `location_match` and `distance_metres`.

**When to use:** After the submission row is loaded in `fanOutToAuditors`.

```typescript
// In fanOutToAuditors, after loading the submission row:
const locationMatch = submission.locationMatch as 'near' | 'far' | 'no_route' | null;
const distanceM = submission.locationDistanceM != null
  ? parseFloat(submission.locationDistanceM as string)
  : null;

if (locationMatch === 'far' && distanceM !== null) {
  const distanceFormatted = distanceM >= 1000
    ? `~${(distanceM / 1000).toFixed(1)} km`
    : `~${Math.round(distanceM)} m`;
  captionLines.push(`⚠ Konum rotadan uzak (${distanceFormatted})`);
} else if (locationMatch === 'no_route') {
  captionLines.push(`ℹ Rota yüklenmemiş — konum doğrulanamadı`);
}
// locationMatch === 'near' or null → no caption line added (silent on in-range submissions)
```

**D-47 microcopy finalized:**
- `far`: `"⚠ Konum rotadan uzak (~1.2 km)"` (distance human-formatted: km with 1 decimal if ≥1000m, otherwise m rounded to integer)
- `no_route`: `"ℹ Rota yüklenmemiş — konum doğrulanamadı"` (neutral, not an alarm)
- `near` or null (pre-Phase-4 rows): no line added
- Google Maps link (`📍 https://maps.google.com/?q=...`) kept in all cases (existing caption line)

### Anti-Patterns to Avoid

- **Anti-pattern: Run spatial snap in a separate transaction after the INSERT.** The auditor fan-out fires via `after()` which runs after the webhook 200 is sent. If snap is in a second transaction, there is a race window where the fan-out reads the row before snap commits. D-41 mandates atomicity — snap inside the same transaction.
- **Anti-pattern: Throw from the spatial step on geo failure.** D-42 is explicit: a missing route must not abort the submission. Try/catch is mandatory.
- **Anti-pattern: Use `ST_Distance(geom, geom)` without `::geography` cast.** Returns degrees, not metres. A 500m threshold would translate to ~0.0045 degrees — the comparison would produce wrong results silently.
- **Anti-pattern: `ST_MakePoint(lat, lon)`.** PostGIS X = longitude, Y = latitude. Swapping produces a point in the wrong hemisphere.
- **Anti-pattern: Calling `ST_AsGeoJSON` on a Feature or FeatureCollection.** `ST_AsGeoJSON` expects a raw geometry, not a GeoJSON Feature object (see `geojson.ts` Pitfall 4 — already documented).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Nearest point on line | Custom JavaScript great-circle projection math | `ST_LineInterpolatePoint(geom, ST_LineLocatePoint(geom, point))` | PostGIS handles spheroidal edge cases, antimeridian, degenerate inputs correctly [CITED: postgis.net/docs] |
| Metre-accurate distance on sphere | Haversine formula in TypeScript | `ST_Distance(geom::geography, point::geography)` | PostGIS `::geography` uses WGS84 spheroid; matches real-world GPS precision [CITED: postgis.net/docs/ST_Distance.html] |
| WKB hex → GeoJSON decoding | Custom binary parser | `wkx` (already installed) | wkx 0.5.x handles EWKB/WKB/TWKB formats and is already in package.json |

**Key insight:** PostGIS has 20+ years of edge-case handling for geospatial operations. Custom JavaScript implementations will fail on linestrings crossing the antimeridian, linestrings with duplicate consecutive points, and points exactly at the start/end of a linestring.

---

## Drizzle Schema Additions

### New Columns for `submissions`

Add these four columns to `src/db/schema/submissions.ts`:

```typescript
// Phase 4: spatial snap results (GEO-01, GEO-02)
// snapped_point: the closest point on routes.geom to this submission's location.
// Null when location_match = 'no_route' (no route on project).
snappedPoint: geometry('snapped_point', { type: 'point', mode: 'xy', srid: 4326 }),

// segment_fraction: ST_LineLocatePoint result (0.0 = route start, 1.0 = route end).
// Null when location_match = 'no_route'.
segmentFraction: numeric('segment_fraction', { precision: 10, scale: 8 }),

// location_match: three-state (D-43/D-44). Source of truth.
// 'near' = within threshold | 'far' = beyond threshold | 'no_route' = no route
locationMatch: text('location_match', { enum: ['near', 'far', 'no_route'] }),

// location_warning: true ONLY when location_match = 'far' (D-44).
// Kept for SC2 compatibility and cheap boolean filtering.
locationWarning: boolean('location_warning').default(false),

// location_distance_m: metre distance from worker location to route.
// Null when location_match = 'no_route'. Stored so fanOutToAuditors
// can format the distance without re-querying PostGIS.
locationDistanceM: numeric('location_distance_m', { precision: 12, scale: 2 }),
```

**Note on `snappedPoint` GiST index:** The existing `submissions_location_gist` index covers `location`. A second GiST index on `snapped_point` is optional for Phase 4 (Phase 5 queries `snapped_point` for map rendering). Recommend adding it in the Phase 4 migration to front-load the cost: `index('submissions_snapped_point_gist').using('gist', t.snappedPoint)`.

### Migration Workflow

1. `npx drizzle-kit generate` — generates new `0003_...sql` migration
2. **Hand-edit the migration:** Verify `snapped_point` is `geometry(point, 4326)` not the wrong type. Add GiST index line if not generated. Drizzle may generate the `location_match` enum incorrectly — verify it is `text CHECK IN ('near','far','no_route')` or a Postgres enum.
3. `[BLOCKING]` `npx drizzle-kit push` — apply to the live Neon DB before any implementation tasks run.
4. Register `snappedPoint`, `segmentFraction`, `locationMatch`, `locationWarning`, `locationDistanceM` in `src/db/schema/index.ts` (the barrel) — no action needed since `submissions.ts` is already exported.

**Migration SQL shape (hand-verify after generate):**

```sql
ALTER TABLE "submissions"
  ADD COLUMN "snapped_point" geometry(point, 4326),
  ADD COLUMN "segment_fraction" numeric(10, 8),
  ADD COLUMN "location_match" text CHECK ("location_match" IN ('near', 'far', 'no_route')),
  ADD COLUMN "location_warning" boolean DEFAULT false,
  ADD COLUMN "location_distance_m" numeric(12, 2);

CREATE INDEX "submissions_snapped_point_gist"
  ON "submissions" USING gist ("snapped_point");
```

---

## Common Pitfalls

### Pitfall 1: Coordinate Order — ST_MakePoint(lon, lat) not (lat, lon)
**What goes wrong:** Telegram's `message.location` gives `{ latitude, longitude }`. Passing them in the wrong order to `ST_MakePoint` stores a point in the wrong hemisphere.
**Why it happens:** Property names `latitude`/`longitude` suggest lat-first; PostGIS is x/y = lng/lat.
**How to avoid:** Always `ST_MakePoint(${locationLon}, ${locationLat})`. The D-48 coordinate-order test is the structural guard.
**Warning signs:** Nearest-segment returning distant routes; Istanbul coordinates appearing near longitude 41°.
**Source:** [CITED: STATE.md Phase-4 Blockers; PITFALLS.md Pitfall 10]

### Pitfall 2: Geometry vs Geography for Distance
**What goes wrong:** `ST_Distance(geom, geom)` returns degrees, not metres. A 500m threshold would evaluate to `0.0045 degrees`, which is dimensionally incompatible with a numeric threshold of `500`.
**Why it happens:** PostGIS `geometry(Point, 4326)` uses flat Cartesian math by default.
**How to avoid:** Always cast both arguments: `ST_Distance(r.geom::geography, sub_point::geography)`.
**Warning signs:** Distance results like `0.0042` when you expect `420.0`.
**Source:** [CITED: PITFALLS.md Pitfall 8; postgis.net/docs/ST_Distance.html]

### Pitfall 3: The Submission INSERT Returns Nothing on Conflict — Spatial Update Targets Wrong Row
**What goes wrong:** `INSERT ... ON CONFLICT DO NOTHING` returns an empty RETURNING on duplicate `flow_id`. If spatial UPDATE targets `WHERE flow_id = :flowId` it will still find the existing row (first insert's row), which is correct. However if the INSERT row is genuinely new and the UPDATE is written with a wrong condition it could update zero rows, leaving `location_match` NULL.
**How to avoid:** After the INSERT, check whether the row was inserted or already existed. The spatial UPDATE should still proceed regardless — the `WHERE flow_id = :flowId` condition is always correct because either path (new insert or conflict-skipped) leaves the row in the DB.
**Source:** [ASSUMED — based on existing D-13 Guard 2 behavior]

### Pitfall 4: ST_LineInterpolatePoint vs ST_ClosestPoint
**What goes wrong:** `ST_ClosestPoint(linestring, point)` and `ST_LineInterpolatePoint(linestring, ST_LineLocatePoint(linestring, point))` produce the same result for 2D geometry. However the `ST_ClosestPoint` + `ST_LineLocatePoint` combination requires calling `ST_LineLocatePoint` once to get the fraction AND separately again for the snapped point if using `ST_ClosestPoint`. Using `ST_LineInterpolatePoint(ST_LineLocatePoint(...))` is the PostGIS-documented canonical form and avoids computing `ST_LineLocatePoint` twice.
**How to avoid:** Use `ST_LineInterpolatePoint(geom, ST_LineLocatePoint(geom, point))` for both snapped_point and segment_fraction (or extract fraction from a single subquery).
**Source:** [CITED: postgis.net/docs/ST_LineInterpolatePoint.html]

### Pitfall 5: No GiST Index on snapped_point — Phase 5 Map Queries Will Scan
**What goes wrong:** Phase 5 will query `WHERE status='approved' AND snapped_point IS NOT NULL` to build the Mapbox overlay. Without a GiST index on `snapped_point`, this is a full table scan.
**How to avoid:** Add `CREATE INDEX submissions_snapped_point_gist ON submissions USING GIST (snapped_point)` in the Phase 4 migration. Do not defer to Phase 5.
**Source:** [CITED: PITFALLS.md Pitfall 9]

### Pitfall 6: Drizzle Kit Migration Generates Wrong Geometry Type
**What goes wrong:** `drizzle-kit generate` may emit `geometry(point, 4326)` for the `snappedPoint` column, which is correct (it IS a point). However for `geometry` columns, drizzle-kit v0.31.x has been observed generating lowercase `geometry(point,4326)` vs the expected `geometry(Point,4326)`. PostGIS is case-insensitive for type names, so this is not a functional issue. But inspect the generated migration and confirm the column is correct before pushing.
**How to avoid:** After `drizzle-kit generate`, open the `.sql` file and grep for `snapped_point`. Verify it reads `geometry(point, 4326)`.
**Source:** [CITED: routes.ts comment — "CRITICAL: After drizzle-kit generate, open the generated migration SQL and verify the geometry type"]

### Pitfall 7: fanOutToAuditors Reads Row Before Spatial Columns Are Committed
**What goes wrong:** If spatial snap were in a separate transaction or if `after()` fan-out fires before the snap transaction commits, `fanOutToAuditors` would read `location_match = null`.
**Why it doesn't happen with D-41:** The spatial UPDATE is inside `getTxDb().transaction()`. `after()` fires only after the `handleConfirmSubmit` function returns (which is after the transaction commits). D-41 guarantees atomicity.
**How to verify:** The D-48 test exercises the schema; the integration test for "near" case should check `location_match` is non-null after the transaction.
**Source:** [CITED: D-41 decision in CONTEXT.md]

### Pitfall 8: location_distance_m Column — Store or Re-Compute
**What goes wrong:** The auditor caption needs the distance in metres to format `"~1.2 km"`. If not stored, `fanOutToAuditors` needs a live PostGIS query to get it. Two options: (a) store `location_distance_m numeric` on `submissions` during the snap UPDATE; (b) re-query in `fanOutToAuditors`. Option (a) is simpler and avoids a second PostGIS call.
**How to avoid:** Add `location_distance_m` column (as documented in §Schema Additions) and write it in the same UPDATE as the other spatial columns.
**Source:** [ASSUMED — architectural choice; storing avoids round-trip]

---

## Code Examples

### Complete In-Transaction Spatial Snap (Drizzle sql``)

```typescript
// Source: PostGIS official docs [CITED] + Drizzle escape hatch pattern [CITED: orm.drizzle.team/docs/guides/postgis-geometry-point]
// Context: inside getTxDb().transaction(async (tx) => { ... }) in handleConfirmSubmit

const lon = data.locationLon as number;   // Telegram: location.longitude
const lat = data.locationLat as number;   // Telegram: location.latitude
const threshold = parseInt(process.env.PROXIMITY_THRESHOLD_M ?? '500', 10);

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
    // No route row found for this project — set no_route state
    await tx.execute(sql`
      UPDATE submissions
      SET location_match = 'no_route', location_warning = false
      WHERE flow_id = ${flowId}
    `);
  }
} catch (geoErr) {
  // D-42: any PostGIS error → best-effort no_route, never abort the transaction
  console.error('[handleConfirmSubmit] spatial snap failed:', geoErr);
  try {
    await tx.execute(sql`
      UPDATE submissions
      SET location_match = 'no_route', location_warning = false
      WHERE flow_id = ${flowId}
    `);
  } catch (_) {
    // Even no_route fallback failed — log, let transaction commit with nulls
  }
}
```

### Auditor Caption Distance Formatting

```typescript
// Source: D-47 decision; microcopy specified in CONTEXT.md §Specific Ideas
// Context: inside fanOutToAuditors, after loading submission row

function formatDistance(distanceM: number): string {
  if (distanceM >= 1000) {
    return `~${(distanceM / 1000).toFixed(1)} km`;
  }
  return `~${Math.round(distanceM)} m`;
}

const locationMatch = submission.locationMatch as 'near' | 'far' | 'no_route' | null;
const distanceM = submission.locationDistanceM != null
  ? parseFloat(String(submission.locationDistanceM))
  : null;

if (locationMatch === 'far' && distanceM !== null) {
  captionLines.push(`⚠ Konum rotadan uzak (${formatDistance(distanceM)})`);
} else if (locationMatch === 'no_route') {
  captionLines.push(`ℹ Rota yüklenmemiş — konum doğrulanamadı`);
}
// near or null (pre-Phase-4 rows) → silent; existing Google Maps link already in captionLines
```

### D-48 Mandatory Coordinate-Order Unit Test

```typescript
// Source: D-48 CONTEXT.md; test pattern from tests/postgis.test.ts
// Context: tests/spatial.test.ts — new test file for Phase 4

describeIfDb('Phase 4 spatial snap (GEO-01, GEO-02)', () => {
  it('(D-48) Istanbul point (lng 28.9, lat 41.0) reads back longitude-first in GeoJSON', async () => {
    // ST_MakePoint(lon, lat) → SET SRID → ST_AsGeoJSON must output [28.9, 41.0]
    const result = await db.execute(sql`
      SELECT ST_AsGeoJSON(
        ST_SetSRID(ST_MakePoint(28.9, 41.0), 4326)
      )::json AS geojson
    `);
    const geojson = (result.rows[0] as { geojson: { coordinates: number[] } }).geojson;
    expect(geojson.coordinates[0]).toBeCloseTo(28.9, 5); // longitude first
    expect(geojson.coordinates[1]).toBeCloseTo(41.0, 5); // latitude second
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ST_ClosestPoint` alone for snapping | `ST_LineInterpolatePoint(line, ST_LineLocatePoint(line, pt))` as canonical form | PostGIS 1.1+ | Both work; the `ST_LineInterpolatePoint` form is the documented pattern when you need fraction and point together |
| `geometry` columns for distance | `::geography` cast for metre distance | PostGIS always supported; best practice since PostGIS 1.5 | Geometry vs geography is the most common source of wrong-distance bugs |
| `ST_Line_Locate_Point` (underscore) | `ST_LineLocatePoint` (camelCase) | PostGIS 2.1.0 | Old underscore form deprecated; use camelCase |

**Deprecated/outdated:**
- `ST_Line_Locate_Point`: renamed to `ST_LineLocatePoint` in PostGIS 2.1.0. Neon runs PostGIS 3.x so only the new name is used. [CITED: postgis.net/docs/ST_LineLocatePoint.html]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Storing `location_distance_m` as a numeric column is simpler than re-querying in `fanOutToAuditors` | Architecture Patterns (Pattern 4), Schema Additions | Low — either approach works; if not stored, add a re-query in fanOutToAuditors |
| A2 | Adding a GiST index on `snapped_point` in the Phase 4 migration (vs deferring to Phase 5) is the right time | Common Pitfalls (Pitfall 5) | Low — Phase 5 reads this column; adding index in Phase 4 just front-loads the cost |
| A3 | The `::geography` cast on `geometry(Point,4326)` columns in `routes.geom` works without explicit SRID re-declaration | Code Examples (canonical query) | Low — SRID 4326 is already set on the column; PostGIS geography cast requires SRID 4326 and the column already has it [ASSUMED — documented in PITFALLS but not independently verified against Neon's specific PostGIS version] |
| A4 | Neon's PostGIS version supports `ST_LineInterpolatePoint` and `ST_LineLocatePoint` | Standard Stack | Low — these functions exist since PostGIS 1.1; Neon runs PostGIS 3.x [ASSUMED — Neon PostGIS version not confirmed in fetched docs, but PostGIS 3.x is standard on managed Postgres services] |

**If this table is empty (it is not):** all claims are verified or cited.

---

## Open Questions

1. **Does `location_match` require a Postgres enum type or is a `text CHECK IN (...)` sufficient?**
   - What we know: Drizzle `text({ enum: [...] })` generates a text column with a CHECK constraint in some versions.
   - What's unclear: Whether drizzle-kit 0.31.x emits the CHECK constraint correctly for enum-restricted text columns, or generates a Postgres enum type.
   - Recommendation: Use `text` with an enum restriction in Drizzle schema. Inspect the generated migration SQL and add an explicit `CHECK ("location_match" IN ('near', 'far', 'no_route'))` if not present.

2. **What happens to pre-Phase-4 rows (existing `pending_audit` submissions) when the new columns are added?**
   - What we know: The ALTER TABLE ADD COLUMN will add the columns as NULL for existing rows. D-46 deferred item states backfill is explicitly out of scope.
   - What's unclear: Whether `fanOutToAuditors` for pre-Phase-4 rows (where `location_match IS NULL`) produces unintended caption text.
   - Recommendation: Treat `null` `location_match` as silent (same as `near`) in the auditor caption formatter — the `if/else if` pattern in Code Examples already does this correctly.

3. **`flow_id` vs `id` for targeting the spatial UPDATE**
   - What we know: The INSERT uses `onConflictDoNothing` on `flow_id`. A row with this `flow_id` always exists after the INSERT (either newly inserted or pre-existing from a duplicate confirm).
   - What's unclear: If the `onConflictDoNothing` fires (duplicate confirm), should the spatial UPDATE still run?
   - Recommendation: YES — the UPDATE re-running on an existing row is idempotent (it writes the same spatial values again). The `WHERE flow_id = :flowId` condition is safe in both the new-insert and conflict-existing cases.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostGIS (Neon) | All ST_* queries | ✓ (confirmed Phase 1 migration) | PostGIS 3.x (standard Neon) | — |
| drizzle-kit | Schema migration | ✓ | `^0.31.10` | — |
| wkx | WKB → GeoJSON decode (optional for Phase 4) | ✓ | `^0.5.0` | — |
| TEST_DATABASE_URL | D-48 coordinate-order test + snap integration tests | ✓ (used in tests/postgis.test.ts) | Neon test branch | Skip with `describeIfDb` if absent |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

---

## Validation Architecture

> `nyquist_validation: true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `/Users/arifismailbayrak/bayrak-ai/vitest.config.ts` |
| Quick run command | `npx vitest run tests/spatial.test.ts` |
| Full suite command | `npx vitest run` |
| DB-gated guard | `describeIfDb` (skips when `TEST_DATABASE_URL` is unset) |
| File parallelism | `false` (existing setting — shared Neon DB) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GEO-01 | Nearest-segment match: submission within 500m stores non-null `snapped_point` and `segment_fraction` | Integration (DB required) | `npx vitest run tests/spatial.test.ts` | ❌ Wave 0 |
| GEO-01 | Segment fraction is in [0.0, 1.0] range | Integration (DB required) | `npx vitest run tests/spatial.test.ts` | ❌ Wave 0 |
| GEO-02 | `location_match = 'far'` and `location_warning = true` when distance > threshold | Integration (DB required) | `npx vitest run tests/spatial.test.ts` | ❌ Wave 0 |
| GEO-02 | `location_match = 'near'` and `location_warning = false` when distance ≤ threshold | Integration (DB required) | `npx vitest run tests/spatial.test.ts` | ❌ Wave 0 |
| GEO-02 | `location_match = 'no_route'` and null snap columns when no route for project | Integration (DB required) | `npx vitest run tests/spatial.test.ts` | ❌ Wave 0 |
| GEO-02 | Submission still persists (status = pending_audit) even when snap fails | Integration (DB required) | `npx vitest run tests/spatial.test.ts` | ❌ Wave 0 |
| D-48 (SC3) | Istanbul point (lng 28.9, lat 41.0) reads back longitude-first in GeoJSON | Pure DB query (no full flow required) | `npx vitest run tests/spatial.test.ts` | ❌ Wave 0 |
| D-47 | Auditor caption includes distance line when `location_match = 'far'` | Unit (mock submission row) | `npx vitest run tests/spatial.test.ts` | ❌ Wave 0 |
| D-47 | Auditor caption includes neutral line when `location_match = 'no_route'` | Unit (mock submission row) | `npx vitest run tests/spatial.test.ts` | ❌ Wave 0 |
| D-47 | Auditor caption is silent (no location line) when `location_match = 'near'` | Unit (mock submission row) | `npx vitest run tests/spatial.test.ts` | ❌ Wave 0 |

### Test Data Requirements (for DB-gated tests)

To test near/far/no_route scenarios, the test must:
1. Insert a tenant, project, BOQ item, person (existing `truncateAllTables` + seed pattern in `tests/fixtures/db.ts`).
2. Insert a `routes` row with a known Istanbul LineString (e.g. two points near Istanbul: `[[28.9, 41.0], [28.95, 41.05]]`).
3. Insert a conversation_state row to provide a valid `flow_id`.
4. Call the spatial snap SQL directly (not through the full bot flow) for unit isolation.
5. Read back `location_match`, `location_warning`, `snapped_point`, `segment_fraction` to assert correct values.

**Near case fixture:** Worker location within 500m of the route (e.g. `lon=28.9, lat=41.005` — approximately 500m north of the route start).
**Far case fixture:** Worker location beyond 500m (e.g. `lon=29.5, lat=41.0` — ~50km away).
**No_route case fixture:** Project with no `routes` row.

### Sampling Rate

- **Per task commit:** `npx vitest run tests/spatial.test.ts`
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/spatial.test.ts` — covers all GEO-01, GEO-02, D-48 test cases above
- [ ] `PROXIMITY_THRESHOLD_M` must be set in `.env.test` or test setup to `500` for threshold-boundary tests
- [ ] `tests/fixtures/db.ts` — add `spatial` seed helper (route + submission fixture for snap tests)

*(All Phase 4 test infrastructure is new — no existing test file covers spatial snap behavior)*

---

## Security Domain

> `security_enforcement` not explicitly set to `false` in config — security section required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — spatial computation is server-side, no new auth surface |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A — spatial computation runs on the worker's confirmed submission; no new authorization decision |
| V5 Input Validation | yes | `lon` and `lat` are validated by Drizzle parameterized SQL — `${lon}` in `sql``  is parameterized, not interpolated as string. Prevents SQL injection through coordinate values. |
| V6 Cryptography | no | N/A |

### Known Threat Patterns for PostGIS + Drizzle Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via coordinate values | Tampering | Drizzle `sql``  template literals are parameterized — `${lon}` binds via prepared statement, not string interpolation. Never build raw SQL strings with string concatenation. |
| Geometry type confusion (SRID mismatch) | Tampering | Always use `ST_SetSRID(ST_MakePoint(lon, lat), 4326)` — explicit SRID prevents silent cross-system coordinate confusion. The GiST index on `routes.geom` enforces the type. |
| Worker location spoofing (GPS fraud) | Spoofing | Phase 4 does not address GPS fraud — this is a physical security concern. `location_warning` flags likely-wrong locations; the auditor is the human guard. Phase 6 AI vision is the technical guard. |
| Threshold manipulation via env | Elevation of Privilege | `PROXIMITY_THRESHOLD_M` is a server-side env var; not readable by workers. No UI to override it in v1 (D-45). |

---

## Sources

### Primary (HIGH confidence)
- `[CITED: postgis.net/docs/ST_LineLocatePoint.html]` — `ST_LineLocatePoint` function signature, return type (float8 0.0-1.0), version history, canonical combination with `ST_LineInterpolatePoint`
- `[CITED: postgis.net/docs/ST_LineInterpolatePoint.html]` — `ST_LineInterpolatePoint` canonical form for snapped point, documented inverse of `ST_LineLocatePoint`
- `[CITED: postgis.net/docs/ST_Distance.html]` — geography vs geometry distance return units, `::geography` cast for metres, spheroid calculation
- `[CITED: postgis.net/docs/ST_AsGeoJSON.html]` — coordinate order guarantee (longitude first per GeoJSON/RFC 7946), precision options
- `[CITED: postgis.net/docs/ST_ClosestPoint.html]` — ST_ClosestPoint function, geography support added in PostGIS 3.4.0
- `[CITED: orm.drizzle.team/docs/guides/postgis-geometry-point]` — Drizzle `sql``  escape hatch pattern, `geometry()` column definition, spatial filtering examples
- `[CITED: Project research files]` — STACK.md (nearest-segment query shape, wkx pattern), PITFALLS.md (coordinate order, geometry vs geography, GiST index), ARCHITECTURE.md (spatial subsystem, component boundaries)

### Secondary (MEDIUM confidence)
- `[CITED: neon.com/docs/extensions/postgis]` — PostGIS available on Neon; `CREATE EXTENSION` confirmed; ST_Distance and ST_DWithin confirmed working
- `[CITED: neon.com/guides/geospatial-search]` — nearest-point ordering pattern on Neon confirmed; ST_Distance sorting works

### Tertiary (LOW confidence)
- None — all claims are verified or cited.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new packages; all existing packages verified
- PostGIS SQL patterns: HIGH — all ST_* functions cited from official PostGIS docs
- Architecture: HIGH — locked by CONTEXT decisions D-41 through D-48; code patterns derived from existing codebase
- Drizzle schema additions: HIGH — follows established Phase 1/3 pattern
- Pitfalls: HIGH — derived from official docs + existing PITFALLS.md + codebase review
- Validation Architecture: HIGH — follows existing Vitest + describeIfDb pattern already proven in tests/postgis.test.ts

**Research date:** 2026-05-24
**Valid until:** 2026-06-24 (PostGIS and Drizzle APIs are stable; 30-day estimate)
