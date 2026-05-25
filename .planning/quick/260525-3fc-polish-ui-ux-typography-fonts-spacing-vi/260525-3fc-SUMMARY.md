---
quick_id: 260525-3fc
slug: polish-ui-ux-typography-fonts-spacing-vi
title: Polish UI/UX — typography, fonts, spacing, visual hierarchy
date: 2026-05-25
status: complete
---

# Quick Task 260525-3fc — Summary

Visual + typographic polish across landing, auth, and dashboard. No feature/route/data
changes. i18n toggle and translations intact; new strings added to both locales.

## Root-cause bugs fixed
1. **Font never applied.** `globals.css` had `--font-sans: var(--font-sans)` (self-referential)
   while `layout.tsx` exposed Geist as `--font-geist-sans` — so the entire app rendered in the
   browser default system font. Now `--font-sans` → `var(--font-inter)` + fallback stack.
2. **Turkish glyphs never downloaded.** The font loaded only the `latin` subset, but İ ı Ş ş Ğ ğ
   live in Latin Extended-A. Inter now loads `["latin","latin-ext"]`.

## Decisions implemented (from CONTEXT.md)
- **Font:** Inter everywhere (variable, latin+latin-ext) via `next/font`.
- **Accent:** Industrial Blue `oklch(0.55 0.20 255)`; neutrals re-tinted cool slate (hue ~264).
- **Theme:** richer light — cards lift above a faintly tinted bg, real border + `shadow-sm`.
- **Headings:** bold (700) + tight tracking (`-0.02em`); fluid `.text-display` (clamp 36→60px).
- Status colors (red/amber/emerald) + BOQ marker hex palette unchanged.

## Commits
- `fc82f27` 01 — Inter font + Industrial Blue slate token system (layout, globals, card, UI-SPEC)
- `aabd944` 02 — landing + auth hierarchy/spacing (page, header, section, signin, tr/en)
- `fc1e92c` 03 — dashboard chrome (tabs accent, projects, project detail, ProjectCard, TopNav, tr/en)

## Files changed
- `src/app/layout.tsx`, `src/app/globals.css`, `src/components/ui/card.tsx`, `src/components/ui/tabs.tsx`
- `src/app/page.tsx`, `src/components/landing/{LandingHeader,Section}.tsx`, `src/app/auth/signin/page.tsx`
- `src/app/dashboard/layout.tsx`, `src/app/dashboard/projects/page.tsx`, `src/app/dashboard/projects/[id]/page.tsx`
- `src/components/dashboard/ProjectCard.tsx`, `src/components/layout/TopNav.tsx`
- `messages/tr.json`, `messages/en.json` (new: `landing.hero.eyebrow`, `dashboard.projects.subtitle`)
- `.planning/phases/05-dashboard-map/05-UI-SPEC.md` (Typography + Color sections annotated as superseded)

## Verification
- `npx tsc --noEmit` — passes.
- `npm run build` — passes (9/9 routes; only pre-existing lint warnings in bot-audit/spatial/telegram).

## Deploy
Manual: `vercel --prod --yes` (no git remote / Vercel-Git connection).
