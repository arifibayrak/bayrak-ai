---
phase: 10-hakkedi-billing
reviewed: 2026-05-28T00:00:00Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - src/db/schema/hakedis-periods.ts
  - src/db/schema/hakedis-period-lines.ts
  - src/db/schema/office-activity-log.ts
  - src/db/migrations/0008_v2_hakedis_deductions.sql
  - src/actions/hakedis.ts
  - src/components/admin/HakedisStatusBadge.tsx
  - src/components/admin/HakedisCreateDialog.tsx
  - src/components/admin/DeletePeriodDialog.tsx
  - src/components/admin/HakedisProjectFilter.tsx
  - src/components/admin/FinalizeDialog.tsx
  - src/components/admin/PeriodDetailControls.tsx
  - src/app/dashboard/(admin)/hakedis/page.tsx
  - src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx
  - src/components/ui/switch.tsx
  - src/lib/leaderboard-sort.ts
  - src/lib/currencies.ts
  - messages/en.json
  - messages/tr.json
findings:
  critical: 2
  warning: 6
  info: 4
  total: 12
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-05-28
**Depth:** deep
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Phase 10 ships the hakkediş billing surface end-to-end. The financial core in `hakedis.ts` is architecturally sound: all arithmetic stays in Postgres `numeric`, the D-90 deduction chain is correctly implemented, the immutability lock (`status != 'draft'`) is consistently enforced across `recomputePeriodLines`, `finalizePeriod`, and `deletePeriod`, the VALID_TRANSITIONS table correctly blocks draft→submitted and paid→anything, and the DISTINCT ON previous-cumulative query is correctly ordered. The 28-test integration suite exercises all critical paths.

Two critical findings were identified: a money-display float violation in the period list page (uses `Number()` instead of `decimal.js`), and a missing i18n + display mapping for the newly-added `hakedis_period_deleted` activity log action. Six warnings cover: a client-side period-label bypass that makes the server's count-based auto-suggest unreachable, missing Decimal.js usage in formatMoney (two-step conversion), hardcoded Turkish strings in the detail page line-item table headers (not i18n'd), a wrong `aria-label` on the project filter select trigger, and two cases of `recomputePeriodLines` performing redundant auth/DB round-trips when called from `createPeriod`.

---

## Critical Issues

### CR-01: Money Display Float Violation — `Number()` on netByDisplay in List Page

**File:** `src/app/dashboard/(admin)/hakedis/page.tsx:177`

**Issue:** The period list page uses `Number(period.netByDisplay).toLocaleString(...)` to format the Net Ödeme column. `Number()` passes through JavaScript's IEEE-754 double-precision float, which can corrupt large Turkish lira amounts. Per project rule (CLAUDE.md, UI-SPEC Money Display Rules §3), all monetary display must use `decimal.js` — `new Decimal(value).toFixed(2)` — never `parseFloat` or `Number()` on a money string. The detail page correctly uses `formatMoney()` with `new Decimal()`. The list page does not.

For amounts exceeding ~15 significant digits, `Number()` will silently round. Even for smaller amounts, the inconsistency between the list page (raw JS float) and the detail page (Decimal.js) violates the project's money-math lock and makes the list column untrustworthy.

**Fix:**
```tsx
// At the top of hakedis/page.tsx (or in a shared utility):
import Decimal from 'decimal.js';

// Replace line 176-181:
{period.netByDisplay != null
  ? (() => {
      try {
        const localeTag = /* pass locale from server */ 'tr-TR'; // or make locale available
        return new Decimal(period.netByDisplay)
          .toFixed(2)
          .replace(/\B(?=(\d{3})+(?!\d))/g, '.');  // or use toLocaleString on the string result
      } catch { return '—'; }
    })()
  : '—'}

// Simpler: extract the same formatMoney helper from [periodId]/page.tsx into a shared lib
// and call it here with locale passed from the RSC (getLocale()).
```

---

### CR-02: `hakedis_period_deleted` Action Type Missing from OE Scorecard Display Map and i18n

**File:** `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx:52-69` + `messages/en.json` + `messages/tr.json`

**Issue:** `office-activity-log.ts` now includes `hakedis_period_deleted` in `OFFICE_ACTION_TYPES` (line 23). `deletePeriod()` in `hakedis.ts` logs this action type. However:

1. The `actionTypeToKey()` mapping function in the OE Scorecard page (line 52–69) has no entry for `hakedis_period_deleted` — it falls through to `'action_unknown'`, showing "Administrative action" / "Yönetim eylemi" instead of a meaningful description.
2. Neither `messages/en.json` nor `messages/tr.json` contain an `action_hakedis_period_deleted` key under `dashboard.admin.oe_scorecard`.

When an office engineer deletes a draft period, the activity log shows "Administrative action" in the OE profile — providing no audit trail for what actually happened. This is a data integrity / auditability gap for legally-significant financial events (D-97 requires the log to be meaningful).

**Fix:**

In `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx`, add to the `map` object:
```typescript
hakedis_period_deleted: 'action_hakedis_period_deleted',
```

In `messages/en.json` under `dashboard.admin.oe_scorecard`:
```json
"action_hakedis_period_deleted": "Deleted hakkediş period"
```

In `messages/tr.json` under `dashboard.admin.oe_scorecard`:
```json
"action_hakedis_period_deleted": "Hakkediş dönemini sildi"
```

---

## Warnings

### WR-01: formatMoney Uses `Number()` as an Intermediate Step — Breaks for Very Large Values

**File:** `src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx:63-69`

**Issue:** `formatMoney()` correctly uses `new Decimal(value).toFixed(2)` to produce a fixed-precision string, but then immediately casts it back to a JS float with `Number(formatted).toLocaleString(...)` for locale formatting. For values above 2^53 (approximately 9 quadrillion), `Number()` will silently lose precision. While this is unlikely to be hit in practice for a single period, the pattern violates the project's money-math rule — the purpose of using `Decimal.toFixed()` first is to avoid the float domain entirely. The locale formatting step re-introduces it.

**Fix:**
```typescript
// Replace:
const formatted = new Decimal(value).toFixed(2);
const localeStr = Number(formatted).toLocaleString(localeTag, { ... });

// With: format directly without re-entering JS float land.
// Use Intl.NumberFormat with a string-compatible approach:
const parts = new Decimal(value).toFixed(2).split('.');
const intPart = parseInt(parts[0], 10).toLocaleString(localeTag);
const localeStr = `${intPart}${localeTag === 'tr-TR' ? ',' : '.'}${parts[1]}`;
```

Or more cleanly, use `decimal.js`'s own `toFormat()` if configured, or keep the two-step but document it as an accepted pattern with a `// safe: value is already rounded to 2dp by Decimal.toFixed` comment. The key risk is values > 2^53, which a Turkish public-works hakkediş could theoretically reach for large projects.

---

### WR-02: Hardcoded Turkish Strings in Line-Item Table Column Headers

**File:** `src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx:216-231`

**Issue:** The seven column headers of the Yeşil Defter line-item table are hardcoded Turkish strings (`Malzeme`, `Birim`, `Birim Fiyat`, `Önceki Kümülatif`, `Kümülatif`, `Dönem Miktarı`, `Dönem Tutarı`) rather than using `t('detail.col_*')` keys. Neither `messages/en.json` nor `messages/tr.json` contains these column header keys under `dashboard.admin.hakedis.detail`. This means the line-item table is not switchable to English, violating the TR/EN i18n contract (CLAUDE.md, UI-SPEC i18n Namespace Contract).

**Fix:** Add keys to both locale files:
```json
// en.json → dashboard.admin.hakedis.detail:
"col_material": "Material",
"col_unit": "Unit",
"col_unit_price": "Unit Price",
"col_prev_cumulative": "Prev. Cumulative",
"col_cumulative": "Cumulative",
"col_period_qty": "Period Qty",
"col_period_value": "Period Value"
```

Then replace the hardcoded strings with `{t('detail.col_material')}` etc.

---

### WR-03: Wrong `aria-label` on Project Filter `<SelectTrigger>` — Labels it as "Period" Not "Project"

**File:** `src/components/admin/HakedisProjectFilter.tsx:53`

**Issue:** The `<SelectTrigger>` uses `aria-label={t('col_period')}`, which resolves to "Period" (EN) / "Dönem" (TR). This tells screen readers the select is for choosing a period, when it is actually a project filter. A user navigating by keyboard or screen reader cannot distinguish this from the period rows in the table.

**Fix:**
```tsx
// Add a dedicated i18n key:
// en.json: "project_filter_label": "Filter by project"
// tr.json: "project_filter_label": "Proje filtrele"

<SelectTrigger className="w-[200px]" aria-label={t('project_filter_label')}>
```

---

### WR-04: Client-Side `suggestPeriodLabel()` Bypasses Server-Side COUNT-Based Auto-Numbering

**File:** `src/components/admin/HakedisCreateDialog.tsx:130-136`

**Issue:** When the user leaves the period label blank, the dialog runs:
```ts
const label = periodLabel.trim() || suggestPeriodLabel();
```
`suggestPeriodLabel()` always returns `HK-{currentYear}-01` regardless of how many periods already exist. This value is passed to `createPeriod({ periodNumber: label, ... })` as a non-empty string, so the server's COUNT-based auto-suggest branch (`if (!periodNumber)` at `hakedis.ts:327`) is never reached.

The net effect: every new period created with a blank label receives `HK-2026-01`, producing duplicate period labels when more than one period exists. Since `period_number` has no UNIQUE constraint, this causes silent duplicate labels in the list view — confusing for an office engineer trying to identify periods in the table. This is a logic error in the form.

**Fix:** Either (a) remove the client-side `suggestPeriodLabel()` call and send `periodNumber: undefined` when blank — letting the server's COUNT-based logic run — or (b) have `suggestPeriodLabel()` make an async call to count periods first. Option (a) is simpler and more correct:

```tsx
// In handleSubmit, change:
const label = periodLabel.trim() || suggestPeriodLabel();
// ...
periodNumber: label,

// To:
const trimmedLabel = periodLabel.trim() || undefined; // undefined → server auto-generates
// ...
periodNumber: trimmedLabel,  // undefined passed through, server picks HK-{YYYY}-{NN}
```

Also update the `<Input placeholder={suggestPeriodLabel()}>` to show `HK-{YYYY}-NN` as a hint rather than implying a concrete label.

---

### WR-05: `recomputePeriodLines` Performs Redundant `auth()` + DB Fetch When Called from `createPeriod`

**File:** `src/actions/hakedis.ts:153-284` (called at line 379)

**Issue:** `createPeriod` calls `recomputePeriodLines(periodId)` after inserting the period row. `recomputePeriodLines` is a full exported server action that begins with its own `auth()` call and a DB round-trip to fetch and validate the period. When called internally from `createPeriod`:

1. `auth()` is called a second time (doubles the auth check latency for every period create).
2. The period SELECT is issued again despite `createPeriod` having just inserted the row with known-good values.

This is not a correctness issue but it does mean every period creation incurs two auth() calls and two SELECT queries that could be avoided. The deeper concern: if `auth()` ever becomes stateful or session-invalidating between the outer call and the inner call (unlikely but possible in edge cases), the internal call could fail after the INSERT has committed, leaving an uncomputed period in the DB.

**Fix:** Extract the computation logic into a private `_computeLines(periodId, projectId, currencyCode, periodEndDate, tenantId)` function and call it directly from `createPeriod`, bypassing the auth/fetch preamble. Expose the public `recomputePeriodLines` (which does auth + fetch) only for external callers.

---

### WR-06: `CurrencySelector` Internal State Not Controlled — Resets on Dialog Re-open

**File:** `src/components/admin/CurrencySelector.tsx:32` — used in `src/components/admin/HakedisCreateDialog.tsx:235-238`

**Issue:** `CurrencySelector` manages its own state internally (`useState('TRY')`) and does not accept a `value` prop. The dialog's `resetForm()` calls `setCurrency('TRY')` on the dialog's local state but cannot reset `CurrencySelector`'s internal state. If a user:
1. Opens the dialog, changes currency to USD.
2. Clicks "Vazgeç" (discard) — the dialog resets its state to `currency = 'TRY'`.
3. Re-opens the dialog — the `CurrencySelector` shows **USD** (its internal state was not reset) while the form's `currency` state is `TRY`.

This causes a visual desync: the `<CurrencySelector>` UI shows USD but the `createPeriod` call sends `currencyCode: 'TRY'`. The period will be created with TRY while the user sees USD selected.

**Fix:** Lift currency state out of `CurrencySelector` into the dialog's own state (which is already done via `const [currency, setCurrency] = useState('TRY')`), and pass a controlled `value` prop to `CurrencySelector`:

```tsx
// CurrencySelector.tsx: accept value prop
interface CurrencySelectorProps {
  availableCurrencies: string[];
  value: string;
  onCurrencyChange: (currency: string) => void;
}

function CurrencySelector({ availableCurrencies, value, onCurrencyChange }: CurrencySelectorProps) {
  // Remove internal useState; use `value` prop directly
  ...
}

// HakedisCreateDialog.tsx:
<CurrencySelector
  availableCurrencies={['TRY', 'USD', 'EUR']}
  value={currency}
  onCurrencyChange={setCurrency}
/>
```

---

## Info

### IN-01: `formatMoney` in Detail Page Uses `locale === 'tr'` Check — Brittle Locale Comparison

**File:** `src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx:65`

**Issue:** The locale comparison `locale === 'tr'` is an exact string match. next-intl locale tags can be `'tr'`, `'tr-TR'`, or other BCP 47 variants depending on configuration. If the locale is ever `'tr-TR'`, the check fails silently and Turkish users see US-format numbers (`12,450.00` instead of `12.450,00`). The project's CLAUDE.md specifies TR/EN switching via next-intl, but does not lock the locale tag to a single value.

**Fix:** Use `locale.startsWith('tr')` or compare against the canonical locale list.

---

### IN-02: `HakedisProjectFilter` `aria-label` Points to Period Column Header, Not "Select Project"

**File:** `src/components/admin/HakedisProjectFilter.tsx:53`

Already addressed as WR-03 above. Noted here as an additional accessibility reference item.

---

### IN-03: Detail Page Line-Item Table Columns for `aria-label` Use Raw Turkish, Not i18n

**File:** `src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx:258`

**Issue:** The `aria-label` on the Birim Fiyat cell is `"Birim Fiyat: {value} {currency}"` — a hardcoded Turkish string. When the EN locale is active, screen reader users hear Turkish even if the UI is in English. Consistent with WR-02 (i18n column headers), these aria-labels should use the same i18n keys once they exist.

**Fix:** Once `detail.col_unit_price` etc. are added per WR-02, update the aria-labels to use `t('detail.col_unit_price')`.

---

### IN-04: Empty `catch {}` Blocks Swallow All Errors Including Network Failures

**File:** `src/components/admin/FinalizeDialog.tsx:57-60`, `DeletePeriodDialog.tsx:66-68`, `PeriodDetailControls.tsx:55-58 & 71-74`

**Issue:** All client-side action handlers use bare `catch { setError(t('form.err_general')) }` — no access to the caught error value, so network errors, auth expiry, and server-side validation errors all render the same generic message. This is consistent with the project pattern elsewhere and is not a bug, but makes debugging harder. The FinalizeDialog is particularly notable: if the server throws the specific "Period is not in draft status" error (defense-in-depth case), it shows the generic error instead of the specific `err_finalize_blocked` message despite that key existing in i18n.

**Fix:** Inspect the caught error in FinalizeDialog to surface the specific message:
```tsx
catch (err) {
  const msg = err instanceof Error ? err.message : '';
  if (msg.includes('not in draft')) {
    setError(t('detail.err_finalize_blocked'));
  } else {
    setError(t('form.err_general'));
  }
}
```

---

## Verification Notes

**Confirmed Correct:**
- All exported server actions call `auth()` as the first statement (T-10-02-EoP).
- All queries include `AND tenant_id = ${tenantId}` (T-10-02-IDOR-P).
- `getPeriodsByProject` uses `WHERE hp.project_id = ${projectId} AND hp.tenant_id = ${tenantId}` — no IDOR gap.
- `recomputePeriodLines` INSERT never supplies `period_qty` — GENERATED column contract honored (D-104).
- Finalize/recompute/delete immutability check is `period.status !== 'draft'` — correct (D-95/D-96).
- VALID_TRANSITIONS table correctly blocks `draft → null` and `paid → null` (D-95).
- Istanbul cutoff expression `(${periodEndDate}::date + interval '1 day') AT TIME ZONE 'Europe/Istanbul'` is semantically correct — includes all of period_end_date in Istanbul local time.
- Previous-cumulative DISTINCT ON query orders by `hpl.boq_item_id, hp.period_end_date DESC` — correctly picks the most recent finalized period per BOQ item (D-99).
- `tevkifat = KDV × tevkifat_fraction` (not `gross × tevkifat_fraction`) — correctly implements D-90.
- COALESCE on nullable `tevkifat_fraction` and `stopaj_rate` is in both `getPeriodDetail` and `getPeriodsByProject`.
- `'use server'` directive at top of `hakedis.ts`; all exports are `type` or `async function` — no sync non-async exports.
- `leaderboard-sort.ts` and `currencies.ts` are correctly extracted into `src/lib/` with no `'use server'` directive.
- Migration 0008 correctly adds the four deduction columns and converts `period_qty` to GENERATED; the CHECK constraint note is accurate.
- `hakedis_period_created`, `hakedis_period_finalized`, and `hakedis_period_deleted` are all in `OFFICE_ACTION_TYPES`.
- i18n parity between `en.json` and `tr.json` for all `dashboard.admin.hakedis.*` keys is confirmed — the missing item (CR-02) is in the adjacent `oe_scorecard` namespace, not the hakedis namespace itself.
- Net Ödeme in detail page uses `text-2xl font-semibold tabular-nums` with `border-t-2 border-foreground` — matches UI-SPEC focal-point typography contract.
- `DialogTitle` and `DialogDescription` are always present in all three dialogs (FinalizeDialog, DeletePeriodDialog, HakedisCreateDialog) — a11y contract met.
- `'Sil / Delete'` button has `aria-label="Delete period {periodNumber}"` in `DeletePeriodDialog`.

---

_Reviewed: 2026-05-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
