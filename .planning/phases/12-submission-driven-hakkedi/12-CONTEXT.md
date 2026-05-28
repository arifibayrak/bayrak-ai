# Phase 12: Submission-Driven Hakkediş - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Each approved Telegram work-application submission contributes immediately to the in-progress draft hakkediş period for the matching project + BOQ item + currency — and every hakkediş line-item quantity is traceable back to the source submission(s) that contributed to it. Phase 12 is **additive on top of v2.0's existing period-rollup model** — the cumulative yeşil-defter math (D-100), the deduction chain (D-92/D-93), the sequential-finalization model (D-99), and the immutable finalize-snapshot guarantee (D-95/D-96) all stand unchanged.

**In scope:** SDH-01 (live contribution to in-progress draft period), SDH-02 (submission ↔ hakkediş line traceability), SDH-03 (additive — no v2.0 regression).

**Out of scope:** any change to the v2.0 deduction chain or finalize semantics; manual / Excel-import flows (those keep the existing path); rejection-of-approved-submission flows (not currently supported and not introduced here); push-based real-time delivery (deferred — polling chosen for v1).

</domain>

<decisions>
## Implementation Decisions

### Contribution mechanism (SDH-01)
- **D-117:** On each `submission.status → approved` transition, the audit handler calls the v2.0 Recompute query but **scoped to the just-approved submission's `(project_id, boq_item_id, currency_code)`** — not a full period recompute. Reuses v2.0 math verbatim (D-100: `cumulative = SUM(approved WHERE decided_at ≤ period_end_date)`; D-104: `period_qty = cumulative − previous`). Zero new math, zero new test surface. Safe for any future "undo approval" feature.
  - *Rejected:* (b) incremental delta (`period_qty += submission.qty`) — drift risk if future flows ever mutate approval state; reconciliation cost > recompute cost.
  - *Rejected:* (c) delta-with-periodic-reconciliation — added complexity for no current benefit.

### No-open-period behavior
- **D-118:** When an approval arrives and no draft hakkediş period is open for `(project_id, currency_code)`, **do nothing extra**. The approval still feeds the cumulative count via v2.0's D-100 model, and the next draft period the office creates will pick it up naturally. Closest to v2.0 — the "Phase 12 magic" only activates when a draft period is actually open.
  - *Rejected:* auto-create draft period on first orphan approval — ships side-effects the office didn't trigger; surprises in financial workflows are bad.
  - *Rejected:* queue-with-badge on hakkediş hub — additive feature that can be layered on later if the count becomes interesting; no need to ship in v1.

### Traceability model (SDH-02)
- **D-119:** Add new join table `hakedis_line_submissions(period_line_id uuid, submission_id uuid, qty_contributed numeric(12,3), created_at timestamptz, PRIMARY KEY (period_line_id, submission_id))`. Foreign keys: `period_line_id` → `hakedis_period_lines (ON DELETE CASCADE)`; `submission_id` → `submissions (ON DELETE RESTRICT)`. Rows are written by the D-117 scoped recompute (INSERT ... SELECT from the same WHERE clause that produced the line's cumulative). **Snapshot-frozen at finalize alongside the existing v2.0 line snapshot** — the trace survives any future submission-table edits.
  - *Rejected:* compute-on-read — depends on submissions staying immutable forever; quietly drifts on a finalized period if a submission is ever rewritten.
  - *Rejected:* `submission_ids uuid[]` array column on `hakedis_period_lines` — loses `qty_contributed` granularity; awkward to query/join.

### Real-time delivery (UX side of SDH-01)
- **D-120:** Draft hakkediş detail pages (`status = 'draft'` only) poll the period detail Server Action **every 30 seconds** via `useEffect + setInterval` and patch the changed line(s). Polling is **scoped to draft pages only** — finalized periods are immutable so no polling there; idle dashboard pages do nothing. Vercel-serverless-friendly, no new infra. Easy swap to SSE later if usage justifies it.
  - *Rejected:* SSE / Pusher / WebSocket — Vercel serverless awkward for long-lived connections; one office engineer doesn't need ~1s lag; new infra surface for one feature.
  - *Rejected:* on-refresh only — feels wrong for a feature framed as "real-time"; office shouldn't have to refresh to see effects of approvals.
  - *Rejected:* 10s polling — triples poll volume for marginal UX gain at single-office-user scale.

### Pre-decided technical (planner MUST honor — locked from v2.0)
- v2.0 lifecycle stands: `draft → finalized → submitted → paid`, finalize irreversible (D-95/D-96), recompute blocked once `status != 'draft'` (D-97/D-98)
- Math: `cumulative = SUM(approved WHERE decided_at ≤ period_end_date)`; `period_qty = cumulative − previous` (DB-enforced, D-100/D-104)
- `previous_cumulative_qty` always comes from the most recent **finalized** period (D-99) — never from a draft
- One period = one currency (D-101)
- All money math in Postgres `numeric` (D-99-era convention)

### Claude's Discretion
- Exact name of the Drizzle column on the join table (`qty_contributed` is the suggested name — planner may pick a clearer convention like `contributed_qty` to match local style).
- Exact polling implementation: vanilla `useEffect + setInterval`, or a `useSWR`/`useQuery` wrapper that's already in the project. Planner picks based on what's already in use in the dashboard.
- Whether the per-line traceability UI is an inline expand-row, a side drawer, or a dedicated "submissions for this line" sub-page. UI/UX detail — planner can pick; user has flagged a broader brand pass (Phase 13) so don't over-invest in a bespoke UX widget here.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §Milestone v3.0 + §Phase 12 — Phase 12 goal + success criteria
- `.planning/REQUIREMENTS.md` §v3.0 Requirements §Submission-Driven Hakkediş — SDH-01, SDH-02, SDH-03 definitions
- `.planning/PROJECT.md` §Current Milestone v3.0 — milestone framing + carried-forward locked decisions

### v2.0 hakkediş foundation (the model this phase extends — read closely)
- `.planning/phases/10-hakkedi-billing/10-CONTEXT.md` §Lifecycle & finalization, §Compute trigger & period chaining, §Period scope & edge cases — D-95..D-104 are the locked v2.0 contract Phase 12 must respect
- `.planning/phases/10-hakkedi-billing/10-SUMMARY.md` — what shipped in v2.0 and where (file paths, query layer entry points)
- `.planning/phases/10-hakkedi-billing/10-VERIFICATION.md` — v2.0 acceptance evidence (informs what regression tests Phase 12 must not break)

### Existing schema (Phase 12 EXTENDS, does not recreate)
- `src/db/schema/hakedis-periods.ts` — period table (status, currency_code, period_end_date)
- `src/db/schema/hakedis-period-lines.ts` — line table (period_id, boq_item_id, cumulative_qty_approved, previous_cumulative_qty, period_qty, unit_price_snapshot); the new `hakedis_line_submissions` join table references this
- `src/db/schema/submissions.ts` — submissions table (status='approved' is the trigger condition; decided_at is the period-window key)
- `src/db/schema/index.ts` — Drizzle relations + exports surface

### Approval path (the trigger point for D-117)
- `src/lib/bot-audit.ts` — auditor approval handler; this is where the scoped recompute call lands
- `src/actions/submissions.ts` — any Server-Action approval paths (if non-Telegram approvals exist)

### v2.0 recompute query (the function D-117 calls)
- `src/actions/hakedis.ts` — Phase 10's Recompute action; D-117 calls a scoped variant of this same code path (or extracts a shared helper from it)
- `src/actions/analytics.ts` — typed Postgres aggregation idioms used by hakkediş queries; reuse for the join-table INSERT ... SELECT

### Surfaces the polling touches (D-120)
- `src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx` (or equivalent) — draft period detail page; polling lives in a client component here
- `src/components/admin/PeriodDetailControls.tsx` — already touched in Phase 11 (export buttons); confirm the draft-vs-finalized split is the same gate Phase 12 uses for polling

### Project conventions
- `CLAUDE.md` §Tech Stack, §PostGIS + Drizzle — Drizzle migration convention (`drizzle-kit generate` + `migrate()`), money-math in Postgres numeric, Vercel-serverless constraint that drives D-120
- `messages/en.json` + `messages/tr.json` — bilingual labels; any new UI strings need both locales (carry-forward from D-111 era)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **v2.0 Recompute query** (in `src/actions/hakedis.ts`) — D-117 wraps or calls this with a `(project_id, boq_item_id, currency_code)` filter. **Do not duplicate the math** — extract a shared helper if needed.
- **`logOfficeActivity`** + `OFFICE_ACTION_TYPES` (from Phase 7 + extended in Phase 11) — log a new `submission_contributed_to_hakedis` action type on each scoped recompute trigger; gives the OE Scorecard visibility into the live flow.
- **`getPeriodDetail`** (Server Action used by `(admin)/hakedis/[periodId]/page.tsx`) — D-120's polling endpoint. May need a thin variant or a versioned response so polling diffs are cheap; planner decides.

### Established Patterns
- **Approval handler atomicity (Phase 3 D-13 guard):** approvals are idempotent on `submission_id`. The D-117 scoped recompute must be inside the same transaction as the `submissions.status → approved` write, OR be a `try-after-commit` hook with its own idempotency on `(submission_id, period_line_id)`. Planner picks; integration-checker should verify.
- **Server Actions over REST for internal data:** Phase 10/11 surfaced hakkediş data via Server Actions, not `/api`. Polling in D-120 calls a Server Action (revalidate or refetch via `useTransition` + `router.refresh()` or a small fetch wrapper).
- **i18n on every new label:** new UI strings get TR + EN keys; existing pattern from D-111 carryover.

### Integration Points
- `bot-audit.ts` approval handler — Phase 12's biggest write site
- `hakedis-period-lines.ts` schema + the new `hakedis-line-submissions.ts` schema — new migration
- Draft hakkediş detail page client component — polling lives here
- Exports — Phase 11's hakkediş Excel/PDF already snapshot from `hakedis_period_lines`; **no change required** for exports as long as the join table is populated correctly. Phase 12 should confirm via test that the Phase 11 exports still produce identical bytes for the same finalized period before-and-after Phase 12 ships.

</code_context>

<specifics>
## Specific Ideas

- **User's exact wording, recorded for downstream verification:** "the hakkediş should be created by also the each work application messages." Interpreted as: each approved Telegram submission contributes to the in-progress draft period for the matching project + BOQ + currency in real time, with traceability back. Not interpreted as: spawn a new hakkediş per submission (that would shatter the period model the user just spent v2.0 building).
- **Polling page filter:** only `status = 'draft'` hakkediş detail pages poll. Finalized/submitted/paid period pages never poll — they're immutable and there's nothing live to show.

</specifics>

<deferred>
## Deferred Ideas

- **Queue badge for orphan approvals** (gray area 2 option b): hub-level count of approved submissions not yet in a period. Additive on top of D-118; revisit if office engineers report missing the implicit accumulation.
- **Auto-create draft period on first orphan approval** (gray area 2 option a): explicitly rejected for v1; reconsider only if the office is creating periods reactively and finds the manual step painful.
- **Push-based real-time (SSE / Pusher / WebSocket)** (gray area 4 option b): swap polling for push if usage shows >1 office engineer on hakkediş detail concurrently or sub-30s feedback becomes important. Out of scope for v1.
- **Bulk-approval Telegram flow** — if auditors ever batch-approve, the D-117 scoped recompute is naturally batchable (group by project + BOQ + currency, run one query per group). Belongs in the bot-audit phase, not here.
- **"Undo approval"** — the D-117 design makes this trivial later (recompute drops the row from the join table; cumulative decreases). Not in v3.0 scope but the architecture supports it.

</deferred>

---

*Phase: 12-Submission-Driven-Hakkediş*
*Context gathered: 2026-05-28*
