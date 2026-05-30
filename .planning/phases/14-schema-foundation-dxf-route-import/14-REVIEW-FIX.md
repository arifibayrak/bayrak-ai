---
phase: 14-schema-foundation-dxf-route-import
fixed_at: 2026-05-30T00:00:00Z
review_path: .planning/phases/14-schema-foundation-dxf-route-import/14-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 14: Code Review Fix Report

**Fixed at:** 2026-05-30T00:00:00Z
**Source review:** .planning/phases/14-schema-foundation-dxf-route-import/14-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (1 Critical + 6 Warning; Info findings IN-01..05 out of scope)
- Fixed: 7
- Skipped: 0

All fixes were applied in an isolated git worktree, verified with `npx tsc --noEmit` (0 errors after each fix) and `npx vitest run tests/dxf-parser.test.ts` (20/20 passing after each fix), and committed atomically. Migrations 0010/0011/0012 were treated as immutable and never touched; bot-audit.ts (Phase 15) was not touched.

## Fixed Issues

### CR-01: previewDxf is missing the CR-02 project-ownership / tenant check (IDOR)

**Files modified:** `src/actions/dxf-preview.ts`
**Commit:** 20a4e84
**Applied fix:** Imported `projects` and added the same ownership gate used by `uploadDxf`/`uploadRoute` immediately after the `auth()` guard and before the SSRF/fetch block: `db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, getDefaultTenantId()))).limit(1)`; returns `{ ok: false, error: 'NOT_FOUND' }` when the project is not owned. This closes the IDOR — a non-owned `projectId` now short-circuits before any cross-tenant read or server-side Blob fetch. Pattern copied verbatim from `routes.ts`. Also resolves IN-05 (misleading `currentVersion: 0` for non-existent projects) as a side effect.

### WR-01: uploadDxf computes geometry_version with a non-atomic read-modify-write (race)

**Files modified:** `src/actions/routes.ts`
**Commit:** 1050729
**Applied fix:** Removed the out-of-transaction `SELECT COALESCE(MAX(geometry_version),0)+1` and the precomputed `nextVersion` literal. Inside the transaction, the route upsert now uses `geometryVersion: 1` for the first import and `sql\`COALESCE(${routes.geometryVersion}, 0) + 1\`` in the `onConflictDoUpdate` set (mirroring `uploadRoute`), then reads the landed value back via `.returning({ id, geometryVersion })`. The `route_source_documents` insert and the activity-log metadata now use this `landedVersion`, tying the history row to the version the DB actually landed within the same transaction. Updated the docstring (T-14-VERSION) accordingly.
**Status: requires human verification** — this is a concurrency/transaction-semantics change with no unit-test coverage (the parser tests do not exercise the DB transaction). The change is reasoned correct (atomic increment derived from the row itself eliminates the dueling-import skew), but a developer should confirm behavior under a concurrent re-import scenario (and that the first-import path correctly lands version 1) before the phase proceeds.

### WR-02: previewDxf approved-count query is not tenant-scoped

**Files modified:** `src/actions/dxf-preview.ts`
**Commit:** 273032b
**Applied fix:** Added `eq(submissions.tenantId, getDefaultTenantId())` to the `and(...)` clause of the approved-count `submissions` query. `submissions.tenantId` exists (nullable, D-09). Defense-in-depth consistent with the tenant-scoped `routes` query directly above and with `getRoute`/`getRouteSourceDocuments`.

### WR-03: misleading TOO_FEW_VERTICES error code for the DoS vertex cap

**Files modified:** `src/lib/dxf-parser.ts`, `src/components/dashboard/DxfUpload.tsx`, `messages/en.json`, `messages/tr.json`
**Commit:** cdb4e2c
**Applied fix:** The DoS over-cap branch now returns the distinct `DXF_TOO_LARGE` code instead of the inverted `TOO_FEW_VERTICES`. Added a `case 'DXF_TOO_LARGE'` to `mapErrorCodeToMessage` mapping to a new `error_dxf_too_large_geometry` key, added that key to both `en.json` and `tr.json` (locale parity maintained) with "too many points / simplify the polyline" guidance, and documented the new code in the parser docstring. An engineer uploading a legitimately large centerline now gets correct guidance instead of being told to pick a layer with more points.

### WR-04: route_source_documents index ordering drift (DESC lost on regenerate)

**Files modified:** `src/db/schema/route-source-documents.ts`
**Commit:** 0c5b73c
**Applied fix:** Added `.desc()` to `uploadedAt` in the schema index: `index('route_source_documents_project_uploaded_idx').on(t.projectId, t.uploadedAt.desc())`. This aligns the Drizzle schema (source of truth for `drizzle-kit generate`) with the already-applied DESC migration `0012`. Forward-fix to the schema definition only — the immutable migration SQL was NOT touched (and is already correct).

### WR-05: getRouteSourceDocuments selects an unused column with a misleading comment

**Files modified:** `src/actions/routes.ts`
**Commit:** ff60d60
**Applied fix:** Removed the dead `projectTenantId: routeSourceDocuments.tenantId` projection (never read in the `.map()`) and replaced the misleading "join via projects to enforce CR-01" comment with one pointing at the `where` clause that actually enforces the tenant scope (`eq(routeSourceDocuments.tenantId, getDefaultTenantId())`).

### WR-06: handleUploadSuccess fabricates all-null route state, masking metadata until reload

**Files modified:** `src/components/dashboard/RouteTabClient.tsx`
**Commit:** 3d656d8
**Applied fix:** Imported `useRouter` from `next/navigation`, obtained a `router` instance, and added `router.refresh()` at the end of `handleUploadSuccess` (after `setSavedRoute`/`setIsReplacing`). The action already calls `revalidatePath`; `router.refresh()` re-fetches the RSC payload so CRS/length/geometry-version and the Kaynak Belge version-history list render the real just-uploaded data without a full navigation. Updated the placeholder comment to note the values are provisional and replaced by the refresh.

## Skipped Issues

None — all in-scope findings were fixed.

Out-of-scope (Info severity, not addressed per `critical_warning` scope): IN-01 (console.log in Blob route), IN-02 (duplicated SSRF helper), IN-03 (haversine vs ST_Length length math), IN-04 (untested magic constants). IN-05 (misleading currentVersion: 0) was resolved incidentally by the CR-01 NOT_FOUND early-return.

---

_Fixed: 2026-05-30T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
