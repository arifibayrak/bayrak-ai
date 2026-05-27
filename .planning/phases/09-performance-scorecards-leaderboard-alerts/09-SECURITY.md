---
phase: 9
slug: performance-scorecards-leaderboard-alerts
status: secured
threats_open: 0
asvs_level: 1
created: 2026-05-27
---

# Security Audit — Phase 9: Performance Scorecards, Leaderboard & Alerts

**Auditor:** gsd-security-auditor (claude-sonnet-4-6)
**ASVS Level:** 1
**Threats Closed:** 25/25
**Threats Open:** 0

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-09-01-T | Tampering | mitigate | CLOSED | `tenant-settings.ts:14` — `.unique()` on `tenantId` column; `0007_v2_tenant_settings.sql:21-22` — `ADD CONSTRAINT tenant_settings_tenant_id_unique UNIQUE ("tenant_id")` |
| T-09-01-I | Information Disclosure | mitigate | CLOSED | `tenant-settings.ts:14` — `notNull().references(() => tenants.id)`; all reads/writes in `settings.ts` use `WHERE tenant_id = ${tenantId}` (lines 75, 119) |
| T-09-01-SC | Tampering | accept | CLOSED | No package installs during phase 9 — confirmed by git log: all 19 phase 9 commits touch zero `package.json` changes |
| T-09-02-XSS | Info Disclosure (XSS) | mitigate | CLOSED | No `dangerouslySetInnerHTML` found in any dashboard or admin component file; `alertBadge` prop is a server-constructed React node, not user input; React JSX auto-escapes all text children (confirmed by global grep) |
| T-09-02-SC | Tampering | accept | CLOSED | Badge and TriangleAlert icons already present from Phase 8; no new packages installed this phase |
| T-09-03-T | Tampering | mitigate | CLOSED | `0007_v2_tenant_settings.sql:26-28` — `INSERT ... ON CONFLICT (tenant_id) DO NOTHING`; UNIQUE constraint on `tenant_id` prevents duplicate rows |
| T-09-03-D | Denial of Service | mitigate | CLOSED | Migration `0007_v2_tenant_settings` is journal-tracked in `meta/_journal.json` (tag `0007_v2_tenant_settings`, timestamp `1779891756000`); Drizzle `migrate()` is idempotent — journal entry prevents re-run |
| T-09-03-FP | Repudiation (false-positive) | mitigate | CLOSED | `09-03-SUMMARY.md` line 69: "0007 journaled. Confirmed migration applied via `tsx src/db/migrate.ts`" on both production and test Neon branches; blocking checkpoint was reached and cleared |
| T-09-03-SC | Tampering | accept | CLOSED | No new packages — phase 9 commits include no `package.json` changes |
| T-09-04-EoP | Elevation of Privilege | mitigate | CLOSED | `settings.ts:109` — `const session = await auth(); if (!session) throw new Error('Unauthorized')` in `updateTenantSettings` before any DB access; same guard in `getTenantSettings` at line 68 |
| T-09-04-T | Tampering | mitigate | CLOSED | `settings.ts:41-44` — `z.number().int().min(1).max(720)` for `auditSlaHours`; `z.number().min(0).max(1)` for `rejectionRateThreshold`; `z.number().int().min(1).max(365)` for `stalledDays`; `settingsSchema.parse(input)` called at line 114 before any DB write |
| T-09-04-ID | Information Disclosure | mitigate | CLOSED | `settings.ts:74` — `WHERE tenant_id = ${tenantId}` is first condition; `analytics.ts:320` — `sql\`s.tenant_id = ${tenantId}\`` first in `baseConditions`; `avgDecisionLatencyHours` aggregated inside same tenant-scoped query at line 345 |
| T-09-04-SQLi | Tampering | mitigate | CLOSED | All user-supplied values in `settings.ts` and `analytics.ts` bound via Drizzle `sql\`\`` template parameters; `sql.raw()` used only for `bucketTrunc` in `getPortfolioTrends` (`analytics.ts:424`) — value is TypeScript-derived (`'week' \| 'month'`), not user input (see lines 394-398) |
| T-09-04-SC | Tampering | accept | CLOSED | zod and drizzle-orm already present from prior phases; no new packages installed |
| T-09-05-IDOR | Information Disclosure | mitigate | CLOSED | OE scorecard `[userId]/page.tsx:97-98` — `if (userResult.rows.length === 0) notFound()`; data exposure prevented by `getOfficeActivityLog` at `analytics.ts:611` — `al.tenant_id = ${tenantId}` as first WHERE condition; `[personId]/page.tsx:79-80` — `if (personRows.length === 0) notFound()` after `getActivePeople()` which is tenant-scoped |
| T-09-05-XSS | Info Disclosure (XSS) | mitigate | CLOSED | No `dangerouslySetInnerHTML` in any file; `ActivityTimeline.tsx` renders all fields via JSX string interpolation (lines 102-103); `[userId]/page.tsx:170-174` — comment explicitly notes React auto-escapes; global grep confirms zero occurrences of `dangerouslySetInnerHTML` in dashboard or admin component files |
| T-09-05-T | Tampering | mitigate | CLOSED | `analytics.ts:1233-1259` — `getWorkerSortFn` maps `sortBy` through explicit `if (sortBy === 'rejected')`, `if (sortBy === 'rejection_rate')`, `if (sortBy === 'value')` with default fallback; `analytics.ts:1262-1288` — `getAuditorSortFn` same pattern; `people/page.tsx:85-91` — `sortBy` passed only to these TypeScript comparators, never interpolated into SQL |
| T-09-05-AC | Access Control | mitigate | CLOSED | `[userId]/page.tsx:75-77` — `const session = await auth(); if (!session) notFound()`; `[personId]/page.tsx` auth guard via `getActivePeople()` which is itself auth-guarded; layout-level auth guard also applies to all `(admin)` routes |
| T-09-05-SC | Tampering | accept | CLOSED | No new packages installed during this phase |
| T-09-06-EoP | Elevation of Privilege | mitigate | CLOSED | `settings/page.tsx:27-28` — `const session = await auth(); if (!session) redirect('/auth/signin')` before any data fetch; `updateTenantSettings` server action also enforces auth at `settings.ts:109` (double guard) |
| T-09-06-T | Tampering | mitigate | CLOSED | Client: `ThresholdSettingsForm.tsx:60-79` — validates `auditSlaHours` int 1–720, `rejectionRatePercent` int 0–100, `stalledDays` int 1–365 on submit before calling server action; conversion `rejectionRatePercent / 100` at line 90; server: `settingsSchema.parse(input)` at `settings.ts:114` |
| T-09-06-ID | Information Disclosure | mitigate | CLOSED | `overview/page.tsx:127-146` — all alert state (`pendingColor`, `rejectionAlertFires`, `stalledColor`) computed as pure TypeScript over `kpis` and `stalledProjects` data already fetched through auth-guarded, tenant-scoped functions; `rejectionAlertFires` at line 139 gated on `isDateFiltered &&` (rejection badge suppressed when no date filter active) |
| T-09-06-XSS | Info Disclosure (XSS) | mitigate | CLOSED | `overview/page.tsx` renders all project names and KPI labels as JSX text nodes with no `dangerouslySetInnerHTML`; `alertBadge` is a server-constructed `<Badge>` element with an icon, not user content; global grep confirms zero occurrences across dashboard files |
| T-09-06-SC | Tampering | accept | CLOSED | lucide-react icons (TriangleAlert, PauseCircle) and shadcn Badge component already present from Phase 8; no new packages installed |

---

## Unregistered Flags

None. All SUMMARY.md `## Threat Flags` / `## Threat Surface Scan` sections across the six phase 9 sub-steps (09-01 through 09-06) report no new attack surface beyond the registered threat model.

---

## Accepted Risks Log

The following threats carry `accept` disposition and are recorded here per security audit protocol.

| Threat ID | Risk | Rationale |
|-----------|------|-----------|
| T-09-01-SC | Supply-chain: no new packages | No new packages installed this phase. Existing zod, drizzle-orm, shadcn/lucide already in dependency tree with prior phase vetting. |
| T-09-02-SC | Supply-chain: Badge/TriangleAlert | Both already installed from Phase 8. No net new supply-chain surface added. |
| T-09-03-SC | Supply-chain: no new packages | Same as T-09-01-SC. |
| T-09-04-SC | Supply-chain: zod/drizzle already present | No new packages. |
| T-09-05-SC | Supply-chain: no new packages | No new packages. |
| T-09-06-SC | Supply-chain: lucide/shadcn already present | No new packages. |

---

## Notes

**T-09-04-SQLi / sql.raw usage:** One `sql.raw()` call exists in `analytics.ts:424` inside `getPortfolioTrends`. It interpolates `bucketTrunc`, which is a TypeScript ternary result constrained to the literal type `'week' | 'month'` (lines 394-398). This value is never derived from user input or HTTP request parameters. `date_trunc()` requires a string literal in Postgres (not a bound parameter), so `sql.raw()` is the correct and unavoidable pattern. No SQL injection surface exists.

**T-09-05-IDOR / OE scorecard:** The `hasTenantActivity` check at `[userId]/page.tsx:112` is computed but intentionally not used as a hard gate — the comment at line 113-115 explains that newly-added OEs with no logged activity yet would be incorrectly blocked. Cross-tenant data protection is enforced downstream by `getOfficeActivityLog`'s `WHERE al.tenant_id = ${tenantId}` condition (`analytics.ts:611`), which means an attacker who guesses a userId from another tenant receives only an empty activity log, not data from that tenant. This design is documented in code and is consistent with the single-tenant MVP constraint.
