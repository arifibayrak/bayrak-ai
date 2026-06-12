# bayrak.ai — Agent Context

bayrak.ai is a single-tenant B2B field-to-office operations platform for pipeline & utility-network subcontractors. Field workers log work via a conversational Telegram bot → on-site auditors approve or reject from Telegram → the Bill of Quantities deducts, the PostGIS map advances, and hakkediş (progress billing) updates automatically.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the Next.js development server (http://localhost:3000) |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run migrate` | Apply Drizzle migrations (`tsx src/db/migrate.ts`) |
| `npx vitest run` | Run the full test suite |

**Note:** There is **no `test` npm script**. Always use `npx vitest run` directly.

---

## Where canonical context lives

- **`CLAUDE.md`** — Tech-stack rules, integration patterns, version constraints, and architectural decisions. This is the authoritative reference for all implementation decisions. Start here.
- **`BRAND.md`** — UI design tokens (D-121 colour palette, D-122 typography, D-125 layout primitives) and the 7 brand primitives in `src/components/brand/`. Use these primitives — not raw shadcn — from all feature surfaces.
- **`.planning/`** — GSD planning artifacts:
  - `ROADMAP.md` — phase roadmap and delivery status
  - `STATE.md` — current execution state, key decisions log, open questions
  - `REQUIREMENTS.md` — requirement traceability
  - `phases/` — per-phase context files and summaries

---

## Conventions

- **TypeScript everywhere.** No JavaScript files in `src/`.
- **Drizzle schema** lives in `src/db/`. All migrations go through `npm run migrate` (`tsx src/db/migrate.ts`) — never `drizzle-kit push` (D-49).
- **Server actions** live in `src/actions/`. Use `export const dynamic = 'force-dynamic'` on all financial/analytics pages (v2.0 lock).
- **i18n message catalogs** in `messages/en.json` and `messages/tr.json`. Turkish-first: add the Turkish string first; EN parity required before merging.
- **Brand primitives over raw shadcn.** Import from `@/components/brand` for all feature surfaces. Raw shadcn primitives only inside the brand wrappers themselves.
- **Money math rule:** all earned-value multiplication in Postgres `SUM(quantity * unit_price)`; use `decimal.js` for any JS-side display; never accumulate money in a JS number loop.

---

## Safety notes

**CRITICAL — Database:** The `DATABASE_URL` configured in `.env.local` points at the **PRODUCTION** Neon database. Be extremely careful running seeds or migrations locally — they hit prod directly. Never commit `.env.local`.

**Deploys:** Production deploys go through `vercel --prod --yes` CLI. Git push does **not** trigger a deploy. Production URL: https://www.bayrak.ai. Telegram webhook: `https://www.bayrak.ai/api/telegram/webhook`.

**Bot path isolation:** Never call `auth()`, `logOfficeActivity()`, or `after()` from bot handlers (`src/lib/bot-*.ts`). The Telegram webhook has no Auth.js session. AI analysis (`runAiAnalysis`) must always be fire-and-forget — never awaited in the webhook path.
