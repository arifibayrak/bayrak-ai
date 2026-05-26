---
phase: 08-admin-shell-information-architecture
reviewed: 2026-05-26T00:00:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - messages/en.json
  - messages/tr.json
  - src/actions/analytics.ts
  - src/app/dashboard/(admin)/analytics/page.tsx
  - src/app/dashboard/(admin)/exports/page.tsx
  - src/app/dashboard/(admin)/hakedis/page.tsx
  - src/app/dashboard/(admin)/layout.tsx
  - src/app/dashboard/(admin)/overview/EVTableClient.tsx
  - src/app/dashboard/(admin)/overview/page.tsx
  - src/app/dashboard/(admin)/people/[personId]/page.tsx
  - src/app/dashboard/(admin)/people/page.tsx
  - src/app/dashboard/layout.tsx
  - src/app/dashboard/page.tsx
  - src/app/dashboard/records/[id]/page.tsx
  - src/app/dashboard/records/page.tsx
  - src/components/admin/ActivityTimeline.tsx
  - src/components/admin/AppSidebar.tsx
  - src/components/admin/CurrencySelector.tsx
  - src/components/admin/FilterBar.tsx
  - src/components/admin/KpiCard.tsx
  - src/components/admin/SidebarNav.tsx
  - src/components/admin/SubmissionDetailView.tsx
  - src/components/admin/TrendChartsClient.tsx
  - src/components/dashboard/KayitlarTabClient.tsx
  - src/components/layout/TopNav.tsx
  - src/hooks/use-mobile.ts
  - tests/analytics.test.ts
  - tests/i18n.test.ts
findings:
  critical: 2
  warning: 5
  info: 5
  total: 12
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-05-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

Reviewed the Phase 08 admin shell and information architecture implementation. The analytics query layer is generally sound — tenant scoping is applied on every query, all user-supplied values use bound parameters, money math stays in Postgres, and currency maps are consistently group-separated. The auth guard in `dashboard/layout.tsx` is correct.

Two critical issues were found: a path-traversal vulnerability in the i18n locale loader (not in the files-under-review list but the test file under review acknowledges and dismisses the gap), and a semantic bug in the auditor approval-rate KPI that always shows 0% for any pure auditor. Five warnings address incorrect filter semantics, navigation degradation, and display bugs. Five info items cover hardcoded Turkish strings and dead interface props.

---

## Critical Issues

### CR-01: Path Traversal in i18n Locale Loader via Cookie Value

**File:** `src/i18n/request.ts:11`
**Issue:** The `locale` cookie value is read from the user's browser and used directly as a path segment in a dynamic `import()` call with no allowlist validation:

```ts
const locale = cookieStore.get("locale")?.value ?? "tr";
messages: (await import(`../../messages/${locale}.json`)).default,
```

Any user can set `document.cookie = 'locale=../../tsconfig'` (or any other relative path). Node.js `require()` — which backs dynamic `import()` in server bundles — resolves the path at runtime. The `.json` suffix limits the attack to JSON files, but `tsconfig.json`, `package.json`, and any other JSON file in the project root can be read and its content returned as translation strings, leaking configuration and dependency metadata. With `locale=../../.env` the `.json` suffix would produce a missing-file 500 on every request, enabling a denial-of-service. Next.js bundler analysis does not prevent this because `cookieStore.get(...)` is a runtime value that cannot be statically enumerated.

The test at `tests/i18n.test.ts:53-57` explicitly acknowledges the gap with the comment "caller handles validation" but no caller does.

**Fix:**
```ts
const SUPPORTED_LOCALES = ['tr', 'en'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(v: string | undefined): v is SupportedLocale {
  return SUPPORTED_LOCALES.includes(v as SupportedLocale);
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get("locale")?.value;
  const locale: SupportedLocale = isSupportedLocale(raw) ? raw : 'tr';
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

---

### CR-02: Auditor Approval Rate KPI Uses Worker Submission Count Instead of Decision Count

**File:** `src/app/dashboard/(admin)/people/[personId]/page.tsx:143-146`
**Issue:** The "Onay Oranı" (Approval Rate) KPI for the auditor section is computed as:

```ts
const auditorApprovalRate =
  auditorDecisionsCount > 0
    ? `${(((auditorMetrics?.submissionsApproved ?? 0) / auditorDecisionsCount) * 100).toFixed(1)}%`
    : '—';
```

`auditorMetrics.submissionsApproved` counts submissions **this person made as a worker** (rows where `person_id = personId`), not the decisions they approved as an auditor. For any pure auditor who has never submitted field work themselves, `submissionsApproved` is always 0, producing an approval rate of 0% regardless of how many submissions they actually approved.

The correct numerator is the count of decisions with `status = 'approved'` from the auditor's decision history. That data is already fetched in `auditorDecisions` (the `getAuditorDecisions` result).

**Fix:**
```ts
// Compute approved decisions from the already-fetched auditorDecisions array
const auditorApprovedDecisions = auditorDecisions.filter(d => d.status === 'approved').length;
const auditorApprovalRate =
  auditorDecisionsCount > 0
    ? `${((auditorApprovedDecisions / auditorDecisionsCount) * 100).toFixed(1)}%`
    : '—';
```

---

## Warnings

### WR-01: Partial Date Filter Shows "Filtered" Subtitle but KPI Counts Are Unfiltered

**File:** `src/app/dashboard/(admin)/overview/page.tsx:79-83` and `src/actions/analytics.ts:323`
**Issue:** The overview page subtitle and KPI sub-labels display "selected period" (`subtitle_filtered`, `kpi_sub_filtered`) whenever either `from` **or** `to` is present in the URL:

```ts
const hasFilter = !!(from || to || project || person);   // true if EITHER date is set
const dateSubLabel = (from || to) ? t('kpi_sub_filtered') : t('kpi_sub_all_time');
```

However, `getPortfolioKPIs` only applies the date filter when **both** `from` and `to` are present (line 323 in `analytics.ts`):

```ts
const dateCondition = (filters.from && filters.to)
  ? sql` AND s.submitted_at >= ... AND s.submitted_at < ...`
  : sql``;
```

Result: a user who sets only a `from` date sees the subtitle "Portfolio — selected period" and "In selected period" sub-labels on KPIs, but the approval/rejection counts are actually all-time counts. This is a misleading display — the UI claims data is filtered when it is not.

**Fix:** Either apply the partial date filter in `getPortfolioKPIs` (allow open-ended ranges), or adjust the subtitle/sub-label logic to match the actual filter condition:
```ts
const isDateFiltered = !!(validatedFrom && validatedTo);
const dateSubLabel = isDateFiltered ? t('kpi_sub_filtered') : t('kpi_sub_all_time');
```

---

### WR-02: SidebarNav Uses Native `<a>` Tag, Causing Full-Page Reloads on Navigation

**File:** `src/components/admin/SidebarNav.tsx:49-55`
**Issue:** The sidebar navigation renders each item with a native HTML anchor element via the Base UI `render` prop:

```tsx
render={
  <a
    href={item.href}
    aria-current={isActive ? 'page' : undefined}
  />
}
```

A native `<a>` tag triggers a full browser navigation (HTTP request + full HTML parse + hydration) instead of a Next.js client-side route transition. This defeats the SPA navigation model, causes a full page reload on every sidebar click, and discards any in-memory state in the dashboard shell (e.g., sidebar open/closed state).

**Fix:** Use Next.js `Link` in the render prop — Base UI's `render` prop accepts React elements including custom components:
```tsx
import Link from 'next/link';
// ...
render={
  <Link
    href={item.href}
    aria-current={isActive ? 'page' : undefined}
  />
}
```

---

### WR-03: Rejection Rate Sub-Label Renders "—%" When There Are No Decided Submissions

**File:** `src/app/dashboard/(admin)/people/[personId]/page.tsx:208`
**Issue:** `workerRejectionRate` is computed as either a percentage string (`"17.5"`) or `"—"` (em dash):

```ts
const workerRejectionRate =
  workerDecided > 0 ? ((workerRejected / workerDecided) * 100).toFixed(1) : '—';
```

It is then used in:
```tsx
subLabel={`${workerRejectionRate}%`}
```

When `workerDecided === 0`, the sub-label renders as `"—%"` — an em dash with a percent sign, which is nonsensical. The `%` should be omitted when the value is a dash.

**Fix:**
```ts
const workerRejectionRateLabel =
  workerDecided > 0 ? `${((workerRejected / workerDecided) * 100).toFixed(1)}%` : '—';
// then use: subLabel={workerRejectionRateLabel}
```

---

### WR-04: `EVTableClient` Interface Declares Props That Are Never Destructured or Used

**File:** `src/app/dashboard/(admin)/overview/EVTableClient.tsx:67-69` and `src/app/dashboard/(admin)/overview/page.tsx:195`
**Issue:** The `EVTableClientProps` interface declares three props that are never destructured in the component function body and therefore never used:

- `tChartEV: string` (line 67) — the chart earned value label
- `tChartRejection: string` (line 68) — partially destructured at line 84, but never referenced in JSX
- `currencyLabel: string` (line 69) — neither destructured nor used

`TrendChartsClient` fetches its own translations independently via `useTranslations`, so `tChartEV` is genuinely dead. `currencyLabel` is passed as an empty string from the parent (`currencyLabel=""`), making the redundancy doubly obvious.

**Fix:** Remove the unused props from the interface and the corresponding prop passing in `overview/page.tsx`:
```ts
// Remove from EVTableClientProps:
//   tChartEV: string;
//   tChartRejection: string; (if never referenced in JSX — verify tChartRejection usage)
//   currencyLabel: string;

// Remove from overview/page.tsx EVTableClient call:
//   tChartEV={t('chart_earned_value')}
//   currencyLabel=""
```
If `tChartRejection` is intentionally passed for future use, document that explicitly.

---

### WR-05: Pagination Page Count Display Is Misleading for Deep Pages

**File:** `src/app/dashboard/records/page.tsx:252`
**Issue:** The lookahead pagination strategy shows at most `pageNum + 1` as the total pages:

```ts
{t('records.pagination', { page: pageNum, pages: hasNextPage ? pageNum + 1 : pageNum })}
```

On page 1 with 1000 total records (40 pages at PAGE_SIZE=25), the user sees "Page 1 of 2". On page 2 it shows "Page 2 of 3". On page 39 it shows "Page 39 of 40". The display is only accurate on the last page. This is actively misleading to users who believe they are near the end of results when they are on page 1 of 40.

**Fix (no COUNT query required):** Change the display to not claim a total when it cannot be known:
```ts
// Pattern: "Page 3" with "→ Next" enabled/disabled
{t('records.pagination_page_only', { page: pageNum })}
// Add the key to messages: "pagination_page_only": "Page {page}"
```
Or at minimum, use an open-ended indicator: `"Page {page} of {pages}+"` when `hasNextPage` is true:
```ts
pages: hasNextPage ? `${pageNum + 1}+` : pageNum
```

---

## Info

### IN-01: Multiple Hardcoded Turkish Strings in Person Profile Page (Not i18n)

**File:** `src/app/dashboard/(admin)/people/[personId]/page.tsx:214, 248, 278`
**Issue:** Three UI labels bypass the i18n system and are hardcoded in Turkish, breaking EN locale:

- Line 214: `label="Konum Uyumu"` ("Location Compliance") — KPI card label
- Line 248: `label="Onay Oranı"` ("Approval Rate") — KPI card label
- Line 278: `Aktivite` ("Activity") — section heading (comment acknowledges this: "key is not in en.json, use a literal")

These render as Turkish text even when the user has selected the EN locale.

**Fix:** Add the missing keys to both `messages/en.json` and `messages/tr.json`, then use `t(key)`:
```json
// en.json — dashboard.admin.people
"kpi_location_compliance": "Location Compliance",
"kpi_approval_rate": "Approval Rate"

// en.json — dashboard.admin.timeline  
"heading": "Activity"
```

---

### IN-02: Hardcoded Turkish Status Labels in `SubmissionDetailView`

**File:** `src/components/admin/SubmissionDetailView.tsx:82-85`
**Issue:** Status labels are hardcoded in Turkish:

```ts
const statusLabel =
  submission.status === 'approved' ? 'Onaylandı' :
  submission.status === 'rejected' ? 'Reddedildi' : 'Bekliyor';
```

Existing i18n keys for these labels already exist in `dashboard.submissions` (`status_approved`, `status_rejected`, `status_pending`), making this duplication unnecessary.

**Fix:**
```ts
const t = useTranslations('dashboard.submissions');
const statusLabel =
  submission.status === 'approved' ? t('status_approved') :
  submission.status === 'rejected' ? t('status_rejected') :
  t('status_pending');
```

---

### IN-03: Hardcoded `'sa'` (Turkish Hours Abbreviation) in Auditor Timeline Display

**File:** `src/app/dashboard/(admin)/people/[personId]/page.tsx:120, 150`
**Issue:** The audit latency display hard-codes the Turkish abbreviation for hours (`sa`):

```ts
// Line 120
d.auditLatencyHours !== null ? `${d.auditLatencyHours.toFixed(1)} sa` : undefined,
// Line 150
? `${(auditorMetrics.avgDecisionLatencyHours ?? 0).toFixed(1)} sa`
```

In EN locale this should display `"2.3 h"` or `"2.3 hrs"`, not `"2.3 sa"`.

**Fix:** Add a `hours_abbrev` key to both message catalogs and use it:
```json
// tr.json: "hours_abbrev": "sa"
// en.json: "hours_abbrev": "h"
```

---

### IN-04: `CurrencySelector` Internal State Is Not Synchronized with Parent Initial Value

**File:** `src/components/admin/CurrencySelector.tsx:32`
**Issue:** `CurrencySelector` has its own internal `useState('TRY')`, independent of any `initialValue` prop. The parent `EVTableClient` also starts at `'TRY'`. If the `availableCurrencies` list does not contain `'TRY'` (e.g., a project with only USD BOQ items), the selector displays `TRY` selected but no matching item in the dropdown, rendering the selector in an inconsistent state until the user manually changes the currency.

This is not a crash but a UX defect for non-TRY projects.

**Fix:** Accept a `defaultCurrency` prop and initialize state from it:
```tsx
interface CurrencySelectorProps {
  availableCurrencies: string[];
  defaultCurrency?: string;
  onCurrencyChange: (currency: string) => void;
}

const [selected, setSelected] = useState(defaultCurrency ?? 'TRY');
```
And in `EVTableClient`, derive the default from `availableCurrencies[0]` when TRY is absent.

---

### IN-05: `i18n.test.ts` Test Explicitly Accepts Arbitrary Locale Passthrough Without Enforcing Validation

**File:** `tests/i18n.test.ts:53-57`
**Issue:** The test documents the missing locale validation as intentional "caller responsibility" but no caller validates it. The test asserts `resolveLocale('xx') === 'xx'`, which confirms that arbitrary cookie values flow through without rejection. This test assertion should be inverted once the allowlist validation in `src/i18n/request.ts` is added (see CR-01). The current test would then become a false safety signal.

**Fix:** After fixing CR-01, update this test:
```ts
it('rejects unknown locale values and falls back to tr', () => {
  expect(resolveLocale('xx')).toBe('tr');
  expect(resolveLocale('../../etc/passwd')).toBe('tr');
});
```

---

_Reviewed: 2026-05-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
