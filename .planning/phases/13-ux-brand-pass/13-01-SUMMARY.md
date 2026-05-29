---
phase: 13
plan: 01
subsystem: brand-spine
tags: [tokens, fonts, primitives, sidebar, icon, og-image, not-found, error, i18n, brand-md]
requires:
  - "Tailwind v4 @theme + :root token slots in globals.css set to industrial blue"
  - "Inter font in src/app/layout.tsx"
  - "src/components/brand/ does not exist"
  - "no app/icon.tsx, app/opengraph-image.tsx, app/not-found.tsx, app/error.tsx"
  - "no BRAND.md at repo root"
provides:
  - ":root token slots override industrial-blue → slate + amber (D-121)"
  - "geist@1.7.1 installed (--save-exact); GeistSans + GeistMono wired in src/app/layout.tsx (D-122)"
  - "7 brand primitives in src/components/brand/ — BrandButton, BrandCard, BrandHeading, BrandBadge, BrandEmpty, BrandLogo, BrandTable (D-127 W1 + BRAND-03)"
  - "src/components/brand/index.ts barrel"
  - "src/components/brand/BrandButton.test.tsx + BrandLogo.test.tsx (Phase 12 node-env pure-function pattern)"
  - "AppSidebar consumes <BrandLogo size='md' /> (D-124 — wordmark visible across every admin route)"
  - "BRAND.md at repo root (BRAND-01 satisfied at repo root in addition to 13-CONTEXT.md)"
  - "src/app/icon.tsx — dynamic ImageResponse favicon (OQ1 RESOLVED)"
  - "src/app/opengraph-image.tsx — dynamic ImageResponse OG card"
  - "src/app/not-found.tsx — branded 404 (BrandEmpty + FileQuestion + BrandButton back-link)"
  - "src/app/error.tsx — single root error boundary (OQ3 RESOLVED)"
  - "messages/{en,tr}.json — nested meta.not_found.{title,description,cta} + meta.error.{title,description,cta_retry}"
affects:
  - Plan 13-02 (consumes BrandCard / BrandButton / BrandTable / BrandBadge for hakkediş + exports re-skin)
  - Plan 13-03a (consumes brand primitives for overview + analytics + KpiCard refactor)
  - Plan 13-03b (consumes brand primitives for people + records + settings)
  - Plan 13-04 (consumes brand primitives for projects + auth; end-of-phase UAT)
key_files:
  created:
    - src/components/brand/BrandButton.tsx
    - src/components/brand/BrandCard.tsx
    - src/components/brand/BrandHeading.tsx
    - src/components/brand/BrandBadge.tsx
    - src/components/brand/BrandEmpty.tsx
    - src/components/brand/BrandLogo.tsx
    - src/components/brand/BrandTable.tsx
    - src/components/brand/index.ts
    - src/components/brand/BrandButton.test.tsx
    - src/components/brand/BrandLogo.test.tsx
    - src/app/icon.tsx
    - src/app/opengraph-image.tsx
    - src/app/not-found.tsx
    - src/app/error.tsx
    - BRAND.md
  modified:
    - src/app/globals.css
    - src/app/layout.tsx
    - src/components/admin/AppSidebar.tsx
    - messages/en.json
    - messages/tr.json
    - package.json
    - package-lock.json
    - vitest.config.ts
---

# Phase 13 Plan 01: Brand Spine — SUMMARY

**Completed:** 2026-05-29
**Status:** Complete — Wave 1 UAT approved by user (all 10 visual + behavioral checks passed)

## What shipped

Wave 1 is the highest-leverage wave because of the **token-override strategy** locked by RESEARCH §Item 1 Approach A: overriding shadcn semantic slot values in `:root {}` (Tailwind v4 `@theme`) propagates the new slate + amber palette to **every Phase 1–12 surface without per-component edits.** Confirmed live during UAT — primary buttons turned amber across hakkediş, exports, analytics, people, projects without any of those surfaces being individually touched yet.

### Token swap (Task 2 — `39f02ed`)
- `src/app/globals.css` `:root {}` values flipped: industrial-blue oklch values → slate + amber
- `--primary` now amber-500 (`oklch(0.785 0.18 80)`)
- `--background` / `--card` surfaces shift to slate-50 / white
- `--border` / `--input` to slate-200
- `--destructive` remains red (reserved semantic, D-121)
- `--radius` pinned to 0.375rem (`rounded-md` per D-125; was 0.625rem)
- `geist@1.7.1` installed pinned with `--save-exact`; `GeistSans` + `GeistMono` wired via `geist/font/sans` and `geist/font/mono` in `src/app/layout.tsx`
- Old Inter import removed

### Brand primitives package (Task 3a — `6953b31`)
- 7 primitives in `src/components/brand/`:
  - `BrandButton` (cva — primary / secondary / destructive / outline; size sm/md/lg)
  - `BrandCard` (composes shadcn Card; `border-slate-200`, no shadow per D-125)
  - `BrandHeading` (levels 1–4; Geist Sans 600/700 weights)
  - `BrandBadge` (cva — info / success / warning / danger; amber for info, red for danger)
  - `BrandEmpty` (icon + title + description + optional CTA; used by `not-found.tsx`)
  - `BrandLogo` (`bayrak` slate-900 + `.ai` amber-500, Geist Sans 600, sizes sm/md/lg per D-124)
  - `BrandTable` (thin wrapper — OQ2 RESOLVED as thin per CONTEXT D-127)
- `src/components/brand/index.ts` barrel re-export
- 2 unit tests using Phase 12 **node-env pure-function** pattern (no jsdom, no `@testing-library/react`): `BrandButton.test.tsx` (variant + size cva combinations), `BrandLogo.test.tsx` (slate `bayrak` + amber `.ai` text + size variants)
- `vitest.config.ts` `include` pattern extended to pick up `.test.tsx` files alongside existing `.test.ts`

### Consumer rollout (Task 3b — `512cc52`)
- `src/components/admin/AppSidebar.tsx` now renders `<BrandLogo size="md" />` (replaces text-only sidebar header)
- `BRAND.md` at repo root — mirrors D-121..D-128 brand reference (satisfies BRAND-01 at repo root in addition to 13-CONTEXT.md)
- `src/app/icon.tsx` — dynamic ImageResponse favicon (OQ1 RESOLVED dynamic per RESEARCH recommendation)
- `src/app/opengraph-image.tsx` — dynamic ImageResponse OG card with wordmark + bilingual tagline
- `src/app/not-found.tsx` — branded 404 using `BrandEmpty` + `FileQuestion` icon + `BrandButton variant="outline"` back-link
- `src/app/error.tsx` — single root error boundary (OQ3 RESOLVED single per RESEARCH recommendation; per-surface error boundaries deferred to future phases)
- `messages/en.json` + `messages/tr.json` — nested keys `meta.not_found.{title,description,cta}` + `meta.error.{title,description,cta_retry}` — verified via `node -e` nested-key assertion (Plan acceptance), not weak grep

### Verification sweep (Task 4 — `ccf6653`)
- `npx tsc --noEmit` exit 0
- `npx next build` exit 0 — manifests include `/icon`, `/opengraph-image`, `/_not-found`
- 2 brand primitive unit tests: 7/7 assertions pass
- Phase 11 PDF generator preserved: `grep -c "DejaVu" src/lib/pdf/fonts.ts` = 7
- Phase 12 frozen contracts preserved:
  - `LivePeriodPoller` null-on-disabled: `grep -c "if (!enabled) return null" src/components/admin/LivePeriodPoller.tsx` = 1
  - `LivePeriodPoller` sr-only span: present
  - `LineSubmissionsPanel` colSpan math: `colSpan={8}` (empty) + `colSpan={7}` (footer) preserved
  - `PeriodDetailControls` draft gate: `status !== 'draft'` preserved

### Wave 1 UAT (Task 5 — approved by user)
All 10 UAT checks passed:
- Sidebar wordmark visible — `bayrak` slate-900 + `.ai` amber-500 in Geist Sans 600
- Primary buttons amber across all Phase 1–12 surfaces (token-cascade win confirmed)
- Cards: border-slate-200 + no shadow
- Radius: `rounded-md` (smaller than before)
- `/dashboard/nope-not-real` → branded 404 renders correctly
- DevTools fonts panel: Geist loads, Inter does NOT
- `/icon` and `/opengraph-image` URLs resolve 200
- TR ↔ EN sidebar nav labels still localize
- `/dashboard/hakedis` finalized period detail still renders correctly (8-column line table, deduction summary, Net Ödeme) — pixels changed (amber), behavior identical

## Deferred (logged separately)
- 11 pre-existing Neon DB-integration vitest failures from serverless cold-start `STACK_TRACE_ERROR` — logged in `.planning/phases/13-ux-brand-pass/deferred-items.md` per executor scope boundary. NOT caused by Phase 13 work; will be addressed in a separate stability pass.

## Open Questions resolved during execution
- **OQ1 (dynamic vs static OG image):** dynamic via `app/opengraph-image.tsx` ImageResponse — implemented as recommended
- **OQ2 (BrandTable thin vs thick):** thin wrapper — implemented as recommended; hakkediş tables in Plan 13-02 will surface whether a baked-density variant is needed
- **OQ3 (per-surface vs single error.tsx):** single root `app/error.tsx` — implemented as recommended; per-surface error boundaries deferred to future phases if a specific surface needs differentiated UX

## Affects downstream waves
- **Plan 13-02 (Wave 2 hakkediş + exports):** ready to consume; LivePeriodPoller addition of visible `<BrandBadge variant="info">` sibling is Plan 13-02's responsibility
- **Plan 13-03a (Wave 2 overview + analytics + OE scorecard):** ready to consume; KpiCard refactor to compose BrandCard is Plan 13-03a Task 1
- **Plan 13-03b (Wave 2 people + records + settings):** ready to consume
- **Plan 13-04 (Wave 3 projects + auth + UAT):** ready to consume; end-of-phase UAT in Plan 13-04 will re-verify Wave 1 propagation hasn't drifted

## Commits
- `39f02ed` feat(13-01): swap industrial blue tokens to slate + amber and wire Geist Sans/Mono
- `6953b31` feat(13-01): ship 7 brand primitives + barrel + 2 unit tests (Wave 1 spine)
- `512cc52` feat(13-01): consumer rollout — AppSidebar BrandLogo + BRAND.md + icon/OG/404/error + i18n meta keys
- `ccf6653` chore(13-01): record Task 4 regression sweep result + deferred Neon flakiness

## Self-Check: PASSED
