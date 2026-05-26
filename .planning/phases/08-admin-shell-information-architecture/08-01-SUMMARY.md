---
phase: 08-admin-shell-information-architecture
plan: "01"
subsystem: ui-primitives, i18n
tags: [shadcn, recharts, sidebar, chart, i18n, turkish, next-intl, I18N-03]
dependency_graph:
  requires: []
  provides:
    - src/components/ui/sidebar.tsx (SidebarProvider, Sidebar, SidebarInset, SidebarTrigger, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarContent, SidebarFooter, + helpers)
    - src/components/ui/chart.tsx (ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartStyle)
    - messages/en.json dashboard.admin.* (8 sub-namespaces, 95 keys)
    - messages/tr.json dashboard.admin.* (mirror, 95 keys)
    - tests/i18n.test.ts dashboard.admin.* coverage assertions (I18N-03)
  affects:
    - All Phase 8 plans (08-02 through 08-06) import from sidebar.tsx / chart.tsx
    - All Phase 8 plans read dashboard.admin.* keys
tech_stack:
  added:
    - recharts (via shadcn chart CLI; version pinned by npm)
    - src/components/ui/sheet.tsx (shadcn Sheet — sidebar mobile dep)
    - src/components/ui/tooltip.tsx (shadcn Tooltip — sidebar dep)
    - src/hooks/use-mobile.ts (useIsMobile hook — sidebar dep)
  patterns:
    - shadcn CLI install via node_modules/.bin/shadcn (not npx shadcn@latest — npm script interference)
    - TDD red-green cycle for i18n coverage: test → fail → implement → pass
key_files:
  created:
    - src/components/ui/sidebar.tsx
    - src/components/ui/chart.tsx
    - src/components/ui/sheet.tsx
    - src/components/ui/tooltip.tsx
    - src/hooks/use-mobile.ts
  modified:
    - messages/en.json (dashboard.admin.* namespace added)
    - messages/tr.json (dashboard.admin.* namespace added)
    - tests/i18n.test.ts (new describe block for I18N-03)
    - package.json (recharts added as dependency)
    - package-lock.json
decisions:
  - "shadcn CLI must be invoked as node_modules/.bin/shadcn — npx shadcn@latest triggers npm script lookup and fails with 'Missing script'"
  - "recharts installed as peer dependency via chart CLI (not separately)"
  - "sidebar install also adds sheet.tsx, tooltip.tsx, use-mobile.ts as transitive deps"
  - "chart install offered to overwrite card.tsx — declined (existing file kept)"
  - "dashboard.admin.stubs.exports_heading = Dışa Aktarma vs nav.exports = Dışa Aktar — kept distinct per UI-SPEC"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-26"
  tasks_completed: 2
  files_created: 5
  files_modified: 5
---

# Phase 8 Plan 01: Shadcn Primitives + i18n Namespace Summary

**One-liner:** Installed shadcn sidebar + chart primitives (with recharts peer) and laid down the complete 95-key `dashboard.admin.*` i18n namespace in both en.json and tr.json with parity-enforced TDD coverage.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | [SECURITY GATE] Verify recharts + shadcn registry | (checkpoint — human approved) | — |
| 2 | Install shadcn sidebar + chart primitives | 4ce468d | sidebar.tsx, chart.tsx, sheet.tsx, tooltip.tsx, use-mobile.ts, package.json |
| 3 (RED) | Add failing i18n tests | 1b8e150 | tests/i18n.test.ts |
| 3 (GREEN) | Add dashboard.admin.* namespace | eb2fe65 | messages/en.json, messages/tr.json |

## Export Names (CRITICAL — downstream plans import these)

### sidebar.tsx
All expected exports confirmed present:
- `SidebarProvider` — wraps layout; Client Component
- `Sidebar` — sidebar panel
- `SidebarInset` — content area right of sidebar
- `SidebarTrigger` — mobile hamburger toggle (must be inside SidebarInset tree)
- `SidebarMenu` — nav list wrapper
- `SidebarMenuButton` — nav item button (has `isActive` prop + `asChild`)
- `SidebarMenuItem` — nav list item
- `SidebarHeader` — sidebar header slot
- `SidebarContent` — sidebar body slot
- `SidebarFooter` — sidebar footer slot
- `SidebarGroupLabel`, `SidebarGroup`, `SidebarGroupContent`, `SidebarGroupAction`
- `SidebarRail`, `SidebarSeparator`, `SidebarInput`
- `SidebarMenuSkeleton`, `SidebarMenuSub`, `SidebarMenuSubButton`, `SidebarMenuSubItem`
- `SidebarMenuAction`, `SidebarMenuBadge`
- `useSidebar` — context hook

### chart.tsx
All expected exports confirmed present:
- `ChartContainer` — wrapper with config context; requires `config` prop
- `ChartTooltip` — tooltip component
- `ChartTooltipContent` — pre-styled tooltip content
- `ChartLegend` — legend component
- `ChartLegendContent` — pre-styled legend content
- `ChartStyle` — injects CSS custom props from chart config
- `ChartConfig` — TypeScript type

## i18n Namespace Summary

**95 keys** added under `dashboard.admin.*` in both `messages/en.json` and `messages/tr.json`.

Sub-namespaces:
| Sub-namespace | Key count | Purpose |
|--------------|-----------|---------|
| `nav` | 11 | Sidebar navigation labels + aria-labels |
| `overview` | 20 | Command-center page: heading, KPIs, EV table, charts, states |
| `filters` | 5 | Filter bar labels (from, to, projects, people, clear) |
| `currency` | 1 | Currency selector label |
| `people` | 18 | People directory + profile: tabs, columns, KPI groups, alerts |
| `timeline` | 5 | Activity timeline: heading, load-more, empty, drill labels |
| `records` | 13 | Records list: heading, columns, pagination, empty/error |
| `detail` | 15 | Submission detail: fields, AI slot, back link, photo |
| `stubs` | 7 | Coming-soon pages: Analytics, Hakkediş, Exports |

**Key TR/EN distinctions verified:**
- `nav.exports` EN="Exports" / TR="Dışa Aktar"
- `stubs.exports_heading` EN="Exports" / TR="Dışa Aktarma" (distinct from nav label per UI-SPEC)
- `stubs.coming_soon` EN="Coming soon" / TR="Yakında"
- `detail.ai_slot_body` EN="AI analysis will be available in a future phase." / TR="AI analizi ileride eklenecektir."

## Verification

```
npx vitest run tests/i18n.test.ts → PASS (10) FAIL (0)
test -f src/components/ui/sidebar.tsx → true
test -f src/components/ui/chart.tsx → true
grep -q "SidebarProvider" sidebar.tsx → true
grep -q "ChartContainer" chart.tsx → true
```

## Deviations from Plan

**1. [Rule 3 - Blocking] `npx shadcn@latest add` fails — npm script name conflict**
- **Found during:** Task 2, first install attempt
- **Issue:** `npx shadcn@latest add sidebar` triggers npm's script-runner lookup (`npm exec shadcn@latest`), which interprets `shadcn@latest` as a script name and errors with "Missing script: shadcn@latest"
- **Fix:** Used `node_modules/.bin/shadcn add sidebar` and `node_modules/.bin/shadcn add chart` directly — both succeeded immediately
- **Files modified:** None (fix was command invocation only)
- **Commit:** —

**2. [Informational] shadcn chart offered to overwrite card.tsx**
- **Found during:** Task 2 chart install
- **Issue:** shadcn chart CLI prompted to overwrite existing `card.tsx` (already installed in a prior phase)
- **Fix:** Declined overwrite — existing file retained. `chart.tsx` was still created correctly
- **Impact:** None — chart.tsx created, card.tsx unchanged

## TDD Gate Compliance

- RED gate: `test(08-01): add failing tests for dashboard.admin.* namespace (I18N-03)` → commit `1b8e150`
- GREEN gate: `feat(08-01): add complete dashboard.admin.* i18n namespace to both message files` → commit `eb2fe65`
- REFACTOR: Not needed — keys and test structure are clean as written

## Known Stubs

None. This plan installs primitives and i18n keys only — no UI components wired to data. The `dashboard.admin.stubs.*` keys are intentional placeholders for Phase 9–11 pages (Analytics, Hakkediş, Exports).

## Threat Flags

None. No new network endpoints, auth paths, or file access patterns introduced. Only static files (JSON message catalogs, UI primitives) modified.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/components/ui/sidebar.tsx | FOUND |
| src/components/ui/chart.tsx | FOUND |
| messages/en.json | FOUND |
| messages/tr.json | FOUND |
| tests/i18n.test.ts | FOUND |
| 08-01-SUMMARY.md | FOUND |
| commit 4ce468d (Task 2 — primitives) | FOUND |
| commit 1b8e150 (Task 3 RED — tests) | FOUND |
| commit eb2fe65 (Task 3 GREEN — impl) | FOUND |
