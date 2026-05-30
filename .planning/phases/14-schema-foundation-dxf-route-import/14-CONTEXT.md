# Phase 14: Schema Foundation + DXF Route Import - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Office engineers can import a pipeline route from a **DXF** file: declare the source coordinate system, pick the centerline layer, confirm the reprojected route on a mandatory **satellite preview** before any DB write, and have the original drawing(s) stored for reference beside the map. The existing **GeoJSON upload path keeps working unchanged**. This phase also lands the **schema foundation for all of v4.0**: `routes` extended (provenance + `total_length_m` + `geometry_version`), `submissions` extended (`chainage_m`, `route_geometry_version`), and the `submission_ai_flags` table created (consumed in Phase 16). Requirements: RTE-01..05 + the v1 bookkeeping reconciliation.

**Not this phase:** chainage views / approval-time chainage snapshot writes (Phase 15), AI vision logic (Phase 16). The chainage/AI *columns* land here; the *behavior* that writes/reads them does not.

</domain>

<decisions>
## Implementation Decisions

### CRS Selection
- **D-01:** CRS dropdown **defaults to TUREF/TM30 (EPSG:5254)** — the modern Trakya/Turkey standard — and shows all 7 presets (5254 TM30, 5253 TM27, 5255 TM33, 23035 ED50/UTM35N, 23036 ED50/UTM36N, 32635 WGS84/UTM35N, 32636 WGS84/UTM36N). **Remember the last-used CRS per project** to reduce friction on re-import. The mandatory satellite preview remains the safety net regardless of default.

### Centerline Layer Selection
- **D-02:** Parse the layer list first and present **all layers with vertex/entity counts**; **auto-highlight layers named AXIS / CL / CENTERLINE / MERKEZ** as the suggested default, but require the engineer's explicit confirmation. Only the selected layer is parsed for geometry.
- **D-03:** If the selected layer contains **multiple polylines, stitch them end-to-end into one ordered route**, and **warn if there is a gap** between consecutive segments. (LWPOLYLINE/POLYLINE only; SPLINE entities on the layer trigger a non-blocking "use LWPOLYLINE export" warning per research; reject if < 2 vertices remain.)

### Re-import & Versioning
- **D-04:** Re-importing on a project that **already has approved work** = **warn-and-proceed**. The warning names the N approved submissions whose recorded chainage is preserved; the new geometry is stored under an **incremented `geometry_version`**; existing approved `chainage_m` is never rewritten.
- **D-05:** **Keep ALL prior source drawings as version history** (audit trail) — not just the latest — consistent with the immutable as-built philosophy.

### Source Document Viewing (RTE-03)
- **D-06:** A project can hold **both a DXF (geometry source) and a PDF (general-arrangement / reference drawing)**. PDFs render in an **inline viewer (react-pdf)** beside the map; the DXF is exposed as a **"Kaynak Belge" download link**. The declared CRS and selected layer name are shown in the route metadata card.

### Carried Forward (locked by research — not re-discussed, do not revisit)
- DXF only (DWG handled via engineer-exported DXF; no binary parser). **Explicit CRS declaration, no auto-detect.** **Mandatory satellite preview before any DB write.** Reproject in JS via `proj4` at upload time (not `ST_Transform`). **Turkey bounding-box validation** after reprojection (lng 25.7–44.8, lat 35.8–42.2) — reject axis-swapped / out-of-Turkey coords before any DB write. Chainage **snapshotted at approval** (Phase 15) with **route geometry versioning** so re-import never rewrites history. DXF upload via **Vercel Blob direct PUT** (not Next.js bodyParser — 4.5 MB limit vs large DXF). The existing GeoJSON LineString path is unchanged and additive.

### Claude's Discretion
- Preview affordances beyond the line itself (start/end markers, a computed **total-length-in-km readout** and bounding-box sanity line are recommended but optional).
- Migration packaging (single `0010` vs split `0010/0011`), exact column types/precision, GIST index placement, and the `total_length_m` recompute on the existing `uploadRoute` path — planner/research own these.

### Folded Todos
- **`tenant-settings-seed-fk-safe`** (`.planning/todos/pending/tenant-settings-seed-fk-safe.md`): the existing migration `0007` seeds a default-tenant row with a hard FK INSERT that fails on fresh/test/preview DBs where the default tenant is absent. Phase 14 introduces new migrations/seed rows, so adopt the **FK-safe portable seed pattern** (`INSERT ... SELECT ... WHERE EXISTS (SELECT 1 FROM tenants WHERE id = ...)`) for any default-row seeding added here. Do **not** edit the already-applied `0007` (hash integrity); apply the fix forward in the new v4 migration.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v4.0 Research (read first — decisions already locked here)
- `.planning/research/SUMMARY.md` — RESOLVED chainage-snapshot decision (snapshot at approval; versioned routes), the schema-additions block for migration 0010/0011, and the Phase-14 delivery list. **MUST read.**
- `.planning/research/ARCHITECTURE.md` — component inventory (NEW vs MODIFIED): `uploadDxf` mirrors `uploadRoute`, `src/lib/dxf-parser.ts` pure lib, `DxfUpload.tsx`, schema columns, build order.
- `.planning/research/PITFALLS.md` — 13 pitfalls; highest severity here: CRS-as-WGS84 (catastrophic), re-import chainage shift (critical), wrong centerline layer (high), proj4 axis order, both-Neon-branch migration, Blob 4.5 MB limit.
- `.planning/research/STACK.md` — exact versions (`dxf-parser` 1.1.2, `proj4` 2.20.8, `react-pdf` 10.4.1 + `pdfjs-dist` 5.7.284) and the 7 hardcoded Turkey EPSG proj4 strings for `src/lib/crs.ts`.
- `.planning/research/FEATURES.md` — DXF import workflow + stationing/chainage domain conventions (K+MMM notation).

### Phase contract
- `.planning/ROADMAP.md` §"Phase 14" — goal + 6 success criteria (incl. SC5 `reprojectToWGS84(5254, 600000, 4570000)` bounding-box test, SC6 bookkeeping reconciliation).
- `.planning/REQUIREMENTS.md` — RTE-01..05 + the Housekeeping bookkeeping-reconciliation item.

### Existing code to extend / mirror
- `src/db/migrate.ts` — the project migration runner; **drizzle-kit push is unusable (D-49)**; apply to BOTH `neondb` and `neondb_test`.
- `src/actions/routes.ts` — existing `uploadRoute` Server Action to mirror for `uploadDxf` and to patch for `total_length_m` / `geometry_version`.
- `src/db/schema/routes.ts` — the `routes` table to extend.
- `src/lib/geojson.ts` — existing WGS84 LineString validation to reuse.
- `src/components/dashboard/RouteUpload.tsx`, `RouteTab.tsx` / `RouteTabClient.tsx` — UI patterns + mount point for `DxfUpload`, the metadata card, the Kaynak Belge link, and the PDF viewer.
- `.planning/todos/pending/tenant-settings-seed-fk-safe.md` — folded todo (FK-safe seed pattern).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`uploadRoute` Server Action** (`src/actions/routes.ts`): the auth-guard → ownership-check → validate → `ST_GeomFromGeoJSON` upsert path. `uploadDxf` mirrors it after DXF parse + reprojection produce a GeoJSON LineString; both converge on the same upsert.
- **`RouteUpload.tsx`**: drop-zone / validate / save state machine — direct template for `DxfUpload.tsx` (swap `.geojson` accept for `.dxf`, add CRS selector + layer picker + preview modal).
- **`src/lib/geojson.ts`**: WGS84 LineString validation — reuse on the reprojected output so DXF and GeoJSON share one validation gate.
- **`@vercel/blob`** (existing photo-upload pattern): reuse for storing the raw DXF/PDF source documents (direct PUT, not bodyParser).

### Established Patterns
- Migrations authored + applied via `npx tsx src/db/migrate.ts`, **immutable after apply** (hash integrity); `geometry(LineString,4326)` needs the LineString type hand-edit and a hand-added GIST index (drizzle-kit emits neither); every new migration must be applied to **both** Neon branches before preview deploy.
- `tenant_id` required on every insert (`getDefaultTenantId()`); FK-safe seed pattern needed for portability (see folded todo).

### Integration Points
- `routes` table gains provenance + `total_length_m` + `geometry_version`; `submissions` gains `chainage_m` + `route_geometry_version`; new `submission_ai_flags` table — all land in this phase as the v4 foundation, even though Phase 15 (chainage write/read) and Phase 16 (AI) consume them.
- `handleAuditDecision` (`src/lib/bot-audit.ts`) is **not modified in Phase 14** — Phase 15 owns the approval-time `chainage_m` snapshot. Phase 14 only ensures the columns exist.

</code_context>

<specifics>
## Specific Ideas

- Turkish UI label **"Kaynak Belge"** for the source-document link/section.
- Default CRS **TUREF/TM30** reflects the Trakya regional standard; the preset list is hardcoded (no runtime epsg.io fetch).
- Preview should ideally surface a **total-length (km)** readout so the engineer gets an immediate sanity signal alongside the visual.

</specifics>

<deferred>
## Deferred Ideas

- **Chainage calibration "anchor on map" UX** (pick a GPS point, enter a known station, system solves the offset) — deferred to v4.x; Phase 15 ships a simple numeric offset input only.
- **SPLINE entity tessellation** — deferred to v4.x; v4.0 warns and skips SPLINE.
- **Full in-browser DXF viewer** — anti-feature (CAD software does this better); DXF stays a download link.

### Reviewed Todos (not folded)
- **`submission-detail-map-link`** — routed to **Phase 15** (it exposes snapped-point lat/lon on the canonical submission detail view, which rides the chainage drill-down). Considered for Phase 14 but belongs with the chainage work.

</deferred>

---

*Phase: 14-schema-foundation-dxf-route-import*
*Context gathered: 2026-05-30*
