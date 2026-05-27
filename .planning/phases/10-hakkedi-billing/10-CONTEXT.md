# Phase 10: Hakkediş Billing - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Office engineer can **create, compute, and finalize progress-payment periods (hakkediş)** for a
project using the yeşil-defter cumulative model; **all deduction rates are configurable per
period**; a **finalized period is an immutable snapshot** that cannot be recomputed or overwritten.

**New scope this phase:** HAK-01 (period CRUD), HAK-02 (yeşil-defter cumulative−previous
computation with locked unit-price snapshot), HAK-03 (configurable KDV / tevkifat / stopaj /
teminat / avans deductions → gross + net), HAK-04 (payment status lifecycle), HAK-05
(finalization lock / immutable snapshot).

**Already shipped — do NOT rebuild:**
- **Schema exists (Phase 7):** `hakedis_periods` + `hakedis_period_lines` tables with snapshot
  columns, `currency_code` per period, and CHECK constraints (`cumulative ≥ previous`,
  `period_qty ≥ 0`, `unit_price_snapshot ≥ 0`). Phase 10 writes the **first rows** into these
  tables and **extends** `hakedis_periods` with the missing deduction columns.
- **`office_activity_log` + `logOfficeActivity()` (Phase 7):** PERF-03 already defines
  "hakkediş create/finalize" as a logged action type — wire it, don't rebuild it.
- **Admin shell + `/dashboard/(admin)/hakedis` stub (Phase 8):** replace the coming-soon stub;
  the 6-item sidebar nav is locked (no new nav item).

**NOT this phase:** the PDF hakkediş certificate and Excel yeşil-defter export are **Phase 11**
(EXP-02 / EXP-04). Phase 10 produces the on-screen period detail summary table only.
</domain>

<decisions>
## Implementation Decisions

> Decision IDs continue the project sequence (Phase 9 ended at D-89).

### Deduction chain & math (HAK-03)
- **D-90:** Net formula = the standard Turkish hakkediş chain.
  `Net ödeme = Gross + (KDV − KDV tevkifat) − stopaj − teminat − avans kesintisi`.
  KDV, stopaj, teminat, and avans each apply to the **KDV-hariç gross (matrah)**; **tevkifat is a
  fraction OF the KDV** (withheld by the employer / paid to the tax office — it reduces the
  contractor's KDV receipt, it is not a deduction from the gross). All arithmetic runs in **Postgres
  `numeric`** (money-math lock); each intermediate value displays to **2 decimal places**. The
  on-screen summary follows SC3's order: gross dönem tutarı → KDV → KDV tevkifat → stopaj →
  teminat → avans kesintisi → net ödeme.
- **D-91:** Extend `hakedis_periods` with the missing per-period rate columns:
  `tevkifat_fraction` (numeric), `stopaj_enabled` (boolean) + `stopaj_rate` (numeric), and
  `avans_kesintisi_rate` (numeric). `kdv_rate` (0.2000) and `retention_rate` / teminat (0.0500)
  already exist. The schema reserved a `tevkifat_fraction` slot "Phase 10 only" — this is that
  change. Requires a **generated migration applied the project's established way** (NOT
  `drizzle-kit push` — project decision D-49).
- **D-92:** A new draft period seeds **construction-typical defaults**: `kdv_rate` 0.2000,
  `tevkifat_fraction` 0.4000 (4/10 yapım işi), `stopaj_enabled` false, `retention_rate` 0.0500,
  `avans_kesintisi_rate` 0. All rates remain editable on the draft period. (Stopaj default rate
  value is Claude's discretion.)
- **D-93:** Stopaj is modeled as an **explicit boolean toggle (`stopaj_enabled`) plus a
  `stopaj_rate`** — the toggle controls whether the stopaj line appears at all, independent of the
  rate value (SC1's literal "toggle").
- **D-94 [Claude's Discretion — recommended]:** Avans kesintisi = **flat `avans_kesintisi_rate` ×
  period gross**, computed independently each period (like teminat/stopaj). **No** running
  advance balance is tracked at project level in v1. (User said "you decide"; tracked-balance
  recoupment is deferred — see Deferred Ideas.)

### Lifecycle & finalization (HAK-04 / HAK-05)
- **D-95:** **Linear single-column lifecycle: `draft → finalized → submitted → paid`.** Finalize is
  the **mandatory gate** — a period cannot reach `submitted` without being finalized first.
  `draft` is the **only** editable/recomputable state. The immutability lock keys off
  **`status != 'draft'`** (equivalently `finalized_at IS NOT NULL`). After finalizing, `status`
  still advances through the payment stages, but all snapshot data + rates are frozen.
- **D-96:** Finalize is **irreversible — no un-finalize.** A finalized period can only advance
  payment status; recompute / rate edits / line edits return an **error** (SC5). Corrections are
  made in the **next period** — the cumulative yeşil-defter model naturally absorbs a correction
  into the next period's delta.
- **D-97:** **Draft periods (and their computed lines) are deletable; finalized / submitted / paid
  periods are never deletable** (immutable financial record). Create, finalize, and delete all
  write to `office_activity_log` (PERF-03 action types).

### Compute trigger & period chaining (HAK-02)
- **D-98:** Draft line items **compute on period create**, with a manual **"Yeniden Hesapla /
  Recompute"** action available while `status = 'draft'` (to pull in approvals with
  `decided_at ≤ cutoff` that arrived after creation). Recompute is **blocked once finalized**. Line
  **rows are stored** (not live-only) so the SC3 summary table renders without re-aggregating.
- **D-99 [Claude's Discretion — recommended]:** `previous_cumulative_qty` per BOQ item = the
  `cumulative_qty_approved` from the **most recent FINALIZED period** (same `project_id` +
  `currency_code`) with an earlier `period_end_date`; **0 if none**. Chaining only off locked
  snapshots prevents a draft's delta from shifting under it. **Implication: this enforces
  sequential finalization** — period N must be finalized before period N+1's delta is correct.
  (User said "you decide"; this is the correct yeşil-defter behavior.)
- **D-100:** Cumulative-approved-qty source = sum of approved submission quantities per BOQ item
  where `status = 'approved'` and `decided_at ≤ period_end_date` (Istanbul tz), via a typed
  Postgres aggregation reusing `analytics.ts` idioms (qty/money math in Postgres).
  `period_qty = cumulative − previous`, enforced at the DB level (see D-104).

### Period scope & edge cases (HAK-01)
- **D-101:** **One period = one currency** (schema-locked: `hakedis_periods.currency_code`, default
  TRY). A period only aggregates BOQ items whose `currency_code` matches; a multi-currency project
  gets **one period per currency**. Confirmed — no change. The period-create form carries a
  currency selector (default TRY).
- **D-102 [Claude's Discretion — recommended]:** Item inclusion — include **all priced BOQ items
  (matching the period currency) that have any cumulative approved qty > 0 up to the cutoff**;
  `period_qty` may be 0 for items fully completed in a prior period (full worked register). The
  simpler "only `period_qty > 0`" is an acceptable alternative. (User said "you decide".)
- **D-103 [Claude's Discretion — recommended]:** **Unpriced BOQ items** (NULL `unit_price` —
  nullable per COST-01) are **excluded** from the period (`unit_price_snapshot` is NOT NULL so they
  cannot form a line), and the compute/period UI **surfaces a warning listing the excluded items**
  so the office engineer can price them before finalizing. Prevents silent under-billing without a
  hard mid-flow block. (User said "you decide".)

### Pre-decided technical (planner MUST honor — from the Phase-7 schema notes)
- **D-104:** Enforce the arithmetic identity `period_qty = cumulative_qty_approved −
  previous_cumulative_qty` **at the database level** (the WR-03 note in `hakedis-period-lines.ts`,
  lines 36–46). **Preferred mechanism:** convert `period_qty` to a
  `GENERATED ALWAYS AS (cumulative_qty_approved - previous_cumulative_qty) STORED` column; the
  alternative is an equality CHECK. The table is empty until Phase 10, so the change is safe with no
  data migration. Existing CHECKs (`cumulative ≥ previous` in 0004; `period_qty ≥ 0` +
  `unit_price_snapshot ≥ 0` in 0006) remain.

### Claude's Discretion
- **D-94** avans model (flat rate recommended), **D-99** previous-period rule (latest-finalized
  recommended), **D-102** item inclusion, **D-103** unpriced-item handling — recommendations above;
  planner may adjust.
- Stopaj default `stopaj_rate` value (toggle defaults off per D-92).
- `period_number` / label format (the column is free text, e.g. `HK-2026-01`; auto-suggest vs
  manual entry is planner's call).
- Period **list page** + **detail summary table** layout; exact placement of the Recompute /
  Finalize / payment-status controls.
- Postgres rounding mode for 2-decimal display.
- Whether the new hakkediş actions live in `analytics.ts` or a new `hakedis.ts` action module.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 10: Hakkediş Billing" — goal + 5 success criteria.
- `.planning/ROADMAP.md` §"Milestone v2.0 — Locked decisions carried into all phases" —
  yeşil-defter model, multi-currency (`currency_code`), configurable deductions never hardcoded,
  money-in-Postgres + decimal.js, no materialized views (neon-http), additive `(admin)` routes,
  explicit `auth()` guard on every new `route.ts`.
- `.planning/REQUIREMENTS.md` — HAK-01..HAK-05 (Pending) and the v2.0 locked-decisions note.

### Existing hakkediş schema (Phase 7 — EXTEND, do not recreate)
- `src/db/schema/hakedis-periods.ts` — period header: `projectId`, `periodNumber`,
  `periodStartDate` (nullable / informational), `periodEndDate` (NOT NULL — the cumulative cutoff),
  `currencyCode` (NOT NULL, default TRY), `status` (`HAKEDIS_STATUSES = ['draft','finalized',
  'submitted','paid']`), `kdvRate` (0.20), `retentionRate`/teminat (0.05), `createdByUserId`,
  `finalizedAt`. Phase 10 adds `tevkifat_fraction`, `stopaj_enabled` + `stopaj_rate`,
  `avans_kesintisi_rate` (D-91).
- `src/db/schema/hakedis-period-lines.ts` — line snapshot: `materialSnapshot`, `unitSnapshot`,
  `currencyCodeSnapshot`, `unitPriceSnapshot` (NOT NULL), `cumulativeQtyApproved`,
  `previousCumulativeQty`, `periodQty` (NOT NULL), `periodValue`, `cumulativeValue`.
  **Read the WR-03 comment (lines 36–46)** — Phase 10 MUST enforce the `period_qty` identity at the
  DB level (D-104).
- `src/db/migrations/0004_v2_data_foundation.sql` — `CHECK (cumulative_qty_approved >=
  previous_cumulative_qty)`.
- `src/db/migrations/0006_v2_period_qty_check.sql` — `CHECK period_qty >= 0` and
  `unit_price_snapshot >= 0`.

### Data layer & money-math patterns (reuse)
- `src/actions/analytics.ts` — typed Postgres aggregation layer: `auth()` guard + `WHERE
  tenant_id = ${tenantId}` first; money via `SUM(::numeric)` grouped by currency, returned as
  strings; Istanbul-tz date bucketing; `decided_at` FILTER pattern. The cumulative-qty query
  (D-100) and the new hakkediş actions follow these idioms.
- `src/db/schema/boq-items.ts` — `unit_price` + `currency_code` (price **nullable** — D-103).
- `src/db/schema/submissions.ts` — `status`, approved quantity, `decidedAt` / `submittedAt` — the
  cumulative source.
- `src/db/schema/office-activity-log.ts` — activity log; PERF-03 includes hakkediş create/finalize
  as logged actions (D-97).

### Surfaces (stub to replace + IA constraints)
- `src/app/dashboard/(admin)/hakedis/page.tsx` — current coming-soon stub; Phase 10 replaces it
  with the period list + detail / CRUD surfaces. (Route slug is `hakedis`.)
- `.planning/phases/08-admin-shell-information-architecture/08-CONTEXT.md` — IA locks: D-64 shell
  wraps all pages; D-67 currency selector default TRY; D-73 URL filters; **D-74 6-item nav locked
  (no new sidebar item)**.
- `.planning/phases/09-performance-scorecards-leaderboard-alerts/09-CONTEXT.md` — D-89
  office-engineer-only + tenant-scoped `auth()` pattern; `/dashboard/settings` precedent.

### Project conventions
- `CLAUDE.md` — stack; money-in-Postgres + decimal.js for display (never JS float); Istanbul tz;
  next-intl TR/EN (every new label keyed in `messages/en.json` + `messages/tr.json`); shadcn via
  `node_modules/.bin/shadcn add` (NOT `npx shadcn@latest add` — known broken, Phase-8 finding).
- ⚠ **Migration constraint:** project decision **D-49 — `drizzle-kit push` is unusable**; the new
  deduction columns (D-91) and the `period_qty` GENERATED column (D-104) need generated migrations
  applied via the project's `tsx migrate.ts` path. Researcher must confirm the working migration
  path before planning.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/actions/analytics.ts`** — aggregation idioms (auth + tenant scope, money-in-Postgres,
  currency-grouped strings, Istanbul tz). `computePeriodLines()` and the cumulative-qty query
  build directly on these.
- **`hakedis_periods` + `hakedis_period_lines` tables already exist** with snapshot columns + CHECK
  constraints — Phase 10 writes the **first** rows, adds the deduction columns (D-91), and converts
  `period_qty` to a GENERATED column (D-104).
- **`office_activity_log` + `logOfficeActivity()` (Phase 7)** — wire hakkediş create / finalize /
  delete (D-97).
- **Phase 8/9 admin surfaces** — `KpiCard`, `FilterBar`, `CurrencySelector`, `force-dynamic` page
  pattern, `getTranslations` / `useTranslations` i18n, shadcn `Table`/`Dialog`/`Tabs` — reuse for
  the period list, detail summary table, and CRUD forms.

### Established Patterns
- All actions: `auth()` guard first + `WHERE tenant_id = ${tenantId}`; Drizzle `sql\`\`` bound
  params; money via `numeric` in Postgres returned as strings; decimal.js for display; never
  cross-currency sum.
- Pages: `export const dynamic = 'force-dynamic'`; read `searchParams`; `useSearchParams()` clients
  wrapped in `<Suspense>`; full TR/EN i18n on every label.
- Migrations: generated + hand-edited for CHECK / GENERATED constraints + applied via
  `tsx migrate.ts` (NOT `drizzle-kit push` — D-49).

### Integration Points
- New deduction columns on `hakedis_periods`; `period_qty` → GENERATED column on
  `hakedis_period_lines`.
- New typed actions (in `analytics.ts` or a new `hakedis.ts`): createPeriod, computePeriodLines
  (recompute), finalizePeriod, updatePaymentStatus, deletePeriod — all office-engineer-only,
  tenant-scoped, money-in-Postgres.
- Replace the `/dashboard/(admin)/hakedis` stub with period list + detail pages; honor the locked
  6-item nav (no new sidebar item).
- `office_activity_log` entries for create / finalize / delete.
</code_context>

<specifics>
## Specific Ideas

- The period detail summary table displays exactly the SC3 chain: gross dönem tutarı → KDV → KDV
  tevkifat → stopaj → teminat → avans kesintisi → net ödeme, each to 2 decimals (Postgres
  arithmetic).
- New draft periods pre-fill the construction-typical preset (tevkifat 0.40, teminat 0.05, KDV
  0.20, stopaj off, avans 0) — D-92.
- Corrections are handled through the next period's cumulative delta, not by un-finalizing (D-96).
</specifics>

<deferred>
## Deferred Ideas

- **Tracked advance-balance recoupment** (avans mahsubu against a project-level advance amount that
  carries forward until fully recovered) — v1 uses a flat rate × gross per period (D-94).
- **Fiyat farkı (price-escalation) auto-calculation** — already Out of Scope in REQUIREMENTS.md
  (needs government index APIs; a manual per-period override is sufficient for v2.0).
- **Mixed-currency single hakkediş certificate** — explicitly prevented by one-period-per-currency
  (D-101).
- **PDF hakkediş certificate + Excel yeşil-defter / hesap özeti export** — Phase 11 (EXP-02 /
  EXP-04). Phase 10 ships the on-screen summary table only.

### Reviewed Todos (not folded)
- `submission-detail-map-link.md` — a Phase-8 records-detail follow-up (Google Maps link on the
  canonical submission detail page). Not hakkediş work; stays deferred.
- `tenant-settings-seed-fk-safe.md` — a Phase-9 migration FK-safety follow-up. Not hakkediş work;
  stays deferred. (Phase 10 adds its own migration; the planner *may* opportunistically reuse the
  FK-safe seed pattern, but it is not Phase 10 scope.)
</deferred>

---

*Phase: 10-hakkedi-billing*
*Context gathered: 2026-05-28*
</content>
</invoke>
