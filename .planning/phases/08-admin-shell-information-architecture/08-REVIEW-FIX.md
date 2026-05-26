---
phase: 08-admin-shell-information-architecture
fixed_at: 2026-05-26T23:22:00Z
review_path: .planning/phases/08-admin-shell-information-architecture/08-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 08: Code Review Fix Report

**Fixed at:** 2026-05-26T23:22:00Z
**Source review:** `.planning/phases/08-admin-shell-information-architecture/08-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (CR-01, CR-02, WR-01, WR-02, WR-03, WR-04, WR-05, plus coupled IN-05)
- Fixed: 7 (CR-01+IN-05 committed together; CR-02+WR-03 committed together)
- Skipped: 0

**Verification:** `SKIP_ENV_VALIDATION=1 npx tsc --noEmit` — 0 errors. `SKIP_ENV_VALIDATION=1 npx vitest run` — 16 test files, 237 tests, all passed.

---

## Fixed Issues

### CR-01 + IN-05: Path traversal in i18n locale loader; test assertion inverted

**Files modified:** `src/i18n/request.ts`, `tests/i18n.test.ts`
**Commit:** `571f524`
**Applied fix:** Added a `SUPPORTED_LOCALES` allowlist (`['tr', 'en']`) and `isSupportedLocale()` type guard to `src/i18n/request.ts`. The raw cookie value is now validated before use in the dynamic `import()` path — unknown/malicious values fall back to `'tr'`. Updated `tests/i18n.test.ts` to mirror the new allowlist logic in its `resolveLocale` helper and inverted the previously-passing "unknown locale passes through" assertion to assert that unknown locales (e.g. `'xx'`, `'../../etc/passwd'`) now correctly return `'tr'`.

---

### CR-02 + WR-03: Auditor approval rate used wrong numerator; rejection-rate rendered "—%"

**Files modified:** `src/app/dashboard/(admin)/people/[personId]/page.tsx`
**Commit:** `0ff0d52`
**Applied fix (CR-02):** Replaced `auditorMetrics.submissionsApproved` (which counted the person's own worker submissions approved) with `auditorDecisions.filter(d => d.status === 'approved').length`, correctly counting decisions this person made as an auditor. The `auditorDecisions` array was already fetched on the page.
**Applied fix (WR-03):** Renamed `workerRejectionRate` to `workerRejectionRateLabel` and folded the `%` suffix into the computed string (present only when the rate is a real number, omitted when the value is `'—'`). Updated the JSX `subLabel` prop from `` `${workerRejectionRate}%` `` to `{workerRejectionRateLabel}`.

---

### WR-01: Date-filtered sub-label showed "filtered" when only one date was set

**Files modified:** `src/app/dashboard/(admin)/overview/page.tsx`
**Commit:** `ff49370`
**Applied fix:** Replaced `const dateSubLabel = (from || to) ? t('kpi_sub_filtered') : t('kpi_sub_all_time')` with `const isDateFiltered = !!(validatedFrom && validatedTo)` / `const dateSubLabel = isDateFiltered ? t('kpi_sub_filtered') : t('kpi_sub_all_time')`. This aligns the UI label to the actual query behavior in `analytics.ts` (line 323), which only applies a date range when both `from` AND `to` are present.

---

### WR-02: SidebarNav used native `<a>` causing full-page reloads

**Files modified:** `src/components/admin/SidebarNav.tsx`
**Commit:** `8a48253`
**Applied fix:** Added `import Link from 'next/link'` and replaced `<a href={item.href} .../>` with `<Link href={item.href} .../>` in the `render` prop of `SidebarMenuButton`. Active-state detection (`isActive`, `aria-current`) is preserved unchanged.

---

### WR-04: Dead props `tChartEV`, `tChartRejection`, `currencyLabel` in EVTableClient

**Files modified:** `src/app/dashboard/(admin)/overview/EVTableClient.tsx`, `src/app/dashboard/(admin)/overview/page.tsx`
**Commit:** `acf55ff`
**Applied fix:** Removed `tChartEV: string`, `tChartRejection: string`, and `currencyLabel: string` from `EVTableClientProps` and the function destructuring. Removed the corresponding props (`tChartEV={t('chart_earned_value')}`, `tChartRejection={t('chart_rejection_rate')}`, `currencyLabel=""`) from the `<EVTableClient>` call in `overview/page.tsx`. `TrendChartsClient` fetches its own translations independently via `useTranslations`, so these were genuinely unused.

---

### WR-05: Pagination indicator fabricated a false total ("Page N of N+1")

**Files modified:** `src/app/dashboard/records/page.tsx`, `messages/en.json`, `messages/tr.json`
**Commit:** `71fd4e1`
**Applied fix:** Added a new i18n key `pagination_page_only` (`"Page {page}"` / `"Sayfa {page}"`) to both message catalogs. Changed the pagination display from `t('records.pagination', { page: pageNum, pages: hasNextPage ? pageNum + 1 : pageNum })` to `t('records.pagination_page_only', { page: pageNum })`. The existing prev/next link enabled/disabled state already communicates whether more pages exist, so the fabricated total is no longer needed.

---

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-05-26T23:22:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
