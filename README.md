# bayrak.ai

**Field-to-office operations platform for pipeline & utility-network subcontractors — structured, geolocated, AI-assisted work logging that replaces WhatsApp and phone-call field communications.**

> Saha sahipleniyor — Field accountability for utility-network contractors

---

## What is bayrak.ai

bayrak.ai is a single-tenant B2B platform that closes the loop between field workers and the office for linear-infrastructure construction (pipeline and utility-network projects).

Field workers log work through a conversational Telegram bot in Turkish. On-site auditors approve or reject submissions directly from Telegram with inline keyboard buttons. The moment an auditor approves, the office sees the update: the Bill of Quantities deducts, the live PostGIS map advances, and the hakkediş (progress billing) record updates automatically — no WhatsApp message, no phone call, no manual data entry.

```
Worker submits (Telegram bot)
  → photo + GPS location + BOQ line item + quantity + notes
  → Auditor approves / rejects on-site (Telegram inline keyboard)
  → BOQ deducts + live map advances + hakkediş updates automatically
  → Office dashboard shows real, verified, geolocated progress
```

---

## Features

### Field loop (Telegram)
- Conversational multi-step work log: photo → BOQ line selection → GPS location → quantity → notes → confirm
- Inline approve / reject keyboard for on-site auditors (first action wins, race-safe)
- Turkish-first bot language; workers need no web access

### Office dashboard
- Live project overview map with PostGIS-backed submission markers
- Per-project performance analytics and worker scorecards
- Leaderboard, SLA tracking, and audit-decision latency metrics
- Admin shell: manage projects, workers, auditors, BOQ line items, and tenant settings

### Geospatial
- PostGIS nearest-segment matching (ST_DWithin / KNN `<->` operator over GIST index)
- DXF route import with layer selection and Mapbox satellite preview gate
- LandXML alignment import with true parabolic vertical curves and clothoid spiral integration
- Chainage as-built view (km X+YYY Turkish construction convention)
- Elevation profile chart per route

### Billing & exports
- Auto-deducting BOQ: approved quantity accumulates against planned quantity in real time
- Submission-driven hakkediş: each approved submission drives the billing period automatically
- Bilingual (TR/EN) Excel exports: submission ledger, performance summary, hakkediş billing file
- PDF hakkediş export with Turkish glyph support (DejaVu Sans)

### AI assist (eval-gated)
- AI Vision photo anomaly flagging via Vercel AI SDK + Vercel AI Gateway (Claude vision)
- Fire-and-forget queue: never in the Telegram webhook critical path
- Perceptual hash deduplication: skips Claude vision call for near-duplicate photos
- **Dormant until precision eval runs on >= 30 real approved photos** (`eval_passed = true` gate)

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript 5 |
| Styling | Tailwind CSS v4 + shadcn/ui (via `src/components/brand` primitives) |
| Database | Neon Postgres 16 + PostGIS extension |
| ORM | Drizzle (drizzle-orm + drizzle-kit) |
| Telegram bot | grammY + @grammyjs/conversations + @grammyjs/storage-psql |
| Mapping | Mapbox GL JS 3.x via react-map-gl 8.x |
| Auth | Auth.js v5 magic-link (Resend email transport) |
| AI | Vercel AI SDK v6 via Vercel AI Gateway (Claude vision) |
| i18n | next-intl 4.x (TR/EN) |
| Storage | Vercel Blob |
| Exports | ExcelJS + @react-pdf/renderer |
| Testing | vitest |

---

## Repository map

| Path | Description |
|---|---|
| `src/app/` | Next.js App Router — `api/` (route handlers + Telegram webhook), `auth/`, `dashboard/`, root layout and page, OG image, icons |
| `src/actions/` | Server actions: `analytics.ts`, `boq.ts`, `hakedis.ts`, `routes.ts`, `chainage.ts`, `projects.ts`, `people.ts`, `ai-flags.ts`, `settings.ts`, `dxf-preview.ts` |
| `src/components/` | React components including `src/components/brand/` — the 7 brand primitives (BrandButton, BrandCard, BrandHeading, BrandBadge, BrandEmpty, BrandLogo, BrandTable) |
| `src/db/` | Drizzle schema definitions and `migrate.ts` migration runner |
| `src/lib/` | Shared utilities: PostGIS helpers, bot handlers, CRS reprojection, PDF builder, perceptual hash |
| `src/i18n/` | next-intl config (request config and routing) |
| `src/hooks/` | React hooks |
| `src/types/` | Shared TypeScript types |
| `messages/` | i18n message catalogs: `en.json` and `tr.json` (Turkish-first) |
| `tests/` | vitest test suite (416 passing) |
| `scripts/` | One-off scripts: seed data, CDP console-capture tooling |
| `.planning/` | GSD planning artifacts: `ROADMAP.md`, `STATE.md`, `REQUIREMENTS.md`, `phases/` |

---

## Getting started

**Prerequisites:** Node.js 20+, a Neon Postgres database with the PostGIS extension enabled.

1. Copy the environment template and fill in your values:
   ```bash
   cp .env.example .env.local
   # edit .env.local — DATABASE_URL, AUTH_SECRET, TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_MAPBOX_TOKEN, etc.
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run database migrations:
   ```bash
   npm run migrate
   ```

4. Start the development server:
   ```bash
   npm run dev
   # opens http://localhost:3000
   ```

5. Run the test suite:
   ```bash
   npx vitest run
   ```
   Note: there is **no `test` npm script** — always use `npx vitest run` directly.

---

## Documentation for AI agents

| File | Purpose |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Authoritative tech-stack rules, integration patterns, and constraints — start here |
| [`BRAND.md`](./BRAND.md) | UI design tokens (D-121..D-128) and the 7 brand primitives in `src/components/brand` — use these, not raw shadcn, from feature surfaces |
| [`AGENTS.md`](./AGENTS.md) | Cross-tool agent entry point (Codex, Cursor, Copilot, etc.) |
| [`.planning/ROADMAP.md`](./.planning/ROADMAP.md) | Phase roadmap and delivery status |
| [`.planning/STATE.md`](./.planning/STATE.md) | Current execution state, decisions log, and open questions |

---

## Localization

The Telegram worker bot is Turkish-first. The office dashboard supports TR/EN switching via next-intl. Message catalogs live in `messages/en.json` and `messages/tr.json`. All new strings must be added to both catalogs; Turkish strings are the canonical source of content intent.

---

## Deployment

Deployed on Vercel. Production: **https://www.bayrak.ai**

Deploy via CLI (not git push):

```bash
vercel --prod --yes
```

The Telegram webhook points to `https://www.bayrak.ai/api/telegram/webhook`.

---

## Status

Commercial product — single-tenant MVP. All rights reserved. No open-source license.
