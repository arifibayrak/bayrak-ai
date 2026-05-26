---
phase: 08-admin-shell-information-architecture
plan: "03"
subsystem: ui-shell, navigation, routing
tags: [sidebar, nav, shell, admin, i18n, next-intl, D-64, UX-01, redirect, stub-pages]
dependency_graph:
  requires:
    - src/components/ui/sidebar.tsx (SidebarProvider, Sidebar, SidebarInset, SidebarTrigger, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarContent — from plan 08-01)
    - messages/en.json + messages/tr.json dashboard.admin.nav.* and dashboard.admin.stubs.* (from plan 08-01)
  provides:
    - src/components/admin/SidebarNav.tsx (6-item client nav with usePathname active detection)
    - src/components/admin/AppSidebar.tsx (server-compatible sidebar shell)
    - src/app/dashboard/layout.tsx (modified: SidebarProvider + AppSidebar + SidebarInset + auth guard)
    - src/components/layout/TopNav.tsx (modified: SidebarTrigger mobile hamburger added)
    - src/app/dashboard/page.tsx (redirect to /dashboard/overview)
    - src/app/dashboard/(admin)/layout.tsx (passthrough layout, no double sidebar)
    - src/app/dashboard/(admin)/analytics/page.tsx (Coming-soon stub)
    - src/app/dashboard/(admin)/hakedis/page.tsx (Coming-soon stub)
    - src/app/dashboard/(admin)/exports/page.tsx (Coming-soon stub)
  affects:
    - All /dashboard/* routes inherit the sidebar via root layout (D-64)
    - /dashboard/projects/* unmodified — inherits sidebar transparently
tech_stack:
  added: []
  patterns:
    - Base UI SidebarMenuButton uses render prop (not asChild) for polymorphism
    - usePathname active detection: exact for leaf routes, startsWith for sub-page routes
    - SidebarProvider wraps root dashboard layout so all child routes inherit sidebar
    - (admin) passthrough layout: no second SidebarProvider (Pitfall 1 prevention)
    - SidebarTrigger placed inside SidebarInset tree (required by shadcn sidebar contract)
key_files:
  created:
    - src/components/admin/SidebarNav.tsx
    - src/components/admin/AppSidebar.tsx
    - src/app/dashboard/page.tsx
    - src/app/dashboard/(admin)/layout.tsx
    - src/app/dashboard/(admin)/analytics/page.tsx
    - src/app/dashboard/(admin)/hakedis/page.tsx
    - src/app/dashboard/(admin)/exports/page.tsx
  modified:
    - src/app/dashboard/layout.tsx (SidebarProvider + AppSidebar + SidebarInset shell)
    - src/components/layout/TopNav.tsx (SidebarTrigger mobile hamburger)
decisions:
  - "Base UI SidebarMenuButton uses render prop (render={<a href=... />}) not asChild — this version of sidebar.tsx uses useRender from @base-ui/react"
  - "D-64 preserved: shell wired exclusively via root src/app/dashboard/layout.tsx — zero project page files touched"
  - "D-74 preserved: /dashboard/records has NO nav item — 6-item nav unchanged"
  - "(admin) route group passthrough layout has no SidebarProvider (Pitfall 1 avoided)"
  - "SidebarTrigger rendered md:hidden in TopNav; SidebarTrigger is inside SidebarInset tree (required)"
  - "T-08-03-AC mitigated: await auth() runs BEFORE SidebarProvider/client tree mounts"
metrics:
  duration: "~4 minutes (autonomous tasks) + human verification of browser render behaviors"
  completed: "2026-05-26"
  tasks_completed: 3
  files_created: 7
  files_modified: 2
---

# Phase 8 Plan 03: Admin Shell + Navigation Summary

**One-liner:** Wired the persistent 6-item admin sidebar shell into the root dashboard layout (SidebarProvider + AppSidebar + SidebarInset) covering all /dashboard/* routes including projects/* without touching any project page file (D-64), with usePathname active detection, mobile hamburger, /dashboard redirect, and three Coming-soon stubs.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Build AppSidebar + SidebarNav and wire shell into root layout + TopNav | eab4905 | SidebarNav.tsx, AppSidebar.tsx, layout.tsx, TopNav.tsx |
| 2 | Redirect page, (admin) passthrough layout, and 3 Coming-soon stub pages | 92a9592 | page.tsx, (admin)/layout.tsx, analytics/page.tsx, hakedis/page.tsx, exports/page.tsx |
| 3 | Browser verification checkpoint | APPROVED (human-verified) | — |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SidebarMenuButton uses render prop, not asChild**
- **Found during:** Task 1 TypeScript compilation
- **Issue:** The plan specified `<SidebarMenuButton asChild isActive={isActive}>` but the installed `sidebar.tsx` uses `useRender` from `@base-ui/react` instead of Radix UI's `asChild` pattern. `asChild` prop does not exist on this component — TSC error TS2322.
- **Fix:** Switched to `render={<a href={item.href} aria-current={...} />}` pattern (Base UI's polymorphism mechanism). Children (icon + label) still render correctly inside the rendered anchor.
- **Files modified:** src/components/admin/SidebarNav.tsx
- **Commit:** eab4905

## Known Stubs

The three stub pages (analytics, hakedis, exports) are intentional stubs per the plan. They render heading + Coming-soon badge + body copy from `dashboard.admin.stubs.*` keys. These are tracked for Phase 9, 10, and 11 to resolve respectively. They are not production gaps — they are the explicit deliverable of this plan.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries introduced. The dashboard/layout.tsx auth guard was preserved verbatim (await auth() before SidebarProvider render, T-08-03-AC mitigated).

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/components/admin/SidebarNav.tsx | FOUND |
| src/components/admin/AppSidebar.tsx | FOUND |
| src/app/dashboard/layout.tsx (modified) | FOUND |
| src/components/layout/TopNav.tsx (modified) | FOUND |
| src/app/dashboard/page.tsx | FOUND |
| src/app/dashboard/(admin)/layout.tsx | FOUND |
| src/app/dashboard/(admin)/analytics/page.tsx | FOUND |
| src/app/dashboard/(admin)/hakedis/page.tsx | FOUND |
| src/app/dashboard/(admin)/exports/page.tsx | FOUND |
| commit eab4905 (Task 1) | FOUND |
| commit 92a9592 (Task 2) | FOUND |
| D-64: no projects/* files modified | CONFIRMED |
| D-74: no records nav item | CONFIRMED |
| No double SidebarProvider in (admin)/layout.tsx | CONFIRMED |
| TypeScript noEmit clean | CONFIRMED |
