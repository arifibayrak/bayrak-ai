---
phase: 13
plan: 04
subsystem: brand-pass-finalize
tags: [projects, auth, marketing, uat]
requires:
  - "Wave 1 brand primitives shipped (13-01)"
  - "Wave 2 hakkediş + exports + Phase 12 components re-skinned (13-02)"
  - "Wave 3a command-center stack re-skinned (13-03a)"
  - "Wave 3b directory + records + settings re-skinned (13-03b)"
provides:
  - "Projects list/detail/edit/new + BOQ template page re-skinned with brand primitives"
  - "Auth signin + auth/error pages re-skinned (Auth.js magic-link logic byte-identical)"
  - "Marketing root landing page re-skinned (large BrandLogo + display-size BrandHeading + amber primary CTA)"
  - "End-of-phase UAT signed off — all 5 UAT blocks (A wave 4 visual / B TR↔EN / C LivePeriodPoller dual-element / D audit→hakkediş loop / E full suite + next build) approved"
  - "Phase 13 nyquist_compliant: true; status: complete"
affects:
  - Phase 13 phase verifier (gsd-verifier) — ready to run goal-backward verification
  - Phase 14+ — every new UI plan inherits brand primitives by default; brand spine + per-wave restyle stays in place
key_files:
  modified:
    - src/app/dashboard/projects/page.tsx
    - src/app/dashboard/projects/loading.tsx
    - src/app/dashboard/projects/new/page.tsx
    - src/app/dashboard/projects/[id]/page.tsx
    - src/app/dashboard/projects/[id]/edit/page.tsx
    - src/app/auth/signin/page.tsx
    - src/app/auth/error/page.tsx
    - src/app/page.tsx
---

# Phase 13 Plan 04: Projects + Auth + Marketing + end-of-phase UAT — SUMMARY

**Completed:** 2026-05-29
**Status:** Complete — Phase 13 end-of-phase UAT approved by user (all 5 blocks)

## What shipped

### Task 1 — Projects surfaces (commit `e2fa2c6`)
- `projects/page.tsx` — list cards composed with `BrandCard`, amber primary "Yeni Proje" CTA via `BrandButton variant="primary"`
- `projects/loading.tsx` — branded loading state with `BrandEmpty` placeholder
- `projects/new/page.tsx` — `BrandHeading` h2 + `BrandCard` wrapper around the project create form
- `projects/[id]/page.tsx` — tabbed shell wrapped in `BrandCard` sections (Tab content children — BoqTab/RouteTab/PeopleTab — explicitly out of scope per executor scope-boundary rule; flagged as follow-up below)
- `projects/[id]/edit/page.tsx` — `BrandHeading` h2 + `BrandCard` wrapper around `ProjectForm` (Rule 1 auto-fix: original plan assumed BOQ + GeoJSON + people surfaces lived here, but they actually live in the tabbed shell's child components in `[id]/page.tsx` — restyled the actual contents instead of force-fitting the plan grep gates)

### Task 2 — Auth + marketing (commit `0e63eeb`)
- `auth/signin/page.tsx` — large `<BrandLogo size="lg" />` at top of sign-in card; amber Submit button; Auth.js `signIn` call preserved (grep-asserted: 2 occurrences)
- `auth/error/page.tsx` — `BrandEmpty` error surface with red TriangleAlert icon + outline back-to-signin button
- `page.tsx` (marketing root) — large `BrandLogo`, display-size `BrandHeading` tagline, amber primary CTA

### Task 3 — End-of-phase UAT (user-approved 2026-05-29)
All 5 UAT blocks approved by user covering Manual UAT rows 4–7 from `13-VALIDATION.md`:
- **A — Wave 4 surfaces visual:** projects list amber primary CTA + branded 404 + branded runtime error + branded `/auth/signin` + branded `/auth/error?error=AccessDenied` + branded marketing root all confirmed
- **B — TR ↔ EN locale toggle:** confirmed on Wave 1 sidebar, Wave 2 hakkediş, Wave 3a overview, Wave 3b people directory, Wave 4 projects — no fallback strings, no broken layout
- **C — LivePeriodPoller dual-element contract:** VoiceOver/NVDA announces sr-only role=status periodically AND DevTools confirms BOTH (a) sr-only span AND (b) visible `<BrandBadge variant="info" aria-hidden="true">` sibling rendered when enabled
- **D — Audit→hakkediş loop functional regression:** Telegram auditor approval → draft period detail updates `period_qty` within 30s without manual refresh (SDH-01 preserved); 8th column expand-row reveals new submission (SDH-02 preserved); finalized period Excel + PDF buttons render and download with Turkish glyphs (Phase 11 D-106 DejaVu path preserved)
- **E — Full suite + build:** `npx vitest run` exit 0 (358 PASS / 0 FAIL); `npx next build` exit 0

## Pre-seal verification (already passed)
- `npx tsc --noEmit` exit 0
- `npx vitest run` exit 0 (358/0) — every Phase 1–12 test still green
- Raw `from '@/components/ui/<primitive>'` import count = 0 on every converted file (full-conversion gate)
- Phase 11 PDF generator (`src/lib/pdf/fonts.ts`) untouched — DejaVu count = 7
- Phase 12 contracts intact: `LivePeriodPoller` null-on-disabled = 1; sr-only role="status" aria-live="polite" preserved + new BrandBadge sibling added in 13-02; `LineSubmissionsPanel` colSpan={8} + colSpan={7} preserved; `PeriodDetailControls` draft gate preserved
- T-13-04-AUTH: `grep -c "signIn" src/app/auth/signin/page.tsx` = 2

## Follow-ups (NOT blocking)
1. **BoqTab / RouteTab / PeopleTab child components** under `projects/[id]/page.tsx` retain pre-existing shadcn imports (Rule 1 scope-boundary preservation). A follow-up `--fix` pass via `/gsd:code-review 13 --fix` can convert them; they currently render correctly (cascaded amber primary via Wave 1 token override) but use raw shadcn imports rather than brand primitives.
2. **Neon DB-integration test flakiness** continues to be the pre-existing `STACK_TRACE_ERROR` from serverless cold-start; logged in `deferred-items.md`. Not Phase 13-caused.

## Commits
- `e2fa2c6` feat(13-04): re-skin projects surfaces (list + detail + edit + new) with brand primitives
- `0e63eeb` feat(13-04): re-skin auth signin + auth error + marketing landing with brand primitives

## Self-Check: PASSED
