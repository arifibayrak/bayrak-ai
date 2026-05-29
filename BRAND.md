# bayrak.ai Brand Reference

> **Top-level brand reference** mirroring the v3.0 decisions D-121 through D-128.
>
> **Canonical source of truth:** [`.planning/phases/13-ux-brand-pass/13-CONTEXT.md`](.planning/phases/13-ux-brand-pass/13-CONTEXT.md). This file at repo root exists so future-phase planners and AI agents reach for it first (BRAND-01); the planning CONTEXT.md remains authoritative when the two diverge.

---

## D-121 Color palette + semantic roles

Slate canvas + amber accent. **Light mode only** in v3.0 (dark mode deferred to v3.1+).

| Role | Token | Value |
|---|---|---|
| Background canvas | `slate-50` | `oklch(0.984 0.003 247)` |
| Foreground body text | `slate-900` | `oklch(0.21 0.034 264)` |
| Cards / surface | `white` | `oklch(1 0 0)` |
| Subtle backgrounds | `slate-100` | `oklch(0.968 0.007 247)` |
| Borders | `slate-200` | `oklch(0.929 0.013 255)` |
| **Brand primary (interactive)** | `amber-500` | `oklch(0.769 0.188 70)` |
| Brand primary hover | `amber-600` | `oklch(0.692 0.184 75)` |
| Brand subtle background | `amber-50` | `oklch(0.987 0.022 95)` |
| Destructive / reject / error | `red-600` | `oklch(0.577 0.245 27)` |
| Success / approve | `emerald-600` | `oklch(0.696 0.17 162)` |
| Info | `sky-600` | `oklch(0.588 0.158 241)` |
| Warning (NOT amber — amber is brand) | `orange-500` | `oklch(0.705 0.213 47)` |

**Why amber not red despite *bayrak* meaning "flag":** red conflicts with the destructive/reject semantic that every data dashboard needs. Amber nods to Turkish flag-gold associations without claiming red.

---

## D-122 Typography

- **Screen:** Geist Sans (body + headings via weight-based hierarchy: 400 body, 500 emphasis, 600 semibold, 700 bold) + Geist Mono (monetary amounts in tables, IDs, code).
- **PDF:** DejaVu Sans (Phase 11 D-106 — Phase 13 does NOT change this).
- **Why Geist:** stack-native (Vercel-published font for Vercel-deployed Next.js), free, crisp at small sizes (matters for hakkediş tables), Latin Extended-A covers all Turkish characters (ğ ş ı İ ç ö ü), single family.

Font loading lives in `src/app/layout.tsx` via `geist/font/sans` + `geist/font/mono`; CSS variable bindings (`--font-sans`, `--font-mono`, `--font-heading`) live in `src/app/globals.css @theme inline`.

---

## D-123 Voice & tone

- **TR address:** *siz* (formal). Action-first CTAs (`Onayla`, `Reddet`, `Dışa Aktar`, `Tahakkuk Et`), NOT verbose `Onaylamak için tıklayın` style.
- **EN parity:** action-first CTAs (`Approve`, `Reject`, `Export`, `Mark Submitted`).
- **Why:** matches what's already shipped across Phases 8–12; modern Turkish SaaS norm.

---

## D-124 Logo + wordmark

The wordmark IS the brand mark for v3.0:

> **bayrak** in Geist Sans 600 `slate-900` + **.ai** in Geist Sans 600 `amber-500`.

The amber `.ai` suffix is the brand. No abstract glyph, no flag-literal mark, no industry icon-mark in v3.0.

- **Sidebar header:** `<BrandLogo size="md" />` at ~16px line-height.
- **Favicon:** monochrome amber wordmark (`src/app/icon.png` 32×32 + `favicon.ico` fallback).
- **OG image (`src/app/opengraph-image.tsx`):** wordmark center-left on `slate-50` background with bilingual tagline ("Saha sahipleniyor / Field accountability for utility-network contractors") in Geist Sans `slate-700`.

---

## D-125 Layout primitives

- **Border-radius:** `rounded-md` (Tailwind default `0.375rem`) on cards, buttons, inputs, modals. NO `rounded-lg/xl/2xl/full` except avatar circles + status pills.
- **Spacing density:** Compact. Cards `p-2` (table rows) / `p-3` (KPI tiles, card headers/footers) / `p-4` (card bodies, page sections). NO `p-6/p-8` defaults.
- **Shadow depth:** Flat. NO `shadow-sm/md/lg/xl/2xl` on cards — use `border border-slate-200` only. Exception: dropdowns / popovers / dialogs may use shadcn's default popover shadow.
- **Why:** matches Procore / Autodesk Construction Cloud industry-utility analog (D-128); compact density fits data-heavy hakkediş tables; flat depth reads as serious financial software.

---

## D-126 Icons

- **lucide-react** at current version. Already shipped across Phases 8–12.
- Stroke weight: lucide default (`stroke-width="2"`).
- Sizes: `size-4` (16px) inline with text, `size-5` (20px) in buttons, `size-6` (24px) in section headers.

---

## D-127 Sequencing (4 waves)

| Wave | Scope | Output |
|---|---|---|
| W1 Brand spine | Token swap, fonts, 7 brand primitives, admin shell, BRAND.md, favicon, OG, 404/error pages | All future surfaces inherit by importing from `@/components/brand` |
| W2 | Hakkediş + Exports | Re-skin `/dashboard/(admin)/hakedis/*` and `/dashboard/(admin)/exports/*` |
| W3 | Analytics + People + Overview | Re-skin overview, scorecards, leaderboard, profiles, submission detail |
| W4 | Projects + BOQ + Auth | Re-skin projects, BOQ, GeoJSON upload, sign-in |

---

## D-128 Visual analogs

- **Cited:** Procore + Autodesk Construction Cloud. Industry-utility density, function-over-form, dense data tables.
- **Deliberate departure:** both use **blue** as primary. bayrak.ai uses **amber** — the single most identity-bearing decision; the market differentiator against the construction-software-blue norm.
- **NOT cited (rejected):** Linear, Vercel dashboard, Stripe, Notion.

---

## Programmatic consumers — the 7 brand primitives (`src/components/brand/`)

Future-phase planners and AI agents: **reach for these primitives first.** Do NOT consume shadcn primitives directly from feature surfaces if a brand wrapper exists.

| Primitive | File | Purpose |
|---|---|---|
| `BrandButton` | `BrandButton.tsx` | cva-variant wrapper around shadcn Button — primary (amber) / secondary / destructive / outline / ghost with sm/md/lg sizes and D-126 icon-size baked in |
| `BrandCard` | `BrandCard.tsx` | Flat compound (`.Header` / `.Body` / `.Footer`) — `rounded-md border-slate-200 shadow-none` per D-125 |
| `BrandHeading` | `BrandHeading.tsx` | Polymorphic `h1`/`h2`/`h3` with `display`/`h1`/`h2`/`h3` size variants |
| `BrandBadge` | `BrandBadge.tsx` | 6 pill variants (primary / success / info / warning / destructive / neutral) per D-121 semantic palette; `rounded-full` per D-125 exception |
| `BrandEmpty` | `BrandEmpty.tsx` | Empty-state surface (icon + title + description + action) — used by 404, error boundary, empty tables |
| `BrandLogo` | `BrandLogo.tsx` | Wordmark — `bayrak` + `.ai` per D-124, size `sm`/`md`/`lg` |
| `BrandTable` | `BrandTable.tsx` | Thin namespaced wrapper around shadcn Table primitives |

Barrel export: `import { BrandButton, BrandCard, … } from '@/components/brand'`.

---

*Phase 13 — UX & brand pass — v3.0*
