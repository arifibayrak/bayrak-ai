---
phase: 09-performance-scorecards-leaderboard-alerts
fixed_at: 2026-05-27T00:00:00Z
review_path: .planning/phases/09-performance-scorecards-leaderboard-alerts/09-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 9: Code Review Fix Report

**Fixed at:** 2026-05-27
**Source review:** `.planning/phases/09-performance-scorecards-leaderboard-alerts/09-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (CR-01, CR-02, CR-03, CR-04, WR-01, WR-02, WR-03, WR-04, WR-05)
- Fixed: 9
- Skipped: 0

## Fixed Issues

### CR-03: `auditSlaHours = null` makes SLA breach rate SQL return 0 instead of `null`

**Files modified:** `src/actions/analytics.ts`
**Commit:** `6fd47b7`
**Applied fix:** Replaced the inline `${auditSlaHours}` parameter interpolation (which caused `EXTRACT(...) > NULL` in SQL) with a conditional `slaBreachFragment` variable — `sql\`NULL\`` when `auditSlaHours` is not provided, or the real fraction computation when it is. Also hardened the outer WHERE to `AND s.decided_at IS NOT NULL`, aligning the `decisions_count` denominator with the breach-rate computation (WR-03 fixed as a side effect).

---

### CR-02: OE scorecard IDOR — user existence check is global, not tenant-scoped
### CR-04: broken "Load more" link

**Files modified:** `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx`
**Commit:** `acc55ea`
**Applied fix (CR-02):** Replaced the two-query pattern (global user lookup + separate COUNT check) with a single `INNER JOIN office_activity_log` query that enforces tenant membership before revealing any user identity (name/email). `notFound()` is now called when the user either doesn't exist OR has no activity in the current tenant. The `tenantCheckResult` / `hasTenantActivity` variable and the suppress-JSX line were removed. The `Props` interface was updated to accept `searchParams`.

**Applied fix (CR-04):** Added `searchParams: Promise<{ limit?: string }>` to `Props`. The page now reads `limitParam`, parses it via `parseInt` (defaulting to `INITIAL_LIMIT=50`, clamped to max 500). The Load more link emits `?limit=${limit + LOAD_MORE_LIMIT}` (incremental) and is only rendered when `entries.length >= limit` — so it disappears when the last page is reached.

---

### CR-01: `getAuditorSortFn` `sla_breach` branch sorts by wrong metric
### WR-05: auditor leaderboard has no SLA breach rate column or sort indicator

**Files modified:** `src/actions/analytics.ts`, `src/app/dashboard/(admin)/people/page.tsx`
**Commit:** `8d7e14f`
**Applied fix (CR-01):** Added `slaBreachRateDecided: number | null` to the `PortfolioAuditor` type. Added `auditSlaHours?: number` to the `getPortfolioPeople` auditor overload. Built a conditional `slaBreachFragment` in the auditor bulk query (same pattern as CR-03 fix) — `NULL` when no threshold, otherwise the fraction of decided submissions exceeding the threshold. Fixed `getAuditorSortFn('sla_breach')` to sort by `slaBreachRateDecided` DESC (highest breach rate first), not `avgDecisionLatencyHours`.

**Applied fix (WR-05):** Added `getTenantSettings` import to `people/page.tsx`; settings are fetched before the parallel query block and `auditSlaHours` is threaded into `getPortfolioPeople({ role: 'auditor', auditSlaHours })`. Added an "SLA Breach Rate" column (`TableHead` + `TableCell`) to the auditor leaderboard table showing the breach rate as a percentage badge (destructive when > 20%), with a sort-direction `ArrowDown` indicator when `effectiveAuditorSort === 'sla_breach'`.

---

### WR-02: `ThresholdSettingsForm` — `Number(e.target.value)` converts empty string to `0`

**Files modified:** `src/components/admin/ThresholdSettingsForm.tsx`
**Commit:** `8d268ac`
**Applied fix:** Changed all three field states (`auditSlaHours`, `rejectionRatePercent`, `stalledDays`) from `number` to `string` (e.g. `useState(String(defaultAuditSlaHours))`). Input `onChange` handlers now store the raw string (`e.target.value`). On submit, `parseInt(str, 10)` parses the string — returning `NaN` for empty/non-numeric input — before validation. This allows the user to clear a field and type a new value without it snapping to `0`.

---

### WR-04: `updateTenantSettings` missing `revalidatePath` for People pages

**Files modified:** `src/actions/settings.ts`
**Commit:** `ce32607`
**Applied fix:** Added `revalidatePath('/dashboard/people')` and `revalidatePath('/dashboard/people/[personId]', 'page')` after the successful upsert in `updateTenantSettings`. These pages are currently `force-dynamic` so the paths are technically not cached, but explicit invalidation makes the boundary explicit and prevents silent stale data if caching is added later.

---

### WR-03: `getPersonMetrics` auditor `decisions_count` denominator misalignment

**Files modified:** `src/actions/analytics.ts`
**Commit:** `6fd47b7` (fixed as part of CR-03)
**Applied fix:** Added `AND s.decided_at IS NOT NULL` to the outer WHERE of Query 3, so `COUNT(*)` (which becomes `decisions_count`) only counts rows where `decided_at IS NOT NULL`. This aligns `decisions_count` with the breach-rate denominator (`NULLIF(COUNT(*), 0)`) — the top-level count and the breach denominator are now the same set of rows.

---

### WR-01: `getPortfolioKPIs` — `dateCondition` inside FILTER is non-standard

**Files modified:** `src/actions/analytics.ts`
**Commit:** `2c6b27d`
**Applied fix:** Added a code comment at the relevant query documenting the pattern, its current correctness, the canonical CASE-expression alternative, and why restructuring was deferred (to avoid destabilising passing tests). No code-logic change was made per the scope constraint ("best-effort hardening only — if low-risk, otherwise leave a code comment").

---

### CR-01 test coverage: PERF-05 stubs + sla_breach sort test

**Files modified:** `tests/analytics.test.ts`
**Commit:** `5c39f1a`
**Applied fix:** Updated `PortfolioAuditor` stubs in the PERF-05 describe block to include `slaBreachRateDecided` (now a required field). Added a new test `auditors sla_breach-sort by slaBreachRateDecided DESC, null-last (CR-01)` that asserts: Dave (0.4) ranks first, Eve (0.1) second, Frank (null) last — and confirms it does NOT sort by `avgDecisionLatencyHours`. Test PASSES.

## Skipped Issues

None — all 9 findings in scope were successfully fixed.

---

_Fixed: 2026-05-27_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
