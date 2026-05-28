---
phase: 11
plan: 05
subsystem: exports
tags: [hub-ui, server-component, d-108, d-111, d-114, ui-spec-surface-1, exp-01, exp-02, exp-03, exp-04]
requires:
  - "Plan 11-01b complete (getAllFinishedPeriods + PeriodPickerRow in src/actions/analytics.ts; dashboard.admin.exports.* i18n keys; D-111 bilingual joined labels)"
  - "Plan 11-02 complete (GET /api/exports/submissions — EXP-01)"
  - "Plan 11-03 complete (GET /api/exports/performance — EXP-03)"
  - "Plan 11-04 complete (GET /api/exports/hakedis/[periodId] + /pdf — EXP-02 + EXP-04)"
provides:
  - "src/app/dashboard/(admin)/exports/page.tsx — full hub page replacing the Phase 8 stub (286 LOC)"
  - "D-108 hub side delivered: office engineer reaches all 4 exports from one page with active filter context forwarded"
  - "VALIDATION.md Manual-Only Verifications row 1 SATISFIED (TR/EN parity, both top downloads, PDF Turkish glyphs)"
affects:
  - "Plan 11-06 (PeriodDetailControls extension — primary post-finalize trigger surface for the same endpoints)"
tech-stack:
  added: []
  patterns:
    - "D-108 hub UX: three trigger cards on one page; all hrefs are simple <a download> to existing route handlers — ZERO duplication of generation logic"
    - "D-114 page-level: `const session = await auth();` is the FIRST statement; `redirect('/auth/signin')` on null (page-level pattern, not 401 — pages render HTML)"
    - "v2.0 financial lock: `export const dynamic = 'force-dynamic'` — financial data never cached"
    - "FilterBar wrapped in <Suspense fallback={...}> per UI-SPEC Implementation Constraint 3 (useSearchParams CSR bailout for Next.js 15)"
    - "URLSearchParams forwards active from/to/project searchParams to the two top trigger cards; period picker URLs don't need forwarding (periodId is in path)"
    - "Parallel data fetch via Promise.all([getProjects(), getAllFinishedPeriods()]) — both tenant-scoped server-side"
    - "All visible labels routed through `t('dashboard.admin.exports.*')` from Plan 11-01b namespace (D-111 bilingual joined labels render byte-identical in TR + EN)"
key-files:
  created:
    - .planning/phases/11-exports/11-05-SUMMARY.md
  modified:
    - "src/app/dashboard/(admin)/exports/page.tsx (Phase 8 stub: 22 LOC → hub page: 286 LOC)"
decisions:
  - "getAllFinishedPeriods imported from @/actions/analytics (canonical placement per Plan 11-01b decision — not @/actions/hakedis)"
  - "Server component — no `'use client'`; auth() page-level redirect on null mirrors src/app/dashboard/(admin)/hakedis/page.tsx pattern exactly"
  - "FilterBar receives personOptions={[]} — Exports hub UI-SPEC does not surface a person filter (date-range + project only); FilterBar handles empty array"
  - "Active filter chip text composed server-side from sp.from/sp.to/sp.project + projects[].name lookup; no client component needed"
  - "Period picker empty state renders FileX icon + i18n copy + Link to /dashboard/hakedis (matches UI-SPEC Copywriting Contract)"
  - "Excel + PDF buttons inside the picker table use plain <a href download> wrapping shadcn Button variant='outline' — same pattern as the two top cards for visual consistency"
  - "Task 2 (Visual + TR/EN UAT) APPROVED by user: hub renders in both locales, both top-button Excel downloads work, FilterBar threading works, PDF Turkish glyphs (ğ ş ı ö ü ç) render correctly"
metrics:
  duration_seconds: 1500
  duration_minutes: 25
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  hub_page_loc: 286
  stub_loc_removed: 22
  trigger_sections: 3
  i18n_keys_referenced: 13
  completed: 2026-05-28
---

# Phase 11 Plan 05: Exports Hub Page Summary

Replaced the Phase 8 coming-soon stub at `/dashboard/exports` with the full Exports
Hub page per UI-SPEC Surface 1. The hub hosts three trigger sections — the
Submission Ledger card (EXP-01), the Performance Summary card (EXP-03), and the
Hakkediş Files period picker table (EXP-02 + EXP-04) — and threads the global
FilterBar's `from`/`to`/`project` searchParams into the two top download anchors
via `URLSearchParams`. The page adds NO new generation logic: every download is
a simple `<a href="…" download>` linking to the four route handlers shipped in
Plans 11-02 / 11-03 / 11-04. D-108 (distributed + hub UX) is delivered on the
hub side; Plan 11-06 will extend `PeriodDetailControls` with the per-period
trigger surface.

The page is a server component with `auth()` as the first statement (D-114
page-level pattern), `export const dynamic = 'force-dynamic'` (v2.0 financial
lock), and parallel data fetch via `Promise.all([getProjects(),
getAllFinishedPeriods()])` — both tenant-scoped server-side. The FilterBar is
wrapped in `<Suspense>` per UI-SPEC Implementation Constraint 3 to satisfy the
Next.js 15 useSearchParams CSR bailout. All visible labels route through
`t('dashboard.admin.exports.*')` from the Plan 11-01b namespace, including
D-111 bilingual joined labels (e.g. `Excel İndir / Download Excel`) which
render byte-identical across `messages/tr.json` and `messages/en.json`.

## Tasks Completed

### Task 1 — Replace Phase 8 stub with hub UI (commit `ccae05c`)

Fully replaced `src/app/dashboard/(admin)/exports/page.tsx`. The 22-line stub
that displayed `dashboard.admin.stubs.exports_*` translation keys was removed
in favour of a 286-line server component implementing UI-SPEC Surface 1:

- **Auth + force-dynamic:** `const session = await auth(); if (!session) redirect('/auth/signin');`
  is the first statement after the function signature; `export const dynamic = 'force-dynamic'`
  prevents financial-data caching (v2.0 lock).
- **Data fetch:** `Promise.all([getProjects(), getAllFinishedPeriods()])` — `getAllFinishedPeriods`
  resolves from `@/actions/analytics` (canonical placement per Plan 11-01b decision); both
  queries are tenant-scoped via `getDefaultTenantId()` server-side.
- **FilterBar:** wrapped in `<Suspense fallback={<div className="h-9 w-full animate-pulse rounded-md bg-muted" />}>`
  with `personOptions={[]}` (hub UI does not surface a person filter — date-range + project only).
- **Active filter chip:** composed server-side from `sp.from`/`sp.to`/`sp.project` plus a
  `projects.find(...)` lookup for the project name; rendered as muted-foreground text inside
  each top-card.
- **Submission Ledger card:** shadcn Card + FileSpreadsheet icon + `t('section_ledger')` title +
  chip + `<a href="/api/exports/submissions{?qs}" download>` wrapping `<Button variant="default"
  size="sm">` with the joined-bilingual `t('download_excel')` label.
- **Performance Summary card:** identical structure, pointing at `/api/exports/performance`.
- **Hakkediş Files card:** shadcn Table with columns Dönem / Bitiş Tarihi / Para Birimi / Durum
  (with `<HakedisStatusBadge>`) / Net Ödeme (`formatMoneyAmount`) / İndir. Each row offers an
  Excel + PDF `<Button variant="outline" size="sm">` wrapped in `<a download>` linking to
  `/api/exports/hakedis/{periodId}` and `/api/exports/hakedis/{periodId}/pdf` respectively.
- **Empty state:** when `periods.length === 0`, the picker renders a `FileX` icon + i18n
  heading + body + `<Link href="/dashboard/hakedis">` CTA per UI-SPEC Copywriting Contract.

Verification gates passed at commit time:
- `force-dynamic` present (count: 1).
- No `dashboard.admin.stubs` references (count: 0).
- `redirect('/auth/signin')` present (count: 1).
- Both top-card hrefs present (`/api/exports/submissions`, `/api/exports/performance`).
- Picker hrefs ≥ 2 (`/api/exports/hakedis/` Excel + PDF).
- `getAllFinishedPeriods` imported and used (count: 1).
- `<Suspense fallback=` wraps `<FilterBar />`.
- All visible strings routed through `t('...')`; no hardcoded TR/EN literals in JSX.
- `tsc --noEmit` clean for this file; `next build` clean for this route.

### Task 2 — Visual + TR/EN UAT (HUMAN-VERIFY checkpoint — APPROVED)

User exercised the page end-to-end in the browser per the checkpoint protocol:

| Verification gate | Result |
|-------------------|--------|
| Hub renders without errors in TR locale | PASS |
| Heading + subtitle + FilterBar + 3 trigger cards visible | PASS |
| Locale toggle → EN; every label switches; D-111 joined-bilingual buttons unchanged | PASS |
| Submission Ledger card top button downloads `.xlsx` | PASS |
| Performance Summary card top button downloads `.xlsx` | PASS |
| FilterBar threading (date range + project) forwards to download URLs and updates the chip | PASS |
| Hakkediş Files Excel button downloads three-sheet `.xlsx` (when finalized period exists) | PASS |
| Hakkediş Files PDF button downloads `.pdf` with Turkish glyphs rendering correctly (ğ ş ı ö ü ç) | PASS |

User resume signal: `approved`.

VALIDATION.md Manual-Only Verifications row 1 ("Exports hub page renders the 3
trigger sections + period picker in both TR and EN locales") is now SATISFIED.

## Files Created/Modified

**Modified:**
- `src/app/dashboard/(admin)/exports/page.tsx` — 22 LOC stub → 286 LOC hub page (full replacement)

**Created:**
- `.planning/phases/11-exports/11-05-SUMMARY.md` (this file)

## Deviations from Plan

None — plan executed exactly as written. Task 1 landed in a single commit
matching all acceptance criteria; Task 2 was a human-verify checkpoint and
returned `approved` on first round (no UAT bugs surfaced, no Rule 1–3 fixes
required during the UAT pass).

The Task 1 commit message records the implementation deltas verbatim against
the plan's `<action>` block — getAllFinishedPeriods sourced from
`@/actions/analytics` matches the Plan 11-01b decision recorded in STATE.md.

## Known Stubs

None. Every UI affordance on the page is wired to a real route handler shipped
in Plans 11-02 / 11-03 / 11-04. The empty-state CTA links to `/dashboard/hakedis`
which is the canonical period-management page (Plan 10).

## Threat Flags

None — the threat surface is exactly as enumerated in the plan's
`<threat_model>`. All mitigations are in place:

- **T-11-05-AUTH** (Spoofing): `auth()` first statement; `redirect` on null.
- **T-11-05-IDOR** (Info Disclosure): `getAllFinishedPeriods` tenant-scoped in `@/actions/analytics`.
- **T-11-05-DRAFT** (Tampering): `status != 'draft'` enforced server-side in `getAllFinishedPeriods`.
- **T-11-05-XSS** (Tampering): JSX auto-escapes; no `dangerouslySetInnerHTML`.
- **T-11-05-OPEN-REDIRECT** (Tampering): hrefs hardcoded `/api/exports/...` patterns + server-fetched UUID.
- **T-11-05-FILTER-INJ** (Tampering): `URLSearchParams` escapes payloads; receiving handlers re-validate (Plans 11-02 + 11-03).

## Notes for Plan 11-06

Plan 11-06 (PeriodDetailControls extension) is the second half of D-108. The
hub page's Hakkediş Files picker is the secondary trigger surface; Plan 11-06
adds the primary trigger inside `/dashboard/hakedis/[periodId]` so the office
engineer can download the Excel + PDF immediately after finalize without
navigating back to `/dashboard/exports`. The picker rows on the hub will then
serve mainly as "browse / re-download" history — both surfaces hit the same
two route handlers (`/api/exports/hakedis/[periodId]` + `/pdf`).

## Self-Check: PASSED

- `src/app/dashboard/(admin)/exports/page.tsx` — FOUND (286 lines, last modified by commit `ccae05c`)
- Task 1 commit `ccae05c` — FOUND in `git log --oneline -10`
- `.planning/phases/11-exports/11-05-SUMMARY.md` — written by this self-check step
