# Phase 09: Performance Scorecards, Leaderboard & Alerts — Research

**Researched:** 2026-05-27
**Domain:** Next.js analytics enrichment, Drizzle SQL extensions, settings schema migration, inline alert badges
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Scorecards (PERF-01 / PERF-02)
- **D-77:** Implement worker/auditor scorecard by **enriching the existing Phase-8 profile page** (`/dashboard/people/[personId]`) — not a new view.
- **D-78:** PERF-01 worker scorecard = submission volume, approval rate, rejection rate, location-compliance rate, **output-quantity sum**, value contribution by currency — per-project and across all projects via FilterBar.
- **D-79:** PERF-02 auditor scorecard = decision count, approval/rejection split, mean decision turnaround, pending backlog, **SLA-breach rate** (% of decisions whose pending time exceeded the configurable threshold).
- **D-80:** Surface a link to the existing PERF-03 office-engineer activity scorecard for 3-role parity. Do NOT rebuild PERF-03.

#### Leaderboard (PERF-05)
- **D-81:** Leaderboard is a **sortable/ranked mode of the existing People directory** (`/dashboard/people`) — not a separate page.
- **D-82:** Separate Worker/Auditor leaderboards; user-selectable "rank by" metric. Worker default: approved-submission volume. Auditor default: mean decision turnaround (faster = better). Respect global filter and no-cross-currency rule.

#### Alert thresholds & SLA (PERF-06 + PERF-02)
- **D-83:** Thresholds are admin-configurable via a new **tenant-scoped settings table** + settings UI.
- **D-84:** Default thresholds (Moderate): audit pending > 48h = SLA breach; rejection rate > 30%; stalled = no approved submission in 7 days.
- **D-85:** Rejection-rate alert fires on **absolute rate** exceeding configured threshold in active window — no relative/baseline comparison in v1.
- **D-86:** Settings UI lives on a **dedicated `/dashboard/settings` page** — no new sidebar item (6-item nav is locked, D-74).
- **D-89:** Threshold settings are **office-engineer-only** and **tenant-scoped** — same `auth()` guard + `WHERE tenant_id` pattern.

#### Alert presentation (PERF-06)
- **D-87:** Alerts are **inline badges/colors on relevant Overview KPI cards** — no separate alert panel.
- **D-88:** Add a new **"Stalled projects" KPI card** to the Overview KPI row (count of projects with no approved submission beyond the stalled threshold); badges red when ≥1; clicking drills to filtered stalled projects.

### Claude's Discretion
- Scorecard metric layout/grouping on the profile page.
- Exact `/dashboard/settings` entry point (gear icon in TopNav vs. user-menu drill).
- Leaderboard tie-breaking rules and full "rank by" metric list beyond defaults.
- Whether new settings table is a dedicated `tenant_settings` table or columns added to `tenants`.

### Deferred Ideas (OUT OF SCOPE)
- Relative/trailing-baseline rejection-spike detection.
- Per-role/per-project threshold overrides.
- Alert dismissal/acknowledgement/history.
- Office-engineer scorecard rebuild (PERF-03 already complete — Phase 7).
- `submission-detail-map-link.md` follow-up (Phase-8 tracked todo).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PERF-01 | Admin can view a worker performance scorecard (submission volume, approval rate, rejection rate, location-compliance rate, output quantity, throughput) per project and across all projects | Enrich profile page with `outputQuantitySum` field added to `getPersonMetrics`; existing `submissionsApproved`, `submissionsRejected`, `locationComplianceRate`, `valueContributedByCurrency` already present |
| PERF-02 | Admin can view an auditor performance scorecard (decision count, approval/rejection split, mean turnaround, pending backlog, SLA-breach rate) | Add `slaBreach*` fields to `getPersonMetrics`; SLA threshold read from `tenant_settings` table |
| PERF-05 | Admin can compare employees side-by-side in a leaderboard ranked by a chosen metric | Add `sortBy` URL param + rank column to people directory; sort `PortfolioWorker[]`/`PortfolioAuditor[]` client-or-server-side |
| PERF-06 | Admin sees performance & SLA alerts on the overview (audits slower than threshold, rejection-rate spikes, stalled progress) | New `getTenantSettings` + `getStalledProjects` functions; badge props on KpiCard; new "Stalled projects" KpiCard |
</phase_requirements>

---

## Summary

Phase 9 is an **enrichment phase** — no new npm packages, no new page routes (except `/dashboard/settings`), no new architectural patterns beyond what Phase 8 established. Every deliverable is an additive extension of existing surfaces.

The two genuinely new technical concerns are:

1. **Schema migration for `tenant_settings`** — the project's migration runner is `tsx src/db/migrate.ts`, which calls Drizzle's `migrate()` against `src/db/migrations/`. `drizzle-kit push` is permanently unusable (D-49). The correct path is `drizzle-kit generate` → hand-verify/edit the SQL → add journal entry → `tsx src/db/migrate.ts`. The next migration file is `0007_v2_tenant_settings.sql`.

2. **SLA-breach rate computation** — this is the only truly new SQL aggregate. It is a fraction of decided submissions: `COUNT(*) FILTER (WHERE decided_at IS NOT NULL AND (EXTRACT(EPOCH FROM (decided_at - submitted_at)) / 3600.0) > ${threshold}) / NULLIF(COUNT(*) FILTER (WHERE decided_at IS NOT NULL), 0)`. The threshold comes from the `tenant_settings` table.

The leaderboard (PERF-05) is a zero-new-SQL feature: `getPortfolioPeople` already returns all needed fields; the directory page adds a `sortBy` URL param and sorts the already-fetched array in TypeScript before rendering.

**Primary recommendation:** Implement in four sequential units — (1) migration + settings schema, (2) analytics extensions (output-qty sum + SLA-breach rate + stalled-projects query), (3) enriched profile page (PERF-01/02) + leaderboard directory (PERF-05), (4) Overview alert badges + Stalled KpiCard (PERF-06) + `/dashboard/settings` page.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Worker output-quantity sum | API/Backend (analytics.ts) | — | Extension of existing `getPersonMetrics` aggregate; stays in the analytics server action |
| Auditor SLA-breach rate | API/Backend (analytics.ts) | — | Requires threshold from DB + FILTER on latency; belongs in the parameterized SQL layer |
| Tenant settings CRUD | API/Backend (new server action) | Database (`tenant_settings` table) | Auth-guarded write; reads are in analytics functions |
| Stalled-project count | API/Backend (new analytics function) | — | SQL query over submissions + configurable threshold |
| Leaderboard ranking | Frontend Server (RSC people page) | — | Sort the already-fetched bulk array in the RSC; no round-trip needed |
| Alert badges on KpiCard | Frontend Server (overview RSC page) | — | Computed in the RSC after fetching thresholds and KPIs; passes `valueColor` prop to KpiCard |
| Settings form UI | Browser/Client (`'use client'` form) | Frontend Server (settings page RSC) | Mirrors ProjectForm.tsx pattern; form submission via server action |
| Office-engineer scorecard link (D-80) | Frontend Server (people profile RSC) | — | Simple `Link` to existing `/dashboard/analytics` or per-engineer profile; no new data |

---

## Standard Stack

### Core (all already installed — NO new npm packages for this phase)

| Library | Version in Project | Purpose | Phase 9 Use |
|---------|--------------------|---------|-------------|
| drizzle-orm | 0.45.x | ORM + raw SQL via `sql\`\`` | New `tenant_settings` queries; SLA-breach aggregate; stalled-projects query |
| drizzle-kit | 0.31.x | Migration code-gen | `drizzle-kit generate` to produce `0007_v2_tenant_settings.sql` template |
| next-intl | 4.12.x | TR/EN i18n | All new labels in `messages/en.json` + `messages/tr.json` |
| shadcn/ui | installed | UI components | Badge (alert indicator on KpiCard), Tabs, Select, Input, Label |
| zod | 3.x | Schema validation | Settings form: validate threshold values (positive numbers, range checks) |
| lucide-react | installed | Icons | TriangleAlert (alert badge), Settings gear icon for TopNav entry point |
| next | 15.x | App Router | New RSC pages; `force-dynamic`; `await searchParams` (Next.js 15 async API) |

[VERIFIED: actual package.json at `/Users/arifismailbayrak/bayrak-ai/package.json`]

### No New Packages Required

This phase adds no npm dependencies. All needed capabilities are covered by the installed stack. [VERIFIED: package.json inspection]

---

## Package Legitimacy Audit

No new packages are installed in this phase. All packages used are already present in the project's `package.json` (verified by direct inspection of `/Users/arifismailbayrak/bayrak-ai/package.json`).

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────┐
                    │  /dashboard/settings  (RSC + form)  │
                    │  getTenantSettings()                 │
                    │  updateTenantSettings() server action│
                    └──────────────┬──────────────────────┘
                                   │ reads/writes
                    ┌──────────────▼──────────────────────┐
                    │       tenant_settings table          │
                    │  audit_sla_hours | rejection_rate_  │
                    │  threshold | stalled_days           │
                    └──┬───────────────────────────┬──────┘
                       │ threshold param             │ threshold param
          ┌────────────▼────────────┐   ┌───────────▼────────────────┐
          │ getPersonMetrics()      │   │ getPortfolioKPIs() extended │
          │  + slaBreach fields     │   │ + getStalledProjects()      │
          └────────────┬────────────┘   └───────────┬────────────────┘
                       │                             │
          ┌────────────▼────────────┐   ┌───────────▼────────────────┐
          │ /dashboard/people/      │   │ /dashboard/overview/       │
          │  [personId]/page.tsx    │   │  page.tsx                  │
          │  Worker + Auditor KPI   │   │  KpiCard × 5 (incl.        │
          │  cards (enriched)       │   │  Stalled) with alert       │
          └─────────────────────────┘   │  badges + colors           │
                                        └────────────────────────────┘
          ┌──────────────────────────────────────────────────────────┐
          │ /dashboard/people/page.tsx  (leaderboard mode)           │
          │  getPortfolioPeople() → sortBy URL param →               │
          │  TS sort in RSC → Rank # column + "Sort by" select       │
          └──────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (additive changes only)

```
src/
├── actions/
│   ├── analytics.ts          # EXTEND: add output-qty sum, SLA-breach, stalled-projects
│   └── settings.ts           # NEW: getTenantSettings(), updateTenantSettings()
├── app/dashboard/
│   ├── (admin)/
│   │   ├── overview/
│   │   │   └── page.tsx      # EXTEND: alert badges + Stalled KpiCard
│   │   ├── people/
│   │   │   ├── page.tsx      # EXTEND: sortBy param + rank column + sort-by select
│   │   │   └── [personId]/
│   │   │       └── page.tsx  # EXTEND: output-qty + SLA-breach KpiCards + OE link
│   │   └── settings/
│   │       └── page.tsx      # NEW: threshold settings form
│   └── layout.tsx            # OPTIONAL EXTEND: gear icon → /dashboard/settings in TopNav
├── db/
│   ├── schema/
│   │   └── tenant-settings.ts  # NEW: tenantSettings table
│   └── migrations/
│       └── 0007_v2_tenant_settings.sql  # NEW: migration file
├── components/
│   └── admin/
│       └── ThresholdSettingsForm.tsx  # NEW: 'use client' settings form
└── messages/
    ├── en.json               # EXTEND: settings.*, people.leaderboard.*, overview.stalled_*
    └── tr.json               # EXTEND: mirror
```

### Pattern 1: Migration Recipe (CRITICAL — D-49 blocks `drizzle-kit push`)

**What:** Generate, verify, and apply the `tenant_settings` migration.
**Exact working sequence:**

```bash
# Step 1: Add schema file at src/db/schema/tenant-settings.ts
# Step 2: Generate migration (this creates the .sql file + updates _journal.json)
DATABASE_URL="<neon-url>" npx tsx node_modules/.bin/drizzle-kit generate

# Step 3: The generated file will be src/db/migrations/0007_<random-name>.sql
# Rename it to 0007_v2_tenant_settings.sql for clarity (update _journal.json tag too)

# Step 4: Hand-verify the SQL — confirm it does NOT attempt to run drizzle-kit push
# The generated CREATE TABLE should look like:
#   CREATE TABLE "tenant_settings" (
#     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
#     "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
#     "audit_sla_hours" integer NOT NULL DEFAULT 48,
#     "rejection_rate_threshold" numeric(5,4) NOT NULL DEFAULT '0.3000',
#     "stalled_days" integer NOT NULL DEFAULT 7,
#     "updated_at" timestamp with time zone DEFAULT now() NOT NULL
#   );

# Step 5: Add UNIQUE constraint on tenant_id (one row per tenant)
# Hand-edit the migration to add:
#   ALTER TABLE "tenant_settings"
#     ADD CONSTRAINT "tenant_settings_tenant_id_unique" UNIQUE ("tenant_id");

# Step 6: Add seed INSERT for the default tenant
# Hand-edit migration to append (AFTER the table creation):
#   INSERT INTO "tenant_settings" (tenant_id, audit_sla_hours, rejection_rate_threshold, stalled_days)
#   VALUES ('00000000-0000-0000-0000-000000000001', 48, '0.3000', 7)
#   ON CONFLICT (tenant_id) DO NOTHING;

# Step 7: Apply to production DB
npx tsx src/db/migrate.ts

# Step 8: Apply to test DB
TEST_DATABASE_URL=<test-neon-url> DATABASE_URL=<test-neon-url> npx tsx src/db/migrate.ts
```

**Precedents:**
- `0003_slippery_prowler.sql` — hand-edited for partial index syntax (same pattern)
- `0005_v2_indexes.sql` — hand-written, added to journal manually
- `0006_v2_period_qty_check.sql` — hand-written CHECK constraints
- `src/db/migrate.ts` uses `drizzle-orm/neon-http/migrator` `migrate()` function
- `drizzle-kit push` produces `spatial_ref_sys permission error` on Neon — permanently unusable

[VERIFIED: all migration files read directly from `src/db/migrations/`; `src/db/migrate.ts` read]

### Pattern 2: Drizzle Schema for `tenant_settings`

```typescript
// src/db/schema/tenant-settings.ts
import { pgTable, uuid, integer, numeric, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const tenantSettings = pgTable('tenant_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id).unique(),
  // Defaults match D-84 "Moderate" thresholds
  auditSlaHours: integer('audit_sla_hours').notNull().default(48),
  rejectionRateThreshold: numeric('rejection_rate_threshold', { precision: 5, scale: 4 }).notNull().default('0.3000'),
  stalledDays: integer('stalled_days').notNull().default(7),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

[ASSUMED — schema design; aligns with D-84 defaults and existing tenant-scoped schema patterns]

### Pattern 3: SLA-Breach Rate SQL Aggregate (PERF-02, new in `getPersonMetrics`)

The single new analytical capability. Add to `getPersonMetrics`'s auditor branch (Query 3):

```typescript
// Source: extension of existing getPersonMetrics auditor branch
// auditorSlaThreshold: number (hours) — read from tenant_settings BEFORE this call
const auditorResult = await db.execute(sql`
  SELECT
    COUNT(*)                                                              AS decisions_count,
    ROUND(
      AVG(EXTRACT(EPOCH FROM (s.decided_at - s.submitted_at)) / 3600.0)
      FILTER (WHERE s.decided_at IS NOT NULL), 2
    )                                                                     AS avg_decision_latency_hours,
    -- SLA-breach rate: fraction of DECIDED submissions that exceeded the threshold
    COUNT(*) FILTER (
      WHERE s.decided_at IS NOT NULL
        AND (EXTRACT(EPOCH FROM (s.decided_at - s.submitted_at)) / 3600.0) > ${auditSlaHours}
    )::float
      / NULLIF(COUNT(*) FILTER (WHERE s.decided_at IS NOT NULL), 0)     AS sla_breach_rate
  FROM submissions s
  WHERE s.decided_by = ${personId}
    AND s.tenant_id  = ${tenantId}
    AND s.status IN ('approved', 'rejected')
    ${dateConditions}
`);
```

**Key rules to follow (from established pattern):**
- `${auditSlaHours}` is a **bound parameter** — not `sql.raw()` (CR-03)
- Only decided submissions (`decided_at IS NOT NULL`) are in the denominator — never NULL
- FILTER pattern matches existing `avgDecisionLatencyHours` logic exactly
- Returns `null` when `NULLIF` produces NULL (no decided submissions)

[VERIFIED: derived from actual `getPersonMetrics` code at `src/actions/analytics.ts` lines 741–755]

### Pattern 4: Output-Quantity Sum for Worker Scorecard (PERF-01)

Add to `getPersonMetrics`'s worker Query 1:

```typescript
// Add to existing worker SELECT (alongside COUNT FILTER blocks):
SUM(s.quantity::numeric)
  FILTER (WHERE s.status = 'approved')                          AS output_quantity_sum,
CASE
  WHEN SUM(EXTRACT(EPOCH FROM (
    CASE WHEN s.status = 'approved' AND s.decided_at IS NOT NULL
         THEN s.decided_at - s.submitted_at
         ELSE NULL
    END
  )) / 3600.0) > 0
  THEN SUM(s.quantity::numeric) FILTER (WHERE s.status = 'approved')
    / (SUM(EXTRACT(EPOCH FROM (s.decided_at - s.submitted_at)) / 3600.0)
       FILTER (WHERE s.status = 'approved' AND s.decided_at IS NOT NULL) / 24.0)
  ELSE NULL
END                                                             AS throughput_per_day
```

Alternatively (and simpler for v1), compute throughput in TypeScript from `outputQuantitySum / dateRangeDays` where `dateRangeDays` comes from the `dateRange` option. The SQL approach handles the general case; the TypeScript approach is easier to test. **Recommend TypeScript derivation** when `dateRange` is set (divide sum by range days), `null` when no range.

[ASSUMED — throughput computation approach; either is valid and aligns with D-78 requirements]

### Pattern 5: Stalled Projects Query (PERF-06, new analytics function)

```typescript
// New: getStalledProjects(stalledDays: number, filters: SubmissionFilters)
// Returns: { projectId, projectName }[] — projects with no approved submission
//          in the past N days (from now, NOT from the date filter)
// Note: stalled is always point-in-time (like D-66 pending backlog), NOT date-filtered

export async function getStalledProjects(
  stalledDays: number,
  filters: { projectIds?: string[] } = {}
): Promise<{ projectId: string; projectName: string }[]> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  const thresholdDate = new Date(Date.now() - stalledDays * 24 * 60 * 60 * 1000);
  // ...
  // SQL: projects that have had at least one submission but whose most recent
  // approved submission is older than thresholdDate
  const result = await db.execute(sql`
    SELECT p.id AS project_id, p.name AS project_name
    FROM projects p
    WHERE p.tenant_id = ${tenantId}
      AND EXISTS (
        SELECT 1 FROM submissions s
        WHERE s.project_id = p.id AND s.tenant_id = ${tenantId}
      )
      AND NOT EXISTS (
        SELECT 1 FROM submissions s
        WHERE s.project_id = p.id
          AND s.tenant_id  = ${tenantId}
          AND s.status     = 'approved'
          AND s.decided_at >= ${thresholdDate.toISOString()}
      )
    ORDER BY p.name
  `);
  // ...
}
```

[ASSUMED — exact SQL shape; aligns with D-88 semantics and existing auth+tenant pattern]

### Pattern 6: Leaderboard — Sort in RSC (PERF-05)

The leaderboard adds a `sortBy` URL param to `/dashboard/people` and a `<Select>` UI element (client component or server-rendered select). No new DB query needed — `getPortfolioPeople` already returns all fields needed for ranking:

```typescript
// In /dashboard/people/page.tsx RSC:
const { from, to, project, role, sortBy } = await searchParams;

// Workers: sortBy options map to PortfolioWorker fields
const workerSortOptions = {
  'approved': (a, b) => b.submissionsApproved - a.submissionsApproved,   // default
  'rejected': (a, b) => b.submissionsRejected - a.submissionsRejected,
  'value':    (a, b) => /* first currency value, numeric sort */,
};
const sortedWorkers = [...workers].sort(workerSortOptions[sortBy] ?? workerSortOptions['approved']);

// Add rank column: sortedWorkers.map((w, idx) => ({ ...w, rank: idx + 1 }))
```

Rank ties: use the same position (1, 1, 3 — standard competition ranking). `displayName` alphabetical as final tiebreaker.

The "Sort by" control: a simple `<form method="GET">` `<select>` with JS enhancement for instant response, or a client component using `useRouter().push()` to update the `sortBy` param — mirrors `FilterBar.tsx` pattern exactly.

[VERIFIED: `getPortfolioPeople` signature and return types confirmed in `src/actions/analytics.ts` lines 967–1122]

### Pattern 7: Overview Alert Badges (PERF-06)

The Overview page reads `tenant_settings`, then determines alert state BEFORE rendering KpiCards. The `KpiCard` component already accepts `valueColor: 'default' | 'success' | 'destructive'` — no component changes needed for color badges.

For the SLA badge on the pending-backlog card, add a secondary metric: "X of Y auditors breaching SLA" requires a separate query. **Simpler v1 approach (aligns with D-87 inline badge):** Derive the alert state from `kpis.pendingBacklog` alone — if the backlog exceeds a derived threshold (e.g., `pendingBacklog > 0 AND avg latency across tenant > threshold`), badge as `destructive`. Or: show the badge simply when `kpis.pendingBacklog > 0` combined with stale average from `getPortfolioKPIs`.

**Recommended approach:** The Overview page fetches one additional function `getTenantAlertState(settings, kpis, stalledCount)` — a pure TS function (no DB) that returns `{ pendingAlert: boolean, rejectionAlert: boolean, stalledAlert: boolean }` derived from the data already fetched. No additional DB round-trip.

```typescript
// In overview/page.tsx after fetching kpis + settings + stalledCount:
const pendingAlertColor: 'destructive' | 'default' =
  kpis.pendingBacklog > 0 /* and avg latency > settings.auditSlaHours */ ? 'destructive' : 'default';
const rejectionAlertColor: 'destructive' | 'default' =
  (kpis.rejectionsInRange / Math.max(kpis.approvalsInRange + kpis.rejectionsInRange, 1))
    > settings.rejectionRateThreshold ? 'destructive' : 'default';
const stalledAlertColor: 'destructive' | 'default' =
  stalledCount > 0 ? 'destructive' : 'default';
```

[VERIFIED: `KpiCard` props interface at `src/components/admin/KpiCard.tsx` line 18; `valueColor` type confirmed]

### Pattern 8: Settings Form (`/dashboard/settings`)

Follows `ProjectForm.tsx` exactly:
- `'use client'` component using `useState` + `handleSubmit` (not `useActionState` — not used in this project)
- Server action in `src/actions/settings.ts` following `auth()` guard + `getDefaultTenantId()` + `zod` validation
- Numeric inputs with validation: `auditSlaHours` (positive integer, e.g. 1–720h), `rejectionRateThreshold` (0–1 numeric, display as %, store as decimal), `stalledDays` (1–365)
- On submit: `updateTenantSettings({ auditSlaHours, rejectionRateThreshold, stalledDays })`
- Entry point: gear icon in TopNav (additive — append after LanguageToggle in `TopNav.tsx`)
- Auth guard: `auth()` in both the server action AND the settings RSC page (revalidate session)

[VERIFIED: `ProjectForm.tsx` pattern read in full at `src/components/dashboard/ProjectForm.tsx`; `TopNav.tsx` read]

### Pattern 9: PERF-03 Office-Engineer Scorecard Link (D-80)

The PERF-03 scorecard lives in **`getOfficeActivityLog`** (queried in analytics.ts) and is surfaced through the existing **`/dashboard/analytics`** stub page (Phase 8 delivered this as a coming-soon stub). There is no dedicated office-engineer scorecard page yet — the activity log data from Phase 7 is available but has no dedicated view.

**For D-80 parity link:** Add a note/link on the profile page for `role === 'office-engineer'` — but this edge case may not arise since `getActivePeople()` returns people from the `people` table (field workers/auditors), not from `users` (office engineers). Office engineers authenticate via Auth.js users, not the people table.

**Resolution:** D-80 is best satisfied by a note on the People directory pointing to the Analytics tab (which will show the office-engineer activity log in a future phase), OR by a direct link to `/dashboard/analytics` on the profile page when the person has `role_on_project` of neither worker nor auditor. Given the current data model, office engineers are not in the `people` table, so the "link" is more of a navigation affordance in the sidebar/overview. This is a UX-only decision for the planner — no new data queries.

[VERIFIED: `src/db/schema/people.ts`, `src/db/schema/auth.ts`, `getActivePeople()` data source; `office_activity_log` schema read]

### Anti-Patterns to Avoid

- **Do NOT use `drizzle-kit push`** — permanently blocked (D-49, spatial_ref_sys permission error on Neon). Use `drizzle-kit generate` + manual apply via `tsx src/db/migrate.ts`.
- **Do NOT cross-currency sum** in leaderboard value column — respect no-cross-currency rule; display first available currency or "—" if no price set (existing pattern in people directory).
- **Do NOT date-filter the stalled-projects query** — stalled is always point-in-time from NOW, not from the active filter window (mirrors D-66 pending-backlog rule).
- **Do NOT re-implement PERF-03** — the office-engineer activity log is Phase 7 complete; link to Analytics.
- **Do NOT use `npx shadcn@latest add`** — use `node_modules/.bin/shadcn add <component>` (known broken since Phase 8-01). No new shadcn components needed for Phase 9.
- **Do NOT seed `tenant_settings` via a separate script** — seed in the migration SQL via `INSERT ... ON CONFLICT DO NOTHING` so apply is idempotent.
- **Do NOT put the `slaBreach` threshold fetch inside `getPersonMetrics`** — the threshold is a tenant-wide setting; fetch it once in the RSC page and pass as a parameter, keeping analytics functions parameter-pure.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Settings persistence | Custom config files, env vars | `tenant_settings` DB table + Drizzle | D-83 requires admin-configurable thresholds; env vars are not runtime-editable |
| Ranking algorithm | Custom ranking logic from scratch | TypeScript `.sort()` on `PortfolioWorker[]` / `PortfolioAuditor[]` | `getPortfolioPeople` already returns all fields; no new SQL needed |
| Alert state computation | Re-fetching extra DB data for each badge | Pure TS function over already-fetched KPIs + settings | Avoids extra round-trips; all needed data comes from existing `getPortfolioKPIs` call |
| Form state management | Redux, Zustand, React Hook Form (installed but unused here) | `useState` + async `handleSubmit` + server action | Existing pattern in `ProjectForm.tsx`; `react-hook-form` is installed but RHF is not used in this project's form pattern |
| Input validation in the action | Manual regex | Zod schema (`z.number().int().min(1).max(720)`) | Existing zod usage in `src/actions/projects.ts`; consistent pattern |
| SLA computation | Client-side latency math | Postgres `EXTRACT(EPOCH ...)` FILTER in SQL | Avoids float drift; matches existing `avgDecisionLatencyHours` aggregate exactly |

**Key insight:** In this codebase, complex SQL aggregates are done in Postgres (server actions, `sql\`\`` template literals) and simple derivations (rates from counts, ranks from arrays) are done in TypeScript in the RSC. This split is the established pattern throughout Phase 7–8 and must continue.

---

## Common Pitfalls

### Pitfall 1: Seeding `tenant_settings` — No Default Row Breaks Runtime
**What goes wrong:** `getTenantSettings()` returns null or throws when no row exists for the tenant; alert computation uses `?? hardcoded` which is error-prone and defeats D-83.
**Why it happens:** The migration creates the table but doesn't seed it; first deploy hits an empty table.
**How to avoid:** Seed in the migration itself: `INSERT INTO tenant_settings (...) VALUES (...) ON CONFLICT (tenant_id) DO NOTHING`. This is idempotent and handles re-runs.
**Warning signs:** TypeError when destructuring `settings.auditSlaHours` (null settings row).

### Pitfall 2: SLA-Breach Rate Denominator is Total Submissions, Not Decided
**What goes wrong:** Using `COUNT(*)` (all submissions including pending) as denominator inflates the denominator and underreports breach rate.
**Why it happens:** Copying the rejection-rate formula which uses all decided submissions — same `NULLIF` pattern but wrong population.
**How to avoid:** Denominator MUST be `COUNT(*) FILTER (WHERE s.decided_at IS NOT NULL)` — only decided submissions can be SLA-breached; pending submissions are by definition not yet decided.
**Warning signs:** SLA-breach rate reports 0% or unrealistically low values when there are known late decisions.

### Pitfall 3: Leaderboard `sortBy` Param With No Currency Guard
**What goes wrong:** Sorting workers by "value" cross-currency produces meaningless results (e.g., 1000 TRY > 500 USD comparison).
**Why it happens:** Forgetting the no-cross-currency rule when implementing the value sort.
**How to avoid:** Value-based leaderboard ranking is scoped to a single currency (same as the CurrencySelector pattern in EVTableClient). When no single currency dominates, default to `submissionsApproved` rank. Display "—" for workers with no priced submissions in the selected currency — do NOT omit them from the leaderboard.
**Warning signs:** Workers with USD earnings ranked above TRY workers inappropriately.

### Pitfall 4: Alert Badges Showing With No Date Filter (Rejection Rate)
**What goes wrong:** The rejection-rate alert triggers all-time even when the Overview has no date filter, comparing against a threshold meant for an active window.
**Why it happens:** `kpis.approvalsInRange + kpis.rejectionsInRange` is the all-time count when no date filter is set; the ratio can be misleading without context.
**How to avoid:** Per D-85, the rejection-rate alert fires on "an absolute rate... in the active filter window." When no date filter is active (all-time view), suppress the rejection-rate badge or use a note. The pending-backlog badge and stalled-projects badge are always point-in-time (no filter condition).
**Warning signs:** Rejection-rate badge fires on Overview with no filter applied, alarming users about historical data.

### Pitfall 5: `drizzle-kit generate` Produces Wrong Column Type for Threshold
**What goes wrong:** `drizzle-kit generate` emits `numeric` as `numeric` without precision/scale in the SQL, or drops the DEFAULT value from the migration.
**Why it happens:** Drizzle-kit has known limitations with some constraint types (documented in Phase 7 and Phase 8 SUMMARYs).
**How to avoid:** After `drizzle-kit generate`, inspect the SQL and verify: `numeric(5,4)` precision is correct, `DEFAULT '0.3000'` is present (not `DEFAULT 0.3`), and UNIQUE constraint on `tenant_id` is emitted. Hand-edit as needed (established precedent: `0003_slippery_prowler.sql`, `0005_v2_indexes.sql`, `0006_v2_period_qty_check.sql`).
**Warning signs:** `DEFAULT 0.3` (float literal) instead of `DEFAULT '0.3000'` (numeric string) in the migration SQL.

### Pitfall 6: Neon HTTP Driver vs. `= ANY(array)` in Settings Queries
**What goes wrong:** A query using `= ANY(${someArray})` with a single-element array fails via the neon-http driver.
**Why it happens:** Documented in STATE.md: "D-NeonArrayFix: pagination tests use personId filter (simple =) not projectIds (= ANY array) to avoid neon-http single-element array bug."
**How to avoid:** In `getStalledProjects`, if `filters.projectIds` has exactly one element, use `= ${filters.projectIds[0]}` not `= ANY(${filters.projectIds})`. Or test with multi-element arrays. Pattern established in Phase 8 analytics tests.
**Warning signs:** Integration test fails with single-project filter but passes with no filter or multi-project filter.

### Pitfall 7: `getPersonMetrics` Signature Needs `auditSlaHours` Parameter
**What goes wrong:** Passing `auditSlaHours` as a bound parameter inside `getPersonMetrics` requires changing its function signature, which breaks all existing call sites.
**Why it happens:** The SLA threshold is external to the function's existing parameter set.
**How to avoid:** Add `auditSlaHours?: number` to the existing `options` parameter object (optional with default). Call sites that don't pass it default to `null` SLA-breach rate (safe degradation). Existing tests remain valid.
**Warning signs:** TypeScript type errors at all call sites of `getPersonMetrics`.

---

## Critical Gap: `getPersonMetrics` Missing Fields (What Must Be Added)

Reading `src/actions/analytics.ts` lines 649–779 shows the current `PersonMetrics` type:

```typescript
// CURRENT PersonMetrics (lines 56–64)
export type PersonMetrics = {
  personId: string;
  displayName: string;
  // Worker metrics — PRESENT
  submissionsApproved: number;
  submissionsRejected: number;
  submissionsPending: number;
  locationComplianceRate: number | null;
  valueContributedByCurrency: Record<string, string>;
  // Auditor metrics — PRESENT (when asAuditor: true)
  decisionsCount?: number;
  avgDecisionLatencyHours?: number | null;
  pendingBacklogCount?: number;
  // MISSING for PERF-01:
  // outputQuantitySum?: string | null;     <-- SUM(quantity) for approved submissions
  // MISSING for PERF-02:
  // slaBreach RateDecided?: number | null; <-- fraction, 0–1; requires threshold param
};
```

**Also missing from the profile page (PERF-01, `[personId]/page.tsx` lines 125–158):**
- Approval rate as a KPI card (currently derived but not shown as a KPI card — only rejection rate)
- Output-quantity sum KPI card (not shown at all)
- SLA-breach rate KPI card for auditors (not shown at all)

**Also missing from `PortfolioWorker` type (for leaderboard ranking column):**
- `submissionsApproved` is present (leaderboard default)
- Value requires currency selection (no-cross-currency rule applies)
- Rejection rate can be derived: `submissionsRejected / (submissionsApproved + submissionsRejected)`

**Also missing from `PortfolioAuditor` type (for leaderboard ranking column):**
- `avgDecisionLatencyHours` is present (leaderboard default — lower is better)
- SLA-breach rate is NOT present in the bulk query (adding it would require the threshold as a parameter)

[VERIFIED: full `analytics.ts` read, full `[personId]/page.tsx` read]

---

## Code Examples

### Existing Pattern: Adding to `getPersonMetrics` options (follow this shape)

```typescript
// Source: src/actions/analytics.ts lines 661–664 (current signature)
export async function getPersonMetrics(
  personId: string,
  options?: { projectIds?: string[]; asAuditor?: boolean; dateRange?: { from: Date; to: Date };
              auditSlaHours?: number }  // ← ADD THIS
): Promise<PersonMetrics>
```

### Existing Pattern: Auth guard + tenant scope (used in every action)

```typescript
// Source: src/actions/analytics.ts lines 662–668 (template for settings action)
const session = await auth();
if (!session) throw new Error('Unauthorized');
const tenantId = getDefaultTenantId();
```

### Existing Pattern: Drizzle-ORM upsert for settings

```typescript
// Source: pattern analogous to src/actions/boq.ts setUnitPrice pattern
// For updateTenantSettings — upsert (INSERT ... ON CONFLICT UPDATE):
await db.execute(sql`
  INSERT INTO tenant_settings (tenant_id, audit_sla_hours, rejection_rate_threshold, stalled_days, updated_at)
  VALUES (${tenantId}, ${auditSlaHours}, ${rejectionRateThreshold}, ${stalledDays}, NOW())
  ON CONFLICT (tenant_id)
  DO UPDATE SET
    audit_sla_hours            = EXCLUDED.audit_sla_hours,
    rejection_rate_threshold   = EXCLUDED.rejection_rate_threshold,
    stalled_days               = EXCLUDED.stalled_days,
    updated_at                 = NOW()
`);
```

### Existing Pattern: RSC parallel fetch for overview (follow for settings page load)

```typescript
// Source: src/app/dashboard/(admin)/overview/page.tsx lines 58–64
const [kpis, trends, overview, projectsData, activePeople] = await Promise.all([
  getPortfolioKPIs(filters),
  getPortfolioTrends(filters),
  getPortfolioOverview(),
  getProjects(),
  getActivePeople(),
]);
// Phase 9 addition:
// const [kpis, settings, stalledProjects, ...] = await Promise.all([...]);
```

### Existing Pattern: KpiCard with valueColor badge

```typescript
// Source: src/app/dashboard/(admin)/overview/page.tsx lines 145–152
<KpiCard
  label={t('kpi_pending_label')}
  subLabel={t('kpi_pending_sub')}
  value={kpis.pendingBacklog}
  icon={<Clock className="h-5 w-5" />}
  drillHref={pendingDrillHref}
  valueColor={pendingColor}   // ← 'destructive' when alert fires
/>
```

### Existing Pattern: Form mutation server action (follow for `updateTenantSettings`)

```typescript
// Source: src/actions/projects.ts lines 14–42
// Pattern: auth() guard → zod parse → DB write → revalidatePath → return
export async function updateTenantSettings(input: {
  auditSlaHours: number;
  rejectionRateThreshold: number; // 0–1
  stalledDays: number;
}) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const settingsSchema = z.object({
    auditSlaHours: z.number().int().min(1).max(720),
    rejectionRateThreshold: z.number().min(0).max(1),
    stalledDays: z.number().int().min(1).max(365),
  });
  const parsed = settingsSchema.parse(input);
  // ... upsert ...
  revalidatePath('/dashboard/overview');
  revalidatePath('/dashboard/settings');
  return { ok: true };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No configurable thresholds | `tenant_settings` table with admin UI | Phase 9 (this phase) | Alerts are meaningful, not hardcoded |
| People directory is list-only | People directory + leaderboard mode | Phase 9 | Side-by-side comparison without new page |
| Overview has 4 KPI cards | Overview has 5 KPI cards (+ Stalled) | Phase 9 | Stalled-project alert has a dedicated card |
| Profile shows some scorecard metrics | Profile shows full role scorecard | Phase 9 | PERF-01/02 complete |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | New settings table is `tenant_settings` (dedicated table, not columns on `tenants`) | Architecture Patterns | Low — either approach works; dedicated table is cleaner for future tenant-wide settings |
| A2 | Throughput = `outputQuantitySum / dateRangeDays` computed in TypeScript, null when no date range | Pattern 4 | Low — the simpler approach is sufficient for v1 |
| A3 | Leaderboard sort is done in TypeScript in the RSC (not ORDER BY in SQL) | Pattern 6 | Low — TypeScript sort is fast for small sets (<50 workers/auditors in single-tenant MVP) |
| A4 | Alert computation is a pure TypeScript function, no additional DB round-trip | Pattern 7 | Low — no new SQL queries needed beyond `getPortfolioKPIs` + `getStalledProjects` + `getTenantSettings` |
| A5 | Office-engineer scorecard link (D-80) points to `/dashboard/analytics` (future phase) via a navigation affordance, not a new page | Pattern 9 | Low — office engineers are in `users` table, not `people`; no per-person OE profile exists yet |
| A6 | Settings entry point is a gear icon in `TopNav.tsx` appended after LanguageToggle | Pattern 8 | Low — planner can choose any D-86-compatible entry point |
| A7 | Rejection-rate alert suppressed when no active date filter is set | Pitfall 4 | Medium — if wrong, the alert will fire on all-time data which may be confusing |

---

## Open Questions

1. **D-80 office-engineer scorecard link — where does it point?**
   - What we know: PERF-03 (Phase 7) added `office_activity_log` table + `getOfficeActivityLog()`. The Analytics page (`/dashboard/analytics`) is a coming-soon stub.
   - What's unclear: The "link for parity" has nowhere useful to point currently. The Analytics stub page has no office-engineer scorecard data.
   - Recommendation: D-80 is best handled as a note/badge on the People directory ("Office Engineer activity is in the Analytics tab") and wired up for real in the Analytics phase. The planner can descope D-80 to a non-functional informational link for this phase.

2. **Rejection-rate alert: use `approvalsInRange + rejectionsInRange` from `getPortfolioKPIs` or fetch a separate per-period rate?**
   - What we know: `getPortfolioKPIs` returns `approvalsInRange` + `rejectionsInRange` in the active window. Rejection rate = `rejectionsInRange / (approvalsInRange + rejectionsInRange)`.
   - What's unclear: This is a portfolio-wide rate, not per-auditor. D-85 says "absolute rate in active filter window" — this matches the portfolio-level computation.
   - Recommendation: Use the existing `getPortfolioKPIs` fields. No new query needed.

3. **`PersonMetrics` type extension — add new fields to existing type or create `EnrichedPersonMetrics`?**
   - What we know: Adding fields to `PersonMetrics` is simpler and requires fewer code changes.
   - What's unclear: Whether adding optional fields to an existing exported type causes issues.
   - Recommendation: Add optional fields (`outputQuantitySum?: string | null`, `slaBreach RateDecided?: number | null`) to the existing `PersonMetrics` type. Callers that don't request them receive `undefined`.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is code/config/schema changes with no new external tool dependencies. All required runtimes (Node.js, tsx, drizzle-kit) are already in the project's devDependencies and verified working through Phase 8.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (version from devDependencies) |
| Config file | `vitest.config.ts` — `fileParallelism: false`, `environment: 'node'` |
| Quick run command | `npx vitest run tests/analytics.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-01 | `getPersonMetrics` returns `outputQuantitySum` for approved submissions | unit/integration | `npx vitest run tests/analytics.test.ts` | ✅ (extend existing) |
| PERF-02 | `getPersonMetrics` returns `slaBreach RateDecided` correctly (breach count / decided count) | unit/integration | `npx vitest run tests/analytics.test.ts` | ✅ (extend existing) |
| PERF-02 | SLA-breach rate is `null` when no decided submissions | unit/integration | `npx vitest run tests/analytics.test.ts` | ✅ (extend existing) |
| PERF-05 | Leaderboard: workers sorted by `submissionsApproved` DESC by default | unit (pure sort) | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |
| PERF-06 | `getStalledProjects` returns projects with no approved submission in N days | integration | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |
| PERF-06 | `getTenantSettings` returns defaults when no explicit settings saved | integration | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |
| PERF-06 | `updateTenantSettings` persists new thresholds and is tenant-scoped | integration | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |
| D-83 | `updateTenantSettings` rejects invalid thresholds (zod validation) | unit | `npx vitest run tests/analytics.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/analytics.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] New `describeIfDb('PERF-01/02: getPersonMetrics enrichments')` block in `tests/analytics.test.ts`
  - Tests: `outputQuantitySum` aggregate, `slaBreach RateDecided` fraction, null-safe denominator
- [ ] New `describeIfDb('PERF-06: getStalledProjects')` block in `tests/analytics.test.ts`
  - Tests: stalled when last approval is older than N days, not stalled when recent approval exists, no-submissions project not returned
- [ ] New `describeIfDb('PERF-06: getTenantSettings / updateTenantSettings')` block
  - Tests: returns defaults (from seeded row), upsert, auth guard, zod validation rejection
- [ ] New `describeIfDb('PERF-05: leaderboard sort')` block (pure sort — can be unit, no DB needed)
  - Tests: worker default sort by `submissionsApproved`, auditor default by `avgDecisionLatencyHours`, tie-breaking by `displayName`
- [ ] `vi.mock('next/server')` added to any new test file that imports actions using `after()` (established pattern: STATE.md)

**Existing test infrastructure covers:** all PERF-01/02 base fields already tested under `COST-04` + `PERF-04` describe blocks (51 tests at `tests/analytics.test.ts`).

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `auth()` guard on every server action and RSC page |
| V3 Session Management | no | existing Auth.js session — no changes |
| V4 Access Control | yes | tenant-scoped writes: `WHERE tenant_id = ${getDefaultTenantId()}` first condition |
| V5 Input Validation | yes | zod schema on `updateTenantSettings` input |
| V6 Cryptography | no | no new crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant threshold read/write | Information Disclosure / Tampering | `WHERE tenant_id = ${tenantId}` first condition in every settings query |
| Injected threshold value (e.g. negative SLA hours) | Tampering | Zod validation: `z.number().int().min(1).max(720)` for hours; `z.number().min(0).max(1)` for rate |
| Auth bypass on settings mutation | Elevation of Privilege | `auth()` guard throws `'Unauthorized'` before any DB access; same as all existing actions |
| IDOR via `personId` on enriched profile | Information Disclosure | `getActivePeople()` + `filter(p => p.personId === personId)` notFound guard — existing mitigation preserved |
| XSS via user-controlled displayName in leaderboard | XSS | React JSX auto-escapes all text — no `dangerouslySetInnerHTML`; same as existing directory |

---

## Sources

### Primary (HIGH confidence — verified by direct file inspection)

- `src/actions/analytics.ts` — full read; all function signatures, types, SQL patterns confirmed
- `src/app/dashboard/(admin)/overview/page.tsx` — full read; KpiCard props, filter patterns, parallel fetch
- `src/app/dashboard/(admin)/people/page.tsx` — full read; `getPortfolioPeople` usage, tab/URL pattern
- `src/app/dashboard/(admin)/people/[personId]/page.tsx` — full read; profile KPI cards, scorecard gaps identified
- `src/db/migrations/` (all 7 files) — migration naming convention, `drizzle-kit generate` + `migrate.ts` workflow
- `src/db/migrate.ts` — migration runner: `drizzle-orm/neon-http/migrator` `migrate()`, reads `src/db/migrations/`
- `src/db/schema/tenants.ts`, `submissions.ts`, `office-activity-log.ts` — schema confirmed
- `src/components/admin/KpiCard.tsx` — props interface confirmed (`valueColor`, `drillHref`)
- `src/components/dashboard/ProjectForm.tsx` — client form pattern confirmed (`useState` + `handleSubmit` + server action)
- `src/components/admin/SidebarNav.tsx` — 6-item nav confirmed; `render={}` prop pattern (not `asChild`)
- `src/components/layout/TopNav.tsx` — TopNav structure confirmed for settings gear icon entry point
- `messages/en.json` — existing 95-key `dashboard.admin.*` namespace confirmed; gaps identified
- `vitest.config.ts` — `fileParallelism: false`, existing test setup confirmed
- `tests/analytics.test.ts` — 51 tests confirmed; structure for new test blocks established
- `.planning/phases/08-*/08-0X-SUMMARY.md` — Phase 8 decisions and patterns confirmed
- `.planning/STATE.md` — D-49 (drizzle-kit push banned), D-NeonArrayFix, `node_modules/.bin/shadcn` pattern, `after()` mock pattern all confirmed

### Secondary (MEDIUM confidence)

- `09-CONTEXT.md` — locked decisions D-77 through D-89 confirmed and reproduced verbatim
- `REQUIREMENTS.md` — PERF-01/02/05/06 Pending status confirmed; PERF-03/04 Complete confirmed

---

## Metadata

**Confidence breakdown:**
- Migration recipe: HIGH — exact files read, precedents established across 4+ hand-edited migrations
- Analytics extensions: HIGH — exact current code read; gaps clearly identified
- Leaderboard ranking: HIGH — `getPortfolioPeople` types confirmed; sort is standard TypeScript
- Alert badge wiring: HIGH — `KpiCard` props confirmed; existing `pendingColor` pattern reusable
- Settings schema/form: HIGH — analogous to ProjectForm.tsx + boq.ts patterns; no new technology
- PERF-03 link (D-80): MEDIUM — office engineers are in `users` not `people`; no existing view to link to

**Research date:** 2026-05-27
**Valid until:** 2026-06-27 (30 days — stable Next.js 15 / Drizzle 0.45 / next-intl 4.x ecosystem)
