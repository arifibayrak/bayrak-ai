# Phase 9: Performance Scorecards, Leaderboard & Alerts — Pattern Map

**Mapped:** 2026-05-27
**Files analyzed:** 14 new/modified files
**Analogs found:** 14 / 14

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/db/schema/tenant-settings.ts` | model | CRUD | `src/db/schema/tenants.ts` | role-match |
| `src/db/migrations/0007_v2_tenant_settings.sql` | migration | batch | `src/db/migrations/0006_v2_period_qty_check.sql` | exact |
| `src/actions/settings.ts` | service | CRUD | `src/actions/projects.ts` | exact |
| `src/actions/analytics.ts` (extend) | service | CRUD | `src/actions/analytics.ts` (existing) | exact |
| `src/components/admin/KpiCard.tsx` (extend) | component | request-response | `src/components/admin/KpiCard.tsx` (existing) | exact |
| `src/components/admin/ThresholdSettingsForm.tsx` | component | request-response | `src/components/dashboard/ProjectForm.tsx` | exact |
| `src/app/dashboard/(admin)/settings/page.tsx` | controller | request-response | `src/app/dashboard/(admin)/overview/page.tsx` | role-match |
| `src/app/dashboard/(admin)/overview/page.tsx` (extend) | controller | request-response | `src/app/dashboard/(admin)/overview/page.tsx` (existing) | exact |
| `src/app/dashboard/(admin)/people/page.tsx` (extend) | controller | request-response | `src/app/dashboard/(admin)/people/page.tsx` (existing) | exact |
| `src/app/dashboard/(admin)/people/[personId]/page.tsx` (extend) | controller | request-response | `src/app/dashboard/(admin)/people/[personId]/page.tsx` (existing) | exact |
| `src/app/dashboard/(admin)/analytics/page.tsx` (extend) | controller | request-response | `src/app/dashboard/(admin)/analytics/page.tsx` (existing) | exact |
| `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx` | controller | request-response | `src/app/dashboard/(admin)/people/[personId]/page.tsx` | role-match |
| `src/components/layout/TopNav.tsx` (extend) | component | request-response | `src/components/layout/TopNav.tsx` (existing) | exact |
| `tests/analytics.test.ts` (extend) | test | batch | `tests/analytics.test.ts` (existing) | exact |

---

## Pattern Assignments

### `src/db/schema/tenant-settings.ts` (model, CRUD)

**Analog:** `src/db/schema/tenants.ts`

**Imports pattern** (`tenants.ts` lines 1–7):
```typescript
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
```

**Core schema pattern** — extend with `integer` and `numeric`, reference `tenants.id`:
```typescript
// src/db/schema/tenants.ts lines 3–7 — copy pgTable shape exactly
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

**What to produce for `tenant-settings.ts`** — follow the same column pattern; add FK reference:
```typescript
import { pgTable, uuid, integer, numeric, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const tenantSettings = pgTable('tenant_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id).unique(),
  auditSlaHours: integer('audit_sla_hours').notNull().default(48),
  rejectionRateThreshold: numeric('rejection_rate_threshold', { precision: 5, scale: 4 }).notNull().default('0.3000'),
  stalledDays: integer('stalled_days').notNull().default(7),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

**Export from schema index:** after creation, import and re-export from `src/db/schema/index.ts` (if it exists) or from `src/db/index.ts` to make the table available to Drizzle queries.

---

### `src/db/migrations/0007_v2_tenant_settings.sql` (migration, batch)

**Analog:** `src/db/migrations/0006_v2_period_qty_check.sql`

**Migration file header pattern** (`0006_v2_period_qty_check.sql` lines 1–10):
```sql
-- HAND-WRITTEN (WR-05): drizzle-kit cannot emit CHECK constraints on numeric columns.
-- The hakedis_period_lines table is EMPTY in Phase 7 (populated in Phase 10), so adding
-- these CHECK constraints now is safe — there are no existing rows to violate them.
```

**Journal entry pattern** — next `idx` is 7; `tag` must exactly match the filename without `.sql`:
```json
{
  "idx": 7,
  "version": "7",
  "when": 1748390400000,
  "tag": "0007_v2_tenant_settings",
  "breakpoints": true
}
```
The `_journal.json` at `src/db/migrations/meta/_journal.json` currently has 7 entries (idx 0–6). Append idx 7.

**Statement-breakpoint delimiter** (required between every DDL statement — established in all existing migrations):
```sql
--> statement-breakpoint
```

**Core migration SQL shape** (must hand-verify after `drizzle-kit generate`):
```sql
-- HAND-WRITTEN addendum: drizzle-kit generate may omit precision/default/UNIQUE.
-- Verify after generate: numeric(5,4), DEFAULT '0.3000' (string literal NOT 0.3), UNIQUE on tenant_id.
CREATE TABLE "tenant_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "audit_sla_hours" integer NOT NULL DEFAULT 48,
  "rejection_rate_threshold" numeric(5,4) NOT NULL DEFAULT '0.3000',
  "stalled_days" integer NOT NULL DEFAULT 7,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_tenant_id_unique" UNIQUE ("tenant_id");
--> statement-breakpoint
-- Seed default tenant row — idempotent (ON CONFLICT DO NOTHING)
INSERT INTO "tenant_settings" (tenant_id, audit_sla_hours, rejection_rate_threshold, stalled_days)
VALUES ('00000000-0000-0000-0000-000000000001', 48, '0.3000', 7)
ON CONFLICT (tenant_id) DO NOTHING;
```

**Generation command** (from RESEARCH.md Pattern 1):
```bash
DATABASE_URL="<neon-url>" npx tsx node_modules/.bin/drizzle-kit generate
# Then rename generated file to 0007_v2_tenant_settings.sql and update journal tag
npx tsx src/db/migrate.ts
```

---

### `src/actions/settings.ts` (service, CRUD)

**Analog:** `src/actions/projects.ts`

**File header + 'use server' directive** (`projects.ts` lines 1–12):
```typescript
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { auth } from '@/lib/auth';
import { getDefaultTenantId } from '@/lib/tenant';
```

**Auth guard + tenant scope pattern** (`projects.ts` lines 29–40):
```typescript
export async function createProject(input: { name: string; description?: string }) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  // tenantId used in all WHERE clauses:
  const tenantId = getDefaultTenantId();  // called inside function, not at module level
```

**Zod validation pattern** (`projects.ts` lines 14–25):
```typescript
const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required.'),
  description: z.string().optional(),
});
// ...
const parsed = createProjectSchema.parse(input);
```

**revalidatePath after mutation** (`projects.ts` lines 54–55):
```typescript
revalidatePath('/dashboard/projects');
return project;
```

**What to produce for `settings.ts`:**
- `getTenantSettings()` — auth guard + tenant scope + `db.execute(sql\`SELECT ... FROM tenant_settings WHERE tenant_id = ${tenantId}\`)` + return typed object or defaults
- `updateTenantSettings(input)` — auth guard + zod parse (see RESEARCH.md Pattern 8 schema) + `db.execute(sql\`INSERT ... ON CONFLICT DO UPDATE\`)` + `revalidatePath('/dashboard/overview')` + `revalidatePath('/dashboard/settings')` + return `{ ok: true }`

**Zod schema for settings** (RESEARCH.md Pattern 8):
```typescript
const settingsSchema = z.object({
  auditSlaHours: z.number().int().min(1).max(720),
  rejectionRateThreshold: z.number().min(0).max(1),
  stalledDays: z.number().int().min(1).max(365),
});
```

**Upsert pattern for settings** (RESEARCH.md Code Examples):
```typescript
await db.execute(sql`
  INSERT INTO tenant_settings (tenant_id, audit_sla_hours, rejection_rate_threshold, stalled_days, updated_at)
  VALUES (${tenantId}, ${parsed.auditSlaHours}, ${parsed.rejectionRateThreshold}, ${parsed.stalledDays}, NOW())
  ON CONFLICT (tenant_id)
  DO UPDATE SET
    audit_sla_hours            = EXCLUDED.audit_sla_hours,
    rejection_rate_threshold   = EXCLUDED.rejection_rate_threshold,
    stalled_days               = EXCLUDED.stalled_days,
    updated_at                 = NOW()
`);
```

---

### `src/actions/analytics.ts` (extend: add `outputQuantitySum`, `slaBreach`, `getStalledProjects`, `getTenantSettings` read)

**Analog:** `src/actions/analytics.ts` (existing — exact)

**`PersonMetrics` type extension** (add optional fields after line 64, current type ends at line 64):
```typescript
// EXISTING (lines 50–64):
export type PersonMetrics = {
  personId: string;
  displayName: string;
  submissionsApproved: number;
  submissionsRejected: number;
  submissionsPending: number;
  locationComplianceRate: number | null;
  valueContributedByCurrency: Record<string, string>;
  decisionsCount?: number;
  avgDecisionLatencyHours?: number | null;
  pendingBacklogCount?: number;
  // ADD:
  outputQuantitySum?: string | null;     // SUM(quantity) for approved submissions
  slaBreach RateDecided?: number | null; // fraction 0–1; null when no decided submissions
};
```

**`getPersonMetrics` signature extension** (current signature at line 661–663):
```typescript
// CURRENT:
export async function getPersonMetrics(
  personId: string,
  options?: { projectIds?: string[]; asAuditor?: boolean; dateRange?: { from: Date; to: Date } }
)
// ADD auditSlaHours to options (optional — existing call sites unaffected):
export async function getPersonMetrics(
  personId: string,
  options?: { projectIds?: string[]; asAuditor?: boolean; dateRange?: { from: Date; to: Date }; auditSlaHours?: number }
)
```

**Worker Query 1 extension** — add `outputQuantitySum` to the existing SELECT (lines 682–697). Append after `location_compliance_rate`:
```typescript
// ADD alongside existing COUNT FILTER blocks:
SUM(s.quantity::numeric) FILTER (WHERE s.status = 'approved')   AS output_quantity_sum,
```
Then in the result mapping (around line 738), add:
```typescript
metrics.outputQuantitySum = workerRow?.output_quantity_sum != null
  ? String(workerRow.output_quantity_sum)
  : null;
```

**Auditor Query 3 extension** — add SLA breach rate to existing auditor SELECT (lines 743–755). The existing query already has the `FILTER (WHERE s.decided_at IS NOT NULL)` pattern to copy:
```typescript
// ADD after avg_decision_latency_hours in the same SELECT:
COUNT(*) FILTER (
  WHERE s.decided_at IS NOT NULL
    AND (EXTRACT(EPOCH FROM (s.decided_at - s.submitted_at)) / 3600.0) > ${auditSlaHours}
)::float
  / NULLIF(COUNT(*) FILTER (WHERE s.decided_at IS NOT NULL), 0)  AS sla_breach_rate
```
`${auditSlaHours}` must be a bound param (never `sql.raw()`). When `options?.auditSlaHours` is undefined, the field returns null safely — use:
```typescript
metrics.slaBreach RateDecided = (auditorRow?.sla_breach_rate != null && options?.auditSlaHours != null)
  ? Number(auditorRow.sla_breach_rate)
  : null;
```

**New `getStalledProjects` function** — follow auth+tenant guard pattern (lines 665–667), then raw sql execution pattern (lines 681+). The stalled query uses `NOT EXISTS` sub-select (RESEARCH.md Pattern 5). Critical: do NOT apply date filter (D-66 / Pitfall) — stalled is always point-in-time from NOW.

**`PortfolioAuditor` type extension** (line 941) — add optional `slaBreach RateDecided` if the leaderboard `sla_breach` sort option needs it; this requires passing threshold to `getPortfolioPeople`. RESEARCH.md recommends deferring this to TypeScript sort on `avgDecisionLatencyHours` (already present). Implement `sla_breach` leaderboard sort as null-last if field is absent.

---

### `src/components/admin/KpiCard.tsx` (extend: `alertBadge` prop + `'warning'` ValueColor)

**Analog:** `src/components/admin/KpiCard.tsx` (exact, lines 1–73)

**Current `ValueColor` type** (line 15):
```typescript
type ValueColor = 'default' | 'success' | 'destructive';
```
**Extend to:**
```typescript
type ValueColor = 'default' | 'success' | 'destructive' | 'warning';
```

**Current `colorClass` function** (lines 26–30):
```typescript
function colorClass(color: ValueColor): string {
  if (color === 'success') return 'text-emerald-700';
  if (color === 'destructive') return 'text-destructive';
  return 'text-foreground';
}
```
**Extend to** (add one line before the return):
```typescript
  if (color === 'warning') return 'text-amber-600';
```

**Current `KpiCardProps` interface** (lines 17–24):
```typescript
interface KpiCardProps {
  label: string;
  subLabel: string;
  value: number | string;
  icon: React.ReactNode;
  drillHref?: string;
  valueColor?: ValueColor;
}
```
**Extend to** (add `alertBadge`):
```typescript
  alertBadge?: React.ReactNode;  // optional — absolute top-right corner badge
```

**Current Card JSX** (line 49):
```tsx
<Card>
```
**Extend to** (add `relative` class when `alertBadge` is present):
```tsx
<Card className={alertBadge ? 'relative' : undefined}>
  {alertBadge && (
    <span className="absolute top-2 right-2" aria-label="Alert: threshold exceeded">
      {alertBadge}
    </span>
  )}
```

---

### `src/components/admin/ThresholdSettingsForm.tsx` (component, request-response)

**Analog:** `src/components/dashboard/ProjectForm.tsx` (exact)

**Full pattern to copy** (`ProjectForm.tsx` lines 1–124):

**File header + directive** (line 1):
```typescript
'use client';
```

**Imports pattern** (lines 1–10):
```typescript
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateTenantSettings } from '@/actions/settings';
```

**State + handleSubmit pattern** (lines 32–64 in ProjectForm):
```typescript
const [submitting, setSubmitting] = useState(false);
const [serverError, setServerError] = useState('');
// Per-field state: auditSlaHours, rejectionRatePercent, stalledDays
// Per-field error: auditSlaError, rejectionRateError, stalledDaysError

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  // 1. Client-side validation (validate on submit, not on blur — per ProjectForm pattern)
  // 2. setSubmitting(true)
  // 3. try { await updateTenantSettings({ auditSlaHours, rejectionRateThreshold: rejectionRatePercent / 100, stalledDays }) }
  // 4. catch { setServerError(...) }
  // 5. finally { setSubmitting(false) }
}
```

**Error message pattern** (ProjectForm lines 87–90):
```tsx
{nameError && (
  <p id="name-error" className="text-sm text-destructive">
    {nameError}
  </p>
)}
```
Map to: `aria-describedby` on each `<Input>` pointing to its error `<p>`.

**Success feedback** — NOT in ProjectForm (ProjectForm uses router.push). Settings form keeps the user on the same page; show a transient `<Alert>` for 3 seconds using `useState<boolean>` + `setTimeout`:
```typescript
const [saved, setSaved] = useState(false);
// On success:
setSaved(true);
setTimeout(() => setSaved(false), 3000);
```

**Form layout** (ProjectForm line 72):
```tsx
<form onSubmit={handleSubmit} noValidate className="space-y-6 max-w-xl">
```

**Label + Input + unit annotation pattern** (ProjectForm lines 74–90 adapted):
```tsx
<div className="space-y-1.5">
  <Label htmlFor="audit-sla">{t('settings.audit_sla_label')}</Label>
  <p className="text-sm text-muted-foreground">{t('settings.audit_sla_desc')}</p>
  <div className="flex items-center gap-2">
    <Input
      id="audit-sla"
      type="number"
      min={1}
      max={720}
      value={auditSlaHours}
      onChange={(e) => setAuditSlaHours(Number(e.target.value))}
      className="w-[120px]"
      aria-describedby={auditSlaError ? 'audit-sla-error' : undefined}
      disabled={submitting}
    />
    <span className="text-sm text-muted-foreground" aria-label="hours">
      {t('settings.audit_sla_unit')}
    </span>
  </div>
  {auditSlaError && (
    <p id="audit-sla-error" className="text-sm text-destructive">{auditSlaError}</p>
  )}
</div>
```

**Props interface:**
```typescript
interface ThresholdSettingsFormProps {
  defaultAuditSlaHours: number;
  defaultRejectionRatePercent: number;  // 0–100 (converted from 0–1 on page load)
  defaultStalledDays: number;
}
```

---

### `src/app/dashboard/(admin)/settings/page.tsx` (controller, request-response)

**Analog:** `src/app/dashboard/(admin)/overview/page.tsx`

**force-dynamic + RSC pattern** (overview `page.tsx` lines 27–39):
```typescript
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ ... }>;
}

export default async function OverviewPage({ searchParams }: Props) {
  const t = await getTranslations('dashboard.admin.overview');
  const [kpis, ...] = await Promise.all([...]);
```

**Settings page does NOT need searchParams** — no filter params. Structure:
```typescript
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect('/auth/signin');

  const t = await getTranslations('dashboard.admin.settings');
  const settings = await getTenantSettings();
  // Pass defaults to ThresholdSettingsForm
}
```

**Page layout pattern** (overview lines 123–128):
```tsx
<div className="space-y-8">
  <div className="space-y-1">
    <h1 className="text-xl font-semibold">{t('heading')}</h1>
    <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
  </div>
  {/* Card wrapping ThresholdSettingsForm */}
  <Card>
    <CardHeader>
      <CardTitle>{t('form_section_title')}</CardTitle>
    </CardHeader>
    <CardContent>
      <ThresholdSettingsForm
        defaultAuditSlaHours={settings.auditSlaHours}
        defaultRejectionRatePercent={Math.round(Number(settings.rejectionRateThreshold) * 100)}
        defaultStalledDays={settings.stalledDays}
      />
    </CardContent>
  </Card>
</div>
```

---

### `src/app/dashboard/(admin)/overview/page.tsx` (extend: alert badges + Stalled KpiCard)

**Analog:** `src/app/dashboard/(admin)/overview/page.tsx` (exact)

**Parallel fetch extension** (current lines 58–64):
```typescript
const [kpis, trends, overview, projectsData, activePeople] = await Promise.all([
  getPortfolioKPIs(filters),
  getPortfolioTrends(filters),
  getPortfolioOverview(),
  getProjects(),
  getActivePeople(),
]);
// ADD to Promise.all:
//   getTenantSettings(),
//   getStalledProjects(settings.stalledDays),   ← but settings needed first
// Pattern: two-phase fetch OR pass stalledDays as a param computed after settings resolves
```
Since `stalledDays` depends on `settings`, use a two-step pattern:
```typescript
const [kpis, trends, overview, projectsData, activePeople, settings] = await Promise.all([...existing..., getTenantSettings()]);
const stalledProjects = await getStalledProjects(settings.stalledDays);
```

**Alert color computation** (follow existing `pendingColor` pattern at line 110–111):
```typescript
const pendingColor: 'destructive' | 'default' =
  kpis.pendingBacklog > 20 ? 'destructive' : 'default';
// Phase 9 replaces this with threshold-aware computation:
const pendingColor: 'destructive' | 'warning' | 'default' =
  kpis.pendingBacklog > 0 /* && avg latency > settings.auditSlaHours */ ? 'destructive' : 'default';
const rejectionAlertFires = isDateFiltered &&
  (kpis.rejectionsInRange / Math.max(kpis.approvalsInRange + kpis.rejectionsInRange, 1))
    > Number(settings.rejectionRateThreshold);
const rejectionColor: 'destructive' | 'default' = rejectionAlertFires ? 'destructive' : 'default';
const stalledColor: 'destructive' | 'default' = stalledProjects.length >= 1 ? 'destructive' : 'default';
```

**KPI grid extension** (current line 143 — `grid-cols-4` → `grid-cols-5`):
```tsx
{/* Phase 9: grid-cols-2 md:grid-cols-3 lg:grid-cols-5 */}
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-8">
```

**alertBadge prop pattern** (new per UI-SPEC — icon-only TriangleAlert badge):
```tsx
import { TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const alertBadgeEl = (
  <Badge variant="destructive" className="p-1">
    <TriangleAlert className="h-3 w-3" aria-hidden="true" />
  </Badge>
);

<KpiCard
  label={t('kpi_pending_label')}
  subLabel={t('kpi_pending_sub')}
  value={kpis.pendingBacklog}
  icon={<Clock className="h-5 w-5" />}
  drillHref={pendingDrillHref}
  valueColor={pendingColor}
  alertBadge={pendingColor !== 'default' ? alertBadgeEl : undefined}
/>
```

**New Stalled KpiCard** (5th card, after active workers):
```tsx
import { PauseCircle } from 'lucide-react';

<KpiCard
  label={t('kpi_stalled_label')}
  subLabel={stalledProjects.length >= 1
    ? t('kpi_stalled_sub_alert', { days: settings.stalledDays })
    : t('kpi_stalled_sub_healthy')}
  value={stalledProjects.length}
  icon={<PauseCircle className="h-5 w-5" />}
  drillHref={stalledProjects.length >= 1 ? '/dashboard/projects?stalled=true' : undefined}
  valueColor={stalledColor}
  alertBadge={stalledColor !== 'default' ? alertBadgeEl : undefined}
/>
```

---

### `src/app/dashboard/(admin)/people/page.tsx` (extend: leaderboard sort)

**Analog:** `src/app/dashboard/(admin)/people/page.tsx` (exact)

**searchParams destructuring** (current line 44 — add `sortBy`):
```typescript
const { from, to, project, role, sortBy } = await searchParams;
```

**TypeScript sort in RSC** (after parallel fetch at line 58 — no new DB call needed):
```typescript
// Workers: sort the already-fetched array
const workerSortFn = getWorkerSortFn(sortBy);
const sortedWorkers = [...workers].sort(workerSortFn);

// Add rank (standard competition: 1, 1, 3)
const rankedWorkers = addRanks(sortedWorkers, workerSortFn);
```

**Sort function helper** — define above the page component:
```typescript
type WorkerSortKey = 'approved' | 'rejected' | 'rejection_rate' | 'value';
function getWorkerSortFn(sortBy?: string) {
  if (sortBy === 'rejected') return (a: PortfolioWorker, b: PortfolioWorker) =>
    b.submissionsRejected - a.submissionsRejected || a.displayName.localeCompare(b.displayName);
  if (sortBy === 'rejection_rate') return (a: PortfolioWorker, b: PortfolioWorker) => {
    const rateA = (a.submissionsRejected / Math.max(a.submissionsApproved + a.submissionsRejected, 1));
    const rateB = (b.submissionsRejected / Math.max(b.submissionsApproved + b.submissionsRejected, 1));
    return rateB - rateA || a.displayName.localeCompare(b.displayName);
  };
  // default: 'approved'
  return (a: PortfolioWorker, b: PortfolioWorker) =>
    b.submissionsApproved - a.submissionsApproved || a.displayName.localeCompare(b.displayName);
}
```

**Rank column** — prepend a `<TableHead>` with `scope="col" aria-label="Rank"` containing `"#"`. In `TableRow`, prepend a `<TableCell>` with the rank cell:
```tsx
// Rank badge rendering (follow Badge pattern at people/page.tsx line 133):
{w.rank === 1 && <Badge className="bg-primary text-primary-foreground">{w.rank}</Badge>}
{w.rank !== null && w.rank <= 3 && w.rank > 1 && <Badge variant="secondary">{w.rank}</Badge>}
{w.rank !== null && w.rank > 3 && (
  <span className="text-sm font-semibold text-muted-foreground tabular-nums">{w.rank}</span>
)}
```

**"Rank by" selector** — a `'use client'` component (since it updates URL params) using `useRouter` + `useSearchParams`:
```typescript
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// useRouter().push() to update sortBy param — mirrors FilterBar.tsx pattern
```
Wrap in `<Suspense>` (same as FilterBar, since it uses `useSearchParams`).

---

### `src/app/dashboard/(admin)/people/[personId]/page.tsx` (extend: scorecard enrichment)

**Analog:** `src/app/dashboard/(admin)/people/[personId]/page.tsx` (exact)

**Parallel fetch extension** (current lines 82–95):
```typescript
const [workerMetrics, auditorMetrics, workerSubmissions, auditorDecisions] = await Promise.all([
  isWorker
    ? getPersonMetrics(personId, { asAuditor: false, dateRange, projectIds })
    : null,
  isAuditor
    ? getPersonMetrics(personId, { asAuditor: true, dateRange, projectIds })
    : null,
  ...
]);
// Phase 9: fetch settings first (needed for auditSlaHours param):
const settings = await getTenantSettings();
// Then in Promise.all, pass auditSlaHours:
getPersonMetrics(personId, { asAuditor: true, dateRange, projectIds, auditSlaHours: settings.auditSlaHours })
```

**Worker KPI grid extension** (current `grid-cols-4` at line 204 → `grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6`):
- Current: 4 cards (approved, rejected, location, value)
- Phase 9: add Output Volume (card 5) + Approval Rate (card 6)

**New worker KPI card** — follow exact KpiCard usage pattern (lines 205–231):
```tsx
// Output Volume card (new)
<KpiCard
  label={t('scorecard.output_volume_label')}
  subLabel={dateRange ? t('scorecard.output_volume_throughput', { n: throughputDisplay }) : '—'}
  value={workerMetrics.outputQuantitySum != null
    ? new Intl.NumberFormat('tr-TR').format(Number(workerMetrics.outputQuantitySum))
    : '—'}
  icon={<Package className="size-5 text-muted-foreground" />}
/>

// Approval Rate card (new)
<KpiCard
  label={t('scorecard.approval_rate_label')}
  subLabel={t('scorecard.approval_rate_sub')}
  value={workerDecided > 0 ? `${((workerApproved / workerDecided) * 100).toFixed(1)}%` : '—'}
  icon={<TrendingUp className="size-5 text-muted-foreground" />}
  valueColor={workerDecided > 0
    ? (workerApproved / workerDecided >= 0.8 ? 'success' : workerApproved / workerDecided >= 0.5 ? 'default' : 'destructive')
    : 'default'}
/>
```

**New auditor KPI card** (SLA Breach Rate — extends current 4-card auditor grid at line 246):
```tsx
<KpiCard
  label={t('scorecard.sla_breach_label')}
  subLabel={t('scorecard.sla_breach_sub')}
  value={auditorMetrics.slaBreach RateDecided != null
    ? `${(auditorMetrics.slaBreach RateDecided * 100).toFixed(1)}%`
    : '—'}
  icon={<AlertTriangle className="size-5" style={{ color: slaBreachColor }} aria-hidden="true" />}
  valueColor={slaBreachValueColor}
/>
// slaBreachValueColor logic (from UI-SPEC):
// > 20%: 'destructive'; 10–20%: 'warning'; < 10%: 'success'; null: 'default'
```

---

### `src/app/dashboard/(admin)/analytics/page.tsx` (extend: OE scorecard entry point)

**Analog:** `src/app/dashboard/(admin)/analytics/page.tsx` (existing, lines 1–22)

**Current structure to preserve** (lines 1–22):
```typescript
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const t = await getTranslations('dashboard.admin.stubs');
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('analytics_heading')}</h1>
        <Badge variant="secondary">{t('coming_soon')}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{t('analytics_body')}</p>
    </div>
  );
}
```

**Phase 9 extension** — replace the static body with:
1. Keep heading + coming-soon badge
2. Add a section: `getOfficeEngineers()` (new function in `src/actions/people.ts` or inline query) → list of users with tenant scope
3. Render a `<Table>` of engineers with `Link href={/dashboard/analytics/office-engineers/${user.id}}` — same table pattern as people directory (lines 96–156 in `people/page.tsx`)

---

### `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx` (new controller)

**Analog:** `src/app/dashboard/(admin)/people/[personId]/page.tsx`

**force-dynamic + params pattern** (people `[personId]/page.tsx` lines 38–47):
```typescript
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ userId: string }>;   // ← userId not personId
}

export default async function OEProfilePage({ params }: Props) {
  const { userId } = await params;
```

**notFound() guard** (people `[personId]/page.tsx` lines 67–70):
```typescript
if (personRows.length === 0) {
  notFound();
}
```
Apply same pattern: if user not found in `users` table for this tenant, call `notFound()`.

**Back link pattern** (people `[personId]/page.tsx` lines 165–169):
```tsx
<nav className="text-sm text-muted-foreground">
  <Link href="/dashboard/analytics" className="hover:underline">
    {t('oe_scorecard.back_link')}  {/* "← Analytics" */}
  </Link>
</nav>
```

**Person name + role badge** (people `[personId]/page.tsx` lines 172–183):
```tsx
<div className="space-y-2">
  <h1 className="text-xl font-semibold">{userRow.name ?? userRow.email}</h1>
  <Badge variant="secondary">{t('oe_scorecard.role_badge')}</Badge>
</div>
```

**Activity log table** — data from `getOfficeActivityLog({ actorUserId: userId })` (existing function in `analytics.ts` line 580). Empty state uses `ClipboardList` icon + muted text (pattern: people directory empty state at people `page.tsx` lines 91–94):
```tsx
{entries.length === 0 ? (
  <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
    <ClipboardList className="size-12" />
    <p className="text-sm">{t('oe_scorecard.empty_state')}</p>
  </div>
) : (
  <Table>...</Table>
)}
```

**Table columns** — Timestamp + Action + Context. Follow `TableHead`/`TableRow` pattern exactly from people `page.tsx` lines 99–105:
```tsx
<TableHeader>
  <TableRow>
    <TableHead scope="col">{t('oe_scorecard.col_timestamp')}</TableHead>
    <TableHead scope="col">{t('oe_scorecard.col_action')}</TableHead>
    <TableHead scope="col">{t('oe_scorecard.col_context')}</TableHead>
  </TableRow>
</TableHeader>
```

---

### `src/components/layout/TopNav.tsx` (extend: settings gear icon)

**Analog:** `src/components/layout/TopNav.tsx` (exact, lines 1–53)

**Current right-side items** (lines 29–52):
```tsx
<div className="flex items-center gap-3">
  <LanguageToggle currentLocale={locale} />
  {userEmail && (
    <span className="text-sm text-muted-foreground hidden sm:block">{userEmail}</span>
  )}
  <form action={...}>
    <Button type="submit" variant="ghost" size="sm">{t('sign_out')}</Button>
  </form>
</div>
```

**Add gear icon** — insert after `<LanguageToggle>`, before user email:
```tsx
import Link from 'next/link';
import { Settings } from 'lucide-react';

{/* Settings gear icon — navigates to /dashboard/settings */}
<Link
  href="/dashboard/settings"
  className="text-muted-foreground hover:text-foreground ml-2"
  aria-label={tAdmin('settings_aria_label')}  {/* "Open settings" / "Ayarları aç" */}
>
  <Settings className="h-5 w-5" aria-hidden="true" />
</Link>
```

The `tAdmin` translation key must be added: `dashboard.admin.nav.settings_aria_label`.

---

### `tests/analytics.test.ts` (extend: new test blocks)

**Analog:** `tests/analytics.test.ts` (exact, lines 1–80)

**File header mocks** (lines 15–37) — ALL THREE mocks must be present in every new `describeIfDb` block's parent test file:
```typescript
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id', email: 'test@example.com' } }),
}));
vi.mock('next/server', () => ({
  after: vi.fn((fn) => Promise.resolve(fn())),
}));
```

**`describeIfDb` block pattern** (lines 41–72):
```typescript
describeIfDb('PERF-01/02: getPersonMetrics enrichments', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('returns outputQuantitySum for approved submissions', async () => {
    // seed: tenant, project, person, boq_item, submission(approved, qty=10)
    const { getPersonMetrics } = await import('@/actions/analytics');
    const metrics = await getPersonMetrics(personId, { asAuditor: false });
    expect(metrics.outputQuantitySum).toBe('10');
  });
});
```

**Seed pattern** (lines 61–65 — use `sql.raw` for inserts in tests, same as existing):
```typescript
await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantId}', 'Test') ON CONFLICT DO NOTHING`));
```

**Auth guard test pattern** (lines 74–80):
```typescript
it('throws Unauthorized when auth() returns null', async () => {
  const { auth } = await import('@/lib/auth');
  (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
  const { getPersonMetrics } = await import('@/actions/analytics');
  await expect(getPersonMetrics(personId)).rejects.toThrow('Unauthorized');
});
```

**New `describeIfDb` blocks to add:**
1. `'PERF-01/02: getPersonMetrics enrichments'` — outputQuantitySum, slaBreach RateDecided, null-safe denominator
2. `'PERF-06: getStalledProjects'` — stalled when last approval > N days, not stalled when recent, no-submissions project excluded
3. `'PERF-06: getTenantSettings / updateTenantSettings'` — returns defaults from seeded row, upsert, auth guard, zod rejection
4. `'PERF-05: leaderboard sort'` — pure sort unit test (no DB needed; use `describeIfDb` only if data is required, else plain `describe`)

---

## Shared Patterns

### Authentication guard
**Source:** `src/actions/projects.ts` lines 29–30; `src/actions/analytics.ts` lines 665–667
**Apply to:** `src/actions/settings.ts` (all functions), `src/app/dashboard/(admin)/settings/page.tsx`, `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx`
```typescript
const session = await auth();
if (!session) throw new Error('Unauthorized');
const tenantId = getDefaultTenantId();
```

### Tenant scope in queries
**Source:** `src/actions/analytics.ts` lines 692–694
**Apply to:** All new `db.execute(sql\`...\`)` blocks in `settings.ts` and `analytics.ts` extensions
```typescript
WHERE s.tenant_id = ${tenantId}
```
Always the first filter condition after `WHERE`, never appended conditionally.

### force-dynamic + async searchParams (Next.js 15)
**Source:** `src/app/dashboard/(admin)/overview/page.tsx` lines 27–41
**Apply to:** `src/app/dashboard/(admin)/settings/page.tsx`, `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx`
```typescript
export const dynamic = 'force-dynamic';
// params and searchParams are Promise<> in Next.js 15 — always await:
const { personId } = await params;
const { from, to, project } = await searchParams;
```

### Suspense wrapper for useSearchParams clients
**Source:** `src/app/dashboard/(admin)/overview/page.tsx` lines 131–138; `src/app/dashboard/(admin)/people/page.tsx` lines 77–79
**Apply to:** `LeaderboardSortSelect` client component in `people/page.tsx` extension
```tsx
<Suspense fallback={<div className="h-12 animate-pulse bg-muted rounded" />}>
  <FilterBar projectOptions={projectOptions} />
</Suspense>
```

### Parallel data fetch
**Source:** `src/app/dashboard/(admin)/overview/page.tsx` lines 58–64; `src/app/dashboard/(admin)/people/[personId]/page.tsx` lines 82–95
**Apply to:** `settings/page.tsx`, `overview/page.tsx` extension, `[personId]/page.tsx` extension
```typescript
const [a, b, c] = await Promise.all([fnA(), fnB(), fnC()]);
```

### next-intl keying
**Source:** `src/app/dashboard/(admin)/overview/page.tsx` line 55; `src/components/dashboard/ProjectForm.tsx` line 27
**Apply to:** Every new string in every new/modified file
```typescript
// RSC:
const t = await getTranslations('dashboard.admin.settings');
// Client component:
const t = useTranslations('dashboard.admin.settings');
// TR/EN keys must be added to BOTH messages/en.json AND messages/tr.json
```

### Money / numeric display
**Source:** `src/app/dashboard/(admin)/people/page.tsx` lines 130–131; `src/app/dashboard/(admin)/people/[personId]/page.tsx` lines 131–132
**Apply to:** All numeric displays in new KpiCards and table cells
```typescript
new Intl.NumberFormat('tr-TR').format(number)
// Rates displayed as % with 1 decimal:
`${(rate * 100).toFixed(1)}%`
```

### Bound SQL parameters (CR-03)
**Source:** `src/actions/analytics.ts` lines 671–673
**Apply to:** All new `sql\`\`` queries in `settings.ts` and `analytics.ts` extensions
```typescript
// CORRECT — bound parameter:
sql` AND s.project_id = ANY(${options.projectIds})`
// WRONG — never use sql.raw() for user-controlled values:
sql.raw(`AND s.project_id = '${id}'`)
```

### Date string validation before SQL
**Source:** `src/app/dashboard/(admin)/overview/page.tsx` lines 43–46
**Apply to:** Any new page that reads date params from `searchParams`
```typescript
const validatedFrom =
  from && !isNaN(Date.parse(from)) ? new Date(from) : undefined;
```

---

## No Analog Found

All Phase 9 files have close analogs in the codebase. No file requires falling back to RESEARCH.md patterns exclusively.

---

## Metadata

**Analog search scope:** `src/actions/`, `src/app/dashboard/(admin)/`, `src/components/admin/`, `src/components/dashboard/`, `src/components/layout/`, `src/db/schema/`, `src/db/migrations/`, `tests/`
**Files scanned:** 20 source files read directly
**Pattern extraction date:** 2026-05-27
