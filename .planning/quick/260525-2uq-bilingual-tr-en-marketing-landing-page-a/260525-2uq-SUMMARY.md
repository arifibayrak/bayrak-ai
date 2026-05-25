---
phase: quick-260525-2uq
plan: "01"
subsystem: landing
tags: [i18n, next-intl, marketing, landing-page, rsc]
dependency_graph:
  requires: []
  provides: [bilingual-landing-page]
  affects: [src/app/page.tsx, messages/tr.json, messages/en.json]
tech_stack:
  added: []
  patterns: [getTranslations-rsc, buttonVariants-on-link, Section-wrapper, LandingHeader]
key_files:
  created:
    - src/components/landing/Section.tsx
    - src/components/landing/LandingHeader.tsx
  modified:
    - src/app/page.tsx
    - messages/tr.json
    - messages/en.json
decisions:
  - "Secondary CTA is mailto: link — no signup form; access is gated by allowlist"
  - "Primary CTA accent color (bg-primary) reserved exclusively for Sign-in link per design system"
  - "LandingHeader mirrors TopNav layout but is landing-scoped — TopNav not imported or modified"
  - "lucide-react icons paired with text labels (never color/icon alone) for accessibility"
metrics:
  duration: "12 minutes"
  completed: "2026-05-25"
  tasks: 3
  files: 5
---

# Quick Task 260525-2uq: Bilingual TR/EN Marketing Landing Page Summary

**One-liner:** Replaced create-next-app boilerplate at `/` with a fully bilingual (TR/EN) marketing landing page using next-intl `getTranslations`, existing `LanguageToggle`, and the Phase 5 design system — 5 sections, 0 hardcoded strings, tsc clean, build green.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add landing namespace to both message files | b8192d1 | messages/tr.json, messages/en.json |
| 2 | Build landing-only components (Section + LandingHeader) | 1fab197 | src/components/landing/Section.tsx, src/components/landing/LandingHeader.tsx |
| 3 | Replace page.tsx with bilingual landing page | 5717e6b | src/app/page.tsx |

## What Was Built

**messages/tr.json + messages/en.json** — New top-level `landing` namespace added as a sibling of auth/nav/dashboard/common. 33 keys at full TR/EN parity covering: hero (title, tagline, CTAs), problem/solution (before/after), how-it-works (3 steps), features (6 feature cards), footer, and a11y strings. Secondary CTA copy is framed as "İletişim" / "Request access" — no signup-implying language.

**src/components/landing/Section.tsx** — RSC presentational wrapper enforcing 8pt grid (py-16) and max-w-5xl mx-auto px-6 container. `muted` prop toggles bg-muted for 30%-band section alternation. Uses `cn` helper for className merging.

**src/components/landing/LandingHeader.tsx** — Async RSC sticky header (sticky top-0 z-40 h-14 bg-card border-b). Contains wordmark, existing `LanguageToggle` (imported from @/components/layout/LanguageToggle — no reimplementation), and primary Sign-in CTA as a next/link styled via `buttonVariants({ size: 'lg' })` (default/accent variant).

**src/app/page.tsx** — Fully replaced create-next-app boilerplate with an async RSC landing page. Five sections:
1. Hero — h1 + tagline + primary CTA (/auth/signin) + secondary CTA (mailto:burakkbayrak@gmail.com)
2. Problem/Solution — 2-column before/after cards (bg-muted band)
3. How It Works — 3-step numbered grid
4. Key Features — 6 Card components in responsive grid (sm:grid-cols-2 lg:grid-cols-3)
5. Footer — tagline + copyright, centered, border-t

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | CLEAN |
| `npm run build` | GREEN (exit 0) |
| TR/EN key parity (33 keys) | OK |
| Boilerplate removed | OK |
| `/auth/signin` CTA present | OK |
| `mailto:burakkbayrak@gmail.com` CTA present | OK |
| LanguageToggle reused (not reimplemented) | OK |
| Scope fence (only 5 declared files changed) | OK |
| No signup-implying strings | OK |

## Known Stubs

None — all landing sections render real i18n-backed copy. No placeholder or TODO strings.

## Threat Flags

None — landing page is fully static/public. No new network endpoints, auth paths, or trust boundary changes introduced. T-2uq-01 and T-2uq-02 mitigations confirmed: secondary CTA is a static `mailto:` literal with no user-controlled interpolation; copy contains no gated-signup internals.

## Self-Check: PASSED

- src/components/landing/Section.tsx — FOUND
- src/components/landing/LandingHeader.tsx — FOUND
- src/app/page.tsx — modified (boilerplate gone, landing page present)
- messages/tr.json — landing namespace present, 33 keys
- messages/en.json — landing namespace present, 33 keys
- Commit b8192d1 — FOUND
- Commit 1fab197 — FOUND
- Commit 5717e6b — FOUND
