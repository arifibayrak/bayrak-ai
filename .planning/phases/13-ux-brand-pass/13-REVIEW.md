---
phase: 13-ux-brand-pass
reviewed: 2026-05-29T00:00:00Z
depth: standard
files_reviewed: 51
files_reviewed_list:
  - messages/en.json
  - messages/tr.json
  - src/app/auth/error/page.tsx
  - src/app/auth/signin/page.tsx
  - src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx
  - src/app/dashboard/(admin)/analytics/page.tsx
  - src/app/dashboard/(admin)/exports/page.tsx
  - src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx
  - src/app/dashboard/(admin)/hakedis/page.tsx
  - src/app/dashboard/(admin)/overview/EVTableClient.tsx
  - src/app/dashboard/(admin)/overview/page.tsx
  - src/app/dashboard/(admin)/people/[personId]/page.tsx
  - src/app/dashboard/(admin)/people/page.tsx
  - src/app/dashboard/(admin)/settings/page.tsx
  - src/app/dashboard/projects/[id]/edit/page.tsx
  - src/app/dashboard/projects/[id]/page.tsx
  - src/app/dashboard/projects/loading.tsx
  - src/app/dashboard/projects/new/page.tsx
  - src/app/dashboard/projects/page.tsx
  - src/app/dashboard/records/[id]/page.tsx
  - src/app/dashboard/records/page.tsx
  - src/app/error.tsx
  - src/app/globals.css
  - src/app/icon.tsx
  - src/app/layout.tsx
  - src/app/not-found.tsx
  - src/app/opengraph-image.tsx
  - src/app/page.tsx
  - src/components/admin/ActivityTimeline.tsx
  - src/components/admin/AppSidebar.tsx
  - src/components/admin/DeletePeriodDialog.tsx
  - src/components/admin/FilterBar.tsx
  - src/components/admin/FinalizeDialog.tsx
  - src/components/admin/HakedisCreateDialog.tsx
  - src/components/admin/HakedisStatusBadge.tsx
  - src/components/admin/KpiCard.tsx
  - src/components/admin/LineSubmissionsPanel.tsx
  - src/components/admin/LivePeriodPoller.tsx
  - src/components/admin/PeriodDetailControls.tsx
  - src/components/admin/SubmissionDetailView.tsx
  - src/components/admin/ThresholdSettingsForm.tsx
  - src/components/admin/TrendChartsClient.tsx
  - src/components/brand/BrandBadge.tsx
  - src/components/brand/BrandButton.test.tsx
  - src/components/brand/BrandButton.tsx
  - src/components/brand/BrandCard.tsx
  - src/components/brand/BrandEmpty.tsx
  - src/components/brand/BrandHeading.tsx
  - src/components/brand/BrandLogo.test.tsx
  - src/components/brand/BrandLogo.tsx
  - src/components/brand/BrandTable.tsx
  - src/components/brand/index.ts
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-05-29T00:00:00Z
**Depth:** standard
**Files Reviewed:** 51
**Status:** issues_found

## Summary

This phase is a UX / brand-spine pass: a new `@/components/brand/*` primitive layer (BrandButton, BrandCard, BrandBadge, BrandHeading, BrandEmpty, BrandLogo, BrandTable), brand tokens in `globals.css`, OG/favicon image routes, a re-skinned marketing landing + auth surfaces, and re-skinning of every admin dashboard surface and admin component.

The brand-primitive layer itself is clean and internally consistent. The `render={<Link/>}` slot usage validated correctly against base-ui Button 1.5.0 (`BaseUIComponentProps` exposes `render`), so the polymorphic-link pattern is sound. next-intl 4.12 `useTranslations` is dual-bound (server + client), so several server-rendered `useTranslations` calls are legitimate. i18n key parity between `messages/en.json` and `messages/tr.json` is exact (465 keys each, zero missing on either side).

The principal correctness concern is a security/auth-routing defect in the auth-error surface (CR-01): the access-denied vs. verification branch was collapsed during the re-skin so both ternary arms render identical copy, silently dropping the verification-error message path. Remaining findings are quality/maintainability defects introduced by the brand pass (dead props, unused imports, no-op warning-suppression hacks, brittle status casts).

No SQL injection, XSS, command injection, hardcoded secret, or data-loss defect was found in the reviewed diff. Tenant-scoping and `auth()` guards in the touched RSC pages are intact and were not regressed by the re-skin.

## Critical Issues

### CR-01: Auth-error page collapses both error branches to identical copy — verification-failure path silently lost

**File:** `src/app/auth/error/page.tsx:24-33`
**Issue:** The component computes a branch discriminator:

```tsx
const isAccessDenied =
  !errorType || errorType === 'AccessDenied' || errorType === 'Verification';
...
description={isAccessDenied ? t('error_not_allowed') : t('error_not_allowed')}
```

Both arms of the ternary resolve to the *same* key `t('error_not_allowed')`, so `isAccessDenied` is dead — every Auth.js error (`Configuration`, `OAuthSignin`, `EmailSignin`, expired/used magic-link `Verification`, etc.) renders the "this email is not authorized, contact your administrator" message. A user who clicks an **expired or already-used magic link** (`Verification` error) is told their address is *unauthorized* — a misleading message that will generate false "I can't log in / am I blocked?" support load and masks the real cause (link expiry → just request a new one). This is an auth-flow correctness defect: the error surface no longer distinguishes "not on the allowlist" from "link expired/invalid," which are different user remediations. The comment on line 22-23 still claims the parsing is "preserved verbatim," but the rendering branch was flattened.

Note also the misleading comment on line 18 (`// Client component for i18n translations`) — `AuthErrorContent` is NOT a client component (no `'use client'`); it renders as a server function. It works because next-intl `useTranslations` is server-bound, but the comment should be corrected to avoid a future maintainer "fixing" it by adding `'use client'` (which would then break the `async` server-component parent boundary semantics).

**Fix:** Restore a distinct message for the non-access-denied branch (add a `meta`/`auth.signin` key such as `error_link_invalid`) and wire both `en.json` + `tr.json`:

```tsx
const isAccessDenied =
  !errorType || errorType === 'AccessDenied';
...
description={isAccessDenied ? t('error_not_allowed') : t('error_link_invalid')}
```

Add to both message files under `auth.signin`:
```json
"error_link_invalid": "This sign-in link is invalid or has expired. Request a new one."
```
(TR: `"Bu giriş bağlantısı geçersiz veya süresi dolmuş. Yeni bir bağlantı isteyin."`)
Also fix the stale `// Client component` comment on line 18.

## Warnings

### WR-01: Dead translation props threaded into EVTableClient

**File:** `src/app/dashboard/(admin)/overview/page.tsx:260-261` and `src/app/dashboard/(admin)/overview/EVTableClient.tsx:58-59,72-73`
**Issue:** `OverviewPage` passes `tChartNoData={t('chart_no_data')}` and `tChartThroughput={t('chart_throughput')}` to `EVTableClient`, and `EVTableClient` declares both props (lines 58-59) and destructures them (lines 72-73), but neither is referenced anywhere in the component body. The actual chart copy is sourced inside `TrendChartsClient` via its own `useTranslations('dashboard.admin.overview')`. These props are dead pass-through — a maintenance trap that implies a wiring contract that does not exist.
**Fix:** Remove `tChartNoData` and `tChartThroughput` from `EVTableClientProps`, from the destructure, and from the call site in `overview/page.tsx`.

### WR-02: Unused `ResponsiveContainer` import in TrendChartsClient

**File:** `src/components/admin/TrendChartsClient.tsx:30`
**Issue:** `ResponsiveContainer` is imported from `recharts` but never used — every chart wraps in `ChartContainer` (shadcn) which provides responsive sizing itself. Dead import; will trip a lint `no-unused-vars`/`import/no-unused-modules` rule and ships unnecessary code into the client bundle.
**Fix:** Delete `ResponsiveContainer,` from the recharts import block (lines 24-31).

### WR-03: No-op expression used to suppress an unused-variable warning

**File:** `src/app/dashboard/(admin)/people/[personId]/page.tsx:143,435`
**Issue:** `const workerTotal = workerApproved + workerRejected + workerPending;` (line 143) is consumed only by `{workerTotal > -1 && null}` on line 435 — an always-true comparison that renders `null`. The inline comment even labels it "Suppress unused variable warning." This is a code smell that disguises genuinely dead code as live code; it defeats the linter rather than removing the dead computation, and a future reader cannot tell whether `workerTotal` was meant to be displayed.
**Fix:** Remove the `workerTotal` declaration (line 143) and the `{workerTotal > -1 && null}` JSX (line 435). If `workerTotal` was intended to drive a "total submissions" stat, render it in a real `KpiCard` instead.

### WR-04: Unvalidated `status` string cast to a closed union in three places

**File:** `src/app/dashboard/(admin)/exports/page.tsx:226-233`, `src/app/dashboard/(admin)/hakedis/page.tsx:175`, `src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx:106`
**Issue:** `period.status` (a plain DB string) is cast with `as 'draft' | 'finalized' | 'submitted' | 'paid'` and handed to `HakedisStatusBadge`, whose `STATUS_VARIANT_MAP[status]` lookup (`HakedisStatusBadge.tsx:49`) will return `undefined` for any status value not in the map. If the DB ever holds a status outside the four (migration drift, a new state added server-side, a `cancelled`/`void` value), `BrandBadge` receives `variant={undefined}`, falling through to the `neutral` default silently — and the label lookup `t('status_' + status)` would throw/emit a missing-key marker. The `as` cast asserts a guarantee the data layer does not enforce at this boundary. Records list (`records/page.tsx`) does this correctly via `parseStatus` allowlist (line 43); the hakediş/exports surfaces do not.
**Fix:** Add a guard helper mirroring `parseStatus`, e.g. `function asHakedisStatus(s: string): HakedisStatus | null` returning `null` for unknown values, and render a neutral "unknown" badge (or skip the row) instead of casting. At minimum, make `HakedisStatusBadge` tolerate an unknown status (default to `neutral` + raw string label) rather than relying on the cast being truthful.

### WR-05: `hasMore` pagination uses `>=` instead of `>`, can show a phantom "Load more"

**File:** `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx:123,214`
**Issue:** `const hasMore = entries.length >= limit;` and the render guard `entries.length >= limit` treat "exactly `limit` rows returned" as "more pages exist." Unlike `records/page.tsx`, which correctly fetches `PAGE_SIZE + 1` as a lookahead (line 108) and tests `> PAGE_SIZE`, this page fetches exactly `limit` rows with no lookahead. When the total activity count is an exact multiple of the limit (e.g. exactly 50 rows), "Load more" renders, the user clicks it, and the next page (`?limit=150`) returns the same 50 rows with the button now gone — a confusing dead click. `hasMore` (line 123) is also computed but never used (the render uses the inline expression on line 214), so it is additionally dead.
**Fix:** Adopt the lookahead pattern: request `limit + 1` from `getOfficeActivityLog`, slice to `limit` for display, and set `hasMore = fetched.length > limit`. Remove the unused `hasMore` const or use it in the render guard.

### WR-06: `EVTableClient` empty-state and per-currency dash logic can mismatch

**File:** `src/app/dashboard/(admin)/overview/EVTableClient.tsx:78-82,134-137`
**Issue:** The table renders the full empty-state card only when `hasAnyProjectData` is false — i.e. when NO project has data in the selected currency (lines 78-82). But when at least one project has data, every project row is still rendered, and projects without data for the selected currency fall into the `!hasCurrencyData` dash branch (line 137). This is internally consistent, but the empty-state heuristic uses `!== undefined` on the currency-keyed maps while the row-level branch uses the same check independently — if `contractedValueByCurrency[currency]` is present but holds an empty string or `"0"`, `formatMoney` returns `—` (line 30-31) yet `hasCurrencyData` is `true`, so the row shows two em-dashes with a populated progress cell suppressed. The display is not wrong, but "has a key" vs "has a usable value" are conflated, producing rows that look like data-bearing rows rendering all dashes.
**Fix:** Centralize the "does this project have a usable value in `currency`" predicate into one helper (e.g. `hasUsableCurrencyData(project, currency)` that parses the value and rejects `NaN`/empty) and use it for both the page-level empty state and the per-row branch, so the two checks cannot diverge.

## Info

### IN-01: Misleading "Client component" comment on a server function

**File:** `src/app/auth/error/page.tsx:18`
**Issue:** `// Client component for i18n translations` labels `AuthErrorContent`, which has no `'use client'` and runs server-side. Covered remediation-wise under CR-01; flagged separately as a documentation defect that invites an incorrect "fix."
**Fix:** Change to `// Server component — next-intl useTranslations is server-bound in next-intl v4`.

### IN-02: `opengraph-image.tsx` pins `runtime = "edge"` while the rest of the app defaults to Node

**File:** `src/app/opengraph-image.tsx:14`
**Issue:** `export const runtime = "edge";` This is valid for `next/og` ImageResponse, but it is the only edge-runtime route in the reviewed set and the project CLAUDE.md / Next.js skill guidance defaults to the Node runtime. Edge is acceptable here (OG generation is self-contained, no DB/`pg` usage), but the divergence is undocumented. `icon.tsx` (also `next/og`) does NOT pin edge, so the two image routes are inconsistent.
**Fix:** Either drop the `runtime = "edge"` line (let it default, matching `icon.tsx`) or add a one-line comment justifying edge for OG generation and align `icon.tsx` for consistency.

### IN-03: `BrandTable` is an untyped plain-object namespace, not a typed compound

**File:** `src/components/brand/BrandTable.tsx:25-33`
**Issue:** `BrandTable` is `{ Root, Header, ... }` re-exporting shadcn primitives with no exported prop types and no JSDoc on individual members. The file documents it as an intentional thin wrapper (W1), so this is acceptable as-designed, but consumers get no IntelliSense for which sub-members exist beyond reading the source, and there is no compile-time guard that all shadcn table members are surfaced.
**Fix:** (Optional, deferred per the file's own note.) When density bake-in lands, convert to `Object.assign(Root, { Header, ... })` like `BrandCard` so `BrandTable.Root` carries the underlying `Table` type and members are discoverable.

### IN-04: Hardcoded Turkish aria-labels in a TR/EN-switchable app

**File:** `src/app/dashboard/(admin)/exports/page.tsx:243,256`
**Issue:** `aria-label={`Excel İndir — ${period.periodNumber}`}` and `aria-label={`PDF İndir — ${period.periodNumber}`}` are hardcoded Turkish strings on the download anchors, while the surrounding UI is i18n-driven via `t(...)`. CLAUDE.md mandates a TR/EN-switchable dashboard; an EN-locale user gets Turkish screen-reader labels here. `DeletePeriodDialog` (line 85) and the OE scorecard already use either `t(...)` or English literals, so the convention is inconsistent.
**Fix:** Route these aria-labels through `t(...)` (e.g. `t('picker_excel_download_aria', { period: period.periodNumber })`) and add the keys to both message files.

### IN-05: `EVTableClient` defaults currency to `'TRY'` without verifying it exists in the data

**File:** `src/app/dashboard/(admin)/overview/EVTableClient.tsx:75`
**Issue:** `const [currency, setCurrency] = useState('TRY');` hardcodes the initial currency. `overview/page.tsx` always injects `'TRY'` into `availableCurrencies` (line 161), so the selector always offers it, but if a tenant's portfolio has no TRY data at all, the table opens on the full empty-state even though USD/EUR data exists, until the user manually switches. Minor UX papercut, not a correctness bug.
**Fix:** Default `useState` to `availableCurrencies[0] ?? 'TRY'` so the table opens on a currency that actually has data when TRY is absent.

---

_Reviewed: 2026-05-29T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
