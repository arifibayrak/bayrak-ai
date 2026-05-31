---
phase: 16-ai-vision-assist
plan: "05"
subsystem: ui, i18n, dashboard
tags: [next-intl, rsc, server-action, shadcn, brand, chainage, advisory-ui]

# Dependency graph
requires:
  - phase: 16-02-ai-vision-assist
    provides: submission_ai_flags writes (eval_passed, anomaly_detected, rawResponse)
  - phase: 16-04-ai-vision-assist
    provides: eval_passed gate semantics (currently closed — no flags display until eval runs)
provides:
  - "getSubmissionAiFlag server action (eval_passed-gated, null-safe)"
  - "AiFlagCard — per-signal advisory card, zero-DOM when absent, no decision affordance (AI-03)"
  - "ChainageTable amber strip dot (eval_passed-gated hasAiFlag)"
  - "dashboard.admin.ai_flags i18n namespace (TR + EN, 8 keys each)"
affects: []

key-files:
  created:
    - src/actions/ai-flags.ts
    - src/components/brand/AiFlagCard.tsx
  modified:
    - src/components/brand/index.ts (AiFlagCard export)
    - src/components/admin/SubmissionDetailView.tsx (inert slot replaced with AiFlagCard)
    - src/app/dashboard/records/[id]/page.tsx (RSC calls getSubmissionAiFlag)
    - src/lib/chainage-data.ts (ai_flag_agg CTE, eval_passed-gated, clamped FLOOR invariant preserved)
    - src/components/dashboard/ChainageTable.tsx (amber dot column)
    - messages/tr.json, messages/en.json (ai_flags namespace)
    - tests/chainage.test.ts (amber-dot / hasAiFlag coverage)

key-decisions:
  - "AiFlagCard renders one row PER FIRED SIGNAL from rawResponse (mismatch/quality/location/duplicate + material), each a traffic-light BrandBadge — REVIEWS HIGH-3 per-signal display"
  - "getSubmissionAiFlag and the chainage amber dot are BOTH gated on eval_passed=true (SC1 single switch); both return empty/null when the gate is closed"
  - "No approve/reject/onClick in AiFlagCard (AI-03 advisory-only) — grep-gated"

requirements-completed: [AI-03]

# Metrics
completed: 2026-05-31
---

# Phase 16 Plan 05: Advisory Flag UI Summary

**`eval_passed`-gated `getSubmissionAiFlag` feeds a per-signal `AiFlagCard` (Turkish, traffic-light badges, zero-DOM when absent, no decision affordance) and an amber as-built strip dot. With the eval gate currently closed, the UI correctly renders nothing — the intended dormant fail-safe — and lights up automatically once the eval opens.**

## Performance

- **Completed:** 2026-05-31
- **Tasks:** 3 (2 auto + 1 human-verify visual UAT — approved)
- **Files:** 2 created, 7 modified

## Accomplishments

- **`getSubmissionAiFlag`** (`src/actions/ai-flags.ts`) — queries `submission_ai_flags WHERE submission_id=$1 AND eval_passed=true`, parses per-signal fields from `rawResponse`, returns `null` on any error (AI failure never surfaces error UI). SC1 single-switch gate.
- **`AiFlagCard`** — `if (!flag) return null` hard gate (zero DOM when absent, SC3). Renders only the signals that fired (mismatch / quality / location / duplicate) + material suggestion, each with a traffic-light `BrandBadge` (success/warning/destructive by confidence). Turkish descriptions; **no approve/reject/onClick** (AI-03, grep-gated).
- **Amber strip dot** — `ChainageTable` far-right column renders `bg-amber-500` dot in a tooltip only when `bucket.hasAiFlag`; the `ai_flag_agg` CTE LEFT JOINs `submission_ai_flags WHERE eval_passed=true` using the identical clamped FLOOR expression (CR-01 invariant preserved).
- **i18n** — 8 keys under `dashboard.admin.ai_flags` in both `tr.json` and `en.json` (full parity).

## Task Commits

1. **Task 1: getSubmissionAiFlag + AiFlagCard + i18n** — `282cfe1` (feat)
2. **Task 2: mount AiFlagCard + amber strip dot + chainage CTE** — `a40925f` (feat)
3. **Task 3: visual + bilingual UAT** — human-verify, **approved** (dormant state confirmed: gate closed → no card, no dots; automated checks all green)

## Verification (automated, pre-UAT)

- `tsc --noEmit` clean
- `getSubmissionAiFlag` `eval_passed`-gated + null-safe
- `AiFlagCard` null-gate present; no decision affordance (AI-03)
- Single `SubmissionDetailView` mount, wired (REVIEWS MEDIUM-7)
- i18n 8 TR / 8 EN, parity OK
- amber dot `eval_passed`-gated; `chainage.test.ts` 23 passed

## Decisions Made

- Per-signal rendering (not a single mismatch row) so quality/location/duplicate advisories display once the gate opens (REVIEWS HIGH-3).
- Card placed in `src/components/brand/` per UI-SPEC allowance (accepted; a feature-component-in-brand note from review, no churn).

## Issues Encountered

- None functional. The visual UAT could only confirm the **dormant/empty state** because the eval gate is closed (Plan 16-04 eval deferred — no approved-photo data). Components are built to spec and will render populated flags automatically once the eval opens. The populated path is covered by component logic + the optional SQL-insert preview documented in the 16-05 checkpoint.

## Next Phase Readiness

- UI is code-complete. Flag display activates automatically when `eval_passed=true` rows exist (i.e. after the deferred eval in 16-04 runs on real data).

---
*Phase: 16-ai-vision-assist*
*Completed: 2026-05-31*
