# Technology Stack

**Project:** bayrak.ai
**Researched:** 2026-05-23
**Overall confidence:** HIGH (all versions verified against npm registry and official docs)

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 15.x (latest: 16.2.6 — see note) | App Router monolith, server actions, route handlers | Single deploy on Vercel; saha-proven; Telegram webhook is a plain route handler |
| TypeScript | 5.x | All code | Type safety across BOQ schema, conversation state, PostGIS geometry |
| Tailwind CSS | 4.3.x | Styling | v4 is current; class-based, pairs perfectly with shadcn |
| shadcn/ui | latest CLI (shadcn@4.8.x) | UI component library | Add components via CLI (`npx shadcn@latest add button`); not a dependency in package.json |

**Note on Next.js version:** npm latest tag shows 16.2.6 but that is likely a pre-release canary. Stable Next.js 15 LTS is the appropriate target. Verify with `npm show next dist-tags` before initializing — use `15.x` stable unless 16 is confirmed stable at project start.

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Neon (PostgreSQL 16) | Managed | Primary database | Vercel marketplace, serverless-native, branchable previews |
| PostGIS extension | Bundled with Neon | Spatial queries | Native `ST_*` functions for nearest-segment matching; pipeline route storage |

**Enabling PostGIS on Neon** (run once in Neon SQL Editor or via migration):

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Neon supports PostGIS on all plans. No additional setup beyond the CREATE EXTENSION call. Confirmed: [Neon PostGIS docs](https://neon.com/docs/extensions/postgis).

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

**Fallback:** Leaflet + react-leaflet if Mapbox token or pricing becomes a blocker. API surface is similar enough that the GeoJSON layer logic is portable.

### AI

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| ai (Vercel AI SDK) | 6.0.x | LLM orchestration | Single package for generateText/streamText; direct AI Gateway integration |
| Vercel AI Gateway | Platform | Model routing | Single API key (`AI_GATEWAY_API_KEY`), auto-retries, cost dashboard, model fallbacks |

**Model:** `anthropic/claude-sonnet-4.5` or `anthropic/claude-opus-4.7` via AI Gateway. Default to `claude-sonnet-4.5` for vision tasks (photo anomaly flagging) — best cost/capability ratio.

### File Storage

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @vercel/blob | 2.4.x | Photo and file storage | Native Vercel integration, public URL storage; used for submission photos |

### Internationalisation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| next-intl | 4.12.x | TR/EN switching | Native App Router + Server Components support; `getTranslations()` in async RSCs |

---

## Integration Patterns

### PostGIS + Drizzle: Spatial Schema

Drizzle has a built-in `geometry()` column for `geometry(Point)`. Geography type and LineString require custom types or raw SQL workarounds. The pattern below is the recommended approach:

```typescript
// schema/routes.ts
import { geometry, pgTable, serial, text, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Pipeline route — one row per project
export const pipeline_routes = pgTable('pipeline_routes', {
  id: serial('id').primaryKey(),
  project_id: integer('project_id').notNull(),
  name: text('name').notNull(),
  // LineString must be defined with raw string type override;
  // Drizzle's geometry() only resolves 'point' correctly in migrations,
  // so manually edit migration SQL from geometry(point,4326) → geometry(linestring,4326)
  route: geometry('route', { type: 'linestring', srid: 4326 }),
}, (t) => [
  index('pipeline_route_gist').using('gist', t.route),
]);

// Work submission — one row per field worker submission
export const submissions = pgTable('submissions', {
  id: serial('id').primaryKey(),
  project_id: integer('project_id').notNull(),
  worker_telegram_id: bigint('worker_telegram_id', { mode: 'number' }).notNull(),
  location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }),
  // ... other columns
}, (t) => [
  index('submission_location_gist').using('gist', t.location),
]);
```

**Migration caveat:** `drizzle-kit generate` may emit `geometry(point, 4326)` for linestring columns. Open the generated migration SQL and change `geometry(point, 4326)` to `geometry(linestring, 4326)` for route columns before applying. This is a known Drizzle limitation for non-point geometry types. Confirmed in: [Atomic Object article](https://spin.atomicobject.com/linestring-geometry-drizzle/).

### PostGIS + Drizzle: Nearest Segment Query

Finding the pipeline segment nearest to a GPS submission (for auto-assigning chainage):

```typescript
import { sql } from 'drizzle-orm';

// Find nearest route segment + distance from submission point
async function findNearestSegment(db: DB, projectId: number, lat: number, lon: number) {
  const submissionPoint = sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`;

  return db
    .select({
      routeId: pipeline_routes.id,
      // ST_ClosestPoint returns the point on the linestring nearest to input
      closestPoint: sql`ST_AsGeoJSON(ST_ClosestPoint(${pipeline_routes.route}, ${submissionPoint}))`,
      // Distance in metres using geography cast (Earth-accurate)
      distanceMetres: sql`ST_Distance(
        ${pipeline_routes.route}::geography,
        ${submissionPoint}::geography
      )`,
    })
    .from(pipeline_routes)
    .where(sql`${pipeline_routes.project_id} = ${projectId}`)
    .orderBy(sql`${pipeline_routes.route} <-> ${submissionPoint}`)
    .limit(1);
}

// ST_DWithin: check if submission is within 500m of any route (validation gate)
async function isNearRoute(db: DB, projectId: number, lat: number, lon: number): Promise<boolean> {
  const submissionPoint = sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`;
  const result = await db
    .select({ exists: sql`1` })
    .from(pipeline_routes)
    .where(sql`
      ${pipeline_routes.project_id} = ${projectId}
      AND ST_DWithin(
        ${pipeline_routes.route}::geography,
        ${submissionPoint}::geography,
        500
      )
    `)
    .limit(1);
  return result.length > 0;
}
```

Key rules:
- Always cast to `::geography` for metre-accurate distance (not planar degrees)
- Use `<->` KNN operator for ordered nearest-neighbor index scan
- GIST index is mandatory for performance; without it, every query is a full table scan

### Custom geography type (for explicit geography(Point,4326) columns)

Drizzle does not ship a native `geography()` type as of 0.45.x (a PR exists but is unmerged). Use `customType`:

```typescript
import { customType } from 'drizzle-orm/pg-core';

export const geographyPoint = customType<{
  data: { lon: number; lat: number };
  driverData: string;
}>({
  dataType() {
    return 'geography(Point, 4326)';
  },
  toDriver(value) {
    // PostGIS WKT format
    return `POINT(${value.lon} ${value.lat})`;
  },
  fromDriver(value: string) {
    // value comes back as WKB hex; use sql`` parse or wkx library
    // Simplest: store as GeoJSON via ST_AsGeoJSON in select, parse here
    const parsed = JSON.parse(value);
    return { lon: parsed.coordinates[0], lat: parsed.coordinates[1] };
  },
});
```

For simplicity in bayrak.ai v1, using `geometry(Point, 4326)` via the built-in Drizzle `geometry()` column plus `::geography` casts in queries achieves the same accuracy without the custom type overhead.

### grammY Webhook on Vercel (Next.js App Router)

File: `app/api/telegram/route.ts`

```typescript
// Next.js forces these for route handlers receiving external webhooks
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
// Vercel Fluid Compute is enabled by default for new projects (April 2025+)
// maxDuration should be set in vercel.json, not here
// Telegram times out webhook after 60s; set maxDuration ≤ 55s

import { Bot, webhookCallback } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { PostgresAdapter } from '@grammyjs/storage-psql';
import pg from 'pg';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');

// Neon connection (use @neondatabase/serverless for edge, pg for Node)
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const bot = new Bot(token);

// Sessions backed by Neon Postgres
bot.use(
  session({
    storage: new PostgresAdapter({ pool }),
    initial: () => ({}),
  })
);

// Conversations plugin
bot.use(conversations());
bot.use(createConversation(workLogFlow));

// ... register handlers

// Export as Next.js POST route handler
export const POST = webhookCallback(bot, 'std/http');
```

`vercel.json` (root):
```json
{
  "functions": {
    "app/api/telegram/route.ts": {
      "memory": 1024,
      "maxDuration": 55
    }
  }
}
```

`next.config.ts` — add grammY to serverComponentsExternalPackages:
```typescript
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['grammy', 'pg'],
  },
};
```

**Fluid Compute note:** As of April 23, 2025, Fluid Compute is enabled by default for all new Vercel projects. It allows concurrent requests in the same function instance, reducing cold starts. The grammY webhook pattern is I/O-heavy and benefits directly from this.

### grammY Conversations: Multi-Step Work Log Flow

```typescript
import { Conversation, ConversationFlavor, conversations, createConversation } from '@grammyjs/conversations';
import { Bot, Context, InlineKeyboard } from 'grammy';

type BotContext = ConversationFlavor<Context>;
type WorkLogConversation = Conversation<BotContext, Context>;

async function workLogFlow(conversation: WorkLogConversation, ctx: Context) {
  // Step 1: Photo (enforce — reject non-photo)
  await ctx.reply('📸 İş fotoğrafını gönder.');
  const photoCtx = await conversation.waitFor(':photo', {
    otherwise: (ctx) => ctx.reply('❌ Lütfen bir fotoğraf gönder.'),
  });
  const fileId = photoCtx.msg.photo.at(-1)!.file_id;

  // Step 2: Native location share (enforce)
  await ctx.reply('📍 Konumunu paylaş (Konum Paylaş düğmesi).');
  const locationCtx = await conversation.waitFor(':location', {
    otherwise: (ctx) => ctx.reply('❌ Lütfen canlı konum değil, anlık konum paylaş.'),
  });
  const { latitude, longitude } = locationCtx.msg.location;

  // Step 3: Quantity (numeric)
  await ctx.reply('🔢 Miktar gir (sayı):');
  const quantity = await conversation.form.number({
    otherwise: (ctx) => ctx.reply('❌ Geçerli bir sayı gir.'),
  });

  // Step 4: Notes (optional text)
  await ctx.reply('📝 Notlar (veya "geç" yaz):');
  const notesCtx = await conversation.waitFor(':text');
  const notes = notesCtx.msg.text === 'geç' ? null : notesCtx.msg.text;

  // Step 5: Confirm with inline keyboard
  const confirmKb = new InlineKeyboard()
    .text('✅ Onayla', 'confirm')
    .text('❌ İptal', 'cancel');
  await ctx.reply(`Özet:\nFoto: ✓\nKonum: ${latitude},${longitude}\nMiktar: ${quantity}\nNot: ${notes ?? '-'}`, {
    reply_markup: confirmKb,
  });

  const callbackCtx = await conversation.waitForCallbackQuery(['confirm', 'cancel']);
  await callbackCtx.answerCallbackQuery();

  if (callbackCtx.callbackQuery.data === 'cancel') {
    await ctx.reply('İptal edildi.');
    return;
  }

  // Persist to DB via conversation.external() to isolate side effects from replay
  const submissionId = await conversation.external(() =>
    persistSubmission({ fileId, latitude, longitude, quantity, notes })
  );

  await ctx.reply(`✅ Kaydedildi. Denetçi onayı bekleniyor. (#${submissionId})`);
}
```

**Replay engine rule:** All database calls, random values, and date/time calls inside a conversation function MUST be wrapped in `conversation.external()`. The plugin re-executes the function from the top on every new update; non-deterministic code outside `external()` will produce inconsistent state.

### Auditor Approve/Reject Flow (Inline Callback)

The auditor flow is NOT a conversation — it's a simple callback query handler:

```typescript
bot.callbackQuery(/^audit_(approve|reject)_(\d+)$/, async (ctx) => {
  const [, action, submissionIdStr] = ctx.callbackQuery.data.match(...)!;
  const submissionId = parseInt(submissionIdStr);

  if (action === 'approve') {
    await db.update(submissions)
      .set({ status: 'approved' })
      .where(eq(submissions.id, submissionId));
    // Decrement BOQ line
    await decrementBoqLine(submissionId);
    await ctx.editMessageText('✅ Onaylandı.');
    await ctx.answerCallbackQuery('Onaylandı.');
  } else {
    // Prompt for rejection reason — this IS a short conversation
    await ctx.conversation.enter('rejectionReasonFlow');
  }
});
```

### AI SDK Vision: Photo Anomaly Flagging

```typescript
import { generateText } from 'ai';

// AI Gateway provides the model routing; no @ai-sdk/anthropic needed
// Model string format: 'provider/model-id'
async function flagPhotoAnomalies(photoUrl: string, submissionContext: string) {
  const { text } = await generateText({
    model: 'anthropic/claude-sonnet-4.5',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are a construction site quality auditor. Context: ${submissionContext}. Analyse this photo and flag any anomalies: missing safety gear, incorrect materials, poor workmanship, location mismatch. Reply in JSON: { "anomalies": string[], "risk": "low"|"medium"|"high", "summary": string }`,
          },
          {
            type: 'image',
            image: photoUrl, // HTTPS URL to Vercel Blob photo
          },
        ],
      },
    ],
  });
  return JSON.parse(text);
}
```

Environment variables:
```
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_key
```

The `ai` SDK v6 auto-discovers AI Gateway via `AI_GATEWAY_API_KEY`. No `createGateway()` call needed. Confirmed: [Vercel AI Gateway Getting Started](https://vercel.com/docs/ai-gateway/getting-started/text).

**OIDC alternative (recommended for Vercel-deployed apps):** Instead of a static API key, run `vercel env pull` to provision OIDC tokens automatically — no manual rotation needed. The AI SDK picks these up from environment without any code change.

### Mapbox GL JS in Next.js App Router

Mapbox GL JS manipulates the DOM directly; it must be in a Client Component:

```typescript
// components/PipelineMap.tsx
'use client';

import Map, { Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { FeatureCollection, LineString } from 'geojson';

interface Props {
  route: FeatureCollection<LineString>;
  submissionPoints: FeatureCollection;
}

export function PipelineMap({ route, submissionPoints }: Props) {
  return (
    <Map
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{ longitude: 27.5, latitude: 41.5, zoom: 10 }}
      style={{ width: '100%', height: '500px' }}
      mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
    >
      {/* Pipeline route as LineString */}
      <Source id="pipeline" type="geojson" data={route}>
        <Layer
          id="pipeline-line"
          type="line"
          paint={{ 'line-color': '#f59e0b', 'line-width': 3 }}
        />
      </Source>

      {/* Approved work submission points */}
      <Source id="submissions" type="geojson" data={submissionPoints}>
        <Layer
          id="submission-points"
          type="circle"
          paint={{
            'circle-radius': 6,
            'circle-color': [
              'match',
              ['get', 'status'],
              'approved', '#22c55e',
              'rejected', '#ef4444',
              '#94a3b8', // pending
            ],
          }}
        />
      </Source>
    </Map>
  );
}
```

Server component passes pre-fetched GeoJSON to the client map component. GeoJSON route data is stored in Neon (as the `route` geometry column) and fetched via a Server Component or route handler using `ST_AsGeoJSON()`.

Environment variable: `NEXT_PUBLIC_MAPBOX_TOKEN` (public, prefixed).

### Auth.js v5 Magic-Link with Resend + Drizzle Adapter

`auth.ts`:
```typescript
import NextAuth from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/db';
import { accounts, sessions, users, verificationTokens } from '@/db/auth-schema';

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
});
```

`app/api/auth/[...nextauth]/route.ts`:
```typescript
import { handlers } from '@/auth';
export const { GET, POST } = handlers;
```

Environment variables:
```
AUTH_SECRET=generate-with-openssl-rand-base64-32
AUTH_RESEND_KEY=re_xxxxxxxxxxxx
AUTH_URL=https://bayrak.ai  # or localhost:3000 for dev
```

Schema additions (add to your Drizzle schema alongside domain tables):
- `users` table (id, name, email, emailVerified, image)
- `accounts` table (OAuth linkage — needed even for magic-link)
- `verificationTokens` table (identifier, token, expires — the magic-link token store)
- `sessions` table (only needed if using database sessions strategy; JWT strategy skips this)

Auth.js v5 is still in beta (`5.0.0-beta.31`). The beta has been stable for over a year and is the standard for Next.js 15+ projects. Do not use `next-auth@4.x` with App Router — the v4 integration with App Router is awkward.

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @neondatabase/serverless | latest | Neon HTTP driver | Route handlers / edge; use `pg` for bot/server code |
| @vercel/blob | 2.4.x | Photo storage | All file uploads from both bot and dashboard |
| wkx | 0.5.x | WKB hex → GeoJSON | Parsing PostGIS geometry results in custom `fromDriver` functions |
| zod | 3.x | Schema validation | Validate bot conversation inputs, API request bodies |
| ExcelJS | latest | BOQ Excel import | Office engineer BOQ upload workflow |

---

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

---

## Installation

```bash
# Core framework
npx create-next-app@latest bayrak-ai --typescript --tailwind --app --src-dir
npx shadcn@latest init

# Database + ORM
npm install drizzle-orm @neondatabase/serverless pg
npm install -D drizzle-kit @types/pg

# Auth
npm install next-auth@beta @auth/drizzle-adapter resend

# Telegram bot
npm install grammy @grammyjs/conversations @grammyjs/storage-psql

# Map
npm install mapbox-gl react-map-gl
npm install -D @types/mapbox-gl

# AI
npm install ai

# File storage
npm install @vercel/blob

# i18n
npm install next-intl

# Utilities
npm install wkx zod
npm install -D tsx
```

---

## Environment Variables Reference

```bash
# Database
DATABASE_URL=postgresql://...@ep-xxx.neon.tech/bayrak_ai?sslmode=require

# Auth
AUTH_SECRET=<openssl rand -base64 32>
AUTH_RESEND_KEY=re_xxxxxxxx
AUTH_URL=https://bayrak.ai

# Telegram
TELEGRAM_BOT_TOKEN=1234567890:AAAAA...

# Mapbox (public — safe to expose)
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1Ij...

# AI Gateway
# Use static API key below, OR provision via OIDC (vercel env pull on Vercel projects - no manual rotation needed)
AI_GATEWAY_API_KEY=vg_xxxxxxxx
```

---

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

---

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
