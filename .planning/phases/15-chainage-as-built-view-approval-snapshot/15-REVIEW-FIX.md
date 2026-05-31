---
phase: 15-chainage-as-built-view-approval-snapshot
fixed_at: 2026-05-31T00:00:00Z
review_path: .planning/phases/15-chainage-as-built-view-approval-snapshot/15-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 5
skipped: 2
status: partial
---

# Phase 15: Code Review Fix Report

**Fixed at:** 2026-05-31
**Source review:** .planning/phases/15-chainage-as-built-view-approval-snapshot/15-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 7
- Fixed: 5
- Skipped: 2

Verification: `npx tsc --noEmit` clean (exit 0) and `npx vitest run tests/chainage.test.ts` → 23/23 passing after every fix. Tests were run using the main repo's `node_modules` (symlinked into the isolated worktree) with `.env.local` providing `DATABASE_URL` + `TEST_DATABASE_URL`, so the DB-gated integration tests (including the two new CR-01 boundary tests) actually executed against the test database rather than being skipped.

## Fixed Issues

### CR-01: Submission at/beyond route end (or negative offset) silently dropped from as-built aggregation

**Files modified:** `src/lib/chainage-data.ts`, `tests/chainage.test.ts`
**Commit:** 3274ff5
**Applied fix:** Wrapped the per-submission `FLOOR(...)::int` bucket computation in `LEAST(GREATEST(..., 0), ${nbuckets})` in BOTH the `sub_agg` SELECT and its GROUP BY (kept identical so the grouping key and projected `bucket_idx` stay in sync). End-of-route submissions (e.g. `segment_fraction = 1.0` → `FLOOR(3000/1000) = 3` on a 3-bucket route) now fold into the last bucket, and negative calibrated values (large negative offset) fold into the first bucket, instead of being dropped by the `LEFT JOIN`. The immutable migration `0013_v4_chainage_backfill.sql` was NOT touched — this is a code-side change in the live query, per the project constraint. Added two integration tests: a `segment_fraction = 1.0` route-end case and a negative-offset (`chainage_offset_m = -1000`) case, both asserting the submission is counted in the last/first bucket.

### WR-02: Worker-notification chainage re-derived with JS float math

**Files modified:** `src/lib/bot-audit.ts`
**Commit:** 43db45a
**Applied fix:** Added `.returning({ chainageM: sub2.chainageM })` to the existing `UPDATE` that writes the Postgres `ROUND(...)` snapshot, and set `capturedChainageM` to the returned numeric string verbatim — removing the `String(Math.round(fracNum * lenNum * 100) / 100)` JS float recompute. The notification now shows the exact persisted/exported value, preserving money-math discipline. No `auth()`/`logOfficeActivity`/`after()` token was added (Pitfall 5 honored — not in code or comments).
**Note:** This change adds `.returning()` to an `UPDATE` inside the approve transaction. It does not alter lock scope or isolation, but because it touches transaction semantics it is flagged for human verification (see below).

### WR-01: Calibration offset shifts bucketing but not the displayed km range

**Files modified:** `src/lib/chainage-data.ts`
**Commit:** 050bf6c
**Applied fix:** Took the review's option (b). The bucket boundaries `bucket_idx * bucketSize` already describe the CALIBRATED frame (the bucket index was derived from the offset-shifted, calibrated chainage inside FLOOR, so a calibrated value X always lies within `[idx*size, (idx+1)*size)`), which is the same frame the bot notification reports. Added an explicit comment at the SELECT documenting that the displayed km range is the calibrated frame (not raw stationing) and that dashboard, bot, and export all share this one frame — making the previously-claimed parity accurate rather than contradictory. No math change was made to `bucket_start`/`bucket_end`, so the existing offset test (which asserts `bucketStart = 1000` under a +200 offset) still passes.

### WR-03: `approvedKm` KPI computed before the empty-bucket guard — `0/0` NaN possible

**Files modified:** `src/components/dashboard/ChainageTab.tsx`
**Commit:** 88a8830
**Applied fix:** Changed the `approvedKm` guard from `totalLengthM > 0` to `buckets.length > 0`, so an empty `buckets` array can never produce `approvedBucketCount / buckets.length = 0/0 = NaN`.

### WR-06: Export route trusts `session.user!.id!` non-null assertions for the activity log

**Files modified:** `src/app/api/exports/chainage/route.ts`
**Commit:** b8ec53d
**Applied fix:** Replaced the `session.user!.id!` double-bang with an `if (session.user?.id) { logOfficeActivity({ actorUserId: session.user.id, ... }); }` guard, mirroring the sibling pattern in `setChainageOffset` (`src/actions/chainage.ts`). A session without an id claim now skips the log instead of throwing an unhandled FK-violation rejection.

## Skipped Issues

### WR-04: `firstSubmissionId` drill-down may point to a record outside the displayed bucket when CR-01 dropping occurs

**File:** `src/lib/chainage-data.ts:171`, `src/components/dashboard/ChainageTable.tsx:205-212`
**Reason:** Resolved by the CR-01 fix (clamp into range), exactly as the review states ("Resolved by fixing CR-01"). The review's requested verification test — seeding `segment_fraction = 1.0` on a route whose length is an exact multiple of the bucket size and asserting the submission appears in the last bucket — was added as part of the CR-01 commit (3274ff5). No separate code change required.

### WR-05: PDF/Excel export path never populates `projectName`; projectId UUID leaks into the document header

**File:** `src/lib/pdf/chainage-pdf.tsx:74-79`, `src/app/api/exports/chainage/route.ts:78-82`
**Reason:** Deferred — outside the explicitly mandated fix set for this run (the task scoped fixes to CR-01, WR-01, WR-02, WR-03, WR-06). The fix requires a new tenant-scoped project-name lookup in the route handler plus threading `projectName` through both `renderChainagePdf` and `buildChainageLedger` (a multi-file API-shape change), which is broader than the targeted fixes authorized here. Recommend addressing in a follow-up. Note this is a quality defect only — no security concern (PDF text nodes are not formula-injectable, and Excel already sanitizes via `sanitizeExcelCell`).

## Human Verification Required

- **WR-02 (commit 43db45a)** touches the approve transaction (adds `.returning()` to the snapshot UPDATE). Logic/semantics verified by passing tests, but a human should confirm the transaction lock window and the worker-notification value are correct in a live approval flow before the phase proceeds.

---

_Fixed: 2026-05-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
