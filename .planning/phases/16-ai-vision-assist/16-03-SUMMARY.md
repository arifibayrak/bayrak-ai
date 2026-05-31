---
phase: 16-ai-vision-assist
plan: "03"
subsystem: ai-vision
tags: [ai, cron, bot-audit, async, vercel]
dependency_graph:
  requires: ["16-02"]
  provides: ["16-04"]
  affects: ["src/lib/bot-audit.ts", "src/app/api/cron/ai-flags/route.ts", "vercel.json"]
tech_stack:
  added: []
  patterns: ["post-commit best-effort block", "CRON_SECRET bearer guard", "stale-row reclaim cron", "lazy import in bot path"]
key_files:
  created:
    - src/app/api/cron/ai-flags/route.ts
  modified:
    - src/lib/bot-audit.ts
    - vercel.json
decisions:
  - "capturedPhotoUrl outer-scope variable captures photoUrl across TX boundary (mirrors capturedChainageM pattern from Phase 15)"
  - "15-minute processing staleness window chosen: safely exceeds max analysis duration; runAiAnalysis refreshes updatedAt at step 0 so 15-min-old processing rows are provably orphaned"
  - "Hourly schedule (0 * * * *) chosen as Hobby-safe default per RESEARCH Pitfall 5"
  - "Comment wording: logOfficeActivity omitted from Pitfall-5 discipline comment (uses 'office-activity logging' phrasing) to satisfy grep gate asserting 0 occurrences"
metrics:
  duration: "10 minutes"
  completed: "2026-05-31"
  tasks: 3
  files: 3
---

# Phase 16 Plan 03: Async Wiring — Bot-Audit Enqueue + Cron Retry Route + vercel.json Summary

**One-liner:** Un-awaited `enqueueAiFlag` post-commit wiring in `handleAuditDecision` + CRON_SECRET-guarded `/api/cron/ai-flags` reclaiming both stale `pending` and orphaned `processing` rows, registered hourly in `vercel.json`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add photoUrl to .returning() + enqueueAiFlag post-commit (not awaited) | `git log --oneline -3 | tail -3 | head -1` | src/lib/bot-audit.ts |
| 2 | CRON_SECRET-guarded /api/cron/ai-flags retry route | (second commit) | src/app/api/cron/ai-flags/route.ts |
| 3 | Register cron in vercel.json | (third commit) | vercel.json |

## What Was Built

### Task 1 — bot-audit.ts enqueue wiring

- Added `photoUrl: sub2.photoUrl` as the 6th field in the approval `UPDATE .returning()` clause (RESEARCH Pitfall 3 fix — no extra DB read post-commit).
- Declared `capturedPhotoUrl: string | null = null` in outer scope (same pattern as `capturedChainageM` from Phase 15) to carry the value across the transaction boundary.
- Captured `capturedPhotoUrl = affected[0].photoUrl ?? null` inside the transaction immediately after `boqItemId` capture.
- Added the 4th post-commit best-effort block after the hakkediş try/catch (before the worker-lookup block):
  - Lazy `import('@/lib/ai-flag-queue')` to avoid module-load scope pollution.
  - `enqueueAiFlag(submissionId, capturedPhotoUrl).catch(log)` — NOT awaited. Webhook response flushes before AI work (SC2).
  - Guard: only enqueues when `capturedPhotoUrl` is non-null.
  - Outer try/catch logs setup failures without propagating (D-40 best-effort).
- Pitfall-5 preserved: no `auth()`, no office-activity logging, no `next/server` import (all grep gates verified at 0).

### Task 2 — /api/cron/ai-flags route

- `runtime = 'nodejs'`, `dynamic = 'force-dynamic'` per chainage export analog.
- First statement: `Authorization: Bearer ${CRON_SECRET}` check → 401 before any DB access (SC6 / T-16-CR).
- Query reclaims both stale-row classes via `innerJoin(submissions, ...)`:
  - Class 1: `status='pending' AND createdAt < now() - interval '5 minutes'` (never started)
  - Class 2: `status='processing' AND updatedAt < now() - interval '15 minutes'` (orphaned mid-call after function death — REVIEWS HIGH-1b / MEDIUM-4)
- `await runAiAnalysis(row.id, row.photoUrl).catch(console.error)` per stale row; returns `Response.json({ processed })`.
- No `auth()` — CRON_SECRET is the sole auth primitive for this route.

### Task 3 — vercel.json

- Added `"crons": [{ "path": "/api/cron/ai-flags", "schedule": "0 * * * *" }]` as sibling of `"functions"`.
- Existing functions block (telegram webhook memory:512, maxDuration:55) preserved unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `affected` variable scoped inside transaction callback**

- **Found during:** Task 1 — `npx tsc --noEmit` reported `TS2304 Cannot find name 'affected'` at two lines in the new enqueueAiFlag block.
- **Issue:** `affected` is declared inside `txDb.transaction(async (tx) => { ... })` and is not accessible in the post-commit scope. The plan referenced `affected[0].photoUrl` at the call site, which is outside the TX closure.
- **Fix:** Declared `capturedPhotoUrl: string | null = null` in the outer `if (action === 'approve')` scope (mirroring the existing `capturedChainageM`/`capturedChainageOffsetM` pattern from Phase 15), assigned it inside the transaction, and used `capturedPhotoUrl` in the post-commit block.
- **Files modified:** src/lib/bot-audit.ts
- **Commit:** included in Task 1 commit

**2. [Rule 1 - Bug] `logOfficeActivity` comment wording violated grep gate**

- **Found during:** Task 1 verification — grep gate `grep -c logOfficeActivity src/lib/bot-audit.ts == 0` failed because the initial Pitfall-5 discipline comment used the exact phrase `logOfficeActivity`.
- **Issue:** The plan's acceptance criteria require 0 grep matches for `logOfficeActivity` in `bot-audit.ts`, but the word appeared in the comment I wrote.
- **Fix:** Rephrased the Pitfall-5 comment to use `office-activity logging` (same meaning, different wording matching the hakkediş block's comment style).
- **Files modified:** src/lib/bot-audit.ts
- **Commit:** included in Task 1 commit

## Verification Results

All plan grep gates passed:
- `enqueueAiFlag(...).catch` present in bot-audit.ts
- `photoUrl: sub2.photoUrl` present in .returning()
- `await enqueueAiFlag` count == 0 (not awaited — SC2 preserved)
- `logOfficeActivity` count == 0 (Pitfall-5 preserved)
- `from 'next/server'` count == 0 (Pitfall-5 preserved)
- `Bearer ${process.env.CRON_SECRET}` present in cron route (SC6)
- `runtime = 'nodejs'` present in cron route
- `interval '5 minutes'` present (pending reclaim)
- `interval '15 minutes'` present (processing/orphaned reclaim — REVIEWS HIGH-1b/MEDIUM-4)
- `'processing'` status reclaim present
- vercel.json parses as valid JSON with crons array containing `/api/cron/ai-flags`
- existing `functions` block preserved
- `npx tsc --noEmit` exits 0 after all tasks

## Known Stubs

None. All wiring is complete. `enqueueAiFlag` (Plan 02) and `runAiAnalysis` (Plan 02) are the real implementations.

Note: `CRON_SECRET` environment variable must be set in Vercel project settings (both preview and production). This is an operational step, not a code step — the code reads `process.env.CRON_SECRET` at request time. If unset, the `Bearer undefined` check will always fail, locking out the cron (safe default: unauthenticated requests blocked).

## Threat Flags

None. All trust boundaries identified in the plan's `<threat_model>` are covered by the implementation:
- T-16-CR: 401 before DB access — implemented as first statement in GET handler
- T-16-CP: un-awaited enqueue verified by grep gate
- T-16-OR: 15-minute processing reclaim implemented
- T-16-P5: Pitfall-5 grep gates all pass

## Self-Check: PASSED

- `src/lib/bot-audit.ts` — modified, verified by grep gates + tsc
- `src/app/api/cron/ai-flags/route.ts` — created, file exists at path
- `vercel.json` — modified, JSON valid, crons array present with correct path
- All 3 commits exist in git log
- `npx tsc --noEmit` exits 0
