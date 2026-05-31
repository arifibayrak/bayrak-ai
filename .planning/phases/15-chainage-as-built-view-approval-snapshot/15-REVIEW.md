---
phase: 15-chainage-as-built-view-approval-snapshot
reviewed: 2026-05-31T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - messages/en.json
  - messages/tr.json
  - src/actions/analytics.ts
  - src/actions/chainage.ts
  - src/app/api/exports/chainage/route.ts
  - src/app/dashboard/projects/[id]/page.tsx
  - src/app/dashboard/records/[id]/page.tsx
  - src/components/admin/SubmissionDetailView.tsx
  - src/components/dashboard/ChainageOffsetForm.tsx
  - src/components/dashboard/ChainageTab.tsx
  - src/components/dashboard/ChainageTable.tsx
  - src/db/migrations/0013_v4_chainage_backfill.sql
  - src/db/schema/office-activity-log.ts
  - src/lib/bot-audit.ts
  - src/lib/bot-messages.ts
  - src/lib/chainage-data.ts
  - src/lib/chainage-excel.ts
  - src/lib/format-chainage.ts
  - src/lib/pdf/chainage-pdf.tsx
  - src/lib/types/canonical-submission.ts
  - tests/chainage.test.ts
  - tests/exports.test.ts
  - tests/fixtures/chainage.ts
findings:
  critical: 1
  warning: 6
  info: 4
  total: 11
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-05-31
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Reviewed the chainage as-built view + approval-snapshot phase against the four focus areas. The security posture is strong: auth-first 401 on the export route, tenant scoping threaded through `fetchChainageBucketsRaw` via explicit `tenantId`, the `bucketSizeM` whitelist before any `sql.raw()` use, ExcelJS formula-injection sanitization, the ST_Y/ST_X axis-order convention enforced by a CI static-edge test, and Pitfall 5 honored (the bot approval path performs zero `auth()`/`logOfficeActivity`/`after()` calls). The `routes.project_id` UNIQUE constraint correctly defuses the otherwise-unbounded `routes` join in the aggregation CTE.

The notable correctness gap is in the bucket-enumeration SQL: a submission whose calibrated chainage lands **at or beyond** `totalLengthM` (or below 0 under a negative offset) computes a `bucket_idx` outside the `generate_series` range and is silently dropped by the `LEFT JOIN`, under-reporting approved work and completion. This is a forward-fix (the SQL lives in `chainage-data.ts`, not the immutable migration). Several quality/consistency warnings follow.

## Critical Issues

### CR-01: Submission at/beyond route end (or negative offset) silently dropped from as-built aggregation

**File:** `src/lib/chainage-data.ts:100-173`
**Issue:** Buckets are enumerated with `generate_series(0, ${nbuckets})` where `nbuckets = Math.ceil(totalLengthM / bucketSizeM) - 1`. The per-submission bucket is computed as:

```
FLOOR((COALESCE(s.chainage_m, s.segment_fraction * total_len) + r.chainage_offset_m) / bucketSize)::int
```

Two boundary cases produce a `bucket_idx` that has no matching `all_buckets` row, so the `LEFT JOIN sub_agg sa ON sa.bucket_idx = ab.bucket_idx` drops the aggregate entirely:

1. **At/over the route end.** When the calibrated value equals `totalLengthM` and `totalLengthM` is an exact multiple of `bucketSize` (e.g. `segment_fraction = 1.0` on a 3000 m route, offset 0 → `FLOOR(3000/1000) = 3`), `bucket_idx = 3` but the series only enumerates `0..2`. A positive `chainage_offset_m` makes this far more likely for any submission near the end (e.g. chainage 2900 + offset 200 = 3100 → bucket 3).
2. **Negative offset.** `chainage_offset_m` is explicitly allowed to be negative (`setChainageOffset` doc, `src/actions/chainage.ts:88`). A submission with calibrated value < 0 yields a negative `bucket_idx` that is likewise absent from the series and dropped.

Effect: the dropped submission disappears from the table, its BOQ/worker/auditor breakdown vanishes, and because `completionPct` and `approvedKm` count covered buckets, completion is **under**-reported. This is a data-fidelity defect in the primary view, not just cosmetic. The existing tests only cover fractions 0.166/0.5/0.833 and a +200 offset that stays in range, so they never exercise the boundary.

**Fix:** Clamp the computed bucket index into `[0, totalBucketCount-1]` inside Postgres so end-of-route and out-of-calibration submissions fold into the first/last bucket rather than vanishing. Apply the same `GREATEST/LEAST` to both the `sub_agg` SELECT and its `GROUP BY` so they stay identical:

```sql
LEAST(
  GREATEST(
    FLOOR((COALESCE(s.chainage_m, s.segment_fraction * ${tlen}) + r.chainage_offset_m) / ${bsz})::int,
    0
  ),
  ${nbuckets}
) AS bucket_idx
```

(`chainage-data.ts` is shared application code, not the hash-locked migration, so this is a forward-fix.)

## Warnings

### WR-01: Calibration offset shifts bucketing but not the displayed km range — bucket label can exclude its own submissions

**File:** `src/lib/chainage-data.ts:110-165`
**Issue:** The offset is applied **inside** `FLOOR(... / bucketSize)` for bucket assignment (lines 110-113, 157-160) but `bucket_start`/`bucket_end` are computed as `bucket_idx * bucketSize` / `(bucket_idx+1) * bucketSize` with **no offset** (lines 164-165). With `offset = 200`, a submission at raw chainage 1500 (calibrated 1700) is assigned to bucket 1, which the table displays as `km 1+000 – km 2+000`. Meanwhile the bot worker-notification label for the same submission shows `km 1+700` (`bot-audit.ts:570`, calibrated). So the dashboard bucket boundaries and the bot/snapshot calibrated value describe the same work with two different reference frames. The phase's own test (`tests/chainage.test.ts:358-360`) documents this as intended ("offset is in FLOOR only"), but it remains a user-facing inconsistency that contradicts the "Pitfall 13: same calibrated value as dashboard + export" comment in `bot-audit.ts:566`.
**Fix:** Either (a) add the offset to the displayed `bucket_start`/`bucket_end` so the label range matches the calibrated value the bot reports, or (b) document explicitly in the UI/help text that the km column is raw (uncalibrated) stationing while the offset only re-buckets — and stop claiming dashboard/bot parity in the bot-audit comment. Pick one frame and use it everywhere.

### WR-02: Worker-notification chainage re-derived with JS float math, diverging from the Postgres-ROUND stored snapshot

**File:** `src/lib/bot-audit.ts:488-491`
**Issue:** The stored snapshot is written with Postgres `ROUND(segment_fraction::numeric * total_length_m::numeric, 2)` (line 481), but the value shown to the worker is independently recomputed in JS as `String(Math.round(fracNum * lenNum * 100) / 100)` (line 490) where `fracNum`/`lenNum` come from `Number(...)`. This is exactly the JS float multiplication the surrounding comments forbid ("never multiply numeric strings in JS"). For most inputs the two agree, but IEEE-754 rounding at the 0.005 boundary can make the notified chainage differ from the persisted/exported one by 0.01 m. The bot then adds the offset with `Number(...) + Number(...)` (line 570), compounding the drift.
**Fix:** Return the Postgres-computed `chainage_m` from the `UPDATE ... RETURNING` (you already run the update on line 478-484; add `.returning({ chainageM: sub2.chainageM })`) and use that exact string for the notification instead of recomputing in JS.

### WR-03: `approvedKm` KPI computed before the empty-bucket guard — `0/0` NaN possible

**File:** `src/components/dashboard/ChainageTab.tsx:33-37`
**Issue:** `approvedKm` divides by `buckets.length` (line 35) unconditionally, before the `buckets.length === 0` branch at line 76. If `fetchChainageBucketsRaw` ever returns `totalLengthM > 0` with an empty `buckets` array (e.g. a route row exists with a length but the aggregation yields zero rows — not currently reachable but not guaranteed), `approvedBucketCount / buckets.length` is `0/0 = NaN`, and the KPI renders `NaN km`. The guard at line 34 (`totalLengthM > 0`) does not protect against `buckets.length === 0`.
**Fix:** Guard on `buckets.length` directly: `const approvedKm = buckets.length > 0 ? (approvedBucketCount / buckets.length) * totalLengthM / 1000 : 0;` — or reuse `completionPct` which is already clamped server-side.

### WR-04: `firstSubmissionId` drill-down may point to a record outside the displayed bucket when CR-01 dropping occurs

**File:** `src/lib/chainage-data.ts:171`, `src/components/dashboard/ChainageTable.tsx:205-212`
**Issue:** The detail link uses `COALESCE(first_approved_id, first_pending_id)` from the aggregate. This is correct for in-range submissions, but combined with CR-01 the "İş Adedi" count shown (`approvedCount + pendingCount`) can be lower than the true count for the route because end-of-route submissions were dropped, so a user reconciling the as-built table against the records list will find missing rows with no indication. Flagging as a downstream symptom of CR-01 so it is verified after the CR-01 fix.
**Fix:** Resolved by fixing CR-01 (clamp into range). Add an integration test seeding `segment_fraction = 1.0` and a `chainage_offset_m = 200` on a route whose length is an exact multiple of the bucket size, asserting the submission appears in the last bucket.

### WR-05: PDF export path renders unsanitized user content (acceptable for PDF, but `projectName` is never populated and projectId leaks into the document)

**File:** `src/lib/pdf/chainage-pdf.tsx:74-79`, `src/app/api/exports/chainage/route.ts:78-82`
**Issue:** The route handler constructs `renderChainagePdf({ buckets, projectId, generatedAt })` and never passes `projectName`, so the PDF always falls to the `projectId && !projectName` branch and prints the raw UUID as "Proje ID" in the document header (`chainage-pdf.tsx:77-79`). The Excel export has the same omission. For an external-facing as-built deliverable, exposing the internal UUID instead of the project name is a quality defect. (Formula injection is not a concern for PDF text nodes, so no security issue here — only Excel needs `sanitizeExcelCell`, which it has.)
**Fix:** Fetch the project name in the route handler (tenant-scoped) and pass it through to both `renderChainagePdf` and `buildChainageLedger`, or drop the projectId-fallback header line entirely.

### WR-06: Export route trusts `session.user!.id!` non-null assertions for the activity log

**File:** `src/app/api/exports/chainage/route.ts:102-108`
**Issue:** The fire-and-forget `logOfficeActivity` call uses `session.user!.id!` with double non-null assertions. `setChainageOffset` in the same phase guards this exact case (`src/actions/chainage.ts:118-119`: "skip log when session.user.id is absent — never pass empty-string FK"). If a session ever lacks `user.id` (e.g. a JWT without the id claim), the `actor_user_id` FK insert throws inside the un-awaited promise — harmless to the response but produces an unhandled rejection and a noisy log. Inconsistent with the sibling guard.
**Fix:** Mirror the `setChainageOffset` guard: `if (session.user?.id) { logOfficeActivity({ actorUserId: session.user.id, ... }); }`.

## Info

### IN-01: Unused import `sql` in chainage Server Actions

**File:** `src/actions/chainage.ts:24`
**Issue:** `import { sql, eq, and } from 'drizzle-orm';` — `eq` and `and` are used (lines 102, 112-114) but `sql` is not referenced anywhere in the file (all raw SQL lives in `chainage-data.ts`).
**Fix:** Drop `sql` from the import: `import { eq, and } from 'drizzle-orm';`.

### IN-02: Redundant top-level imports inside the approve block

**File:** `src/lib/bot-audit.ts:405-406, 419-421`
**Issue:** `boqItems` and `sql` are lazily imported at lines 405-406, then immediately re-imported (as `boq2`, `sql2`) inside the transaction callback at lines 419-421; the outer `boqItems`/`sql` bindings on 405-406 are never used (the transaction uses `boq2`/`sql2`, and the post-commit hakkediş block re-imports `boqItems` again at line 535). Dead bindings.
**Fix:** Remove the unused `const { boqItems } = ...` and `const { sql } = ...` at lines 405-406.

### IN-03: `formatChainage` negative-input behavior undefined

**File:** `src/lib/format-chainage.ts:16-19`
**Issue:** With a negative calibrated chainage (possible via negative `chainage_offset_m`), `Math.floor(m/1000)` and `m % 1000` produce confusing output — e.g. `formatChainage(-500)` → `km -1+500` (`Math.floor(-0.5) = -1`, `-500 % 1000 = -500` → `padStart` on `"-500"`). The bot worker notification (`bot-audit.ts:570`) can reach this with a negative offset. Not a crash, but nonsensical stationing.
**Fix:** Either clamp to 0 (`const v = Math.max(0, m)`) or document that callers must pass non-negative metres; add a unit case for negative input to lock the contract.

### IN-04: `totalLengthM` prop passed to `ChainageTable` is documented as unused

**File:** `src/components/dashboard/ChainageTable.tsx:24, 35`
**Issue:** The `totalLengthM` prop is annotated "reserved for future use; colour bar uses bucket count proportions" and is never read in the component body. Carrying dead props invites confusion about which proportion source is authoritative (bucket count vs length).
**Fix:** Remove the prop until it is actually consumed, or use it for the colour-bar widths so the bar reflects metric length rather than equal-width buckets.

---

_Reviewed: 2026-05-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
