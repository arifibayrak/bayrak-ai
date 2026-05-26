---
phase: 8
slug: admin-shell-information-architecture
status: secured
threats_open: 0
threats_closed: 18
asvs_level: 1
created: 2026-05-27
---

# Phase 8 — Security

**Phase:** 08 — admin-shell-information-architecture
**Audited:** 2026-05-27
**ASVS Level:** 1
**Auditor:** gsd-security-auditor (Claude Sonnet 4.6)
**Status:** SECURED — all threats closed (18/18)

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-08-SC | Tampering | mitigate | CLOSED | `package.json:36` — recharts listed as normal npm dependency (`"recharts": "^3.8.0"`). `components.json` — `"registries": {}` (empty object, no third-party registry configured). Official shadcn registry only. |
| T-08-01 | Tampering | accept | CLOSED | `messages/en.json` and `messages/tr.json` — static JSON key/value strings only; no executable content, no `eval`, no `Function(`. React JSX auto-escapes all rendered values. CR-01 fix confirmed present: `src/i18n/request.ts:4-8` — `SUPPORTED_LOCALES = ['tr', 'en']` allowlist and `isSupportedLocale()` type guard gate the cookie value before use in dynamic `import()`. Path-traversal vector closed. |
| T-08-02-IV | Tampering | mitigate | CLOSED | `src/actions/analytics.ts` — all entry points (`getCanonicalSubmissions`, `getPortfolioKPIs`, `getPortfolioTrends`, `getProjectMetrics`, `getPersonMetrics`, `getPortfolioPeople`, `getAuditorDecisions`) build WHERE clauses exclusively from Drizzle `sql` template literals with `${value}` bound parameters. Arrays via `= ANY(${array})` (line 192, 1028, 1036). LIMIT/OFFSET as bound params (lines 257–258, 1194). No string concatenation into SQL anywhere in the file. |
| T-08-02-ID | Information Disclosure | mitigate | CLOSED | Every exported analytics function begins with `await auth()` → `throw new Error('Unauthorized')` if no session (lines 182–184, 307–309, 374–376, 457–459, 663–667, 982–984, 1148–1150). `WHERE tenant_id = ${tenantId}` is the first or only base condition in every query (confirmed at lines 189, 312, 386, 488–489, 693–694, 1013, 1153). |
| T-08-02-AV | Tampering | mitigate | CLOSED | `src/actions/analytics.ts` — latency average always uses `FILTER (WHERE s.decided_at IS NOT NULL)` preventing NULL from poisoning AVG. Present at: `getProjectMetrics` line 481, `getPersonMetrics` line 748, `getPortfolioPeople` auditor branch lines 1077. Pending count kept in a separate query in every case (split-query pattern, lines 757–768, 1099–1104). |
| T-08-02-MONEY | Tampering | mitigate | CLOSED | `src/actions/analytics.ts` — all money aggregations use `SUM(s.quantity::numeric * b.unit_price::numeric)` in Postgres (lines 417, 498–501, 516, 704–706, 835–836, 1026–1028). Every money result is `GROUP BY currency_code`; returned as `Record<string, string>` per-currency maps. No cross-currency summation exists anywhere in the file. |
| T-08-03-AC | Elevation of Privilege | mitigate | CLOSED | `src/app/dashboard/layout.tsx:19-20` — `const session = await auth(); if (!session) redirect('/auth/signin');` executes on the server before `<SidebarProvider>` or any client tree renders. Guard is unconditional and covers all `/dashboard/*` routes. |
| T-08-03-NAV | Information Disclosure | accept | CLOSED (accepted) | Sidebar navigation links are static internal routes only. Each target page inherits the auth guard from `dashboard/layout.tsx`. No information is disclosed by the nav link list itself — all routes require a valid session to return data. Accepted risk: no additional per-link auth required at ASVS Level 1. |
| T-08-04-DATE | Tampering | mitigate | CLOSED | `src/app/dashboard/(admin)/overview/page.tsx:43-46` — `from && !isNaN(Date.parse(from)) ? new Date(from) : undefined`. Invalid strings produce `undefined`; only validated `Date` objects reach analytics functions. |
| T-08-04-ID | Information Disclosure | mitigate | CLOSED | `src/app/dashboard/(admin)/overview/page.tsx:51-52` — project and person IDs passed as `projectIds: project ? [project] : undefined` and `personId: person || undefined` into analytics functions where they become Drizzle bound params. Tenant scope enforced inside analytics (T-08-02-ID). |
| T-08-04-MONEY | Tampering | mitigate | CLOSED | `src/app/dashboard/(admin)/overview/EVTableClient.tsx:37-41` — `formatMoney(value)` uses `parseFloat(value)` on the DB string then `Intl.NumberFormat` for display. `computeCompletePct` uses `parseFloat` on both operands. No `Decimal` library import needed for display-only formatting (no multiplication loop). Currency selector picks a single currency key from the map — no cross-currency summing. |
| T-08-05-IV | Tampering | mitigate | CLOSED | `src/app/dashboard/(admin)/people/[personId]/page.tsx:50-51` — date strings validated with `!isNaN(Date.parse(from))` before `new Date()`. `personId` from `params` passed as bound param through `getPersonMetrics` / `getCanonicalSubmissions` / `getAuditorDecisions`. `src/app/dashboard/(admin)/people/page.tsx:47-48` — same `isNaN` guard on date strings. |
| T-08-05-ID | Information Disclosure | mitigate | CLOSED | `src/actions/analytics.ts` — `getPortfolioPeople` (lines 967–1122) JOINs `people` → `assignments` filtering `role_on_project = 'worker'` or `'auditor'`. The `people` table contains only approved field persons; `pending_people` is a separate table and is never joined here (line 1001 comment confirms: "pending_people are in a separate table; people join excludes them automatically"). Office engineers exist in the `users` table (Auth.js), not `people`, so they cannot appear. All queries are tenant-scoped. |
| T-08-05-XSS | Tampering | mitigate | CLOSED | `src/components/admin/ActivityTimeline.tsx` — all user data (material, quantity, unit, workerName, dateStr, latencyLabel) rendered as JSX text children (lines 103, 114, 120, 123, 125). No `dangerouslySetInnerHTML` found anywhere in the file (grep confirmed 0 matches). React JSX auto-escapes all string interpolation. |
| T-08-06-IV | Tampering | mitigate | CLOSED | `src/app/dashboard/records/page.tsx:91-99` — `isNaN(Date.parse(...))` for dates, `parseStatus()` whitelist Set for status enum, `Math.max(1, parseInt(page, 10) \|\| 1)` for page number. `src/app/dashboard/records/[id]/page.tsx:42` — submission ID passed as `{ submissionId: id }` into `getCanonicalSubmissions` where it is a Drizzle bound param (analytics.ts line 209: `sql\`s.id = ${filters.submissionId}\``). |
| T-08-06-XSS | Tampering | mitigate | CLOSED | `src/components/admin/SubmissionDetailView.tsx:229` — `{submission.rejectionReason}` rendered as JSX text child inside `<AlertDescription>`. No `dangerouslySetInnerHTML` anywhere in the file (grep confirmed 0 matches). React auto-escapes all text. Notes field rendered identically. |
| T-08-06-SSRF | Elevation of Privilege | mitigate | CLOSED | `next.config.ts:13-19` — `images.remotePatterns` contains exactly one entry: `protocol: 'https', hostname: '*.public.blob.vercel-storage.com', pathname: '/**'`. No wildcard hostname. All photos rendered via `next/image` in `SubmissionDetailView.tsx` (lines 109–116, 127–133) and `KayitlarTabClient.tsx`. |
| T-08-06-TN | Tampering | mitigate | CLOSED (closed-by-absence) | `src/components/admin/SubmissionDetailView.tsx` — no Google Maps `<a>` tag is rendered. `CanonicalSubmission` carries no raw lat/lon (only `locationDistanceM` and `locationMatch`); the Maps link is deliberately absent. No external link in this component means no tab-napping surface exists. The `rel="noopener noreferrer"` attribute IS present in `KayitlarTabClient.tsx:253` for its own Maps link. The SUMMARY.md deviation note (08-06-SUMMARY.md line 122) explicitly documents the accepted deviation and the future implementation pattern. Threat is N/A by absence as declared in the threat register. |

---

## Accepted Risks Log

| Risk ID | Threat | Rationale |
|---------|--------|-----------|
| AR-08-01 | T-08-01 (message JSON tampering) | Message files are static JSON checked into the repository. JSX auto-escaping prevents any XSS even if content were modified. Path-traversal mitigation (CR-01 / SUPPORTED_LOCALES allowlist) is now in place, closing the active attack vector. Residual risk: repository write access could introduce content; accepted for single-tenant MVP. |
| AR-08-03-NAV | T-08-03-NAV (sidebar nav links) | Static internal routes. Auth guard on `dashboard/layout.tsx` covers all linked pages server-side. Sidebar visibility does not bypass data-layer authorization. Accepted at ASVS Level 1. |

---

## Unregistered Threat Flags

The following threat flags appeared in SUMMARY.md files during implementation with no corresponding threat ID in the register. These are informational only (not blockers at `block_on: high`):

| Flag Source | Description | Assessment |
|-------------|-------------|------------|
| 08-06-SUMMARY.md | Maps link deferred — `CanonicalSubmission` has no raw lat/lon; Google Maps link not wired | Maps to T-08-06-TN (closed-by-absence). Not a new surface — deviation documented, no external link rendered. |
| 08-01-SUMMARY.md | recharts installed as peer dep via shadcn chart CLI | Maps to T-08-SC (CLOSED). Human gate checkpoint recorded in task log before install. |

No unregistered flags remain without a threat mapping.

---

## Summary

- **Threats registered:** 18
- **Threats closed:** 18
- **Threats open:** 0
- **Accepted risks logged:** 2 (T-08-01, T-08-03-NAV — both are `accept` disposition in the register)
- **Blockers:** 0

The CR-01 path-traversal fix (`SUPPORTED_LOCALES` allowlist in `src/i18n/request.ts`) is confirmed present and is the most security-significant change in this phase. All other mitigations (Drizzle parameterized SQL, tenant scoping, auth guard ordering, FILTER-based NULL isolation, currency grouping, next/image SSRF guard, JSX XSS escaping, page/date/status input validation) are verified in the implementation files.
