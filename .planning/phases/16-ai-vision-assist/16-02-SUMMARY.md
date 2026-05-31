---
phase: 16-ai-vision-assist
plan: "02"
subsystem: ai, async
tags: [ai-sdk, generateText, output-object, zod, sharp-phash, waitUntil, drizzle, vitest, tdd]

# Dependency graph
requires:
  - phase: 16-01-ai-vision-assist
    provides: phash_hex + anomaly_detected columns (live both branches), all 5 AI deps + @vercel/functions declared
  - phase: 14-ai-flags-schema
    provides: submission_ai_flags base table
provides:
  - "src/lib/ai-vision.ts: shared analyzePhoto(photoUrl, workType, notes) — the ONLY generateText + system-prompt call path"
  - "isAnomalous(output) helper — the multi-signal anomaly rule (mismatch | quality | location | duplicate)"
  - "runAiAnalysis(submissionId, photoUrl): writes scores + Turkish anomaly description + anomalyDetected + workClassification to submission_ai_flags; tenant-scoped + bounded pHash near-duplicate pre-filter"
  - "src/lib/ai-flag-queue.ts: enqueueAiFlag(submissionId, photoUrl) — inserts pending row (onConflictDoNothing) + dispatches runAiAnalysis via waitUntil"
affects: [16-03-ai-vision-assist, 16-04-ai-vision-assist, 16-05-ai-vision-assist]

# Tech tracking
tech-stack:
  patterns:
    - "Shared production call path: analyzePhoto is the single source of the Claude vision prompt; runAiAnalysis AND the eval harness both call it (REVIEWS HIGH-2 — no divergent prompt copy)"
    - "AI SDK v6: const { output } = await generateText({ output: Output.object({ schema }) }) — typed structured output, prompt-injection guarded (no generateObject)"
    - "waitUntil(@vercel/functions) dispatch keeps the function alive for the detached analysis (CONTEXT override, REVIEWS HIGH-1); never awaited inline in the bot path"
    - "pHash duplicate lookup tenant-scoped (getDefaultTenantId) + bounded (30-day window + LIMIT) — not a global scan (REVIEWS MEDIUM-6)"
    - "TDD: RED stub (clean assertion failure, not module-not-found) -> GREEN implementation"

key-files:
  created:
    - src/lib/ai-vision.ts (analyzePhoto + isAnomalous + AiVisionOutputSchema + runAiAnalysis)
    - src/lib/ai-flag-queue.ts (enqueueAiFlag — waitUntil dispatch)
  modified:
    - tests/ai-vision.test.ts (pHash unit tests + eval harness scaffold + duplicate-reuse test)
    - tests/ai-sdk-smoke.test.ts (v6 Output type-annotation fix — tsc gate)

key-decisions:
  - "analyzePhoto is the single shared Claude-call path; runAiAnalysis writes anomalyDetected=isAnomalous(output) so the multi-signal gate column reflects all five signals (REVIEWS HIGH-2/HIGH-3)"
  - "enqueueAiFlag dispatches via waitUntil (not a bare detached promise) per CONTEXT override; Pitfall-5 preserved (no auth/logOfficeActivity/next-server imports)"
  - "pHash lookup bounded to tenant + 30-day window + LIMIT to avoid unbounded in-memory Hamming scan"

patterns-established:
  - "Pattern: one shared analyze* function consumed by both production and eval — prevents prompt drift between what ships and what the eval gate measures"
  - "Pattern: waitUntil for post-response detached work on Vercel Fluid Compute"

requirements-completed: [AI-01, AI-02, AI-06]

# Metrics
duration: single session (Tasks 1-2 by executor; Task 3 file written by executor, committed in finalization after a truncated return)
completed: 2026-05-31
---

# Phase 16 Plan 02: Vision Core Summary

**Shared `analyzePhoto` (AI SDK v6 `generateText` + `Output.object`) is the single Claude-call path; `runAiAnalysis` writes the multi-signal `anomaly_detected` flag with a tenant-scoped + bounded pHash duplicate pre-filter; `enqueueAiFlag` dispatches it via `waitUntil` off the critical path.**

## Performance

- **Duration:** Single session (executor committed Tasks 1-2; Task 3 file authored by executor but committed during orchestrator finalization after a truncated return)
- **Completed:** 2026-05-31
- **Tasks:** 3 (all auto; Tasks 1-2 TDD red→green)
- **Files:** 2 created, 2 modified

## Accomplishments

- **`analyzePhoto(photoUrl, workType, notes)`** — the ONLY function containing `generateText` + the Turkish system prompt, using AI SDK v6 `Output.object({ schema: AiVisionOutputSchema })` for typed, prompt-injection-guarded structured output (D-04). `AiVisionOutputSchema` + `analyzePhoto` encode all five advisory signals: photo≠work, photo-quality, location second-opinion, notes→material, duplicate (D-01).
- **`isAnomalous(output)`** — exported multi-signal anomaly rule; `runAiAnalysis` writes `anomalyDetected = isAnomalous(output)` so the gate column (consumed by Plans 04/05) reflects quality/location/duplicate signals, not just mismatch (REVIEWS HIGH-3).
- **Shared call path (REVIEWS HIGH-2)** — both `runAiAnalysis` (production) and the eval harness call `analyzePhoto`; there is no divergent prompt copy, so the eval gate provably measures the production prompt.
- **pHash pre-filter** — tenant-scoped (`getDefaultTenantId`) and bounded (30-day window + LIMIT) near-duplicate lookup; a near-duplicate reuses the prior analysis (AI-06) instead of a second Claude call.
- **`enqueueAiFlag`** — inserts a `pending` row (`onConflictDoNothing`) and dispatches `runAiAnalysis` via `@vercel/functions` `waitUntil` (CONTEXT async override, REVIEWS HIGH-1), never awaited; no `auth()`/`logOfficeActivity`/`next/server` imports (Pitfall 5).

## Task Commits

1. **Task 1: ai-vision stub + pHash unit tests + eval harness scaffold (RED)** — `f80eec8` (test)
2. **Task 2: analyzePhoto + runAiAnalysis + AiVisionOutputSchema (GREEN)** — `5e2a594` (feat)
3. **Task 3: enqueueAiFlag dispatches runAiAnalysis via waitUntil** — `571ea7d` (feat)

Supporting fix: **`ec22d27`** (fix) — corrected the AI SDK v6 `Output` type annotation in `tests/ai-sdk-smoke.test.ts` (see Deviations).

## Files Created/Modified

- `src/lib/ai-vision.ts` (created) — `AiVisionOutputSchema`, `analyzePhoto`, `isAnomalous`, `runAiAnalysis`
- `src/lib/ai-flag-queue.ts` (created) — `enqueueAiFlag` with `waitUntil` dispatch
- `tests/ai-vision.test.ts` (modified) — pHash math unit tests, eval-harness scaffold importing `analyzePhoto`, duplicate-reuse test (DB/key-gated)
- `tests/ai-sdk-smoke.test.ts` (modified) — v6 `Output` type-annotation fix

## Decisions Made

- `runAiAnalysis` never throws — on error it records `status='error'` and swallows, since it runs detached (resilient for the `waitUntil` caller).
- pHash candidate query bounded to tenant + recent window + LIMIT rather than scanning all `done` rows (REVIEWS MEDIUM-6).

## Deviations from Plan

**1. [Rule 3 - Blocking] Fixed AI SDK v6 `Output` type annotation in `tests/ai-sdk-smoke.test.ts` (16-01's file)**
- **Found during:** Task 3 finalization — `npx tsc --noEmit` (an acceptance gate for this plan) failed with TS2322/TS2339 in the 16-01 smoke test.
- **Issue:** The gated tier annotated `generateText` with an explicit generic (`Awaited<ReturnType<typeof generateText<never, ReturnType<typeof Output.object<typeof schema>>>>>`) that mistyped `result.output` as the Zod schema, so `result.output.ok` did not typecheck. It passed at runtime only because vitest does not typecheck. `src/lib/ai-vision.ts` uses the correct inferred pattern and was tsc-clean.
- **Fix:** Removed the explicit annotation; let TS infer the result type and capture `output` typed as `z.infer<typeof schema>` (mirrors `ai-vision.ts`). `tsc --noEmit` now clean; smoke test still 2 passed / 1 skipped.
- **Committed in:** `ec22d27`.

**2. [Process] Task 3 committed during orchestrator finalization**
- The executor authored `src/lib/ai-flag-queue.ts` correctly (all acceptance gates pass) but its return truncated mid-narration before committing or writing this SUMMARY. The orchestrator verified the file against the Task 3 acceptance gates (waitUntil dispatch, not awaited, onConflictDoNothing, Pitfall-5 clean, tsc clean), then committed it (`571ea7d`) and authored this summary. No work was lost (sequential mode, main tree).

---
**Total deviations:** 1 auto-fixed (Rule 3 - blocking) + 1 process note.

## Issues Encountered

- Executor return truncated before commit/summary (second occurrence this phase). Recovered via filesystem/git spot-check + acceptance-gate re-verification, then committed. The DB/key-gated tests (`describeIfDb` duplicate-reuse, gated eval) remain skipped until Plan 04 supplies fixtures + `AI_GATEWAY_API_KEY`.

## Next Phase Readiness

- `enqueueAiFlag` is ready for Plan 03 to wire into `handleAuditDecision` (post-commit, un-awaited).
- `analyzePhoto` + `isAnomalous` are exported for Plan 04's eval harness to import (shared path).
- `runAiAnalysis` writes `anomaly_detected`, which Plan 04's `eval_passed` opener and Plan 05's display gate key on.
- Live vision calls still require `AI_GATEWAY_API_KEY` in `.env.local` / Vercel env.

---
*Phase: 16-ai-vision-assist*
*Completed: 2026-05-31*
