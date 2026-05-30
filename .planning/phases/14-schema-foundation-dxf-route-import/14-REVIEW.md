---
phase: 14-schema-foundation-dxf-route-import
reviewed: 2026-05-30T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - messages/en.json
  - messages/tr.json
  - src/actions/dxf-preview.ts
  - src/actions/routes.ts
  - src/app/api/dxf-upload/route.ts
  - src/components/dashboard/DxfUpload.tsx
  - src/components/dashboard/PdfViewer.tsx
  - src/components/dashboard/RouteTab.tsx
  - src/components/dashboard/RouteTabClient.tsx
  - src/db/migrations/0010_v4_routes_ext.sql
  - src/db/migrations/0011_v4_ai_flags.sql
  - src/db/migrations/0012_v4_route_source_documents.sql
  - src/db/schema/ai-flags.ts
  - src/db/schema/index.ts
  - src/db/schema/office-activity-log.ts
  - src/db/schema/route-source-documents.ts
  - src/db/schema/routes.ts
  - src/db/schema/submissions.ts
  - src/lib/crs.ts
  - src/lib/dxf-parser.ts
  - tests/dxf-parser.test.ts
  - tests/fixtures/db.ts
  - tests/fixtures/dxf.ts
  - vitest.config.ts
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-05-30T00:00:00Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Reviewed the DXF route-import phase: the Blob token route, the `previewDxf`/`uploadDxf` Server Actions, the proj4 reprojection + Turkey-bbox gate, the atomic write transaction, the three migrations (0010/0011/0012 — already applied, immutable), and the supporting UI/schema/test files.

The security spine is mostly well-built: the Blob token route gates on `auth()`, `uploadDxf`/`uploadRoute` both carry the CR-02 ownership check + SSRF host validation, geometry is parameterized through `ST_GeomFromGeoJSON`, the transaction wraps the route upsert + source-doc insert, and i18n key parity (en/tr) is exact. CRS definitions and the bbox gate are sound, and the test fixtures exercise the right error paths.

However, one Server Action in the same trust surface — `previewDxf` — is missing the CR-02 ownership check that its siblings enforce. Because it accepts an attacker-supplied `blobUrl` and an arbitrary `projectId`, it leaks cross-tenant data (current geometry version, approved-submission count) and performs a server-side `fetch` for any authenticated session against any project. This is the IDOR the rest of the phase was explicitly hardened against. There are also a non-atomic version-number computation, a schema/migration index-ordering drift, and an unscoped approved-count query.

## Critical Issues

### CR-01: previewDxf is missing the CR-02 project-ownership / tenant check (IDOR)

**File:** `src/actions/dxf-preview.ts:47-135`
**Issue:** `uploadDxf` (`routes.ts:135-141`) and `uploadRoute` (`routes.ts:50-57`) both verify the target project belongs to the active tenant before touching it:

```ts
const owned = await db.select({ id: projects.id }).from(projects)
  .where(and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId())))
  .limit(1);
if (!owned.length) throw new Error('Not found');
```

`previewDxf` performs only `auth()` and then proceeds straight to the SSRF check + Blob fetch + DB reads using the caller-supplied `projectId` with **no ownership gate**. The header comment even claims "Security (T-14-AUTHZ): auth() guard before any Blob fetch" but stops at authentication, never authorization.

Concrete impact for any authenticated office user:
1. Cross-tenant disclosure — the function returns `currentVersion` (`routes.geometryVersion`) and `approvedCount` for an arbitrary `projectId`. The `routes` read is tenant-scoped (`:106`) so version leaks only within the default tenant today, but the `submissions` approved-count read (`:113-121`) is scoped **only by `projectId`** (see WR-02) and will count rows for any project id supplied. In a future multi-tenant migration (which CLAUDE.md mandates the code must not block) this becomes a direct cross-tenant data leak.
2. Server-side fetch on demand — it `fetch()`es any attacker-controlled `blobUrl` that passes the host suffix check, for any session, with no project-ownership tie. This is exactly the SSRF/IDOR pairing the other two actions defend against.

This is a `'use server'` action; `projectId` and `blobUrl` are fully attacker-controlled inputs, not trusted props.

**Fix:** Add the same ownership gate as the sibling actions, immediately after `auth()` and before the SSRF/fetch block:
```ts
const session = await auth();
if (!session) throw new Error('Unauthorized');

// CR-02 parity: verify project belongs to the active tenant before any read/fetch.
const owned = await db
  .select({ id: projects.id })
  .from(projects)
  .where(and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId())))
  .limit(1);
if (!owned.length) return { ok: false, error: 'NOT_FOUND' };
```
(`projects` import + `eq`/`and` are already available patterns; `eq`/`and` are imported in this file.)

## Warnings

### WR-01: uploadDxf computes geometry_version with a non-atomic read-modify-write (race)

**File:** `src/actions/routes.ts:177-228`
**Issue:** `nextVersion` is computed by a `SELECT COALESCE(MAX(geometry_version),0)+1` that runs **outside** the `db.transaction`, then the transaction inserts/updates with that pre-computed literal. Two concurrent `uploadDxf` calls for the same project can both read the same MAX, both compute the same `nextVersion`, and the second `route_source_documents` INSERT will persist a duplicate `geometry_version` (there is intentionally no unique constraint on that table — `route-source-documents.ts:42`). The route row itself is upsert-protected by the `routes.projectId` unique constraint, but the source-document history (the D-05 audit trail of record) can record two rows claiming the same version, and `routes.geometryVersion` can end up lower than the count of imports. The header comment claims this is the "Pitfall 6 mitigation," but reading MAX outside the transaction does not make it atomic.

**Fix:** Compute the version inside the transaction and derive it from the row being written rather than a separate MAX read. Simplest correct form: move the MAX `SELECT` inside `db.transaction` (still racy under READ COMMITTED), or better, make `routes.geometryVersion` the source of truth via `COALESCE(routes.geometry_version,0)+1` in the upsert `set` (as `uploadRoute` already does at `:82`) and read the returned value back for the source-doc insert:
```ts
const upserted = await tx.insert(routes).values({ /* ... geometryVersion: 1 ... */ })
  .onConflictDoUpdate({ target: routes.projectId, set: {
    /* ... */ geometryVersion: sql`COALESCE(${routes.geometryVersion}, 0) + 1`,
  }}).returning({ id: routes.id, geometryVersion: routes.geometryVersion });
const landedVersion = upserted[0].geometryVersion;
await tx.insert(routeSourceDocuments).values({ /* ... */ geometryVersion: landedVersion });
```
This ties the history row to the version the DB actually landed, eliminating the dueling-import skew.

### WR-02: previewDxf approved-count query is not tenant-scoped

**File:** `src/actions/dxf-preview.ts:113-121`
**Issue:** The `submissions` approved-count query filters on `projectId` and `status` only — no `tenantId` predicate — while the `routes` query directly above it (`:100-109`) is tenant-scoped. `submissions.tenantId` exists (`submissions.ts:13`). Combined with the missing ownership gate (CR-01), this counts approved submissions for any project id. Even once CR-01 is fixed, scoping this query is defense-in-depth consistent with the rest of the file and with `getRoute`/`getRouteSourceDocuments` in `routes.ts`.

**Fix:** Add `eq(submissions.tenantId, getDefaultTenantId())` to the `and(...)` clause.

### WR-03: routes.geom is silently lost on DXF reproject failure mid-stream — DoS guard error code is misleading

**File:** `src/lib/dxf-parser.ts:243-247`
**Issue:** The DoS vertex-count cap returns `error: 'TOO_FEW_VERTICES'` when `totalVertices > MAX_VERTEX_COUNT` — the exact opposite of the real condition (too *many* vertices). The inline comment admits this: "overloaded: too-many becomes a fail." The UI maps `TOO_FEW_VERTICES` to "Select a layer with at least 2 points" (`DxfUpload.tsx:916-918`, en.json `error_dxf_too_few_vertices`), so an engineer who uploads a legitimately large centerline is told to pick a layer with *more* geometry — the inverse of the correct guidance, sending them into a loop. This is a correctness/maintainability defect in user-facing error semantics.

**Fix:** Introduce a distinct `TOO_MANY_VERTICES` (or `DXF_TOO_LARGE`) error code, map it to a "file too large / simplify the polyline" message in `mapErrorCodeToMessage` + both message files, and return it here.

### WR-04: route_source_documents index ordering drifts between schema and migration (DESC lost on regenerate)

**File:** `src/db/schema/route-source-documents.ts:41` (migration `0012_v4_route_source_documents.sql:32` is immutable — forward-fix advisory)
**Issue:** The applied migration creates `... USING btree ("project_id", "uploaded_at" DESC)`. The Drizzle schema declares `index('route_source_documents_project_uploaded_idx').on(t.projectId, t.uploadedAt)` with **no `.desc()`** on `uploadedAt`. Drizzle's `.on()` defaults to ASC. The DB is correct today (migration won), but the schema is the source of truth for the next `drizzle-kit generate`: a future regenerate will emit an ASC index and either produce a spurious drift diff or, if applied, replace the DESC index — degrading the "newest import first" history query the index was built for. The same latent ASC-vs-DESC mismatch should be checked anywhere ordered indexes were hand-edited.

**Fix:** Align the schema with the applied DDL: `index(...).on(t.projectId, t.uploadedAt.desc())`. No migration edit needed (0012 is immutable and already correct).

### WR-05: getRouteSourceDocuments selects a column it never uses (dead projection + misleading comment)

**File:** `src/actions/routes.ts:386-396`
**Issue:** The select adds `projectTenantId: routeSourceDocuments.tenantId` with the comment "Tenant scope: join via projects to enforce CR-01," but there is no join, the column is never read in the `.map()` (`:399-410`), and tenant scoping is actually enforced by the `where` clause at `:393`. The selected field is dead, and the comment describes a join that does not exist — a future maintainer may believe a projects-join is providing isolation when it is not.

**Fix:** Remove the `projectTenantId` projection field and correct the comment to point at the `where` clause that actually enforces the tenant scope.

### WR-06: handleUploadSuccess fabricates client route state with all-null provenance, masking failed metadata until reload

**File:** `src/components/dashboard/RouteTabClient.tsx:101-114`
**Issue:** After a successful DXF import the client sets `savedRoute` with `totalLengthM/sourceCrs/sourceLayer/geometryVersion/sourceBlobUrl` all `null` and a fabricated `uploadedAt: new Date().toISOString()`, with the comment "null until the page reloads with fresh server data." But there is no `router.refresh()` / `revalidate` triggering a client re-render here — `revalidatePath` in the action invalidates the server cache, yet this client component holds the stale all-null `savedRoute` in `useState` and will keep showing a route with no CRS/length/version (and the Kaynak Belge version-history list will not include the just-uploaded doc) until a full navigation. For a DXF import — whose entire point is provenance + version metadata — the success state hides exactly the data the engineer just produced.

**Fix:** Call `router.refresh()` (via `useRouter`) inside `handleUploadSuccess` after `setSavedRoute`, or have `onSuccess` return the full serialized route from the action so the client can render real values immediately.

## Info

### IN-01: console.log left in production Blob route handler

**File:** `src/app/api/dxf-upload/route.ts:47`
**Issue:** `console.log('[dxf-upload] blob upload complete:', blob.url)` logs blob URLs to production logs on every completed upload. Low severity but it is a debug artifact and leaks storage URLs into log aggregation.
**Fix:** Remove or gate behind a debug flag / structured logger.

### IN-02: SSRF host check duplicated verbatim across two actions

**File:** `src/actions/routes.ts:143-156` and `src/actions/dxf-preview.ts:57-70`
**Issue:** The identical URL-parse + `protocol !== 'https:'` + `hostname.endsWith('.public.blob.vercel-storage.com')` block is copy-pasted. Duplicated security logic risks the two copies diverging (e.g., one gets a fix the other misses — already true for the ownership check, see CR-01).
**Fix:** Extract a shared `isValidBlobUrl(url: string): boolean` helper in `src/lib/` and call it from both actions.

### IN-03: previewDxf totalLengthM (haversine) and write-path totalLengthM (ST_Length::geography) use different math

**File:** `src/actions/dxf-preview.ts:96,141-158` vs `src/actions/routes.ts:194`
**Issue:** The preview length shown to the engineer is a haversine approximation (spherical, ~0.3% error per the comment), but the persisted/displayed value comes from PostGIS `ST_Length::geography` (ellipsoidal). The "unusual length" badge threshold (`DxfUpload.tsx:219`) is evaluated against the haversine value, so a route near a boundary could be flagged in preview but not reflect the stored value (or vice versa). Cosmetic, but a length that visibly changes between preview and saved card can erode trust in a CRS-verification UI.
**Fix:** Document the discrepancy in the UI, or compute the preview length with a closer ellipsoidal approximation; acceptable as-is if the ~0.3% delta is deemed immaterial.

### IN-04: MAX_VERTEX_COUNT (100,000) and GAP_THRESHOLD_M (1.0) are unvalidated magic constants with no test coverage

**File:** `src/lib/dxf-parser.ts:45,51`
**Issue:** The DoS cap and gap threshold are module constants with no test asserting behavior at the boundary (e.g., a fixture exceeding 100k vertices, or a gap exactly at 1.0m). The stitch/gap logic and the cap are the two most security/behavior-sensitive numbers in the parser and are untested.
**Fix:** Add fixtures exercising the over-cap path (expect the too-many error code from WR-03) and a gap just above/below threshold.

### IN-05: previewDxf reaches DB even when the project does not exist, returning a misleading currentVersion: 0

**File:** `src/actions/dxf-preview.ts:100-111`
**Issue:** With no ownership gate (CR-01), a non-existent or non-owned `projectId` yields `existingRoute === undefined` → `currentVersion = 0` and `approvedCount = 0`, which the UI renders as a clean "first import" with no re-import warning. Once CR-01's `NOT_FOUND` early-return is added, this resolves naturally; noting it here as the user-visible symptom of the missing check.
**Fix:** Resolved by CR-01.

---

_Reviewed: 2026-05-30T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
