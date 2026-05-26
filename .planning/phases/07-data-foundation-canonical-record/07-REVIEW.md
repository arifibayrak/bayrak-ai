---
phase: 07-data-foundation-canonical-record
reviewed: 2026-05-26T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - src/actions/analytics.ts
  - src/actions/boq.ts
  - src/actions/projects.ts
  - src/actions/people.ts
  - src/actions/routes.ts
  - src/components/dashboard/BoqItemDialog.tsx
  - src/components/dashboard/BoqTable.tsx
  - src/db/schema/boq-items.ts
  - src/db/schema/office-activity-log.ts
  - src/db/schema/hakedis-periods.ts
  - src/db/schema/hakedis-period-lines.ts
  - src/db/schema/index.ts
  - src/lib/boq-value.ts
  - src/lib/log-office-activity.ts
  - src/lib/types/canonical-submission.ts
  - src/lib/types/index.ts
  - src/db/migrations/0004_v2_data_foundation.sql
  - src/db/migrations/0005_v2_indexes.sql
findings:
  critical: 5
  warning: 5
  info: 2
  total: 12
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-05-26
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

This is a financial/analytics data-foundation phase. The core primitives — Postgres numeric arithmetic, currency-grouped returns, `after()`-based non-blocking logging, `office_activity_log.actor_user_id` FK targeting `users.id`, and the migration CHECK constraint — are correctly designed. However, there are five BLOCKER-level defects: two produce systematically wrong financial numbers, two are SQL-injection surfaces in server actions, and one means every activity-log write silently fails at the DB level due to an empty-string FK violation.

---

## Critical Issues

### CR-01: BAC Grossly Over-Counted in `getProjectMetrics` — Wrong Financial Number

**File:** `src/actions/analytics.ts:262-277`

**Issue:** The BAC (Budget at Completion) query drives from `submissions s` and then joins `boq_items b ON b.id = s.boq_item_id`. The aggregate `SUM(b.planned_qty::numeric * b.unit_price::numeric)` therefore sums the same BOQ item's `planned_qty * unit_price` once for **every submission** that references that item. If a project has 50 submissions against one BOQ item, BAC is reported as 50× the correct value. This is the canonical "fan-out before aggregation" mistake.

The `rework_value` aggregate (`SUM(s.quantity * b.unit_price) FILTER WHERE rejected`) is correct because it sums `s.quantity` (per-submission), but BAC sums `b.planned_qty` (per-BOQ-item) through the wrong base table.

**Fix:** Compute BAC in a separate sub-query that aggregates `boq_items` directly, not through `submissions`:

```sql
-- Replace Query 2 with two separate aggregates:

-- EV + rework: still driven from submissions (correct)
SELECT
  b.currency_code,
  SUM(s.quantity::numeric * b.unit_price::numeric)
    FILTER (WHERE s.status = 'approved' AND b.unit_price IS NOT NULL)  AS earned_value,
  SUM(s.quantity::numeric * b.unit_price::numeric)
    FILTER (WHERE s.status = 'rejected' AND b.unit_price IS NOT NULL)  AS rework_value
FROM submissions s
JOIN boq_items b ON b.id = s.boq_item_id
WHERE s.project_id = ${projectId}
  AND s.tenant_id  = ${tenantId}
  ${dateConditions}
GROUP BY b.currency_code

-- BAC: driven directly from boq_items (NOT through submissions)
SELECT
  currency_code,
  SUM(planned_qty::numeric * unit_price::numeric)
    FILTER (WHERE unit_price IS NOT NULL)  AS bac
FROM boq_items
WHERE project_id = ${projectId}
  AND tenant_id  = ${tenantId}
GROUP BY currency_code
```

---

### CR-02: `getPortfolioOverview` Cross-Join Corrupts Both Counts and Values

**File:** `src/actions/analytics.ts:535-552`

**Issue:** The query performs two independent `LEFT JOIN`s on `projects`:

```sql
FROM projects p
LEFT JOIN submissions s ON s.project_id = p.id AND s.tenant_id = …
LEFT JOIN boq_items   b ON b.project_id = p.id AND b.tenant_id = …
```

Because `submissions` and `boq_items` are not joined to each other, this is a Cartesian product between the two sets for each project. For a project with `S` submissions and `B` BOQ items:
- `COUNT(s.id) FILTER approved` counts S × B rows (each submission appears once per BOQ item).
- `SUM(b.planned_qty * b.unit_price)` sums each BOQ value S times.
- `SUM(b.approved_qty * b.unit_price)` has the same S× fan-out.

This produces completely wrong numbers for every project with more than one submission or BOQ item.

**Fix:** Aggregate each side independently in CTEs, then join to `projects`:

```sql
WITH boq_agg AS (
  SELECT project_id, currency_code,
    SUM(planned_qty::numeric * unit_price::numeric)
      FILTER (WHERE unit_price IS NOT NULL)  AS contracted_value,
    SUM(approved_qty::numeric * unit_price::numeric)
      FILTER (WHERE unit_price IS NOT NULL)  AS earned_value
  FROM boq_items
  WHERE tenant_id = ${tenantId}
  GROUP BY project_id, currency_code
),
sub_agg AS (
  SELECT project_id,
    COUNT(*) FILTER (WHERE status = 'approved')     AS approved_count,
    COUNT(*) FILTER (WHERE status = 'pending_audit') AS pending_count
  FROM submissions
  WHERE tenant_id = ${tenantId}
  GROUP BY project_id
)
SELECT p.id AS project_id, p.name AS project_name,
  ba.currency_code,
  COALESCE(sa.approved_count, 0)  AS approved_count,
  COALESCE(sa.pending_count, 0)   AS pending_count,
  ba.contracted_value,
  ba.earned_value
FROM projects p
LEFT JOIN boq_agg ba ON ba.project_id = p.id
LEFT JOIN sub_agg sa ON sa.project_id = p.id
WHERE p.tenant_id = ${tenantId}
ORDER BY p.name, ba.currency_code
```

---

### CR-03: SQL Injection in `getCanonicalSubmissions` and `getOfficeActivityLog` via `sql.raw(whereClause)`

**File:** `src/actions/analytics.ts:117-136, 175` and `src/actions/analytics.ts:344-359, 376`

**Issue:** Both functions build a raw SQL WHERE clause by string-interpolating caller-supplied values into a `conditions: string[]` array, then pass the joined string to `sql.raw(whereClause)`.

- `filters.projectIds` elements are interpolated directly: `` `s.project_id IN (${ids})` `` where `ids` = `filters.projectIds.map(id => `'${id}'`).join(', ')`. A caller passing `id = "'; DROP TABLE submissions; --"` injects arbitrary SQL.
- `filters.status` is interpolated: `` `s.status = '${filters.status}'` ``. The TypeScript type restricts it to a union, but the Server Action boundary does not enforce types at runtime — a crafted HTTP request can pass any string.
- `filters.personId`, `options.actorUserId`, `options.projectId` are similarly injected verbatim.
- `filters.from.toISOString()` and `filters.to.toISOString()` are date-derived but still interpolated raw.

The `getPersonMetrics` `projectFilter` (lines 417-419) has the same pattern.

**Fix:** Replace string-concatenation conditions with Drizzle parameterized SQL fragments:

```typescript
// Instead of building a string whereClause, build an array of Drizzle sql`` fragments:
import { sql, and } from 'drizzle-orm';

const clauses = [sql`s.tenant_id = ${tenantId}`];

if (filters.projectIds?.length) {
  clauses.push(sql`s.project_id = ANY(${filters.projectIds})`);
}
if (filters.status) {
  clauses.push(sql`s.status = ${filters.status}`);
}
if (filters.personId) {
  clauses.push(sql`s.person_id = ${filters.personId}`);
}
// ...

const whereExpr = clauses.reduce((acc, c) => sql`${acc} AND ${c}`);

const result = await db.execute(sql`
  SELECT … FROM submissions s … WHERE ${whereExpr} …
`);
```

Drizzle's `sql` tagged-template parameterizes every interpolated value; `sql.raw()` does not.

---

### CR-04: Empty-String `actorUserId` Silently Violates FK Constraint, Corrupting Activity Log

**File:** `src/actions/boq.ts:71, 135, 169, 221, 309` — `src/actions/people.ts:121, 192, 228` — `src/actions/projects.ts:44, 84, 112` — `src/actions/routes.ts:69`

**Issue:** Every `logOfficeActivity` call uses `session.user?.id ?? ''` (empty string fallback). Auth.js `session.user.id` is always a UUID when `session` is non-null — but the `??` fallback defensively covers a `null`/`undefined` sub-field.

`office_activity_log.actor_user_id` is `text NOT NULL` with a FK to `users.id`. An empty string `''` is not NULL (the NOT NULL constraint passes), but it almost certainly does not exist in the `users` table. The INSERT inside `after()` will throw a FK-violation error, which is swallowed by the `catch {}` in `logOfficeActivity`. The result is: **every activity-log entry silently disappears** whenever `session.user.id` is undefined.

Additionally, if `session.user.id` somehow were an empty string and a row with `id = ''` happened to exist in `users`, a bogus actor record would be logged.

**Fix:** Throw early — do not pass an empty string to the logger. Since `session` is already verified non-null before this point in every action, and Auth.js always populates `session.user.id` for a valid session, assert it:

```typescript
const actorUserId = session.user?.id;
if (!actorUserId) throw new Error('Session user ID missing — cannot log activity');

logOfficeActivity({ actorUserId, … });
```

Or, if a missing user ID should be non-fatal for the primary mutation, skip the log call entirely rather than passing `''`:

```typescript
if (session.user?.id) {
  logOfficeActivity({ actorUserId: session.user.id, … });
}
```

---

### CR-05: `setUnitPrice` Accepts Any Arbitrary Currency Code String — No Server-Side Validation

**File:** `src/actions/boq.ts:187-231`

**Issue:** `setUnitPrice` accepts `currencyCode: string` with no validation. The client-side `CURRENCY_OPTIONS = ['TRY', 'USD', 'EUR']` dropdown restricts normal UI input, but Server Actions are directly callable via fetch/curl. An attacker or malformed client can write arbitrary text into the `currency_code` column (e.g. an SQL-dangerous string, a 200-char string, or a value that breaks downstream `Intl.NumberFormat` calls).

The `boq_items.currency_code` column is `text NOT NULL` with no DB-level CHECK constraint. There is no length cap. This means dirty data enters the financial schema and will cause unhandled exceptions in `formatCurrency` for any `Intl`-invalid code.

**Fix:** Validate against the allowed list on the server side before any DB write:

```typescript
const ALLOWED_CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
type AllowedCurrency = typeof ALLOWED_CURRENCIES[number];

if (!ALLOWED_CURRENCIES.includes(params.currencyCode as AllowedCurrency)) {
  return { ok: false as const, error: 'Invalid currency code' };
}
```

Or use Zod: `z.enum(['TRY', 'USD', 'EUR'])`. Also add a DB-level CHECK constraint in a future migration.

---

## Warnings

### WR-01: `getBoqItems` Missing Tenant Scope — Cross-Tenant Read

**File:** `src/actions/boq.ts:237-246`

**Issue:** `getBoqItems` only filters by `projectId`, not by `tenantId`. Any authenticated user who knows (or guesses) a UUID belonging to a different tenant's project will receive that project's full BOQ.

```typescript
return db
  .select()
  .from(boqItems)
  .where(eq(boqItems.projectId, projectId))   // ← no tenantId filter
  .orderBy(boqItems.sortOrder);
```

In v1 single-tenant this is low-severity in practice, but the FK model allows multiple tenants and the project ID is passed from the client. Every other read function in this codebase correctly adds `eq(boqItems.tenantId, getDefaultTenantId())`.

**Fix:**
```typescript
.where(and(eq(boqItems.projectId, projectId), eq(boqItems.tenantId, getDefaultTenantId())))
```

---

### WR-02: `setUnitPriceAction` Failure Not Detected in `BoqItemDialog` — BOQ Item Created Without Price

**File:** `src/components/dashboard/BoqItemDialog.tsx:113-120`

**Issue:** `handleSubmit` awaits `setUnitPriceAction` but never checks its return value. `setUnitPriceAction` returns `{ ok: false, error: string }` on failure (e.g. if the BOQ item was not found, validation rejected the price, or a DB error occurred). When it fails, the dialog reports `toast.success()` and calls `onSuccess()` — the user believes the item was saved with a price when the price was silently dropped.

This leaves the BOQ item in the DB with no `unit_price`, which means all BAC/EV calculations return `null` for that row.

**Fix:**
```typescript
const priceResult = await setUnitPriceAction({ boqItemId, unitPrice: normalizedPrice, currencyCode });
if (!priceResult.ok) {
  toast.error(priceResult.error ?? tc('error_generic'));
  return;  // do not close dialog or call onSuccess
}
toast.success(tc('save'));
onSuccess();
```

---

### WR-03: `BoqItemDialog` State Not Synchronized to `item` Prop — Stale Data on Re-Open

**File:** `src/components/dashboard/BoqItemDialog.tsx:56-69`

**Issue:** All `useState` initializations derive from `item` at the moment the component is first mounted. The component is rendered conditionally by `{editItem && <BoqItemDialog item={editItem} … />}` in `BoqTable`, so it is unmounted and remounted each time a different item is edited — this avoids stale state for consecutive edits of different items. However, if the parent ever switches the `item` prop while keeping the component mounted (e.g. if `open` stays true while `editItem` is replaced), the form fields will show the old item's values. No `useEffect` synchronizes the state to `item` prop changes.

This is not currently triggered by `BoqTable`'s conditional render pattern, but it is a latent bug if any caller holds the dialog open across item changes.

**Fix:** Either keep the current mount/unmount pattern and document the dependency (add `key={item?.id}` to `BoqItemDialog` in `BoqTable`), or add a `useEffect` to synchronize state when `item` changes:

```tsx
// In BoqTable:
<BoqItemDialog key={editItem?.id} item={editItem} … />
```

---

### WR-04: `formatCurrency` Uses `parseFloat` on Numeric DB String — Precision Loss on Display

**File:** `src/lib/boq-value.ts:55`

**Issue:** `formatCurrency` calls `parseFloat(value)` on the pre-computed `lineValue` string before passing it to `Intl.NumberFormat`. `lineValue` uses `decimal.js` to produce a correct fixed-2 string (e.g. `"1234567890.12"`). `parseFloat` then converts this to a JS double, losing precision for values above 2^53 ÷ 100 (~90 trillion). For Turkish infrastructure contracts this could plausibly be reached (multi-billion TRY projects), but more practically, `parseFloat` can produce a value like `1234567890.1199999` which `Intl.NumberFormat` will then format incorrectly.

The design intent in `CanonicalSubmission` and `boq-value.ts` is to never use `parseFloat` on monetary strings. This function breaks the rule.

**Fix:** Use `Decimal.toNumber()` explicitly, or pass the string directly if `Intl.NumberFormat` supports it (it accepts `string` in modern environments):

```typescript
import Decimal from 'decimal.js';

const numeric = new Decimal(value).toNumber();
// or, for completeness:
// Intl.NumberFormat.format() accepts number|bigint — using Decimal(value).toNumber()
// is the correct bridge between decimal.js and Intl.
```

The practical risk is the same as `parseFloat` (both produce a JS number), but this removes the inconsistency and makes the intent explicit. For truly large values, format via `toFixed(2)` and build the locale string manually.

---

### WR-05: `hakedis_period_lines.period_qty` Has No Non-Negative CHECK Constraint

**File:** `src/db/migrations/0004_v2_data_foundation.sql:16` / `src/db/schema/hakedis-period-lines.ts:29`

**Issue:** The migration adds only one CHECK constraint:
```sql
CHECK (cumulative_qty_approved >= previous_cumulative_qty)
```
This prevents `previous_cumulative` from exceeding `cumulative`, but it does not prevent negative `period_qty`. The schema comment says `periodQty = cumulativeQtyApproved - previousCumulativeQty` enforced in `computePeriodLines()`, but there is no DB-level guard. A `period_qty` of `-5` would pass the constraint (if cumulative is still >= previous) and would generate a negative `period_value`, producing negative line-item values in a hakkediş certificate — a serious financial integrity defect.

Additionally, `unit_price_snapshot`, `period_value`, and `cumulative_value` have no non-negative CHECK constraints.

**Fix:** Add to the hand-edited migration section:
```sql
ALTER TABLE "hakedis_period_lines"
  ADD CONSTRAINT "hakedis_period_lines_period_qty_nonneg"
  CHECK (period_qty >= 0);

ALTER TABLE "hakedis_period_lines"
  ADD CONSTRAINT "hakedis_period_lines_unit_price_snapshot_nonneg"
  CHECK (unit_price_snapshot >= 0);
```

---

## Info

### IN-01: `getPersonMetrics` Auditor Queries Not Parallelized — Unnecessary Latency

**File:** `src/actions/analytics.ts:482-512`

**Issue:** When `asAuditor: true`, Query 3 (auditor decisions) and Query 4 (pending backlog) are executed sequentially with `await` instead of `Promise.all`. There is no data dependency between them.

**Fix:**
```typescript
const [auditorResult, pendingBacklogResult] = await Promise.all([
  db.execute(sql`… auditor decisions query …`),
  db.execute(sql`… pending backlog query …`),
]);
```

---

### IN-02: `getBoqItems` Returns Full Drizzle Row Type Including Internal Fields

**File:** `src/actions/boq.ts:237-246`

**Issue:** `getBoqItems` calls `db.select()` with no column projection, returning all columns including `tenantId`, `sortOrder`, `createdAt`. The `BoqItem` interface in `BoqTable.tsx` only types a subset of these fields, but callers receive the full DB row. Unnecessary columns cross the server/client boundary and expose internal schema fields.

**Fix:** Use a column projection:
```typescript
return db
  .select({
    id: boqItems.id,
    material: boqItems.material,
    unit: boqItems.unit,
    plannedQty: boqItems.plannedQty,
    approvedQty: boqItems.approvedQty,
    unitPrice: boqItems.unitPrice,
    currencyCode: boqItems.currencyCode,
    sortOrder: boqItems.sortOrder,
  })
  .from(boqItems)
  .where(…)
  .orderBy(boqItems.sortOrder);
```

---

_Reviewed: 2026-05-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
