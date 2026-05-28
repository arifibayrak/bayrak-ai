---
phase: 10
slug: hakkedi-billing
status: secured
asvs_level: 1
block_on: high
threats_total: 14
threats_closed: 14
threats_open: 0
audited: 2026-05-28
---

# SECURITY.md — Phase 10: Hakkediş Billing

**Audited:** 2026-05-28
**Auditor:** Claude (gsd-security-auditor, Sonnet 4.6)
**ASVS Level:** 1
**block_on:** high

---

## Audit Result: SECURED

**Threats Closed:** 14/14
**Threats Open:** 0
**Unregistered Flags:** 0

---

## Threat Verification Table

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|-------------|--------|----------|
| T-10-01-T | Tampering | hakedis_period_lines.period_qty | mitigate | CLOSED | `src/db/schema/hakedis-period-lines.ts:40` — `generatedAlwaysAs(sql\`cumulative_qty_approved - previous_cumulative_qty\`)`; `src/db/migrations/0008_v2_hakedis_deductions.sql:41` — `GENERATED ALWAYS AS (...) STORED`; INSERT at `src/actions/hakedis.ts:256–281` omits `period_qty` column entirely |
| T-10-01-I | Information Disclosure | schema/live-DB drift | mitigate | CLOSED | Migration 0008 applied to primary and TEST_DATABASE_URL Neon branches (10-01-SUMMARY.md § Migration Verification); information_schema confirmed 4 deduction columns + `is_generated = ALWAYS` on `period_qty`; 17/17 schema tests pass |
| T-10-01-DI | Denial of integrity | cumulative_check vs dropped period_qty_nonneg | accept | CLOSED | Accepted per plan: `cumulative_check` (`cumulative >= previous`, migration 0004) mathematically guarantees GENERATED `period_qty >= 0`; `period_qty_nonneg` auto-dropped; documented in `0008_v2_hakedis_deductions.sql:13–16` and `hakedis-period-lines.ts:36–39` |
| T-10-01-SC | Tampering | npm/shadcn installs | mitigate | CLOSED | `src/components/ui/switch.tsx:3` — `import { Switch as SwitchPrimitive } from "@base-ui/react/switch"` (official shadcn/base-ui registry); no new npm packages beyond existing dependencies |
| T-10-02-EoP | Elevation of Privilege | every exported action | mitigate | CLOSED | `grep -c "const session = await auth()"` returns 7 real occurrences (lines 154, 311, 409, 475, 633, 686, 729 — one per exported function: `recomputePeriodLines`, `createPeriod`, `getPeriodsByProject`, `getPeriodDetail`, `finalizePeriod`, `updatePaymentStatus`, `deletePeriod`); each is the first statement of its function |
| T-10-02-IDOR-P | Information Disclosure | getPeriodDetail/getPeriodsByProject on periodId/projectId | mitigate | CLOSED | 18 occurrences of `tenant_id = ${tenantId}` in `src/actions/hakedis.ts`; IDOR guard at line 318–323 (`SELECT id FROM projects WHERE id = ${parsed.projectId} AND tenant_id = ${tenantId}`); all period/line queries include `AND tenant_id = ${tenantId}` |
| T-10-02-IMM | Tampering | finalized snapshot recompute/edit/delete | mitigate | CLOSED | `src/actions/hakedis.ts:167` — `if (period.status !== 'draft') throw new Error('Period is not in draft status')` (recompute); `:645` (finalize); `:741` — `if (period.status !== 'draft') throw new Error('Cannot delete a finalized period')` (delete); `VALID_TRANSITIONS` at line 71 blocks draft→submitted; tests at `tests/hakedis.test.ts:822–927` exercise all immutability paths |
| T-10-02-FLOAT | Tampering / integrity | deduction + line value math | mitigate | CLOSED | Period value: `src/actions/hakedis.ts:278` — `((${cumulative}::numeric - ${previous}::numeric) * ${unitPrice}::numeric)` stays in Postgres; deduction chain: lines 542–587 — single Postgres GROUP BY query; `getPeriodsByProject` net: lines 423–439 — correlated subquery in Postgres numeric; no `parseFloat`/`*` on money values in JS; `Number()` usage at lines 47–61 is Zod rate-string validation (0–1 range check, not money arithmetic); line 336 is COUNT integer coercion |
| T-10-02-SQLi | Tampering | period label / rates / ids | mitigate | CLOSED | `grep -n "sql.raw" src/actions/hakedis.ts` — zero occurrences (grep found only a comment at line 19); all values bound via Drizzle `sql\`\`` parameterized templates; `z.enum(ALLOWED_CURRENCIES)` at line 45 allowlists currency; Zod `refine` validates all rate fractions |
| T-10-02-XCUR | Tampering / bad sums | computePeriodLines aggregation | mitigate | CLOSED | `src/actions/hakedis.ts:206` — `AND b.currency_code = ${currencyCode}`; line 231 — `AND hp.currency_code = ${currencyCode}` in previous-cumulative query; test at `tests/hakedis.test.ts:460–513` asserts only TRY items appear in a TRY period |
| T-10-02-NULL | Integrity | NULL tevkifat_fraction/stopaj_rate poisoning net | mitigate | CLOSED | `src/actions/hakedis.ts:428,430,551,554` — `COALESCE(hp2.tevkifat_fraction::numeric, 0)`, `COALESCE(hp2.stopaj_rate::numeric, 0)` in both `getPeriodsByProject` and `getPeriodDetail` deduction queries; test at `tests/hakedis.test.ts:624–686` inserts a period with NULL rates and asserts deduction chain does not throw |
| T-10-02-SC | Tampering | npm installs | accept | CLOSED | Accepted per plan: no new npm packages in plan 02 (10-02-PLAN.md threat register note confirmed) |
| T-10-03-EoP | Elevation of Privilege | list page RSC | mitigate | CLOSED | `src/app/dashboard/(admin)/hakedis/page.tsx:55–56` — `const session = await auth(); if (!session) redirect('/auth/signin');` is the first statement of the default export |
| T-10-03-IDOR | Information Disclosure | ?project= param → getPeriodsByProject | mitigate | CLOSED | `getPeriodsByProject` (hakedis.ts:409–455) includes `WHERE hp.project_id = ${projectId} AND hp.tenant_id = ${tenantId}`; a guessed cross-tenant projectId returns zero rows |
| T-10-03-IV | Tampering | rate % inputs in the dialog | mitigate | CLOSED | `src/components/admin/HakedisCreateDialog.tsx:148–153` — `pctToFraction()` converts %; server-side `createPeriodSchema.parse(input)` at `hakedis.ts:315` validates all rates as 0–1 fractions; client conversion is UX-only |
| T-10-03-DEL | Tampering | Sil affordance → deletePeriod on a non-draft period | mitigate | CLOSED | `src/app/dashboard/(admin)/hakedis/page.tsx:192` — `{period.status === 'draft' && (<DeletePeriodDialog .../>)}`; `src/actions/hakedis.ts:741` — server also throws 'Cannot delete a finalized period' (defense in depth) |
| T-10-03-XSS | Information Disclosure | period label / project name render | mitigate | CLOSED | Zero occurrences of `dangerouslySetInnerHTML` in all hakedis UI files; React auto-escapes all string interpolations |
| T-10-03-SC | Tampering | npm installs | accept | CLOSED | Accepted per plan: Switch added in Wave 1 from official registry; no new packages in Wave 3 |
| T-10-04-EoP | Elevation of Privilege | detail page RSC | mitigate | CLOSED | `src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx:85–86` — `const session = await auth(); if (!session) redirect('/auth/signin');` is the first statement of the default export |
| T-10-04-IDOR | Information Disclosure | periodId → getPeriodDetail | mitigate | CLOSED | `getPeriodDetail` (hakedis.ts:475–619) includes `WHERE id = ${periodId} AND tenant_id = ${tenantId}`; cross-tenant periodId → no row → `notFound()` at detail page lines 99+103 |
| T-10-04-IMM | Tampering | finalize/recompute/delete on a finalized period | mitigate | CLOSED | `src/components/admin/PeriodDetailControls.tsx:90` — `{status === 'draft' && ...}` removes recompute/finalize/delete controls; Wave 2 server actions also enforce draft-only guard (defense in depth); `paid` status renders no controls (line 135 comment) |
| T-10-04-FLOAT | Tampering / integrity | money display | mitigate | CLOSED | `src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx:26` — `import { formatMoney } from '@/lib/format-money'`; `src/lib/format-money.ts:33,38` — `new Decimal(value).toFixed(2)` → `BigInt(intPart)` via `Intl.NumberFormat`; value never re-enters JS float domain; list page uses `formatMoneyAmount` from same lib (page.tsx:5,180); `Number()` in detail page lines 230+373 is quantity comparison and rate display-gate, not money arithmetic |
| T-10-04-XSS | Information Disclosure | material/project/period strings | mitigate | CLOSED | Zero occurrences of `dangerouslySetInnerHTML` in `[periodId]/page.tsx`, `FinalizeDialog.tsx`, `PeriodDetailControls.tsx`; all strings interpolated via JSX (auto-escaped) |
| T-10-04-SC | Tampering | npm installs | accept | CLOSED | Accepted per plan: no new npm packages in Wave 4 |

---

## Accepted Risks

| Risk ID | Component | Disposition | Rationale |
|---------|-----------|-------------|-----------|
| T-10-01-DI | cumulative_check vs period_qty_nonneg | accept | `period_qty_nonneg` CHECK auto-drops with the GENERATED column drop. `cumulative_check` (`cumulative >= previous`, migration 0004) mathematically guarantees `period_qty = cumulative - previous >= 0`. Documented in migration 0008 header comment and schema comments. |
| T-10-02-SC | npm installs (plan 02) | accept | No new npm packages in plan 02. RESEARCH Package Legitimacy Audit: none listed. |
| T-10-03-SC | npm installs (plan 03) | accept | Switch added in Wave 1 from official shadcn/base-ui registry. No new packages in Wave 3. |
| T-10-04-SC | npm installs (plan 04) | accept | No new npm packages in Wave 4. |

---

## Unregistered Threat Flags

None. All SUMMARY.md `## Threat Flags` sections for 10-01 through 10-04 reported no new threat surface beyond what the plan-time threat register covered. The executor confirmed all seven T-10-02-* threats mitigated inline (10-02-SUMMARY.md § Threat Flags).

---

## Domain-Specific Verification Notes

### Auth Guard Count
`grep -c "const session = await auth()"` in `src/actions/hakedis.ts`: **7 real occurrences** (1 additional is in a comment). One guard per exported function — requirement met.

### period_qty INSERT Check
The single `INSERT INTO hakedis_period_lines` statement (hakedis.ts:256) lists 11 columns; `period_qty` is absent. The DB-GENERATED column is never supplied explicitly.

### Money Math Path
- Server: all `period_value`, `cumulative_value`, `gross`, `kdv`, `tevkifat`, `stopaj`, `teminat`, `avans`, `net` computed in Postgres `numeric` via `::numeric` casts and SQL arithmetic.
- Display (list page): `formatMoneyAmount(period.netByDisplay, locale)` — `Decimal.toFixed(2)` → `BigInt(intPart)` via `Intl.NumberFormat`.
- Display (detail page): `formatMoney(value, currency, locale)` — same path.
- No `parseFloat()` or `Number()` on monetary amounts anywhere in the hakedis UI surface.

### `Number()` Usage (Not Money)
Two `Number()` calls in `[periodId]/page.tsx` are non-monetary:
- Line 230: `Number(line.periodQty)` — boolean display gate (`hasWork = periodQtyNum > 0`).
- Line 373: `Number(period.avansKesintisiRate) > 0` — display-gating whether to render the avans row.
Neither produces a displayed monetary value.

### i18n Parity
71/71 leaf keys present in both `messages/en.json` and `messages/tr.json` under `dashboard.admin.hakedis.*`. Deep key comparison confirms zero mismatches. Column header keys (`lines_col_material`, `lines_col_unit`, `lines_col_unit_price`, `lines_col_prev_cumulative`, `lines_col_cumulative`, `lines_col_period_qty`, `lines_col_period_value`) added post-CR (WR-02 fix) — fully i18n'd.

### Code Review Findings (10-REVIEW) — Resolution Status
- **CR-01** (Number() on netByDisplay in list page): FIXED — `formatMoneyAmount()` from `src/lib/format-money.ts` used; Decimal.js → BigInt path, no float.
- **CR-02** (hakedis_period_deleted missing from OE scorecard): Out of scope for this phase's threat register (OE scorecard is in `analytics/office-engineers/` — a separate component not audited in this phase). Not a blocker for the hakedis billing surface.
- **WR-01** (formatMoney two-step Number() re-entry): FIXED — `src/lib/format-money.ts` uses `BigInt(intPart)` for locale grouping, never passes through `Number()`.
- **WR-02** (hardcoded TR column headers): FIXED — all 7 column headers use `t('detail.lines_col_*')` keys present in both locales.
- **WR-04** (client-side period label bypass): FIXED — `HakedisCreateDialog.tsx:138,144` sends `periodNumber: label || undefined`; blank label triggers server-side COUNT auto-numbering.

---

_Phase: 10-hakkedi-billing_
_Audited: 2026-05-28_
_Auditor: Claude (gsd-security-auditor)_
