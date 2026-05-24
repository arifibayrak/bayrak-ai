# Phase 3: Audit Loop - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 delivers the **auditor side of the trust loop** — the half that turns a
worker's `pending_audit` submission into verified project data.

On worker confirm, the submission **fans out** to every auditor assigned to that
project as a Telegram message (photo, Google Maps link, BOQ item, quantity,
notes) with inline **Approve/Reject** buttons. The **first valid decision wins
atomically**: Approve increments the BOQ line item's `approved_qty` and notifies
the worker; Reject captures a mandatory reason and notifies the worker with it.
Unauthorized taps and double/late taps are safely rejected with no DB change.

Requirements in scope: **AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04, AUDIT-05, AUDIT-06.**

**Builds on Phase 2:** extends the same grammY bot (`src/lib/telegram.ts`), the
idempotency-fenced webhook (`src/app/api/telegram/webhook/route.ts`), the DB-row
FSM pattern (`src/lib/bot-fsm.ts`, D-12), the Turkish message catalog
(`src/lib/bot-messages.ts`), and the `submissions` row written with
`status: pending_audit` (LOG-08). Reads `assignments` (auditor role) and
`boq_items` (planned/approved qty) from Phase 1.

**Not this phase:**
- PostGIS nearest-segment matching and the route-distance anomaly flag (Phase 4 /
  GEO-01, GEO-02). Phase 3 shows the raw shared location as a Google Maps link;
  it does **not** judge whether the location is near the route.
- Mapbox dashboard, submission list/filter UI, live BOQ progress rendering
  (Phase 5 / DASH-*). Phase 3 only writes the data those screens will read.
- AI vision/notes advisory flags in the auditor message (Phase 6 / AI-03).
</domain>

<decisions>
## Implementation Decisions

### BOQ Approval Semantics (AUDIT-04)
- **D-27:** Approve **increments `boq_items.approved_qty`** by the submission's
  `quantity`, inside the atomic decision transaction. "Remaining balance"
  (`planned_qty − approved_qty`, via `src/lib/boq-balance.ts`) is the derived
  view; AUDIT-04's "decrement" wording refers to that balance falling, not a
  separate column. ROADMAP success-criterion #3 ("increments `approved_qty`") is
  the canonical phrasing.
- **D-28:** **Over-delivery is allowed — NO `CHECK (approved_qty <= planned_qty)`
  constraint** (it would conflict with Phase 2 **D-25**, which deliberately lets
  workers log against a 0-balance item). This overrides the STATE.md "Phase 3
  blocker" suggestion to add that CHECK. Instead, when an approval would push
  `approved_qty` past `planned_qty`, the **auditor's notification message carries
  a visible warning flag** (e.g. "⚠ Sözleşmeyi aşıyor — X/Y [unit]") so the
  decision is informed, never silent.

### Atomicity & Race Safety (AUDIT-04, AUDIT-06)
- **D-29:** **First-action-wins via a single DB transaction** on the
  `neon-serverless` WebSocket Pool driver (required for `db.transaction()` —
  Phase 1, 01-05). The decision locks the submission row
  (`SELECT … FOR UPDATE`) guarded by `WHERE status='pending_audit'`; if the row
  is already decided, the action is a no-op that returns "already resolved". The
  Phase 2 `processed_updates` idempotency fence (**D-13 Guard 1**) additionally
  de-dupes replayed callback updates at the webhook level. Together these make a
  double-deduction impossible. (Exact SQL is the planner's; this is the locked
  strategy, carried forward from STATE.md.)

### Reject Reason Flow (AUDIT-05)
- **D-30:** Reject is a **two-tier capture**: tapping ❌ Reddet presents an inline
  keyboard of **canned Turkish reasons + a "Başka (yaz)" free-text option**.
  Initial reason set (copy can tune): "Yetersiz iş", "Yanlış konum",
  "Eksik/bulanık fotoğraf", "Yanlış miktar", "Başka (yaz)".
- **D-31:** A reason is **MANDATORY** — the rejection is not committed until a
  reason (canned or typed) is provided. If the auditor abandons before giving
  one, the submission **stays `pending_audit`** and remains actionable by other
  auditors.
- **D-32:** The free-text ("Başka") path **reuses the D-12 DB-row FSM pattern**
  for auditor-side state — a `conversation_state`-style row keyed by the
  auditor's `telegram_user_id`, `current_step = 'awaiting_reject_reason'`, with
  `data` carrying the target submission/flow id. (Planner decides whether to
  extend the existing `conversation_state` table or add a sibling; honor D-12 and
  the TTL hygiene of D-22.) Known edge case: the same Telegram account cannot be
  mid-worker-log and mid-reject simultaneously (one active flow per
  `telegram_user_id`) — acceptable and rare.

### Multi-Auditor Fan-out & Message Lifecycle (AUDIT-01, AUDIT-02, AUDIT-06)
- **D-33:** On worker confirm, **fan out one Telegram message per assigned
  auditor** of that project (`assignments WHERE role_on_project='auditor'` →
  `people.telegram_user_id`). Each message includes the **photo**, a **Google
  Maps link** (`https://maps.google.com/?q=<lat>,<lon>` from
  `location_lat`/`location_lon`), the **BOQ material + unit**, the **quantity**,
  the **notes**, and inline **[✅ Onayla] / [❌ Reddet]** buttons (AUDIT-01/02).
- **D-34:** **Persist every fan-out message's `chat_id` + `message_id`** (keyed to
  the submission). On the first decision, **edit ALL of them**: strip the buttons
  and append the outcome ("✅ Onaylandı — [Auditor]" / "❌ Reddedildi — [Auditor]:
  [reason]"). The deciding tap and every sibling message converge on the same
  resolved view — no stale live buttons linger. (Planner picks storage: a
  dedicated `audit_notifications` table vs a `jsonb` array on `submissions`.)
- **D-35:** **A single tap is final** — Approve commits immediately; Reject moves
  straight to the reason step (D-30). No "Emin misiniz?" confirmation. The atomic
  first-wins guard (D-29) protects against accidental/duplicate taps.

### Authorization (AUDIT-03)
- **D-36:** Button callbacks are **authorized server-side at action time**: only a
  person with an active `'auditor'` assignment on **that submission's project**
  may act. A non-assigned user's tap changes nothing and returns an ephemeral
  rejection via `answerCallbackQuery`. Authorization never relies on who happened
  to receive the message — it is re-checked against `assignments` on every tap.

### Decision Feedback & Audit Trail (AUDIT-04, AUDIT-05)
- **D-37:** The **worker is notified on BOTH outcomes** via Telegram: approve →
  "✅ Kaydınız onaylandı" (with project/BOQ context); reject → "❌ Kaydınız
  reddedildi: [reason]". Every submission closes its loop.
- **D-38:** The `submissions` table gains **`decided_by`** (uuid →
  `people.id`, the deciding auditor), **`decided_at`** (timestamptz), and
  **`rejection_reason`** (text, null unless rejected). These feed the Phase 5
  dashboard submission list/filter (DASH-03) and answer "who decided this, when".
  The `status` enum (`pending_audit`/`approved`/`rejected`) already exists.

### Edge Cases
- **D-39:** **No auditor assigned** to the project at confirm time → the
  submission still persists as `pending_audit` (never lost). Surface a **warning**
  so it isn't silently stranded (planner: log + best-effort notify the office
  engineer). This is **not** a worker-facing error.
- **D-40:** **Best-effort fan-out** — if a Telegram send to one auditor fails, do
  **not** block the other auditors or the worker's confirmation; record the
  failure. Notification reliability is decoupled from submission persistence.

### Claude's Discretion
- **Photo delivery** via Telegram `file_id` (`submissions.photo_file_id`) where
  available, falling back to the Blob `photo_url` — cheapest/fastest re-send.
- Exact SQL for the atomic decision transaction (D-29), the storage shape for
  fan-out message refs (D-34), and whether the auditor reject-FSM extends
  `conversation_state` or adds a sibling table (D-32).
- Final Turkish microcopy/wording for auditor and worker messages (within the
  Phase 2 **D-26** tone: respectful "siz", field-friendly, light emoji
  affordances) and the final canned-reason taxonomy.
- New schema column/index naming; honor `tenant_id`-on-every-insert (D-09 /
  `getDefaultTenantId()`). New tables register in `src/db/schema/index.ts` and
  require a generated drizzle migration + push.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — product vision, locked stack, single-tenant hedge.
- `.planning/REQUIREMENTS.md` — Phase 3 = AUDIT-01–06 (full text per requirement);
  note AUDIT-04 wording vs D-27.
- `.planning/ROADMAP.md` §"Phase 3: Audit Loop" — goal + 5 success criteria
  (criterion #3 is the canonical `approved_qty` increment phrasing).
- `CLAUDE.md` — locked tech stack + integration patterns (grammY inline callbacks,
  Drizzle/Neon transactions, `@vercel/blob`, zod).

### Research (stack, architecture, pitfalls)
- `.planning/research/STACK.md` — grammY callback/inline-button + transaction patterns.
- `.planning/research/ARCHITECTURE.md` — entity/data-model + component boundaries.
- `.planning/research/PITFALLS.md` — **race/idempotency**, transaction driver
  (`neon-serverless` Pool, not `neon-http`).
- `.planning/research/SUMMARY.md` — cross-cutting risk table + resolved decisions.
- `.planning/phases/02-worker-bot/02-RESEARCH.md` — grammY webhook/handler + Approve/Reject callback groundwork laid during Phase 2.

### Prior phase context (locked decisions to honor)
- `.planning/phases/02-worker-bot/02-CONTEXT.md` — **D-12** (DB-row FSM, not grammY
  conversations), **D-13** (idempotency fence), **D-22** (state TTL), **D-25**
  (over-delivery allowed), **D-26** (Turkish tone), transaction-driver note.
- `.planning/phases/01-foundation/01-CONTEXT.md` — **D-03** (role-per-assignment),
  **D-09** (`tenant_id` on every table / `getDefaultTenantId()`), spatial column
  conventions.

### Existing code this phase extends
- `src/app/api/telegram/webhook/route.ts` — secured webhook entry; must route
  `callback_query` updates to the new Approve/Reject handlers.
- `src/lib/telegram.ts` — grammY `bot`, idempotency middleware, FSM dispatcher;
  add `callbackQuery` handlers + auditor fan-out + worker notification here.
- `src/lib/bot-fsm.ts` — worker FSM; the auditor reject-reason state reuses this
  pattern (D-32).
- `src/lib/bot-keyboards.ts` — inline keyboard builders; add Approve/Reject and
  canned-reason keyboards.
- `src/lib/bot-messages.ts` — Turkish message catalog; add auditor-notification,
  worker-decision, and reason strings.
- `src/db/schema/submissions.ts` — add `decided_by` / `decided_at` /
  `rejection_reason`; `status` enum already includes `approved`/`rejected`.
- `src/db/schema/boq-items.ts` — `approved_qty` increment target; balance via
  `src/lib/boq-balance.ts` (warning-flag input, D-28).
- `src/db/schema/assignments.ts` — auditor lookup (`role_on_project='auditor'`).
- `src/db/schema/people.ts` — `telegram_user_id` for fan-out targeting.
- `src/db/schema/conversation-state.ts` — pattern/table for the auditor
  reject-reason FSM state (D-32).
- `src/lib/tenant.ts` (`getDefaultTenantId()`) — `tenant_id` on new inserts.
- `src/db/schema/index.ts` + `src/db/migrations/` — register new tables/columns;
  generate + push a migration.

### Reference only (sibling project — DO NOT copy code; clean-room build)
- `/Users/arifismailbayrak/saha/GLOSSARY.md` — domain vocabulary (BOQ / Contract
  Line Item, Project, Chainage) for consistent Turkish/English terms.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **grammY bot + middleware stack** (`src/lib/telegram.ts`) — the idempotency
  fence already de-dupes replayed callback updates (D-13 Guard 1), giving AUDIT-06
  a head start.
- **`src/lib/boq-balance.ts`** — remaining-balance calc; reused to compute the
  over-delivery warning flag (D-28) and the message's "X/Y kaldı" context.
- **DB-row FSM pattern** (`bot-fsm.ts` + `conversation_state`) — reused for the
  auditor reject-reason capture (D-32).
- **`getDefaultTenantId()`** — every new insert carries `tenant_id` (D-09).

### Established Patterns
- **Lazy `@/db` import inside handlers** — never import `@/db` at module top
  (keeps unit tests runnable without `DATABASE_URL`).
- **Transactions need the `neon-serverless` WebSocket Pool**, not `neon-http` —
  **mandatory** for the atomic decision transaction (D-29 / 01-05).
- **grammY test patterns** — set `bot.botInfo` after mocking `bot.init`;
  intercept replies via `api.config.use(transformer)`, not
  `vi.spyOn(api.sendMessage)`. A duplicate/late-callback race test is the
  Phase 3 analog of Phase 2's mandatory duplicate-update test.
- **Webhook secret-token validation** is enforced (T-04-01) — do not regress.

### Integration Points
- `submissions` rows (`status: pending_audit`) written by Phase 2 are the **input**;
  Phase 3 transitions them and sets `decided_by`/`decided_at`/`rejection_reason`.
- `boq_items.approved_qty` is the cross-aggregate updated **atomically with** the
  status transition (D-27/D-29).
- Persisted fan-out message refs (D-34) are Phase-3-internal (no downstream consumer).
- Worker and auditor notifications use the **same bot instance/token**.
- The Phase 5 dashboard (DASH-03) will read `status` + `decided_*` +
  `rejection_reason`; schema additions here are designed for that read.
</code_context>

<specifics>
## Specific Ideas

- **Turkish microcopy direction** (Phase 2 D-26 tone — respectful "siz", light
  emoji as affordance cues):
  - Auditor buttons: **✅ Onayla** / **❌ Reddet**.
  - Over-delivery flag in the auditor message: **"⚠ Sözleşmeyi aşıyor (X/Y [unit])"**.
  - Canned reject reasons: "Yetersiz iş", "Yanlış konum", "Eksik/bulanık fotoğraf",
    "Yanlış miktar", "Başka (yaz)".
  - Worker outcomes: **"✅ Kaydınız onaylandı"** / **"❌ Kaydınız reddedildi: …"**.
  - Late/duplicate tap toast: **"Bu kayıt zaten çözüldü"**.
- **Google Maps link** format: `https://maps.google.com/?q=<lat>,<lon>`.
</specifics>

<deferred>
## Deferred Ideas

- **Location anomaly flag** in the auditor message ("share is far from the route")
  — that's GEO-02, **Phase 4**. Phase 3 shows only the raw Google Maps link.
- **AI advisory flags** (vision/location/text) in the auditor message — AI-03,
  **Phase 6**.
- **Dedicated mobile-web auditor review view** (richer than a Telegram message) —
  AUDIT-V2-01, **v2**. Telegram message is the v1 surface.
- **Per-segment / chainage-scoped auditor assignment** — AUDIT-V2-02, **v2**.
  Phase 3 fans out to all project auditors equally.
- **SLA / escalation if no auditor acts within a time window** — not in v1 scope
  (noted from the D-39 no-auditor edge case).
- **Editing or undoing a decision after the fact** — out of scope; the first
  decision is final.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 3-Audit Loop*
*Context gathered: 2026-05-24*
