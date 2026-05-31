---
phase: 15-chainage-as-built-view-approval-snapshot
verified: 2026-05-31T00:00:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 15: Chainage As-Built View + Approval Snapshot — Verification Report

**Phase Goal:** Every approved submission carries an immutable chainage snapshot taken at the moment of auditor approval, and the office can view a per-kilometre as-built strip of the route showing what work was done at each segment, drill into the underlying submissions, see route completion %, and export the as-built record to Excel and PDF.

**Verified:** 2026-05-31
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth (Success Criterion) | Status | Evidence |
|---|--------------------------|--------|----------|
| 1 | On auditor approval, `submissions.chainage_m` is non-NULL `numeric(10,2)` + `route_geometry_version` set — no extra action | ✓ VERIFIED | `bot-audit.ts:481-482` — inside the approval TX: `chainageM: sql2\`ROUND(${segmentFraction}::numeric * ${totalLengthM}::numeric, 2)\`` and `routeGeometryVersion: route.geometryVersion`; same-transaction write (T-15-02-WINDOW); test suite 21/21 green including snapshot test |
| 2 | As-Built tab: per-km strip table, colour-coded status, work count, qty by BOQ, worker + auditor names; "km X+YYY" convention | ✓ VERIFIED | `ChainageTable.tsx` renders BrandTable with status BrandBadge (approved/in_progress/not_started), approvedCount+pendingCount, boqBreakdown, workers, auditors columns; `formatChainage()` produces "km X+YYY"; CSS colour bar (emerald/amber/slate); confirmed wired into project page at `/dashboard/projects/[id]` `tab=asbuilt`; human UAT approved (Plan 15-07) |
| 3 | Row click → canonical submission detail; back-link returns to strip | ✓ VERIFIED | `ChainageTable.tsx:207` links to `/dashboard/records/${bucket.firstSubmissionId}?from=asbuilt`; `SubmissionDetailView.tsx:99-107` renders back-link with `router.back()` when `from === 'asbuilt'`; i18n key `back_to_asbuilt` present |
| 4 | Route completion % KPI (approved metres / total, clamped 100%); over-100% bucket shows 100% | ✓ VERIFIED | `chainage-data.ts:230-231` — `Math.min(100, Math.round((coveredBuckets / totalBuckets) * 100))`; KpiCard rendered in ChainageTab with completion%; tests green |
| 5 | Numeric calibration offset; after save, calibrated value shows across dashboard strip, Telegram notifications, and Excel/PDF exports | ✓ VERIFIED | `setChainageOffset` action stores `chainageOffsetM` (as string for numeric precision) on routes row; `fetchChainageBucketsRaw` applies offset inside Postgres FLOOR; bot-audit worker notification applies `formatChainage(capturedChainageM + capturedChainageOffsetM)` (line 570); export route calls `fetchChainageBucketsRaw` with same offset; calibration form wired in ChainageOffsetForm; human UAT approved |
| 6 | Excel export (8 cols: Km Başlangıç, Km Bitiş, İş Adedi, Malzeme, Miktar, Birim, İşçi, Denetçi) + PDF; auth-guarded (401 no session) | ✓ VERIFIED | `chainage-excel.ts` defines exactly 8 columns with those Turkish headers; `chainage-pdf.tsx` renders same 8 columns with DejaVuSans font; `route.ts:50-53` — `auth()` is first statement, returns 401 JSON on null session; route imports `fetchChainageBucketsRaw` NOT the 'use server' action (Pitfall 6 compliance) |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/format-chainage.ts` | Turkish km X+YYY formatter | ✓ VERIFIED | Pure utility, zero imports, correct implementation |
| `src/lib/bot-audit.ts` | Snapshot write in approve TX | ✓ VERIFIED | `chainageM` + `routeGeometryVersion` set inside same TX as status flip; `logOfficeActivity` count = 0 (Pitfall 5 clean); `after()` references are comment-only (0 functional calls) |
| `src/actions/chainage.ts` | `getChainageBuckets` + `setChainageOffset` | ✓ VERIFIED | Auth-guarded, tenant-scoped, whitelist-validated bucket sizes, offset stored as string |
| `src/lib/chainage-data.ts` | `fetchChainageBucketsRaw` shared helper | ✓ VERIFIED | Not a 'use server' action; imports `sql` from drizzle-orm; full generate_series SQL with three-state logic; offset applied inside Postgres FLOOR; completion % clamped via `Math.min(100, ...)` |
| `src/app/api/exports/chainage/route.ts` | Auth-guarded export route | ✓ VERIFIED | `auth()` line 50 is first statement; imports `fetchChainageBucketsRaw` (not Server Action); 401 JSON on null session |
| `src/lib/chainage-excel.ts` | 8-column Excel builder | ✓ VERIFIED | Exact 8 Turkish headers; `sanitizeExcelCell` on user-content; `formatChainage` for km columns |
| `src/lib/pdf/chainage-pdf.tsx` | PDF renderer with DejaVu font | ✓ VERIFIED | `@react-pdf/renderer`; DejaVuSans fontFamily; same 8 columns as Excel |
| `src/components/dashboard/ChainageTab.tsx` | As-Built tab RSC | ✓ VERIFIED | Calls `getChainageBuckets`, renders KpiCard, ChainageOffsetForm, ChainageTable |
| `src/components/dashboard/ChainageTable.tsx` | Client table + colour bar | ✓ VERIFIED | 'use client'; granularity toggle; CSS colour bar; drill-down links with `?from=asbuilt` |
| `src/components/dashboard/ChainageOffsetForm.tsx` | Calibration form | ✓ VERIFIED | Calls `setChainageOffset`, router.refresh() on success |
| `src/db/migrations/0013_v4_chainage_backfill.sql` | Historical backfill migration | ✓ VERIFIED | Idempotent UPDATE with `chainage_m IS NULL` guard; Postgres-side `ROUND(..., 2)` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `handleAuditDecision` approve branch | `submissions.chainage_m` | same-TX UPDATE inside `txDb.transaction` | ✓ WIRED | `bot-audit.ts:478-484`; T-15-02-WINDOW: no gap between status flip and snapshot |
| `ChainageTable` row | `/dashboard/records/[id]?from=asbuilt` | `href` link | ✓ WIRED | `ChainageTable.tsx:207` |
| `SubmissionDetailView` | As-Built back navigation | `router.back()` when `from === 'asbuilt'` | ✓ WIRED | `SubmissionDetailView.tsx:102` |
| `/api/exports/chainage` | `fetchChainageBucketsRaw` | direct import (not Server Action) | ✓ WIRED | `route.ts:35,65`; Pitfall 6 compliance confirmed |
| `fetchChainageBucketsRaw` | `chainage_offset_m` | applied inside Postgres FLOOR expression | ✓ WIRED | `chainage-data.ts:111-113` |
| Worker notification | calibrated chainage label | `formatChainage(capturedChainageM + capturedChainageOffsetM)` | ✓ WIRED | `bot-audit.ts:570` |
| `setChainageOffset` | `routes.chainage_offset_m` | Drizzle UPDATE | ✓ WIRED | `chainage.ts:109-116` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ChainageTab` | `buckets`, `completionPct` | `getChainageBuckets` → `fetchChainageBucketsRaw` → live Postgres `generate_series` + `submissions` JOIN | Yes — live DB query | ✓ FLOWING |
| `ChainageTable` | `buckets` (state) | `initialBuckets` prop from RSC; granularity change refetches via Server Action | Yes | ✓ FLOWING |
| `/api/exports/chainage` | `data.buckets` | `fetchChainageBucketsRaw` → same Postgres aggregation | Yes | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Chainage test suite (snapshot + completion + format) | `npx vitest run tests/chainage.test.ts` | 21 PASS, 0 FAIL | ✓ PASS |
| TypeScript compilation | `npx tsc --noEmit` | Exit 0, no errors | ✓ PASS |
| Pitfall 5 — no `logOfficeActivity` in bot-audit.ts | `grep -c logOfficeActivity src/lib/bot-audit.ts` | 0 matches | ✓ PASS |
| Pitfall 5 — no functional `after()` call in bot-audit.ts | `grep -c "after(" src/lib/bot-audit.ts` | 0 functional calls (2 comment-only occurrences) | ✓ PASS |
| Export route imports shared helper, not Server Action | `grep fetchChainageBucketsRaw src/app/api/exports/chainage/route.ts` | line 35 import, line 65 call | ✓ PASS |
| Export route auth guard is first statement | `grep -n "auth()" route.ts` | line 50 — immediately after const-declaration of function | ✓ PASS |

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| CHN-01 | Every route point has chainage derived from cumulative length from start | ✓ SATISFIED | `segment_fraction * total_length_m` in `fetchChainageBucketsRaw`; `formatChainage` produces km-from-start values |
| CHN-02 | Office engineer can calibrate chainage via numeric offset | ✓ SATISFIED | `setChainageOffset` action + `ChainageOffsetForm` UI |
| CHN-03 | Each approved submission's chainage snapshotted at approval (immutable) | ✓ SATISFIED | `bot-audit.ts:481-482` inside approve TX; backfill migration 0013 for historical rows |
| CHN-04 | Per-km as-built strip: status, work submitted, worker, auditor | ✓ SATISFIED | `ChainageTable.tsx` + `fetchChainageBucketsRaw` three-state aggregation |
| CHN-05 | Selecting a chainage segment drills down to underlying submissions | ✓ SATISFIED | `?from=asbuilt` link in ChainageTable; back-link in SubmissionDetailView |
| CHN-06 | Per-segment approved work feeds route completion % | ✓ SATISFIED | `completionPct = Math.min(100, ...)` in `fetchChainageBucketsRaw`; KpiCard in ChainageTab |
| CHN-07 | Per-km as-built breakdown exportable to Excel/PDF | ✓ SATISFIED | `buildChainageLedger` (8 cols) + `renderChainagePdf`; auth-guarded route; format=xlsx|pdf |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None | — | — | — |

No TBD, FIXME, XXX, placeholder, or stub patterns found in Phase 15 files. No empty return statements that flow to rendering. No hardcoded empty arrays passed as props.

---

### Human Verification Required

Human UAT was performed and accepted for Phase 15 by the developer at end-of-phase (Plan 15-07). The following items were verified live:

1. **As-Built tab renders correctly** — colour bar, per-km rows, status badges, work counts, worker/auditor names displayed.
2. **Row drill-down** — clicking a row opens submission detail; back-link returns to strip.
3. **Calibration offset round-trip** — entering an offset updates dashboard strip, Telegram notification, and Excel/PDF export to show the same calibrated value.
4. **Excel + PDF export** — both files download with 8 correct columns and Turkish characters render correctly in PDF.
5. **Auth guard** — unauthenticated request to `/api/exports/chainage` returns 401 JSON.

No further human verification is required.

---

### Gaps Summary

No gaps found. All 6 success criteria verified against actual codebase implementation:

- SC1 (CHN-03 snapshot): written in the same transaction as the status flip via Postgres ROUND — no JS float arithmetic, no transaction window.
- SC2 (As-Built strip): full client component with colour bar, three-state badges, boq/worker/auditor columns, km X+YYY format.
- SC3 (drill-down + back-link): `?from=asbuilt` query param wires both directions.
- SC4 (completion %, clamped): `Math.min(100, ...)` in `fetchChainageBucketsRaw`; over-100% is architecturally impossible because `coveredBuckets <= totalBuckets`.
- SC5 (calibration consistency): offset applied at query-time in Postgres; same `formatChainage(raw + offset)` used in bot notification and export.
- SC6 (export + auth): 8 Turkish columns confirmed; `auth()` is the first executable statement in the route handler; imports shared helper not Server Action (Pitfall 6 clean).

---

_Verified: 2026-05-31_
_Verifier: Claude (gsd-verifier)_
