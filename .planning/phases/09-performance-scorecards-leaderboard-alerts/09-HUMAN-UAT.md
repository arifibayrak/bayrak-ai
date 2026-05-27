---
status: partial
phase: 09-performance-scorecards-leaderboard-alerts
source: [09-VERIFICATION.md]
started: 2026-05-27T00:00:00Z
updated: 2026-05-27T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Worker + auditor scorecard rendering (PERF-01/02)
expected: `/dashboard/people/[personId]` shows Output Volume + Approval Rate cards (worker) and an SLA-Breach-Rate card with correct amber/red valueColor (auditor).
result: [pending]

### 2. Leaderboard sort + rank column (PERF-05)
expected: The "Rank by" selector on `/dashboard/people` re-ranks the list; rank column shows ordinal position; the `sla_breach` auditor sort works (now sorts by real breach rate per CR-01 fix); ties broken alphabetically by name.
result: [pending]

### 3. OE scorecard + IDOR boundary (PERF-03 / CR-02)
expected: `/dashboard/analytics/office-engineers/[validUserId]` renders the activity table; a cross-tenant / non-member userId returns 404 (identity gated before render).
result: [pending]

### 4. Overview alert badges — two-condition rule + suppression (PERF-06)
expected: Without a date filter, the Stalled Projects KPI badges red when ≥1 stalled, and the pending-backlog card shows amber (backlog within SLA) vs red (avg latency > auditSlaHours); with a date filter, the rejection alert appears only when the rate exceeds the threshold.
result: [pending]

### 5. Settings form + TopNav gear (PERF-06)
expected: TopNav gear → `/dashboard/settings`; submitting valid thresholds shows "Settings saved" and persists; `auditSlaHours=0` (or out-of-range) shows a validation error; "Save Thresholds" CTA label.
result: [pending]

### 6. TR/EN localization (I18N project rule)
expected: Toggling locale flips all new Phase-9 strings (scorecard labels, leaderboard columns incl. breach rate, settings form + units, stalled-projects copy) between Turkish and English.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
