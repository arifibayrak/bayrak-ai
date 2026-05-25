# Phase 7: Data Foundation & Canonical Record — Research

**Researched:** 2026-05-25
**Domain:** Drizzle + Neon/Postgres schema migration, multi-currency earned-value math, office-activity logging, hakkediş table design, typed aggregation layer
**Confidence:** HIGH — grounded in live codebase inspection of all schema files, migration runner, existing Server Actions, and test infrastructure; multi-currency design resolved below.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COST-01 | Office engineer can set unit price and currency per BOQ line item | § Schema: `unit_price` + `currency_code` columns on `boq_items`; `setUnitPrice()` Server Action |
| COST-02 | System computes contracted value (BAC) and earned value (EV) per project / BOQ item | § Aggregation: `getProjectMetrics()` using Postgres `SUM(planned_qty * unit_price)` / `SUM(approved_qty * unit_price)` grouped by `currency_code` |
| COST-03 | System shows % complete by value (EV / BAC) per project and per BOQ item | § `getProjectMetrics()` returns `ev_by_currency`, `bac_by_currency` maps; % computed in component from same-currency pairs |
| COST-04 | System shows per-worker value contribution | § `getPersonMetrics()` — `SUM(quantity * unit_price) FILTER (WHERE status='approved')` grouped by `currency_code`, joined to `assignments` |
| COST-05 | System shows rework / rejected value (waste indicator) | § `getProjectMetrics()` — `SUM(quantity * unit_price) FILTER (WHERE status='rejected')` grouped by `currency_code` |
| PERF-03 | Office-engineer actions recorded in activity log; shown as scorecard | § `office_activity_log` table; `logOfficeActivity()` helper; `getOfficeActivityLog()` query |
</phase_requirements>

---

## Summary

Phase 7 is the money-safe data foundation that every downstream v2.0 phase depends on. It has three concrete deliverables: (1) schema migrations — adding `unit_price` + `currency_code` to `boq_items`, plus three new tables (`office_activity_log`, `hakedis_periods`, `hakedis_period_lines`); (2) a shared `CanonicalSubmission` TypeScript type plus four typed aggregation functions; and (3) wiring `logOfficeActivity()` into the four existing Server Action files.

The most important architectural decision in this phase is **multi-currency aggregation**. The locked decision (COST-01) mandates that each BOQ item carries its own currency. This means every value rollup — BAC, EV, value contribution, rework cost — **must be grouped by currency and returned as a map keyed by ISO-4217 code**, never summed across currencies. A project with mixed TRY/USD BOQ items cannot produce a single "total earned value" number — it produces two separate totals. All aggregation functions must reflect this.

The secondary discipline is money math: Drizzle returns `numeric` columns as JavaScript strings. All multiplication and summation must happen in Postgres (`SUM(quantity * unit_price)`). `decimal.js` is the library for any JS-side display formatting. No `parseFloat()` accumulation loops.

The migration path is: `drizzle-kit generate` for the three non-spatial, no-CHECK-constraint tables and the `unit_price`/`currency_code` column additions; then a **hand-written** `0004_v2_indexes.sql` for the partial indexes that `drizzle-kit` cannot emit (same pattern as `0003_slippery_prowler.sql`). All migrations applied via `tsx src/db/migrate.ts` — never `drizzle-kit push` (D-49, spatial_ref_sys permission error blocks it permanently).

**Primary recommendation:** Implement migrations in one `drizzle-kit generate` pass covering all four schema changes simultaneously, then write the index file by hand. This produces two migration files (0004_*.sql generated + 0004_v2_indexes.sql hand-written — rename the generated one to 0004 and the index file to 0005, or use a single combined hand-written file for clarity).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Schema migration (unit_price, currency, new tables) | Database / Storage | — | Pure DDL; no UI or API involvement |
| Aggregation functions (getProjectMetrics etc.) | API / Backend (Server Actions) | — | Auth-guarded, tenant-scoped; raw SQL via `db.execute()` |
| CanonicalSubmission type definition | API / Backend (shared type) | — | Consumed by Server Actions, exports, hakkediş engine |
| logOfficeActivity() | API / Backend (Server Actions) | — | Called after successful mutation; uses `next/server after()` |
| unit_price field in BOQ UI | Frontend Server (Server Components) | Browser (form state) | Form field in existing BoqItemDialog; value sent via Server Action |
| Multi-currency rollup display | Browser / Client | Frontend Server | Server fetches grouped map; client formats per-currency totals |

---

## Standard Stack

### Core (already installed — no new installs required for schema + aggregation)
| Library | Installed Version | Purpose | Why Standard |
|---------|------------------|---------|--------------|
| drizzle-orm | 0.45.2 | Schema definition, query builder | Project ORM — all tables use this |
| drizzle-kit | 0.31.10 | Migration codegen | `drizzle-kit generate` produces SQL files |
| @neondatabase/serverless | 1.1.0 | Neon HTTP driver | Used in migrate.ts and all Server Actions |
| next (App Router) | 15.5.18 | Server Actions, `after()` | `after()` confirmed available in 15.5.18 |
| vitest | 4.1.7 | Test runner | Existing test infrastructure |

### Net-New Install Required
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| decimal.js | 10.6.0 | JS-side money display | Drizzle returns `numeric` as strings; decimal.js prevents float drift in display formatting |

**`decimal.js` is the ONLY new package this phase installs.** Everything else is already in `package.json`.

**Installation:**
```bash
npm install decimal.js
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| decimal.js | big.js | big.js is smaller but lacks `toDecimalPlaces()` and `toSignificantDigits()` convenience methods. decimal.js is the documented choice in STACK.md. |
| decimal.js | Keeping all math in Postgres | Correct for aggregation; decimal.js still needed for display-layer formatting (e.g., KDV calculation shown in UI before server round-trip) |

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| decimal.js | npm | 11 yrs (2014-04-02) | ~15M/wk [ASSUMED: from npmjs trends] | github.com/MikeMcl/decimal.js | unavailable | Approved — well-known author (Mike McFadyen), no postinstall script, 10.6.0 published 2025-07-06 |

slopcheck was not installable in this environment. `decimal.js` is tagged `[ASSUMED]` for the slopcheck verdict, but it is independently verified:
- [VERIFIED: npm registry] — `npm view decimal.js` returns name/version/homepage correctly
- Author Mike McFadyen maintains the complementary `big.js` and `bignumber.js` libraries — well-known ecosystem participant
- No `postinstall` script: `npm view decimal.js scripts.postinstall` returns nothing
- Created 2014; 10.x has been stable since 2016

**Packages removed due to [SLOP] verdict:** none
**Packages flagged [SUS]:** none

*slopcheck was unavailable at research time. `decimal.js` is `[ASSUMED]` for slopcheck status; the planner should treat the install as approved given the registry/age/author evidence above.*

---

## The Multi-Currency Decision (COST-01..05)

This is the most architecturally important decision in Phase 7. The ARCHITECTURE.md research (written before the locked decisions) assumed TRY-only with no currency column. That assumption is now **wrong**. The locked decision mandates per-item currency. The following design resolves it.

### Currency Column Placement

**Decision: Add `currency_code text NOT NULL DEFAULT 'TRY'` to `boq_items`.**

Rationale:
- Currency is a property of a BOQ item's unit price, not of a project. A project can have TRY-priced pipeline and USD-priced imported fittings. Storing currency at the item level is the only correct placement.
- `DEFAULT 'TRY'` means all existing v1 rows are automatically valid after migration — no backfill required.
- ISO-4217 3-letter codes stored as `text` (not an enum) — new currencies added without a schema migration.
- Single-tenant MVP: no cross-tenant currency isolation needed now.

**No `project_default_currency` column** — this would be confusing when items override it, and the v1 BOQ import currently has no currency field, so defaulting to TRY at item level is cleaner.

### How Value Aggregates Across Mixed Currencies

**Rule: You CANNOT sum earned value across currencies. All rollup functions return a `Record<string, string>` map keyed by currency_code.**

```typescript
// Wrong — unsummable:
{ total_earned_value: "1234567.89" }

// Correct — currency-grouped:
{
  earned_value_by_currency: { "TRY": "1234567.89", "USD": "45678.90" },
  bac_by_currency:          { "TRY": "9876543.21", "USD": "100000.00" },
}
```

This means:
- `getProjectMetrics()` returns `evByCurrency: Record<string, string>` and `bacByCurrency: Record<string, string>`
- UI components iterate over the keys and render one progress bar / value line per currency
- A project with only TRY items renders as a single-currency project (the common case)
- Hakkediş periods **must** be scoped to a single currency (user selects currency when creating a period); period lines all carry the same currency

### The Hakedis Period Currency Constraint

Add `currency_code text NOT NULL DEFAULT 'TRY'` to `hakedis_periods`. When `computePeriodLines()` runs, it only aggregates BOQ items where `boq_items.currency_code = hakedis_periods.currency_code`. This prevents a multi-currency project from producing a nonsensical mixed-currency hakkediş certificate.

---

## Schema Changes — Exact Definitions

### 1. `boq_items` — Add `unit_price` and `currency_code`

**Modify:** `src/db/schema/boq-items.ts`

```typescript
// Replace the D-06 comment with actual columns:
unitPrice: numeric('unit_price', { precision: 15, scale: 4 }),  // nullable — v1 rows have no price
currencyCode: text('currency_code').notNull().default('TRY'),   // ISO-4217; TRY is the default
```

Precision rationale: `numeric(15,4)` — handles TRY billions (construction contract values up to 99,999,999,999.9999), four decimal places for sub-kuruş precision in unit prices. This is more precise than the commented-out `numeric(12,2)` in the original D-06 comment — use `(15,4)`.

**Migration SQL (drizzle-kit generate will emit):**
```sql
ALTER TABLE "boq_items" ADD COLUMN "unit_price" numeric(15, 4);
ALTER TABLE "boq_items" ADD COLUMN "currency_code" text NOT NULL DEFAULT 'TRY';
```

No CHECK constraint needed on `currency_code` for MVP — extensibility over strictness. No hand-editing required for this migration.

---

### 2. `office_activity_log` — New Table

**New file:** `src/db/schema/office-activity-log.ts`

```typescript
import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './auth';        // Auth.js users — text PK
import { tenants } from './tenants';
import { projects } from './projects';

// Narrow event taxonomy — extend by adding values here, never in ad-hoc log calls.
// text (not pg enum) — adding new values does not require a schema migration.
export const OFFICE_ACTION_TYPES = [
  'project_created',
  'project_updated',
  'project_deleted',
  'boq_item_created',
  'boq_item_updated',
  'boq_item_deleted',
  'boq_imported',
  'unit_price_set',
  'route_uploaded',
  'person_approved',
  'person_assigned',
  'person_unassigned',
  'hakedis_period_created',
  'hakedis_period_finalized',
  'hakedis_exported',
] as const;

export type OfficeActionType = (typeof OFFICE_ACTION_TYPES)[number];

export const officeActivityLog = pgTable('office_activity_log', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').references(() => tenants.id),
  // FK to Auth.js users table — text PK, NOT people.id (uuid)
  actorUserId:  text('actor_user_id').notNull().references(() => users.id),
  actionType:   text('action_type').notNull(),    // one of OFFICE_ACTION_TYPES
  entityType:   text('entity_type').notNull(),    // 'project' | 'boq_item' | 'person' | 'hakedis_period'
  entityId:     text('entity_id'),               // uuid of affected row; nullable for bulk ops
  projectId:    uuid('project_id').references(() => projects.id),  // nullable for cross-project actions
  metadata:     jsonb('metadata'),               // structured context (see examples below)
  occurredAt:   timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('office_activity_log_actor_idx').on(t.actorUserId),
  index('office_activity_log_project_idx').on(t.projectId),
  index('office_activity_log_action_idx').on(t.actionType),
  index('office_activity_log_occurred_idx').on(t.occurredAt),
]);
```

**Critical FK note:** `actorUserId` references `users.id` which is `text` (Auth.js uses `crypto.randomUUID()` as a string PK — confirmed in `src/db/schema/auth.ts`). Do NOT reference `people.id` (uuid) — office engineers authenticate via Auth.js, not via the people/Telegram flow.

**`metadata` JSONB examples by action type:**
- `unit_price_set`: `{ boqItemId: "uuid", oldPrice: null, newPrice: "1250.0000", currencyCode: "TRY", material: "DN200 HDPE" }`
- `boq_imported`: `{ rowCount: 42, fileName: "BOQ-Q1.xlsx" }`
- `person_assigned`: `{ personId: "uuid", role: "worker", displayName: "Ahmet Yılmaz" }`
- `hakedis_period_created`: `{ periodId: "uuid", periodNumber: "HK-2026-01" }`

**Migration:** `drizzle-kit generate` handles this. No spatial columns, no CHECK constraints requiring hand-editing.

---

### 3. `hakedis_periods` — New Table

**New file:** `src/db/schema/hakedis-periods.ts`

```typescript
import { pgTable, uuid, text, numeric, timestamp, date, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { projects } from './projects';
import { users } from './auth';

export const HAKEDIS_STATUSES = ['draft', 'finalized', 'submitted', 'paid'] as const;
export type HakedisStatus = (typeof HAKEDIS_STATUSES)[number];

export const hakedisPeriods = pgTable('hakedis_periods', {
  id:              uuid('id').primaryKey().defaultRandom(),
  tenantId:        uuid('tenant_id').references(() => tenants.id),
  projectId:       uuid('project_id').notNull().references(() => projects.id, { onDelete: 'restrict' }),
  periodNumber:    text('period_number').notNull(),          // "HK-2026-01" — human label
  periodStartDate: date('period_start_date').notNull(),      // inclusive; stored as date (no tz)
  periodEndDate:   date('period_end_date').notNull(),        // inclusive
  // Currency scope: period only aggregates BOQ items with this currency_code
  // Prevents mixed-currency summation in a single hakkediş certificate
  currencyCode:    text('currency_code').notNull().default('TRY'),
  status:          text('status').notNull().default('draft'),
  notes:           text('notes'),
  // Configurable deduction rates — stored as numeric strings, not hardcoded
  kdvRate:         numeric('kdv_rate', { precision: 5, scale: 4 }).notNull().default('0.2000'),
  retentionRate:   numeric('retention_rate', { precision: 5, scale: 4 }).notNull().default('0.0500'),
  // tevkifat fraction stored separately — requires accountant confirmation (Phase 10)
  // tevkifatFraction: numeric('tevkifat_fraction', { precision: 5, scale: 4 }) — Phase 10 only
  createdByUserId: text('created_by_user_id').references(() => users.id),
  finalizedAt:     timestamp('finalized_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('hakedis_periods_project_idx').on(t.projectId),
  index('hakedis_periods_status_idx').on(t.status),
  index('hakedis_periods_currency_idx').on(t.projectId, t.currencyCode),
]);
```

**Why `date` not `timestamp` for period dates:** Hakkediş periods are calendar-day-bounded, not timestamp-bounded. The Istanbul-timezone conversion (UTC+3) happens when the office engineer enters dates in the UI; the stored `date` is the Istanbul calendar date. This avoids the timezone ambiguity that `timestamp` creates at midnight.

---

### 4. `hakedis_period_lines` — New Table

**New file:** `src/db/schema/hakedis-period-lines.ts`

```typescript
import { pgTable, uuid, text, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { hakedisPeriods } from './hakedis-periods';
import { boqItems } from './boq-items';

export const hakedisperiodlines = pgTable('hakedis_period_lines', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  tenantId:              uuid('tenant_id').references(() => tenants.id),
  periodId:              uuid('period_id').notNull().references(() => hakedisPeriods.id, { onDelete: 'cascade' }),
  boqItemId:             uuid('boq_item_id').notNull().references(() => boqItems.id, { onDelete: 'restrict' }),

  // ── Snapshot fields — immutable after finalization ─────────────────────────
  materialSnapshot:      text('material_snapshot').notNull(),
  unitSnapshot:          text('unit_snapshot').notNull(),
  currencyCodeSnapshot:  text('currency_code_snapshot').notNull(),   // locked at compute time
  unitPriceSnapshot:     numeric('unit_price_snapshot', { precision: 15, scale: 4 }).notNull(),

  // ── Quantity columns ────────────────────────────────────────────────────────
  // Both stored so the cumulative model (yeşil defter) is auditable.
  // DB CHECK: cumulative_qty_approved >= previous_cumulative_qty (enforced via hand-edited migration)
  cumulativeQtyApproved: numeric('cumulative_qty_approved', { precision: 12, scale: 3 }).notNull(),
  previousCumulativeQty: numeric('previous_cumulative_qty', { precision: 12, scale: 3 }).notNull().default('0'),
  periodQty:             numeric('period_qty', { precision: 12, scale: 3 }).notNull(),
  // periodQty = cumulativeQtyApproved - previousCumulativeQty (enforced in computePeriodLines())

  // ── Computed value columns — stored for post-finalization immutability ──────
  // All multiplication happens in Postgres (money-math rule)
  periodValue:           numeric('period_value', { precision: 15, scale: 2 }).notNull(),
  cumulativeValue:       numeric('cumulative_value', { precision: 15, scale: 2 }).notNull(),

  createdAt:             timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('hakedis_period_lines_period_idx').on(t.periodId),
  index('hakedis_period_lines_boq_idx').on(t.boqItemId),
]);
```

**The CHECK constraint** `CHECK (cumulative_qty_approved >= previous_cumulative_qty)` **cannot be emitted by `drizzle-kit generate`.** It must be added by hand-editing the migration SQL file, following the exact same pattern as `0003_slippery_prowler.sql`. See Migration Strategy section below.

---

### 5. Migration Strategy — Exact Sequence

The project has migrations `0000` through `0003`. The next migration number is `0004`.

**Step 1 — Schema edits:**
- Edit `src/db/schema/boq-items.ts` (uncomment/replace D-06 comment with real columns)
- Create `src/db/schema/office-activity-log.ts`
- Create `src/db/schema/hakedis-periods.ts`
- Create `src/db/schema/hakedis-period-lines.ts`
- Edit `src/db/schema/index.ts` (add three new barrel exports)

**Step 2 — Generate:**
```bash
npx drizzle-kit generate
```
This produces one file: `src/db/migrations/0004_<random>.sql` covering all four schema changes. Rename it to `0004_v2_data_foundation.sql` for clarity (the `meta/` journal tracks by the name).

**Step 3 — Hand-edit 0004_v2_data_foundation.sql:**
Add the CHECK constraint on `hakedis_period_lines` at the bottom of the generated file:
```sql
-- HAND-EDITED: drizzle-kit cannot emit CHECK constraints on numeric columns.
-- Prevents negative period quantities (double-billing guard).
ALTER TABLE "hakedis_period_lines"
  ADD CONSTRAINT "hakedis_period_lines_cumulative_check"
  CHECK (cumulative_qty_approved >= previous_cumulative_qty);
```
Mark the file header: `-- HAND-VERIFIED (2026-05-XX): CHECK constraint added manually...`

**Step 4 — Create index migration:**
Create `src/db/migrations/0005_v2_indexes.sql` by hand (drizzle-kit cannot emit partial indexes):
```sql
-- HAND-WRITTEN: Phase 7 analytics indexes (drizzle-kit cannot emit partial indexes).
-- Partial index syntax requires WHERE clause — not supported by drizzle-kit generate.

-- Composite index: analytics primary filter (status + submitted_at)
CREATE INDEX "submissions_status_submitted_idx"
  ON "submissions" (status, submitted_at DESC);

-- Partial index: pending-audit dashboard alert (hits on every overview load)
CREATE INDEX "submissions_pending_idx"
  ON "submissions" (project_id, submitted_at DESC)
  WHERE status = 'pending_audit';

-- Partial index: auditor scorecard (decided_by + decided_at for decided submissions only)
CREATE INDEX "submissions_decided_by_idx"
  ON "submissions" (decided_by, decided_at DESC)
  WHERE decided_by IS NOT NULL;

-- Composite index: per-person analytics (person + status + date)
CREATE INDEX "submissions_person_status_date_idx"
  ON "submissions" (person_id, status, submitted_at DESC);

-- Composite index: per-project value aggregation (project + status + boq_item)
CREATE INDEX "submissions_project_status_boq_idx"
  ON "submissions" (project_id, status, boq_item_id);
```

**Step 5 — Apply:**
```bash
tsx src/db/migrate.ts
```
The migrate runner picks up all `.sql` files in `src/db/migrations/` alphabetically. `0004_v2_data_foundation.sql` runs before `0005_v2_indexes.sql` — correct order.

**Critical: Do NOT run `drizzle-kit push`.** D-49 — spatial_ref_sys permission error from the existing PostGIS setup blocks `push` permanently. `tsx src/db/migrate.ts` is the only valid runner.

---

## CanonicalSubmission Type

**New file:** `src/lib/types/canonical-submission.ts`

```typescript
// The single shared submission record shape.
// Consumed by: analytics queries, table display, Excel export, hakkediş line computation.
// All numerics arrive from Postgres as strings (Drizzle numeric behavior) —
// parse with decimal.js for display; pass to Postgres for aggregation.
export type CanonicalSubmission = {
  id: string;
  projectId: string;
  projectName: string;
  personId: string;             // people.id (uuid)
  workerName: string;           // people.display_name
  auditorName: string | null;   // people.display_name of decided_by; null if pending
  boqItemId: string;
  material: string;
  unit: string;
  unitPrice: string | null;     // numeric string from DB; null if not set; use decimal.js for display
  currencyCode: string;         // ISO-4217 e.g. 'TRY', 'USD'
  quantity: string;             // numeric string from DB; parse before display
  earnedValue: string | null;   // quantity * unit_price computed in Postgres; null if no price
  status: 'pending_audit' | 'approved' | 'rejected';
  submittedAt: string;          // ISO 8601
  decidedAt: string | null;
  auditLatencyHours: number | null;  // float: (decidedAt - submittedAt) / 3600; null if pending
  locationMatch: 'near' | 'far' | 'no_route' | null;
  locationDistanceM: string | null;  // numeric string; metres
  photoUrl: string;
  notes: string | null;
  rejectionReason: string | null;
};
```

**Why `unitPrice` and `quantity` are strings:** Drizzle returns `numeric` columns as strings (confirmed behavior — issues #570, #1042). Keeping them as strings at the type boundary forces callers to explicitly parse via `decimal.js`, preventing silent float coercion.

**New barrel:** `src/lib/types/index.ts`
```typescript
export type { CanonicalSubmission } from './canonical-submission';
```

---

## Aggregation Functions — Exact Signatures and SQL

**New file:** `src/actions/analytics.ts`

### Pattern: auth + tenant scope (same as all existing Server Actions)
```typescript
'use server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';
```

### `getCanonicalSubmissions()`

```typescript
type SubmissionFilters = {
  projectIds?: string[];   // undefined = all projects for tenant
  from?: Date;             // inclusive lower bound (Istanbul-aware)
  to?: Date;               // exclusive upper bound
  status?: 'pending_audit' | 'approved' | 'rejected';
  personId?: string;
};

export async function getCanonicalSubmissions(
  filters: SubmissionFilters = {}
): Promise<CanonicalSubmission[]>
```

**SQL approach:**
```sql
SELECT
  s.id,
  s.project_id,
  p.name                                                    AS project_name,
  s.person_id,
  w.display_name                                            AS worker_name,
  aud.display_name                                          AS auditor_name,
  s.boq_item_id,
  b.material,
  b.unit,
  b.unit_price,                          -- kept as text (numeric string); no ::float8 cast
  b.currency_code,
  s.quantity,                            -- kept as text; no ::float8 cast
  CASE
    WHEN b.unit_price IS NOT NULL
    THEN (s.quantity::numeric * b.unit_price::numeric)::text
    ELSE NULL
  END                                                       AS earned_value,
  s.status,
  s.submitted_at,
  s.decided_at,
  CASE
    WHEN s.decided_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (s.decided_at - s.submitted_at)) / 3600.0
    ELSE NULL
  END                                                       AS audit_latency_hours,
  s.location_match,
  s.location_distance_m,
  s.photo_url,
  s.notes,
  s.rejection_reason
FROM submissions s
JOIN   projects  p   ON p.id = s.project_id
JOIN   people    w   ON w.id = s.person_id
JOIN   boq_items b   ON b.id = s.boq_item_id
LEFT JOIN people aud ON aud.id = s.decided_by
WHERE  s.tenant_id = ${tenantId}
  -- dynamic filter clauses appended in TypeScript
ORDER BY s.submitted_at DESC
```

**No `::float8` cast on unit_price or quantity** — keeps values as Postgres numeric strings, which Drizzle returns as strings matching the `CanonicalSubmission` type.

### `getProjectMetrics()`

```typescript
type ProjectMetrics = {
  projectId: string;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  avgAuditLatencyHours: number | null;  // decided submissions only
  locationWarningCount: number;
  rejectionRate: number | null;         // rejected / (approved + rejected)
  // Currency-grouped value maps — never a single sum across currencies
  evByCurrency: Record<string, string>;   // currency_code → earned value (numeric string)
  bacByCurrency: Record<string, string>;  // currency_code → budget at completion
  reworkValueByCurrency: Record<string, string>;  // COST-05: rejected value by currency
};

export async function getProjectMetrics(
  projectId: string,
  dateRange?: { from: Date; to: Date }
): Promise<ProjectMetrics>
```

**SQL approach — two queries:**

Query 1 (counts + SLA, no currency grouping):
```sql
SELECT
  COUNT(*) FILTER (WHERE s.status = 'approved')                       AS approved_count,
  COUNT(*) FILTER (WHERE s.status = 'rejected')                       AS rejected_count,
  COUNT(*) FILTER (WHERE s.status = 'pending_audit')                  AS pending_count,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (s.decided_at - s.submitted_at)) / 3600.0)
    FILTER (WHERE s.decided_at IS NOT NULL), 2
  )                                                                   AS avg_audit_latency_hours,
  COUNT(*) FILTER (WHERE s.location_warning = true)                   AS location_warning_count,
  COUNT(*) FILTER (WHERE s.status = 'rejected')::float
    / NULLIF(COUNT(*) FILTER (WHERE s.status IN ('approved','rejected')), 0)
                                                                      AS rejection_rate
FROM submissions s
WHERE s.project_id = ${projectId}
  AND s.tenant_id  = ${tenantId}
  -- optional date bounds
```

Query 2 (currency-grouped values):
```sql
SELECT
  b.currency_code,
  SUM(s.quantity::numeric * b.unit_price::numeric)
    FILTER (WHERE s.status = 'approved' AND b.unit_price IS NOT NULL)   AS earned_value,
  SUM(b.planned_qty::numeric * b.unit_price::numeric)
    FILTER (WHERE b.unit_price IS NOT NULL)                             AS bac,
  SUM(s.quantity::numeric * b.unit_price::numeric)
    FILTER (WHERE s.status = 'rejected' AND b.unit_price IS NOT NULL)   AS rework_value
FROM submissions s
JOIN boq_items b ON b.id = s.boq_item_id
WHERE s.project_id = ${projectId}
  AND s.tenant_id  = ${tenantId}
GROUP BY b.currency_code
```

Merge in TypeScript: reduce the currency rows into `evByCurrency`, `bacByCurrency`, `reworkValueByCurrency` maps. Values remain as numeric strings.

### `getPersonMetrics()`

```typescript
type PersonMetrics = {
  personId: string;
  displayName: string;
  // Worker metrics
  submissionsApproved: number;
  submissionsRejected: number;
  submissionsPending: number;
  locationComplianceRate: number | null;  // approved with location_match='near' / total approved
  // Value contribution — currency-grouped (COST-04)
  valueContributedByCurrency: Record<string, string>;
  // Auditor metrics (only populated when querying auditor decisions)
  decisionsCount?: number;
  avgDecisionLatencyHours?: number | null;
  pendingBacklogCount?: number;
};

export async function getPersonMetrics(
  personId: string,
  options?: { projectIds?: string[]; asAuditor?: boolean }
): Promise<PersonMetrics>
```

**Worker SQL:**
```sql
SELECT
  s.person_id,
  w.display_name,
  COUNT(*) FILTER (WHERE s.status = 'approved')                        AS submissions_approved,
  COUNT(*) FILTER (WHERE s.status = 'rejected')                        AS submissions_rejected,
  COUNT(*) FILTER (WHERE s.status = 'pending_audit')                   AS submissions_pending,
  COUNT(*) FILTER (WHERE s.status = 'approved' AND s.location_match = 'near')::float
    / NULLIF(COUNT(*) FILTER (WHERE s.status = 'approved'), 0)         AS location_compliance_rate
FROM submissions s
JOIN people w ON w.id = s.person_id
WHERE s.person_id = ${personId}
  AND s.tenant_id = ${tenantId}
GROUP BY s.person_id, w.display_name
```

**Value contribution SQL (separate, currency-grouped):**
```sql
SELECT
  b.currency_code,
  SUM(s.quantity::numeric * b.unit_price::numeric)
    FILTER (WHERE s.status = 'approved' AND b.unit_price IS NOT NULL)  AS value_contributed
FROM submissions s
JOIN boq_items b ON b.id = s.boq_item_id
WHERE s.person_id = ${personId}
  AND s.tenant_id = ${tenantId}
  AND s.status = 'approved'
GROUP BY b.currency_code
```

**Auditor SQL (when `asAuditor: true`):**
```sql
SELECT
  COUNT(*)                                                             AS decisions_count,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (s.decided_at - s.submitted_at)) / 3600.0)
    FILTER (WHERE s.decided_at IS NOT NULL), 2
  )                                                                   AS avg_decision_latency_hours
FROM submissions s
WHERE s.decided_by = ${personId}   -- decided_by is a people.id (uuid)
  AND s.tenant_id  = ${tenantId}
  AND s.status IN ('approved', 'rejected')
```

Pending backlog count (separate — never mix with decided avg):
```sql
SELECT COUNT(*) AS pending_backlog_count
FROM submissions s
WHERE s.project_id IN (
  SELECT project_id FROM assignments
  WHERE person_id = ${personId} AND role_on_project = 'auditor'
)
AND s.status = 'pending_audit'
AND s.tenant_id = ${tenantId}
```

### `getPortfolioOverview()`

```typescript
type ProjectSummary = {
  projectId: string;
  projectName: string;
  approvedCount: number;
  pendingCount: number;
  // Value grouped by currency — cannot sum across currencies
  contractedValueByCurrency: Record<string, string>;
  earnedValueByCurrency: Record<string, string>;
};

export async function getPortfolioOverview(): Promise<ProjectSummary[]>
```

**SQL — single query returning one row per project per currency:**
```sql
SELECT
  p.id                                                               AS project_id,
  p.name                                                             AS project_name,
  b.currency_code,
  COUNT(s.id) FILTER (WHERE s.status = 'approved')                   AS approved_count,
  COUNT(s.id) FILTER (WHERE s.status = 'pending_audit')              AS pending_count,
  SUM(b.planned_qty::numeric * b.unit_price::numeric)
    FILTER (WHERE b.unit_price IS NOT NULL)                          AS contracted_value,
  SUM(b.approved_qty::numeric * b.unit_price::numeric)
    FILTER (WHERE b.unit_price IS NOT NULL)                          AS earned_value
FROM projects p
LEFT JOIN submissions s ON s.project_id = p.id AND s.tenant_id = ${tenantId}
LEFT JOIN boq_items   b ON b.project_id = p.id AND b.tenant_id = ${tenantId}
WHERE p.tenant_id = ${tenantId}
GROUP BY p.id, p.name, b.currency_code
ORDER BY p.name, b.currency_code
```

Merge in TypeScript: group rows by `projectId`, accumulate `contractedValueByCurrency` and `earnedValueByCurrency` maps. Return `ProjectSummary[]`.

### `getOfficeActivityLog()` (for PERF-03 scorecard)

```typescript
type ActivityLogEntry = {
  id: string;
  actorUserId: string;
  actorEmail: string | null;   // joined from users table
  actionType: string;
  entityType: string;
  entityId: string | null;
  projectId: string | null;
  projectName: string | null;  // joined from projects
  metadata: Record<string, unknown> | null;
  occurredAt: string;
};

export async function getOfficeActivityLog(options?: {
  actorUserId?: string;
  projectId?: string;
  limit?: number;   // default 50
  from?: Date;
  to?: Date;
}): Promise<ActivityLogEntry[]>
```

---

## `logOfficeActivity()` — Helper and Wiring

### Helper function

**New file:** `src/lib/log-office-activity.ts`

```typescript
import { after } from 'next/server';
import { db } from '@/db';
import { officeActivityLog, type OfficeActionType } from '@/db/schema/office-activity-log';
import { getDefaultTenantId } from '@/lib/tenant';

type LogParams = {
  actorUserId: string;
  actionType: OfficeActionType;
  entityType: string;
  entityId?: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * logOfficeActivity — fire-and-forget office-engineer action logger.
 *
 * Uses next/server `after()` to defer the DB INSERT until after the response
 * is sent. The primary Server Action NEVER blocks on or fails due to log writes.
 *
 * Call AFTER the primary DB write succeeds. Pass session.user.id as actorUserId.
 */
export function logOfficeActivity(params: LogParams): void {
  after(async () => {
    try {
      await db.insert(officeActivityLog).values({
        tenantId: getDefaultTenantId(),
        actorUserId: params.actorUserId,
        actionType: params.actionType,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        projectId: params.projectId ?? null,
        metadata: params.metadata ?? null,
      });
    } catch {
      // Swallow log errors — never propagate to the caller.
      // The primary mutation already succeeded.
    }
  });
}
```

**`next/server after()` confirmed available:** Next.js 15.5.18 exports `after` from `next/dist/server/after` (verified via `node -e` in this codebase's `node_modules`). Import path: `import { after } from 'next/server'`.

### Wiring into existing Server Actions

Four files require wiring. In each, add `logOfficeActivity()` call after the primary DB write succeeds. The call is synchronous (schedules async work); it does not need `await`.

**`src/actions/projects.ts`** — add after `createProject`, `updateProject`, `deleteProject`:
```typescript
import { logOfficeActivity } from '@/lib/log-office-activity';

// In createProject, after db.insert:
logOfficeActivity({
  actorUserId: session.user.id,
  actionType: 'project_created',
  entityType: 'project',
  entityId: project.id,
  metadata: { name: project.name },
});
```

**`src/actions/boq.ts`** — add after `addBoqItem`, `updateBoqItem`, `deleteBoqItem`, `confirmBoqImport`. Also add new `setUnitPrice()` action (see below).

**`src/actions/people.ts`** — add after person approval and assignment mutations.

**`src/actions/routes.ts`** — add `route_uploaded` on successful route upload.

### New `setUnitPrice()` Server Action

Add to `src/actions/boq.ts`:

```typescript
export async function setUnitPrice(params: {
  boqItemId: string;
  unitPrice: string | null;   // numeric string or null to clear
  currencyCode: string;       // ISO-4217
}) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // Validate numeric format
  if (params.unitPrice !== null) {
    const val = parseFloat(params.unitPrice);
    if (isNaN(val) || val < 0) {
      return { ok: false as const, error: 'Unit price must be a non-negative number' };
    }
  }

  // Fetch old price for activity log metadata + project for revalidation
  const [old] = await db
    .select({ unitPrice: boqItems.unitPrice, projectId: boqItems.projectId })
    .from(boqItems)
    .where(and(eq(boqItems.id, params.boqItemId), eq(boqItems.tenantId, getDefaultTenantId())))
    .limit(1);

  if (!old) return { ok: false as const, error: 'BOQ item not found' };

  await db
    .update(boqItems)
    .set({ unitPrice: params.unitPrice, currencyCode: params.currencyCode })
    .where(and(eq(boqItems.id, params.boqItemId), eq(boqItems.tenantId, getDefaultTenantId())));

  logOfficeActivity({
    actorUserId: session.user.id,
    actionType: 'unit_price_set',
    entityType: 'boq_item',
    entityId: params.boqItemId,
    projectId: old.projectId,
    metadata: {
      oldPrice: old.unitPrice,
      newPrice: params.unitPrice,
      currencyCode: params.currencyCode,
    },
  });

  revalidatePath(`/dashboard/projects/${old.projectId}`);
  return { ok: true as const };
}
```

---

## Architecture Patterns

### System Architecture Diagram

```
Office Engineer (browser)
        │
        │ form submit (unit_price + currency_code)
        ▼
setUnitPrice() Server Action   ◄── auth() guard → getDefaultTenantId() scope
        │
        ├─► db.update(boqItems) ──────────────────────────────────► Neon Postgres
        │                                                              │
        │   [primary write succeeds]                          boq_items table
        │                                                    (unit_price, currency_code)
        │
        └─► logOfficeActivity() ─► after() schedules async
                                      │
                                      └─► db.insert(officeActivityLog) ──► Neon Postgres
                                                                          office_activity_log

Analytics request (Server Component)
        │
        ├─► getProjectMetrics(projectId)
        │       │
        │       ├─► Query 1: COUNT/AVG on submissions ────────────► Neon Postgres
        │       │   (status, latency, location_warning)          submissions table
        │       │                                                + partial indexes
        │       └─► Query 2: SUM(qty * price) GROUP BY currency ──► Neon Postgres
        │           (evByCurrency, bacByCurrency, rework)        boq_items JOIN submissions
        │
        └─► returns: { evByCurrency: { TRY: "1234567.89" }, ... }
                        │
                        ▼
                Component renders per-currency progress bars
                (no cross-currency summation ever occurs)
```

### Recommended Project Structure (Phase 7 additions)
```
src/
├── db/
│   ├── schema/
│   │   ├── office-activity-log.ts    ← NEW
│   │   ├── hakedis-periods.ts        ← NEW
│   │   ├── hakedis-period-lines.ts   ← NEW
│   │   └── index.ts                  ← MODIFIED (add 3 new exports)
│   └── migrations/
│       ├── 0004_v2_data_foundation.sql  ← NEW (drizzle-kit generated + hand-edited CHECK)
│       └── 0005_v2_indexes.sql          ← NEW (hand-written partial indexes)
├── lib/
│   ├── log-office-activity.ts        ← NEW (logOfficeActivity helper)
│   └── types/
│       ├── canonical-submission.ts   ← NEW
│       └── index.ts                  ← NEW (barrel)
└── actions/
    ├── analytics.ts                  ← NEW (4 aggregation functions + getOfficeActivityLog)
    ├── boq.ts                        ← MODIFIED (setUnitPrice + logOfficeActivity wiring)
    ├── projects.ts                   ← MODIFIED (logOfficeActivity wiring)
    ├── people.ts                     ← MODIFIED (logOfficeActivity wiring)
    └── routes.ts                     ← MODIFIED (logOfficeActivity wiring)
```

### Pattern: Currency-Safe Value Display

```typescript
// In a component receiving CanonicalSubmission or ProjectMetrics:
import Decimal from 'decimal.js';

function formatCurrencyValue(numericStr: string, currencyCode: string): string {
  const d = new Decimal(numericStr);
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(d.toNumber());
  // Note: Intl.NumberFormat is safe here — it receives a rounded Decimal value,
  // not raw float arithmetic on DB strings.
}
```

### Anti-Patterns to Avoid

- **Casting numeric to float8 in getCanonicalSubmissions():** `unit_price::float8` introduces IEEE 754 drift. Keep values as numeric strings; let decimal.js handle display.
- **Single cross-currency total:** Never `SUM(earned_value)` without `GROUP BY currency_code`. The query will silently sum TRY and USD amounts into a meaningless number.
- **Blocking Server Action on log write:** The `logOfficeActivity()` call must never use `await` — it calls `after()` which is non-blocking by design.
- **`actorUserId` from people.id:** The activity log FK references `users.id` (text). Using `people.id` (uuid) would be a type mismatch and wrong table.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Decimal arithmetic on financial figures | `parseFloat()` / `*` on Drizzle strings | `decimal.js` + Postgres SUM | Float drift in kuruş; decimal.js has correct rounding modes |
| Post-response async side effects | Manually spawning Promises with `.catch()` | `next/server after()` | `after()` is tied to request lifecycle; orphaned Promises may not complete on Vercel serverless |
| Custom migration runner | New script | Existing `tsx src/db/migrate.ts` | Migration runner already handles PostGIS pre-step; do not bypass it |
| Materialized views for aggregation | `CREATE MATERIALIZED VIEW` + refresh job | `db.execute(sql...)` in Server Actions | neon-http does not support `REFRESH MATERIALIZED VIEW`; no pg_cron configured |

---

## Common Pitfalls

### Pitfall 1: Drizzle `numeric` Returns Strings — Never Multiply in JS
**What goes wrong:** `row.quantity * row.unitPrice` coerces both strings via `Number()`, introducing float drift. Multiplying 1000.001 × 1250.5555 in JS floats produces a different result than Postgres `numeric` arithmetic.
**Why it happens:** The JS `*` operator silently coerces strings to numbers.
**How to avoid:** All multiplication happens in Postgres: `SUM(quantity::numeric * unit_price::numeric)`. For display, parse the result string once with `new Decimal(str)`.
**Warning signs:** Hakkediş totals differing by 0.01–0.05 TRY between dashboard and export.

### Pitfall 2: Cross-Currency Summation
**What goes wrong:** Summing `earned_value` across BOQ items with different `currency_code` values produces a dimensionless number (e.g., TRY 500,000 + USD 10,000 = ??? 510,000).
**Why it happens:** SQL `SUM()` is currency-blind.
**How to avoid:** All value aggregation queries must `GROUP BY b.currency_code`. Functions return `Record<string, string>` maps. UI renders one value block per currency.
**Warning signs:** Any `SUM(unit_price * quantity)` query without `GROUP BY currency_code`.

### Pitfall 3: `actorUserId` FK Type Mismatch
**What goes wrong:** Inserting `session.user.id` (a UUID string from Auth.js `crypto.randomUUID()`) into `actor_user_id` which references `users.id` (text PK) — this works. But if code mistakenly uses `people.id` (a different table, different concept), the FK violation will surface only at runtime.
**Why it happens:** Two separate identity systems (Auth.js users for office engineers; people table for field workers/auditors).
**How to avoid:** Always use `session.user.id` for `actorUserId`. Never use a person UUID here.
**Warning signs:** FK constraint violation on `office_activity_log.actor_user_id` at runtime.

### Pitfall 4: `after()` Not Called in Server Action Context
**What goes wrong:** `after()` must be called inside a Server Action or Route Handler — not in a utility called from a client component or a standalone script. Calling it outside the Next.js request context throws.
**Why it happens:** `after()` is tied to the request lifecycle; it schedules work to run after the response is flushed.
**How to avoid:** `logOfficeActivity()` is only called from within `'use server'` functions. Never call it from client components or tests.
**Warning signs:** `after() must be called within a request scope` error in test output or Vercel logs.

### Pitfall 5: Vitest Tests Calling `after()`
**What goes wrong:** Vitest runs outside Next.js request context. Any test that calls a Server Action which calls `logOfficeActivity()` will fail because `after()` is not available.
**Why it happens:** `after()` requires the Next.js request lifecycle runtime.
**How to avoid:** Mock `next/server` in test files that test Server Actions containing `logOfficeActivity()`:
```typescript
vi.mock('next/server', () => ({
  after: vi.fn((fn) => fn()),  // execute immediately in tests; ignore lifecycle
}));
```
This matches the existing pattern of `vi.mock('next/cache')` for `revalidatePath`.

### Pitfall 6: Partial Index Migration Hand-Edit Forgotten
**What goes wrong:** `drizzle-kit generate` does not emit partial indexes (WHERE clauses). If the hand-written `0005_v2_indexes.sql` is omitted, the partial indexes for pending-audit dashboard alerts and auditor scorecard are missing — queries fall back to full table scans.
**Why it happens:** Partial index syntax is a known drizzle-kit limitation (same as spatial SRID in 0003).
**How to avoid:** `0005_v2_indexes.sql` is hand-written (not generated). Mark it in the file header as hand-written. Do not run `drizzle-kit generate` after Phase 7 closes without re-verifying the index file is untouched.

### Pitfall 7: `truncateAllTables` in Tests Missing New Tables
**What goes wrong:** New tables `office_activity_log`, `hakedis_periods`, `hakedis_period_lines` are not in the existing `truncateAllTables()` list. FK violations occur when test teardown tries to truncate `boq_items` before `hakedis_period_lines`.
**Why it happens:** `tests/fixtures/db.ts` maintains a manual ordered truncation list.
**How to avoid:** Add the three new tables to `truncateAllTables()` in the correct FK order:
```
hakedis_period_lines  (before hakedis_periods, boq_items)
hakedis_periods       (before projects)
office_activity_log   (no FK to submission/people; before projects)
```

---

## Code Examples

### Aggregation with currency grouping (Pattern from analytics.ts)
```typescript
// Source: codebase pattern from getApprovedPoints (submissions.ts) + research
const rows = await db.execute(sql`
  SELECT
    b.currency_code,
    SUM(s.quantity::numeric * b.unit_price::numeric)
      FILTER (WHERE s.status = 'approved' AND b.unit_price IS NOT NULL) AS earned_value,
    SUM(b.planned_qty::numeric * b.unit_price::numeric)
      FILTER (WHERE b.unit_price IS NOT NULL)                           AS bac
  FROM submissions s
  JOIN boq_items b ON b.id = s.boq_item_id
  WHERE s.project_id = ${projectId}
    AND s.tenant_id  = ${tenantId}
  GROUP BY b.currency_code
`);

// Merge into Record<string, string> — never sum across currencies
const evByCurrency: Record<string, string> = {};
const bacByCurrency: Record<string, string> = {};
for (const row of rows.rows) {
  if (row.currency_code) {
    evByCurrency[String(row.currency_code)] = String(row.earned_value ?? '0');
    bacByCurrency[String(row.currency_code)] = String(row.bac ?? '0');
  }
}
```

### logOfficeActivity wiring (Pattern for all existing Server Actions)
```typescript
// Source: established codebase pattern (boq.ts addBoqItem pattern) + next/server after()
export async function createProject(input: { name: string; description?: string }) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const [project] = await db.insert(projects).values({ ... }).returning();

  // Fire-and-forget — never blocks or fails the primary action
  logOfficeActivity({
    actorUserId: session.user.id,   // Auth.js text PK
    actionType: 'project_created',
    entityType: 'project',
    entityId: project.id,
    metadata: { name: project.name },
  });

  revalidatePath('/dashboard/projects');
  return project;
}
```

---

## Validation Architecture

`nyquist_validation: true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.7 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run tests/analytics.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COST-01 | `setUnitPrice()` persists unit_price + currency_code; unauthorized guard | DB integration | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |
| COST-01 | `currency_code` DEFAULT 'TRY' on existing rows after migration | DB integration | `npx vitest run tests/schema.test.ts` | ✅ (extend) |
| COST-02 | `getProjectMetrics()` returns correct EV and BAC grouped by currency | DB integration | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |
| COST-02 | Postgres SUM(qty * price) matches decimal.js computation (no float drift) | unit | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |
| COST-03 | % complete = EV / BAC per currency pair (no cross-currency division) | unit | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |
| COST-04 | `getPersonMetrics()` value_contributed grouped by currency; role-scoped | DB integration | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |
| COST-05 | `getProjectMetrics()` rework_value includes rejected submissions only | DB integration | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |
| PERF-03 | `logOfficeActivity()` inserts row to `office_activity_log` after mutation | DB integration | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |
| PERF-03 | Primary Server Action succeeds even when log INSERT throws | unit | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |
| PERF-03 | `getOfficeActivityLog()` returns entries filtered by actorUserId | DB integration | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |
| Schema | `hakedis_period_lines` rejects rows with cumulative_qty < previous_cumulative_qty | DB integration | `npx vitest run tests/schema.test.ts` | ✅ (extend) |
| Schema | `office_activity_log.actor_user_id` FK to `users.id` (text) accepted; `people.id` rejected | DB integration | `npx vitest run tests/schema.test.ts` | ✅ (extend) |

### Critical Money-Math Tests

These tests establish correctness before any cost display is built downstream:

**Test 1 — No float drift (COST-02 canonical)**
```typescript
// Seed: BOQ item with unit_price = '1250.0001', 3 approved submissions of quantity = '333.333'
// Expected EV = 1250.0001 * 333.333 * 3 = 1250083.2999... (Postgres numeric result)
// Verify: getProjectMetrics() evByCurrency['TRY'] matches Postgres computation
// Verify: new Decimal(result).minus(expected).abs().lessThan('0.001') — no kuruş drift
```

**Test 2 — Cross-currency guard (COST-02 negative test)**
```typescript
// Seed: project with one TRY BOQ item and one USD BOQ item
// Verify: getProjectMetrics() returns evByCurrency with exactly 2 keys: 'TRY' and 'USD'
// Verify: no single 'total' key exists on the return value
```

**Test 3 — Activity log non-blocking (PERF-03)**
```typescript
// Mock after() to execute immediately; mock db.insert for officeActivityLog to throw
// Call createProject() — verify it returns ok result (not throws)
// Verify: the project IS in the DB (primary write succeeded)
```

**Test 4 — Dual-role person scorecard isolation (COST-04)**
```typescript
// Seed: person P = worker on project A (3 submissions), auditor on project B (5 decisions)
// getPersonMetrics(P.id) — verify submissionsApproved reflects project A submissions only
// No project B auditor decisions bleed into worker metrics
```

**Test 5 — CHECK constraint guard**
```typescript
// Attempt INSERT into hakedis_period_lines with cumulative_qty_approved='100' and
// previous_cumulative_qty='150' (cumulative < previous — impossible scenario)
// Verify: Postgres throws constraint violation
```

### Sampling Rate
- **Per task commit:** `npx vitest run tests/analytics.test.ts tests/schema.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/analytics.test.ts` — covers COST-01..05, PERF-03 (all behaviors above)
- [ ] `tests/fixtures/db.ts` — add `hakedis_period_lines`, `hakedis_periods`, `office_activity_log` to `truncateAllTables()` in correct FK order
- [ ] `src/lib/types/canonical-submission.ts` — type definition (no test file needed)
- [ ] `src/lib/types/index.ts` — barrel export (no test file needed)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `await auth()` guard at top of every Server Action — established pattern |
| V3 Session Management | no | Auth.js handles; no new session logic |
| V4 Access Control | yes | `getDefaultTenantId()` scope on all queries; tenant_id on all new tables |
| V5 Input Validation | yes | `parseFloat` + positivity check on `unitPrice`; ISO-4217 format check on `currencyCode` |
| V6 Cryptography | no | No new cryptographic operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant data leak in analytics queries | Information Disclosure | All queries include `WHERE tenant_id = ${getDefaultTenantId()}` |
| Unauthorized unit price modification | Tampering | `await auth()` guard in `setUnitPrice()`; tenant-scoped WHERE on UPDATE |
| Activity log PII in metadata | Information Disclosure | `metadata` field logs entity IDs + numeric values, not personal names or emails; names reconstructed at read time by joining entity tables |
| Negative periodQty in hakedis line | Tampering | DB CHECK `cumulative_qty_approved >= previous_cumulative_qty` prevents retroactive manipulation |
| Analytics Server Actions callable without session | Elevation of Privilege | All functions in `analytics.ts` start with `const session = await auth(); if (!session) throw new Error('Unauthorized')` |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-currency assumption (TRY-only, no currency column) | Per-item currency_code; all rollups grouped by currency | Phase 7 locked decisions | Prevents mixed-currency aggregation; hakkediş periods scoped to one currency |
| Drizzle relational builder for aggregation | `db.execute(sql...)` with FILTER clauses | Established in v1 spatial queries | Full GROUP BY and window function support; type-safe via manual mapping |
| Synchronous activity log write | `next/server after()` deferred write | Phase 7 (new feature) | Primary mutations never blocked or failed by logging |
| No canonical type (each feature defines its own query shape) | `CanonicalSubmission` shared type | Phase 7 | Single join query reused by analytics, export, and hakkediş engine |

---

## Open Questions

1. **Currency input in BOQ form**
   - What we know: `setUnitPrice()` accepts `currencyCode: string`
   - What's unclear: Should the UI default to TRY with a dropdown, or free-text? What currencies are realistically used?
   - Recommendation: Default to 'TRY' with a select dropdown of ['TRY', 'USD', 'EUR']. This is a UI decision for the planner to specify in the BOQ form task.

2. **Activity log retention / KVKK**
   - What we know: Pitfall 8 flags 90-day retention as needed for KVKK compliance
   - What's unclear: Is a Vercel Cron route acceptable for the cleanup job, or does this need a pg_cron approach?
   - Recommendation: Phase 7 creates the table. A scheduled cleanup is a separate follow-up task (out of scope for this phase). Add a code comment in the schema file noting the 90-day retention intent.

3. **`hakedis_periods.periodStartDate` — is it mandatory?**
   - What we know: `periodEndDate` is the anchor for cumulative quantity lookups (`decided_at <= periodEndDate`)
   - What's unclear: `periodStartDate` is stored but the cumulative model does not strictly require it (it's derived from the previous period's cutoff)
   - Recommendation: Keep `periodStartDate` as it is informational for display; make it nullable with a note that it's UI-entered and not used in computations.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Neon (DATABASE_URL) | migrate.ts, all Server Actions | ✓ | Postgres 16 + PostGIS | — |
| tsx | `tsx src/db/migrate.ts` | ✓ | 4.22.3 (devDep) | — |
| drizzle-kit | `npx drizzle-kit generate` | ✓ | 0.31.10 (devDep) | — |
| next/server after() | logOfficeActivity | ✓ | 15.5.18 (confirmed) | — |
| decimal.js | JS-side display math | ✗ (not yet installed) | 10.6.0 | — |

**Missing dependencies with no fallback:**
- `decimal.js` — must be installed before any analytics display code is written: `npm install decimal.js`

---

## Package Legitimacy Audit (recap)

slopcheck unavailable in this environment. `decimal.js` verification:
- `npm view decimal.js version` → `10.6.0` [VERIFIED: npm registry]
- Created 2014-04-02; latest tag 2025-07-06 [VERIFIED: npm registry]
- No postinstall script [VERIFIED: npm registry]
- Homepage: github.com/MikeMcl/decimal.js [VERIFIED: npm registry]
- All other packages required for this phase are already in `package.json` — no additional legitimacy checks needed.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | decimal.js slopcheck status is OK | Package Legitimacy Audit | slopcheck was unavailable; registry evidence is strong but not a slopcheck [OK] verdict |
| A2 | `currency_code` as free-text ISO-4217 (no enum validation) is acceptable for MVP | Schema Changes §1 | If invalid currency codes are entered, rollup maps will have garbage keys; add a CHECK constraint or enum in a follow-up if needed |
| A3 | `hakedis_periods.periodStartDate` is informational only (not used in cumulative computations) | Open Questions §3 | If computations ever need per-period date ranges, `periodStartDate` must be made non-nullable and trusted |

---

## Sources

### Primary (HIGH confidence)
- Live codebase — `src/db/schema/boq-items.ts`, `auth.ts`, `submissions.ts`, `people.ts`, `assignments.ts`, `migrate.ts`, `schema/index.ts`, `actions/boq.ts`, `actions/projects.ts` — all read directly in this session [VERIFIED: codebase]
- `tests/setup.ts`, `tests/fixtures/db.ts`, `vitest.config.ts` — test infrastructure confirmed [VERIFIED: codebase]
- `package.json` — `next: 15.5.18`, `vitest: ^4.1.7`, `drizzle-orm: ^0.45.2` confirmed installed [VERIFIED: codebase]
- `node_modules/next/dist/server/after` — `after()` export confirmed present in 15.5.18 [VERIFIED: node -e in codebase]
- `src/db/migrations/0003_slippery_prowler.sql` — hand-edit pattern for partial indexes and CHECK constraints confirmed [VERIFIED: codebase]
- `npm view decimal.js` — version 10.6.0, created 2014, no postinstall script [VERIFIED: npm registry]
- `.planning/REQUIREMENTS.md` — COST-01..05, PERF-03 requirement text [VERIFIED: codebase]
- `.planning/STATE.md` — D-49 (drizzle-kit push unusable), money math rule, `after()` wiring, neon-http transaction limitations [VERIFIED: codebase]
- `.planning/research/ARCHITECTURE.md` — hakkediş table design, aggregation patterns, migration sequence [VERIFIED: codebase]
- `.planning/research/PITFALLS.md` — 15 pitfalls, money math, cumulative vs period, activity log patterns [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- Drizzle ORM `numeric` string return behavior — cross-referenced ARCHITECTURE.md citation of issues #570 and #1042 [CITED: ARCHITECTURE.md]
- `next/server after()` API — Next.js 15 stable API confirmed in SUMMARY.md + module existence check [CITED: nextjs.org/docs/app/api-reference/functions/after + VERIFIED: codebase]
- ISO-4217 currency code storage as text — established pattern in international financial software [ASSUMED: training knowledge]

---

## Metadata

**Confidence breakdown:**
- Schema changes: HIGH — derived directly from live schema files; migration pattern established by 0003
- Multi-currency aggregation design: HIGH — logic derived from REQUIREMENTS.md locked decisions + SQL GROUP BY semantics
- `logOfficeActivity()` with `after()`: HIGH — module confirmed present; pattern matches existing `revalidatePath` pattern
- `CanonicalSubmission` type: HIGH — derived from exact column names in submissions.ts, people.ts, boq-items.ts
- Vitest test gaps: HIGH — test infrastructure fully read; new test file clearly identified

**Research date:** 2026-05-25
**Valid until:** 2026-06-25 (stable stack; no fast-moving dependencies)
