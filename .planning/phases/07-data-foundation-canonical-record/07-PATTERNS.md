# Phase 7: Data Foundation & Canonical Record — Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 14 new/modified files
**Analogs found:** 14 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/db/schema/boq-items.ts` (modify) | model | CRUD | `src/db/schema/boq-items.ts` itself | self |
| `src/db/schema/office-activity-log.ts` | model | event-driven | `src/db/schema/audit-notifications.ts` | exact (new table, FKs to tenants + users + projects, multi-index) |
| `src/db/schema/hakedis-periods.ts` | model | CRUD | `src/db/schema/projects.ts` | role-match (uuid PK, tenantId, timestamps, named indexes) |
| `src/db/schema/hakedis-period-lines.ts` | model | CRUD | `src/db/schema/submissions.ts` | exact (numeric columns, cascade FK, multi-index, tenant scope) |
| `src/db/schema/index.ts` (modify) | config | — | `src/db/schema/index.ts` itself | self |
| `src/lib/types/canonical-submission.ts` | utility | transform | `src/actions/submissions.ts` (getSubmissions return shape) | role-match (shared type mirroring query columns) |
| `src/lib/types/index.ts` | config | — | `src/db/schema/index.ts` | role-match (barrel export pattern) |
| `src/lib/log-office-activity.ts` | utility | event-driven | `src/actions/boq.ts` (insert pattern) + `next/server after()` | role-match |
| `src/actions/analytics.ts` | service | request-response | `src/actions/submissions.ts` | exact (auth guard, tenant scope, db.execute sql``, multi-join) |
| `src/actions/boq.ts` (modify) | service | CRUD | `src/actions/boq.ts` itself | self |
| `src/actions/projects.ts` (modify) | service | CRUD | `src/actions/projects.ts` itself | self |
| `src/actions/people.ts` (modify) | service | CRUD | `src/actions/people.ts` | self |
| `src/actions/routes.ts` (modify) | service | CRUD | `src/actions/routes.ts` | self |
| `tests/analytics.test.ts` | test | — | `tests/boq.test.ts` + `tests/schema.test.ts` | exact (describeIfDb, mocks, beforeEach/afterEach truncate) |
| `tests/fixtures/db.ts` (modify) | test | — | `tests/fixtures/db.ts` itself | self |

---

## Pattern Assignments

### `src/db/schema/boq-items.ts` — add `unitPrice` and `currencyCode` columns

**Analog:** `src/db/schema/boq-items.ts` (lines 1–19) — extend existing table, do not rewrite.

**Existing column pattern to extend** (`src/db/schema/boq-items.ts` lines 11–14):
```typescript
plannedQty: numeric('planned_qty', { precision: 12, scale: 3 }).notNull(),
approvedQty: numeric('approved_qty', { precision: 12, scale: 3 }).notNull().default('0'),
// unit_price omitted per D-06; add nullable column in v2 for hakkediş
// unit_price: numeric('unit_price', { precision: 12, scale: 2 }),
```

**Replace the D-06 comment block** with:
```typescript
unitPrice: numeric('unit_price', { precision: 15, scale: 4 }),          // nullable — v1 rows have no price
currencyCode: text('currency_code').notNull().default('TRY'),            // ISO-4217; TRY is the default
```

**Precision note:** Use `(15,4)` not the commented `(12,2)` — handles TRY billions with sub-kuruş unit pricing.

---

### `src/db/schema/office-activity-log.ts` — new table

**Analog:** `src/db/schema/audit-notifications.ts` (lines 1–24)

**Imports pattern** (`src/db/schema/audit-notifications.ts` lines 1–8):
```typescript
import { pgTable, uuid, bigint, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { submissions } from './submissions';
import { people } from './people';
```

Copy this import structure. For `office-activity-log.ts` substitute:
```typescript
import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './auth';      // Auth.js users — text PK (NOT people.id)
import { tenants } from './tenants';
import { projects } from './projects';
```

**Table definition pattern** (`src/db/schema/audit-notifications.ts` lines 9–23):
```typescript
export const auditNotifications = pgTable('audit_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id), // nullable D-09 (matches all other tables)
  submissionId: uuid('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  auditorPersonId: uuid('auditor_person_id').notNull().references(() => people.id),
  ...
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('audit_notifications_submission_idx').on(t.submissionId),
  index('audit_notifications_auditor_idx').on(t.auditorPersonId),
]);
```

**Critical FK difference:** `actorUserId` references `users.id` which is `text` (Auth.js), not `uuid`. Do NOT use `people.id`. Pattern:
```typescript
actorUserId: text('actor_user_id').notNull().references(() => users.id),
```

**OFFICE_ACTION_TYPES const-as-array pattern** — use `as const` tuple for a union type without a pg enum (avoids migration on new values):
```typescript
export const OFFICE_ACTION_TYPES = ['project_created', 'boq_item_created', ...] as const;
export type OfficeActionType = (typeof OFFICE_ACTION_TYPES)[number];
```

---

### `src/db/schema/hakedis-periods.ts` — new table

**Analog:** `src/db/schema/projects.ts` (lines 1–13) for the base pattern; `src/db/schema/submissions.ts` (lines 46–48) for `text` enum-as-string pattern.

**Base table pattern** (`src/db/schema/projects.ts` lines 1–13):
```typescript
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),  // nullable for D-09
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('projects_tenant_idx').on(t.tenantId),
]);
```

**Status-as-text pattern** (`src/db/schema/submissions.ts` lines 46–48):
```typescript
status: text('status', { enum: ['pending_audit', 'approved', 'rejected'] })
  .notNull()
  .default('pending_audit'),
```

Use the same pattern for `hakedis_periods.status`:
```typescript
status: text('status').notNull().default('draft'),   // values: draft | finalized | submitted | paid
```

**Numeric rate columns** — follow `src/db/schema/submissions.ts` `numeric` precision pattern (lines 23, 32, 42):
```typescript
locationLat: numeric('location_lat', { precision: 10, scale: 7 }),
```

For deduction rates:
```typescript
kdvRate: numeric('kdv_rate', { precision: 5, scale: 4 }).notNull().default('0.2000'),
retentionRate: numeric('retention_rate', { precision: 5, scale: 4 }).notNull().default('0.0500'),
```

**onDelete: 'restrict' pattern** (`src/db/schema/submissions.ts` — use `boq-items.ts` itself as example):
```typescript
projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'restrict' }),
```

---

### `src/db/schema/hakedis-period-lines.ts` — new table

**Analog:** `src/db/schema/submissions.ts` (lines 1–66) — best match for a table with many numeric columns, cascade FK, and multi-index pattern.

**Imports pattern** (`src/db/schema/submissions.ts` lines 5–9):
```typescript
import { pgTable, uuid, text, numeric, boolean, timestamp, index, unique, geometry } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { people } from './people';
import { projects } from './projects';
import { boqItems } from './boq-items';
```

Substitute for `hakedis-period-lines.ts`:
```typescript
import { pgTable, uuid, text, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { hakedisPeriods } from './hakedis-periods';
import { boqItems } from './boq-items';
```

**Cascade FK pattern** (`src/db/schema/submissions.ts` line 16):
```typescript
projectId: uuid('project_id').notNull().references(() => projects.id),
```

For `hakedis_period_lines`, period cascade + boq restrict:
```typescript
periodId:  uuid('period_id').notNull().references(() => hakedisPeriods.id, { onDelete: 'cascade' }),
boqItemId: uuid('boq_item_id').notNull().references(() => boqItems.id, { onDelete: 'restrict' }),
```

**Multi-index array pattern** (`src/db/schema/submissions.ts` lines 55–65):
```typescript
}, (t) => [
  unique('submissions_flow_id_unique').on(t.flowId),
  index('submissions_project_idx').on(t.projectId),
  index('submissions_person_idx').on(t.personId),
  index('submissions_status_idx').on(t.status),
  ...
]);
```

**CHECK constraint note:** `drizzle-kit generate` cannot emit `CHECK (cumulative_qty_approved >= previous_cumulative_qty)`. Hand-add it to the generated migration SQL at the bottom of `0004_v2_data_foundation.sql` following the pattern established in `src/db/migrations/0003_slippery_prowler.sql`.

---

### `src/db/schema/index.ts` — add three barrel exports

**Analog:** `src/db/schema/index.ts` (lines 1–16) — existing barrel.

**Existing pattern** (`src/db/schema/index.ts` lines 14–16):
```typescript
export * from './submissions';         // references tenants, people, projects, boq-items
export * from './audit-notifications'; // references tenants, submissions, people (D-34)
```

**Add after `audit-notifications`** in FK-safe order (children after parents):
```typescript
export * from './office-activity-log'; // references tenants, users, projects
export * from './hakedis-periods';     // references tenants, projects, users
export * from './hakedis-period-lines'; // references tenants, hakedis-periods, boq-items
```

---

### `src/lib/types/canonical-submission.ts` — new shared type

**Analog:** The return shape of `getSubmissions()` in `src/actions/submissions.ts` (lines 288–302).

**Existing serialized-row pattern** (`src/actions/submissions.ts` lines 288–302):
```typescript
const serializedRows = rows.map((r) => ({
  id: r.id,
  boqMaterial: r.boqMaterial ?? null,
  quantity: Number(r.quantity),        // numeric string → number for old shape
  unit: r.unit ?? null,
  status: r.status,
  decidedAt: r.decidedAt?.toISOString() ?? null,
  submittedAt: r.submittedAt.toISOString(),
  ...
}));
```

**Key difference for CanonicalSubmission:** Keep `quantity`, `unitPrice`, `earnedValue` as `string | null` (not `Number()`), forcing callers to use `decimal.js` explicitly. This is the canonical boundary type — not a serialized display shape.

---

### `src/lib/types/index.ts` — new barrel

**Analog:** `src/db/schema/index.ts` (lines 1–3 — the file header + first export).

**Pattern:**
```typescript
// Barrel export of all shared TypeScript types for bayrak-ai.
export type { CanonicalSubmission } from './canonical-submission';
```

---

### `src/lib/log-office-activity.ts` — new utility

**Analog:** `src/actions/boq.ts` (lines 56–67) for the `db.insert().values()` call pattern; `next/server after()` is a new primitive with no existing analog.

**Insert pattern** (`src/actions/boq.ts` lines 56–67):
```typescript
const [inserted] = await db
  .insert(boqItems)
  .values({
    projectId,
    tenantId: getDefaultTenantId(),
    material: material.trim(),
    unit: unit.trim(),
    plannedQty: String(plannedQty),
    sortOrder,
  })
  .returning({ id: boqItems.id });
```

**`after()` fire-and-forget pattern** — no existing analog in codebase. The pattern from RESEARCH.md is canonical:
```typescript
import { after } from 'next/server';

export function logOfficeActivity(params: LogParams): void {
  after(async () => {
    try {
      await db.insert(officeActivityLog).values({ ... });
    } catch {
      // Swallow log errors — never propagate to the caller.
    }
  });
}
```

**Critical:** The function is synchronous (returns `void`). Never `await logOfficeActivity()`. The `after()` call schedules async work post-response. Only valid inside `'use server'` functions.

**Test mock for `after()`** — parallel to the existing `vi.mock('next/cache')` pattern in `tests/boq.test.ts` line 19:
```typescript
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
```

The equivalent for `after()`:
```typescript
vi.mock('next/server', () => ({
  after: vi.fn((fn) => fn()),  // execute immediately in tests; ignore lifecycle
}));
```

---

### `src/actions/analytics.ts` — new service (4 aggregation functions + getOfficeActivityLog)

**Analog:** `src/actions/submissions.ts` (full file, lines 1–311) — exact match for auth guard, tenant scope, raw SQL execution, multi-join.

**File header pattern** (`src/actions/submissions.ts` lines 1–2):
```typescript
'use server';
```

**Imports pattern** (`src/actions/submissions.ts` lines 23–30):
```typescript
import { sql, eq, and, isNotNull, desc } from 'drizzle-orm';
import { db } from '@/db';
import { submissions } from '@/db/schema/submissions';
import { boqItems } from '@/db/schema/boq-items';
import { routes } from '@/db/schema/routes';
import { people } from '@/db/schema/people';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';
```

For `analytics.ts` substitute schema imports to match query joins:
```typescript
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';
import type { CanonicalSubmission } from '@/lib/types';
```

**Auth guard pattern** — copy exactly from every function in `src/actions/submissions.ts` (e.g., lines 47–49):
```typescript
const session = await auth();
if (!session) throw new Error('Unauthorized');
```

**Tenant scope pattern** — all queries include (e.g., `src/actions/submissions.ts` lines 62–64):
```typescript
eq(submissions.tenantId, getDefaultTenantId()),  // CR-01: tenant scope
```

**Raw SQL execution pattern** (`src/actions/submissions.ts` lines 56–57):
```typescript
const result = await db
  .select({ ... sql<string>`ST_AsGeoJSON(${routes.geom})` ... })
  ...
```

For analytics `db.execute()` pattern (the approach for GROUP BY + FILTER clauses):
```typescript
const rows = await db.execute(sql`
  SELECT
    b.currency_code,
    SUM(s.quantity::numeric * b.unit_price::numeric)
      FILTER (WHERE s.status = 'approved' AND b.unit_price IS NOT NULL) AS earned_value,
    ...
  FROM submissions s
  JOIN boq_items b ON b.id = s.boq_item_id
  WHERE s.project_id = ${projectId}
    AND s.tenant_id  = ${tenantId}
  GROUP BY b.currency_code
`);

// Merge into Record<string, string> — never sum across currencies
const evByCurrency: Record<string, string> = {};
for (const row of rows.rows) {
  if (row.currency_code) {
    evByCurrency[String(row.currency_code)] = String(row.earned_value ?? '0');
  }
}
```

**Promise.all pattern for parallel queries** (`src/actions/submissions.ts` lines 259–285):
```typescript
const [rows, countRows] = await Promise.all([
  db.select({ ... }).from(submissions).where(and(...conditions))...,
  db.select({ count: sql<number>`count(*)::int` }).from(submissions).where(and(...conditions)),
]);
```

Use `Promise.all` in `getProjectMetrics()` to run the counts query and the currency-grouped values query in parallel.

---

### `src/actions/boq.ts` — modify (add `setUnitPrice`, wire `logOfficeActivity`)

**Analog:** `src/actions/boq.ts` itself — `updateBoqItem` (lines 78–125) is the template for `setUnitPrice`.

**Fetch-before-update pattern** (`src/actions/boq.ts` lines 116–122):
```typescript
const [row] = await db
  .select({ projectId: boqItems.projectId })
  .from(boqItems)
  .where(and(eq(boqItems.id, id), eq(boqItems.tenantId, getDefaultTenantId())))
  .limit(1);

if (row) revalidatePath(`/dashboard/projects/${row.projectId}`);
```

For `setUnitPrice`, fetch `{ unitPrice, projectId }` before the UPDATE so the old price is available for the activity log metadata.

**Validation pattern** (`src/actions/boq.ts` lines 46–48):
```typescript
if (isNaN(plannedQty) || plannedQty <= 0) {
  return { ok: false as const, error: 'Planned quantity must be a positive number' };
}
```

For `unitPrice` validation:
```typescript
if (params.unitPrice !== null) {
  const val = parseFloat(params.unitPrice);
  if (isNaN(val) || val < 0) {
    return { ok: false as const, error: 'Unit price must be a non-negative number' };
  }
}
```

**logOfficeActivity wiring** — add after every successful DB write, before `revalidatePath`. Pattern (fire-and-forget, no `await`):
```typescript
logOfficeActivity({
  actorUserId: session.user.id,
  actionType: 'boq_item_created',
  entityType: 'boq_item',
  entityId: inserted.id,
  projectId,
  metadata: { material, unit, plannedQty },
});
```

---

### `src/actions/projects.ts` — modify (wire `logOfficeActivity`)

**Analog:** `src/actions/projects.ts` lines 27–43 (`createProject` — the primary write + `revalidatePath` pattern).

**Existing createProject pattern** (`src/actions/projects.ts` lines 27–43):
```typescript
export async function createProject(input: { name: string; description?: string }) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const parsed = createProjectSchema.parse(input);

  const [project] = await db
    .insert(projects)
    .values({ name: parsed.name, description: parsed.description ?? null, tenantId: getDefaultTenantId() })
    .returning();

  revalidatePath('/dashboard/projects');
  return project;
}
```

**Add after `.returning()` block**, before `revalidatePath`:
```typescript
logOfficeActivity({
  actorUserId: session.user.id,
  actionType: 'project_created',
  entityType: 'project',
  entityId: project.id,
  metadata: { name: project.name },
});
```

Same placement pattern for `updateProject` (`actionType: 'project_updated'`) and `deleteProject` (`actionType: 'project_deleted'`).

---

### `src/actions/people.ts` and `src/actions/routes.ts` — modify (wire `logOfficeActivity`)

**Analog:** Same pattern as `projects.ts` wiring above. Add `logOfficeActivity()` after the primary DB write succeeds, before `revalidatePath()`, for:
- `people.ts`: person approval (`actionType: 'person_approved'`), person assignment (`actionType: 'person_assigned'`), unassignment (`actionType: 'person_unassigned'`)
- `routes.ts`: route upload success (`actionType: 'route_uploaded'`)

---

### `tests/analytics.test.ts` — new test file

**Analog:** `tests/boq.test.ts` (lines 1–46) for the overall structure; `tests/schema.test.ts` (lines 73–168) for DB integration test pattern.

**File header + mock pattern** (`tests/boq.test.ts` lines 1–27):
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';

// Mock next/cache to prevent revalidatePath from throwing outside Next.js context
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Mock auth() for authorized tests
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { email: 'test@example.com' } }),
}));
```

Add the `next/server` mock for `after()`:
```typescript
vi.mock('next/server', () => ({
  after: vi.fn((fn) => fn()),  // execute immediately in tests; ignore lifecycle
}));
```

**DB integration test structure** (`tests/schema.test.ts` lines 73–80):
```typescript
describeIfDb('assignments uniqueness (AUTH-04)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });
  ...
});
```

**Seed pattern** (`tests/fixtures/db.ts` lines 141–147):
```typescript
await db.insert(tenants).values({
  id: tenantId,
  name: 'Test Tenant',
}).onConflictDoNothing();
```

Use `onConflictDoNothing()` for all seed inserts. Use `db.execute(sql.raw(...))` for raw SQL fixture inserts (spatial data, or when bypassing Drizzle's typed insert for speed).

**auth mock with session.user.id** — extend the existing auth mock to include `id` for `logOfficeActivity` tests:
```typescript
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id', email: 'test@example.com' } }),
}));
```

---

### `tests/fixtures/db.ts` — modify (add new tables to `truncateAllTables`)

**Analog:** `tests/fixtures/db.ts` itself (lines 50–102) — FK-safe ordered truncation list.

**Existing table list pattern** (`tests/fixtures/db.ts` lines 54–73):
```typescript
const tables = [
  // Phase 3 tables (most dependent — references submissions/people/tenants)
  "audit_notifications",   // references submissions → must truncate before submissions
  // Phase 2 tables (most dependent — references people/projects/boq_items/tenants)
  "submissions",
  "conversation_state",
  "processed_updates",
  "assignments",
  "pending_people",
  "people",
  "boq_items",
  "routes",
  "projects",
  "tenants",
  // Auth.js tables
  "verification_tokens",
  "sessions",
  "accounts",
  "users",
];
```

**Add Phase 7 tables** in FK-safe order (most dependent first):
```typescript
const tables = [
  // Phase 7 tables (most dependent — add before their parents)
  "hakedis_period_lines",  // references hakedis_periods + boq_items → first
  "hakedis_periods",       // references projects + users → before projects/users
  "office_activity_log",   // references tenants + users + projects → before projects/users
  // Phase 3 tables
  "audit_notifications",
  ...
];
```

**The 42P01 fallback pattern** (`tests/fixtures/db.ts` lines 84–100) — the existing catch block already handles `undefined_table` errors by retrying with a filtered list. Follow the same pattern if Phase 7 tables are not yet migrated on a machine running earlier tests.

---

## Shared Patterns

### Auth Guard
**Source:** `src/actions/boq.ts` lines 35–36 (repeated in every Server Action)
**Apply to:** `src/actions/analytics.ts` (all exported functions), modified functions in `boq.ts`, `projects.ts`, `people.ts`, `routes.ts`
```typescript
const session = await auth();
if (!session) throw new Error('Unauthorized');
```

### Tenant Scope
**Source:** `src/actions/submissions.ts` lines 59–64, `src/actions/boq.ts` lines 62, 114
**Apply to:** All queries in `src/actions/analytics.ts`; `setUnitPrice()` UPDATE in `boq.ts`
```typescript
eq(boqItems.tenantId, getDefaultTenantId())  // always included in WHERE
```

Also used at insert time:
```typescript
tenantId: getDefaultTenantId(),
```

### Return Shape (ok/error discriminated union)
**Source:** `src/actions/boq.ts` lines 41–44, 68–70
**Apply to:** `setUnitPrice()` in `boq.ts`
```typescript
return { ok: false as const, error: 'Material is required' };
// ...
return { ok: true as const, id: inserted.id };
```

### Index Naming Convention
**Source:** All schema files — snake_case, `tablename_column_idx`
**Apply to:** All three new schema files
```typescript
index('office_activity_log_actor_idx').on(t.actorUserId),
index('hakedis_periods_project_idx').on(t.projectId),
index('hakedis_period_lines_period_idx').on(t.periodId),
```

### `timestamp` Column Convention
**Source:** `src/db/schema/projects.ts` lines 9–10; `src/db/schema/submissions.ts` lines 49, 53
**Apply to:** All three new schema tables
```typescript
createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
```

### Test Mock for `next/cache`
**Source:** `tests/boq.test.ts` lines 19–22
**Apply to:** `tests/analytics.test.ts` (any test calling Server Actions that use `revalidatePath`)
```typescript
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
```

---

## No Analog Found

All files have analogs. The `next/server after()` utility has no existing usage in the codebase — the pattern is fully specified in RESEARCH.md section "logOfficeActivity() — Helper and Wiring" and is used only in `src/lib/log-office-activity.ts`.

---

## Metadata

**Analog search scope:** `src/db/schema/`, `src/actions/`, `tests/`, `tests/fixtures/`
**Files scanned:** 13 schema files, 5 action files, 9 test files, 2 fixture files
**Pattern extraction date:** 2026-05-25
