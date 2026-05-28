---
phase: 12-submission-driven-hakkedi
plan: 04
subsystem: ui

tags: [livepoller, traceability, expand-row, next-intl, react-19, server-action, rsc, nyquist]

# Dependency graph
requires:
  - phase: 12-submission-driven-hakkedi
    provides: D-117 recomputeHakedisLine helper + post-commit hook, D-119 hakedis_line_submissions join writes, getLineSubmissions Server Action, bilingual line_submissions i18n namespace
provides:
  - LivePeriodPoller client component (D-120 30s router.refresh polling with null-on-disabled contract)
  - LineSubmissionsPanel client component (SDH-02 inline expand-row traceability UI)
  - [periodId] page integration: conditional poller mount on status === 'draft' + 8th traceability column wired across header / body / empty-state / footer colspans
  - Test 9 LivePeriodPoller mount gate concretised (zero it.todo remaining in tests/hakedis-live.test.ts)
  - Phase 12 end-to-end UAT sign-off (SDH-01 live polling, SDH-02 traceability bilingual, SDH-03 byte-identical finalized exports under late approval)
  - 12-VALIDATION.md flipped to nyquist_compliant: true (Phase 12 closeout gate)
affects: [13-brand-pass]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "REVISED LivePeriodPoller contract: null when enabled === false — hooks called unconditionally at top of body (Rules of Hooks honored), conditional return after hook calls; sr-only span emitted only on enabled path. Makes the mount-gate test a pure-function invocation (vitest environment: 'node' with no @testing-library/react)."
    - "Two-step page edit (Task 2a additive mount + Task 2b column add) — keeps the verification window small per Plan 04 risk-split design. Task 2a verified by tsc-only; Task 2b verified by tsc + full vitest + npx next build."
    - "Inline expand-row traceability via useState + useTransition + Server Action call (getLineSubmissions). State cached during visit; router.refresh() (driven by LivePeriodPoller) re-renders the tree and resets state naturally — no global cache invalidation needed."
    - "Bilingual line_submissions i18n consumed from Plan 12-01 namespace (zero inline strings; TR/EN switchable via locale toggle)."
    - "Tab-nabbing mitigation (T-12-04-TAB): photo_url anchor uses target='_blank' rel='noopener noreferrer'."

key-files:
  created:
    - src/components/admin/LivePeriodPoller.tsx
    - src/components/admin/LineSubmissionsPanel.tsx
  modified:
    - src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx
    - tests/hakedis-live.test.ts
    - .planning/phases/12-submission-driven-hakkedi/12-VALIDATION.md

key-decisions:
  - "[Phase 12-04]: LivePeriodPoller returns null when enabled === false (revised contract per checker Blocker 2 — pure-function callable in vitest's node env, no @testing-library/react needed; sr-only span emitted only on enabled path)"
  - "[Phase 12-04]: Task 2 split into 2a (additive LivePeriodPoller mount, tsc-only verify) + 2b (LineSubmissionsPanel column + 3 colspan updates, gated by npx next build) — bisectable footprint, structural-mismatch caught at build time"
  - "[Phase 12-04]: LineSubmissionsPanel uses useState+useTransition+Server Action — expand-state cached during visit, router.refresh() resets naturally via tree re-render; no manual revalidation needed"
  - "[Phase 12-04]: Phase 13 brand pass will own visual polish of traceability column — Plan 12-04 intentionally ships minimal/functional shape (ghost expand-button, sr-only polling indicator, no new color/layout primitives)"
  - "[Phase 12-04]: Test 9 lives as pure-function call `expect(LivePeriodPoller({ enabled: false })).toBeNull()` — 0 it.todo remain in tests/hakedis-live.test.ts post Plan 04, closing Warning #5 from planner"
  - "[Phase 12 closeout]: nyquist_compliant: true set in 12-VALIDATION.md — Manual UAT 3/3 rows signed off by user as 'uat-approved' (polling visible, bilingual traceability, SDH-03 byte-identical finalized exports under late approval)"

patterns-established:
  - "REVISED-CONTRACT pattern for client polling components: hooks first, then conditional null return — testable as a pure function from vitest's node env without a React renderer. Applies any time a binary 'enabled' prop gates DOM emission."
  - "Two-step RSC edit pattern: additive mount task (tsc-only verify) + structural column-add task (tsc + full vitest + production build verify). Mitigates colspan / column-count drift class of bugs."
  - "Inline expand-row traceability pattern for tabular admin surfaces: rightmost column hosts a ghost Button with chevron icon → on click, fires Server Action via useTransition → caches rows in component state → renders a sub-table inline. State resets naturally on router.refresh() driven by parent poller."

requirements-completed: [SDH-01, SDH-02, SDH-03]

# Metrics
duration: 12min
completed: 2026-05-28
---

# Phase 12 Plan 04: LivePeriodPoller + LineSubmissionsPanel + Page Integration + End-of-Phase UAT Summary

**Submission-driven hakkediş loop visible to the office: 30s polling pushes approvals into the draft page without refresh, an inline expand-row traces every line back to its source submissions in TR/EN, and a finalized period's Phase 11 exports remain byte-identical after a late approval.**

## Performance

- **Duration:** ~12 min (active implementation Task 1 + Task 2a + Task 2b: `75274fb` 22:29 → `4c0a2a1` 22:40); UAT wait time excluded
- **Started:** 2026-05-28T21:29:04Z (Task 1 RED commit)
- **Completed:** 2026-05-28T21:41:59Z (UAT signed off and SUMMARY commit)
- **Tasks:** 3 of 3 (Task 1 TDD RED+GREEN, Task 2a additive mount, Task 2b column add, Task 3 manual UAT)
- **Files modified:** 5 (2 created, 3 modified including 12-VALIDATION.md)

## Accomplishments

- LivePeriodPoller shipped with revised null-on-disabled contract — testable as a pure function in vitest's node env (no DOM, no renderer), Rules of Hooks honored, React 19 strict-mode-safe cleanup
- LineSubmissionsPanel shipped as inline expand-row consuming `getLineSubmissions` Server Action; bilingual via Plan 12-01's `line_submissions` namespace; photo links rel-noopener-noreferrer hardened
- `[periodId]/page.tsx` integration landed in two safe steps: 2a additive poller mount (8 lines, tsc-only verify), 2b traceability column + header + empty-state + footer colspan updates (header 8 / empty colSpan=8 / footer colSpan=7) gated by full `npx next build`
- Test 9 (LivePeriodPoller mount gate) replaced from `it.todo` to concrete pure-function assertion; `grep -cE 'it\\.todo' tests/hakedis-live.test.ts` = 0 — Phase 12 it.todo budget fully drawn down (closes planner Warning #5)
- End-of-phase Manual UAT 3/3 rows PASSED — SDH-01 polling visibly updates within 30s, SDH-02 traceability lists worker+timestamp+qty+notes+photo in both TR and EN, SDH-03 confirms finalized period's Phase 11 Excel + PDF exports are byte-identical (`cmp` clean) before vs after a late approval
- Phase 12 validation gate flipped: `nyquist_compliant: true` set in 12-VALIDATION.md frontmatter; all Sign-Off checkboxes ticked; sign-off line records "APPROVED 2026-05-28"

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: convert LivePeriodPoller mount gate it.todo to concrete it** — `75274fb` (test)
2. **Task 1 GREEN: add LivePeriodPoller + LineSubmissionsPanel; Test 9 passes** — `6f39549` (feat)
3. **Task 2a: mount LivePeriodPoller on draft hakkediş detail page (additive, tsc-only verify)** — `2ff8e2d` (feat)
4. **Task 2b: wire LineSubmissionsPanel column + update colspans (column add + production build gate)** — `4c0a2a1` (feat)
5. **Task 3: end-of-phase Manual UAT — recorded in this SUMMARY + 12-VALIDATION.md flip**

**Plan metadata:** (this commit — see final `docs(12-04)` entry)

_Task 1 followed TDD: RED (`75274fb`, test) → GREEN (`6f39549`, feat). Task 2 split into 2a (additive) + 2b (structural) per Plan 04's risk-split design. Task 3 was a checkpoint:human-verify blocking gate, resolved by user response "uat-approved" with 3/3 rows passing._

## Files Created/Modified

- `src/components/admin/LivePeriodPoller.tsx` (CREATED, 80 lines) — 'use client' headless polling component; useRouter + useEffect+setInterval(30000ms) + cleanup; revised contract returns `null` when `enabled === false` (early return after hook calls); sr-only `<span role="status" aria-live="polite">` only on enabled path; bilingual indicator via `dashboard.admin.hakedis.line_submissions.polling_indicator`
- `src/components/admin/LineSubmissionsPanel.tsx` (CREATED, 183 lines) — 'use client' inline expand-row; useState(expanded, rows, loading) + useTransition for first-expand fetch; calls Server Action `getLineSubmissions(periodLineId)`; renders sub-table with worker / decided_at (dd.MM.yyyy HH:mm TR) / qty_contributed + unit / notes / photo link; bilingual via `dashboard.admin.hakedis.line_submissions.*`; tab-nabbing hardened (`rel="noopener noreferrer"`)
- `src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx` (MODIFIED, +29 lines across 2a+2b) — added LivePeriodPoller import + conditional mount (status === 'draft' guard, defense-in-depth with Pitfall 4 helper-side guard); added LineSubmissionsPanel import + 8th rightmost TableCell inside `lines.map`; TableHeader extended with corresponding rightmost TableHead; empty-state TableCell colSpan 7→8; TableFooter Gross-row colSpan 6→7; `export const dynamic = 'force-dynamic'` preserved; PeriodDetailControls untouched
- `tests/hakedis-live.test.ts` (MODIFIED, +16/-6) — Test 9 it.todo replaced with concrete pure-function call `expect(LivePeriodPoller({ enabled: false })).toBeNull()` (also asserts `typeof LivePeriodPoller === 'function'`); 0 it.todo remaining; vitest run green
- `.planning/phases/12-submission-driven-hakkedi/12-VALIDATION.md` (MODIFIED) — `nyquist_compliant: false → true`, `status: draft → complete`, `wave_0_complete: false → true`; all 9 per-task verification rows marked ✅ green; 3 UAT rows added to Sign-Off checklist as PASSED 2026-05-28; Approval line set to "APPROVED 2026-05-28"

## Decisions Made

- **LivePeriodPoller null-on-disabled contract** — revised per checker Blocker 2 to make Test 9 a deterministic pure-function call (no @testing-library/react required, vitest `environment: 'node'` honored). Hooks called unconditionally; `if (!enabled) return null` lives AFTER all hook calls. Inside useEffect, `if (!enabled) return` short-circuits the setInterval setup.
- **Two-step page edit (Task 2a additive mount + Task 2b column add)** — splits the structural change into bisectable commits. Task 2a verified by tsc-only (small additive footprint). Task 2b verified by tsc + full vitest + `npx next build` (catches any RSC/client boundary issue or colspan mismatch).
- **Phase 13 styling deferred** — traceability column uses minimal ghost-Button + chevron + sub-table; no bespoke styling. Phase 13 brand pass owns the visual polish surface.
- **Manual UAT sign-off** — User typed `uat-approved` confirming all three rows (live polling, bilingual traceability, byte-identical finalized exports) pass on a real Vercel preview deployment. SDH-01/SDH-02/SDH-03 closed out end-to-end.

## Deviations from Plan

None — plan executed exactly as written. Plan 04's risk-split design (Task 2a + 2b) and the revised null-on-disabled contract were both already baked into the plan after checker review.

## Issues Encountered

None during execution. The plan's risk-split design and the contract revision (Blocker 2) pre-empted the two classes of issue that would otherwise have surfaced: (a) Test 9 requiring `@testing-library/react`, and (b) column-count / colspan drift caught only at runtime.

## User Setup Required

None — no external service configuration introduced. Polling uses the existing session cookie path; getLineSubmissions Server Action is auth-guarded + tenant-scoped (Plan 12-03 output).

## Next Phase Readiness

- **Phase 12 closed.** All four plans (12-01 schema + i18n + tests scaffold, 12-02 0009 migration apply, 12-03 D-117 helper + D-119 join write + post-commit hook, 12-04 UI + UAT) shipped. `nyquist_compliant: true` set.
- **Phase 13 (Brand Pass UX) is next.** The LineSubmissionsPanel and the period-detail Yeşil Defter table are intentionally minimal; Phase 13 owns the visual polish across the admin surfaces and may revisit the expand-row affordance, the polling indicator visibility, and the column widths.
- **No blockers for Phase 13.**

## Threat Flags

None — no new threat surface introduced beyond the threat register documented in the plan. All five STRIDE threats (XSS, tab-nabbing, IDOR, polling DoS, structural mismatch) had `mitigate` dispositions and the mitigations are in place (React auto-escape, rel-noopener-noreferrer, tenant-scoped Server Action, useEffect cleanup + null-on-disabled, Task 2a/2b split with explicit colspan acceptance criteria + production build gate).

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: src/components/admin/LivePeriodPoller.tsx
- FOUND: src/components/admin/LineSubmissionsPanel.tsx
- FOUND: src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx
- FOUND: tests/hakedis-live.test.ts
- FOUND: .planning/phases/12-submission-driven-hakkedi/12-VALIDATION.md (nyquist_compliant: true)

**Commits verified via git log:**
- FOUND: 75274fb (Task 1 RED)
- FOUND: 6f39549 (Task 1 GREEN)
- FOUND: 2ff8e2d (Task 2a)
- FOUND: 4c0a2a1 (Task 2b)

---
*Phase: 12-submission-driven-hakkedi*
*Completed: 2026-05-28*
