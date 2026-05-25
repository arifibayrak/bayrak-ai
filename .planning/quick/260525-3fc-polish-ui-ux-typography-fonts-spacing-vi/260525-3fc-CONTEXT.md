# Quick Task 260525-3fc: Polish UI/UX — typography, fonts, spacing, visual hierarchy across landing + dashboard - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Task Boundary

Visual + typographic polish ONLY across the three existing surfaces — landing (`/`),
auth (`/auth/signin`), and dashboard (`/dashboard/*`). No feature changes, no route
changes, no data-model changes. Functionality, i18n (cookie-based TR/EN toggle), and
all translations must stay intact.

Stack constraints: Next.js App Router, Tailwind v4, shadcn (base-nova), next-intl 4.x.
Every new visible string must be added to BOTH `messages/tr.json` and `messages/en.json`.

</domain>

<decisions>
## Implementation Decisions

### Root-cause bug to fix (discovered in audit)
- `globals.css` defines `--font-sans: var(--font-sans)` — a self-referential variable.
  `layout.tsx` exposes Geist as `--font-geist-sans` (different name), so `--font-sans`
  is undefined and the whole app renders in the browser default font. The new font
  wiring MUST resolve this so the chosen face actually applies.

### Typeface — LOCKED
- **Inter everywhere** (single family), loaded via `next/font/google` as a variable font.
- Rationale: gold-standard UI legibility, bulletproof Turkish glyph rendering
  (İ ı Ş ş Ğ ğ Ç ç Ö ö Ü ü — correct dotted/dotless i), best at dense dashboard table sizes.
- Wire `--font-sans` correctly in `@theme inline` so `font-sans` resolves to Inter.
- Keep a mono fallback for `tabular-nums` table use; mono is non-critical (no Geist Mono
  dependency that doesn't resolve).

### Accent / brand color — LOCKED
- **Industrial Blue** primary accent: `oklch(0.55 0.20 255)` (~#2563EB).
- Neutrals shift from pure gray (`oklch(… 0 0)`) to **cool slate-tinted** neutrals
  (small blue chroma) — deeper/richer, not flat.
- Warning = amber, Success = emerald — UNCHANGED (BOQ palette + status badge spec in
  05-UI-SPEC.md still governs; the 6 BOQ marker hex values stay fixed).
- Accent applied to: primary CTAs, active tab underline/trigger, filter-chip active state,
  progress-bar fill, focus ring, key links.

### Theme darkness — LOCKED
- **Light everywhere, but richer**: deeper slate neutrals (not flat white-on-gray), real
  card borders + a subtle shadow for depth, accent color used throughout. No full dark mode.
- (User originally floated "darker tones" — resolved to a richer LIGHT theme, not dark mode.)

### Headings / type scale — LOCKED
- **Bold & tight**: large display headings, weight **700**, letter-spacing **-0.02em**,
  snug line-height. Drop the old "only 400/600, two weights, max 20px" rule from
  05-UI-SPEC.md — that rule was the source of the flat hierarchy.
- Introduce weights 400 / 500 / 600 / 700. Hero display: fluid `clamp()` ~40→60px.
  Page titles ~28px/700. Body 15–16px. Tabular-nums preserved for tables.

### 05-UI-SPEC.md revision — PERMITTED
- The locked "neutral base-nova + 2 weights" typography rule in 05-UI-SPEC.md is the
  documented cause of the blandness. This task supersedes the Typography + Color sections
  of that spec for global chrome. Update/annotate the spec to reflect the new tokens so it
  stays the source of truth (do not leave it contradicting the implementation).

### Claude's Discretion
- Exact spacing-rhythm tuning (section py values, hero max-width, CTA heights).
- Card border/shadow exact values; button `lg`/hero-CTA sizing approach (must not regress
  the dashboard's existing `lg` usage — prefer additive sizing or per-use classes).
- Any small new copy (e.g. hero subtitle, dashboard page subtitles) — added to tr+en.

</decisions>

<specifics>
## Specific Ideas

- Hero before→after: `<h1>` from 30px/600 cramped in `max-w-2xl` → fluid display
  clamp(40,60)px / 700 / -0.02em, relaxed tagline, 48px CTAs.
- Cards: replace near-invisible `ring-1 ring-foreground/10` with real border + subtle shadow.
- Section rhythm: break the monotonous uniform `py-16`.

</specifics>

<canonical_refs>
## Canonical References

- `.planning/phases/05-dashboard-map/05-UI-SPEC.md` — locked design contract; Typography
  + Color sections explicitly revisable per this task (see decision above).
- `CLAUDE.md` — stack constraints (Tailwind v4, shadcn base-nova, next-intl cookie locale).

</canonical_refs>
