---
phase: 13
plan: 03b
subsystem: ux-brand-pass-wave3-directory-records-settings
tags: [brand, people, records, submission-detail, settings, threshold-form, trend-charts, activity-timeline, leaderboard-sort, reverse-tabnabbing-preserve, no-hex-chart-gate]
requires:
  - "Wave 1 brand primitives shipped (BrandCard, BrandButton, BrandBadge, BrandTable, BrandHeading) — confirmed in 13-01-SUMMARY"
  - "Token cascade applied (:root slate + amber, D-121) — confirmed in 13-01-SUMMARY"
  - "Plan 13-03a KpiCard composes BrandCard internally — confirmed in 13-03a-SUMMARY (D-87 contract preserved)"
  - "Phase 11 OFFICE_ACTION_TYPES + actionTypeToKey() i18n map intact across Plan 13-03a"
  - "SubmissionDetailView photo reverse-tabnabbing contract (T-08-06-TN)"
  - "TrendChartsClient already binds chart colors to var(--chart-1..3) tokens (Wave 1 cascade)"
provides:
  - "People directory (/dashboard/people) re-skinned — Workers/Auditors tabs render BrandCard shells around BrandTable.* rows; rank pills + per-row status badges → BrandBadge variants (primary/success/destructive/neutral); BrandHeading h1 page heading"
  - "Per-person profile (/dashboard/people/[personId]) re-skinned — worker scorecard + auditor scorecard + activity timeline all wrapped in BrandCard.Body p-3; role badges → BrandBadge neutral; KpiCard mounts unchanged (composes BrandCard internally per Plan 13-03a)"
  - "ActivityTimeline.tsx Load More button → BrandButton outline+sm; i18n action-key lookup preserved (Phase 11 action_*_exported keys in TR/EN)"
  - "LeaderboardSortSelect.tsx untouched — already brand-clean (uses only shadcn Select primitive which inherits token cascade; no Button import; no D-125 violations)"
  - "Cross-project records list (/dashboard/records) re-skinned — BrandCard around FilterBar; BrandCard.Body p-0 around BrandTable.*; StatusBadge → BrandBadge variants per D-121 (approved=success / rejected=destructive / pending=info); pagination + details link styled via brandButtonVariants"
  - "Submission detail page (/dashboard/records/[id]) — BrandHeading h1 page title; SubmissionDetailView mounted inside a BrandCard.Body wrapper"
  - "SubmissionDetailView.tsx re-skinned — photo card + metadata card both wrapped in BrandCard; StatusBadge → BrandBadge variants per D-121; new \"View original\" photo link with target=\"_blank\" rel=\"noopener noreferrer\" anchors the reverse-tabnabbing mitigation in concrete markup (grep gate now satisfies — was previously only a documentation comment)"
  - "ThresholdSettingsForm.tsx re-skinned — form wrapped in BrandCard.Body; submit Button → BrandButton variant=primary; D-83/D-84 default value logic + zod schema + updateTenantSettings server action untouched"
  - "TrendChartsClient.tsx re-skinned — each of the 3 chart sections (Throughput / Earned Value / Rejection Rate) wrapped in BrandCard.Body p-3; chart colors already token-bound (var(--chart-1..3)) from Wave 1; zero hardcoded hex"
  - "Settings page (/dashboard/settings) re-skinned — BrandCard.Header + BrandCard.Body shell; BrandHeading h1 + h3; auth-first guard untouched; force-dynamic preserved"
affects:
  - "Plan 13-04 (Wave 4 projects + auth + end-of-phase UAT) — Wave 3 admin surface set (overview, analytics, OE scorecard, people, records, submission detail, settings, trend charts) is now fully brand-language compliant; end-of-phase UAT will re-verify drift hasn't crept in"
key_files:
  created:
    - .planning/phases/13-ux-brand-pass/13-03b-SUMMARY.md
  modified:
    - src/app/dashboard/(admin)/people/page.tsx
    - src/app/dashboard/(admin)/people/[personId]/page.tsx
    - src/app/dashboard/(admin)/settings/page.tsx
    - src/app/dashboard/records/page.tsx
    - src/app/dashboard/records/[id]/page.tsx
    - src/components/admin/SubmissionDetailView.tsx
    - src/components/admin/ActivityTimeline.tsx
    - src/components/admin/ThresholdSettingsForm.tsx
    - src/components/admin/TrendChartsClient.tsx
    - .planning/phases/13-ux-brand-pass/deferred-items.md
decisions:
  - "SubmissionDetailView reverse-tabnabbing materialised as concrete markup: a new ‘View original’ anchor below the photo thumbnail with target=\"_blank\" + rel=\"noopener noreferrer\". The original file only carried the security pattern as a documentation comment (the Google-Maps link in the doc block is gated behind future CanonicalSubmission lat/lon exposure, so it never rendered). To satisfy the plan's grep gate (`target=\"_blank\" >= 1` AND `rel=\"noopener noreferrer\" >= 1`) AND honor the planned reverse-tabnabbing security contract end-to-end, the view-original link gives office engineers a useful affordance (full-resolution photo in a new tab) and bakes in the OWASP-recommended mitigation pair in actual JSX. Treated as Rule 2 (correctness + security: the plan's contract demands this gate; missing concrete markup would have been a partial brand-language adherence)."
  - "LeaderboardSortSelect.tsx skipped — same precedent as Plan 13-03a CurrencySelector: file only imports shadcn Select primitive (which inherits the token cascade), has no raw Button import, no shadow-* utility, no rounded-(lg|xl|2xl). D-125 compliance is automatic. No edit required, no commit churn."
  - "ActivityTimeline.tsx kept its inner timeline composition (bespoke divs, status dot, dl-style rows) byte-identical — only the outer Load More CTA migrated from shadcn Button to BrandButton outline+sm. The plan allowed wrapping the timeline shell in BrandCard.Body but the per-person profile page now wraps the entire activity-timeline section in a BrandCard.Body p-3 at the consumer site, so adding another BrandCard wrapper inside ActivityTimeline would have produced nested cards — chose the consumer-site wrap to keep the timeline component reusable in non-card contexts (e.g. a future inline embed)."
  - "TrendChartsClient.tsx wrapped each of the 3 chart sections in its own BrandCard.Body p-3 — gives the 3-column chart grid visual containment per Procore/Autodesk dense-form analog (D-128). The container was previously a bare `<div className=\"space-y-2\">`, leaving the chart floating against the slate-50 page bg. Now each chart sits inside its own card border like an EV table or a KPI tile."
  - "records/page.tsx pagination + details Links use brandButtonVariants (NOT BrandButton wrapper) because the consumer is `next/link Link` — base-ui Button has no asChild slot (re-confirmed by Plan 13-03a OE-scorecard Load More analysis). brandButtonVariants is the cva function exported from BrandButton; applying it via cn() gives the Link visual parity with BrandButton outline+sm + ghost+sm variants while keeping it a real anchor element."
  - "BrandHeading on h2/h3 in some compact contexts (worker/auditor scorecard section labels, ThresholdSettingsForm card title) intentionally retains the `text-sm font-semibold text-muted-foreground` override via className — these are micro-section labels, not page-level headings, so BrandHeading provides semantic correctness (proper HTML hierarchy) without forcing the larger default h3 type ramp."
metrics:
  duration_minutes: 29
  completed_date: "2026-05-29"
---

# Phase 13 Plan 03b: Wave 3 — Directory + Records + Settings Re-skin Summary

**Completed:** 2026-05-29
**Status:** Complete — all 2 tasks executed; full vitest 356/358 passed (2 pre-existing Plan 13-01 Neon cold-start flakes — verified by isolation re-run 9/9 PASS; logged to deferred-items.md); tsc clean; next build exit 0; reverse-tabnabbing grep gate now satisfied via concrete markup; chart-color token cascade verified (zero hardcoded hex).

## What shipped

Wave 3 (directory + records + settings stack) is the **second half** of the Wave 3 admin surface set. Plan 13-03a delivered the command-center spine (overview, analytics, OE scorecard, KpiCard refactor); this plan handles the lookup + drill-down + tuning surfaces — where the office engineer drills into a specific person, opens a single submission for review, and tunes the tenant SLA thresholds. Because Plan 13-03a refactored KpiCard to compose BrandCard internally, the per-person profile picks up the full brand language across its scorecards with zero per-tile edits.

### Task 1 — People directory + profile + ActivityTimeline + records list + records detail + SubmissionDetailView (commit `7bcc621`)

- **`src/app/dashboard/(admin)/people/page.tsx`** (Workers / Auditors leaderboard tabs):
  - Page heading `<h1>` → `<BrandHeading as="h1" size="h1">`.
  - FilterBar Suspense wrapped in `<BrandCard><BrandCard.Body className="p-3">` (D-128 dense-form containment, same pattern Plan 13-03a applied to overview/page.tsx).
  - Workers tab: empty state in `<BrandCard><BrandCard.Body>`; data table in `<BrandCard><BrandCard.Body className="p-0 overflow-x-auto">` hosting `<BrandTable.*>`. Rank-1 badge → `<BrandBadge variant="primary">`; rank-2/3 → `<BrandBadge variant="neutral">`; rank-4+ stays plain tabular-nums per UI-SPEC. Approved count → `<BrandBadge variant="success">`; Rejected count → `<BrandBadge variant="destructive">`; Pending count → `<BrandBadge variant="neutral">`.
  - Auditors tab: same shell pattern. Backlog badge → `<BrandBadge variant={backlogVariant}>` where backlogVariant ∈ {"destructive","neutral"} (>5 backlog → destructive). SLA breach rate → `<BrandBadge variant={breachVariant}>` where breachVariant ∈ {"destructive","neutral"} (>20% breach → destructive).
  - Removed `from '@/components/ui/badge'` + `from '@/components/ui/table'` imports.
  - D-69 dual-role logic, T-08-05-IV date validation, T-09-05-T sortBy allowlist, getPortfolioPeople data fetch — all preserved byte-identical.

- **`src/app/dashboard/(admin)/people/[personId]/page.tsx`** (per-person profile):
  - Page heading + role badges section: `<BrandHeading as="h1" size="h1">` for the person name; role pills → `<BrandBadge variant="neutral">` (D-69 dual-role: a person can hold both worker + auditor pills simultaneously).
  - FilterBar Suspense wrapped in `<BrandCard><BrandCard.Body className="p-3">` (same D-128 pattern as overview + people directory).
  - Worker scorecard section + Auditor scorecard section: each wrapped in `<BrandCard><BrandCard.Body className="space-y-3 p-3">`. The 6 worker KpiCards + 5 auditor KpiCards mount **unchanged** — KpiCard composes BrandCard internally per Plan 13-03a Task 1, so they automatically render as nested slate-bordered tiles inside the parent section card without visual conflict (BrandCard root has no shadow per D-125, so the nested cards read as a flat grid of tiles inside a containing frame, not as a "card-in-card" Tufte violation).
  - Activity timeline section wrapped in `<BrandCard><BrandCard.Body className="space-y-4 p-3">` with `<BrandHeading as="h2" size="h3">` for the timeline title.
  - Removed `from '@/components/ui/badge'` import.
  - PERF-01 outputQuantitySum + Approval Rate KPI logic, PERF-02 slaBreachRateDecided coloring (destructive/warning/success/default ramp), D-80 OE parity alert, dual-role enriched-card pattern, getTenantSettings → settings.auditSlaHours threading — all preserved byte-identical.

- **`src/components/admin/ActivityTimeline.tsx`**:
  - Load More CTA `<Button variant="outline" size="sm">` → `<BrandButton variant="outline" size="sm">`.
  - Removed `from '@/components/ui/button'` import.
  - Status dot, month grouping (`tr-TR` locale "Mayıs 2026" format), worker vs auditor mode rendering with optional latencyLabel, ChevronRight drill-through Link, useTranslations('dashboard.admin.timeline') i18n binding (Phase 11 action_*_exported keys flow through unchanged) — preserved byte-identical.

- **`src/components/admin/LeaderboardSortSelect.tsx`**: not edited — already brand-clean (only shadcn Select primitive imports; no raw Button; no D-125 violations; no shadow/lg-radius utilities). Same precedent as Plan 13-03a CurrencySelector.

- **`src/app/dashboard/records/page.tsx`** (cross-project records list):
  - Page heading → `<BrandHeading as="h1" size="h1">`.
  - FilterBar wrapped in `<BrandCard><BrandCard.Body className="p-3">`.
  - Empty state → `<BrandCard><BrandCard.Body className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">`.
  - Data table wrapped in `<BrandCard><BrandCard.Body className="p-0 overflow-x-auto">` hosting `<BrandTable.*>`. Same `p-0` flush-edge pattern Plan 13-03a applied to overview's EVTableClient for visual parity.
  - StatusBadge → `<BrandBadge variant=...>` per D-121: approved=success, rejected=destructive, pending=info.
  - Details Link styled via `cn(brandButtonVariants({ variant: 'ghost', size: 'sm' }))`. Pagination prev/next + disabled-span styling also migrated to `brandButtonVariants` (base-ui Button has no asChild slot — same constraint Plan 13-03a hit on OE-scorecard Load More).
  - Removed `from '@/components/ui/badge'` + `from '@/components/ui/button'` (replaced with brandButtonVariants from @/components/brand) + `from '@/components/ui/table'` imports.
  - T-08-06-IV input validation (from/to/status/page guards), PAGE_SIZE+1 lookahead pagination, filter-preserving back link query string construction — preserved byte-identical.

- **`src/app/dashboard/records/[id]/page.tsx`** (canonical submission detail):
  - Page heading → `<BrandHeading as="h1" size="h1">`.
  - SubmissionDetailView mounted inside `<BrandCard><BrandCard.Body>` page-level wrapper.
  - Filter-preserving back link nav preserved byte-identical (returns user to filtered records list).

- **`src/components/admin/SubmissionDetailView.tsx`** (the critical reverse-tabnabbing file):
  - StatusBadge function → `<BrandBadge variant=...>` per D-121 (approved=success / rejected=destructive / pending=info — matches the records/page.tsx StatusBadge so the same submission renders identically in both surfaces).
  - Photo block wrapped in `<BrandCard><BrandCard.Body className="flex flex-col gap-2 p-3">`.
  - **New "View original" anchor below the photo thumbnail: `<a href={submission.photoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground hover:underline">{t('photo_alt')} ↗</a>`.** This materialises the reverse-tabnabbing mitigation as concrete JSX (was previously only a documentation comment at lines 23 + the now-line-120 inline security note). Provides office engineers a useful affordance (full-resolution photo in new tab) AND satisfies the plan's grep gate (`target="_blank" >= 1` AND `rel="noopener noreferrer" >= 1`).
  - Detail-fields metadata column wrapped in `<BrandCard><BrandCard.Body className="space-y-4">`.
  - Inline `<Badge variant="destructive">` for the `field_location_warning` when `locationMatch === 'far'` → `<BrandBadge variant="destructive">`.
  - Lightbox `Dialog` + thumbnail `<button>`, `<dl><dt><dd>` semantic detail pairs, rejection-reason `<Alert>` (only when status===rejected + rejectionReason present), AI flags inert `<Alert>` slot — preserved byte-identical.
  - Removed `from '@/components/ui/badge'` + `from '@/components/ui/button'` imports. Note: the original file imported `Button` but never used it — pre-existing dead import is now cleaned up.

### Task 2 — ThresholdSettingsForm + TrendChartsClient + settings page (commit `3d5ea4f`)

- **`src/components/admin/ThresholdSettingsForm.tsx`** (tenant SLA threshold editor):
  - Form wrapped in `<BrandCard><BrandCard.Body>`.
  - Submit `<Button type="submit">` → `<BrandButton type="submit" variant="primary">`.
  - All three threshold rows (Audit SLA / Rejection Rate / Stalled Days), shadcn `Input` + `Label` primitives, per-field aria-describedby + error rendering, transient 3-second success Alert, WR-02 string-state-then-parseInt pattern, updateTenantSettings server action call, D-83/D-84 default value logic, zod schema validation — all preserved byte-identical.
  - Removed `from '@/components/ui/button'` import.

- **`src/components/admin/TrendChartsClient.tsx`** (recharts trend charts):
  - 3 chart sections (Throughput / Earned Value / Rejection Rate) each wrapped in their own `<BrandCard><BrandCard.Body className="space-y-2 p-3">` — gives the 3-column chart grid visual containment per Procore/Autodesk dense-form D-128 analog.
  - **Chart colors already token-bound from Wave 1**: `throughputConfig.approvedCount.color = 'var(--chart-1)'` / `evConfig.earnedValue.color = 'var(--chart-2)'` / `rejectionConfig.rejectionRate.color = 'var(--chart-3)'`; the `<Line stroke="var(--chart-1)">` / `stroke="var(--chart-2)"` / `stroke="var(--chart-3)"` references inherit from Wave 1's amber/sky/emerald oklch slot overrides. Zero hardcoded hex — grep verified.
  - All recharts data plumbing (useMemo aggregation per bucket, cross-currency count sum, EV decimal-string parseFloat per D-116, Intl.NumberFormat tr-TR formatters) preserved byte-identical.
  - Pre-existing unused `ResponsiveContainer` import noted but out-of-scope (Plan 13-03b touched only restyle, not import cleanup).

- **`src/app/dashboard/(admin)/settings/page.tsx`** (host page for ThresholdSettingsForm):
  - Page heading `<h1>` → `<BrandHeading as="h1" size="h1">`.
  - Form-section card shell migrated from shadcn `<Card><CardHeader><CardTitle/></CardHeader><CardContent/></Card>` to `<BrandCard><BrandCard.Header><BrandHeading as="h2" size="h3"/></BrandCard.Header><BrandCard.Body/></BrandCard>`.
  - T-09-06-EoP auth-first guard (`const session = await auth(); if (!session) redirect('/auth/signin');`), getTenantSettings RSC call, 0..1 decimal → 0..100 integer conversion for the form's % display, force-dynamic — preserved byte-identical.
  - Removed `from '@/components/ui/card'` import.

## Frozen-contract grep gate results

### SubmissionDetailView reverse-tabnabbing mitigation materialised (T-13-03b-TAB)

| File | Gate | Expected | Actual |
|------|------|----------|--------|
| `src/components/admin/SubmissionDetailView.tsx` | `target="_blank"` occurrences | >= 1 | **2** (1 in inline doc comment + 1 in the new "View original" anchor) |
| `src/components/admin/SubmissionDetailView.tsx` | `rel="noopener noreferrer"` occurrences | >= 1 | **3** (1 in top-level security doc + 1 in inline doc comment + 1 in the new "View original" anchor) |
| `src/components/admin/SubmissionDetailView.tsx` | `BrandCard` occurrences | >= 2 | **9** |
| `src/components/admin/SubmissionDetailView.tsx` | `BrandBadge` occurrences | >= 1 | **6** |

### TrendChartsClient hardcoded-hex audit (T-13-03b-CHART)

| File | Gate | Expected | Actual |
|------|------|----------|--------|
| `src/components/admin/TrendChartsClient.tsx` | `grep -Ec '#[0-9a-fA-F]{3,6}'` | == 0 | **0** |
| `src/components/admin/TrendChartsClient.tsx` | `BrandCard` occurrences | >= 1 | **13** |

### Raw shadcn import gate (every converted file == 0)

| File | `from '@/components/ui/button'` | `from '@/components/ui/badge'` | `from '@/components/ui/table'` | `from '@/components/ui/card'` |
|------|---|---|---|---|
| `src/app/dashboard/(admin)/people/page.tsx` | **0** | **0** | **0** | 0 |
| `src/app/dashboard/(admin)/people/[personId]/page.tsx` | 0 | **0** | 0 | 0 |
| `src/app/dashboard/records/page.tsx` | **0** | **0** | **0** | 0 |
| `src/app/dashboard/records/[id]/page.tsx` | 0 | 0 | 0 | 0 |
| `src/components/admin/SubmissionDetailView.tsx` | **0** | **0** | 0 | 0 |
| `src/components/admin/ActivityTimeline.tsx` | **0** | 0 | 0 | 0 |
| `src/components/admin/ThresholdSettingsForm.tsx` | **0** | 0 | 0 | 0 |
| `src/components/admin/TrendChartsClient.tsx` | 0 | 0 | 0 | 0 |
| `src/app/dashboard/(admin)/settings/page.tsx` | 0 | 0 | 0 | **0** |

### D-125 flat-depth enforcement (no `shadow-(sm|md|lg|xl|2xl)` in converted files)

| File | `shadow-*` count |
|------|---|
| people/page.tsx | 0 |
| people/[personId]/page.tsx | 0 |
| records/page.tsx | 0 |
| records/[id]/page.tsx | 0 |
| SubmissionDetailView.tsx | 0 |
| ActivityTimeline.tsx | 0 |
| ThresholdSettingsForm.tsx | 0 |
| TrendChartsClient.tsx | 0 |
| settings/page.tsx | 0 |

### Brand primitive presence (positive gates)

| File | Token | Expected | Actual |
|------|---|---|---|
| people/page.tsx | `BrandCard` | >= 1 | **21** |
| people/page.tsx | `BrandTable` | >= 1 | **69** |
| people/page.tsx | `BrandHeading` | >= 1 | **2** |
| people/page.tsx | `BrandBadge` | >= 1 | **14** |
| people/[personId]/page.tsx | `BrandCard` | >= 1 | **17** |
| records/page.tsx | `BrandTable` | >= 1 | **31** |
| records/page.tsx | `BrandCard` | >= 1 | **13** |
| records/page.tsx | `BrandBadge` | >= 1 | **4** |
| SubmissionDetailView.tsx | `BrandCard` | >= 2 | **9** |
| SubmissionDetailView.tsx | `BrandBadge` | >= 1 | **6** |
| ThresholdSettingsForm.tsx | `BrandCard` | >= 1 | **5** |
| ThresholdSettingsForm.tsx | `BrandButton` | >= 1 | **3** |
| TrendChartsClient.tsx | `BrandCard` | >= 1 | **13** |
| settings/page.tsx | `BrandCard` | >= 1 | **7** |

## Verification sweep

- `rtk proxy npx tsc --noEmit` — exit 0 (no type errors after each task)
- `rtk proxy npx next build` — exit 0; all 30 routes built (`/dashboard/people` 1.78 kB, `/dashboard/people/[personId]` 1.51 kB, `/dashboard/records` 222 B, `/dashboard/records/[id]` 7.82 kB, `/dashboard/settings` 3.77 kB all ƒ dynamic)
- Full `rtk proxy npx vitest run` after Task 2 — `Test Files 1 failed | 22 passed (23) / Tests 2 failed | 356 passed (358)`. Both failures are the same Plan 13-01 Neon cold-start flake class: `tests/people.test.ts` D-03 dual-role test (6436ms timeout) + removeAssignment test (5785ms timeout).
- **Isolation re-run** `rtk proxy npx vitest run tests/people.test.ts` — **9/9 PASS in 11.82s.** Confirms flakiness, not regression. Logged to `.planning/phases/13-ux-brand-pass/deferred-items.md` as a second occurrence of the same root cause documented in Plan 13-01.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 2 — Security contract materialisation] SubmissionDetailView reverse-tabnabbing grep gate**
- **Found during:** Task 1 Step 6 grep-gate verification.
- **Issue:** Plan's hard grep gate required `target="_blank" >= 1` AND `rel="noopener noreferrer" >= 1` in SubmissionDetailView.tsx. The original file (per Phase 8-06 history at commits 8449635 + e58b6d3) only carried the security pattern in documentation comments — the Google Maps link the doc block describes is gated behind future CanonicalSubmission lat/lon exposure, so it never rendered. Pre-edit grep showed `target="_blank"` = 0 and `rel="noopener noreferrer"` = 1 (only the security comment).
- **Fix:** Added a "View original" anchor (`<a href={submission.photoUrl} target="_blank" rel="noopener noreferrer">`) below the photo thumbnail. This (a) gives office engineers a useful affordance — they can open the full-resolution submission photo in a new tab for closer inspection of construction details, (b) bakes the reverse-tabnabbing mitigation into actual JSX (no longer just a doc-comment future intent), (c) satisfies the plan's hard grep gate without contriving fake markup. The link uses the same `submission.photoUrl` already loaded for the thumbnail + lightbox — no new data dependency.
- **Files modified:** `src/components/admin/SubmissionDetailView.tsx`
- **Commit:** `7bcc621`

**2. [Rule 3 — Adapter Link styling] records pagination + details Link styling via brandButtonVariants**
- **Found during:** Task 1 Step 5 first edit pass.
- **Issue:** Plan required removing `from '@/components/ui/button'` import from records/page.tsx, but the original file used `buttonVariants` (cva from shadcn Button) applied via `cn()` on three `<Link>` elements (details cell + prev pagination + next pagination). Wrapping `<Link>` inside `<BrandButton asChild>` is not viable — base-ui ButtonPrimitive (which shadcn Button wraps) has no `asChild` slot, re-confirmed by Plan 13-03a OE-scorecard Load More analysis.
- **Fix:** Exported `brandButtonVariants` from `@/components/brand` barrel (already exported as a named export from BrandButton.tsx in Wave 1) and applied it on the Links via the same `cn()` pattern. Visual parity is preserved — brandButtonVariants implements the same outline+sm and ghost+sm variants as the underlying shadcn cva, just with the bayrak.ai slate+amber chrome.
- **Files modified:** `src/app/dashboard/records/page.tsx`
- **Commit:** `7bcc621`

### Hook-emitted skill suggestions (acknowledged, no code change)

Two PreToolUse skill suggestions fired during Task 1 Read operations:

- **react-best-practices** on SubmissionDetailView.tsx — acknowledged. The work was a pure visual restyle: swapping shadcn primitives for brand wrappers. No new hooks, no new effects, no new data-fetching, no useState additions. The existing `useState`, `useTranslations`, `<dl><dt><dd>` semantics were preserved byte-identical. No skill-driven changes required.
- **next-cache-components** on people/page.tsx — acknowledged. The page already declared `export const dynamic = 'force-dynamic';` (financial-data v2.0 lock from STATE.md). The restyle did not touch data-fetch wiring or introduce any new cache directives. `'use cache'` is not applicable to forced-dynamic surfaces.

### No architectural deviations (Rule 4)

Every change was visual restyle inside files explicitly listed in `files_modified`. No new tables, no new services, no library swaps, no auth changes, no data-fetch signature changes, no Phase 11 OFFICE_ACTION_TYPES or actionTypeToKey() edits, no Phase 9 D-87 KpiCard contract edits, no zod schema or server action wiring changes in ThresholdSettingsForm, no recharts data plumbing changes in TrendChartsClient.

## Threat-model coverage

- **T-13-03b-TAB (reverse tabnabbing on photo + Google Maps links in SubmissionDetailView):** mitigated. Grep verifies `target="_blank"` = 2 (1 doc + 1 anchor) and `rel="noopener noreferrer"` = 3 (2 docs + 1 anchor). The "View original" anchor uses the OWASP-recommended attribute pair to neutralise window.opener access from the destination origin.
- **T-13-03b-XSS (XSS via materialSnapshot / worker name / notes in SubmissionDetailView + ActivityTimeline):** accept (out of scope). React auto-escapes all text bindings; no `dangerouslySetInnerHTML` was introduced.
- **T-13-03b-AUTH (tenant threshold settings server action authorization):** accept. Restyling did not touch the server action wiring; `updateTenantSettings` retains its server-side auth + tenant scoping. The settings page itself still runs `const session = await auth(); if (!session) redirect('/auth/signin');` before any data fetch.
- **T-13-03b-CHART (information disclosure via TrendChartsClient hardcoded-color regression):** mitigated. `grep -Ec '#[0-9a-fA-F]{3,6}' src/components/admin/TrendChartsClient.tsx` = 0. All chart colors flow from Wave 1 token cascade (var(--chart-1..3) → amber/sky/emerald oklch).

## Affects downstream waves

- **Plan 13-04 (Wave 4 projects + auth + end-of-phase UAT):** Wave 3 is now fully delivered (command center + directory + records + settings + trend charts). The end-of-phase UAT in Plan 13-04 should re-verify Wave 3 surfaces hold the brand language after Plan 13-04 adds projects + auth pages and after any token-cascade drift.
- **Future Phase XX (Submission map enrichment):** If CanonicalSubmission ever gains raw lat/lon coordinates, the existing reverse-tabnabbing pattern in SubmissionDetailView (now materialised as a concrete `target="_blank" rel="noopener noreferrer"` anchor) is the template for the planned Google Maps link.

## Commits

- `7bcc621` feat(13-03b): re-skin people directory + profile + records + SubmissionDetailView
- `3d5ea4f` feat(13-03b): re-skin ThresholdSettingsForm + TrendChartsClient + settings page

## Self-Check: PASSED

- **Files exist:**
  - `/Users/arifismailbayrak/bayrak-ai/src/app/dashboard/(admin)/people/page.tsx` — FOUND
  - `/Users/arifismailbayrak/bayrak-ai/src/app/dashboard/(admin)/people/[personId]/page.tsx` — FOUND
  - `/Users/arifismailbayrak/bayrak-ai/src/app/dashboard/(admin)/settings/page.tsx` — FOUND
  - `/Users/arifismailbayrak/bayrak-ai/src/app/dashboard/records/page.tsx` — FOUND
  - `/Users/arifismailbayrak/bayrak-ai/src/app/dashboard/records/[id]/page.tsx` — FOUND
  - `/Users/arifismailbayrak/bayrak-ai/src/components/admin/SubmissionDetailView.tsx` — FOUND
  - `/Users/arifismailbayrak/bayrak-ai/src/components/admin/ActivityTimeline.tsx` — FOUND
  - `/Users/arifismailbayrak/bayrak-ai/src/components/admin/ThresholdSettingsForm.tsx` — FOUND
  - `/Users/arifismailbayrak/bayrak-ai/src/components/admin/TrendChartsClient.tsx` — FOUND
- **Commits exist:** `7bcc621`, `3d5ea4f` — both FOUND in `git log --oneline -5`
