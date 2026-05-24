# Phase 2: Worker Bot - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers the **conversational Telegram worker bot** — the full six-step
submission flow, in Turkish, with strict input enforcement and durable persistence.

A registered, active worker runs the bot end-to-end:
**project → BOQ item → photo → location → quantity → notes → confirm**,
each step guided and validated, and on confirm a submission row is written with
`status: pending_audit`. The flow is **exactly-once** (a duplicated Telegram
update never creates a second row) and **cold-start-safe** (a half-finished flow
resumes at the correct step after a serverless restart).

Requirements in scope: LOG-01, LOG-02, LOG-03, LOG-04, LOG-05, LOG-06, LOG-07,
LOG-08, LOG-09, LOG-10, I18N-01.

**Builds on Phase 1:** extends the existing secured webhook handler
(`src/app/api/telegram/webhook/route.ts`) and reads the `people` / `assignments`
/ `boq_items` tables. Worker identity (Telegram ID → active person + project
assignments) and `/start` onboarding already exist (Phase 1 D-01/D-02).

**Not this phase:**
- The audit loop — auditor notification, Approve/Reject, BOQ decrement (Phase 3 / AUDIT-*).
- PostGIS nearest-segment matching and the route-distance **geofence** (Phase 4 / GEO-01, GEO-02). Phase 2 accepts any native location; it does not judge whether the location is near the route.
- Mapbox dashboard rendering (Phase 5).
- AI vision/notes assist (Phase 6).
</domain>

<decisions>
## Implementation Decisions

### State Engine & Persistence
- **D-12:** Use an **explicit DB-row finite-state machine**, NOT
  `@grammyjs/conversations`. One `conversation_state` row per worker (keyed by
  `telegram_id` / person) holds `current_step` and the partial submission as
  JSON. Rationale: the flow is strictly linear (6 fixed steps, no branching);
  a plain DB-row FSM is easy to reason about, debuggable, and **sidesteps the
  grammY conversations replay footgun** flagged in STATE.md (no need to wrap
  every side-effect in `conversation.external()`). `@grammyjs/conversations`
  and `@grammyjs/storage-psql` are therefore **not** required and need not be
  installed.
- **D-22:** `conversation_state` rows **expire after a TTL (~24h)**. A stale
  row (older than the TTL) is treated as abandoned: the worker's next message
  starts a clean flow rather than resuming a day-old, irrelevant log.
  Implement as a timestamp check on read (planner picks exact TTL).

### Idempotency & Exactly-Once (SC4)
- **D-13:** Two independent guards, belt-and-suspenders:
  1. **Processed-`update_id` dedup** — persist each handled Telegram `update_id`;
     a replayed/duplicate update is a no-op for the whole webhook pipeline.
  2. **Unique constraint on the submission's natural key** (e.g. the
     conversation/flow id) — a double-confirm cannot insert two submission rows.
- A duplicate-update integration test is **mandatory on day one** (STATE.md
  Phase 2 blocker).

### Flow Control & Corrections
- **D-14:** On resume of a half-finished flow (after cold start, delay, or next
  message), **reprompt the current step in Turkish** (e.g. "Devam ediyoruz —
  lütfen fotoğraf gönderin 📷"). Workers on flaky field connections always see
  what's expected.
- **D-15:** `/start` while a flow is in progress offers an inline
  **"Devam et / Baştan başla"** choice. Never silently discards a half-done log.
- **D-16:** The **confirm step shows a full summary** of the captured submission
  with **per-field edit buttons** — the worker can jump back and redo any single
  field (e.g. "Fotoğrafı değiştir", "Miktarı düzelt") and return to confirm,
  without restarting the whole flow. The FSM must support jump-to-step → return-to-confirm.
- **D-17:** A Turkish **`/iptal`** (cancel) command is available at **any step**;
  it clears the `conversation_state` row and confirms "İptal edildi".
- **D-18:** After a successful confirm, send the **"Gönderildi"** confirmation
  plus a **"Yeni kayıt"** (new log) button. Do **not** auto-loop into a new flow;
  the worker explicitly chooses to start another.

### Input Enforcement & Reprompts (SC2)
- **D-19:** On wrong input type (text where a photo is expected, typed
  coordinates instead of a native location share, non-numeric quantity), the bot
  **rejects and re-explains what's needed with a short how-to hint** in Turkish
  (e.g. for location: a one-line "📎 → Konum" hint). The step does **not** advance.
  Field workers may be low-literacy — an explicit hint beats a terse error.
- **D-20:** **Accept any native Telegram location message** (lat/long present);
  reject only typed coordinates. Whether the location is actually near the
  pipeline route is the **GEO-02 geofence in Phase 4** — Phase 2 must not
  pre-empt it.
- **D-21:** Notes (LOG-07) are optional: the worker can **type notes OR tap
  "Atla" (skip)**. Skipped/empty notes are stored as `null`.

### BOQ Item Selection (LOG-03)
- **D-23:** Present BOQ line items as a **paginated inline keyboard**
  (one button per item, ~6–8 per page, with ‹ › navigation). Tap-only, scales
  past Telegram's practical single-keyboard button limit. The **project list
  (LOG-02)** reuses this same paginated keyboard pattern when a worker has many
  assignments.
- **D-24:** Each BOQ option **shows its remaining balance** (e.g. "Boru döşeme —
  320/500 m kaldı"), read from the Phase-1 balance logic (`src/lib/boq-balance.ts`).
- **D-25:** Selecting a **fully-consumed (0-balance) item is allowed** with a
  **soft warning** ("Bu kalem tamamlandı (0 kaldı). Yine de devam?"). Over-delivery
  is real in construction; true quantity reconciliation/enforcement is Phase 3
  (audit + atomic BOQ decrement). Do not block legitimate field logging here.

### Localization (I18N-01)
- **D-26:** The worker bot operates in **Turkish only** (no language toggle for
  workers; the TR/EN toggle is the dashboard's, already shipped in Phase 1).
  Tone: **respectful "siz" form**, plain and field-friendly, light emoji as
  affordance cues (📷 photo, 📍 location). next-intl targets RSC/dashboard, not
  the webhook handler — the bot's Turkish strings live in a **simple message
  catalog** (planner picks the exact mechanism; keep it a single source of truth
  so copy is easy to tune).

### Claude's Discretion
- Exact `conversation_state` / `processed_updates` / `submissions` table and
  column names, indexes, and Drizzle schema organization — honor D-12, D-13, D-22.
- The exact TTL value for stale `conversation_state` (D-22).
- The FSM's internal step representation and the jump-to-step/edit mechanism (D-16).
- **Single photo per submission** (default chosen): one photo, uploaded to
  Vercel Blob — planner decides upload-on-receipt vs upload-on-confirm.
- Quantity prompt shows the selected BOQ item's **unit** (e.g. "Kaç metre?");
  numeric parsing accepts decimals (planner decides decimal/locale handling).
- Pagination page size, button ordering, and exact Turkish copy/wording for
  every prompt (within the D-26 tone).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — product vision, locked stack, single-tenant hedge.
- `.planning/REQUIREMENTS.md` — Phase 2 = LOG-01–10, I18N-01 (full text per requirement).
- `.planning/ROADMAP.md` §"Phase 2: Worker Bot" — goal + 5 success criteria.
- `CLAUDE.md` — **locked tech stack + integration patterns** (grammY webhook on Vercel, Drizzle/Neon, @vercel/blob, zod, next-intl). Note: this CONTEXT overrides the CLAUDE.md "recommended" `@grammyjs/conversations` choice — see D-12.

### Research (stack, architecture, pitfalls)
- `.planning/research/STACK.md` — grammY webhook on Vercel pattern, Drizzle schema, zod input validation, @vercel/blob photo upload.
- `.planning/research/ARCHITECTURE.md` — entity/data-model sketch, component boundaries, build order.
- `.planning/research/PITFALLS.md` — **idempotency/replay groundwork**, coordinate order (lng,lat), serverless statelessness.
- `.planning/research/SUMMARY.md` — cross-cutting risk table + resolved decisions.

### Existing code this phase extends (Phase 1 output)
- `src/app/api/telegram/webhook/route.ts` — the secured webhook entry point (X-Telegram secret-token check, Node runtime, lazy handler). Phase 2 extends this.
- `src/lib/telegram.ts` — the grammY `bot` instance + existing `/start` handler.
- `src/db/schema/people.ts`, `src/db/schema/assignments.ts` — worker identity + project assignment (read for LOG-01/02).
- `src/db/schema/boq-items.ts` + `src/lib/boq-balance.ts` — BOQ items and remaining-balance logic (read for LOG-03 / D-24).
- `src/db/schema/index.ts` — schema barrel; new tables register here.
- `.planning/phases/01-foundation/01-CONTEXT.md` — Phase 1 decisions (tenant_id-on-every-table D-09, getDefaultTenantId pattern, self-start onboarding).

### Reference only (sibling project — DO NOT copy code; clean-room build)
- `/Users/arifismailbayrak/saha/docs/adr/0005-chat-platform-primary-field-interface.md` — Telegram-as-field-channel rationale.
- `/Users/arifismailbayrak/saha/GLOSSARY.md` — domain vocabulary (BOQ/Contract Line Item, Project, Chainage, Activity).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/telegram.ts` — the existing grammY `bot` with the `/start` handler; Phase 2 grows the handler set here (or via composers/modules off it).
- `src/lib/boq-balance.ts` — remaining-balance calculation; feed the BOQ-selection keyboard labels (D-24).
- `src/lib/tenant.ts` (`getDefaultTenantId()`) — every insert MUST supply `tenant_id` (Phase 1 D-09 / Pitfall 3); new `submissions` / `conversation_state` rows carry it.

### Established Patterns
- **Lazy `@/db` import inside handlers** so `neon()` doesn't run at module load — keeps pure unit tests runnable without `DATABASE_URL` (STATE.md, Phase 1).
- **grammY test patterns:** `bot.botInfo` setter must be set after mocking `bot.init`; intercept replies via `api.config.use(transformer)`, not `vi.spyOn(api.sendMessage)`.
- **Transactions need the WebSocket Pool driver** (`neon-serverless`), not `neon-http` — required for the idempotency/insert transaction (Phase 1 D, 01-05).
- Webhook secret-token validation already enforced (T-04-01) — do not regress.

### Integration Points
- New `submissions` table (`status: pending_audit`) is the row Phase 3's audit loop reads, decrements BOQ against, and transitions to approved/rejected.
- New `conversation_state` + `processed_updates` tables are Phase-2-internal (no downstream consumer).
- The submission's location column should be schema-compatible with the Phase-1 spatial conventions (`geography`/`geometry` per Phase 1 D-10) so Phase 4 can run nearest-segment matching without a migration.
</code_context>

<specifics>
## Specific Ideas

- Turkish microcopy direction (D-19/D-26): hints are short and action-first —
  "Lütfen fotoğraf gönderin 📷 (yazı değil)", location "📎 → Konum", confirm
  "Gönderildi ✅", cancel "İptal edildi". Respectful "siz" throughout.
- Resume message frames continuity, not error: "Devam ediyoruz — …" (D-14).
- Exhausted-BOQ warning is a question, not a wall: "Bu kalem tamamlandı (0 kaldı). Yine de devam?" (D-25).
</specifics>

<deferred>
## Deferred Ideas

- **Location geofencing** (is the share near the route?) — GEO-02, Phase 4. Phase 2 accepts any native location.
- **Multiple photos per submission** — single photo for v1 (Claude's-discretion default); revisit if the field demands it.
- **Type-to-search BOQ selection** — considered for very large BOQs; rejected for v1 (typing in the field is what we're avoiding). Paginated keyboard (D-23) instead.
- **After-N-failures escalating help / "Yardım" contact** — considered for input reprompts; v1 uses a consistent how-to hint each time (D-19).
- **Quantity vs remaining-balance hard validation** — enforcement lives in Phase 3 (audit + atomic decrement, `CHECK (approved_qty <= planned_qty)`), not the worker flow.
</deferred>

---

*Phase: 2-Worker Bot*
*Context gathered: 2026-05-24*
