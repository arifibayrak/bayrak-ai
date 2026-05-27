---
phase: "09"
plan: "06"
subsystem: "admin-dashboard / alerts / settings"
tags: ["alerts", "kpi", "settings", "threshold", "i18n", "top-nav", "perf-06"]
dependency_graph:
  requires: ["09-02", "09-04", "09-05"]
  provides: ["PERF-06", "overview-alert-badges", "stalled-projects-card", "threshold-settings-ui", "settings-gear-nav"]
  affects: ["src/app/dashboard/(admin)/overview/page.tsx", "src/components/layout/TopNav.tsx"]
tech_stack:
  added: []
  patterns:
    - "Two-phase RSC fetch: Promise.all for settings + stalled depends on settings.stalledDays"
    - "Pure-TS alert state over already-fetched data (no extra DB round-trip)"
    - "Two-condition pending-backlog severity: destructive (SLA breach) vs warning (caution)"
    - "Rejection badge suppression when no date filter active (Pitfall 4)"
    - "ThresholdSettingsForm: validate-on-submit + transient success Alert (3s setTimeout)"
    - "Rejection rate %↔decimal conversion: form displays 0-100%, stored 0-1 in DB"
    - "Icon-only nav entry point (gear) with mandatory aria-label"
key_files:
  created:
    - "src/app/dashboard/(admin)/settings/page.tsx"
    - "src/components/admin/ThresholdSettingsForm.tsx"
  modified:
    - "src/app/dashboard/(admin)/overview/page.tsx"
    - "src/components/layout/TopNav.tsx"
    - "messages/en.json"
    - "messages/tr.json"
decisions:
  - "Alert colors: destructive/amber ONLY — never --primary (UI-SPEC hard rule enforced)"
  - "pendingAlertFires only on destructive SLA breach, not on amber caution state (badge vs valueColor are independent signals)"
  - "Rejection badge suppressed entirely when isDateFiltered is false (not just hidden)"
  - "Settings page auth guard mirrors layout.tsx exactly: const session = await auth(); if (!session) redirect('/auth/signin')"
  - "ThresholdSettingsForm shows transient Alert for 3s on success, not a persistent toast (no extra toast install needed)"
  - "CTA label: 'Save Thresholds' / 'Eşikleri Kaydet' (NOT generic 'Save') per UI-SPEC copywriting contract"
metrics:
  duration_minutes: 25
  completed_date: "2026-05-27"
  tasks_completed: 3
  tasks_total: 4
  files_created: 2
  files_modified: 4
---

# Phase 9 Plan 06: Alerts + Settings UI Summary

**One-liner:** Overview alert badges (destructive/amber, threshold-driven, date-filter-aware) + Stalled Projects KPI card + `/dashboard/settings` threshold form with gear-icon TopNav entry point.

## Tasks Completed

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | Overview alert badges + Stalled Projects KPI card (PERF-06, D-87/D-88) | ef7576a | Done |
| 2 | /dashboard/settings page + ThresholdSettingsForm (PERF-06, D-83/D-89) | 5157624 | Done |
| 3 | Settings gear icon in TopNav (PERF-06, D-86) | 1e6d061 | Done |
| 4 | Human-verify checkpoint | — | Awaiting human verification |

## What Was Built

### Task 1: Overview Alert Badges + Stalled Projects KPI Card

Extended `src/app/dashboard/(admin)/overview/page.tsx` with:

**Two-phase fetch:** `getTenantSettings()` added to the existing `Promise.all` (Phase 1); then `getStalledProjects(settings.stalledDays)` called after (Phase 2 — stalledDays depends on settings).

**Pure-TS alert state (no extra DB round-trip):**
- `pendingColor`: `'destructive'` when `pendingBacklog > 0 AND avgDecisionLatencyHours != null AND > auditSlaHours`; `'warning'` when `pendingBacklog > 0` but latency null or within threshold; `'default'` otherwise.
- `pendingAlertFires`: only the destructive branch (SLA breach) triggers the `alertBadge` — the amber caution state uses `valueColor='warning'` without a badge.
- `rejectionAlertFires`: `isDateFiltered && rate > threshold` — suppressed entirely when no date filter active (Pitfall 4).
- `stalledColor`: `'destructive'` when `stalledProjects.length >= 1`, else `'default'`.

**KPI grid:** expanded from `grid-cols-2 md:grid-cols-4` to `grid-cols-2 md:grid-cols-3 lg:grid-cols-5`.

**5th KpiCard (Stalled Projects):** `PauseCircle` icon, `drillHref="/dashboard/projects?stalled=true"` only when `>= 1` stalled, sub-label variants (healthy vs alert with `{days}` interpolation).

**alertBadgeEl:** shared `<Badge variant="destructive" className="p-1"><TriangleAlert h-3 w-3 aria-hidden /></Badge>` — passed only when alert fires.

**i18n keys added:** `kpi_stalled_label`, `kpi_stalled_sub_alert`, `kpi_stalled_sub_healthy` in both `en.json` and `tr.json`.

### Task 2: /dashboard/settings Page + ThresholdSettingsForm

**`src/app/dashboard/(admin)/settings/page.tsx`:**
- `force-dynamic` RSC
- Auth guard: `const session = await auth(); if (!session) redirect('/auth/signin');` (mirrors `layout.tsx` lines 19-20 exactly — D-89)
- Calls `getTenantSettings()` (itself auth-guarded + tenant-scoped — double guard)
- Converts `rejectionRateThreshold` (0..1) → `defaultRejectionRatePercent` (0–100 integer) via `Math.round(Number(...) * 100)`
- Renders `<Card>` with `<ThresholdSettingsForm>` inside `<CardContent>`

**`src/components/admin/ThresholdSettingsForm.tsx`:**
- `'use client'`, mirrors `ProjectForm.tsx` pattern
- 3 numeric `<Input type="number">` rows: Audit SLA (1–720h), Rejection Rate (0–100%), Stalled days (1–365)
- Each row: `<Label>` + muted description `<p>` + `<Input>` + unit `<span aria-label>`
- Per-field `useState` errors, `aria-describedby` linking input to error `<p>`
- Validate-on-submit (not on blur)
- `updateTenantSettings({ auditSlaHours, rejectionRateThreshold: rejectionRatePercent / 100, stalledDays })` — % → decimal conversion
- Transient success `<Alert>` (3s `setTimeout`, `CheckCircle2` icon, "Settings saved.") — button returns after 3s
- CTA: "Save Thresholds" / "Eşikleri Kaydet"

**i18n keys added:** full `dashboard.admin.settings.*` block in both locales (heading, subtitle, form_section_title, 3× label/desc/unit, save_cta, saving, saved_success, 3× error messages, error_save_failed).

### Task 3: TopNav Gear Icon

Extended `src/components/layout/TopNav.tsx`:
- Added `import Link from 'next/link'` and `import { Settings } from 'lucide-react'`
- Inserted `<Link href="/dashboard/settings">` after `<LanguageToggle>`, before user email
- `className="text-muted-foreground hover:text-foreground ml-2"` (8px left margin, per UI-SPEC)
- `<Settings className="h-5 w-5" aria-hidden="true" />` (20px icon, icon-only)
- `aria-label={tAdmin('settings_aria_label')}` — mandatory a11y for icon-only link
- No sidebar item added — 6-item nav locked (D-86)

**i18n keys added:** `dashboard.admin.nav.settings_aria_label` = "Open settings" / "Ayarları aç" in both locales.

## Deviations from Plan

None — plan executed exactly as written.

## Test Results

- `npx tsc --noEmit`: 0 new errors across all 3 tasks
- `npx vitest run`: 259 passed, 0 failed (full suite green)

## Security Review (Threat Model T-09-06-*)

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-09-06-EoP: non-auth access to /dashboard/settings | `const session = await auth(); if (!session) redirect('/auth/signin')` + server-action auth guard | Mitigated |
| T-09-06-T: tampered threshold inputs | Client validate-on-submit + server-action Zod schema (0..720 / 0..1 / 0..365) | Mitigated |
| T-09-06-ID: alert data exposure | All source functions auth-guarded + tenant-scoped; pure-TS alert state over fetched data | Mitigated |
| T-09-06-XSS: project names in Stalled drill | React JSX auto-escapes; no dangerouslySetInnerHTML | Mitigated |
| T-09-06-SC: new package installs | Zero new packages — Settings/TriangleAlert/PauseCircle from lucide-react (already installed) | Accepted |

## Known Stubs

None — all data is live: `getTenantSettings()` reads DB (or D-84 code defaults on no row), `getStalledProjects()` runs a live DB query, `updateTenantSettings()` persists immediately.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns beyond what was planned.

## Self-Check

Files created/modified:

- [x] `src/app/dashboard/(admin)/overview/page.tsx` — modified
- [x] `src/app/dashboard/(admin)/settings/page.tsx` — created
- [x] `src/components/admin/ThresholdSettingsForm.tsx` — created
- [x] `src/components/layout/TopNav.tsx` — modified
- [x] `messages/en.json` — modified
- [x] `messages/tr.json` — modified

Commits:
- [x] ef7576a — Task 1
- [x] 5157624 — Task 2
- [x] 1e6d061 — Task 3
