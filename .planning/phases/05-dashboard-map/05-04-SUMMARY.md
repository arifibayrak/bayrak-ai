---
phase: 05-dashboard-map
plan: "04"
subsystem: dashboard-submissions-tab
tags: [server-component, shadcn-table, next-intl, next-image, dialog, url-state, pagination, filter, lightbox, google-maps]
dependency_graph:
  requires: [05-01, 05-02]
  provides: [KayitlarTab, KayitlarTabClient]
  affects: [05-06-page-wiring]
tech_stack:
  added: []
  patterns:
    - Thin Server Component delegates to 'use client' (BoqTab analog)
    - URL-state filter + pagination via useRouter().push (no local-only state)
    - pre-validation whitelist in Server Component prevents getSubmissions throw on invalid ?status=
    - next/image 48x48 thumbnail + Dialog 800x600 lightbox (objectFit contain)
    - Status badge variants — approved=bg-emerald-100/text-emerald-800, rejected=destructive, pending=secondary
    - overflow-x-auto table wrapper for mobile horizontal scroll
    - Notlar truncated at 60 chars with full text in title attribute
    - Google Maps external link with rel=noopener noreferrer (T-05-TN)
key_files:
  created:
    - src/components/dashboard/KayitlarTab.tsx
    - src/components/dashboard/KayitlarTabClient.tsx
  modified: []
decisions:
  - "Status whitelist pre-validated in KayitlarTab (before calling getSubmissions) so invalid ?status= falls back to 'all' without throwing — getSubmissions would throw on unknown status (T-05-IV)"
  - "Filter chip navigation resets page to 1 on every filter change — prevents empty page N when switching to a narrower filter"
  - "tc (common translations) namespace omitted — all strings in dashboard.submissions namespace suffice; adding unused imports was avoided (Rule 1 auto-fix on ESLint warning)"
  - "KayitlarTab searchParams contract: { status?: string; page?: string } — Plan 06 reads these from Next.js searchParams and passes down"
  - "Status value mapping for URL: 'all' (default) / 'pending_audit' / 'approved' / 'rejected' — filter chips map 1:1 to these strings"
metrics:
  duration: "20 minutes"
  completed: "2026-05-25"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
requirements: [DASH-03]
---

# Phase 5 Plan 04: Kayıtlar Tab — Submissions Table Summary

Kayıtlar tab: Server Component reads ?status+?page, fetches paginated submissions, delegates to client table with filter chips, status badges, photo lightbox, Google Maps location links, and distinct empty states — fully i18n-driven, URL-state-persistent.

## What Was Built

### src/components/dashboard/KayitlarTab.tsx (new — 43 lines)

Thin Server Component (no `'use client'`). Props: `{ projectId: string; searchParams: { status?: string; page?: string } }`.

Pre-validates `searchParams.status` against the whitelist `['all', 'pending_audit', 'approved', 'rejected']` before calling `getSubmissions`. Invalid values fall back to `'all'` so the page never crashes from an invalid URL parameter (T-05-IV).

`searchParams.page` is coerced via `parseInt + Math.max(1, ...)` guard before the fetch.

Passes `projectId`, `initialData`, `initialStatus` to `<KayitlarTabClient>`.

**KayitlarTab searchParams contract (for Plan 06):**

```
searchParams.status — one of: 'all' | 'pending_audit' | 'approved' | 'rejected'
searchParams.page   — positive integer string (e.g. "1", "2")
```

Plan 06 must read both from Next.js `searchParams` and pass them into `<KayitlarTab projectId={id} searchParams={{ status, page }} />`.

### src/components/dashboard/KayitlarTabClient.tsx (new — 351 lines)

`'use client'` component using `useTranslations('dashboard.submissions')` and `useRouter()` for URL navigation.

**Filter chips:** Tümü / Bekliyor / Onaylandı / Reddedildi rendered as outline Buttons with `min-h-[44px]` tap targets (D-60). Active chip gets `border-primary text-primary`. Clicking navigates to `?tab=kayitlar&status={value}&page=1` (resets page on filter change, D-54/D-55). Chips use `flex-wrap` for mobile (D-60).

**Table — 7 LOCKED columns (D-53):**
1. Fotoğraf — `next/image` 48×48 `object-cover` thumbnail, click opens lightbox (D-61)
2. BOQ Kalemi — `row.boqMaterial`
3. Miktar — `Intl.NumberFormat('tr-TR')` + unit, `text-right tabular-nums`
4. Durum — status badge: `approved`=`bg-emerald-100 text-emerald-800`, `rejected`=destructive, `pending_audit`=secondary
5. Tarih — `decidedAt ?? submittedAt` via `toLocaleDateString('tr-TR')`
6. Konum — `maps.google.com/?q=lat,lon` with ExternalLink icon and `rel="noopener noreferrer"` when lat/lon present; `—` otherwise (T-05-TN)
7. Notlar — truncated at 60 chars; full text in `title` attribute

Table wrapped in `overflow-x-auto` div for horizontal mobile scroll (D-60).

**Pagination:** prev/next Buttons disabled at bounds; `t('pagination', { page, pages })` label (D-54). Navigation uses `router.push` with updated `?page=`.

**Empty states (D-57):**
- `empty_all` — when `initialData.total === 0 && initialStatus === 'all'`
- `empty_filtered` — when `rows.length === 0 && initialStatus !== 'all'`

Both empty states still render filter chips above so the user can clear the filter.

**Photo lightbox (D-61):** shadcn `Dialog` with `max-w-3xl`, inner `next/image` `width=800 height=600 style={{ objectFit: 'contain' }}`. Controlled by `lightboxUrl` state. Dialog `onOpenChange` clears state on close.

**i18n (D-63):** every user-facing string via `t()` from `dashboard.submissions` namespace. No hardcoded copy.

## Status Value → Enum Mapping (for Plan 06)

| URL ?status= value | Passed to getSubmissions | Displayed as |
|---|---|---|
| `all` (default) | omitted (no filter) | Tümü / All |
| `pending_audit` | `status: 'pending_audit'` | Bekliyor / Pending |
| `approved` | `status: 'approved'` | Onaylandı / Approved |
| `rejected` | `status: 'rejected'` | Reddedildi / Rejected |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `tc` import (ESLint @typescript-eslint/no-unused-vars)**
- **Found during:** Task 2 ESLint check
- **Issue:** Plan called for dual namespace `useTranslations('common')` as `tc`, but the component only uses `dashboard.submissions` keys; `tc` was declared but never used, producing ESLint warning
- **Fix:** Removed the `tc` declaration; all strings are served from `dashboard.submissions` namespace which already contains prev/next/pagination keys
- **Files modified:** src/components/dashboard/KayitlarTabClient.tsx
- **Commit:** cf57398 (included in Task 2 commit — caught before commit)

## Threat Coverage

| Threat ID | Status |
|-----------|--------|
| T-05-IV | Mitigated — status whitelist pre-validated in KayitlarTab.tsx before calling getSubmissions; page coerced to positive int |
| T-05-XSS | Mitigated — photos rendered via next/image only (validated against remotePatterns from 05-01) |
| T-05-TN | Mitigated — Google Maps <a> has rel="noopener noreferrer" target="_blank" |
| T-05-AC | Accepted — auth+tenant scoping is server-side in getSubmissions (Plan 02) |

## Known Stubs

None. The component renders real data from `getSubmissions`. Photo lightbox, filter chips, pagination, and location links are all wired. Page wiring (tab trigger + searchParams plumbing) happens in Plan 06 — KayitlarTab/KayitlarTabClient are complete and ready to wire.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced by this plan.

## Self-Check

### Check created files exist
- src/components/dashboard/KayitlarTab.tsx: FOUND
- src/components/dashboard/KayitlarTabClient.tsx: FOUND

### Check commits exist
- f7d2a3b (Task 1 — KayitlarTab Server Component): FOUND
- cf57398 (Task 2 — KayitlarTabClient): FOUND

## Self-Check: PASSED
