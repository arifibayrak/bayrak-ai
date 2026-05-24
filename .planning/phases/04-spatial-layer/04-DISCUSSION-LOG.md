# Phase 4: Spatial Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 4-Spatial Layer
**Areas discussed:** Match timing & placement, No-route / unmatchable handling, Threshold configurability, Snapped-point model & auditor flag

---

## Match timing & placement

### Q1: Where should the PostGIS match run relative to the confirm insert?

| Option | Description | Selected |
|--------|-------------|----------|
| In the insert transaction | Compute all spatial values in the same getTxDb() transaction; warning guaranteed present when fan-out loads the row; no race | ✓ |
| Separate step before fan-out | Insert as-is, then standalone spatial UPDATE before scheduling fan-out; two round-trips, not atomic | |
| Async in the fan-out path | Compute inside the after() fan-out task; risk the snap isn't ready when the auditor message is built | |

**User's choice:** In the insert transaction
**Notes:** Selected the previewed insert→UPDATE-in-transaction shape (location/snapped_point/segment_fraction/location_warning computed before commit). → D-41.

### Q2: If the spatial computation fails inside that transaction, what happens to the submission?

| Option | Description | Selected |
|--------|-------------|----------|
| Always persist, snap best-effort | Submission MUST commit; geo failure → null snap + warning; snap runs guarded so it degrades, not aborts (D-39/D-40) | ✓ |
| Roll back on geo failure | Every committed row fully snapped; transient PostGIS/route issue costs the worker their submission | |

**User's choice:** Always persist, snap best-effort
**Notes:** Never lose verified field work; geo issues degrade gracefully. → D-42.

---

## No-route / unmatchable handling

### Q1: How to treat a route-less project vs a real >500 m anomaly?

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct states, distinct flags | Three outcomes: matched-near, matched-far (alarm), unverifiable/no-route (neutral); avoids crying wolf for the office's missing route | ✓ |
| One generic 'unverified' flag | Single warning for far OR no-route OR error; conflates worker-off-route with office-hasn't-uploaded | |
| No route = no warning | location_warning means only 'matched and far'; no route → null snap, no warning, zero signal | |

**User's choice:** Distinct states, distinct flags
**Notes:** A missing route is the office's gap, not the worker's fault. → D-43.

### Q2: How to represent the three states in schema?

| Option | Description | Selected |
|--------|-------------|----------|
| Status column + keep boolean | location_match enum/text ('near'/'far'/'no_route') as source of truth + location_warning boolean (true only for 'far'); snap null when 'no_route' | ✓ |
| Boolean only, infer no-route | Just location_warning; infer no-route at read time by joining routes | |
| Boolean + nullable reason text | Boolean + free-text/short-code reason; flexible but unstructured | |

**User's choice:** Status column + keep boolean
**Notes:** Explicit, queryable, lets Phase 5 color markers by status. → D-44.

---

## Threshold configurability

### Q1: How configurable should the 500 m threshold be for v1?

| Option | Description | Selected |
|--------|-------------|----------|
| Single env-configurable constant | One value (default 500) from env/config; tunable without code change; no schema/UI work | ✓ |
| Per-project column | projects.proximity_threshold_m + office edit UI; flexible but adds column + Phase 5 control now | |
| Hardcoded constant | Documented literal 500; changing it needs a code edit + deploy | |

**User's choice:** Single env-configurable constant
**Notes:** Right-sized for solo MVP / single family firm; per-project deferred to v2. → D-45.

---

## Snapped-point model & auditor flag

### Q1: Where do the snapped coordinates live?

| Option | Description | Selected |
|--------|-------------|----------|
| Columns on submissions only | Snap on the submission row at submission time; 'approved_points' = query over approved+snapped rows; no extra table/view | ✓ |
| Separate approved_points table | Copy snapped coords on approval; read-optimized but needs sync + risks drift | |
| Columns + a DB view | Columns + a SQL view named approved_points for Phase 5 convenience | |

**User's choice:** Columns on submissions only
**Notes:** Single source of truth, matches SC1, no denormalization. → D-46.

### Q2: What does the distance anomaly look like in the auditor notification?

| Option | Description | Selected |
|--------|-------------|----------|
| Flag + actual distance | Show the number (matched-far: '⚠ Konum rotadan uzak (~1.2 km)'); no-route neutral note; keep Maps link; mirrors D-28 | ✓ |
| Bare flag only | '⚠ Konum rotadan uzak' with no distance; 60 m and 5 km look identical | |
| Flag + distance + snapped link | Distance + a second pin to the snapped point; most context, more clutter | |

**User's choice:** Flag + actual distance
**Notes:** Auditor gauges severity; follows the D-28 over-delivery "show the number" pattern. → D-47.

---

## Claude's Discretion

- Exact ST_* SQL for the match (ST_MakePoint/ST_SetSRID/ST_ClosestPoint/ST_LineLocatePoint/ST_Distance with ::geography) and single-statement vs guarded UPDATE within the transaction (honor D-41 + D-42).
- New column names, location_match enum-vs-text, added indexes; honor tenant_id-on-insert (D-09), register in schema index, generate + push migration.
- Final Turkish microcopy and human distance formatting (m vs km, rounding) for the D-47 flag.
- Geometry read-back mechanism (ST_AsGeoJSON / wkx) for internal use; Phase 5 owns map rendering.

## Deferred Ideas

- Per-project proximity threshold column + office UI (v2).
- Second map pin to the snapped point in the auditor message.
- Recompute snap on resubmission / route re-upload.
- Backfill of pre-Phase-4 submissions (stay null in v1).
- Per-segment / chainage scoping of the anomaly (v2, AUDIT-V2-02).
