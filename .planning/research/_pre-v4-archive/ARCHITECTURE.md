# Architecture Research — v2.0 Integration Guide

**Domain:** Operations Intelligence & Hakkediş — additive integration into existing Next.js 15 + Drizzle + PostGIS monolith
**Researched:** 2026-05-25
**Confidence:** HIGH (grounded in actual source files; patterns derived from v1 codebase conventions)

---

## Framing: What v2 Adds vs What It Preserves

v2 does NOT redesign v1. Every existing route, schema table, and action file stays intact. v2 adds:

1. Three new schema tables (`office_activity_log`, `hakkediş_periods`, `hakkediş_period_lines`) + one column alteration (`boq_items.unit_price`)
2. A shared canonical submission record type + SQL view
3. An aggregation layer (data-access functions backed by raw SQL aggregates)
4. A restructured IA shell built as App Router route groups layered *over* existing routes
5. An export pipeline (ExcelJS multi-sheet + PDF) as new route handlers
6. Charting as client components (Recharts) within existing dashboard layout

---

## 1. DATA MODEL CHANGES

### 1a. `unit_price` on `boq_items`

**Add:** `unit_price: numeric('unit_price', { precision: 15, scale: 4 }).nullable()`

Precision rationale:
- `precision: 15, scale: 4` — handles Turkish Lira amounts up to 99,999,999,999.9999 (billions, four decimal places). Turkish construction BOQ unit prices are typically quoted in TRY to 2–4 decimal places; 4dp is safe.
- Nullable: the column is explicitly nullable because v1 rows have no price data and backfill is not required.
- No separate `currency` column needed for single-tenant MVP (always TRY). Add a `currency_code text default 'TRY'` only when multi-tenant is built.
- Do NOT use `money` Postgres type — it's locale-sensitive and breaks in non-Turkish locales.

**Modified file:** `src/db/schema/boq-items.ts`
```typescript
// Uncomment and update the existing comment:
unitPrice: numeric('unit_price', { precision: 15, scale: 4 }), // nullable — v1 rows have no price
```

**Migration:** A Drizzle-generated migration (`drizzle-kit generate`) will emit:
```sql
ALTER TABLE "boq_items" ADD COLUMN "unit_price" numeric(15, 4);
```
This is safe: no CHECK constraint, no geometry column, no SRID — no hand-editing needed. Run `drizzle-kit generate` normally; the output goes into `src/db/migrations/0004_*.sql`, then `tsx src/db/migrate.ts`.

**Earned value formula** (computed at query time, never stored):
```
contractedValue(item)    = planned_qty    × unit_price
earnedValue(item)        = approved_qty   × unit_price
percentCompleteByValue   = approved_qty / planned_qty  (quantity-based, unit_price not needed)
earnedValueTotal(project)= SUM(approved_qty × unit_price) WHERE unit_price IS NOT NULL
```

---

### 1b. Office-Engineer Activity Log

**New table:** `office_activity_log`

**New file:** `src/db/schema/office-activity-log.ts`

```typescript
import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './auth';       // Auth.js users table (office engineers)
import { tenants } from './tenants';
import { projects } from './projects';

// action_type enum — extend as new office actions are added
export const OFFICE_ACTION_TYPES = [
  'project_created',
  'project_updated',
  'boq_item_created',
  'boq_item_updated',
  'boq_item_deleted',
  'boq_imported',           // bulk Excel import
  'unit_price_set',         // pricing specifically tracked
  'route_uploaded',
  'person_approved',        // pending → active
  'person_assigned',
  'person_unassigned',
  'hakkediş_period_created',
  'hakkediş_period_finalized',
  'hakkediş_exported',
  'submission_reviewed',    // manual review from dashboard (not bot approval)
] as const;

export type OfficeActionType = typeof OFFICE_ACTION_TYPES[number];

export const officeActivityLog = pgTable('office_activity_log', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').references(() => tenants.id),
  actorUserId:  text('actor_user_id').notNull().references(() => users.id), // Auth.js users.id is text
  actionType:   text('action_type').notNull(),  // one of OFFICE_ACTION_TYPES; text not enum for easy extension
  entityType:   text('entity_type').notNull(),  // 'project' | 'boq_item' | 'person' | 'hakkediş_period' | 'submission'
  entityId:     text('entity_id'),              // uuid of the affected row (nullable for bulk ops)
  projectId:    uuid('project_id').references(() => projects.id), // nullable — cross-project actions
  metadata:     jsonb('metadata'),              // arbitrary context; see examples below
  occurredAt:   timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('office_activity_log_actor_idx').on(t.actorUserId),
  index('office_activity_log_project_idx').on(t.projectId),
  index('office_activity_log_action_idx').on(t.actionType),
  index('office_activity_log_occurred_idx').on(t.occurredAt),
]);
```

**`metadata` JSONB examples by action type:**
- `boq_imported`: `{ rowCount: 42, fileName: "BOQ-Q1.xlsx" }`
- `unit_price_set`: `{ boqItemId: "...", oldPrice: null, newPrice: "1250.0000", material: "DN200 HDPE" }`
- `person_assigned`: `{ personId: "...", role: "worker", displayName: "Ahmet Yılmaz" }`
- `hakkediş_exported`: `{ periodId: "...", format: "xlsx", rowCount: 18 }`

**What to log:** Log every mutation that a Server Action or route handler performs on behalf of an office engineer. Do NOT log reads. Log at the end of the action, after the DB write succeeds, in the same Server Action function (not a separate hook — keeps it simple and avoids fire-and-forget failures silently dropping log entries).

**Migration:** `drizzle-kit generate` → standard migration file. No spatial columns, no hand-editing needed.

---

### 1c. Hakkediş Tables

**Design principle:** A hakkediş (Turkish progress payment certificate) is a point-in-time snapshot of approved work quantities and their unit prices. It is NOT recomputed from live submissions after finalization — unit prices can change and quantities can continue to grow. Snapshot the values at period creation/finalization time.

**New files:** `src/db/schema/hakkediş-periods.ts` and `src/db/schema/hakkediş-period-lines.ts`

```typescript
// src/db/schema/hakkediş-periods.ts
import { pgTable, uuid, text, timestamp, index, date } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { projects } from './projects';
import { users } from './auth';

export const HAKKEDIŞ_STATUSES = ['draft', 'finalized', 'submitted', 'paid'] as const;
export type HakkediştStatus = typeof HAKKEDIŞ_STATUSES[number];

export const hakkedişPeriods = pgTable('hakkediş_periods', {
  id:              uuid('id').primaryKey().defaultRandom(),
  tenantId:        uuid('tenant_id').references(() => tenants.id),
  projectId:       uuid('project_id').notNull().references(() => projects.id, { onDelete: 'restrict' }),
  periodNumber:    text('period_number').notNull(),          // "HK-2026-01" — human-readable label
  periodStartDate: date('period_start_date').notNull(),      // inclusive
  periodEndDate:   date('period_end_date').notNull(),        // inclusive
  status:          text('status').notNull().default('draft'), // draft | finalized | submitted | paid
  notes:           text('notes'),
  kdvRate:         text('kdv_rate').notNull().default('0.20'),     // numeric(5,4) as text; 0.20 = 20%
  retentionRate:   text('retention_rate').notNull().default('0.05'), // 0.05 = 5%
  createdByUserId: text('created_by_user_id').references(() => users.id),
  finalizedAt:     timestamp('finalized_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('hakkediş_periods_project_idx').on(t.projectId),
  index('hakkediş_periods_status_idx').on(t.status),
]);
```

```typescript
// src/db/schema/hakkediş-period-lines.ts
import { pgTable, uuid, text, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { hakkedişPeriods } from './hakkediş-periods';
import { boqItems } from './boq-items';

export const hakkedişPeriodLines = pgTable('hakkediş_period_lines', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  tenantId:             uuid('tenant_id').references(() => tenants.id),
  periodId:             uuid('period_id').notNull().references(() => hakkedişPeriods.id, { onDelete: 'cascade' }),
  boqItemId:            uuid('boq_item_id').notNull().references(() => boqItems.id, { onDelete: 'restrict' }),

  // Snapshot fields — captured at period creation/finalization, immutable after finalize
  materialSnapshot:     text('material_snapshot').notNull(),          // boq_items.material at snapshot time
  unitSnapshot:         text('unit_snapshot').notNull(),              // boq_items.unit at snapshot time
  unitPriceSnapshot:    numeric('unit_price_snapshot', { precision: 15, scale: 4 }).notNull(), // locked in

  // Quantities — period vs cumulative
  cumulativeQtyApproved: numeric('cumulative_qty_approved', { precision: 12, scale: 3 }).notNull(), // total approved up to period end
  previousCumulativeQty: numeric('previous_cumulative_qty', { precision: 12, scale: 3 }).notNull().default('0'), // end of prior period
  periodQty:            numeric('period_qty', { precision: 12, scale: 3 }).notNull(), // = cumulative - previous

  // Computed values — stored for immutability after finalization
  periodValue:          numeric('period_value', { precision: 15, scale: 2 }).notNull(), // periodQty × unitPriceSnapshot
  cumulativeValue:      numeric('cumulative_value', { precision: 15, scale: 2 }).notNull(), // cumulativeQtyApproved × unitPriceSnapshot

  createdAt:            timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('hakkediş_period_lines_period_idx').on(t.periodId),
  index('hakkediş_period_lines_boq_idx').on(t.boqItemId),
]);
```

**Relationship to submissions:** Lines are computed from approved submissions at period creation time, NOT linked to individual submission rows. The link is: "all submissions with `status = 'approved'` and `decided_at <= periodEndDate` for this `boq_item_id`". This is a read-time aggregation, not a FK join. This avoids the N+1 problem and keeps hakkediş independent of submission-level changes after finalization.

**Finalization lock:** When `status` transitions to `finalized`, the snapshot columns become immutable — enforced in the Server Action by checking status before allowing updates. No DB-level lock needed for MVP; add a trigger if strict audit compliance is required later.

**Migration:** Two new `CREATE TABLE` statements. `drizzle-kit generate` handles them. No spatial columns. The filename convention (e.g., `hakkediş`) is ASCII-safe in filenames — use `hakkediş-periods.ts` but the SQL table name can stay `hakkediş_periods` since Postgres handles UTF-8 identifiers. Alternatively, use `hakedis_periods` as the SQL name to stay ASCII-safe in migrations — recommended for portability.

**Recommended SQL table names:** `hakedis_periods` and `hakedis_period_lines` (ASCII-safe, still readable).

---

## 2. AGGREGATION LAYER

### Where Rollups Live

**Verdict: Raw SQL via `db.execute(sql\`...\`)` in data-access functions. No Postgres VIEWs. No materialized views.**

Rationale:
- The codebase already uses `sql\`ST_AsGeoJSON(...)\`` raw SQL for spatial queries — the pattern is established and the team knows it.
- Neon supports regular VIEWs but **does not support `REFRESH MATERIALIZED VIEW`** in the serverless HTTP driver (the `neon-http` driver used in `migrate.ts` does not support multi-statement transactions needed for background refresh). Materialized views require a scheduled job or pg_cron — overkill for MVP scale.
- Regular Postgres VIEWs are syntactically convenient but add a layer of indirection without type safety. A TypeScript data-access function returning the same query result is more debuggable and refactorable.
- Drizzle relational query builder (`db.query.*`) does not support aggregation well — use `db.execute()` for anything with `GROUP BY`, `SUM`, `COUNT`, window functions, or CTEs.

**Aggregation function location:** `src/actions/analytics.ts` (new file, follows existing Server Action conventions — `'use server'`, `auth()` guard, `getDefaultTenantId()` scope).

### Canonical Submission Record

Define once in `src/lib/types/canonical-submission.ts` (new file). This type is the shared shape used by the submissions table view, the analytics API, and the Excel export:

```typescript
// src/lib/types/canonical-submission.ts
// The canonical view of a submission row — used by analytics, table, and export.
// All numerics are number (not Drizzle's string). All dates are ISO strings.
export type CanonicalSubmission = {
  id: string;
  projectId: string;
  projectName: string;
  personId: string;
  workerName: string;              // people.display_name
  auditorName: string | null;      // people.display_name of decidedBy
  boqItemId: string;
  material: string;                // boq_items.material
  unit: string;                    // boq_items.unit
  unitPrice: number | null;        // boq_items.unit_price (nullable)
  quantity: number;
  earnedValue: number | null;      // quantity × unitPrice, null if no price
  status: 'pending_audit' | 'approved' | 'rejected';
  submittedAt: string;             // ISO 8601
  decidedAt: string | null;
  auditLatencyHours: number | null; // (decidedAt - submittedAt) in hours, null if pending
  locationMatch: 'near' | 'far' | 'no_route' | null;
  locationDistanceM: number | null;
  photoUrl: string;
  notes: string | null;
  rejectionReason: string | null;
};
```

**SQL backing query for `CanonicalSubmission`** (used in analytics and export functions):

```sql
SELECT
  s.id,
  s.project_id,
  p.name                                            AS project_name,
  s.person_id,
  w.display_name                                    AS worker_name,
  aud.display_name                                  AS auditor_name,
  s.boq_item_id,
  b.material,
  b.unit,
  b.unit_price::float8                              AS unit_price,
  s.quantity::float8,
  CASE WHEN b.unit_price IS NOT NULL
       THEN (s.quantity * b.unit_price)::float8
       ELSE NULL
  END                                               AS earned_value,
  s.status,
  s.submitted_at,
  s.decided_at,
  CASE WHEN s.decided_at IS NOT NULL AND s.status != 'pending_audit'
       THEN EXTRACT(EPOCH FROM (s.decided_at - s.submitted_at)) / 3600.0
       ELSE NULL
  END                                               AS audit_latency_hours,
  s.location_match,
  s.location_distance_m::float8                    AS location_distance_m,
  s.photo_url,
  s.notes,
  s.rejection_reason
FROM submissions s
JOIN projects p   ON p.id = s.project_id
JOIN people w     ON w.id = s.person_id
JOIN boq_items b  ON b.id = s.boq_item_id
LEFT JOIN people aud ON aud.id = s.decided_by
WHERE s.tenant_id = $1
  AND s.project_id = ANY($2::uuid[])   -- multi-project support for cross-project analytics
  AND s.submitted_at >= $3             -- date range start (optional, pass epoch 0 to skip)
  AND s.submitted_at <  $4             -- date range end exclusive
ORDER BY s.submitted_at DESC
```

Build this as a TypeScript function `getCanonicalSubmissions(filters)` in `src/actions/analytics.ts` using `db.execute(sql\`...\`)`. The function returns `CanonicalSubmission[]`. The same function feeds:
- The analytics scorecard page
- The Excel multi-sheet export handler
- The hakkediş period line computation

### Aggregate Functions

**`getProjectMetrics(projectId: string, dateRange?: {from: Date, to: Date})`** — per-project KPIs:
```sql
SELECT
  COUNT(*)                           FILTER (WHERE status = 'approved')  AS approved_count,
  COUNT(*)                           FILTER (WHERE status = 'rejected')  AS rejected_count,
  COUNT(*)                           FILTER (WHERE status = 'pending_audit') AS pending_count,
  ROUND(AVG(EXTRACT(EPOCH FROM (decided_at - submitted_at)) / 3600.0)
        FILTER (WHERE decided_at IS NOT NULL), 2) AS avg_audit_latency_hours,
  SUM(quantity * b.unit_price)       FILTER (WHERE status = 'approved' AND b.unit_price IS NOT NULL) AS earned_value,
  COUNT(*)                           FILTER (WHERE location_warning = true) AS location_warning_count,
  COUNT(*)                           FILTER (WHERE status = 'rejected') * 1.0 /
    NULLIF(COUNT(*) FILTER (WHERE status IN ('approved','rejected')), 0) AS rejection_rate
FROM submissions s
JOIN boq_items b ON b.id = s.boq_item_id
WHERE s.project_id = $1 AND s.tenant_id = $2
  AND s.submitted_at BETWEEN $3 AND $4
```

**`getPersonMetrics(personId: string, projectIds?: string[])`** — per-worker/auditor scorecard:
```sql
SELECT
  s.person_id,
  w.display_name,
  COUNT(*)                           FILTER (WHERE s.status = 'approved') AS submissions_approved,
  COUNT(*)                           FILTER (WHERE s.status = 'rejected') AS submissions_rejected,
  SUM(s.quantity * b.unit_price)     FILTER (WHERE s.status = 'approved' AND b.unit_price IS NOT NULL) AS value_contributed,
  ROUND(AVG(...audit_latency...), 2) AS avg_audit_latency_hours  -- for auditors: where decided_by = person_id
FROM submissions s
JOIN people w     ON w.id = s.person_id
JOIN boq_items b  ON b.id = s.boq_item_id
WHERE s.person_id = $1 AND s.tenant_id = $2
GROUP BY s.person_id, w.display_name
```

**`getPortfolioOverview()`** — cross-project home page KPIs. Keep this query lightweight — it runs on every Overview page load:
```sql
SELECT
  p.id, p.name,
  COUNT(s.id) FILTER (WHERE s.status = 'approved')  AS approved_count,
  COUNT(s.id) FILTER (WHERE s.status = 'pending_audit') AS pending_count,
  SUM(b.planned_qty * b.unit_price)                  AS contracted_value,
  SUM(b.approved_qty * b.unit_price)                 AS earned_value_to_date
FROM projects p
LEFT JOIN submissions s ON s.project_id = p.id
LEFT JOIN boq_items b   ON b.project_id = p.id
WHERE p.tenant_id = $1
GROUP BY p.id, p.name
```

**Index additions for aggregation performance** (add to existing schema or new migration):
```sql
-- Composite index for status + submitted_at (primary analytics filter)
CREATE INDEX submissions_status_submitted_idx ON submissions (status, submitted_at DESC)
  WHERE tenant_id IS NOT NULL;

-- Partial index for pending audit (dashboard alert count, hits this constantly)
CREATE INDEX submissions_pending_idx ON submissions (project_id, submitted_at DESC)
  WHERE status = 'pending_audit';

-- Index for auditor scorecard (decided_by + decided_at)
CREATE INDEX submissions_decided_by_idx ON submissions (decided_by, decided_at DESC)
  WHERE decided_by IS NOT NULL;
```

Add these indexes as a hand-edited migration file (follow the `0003_slippery_prowler.sql` pattern — no geometry here, so no SRID issues, but partial index syntax is not emitted by `drizzle-kit generate`).

---

## 3. INFORMATION ARCHITECTURE / ROUTING

### Admin Shell: Route Group Strategy

The existing dashboard lives at `src/app/dashboard/`. The v1 path structure is:
- `dashboard/projects` — project list
- `dashboard/projects/[id]` — project detail (tabs via `?tab=`)

v2 adds a top-level admin navigation shell (Overview · Projects · People · Analytics · Hakkediş · Exports) WITHOUT breaking existing project-scoped routes.

**Approach: Route group `(admin)` wrapping the new shell layout, sibling to existing routes.**

```
src/app/dashboard/
├── layout.tsx                        ← EXISTING: auth guard + TopNav (keep unchanged)
├── projects/                         ← EXISTING: keep all unchanged
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/
│       ├── page.tsx
│       ├── edit/page.tsx
│       └── boq-template/route.ts
│
├── (admin)/                          ← NEW route group — no URL segment
│   ├── layout.tsx                    ← NEW: admin sidebar shell layout
│   │
│   ├── overview/
│   │   └── page.tsx                  ← NEW: cross-project home + portfolio KPIs
│   │
│   ├── people/
│   │   ├── page.tsx                  ← NEW: people list (all workers/auditors)
│   │   └── [personId]/
│   │       └── page.tsx              ← NEW: employee profile + scorecard
│   │
│   ├── analytics/
│   │   └── page.tsx                  ← NEW: date-ranged analytics + charts
│   │
│   ├── hakedis/
│   │   ├── page.tsx                  ← NEW: hakkediş period list (all projects)
│   │   └── [periodId]/
│   │       └── page.tsx              ← NEW: period detail + line items
│   │
│   └── exports/
│       └── page.tsx                  ← NEW: export trigger UI
```

**`(admin)` layout** (`src/app/dashboard/(admin)/layout.tsx`):
- Adds a sidebar nav component alongside `{children}`
- No additional auth check — the parent `dashboard/layout.tsx` already guards all of `/dashboard/*`
- Responsive: sidebar collapses to a hamburger menu on mobile

**Navigation redirect:** Update `dashboard/layout.tsx` (or add a `dashboard/page.tsx`) to redirect `/dashboard` → `/dashboard/overview`. The existing `/dashboard/projects` link in the current TopNav becomes one item in the sidebar nav.

**Existing project-scoped routes** stay at their current paths and are NOT wrapped in `(admin)`. They can be reached from the Projects sidebar item or from drill-down links in the analytics/people pages.

**Submission detail page** (new, drill-down from analytics):
```
src/app/dashboard/projects/[id]/submissions/[submissionId]/
└── page.tsx                          ← NEW: full submission detail (photo, location, audit trail)
```
This lives under `projects/[id]/` not under `(admin)/` because it is project-scoped and the existing `KayitlarTab` already links into this namespace.

---

### Sidebar Nav Component

**New file:** `src/components/layout/AdminSidebar.tsx`

Nav items:
```
Overview         → /dashboard/overview
Projects         → /dashboard/projects  (existing)
People           → /dashboard/people
Analytics        → /dashboard/analytics
Hakkediş         → /dashboard/hakedis
Exports          → /dashboard/exports
```

Use `usePathname()` to highlight the active item. Sidebar is a client component (`'use client'`) because it uses `usePathname`. The `(admin)/layout.tsx` is a Server Component that renders the sidebar.

---

## 4. EXPORT PIPELINE

### Architecture Decision: Buffer, Not Stream

**Use `Buffer` (in-memory), not streaming, for both Excel and PDF exports.**

Rationale:
- Vercel Hobby/Pro function timeout is 10–60 seconds. ExcelJS writes to a buffer in ~0.5–3 seconds for realistic BOQ sizes (< 500 rows). No need for streaming.
- Streaming responses from Vercel functions require careful `TransformStream` wiring; the added complexity is not justified for this use case.
- Neon's serverless HTTP driver (`neon-http`) used in this project does NOT support streaming SQL queries — so data retrieval is always buffered anyway.

**Vercel function limit:** Default body size is 4.5 MB. A typical hakkediş Excel workbook with 3 sheets and 200 rows will be well under 1 MB. Safe.

### Excel Export Route Handler

**New file:** `src/app/api/exports/submissions/route.ts`

Pattern (follows `boq-template/route.ts`):
```typescript
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(request.url);
  // parse projectId, dateFrom, dateTo, status filters

  const rows = await getCanonicalSubmissions({ ... });      // from analytics.ts
  const buf = await generateSubmissionsExcel(rows);         // from lib/excel-exports.ts

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="kayitlar-${date}.xlsx"`,
    },
  });
}
```

**New file:** `src/lib/excel-exports.ts` (extends `src/lib/excel.ts` patterns with ExcelJS):

```typescript
// generateSubmissionsExcel(rows: CanonicalSubmission[]): Promise<Buffer>
//   Sheet 1: "Kayıtlar" — full submission list (all columns)
//   Sheet 2: "Özet" — per-BOQ-item aggregate (material, planned qty, approved qty, earned value)
//   Sheet 3: "Kişi Performansı" — per-worker summary

// generateHakkedişExcel(period: HakkedişPeriod, lines: HakkedişPeriodLine[]): Promise<Buffer>
//   Sheet 1: "Hakkediş" — period cover (project name, period dates, kdv rate, retention rate, totals)
//   Sheet 2: "Kalemler" — line items (code, material, unit, unit price, cumulative qty, period qty, period value)
//   Sheet 3: "Hesap Özeti" — financial summary (subtotal, KDV, retention, net payable)
```

Column widths and number formatting: use `sheet.getColumn(n).numFmt = '#,##0.00'` for TRY amounts (Turkish locale); column headers bilingual matching existing `parseBoqExcel` patterns.

### PDF Route for Hakkediş

**Use `@react-pdf/renderer` (Vercel-compatible), NOT Puppeteer/Chromium.**

Puppeteer requires a headless Chrome binary — incompatible with Vercel serverless. `@react-pdf/renderer` generates PDFs in pure Node.js with no binary dependencies.

**New file:** `src/app/api/exports/hakedis/[periodId]/route.ts`
```typescript
import { renderToBuffer } from '@react-pdf/renderer';
import { HakkedişDocument } from '@/components/pdf/HakkedişDocument';

export async function GET(_, { params }) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const period = await getHakkedişPeriod(params.periodId);
  const lines = await getHakkedişPeriodLines(params.periodId);

  const buf = await renderToBuffer(<HakkedişDocument period={period} lines={lines} />);

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="hakkediş-${period.periodNumber}.pdf"`,
    },
  });
}
```

**New file:** `src/components/pdf/HakkedişDocument.tsx` — React PDF component. A Vercel function running `renderToBuffer` takes ~1–3 seconds for a typical one-page hakkediş; well within the 60s limit.

---

## 5. PERFORMANCE / CACHING

### Existing Pattern: `force-dynamic`

The `[id]/page.tsx` already uses `export const dynamic = 'force-dynamic'`. This is correct and should be inherited by all new analytics/hakkediş pages — they all render live data. Do NOT switch to ISR or static for these pages.

### Caching Strategy for v2

**Overview page** (`/dashboard/overview`): `force-dynamic`. Portfolio KPIs must be live — a stale pending count misleads.

**Analytics page** (`/dashboard/analytics`): `force-dynamic`. Date-range changes require fresh data.

**Employee profile page** (`/dashboard/people/[personId]`): `force-dynamic`. The scorecard reflects real-time progress.

**Hakkediş period detail** (`/dashboard/hakedis/[periodId]`): For `status = 'finalized'`, the data is immutable — consider `export const revalidate = 3600` (1-hour ISR) as an optimization. For `draft` periods, `force-dynamic`.

**NO `unstable_cache` or Next.js Data Cache:** The existing codebase does not use it; the submissions dataset is small enough (~hundreds of rows per project for MVP scale) that caching adds complexity without meaningful benefit.

### N+1 Prevention

The `getCanonicalSubmissions` function uses a single JOIN query — all related data fetched in one SQL call. This is the correct pattern and follows the existing `getApprovedPoints` precedent (which already does `leftJoin(boqItems, ...).leftJoin(people, ...)`).

The `getPortfolioOverview` query does a single aggregated query across all projects — no per-project looping.

**Avoid:** Calling `getProjectMetrics` in a loop for each project. Always write a single SQL query with `GROUP BY project_id` and return all projects in one call.

### Index Summary (all indexes needed for v2)

```sql
-- Submission aggregation (STATUS.md Phase note: hand-edited migration required for partial indexes)
CREATE INDEX submissions_status_submitted_idx ON submissions (status, submitted_at DESC);
CREATE INDEX submissions_pending_idx ON submissions (project_id, submitted_at DESC)
  WHERE status = 'pending_audit';
CREATE INDEX submissions_decided_by_idx ON submissions (decided_by, decided_at DESC)
  WHERE decided_by IS NOT NULL;

-- Activity log (new table — drizzle-kit will create base indexes; BTREE sufficient)
-- (covered by table definition indexes above)

-- Hakkediş period lookups
-- (covered by table definition indexes above)
```

---

## 6. SUGGESTED PHASE / BUILD ORDER

### Dependency Graph

```
unit_price on boq_items
    │
    ├─→ earned value formulas
    │       │
    │       ├─→ CanonicalSubmission type + getCanonicalSubmissions()
    │       │       │
    │       │       ├─→ Analytics page (scorecards, charts)
    │       │       ├─→ Excel multi-sheet export
    │       │       └─→ Hakkediş period line computation
    │       │
    │       └─→ Hakkediş tables + Server Actions
    │               │
    │               └─→ PDF export
    │
office_activity_log
    │
    └─→ Office engineer scorecard on Analytics page

(admin) route group + sidebar
    │
    └─→ Overview → People → Analytics → Hakkediş → Exports pages
        (each page is independent once the data layer exists)
```

### Recommended Build Sequence

**Phase A — Foundation: Data Model + Canonical Record**

Deliverables:
- `boq_items.unit_price` column + migration (0004)
- `office_activity_log` table + migration (0005)
- `hakedis_periods` + `hakedis_period_lines` tables + migration (0006)
- Index migration (0007) — hand-edited for partial indexes
- `src/lib/types/canonical-submission.ts` — CanonicalSubmission type
- `src/actions/analytics.ts` — `getCanonicalSubmissions()`, `getProjectMetrics()`, `getPersonMetrics()`, `getPortfolioOverview()`
- Unit price field in BOQ item create/edit Server Actions + UI in `BoqTab`
- Wiring `logOfficeActivity()` helper into existing Server Actions (projects, boq, people)
- Tests: unit tests for aggregation queries against seed data

Unblocks: everything else. Do this first.

**Phase B — Admin Shell IA**

Deliverables:
- `src/app/dashboard/(admin)/layout.tsx` + `AdminSidebar` component
- `src/app/dashboard/overview/page.tsx` — portfolio KPIs using `getPortfolioOverview()`
- `src/app/dashboard/people/page.tsx` — people list
- `src/app/dashboard/people/[personId]/page.tsx` — employee profile using `getPersonMetrics()`
- Redirect `/dashboard` → `/dashboard/overview`
- i18n keys in `messages/tr.json` + `messages/en.json` for new nav items

No new data layer work — all data comes from Phase A actions.

**Phase C — Analytics UI**

Deliverables:
- `src/app/dashboard/analytics/page.tsx` — date range filter + global filters
- Recharts client components: `ThroughputChart`, `RejectionRateChart`, `EarnedValueChart`
- Global filter state: use URL `searchParams` (`?from=&to=&project=&person=`) — no client state management library needed; follows existing `?tab=&status=&page=` pattern
- Activity log feed on Overview page (last N office actions)
- Submission detail page `projects/[id]/submissions/[submissionId]/page.tsx`

Unblocks: Hakkediş (requires understanding of earned value displays).

**Phase D — Hakkediş**

Deliverables:
- `src/actions/hakedis.ts` — `createHakkedişPeriod()`, `computePeriodLines()`, `finalizeHakkedişPeriod()`
- `src/app/dashboard/hakedis/page.tsx` — period list per project
- `src/app/dashboard/hakedis/[periodId]/page.tsx` — period detail + finalize button
- `computePeriodLines()` logic: aggregates approved submissions by boq_item_id up to periodEndDate, computes period vs cumulative quantities, snapshots unit prices
- KDV and retention calculation at finalization
- Log `hakkediş_period_created` and `hakkediş_period_finalized` to office_activity_log

Depends on: Phase A (hakkediş tables + unit_price), Phase C (engineers will want to see analytics before creating the first hakedis period).

**Phase E — Exports**

Deliverables:
- `src/lib/excel-exports.ts` — `generateSubmissionsExcel()`, `generateHakkedişExcel()`
- `src/app/api/exports/submissions/route.ts` — GET handler
- `src/app/api/exports/hakedis/[periodId]/route.ts` — GET handler (Excel)
- `src/components/pdf/HakkedişDocument.tsx` + `src/app/api/exports/hakedis/[periodId]/pdf/route.ts`
- Export trigger UI at `src/app/dashboard/exports/page.tsx`
- Log `hakkediş_exported` to office_activity_log

Depends on: Phase A (CanonicalSubmission), Phase D (hakedis period data).

---

## File Map: New vs Modified

### New Files

| File | Purpose |
|------|---------|
| `src/db/schema/office-activity-log.ts` | Activity log table |
| `src/db/schema/hakedis-periods.ts` | Hakkediş period table |
| `src/db/schema/hakedis-period-lines.ts` | Hakkediş line items table |
| `src/db/migrations/0004_*.sql` | unit_price column |
| `src/db/migrations/0005_*.sql` | office_activity_log table |
| `src/db/migrations/0006_*.sql` | hakedis tables |
| `src/db/migrations/0007_v2_indexes.sql` | Hand-edited: partial indexes (do not run drizzle-kit generate on this) |
| `src/lib/types/canonical-submission.ts` | CanonicalSubmission type |
| `src/lib/types/index.ts` | Type barrel export |
| `src/actions/analytics.ts` | Aggregation data-access layer |
| `src/actions/hakedis.ts` | Hakkediş CRUD + computation |
| `src/lib/excel-exports.ts` | Multi-sheet Excel builders |
| `src/components/pdf/HakkedişDocument.tsx` | React PDF template |
| `src/components/layout/AdminSidebar.tsx` | Admin nav sidebar |
| `src/app/dashboard/(admin)/layout.tsx` | Admin shell layout |
| `src/app/dashboard/overview/page.tsx` | Portfolio overview |
| `src/app/dashboard/people/page.tsx` | People list |
| `src/app/dashboard/people/[personId]/page.tsx` | Employee profile |
| `src/app/dashboard/analytics/page.tsx` | Analytics + charts |
| `src/app/dashboard/hakedis/page.tsx` | Hakkediş period list |
| `src/app/dashboard/hakedis/[periodId]/page.tsx` | Period detail |
| `src/app/dashboard/exports/page.tsx` | Export trigger UI |
| `src/app/dashboard/projects/[id]/submissions/[submissionId]/page.tsx` | Submission detail |
| `src/app/api/exports/submissions/route.ts` | Excel export handler |
| `src/app/api/exports/hakedis/[periodId]/route.ts` | Hakkediş Excel handler |
| `src/app/api/exports/hakedis/[periodId]/pdf/route.ts` | Hakkediş PDF handler |
| `src/components/dashboard/analytics/ThroughputChart.tsx` | Recharts throughput |
| `src/components/dashboard/analytics/EarnedValueChart.tsx` | Recharts earned value |
| `src/components/dashboard/analytics/RejectionRateChart.tsx` | Recharts rejection rate |

### Modified Files

| File | Change |
|------|--------|
| `src/db/schema/boq-items.ts` | Uncomment `unitPrice` column |
| `src/db/schema/index.ts` | Add exports for 3 new schema files |
| `src/actions/projects.ts` | Add `logOfficeActivity()` call after createProject/updateProject/deleteProject |
| `src/actions/boq.ts` | Add `logOfficeActivity()` on boq mutations; add `unit_price` to create/update |
| `src/actions/people.ts` | Add `logOfficeActivity()` on person_approved, person_assigned |
| `src/components/dashboard/BoqTab.tsx` / `BoqItemDialog.tsx` | Unit price input field |
| `src/app/dashboard/layout.tsx` | Import AdminSidebar or redirect `/dashboard` → `/dashboard/overview` |
| `src/components/layout/TopNav.tsx` | Link "Projects" updates or add Overview as home |
| `messages/tr.json` | New keys: overview, analytics, hakedis, exports nav labels + page strings |
| `messages/en.json` | Same |

---

## Integration Points and Constraints Summary

### Migration Constraint (CRITICAL)

The project uses `tsx src/db/migrate.ts` NOT `drizzle-kit push`. The flow for every new migration:

1. Edit schema file (e.g., `boq-items.ts`)
2. Run `npx drizzle-kit generate` → generates `src/db/migrations/000N_<random>.sql`
3. For migrations with **partial indexes** or other constructs `drizzle-kit` cannot emit correctly, create the file manually and name it `000N_v2_indexes.sql` — the migrate runner picks up all `.sql` files in the folder alphabetically
4. Run `tsx src/db/migrate.ts` to apply
5. Do NOT run `drizzle-kit push` — it bypasses the PostGIS `0000_enable_postgis.sql` pre-step and will fail on geometry columns

The `unit_price` column alteration is a plain `ALTER TABLE ADD COLUMN numeric` — safe for `drizzle-kit generate`. The new `office_activity_log` and `hakedis_*` tables are also plain — no geometry. Only the index migration (0007) needs hand-editing for partial indexes.

### Auth Boundary

Office engineers authenticate via Auth.js (`users` table, `text` PK). The `office_activity_log.actor_user_id` FK references `users.id` (text). All new Server Actions follow the existing pattern: `const session = await auth(); if (!session) throw new Error('Unauthorized');`. There is no new auth work in v2.

### Tenant Scoping

All new tables include `tenant_id uuid references tenants(id)` (nullable, matching v1 convention per D-09). All new data-access functions include `eq(table.tenantId, getDefaultTenantId())` in their WHERE clauses. Single-tenant MVP: `getDefaultTenantId()` returns the one tenant ID from `.env.local`. This constraint is already established and does not change.

### i18n

All new page strings go into `messages/tr.json` and `messages/en.json` before the page is built. Use `getTranslations('dashboard.analytics')`, `getTranslations('dashboard.hakedis')` etc. following the established namespace pattern. Navigation labels use `getTranslations('layout.nav')`.

---

## Patterns to Follow

### Pattern: Server Action → logOfficeActivity (fire-and-forget in same function)

```typescript
// src/actions/boq.ts (modified)
export async function setUnitPrice(boqItemId: string, price: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const [old] = await db.select({ unitPrice: boqItems.unitPrice })
    .from(boqItems).where(eq(boqItems.id, boqItemId)).limit(1);

  await db.update(boqItems)
    .set({ unitPrice: price })
    .where(and(eq(boqItems.id, boqItemId), eq(boqItems.tenantId, getDefaultTenantId())));

  // Log after successful write — if logging fails, mutation still succeeded
  await db.insert(officeActivityLog).values({
    tenantId: getDefaultTenantId(),
    actorUserId: session.user.id,
    actionType: 'unit_price_set',
    entityType: 'boq_item',
    entityId: boqItemId,
    metadata: { oldPrice: old?.unitPrice ?? null, newPrice: price },
  }).catch(() => {}); // swallow log errors — never block the mutation

  revalidatePath(`/dashboard/projects/${projectId}`);
}
```

### Pattern: Hakkediş Period Line Computation

```typescript
// src/actions/hakedis.ts
export async function computePeriodLines(periodId: string) {
  const period = await getHakkedişPeriod(periodId);
  if (period.status !== 'draft') throw new Error('Can only recompute draft periods');

  // Get cumulative approved quantities per BOQ item up to periodEndDate
  const cumulativeRows = await db.execute(sql`
    SELECT
      s.boq_item_id,
      b.material,
      b.unit,
      b.unit_price,
      SUM(s.quantity)::numeric(12,3) AS cumulative_qty
    FROM submissions s
    JOIN boq_items b ON b.id = s.boq_item_id
    WHERE s.project_id = ${period.projectId}
      AND s.tenant_id = ${getDefaultTenantId()}
      AND s.status = 'approved'
      AND s.decided_at <= ${period.periodEndDate}::timestamptz
    GROUP BY s.boq_item_id, b.material, b.unit, b.unit_price
  `);

  // Get end-of-previous-period quantities (from previous period's lines)
  const previousLines = await getPreviousPeriodLines(period.projectId, period.periodEndDate);
  const previousMap = new Map(previousLines.map(l => [l.boqItemId, l.cumulativeQtyApproved]));

  // Delete existing draft lines and replace
  await db.delete(hakkedişPeriodLines).where(eq(hakkedişPeriodLines.periodId, periodId));

  const lines = cumulativeRows.map(r => {
    const prevQty = previousMap.get(r.boq_item_id) ?? '0';
    const periodQty = (Number(r.cumulative_qty) - Number(prevQty)).toFixed(3);
    const periodValue = (Number(periodQty) * Number(r.unit_price ?? 0)).toFixed(2);
    const cumulativeValue = (Number(r.cumulative_qty) * Number(r.unit_price ?? 0)).toFixed(2);
    return {
      periodId,
      boqItemId: r.boq_item_id,
      materialSnapshot: r.material,
      unitSnapshot: r.unit,
      unitPriceSnapshot: r.unit_price ?? '0',
      cumulativeQtyApproved: r.cumulative_qty,
      previousCumulativeQty: prevQty,
      periodQty,
      periodValue,
      cumulativeValue,
      tenantId: getDefaultTenantId(),
    };
  });

  await db.insert(hakkedişPeriodLines).values(lines);
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern: Computing Earned Value in a Drizzle Relational Query

`db.query.submissions.findMany({ with: { boqItem: true } })` then multiplying in JS is N+1 and loses precision. Use `db.execute(sql\`SELECT s.quantity * b.unit_price ...\`)` so the multiplication happens in Postgres with full numeric precision.

### Anti-Pattern: Storing `earnedValue` as a Column on `submissions`

Earned value depends on `unit_price` which can change until hakkediş finalization. Storing it on each submission row creates stale data. Compute at query time or snapshot only at hakkediş finalization in the `period_lines` table.

### Anti-Pattern: Breaking Existing Routes with the New IA

The `(admin)` route group adds pages at new paths without touching existing paths. The existing `dashboard/projects`, `dashboard/projects/[id]`, etc. are preserved. Do NOT move existing pages into the `(admin)` group — that changes their URLs and breaks existing bookmarks and the Telegram bot's `revalidatePath()` calls.

### Anti-Pattern: Using Puppeteer for PDF Generation on Vercel

Chromium binary not available in Vercel serverless. Use `@react-pdf/renderer` (pure JS, Node.js compatible, Vercel-safe). This is a known Vercel constraint — HIGH confidence.

### Anti-Pattern: Streaming SQL for Aggregates via neon-http Driver

The `neon-http` driver (used in this project for both route handlers and migrations) does not support streaming. All queries return a full result set. This is fine for the data volumes expected in MVP (< 10k submissions). Design queries to return aggregated results, not streaming row-by-row.

---

## Sources

- Actual codebase: `src/db/schema/*.ts`, `src/actions/submissions.ts`, `src/db/migrate.ts`, `src/lib/excel.ts`, `src/app/dashboard/projects/[id]/page.tsx`
- v1 architecture archive: `.planning/research/_v1-archive/ARCHITECTURE.md`
- Neon serverless HTTP driver limitations: known from driver documentation (neon-http supports `sql.query()` for raw SQL but not streaming or `LISTEN/NOTIFY`)
- Vercel function limits: 4.5 MB response body, 60s timeout on Pro; confirmed from Vercel docs
- `@react-pdf/renderer` Vercel compatibility: HIGH confidence — pure Node.js, no binary deps
- Postgres partial index syntax: not supported by drizzle-kit generate (known limitation); requires hand-editing — confirmed from drizzle-kit issue tracker and this project's own `0003_slippery_prowler.sql` hand-edit precedent

---
*Architecture integration research for: bayrak.ai v2.0 Operations Intelligence & Hakkediş*
*Researched: 2026-05-25*
