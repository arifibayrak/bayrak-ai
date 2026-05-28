# Phase 10: Hakkediş Billing — Research

**Researched:** 2026-05-28
**Domain:** Turkish hakkediş (progress-payment) billing — period CRUD, yeşil-defter cumulative computation, deduction chain, finalization lock
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Deduction chain & math (HAK-03)**
- D-90: Net formula = gross + (KDV − KDV tevkifat) − stopaj − teminat − avans kesintisi. KDV/stopaj/teminat/avans apply to the KDV-hariç gross (matrah); tevkifat is a fraction OF KDV. All arithmetic runs in Postgres `numeric`. Each intermediate value displays to 2 decimal places. SC3 display order: gross → KDV → KDV tevkifat → stopaj → teminat → avans kesintisi → net ödeme.
- D-91: Extend `hakedis_periods` with: `tevkifat_fraction` (numeric), `stopaj_enabled` (boolean), `stopaj_rate` (numeric), `avans_kesintisi_rate` (numeric). Requires a generated migration applied via the project's established migration path — NOT `drizzle-kit push` (D-49).
- D-92: Construction-typical defaults for new draft periods: `kdv_rate` 0.2000, `tevkifat_fraction` 0.4000, `stopaj_enabled` false, `retention_rate` 0.0500, `avans_kesintisi_rate` 0.
- D-93: Stopaj modeled as explicit boolean toggle (`stopaj_enabled`) plus `stopaj_rate`.
- D-95: Linear lifecycle: `draft → finalized → submitted → paid`. Finalize is mandatory gate. `draft` is the only editable/recomputable state. Immutability locks off `status != 'draft'`.
- D-96: Finalize is irreversible. No un-finalize. Corrections flow into the next period's cumulative delta.
- D-97: Draft periods (and their computed lines) are deletable. Finalized/submitted/paid are never deletable. Create, finalize, and delete all write to `office_activity_log`.
- D-98: Draft line items compute on period create. Manual "Yeniden Hesapla / Recompute" available while draft. Recompute blocked once finalized. Line rows are stored.
- D-101: One period = one currency. Period only aggregates BOQ items whose `currency_code` matches.
- D-104: Enforce `period_qty = cumulative_qty_approved - previous_cumulative_qty` at DB level. Preferred mechanism: convert `period_qty` to `GENERATED ALWAYS AS (cumulative_qty_approved - previous_cumulative_qty) STORED`. Table is empty until Phase 10 — change is safe.

### Claude's Discretion
- D-94: Avans kesintisi = flat `avans_kesintisi_rate` × period gross (no running advance balance in v1).
- D-99: `previous_cumulative_qty` per BOQ item = `cumulative_qty_approved` from the most recent FINALIZED period (same `project_id` + `currency_code`) with earlier `period_end_date`; 0 if none. Enforces sequential finalization.
- D-102: Include all priced BOQ items with any cumulative approved qty > 0 up to cutoff.
- D-103: Unpriced BOQ items excluded; compute/period UI surfaces a warning listing excluded items.
- Stopaj default rate: 2% for inşaat (per UI-SPEC).
- `period_number` / label format: free text, auto-suggested as `HK-{YYYY}-{NN}`.
- New hakkediş actions live in a new `src/actions/hakedis.ts` module (keeps analytics.ts focused on performance/scorecard aggregations; hakedis is a separate billing domain).

### Deferred Ideas (OUT OF SCOPE)
- Tracked advance-balance recoupment (avans mahsubu against a project-level advance amount).
- Fiyat farkı (price-escalation) auto-calculation.
- Mixed-currency single hakkediş certificate.
- PDF hakkediş certificate + Excel yeşil-defter export — Phase 11 (EXP-02 / EXP-04).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HAK-01 | Office engineer can create progress-payment periods (dönem) for a project with a cutoff date | createPeriod server action; period list page; create dialog; D-91 migration adds deduction columns |
| HAK-02 | System computes per-period line items using yeşil-defter model (cumulative − previous, locked unit-price snapshot) | computePeriodLines() function; cumulative-qty aggregation query on submissions; D-104 GENERATED column |
| HAK-03 | System computes hakkediş deductions (KDV, KDV tevkifat, stopaj, teminat) with configurable per-period rates | D-90 deduction chain in Postgres numeric; summary table in period detail |
| HAK-04 | Office engineer can track payment status per period (draft → submitted → paid) | updatePaymentStatus server action; lifecycle guards |
| HAK-05 | A finalized hakkediş period is locked as an immutable snapshot | finalizePeriod server action; status != 'draft' immutability guard in all mutations |
</phase_requirements>

---

## Summary

Phase 10 extends the existing hakkediş schema (tables created in Phase 7, currently empty) with four missing deduction columns on `hakedis_periods` and converts the `period_qty` column in `hakedis_period_lines` to a database-enforced GENERATED column. The functional work is then to write the first rows into these tables: a `computePeriodLines()` function aggregates approved submission quantities per BOQ item using the established `analytics.ts` pattern (Istanbul-tz `decided_at` boundary, `numeric` in Postgres, grouped by currency), and a deduction chain computes gross → KDV → tevkifat → stopaj → teminat → avans → net entirely in Postgres arithmetic. All intermediate values are stored as strings and displayed via decimal.js to 2 decimal places.

The migration work is the most critical path item. The project uses an established generate-then-hand-edit workflow: `drizzle-kit generate` produces the base SQL, which is then hand-edited to add CHECK constraints, UNIQUE constraints, seed INSERTs, and any SQL that drizzle-kit cannot emit correctly (e.g. GENERATED columns). The final migration is applied via `npx tsx src/db/migrate.ts`, not `drizzle-kit push` (D-49 — confirmed blocked by `spatial_ref_sys` permissions on Neon). Phase 10 needs one migration covering all schema changes.

The UI work replaces the existing Phase 8 stub at `/dashboard/(admin)/hakedis/page.tsx` with a period list page, a `[periodId]` detail page, and five surfaces (list table, create dialog, finalize dialog, delete dialog, and the deduction summary card). The UI-SPEC is fully specified and uses only already-installed shadcn components plus `<Switch>` (to be added via `node_modules/.bin/shadcn add switch`).

**Primary recommendation:** Build Phase 10 in four waves: (1) schema changes + migration, (2) `computePeriodLines()` + all server actions in a new `hakedis.ts`, (3) period list page + create dialog, (4) period detail page + all controls.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Period CRUD (create, delete) | API (Server Actions) | — | Financial mutations with auth guard, tenant scope, activity logging |
| Cumulative-qty aggregation | Database (Postgres) | Server Action | All qty/money aggregation must stay in Postgres per money-math lock |
| Deduction chain arithmetic | Database (Postgres) | Server Action | D-90 explicitly: all arithmetic in Postgres `numeric`, never JS float |
| Period line storage | Database | — | Lines stored (not live-only) for finalization immutability |
| Finalization lock | Server Action + Database | — | Server Action enforces guard; DB has status column |
| GENERATED column enforcement | Database | — | `period_qty = cumulative − previous` guaranteed at DB level (D-104) |
| Period list + detail render | Frontend Server (RSC) | — | `force-dynamic` async Server Components; auth() guard first |
| Status badge / deduction summary display | Browser / Client | RSC | Static render; dialog controls are Client Components |
| i18n (TR/EN) | Frontend Server (RSC) | Client | `getTranslations()` in RSC, `useTranslations()` in client dialogs |
| Activity logging | Server Action (after()) | — | Fire-and-forget via `logOfficeActivity()` using `next/server after()` |

---

## Standard Stack

### Core (all already installed — no new npm packages)

| Library | Installed Version | Purpose | Source |
|---------|------------------|---------|--------|
| drizzle-orm | 0.45.2 | ORM + raw SQL via `sql``` template literals | [VERIFIED: package.json] |
| drizzle-kit | 0.31.10 | Migration generation (generate step only) | [VERIFIED: package.json] |
| decimal.js | ^10.6.0 | Display-only 2-decimal formatting; never for multiplication | [VERIFIED: package.json] |
| next-intl | ^4.12.0 | TR/EN getTranslations() / useTranslations() | [VERIFIED: package.json] |
| zod | (transitive, used in existing actions) | Input validation in server actions | [VERIFIED: used in src/actions/settings.ts] |
| shadcn (CLI) | 4.8.0 | Component installer — `node_modules/.bin/shadcn add` | [VERIFIED: package.json + confirmed path] |

### New shadcn Component (ONE addition)

| Component | Add Command | Status |
|-----------|-------------|--------|
| `<Switch>` | `node_modules/.bin/shadcn add switch` | Not installed — confirmed by `ls src/components/ui/` |

All other shadcn components used in UI-SPEC (Table, Card, Dialog, Badge, Alert, Button, Input, Select, Separator) are confirmed installed at `src/components/ui/`. [VERIFIED: ls src/components/ui/]

### No New npm Packages

Phase 10 installs zero new npm packages. All functionality is built on the existing installed stack.

---

## Package Legitimacy Audit

> Phase 10 installs no new npm packages. The only new dependency is a shadcn component (`<Switch>`) added via the official shadcn CLI from the official registry — not a separate npm install.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none — no new npm packages) | — | — | — | — | — | N/A |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

The shadcn `<Switch>` component is sourced exclusively from the official shadcn registry via `node_modules/.bin/shadcn add switch`. No third-party registry usage. Registry vetting gate: not applicable per UI-SPEC §Registry Safety.

---

## Migration Mechanics (D-49 — CRITICAL)

### Established Workflow (VERIFIED from codebase)

The project's confirmed migration workflow for Phase 10 is: [VERIFIED: src/db/migrate.ts, drizzle.config.ts, 0004–0007 migration files]

1. **Author schema changes** in `src/db/schema/*.ts` Drizzle TypeScript files.
2. **Run `drizzle-kit generate`** to produce a baseline migration SQL file in `src/db/migrations/`. The generated file is a template starting point — it correctly emits `ALTER TABLE ADD COLUMN` for simple columns.
3. **Hand-edit the generated SQL** for anything drizzle-kit cannot emit:
   - GENERATED ALWAYS AS columns (drizzle-kit 0.31.x emits the correct DDL for `.generatedAlwaysAs()` but the output must be verified)
   - CHECK constraints (drizzle-kit cannot emit these — confirmed pattern from 0004, 0006)
   - UNIQUE constraints (confirmed from 0007)
   - Seed INSERTs (confirmed from 0007)
4. **Rename the file** to the project's hand-edited naming convention (e.g. `0008_v2_hakedis_deductions.sql`).
5. **Apply via `npx tsx src/db/migrate.ts`** — the migrate runner: (a) runs `0000_enable_postgis.sql` first, then (b) calls `migrate(db, { migrationsFolder: 'src/db/migrations' })` which processes all migrations in the `meta/_journal.json` order.

**drizzle-kit push is BLOCKED** on this project due to `spatial_ref_sys` permission errors on Neon (D-49). Never use `drizzle-kit push`.

### Migration 0008 — Required DDL

The Phase 10 migration covers two separate concerns that combine into one file:

**Part A: ADD deduction columns to `hakedis_periods`** (D-91)

```sql
-- Add missing deduction columns to hakedis_periods (D-91 / Phase 10 only)
ALTER TABLE "hakedis_periods"
  ADD COLUMN "tevkifat_fraction"   numeric(5, 4),
  ADD COLUMN "stopaj_enabled"      boolean NOT NULL DEFAULT false,
  ADD COLUMN "stopaj_rate"         numeric(5, 4),
  ADD COLUMN "avans_kesintisi_rate" numeric(5, 4) NOT NULL DEFAULT '0.0000';
```

All four columns are nullable EXCEPT `stopaj_enabled` (boolean with default) and `avans_kesintisi_rate` (default 0). `tevkifat_fraction` and `stopaj_rate` nullable because a migrated period with old structure might not have them.

**Part B: Convert `period_qty` to GENERATED ALWAYS AS STORED** (D-104)

```sql
-- Convert period_qty to GENERATED ALWAYS AS (D-104 / WR-03).
-- Table is empty until Phase 10 — no data migration needed.
-- Dropping the column also drops the CHECK constraint hakedis_period_lines_period_qty_nonneg
-- (0006_v2_period_qty_check.sql) automatically. The cumulative_check (cumulative >= previous)
-- already guarantees period_qty >= 0 by arithmetic: if cumulative >= previous,
-- then cumulative - previous >= 0.
ALTER TABLE "hakedis_period_lines" DROP COLUMN "period_qty";
ALTER TABLE "hakedis_period_lines"
  ADD COLUMN "period_qty" numeric(12, 3)
  GENERATED ALWAYS AS (cumulative_qty_approved - previous_cumulative_qty) STORED;
```

### GENERATED Column Drizzle Schema (D-104)

Drizzle ORM 0.45.x supports `.generatedAlwaysAs()` on numeric columns. [VERIFIED: runtime introspection of `drizzle-orm/pg-core` — method exists and sets `{ type: 'always', mode: 'stored' }`]

```typescript
// In hakedis-period-lines.ts (Phase 10 schema update):
import { sql } from 'drizzle-orm';

periodQty: numeric('period_qty', { precision: 12, scale: 3 })
  .generatedAlwaysAs(sql`cumulative_qty_approved - previous_cumulative_qty`),
```

**Critical code constraint for computePeriodLines():** INSERT statements into `hakedis_period_lines` MUST NOT supply `period_qty`. Postgres computes it automatically. The INSERT writes only `cumulative_qty_approved` + `previous_cumulative_qty` + snapshot fields + `period_value` + `cumulative_value`. Any INSERT that includes `period_qty` will fail with `ERROR: column "period_qty" can only be updated to DEFAULT`.

**CHECK constraint interaction:** The existing `hakedis_period_lines_period_qty_nonneg` CHECK (`period_qty >= 0`, added in 0006) is automatically dropped when the column is dropped. It does not need to be separately dropped. The `hakedis_period_lines_cumulative_check` (`cumulative_qty_approved >= previous_cumulative_qty`, added in 0004) remains in place — this is the correct guard that mathematically guarantees `period_qty >= 0` via GENERATED computation.

**Existing test impact:** The three tests in `tests/schema.test.ts` (Money-Math Test 5) currently INSERT `period_qty` explicitly. These tests must be updated for Phase 10: they either (a) omit `period_qty` from the INSERT, or (b) use the GENERATED column's auto-computed value. The tests that currently provide `period_qty: '-50.000'` to trigger the cumulative check will still work because the CHECK `cumulative >= previous` will reject the INSERT before the GENERATED column is computed.

---

## Cumulative-Approved-Qty Aggregation (HAK-02, D-100)

### Pattern Reuse from analytics.ts

The `computePeriodLines()` function follows the established `analytics.ts` pattern: [VERIFIED: src/actions/analytics.ts]

- `auth()` guard first, then `WHERE tenant_id = ${tenantId}`
- Money aggregation via `SUM(s.quantity::numeric)` in Postgres — never in JS
- Date filtering via `s.decided_at` (not `submitted_at`), Istanbul-tz boundary
- Results returned as strings from Postgres `numeric` columns
- Parameterized bound params via Drizzle `sql``` template literals (never `sql.raw()` for user-supplied values)

### The Core Aggregation Query

For `computePeriodLines(periodId: string)`:

```typescript
// Step 1: Fetch period metadata (project_id, currency_code, period_end_date, status)
// Step 2: For each priced BOQ item where currency_code matches:
//   - Compute cumulative approved qty up to period_end_date (Istanbul midnight)
//   - Compute previous_cumulative from most recent finalized period

const cumulativeResult = await db.execute(sql`
  SELECT
    b.id                                                          AS boq_item_id,
    b.material,
    b.unit,
    b.currency_code,
    b.unit_price,
    COALESCE(
      SUM(s.quantity::numeric)
        FILTER (WHERE s.status = 'approved'
          AND s.decided_at <= (${periodEndDate}::date + interval '1 day')
            AT TIME ZONE 'Europe/Istanbul'),
      0
    )                                                             AS cumulative_qty_approved
  FROM boq_items b
  LEFT JOIN submissions s
    ON s.boq_item_id = b.id
    AND s.tenant_id  = ${tenantId}
  WHERE b.project_id   = ${projectId}
    AND b.tenant_id    = ${tenantId}
    AND b.currency_code = ${currencyCode}
    AND b.unit_price IS NOT NULL
  GROUP BY b.id, b.material, b.unit, b.currency_code, b.unit_price
  HAVING COALESCE(
    SUM(s.quantity::numeric)
      FILTER (WHERE s.status = 'approved'
        AND s.decided_at <= (${periodEndDate}::date + interval '1 day')
          AT TIME ZONE 'Europe/Istanbul'),
    0
  ) > 0
`);
```

**Istanbul-tz date boundary:** The pattern `(${periodEndDate}::date + interval '1 day') AT TIME ZONE 'Europe/Istanbul'` converts the calendar date cutoff to an Istanbul midnight timestamp, matching the established pattern in `getPortfolioTrends` (uses `AT TIME ZONE 'Europe/Istanbul'` for bucketing). The `period_end_date` is INCLUSIVE — submissions decided on the cutoff date are included.

**Item inclusion (D-102):** The `HAVING cumulative_qty > 0` clause implements D-102: only items with any cumulative approved qty up to the cutoff are included. Items with `unit_price IS NULL` are excluded by the WHERE clause (D-103 — unpriced items cannot form a line because `unitPriceSnapshot NOT NULL`).

**Previous cumulative (D-99):** Separate query to find the most recent finalized period for the same `project_id` + `currency_code` with `period_end_date < this period's period_end_date`:

```typescript
const previousPeriodResult = await db.execute(sql`
  SELECT hpl.boq_item_id, hpl.cumulative_qty_approved
  FROM hakedis_period_lines hpl
  JOIN hakedis_periods hp ON hp.id = hpl.period_id
  WHERE hp.project_id   = ${projectId}
    AND hp.tenant_id    = ${tenantId}
    AND hp.currency_code = ${currencyCode}
    AND hp.status       != 'draft'
    AND hp.period_end_date < ${periodEndDate}
  ORDER BY hp.period_end_date DESC
`);
// Deduplicate: for each boq_item_id, take the first row (most recent finalized period)
```

**Unpriced item warning (D-103):** A separate query fetches BOQ items in the project/currency where `unit_price IS NULL` — these are returned alongside the period detail so the UI can render the warning banner.

---

## Deduction Computation Chain (D-90, HAK-03)

### Where Deductions Live

Deduction totals are computed at **read time** from the stored period lines (not pre-stored). This keeps the summary table fresh if rates were edited before finalization, and eliminates a separate `period_value` aggregation that could drift. The stored `period_value` per line (line-level `period_qty × unit_price_snapshot`) is the source; the deduction chain is computed over `SUM(period_value)`.

### SQL Deduction Query (called in `getPeriodDetail()`)

```sql
SELECT
  SUM(hpl.period_value::numeric)               AS gross,
  SUM(hpl.period_value::numeric)
    * hp.kdv_rate::numeric                     AS kdv,
  SUM(hpl.period_value::numeric)
    * hp.kdv_rate::numeric
    * hp.tevkifat_fraction::numeric            AS tevkifat,
  CASE WHEN hp.stopaj_enabled
    THEN SUM(hpl.period_value::numeric) * hp.stopaj_rate::numeric
    ELSE 0
  END                                          AS stopaj,
  SUM(hpl.period_value::numeric)
    * hp.retention_rate::numeric               AS teminat,
  SUM(hpl.period_value::numeric)
    * hp.avans_kesintisi_rate::numeric         AS avans,
  -- Net = gross + (KDV − tevkifat) − stopaj − teminat − avans
  SUM(hpl.period_value::numeric)
    + (SUM(hpl.period_value::numeric) * hp.kdv_rate::numeric
       - SUM(hpl.period_value::numeric) * hp.kdv_rate::numeric * hp.tevkifat_fraction::numeric)
    - CASE WHEN hp.stopaj_enabled
        THEN SUM(hpl.period_value::numeric) * hp.stopaj_rate::numeric
        ELSE 0 END
    - SUM(hpl.period_value::numeric) * hp.retention_rate::numeric
    - SUM(hpl.period_value::numeric) * hp.avans_kesintisi_rate::numeric
                                             AS net
FROM hakedis_period_lines hpl
JOIN hakedis_periods hp ON hp.id = hpl.period_id
WHERE hpl.period_id = ${periodId}
  AND hpl.tenant_id = ${tenantId}
```

All six intermediate values (`gross`, `kdv`, `tevkifat`, `stopaj`, `teminat`, `avans`, `net`) return from Postgres as `numeric` strings. The page renders them via `new Decimal(value).toFixed(2)` then `.toLocaleString('tr-TR')` or `'en-US'` depending on locale. Never `parseFloat().toFixed(2)`.

**Rounding:** No explicit ROUND() in the Postgres query — the 2-decimal display rounding happens in `decimal.js` `.toFixed(2)` on the client, matching the established display pattern.

**Nullable rate handling:** `tevkifat_fraction` and `stopaj_rate` are nullable in the schema. The SQL uses `COALESCE(hp.tevkifat_fraction::numeric, 0)` and `COALESCE(hp.stopaj_rate::numeric, 0)` to be defensive, even though the Server Action validates these before INSERT.

---

## Server Actions Pattern (HAK-01 through HAK-05)

### New Module: `src/actions/hakedis.ts`

All hakkediş mutations live in a new `'use server'` module `src/actions/hakedis.ts` (not in `analytics.ts`, which is scoped to performance/scorecard aggregations).

### Established Pattern (from `src/actions/settings.ts` and `src/actions/boq.ts`)

```typescript
'use server';

export async function createPeriod(input: CreatePeriodInput): Promise<{ ok: true; periodId: string }> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  // 1. Zod validation
  const parsed = createPeriodSchema.parse(input);

  // 2. Verify projectId belongs to this tenant (IDOR guard — same pattern as boq.ts CR-01)
  const projectCheck = await db.execute(sql`
    SELECT id FROM projects WHERE id = ${parsed.projectId} AND tenant_id = ${tenantId}
  `);
  if (projectCheck.rows.length === 0) throw new Error('Project not found');

  // 3. Primary DB write (INSERT hakedis_periods)
  const [period] = await db.insert(hakedisPeriods).values({ ... }).returning();

  // 4. computePeriodLines() called synchronously (D-98: compute on create)
  await computePeriodLines(period.id, { tenantId, projectId, ... });

  // 5. Activity log (fire-and-forget, AFTER primary write)
  logOfficeActivity({
    actorUserId: session.user.id,
    actionType: 'hakedis_period_created',
    entityType: 'hakedis_period',
    entityId: period.id,
    projectId: parsed.projectId,
    metadata: { periodNumber: parsed.periodNumber, currencyCode: parsed.currencyCode },
  });

  revalidatePath('/dashboard/hakedis');
  return { ok: true, periodId: period.id };
}
```

### Actions Required

| Action | Mutation | Guards | Logs |
|--------|----------|--------|------|
| `createPeriod()` | INSERT hakedis_periods + computePeriodLines | auth() + tenant + zod | `hakedis_period_created` |
| `recomputePeriodLines()` | DELETE+INSERT hakedis_period_lines | auth() + tenant + `status === 'draft'` | none (draft-only operation, not a lifecycle event) |
| `finalizePeriod()` | UPDATE status='finalized', set finalizedAt=NOW() | auth() + tenant + `status === 'draft'` | `hakedis_period_finalized` |
| `updatePaymentStatus()` | UPDATE status | auth() + tenant + lifecycle guard | none (or a future action type) |
| `deletePeriod()` | DELETE hakedis_periods (cascades to lines) | auth() + tenant + `status === 'draft'` | `hakedis_period_deleted` (see note) |
| `getPeriodsByProject()` | SELECT hakedis_periods | auth() + tenant | — |
| `getPeriodDetail()` | SELECT period + lines + deduction computation | auth() + tenant | — |

**Missing action type for delete:** The `OFFICE_ACTION_TYPES` array in `src/db/schema/office-activity-log.ts` currently lists `hakedis_period_created` and `hakedis_period_finalized` but NOT `hakedis_period_deleted`. D-97 requires all three to be logged. The Phase 10 schema change for `office-activity-log.ts` adds `'hakedis_period_deleted'` to the `OFFICE_ACTION_TYPES` array. This is a TypeScript-only change (no migration needed — the column is `text`, not a Postgres enum).

### updatePaymentStatus Lifecycle Guard

```typescript
const VALID_TRANSITIONS: Record<HakedisStatus, HakedisStatus | null> = {
  draft: null,         // draft can only be finalized, not advanced via updatePaymentStatus
  finalized: 'submitted',
  submitted: 'paid',
  paid: null,          // terminal — no further transitions
};
// Guard: period.status must be 'finalized' or 'submitted' for updatePaymentStatus to proceed.
// 'draft' → use finalizePeriod(). 'paid' → no-op error.
```

---

## Architecture Patterns

### System Architecture Diagram

```
Office Engineer (browser)
        │
        ▼
  Client Components
  (Create Dialog, Finalize Dialog, Delete Dialog,
   Stopaj Switch, Recompute Button)
        │ Server Action calls (form POST)
        ▼
  src/actions/hakedis.ts (Server Actions)
  ┌─────────────────────────────────────────────────┐
  │ auth() guard → tenant scope → zod validate      │
  │                                                 │
  │  createPeriod()          → computePeriodLines() │
  │  recomputePeriodLines()  ↗                      │
  │  finalizePeriod()                               │
  │  updatePaymentStatus()                          │
  │  deletePeriod()                                 │
  │         │                                       │
  │  logOfficeActivity() [after()]                  │
  │  revalidatePath('/dashboard/hakedis')           │
  └───────────────────┬─────────────────────────────┘
                      │ Drizzle sql`` parameterized queries
                      ▼
              Neon PostgreSQL (via neon-http)
              ┌────────────────────────────┐
              │ hakedis_periods            │
              │   + deduction columns (D-91│
              │ hakedis_period_lines       │
              │   period_qty GENERATED     │
              │   ALWAYS AS (cumul−prev)   │
              │ submissions (source for    │
              │   decided_at + quantity)   │
              │ boq_items (unit_price +    │
              │   currency_code)           │
              │ office_activity_log        │
              └────────────────────────────┘
                      │
                      ▼ (RSC data fetch on request)
  Server Components (RSC, force-dynamic)
  src/app/dashboard/(admin)/hakedis/page.tsx    → Period list page
  src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx → Detail page
```

### Recommended Project Structure (new files)

```
src/
├── actions/
│   └── hakedis.ts              # All hakkediş server actions (new)
├── app/dashboard/(admin)/hakedis/
│   ├── page.tsx                # Period list (replace stub)
│   └── [periodId]/
│       └── page.tsx            # Period detail (new route)
├── components/admin/
│   ├── HakedisCreateDialog.tsx # Create Period dialog + form (client component)
│   ├── HakedisStatusBadge.tsx  # Status badge helper (or inline in pages)
│   ├── PeriodDetailControls.tsx # Recompute/Finalize/Delete buttons (client)
│   └── FinalizeDialog.tsx      # Finalize confirmation dialog (client)
│   └── DeletePeriodDialog.tsx  # Delete confirmation dialog (client)
├── components/ui/
│   └── switch.tsx              # Added via: node_modules/.bin/shadcn add switch
├── db/
│   ├── migrations/
│   │   └── 0008_v2_hakedis_deductions.sql  # Phase 10 migration
│   └── schema/
│       ├── hakedis-periods.ts   # Add 4 deduction columns (D-91)
│       └── hakedis-period-lines.ts  # Convert periodQty to GENERATED (D-104)
│       └── office-activity-log.ts   # Add 'hakedis_period_deleted' to OFFICE_ACTION_TYPES
└── messages/
    ├── en.json                 # Add dashboard.admin.hakedis.* namespace
    └── tr.json                 # Same keys in Turkish
```

### Pattern 1: Server Action with Auth + Tenant + Zod + Revalidate

**What:** Every mutation in `hakedis.ts` follows the established settings.ts / boq.ts pattern.
**When to use:** All five write actions.
**Source:** [VERIFIED: src/actions/settings.ts, src/actions/boq.ts]

```typescript
// Source: established pattern in src/actions/settings.ts
'use server';
export async function mutateHakedis(input: Input): Promise<{ ok: true }> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');       // T-09-04-EoP
  const tenantId = getDefaultTenantId();               // T-09-04-ID
  const parsed = schema.parse(input);                  // T-09-04-T (Zod)
  // ... verify entity belongs to tenant (IDOR guard)
  // ... primary DB write
  logOfficeActivity({ actorUserId: session.user.id, ... }); // fire-and-forget after()
  revalidatePath('/dashboard/hakedis');
  return { ok: true };
}
```

### Pattern 2: force-dynamic RSC with auth() guard

**What:** Period list and detail pages are Server Components with `export const dynamic = 'force-dynamic'`.
**Source:** [VERIFIED: src/app/dashboard/(admin)/settings/page.tsx]

```typescript
// Source: src/app/dashboard/(admin)/settings/page.tsx
export const dynamic = 'force-dynamic';

export default async function HakedisPage() {
  const session = await auth();
  if (!session) redirect('/auth/signin');
  // ... fetch data, render
}
```

### Pattern 3: GENERATED ALWAYS AS STORED in Drizzle Schema

**What:** `period_qty` column uses Drizzle's `.generatedAlwaysAs()` API.
**Source:** [VERIFIED: runtime test of drizzle-orm 0.45.2 — method exists and produces correct config]

```typescript
// In src/db/schema/hakedis-period-lines.ts (Phase 10 update):
import { sql } from 'drizzle-orm';
periodQty: numeric('period_qty', { precision: 12, scale: 3 })
  .generatedAlwaysAs(sql`cumulative_qty_approved - previous_cumulative_qty`),
```

**INSERT constraint:** Never supply `period_qty` in INSERT. Supply only `cumulative_qty_approved` and `previous_cumulative_qty`.

### Pattern 4: Decimal.js Display Formatting

**What:** Money values from Postgres come as strings; decimal.js formats for display.
**Source:** [VERIFIED: src/actions/analytics.ts comments; existing codebase usage]

```typescript
// In period detail page component:
import Decimal from 'decimal.js';

function formatMoney(value: string | null, locale: string): string {
  if (value == null) return '—';
  const d = new Decimal(value);
  return d.toFixed(2) + ' ' + currencyCode; // or toLocaleString for thousands sep
}
// TR locale: use .toLocaleString('tr-TR', { minimumFractionDigits: 2 })
// EN locale: use .toLocaleString('en-US', { minimumFractionDigits: 2 })
```

### Pattern 5: logOfficeActivity fire-and-forget

**What:** Activity logging via `after()` — never await, never block the primary mutation.
**Source:** [VERIFIED: src/lib/log-office-activity.ts]

```typescript
// Source: src/lib/log-office-activity.ts
// Call AFTER the primary DB write, do NOT await:
logOfficeActivity({
  actorUserId: session.user.id,
  actionType: 'hakedis_period_created',
  entityType: 'hakedis_period',
  entityId: period.id,
  projectId: input.projectId,
});
```

### Anti-Patterns to Avoid

- **Hand-rolling deduction math in JS float:** Never `Number(gross) * kdvRate`. All multiplication stays in Postgres `numeric`. Only decimal.js for display.
- **Inserting period_qty explicitly:** Once the GENERATED column is in place, any INSERT that includes `period_qty` throws a Postgres error. The Drizzle schema update will prevent this at the TypeScript level too.
- **Using `drizzle-kit push`:** Blocked by D-49. Only `npx tsx src/db/migrate.ts`.
- **Mutating a finalized period:** All five mutating actions check `status !== 'draft'` and throw before touching the DB. The UI also removes controls entirely for non-draft periods (not just disabling them) per D-96.
- **Cross-currency summation in computePeriodLines:** Only BOQ items with `currency_code = period.currencyCode` are included (D-101).
- **Chaining off draft previous period:** D-99 specifies that `previous_cumulative_qty` comes from the most recent FINALIZED period — never from a draft period.
- **Using `npx shadcn@latest add`:** Known broken (Phase-8 finding). Use `node_modules/.bin/shadcn add switch`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Turkish decimal formatting | Custom number→string converter | `new Decimal(str).toFixed(2)` + `.toLocaleString('tr-TR')` | decimal.js handles precision + locale separator (period/comma) correctly |
| Rate % display ↔ DB fraction conversion | Multiply/divide in JS float | Store as 0-1 fraction in DB; display × 100 in form | Avoids float drift; established pattern in settings.ts |
| Deduction arithmetic | Intermediate JS variable chain | Single SQL query returning all six values | Postgres numeric is exact; JS arithmetic on the 6 string-values introduces float error |
| Auth guard | Session check middleware | `auth()` from `@/lib/auth` + `redirect()` pattern | Established pattern; defense-in-depth with layout guard |
| Activity logging | Custom DB INSERT | `logOfficeActivity()` from `@/lib/log-office-activity` | Handles `after()` deferral, swallows errors, tenant-scopes automatically |
| i18n | Hard-coded strings | `getTranslations('dashboard.admin.hakedis')` / `useTranslations()` | Required for TR/EN; all keys pre-declared in UI-SPEC copywriting contract |
| Currency validation | Ad-hoc string check | `ALLOWED_CURRENCIES` from `src/actions/boq.ts` | Canonical allow-list already exists; import and reuse |
| Period number auto-suggest | Custom counter query | Query `MAX(period_number)` for the project and increment the `NN` suffix | Simple string manipulation; no special library |

---

## Common Pitfalls

### Pitfall 1: Inserting period_qty in INSERT after GENERATED column conversion
**What goes wrong:** computePeriodLines() passes `periodQty` in the INSERT values object. Postgres rejects with `ERROR: column "period_qty" can only be updated to DEFAULT`.
**Why it happens:** Drizzle schema still shows `periodQty` as a column (it is, just GENERATED). The Drizzle TypeScript types may still accept it as an optional insert field.
**How to avoid:** After updating `hakedis-period-lines.ts` to use `.generatedAlwaysAs()`, the TypeScript type system should mark the column as not insertable. Explicitly verify that the Drizzle insert type excludes `periodQty`. If not, omit it from the INSERT values object manually.
**Warning signs:** `ERROR: column "period_qty" can only be updated to DEFAULT` in migration test.

### Pitfall 2: drizzle-kit generates GENERATED column DDL incorrectly
**What goes wrong:** drizzle-kit 0.31.x generates DDL for `.generatedAlwaysAs()` that is syntactically wrong or uses `VIRTUAL` instead of `STORED`.
**Why it happens:** Drizzle-kit SQL emission for GENERATED columns has had known issues in some versions.
**How to avoid:** After running `drizzle-kit generate`, inspect the produced SQL for the `period_qty` column. The correct DDL is: `"period_qty" numeric(12, 3) GENERATED ALWAYS AS (cumulative_qty_approved - previous_cumulative_qty) STORED`. Hand-edit if the emitted SQL is wrong. Verify by running the migration against the test DB.
**Warning signs:** Migration applies but `period_qty` accepts explicit INSERT values (i.e., it became a regular column).

### Pitfall 3: Istanbul timezone cutoff is midnight-exclusive (submissions submitted at exactly midnight are excluded)
**What goes wrong:** Using `decided_at < ${periodEndDate}::date AT TIME ZONE 'Europe/Istanbul'` excludes submissions decided on the cutoff date itself.
**Why it happens:** `date::timestamp` is `00:00:00` — midnight is the START of the day.
**How to avoid:** Use `decided_at <= (${periodEndDate}::date + interval '1 day') AT TIME ZONE 'Europe/Istanbul'` — inclusive of the full calendar day. Matches the `period_end_date` semantics in the schema comment ("inclusive").

### Pitfall 4: Previous-period chaining off a draft period
**What goes wrong:** When computing `previous_cumulative_qty`, the query picks up lines from a draft period that was created after the previous finalized period but before the current period.
**Why it happens:** WHERE clause does not filter out `status = 'draft'`.
**How to avoid:** D-99 explicitly requires `status != 'draft'` in the previous-period query. Use `AND hp.status != 'draft'` (or equivalently `AND hp.finalized_at IS NOT NULL`).

### Pitfall 5: Deduction chain uses NULL tevkifat_fraction when period was created before column existed
**What goes wrong:** Periods created before the D-91 migration have `tevkifat_fraction = NULL`. The deduction query `* hp.tevkifat_fraction::numeric` returns NULL, making the whole net NULL.
**Why it happens:** All arithmetic with NULL propagates NULL in SQL.
**How to avoid:** Use `COALESCE(hp.tevkifat_fraction::numeric, 0)` in the deduction query. All new periods will have a non-null value from the create form, but defensive COALESCE handles edge cases.

### Pitfall 6: Missing 'hakedis_period_deleted' in OFFICE_ACTION_TYPES causes TypeScript error
**What goes wrong:** `deletePeriod()` calls `logOfficeActivity({ actionType: 'hakedis_period_deleted' })`. TypeScript rejects because that literal is not in the `OFFICE_ACTION_TYPES` const array.
**Why it happens:** PERF-03 listed `hakedis_period_created` and `hakedis_period_finalized` but not deleted.
**How to avoid:** Add `'hakedis_period_deleted'` to the `OFFICE_ACTION_TYPES` array in `src/db/schema/office-activity-log.ts` as part of Wave 1. No migration needed — column is `text`.

### Pitfall 7: recomputePeriodLines on a finalized period returns success
**What goes wrong:** The recompute action does not check status before executing. It deletes and re-inserts all lines even for finalized periods.
**Why it happens:** The status guard is missing or checks the wrong condition.
**How to avoid:** `recomputePeriodLines()` MUST check `period.status === 'draft'` and throw `'Period is not in draft status'` if not. The UI removes the Recompute button for non-draft periods (D-96), but the server-side guard is the authoritative check.

### Pitfall 8: Period list page does not scope to tenant
**What goes wrong:** `SELECT * FROM hakedis_periods WHERE project_id = ${projectId}` without `AND tenant_id = ${tenantId}` — allows cross-tenant data read if project_id is guessed.
**Why it happens:** IDOR gap — project_id FK only validates that the project exists, not that it belongs to the current tenant.
**How to avoid:** Every SELECT on `hakedis_periods` includes `AND tenant_id = ${tenantId}`. Verify tenant ownership of `projectId` before any query (established pattern from boq.ts CR-01).

---

## Code Examples

### Cumulative Aggregation with Istanbul-TZ Cutoff

```typescript
// Source: established analytics.ts pattern (VERIFIED: src/actions/analytics.ts lines 424-456)
// The period_end_date inclusive cutoff:
const cutoffExpr = sql`(${periodEndDate}::date + interval '1 day') AT TIME ZONE 'Europe/Istanbul'`;

const result = await db.execute(sql`
  SELECT
    b.id AS boq_item_id,
    b.material, b.unit, b.currency_code, b.unit_price,
    COALESCE(
      SUM(s.quantity::numeric)
        FILTER (WHERE s.status = 'approved' AND s.decided_at <= ${cutoffExpr}),
      0
    ) AS cumulative_qty_approved
  FROM boq_items b
  LEFT JOIN submissions s ON s.boq_item_id = b.id AND s.tenant_id = ${tenantId}
  WHERE b.project_id = ${projectId}
    AND b.tenant_id = ${tenantId}
    AND b.currency_code = ${currencyCode}
    AND b.unit_price IS NOT NULL
  GROUP BY b.id, b.material, b.unit, b.currency_code, b.unit_price
  HAVING COALESCE(
    SUM(s.quantity::numeric)
      FILTER (WHERE s.status = 'approved' AND s.decided_at <= ${cutoffExpr}),
    0
  ) > 0
`);
```

### Previous Cumulative (Latest Finalized Period)

```typescript
// D-99: chain only off finalized periods — draft periods must be excluded
const prevResult = await db.execute(sql`
  SELECT DISTINCT ON (hpl.boq_item_id)
    hpl.boq_item_id,
    hpl.cumulative_qty_approved
  FROM hakedis_period_lines hpl
  JOIN hakedis_periods hp ON hp.id = hpl.period_id
  WHERE hp.project_id    = ${projectId}
    AND hp.tenant_id     = ${tenantId}
    AND hp.currency_code = ${currencyCode}
    AND hp.status        != 'draft'
    AND hp.period_end_date < ${periodEndDate}
  ORDER BY hpl.boq_item_id, hp.period_end_date DESC
`);
// DISTINCT ON picks the most recent finalized period's line for each boq_item_id
```

### Finalization Lock Guard

```typescript
// Source: established guard pattern from src/actions/settings.ts
export async function finalizePeriod(periodId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  const periodResult = await db.execute(sql`
    SELECT id, status, project_id FROM hakedis_periods
    WHERE id = ${periodId} AND tenant_id = ${tenantId}
  `);
  const period = periodResult.rows[0];
  if (!period) throw new Error('Period not found');
  if (period.status !== 'draft') throw new Error('Period is not in draft status');

  await db.execute(sql`
    UPDATE hakedis_periods
    SET status = 'finalized', finalized_at = NOW(), updated_at = NOW()
    WHERE id = ${periodId} AND tenant_id = ${tenantId}
  `);

  logOfficeActivity({
    actorUserId: session.user.id,
    actionType: 'hakedis_period_finalized',
    entityType: 'hakedis_period',
    entityId: periodId,
    projectId: String(period.project_id),
  });
  revalidatePath('/dashboard/hakedis');
  revalidatePath(`/dashboard/hakedis/${periodId}`);
  return { ok: true };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `period_qty` as regular column with CHECK | `period_qty` as GENERATED ALWAYS AS STORED | Phase 10 (WR-03) | DB guarantees arithmetic identity; INSERT cannot supply incorrect value |
| No deduction columns on hakedis_periods | tevkifat_fraction, stopaj_enabled, stopaj_rate, avans_kesintisi_rate added | Phase 10 (D-91) | Configurable per-period deductions enabled |
| Coming-soon stub at /hakedis | Full period list + detail + CRUD | Phase 10 | HAK-01..HAK-05 fulfilled |

**Deprecated/outdated:**
- Direct supply of `period_qty` in INSERT: becomes invalid after D-104 GENERATED column conversion. Any existing test that explicitly inserts `period_qty` (schema.test.ts Money-Math Test 5) must be updated.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | drizzle-kit 0.31.x emits syntactically correct GENERATED ALWAYS AS STORED DDL from `.generatedAlwaysAs()` | Migration Mechanics | Must hand-edit the generated SQL if wrong — adds one hand-edit step to migration |
| A2 | Postgres (Neon's PG16) allows GENERATED STORED columns when the source columns have existing CHECK constraints on them | Migration Mechanics | If not, must restructure: drop constraint, add GENERATED column, re-verify invariant via the cumulative_check only |
| A3 | The deduction computation (6 values in one SQL query) performs correctly even when `tevkifat_fraction` or `stopaj_rate` are NULL (via COALESCE) | Deduction Chain | If COALESCE is omitted, NULL-poisoning produces NULL net — critical billing defect |
| A4 | period_qty GENERATED STORED is readable after INSERT (available in the same transaction's RETURNING clause) | computePeriodLines() | If not, a separate SELECT is needed to read period_qty after insert |

**If this table is empty:** N/A — assumptions are listed above.

---

## Open Questions (RESOLVED)

1. **RESOLVED — Does drizzle-kit 0.31.x emit correct GENERATED ALWAYS AS STORED SQL?**
   - Adopted decision: Plan 10-01 (Task 2) runs `drizzle-kit generate`, then hand-edits/inspects the `period_qty` GENERATED DDL (must be `numeric(12,3) GENERATED ALWAYS AS (cumulative_qty_approved - previous_cumulative_qty) STORED`, via DROP COLUMN + ADD COLUMN), and applies via `npx tsx src/db/migrate.ts` ([BLOCKING] Task 3). This is the same generate-then-hand-edit-then-apply verification step used for all previous migrations.
   - What we know: The Drizzle schema API supports `.generatedAlwaysAs()` (verified at runtime). The emitted SQL is unknown without actually running `drizzle-kit generate`.
   - What's unclear: Whether drizzle-kit 0.31.x has bugs in GENERATED column DDL emission — resolved operationally by the mandatory hand-inspection step in Plan 10-01.

2. **RESOLVED — Should `recomputePeriodLines()` be a standalone exported action or a private helper called by `createPeriod()`?**
   - Adopted decision: `recomputePeriodLines(periodId)` is a standalone exported action in Plan 10-02 (with its own auth+tenant+status guard); `createPeriod()` calls it internally after inserting the period header (D-98). This avoids code duplication and makes the recompute action independently testable.
   - What we know: Both `createPeriod()` (D-98: compute on create) and the "Yeniden Hesapla" button call the same computation logic.

3. **RESOLVED — Period-number auto-suggest format (`HK-{YYYY}-{NN}`) — how is NN derived?**
   - Adopted decision: `period_number` is derived in Plan 10-02 `createPeriod()` via `COUNT(*)` of periods for the project in the current year + 1, zero-padded to 2 digits, formatted as `HK-{YYYY}-{NN}`. Computed server-side as a default the user can override.
   - What we know: UI-SPEC says "Auto-suggested: `HK-{YYYY}-{NN}`" and "Free-text, max 50 chars."
   - Implementation note: `COUNT(*) FROM hakedis_periods WHERE project_id = ? AND period_end_date >= '{YYYY}-01-01'`, `count + 1` as NN.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Neon PostgreSQL (neon-http driver) | All DB queries | Confirmed running | PG 16 | None — project depends on Neon |
| drizzle-kit CLI | Migration generation (Wave 1) | ✓ | 0.31.10 | None — required for migration |
| `tsx` (ts-node equivalent) | `npx tsx src/db/migrate.ts` | Confirmed (used by all previous phases) | latest | None — required for migration apply |
| shadcn CLI | `node_modules/.bin/shadcn add switch` | ✓ | 4.8.0 | None (required for Switch component) |
| decimal.js | Display formatting | ✓ | ^10.6.0 | None |

**Missing dependencies with no fallback:** none — all dependencies are confirmed available.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/hakedis.test.ts` |
| Full suite command | `npx vitest run` |
| DB integration tests | Guarded by `describeIfDb` (skips when `TEST_DATABASE_URL` not set) |
| Parallelism | `fileParallelism: false` (sequential — shared DB, FK-safe TRUNCATE) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| HAK-01 | createPeriod() inserts period with draft status + calls computePeriodLines | unit + DB integration | `npx vitest run tests/hakedis.test.ts` | Wave 0: create |
| HAK-02 | period_qty = cumulative − previous (GENERATED column identity) | DB integration | `npx vitest run tests/schema.test.ts` (update existing MM Test 5) | Existing — update |
| HAK-02 | cumulative_qty aggregation is correct for a given period_end_date cutoff | DB integration | `npx vitest run tests/hakedis.test.ts` | Wave 0: create |
| HAK-02 | previous_cumulative from latest FINALIZED period (not draft) | DB integration | `npx vitest run tests/hakedis.test.ts` | Wave 0: create |
| HAK-03 | Deduction chain: gross/KDV/tevkifat/stopaj/teminat/avans/net values match expected | unit (pure SQL) | `npx vitest run tests/hakedis.test.ts` | Wave 0: create |
| HAK-04 | updatePaymentStatus: finalized → submitted → paid valid; draft → submitted invalid | unit + DB integration | `npx vitest run tests/hakedis.test.ts` | Wave 0: create |
| HAK-05 | finalizePeriod sets finalizedAt, prevents recompute/delete on finalized period | DB integration | `npx vitest run tests/hakedis.test.ts` | Wave 0: create |
| HAK-05 | recomputePeriodLines throws on finalized/submitted/paid period | unit | `npx vitest run tests/hakedis.test.ts` | Wave 0: create |
| D-104 | GENERATED column identity: period_qty = cumulative − previous at DB level | DB integration | `npx vitest run tests/schema.test.ts` | Update MM Test 5 |
| D-104 | INSERT with explicit period_qty throws Postgres error | DB integration | `npx vitest run tests/schema.test.ts` | Update MM Test 5 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/hakedis.test.ts` (fast, targeted)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/hakedis.test.ts` — new file; covers HAK-01..HAK-05 integration tests
- [ ] Update `tests/schema.test.ts` Money-Math Test 5 — remove `periodQty` from INSERT values (GENERATED column cannot accept explicit insert)
- [ ] Update `tests/fixtures/db.ts` `truncateAllTables()` — confirm `hakedis_period_lines` and `hakedis_periods` are already in the truncate list (confirmed: already present)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | `auth()` from `@/lib/auth`; redirect on null session |
| V3 Session Management | No | Session managed by Auth.js (no new session logic) |
| V4 Access Control | Yes | Tenant scope via `tenant_id = ${tenantId}` in every query; IDOR guard (verify projectId belongs to tenant before write) |
| V5 Input Validation | Yes | Zod schema validation in all server actions before DB write |
| V6 Cryptography | No | No new cryptographic operations |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR on periodId — access another tenant's period | Information Disclosure | All queries include `AND tenant_id = ${tenantId}`; verified in boq.ts pattern (CR-01) |
| IDOR on projectId — insert period into another tenant's project | Elevation of Privilege | Verify `projects.tenant_id = tenantId` before any INSERT on hakedis_periods |
| Mutating finalized period (recompute, delete) | Tampering | Server action checks `status === 'draft'` before mutating; UI removes controls for non-draft |
| Float arithmetic in deduction chain | Tampering / data integrity | All arithmetic in Postgres `numeric`; decimal.js for display only |
| SQL injection via period label / notes | Tampering | All values bound as Drizzle `sql``` parameters; never `sql.raw()` for user-supplied input |
| Cross-tenant activity log write | Information Disclosure | `logOfficeActivity()` uses `getDefaultTenantId()` — tenant-scoped automatically |

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: src/db/schema/hakedis-periods.ts] — existing period schema, confirmed missing deduction columns
- [VERIFIED: src/db/schema/hakedis-period-lines.ts] — WR-03 comment confirming GENERATED column requirement, existing CHECK constraints
- [VERIFIED: src/db/migrations/0004_v2_data_foundation.sql] — cumulative_check hand-edited CHECK constraint
- [VERIFIED: src/db/migrations/0006_v2_period_qty_check.sql] — period_qty_nonneg CHECK (to be auto-dropped when column dropped)
- [VERIFIED: src/db/migrations/0007_v2_tenant_settings.sql] — established hand-edit migration pattern with UNIQUE + seed INSERT
- [VERIFIED: src/db/migrate.ts] — confirmed migration runner: tsx src/db/migrate.ts with neon-http `migrate()`
- [VERIFIED: src/actions/analytics.ts] — Istanbul-tz pattern, cumulative-qty aggregation idioms, auth+tenant guard pattern
- [VERIFIED: src/actions/settings.ts] — canonical Server Action pattern: auth + zod + revalidatePath
- [VERIFIED: src/lib/log-office-activity.ts] — logOfficeActivity fire-and-forget via after()
- [VERIFIED: src/db/schema/office-activity-log.ts] — confirmed `hakedis_period_deleted` is MISSING from OFFICE_ACTION_TYPES
- [VERIFIED: package.json] — drizzle-orm 0.45.2, decimal.js ^10.6.0, next-intl ^4.12.0, shadcn 4.8.0
- [VERIFIED: runtime introspection] — `drizzle-orm/pg-core` numeric column has `.generatedAlwaysAs()` method producing `{ type: 'always', mode: 'stored' }` config
- [VERIFIED: src/components/ui/] — `switch.tsx` absent; all other UI-SPEC components present
- [VERIFIED: tests/schema.test.ts] — existing Money-Math Test 5 explicitly inserts `period_qty`; must be updated

### Secondary (MEDIUM confidence)
- [CITED: 10-UI-SPEC.md] — Component inventory, copywriting contract, i18n namespace, accessibility contract

---

## Metadata

**Confidence breakdown:**
- Migration mechanics: HIGH — confirmed from 3 existing hand-edited migration files + confirmed migrate.ts runner
- GENERATED column API: HIGH — verified at runtime via Node.js introspection of installed drizzle-orm 0.45.2
- Deduction chain: HIGH — locked decision D-90; SQL is straightforward Postgres numeric arithmetic
- Server action patterns: HIGH — verified from 3 existing action files
- UI wiring: HIGH — UI-SPEC is fully specified; shadcn components confirmed installed/absent
- drizzle-kit GENERATED DDL emission: MEDIUM — API exists but DDL output not tested (A1)

**Research date:** 2026-05-28
**Valid until:** 2026-06-28 (stable stack; drizzle-orm version pinned)
