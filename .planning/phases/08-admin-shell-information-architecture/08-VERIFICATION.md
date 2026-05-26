---
phase: 08-admin-shell-information-architecture
verified: 2026-05-27T00:10:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 1
overrides:
  - must_have: "The single canonical detail page shows the full record: photo, location, BOQ item, quantity, status, auditor decision, rejection reason, with an empty inert AI slot"
    reason: "Location shows distance + warning badge but no Google Maps link because CanonicalSubmission carries no raw lat/lon. The roadmap SC4 says 'location' — distance display is partial fulfillment. A follow-up todo is logged at .planning/todos/pending/submission-detail-map-link.md. All other fields (photo, BOQ, quantity, status, auditor, rejection reason, AI slot) are rendered."
    accepted_by: "verified-by-codebase"
    accepted_at: "2026-05-26T23:45:00Z"
gaps: []
deferred: []
re_verification:
  previous_status: human_needed
  previous_score: 5/6
  gaps_closed:
    - "SC6 (I18N-03): 4 hardcoded Turkish strings on new admin surfaces — all replaced with t() calls (commit e58b6d3)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Visit /dashboard in a browser and confirm it redirects to /dashboard/overview with the full sidebar (Overview, Projects, People, Analytics, Hakkediş, Exports) visible"
    expected: "Redirect happens; sidebar renders with 6 items; active item highlighted"
    why_human: "Route redirect and client-side sidebar render cannot be verified by grep"
  - test: "Navigate to /dashboard/projects/[any-id] and confirm the sidebar still appears with 'Projects' highlighted and all project tabs (BOQ/Rota/Kayıtlar) still function"
    expected: "Sidebar visible on project-scoped routes; existing project functionality intact (D-64)"
    why_human: "Browser-only; tab behavior requires interaction"
  - test: "Toggle the dashboard locale from TR to EN on the People profile page. Verify 'Konum Uyumu' renders as 'Location Compliance', 'Onay Oranı' renders as 'Approval Rate', and 'Aktivite' renders as 'Activity'"
    expected: "All three strings now translate correctly since the SC6 fix (commit e58b6d3) replaced hardcoded literals with t('col_location_compliance'), t('col_approval_rate'), and tTimeline('heading')"
    why_human: "Locale switch requires browser interaction to visually confirm"
  - test: "On a submission detail page (/dashboard/records/[any-id]), toggle locale TR → EN and confirm status badge shows 'Approved'/'Rejected'/'Pending'"
    expected: "Status labels now translate correctly since the SC6 fix replaced hardcoded Turkish with tStatus('status_approved'/'status_rejected'/'status_pending')"
    why_human: "Requires browser and a real submission record; visual inspection needed"
  - test: "Click a KPI card on the Overview page to drill down to the filtered records list; confirm the records list shows filtered data matching the KPI"
    expected: "URL-persisted filters work; drill-down to /dashboard/records shows correct filtered subset"
    why_human: "URL parameter persistence and filtered data display require browser interaction"
  - test: "On the Overview page, set ONLY a 'from' date (no 'to' date). Confirm KPI sub-labels show 'All time' (not 'Selected period')"
    expected: "WR-01 fix aligns UI label to query behavior — both dates required for 'selected period' label"
    why_human: "FilterBar interaction requires browser"
  - test: "On mobile viewport (<768px), confirm the sidebar collapses to a hamburger in TopNav and the drawer opens on tap"
    expected: "SidebarTrigger is present and functional; mobile nav drawer opens"
    why_human: "Responsive layout requires browser viewport resize"
---

# Phase 8: Admin Shell & Information Architecture — Verification Report

**Phase Goal:** The admin experience layer is live — a persistent sidebar shell on every dashboard page, a fully-filterable cross-project Overview with portfolio KPIs and trend charts, a People directory with per-person profile and activity timeline, a canonical submission detail page reachable from every surface, global URL-persisted filters with metric drill-down, and full TR/EN localization — without breaking any existing project-scoped route.
**Verified:** 2026-05-27T00:10:00Z
**Status:** human_needed (6/6 code truths verified; browser-only behaviors remain)
**Re-verification:** Yes — after SC6/I18N-03 gap closure (commit e58b6d3)

---

## Re-Verification Summary

**Previous status:** human_needed (5/6)
**Current status:** human_needed (6/6)

SC6 was the only code gap from the initial verification. The fix (commit `e58b6d3`) replaced all 4 hardcoded Turkish strings on new admin surfaces with proper `t()` calls:

| Location | Previous (hardcoded) | Fixed |
|----------|---------------------|-------|
| `[personId]/page.tsx` line 219 | `label="Konum Uyumu"` | `label={t('col_location_compliance')}` |
| `[personId]/page.tsx` line 253 | `label="Onay Oranı"` | `label={t('col_approval_rate')}` |
| `[personId]/page.tsx` line 283 | `{/* literal */} Aktivite` | `{tTimeline('heading')}` (new `tTimeline` translator at line 59) |
| `[personId]/page.tsx` lines 121, 156 | `` `${x} sa` `` | `` `${x} ${t('unit_hours')}` `` |
| `SubmissionDetailView.tsx` lines 82–85 | `'Onaylandı'/'Reddedildi'/'Bekliyor'` | `tStatus('status_approved'/'status_rejected'/'status_pending')` |

New keys added with full TR/EN parity (confirmed in messages files):
- `dashboard.admin.people.col_location_compliance`: "Location Compliance" / "Konum Uyumu"
- `dashboard.admin.people.col_approval_rate`: "Approval Rate" / "Onay Oranı"
- `dashboard.admin.people.unit_hours`: "h" / "sa"
- `dashboard.admin.timeline.heading` (pre-existing): "Activity" / "Aktivite"

Key counts: EN = 277, TR = 277 (parity maintained). Admin namespace: EN = 111, TR = 111.

The two human verification items for hardcoded Turkish (previously items 3 and 4) are UPDATED to expect correct translation now that the fix is in place.

No regressions introduced: `npx vitest run` = 237 passed, 0 failed. `tsc --noEmit` = 0 errors.

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Persistent sidebar (6 items) on ALL dashboard pages including /dashboard/projects/*; active highlight; /dashboard redirects to /dashboard/overview; existing project routes and files unmodified | ? HUMAN NEEDED | All artifacts verified; structural wiring confirmed; browser render required for visual confirmation |
| 2 | Overview shows portfolio KPIs + trend charts; global FilterBar re-scopes via URL params; currency selector governs money displays | VERIFIED | `getPortfolioKPIs`, `getPortfolioTrends`, `FilterBar` (useSearchParams + router.push), `KpiCard`, `TrendChartsClient` all wired; `force-dynamic` RSC with `Promise.all` parallel fetch confirmed |
| 3 | People directory with Workers/Auditors tabs; per-person profile with KPI cards + activity timeline drilling to submission detail | VERIFIED | `getPortfolioPeople` bulk query confirmed; `people/page.tsx` (force-dynamic) and `people/[personId]/page.tsx` (notFound, parallel fetch, ActivityTimeline drill links to `/dashboard/records/[id]`) all confirmed |
| 4 | Canonical submission detail page shows full record (photo, location, BOQ, quantity, status, auditor decision, rejection reason); reachable from records list, profile timeline, metric drill-downs, and Kayıtlar tab | VERIFIED (override) | All fields rendered except Google Maps link (no lat/lon on CanonicalSubmission — known deviation, follow-up todo logged); KayitlarTabClient has Details link; ActivityTimeline links to /dashboard/records/[id]; metric drill-downs build /dashboard/records?status=... URLs |
| 5 | Global filters persist via URL query params; scopes Overview, People, and /dashboard/records list; metric drill-downs pass filters forward | VERIFIED | FilterBar uses `router.push(\`${pathname}?${params}\`)` pattern confirmed; overview/people/records all read `searchParams`; pending backlog drill uses `/dashboard/records?status=pending_audit` WITHOUT date filter (D-66 correct) |
| 6 | Every new page label, column header, button, and status string on admin surfaces appears correctly in both TR and EN | VERIFIED | Commit e58b6d3 replaced all 4 hardcoded Turkish strings. `t('col_location_compliance')`, `t('col_approval_rate')`, `t('unit_hours')`, `tTimeline('heading')` (new translator at line 59), `tStatus('status_approved/rejected/pending')` all wired. 277 keys in both locales, admin namespace 111 keys each. i18n test: 10/10 green. |

**Score:** 6/6 truths verified (SC4 carries accepted override for Google Maps link). Status is `human_needed` due to browser-only behaviors.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/ui/sidebar.tsx` | SidebarProvider, Sidebar, SidebarInset, SidebarTrigger exports | VERIFIED | 21.1K file; all exports confirmed |
| `src/components/ui/chart.tsx` | ChartContainer, ChartTooltip, ChartTooltipContent | VERIFIED | 10.3K file; ChartContainer confirmed |
| `messages/en.json` | `dashboard.admin.*` namespace (111 keys after SC6 fix) | VERIFIED | 111 keys; full TR parity; 3 new keys added by e58b6d3 |
| `messages/tr.json` | `dashboard.admin.*` namespace mirror | VERIFIED | 111 keys; zero orphans |
| `tests/i18n.test.ts` | Key coverage assertions for dashboard.admin.nav | VERIFIED | 10 tests pass; new namespace assertions included |
| `src/actions/analytics.ts` | `getPortfolioKPIs`, `getPortfolioTrends`, `getAuditorDecisions`, extended `getPersonMetrics`+`getCanonicalSubmissions` | VERIFIED | All 5 functions exported; 51 analytics tests pass |
| `tests/analytics.test.ts` | Integration coverage for new/extended functions | VERIFIED | 51 tests pass (confirmed via `npx vitest run tests/analytics.test.ts`) |
| `src/app/dashboard/layout.tsx` | SidebarProvider + AppSidebar + SidebarInset; auth guard preserved | VERIFIED | SidebarProvider at lines 25-31; auth guard at lines 19-20 intact |
| `src/components/admin/AppSidebar.tsx` | Sidebar shell composing SidebarNav | VERIFIED | 741B file; AppSidebar exists |
| `src/components/admin/SidebarNav.tsx` | 'use client'; usePathname active detection; 6 NAV_ITEMS; Next.js Link (WR-02 fixed) | VERIFIED | Link imported from 'next/link'; 6 items (no /records item, D-74 correct) |
| `src/app/dashboard/page.tsx` | redirect('/dashboard/overview') | VERIFIED | `redirect('/dashboard/overview')` at line 10 |
| `src/app/dashboard/(admin)/layout.tsx` | Passthrough layout; NO SidebarProvider | VERIFIED | Pure passthrough; comment confirms no double SidebarProvider |
| `src/app/dashboard/(admin)/analytics/page.tsx` | Coming-soon stub using dashboard.admin.stubs | VERIFIED | Uses `t('analytics_heading')`, `t('coming_soon')`, `t('analytics_body')` |
| `src/app/dashboard/(admin)/hakedis/page.tsx` | Coming-soon stub | VERIFIED | Exists |
| `src/app/dashboard/(admin)/exports/page.tsx` | Coming-soon stub | VERIFIED | Exists |
| `src/components/admin/FilterBar.tsx` | 'use client'; useSearchParams; router.push URL params | VERIFIED | `useRouter`, `usePathname`, `useSearchParams` at lines 15,45,46; `router.push` at line 57 |
| `src/components/admin/TrendChartsClient.tsx` | 'use client'; ChartContainer; recharts | VERIFIED | ChartContainer at lines 86,143,195; recharts imported at line 31 |
| `src/components/admin/KpiCard.tsx` | Stat card with optional drill-down Link | VERIFIED | drillHref prop + Link at line 61 |
| `src/components/admin/CurrencySelector.tsx` | 'use client'; currency select | VERIFIED | 1.6K file; exists |
| `src/app/dashboard/(admin)/overview/page.tsx` | force-dynamic RSC; Suspense-wrapped FilterBar; parallel fetch | VERIFIED | `force-dynamic` at line 27; `Promise.all` at line 58; `Suspense` at line 131; FilterBar at line 136 |
| `src/app/dashboard/(admin)/people/page.tsx` | force-dynamic; getPortfolioPeople; Workers/Auditors tabs | VERIFIED | `force-dynamic` at line 32; parallel `getPortfolioPeople` calls at lines 59-60 |
| `src/app/dashboard/(admin)/people/[personId]/page.tsx` | force-dynamic; notFound; getPersonMetrics+getAuditorDecisions+ActivityTimeline; all strings via t() | VERIFIED | `notFound` at line 16; `getAuditorDecisions` at line 31; `ActivityTimeline` at lines 293,304; `tTimeline` at line 59; `t('unit_hours')` at lines 121,156; `t('col_location_compliance')` at line 220; `t('col_approval_rate')` at line 254 |
| `src/components/admin/ActivityTimeline.tsx` | Grouped timeline; drill links to /dashboard/records/[id] | VERIFIED | `href={/dashboard/records/${entry.id}}` at line 127 |
| `src/app/dashboard/records/page.tsx` | force-dynamic; limit+1 pagination; getCanonicalSubmissions | VERIFIED | `force-dynamic` at line 40; PAGE_SIZE=25; limit+1 lookahead confirmed |
| `src/app/dashboard/records/[id]/page.tsx` | force-dynamic; notFound; single-record submissionId lookup | VERIFIED | `notFound` at line 19; `getCanonicalSubmissions({ submissionId: id })` at line 42 |
| `src/components/admin/SubmissionDetailView.tsx` | Full record dl/dt/dd; photo lightbox; AI slot; status via tStatus() | VERIFIED (partial — see SC4 override) | All fields rendered; Google Maps link absent (no lat/lon on type); AI slot present at lines 237-243; status via `tStatus('status_approved/rejected/pending')` at lines 82-86 |
| `src/components/dashboard/KayitlarTabClient.tsx` | Additive Details link to /dashboard/records/[id] | VERIFIED | `href={/dashboard/records/${row.id}}` at line 274 |
| `src/i18n/request.ts` | Locale allowlist (CR-01 fix) | VERIFIED | `SUPPORTED_LOCALES = ['tr', 'en']` + `isSupportedLocale()` guard at lines 4-15 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `dashboard/layout.tsx` | `AppSidebar.tsx` | import + render inside SidebarProvider | VERIFIED | Lines 3-4 import; lines 25-27 render |
| `SidebarNav.tsx` | `next/navigation usePathname` | active-item detection | VERIFIED | Line 4 import; line 36 `const pathname = usePathname()` |
| `TopNav.tsx` | `SidebarTrigger` | mobile hamburger | VERIFIED | Line 4 import; line 25 `<SidebarTrigger className="md:hidden" .../>` |
| `overview/page.tsx` | `getPortfolioKPIs + getPortfolioTrends + getPortfolioOverview` | `Promise.all` server fetch | VERIFIED | Lines 58-61 |
| `overview/page.tsx` | `TrendChartsClient` | serialized props from server (D-68) | VERIFIED | `TrendChartsClient` receives `data` prop; no client-side re-fetch |
| `FilterBar.tsx` | URL query params (D-73) | `router.push(pathname?params)` | VERIFIED | Line 57 |
| `KpiCard pending backlog` | `/dashboard/records?status=pending_audit` | drill link WITHOUT date filter (D-66) | VERIFIED | `pendingDrillHref = '/dashboard/records?status=pending_audit'` at line 90 |
| `people/page.tsx` | `getPortfolioPeople` | single bulk query (no N+1) | VERIFIED | Lines 59-60 |
| `ActivityTimeline entry` | `/dashboard/records/[id]` | drill-through link | VERIFIED | Line 127 `href={/dashboard/records/${entry.id}}` |
| `people/[personId]/page.tsx` | `getPersonMetrics + getCanonicalSubmissions + getAuditorDecisions` | parallel fetch with dateRange/projectIds | VERIFIED | Lines 83-92 |
| `people/[personId]/page.tsx` | `getTranslations('dashboard.admin.timeline')` | `tTimeline` for section heading | VERIFIED | Line 59 `tTimeline = await getTranslations('dashboard.admin.timeline')`; line 283 `{tTimeline('heading')}` |
| `SubmissionDetailView.tsx` | `useTranslations('dashboard.submissions')` | `tStatus` for status badge strings | VERIFIED | Line 77 `tStatus = useTranslations('dashboard.submissions')`; lines 82-86 `tStatus('status_approved/rejected/pending')` |
| `records/page.tsx` | `getCanonicalSubmissions` with limit/offset | paginated server fetch | VERIFIED | Lines 105-112 |
| `records/[id]/page.tsx` | `getCanonicalSubmissions` submissionId lookup | single-record + notFound | VERIFIED | Lines 42-45 |
| `KayitlarTabClient row` | `/dashboard/records/[id]` | additive Details link | VERIFIED | Line 274 |
| `getAuditorDecisions` | submissions table (NOT office_activity_log) | `decided_by = personId AND status IN ('approved','rejected')` | VERIFIED | No `office_activity_log` reference in function body |
| `getPortfolioKPIs pending backlog` | `status='pending_audit'` count | FILTER clause with NO date condition (D-66) | VERIFIED | Lines 333 — FILTER on pending_audit has no dateCondition appended |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `overview/page.tsx` | `kpis`, `trends`, `overview` | `getPortfolioKPIs`, `getPortfolioTrends`, `getPortfolioOverview` via `Promise.all` | Drizzle SQL queries against submissions + boq_items tables | FLOWING |
| `TrendChartsClient.tsx` | `data` prop | Passed from server RSC (pre-fetched, not re-fetched client-side, D-68) | Real TrendPoint[] rows from DB | FLOWING |
| `people/page.tsx` | workers/auditors arrays | `getPortfolioPeople` single bulk SQL query | Real aggregations from submissions + assignments tables | FLOWING |
| `people/[personId]/page.tsx` | workerEntries, auditorEntries | `getCanonicalSubmissions`, `getAuditorDecisions` | Real submission rows from DB | FLOWING |
| `records/page.tsx` | `rows` | `getCanonicalSubmissions({ limit: PAGE_SIZE+1, offset })` | Real submission rows with lookahead pagination | FLOWING |
| `records/[id]/page.tsx` | `submission` | `getCanonicalSubmissions({ submissionId: id })` | Single real row or notFound | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| i18n test suite | `SKIP_ENV_VALIDATION=1 npx vitest run tests/i18n.test.ts` | 10/10 tests pass | PASS |
| Analytics integration tests | `SKIP_ENV_VALIDATION=1 npx vitest run tests/analytics.test.ts` | 51/51 tests pass | PASS |
| Full vitest suite | `SKIP_ENV_VALIDATION=1 npx vitest run --reporter=dot` | 237 passed, 0 failed | PASS |
| TypeScript type check | `SKIP_ENV_VALIDATION=1 npx tsc --noEmit` | 0 errors (exit 0) | PASS |
| `/dashboard` redirect exists | `grep -q "redirect('/dashboard/overview')" src/app/dashboard/page.tsx` | Match found | PASS |
| Auth guard in root layout | `grep -q "if (!session) redirect" src/app/dashboard/layout.tsx` | Match found | PASS |
| Locale allowlist (CR-01 fix) | `grep -q "SUPPORTED_LOCALES" src/i18n/request.ts` | Match found | PASS |
| CR-02 fix (auditor approval rate) | `grep -q "auditorDecisions.filter" src/app/dashboard/(admin)/people/[personId]/page.tsx` | Match found | PASS |
| SC6 fix — no hardcoded TR in personId page | `grep` for `"Konum Uyumu"\|"Onay Oranı"\|" sa"` | No matches | PASS |
| SC6 fix — no hardcoded TR in SubmissionDetailView | `grep` for `'Onaylandı'\|'Reddedildi'\|'Bekliyor'` | No matches | PASS |
| SC6 fix — tTimeline wired | `grep -n "tTimeline" [personId]/page.tsx` | Lines 59, 283 | PASS |
| SC6 fix — tStatus wired | `grep -n "tStatus" SubmissionDetailView.tsx` | Lines 77, 82, 84, 86 | PASS |
| SC6 fix — new keys in en.json | `grep "col_location_compliance\|col_approval_rate\|unit_hours" messages/en.json` | 3 matches | PASS |
| SC6 fix — new keys in tr.json | `grep "col_location_compliance\|col_approval_rate\|unit_hours" messages/tr.json` | 3 matches | PASS |
| SC6 fix — key parity (277 each) | python3 key count | EN=277, TR=277 | PASS |

---

### Probe Execution

Step 7c: SKIPPED — no probe scripts exist for this phase (no `scripts/*/tests/probe-*.sh`).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UX-01 | 08-03 | Persistent sidebar navigation on all dashboard pages | SATISFIED | Root `dashboard/layout.tsx` wraps ALL routes in SidebarProvider + AppSidebar; no project files modified |
| UX-02 | 08-02, 08-04 | Cross-project Overview with portfolio KPIs | SATISFIED | `getPortfolioKPIs` + overview page with 4 KPI cards confirmed |
| UX-03 | 08-04, 08-05 | Global filters (date range, project, person, status) scope all analytics views | SATISFIED | FilterBar with URL param persistence wired to overview, people, records pages |
| UX-04 | 08-02, 08-04 | Trend charts (throughput, earned value, rejection rate over time) | SATISFIED | `getPortfolioTrends` with Istanbul-tz weekly/monthly bucketing; `TrendChartsClient` with 3 charts |
| UX-05 | 08-02, 08-06 | Metric drill-downs to filtered records; structured submission detail view | SATISFIED (partial) | Records list + detail page wired; drill-down links confirmed; Google Maps link absent (known deviation, todo logged) |
| PERF-04 | 08-02, 08-05 | Per-employee profile page with metrics, activity timeline, value contribution | SATISFIED | `people/[personId]/page.tsx` with KPI cards, ActivityTimeline for both worker+auditor roles; CR-02 fix corrects auditor approval rate |
| I18N-03 | 08-01 | All new v2.0 dashboard surfaces localized TR/EN | SATISFIED | All previously hardcoded Turkish strings replaced by commit e58b6d3: `t('col_location_compliance')`, `t('col_approval_rate')`, `t('unit_hours')`, `tTimeline('heading')`, `tStatus('status_approved/rejected/pending')`. 277 keys in each locale, full parity. |

---

### Anti-Patterns Found

No hardcoded user-facing Turkish strings remain on any new admin surface. The 5 patterns flagged in the initial verification were all resolved by commit e58b6d3.

`ActivityTimeline.tsx` line 24 contains `"2.3 sa" / "2.3 h"` in a JSDoc comment — this is documentation, not rendered text. Not a flag.

No `TBD`, `FIXME`, or `XXX` debt markers found in any Phase 8 modified files.

---

### Human Verification Required

#### 1. Sidebar Renders on All Dashboard Pages

**Test:** Open the dashboard in a browser while signed in. Visit `/dashboard` (confirm redirect to `/dashboard/overview`), then navigate to `/dashboard/projects` and any `/dashboard/projects/[id]` page.
**Expected:** The sidebar with 6 items (Overview, Projects, People, Analytics, Hakkediş, Exports) appears on ALL these pages. The active nav item is highlighted (Overview on /overview, Projects on /projects/[id]).
**Why human:** Client-side sidebar render and route-aware active state require browser.

#### 2. Existing Project Tab Functionality Intact

**Test:** On a `/dashboard/projects/[id]` page, interact with the BOQ, Rota, and Kayıtlar tabs. Confirm they all load data correctly.
**Expected:** No existing project functionality broken by the sidebar shell (D-64: no project page files modified).
**Why human:** Tab switching and data loading require browser interaction.

#### 3. SC6 Fix — Locale Switch on People Profile (I18N-03 Confirmed)

**Test:** Switch the dashboard locale from TR to EN. Navigate to `/dashboard/people/[any-person-id]`.
**Expected:** "Location Compliance" (not "Konum Uyumu"), "Approval Rate" (not "Onay Oranı"), "Activity" (not "Aktivite"), and "X.X h" (not "X.X sa") all render correctly in EN locale. All other profile page text also in English.
**Why human:** Locale switch requires browser interaction to visually confirm the fix.

#### 4. SC6 Fix — Locale Switch on Submission Detail (I18N-03 Confirmed)

**Test:** On a submission detail page (`/dashboard/records/[any-id]`), toggle locale TR → EN.
**Expected:** Status badge shows "Approved"/"Rejected"/"Pending" in EN locale (not "Onaylandı"/"Reddedildi"/"Bekliyor"). All other detail page text also in English.
**Why human:** Requires browser and a real submission record; visual inspection needed.

#### 5. Metric Drill-Down Flow (UX-05)

**Test:** On the Overview page, click the "Approvals" KPI card number. Confirm it navigates to `/dashboard/records?status=approved`. Verify the records list shows only approved submissions.
**Expected:** Filter is applied correctly; URL contains `status=approved`; data is filtered.
**Why human:** Filter state and data display require browser and real DB data.

#### 6. Mobile Responsive Navigation

**Test:** Narrow the browser viewport below 768px. Confirm the sidebar collapses to a hamburger button in the top nav (via `<SidebarTrigger className="md:hidden">`). Tap it to confirm the sidebar drawer opens.
**Expected:** Mobile hamburger present; drawer opens on tap.
**Why human:** Responsive layout requires viewport manipulation.

#### 7. URL Filter Persistence Across Navigation

**Test:** On the Overview page, set a date range filter and project filter. Navigate to People and back to Overview.
**Expected:** URL query params persist the filter state across navigation (D-73).
**Why human:** Cross-page URL state persistence requires browser navigation.

#### 8. Currency Selector on Overview

**Test:** On the Overview page, change the currency selector from TRY to another currency (if available). Confirm the EV table updates to show values in the selected currency.
**Expected:** Page-local currency state governs money display; currency selector is functional.
**Why human:** Client-side state change and data display require browser.

---

## Gaps Summary

No blocking gaps. All code-verifiable must-haves are now fully met (6/6).

The sole open item from initial verification — 4 hardcoded Turkish strings on new admin surfaces (SC6/I18N-03) — was fixed in commit `e58b6d3`. All remaining open items are browser-only human verification tasks.

The accepted deviation (no Google Maps link in submission detail because `CanonicalSubmission` carries no raw lat/lon) remains; follow-up todo is logged at `.planning/todos/pending/submission-detail-map-link.md`.

---

_Verified: 2026-05-27T00:10:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification of: 2026-05-26T23:45:00Z initial report_
