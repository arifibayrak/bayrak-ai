---
status: partial
phase: 08-admin-shell-information-architecture
source: [08-VERIFICATION.md]
started: 2026-05-27T00:15:00Z
updated: 2026-05-27T00:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Sidebar shell + redirect on /dashboard
expected: Visiting `/dashboard` redirects to `/dashboard/overview`; the sidebar renders with 6 items (Overview, Projects, People, Analytics, Hakkediş, Exports); the active item is highlighted.
result: [pending]

### 2. Sidebar on project routes + existing functionality intact (D-64)
expected: Navigate to `/dashboard/projects/[any-id]` — the sidebar still appears with "Projects" highlighted, and all existing project tabs (BOQ/Rota/Kayıtlar) still function.
result: [pending]

### 3. TR→EN locale switch on People profile (SC6)
expected: On `/dashboard/people/[personId]`, toggling locale TR→EN shows "Konum Uyumu"→"Location Compliance", "Onay Oranı"→"Approval Rate", "Aktivite"→"Activity" (verifies the SC6 fix, commit e58b6d3).
result: [pending]

### 4. TR→EN locale switch on submission detail status (SC6)
expected: On `/dashboard/records/[any-id]`, toggling locale TR→EN shows the status badge as "Approved"/"Rejected"/"Pending" (verifies SC6 fix to SubmissionDetailView).
result: [pending]

### 5. Metric drill-down from Overview KPI
expected: Clicking a KPI card on Overview drills down to `/dashboard/records` with URL-persisted filters; the records list shows the filtered subset matching the KPI.
result: [pending]

### 6. One-sided date filter shows "All time" (WR-01)
expected: On Overview, setting ONLY a "from" date (no "to") leaves KPI sub-labels reading "All time" (not "Selected period"), matching the query behavior.
result: [pending]

### 7. Mobile responsive sidebar (<768px)
expected: On a mobile viewport (<768px), the sidebar collapses to a hamburger in TopNav and the drawer opens on tap.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
