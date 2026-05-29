# Phase 13: UX & Brand Pass - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning
**Note:** This CONTEXT.md is the de facto bayrak.ai brand reference (BRAND-01) until a separate Figma/Pencil/brand-kit file is checked into the repo. Downstream agents MUST read this as the source of truth for palette, typography, voice, logo, layout primitives, icon system, sequencing, and visual analogs.

<domain>
## Phase Boundary

Re-skin every existing dashboard surface (admin shell, overview, people, submission detail, analytics + scorecards, hakkediş hub + period detail + Phase 12 traceability column, exports hub + period-detail controls, projects + BOQ + people-assignment, auth/sign-in) using the bayrak.ai brand language defined below. Build shared brand component primitives (`<BrandButton>`, `<BrandCard>`, `<BrandHeading>`, `<BrandEmpty>`, `<BrandLogo>` etc.) wrapping shadcn primitives, so future phases inherit the language by default instead of reaching for unbranded defaults.

**In scope:** every shipped UI surface from Phase 1 through Phase 12; brand token system in `tailwind.config.ts` / Tailwind v4 CSS variables; shared brand component primitives in `src/components/brand/`; logo (typeset wordmark) + favicon + OG image.

**Out of scope:** functional changes to any v1/v2/v3.0 capability; new dashboard features; dark mode (deferred to v3.1+); custom industry icons (deferred to v3.1+); abstract logo mark (deferred to v3.1+); PDF font swap (DejaVu Sans stays in `src/lib/pdf/fonts.ts` per Phase 11 contract D-106); Telegram bot copy (out-of-app surface, separate translation work).

</domain>

<decisions>
## Implementation Decisions

### Color palette + semantic roles (D-121)

- **Direction:** Slate + amber. Cool slate as the canvas, warm amber as the brand accent.
- **Light mode only** in Phase 13. Dark mode deferred to v3.1+ (office engineers work in daylight; field-worker surfaces don't exist yet).
- **Tokens (Tailwind v4 — concrete defaults; planner may tune within ±1 stop):**
  - Canvas: `slate-50` background; `slate-900` body text
  - Surface: `white` cards; `slate-100` subtle backgrounds; `slate-200` borders
  - Primary brand: `amber-500` interactive states; `amber-600` hover; `amber-50` subtle background
  - Semantic — destructive / reject / error: `red-600` (red stays semantically reserved — NOT brand primary)
  - Semantic — success / approve: `emerald-600`
  - Semantic — info: `sky-600`
  - Semantic — warning: `orange-500` (NOT amber — amber is the brand accent; warning needs a different hue to avoid clash)
- **Why amber not red despite *bayrak* meaning "flag":** red would conflict with the destructive/reject semantic that every data dashboard needs. Amber nods to Turkish flag-gold associations without claiming red.

### Typography (D-122)

- **Screen:** Geist Sans (body + headings, weight-based hierarchy: 400 body, 500 emphasis, 600 semibold, 700 bold), Geist Mono (code, monetary amounts in tables, IDs).
- **Why Geist:** stack-native (Vercel-deployed Next.js + Vercel-published font), free, crisp at small sizes (matters for hakkediş tables), Latin Extended-A covers all Turkish characters (ğ ş ı İ ç ö ü), single family.
- **PDF stays DejaVu Sans** (`src/lib/pdf/fonts.ts`, Phase 11 D-106) — different concern, no change in Phase 13.

### Voice & tone (D-123)

- **TR address:** *siz* (formal). Action-first CTAs (`Onayla`, `Reddet`, `Dışa Aktar`, `Tahakkuk Et`), NOT verbose `Onaylamak için tıklayın` style.
- **EN parity:** action-first CTAs (`Approve`, `Reject`, `Export`, `Mark Submitted`).
- **Why:** matches what's already shipped across Phases 8–12; modern Turkish SaaS norm (Trendyol, Getir, Hepsiburada).
- **Errors / confirmations:** *siz* address in TR; second-person plural neutral in EN.

### Logo + visual marks (D-124)

- **Wordmark only:** `bayrak` in Geist Sans 600 `slate-900` + `.ai` in Geist Sans 600 `amber-500`. The amber `.ai` suffix IS the brand mark.
- **Sidebar header:** wordmark at ~40px line-height, top-left, with `~16px` padding-left matching nav rows below.
- **Favicon:** monochrome amber `bayrak.ai` wordmark on transparent (SVG) + `slate-50` rasterized PNG fallback at 32×32 + 16×16.
- **OG image (`opengraph-image.png`):** wordmark center-left on `slate-50` background with tagline "Saha sahipleniyor / Field accountability for utility-network contractors" in Geist Sans 400 `slate-700`.
- **PDF header:** Phase 11 hakkediş PDF already uses DejaVu Sans for Turkish glyphs; PDF wordmark can use DejaVu Sans 700 with same slate / amber color treatment (planner picks pixel exact).
- **Deferred to v3.1+:** abstract / flag-literal / industry-literal marks. Wordmark-only ships v3.0.

### Layout primitives (D-125)

- **Border-radius:** `rounded-md` (Tailwind default `0.375rem`) on cards, buttons, inputs, modals. NO `rounded-lg/xl/2xl/full` except: avatar circles + status pills.
- **Spacing density:** Compact. Cards `p-2` for table rows / `p-3` for KPI tiles / `p-4` for page-level sections. Default gap-2 between sibling rows, gap-3 between column groups, gap-4 between page sections. NO `p-6/p-8` defaults.
- **Shadow depth:** Flat. NO `shadow-sm/md/lg/xl/2xl` on cards. Cards use `border border-slate-200` (or `border-slate-300` for emphasis) only. Exception: dropdowns / popovers / dialogs may use shadcn's default popover shadow because they need depth signal.
- **Why:** matches the Procore / Autodesk industry-utility analog (D-128); compact density fits data-heavy hakkediş tables; flat depth reads as serious financial software.

### Icon system (D-126)

- **Keep lucide-react** at its current version. Already in `package.json`, already used across Phases 8–12.
- Stroke weight: lucide default (`stroke-width="2"`). Icon size: `size-4` (16px) inline with text, `size-5` (20px) in buttons, `size-6` (24px) in section headers.
- **Deferred to v3.1+:** custom industry icons (pipeline section, BOQ line, hakkediş certificate, audit decision) — layer on top of lucide once a designer is in the loop.

### Sequencing + scope priority (D-127)

- **Anchored incremental.** Phase 13 ships in 4 waves; each wave validates the brand primitives on a real surface before the next wave starts.
  - **Wave 1 — Brand spine:** brand token system in `tailwind.config.ts` (or Tailwind v4 CSS-variable equivalent), `src/components/brand/` primitives package (`<BrandButton>`, `<BrandCard>`, `<BrandHeading>`, `<BrandEmpty>`, `<BrandLogo>`, `<BrandBadge>`, `<BrandTable>` thin wrappers around shadcn equivalents), admin shell re-skin (sidebar, top bar, wordmark), font loading (Geist Sans + Geist Mono via `next/font`), favicon + OG image. **Output:** any new surface from this point inherits the brand by importing from `@/components/brand`.
  - **Wave 2 — Hakkediş + Exports:** re-skin `/dashboard/(admin)/hakedis/*` (hub, period detail, Phase 12 LivePeriodPoller polling indicator, LineSubmissionsPanel traceability column, PeriodDetailControls export buttons) and `/dashboard/(admin)/exports/*` (hub, three trigger cards, period picker table). Highest-velocity daily surfaces for the office engineer.
  - **Wave 3 — Analytics + People:** re-skin overview command center, scorecards (worker / auditor / office-engineer), leaderboard, per-person profile pages, submission detail page.
  - **Wave 4 — Projects + Auth:** re-skin projects list, project detail, BOQ table, GeoJSON upload, people assignment, sign-in / magic-link consume page.

### Visual reference analogs (D-128)

- **Cited references:** Procore + Autodesk Construction Cloud. Industry-utility density, function-over-form, dense data tables, navigation-heavy.
- **Deliberate departure:** both Procore and Autodesk use **blue** as primary. bayrak.ai uses **amber** — this is the market differentiator against the construction-software-blue norm. The accent color is the single most identity-bearing decision.
- **NOT cited references (rejected during discussion):** Linear, Vercel dashboard, Stripe, Notion. They were the planner's recommendation but lose the industry-correct read the user wants.
- **Implication for planner:** when in doubt about layout density or table treatment, look at how Procore renders its budget / invoice tables. When in doubt about color, depart from their blue and use the locked amber instead.

### Pre-decided technical (planner MUST honor — locked from v1/v2/v3.0)

- **TR + EN parity** on every label; no English-only or Turkish-only strings.
- **Tailwind v4.3.x + shadcn/ui via CLI** (`npx shadcn@latest add`) is the component-installation pattern. Brand primitives wrap shadcn primitives; they do not replace them.
- **No functional regression.** Every existing capability (Phases 1–12) must still work identically after Phase 13. Verifier compares behavior, not pixels.
- **Phase 11 PDF generation is OUT OF SCOPE** — DejaVu Sans stays in `src/lib/pdf/fonts.ts`.
- **Phase 12 LivePeriodPoller polling indicator** (`<span role="status" aria-live="polite">`) keeps its sr-only-when-enabled contract; brand pass cannot remove the accessibility shape, only restyle visible affordances.

### Claude's Discretion

- Exact Tailwind v4 token names (`--color-brand-primary` vs `--brand-amber-500` vs a different convention) — planner picks based on Tailwind v4 idioms.
- Whether the brand primitives live in `src/components/brand/` (recommended) or `src/components/ui/brand/` — pick whichever matches existing project layout best.
- Exact OG image dimensions and rendering (`opengraph-image.tsx` Next.js convention vs static PNG).
- Whether `<BrandTable>` is a thin wrapper around shadcn `Table` or a slightly thicker abstraction that bakes in column-count + compact density.
- Per-surface micro-adjustments inside the locked density / depth / radius envelope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §Milestone v3.0 + §Phase 13 — phase goal + success criteria
- `.planning/REQUIREMENTS.md` §v3.0 §UX & Brand Pass — BRAND-01, BRAND-02, BRAND-03 definitions
- `.planning/PROJECT.md` §Current Milestone v3.0 — milestone framing

### Brand reference (this file is the source of truth for v3.0)
- **`.planning/phases/13-ux-brand-pass/13-CONTEXT.md`** — THIS file. Until a separate brand kit / Figma exists, this CONTEXT.md is the canonical bayrak.ai brand reference and satisfies BRAND-01.

### Visual analogs the user picked
- **Procore** (https://www.procore.com) — observe the budget / invoice / change-order tables. Density, column treatment, secondary-action affordances.
- **Autodesk Construction Cloud** (https://construction.autodesk.com) — observe the project home + cost-management modules. Sidebar nav weight, data table treatment.
- bayrak.ai departs from both on **color**: replaces their blue primary with amber.

### Existing surfaces in scope (read each before re-skinning)
- `src/app/dashboard/(admin)/layout.tsx` + sidebar component + top-bar (Phase 8 admin shell)
- `src/app/dashboard/(admin)/page.tsx` (Phase 8 overview / command center)
- `src/app/dashboard/(admin)/hakedis/page.tsx` + `[periodId]/page.tsx` (Phase 10 + Phase 12)
- `src/components/admin/PeriodDetailControls.tsx` (Phase 10, extended in Phase 11)
- `src/components/admin/LivePeriodPoller.tsx` + `src/components/admin/LineSubmissionsPanel.tsx` (Phase 12)
- `src/app/dashboard/(admin)/exports/page.tsx` (Phase 11)
- `src/app/dashboard/(admin)/analytics/**/*.tsx` (Phase 9)
- `src/app/dashboard/(admin)/people/**/*.tsx` (Phase 9)
- `src/app/dashboard/projects/**/*.tsx` (Phase 1 + Phase 8 carry)
- `src/app/auth/**/*.tsx` (Phase 1)

### Project conventions
- `CLAUDE.md` §Tech Stack — Tailwind v4.3.x + shadcn/ui via CLI; locked
- `package.json` — confirm Geist + lucide-react are already in deps (lucide-react is; Geist via `next/font` is zero-dep)

### Prior phase context affecting Phase 13 scope
- `.planning/phases/12-submission-driven-hakkedi/12-CONTEXT.md` — locked Phase 12 UI shapes brand pass must respect (LivePeriodPoller null-on-disabled contract; LineSubmissionsPanel as 8th column on draft period detail page)
- `.planning/phases/11-exports/11-CONTEXT.md` — D-108 distributed trigger surface; export hub + per-period button parity must survive the re-skin

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **shadcn primitives** already installed: Button, Card, Table, Badge, Input, Select, Tabs, Dialog, Popover, DropdownMenu, Sheet, Skeleton, Tooltip (verified by ad-hoc grep across Phases 8–12). Brand primitives wrap these — they do NOT swap or remove them.
- **lucide-react** already imports ~40 icons across Phases 8–12 (Calendar, FileSpreadsheet, FileText, X, Check, ChevronDown, ArrowUpDown, etc.) — keep all; only restyle if Wave 1 changes icon size defaults.
- **`messages/en.json` + `messages/tr.json`** — bilingual catalog already covers Phases 1–12. Any new labels Phase 13 introduces (brand-specific strings: "Yeni özellik" badges, brand-loading states, etc.) get keys in both files.

### Established Patterns
- **`(admin)` route group** is the Phase 8 IA. Brand pass restyles inside it but does NOT restructure routes.
- **Server Components by default; `'use client'` only when needed.** Brand primitives should be server-renderable where possible (BrandButton can be server; BrandCard is server; only interactive things like polling indicators need 'use client').
- **shadcn install pattern: `npx shadcn@latest add <component>`** — DO NOT npm-install components.
- **next-intl `getTranslations` for RSC, `useTranslations` for client.** Both bilingual.

### Integration Points
- **Wave 1 token system** — `tailwind.config.ts` color extensions OR Tailwind v4 `@theme` CSS variables; planner picks based on v4 idioms. Every subsequent wave reads from this.
- **`src/components/brand/`** (new directory) — Wave 1 ships ~7 primitives. Waves 2–4 consume.
- **`src/app/layout.tsx`** — root font loading via `next/font/google` (Geist Sans + Geist Mono). Single edit in Wave 1; touches every page.
- **`favicon.ico` + `app/icon.png` + `app/opengraph-image.png`** — Wave 1 ships all three.

</code_context>

<specifics>
## Specific Ideas

- **User's exact phrasing (recorded for downstream verification):** *"all app looks very bad, I dont like the UI - UX it is very un-professional, check the bayrak.ai logos / structure don't make it this way, focus on the styles later."* Phase 13 is the "focus on the styles later" deliverable.
- **The amber `.ai` suffix is the entire brand mark for v3.0.** Don't over-design beyond this. No abstract glyph, no flag-literal mark, no industry icon-mark. Wordmark + amber suffix is enough.
- **Procore + Autodesk Construction Cloud are the visual analogs** — when in doubt about a layout decision, the answer is "what would Procore do, minus the blue." Amber replaces blue throughout.
- **No dark mode in Phase 13.** Defer it. If a v3.1 phase later adds field-worker surfaces, that's the time.
- **No custom industry icons in Phase 13.** Lucide covers it. Defer custom marks to a designer engagement.
- **The brand pass is restyling-only.** Verifier compares behavior, not pixels. Functional regressions on any v1/v2/v3.0 capability fail the phase.

</specifics>

<deferred>
## Deferred Ideas

- **Dark mode** — v3.1+ when field-worker surfaces exist.
- **Custom industry icons** (pipeline section, BOQ line, hakkediş certificate, audit decision marks) — v3.1+ when a designer can author them.
- **Abstract / flag-literal logo mark** — v3.1+ alongside the designer engagement.
- **Linear / Vercel / Stripe-style aesthetic** — explicitly rejected during discussion in favor of Procore + Autodesk industry-utility density. Don't re-litigate unless the user changes their mind on D-128.
- **Telegram bot copy + voice** — bot is an out-of-app surface (worker submissions). Out of Phase 13 scope. Separate translation pass would be its own phase if ever needed.
- **PDF brand refresh** — DejaVu Sans stays per Phase 11 D-106. A PDF visual refresh (header layout, page numbering, footer) could happen in a separate v3.x phase but is NOT Phase 13 work.

</deferred>

---

*Phase: 13-UX-Brand-Pass*
*Context gathered: 2026-05-29*
