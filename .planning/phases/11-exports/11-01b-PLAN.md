---
phase: 11-exports
plan: 01b
type: execute
wave: 1
depends_on:
  - 11-01a
files_modified:
  - src/lib/slug.ts
  - src/lib/excel.ts
  - src/actions/analytics.ts
  - messages/en.json
  - messages/tr.json
  - tests/exports.test.ts
  - tests/fixtures/exports.ts
  - tests/slug.test.ts
autonomous: true
requirements: [EXP-01, EXP-02, EXP-03, EXP-04]
user_setup: []

must_haves:
  truths:
    - "D-112: toSlug() helper exists at src/lib/slug.ts and normalizes İğşçöü → igscou"
    - "D-112 + WARNING 5 mitigation: sanitizeExcelCell() helper exists in src/lib/excel.ts and prefixes a single apostrophe to any string starting with =, +, -, @, \\t, or \\r (CVE-2014-3524 formula-injection mitigation; consumed by Plans 02/03/04)"
    - "Exports hub period picker query getAllFinishedPeriods() exists in src/actions/analytics.ts (status != 'draft', joined project name, tenant-scoped) — placed in analytics.ts (NOT hakedis.ts) per planner discretion to keep portfolio-level queries co-located with getPortfolioPeople; final placement may be hakedis.ts if executor judges that more idiomatic, as long as the export path resolves cleanly"
    - "D-110 location-compliance fix: PortfolioWorker is extended with locationComplianceRate (number | null) populated from PersonMetrics.locationComplianceRate via a join in getPortfolioPeople({role:'worker'}); column is non-null when the worker has approved submissions (WARNING 4 fix)"
    - "messages/{en,tr}.json each gain the dashboard.admin.exports.* block (21 keys) + 2 detail keys under hakedis.detail"
    - "tests/exports.test.ts exists with 12 it.todo entries matching the VALIDATION.md critical-truth table"
  artifacts:
    - path: "src/lib/slug.ts"
      provides: "toSlug() helper for D-112 filenames"
      exports: ["toSlug"]
    - path: "src/lib/excel.ts"
      provides: "sanitizeExcelCell() formula-injection mitigation helper (WARNING 5 fix)"
      exports: ["sanitizeExcelCell"]
    - path: "src/actions/analytics.ts"
      provides: "getAllFinishedPeriods() query for hub period picker + locationComplianceRate added to PortfolioWorker (WARNING 4 fix)"
      contains: "getAllFinishedPeriods"
    - path: "tests/exports.test.ts"
      provides: "Wave-1 test scaffold (12 it.todo entries)"
    - path: "messages/en.json"
      provides: "dashboard.admin.exports.* + detail.export_excel / download_pdf"
    - path: "messages/tr.json"
      provides: "Turkish parity for every new key"
  key_links:
    - from: "src/actions/analytics.ts (getAllFinishedPeriods)"
      to: "hakedis_periods + projects"
      via: "SELECT JOIN tenant-scoped"
      pattern: "tenant_id = \\$\\{tenantId\\}"
    - from: "src/actions/analytics.ts (getPortfolioPeople worker overload)"
      to: "person_metrics.location_compliance_rate (or equivalent)"
      via: "LEFT JOIN populating PortfolioWorker.locationComplianceRate"
      pattern: "locationComplianceRate"
    - from: "src/lib/excel.ts (sanitizeExcelCell)"
      to: "Plans 11-02, 11-03, 11-04 cell writes"
      via: "wrapping all string cell values that originate from user content"
      pattern: "sanitizeExcelCell"
---

<objective>
Wave 1 setup half-B for Phase 11. Builds on Plan 11-01a (packages + schema/OE scorecard/action i18n keys already installed). Ships the shared helper code that every Wave 2 plan depends on: `toSlug()` (D-112 filenames), `sanitizeExcelCell()` (WARNING 5 — CVE-2014-3524 formula-injection mitigation, used by Plans 02/03/04), `getAllFinishedPeriods()` (hub period picker query), the `locationComplianceRate` extension on `PortfolioWorker` (WARNING 4 fix — D-110 column was being delivered permanently blank; now joined from PersonMetrics), the 21-key `dashboard.admin.exports.*` i18n namespace + 2 `hakedis.detail.*` keys, and the `tests/exports.test.ts` scaffold with 12 `it.todo` entries covering the VALIDATION.md critical-truths.

Purpose: All four Wave-2 route-handler plans (11-02, 11-03, 11-04) depend on these shared helpers. The split from old Plan 11-01 exists because (a) checker review found the original 6-task plan exceeded the 3-task threshold, (b) the package-legitimacy checkpoint cleanly anchors Plan 01a, and (c) Plan 01b is fully autonomous so executor focus stays on helper correctness without context-switching to dependency-install concerns.

Output: 1 new lib helper file (slug.ts), 2 helper extensions to existing files (sanitizeExcelCell in excel.ts, getAllFinishedPeriods + PortfolioWorker.locationComplianceRate in analytics.ts), 21 + 2 new i18n keys per locale, 1 test scaffold file with 12 it.todo entries, 1 test fixture stub.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/11-exports/11-CONTEXT.md
@.planning/phases/11-exports/11-RESEARCH.md
@.planning/phases/11-exports/11-VALIDATION.md
@.planning/phases/11-exports/11-01a-SUMMARY.md
@CLAUDE.md

<interfaces>
<!-- Existing exports referenced by Wave 2 plans. Extracted from codebase. -->

From src/actions/hakedis.ts (Phase 10):
```typescript
export type PeriodListRow = {
  id: string; periodNumber: string; periodEndDate: string;
  currencyCode: string; status: string; netByDisplay: string | null;
};
// existing: getPeriodsByProject(projectId) — single-project scope (uses a tenant + project-scoped
//   subquery for net_by_display, lines 423-440).
// NEW (this plan): getAllFinishedPeriods() — all non-draft periods tenant-wide,
//   joined with project name, ordered by periodEndDate DESC. Must mirror the
//   net_by_display subquery from getPeriodsByProject (copy verbatim — D-90 deduction
//   chain in Postgres, never re-derive in JS).
//
// Planner discretion: original Plan 11-01 placed this in src/actions/hakedis.ts; the revision
// recommends src/actions/analytics.ts to keep portfolio-level "across all projects" queries
// co-located with getPortfolioPeople. Executor may keep it in hakedis.ts if they judge that
// more idiomatic — what matters is the export path: callers in Plans 11-05 must import
// `getAllFinishedPeriods` from a single stable location. Update the imports in plan 11-05
// accordingly.
```

From src/actions/analytics.ts (lines 50-58 — PersonMetrics, the source of locationComplianceRate):
```typescript
export type PersonMetrics = {
  // ... other fields ...
  locationComplianceRate: number | null;  // approved near / total approved; null when zero approved
  // ... other fields ...
};
```

From src/actions/analytics.ts (lines 1034-1042 — PortfolioWorker, the type to EXTEND):
```typescript
export type PortfolioWorker = {
  personId: string;
  displayName: string;
  submissionsApproved: number;
  submissionsRejected: number;
  submissionsPending: number;
  valueContributedByCurrency: Record<string, string>;
  // ← APPEND in this plan (D-110 / WARNING 4 fix):
  // locationComplianceRate: number | null;
};
```

From src/lib/tenant.ts:
```typescript
export function getDefaultTenantId(): string;
```

From src/lib/auth.ts:
```typescript
export function auth(): Promise<Session | null>;  // Auth.js v5
```

From tests/fixtures/db.ts:
```typescript
export const describeIfDb: typeof describe | typeof describe.skip;
export async function getTestDb(): Promise<DrizzleDb>;
export async function truncateAllTables(db): Promise<void>;
```

<!-- WARNING 5 (formula injection) mitigation shape — referenced by Plans 02/03/04. -->
NEW (this plan) — `src/lib/excel.ts`:
```typescript
/**
 * sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation.
 * Prefixes a single apostrophe to any string starting with =, +, -, @, \t (tab), or \r.
 * Excel treats the leading apostrophe as a literal-text marker (it is not displayed in cells).
 * Apply this to every user-content string cell value in submission ledger, performance summary,
 * and hakkediş Excel exports. Numeric strings (decimal money) flow direct; the helper only
 * touches string values matching the formula-prefix pattern.
 */
export function sanitizeExcelCell(value: string): string;
```
</interfaces>

@src/actions/hakedis.ts
@src/actions/analytics.ts
@src/lib/excel.ts
@src/lib/tenant.ts
@messages/en.json
@messages/tr.json
@.planning/phases/11-exports/11-UI-SPEC.md
@tests/fixtures/db.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create src/lib/slug.ts (D-112) + extend src/lib/excel.ts with sanitizeExcelCell() (WARNING 5 fix)</name>
  <read_first>
    - .planning/phases/11-exports/11-RESEARCH.md (## Content-Disposition Filename Construction + Open Question 2 RESOLVED)
    - .planning/phases/11-exports/11-CONTEXT.md (D-112 filename patterns)
    - src/lib/excel.ts (the existing ExcelJS helpers to append sanitizeExcelCell to)
    - CVE-2014-3524 background: Excel CSV/cell formula injection — strings starting with =, +, -, @ are interpreted as formulas; tab + CR are also injection vectors used by some exploits
  </read_first>
  <files>src/lib/slug.ts, src/lib/excel.ts, tests/slug.test.ts, tests/excel.test.ts</files>
  <behavior>
    **toSlug:**
    - `toSlug('İstanbul Doğalgaz')` returns `'istanbul-dogalgaz'`
    - `toSlug('Ankara Şehit Yolu')` returns `'ankara-sehit-yolu'`
    - `toSlug('  Boru   Hattı  ')` returns `'boru-hatti'` (whitespace collapsed, trailing dashes trimmed)
    - `toSlug('Project (2026)')` returns `'project-2026'` (non-alphanumerics → single dash)
    - `toSlug('---')` returns `''` (only dashes → empty string)
    - `toSlug('Çağrı Üçgenli')` returns `'cagri-ucgenli'` (all six Turkish lowercase chars normalized: ç→c, ğ→g, ş→s, ı→i, ö→o, ü→u, and capitals)

    **sanitizeExcelCell:**
    - `sanitizeExcelCell('normal text')` returns `'normal text'` unchanged
    - `sanitizeExcelCell('=cmd|/c calc')` returns `"'=cmd|/c calc"` (apostrophe-prefixed)
    - `sanitizeExcelCell('+1234')` returns `"'+1234"`
    - `sanitizeExcelCell('-1234')` returns `"'-1234"`
    - `sanitizeExcelCell('@SUM(A1:A10)')` returns `"'@SUM(A1:A10)"`
    - `sanitizeExcelCell('\t=evil')` returns `"'\t=evil"` (TAB triggers prefix)
    - `sanitizeExcelCell('\r=evil')` returns `"'\r=evil"` (CR triggers prefix)
    - `sanitizeExcelCell('')` returns `''` (empty string passes through)
    - `sanitizeExcelCell('1234.56')` returns `'1234.56'` unchanged (numeric strings like decimal money are NOT formulas)
  </behavior>
  <action>
    Two atomic library additions. Write the tests FIRST (RED), then implement (GREEN).

    **Edit 1 — Write `tests/slug.test.ts`** with the six toSlug expectations above. Use the existing vitest pattern; no external deps.

    **Edit 2 — Implement `src/lib/slug.ts`** exporting a single function `toSlug(name: string): string`. The implementation must, in order:
    1. Replace Turkish characters with ASCII equivalents — both capital and lowercase forms: İ→i, I→i, Ş→s, ş→s, Ğ→g, ğ→g, Ü→u, ü→u, Ö→o, ö→o, Ç→c, ç→c. Use explicit character-class replacements (not Unicode normalize — Turkish dotted-I needs special handling). Do this BEFORE `.toLowerCase()` so the dotted-I behaves correctly.
    2. Lowercase the result.
    3. Replace any run of non-`[a-z0-9]` characters with a single `-`.
    4. Trim leading and trailing dashes.

    Returns `''` for fully-invalid input. Result must be ASCII-safe so it can be used directly in `Content-Disposition: attachment; filename="…"` per D-112 without RFC 5987 encoding (RESEARCH.md Open Question 2 RESOLVED). No external dependencies. Pure, synchronous, no I/O.

    **Edit 3 — Add `tests/excel.test.ts`** sanitizeExcelCell test cases (8 expectations above). If `tests/excel.test.ts` already exists from earlier phases, append a new `describe('sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation', …)` block to it; do NOT modify existing tests.

    **Edit 4 — Append `sanitizeExcelCell` to `src/lib/excel.ts`** as a top-level named export:
    ```typescript
    const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;
    /**
     * sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation (WARNING 5 fix).
     * Prefixes a single apostrophe to any string starting with =, +, -, @, TAB, or CR.
     * Excel treats the leading apostrophe as a literal-text marker (not displayed).
     * Apply to every user-content string cell in Plans 11-02/11-03/11-04 (displayName,
     * materialSnapshot, notes, rejectionReason, etc.). Numeric strings (decimal money)
     * never match the formula prefix and pass through unchanged.
     */
    export function sanitizeExcelCell(value: string): string {
      if (typeof value !== 'string' || value.length === 0) return value;
      return FORMULA_PREFIX_RE.test(value) ? `'${value}` : value;
    }
    ```

    Keep both helpers small and pure — no I/O, no Excel.JS imports for sanitizeExcelCell. Document Plans 02/03/04 consumption with a trailing comment: `// Consumed by buildSubmissionLedger (Plan 11-02), buildPerformanceSummary (Plan 11-03), buildHakedisExcel (Plan 11-04).`
  </action>
  <verify>
    <automated>node_modules/.bin/vitest run tests/slug.test.ts tests/excel.test.ts --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - All six `toSlug` test expectations pass (GREEN).
    - All eight `sanitizeExcelCell` test expectations pass (GREEN).
    - `src/lib/slug.ts` exports exactly one symbol: `toSlug`.
    - `src/lib/excel.ts` adds exactly one new exported symbol `sanitizeExcelCell` (existing exports preserved).
    - No imports of `normalize` or external libs.
    - `grep -c "İ\|Ş\|Ğ\|Ü\|Ö\|Ç" src/lib/slug.ts` ≥ 1 (Turkish capitals handled explicitly).
    - `src/lib/slug.ts` is under 30 lines.
    - `sanitizeExcelCell` definition matches the WARNING 5 prefix set exactly: `=`, `+`, `-`, `@`, `\t`, `\r`.
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
  <done>tests/slug.test.ts + sanitizeExcelCell tests green; toSlug + sanitizeExcelCell exported; Turkish glyphs round-trip to ASCII; CVE-2014-3524 mitigation in place.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend analytics — getAllFinishedPeriods() + locationComplianceRate on PortfolioWorker (WARNING 4 fix)</name>
  <read_first>
    - src/actions/analytics.ts (lines 50-58 — PersonMetrics.locationComplianceRate; lines 1028-1180 — PortfolioWorker + getPortfolioPeople worker overload)
    - src/actions/hakedis.ts (lines 408-455 — getPeriodsByProject pattern; the net_by_display subquery lines 423-440 to copy verbatim)
    - src/actions/projects.ts (line 141 — getProjects auth+tenant pattern)
    - .planning/phases/11-exports/11-RESEARCH.md (## Existing Data Layer Surface Area > New Query Needed)
    - .planning/phases/11-exports/11-UI-SPEC.md (Surface 1c period picker columns + Workers tab locationCompliance column)
    - .planning/phases/11-exports/11-CONTEXT.md (D-110 worker columns — locationComplianceRate is REQUIRED)
  </read_first>
  <files>src/actions/analytics.ts, tests/analytics.test.ts</files>
  <behavior>
    Two atomic analytics extensions. Both ship in this task so the new column type and the new query type can be exported together.

    **Extension A — `getAllFinishedPeriods()` query:**
    - Tenant-scoped: must NOT return periods from a different tenant_id.
    - Filters `status != 'draft'` (only finalized/submitted/paid eligible — D-107 immutability for PDF).
    - Returns `PeriodPickerRow` = `PeriodListRow & { projectName: string; projectId: string }` — `projectName` joined from `projects`.
    - Ordered by `period_end_date DESC`.
    - Throws `'Unauthorized'` on no session (matches existing analytics pattern).
    - Empty array when no non-draft periods exist (NOT null).
    - Includes the same `netByDisplay` subquery used in `getPeriodsByProject` (lines 423-440 — full D-90 deduction chain in Postgres, never JS float).
    - Placement: planner discretion — recommended `src/actions/analytics.ts` to co-locate portfolio-level queries with `getPortfolioPeople`, but `src/actions/hakedis.ts` is also acceptable if the executor judges it more idiomatic. Whichever file, the export path used by Plan 11-05 must be consistent.

    **Extension B — `PortfolioWorker.locationComplianceRate` (WARNING 4 fix):**
    - `PortfolioWorker` type gains `locationComplianceRate: number | null`.
    - `getPortfolioPeople({role:'worker'})` populates it via a LEFT JOIN to whatever table stores per-person `location_compliance_rate` (the `PersonMetrics` source documented in the type — verify by grep where `location_compliance_rate` is selected in `getPersonMetrics` lines 813-820; reuse the SAME computation path, NOT a re-derivation).
    - When the worker has zero approved submissions → `locationComplianceRate` is `null`.
    - When the worker has approved submissions → `locationComplianceRate` is a fraction between 0 and 1 (or whatever shape `PersonMetrics.locationComplianceRate` returns).
    - This is THE D-110 column that Plan 11-03 previously left permanently blank — fix is in this plan, consumed in Plan 11-03 Task 1.
  </behavior>
  <action>
    **Extension A — Append `getAllFinishedPeriods()`** to `src/actions/analytics.ts` (recommended) OR keep in `src/actions/hakedis.ts` per planner judgment. Wherever it ships, also export the new type:

    ```typescript
    export type PeriodPickerRow = PeriodListRow & { projectName: string; projectId: string };

    export async function getAllFinishedPeriods(): Promise<PeriodPickerRow[]> {
      const session = await auth();
      if (!session) throw new Error('Unauthorized');
      const tenantId = getDefaultTenantId();
      const result = await db.execute(sql`
        SELECT hp.id, hp.period_number, hp.period_end_date, hp.currency_code, hp.status,
               hp.project_id, p.name AS project_name,
               (/* net_by_display subquery copied verbatim from getPeriodsByProject lines 423-440 */) AS net_by_display
        FROM hakedis_periods hp
        JOIN projects p ON p.id = hp.project_id
        WHERE hp.tenant_id = ${tenantId} AND hp.status != 'draft'
        ORDER BY hp.period_end_date DESC
      `);
      return result.rows.map(row => ({
        id: String(row.id),
        periodNumber: String(row.period_number),
        periodEndDate: String(row.period_end_date),
        currencyCode: String(row.currency_code),
        status: String(row.status),
        netByDisplay: row.net_by_display != null ? String(row.net_by_display) : null,
        projectName: String(row.project_name),
        projectId: String(row.project_id),
      }));
    }
    ```

    Cross-import note: if placing in `analytics.ts`, import `PeriodListRow` from `@/actions/hakedis`. If placing in `hakedis.ts`, no cross-file import needed. Either is correct.

    **Extension B — Add `locationComplianceRate` to `PortfolioWorker` and populate it:**

    Edit the type around line 1034:
    ```typescript
    export type PortfolioWorker = {
      personId: string;
      displayName: string;
      submissionsApproved: number;
      submissionsRejected: number;
      submissionsPending: number;
      valueContributedByCurrency: Record<string, string>;
      locationComplianceRate: number | null;  // ← D-110 / WARNING 4 fix: fraction (0..1) or null when no approved submissions
    };
    ```

    Then extend the worker branch of `getPortfolioPeople` (lines 1114-1180) to populate the new field. There are TWO acceptable implementation paths — executor picks based on the actual SQL of `getPersonMetrics`:

    1. **Inline aggregation** — add a third `db.execute(sql\`…\`)` to the existing `Promise.all` that computes `location_compliance_rate` per person using the SAME computation as `getPersonMetrics` (line 819 area: typically `COUNT(s.id) FILTER (WHERE s.status='approved' AND s.location_match) / NULLIF(COUNT(s.id) FILTER (WHERE s.status='approved'), 0)`). Build a `Map<personId, number | null>` like the existing `valueMap`, then merge into the returned `PortfolioWorker[]`.
    2. **Materialized view / metrics table join** — if `person_metrics` is a table or materialized view that already contains a stable `location_compliance_rate` column, LEFT JOIN it into the existing `countsResult` query and read directly.

    Whichever path: the produced number is the SAME definition as `PersonMetrics.locationComplianceRate` (lines 50-58, 819). DO NOT invent a new formula. Document the chosen path in a code comment: `// D-110 / WARNING 4: locationComplianceRate matches PersonMetrics.locationComplianceRate definition (approved-near / total-approved); null when zero approved.`

    **Tests — extend `tests/analytics.test.ts`:**

    Add a new `describeIfDb` block titled `'getAllFinishedPeriods() exposes non-draft periods tenant-wide'` with three tests:
    1. Returns empty array when no periods exist in tenant.
    2. Returns a finalized period but EXCLUDES a draft period in the same tenant.
    3. Cross-tenant period (tenant_id = some other UUID) is NOT returned even when status is finalized.

    Add a new `describeIfDb` block titled `'getPortfolioPeople({role:"worker"}).locationComplianceRate'` with two tests:
    1. Worker with zero approved submissions → `locationComplianceRate === null`.
    2. Worker with 4 approved submissions where 3 are location-matched → `locationComplianceRate` is approximately `0.75` (use `expect(rate).toBeCloseTo(0.75, 2)`).

    Use existing test infrastructure: `getTestDb`, `truncateAllTables`, the existing `seedHakediş`-style fixtures in `tests/hakedis.test.ts` for periods and the existing submissions fixture pattern for the worker test. DO NOT invent new fixture helpers.
  </action>
  <verify>
    <automated>node_modules/.bin/vitest run tests/analytics.test.ts -t "getAllFinishedPeriods|locationComplianceRate" --reporter=verbose</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export async function getAllFinishedPeriods" src/actions/analytics.ts src/actions/hakedis.ts` ≥ 1 (function exists in exactly one of the two files).
    - The function's first statement is `const session = await auth()` (mirrors existing auth-first pattern).
    - The SQL WHERE clause contains both `hp.tenant_id = ${tenantId}` AND `hp.status != 'draft'`.
    - The SQL contains `JOIN projects p ON p.id = hp.project_id`.
    - `PortfolioWorker` type contains `locationComplianceRate: number | null` (grep auditable).
    - All 5 new vitest tests pass under `describeIfDb` (3 for getAllFinishedPeriods, 2 for locationComplianceRate).
    - `npx tsc --noEmit` clean.
    - `PeriodPickerRow` type exported from whichever file `getAllFinishedPeriods` ends up in.
    - No new SQL file or migration created (these are query extensions to existing analytics functions).
  </acceptance_criteria>
  <done>getAllFinishedPeriods exported with PeriodPickerRow type; PortfolioWorker.locationComplianceRate populated; 5 vitest tests green.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Extend messages/{en,tr}.json with exports.* namespace + 2 detail keys + scaffold tests/exports.test.ts</name>
  <read_first>
    - messages/en.json (lines 115-125 nav block; lines 315-323 stubs block; lines 360-380 hakedis.detail block; the 4 action_*_exported keys added in Plan 11-01a — already present under oe_scorecard)
    - messages/tr.json (parallel structure — same line numbers approximately)
    - .planning/phases/11-exports/11-UI-SPEC.md (## i18n Namespace Extension section — exact key list + TR strings)
    - .planning/phases/11-exports/11-VALIDATION.md (## Per-Task Verification Map — the 12 critical truths)
    - tests/fixtures/db.ts (describeIfDb, getTestDb, truncateAllTables)
    - tests/excel.test.ts (lines 1-30 — typical test file header structure)
  </read_first>
  <files>messages/en.json, messages/tr.json, tests/exports.test.ts, tests/fixtures/exports.ts</files>
  <action>
    Two atomic additions: i18n keys (consumed by Plans 11-05/11-06) and the test scaffold (consumed by Plans 11-02/11-03/11-04).

    **Edit 1 — Extend `messages/en.json` and `messages/tr.json`:**

    In `en.json`:

    1. Under `dashboard.admin` (sibling of existing `hakedis` block, after the `stubs` block — at the JSON depth where `hakedis` lives ~line 324): add a new `"exports": { ... }` object containing all 21 keys from UI-SPEC: `heading, subtitle, section_ledger, section_performance, section_hakedis, download_excel, download_pdf, export_excel, picker_col_period, picker_col_end_date, picker_col_currency, picker_col_status, picker_col_net, picker_col_download, empty_no_data_heading, empty_no_data_body, empty_no_periods_heading, empty_no_periods_body, empty_no_periods_cta, err_download_failed, err_unauthorized`. Use EN strings from UI-SPEC Copywriting Contract verbatim (e.g. `"heading": "Exports"`, `"download_excel": "Excel İndir / Download Excel"` — D-111 joined-bilingual format).

    2. Under `dashboard.admin.hakedis.detail` (existing block ~line 360): add 2 new keys: `"export_excel": "Excel'e Aktar / Export Excel"`, `"download_pdf": "PDF İndir / Download PDF"`.

    3. Do NOT remove the existing `stubs.exports_heading` / `stubs.exports_body` — those keys are still referenced by other surfaces until Plan 11-05 replaces the stub page.

    4. Do NOT re-add the 4 `action_*_exported` keys under `oe_scorecard` — they were added by Plan 11-01a. Verify they exist before exiting this task.

    In `tr.json`: mirror the same structure with Turkish strings per UI-SPEC.

    For the 21 exports.* keys, the TR side uses Turkish: `"heading": "Dışa Aktarma"`, `"subtitle": "Proje verilerinizi Excel ve PDF formatında indirin."`, etc. — copy from UI-SPEC Copywriting Contract.

    For the joined bilingual labels (`download_excel`, `download_pdf`, `export_excel`, `picker_col_*`), use the EXACT SAME joined string in both files (e.g. `"download_excel": "Excel İndir / Download Excel"` in both en.json AND tr.json — the slash-joined string is the locale-neutral label per D-111). Do NOT duplicate or vary the bilingual label across locales.

    For `empty_*` and `err_*` keys, the TR file uses Turkish and the EN file uses English (full sentences shown to the user; locale switcher chooses between them).

    Preserve JSON validity: every new entry needs a trailing comma EXCEPT the last one in its containing object. Validate with `node -e "JSON.parse(require('fs').readFileSync('messages/en.json'))"` and same for tr.json.

    **Edit 2 — Create `tests/exports.test.ts`** as the unified scaffold for all four Wave-2 route handlers and the activity-log writes. The file must contain a top-level imports block (vitest `describe, it, expect`; `describeIfDb, getTestDb, truncateAllTables` from `./fixtures/db`) and 12 `it.todo(...)` entries grouped into describe blocks — one entry per critical truth from 11-VALIDATION.md:

    ```
    describe('EXP-01 submission ledger', () => {
      it.todo('returns 401 without session');
      it.todo('scopes by tenant_id (no cross-tenant rows)');
      it.todo('row count equals getCanonicalSubmissions({limit:100_000}).length');
    });
    describe('EXP-02 hakedis Excel', () => {
      it.todo('returns 401 without session');
      it.todo('returns 422 for draft period');
      it.todo('Hesap Özeti gross cell equals getPeriodDetail().deductions.gross');
      it.todo('Hesap Özeti kdv/tevkifat/stopaj/teminat/avans/net cells match deductions strings');
    });
    describe('EXP-03 performance summary', () => {
      it.todo('returns 401 without session');
      it.todo('Workers tab row count equals getPortfolioPeople({role:"worker"}).length');
    });
    describe('EXP-04 hakedis PDF', () => {
      it.todo('returns 401 without session');
      it.todo('returns 422 for draft period');
      it.todo('PDF binary contains embedded DejaVu Sans font name');
      it.todo('PDF binary contains Turkish glyphs from period number');
    });
    describe('D-109 activity log', () => {
      it.todo('each successful export writes exactly one office_activity_log row of the right action_type');
    });
    describe('D-112 filenames', () => {
      it.todo('Content-Disposition filename matches verbose pattern with project + date');
    });
    describe('D-111 bilingual headers', () => {
      it.todo('every TR/EN header cell in every workbook contains a " / " separator');
    });
    ```

    Adjust the count to exactly 12 it.todo entries total — splitting/merging is OK as long as the 12 critical truths from VALIDATION.md are all represented and the test names contain the truth phrase verbatim enough for `vitest run -t "..."` grep matching.

    Also create `tests/fixtures/exports.ts` exporting a single helper stub: `export async function seedFinalizedHakedisFixture(db): Promise<{ periodId: string; projectId: string }>`. For Wave 1, this stub may THROW `new Error('seedFinalizedHakedisFixture not yet implemented — Plan 11-04 wires this')`. Wave 2 Plans 02/03/04 implement it as they need it. Document this in a top-of-file comment.

    Tests under `describeIfDb` MUST use `await getTestDb()` + `truncateAllTables(db)` in beforeEach. The `it.todo` entries do not run yet — they are placeholders. The scaffold is the Nyquist gate per the deep_work_rules.
  </action>
  <verify>
    <automated>node -e "const en=require('./messages/en.json'); const tr=require('./messages/tr.json'); const reqd=['heading','subtitle','section_ledger','section_performance','section_hakedis','download_excel','download_pdf','export_excel','picker_col_period','picker_col_end_date','picker_col_currency','picker_col_status','picker_col_net','picker_col_download','empty_no_data_heading','empty_no_data_body','empty_no_periods_heading','empty_no_periods_body','empty_no_periods_cta','err_download_failed','err_unauthorized']; for(const k of reqd){if(!en.dashboard.admin.exports[k]) throw new Error('EN missing '+k); if(!tr.dashboard.admin.exports[k]) throw new Error('TR missing '+k);} if(!en.dashboard.admin.hakedis.detail.export_excel || !tr.dashboard.admin.hakedis.detail.export_excel) throw new Error('detail.export_excel missing'); if(!en.dashboard.admin.hakedis.detail.download_pdf || !tr.dashboard.admin.hakedis.detail.download_pdf) throw new Error('detail.download_pdf missing'); const actions=['action_hakedis_pdf_exported','action_hakedis_excel_exported','action_submission_ledger_exported','action_performance_summary_exported']; for(const k of actions){if(!en.dashboard.admin.oe_scorecard[k] || !tr.dashboard.admin.oe_scorecard[k]) throw new Error('Plan 11-01a action key '+k+' missing — re-run 11-01a Task 2');} console.log('all keys present in both locales');" ; node_modules/.bin/vitest run tests/exports.test.ts --reporter=verbose 2>&amp;1 | grep -E "todo|skipped" | wc -l | awk '{if($1 >= 12) print "OK 12+ todos"; else print "FAIL only "$1" todos"; exit ($1 >= 12 ? 0 : 1)}'</automated>
  </verify>
  <acceptance_criteria>
    - 21 exports.* keys present under `dashboard.admin.exports` in BOTH files.
    - 2 detail.{export_excel,download_pdf} keys present under `dashboard.admin.hakedis.detail` in BOTH files.
    - 4 action_*_exported keys still present under `dashboard.admin.oe_scorecard` (added by Plan 11-01a — this task verifies but does not re-add).
    - Both JSON files parse cleanly via `node -e "JSON.parse(...)"`.
    - The verify command prints `"all keys present in both locales"`.
    - Existing `stubs.exports_heading` / `stubs.exports_body` keys still present (untouched).
    - tr.json `download_excel` value equals en.json `download_excel` value (D-111 bilingual labels are locale-neutral).
    - `tests/exports.test.ts` exists with exactly 12 `it.todo` entries (or more if a critical truth was split).
    - Each it.todo description contains a phrase that maps to a VALIDATION.md critical-truth bullet (auditable by grep).
    - `tests/fixtures/exports.ts` exists with the seedFinalizedHakedisFixture stub.
    - `vitest run tests/exports.test.ts` reports the test file is discoverable (not a syntax error).
  </acceptance_criteria>
  <done>EN + TR each gain 21 + 2 keys; verify command prints success; stubs untouched; exports.test.ts discoverable with ≥12 it.todo entries; fixture stub created.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| TypeScript helper → Plans 02/03/04 cells | sanitizeExcelCell is the CVE-2014-3524 frontline — every user-content string flows through it |
| analytics SQL → PortfolioWorker | locationComplianceRate join must be tenant-scoped (inherits getPortfolioPeople scope) |
| analytics SQL → PeriodPickerRow | getAllFinishedPeriods is tenant-scoped + status-filtered |
| i18n JSON → next-intl t() | static compile-time key resolution |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-11-01b-SQL | Tampering | getAllFinishedPeriods SQL | mitigate | All values bound via Drizzle `sql\`\`` parameters (`${tenantId}`); zero string concatenation. Mirrors the proven pattern from `getPeriodsByProject` (lines 408-455). |
| T-11-01b-IDOR | Information Disclosure | locationComplianceRate cross-tenant leak | mitigate | The new join inherits `getPortfolioPeople`'s tenant scope (line 1103: `getDefaultTenantId()` + `WHERE p.tenant_id = ${tenantId}`). No new tenant boundary introduced. |
| T-11-01b-CVE-2014-3524 | Tampering | sanitizeExcelCell helper | mitigate | New helper prefixes apostrophe to formula-prefix strings; consumed by Plans 02/03/04 cell writes. Regression tested on 8 inputs. Eliminates the formula-injection accept-disposition in Plan 11-02 (T-11-02-FORMULA upgraded from accept→mitigate; Plans 11-03 + 11-04 add T-11-03-FORMULA + T-11-04-FORMULA as mitigate). |
| T-11-01b-SLUG | Tampering | toSlug → Content-Disposition | mitigate | ASCII-only output via explicit Turkish char-class replacement + `[a-z0-9]` whitelist. No path-traversal, no RFC 5987 needed. 6 test cases regression-gate. |
| T-11-01b-i18n | Spoofing | TR/EN message merge | accept | JSON files validated by `JSON.parse` and `next-intl` key-coverage at compile-time. No user-controlled content. |
</threat_model>

<verification>
## Plan-level Checks

After all 3 tasks:
- `node_modules/.bin/tsc --noEmit` clean.
- `node_modules/.bin/vitest run tests/slug.test.ts tests/excel.test.ts tests/analytics.test.ts tests/exports.test.ts` — slug + sanitizeExcelCell + getAllFinishedPeriods + locationComplianceRate green; exports.test.ts shows 12+ pending todos.
- Both `messages/en.json` and `messages/tr.json` parse via `JSON.parse`; all 21 exports.* keys + 2 detail keys + (from 01a) 4 action keys present in both.
- `grep -c "sanitizeExcelCell" src/lib/excel.ts` ≥ 1.
- `grep -c "locationComplianceRate" src/actions/analytics.ts` ≥ 2 (type field + return-map population).
- `grep -c "getAllFinishedPeriods" src/actions/analytics.ts src/actions/hakedis.ts` ≥ 1.
</verification>

<success_criteria>
- All Wave-2 plans (02, 03, 04) have everything they need: toSlug() to build filenames, sanitizeExcelCell() for formula-injection mitigation, getAllFinishedPeriods() for the picker (consumed by Plan 05), PortfolioWorker.locationComplianceRate populated (consumed by Plan 11-03), exports.* i18n namespace (consumed by Plan 05), hakedis.detail.{export_excel,download_pdf} (consumed by Plan 11-06), and the exports.test.ts scaffold to fill in.
- WARNING 4 fix: D-110 `locationComplianceRate` column is no longer permanently blank — Plan 11-03 Task 1 will now read the populated field and Plan 11-03 must_haves.truths asserts non-null when the worker has approved submissions.
- WARNING 5 fix: sanitizeExcelCell helper exists and is regression-tested; Plans 11-02/11-03/11-04 reference it as the formula-injection mitigation in their STRIDE registers.
- No DB migration created.
</success_criteria>

<output>
Create `.planning/phases/11-exports/11-01b-SUMMARY.md` when done. Include: which file got `getAllFinishedPeriods` (analytics.ts vs hakedis.ts), the SQL implementation choice for locationComplianceRate (inline aggregation vs PersonMetrics join), key counts added to en.json and tr.json (should be 23 each: 21 exports + 2 detail), and a copy-pasted output of `vitest run tests/slug.test.ts tests/excel.test.ts tests/analytics.test.ts -t "getAllFinishedPeriods|locationComplianceRate|sanitizeExcelCell"`.
</output>
