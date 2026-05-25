# Architecture Research

**Domain:** Linear-infrastructure field-ops platform (Telegram bot + web dashboard + geospatial + AI assist)
**Researched:** 2026-05-23
**Confidence:** HIGH (stack fixed by constraints; patterns verified against grammY docs, PostGIS docs, Drizzle docs, saha ADR precedents)

---

## System Overview

```
┌─────────────────────────── FIELD CHANNEL ─────────────────────────────┐
│  Telegram Worker Chat                 Telegram Auditor Chat            │
│  (conversational state machine)       (inline callback buttons)        │
└────────────────┬──────────────────────────────┬───────────────────────┘
                 │ webhook (POST)                │ callback_query (POST)
                 ▼                               ▼
┌─────────────────────────── NEXT.JS MONOLITH (Vercel) ─────────────────┐
│                                                                        │
│  /api/telegram/webhook  ─── grammY Bot ──┬── BotConversation engine   │
│       (Route Handler)                    │   (sessions → Neon)        │
│                                          ├── SubmissionService         │
│                                          ├── AuditService              │
│                                          └── NotificationService       │
│                                                                        │
│  /api/ai/vision         ─── AI SDK (Claude) ── VisionAnalysis          │
│       (Route Handler)                                                  │
│                                                                        │
│  /dashboard/*           ─── React Server Components (App Router)       │
│       Auth: Auth.js magic-link                                         │
│       Map: Mapbox GL JS (client component)                             │
│       Data: Server Actions → DB queries                                │
│                                                                        │
│  /api/projects/*        ─── REST Route Handlers (BOQ mgmt, GeoJSON)   │
│                                                                        │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
        ┌───────────────────────┼──────────────────────┐
        ▼                       ▼                      ▼
  Neon Postgres           Vercel Blob             Telegram API
  + PostGIS               (photos)                (outbound notify)
  Drizzle ORM
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **grammY webhook handler** (`/api/telegram/webhook`) | Receives all Telegram updates; routes to BotConversation or AuditCallbackHandler depending on update type | BotConversation engine, AuditCallbackHandler, Neon via Drizzle |
| **BotConversation engine** | Owns the worker dialog state machine (States 0–6); persists state in Neon via `@grammyjs/storage-psql`; enforces input types; calls SubmissionService on confirm | Neon (session store), SubmissionService, Telegram API (outbound messages) |
| **AuditCallbackHandler** | Handles `callback_query` from auditor Approve/Reject buttons; calls AuditService; triggers side-effects atomically | AuditService, NotificationService, Neon |
| **SubmissionService** | Creates a `submissions` row with `status: pending_audit`; triggers spatial matching; invokes AI vision (async); pings auditor | Neon, SpatialService, AI Route Handler (background), NotificationService |
| **AuditService** | Transitions `submissions.status`; runs approval transaction (BOQ decrement + map point write) atomically; or sets rejected + reason | Neon (transaction) |
| **SpatialService** | Matches submission lat/long to nearest route segment using PostGIS; writes `matched_chainage` and `nearest_point` back to submission | Neon + PostGIS |
| **NotificationService** | Sends outgoing Telegram messages (auditor ping on submission, worker rejection notice); thin wrapper over grammY's `bot.api` | Telegram API |
| **AI Vision Route Handler** (`/api/ai/vision`) | Receives photo URL + submission metadata; calls Claude vision via AI SDK; returns structured anomaly/classification JSON; stores result | Neon (vision_results table), Vercel AI Gateway |
| **Dashboard (App Router)** | Office Engineer UI: project setup, BOQ management, GeoJSON route upload, live map view (approved markers + colored segments) | Neon via Server Actions and Route Handlers, Mapbox GL JS (client) |
| **Auth layer** | Auth.js magic-link for dashboard; Telegram User ID (from update.message.from.id) for bot identity | Neon (sessions table) |

---

## Dialog State Machine (Worker Bot, States 0–6)

### Durability Choice: grammY Conversations Plugin + `@grammyjs/storage-psql`

**Decision:** Use the grammY Conversations plugin with `@grammyjs/storage-psql` backed by Neon Postgres. Do NOT use in-memory sessions.

**Rationale:** Vercel runs serverless functions that can be on different instances across invocations. In-memory session state is lost between cold starts and across concurrent workers. The `@grammyjs/storage-psql` adapter serializes conversation replay state to a `sessions` table in Neon, making dialog state durable across serverless restarts with zero additional infrastructure.

**Critical constraint from grammY docs:** In serverless environments, do NOT use custom `getStorageKey` functions — stick to the default per-chat key to avoid race conditions. Each worker's conversation is keyed by their `chat_id`.

**How replay works:** The grammY Conversations plugin is a replay engine, not a classic Redux state machine. When a worker sends a message, the conversation function replays from the beginning (skipping past API calls) until it reaches the current wait point, then continues. Side effects (DB writes, `Math.random()`, time calls) MUST be wrapped in `conversation.external()` to prevent duplicate execution during replay.

### State Machine Definition

```
State 0 — Project Select
  Wait: inline keyboard showing worker's assigned projects
  Invalid: not a callback_query → reprompt "Lütfen listeden seçiniz"

State 1 — Photo Upload
  Wait: photo message
  Invalid: text/location/document → reprompt "Lütfen önce fotoğraf gönderin"

State 2 — Location Share
  Wait: native Telegram location message (message.location)
  Invalid: text/photo/pin-drop URL → reprompt "Lütfen konum paylaş butonunu kullanın"

State 3 — Quantity Input
  Wait: text message parseable as positive float
  Invalid: non-numeric → reprompt "Lütfen sayısal bir miktar girin (örn: 25.5)"

State 4 — Notes (optional, with skip button)
  Wait: text message OR "Geç" callback_query
  No invalid — any text accepted; empty accepted via skip

State 5 — Confirm
  Wait: callback_query [✅ Onayla] or [❌ İptal]
  On Onayla → SubmissionService.create() wrapped in conversation.external()
  On İptal → restart from State 0

State 6 — Done (terminal)
  Bot sends "Gönderildi ✅" + submission ID
  Conversation ends, session cleared
```

**Reprompt pattern:** Each wait call is wrapped in a loop that validates the incoming message type. Invalid inputs send a Turkish error message and loop back to the same `conversation.wait()` call — the state machine does not advance.

```typescript
// Canonical reprompt loop pattern
while (true) {
  const msg = await conversation.wait();
  if (msg.message?.photo) break;  // valid
  await ctx.reply("Lütfen önce fotoğraf gönderin 📷");
}
```

---

## Submission Lifecycle State Machine

```
[Worker confirms] ──→ submissions.status = 'pending_audit'
                         │
                         ├── SpatialService.matchSegment() (sync, before insert)
                         ├── NotificationService.pingAuditor() (async, after insert)
                         └── AI Vision job enqueued (async, non-blocking)

[Auditor taps ✅] ──→ AuditService.approve(submissionId)
                         │
                         └── BEGIN TRANSACTION
                               UPDATE submissions SET status = 'approved', audited_at = now(), auditor_id = ?
                               UPDATE boq_items SET approved_qty = approved_qty + ? WHERE id = ?
                               INSERT INTO approved_points (submission_id, location, matched_segment_fraction)
                             COMMIT
                         │
                         └── NotificationService (no worker notify needed on approve — silent)
                             Dashboard map layer invalidation (auto via Next.js revalidatePath or SWR polling)

[Auditor taps ❌] ──→ AuditService.reject(submissionId)
                         │
                         ├── Bot prompts auditor: "Ret gerekçesi?" (free text wait)
                         └── UPDATE submissions SET status = 'rejected', rejection_reason = ?, audited_at = now()
                             NotificationService.notifyWorker(workerId, rejectionReason)
```

### Transactional Integrity

The approval is a single Postgres transaction covering three writes:
1. `submissions` status update
2. `boq_items` atomic counter increment (`approved_qty += qty`)
3. Insert into `approved_points` (the spatial record that feeds the map)

This uses Drizzle's `db.transaction()`. If any write fails, all three roll back and the auditor receives an error message. The BOQ counter is never out of sync with the set of approved submissions.

**Double-approval guard:** A `CHECK` constraint or `WHERE status = 'pending_audit'` in the UPDATE prevents processing the same submission twice. Use optimistic locking: `UPDATE submissions SET status = 'approved' WHERE id = ? AND status = 'pending_audit' RETURNING id` — if no rows returned, reject the callback as stale.

---

## Spatial Subsystem

### Route Storage

The project route is stored as a PostGIS `geometry(LineString, 4326)` column on the `projects` table. The Office Engineer uploads a GeoJSON file through the dashboard; the API extracts the LineString coordinates and inserts them via `ST_GeomFromGeoJSON(?)`.

**Drizzle limitation:** Drizzle does not have a native `linestring` column type. Use a custom column type with `customType` that passes through WKB from Postgres and accepts GeoJSON strings on insert:

```typescript
import { customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const geometry = customType<{ data: GeoJSON.Geometry; driverData: string }>({
  dataType() { return 'geometry'; },
  fromDriver(value) { return JSON.parse(value); },  // ST_AsGeoJSON output
  toDriver(value) { return JSON.stringify(value); },
});
```

For read queries that need GeoJSON, wrap the column in `ST_AsGeoJSON()` via `sql` template literals.

### Nearest-Segment Matching (SpatialService)

When a submission arrives, run this query before persisting:

```sql
SELECT
  ST_LineLocatePoint(
    p.route_geometry,
    ST_SetSRID(ST_MakePoint($lon, $lat), 4326)
  ) AS segment_fraction,
  ST_AsGeoJSON(
    ST_ClosestPoint(
      p.route_geometry,
      ST_SetSRID(ST_MakePoint($lon, $lat), 4326)
    )
  ) AS snapped_point,
  ST_Distance(
    p.route_geometry::geography,
    ST_SetSRID(ST_MakePoint($lon, $lat), 4326)::geography
  ) AS distance_meters
FROM projects p
WHERE p.id = $project_id
  AND ST_DWithin(
    p.route_geometry::geography,
    ST_SetSRID(ST_MakePoint($lon, $lat), 4326)::geography,
    500  -- 500m proximity check; flag if outside
  )
```

`segment_fraction` (0.0–1.0) is stored on the submission and used for chainage display. `snapped_point` is stored as the canonical map location for the approved point. If `ST_DWithin` returns no row, `SpatialService` sets `location_warning = true` on the submission — the auditor sees a flag ("Worker is >500m from route").

### Mapbox Layer Feed

The dashboard fetches approved points from a Server Action or Route Handler that returns GeoJSON FeatureCollection. Each feature is an `approved_points` row with the `snapped_point` as geometry and submission metadata (worker name, qty, material, photo URL) as properties. Mapbox GL JS renders these as a circle layer over the project route LineString (loaded from `projects.route_geometry` via `ST_AsGeoJSON`).

---

## BOQ Model

### Schema Sketch

```
boq_items
  id              uuid PK
  project_id      uuid FK → projects
  code            text          -- e.g. "DN200-PE-BURIED"
  description     text
  unit            text          -- m, m², m³, pc, ton
  planned_qty     numeric(12,3) -- from contract
  approved_qty    numeric(12,3) -- auto-incremented on approval (default 0)
  created_at      timestamptz

submissions
  id              uuid PK
  project_id      uuid FK → projects
  worker_id       uuid FK → workers
  boq_item_id     uuid FK → boq_items   -- set at State 3 (qty input) or derived from project default
  status          text  -- 'pending_audit' | 'approved' | 'rejected'
  qty             numeric(12,3)
  photo_url       text  -- Vercel Blob URL
  raw_lat         float8
  raw_lon         float8
  segment_fraction float8       -- ST_LineLocatePoint result (0.0–1.0)
  snapped_point   geometry(Point, 4326)  -- ST_ClosestPoint result
  location_warning boolean default false
  notes           text
  rejection_reason text
  auditor_id      uuid FK → workers (nullable)
  ai_result_id    uuid FK → vision_results (nullable)
  submitted_at    timestamptz
  audited_at      timestamptz
```

**BOQ decrement:** `approved_qty` increments (not decrements — it accumulates approved work against the plan) atomically in the approval transaction:

```sql
UPDATE boq_items
SET approved_qty = approved_qty + $qty
WHERE id = $boq_item_id
  AND approved_qty + $qty <= planned_qty  -- optional guard against over-approval
RETURNING id
```

The office dashboard computes completion percentage as `approved_qty / planned_qty`. The saha ADR-0008 "parallel quantity counters" model is the conceptual precedent; bayrak.ai simplifies to a single counter per BOQ item since the workflow stage breakdown is not required for v1.

**BOQ item selection in the bot:** For the worker's flow, if the assigned project has a single BOQ item (common for a single-material pipe run), auto-select it. If multiple items exist, add a State 2.5 inline keyboard selection step between Photo and Location. This is a minor extension of the state machine — the router checks `boq_item_count` for the project after State 0.

---

## AI Vision Assist

### Placement in the Flow

AI vision runs **after submission persists**, **before the auditor opens the submission** — it is non-blocking for the worker loop.

Sequence:
1. Worker confirms → SubmissionService creates row with `status: pending_audit`
2. SubmissionService fires `POST /api/ai/vision` with `{ submission_id, photo_url, project_id }` — this is a non-awaited fetch (fire-and-forget within the route handler, or a background job via Vercel's `after()` hook from Next.js 15)
3. The vision route handler downloads the photo from Vercel Blob, calls Claude vision via AI SDK, parses the structured response, and writes to `vision_results`
4. Separately, NotificationService pings the auditor — the auditor's Telegram message includes a link to the dashboard submission view, not inline in the Telegram message itself for v1
5. When the auditor opens the dashboard review or taps the approve/reject button, the `vision_results` row is already written and displayed alongside the submission

**Why not inline in Telegram auditor message?** Telegram has strict timeout requirements; AI vision latency (2–8 seconds) would risk the webhook timing out before the bot can send the full auditor message. Keeping it async and dashboard-surfaced avoids this without any queuing infrastructure in v1.

### vision_results Table

```
vision_results
  id              uuid PK
  submission_id   uuid FK → submissions
  model           text          -- "claude-opus-4-5" or similar
  anomaly_flags   jsonb         -- [{ type: "location_mismatch", confidence: 0.87, detail: "..." }]
  work_classification text      -- auto-classified work type
  raw_response    jsonb         -- full model output for debugging
  created_at      timestamptz
```

The `anomaly_flags` array is displayed on the dashboard auditor review card as colored badges. High-confidence flags appear in the Telegram auditor message as a brief text appended: "⚠️ AI: Konum uyuşmazlığı tespit edildi" — sent as a separate follow-up message once the vision result is ready (using `bot.api.sendMessage(auditorChatId, ...)`).

---

## Data Model Sketch (Full Entity Map)

```
projects
  id, name, description, route_geometry(LineString), project_manager_id, created_at

workers
  id, telegram_user_id (unique), name, role ('worker' | 'auditor' | 'office_engineer'), created_at

assignments
  id, worker_id FK→workers, project_id FK→projects, role_on_project ('worker'|'auditor')
  -- A worker can be auditor on one project and worker on another
  -- An auditor is typically assigned to one active project

boq_items
  id, project_id FK→projects, code, description, unit, planned_qty, approved_qty, created_at

submissions
  id, project_id, worker_id, boq_item_id, status, qty,
  photo_url, raw_lat, raw_lon, segment_fraction, snapped_point(Point),
  location_warning, notes, rejection_reason, auditor_id, ai_result_id,
  submitted_at, audited_at

approved_points
  id, submission_id FK→submissions, location(Point), segment_fraction, created_at
  -- Denormalized for map query performance; populated in approval transaction

vision_results
  id, submission_id FK→submissions, model, anomaly_flags(jsonb),
  work_classification, raw_response(jsonb), created_at

sessions (grammY)
  key text PK   -- telegram chat_id as string
  value jsonb   -- serialized conversation replay state
  -- Managed by @grammyjs/storage-psql; not touched by application code
```

**No `tenant_id` in v1** — single-tenant MVP per PROJECT.md constraints. Schema designed without it but without hardcoded tenant identity, so adding `tenant_id` columns in v2 is a migration-only change.

---

## Recommended Project Structure

```
bayrak-ai/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/
│   │   │   ├── telegram/
│   │   │   │   └── webhook/route.ts  # grammY webhook entry point
│   │   │   ├── ai/
│   │   │   │   └── vision/route.ts   # Vision analysis endpoint
│   │   │   └── projects/
│   │   │       └── [id]/route.ts     # Project/BOQ management REST handlers
│   │   ├── dashboard/                # Office Engineer UI (RSC)
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx              # Project list
│   │   │   └── [projectId]/
│   │   │       ├── page.tsx          # Project dashboard + map
│   │   │       ├── boq/page.tsx      # BOQ management
│   │   │       └── submissions/page.tsx
│   │   ├── auth/                     # Auth.js pages
│   │   └── layout.tsx
│   ├── bot/                          # All grammY bot code
│   │   ├── index.ts                  # Bot instance, session middleware, conversation plugin
│   │   ├── conversations/
│   │   │   └── submit-work.ts        # Worker dialog state machine (States 0–6)
│   │   └── handlers/
│   │       └── audit-callback.ts     # Auditor Approve/Reject callback_query handler
│   ├── db/
│   │   ├── index.ts                  # Drizzle client
│   │   ├── schema/
│   │   │   ├── projects.ts
│   │   │   ├── workers.ts
│   │   │   ├── assignments.ts
│   │   │   ├── submissions.ts
│   │   │   ├── boq-items.ts
│   │   │   ├── approved-points.ts
│   │   │   ├── vision-results.ts
│   │   │   └── sessions.ts           # grammY session table definition
│   │   └── migrations/
│   ├── services/
│   │   ├── submission.ts             # SubmissionService — create, validate
│   │   ├── audit.ts                  # AuditService — approve/reject transactions
│   │   ├── spatial.ts                # SpatialService — PostGIS queries
│   │   └── notification.ts          # NotificationService — outbound Telegram messages
│   ├── lib/
│   │   ├── ai-vision.ts              # AI SDK call, response parsing, anomaly extraction
│   │   ├── mapbox.ts                 # GeoJSON helpers for dashboard
│   │   └── auth.ts                   # Auth.js config
│   └── components/
│       ├── map/
│       │   └── ProjectMap.tsx        # Mapbox GL JS client component
│       └── dashboard/
│           └── SubmissionCard.tsx    # Auditor review card with AI flags
├── drizzle.config.ts
├── .env.local
└── next.config.ts
```

---

## Data Flow (End-to-End)

```
WORKER FLOW
Worker sends message
    ↓
POST /api/telegram/webhook
    ↓
grammY Bot receives update
    ↓
session middleware loads conversation state from Neon (sessions table)
    ↓
BotConversation replays to current state
    ↓
  [State 0] project keyboard → assignments query → inline keyboard sent
  [State 1] photo → validate, store URL reference in conversation.external()
  [State 2] location → validate native location, store lat/lon
  [State 3] quantity → parse float, validate > 0
  [State 4] notes → accept or skip
  [State 5] confirm →
      conversation.external(() => SubmissionService.create({...}))
        ├── SpatialService.matchSegment(lat, lon, project_id) → segment_fraction, snapped_point
        ├── INSERT submissions (status: pending_audit)
        ├── after(): POST /api/ai/vision (non-blocking)
        └── NotificationService.pingAuditor(auditorChatId, submissionId)
  [State 6] "Gönderildi ✅" → conversation ends

AUDITOR FLOW
NotificationService sends Telegram message to auditor with:
  - Photo (forwarded / linked)
  - Location: Google Maps link from raw_lat/raw_lon
  - Quantity + notes
  - [✅ Onayla] [❌ Reddet] inline buttons (callback_data: "approve:SUB_ID" / "reject:SUB_ID")
    ↓
Auditor taps button
    ↓
POST /api/telegram/webhook (callback_query update)
    ↓
AuditCallbackHandler.handle(ctx)
    ↓
  [APPROVE]
    db.transaction():
      UPDATE submissions SET status='approved' WHERE id=? AND status='pending_audit' RETURNING id
      if no row → reply "Bu gönderi zaten işlendi"
      UPDATE boq_items SET approved_qty += qty WHERE id=?
      INSERT INTO approved_points (submission_id, location, segment_fraction)
    ctx.answerCallbackQuery("Onaylandı ✅")
    revalidatePath('/dashboard/[projectId]')  — or map layer polls

  [REJECT]
    ctx.reply("Ret gerekçesi nedir?") + conversation.wait() in auditor conversation
    UPDATE submissions SET status='rejected', rejection_reason=? WHERE id=?
    NotificationService.notifyWorker(workerId, reason)
    ctx.answerCallbackQuery("Reddedildi")

DASHBOARD FLOW
Office Engineer loads /dashboard/[projectId]
    ↓
RSC fetches:
  - projects.route_geometry via ST_AsGeoJSON → passed to client as prop
  - approved_points → GeoJSON FeatureCollection
  - boq_items (planned_qty, approved_qty)
    ↓
ProjectMap (client component) renders:
  - Route LineString as Mapbox GeoJSON source (line layer)
  - Approved points as circle layer (color by material/boq_item)
BOQ table renders completion bars (approved_qty / planned_qty)
```

---

## Architectural Patterns

### Pattern 1: Conversation-as-State-Machine with Postgres Session Backend

**What:** grammY Conversations plugin replays the conversation function on each incoming message. State is not an explicit enum stored in DB — it is the implicit position in the conversation function, serialized as replay log in the `sessions` table.

**When to use:** Anytime the bot needs multi-step input gathering that must survive serverless restarts and cold starts.

**Trade-offs:** Simpler code than an explicit FSM; the replay model can surprise developers unfamiliar with it. Side effects MUST use `conversation.external()` or they execute on every replay.

### Pattern 2: Approval Transaction as Single DB Transaction

**What:** The three writes on approval (submission status, BOQ counter, approved_point insert) run in a single Drizzle `db.transaction()`. The WHERE clause on the submission update acts as an optimistic lock.

**When to use:** Any time approval has side effects that must be atomic. Prevents partial updates (BOQ incremented but submission still `pending_audit`).

### Pattern 3: Async AI Vision via `after()` Hook

**What:** Use Next.js 15's `after()` function inside the webhook route handler to schedule the vision API call after the response is sent. This prevents the AI latency from blocking the Telegram webhook acknowledgement.

**When to use:** Any background work that should not block the Telegram response. Vercel requires a 200 response within ~10 seconds; Claude vision can take 3–8 seconds.

**Trade-offs:** No retry on failure in v1. If the vision call fails, `vision_results` has no row for that submission — auditor sees no AI flags. Accept this in v1; add a retry queue in v2 if needed.

### Pattern 4: Spatial Matching Before Persistence

**What:** Run `ST_DWithin` / `ST_LineLocatePoint` / `ST_ClosestPoint` synchronously before writing the submission row. Store `segment_fraction`, `snapped_point`, and `location_warning` on the submission.

**When to use:** Always — spatial matching is cheap (single indexed query) and the result is needed for both the auditor alert and the map.

**Trade-offs:** Adds ~20–50ms to the submission path. Acceptable; the spatial index on `route_geometry` makes this fast.

---

## Anti-Patterns

### Anti-Pattern 1: In-Memory grammY Sessions on Vercel

**What people do:** Leave grammY at default `MemorySessionStorage`.

**Why it's wrong:** Vercel spins up a new function instance for each webhook call. In-memory state from a prior call is gone. Workers get reset to State 0 mid-flow.

**Do this instead:** `@grammyjs/storage-psql` backed by Neon. One `sessions` table; zero extra infrastructure.

### Anti-Pattern 2: BOQ Counter as Derived Query (COUNT over submissions)

**What people do:** Compute `approved_qty` at read time by summing submissions with `status='approved'`.

**Why it's wrong:** Correct for small datasets but unindexable for the dashboard table. Also non-atomic — a race between two simultaneous approvals can double-count.

**Do this instead:** Atomic `UPDATE boq_items SET approved_qty += qty` inside the approval transaction. Read is a simple column scan.

### Anti-Pattern 3: Awaiting AI Vision in the Webhook Handler

**What people do:** `await callVisionAPI(photoUrl)` inside the webhook route handler before returning 200.

**Why it's wrong:** Telegram re-sends the webhook if no 200 within ~5 seconds. Claude vision takes 3–8 seconds. Result: duplicate submissions.

**Do this instead:** `after(() => callVisionAPI(submissionId))` — runs after 200 is sent.

### Anti-Pattern 4: Storing Raw lat/lon Only (No Spatial Snapping)

**What people do:** Store `raw_lat`, `raw_lon` and compute "on the segment?" at render time in JS.

**Why it's wrong:** GPS drift means raw points scatter off the route. Mapbox will render scattered dots, not a clean progress layer. The `segment_fraction` ordering is lost.

**Do this instead:** Snap to route with `ST_ClosestPoint` at submission time, store `snapped_point`. Render the snapped point on the map; show raw point in auditor detail as debugging info.

### Anti-Pattern 5: Single Auditor-per-Bot-Conversation (Sharing Auditor's Bot State)

**What people do:** Use the same grammY conversation context for the reject-reason follow-up as the worker conversation.

**Why it's wrong:** The auditor has their own chat context. The reject-reason wait needs a separate short-lived conversation keyed to the auditor's `chat_id`, not the worker's.

**Do this instead:** When the auditor taps Reject, enter a short auditor-side conversation (or use a `force_reply` message and handle the reply in the callback handler without a full conversation).

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Telegram Bot API | grammY webhook at `/api/telegram/webhook` (POST); outbound via `bot.api.*` | Set webhook URL via `setWebhook` once per deploy; use `secretToken` header to authenticate Telegram requests |
| Neon Postgres + PostGIS | Drizzle client; PostGIS queries via `sql` template literals for spatial functions | Run `CREATE EXTENSION IF NOT EXISTS postgis` in initial migration; custom column type for geometry |
| Vercel Blob | `put(filename, buffer, { access: 'public' })` → URL stored in submissions | Photos uploaded from bot: download file from Telegram API (`getFile`), pipe to Blob |
| Vercel AI Gateway + Claude | AI SDK `generateObject` or `generateText` with vision; structured JSON output via Zod schema | Vision input: `[{ type: 'image_url', image_url: { url: blobUrl }}]` |
| Mapbox GL JS | Client component with `mapboxgl.Map`; GeoJSON sources populated from Server Action output | Mapbox token in `NEXT_PUBLIC_MAPBOX_TOKEN`; do NOT use server-rendered map |
| Auth.js | Magic-link email provider; session checked in dashboard layout via `auth()` | Configure `NEXTAUTH_SECRET`, `EMAIL_SERVER`, `EMAIL_FROM` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| webhook handler ↔ BotConversation | Direct function call; grammY middleware chain | Both in the same serverless function invocation |
| BotConversation ↔ SubmissionService | `conversation.external(() => service.create())` | Required to avoid replay side effects |
| AuditCallbackHandler ↔ AuditService | Direct `await` — callback_query handlers are short-lived | Run inside the same webhook invocation |
| webhook route ↔ vision route | HTTP `fetch` (fire-and-forget via `after()`) | Separate serverless function invocation; no shared state |
| Dashboard Server Actions ↔ DB | Drizzle queries in `'use server'` functions | Revalidate map data path after approval |
| SpatialService ↔ DB | `db.execute(sql\`SELECT ST_...\`)` raw queries | No Drizzle query builder abstraction for PostGIS functions |

---

## Suggested Build Order

Dependencies determine phase order. Each phase's output is a prerequisite for the next.

```
Phase 1 — Foundation (DB + skeleton)
  ├── Neon database, PostGIS extension
  ├── Drizzle schema (all tables, migrations)
  ├── Next.js project scaffold
  └── Auth.js magic-link for dashboard

Phase 2 — Bot Core (conversation without spatial)
  ├── grammY bot instance + sessions (storage-psql)
  ├── Worker conversation (States 0–6)
  ├── Submission creation (status: pending_audit)
  └── Reprompt-on-invalid handling

Phase 3 — Audit Loop
  ├── Auditor notification (ping on submission)
  ├── Approve/Reject callback handler
  ├── Approval transaction (BOQ increment + approved_point insert)
  └── Worker rejection notification

Phase 4 — Spatial Layer
  ├── GeoJSON route upload in dashboard
  ├── SpatialService (ST_DWithin + ST_LineLocatePoint + ST_ClosestPoint)
  ├── Location_warning flag surfaced in auditor message
  └── Approved_points populated in approval transaction

Phase 5 — Dashboard + Map
  ├── Project list and BOQ management UI
  ├── Mapbox GL JS map component
  ├── Route LineString layer
  ├── Approved points layer
  └── BOQ progress bars

Phase 6 — AI Vision Assist
  ├── Vision route handler
  ├── AI SDK Claude vision call
  ├── vision_results table
  ├── Anomaly flags on dashboard submission card
  └── Follow-up Telegram message to auditor with high-confidence flags
```

**Why this order:**
- Phases 1–3 deliver the core value loop (worker submits → auditor approves → BOQ updates) with no map or AI dependencies — this can be validated with real users first
- Phase 4 (spatial) requires Phase 1 (schema) and Phase 3 (the approved_points write happens inside the approval transaction)
- Phase 5 (dashboard/map) requires Phase 4 (no approved points to render without spatial matching)
- Phase 6 (AI) requires Phase 3 (submissions must exist) and Phase 5 (dashboard card to display flags) but is independent of Phase 4 — could be moved earlier if the auditor decision-support is higher priority

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1–5 workers, 1 project | Current monolith — no changes needed |
| 10–50 workers, 5 projects | Add `ANALYZE` on spatial columns; consider connection pooling (Neon's built-in pooler is sufficient) |
| 100+ workers | Vercel functions scale automatically; Neon scales compute; PostGIS spatial index handles query load |
| Multi-tenant (v2) | Add `tenant_id` to all domain tables; add tenant routing to Auth.js; no architectural change needed |

---

## Sources

- grammY Sessions documentation: https://grammy.dev/plugins/session
- grammY Conversations documentation: https://grammy.dev/plugins/conversations
- grammY storage adapters (psql confirmed): https://github.com/grammyjs/storages/tree/main/packages
- grammY Vercel hosting: https://grammy.dev/hosting/vercel
- Drizzle PostGIS geometry point guide: https://orm.drizzle.team/docs/guides/postgis-geometry-point
- PostGIS ST_LineLocatePoint: https://postgis.net/docs/ST_LineLocatePoint.html
- saha ADR-0004 (project/branch hierarchy, party handling) — reference for data model shape
- saha ADR-0008 (quantity counters vs state machine) — contrast: bayrak.ai uses a simpler single approved_qty counter since workflow stage breakdown is out of scope for v1

---
*Architecture research for: bayrak.ai — linear-infrastructure field-ops platform*
*Researched: 2026-05-23*
