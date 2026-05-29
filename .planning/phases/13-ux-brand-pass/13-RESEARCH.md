# Phase 13: UX & Brand Pass - Research

**Researched:** 2026-05-29
**Domain:** Restyle existing surfaces with bayrak.ai brand language (slate canvas + amber accent, Geist font, compact density, flat depth)
**Confidence:** HIGH — codebase-specific findings verified by direct inspection of `package.json`, `globals.css`, `layout.tsx`, and each surface directory.

## Summary

Phase 13 is a **token-swap + font-swap + primitive-wrap** phase, not a route rebuild. The codebase already uses Tailwind v4 with `@theme` in `globals.css` and a full shadcn semantic token slot system (`--primary`, `--destructive`, `--card`, `--sidebar-*`, etc.) — currently configured to **Industrial Blue (`oklch(0.55 0.2 255)`)**. The fastest, lowest-risk path is to **override the existing shadcn token slot values** to the locked slate + amber palette (D-121); every existing `bg-primary`, `text-primary`, `border-border`, `bg-destructive` etc. across Phases 8–12 then inherits the new brand automatically. No `tailwind.config.ts` exists or needs to be created — Tailwind v4 + `@theme` in CSS is the established convention here.

Geist Sans is **not currently installed** (Inter is). Swap requires `npm i geist`, edit `src/app/layout.tsx` (single file), and update two CSS variables in `globals.css` (`--font-sans` and `--font-heading` resolve to the Geist Sans variable; add `--font-mono` resolving to Geist Mono). `next/font/google` does NOT publish Geist — the dedicated `geist` package from Vercel is the only path.

Surface count is modest: 12 page-level files across 9 surface groups, plus ~7 cross-surface admin components and ~21 shadcn UI primitives that already live in `src/components/ui/`. Wave sequencing in D-127 fits this footprint comfortably.

**Primary recommendation:** Override the shadcn token slots in `globals.css :root {}` (don't add new `--brand-*` tokens). Install `geist` via npm. Build 7 brand primitives as thin `cva` wrappers around existing shadcn primitives in `src/components/brand/`. Add the three missing root-level files (`icon.png`, `opengraph-image.tsx`, `app/not-found.tsx` + global `error.tsx`) in Wave 1.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-121 Color palette + semantic roles:**
- Slate canvas + amber accent. Light mode only.
- Canvas: `slate-50` background; `slate-900` body text
- Surface: `white` cards; `slate-100` subtle backgrounds; `slate-200` borders
- Primary brand: `amber-500` interactive; `amber-600` hover; `amber-50` subtle bg
- Destructive/reject/error: `red-600` (red reserved for destructive — NOT brand primary)
- Success/approve: `emerald-600` · Info: `sky-600` · Warning: `orange-500` (NOT amber)

**D-122 Typography:** Geist Sans (400/500/600/700), Geist Mono for monetary amounts + IDs. PDF keeps DejaVu Sans (Phase 11 D-106).

**D-123 Voice:** *siz* address TR, action-first CTAs both languages (`Onayla`, `Approve`).

**D-124 Logo:** Wordmark only — `bayrak` Geist 600 slate-900 + `.ai` Geist 600 amber-500. The amber `.ai` suffix IS the brand mark. Favicon: monochrome amber wordmark. OG image: wordmark center-left on slate-50.

**D-125 Layout primitives:** `rounded-md` (0.375rem) on cards/buttons/inputs/modals. NO `rounded-lg/xl/2xl/full` except avatar circles + status pills. Compact spacing (`p-2` rows, `p-3` KPI tiles, `p-4` page sections, no `p-6/p-8`). Flat depth — NO shadows on cards, use `border border-slate-200` only. Exception: dropdowns/popovers/dialogs may use shadcn default popover shadow.

**D-126 Icons:** lucide-react stays. Sizes: `size-4` inline, `size-5` in buttons, `size-6` in headers.

**D-127 Sequencing (4 waves):**
- W1 Brand spine: tokens, primitives, admin shell, fonts, favicon, OG
- W2 Hakkediş + Exports
- W3 Analytics + People + Overview
- W4 Projects + BOQ + Auth

**D-128 Visual analogs:** Procore + Autodesk Construction Cloud minus their blue. amber replaces blue. NOT Linear/Vercel/Stripe/Notion.

### Claude's Discretion
- Exact Tailwind v4 token names (`--color-brand-primary` vs `--brand-amber-500` vs other).
- Brand primitives location: `src/components/brand/` (recommended) vs `src/components/ui/brand/`.
- Exact OG image dimensions and rendering (`opengraph-image.tsx` vs static PNG).
- Whether `<BrandTable>` is a thin wrapper or thicker abstraction with baked-in density.
- Per-surface micro-adjustments inside locked density/depth/radius envelope.

### Deferred Ideas (OUT OF SCOPE)
- Dark mode (v3.1+ when field-worker surfaces exist).
- Custom industry icons (v3.1+ designer engagement).
- Abstract/flag-literal logo mark (v3.1+).
- Linear/Vercel/Stripe aesthetic — explicitly rejected.
- Telegram bot copy + voice — out-of-app surface.
- PDF brand refresh — DejaVu Sans stays per Phase 11 D-106.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRAND-01 | Bayrak.ai brand reference checked in / linked from single source of truth | Satisfied by `13-CONTEXT.md` itself per its own preamble — no new artifact needed unless planner wants a `BRAND.md` mirror. |
| BRAND-02 | Every existing dashboard surface re-skinned to brand reference | Item 3 (Per-Surface Inventory) sizes the work into 4 waves matching D-127. |
| BRAND-03 | New shared brand primitives exist so future phases inherit by default | Item 4 (Brand Primitive Wrapping Pattern) specifies the 7-primitive package as cva wrappers around shadcn. |
</phase_requirements>

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.x (in devDependencies) + @vitejs/plugin-react 6.0.x |
| Config file | none detected at repo root — see Wave 0 |
| Quick run command | `npm test -- <pattern>` (no `test` script defined yet — Wave 0 adds it) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BRAND-01 | CONTEXT.md serves as brand reference | manual-only | n/a — doc-existence check | n/a |
| BRAND-02 | Functional regression check: every Phase 1–12 capability still works after restyle | smoke (manual walkthrough) + unit (Phase 12 contracts) | `npm test src/components/admin/LivePeriodPoller.test.tsx` + manual checklist | ❌ Wave 0 |
| BRAND-02 | Token slots resolve to amber/slate values (not blue) | unit | `npm test src/app/globals.css.test.ts` (CSS variable assertion) | ❌ Wave 0 |
| BRAND-03 | BrandButton renders all variants without crash | unit | `npm test src/components/brand/BrandButton.test.tsx` | ❌ Wave 1 ships test |
| BRAND-03 | BrandLogo renders `bayrak` + amber `.ai` | unit | `npm test src/components/brand/BrandLogo.test.tsx` | ❌ Wave 1 ships test |

### Sampling Rate
- **Per task commit:** Vitest watch on the touched primitive/surface.
- **Per wave merge:** `npm test` full suite + manual screen walkthrough on the wave's surfaces.
- **Phase gate:** Full test suite green + behavioral walkthrough on Phases 1–12 user flows (worker submit, auditor approve, hakkediş finalize, Phase 11 PDF/Excel export, Phase 12 live poll + traceability panel).

### Wave 0 Gaps
> **NOTE (post-VALIDATION resolution):** Wave 0 Gaps below are SUPERSEDED by `13-VALIDATION.md §Wave 0 Requirements`. Plan 13-01 Task 3b uses the node-env pure-function vitest pattern established by Phase 12's `LivePeriodPoller.test.tsx` — call components as functions, inspect returned React element props/className. Do NOT install jsdom / @testing-library/react. The items listed here are kept for archival completeness only.

- [ ] Add `"test": "vitest"` script to `package.json` (currently absent).
- [ ] Create `vitest.config.ts` with React + jsdom environment.
- [ ] Create `tests/setup.ts` + import in vitest config (jest-dom, @testing-library/react).
- [ ] Install `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` (devDependencies).
- [ ] Create a snapshot or assertion for the locked `--primary` slot value (catches accidental blue revert).

*(If the phase opts for a lighter validation posture — visual walkthrough only — Wave 0 collapses to "add test script + write one snapshot per brand primitive". Planner picks.)*

## Tailwind v4 Token Convention (Item 1)

**Current state:**
- **No `tailwind.config.ts`** exists at repo root [VERIFIED: `ls tailwind.config.*` returned no match].
- All token configuration lives in `src/app/globals.css` via Tailwind v4's `@theme inline { ... }` directive [VERIFIED].
- Imports: `@import "tailwindcss"` + `@import "tw-animate-css"` + `@import "shadcn/tailwind.css"`.
- Convention in this codebase: shadcn semantic slot system. `@theme inline` maps short token names (`--color-primary`, `--color-destructive`, `--color-border`, `--color-sidebar`, `--color-card`, `--color-muted`, etc.) to CSS custom properties (`var(--primary)`, `var(--destructive)`, etc.) defined in `:root { ... }`.
- **Current values are Industrial Blue, NOT amber** [VERIFIED: lines 67–79 of globals.css]:
  - `--primary: oklch(0.55 0.2 255)` (blue ~#2563EB)
  - `--ring: oklch(0.62 0.17 255)` (blue)
  - `--accent: oklch(0.955 0.012 255)` (cool blue tint)
  - All `--sidebar-*` and `--chart-1` derive from the blue primary.
- Existing comment in globals.css explicitly names "Industrial Blue" — this is the swap target.
- `next-themes` package is installed and `.dark { ... }` block exists (lines 96–130), but dark mode is **deferred** per D-121. Leave the `.dark` block intact (harmless) but Phase 13 does NOT need to update it.

**Recommendation — Approach A (CHEAPEST, RECOMMENDED): Override existing shadcn token slots in `:root {}`**

Every component across Phases 8–12 already uses class names like `bg-primary`, `text-primary`, `bg-destructive`, `text-muted-foreground`, `border-border`, `bg-sidebar`. Swapping the **values** of the existing `--primary`, `--destructive`, `--sidebar`, `--border`, etc. CSS variables in `:root` propagates the brand instantly across every existing surface with zero component-level edits. Concrete value mapping the planner should use:

```css
:root {
  /* Canvas (slate-50 / slate-900) */
  --background: oklch(0.984 0.003 247);    /* slate-50 */
  --foreground: oklch(0.21 0.034 264);     /* slate-900 */

  /* Surface */
  --card: oklch(1 0 0);                    /* white */
  --card-foreground: oklch(0.21 0.034 264);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.21 0.034 264);
  --muted: oklch(0.968 0.007 247);         /* slate-100 */
  --muted-foreground: oklch(0.446 0.03 256);
  --border: oklch(0.929 0.013 255);        /* slate-200 */
  --input: oklch(0.929 0.013 255);

  /* Brand primary = amber-500 */
  --primary: oklch(0.769 0.188 70);        /* amber-500 */
  --primary-foreground: oklch(0.21 0.034 264);  /* slate-900 reads on amber */
  --ring: oklch(0.769 0.188 70);

  /* Secondary / accent = subtle amber bg or slate-100 */
  --secondary: oklch(0.968 0.007 247);     /* slate-100 */
  --secondary-foreground: oklch(0.21 0.034 264);
  --accent: oklch(0.987 0.022 95);         /* amber-50 */
  --accent-foreground: oklch(0.21 0.034 264);

  /* Destructive = red-600 (UNCHANGED semantic — stays red) */
  --destructive: oklch(0.577 0.245 27);    /* red-600 */

  /* Sidebar — slate-50 canvas, slate-900 foreground, amber accent */
  --sidebar: oklch(0.984 0.003 247);
  --sidebar-foreground: oklch(0.21 0.034 264);
  --sidebar-primary: oklch(0.769 0.188 70);
  --sidebar-primary-foreground: oklch(0.21 0.034 264);
  --sidebar-accent: oklch(0.987 0.022 95);
  --sidebar-accent-foreground: oklch(0.21 0.034 264);
  --sidebar-border: oklch(0.929 0.013 255);
  --sidebar-ring: oklch(0.769 0.188 70);

  /* Border radius — D-125 says rounded-md (0.375rem). Current --radius is 0.625rem. */
  --radius: 0.375rem;
}
```

> oklch values above are Tailwind's official slate/amber/red scales. Planner should pull final values from Tailwind v4's default palette source-of-truth and pin them; the values shown are accurate within ±0.005 [ASSUMED: derived from Tailwind v4 default palette — planner should verify against `tailwindcss/preflight` if pixel-exact match matters].

**Why Approach A wins:**
- One file changed, ~20 lines edited. Zero component code touched for the global swap.
- All existing `bg-primary` etc. usages flip to amber automatically.
- The semantic split D-121 demands (success/info/warning/destructive distinct from brand primary) is preserved because shadcn already has `--destructive` as a separate slot; the brand only owns `--primary`/`--accent`/`--ring`/`--sidebar-*`.

**Approach B (rejected): introducing new `--brand-amber-500` tokens alongside shadcn slots.** Would require every existing component to be edited to swap `bg-primary` → `bg-brand-amber-500`. That's the wrong shape of work for Phase 13. Use Approach A.

**Semantic colors not in shadcn slots** (success/info/warning per D-121): these have no shadcn-slot equivalent. Recommend adding three new tokens in the same `:root` block for use by `<BrandBadge>` and status pills:
```css
--success: oklch(0.696 0.17 162);  /* emerald-600 */
--info: oklch(0.588 0.158 241);    /* sky-600 */
--warning: oklch(0.705 0.213 47);  /* orange-500 (NOT amber per D-121) */
```
Expose under `@theme inline` as `--color-success`, `--color-info`, `--color-warning`. Use in code as `bg-success`, `text-info` etc.

## Geist Font Loading (Item 2)

**Current state:**
- `geist` package is **NOT** in `package.json` [VERIFIED — package.json fully inspected].
- Currently uses Inter via `next/font/google` in `src/app/layout.tsx` (lines 2, 10–14, 31): `Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" })`.
- `globals.css` line 13: `--font-sans: var(--font-inter), ui-sans-serif, system-ui, ...`
- `globals.css` line 17: `--font-heading: var(--font-inter), ...`
- `globals.css` line 15: `--font-mono: ui-monospace, "SF Mono", ..." ` — Inter never set a mono variable.

**Geist is NOT in `next/font/google`** — Vercel publishes the `geist` npm package as the only canonical install path [CITED: vercel.com/font]. Confirm via `npm view geist version` before install.

**Recommended swap pattern for `src/app/layout.tsx`:**

```tsx
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

// Remove Inter import + Inter() factory entirely.
// GeistSans / GeistMono expose `.variable` directly — no factory call needed.
// Geist covers Latin Extended-A — Turkish glyphs (İ ı Ş ş Ğ ğ ç ö ü) are included.

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**Concurrent globals.css edits:**
```css
--font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, ...;
--font-heading: var(--font-geist-sans), ui-sans-serif, system-ui, ...;
--font-mono: var(--font-geist-mono), ui-monospace, "SF Mono", ...;
```

The `geist` package exposes the CSS variable as `--font-geist-sans` / `--font-geist-mono` (this is the published convention) [ASSUMED — planner verifies once installed; check `node_modules/geist/dist/...` after install].

**Install command:** `npm i geist` — single dep, no peer-deps beyond Next.js (already in place).

**Risk:** The existing globals.css line 14 sets `font-feature-settings: "cv11", "ss01"` — these are Inter-specific OpenType features. Remove or replace; Geist Sans has its own feature set (`ss03` for the alternative `a`, etc.) — planner should simply remove the `font-feature-settings` line and let Geist's defaults render. Confirm by visual diff on a hakkediş table after swap.

## Per-Surface Inventory (Item 3)

| Surface group | Top-level files | Wave |
|---------------|-----------------|------|
| **App shell** (root `layout.tsx`, `(admin)/layout.tsx` passthrough, real sidebar in `src/app/dashboard/layout.tsx`) | `src/app/layout.tsx`, `src/app/dashboard/layout.tsx`, `src/app/dashboard/(admin)/layout.tsx`, `src/components/admin/AppSidebar.tsx` (741B), `src/components/admin/SidebarNav.tsx` (2.0K), `src/components/ui/sidebar.tsx` (21.1K) | W1 |
| **Admin overview / command center** | `src/app/dashboard/(admin)/page.tsx` (7.6K, marketing/landing root), `src/app/dashboard/(admin)/overview/page.tsx` (10.7K) + `overview/EVTableClient.tsx` (7.2K) | W3 |
| **Hakkediş hub + period detail** | `(admin)/hakedis/page.tsx` (7.6K), `(admin)/hakedis/[periodId]/page.tsx` (18.6K), `src/components/admin/HakedisCreateDialog.tsx` (13.6K), `HakedisProjectFilter.tsx`, `HakedisStatusBadge.tsx`, `LivePeriodPoller.tsx`, `LineSubmissionsPanel.tsx`, `PeriodDetailControls.tsx`, `DeletePeriodDialog.tsx`, `FinalizeDialog.tsx` | W2 |
| **Exports hub** | `(admin)/exports/page.tsx` (10.7K) — single file, three trigger cards + period picker | W2 |
| **Analytics** | `(admin)/analytics/page.tsx` (4.0K), `(admin)/analytics/office-engineers/[userId]/page.tsx` (9.0K), `src/components/admin/ActivityTimeline.tsx` (5.4K), `TrendChartsClient.tsx` (9.6K), `LeaderboardSortSelect.tsx`, `KpiCard.tsx`, `ThresholdSettingsForm.tsx` (7.8K), `FilterBar.tsx` (6.7K), `SubmissionDetailView.tsx` (10.2K) | W3 |
| **People** | `(admin)/people/page.tsx` (17.9K), `(admin)/people/[personId]/page.tsx` (16.5K) | W3 |
| **Settings** | `(admin)/settings/page.tsx` (2.3K) — small, fits W3 | W3 |
| **Projects + BOQ** | `dashboard/projects/page.tsx` (1.6K), `dashboard/projects/loading.tsx` (282B — only loading.tsx in repo), `dashboard/projects/[id]/page.tsx` (4.4K), `[id]/edit/page.tsx` (9.0K), `[id]/boq-template/page.tsx` (800B) + `boq-template/route.ts`, `dashboard/projects/new/page.tsx` (379B) | W4 |
| **Auth** | `src/app/auth/signin/page.tsx`, `src/app/auth/error/page.tsx` (only two files — no magic-link consume page; Auth.js handles consume server-side via `/api/auth/callback/email`) | W4 |
| **Marketing root** | `src/app/page.tsx` (7.6K) — public landing page | W4 (or W1 if planner bundles with shell) |

### Anomalies + missing surfaces (planner MUST address):

1. **No global `error.tsx` or `not-found.tsx`** at app root or `dashboard/` root [VERIFIED: `find` returned no matches]. Brand pass should add `src/app/not-found.tsx`, `src/app/error.tsx`, and `src/app/global-error.tsx` styled with `<BrandEmpty>`. Add to W1 (cheap, sets pattern for all waves).
2. **Only one `loading.tsx`** exists (`projects/loading.tsx`, 282B). Planner may add `loading.tsx` per top-level surface in each wave — discretionary, not required by D-121–128.
3. **No `icon.png` or `opengraph-image.*`** [VERIFIED: `find` returned no matches]. Only the default Next.js `favicon.ico` (25.3K) exists. W1 must ship:
   - `src/app/icon.png` (32×32 amber wordmark on transparent) — Next.js convention
   - `src/app/apple-icon.png` (180×180)
   - `src/app/opengraph-image.tsx` (Next.js dynamic OG with `ImageResponse` — recommended over static PNG since slate-50 + Geist wordmark + bilingual tagline is trivial to compose programmatically)
4. **The real sidebar is in `src/app/dashboard/layout.tsx`** (not `(admin)/layout.tsx` which is a passthrough per its own comment: "NO second SidebarProvider here — the sidebar lives only in the root src/app/dashboard/layout.tsx"). Don't double-restyle.
5. **`shadcn` is a runtime dependency** (4.8.0) in `package.json` line 40 — unusual but established. The `@import "shadcn/tailwind.css"` in globals.css line 3 depends on it. Leave alone.

**Sizing summary:** ~12 page-level files + ~18 admin components + 21 shadcn UI primitives. With Approach A (token swap propagates automatically), per-surface work in W2–W4 is mostly: (a) replace inline color utilities like `bg-blue-600` / `text-gray-700` with semantic slots (`bg-primary` / `text-muted-foreground`), (b) swap `rounded-lg`/`rounded-xl` → `rounded-md`, (c) drop `shadow-*` from cards, (d) collapse `p-6`/`p-8` → `p-3`/`p-4`. Most surfaces will be 10–30 line diffs.

## Brand Primitive Wrapping Pattern (Item 4)

**Dependencies confirmed in `package.json`:**
- `class-variance-authority` 0.7.1 [VERIFIED] — for variant API
- `clsx` 2.1.1 [VERIFIED]
- `tailwind-merge` 3.6.0 [VERIFIED]
- `@radix-ui/react-slot` 1.2.4 [VERIFIED] — needed for `asChild` pass-through
- `lucide-react` 1.16.0 [VERIFIED]
- shadcn primitives shipped: `button.tsx`, `card.tsx`, `table.tsx`, `badge.tsx`, `input.tsx`, `select.tsx`, `tabs.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `sheet.tsx`, `skeleton.tsx`, `tooltip.tsx`, `alert.tsx`, `form.tsx`, `label.tsx`, `progress.tsx`, `separator.tsx`, `sidebar.tsx`, `sonner.tsx`, `switch.tsx`, `chart.tsx` (21 total)

The standard shadcn `cn()` helper is presumed to live at `src/lib/utils.ts` per shadcn convention [ASSUMED — confirm in W1 task action; if absent, create it].

**Recommended pattern: EXTEND shadcn primitives, don't replace.**

`<BrandButton>` example (the canonical shape — Wave 1 ships this):

```tsx
// src/components/brand/BrandButton.tsx
"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const brandButtonVariants = cva(
  "rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-amber-600",
        secondary: "bg-secondary text-secondary-foreground hover:bg-slate-200",
        destructive: "bg-destructive text-white hover:bg-red-700",
        outline: "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
        ghost: "text-slate-900 hover:bg-slate-100",
      },
      size: {
        sm: "h-8 px-3 text-sm gap-1.5 [&_svg]:size-4",
        md: "h-9 px-4 text-sm gap-2 [&_svg]:size-5",
        lg: "h-10 px-5 text-base gap-2 [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

type Props = React.ComponentProps<typeof Button> &
  VariantProps<typeof brandButtonVariants>;

export function BrandButton({ variant, size, className, ...rest }: Props) {
  return (
    <Button
      {...rest}
      className={cn(brandButtonVariants({ variant, size }), className)}
    />
  );
}
```

Key choices:
- **Extends shadcn `<Button>`** rather than building from scratch. Inherits `asChild` slot, `disabled` styling, focus rings.
- Variants align with D-121 semantics: `primary` = amber (brand), `destructive` = red (semantic), `outline`/`ghost`/`secondary` = slate. No `link` variant in W1 (use `<a className="text-primary underline-offset-4 hover:underline">` directly when needed; add `link` variant later if churn justifies it).
- Sizes bake in D-126 icon sizes via `[&_svg]:size-N` so consumer JSX `<BrandButton><Check />Onayla</BrandButton>` renders the right icon size automatically.

**The 7 brand primitives Wave 1 ships:**

| Primitive | Wraps | Wave 1 responsibility |
|-----------|-------|------------------------|
| `<BrandButton>` | `ui/button` | Variant/size system above |
| `<BrandCard>` | `ui/card` | `rounded-md border border-slate-200 bg-card` — drops shadow, enforces compact `p-3`/`p-4` via subcomponents (`<BrandCard.Header>` p-3, `<BrandCard.Body>` p-4) |
| `<BrandHeading>` | plain `h1`/`h2`/`h3` (not shadcn — there is no shadcn heading) | Geist Sans 600/700, tracking-tight, size variants (`display`, `h1`, `h2`, `h3`) |
| `<BrandBadge>` | `ui/badge` | cva variants: `primary` (amber-50 bg / amber-700 text), `success` (emerald), `info` (sky), `warning` (orange), `destructive` (red), `neutral` (slate). Used in `HakedisStatusBadge.tsx` refactor. |
| `<BrandEmpty>` | composed (no shadcn equivalent) | Empty-state card: lucide icon `size-12` slate-400, heading slate-900, body slate-600, optional `<BrandButton>` CTA. Used by `not-found.tsx`, `error.tsx`, empty tables. |
| `<BrandLogo>` | composed | `<span>bayrak<span class="text-primary">.ai</span></span>` with `size` prop (`sm`/`md`/`lg`); Geist 600; sidebar uses `md`, OG/landing use `lg`. |
| `<BrandTable>` | `ui/table` | Thin wrapper that bakes in compact density (`text-sm`, `[&_th]:py-2`, `[&_td]:py-2`, `[&_th]:px-3`). Discretionary thickness (D-127 Claude's Discretion) — recommend *thin* wrapper; per-table column logic stays in the consuming surface. |

**Discretionary additions (planner decides W3):**
- `<BrandKpiTile>` — wraps `<BrandCard>` for the overview command center; bakes in icon + label + value + delta layout. Only worth shipping if 3+ surfaces use it; Phase 8/9 has KpiCard.tsx already — refactor that instead of adding a primitive.

**Where to put them:** `src/components/brand/` (D-127 default; matches existing layout convention of `src/components/admin/` for feature components and `src/components/ui/` for shadcn primitives). Do not put in `src/components/ui/brand/` — that conflates the shadcn primitive layer with the brand layer.

**Server vs client:** `<BrandButton>`, `<BrandCard>`, `<BrandHeading>`, `<BrandBadge>`, `<BrandEmpty>`, `<BrandLogo>`, `<BrandTable>` are all server-renderable except where a child shadcn component injects `'use client'` (notably Dialog, DropdownMenu, Sheet from interactive shadcn — none of these 7 wrap those). Keep brand primitives free of `'use client'` directives.

## Locked Phase 12 Contracts (Item 5)

Restated from `13-CONTEXT.md` `<canonical_refs>` + `<decisions>` (do NOT re-derive from Phase 12 sources):

1. **`LivePeriodPoller`** (`src/components/admin/LivePeriodPoller.tsx`, 3.2K):
   - MUST return `null` when `enabled === false`. Brand pass cannot remove this short-circuit.
   - When enabled, the live region is `<span role="status" aria-live="polite">` and remains **sr-only**. Brand pass restyles only the *visible* polling affordance (e.g., a dot indicator, a "live" pill). The aria-live shape is frozen.
   - Action for W2: restyle visible dot/badge using `<BrandBadge variant="info">` or similar — do not touch the sr-only `<span>` or the `enabled === false` branch.

2. **`LineSubmissionsPanel`** (`src/components/admin/LineSubmissionsPanel.tsx`, 6.4K):
   - Ships as the **8th column** on the **draft** period detail page (the traceability column).
   - Expand-row affordance (chevron) opens the panel.
   - **Column count + `colSpan` math is frozen.** Brand pass restyles the chevron icon, panel borders, and row treatment — but cannot remove, reorder, or add columns.
   - Action for W2: restyle chevron (use lucide `ChevronRight`/`ChevronDown` at `size-4`), panel border (`border-slate-200`), inner rows (compact `p-2`). Verify the table still renders 8 columns in draft state and the panel collapses correctly.

3. **`PeriodDetailControls`** (`src/components/admin/PeriodDetailControls.tsx`, 5.6K):
   - Excel + PDF buttons gated on `status !== 'draft'` (visible only when period is submitted/approved).
   - Brand pass restyles the button surface using `<BrandButton variant="secondary">` or `outline`; the **gating condition is frozen**.
   - Action for W2: swap raw `<Button>` for `<BrandButton>`, swap inline file-type icons (`FileSpreadsheet`, `FileText` from lucide) to `size-5`. Do NOT touch the `status !== 'draft'` conditional.

**Verifier checkpoint (BRAND-02 success criterion):** All three contracts above must produce identical *behavior* after Phase 13 — same DOM shape for accessibility, same gating logic, same column math. Pixel changes are expected; behavioral changes are failures.

## Security Domain

Phase 13 is restyle-only. No new routes, no new auth flows, no new user inputs, no new data persistence, no new API surfaces. The threat surface is **unchanged** from end of Phase 12. ASVS categories V2/V3/V4/V5 do not apply (no changes to authentication, sessions, access control, or input validation). V6 (cryptography) does not apply.

**One supply-chain consideration:** the `geist` npm package added in Wave 1. Verify provenance before install:
- Publisher must be Vercel (`npm view geist maintainers`) — slopcheck `[OK]` minimum bar.
- Confirm no `postinstall` script (`npm view geist scripts.postinstall`) — Vercel-published fonts should have none.
- Pin to the latest stable major; do not use a beta/RC. `npm view geist version` to confirm before adding.

No other new dependencies are recommended. lucide-react (existing) and tw-animate-css (existing) cover icon and animation needs.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Token system (color, radius, spacing) | Browser (CSS) | Frontend Server (SSR — root layout serves the stylesheet) | Pure CSS variable cascade; runs at paint time. |
| Font loading (Geist Sans + Mono) | Frontend Server (Next.js `next/font` injects `<link>` + preloads at SSR) | Browser (final render) | Next.js owns font-display, subset extraction, preload tags. |
| Brand primitives (`<BrandButton>` etc.) | Frontend Server (RSC by default) | Browser (only when wrapped shadcn component requires client) | Server-renderable composition; no client state in any of the 7 primitives. |
| Favicon + OG image | CDN / Static (Next.js `app/icon.png` is statically optimized; `opengraph-image.tsx` is server-evaluated at request or build time) | — | Next.js file-based metadata conventions. |
| Surface restyle (W2–W4) | Frontend Server (existing pages are RSC) | Browser (interactive children stay `'use client'`) | No tier change — restyling does not move logic between tiers. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Tailwind v4 oklch values for slate/amber/red palette are accurate within ±0.005 | Token Convention | LOW — planner re-pulls from tailwindcss source if pixel-exact match needed |
| A2 | `geist` package exposes `--font-geist-sans` / `--font-geist-mono` CSS variables | Geist Font Loading | LOW — planner verifies post-install; rename is trivial if different |
| A3 | `cn()` helper lives at `src/lib/utils.ts` per shadcn convention | Brand Primitive Pattern | LOW — W1 task confirms; trivially created if absent |
| A4 | BRAND-01 is satisfied by `13-CONTEXT.md` as the brand reference (per its own preamble) | Phase Requirements | LOW — planner may opt to mirror to a top-level `BRAND.md` |
| A5 | Mapbox map components (in projects/[id]/edit) do not require token-system swap | Per-Surface Inventory | MEDIUM — Mapbox uses its own style tokens; planner verifies map controls still read on slate canvas |

## Open Questions (RESOLVED)

1. **OG image — dynamic `opengraph-image.tsx` (ImageResponse) vs static PNG?**
   - What we know: D-124 specifies wordmark center-left + tagline; both approaches work.
   - Recommendation: dynamic `opengraph-image.tsx` because it composes from the same token values (single source of truth for "amber" — if amber-500 shifts in v3.1, the OG auto-updates).
   - **RESOLVED:** Plan 13-01 Task 3b ships `src/app/opengraph-image.tsx` as the dynamic Next.js `ImageResponse` variant. Confirmed in 13-01 Task 3b `<files>` list and `<verify>` grep gate `grep -q "ImageResponse" src/app/opengraph-image.tsx`.

2. **Should `<BrandTable>` bake in compact density (thicker abstraction) or stay a thin wrapper?**
   - What we know: D-127 marks this as Claude's discretion. Phase 8–12 tables (hakkediş period detail, exports period picker) all use compact density; bake-in would DRY this.
   - Recommendation: thin wrapper for W1; promote to baked density only if W2 review shows 3+ tables repeating the same density classes.
   - **RESOLVED:** Plan 13-01 Task 3a ships `<BrandTable>` as a thin wrapper around `@/components/ui/table` (re-exports `Table`, `TableHeader`, `TableBody`, etc. as `BrandTable.Root`, `BrandTable.Header`, etc.) with `text-sm` default only. Density bake-in deferred to a future phase if W2 review surfaces 3+ repetitions. Confirmed in 13-01 Task 3a `<action>` Step 1 BrandTable.tsx description.

3. **Should we add an `error.tsx` per top-level surface, or a single `app/error.tsx`?**
   - What we know: no error.tsx exists today. Next.js supports both granularities.
   - Recommendation: ship one `app/error.tsx` + one `app/global-error.tsx` + one `app/not-found.tsx` in W1 with `<BrandEmpty>`. Per-surface error boundaries are deferred to a later phase unless a real need surfaces.
   - **RESOLVED:** Plan 13-01 Task 3b ships one `src/app/error.tsx` + one `src/app/not-found.tsx` (single root error boundary + single root 404, both consuming `<BrandEmpty>`). Per-surface error boundaries deferred to a future phase. Confirmed in 13-01 Task 3b `<files>` list and `<verify>` grep gates on both files.

## Environment Availability

Phase 13 has no external runtime tools (no databases, no CLIs, no services). Only npm-package adds. All dependencies are JavaScript-only and install via `npm i`. No system tools to probe.

**New package to install:** `geist` (Vercel-published font). All other deps (cva, clsx, tailwind-merge, lucide-react, shadcn primitives) are already installed [VERIFIED in package.json].

## Sources

### Primary (HIGH confidence)
- `/Users/arifismailbayrak/bayrak-ai/package.json` — dependency verification
- `/Users/arifismailbayrak/bayrak-ai/src/app/globals.css` — current token system (Industrial Blue, full shadcn slot set)
- `/Users/arifismailbayrak/bayrak-ai/src/app/layout.tsx` — current font loading (Inter)
- `/Users/arifismailbayrak/bayrak-ai/src/app/dashboard/(admin)/layout.tsx` — passthrough confirmation
- Filesystem listings (`ls`, `find`) across all 9 surface groups — file count + sizes
- `.planning/phases/13-ux-brand-pass/13-CONTEXT.md` — locked decisions D-121 through D-128

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` lines 127–131 — BRAND-01/02/03 definitions

### Tertiary (LOW confidence — assumptions tagged in Assumptions Log)
- Tailwind v4 default palette oklch values [A1]
- Geist package CSS variable names [A2]
- shadcn `cn()` helper location [A3]

## Metadata

**Confidence breakdown:**
- Token convention: HIGH — globals.css read directly
- Font loading: HIGH — layout.tsx read directly, geist absence verified in package.json
- Per-surface inventory: HIGH — every directory listed
- Brand primitive pattern: HIGH — all required deps verified in package.json
- Phase 12 contracts: HIGH — restated from locked CONTEXT.md

**Research date:** 2026-05-29
**Valid until:** 2026-06-28 (30 days — Phase 13 is a stable restyle phase; no fast-moving libraries depend on external API stability)
