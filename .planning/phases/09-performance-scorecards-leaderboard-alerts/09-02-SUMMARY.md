---
phase: 09-performance-scorecards-leaderboard-alerts
plan: "02"
subsystem: admin-ui
tags: [kpi-card, alert-badge, warning-color, tdd, ui-component]
dependency_graph:
  requires: []
  provides: [KpiCard.alertBadge, KpiCard.valueColor.warning]
  affects:
    - src/app/dashboard/(admin)/overview/page.tsx
    - src/app/dashboard/(admin)/people/[personId]/page.tsx
tech_stack:
  added: []
  patterns:
    - "Conditional className on shadcn Card for alertBadge presence"
    - "TDD RED→GREEN cycle: source-file contract tests with readFileSync"
key_files:
  created:
    - tests/kpi-card.test.ts
  modified:
    - src/components/admin/KpiCard.tsx
decisions:
  - "alertBadge rendered as absolute span inside Card (not as a Portal or separate component) — keeps component server-safe"
  - "Card className uses conditional: alertBadge ? 'relative' : undefined — no 'relative' class unless badge present"
  - "TDD tests use readFileSync contract tests (node env, no DOM) — fits existing vitest node environment"
metrics:
  duration: "3 minutes"
  completed: "2026-05-27"
  tasks: 1
  files: 2
---

# Phase 09 Plan 02: KpiCard Warning Color + AlertBadge Prop Summary

**One-liner:** Additive KpiCard extension — `'warning'` amber ValueColor and optional `alertBadge` React.ReactNode prop for top-right corner alerts (D-87).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for KpiCard extension | 522b02d | tests/kpi-card.test.ts |
| 1 (GREEN) | KpiCard 'warning' color + alertBadge implementation | ca6c4a7 | src/components/admin/KpiCard.tsx |

## What Was Built

Extended `src/components/admin/KpiCard.tsx` additively:

1. **`ValueColor` union extended:** `'default' | 'success' | 'destructive' | 'warning'`
2. **`colorClass()` extended:** `if (color === 'warning') return 'text-amber-600';` inserted before the final `return 'text-foreground'`
3. **`KpiCardProps` extended:** `alertBadge?: React.ReactNode;` with inline comment `// optional — absolute top-right corner badge (D-87)`
4. **Card JSX updated:** `<Card className={alertBadge ? 'relative' : undefined}>` with an `{alertBadge && <span className="absolute top-2 right-2" aria-label="Alert: threshold exceeded">{alertBadge}</span>}` as first child

All existing usages of KpiCard with no new props are fully backward-compatible — they receive `undefined` for `alertBadge`, the conditional renders nothing, and the Card has no `relative` class.

## Verification

All 7 unit tests pass:
- `ValueColor union includes 'warning'` ✓
- `colorClass maps 'warning' to text-amber-600` ✓
- `KpiCardProps contains alertBadge optional prop` ✓
- `alertBadge renders with absolute top-right positioning` ✓
- `alertBadge wrapper has aria-label for accessibility` ✓
- `no --primary color class used for alert visuals (UI-SPEC hard rule)` ✓
- `Card gains relative class conditionally (only when alertBadge present)` ✓

TypeScript: zero new errors (`npx tsc --noEmit` passes).

## TDD Gate Compliance

- RED commit: `522b02d` — `test(09-02): add failing tests for KpiCard warning color + alertBadge prop`
- GREEN commit: `ca6c4a7` — `feat(09-02): extend KpiCard with 'warning' ValueColor and alertBadge prop`

Both gates satisfied.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries introduced. The `alertBadge` prop is a React node supplied by the server RSC, not user-controlled input. React JSX auto-escapes all text children; no `dangerouslySetInnerHTML` used.

## Known Stubs

None. The component is fully functional with the new props. Consumer wiring (Overview alert badges, auditor SLA-breach card) is deferred to Plans 05 and 06 by design.

## Self-Check: PASSED

- [x] `src/components/admin/KpiCard.tsx` exists and contains all required additions
- [x] `tests/kpi-card.test.ts` exists with 7 passing tests
- [x] Commit 522b02d (RED) exists: `git log --oneline | grep 522b02d`
- [x] Commit ca6c4a7 (GREEN) exists: `git log --oneline | grep ca6c4a7`
