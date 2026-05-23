# Phase 1: Foundation — Research

**Researched:** 2026-05-24
**Domain:** Next.js 15 App Router greenfield scaffold + Drizzle/PostGIS schema + Auth.js v5 magic-link allowlist + minimal grammY /start webhook + ExcelJS BOQ import + GeoJSON LineString validation + next-intl 4.x cookie-locale
**Confidence:** HIGH (all stack decisions locked in CONTEXT.md; package versions verified against npm registry; integration patterns verified against official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Onboarding is self-start + office approval. A person opens the bot and taps Start; the bot's `/start` handler captures their Telegram user ID (and Telegram name) into a `pending_people` list. The office then sets their display name, role (worker/auditor), and project assignment(s) from the dashboard, promoting them to an active person. No manual entry of raw numeric Telegram IDs.
- **D-02:** A minimal Telegram webhook + `/start` handler ships in Phase 1 — just enough to register a pending person and acknowledge them. The full conversational state machine is Phase 2.
- **D-03:** A person can hold a role (worker and/or auditor) and be assigned to one or more projects. Model the person↔project assignment as a join table carrying the role, so the same person could be a worker on one project and an auditor on another.
- **D-04:** Phase 1 ships both manual BOQ line-item CRUD and a spreadsheet importer.
- **D-05:** Import format is Excel `.xlsx` (ExcelJS) with a downloadable template; columns map to material, unit, contracted quantity. Show a preview-then-confirm step before committing imported rows. CSV import is a nice-to-have, not required for Phase 1.
- **D-06:** BOQ line item fields for v1: material/description, unit (e.g., m, m³, pc), contracted quantity, and a derived/maintained remaining balance. Unit price is omitted in v1 — leave the schema able to add a nullable `unit_price` later.
- **D-07:** The pipeline route enters via `.geojson` file upload. The server validates it is a single WGS84 LineString (coordinate order `lng,lat`) before saving; reject anything else with a clear error.
- **D-08:** Store the route as `geometry(linestring,4326)`. Because Drizzle generates `geometry(point,4326)` by default, the generated migration SQL must be hand-edited to `linestring` — document this in the migration file as a comment so it isn't silently regressed.
- **D-09:** Add a nullable `tenant_id` to every domain table now, with a single default tenant seeded for v1. This keeps the future multi-tenant migration cheap at negligible upfront cost. Do not build any tenant-switching UI in v1.
- **D-10:** PostGIS extension is created in the first migration (`CREATE EXTENSION IF NOT EXISTS postgis;` as the first statement). Spatial columns use `geography` where metre-accurate distance is needed (downstream phases); the route is `geometry(linestring,4326)`. GiST indexes on spatial columns.
- **D-11:** Magic-link login (Auth.js v5 beta + `@auth/drizzle-adapter`) is restricted to an allowlist of office emails (env-configured list and/or an `office_users` table). A magic-link request for a non-allowlisted address must not grant access.

### Claude's Discretion

- Exact table/column names, indexes, and Drizzle schema organization — planner/executor decide, honoring D-06/D-09/D-10.
- Dashboard information architecture (project list → project detail with BOQ / route / people sections) — sensible shadcn/ui layout; the UI-SPEC has already been approved.
- Where the allowlist lives (env var vs DB table) — pick the simpler robust option during planning.
- Excel template column headers and validation error copy (TR/EN).

### Deferred Ideas (OUT OF SCOPE)

- Draw-route-on-map ingestion — revisit alongside Phase 5 Mapbox dashboard or later.
- CSV BOQ import — only Excel `.xlsx` is required for Phase 1.
- BOQ unit price — needed only for hakkediş (v2); schema leaves room.
- Tenant-switching / multi-tenant UI — schema hedge only in v1; full multi-tenancy is v2 (TEN-01).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Office Engineer can sign in via email magic-link (Auth.js) | Auth.js v5 beta + Resend + `signIn` callback allowlist pattern (Section: Auth.js Allowlist) |
| AUTH-02 | Office Engineer can register a Worker by mapping their Telegram User ID to a name | `pending_people` → approval → `people` flow; Telegram `/start` webhook upsert (Section: Minimal /start Webhook) |
| AUTH-03 | Office Engineer can register an Auditor by mapping their Telegram User ID to a name | Same flow as AUTH-02 with role=auditor (Section: Schema — people/pending_people) |
| AUTH-04 | Office Engineer can assign workers and auditors to specific projects | `assignments` join table with `role_on_project` column (Section: Schema — assignments) |
| SETUP-01 | Office Engineer can create and edit a project | `projects` table + Server Actions CRUD (Section: Architecture Patterns) |
| SETUP-02 | Office Engineer can define BOQ line items (material, unit, contracted quantity) | `boq_items` table + ExcelJS import (Section: BOQ Import) |
| SETUP-03 | Office Engineer can upload the project's pipeline route as a GeoJSON LineString | GeoJSON validation + `ST_GeomFromGeoJSON` + manual migration edit (Section: GeoJSON Upload) |
| SETUP-04 | Office Engineer can view the remaining balance per BOQ line item | `planned_qty` − `approved_qty` computed at read time OR maintained column (Section: Schema — boq_items) |
| I18N-02 | Office dashboard is switchable between Turkish and English | next-intl 4.x without URL-prefix routing; cookie-based locale; `tr.json` / `en.json` (Section: next-intl Setup) |
</phase_requirements>

---

## Summary

Phase 1 is a pure greenfield build that establishes every piece of infrastructure all later phases depend on: the Neon/PostGIS database with the complete Drizzle schema, Auth.js v5 magic-link auth gated to an office allowlist, office CRUD for projects / BOQ / GeoJSON routes / people, a minimal Telegram `/start` webhook that feeds the pending-person queue, and TR/EN i18n. There is no existing code to reuse; the scope is establishing the foundation patterns (Drizzle schema conventions, Server Actions, Auth.js session, next-intl) that Phases 2–6 build directly on.

The most consequential decisions for planning are the schema design and the build order within the phase. The full Drizzle schema — tenants, office_users, projects, boq_items, routes, people, pending_people, assignments, and the Auth.js tables — must be defined and migrated before any UI work can proceed. The PostGIS extension creation (migration 0000), the manual `geometry(linestring,4326)` edit, and the GiST indexes are schema-level, non-negotiable, and error-prone if left undocumented.

The recommended allowlist approach is env-var primary (a comma-separated `AUTH_ALLOWED_EMAILS` list) with an `office_users` DB table as a secondary source, checked in the Auth.js `signIn` callback. This keeps the first office engineer reachable without a bootstrapping problem (no DB record needed before first sign-in) while allowing the DB-table path to be wired for Phase 1 completeness.

**Primary recommendation:** Build in this strict order — (1) project scaffold + env layout, (2) PostGIS migration 0000 + full Drizzle schema, (3) Auth.js allowlist auth, (4) Telegram /start webhook, (5) project/BOQ/people Server Actions + UI, (6) GeoJSON upload, (7) ExcelJS import, (8) next-intl i18n wiring.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Magic-link email delivery | Auth.js + Resend (API layer) | — | Auth.js handles token generation; Resend delivers email; no browser involvement |
| Allowlist enforcement | API / Auth.js `signIn` callback | — | Must be server-side; browser cannot be trusted |
| Session check (dashboard guard) | Frontend Server (Next.js middleware / layout) | — | `auth()` in RSC layout or middleware; redirects unauthenticated requests |
| Project / BOQ CRUD | API / Backend (Server Actions) | Frontend Server (RSC fetch) | Server Actions own mutations; RSCs own reads |
| GeoJSON validation | API / Backend (Server Action) | — | Validation must run server-side before DB insert |
| GeoJSON storage | Database / PostGIS | — | `geometry(linestring,4326)` column; `ST_GeomFromGeoJSON` on insert |
| ExcelJS BOQ parsing | API / Backend (Server Action or Route Handler) | — | File buffer parsed in Node.js; browser preview data returned |
| Telegram /start webhook | API / Route Handler (`/api/telegram/webhook`) | — | External webhook receiver; runs in Node.js runtime |
| Pending-person upsert | API / Backend (DB via Drizzle) | — | Called from webhook handler; upserts `pending_people` row |
| People approval (pending → active) | API / Backend (Server Action) | — | Promotes pending_person to `people`; sets role + project assignment |
| TR/EN locale switching | Browser / Client | Frontend Server (cookie) | Cookie written on toggle click; read by next-intl's `getRequestConfig` on every RSC render |
| i18n string resolution | Frontend Server (RSC) | — | `getTranslations()` is async RSC API; strings passed as props to client components |
| Schema migrations | Database / Drizzle-kit | — | `drizzle-kit generate` + `migrate()` in startup script |

---

## Standard Stack

### Core (Phase 1 installs)

| Library | Verified Version | Purpose | Why Standard |
|---------|-----------------|---------|--------------|
| next | 15.5.18 (`backport` tag; use `npx create-next-app@latest`) | App Router monolith + Server Actions + route handlers | CLAUDE.md constraint; single Vercel deploy; saha-proven |
| typescript | 5.x (bundled with create-next-app) | All code | Type safety across schema, conversation state, PostGIS |
| tailwindcss | 4.3.0 | Styling | CLAUDE.md constraint; v4 current; shadcn/ui requires it |
| shadcn/ui | CLI 4.8.x (`npx shadcn@latest`) | UI components | CLAUDE.md constraint; not a package.json dep — added via CLI |
| drizzle-orm | 0.45.2 | ORM | CLAUDE.md constraint; typed, lightweight, PostGIS-compatible |
| drizzle-kit | 0.31.10 | Schema generation + migrations | Paired with drizzle-orm |
| @neondatabase/serverless | 1.1.0 | Neon HTTP/WebSocket driver | Vercel serverless-native; use for route handlers |
| pg | latest (`npm i pg @types/pg -D`) | Node.js Postgres driver | Required by `@auth/drizzle-adapter` and Drizzle migrations |
| next-auth | 5.0.0-beta.31 | Office dashboard auth (magic-link) | CLAUDE.md constraint; beta stable since 2024 |
| @auth/drizzle-adapter | 1.11.2 | Drizzle DB adapter for Auth.js | Required for magic-link token storage |
| resend | 6.12.3 | Email transport for magic-link | CLAUDE.md constraint; simple HTTP API, no SMTP |
| grammy | 1.43.0 | Telegram bot framework | CLAUDE.md constraint; `webhookCallback` + std/http adapter |
| next-intl | 4.12.0 | TR/EN dashboard i18n | CLAUDE.md constraint; App Router native |
| zod | 4.4.3 | GeoJSON validation + form schema | Standard validation library |
| exceljs | 4.4.0 | BOQ Excel `.xlsx` import + template generation | CLAUDE.md constraint |
| react-hook-form | 7.76.1 | Dashboard forms | Paired with shadcn `form` component |
| lucide-react | 0.x (bundled with shadcn/ui) | Icons | shadcn/ui default |

### Supporting (Phase 1, used in later phases too)

| Library | Verified Version | Purpose | When to Use |
|---------|-----------------|---------|-------------|
| wkx | 0.5.0 | WKB hex → GeoJSON parsing | PostGIS geometry `fromDriver` custom types |
| @vercel/blob | 2.4.0 | Photo/file storage | GeoJSON upload in Phase 1; photos in Phase 2+ |

### Not installed in Phase 1 (reserved for later phases)

| Library | Phase | Reason deferred |
|---------|-------|----------------|
| @grammyjs/conversations | 2 | Full conversation flow is Phase 2 |
| @grammyjs/storage-psql | 2 | Session persistence needed when conversation added |
| mapbox-gl / react-map-gl | 5 | Map rendering is Phase 5 |
| ai (Vercel AI SDK) | 6 | AI vision is Phase 6 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| next-auth beta.31 | Clerk | Clerk costs money at scale; Auth.js is free and CLAUDE.md-mandated |
| ExcelJS | SheetJS (xlsx) | ExcelJS has cleaner API and MIT license; SheetJS has dual license |
| Resend | Nodemailer | Resend HTTP API; no SMTP config needed; official Auth.js provider |
| next-intl cookie routing | next-intl URL routing | Cookie routing avoids `/tr/` and `/en/` URL prefixes; cleaner URLs for a single-locale-per-user dashboard |

**Installation commands:**

```bash
# Step 1: Scaffold (run in parent dir, then cd bayrak-ai)
npx create-next-app@latest bayrak-ai --typescript --tailwind --app --src-dir --import-alias "@/*"

# Step 2: shadcn/ui (inside bayrak-ai/)
npx shadcn@latest init --defaults
# Choose: style=default, base color=neutral, CSS variables=yes

# Add all Phase 1 shadcn components:
npx shadcn@latest add button input label table card badge dialog tabs form separator toast dropdown-menu select alert progress skeleton sonner

# Step 3: Database + ORM
npm install drizzle-orm @neondatabase/serverless pg
npm install -D drizzle-kit @types/pg

# Step 4: Auth
npm install next-auth@beta @auth/drizzle-adapter resend

# Step 5: Telegram bot (minimal — no conversations yet)
npm install grammy

# Step 6: i18n
npm install next-intl

# Step 7: Utilities
npm install zod exceljs react-hook-form @hookform/resolvers wkx
npm install @vercel/blob
```

---

## Package Legitimacy Audit

> slopcheck was unavailable (PyPI SSL error in sandbox). Manual verification performed against official documentation and npm registry for all packages. All packages are tagged `[ASSUMED]` pending slopcheck confirmation, except those noted as `[VERIFIED]` from official docs.

| Package | Registry | Source Repo | Official Docs | Disposition |
|---------|----------|-------------|---------------|-------------|
| next | npm | github.com/vercel/next.js | nextjs.org | Approved — major framework |
| drizzle-orm | npm | github.com/drizzle-team/drizzle-orm | orm.drizzle.team | Approved — CLAUDE.md mandated |
| drizzle-kit | npm | github.com/drizzle-team/drizzle-orm | orm.drizzle.team | Approved — paired with drizzle-orm |
| next-auth (beta) | npm | github.com/nextauthjs/next-auth | authjs.dev | Approved — CLAUDE.md mandated |
| @auth/drizzle-adapter | npm | github.com/nextauthjs/next-auth | authjs.dev | Approved — official Auth.js package |
| resend | npm | github.com/resendlabs/resend-node | resend.com/docs | Approved — CLAUDE.md mandated |
| grammy | npm | github.com/grammyjs/grammY | grammy.dev | Approved — CLAUDE.md mandated; confirmed source repo |
| next-intl | npm | github.com/amannn/next-intl | next-intl.dev | Approved — CLAUDE.md mandated; confirmed source repo |
| exceljs | npm | github.com/exceljs/exceljs | github.com/exceljs | Approved — established 8+ yr project; confirmed source repo |
| zod | npm | github.com/colinhacks/zod | zod.dev | Approved — de-facto standard |
| wkx | npm | github.com/cschwarz/wkx | confirmed source repo | Approved — narrow utility; confirmed source |
| @neondatabase/serverless | npm | github.com/neondatabase/serverless | neon.tech/docs | Approved — official Neon package |
| @vercel/blob | npm | github.com/vercel/storage | vercel.com/docs | Approved — official Vercel package |
| react-hook-form | npm | github.com/react-hook-form | react-hook-form.com | Approved — shadcn/ui integration standard |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**Note:** slopcheck was unavailable at research time (SSL error to PyPI in sandbox). All packages above are confirmed via official documentation and authorized source repositories. Planner may optionally add a `checkpoint:human-verify` before the install step if desired.

---

## Architecture Patterns

### System Architecture Diagram (Phase 1 scope only)

```
Office Browser
  │  magic-link sign-in / CRUD forms
  ▼
┌─────────────────────────────────────────────────────┐
│          Next.js 15 App Router (Vercel)              │
│                                                      │
│  /auth/*                  ─── Auth.js v5 handlers   │
│  /dashboard/layout.tsx    ─── session guard (auth()) │
│  /dashboard/projects/*    ─── RSC pages + Server    │
│  /dashboard/projects/[id] ─── Actions (CRUD)        │
│                                                      │
│  /api/telegram/webhook/route.ts                     │
│    └── grammY Bot (minimal: /start only)            │
│         └── pending_people upsert                   │
└──────────────┬──────────────────────────────────────┘
               │ Drizzle ORM
               ▼
         Neon Postgres + PostGIS
         (tenants, office_users, projects,
          boq_items, routes, people,
          pending_people, assignments,
          Auth.js tables)

External:
  Resend API ←── magic-link emails
  Telegram Bot API ←── /start updates (webhook)
  Vercel Blob ←── (GeoJSON file upload, optional)
```

### Recommended Project Structure

```
bayrak-ai/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts   # Auth.js handlers
│   │   │   └── telegram/webhook/route.ts     # grammY /start webhook
│   │   ├── auth/
│   │   │   └── signin/page.tsx               # Custom sign-in page
│   │   ├── dashboard/
│   │   │   ├── layout.tsx                    # Session guard + top nav
│   │   │   └── projects/
│   │   │       ├── page.tsx                  # Project list (RSC)
│   │   │       ├── new/page.tsx              # Create project form
│   │   │       └── [id]/
│   │   │           ├── page.tsx              # Project detail (tabs)
│   │   │           └── edit/page.tsx         # Edit project form
│   │   └── layout.tsx                        # Root layout + next-intl provider
│   ├── db/
│   │   ├── index.ts                          # Drizzle client (Neon)
│   │   ├── schema/
│   │   │   ├── auth.ts                       # Auth.js tables (users, accounts, etc.)
│   │   │   ├── tenants.ts
│   │   │   ├── projects.ts
│   │   │   ├── boq-items.ts
│   │   │   ├── routes.ts                     # geometry(linestring,4326) — manual migration edit
│   │   │   ├── people.ts
│   │   │   ├── pending-people.ts
│   │   │   └── assignments.ts
│   │   ├── migrations/
│   │   │   └── 0000_enable_postgis.sql       # CREATE EXTENSION IF NOT EXISTS postgis
│   │   └── migrate.ts                        # Startup migration runner
│   ├── lib/
│   │   ├── auth.ts                           # NextAuth config with signIn callback
│   │   ├── geojson.ts                        # GeoJSON LineString validation (zod)
│   │   ├── excel.ts                          # ExcelJS BOQ parser + template generator
│   │   └── telegram.ts                       # grammY bot instance (minimal)
│   ├── actions/
│   │   ├── projects.ts                       # Server Actions: createProject, updateProject, deleteProject
│   │   ├── boq.ts                            # Server Actions: addBoqItem, importBoq, deleteBoqItem
│   │   ├── routes.ts                         # Server Actions: uploadRoute, replaceRoute
│   │   └── people.ts                         # Server Actions: approvePending, rejectPending, addManual, removeAssignment
│   ├── components/
│   │   ├── layout/
│   │   │   ├── TopNav.tsx
│   │   │   └── LanguageToggle.tsx            # TR/EN pill (next-intl locale switch)
│   │   └── dashboard/
│   │       ├── ProjectCard.tsx
│   │       ├── BoqTable.tsx
│   │       ├── BoqImportDialog.tsx
│   │       ├── RouteUpload.tsx
│   │       ├── PendingPeopleTable.tsx
│   │       └── ActivePeopleTable.tsx
│   └── i18n/
│       ├── routing.ts                        # defineRouting (no URL prefix)
│       └── request.ts                        # getRequestConfig — reads locale cookie
├── messages/
│   ├── tr.json                               # Turkish strings (primary)
│   └── en.json                              # English strings
├── drizzle.config.ts
├── vercel.json                               # maxDuration: 55 for telegram webhook
├── .env.local
└── next.config.ts
```

---

## Schema: Complete Phase 1 Drizzle Definitions

### Pattern 1: PostGIS Extension Migration (migration 0000)

The PostGIS extension MUST be the very first migration. Drizzle-kit does not create extensions automatically. Write this as a raw SQL file in `migrations/`:

```sql
-- migrations/0000_enable_postgis.sql
-- IMPORTANT: This must run before any CREATE TABLE with geometry columns.
-- On Neon, PostGIS is available but not enabled per-database by default.
CREATE EXTENSION IF NOT EXISTS postgis;
```

Run this file before `migrate()` in the migration runner:

```typescript
// src/db/migrate.ts
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import path from 'path';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function main() {
  // Step 1: Enable PostGIS before any Drizzle migrations run
  const postgisSql = readFileSync(
    path.join(process.cwd(), 'src/db/migrations/0000_enable_postgis.sql'),
    'utf-8'
  );
  await sql(postgisSql);

  // Step 2: Run Drizzle-generated migrations
  await migrate(db, { migrationsFolder: 'src/db/migrations' });
  console.log('Migrations complete');
}

main().catch(console.error);
```

### Pattern 2: Full Phase 1 Schema

```typescript
// src/db/schema/tenants.ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Seed: INSERT one row with a fixed UUID (e.g. '00000000-0000-0000-0000-000000000001')
// This UUID becomes BAYRAK_TENANT_ID in .env.local
```

```typescript
// src/db/schema/projects.ts
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),  // nullable for D-09
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('projects_tenant_idx').on(t.tenantId),
]);
```

```typescript
// src/db/schema/boq-items.ts
import { pgTable, uuid, text, numeric, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { tenants } from './tenants';

export const boqItems = pgTable('boq_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),  // nullable D-09
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  material: text('material').notNull(),       // e.g. "DN200 HDPE Boru"
  unit: text('unit').notNull(),               // e.g. "m", "m³", "adet"
  plannedQty: numeric('planned_qty', { precision: 12, scale: 3 }).notNull(),
  approvedQty: numeric('approved_qty', { precision: 12, scale: 3 }).notNull().default('0'),
  // unit_price omitted per D-06; add nullable column in v2 for hakkediş
  // unit_price: numeric('unit_price', { precision: 12, scale: 2 }),
  sortOrder: integer('sort_order').notNull().default(0),  // preserves import row order
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('boq_items_project_idx').on(t.projectId),
]);
```

```typescript
// src/db/schema/routes.ts
// CRITICAL: After `drizzle-kit generate`, open the generated migration SQL
// and change geometry(point,4326) → geometry(linestring,4326) for the `geom` column.
// Add this comment to the migration file to prevent silent regression.
import { pgTable, uuid, text, integer, timestamp, customType, index } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { tenants } from './tenants';

// Drizzle's built-in geometry() defaults to 'point' in generated SQL.
// We declare 'linestring' here but MUST verify the generated migration SQL.
const geomLinestring = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(LineString, 4326)';
  },
  // Insert: pass ST_GeomFromGeoJSON(?) string — handled in Server Action
  toDriver(v: string) { return v; },
  // Read: wrap in ST_AsGeoJSON() in select; parse JSON string to object
  fromDriver(v: string) { return v; },
});

export const routes = pgTable('routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  projectId: uuid('project_id').notNull().unique().references(() => projects.id, { onDelete: 'cascade' }),
  geom: geomLinestring('geom').notNull(),
  coordinateCount: integer('coordinate_count').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // GiST index mandatory for spatial queries (Phase 4+)
  index('routes_geom_gist').using('gist', t.geom),
  index('routes_project_idx').on(t.projectId),
]);

/*
 * MANUAL MIGRATION EDIT REQUIRED:
 * After `npx drizzle-kit generate`, open the generated .sql file.
 * Find: geometry(point, 4326)   ← Drizzle default
 * Change to: geometry(LineString, 4326)
 * Add this comment above the column: -- HAND-EDITED: Drizzle generates point; must be linestring
 * Do NOT re-run generate without re-applying this edit.
 */
```

```typescript
// src/db/schema/people.ts
import { pgTable, uuid, text, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  telegramUserId: bigint('telegram_user_id', { mode: 'bigint' }).notNull().unique(),
  telegramName: text('telegram_name'),        // from /start: ctx.from.first_name
  displayName: text('display_name').notNull(), // set by office on approval
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('people_tenant_idx').on(t.tenantId),
  index('people_telegram_idx').on(t.telegramUserId),
]);
```

```typescript
// src/db/schema/pending-people.ts
// Holds /start captures awaiting office approval.
// On approval: row deleted here, inserted into people + assignments.
// On rejection: row deleted here.
import { pgTable, uuid, text, bigint, timestamp, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const pendingPeople = pgTable('pending_people', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  telegramUserId: bigint('telegram_user_id', { mode: 'bigint' }).notNull().unique(),
  telegramName: text('telegram_name'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('pending_people_tenant_idx').on(t.tenantId),
  index('pending_people_telegram_idx').on(t.telegramUserId),
]);
```

```typescript
// src/db/schema/assignments.ts
import { pgTable, uuid, text, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { people } from './people';
import { projects } from './projects';
import { tenants } from './tenants';

// Role per assignment, not per person — D-03:
// same person can be worker on one project, auditor on another
export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  roleOnProject: text('role_on_project', { enum: ['worker', 'auditor'] }).notNull(),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique('unique_person_project_role').on(t.personId, t.projectId, t.roleOnProject),
  index('assignments_project_idx').on(t.projectId),
  index('assignments_person_idx').on(t.personId),
]);
```

```typescript
// src/db/schema/auth.ts
// Auth.js v5 required tables. These are managed by @auth/drizzle-adapter.
// Do NOT modify column names — the adapter depends on exact names.
import {
  pgTable, text, timestamp, primaryKey, integer, uuid
} from 'drizzle-orm/pg-core';
import type { AdapterAccountType } from 'next-auth/adapters';

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
});

export const accounts = pgTable('accounts', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').$type<AdapterAccountType>().notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (t) => [primaryKey({ columns: [t.identifier, t.token] })]);
```

---

## Auth.js v5 Allowlist Pattern

### The Allowlist Problem

D-11 requires that a magic-link request for a non-allowlisted address MUST NOT deliver an email and MUST NOT grant access. Auth.js v5's email provider sends the verification email first, then calls `signIn` callback on token redemption. To block email delivery itself, use the `signIn` callback which is called BEFORE the email is sent (indicated by `params.email.verificationRequest === true`). [CITED: https://next-auth.js.org/configuration/callbacks]

### Recommended Implementation: Env-var primary, DB table secondary

**Decision rationale** (Claude's Discretion area): An env-var list (`AUTH_ALLOWED_EMAILS`) solves the bootstrapping problem — the first office engineer can be allowlisted before any DB record exists. An `office_users` DB table as secondary source enables adding engineers from the dashboard later. Both are checked in the same `signIn` callback.

```typescript
// src/lib/auth.ts
import NextAuth from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/db';
import { users, accounts, sessions, verificationTokens } from '@/db/schema/auth';

const allowedEmailsEnv = process.env.AUTH_ALLOWED_EMAILS?.split(',').map(e => e.trim().toLowerCase()) ?? [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: 'no-reply@bayrak.ai',
    }),
  ],
  callbacks: {
    async signIn({ user, email }) {
      // This callback fires BEFORE the magic-link email is sent (verificationRequest=true)
      // AND again on link click (verificationRequest=false/undefined).
      // We block on both calls so neither email delivery nor session creation
      // happens for non-allowlisted addresses.
      const emailAddr = user?.email ?? email?.verificationRequest ? undefined : user?.email;
      const incomingEmail = (user?.email ?? '').toLowerCase();

      if (!incomingEmail) return false;

      // Primary: env var list
      if (allowedEmailsEnv.includes(incomingEmail)) return true;

      // Secondary: DB office_users table (Phase 1 addition — query for allow)
      // const officeUser = await db.select().from(officeUsers)
      //   .where(eq(officeUsers.email, incomingEmail)).limit(1);
      // if (officeUser.length > 0) return true;

      // Reject: return false → Auth.js sends the user to /auth/error?error=AccessDenied
      return false;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',  // Show custom error page with "email not authorized" copy
  },
});
```

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/lib/auth';
export const { GET, POST } = handlers;
```

**Dashboard layout guard:**
```typescript
// src/app/dashboard/layout.tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/auth/signin');
  return <>{children}</>;
}
```

**Required env vars:**
```bash
AUTH_SECRET=<openssl rand -base64 32>
AUTH_RESEND_KEY=re_xxxxxxxxxxxxxxxx
AUTH_URL=https://bayrak.ai              # or http://localhost:3000 for dev
AUTH_ALLOWED_EMAILS=engineer@bayrak.ai,manager@client.com
```

---

## GeoJSON Upload and LineString Validation

### Validation Schema (Zod)

The server-side validation function parses the uploaded `.geojson` file and checks:
1. Valid JSON
2. GeoJSON Feature or FeatureCollection
3. Geometry type is exactly `LineString`
4. Coordinate order is `[lng, lat]` — lng must be in -180..180, lat in -90..90
5. Minimum 2 coordinate pairs

```typescript
// src/lib/geojson.ts
import { z } from 'zod';

const lngLatPair = z.tuple([
  z.number().min(-180).max(180),   // longitude first (X)
  z.number().min(-90).max(90),     // latitude second (Y)
]).rest(z.number());               // optional elevation allowed

const lineStringGeometry = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(lngLatPair).min(2, 'Route must have at least 2 coordinate points'),
});

const geojsonFeature = z.object({
  type: z.literal('Feature'),
  geometry: lineStringGeometry,
  properties: z.record(z.unknown()).nullable().optional(),
});

const geojsonFeatureCollection = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(geojsonFeature).min(1, 'FeatureCollection must contain at least one Feature'),
});

export type LineStringValidationResult =
  | { ok: true; coordinates: [number, number][]; count: number; geojsonString: string }
  | { ok: false; error: string; actualType?: string };

export function validateLineStringGeoJSON(rawJson: string): LineStringValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: 'NOT_VALID_JSON' };
  }

  // Try Feature first
  const featureResult = geojsonFeature.safeParse(parsed);
  if (featureResult.success) {
    const coords = featureResult.data.geometry.coordinates as [number, number][];
    return {
      ok: true,
      coordinates: coords,
      count: coords.length,
      geojsonString: JSON.stringify(featureResult.data.geometry),
    };
  }

  // Try FeatureCollection
  const fcResult = geojsonFeatureCollection.safeParse(parsed);
  if (fcResult.success) {
    const geom = fcResult.data.features[0].geometry;
    const coords = geom.coordinates as [number, number][];
    return {
      ok: true,
      coordinates: coords,
      count: coords.length,
      geojsonString: JSON.stringify(geom),
    };
  }

  // Check what type it actually is for a specific error message
  const asObj = parsed as Record<string, unknown>;
  if (asObj?.type === 'Feature' || asObj?.type === 'FeatureCollection') {
    const geomType = (asObj?.geometry as Record<string, unknown>)?.type as string | undefined
      ?? (asObj?.features as Array<{geometry: {type: string}}>)?.[0]?.geometry?.type;
    if (geomType && geomType !== 'LineString') {
      return { ok: false, error: 'NOT_LINESTRING', actualType: geomType };
    }
  }

  return { ok: false, error: 'NOT_GEOJSON' };
}
```

**Server Action for route upload:**
```typescript
// src/actions/routes.ts (excerpt)
'use server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { routes } from '@/db/schema/routes';
import { validateLineStringGeoJSON } from '@/lib/geojson';
import { auth } from '@/lib/auth';

export async function uploadRoute(projectId: string, fileContent: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const result = validateLineStringGeoJSON(fileContent);
  if (!result.ok) return { error: result.error, actualType: result.actualType };

  // Use ST_GeomFromGeoJSON to insert the geometry into PostGIS
  // The geojsonString is the LineString geometry object (not the Feature wrapper)
  await db.insert(routes).values({
    projectId,
    // Pass as raw SQL so PostGIS parses it properly
    geom: sql`ST_GeomFromGeoJSON(${result.geojsonString})`,
    coordinateCount: result.count,
  }).onConflictDoUpdate({
    target: routes.projectId,
    set: {
      geom: sql`ST_GeomFromGeoJSON(${result.geojsonString})`,
      coordinateCount: result.count,
      uploadedAt: sql`now()`,
    },
  });

  return { ok: true, count: result.count };
}
```

**Note:** The `onConflictDoUpdate` pattern handles route replacement (D-07 says reject invalid; valid file replaces the old route without a delete+insert race).

---

## ExcelJS BOQ Import

### Template structure

The downloadable template is a static `.xlsx` generated by ExcelJS with three columns and a header row:

| A | B | C |
|---|---|---|
| Malzeme / Material | Birim / Unit | Sözleşme Miktarı / Contracted Qty |
| (example row...) | m | 1500 |

### Parser

```typescript
// src/lib/excel.ts
import ExcelJS from 'exceljs';

export type BoqRow = {
  rowNumber: number;
  material: string;
  unit: string;
  plannedQty: number;
};

export type BoqParseResult =
  | { ok: true; rows: BoqRow[] }
  | { ok: false; errors: { row: number; field: string; message: string }[] };

export async function parseBoqExcel(buffer: Buffer): Promise<BoqParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return { ok: false, errors: [{ row: 0, field: 'file', message: 'Empty workbook' }] };

  const rows: BoqRow[] = [];
  const errors: { row: number; field: string; message: string }[] = [];

  // Row 1 is header — skip it; data starts at row 2
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const material = String(row.getCell(1).value ?? '').trim();
    const unit = String(row.getCell(2).value ?? '').trim();
    const qtyRaw = row.getCell(3).value;

    if (!material) {
      errors.push({ row: rowNumber, field: 'Malzeme', message: 'Malzeme zorunludur / Material is required' });
    }
    if (!unit) {
      errors.push({ row: rowNumber, field: 'Birim', message: 'Birim zorunludur / Unit is required' });
    }

    // Handle Turkish decimal (123,5 → 123.5) for text-formatted cells
    const qtyStr = String(qtyRaw ?? '').replace(',', '.');
    const qty = parseFloat(qtyStr);
    if (isNaN(qty) || qty <= 0) {
      errors.push({ row: rowNumber, field: 'Sözleşme Miktarı', message: 'Geçerli pozitif sayı gerekli / Must be a positive number' });
    }

    if (material && unit && !isNaN(qty) && qty > 0) {
      rows.push({ rowNumber, material, unit, plannedQty: qty });
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  if (rows.length === 0) return { ok: false, errors: [{ row: 0, field: 'file', message: 'No data rows found' }] };
  return { ok: true, rows };
}

export async function generateBoqTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('BOQ');

  sheet.columns = [
    { header: 'Malzeme / Material', key: 'material', width: 40 },
    { header: 'Birim / Unit', key: 'unit', width: 15 },
    { header: 'Sözleşme Miktarı / Contracted Qty', key: 'qty', width: 25 },
  ];

  // Example row so engineers know the format
  sheet.addRow({ material: 'DN200 HDPE Boru', unit: 'm', qty: 5000 });

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
```

**Server Action for import (preview → confirm flow):**

The preview step parses the file client-side-forwarded buffer via a Server Action and returns the parsed rows without committing them. The confirm step takes the approved rows and inserts them. The UI stores parsed rows in React state between preview and confirm — no separate DB staging table needed for v1.

```typescript
// src/actions/boq.ts (excerpt)
'use server';
import { parseBoqExcel, type BoqRow } from '@/lib/excel';
import { db } from '@/db';
import { boqItems } from '@/db/schema/boq-items';
import { auth } from '@/lib/auth';

export async function previewBoqImport(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const file = formData.get('file') as File;
  if (!file || !file.name.endsWith('.xlsx')) {
    return { ok: false, errors: [{ row: 0, field: 'file', message: 'ONLY_XLSX' }] };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return parseBoqExcel(buffer);
}

export async function confirmBoqImport(projectId: string, rows: BoqRow[]) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  await db.insert(boqItems).values(
    rows.map((r, i) => ({
      projectId,
      material: r.material,
      unit: r.unit,
      plannedQty: String(r.plannedQty),
      sortOrder: i,
    }))
  );
  return { ok: true, count: rows.length };
}
```

---

## Minimal grammY /start Webhook

Phase 1 ships only the `/start` handler — no conversation flow, no session middleware, no `@grammyjs/conversations`. The bot instance is minimal: one command handler that upserts a `pending_people` row and replies with a Turkish "pending approval" acknowledgement.

```typescript
// src/lib/telegram.ts
// PHASE 1: Minimal bot — /start only.
// Phase 2 will add conversations plugin, session middleware, and full flow.
import { Bot } from 'grammy';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');

export const bot = new Bot(token);
```

```typescript
// src/app/api/telegram/webhook/route.ts
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
// maxDuration set in vercel.json, not here

import { webhookCallback } from 'grammy';
import { bot } from '@/lib/telegram';
import { db } from '@/db';
import { pendingPeople } from '@/db/schema/pending-people';
import { sql } from 'drizzle-orm';

// Register /start handler
bot.command('start', async (ctx) => {
  const telegramUserId = ctx.from?.id;
  const telegramName = ctx.from?.first_name ?? ctx.from?.username ?? null;

  if (!telegramUserId) {
    await ctx.reply('Bir hata oluştu. Lütfen tekrar deneyin.');
    return;
  }

  // Upsert into pending_people: insert if not exists; ignore if already pending or active.
  // Using INSERT ... ON CONFLICT DO NOTHING so duplicate /start taps are idempotent.
  await db.insert(pendingPeople).values({
    telegramUserId: BigInt(telegramUserId),
    telegramName,
    // tenantId: process.env.BAYRAK_TENANT_ID  ← wire when tenant_id is non-nullable
  }).onConflictDoNothing();

  await ctx.reply(
    `Merhaba${telegramName ? ` ${telegramName}` : ''}! 👋\n\n` +
    `Kaydınız ofis mühendisine iletildi. Onay bekleyiniz. ` +
    `Onaylandıktan sonra iş kaydı yapmaya başlayabilirsiniz.`
  );
});

// Export as Next.js route handler.
// Pass secretToken so grammY validates the X-Telegram-Bot-Api-Secret-Token
// header against TELEGRAM_WEBHOOK_SECRET before running the /start handler.
// A request with a wrong/missing secret header is rejected (grammY responds
// with a 401-class error and the update is NOT processed).
export const POST = webhookCallback(bot, 'std/http', {
  secretToken: process.env.TELEGRAM_WEBHOOK_SECRET!,
});
```

**vercel.json (root):**
```json
{
  "functions": {
    "src/app/api/telegram/webhook/route.ts": {
      "memory": 512,
      "maxDuration": 55
    }
  }
}
```

**next.config.ts — grammY external packages:**
```typescript
const nextConfig = {
  serverExternalPackages: ['grammy', 'pg'],
};
export default nextConfig;
```

**Webhook registration (run once after deploy):**
```bash
# Set the webhook URL after first Vercel deploy
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=https://bayrak.ai/api/telegram/webhook&secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

**Verify the secret token in the route handler (security):**
```typescript
// Add to webhook route.ts before the POST handler:
export async function GET() {
  return Response.json({ ok: true, phase: 1 });
}

// grammY verifies the secret token ONLY when you pass the `secretToken` option
// to webhookCallback (it does NOT auto-read TELEGRAM_WEBHOOK_SECRET from env):
//   webhookCallback(bot, 'std/http', { secretToken: process.env.TELEGRAM_WEBHOOK_SECRET! })
// grammY then compares the incoming X-Telegram-Bot-Api-Secret-Token header to that
// value and rejects mismatches (401-class) without processing the update.
// Register the webhook with the same value: setWebhook?...&secret_token=${TELEGRAM_WEBHOOK_SECRET}.
```

**Phase 1 env vars:**
```bash
TELEGRAM_BOT_TOKEN=1234567890:AAAA...
TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 32>
```

---

## next-intl 4.x Setup (Cookie-based, No URL Prefixes)

The dashboard uses TR as the default locale with EN switchable. No `/tr/` or `/en/` URL prefixes — locale is stored in a cookie. This matches the UI-SPEC's language toggle behavior.

```typescript
// src/i18n/request.ts
import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = cookieStore.get('locale')?.value ?? 'tr';  // TR default per I18N-02

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

```typescript
// src/app/layout.tsx
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**next.config.ts addition:**
```typescript
import createNextIntlPlugin from 'next-intl/plugin';
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
export default withNextIntl(nextConfig);
```

**Language toggle (client component) — sets cookie and reloads:**
```typescript
// src/components/layout/LanguageToggle.tsx
'use client';
import { useTransition } from 'react';

export function LanguageToggle({ currentLocale }: { currentLocale: string }) {
  const [, startTransition] = useTransition();

  function setLocale(locale: string) {
    document.cookie = `locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
    startTransition(() => {
      window.location.reload();
    });
  }

  return (
    <div role="group" aria-label="Dil değiştir / Switch language"
      className="flex h-9 rounded-full overflow-hidden border border-border">
      {['tr', 'en'].map((loc) => (
        <button
          key={loc}
          onClick={() => setLocale(loc)}
          aria-pressed={currentLocale === loc}
          className={`px-3 text-sm font-medium transition-colors ${
            currentLocale === loc
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-accent'
          }`}
        >
          {loc.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
```

**Message file structure:**
```json
// messages/tr.json (excerpt — primary)
{
  "auth": {
    "signin": {
      "heading": "bayrak.ai",
      "subheading": "Ofis Girişi",
      "email_label": "E-posta",
      "cta": "Giriş Bağlantısı Gönder",
      "helper": "Yetkili e-posta adresinize giriş bağlantısı gönderilecek.",
      "success": "Bağlantı e-postanıza gönderildi. Gelen kutunuzu kontrol edin.",
      "error_not_allowed": "Bu e-posta adresi yetkili değil. Yöneticinizle iletişime geçin.",
      "sending": "Gönderiliyor..."
    }
  },
  "dashboard": {
    "boq": {
      "add_item": "Kalem Ekle",
      "import_excel": "Excel'den İçe Aktar",
      "download_template": "Şablon İndir",
      "confirm_import": "Onayla ve İçe Aktar"
    }
  }
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Excel parsing | Custom xlsx byte parser | ExcelJS | Handles cell formatting, date types, merged cells, Turkish locale numbers |
| GeoJSON validation | Hand-written type checks | Zod schemas with `.safeParse()` | Exhaustive edge cases (MultiLineString, nested FeatureCollections) |
| Magic-link token generation | Custom UUID token + email + expiry | Auth.js v5 + `@auth/drizzle-adapter` | Token rotation, PKCE, expiry, replay protection all built in |
| PostGIS geometry insertion | WKB hex encoding | `ST_GeomFromGeoJSON(?)` in SQL template literal | Well-known binary encoding has endianness/SRID subtleties |
| Session persistence | `Map<chatId, state>` in module scope | `@grammyjs/storage-psql` (Phase 2) | In-memory dies on cold starts; this is not needed in Phase 1 |
| i18n string management | Object with nested keys + manual locale selection | next-intl `getTranslations()` | Type-safe keys, ICU message format, locale number/date formatting |

**Key insight:** In a serverless environment, any "simple" in-memory store or hand-rolled token scheme becomes a correctness hazard. Always delegate to a library that has solved these problems with persistence and edge-case handling.

---

## Common Pitfalls

### Pitfall 1: Drizzle-generated migration uses `geometry(point,4326)` for LineString column

**What goes wrong:** `drizzle-kit generate` inspects the Drizzle schema and emits `geometry(point, 4326)` for any geometry column regardless of how the `customType` is declared. The PostGIS column gets created as Point type. Any `ST_GeomFromGeoJSON()` call inserting a LineString will fail with a geometry type mismatch error, OR silently store an invalid geometry depending on PostGIS version.

**Why it happens:** Drizzle's codegen reads the `dataType()` string from `customType` but does not validate it against PostgreSQL type names — the generated SQL may still emit the wrong type depending on version.

**How to avoid:** After every `npx drizzle-kit generate`, grep the generated migration SQL for `geometry(point` and change it to `geometry(LineString`. Add the comment `-- HAND-EDITED: Drizzle generates point; must be linestring` above the column. Never run `drizzle-kit push` directly (it skips the file review step).

**Warning signs:** Error `Geometry type (Point) does not match column type (LineString)` on route upload; or routes table accepts insert but `ST_AsGeoJSON()` reads return Point geometry.

### Pitfall 2: Auth.js signIn callback called twice for magic-link — block on both calls

**What goes wrong:** The `signIn` callback fires once when the user submits their email (verification request) and again when they click the link. If the allowlist check only runs on one call, a blocked user might get the email delivered but be blocked on link click, or vice versa — confusing UX and potentially leaking the "send email" confirmation.

**How to avoid:** The implementation above checks `user.email` on both calls. Both calls are blocked for non-allowlisted emails — no email is sent, and no session is created. [CITED: https://next-auth.js.org/configuration/callbacks#sign-in-callback]

**Warning signs:** Users receiving magic-link emails for non-allowlisted addresses; or users who receive no email but see an error only after clicking.

### Pitfall 3: `tenant_id` left NULL in queries — Phase 2+ queries break on multi-row results

**What goes wrong:** With `tenant_id` nullable and a single default tenant, a query like `SELECT * FROM projects WHERE tenant_id IS NULL` works in Phase 1. Phase 2 adds a second query path using `tenant_id = $tenantId`. If Phase 1 rows were inserted with `tenant_id = NULL`, Phase 2 lookups by `tenant_id = 'uuid'` miss all historical data.

**How to avoid:** Seed the default tenant in migration 0001 (`BAYRAK_TENANT_ID` env var) and set `tenant_id = BAYRAK_TENANT_ID` on every insert from day one. The column is nullable in schema (D-09) but application code always supplies the tenant ID. Use a helper function `getDefaultTenantId()` that reads from env so it is easy to change later.

### Pitfall 4: `ST_GeomFromGeoJSON` receives the Feature wrapper, not the geometry object

**What goes wrong:** Passing the full GeoJSON Feature `{ "type": "Feature", "geometry": { "type": "LineString", ... } }` to `ST_GeomFromGeoJSON()` succeeds in some PostGIS versions but fails in others. The function expects the geometry object, not the Feature.

**How to avoid:** The `validateLineStringGeoJSON` function above extracts `result.geojsonString` as `JSON.stringify(featureResult.data.geometry)` — the geometry only. Always pass the geometry object, not the Feature or FeatureCollection wrapper.

### Pitfall 5: ExcelJS buffer handling with Next.js formData

**What goes wrong:** Next.js Server Actions receive files as `File` objects via FormData. `File.arrayBuffer()` is async. A synchronous read will return an empty buffer. ExcelJS requires a complete buffer before parsing.

**How to avoid:** Always `await file.arrayBuffer()` then `Buffer.from(...)`. The `previewBoqImport` Server Action above shows the correct pattern.

### Pitfall 6: grammY `webhookCallback` adapter name mismatch

**What goes wrong:** Using `webhookCallback(bot, 'next-js')` (deprecated adapter name) instead of `webhookCallback(bot, 'std/http')` (current). The `'next-js'` adapter no longer exists in grammY 1.x.

**How to avoid:** Always use `'std/http'`. This works with Next.js App Router `route.ts` files natively. [CITED: https://grammy.dev/hosting/vercel]

### Pitfall 7: next-intl `getRequestConfig` not wired into `next.config.ts`

**What goes wrong:** next-intl's `getRequestConfig` only runs if the `next-intl/plugin` wraps the Next.js config. Without `withNextIntl()`, `getTranslations()` calls in RSCs will fail at runtime.

**How to avoid:** Wrap `nextConfig` with `createNextIntlPlugin('./src/i18n/request.ts')` as shown. The plugin path must exactly match the file path.

---

## Runtime State Inventory

This is a greenfield phase — no runtime state exists. Explicitly stated per each category:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — fresh Neon database, no existing rows | Seed one tenant row in migration 0001 |
| Live service config | Telegram bot webhook URL not yet set | Set via `setWebhook` API call after first deploy |
| OS-registered state | None | — |
| Secrets/env vars | None yet — all env vars need provisioning | Create `.env.local` from env reference in this document |
| Build artifacts | None yet — fresh repo | Run `npm install` + `drizzle-kit generate` + `migrate()` |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | ✓ | v24.13.0 | — |
| npm | Package install | ✓ | 11.6.2 | — |
| Neon Postgres | Database | Not checked (cloud) | PostgreSQL 16 | Provision via Neon dashboard |
| Resend API | Magic-link emails | Not checked (cloud) | — | Provision Resend account + domain |
| Telegram Bot Token | /start webhook | Not checked (cloud) | — | Create bot via @BotFather |
| Vercel CLI | Deploy + env pull | Not checked | — | Provision via `npm i -g vercel` |

**Missing dependencies with no fallback:**
- Neon database (requires provisioning before any migration can run)
- Resend API key (required before Auth.js can send magic links)
- Telegram Bot Token (required before webhook works)

**Missing dependencies with fallback:**
- None for Phase 1 (Mapbox token not needed until Phase 5)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (recommended for Next.js App Router; Jest has ESM issues with some deps) |
| Config file | `vitest.config.ts` — Wave 0 gap |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

Vitest is strongly preferred over Jest for this stack because: (1) ESM-native — no transform issues with `zod`, `exceljs`, or grammY, (2) compatible with TypeScript 5.x without extra config, (3) fast cold start for unit tests in CI.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| AUTH-01 | signIn callback returns false for non-allowlisted email | Unit | `npx vitest run tests/auth.test.ts` | Wave 0 gap |
| AUTH-01 | signIn callback returns true for allowlisted email | Unit | `npx vitest run tests/auth.test.ts` | Wave 0 gap |
| AUTH-01 | Non-allowlisted email receives no confirmation (returns false on verificationRequest) | Unit | `npx vitest run tests/auth.test.ts` | Wave 0 gap |
| AUTH-02/03 | `/start` upserts pending_person row (idempotent — double /start = one row) | Integration (DB) | `npx vitest run tests/telegram-webhook.test.ts` | Wave 0 gap |
| AUTH-04 | assignments table correctly stores role_on_project per person+project | Unit (schema) | `npx vitest run tests/schema.test.ts` | Wave 0 gap |
| SETUP-03 | `validateLineStringGeoJSON` accepts valid LineString Feature | Unit | `npx vitest run tests/geojson.test.ts` | Wave 0 gap |
| SETUP-03 | `validateLineStringGeoJSON` rejects FeatureCollection with Polygon geometry | Unit | `npx vitest run tests/geojson.test.ts` | Wave 0 gap |
| SETUP-03 | `validateLineStringGeoJSON` rejects coordinate order [lat, lng] (lat > 90 caught) | Unit | `npx vitest run tests/geojson.test.ts` | Wave 0 gap |
| SETUP-03 | Coordinate order: Istanbul lng=28.9 stored first → `ST_AsGeoJSON` returns `[28.9, 41.0]` | Integration (DB+PostGIS) | `npx vitest run tests/postgis.test.ts` | Wave 0 gap |
| SETUP-03 | PostGIS extension present: `SELECT PostGIS_Version()` returns a value | Integration (DB) | `npx vitest run tests/postgis.test.ts` | Wave 0 gap |
| SETUP-02 | `parseBoqExcel` parses Turkish decimal "123,5" as 123.5 | Unit | `npx vitest run tests/excel.test.ts` | Wave 0 gap |
| SETUP-02 | `parseBoqExcel` returns row-level errors for missing material/unit/qty | Unit | `npx vitest run tests/excel.test.ts` | Wave 0 gap |
| SETUP-04 | BOQ remaining balance = plannedQty - approvedQty (computed correctly at 0 and positive values) | Unit | `npx vitest run tests/boq.test.ts` | Wave 0 gap |
| I18N-02 | `getRequestConfig` returns 'tr' when no cookie set | Unit | `npx vitest run tests/i18n.test.ts` | Wave 0 gap |
| I18N-02 | `getRequestConfig` returns 'en' when locale cookie = 'en' | Unit | `npx vitest run tests/i18n.test.ts` | Wave 0 gap |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/<specific-file>.test.ts`
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps (test infrastructure to create before implementation)

- [ ] `vitest.config.ts` — configure ESM, TypeScript, test environment
- [ ] `tests/geojson.test.ts` — validateLineStringGeoJSON unit tests (6 cases above)
- [ ] `tests/excel.test.ts` — parseBoqExcel unit tests (Turkish decimal, error cases)
- [ ] `tests/auth.test.ts` — signIn callback allowlist unit tests
- [ ] `tests/postgis.test.ts` — coordinate order integration test + extension present check (requires TEST_DATABASE_URL pointing to a test Neon branch)
- [ ] `tests/telegram-webhook.test.ts` — /start idempotency test (requires test DB)
- [ ] Framework install: `npm install -D vitest @vitest/coverage-v8`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Auth.js v5 magic-link; allowlist in `signIn` callback; no passwords |
| V3 Session Management | Yes | Auth.js JWT/database sessions; `auth()` guard on dashboard layout |
| V4 Access Control | Yes | Dashboard gated to authenticated office users only; all Server Actions call `auth()` first |
| V5 Input Validation | Yes | Zod for GeoJSON validation; ExcelJS with typed cell reads; Server Action input typed with Zod schemas |
| V6 Cryptography | Partial | Auth.js handles token generation; `AUTH_SECRET` must be generated with `openssl rand -base64 32` |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized magic-link sign-in | Spoofing | `signIn` callback allowlist; returns `false` before email delivery |
| Telegram webhook spoofing | Spoofing | `TELEGRAM_WEBHOOK_SECRET` header verified by grammY's `webhookCallback` |
| GeoJSON injection via file upload | Tampering | Server-side Zod validation before any DB write; `ST_GeomFromGeoJSON` parameterized |
| BOQ quantity injection via Excel | Tampering | `parseFloat` after `replace(',','.')` + range check; never `eval()` cell content |
| Unauthenticated Server Action calls | Elevation of privilege | Every Server Action calls `const session = await auth(); if (!session) throw new Error('Unauthorized')` |
| CSRF on Server Actions | Tampering | Next.js App Router Server Actions include built-in CSRF protection via `Origin` header check |

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| next-auth v4 + Pages Router | Auth.js v5 beta (5.0.0-beta.31) + App Router | `auth()` works in RSC and route handlers without adapter tricks |
| next-i18next | next-intl 4.x | App Router native; `getTranslations()` in async RSCs; no client-side hydration issues |
| prisma for PostGIS | Drizzle `customType` + `sql` template literals | Drizzle is lighter; PostGIS ops still require raw SQL but `sql` template is typed |
| Vercel Edge Runtime for webhooks | Node.js Runtime for grammY | grammY uses Node.js APIs; Edge Runtime compatibility is incomplete — always use Node runtime for bot handlers |
| `next.config.js` serverComponentsExternalPackages | `next.config.ts` `serverExternalPackages` | Renamed in Next.js 15; old name still works but shows deprecation warning |

**Deprecated / outdated:**
- `serverComponentsExternalPackages` in next.config: use `serverExternalPackages` (Next.js 15 rename)
- `export const runtime = 'edge'` in telegram webhook route: do NOT use; grammY requires Node.js
- `next-auth v4` with App Router: incompatible; use v5 beta
- `MemorySessionStorage` for grammY: never in production (Phase 2 adds `@grammyjs/storage-psql`)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | next-intl's cookie-based locale (without URL routing) works with `NextIntlClientProvider` wrapping in root layout | next-intl Setup | Server Components may not receive locale from cookie correctly; fallback: use URL routing with `[locale]` segment |
| A2 | Auth.js v5 `signIn` callback receives `user.email` on the verification request call (before email sent) | Auth.js Allowlist | If `user.email` is null on verificationRequest call, the allowlist check would need to use `email.verificationRequest` and a different parameter; test against actual Auth.js beta.31 behavior |
| A3 | Drizzle-kit 0.31.x `customType` with `dataType()` returning `'geometry(LineString, 4326)'` generates correct SQL | Schema — routes.ts | Manual migration edit may fail silently if Drizzle generates something other than expected; verify with `drizzle-kit generate --dry-run` before running migrations |
| A4 | `@grammyjs/storage-psql` is NOT needed in Phase 1 (no conversations plugin, no session needed for /start handler) | Minimal /start Webhook | If grammY requires session middleware even for simple command handlers, install immediately in Phase 1 |

**If this table is empty:** Not empty — 4 assumptions require confirmation during execution.

---

## Open Questions (RESOLVED)

1. **Auth.js signIn callback parameter on verificationRequest**
   - What we know: The callback receives `user`, `account`, `profile`, `email` params. The `email.verificationRequest` flag distinguishes the two call points.
   - What's unclear: Whether `user.email` is populated on the first (pre-email) call in beta.31 specifically.
   - **RESOLVED:** The allowlist callback uses a defensive empty-email check — `const incomingEmail = (user?.email ?? '').toLowerCase(); if (\!incomingEmail) return false;` — so a non-allowlisted (or empty-email) address is blocked on BOTH callback shapes (the pre-email `verificationRequest === true` call and the link-click call). Whether or not `user.email` is populated on the first call in beta.31, no email is sent and no session is created for an address that is not in `AUTH_ALLOWED_EMAILS`.

2. **Tenant ID bootstrapping sequence**
   - What we know: `tenant_id` is nullable in all tables; a default tenant must be seeded.
   - What's unclear: Should the seed tenant UUID be hardcoded in migration SQL, or read from `BAYRAK_TENANT_ID` env var via a seed script?
   - **RESOLVED:** Hardcode the well-known seed tenant UUID `00000000-0000-0000-0000-000000000001`, created in the PostGIS/first migration path (seeded idempotently in `src/db/seed.ts` via `onConflictDoNothing`). `getDefaultTenantId()` in `src/lib/tenant.ts` returns this UUID (env `BAYRAK_TENANT_ID` override with the same hardcoded fallback), so app code always supplies a deterministic, repeatable tenant_id.

3. **ExcelJS buffer size limit for large BOQ files**
   - What we know: ExcelJS loads the entire workbook into memory.
   - What's unclear: Next.js Server Actions have a 4MB default body limit; large BOQ files from contractor systems may exceed this.
   - **RESOLVED:** Surface a 4MB limit note in the import UI as a sub-label under the file input (the BOQ import handler runs on `runtime = 'nodejs'`). Files exceeding the 4MB Server Action body limit are out of scope for v1; the sub-label sets the expectation up front.

---

## Sources

### Primary (HIGH confidence)

- [VERIFIED: npm registry] — All package versions confirmed via `npm view` in this session
- [CITED: https://orm.drizzle.team/docs/guides/postgis-geometry-point] — Drizzle geometry column pattern
- [CITED: https://spin.atomicobject.com/linestring-geometry-drizzle/] — LineString manual migration edit confirmation
- [CITED: https://authjs.dev/getting-started/providers/resend] — Auth.js v5 Resend provider setup
- [CITED: https://next-auth.js.org/configuration/callbacks] — signIn callback behavior for email provider (verificationRequest flag)
- [CITED: https://grammy.dev/hosting/vercel] — grammY `webhookCallback(bot, 'std/http')` for Next.js App Router
- [CITED: https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing] — Cookie-based locale without URL prefixes
- [CITED: https://neon.com/docs/extensions/postgis] — PostGIS extension on Neon

### Secondary (MEDIUM confidence)

- [CITED: https://authjs.dev/getting-started/adapters/drizzle] — DrizzleAdapter table schema for Auth.js v5
- [CITED: https://next-intl.dev/docs/usage/numbers] — Number formatting with locale in next-intl

### Research-time verification

- Package legitimacy: All packages verified via `npm view <pkg> repository.url` — all have source repos on GitHub under established organizations (vercel, nextauthjs, grammyjs, drizzle-team, exceljs, amannn)
- No postinstall scripts found on any Phase 1 package (`npm view <pkg> scripts.postinstall` returned empty for all checked packages)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry; CLAUDE.md mandates the entire stack
- Schema design: HIGH — all decisions are locked in CONTEXT.md; patterns verified against Drizzle and PostGIS docs
- Auth.js allowlist: MEDIUM-HIGH — pattern confirmed via official callbacks docs; one assumption (A2) about parameter availability on verificationRequest call
- GeoJSON validation: HIGH — Zod pattern is straightforward; `ST_GeomFromGeoJSON` is PostGIS standard
- ExcelJS import: HIGH — well-established library; pattern is standard Node.js file parsing
- next-intl setup: HIGH — confirmed via official docs with `without-i18n-routing` path; one assumption (A1) about client provider
- grammY /start: HIGH — minimal pattern, no conversation plugin, no edge cases

**Research date:** 2026-05-24
**Valid until:** 2026-06-24 (stable libraries; re-verify next-auth beta if a new beta is released)
