---
phase: 16-ai-vision-assist
plan: "04"
status: partial
subsystem: ai, eval, testing
tags: [eval, vitest, advisory-only, sc5, deferred-data-gate]

# Dependency graph
requires:
  - phase: 16-02-ai-vision-assist
    provides: shared analyzePhoto + isAnomalous (eval imports these); anomaly_detected column
provides:
  - "tests/ai-flags-advisory.test.ts: static SC5 advisory-only invariant proof (8 passing tests) — AI-03"
  - "scripts/set-eval-passed.sql: eval gate opener keyed on anomaly_detected=true (ready to apply once eval passes)"
  - "DEFERRED: precision >= 0.80 eval run (AI-05) — blocked on real approved-photo data"
affects: [16-05-ai-vision-assist]

key-files:
  created:
    - tests/ai-flags-advisory.test.ts
    - scripts/set-eval-passed.sql

requirements-completed: [AI-03]
requirements-deferred: [AI-05]

# Metrics
completed: 2026-05-31
---

# Phase 16 Plan 04: Eval Gate + Advisory-Only Proof — PARTIAL (eval deferred)

**Task 3 (advisory-only static proof, AI-03) is complete and committed. Tasks 1-2 (the precision >= 0.80 eval gate, AI-05) are DEFERRED — the dev DB has zero approved-submission photos, so a real labeled fixture dataset (D-02) cannot be built yet. The eval gate stays closed, which is the intended fail-safe: no flag renders until precision is confirmed.**

## Status: PARTIAL

| Task | Type | Status |
|------|------|--------|
| 1 — Build + label real-photo fixture dataset (D-02) | checkpoint:human-action | **DEFERRED** — no approved photos exist (pre-flight count = 0; 3 submissions total, all `pending_audit`) |
| 2 — Run eval, confirm precision >= 0.80, apply gate (AI-05) | checkpoint:human-verify | **DEFERRED** — depends on Task 1 fixtures + `AI_GATEWAY_API_KEY` |
| 3 — Static advisory-only invariant proof (AI-03 / SC5) | auto | **DONE** — `56306f7` |

## Accomplishments (Task 3)

- `tests/ai-flags-advisory.test.ts` (`56306f7`) — 8 static assertions (fs.readFileSync grep) proving the advisory-only invariant (SC5/AI-03):
  - `ai-vision.ts`, `ai-flag-queue.ts`, and the cron route contain zero references to `submissions.status` / `status:'approved'` / `status:'rejected'`
  - each file actually references `submissionAiFlags` (coverage sanity)
  - `ai-vision.ts` / `ai-flag-queue.ts` do not import `auth()` or `logOfficeActivity` (Pitfall 5)
  - Live grep cross-check: `grep -rl "submissionAiFlags" src | xargs grep -l "submissions.status"` → exit 1 (clean)
- `scripts/set-eval-passed.sql` (`56306f7`) — eval gate opener, keyed on `anomaly_detected = true` (REVIEWS HIGH-3), ready to apply once the eval passes.

## Why the eval is deferred (not failed)

Pre-flight count against the dev Neon branch: **0 approved submissions with a photo** (only 3 `pending_audit` rows). D-02 requires the eval dataset to be built from *existing approved-submission photos* with office-engineer-confirmed ground truth. There is no such data yet, and fabricating fixtures/labels would corrupt the gate (Claude grading Claude → meaningless precision). The eval is therefore a real data-availability blocker, not a code gap.

The phase goal makes this safe: the eval gate is the SINGLE switch controlling flag display. With `eval_passed` never set true, `AiFlagCard` and the as-built strip indicator render nothing — the intended fail-safe. The advisory-AI pipeline is fully built and dormant-by-default until activated.

## Activation Runbook (run when production has >= 30 approved photos)

1. **Pre-flight count** (Neon dev branch):
   `SELECT count(*) FROM submissions WHERE status='approved' AND photo_url IS NOT NULL AND photo_url <> '';`
2. **Export candidates** (up to 50): join `submissions` → `boq_items` for `photoUrl`, `workType` (material), `notes`.
3. **Label** `tests/fixtures/ai-vision/fixtures.json` — office engineer sets `groundTruth` ("anomaly" | "normal") per photo; aim for >= 5-10 anomalies. Commit.
4. **Run eval:** `AI_EVAL_ENABLED=true AI_GATEWAY_API_KEY=<key> npx vitest run tests/ai-vision.test.ts -t "precision"` (~30-50 real Claude calls ≈ $0.10-0.25).
5. **If precision >= 0.80:** `psql $DATABASE_URL < scripts/set-eval-passed.sql`; verify `SELECT count(*) FROM submission_ai_flags WHERE eval_passed=true;` > 0.
6. **If precision < 0.80:** iterate the `analyzePhoto` system prompt in `src/lib/ai-vision.ts` (never lower the 0.80 threshold).

## Next Phase Readiness

- AI-03 (advisory-only) is proven and complete.
- AI-05 (eval gate) is deferred pending field data; flag display stays correctly disabled until activated.
- Plan 16-05 (UI) can be built now — its components render nothing while the gate is closed, which is the correct dormant state.

---
*Phase: 16-ai-vision-assist*
*Status: PARTIAL — eval (AI-05) deferred pending real approved-photo data*
*Recorded: 2026-05-31*
