<!-- GSD:project-start source:PROJECT.md -->
## Project

**bayrak.ai**

A single-tenant B2B operational platform for linear-infrastructure subcontractors (pipeline and utility-network construction) that replaces unstructured field communication — WhatsApp messages and phone calls — with a structured, trackable, geospatially-aware, AI-assisted communication loop. Field workers log work through a conversational Telegram bot; on-site auditors approve or reject from Telegram; an office dashboard shows live progress on a map and the Bill of Quantities deducts automatically as work is approved.

**Core Value:** Every unit of field work flows through one trustworthy loop — **worker submits → auditor approves on-site → central project data (BOQ + map) updates automatically** — so the office always sees real, verified, geolocated progress without chasing anyone on WhatsApp.

### Constraints

- **Tech stack**: Next.js (App Router) monolith on Vercel; Node/TypeScript route handlers for the Telegram webhook — chosen for single-deploy simplicity and solo+AI build velocity (saha ADR-0007)
- **Database**: PostgreSQL with the **PostGIS** extension (Neon supports PostGIS) — required for native nearest-segment spatial queries
- **ORM**: Drizzle — typed, lightweight, proven in saha
- **Telegram**: grammY framework; bot must support inline keyboards, photo/location message types, and inline callback buttons; field auth via Telegram User ID (HMAC where applicable)
- **Mapping**: Mapbox GL JS (Leaflet is an acceptable fallback); requires a Mapbox token
- **AI**: AI SDK via Vercel AI Gateway, default to latest Claude models for vision/anomaly assist; eval rigor required since AI is in v1
- **Auth (web)**: Auth.js email magic-link for Office Engineers
- **Localization**: Turkish-first worker bot; TR/EN switchable dashboard (i18n-ready from the start)
- **Team**: Solo founder build with AI assistance
- **Tenancy**: Single-tenant MVP; do not hardcode tenant identity in a way that blocks a future multi-tenant migration
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 15.x (latest: 16.2.6 — see note) | App Router monolith, server actions, route handlers | Single deploy on Vercel; saha-proven; Telegram webhook is a plain route handler |
| TypeScript | 5.x | All code | Type safety across BOQ schema, conversation state, PostGIS geometry |
| Tailwind CSS | 4.3.x | Styling | v4 is current; class-based, pairs perfectly with shadcn |
| shadcn/ui | latest CLI (shadcn@4.8.x) | UI component library | Add components via CLI (`npx shadcn@latest add button`); not a dependency in package.json |
### Database
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Neon (PostgreSQL 16) | Managed | Primary database | Vercel marketplace, serverless-native, branchable previews |
| PostGIS extension | Bundled with Neon | Spatial queries | Native `ST_*` functions for nearest-segment matching; pipeline route storage |
### ORM
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| drizzle-orm | 0.45.x | Database ORM | Typed, lightweight, proven in saha; native PostGIS `geometry()` column type |
| drizzle-kit | 0.31.x | Migrations & codegen | Schema push + migration files; use `drizzle-kit generate` + `migrate()` for non-interactive deploys |
### Telegram Bot
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| grammy | 1.43.x | Bot framework | Modern, typed; `webhookCallback` has native `std/http` adapter for Next.js route handlers |
| @grammyjs/conversations | 2.1.x | Multi-step conversation state machine | Sequential step flows (photo → location → qty → notes → confirm); handles replay-based state |
| @grammyjs/storage-psql | 2.5.x | Conversation/session persistence | Stores conversation state in Neon Postgres between serverless invocations |
### Authentication
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| next-auth (Auth.js v5 beta) | 5.0.0-beta.31 | Web dashboard auth | Email magic-link, no password to manage; saha-proven pattern |
| @auth/drizzle-adapter | 1.11.x | DB adapter for Auth.js | Required for magic-link verification token storage |
| resend | 6.12.x | Email transport | Simple API, generous free tier, official Auth.js provider |
### Mapping
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| mapbox-gl | 3.24.x | Map rendering | GeoJSON LineString route + point/segment overlays; official Mapbox recommended library |
| react-map-gl | 8.1.x | React wrapper | Maintained by Mapbox-adjacent team; simplest React integration for App Router client components |
### AI
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| ai (Vercel AI SDK) | 6.0.x | LLM orchestration | Single package for generateText/streamText; direct AI Gateway integration |
| Vercel AI Gateway | Platform | Model routing | Single API key (`AI_GATEWAY_API_KEY`), auto-retries, cost dashboard, model fallbacks |
### File Storage
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @vercel/blob | 2.4.x | Photo and file storage | Native Vercel integration, public URL storage; used for submission photos |
### Internationalisation
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| next-intl | 4.12.x | TR/EN switching | Native App Router + Server Components support; `getTranslations()` in async RSCs |
## Integration Patterns
### PostGIS + Drizzle: Spatial Schema
### PostGIS + Drizzle: Nearest Segment Query
- Always cast to `::geography` for metre-accurate distance (not planar degrees)
- Use `<->` KNN operator for ordered nearest-neighbor index scan
- GIST index is mandatory for performance; without it, every query is a full table scan
### Custom geography type (for explicit geography(Point,4326) columns)
### grammY Webhook on Vercel (Next.js App Router)
### grammY Conversations: Multi-Step Work Log Flow
### Auditor Approve/Reject Flow (Inline Callback)
### AI SDK Vision: Photo Anomaly Flagging
### Mapbox GL JS in Next.js App Router
### Auth.js v5 Magic-Link with Resend + Drizzle Adapter
- `users` table (id, name, email, emailVerified, image)
- `accounts` table (OAuth linkage — needed even for magic-link)
- `verificationTokens` table (identifier, token, expires — the magic-link token store)
- `sessions` table (only needed if using database sessions strategy; JWT strategy skips this)
## Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @neondatabase/serverless | latest | Neon HTTP driver | Route handlers / edge; use `pg` for bot/server code |
| @vercel/blob | 2.4.x | Photo storage | All file uploads from both bot and dashboard |
| wkx | 0.5.x | WKB hex → GeoJSON | Parsing PostGIS geometry results in custom `fromDriver` functions |
| zod | 3.x | Schema validation | Validate bot conversation inputs, API request bodies |
| ExcelJS | latest | BOQ Excel import | Office engineer BOQ upload workflow |
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| ORM | Drizzle | Prisma | Prisma's PostGIS support is also via raw SQL; Drizzle is lighter and saha-proven |
| Bot framework | grammY | node-telegram-bot-api | grammY has TypeScript-first design, conversations plugin, and active development |
| Map library | mapbox-gl + react-map-gl | Leaflet + react-leaflet | Mapbox has better satellite imagery and vector tile performance for field use; Leaflet is the fallback |
| Auth provider | Auth.js v5 | Clerk | Clerk costs money at scale; Auth.js is free and saha-proven |
| Email transport | Resend | Nodemailer | Resend has a simple HTTP API, no SMTP config; generous free tier (3k emails/month) |
| AI Gateway | Vercel AI Gateway | Direct Anthropic SDK | Gateway adds cost dashboard, retries, model fallbacks at zero code cost |
| Conversation sessions | @grammyjs/storage-psql | In-memory | Serverless functions have no shared memory between invocations; Postgres persistence is mandatory |
| i18n | next-intl | next-i18next | next-intl is App Router native; next-i18next was designed for Pages Router |
## Installation
# Core framework
# Database + ORM
# Auth
# Telegram bot
# Map
# AI
# File storage
# i18n
# Utilities
## Environment Variables Reference
# Database
# Auth
# Telegram
# Mapbox (public — safe to expose)
# AI Gateway
# Use static API key below, OR provision via OIDC (vercel env pull on Vercel projects - no manual rotation needed)
## Confidence Assessment
| Area | Confidence | Notes |
|------|------------|-------|
| Neon + PostGIS enablement | HIGH | Official Neon docs confirm `CREATE EXTENSION IF NOT EXISTS postgis` — no special setup |
| Drizzle geometry(Point) | HIGH | Official Drizzle docs show `geometry()` column with `type: 'point'` |
| Drizzle LineString schema | MEDIUM | Works but requires manual migration SQL edit (known limitation, documented) |
| Drizzle geography type | MEDIUM | No native type; `::geography` cast in SQL`` works; custom type with `wkx` for fromDriver |
| ST_DWithin / ST_ClosestPoint via sql`` | HIGH | Pattern confirmed in multiple sources; standard Drizzle raw-SQL escape hatch |
| grammY webhook on Vercel (std/http) | HIGH | Official grammY docs + Vercel docs confirm the pattern |
| grammY conversations v2 replay engine | HIGH | Official docs confirm; `conversation.external()` for all side effects |
| @grammyjs/storage-psql for serverless | HIGH | Confirmed available; same version as other grammY storage adapters |
| AI SDK v6 + AI Gateway + Claude vision | HIGH | Official Vercel AI Gateway docs confirm model string format; AI SDK image content format verified |
| react-map-gl v8 + GeoJSON layers | HIGH | npm version confirmed 8.1.x; pattern matches Mapbox official React tutorial |
| Auth.js v5 beta magic-link + Drizzle | HIGH | Official authjs.dev docs confirmed; beta has been stable >1 year |
| next-intl App Router Server Components | HIGH | Official next-intl docs confirm `getTranslations()` async RSC pattern |
## Sources
- Neon PostGIS: https://neon.com/docs/extensions/postgis
- Drizzle PostGIS geometry point: https://orm.drizzle.team/docs/guides/postgis-geometry-point
- Drizzle LineString: https://spin.atomicobject.com/linestring-geometry-drizzle/
- Drizzle PostGIS polygons (NestJS): https://wanago.io/2025/01/20/api-nestjs-postgis-polygons-postgresql-drizzle/
- grammY Vercel hosting: https://grammy.dev/hosting/vercel
- grammY Conversations plugin: https://grammy.dev/plugins/conversations
- grammY storages repo: https://github.com/grammyjs/storages/tree/main/packages
- grammY Next.js App Router example: https://www.launchfa.st/blog/telegram-nextjs-app-router
- Vercel AI Gateway getting started: https://vercel.com/docs/ai-gateway/getting-started/text
- AI SDK prompt formats: https://ai-sdk.dev/docs/foundations/prompts
- Mapbox GL JS React tutorial: https://docs.mapbox.com/help/tutorials/use-mapbox-gl-js-with-react/
- Auth.js Resend provider: https://authjs.dev/getting-started/providers/resend
- Auth.js Drizzle adapter: https://authjs.dev/getting-started/adapters/drizzle
- Auth.js email authentication: https://authjs.dev/getting-started/authentication/email
- next-intl App Router: https://next-intl.dev/docs/getting-started/app-router
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
