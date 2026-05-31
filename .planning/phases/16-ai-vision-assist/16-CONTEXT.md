# Phase 16: AI Vision Assist - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Asynchronously analyze every approved submission's photo + notes with Claude vision, surfacing **advisory** anomaly flags and a work classification on the submission detail page (`AiFlagCard`) and as an amber indicator in the Phase-15 as-built strip — with the **eval harness built first** so no flag is ever shown to an auditor before precision ≥ 0.80 is confirmed on a labeled reference dataset. AI is advisory only: it never blocks or auto-decides an approval/rejection. Requirements: AI-01..AI-06. Final phase of v4.0.

**Not this phase:** chainage-aware AI flags (v5); any real-time AI in the Telegram critical path (anti-feature); BOQ auto-extraction from drawings (ADR-0002, out of scope).

</domain>

<decisions>
## Implementation Decisions

### What the AI flags / classifies (AI-01, AI-02)
- **D-01:** Five advisory signals per approved submission:
  1. **Photo ≠ claimed work** (AI-01 core) — vision flags when the photo looks inconsistent with the worker's declared BOQ item/work type.
  2. **Photo quality** — blurry / too-dark / obstructed photos an auditor can't verify from.
  3. **Location second opinion** — AI cross-checks the photo scene against the GEO-02 distance anomaly (advisory; does the scene match the expected on-route location?).
  4. **Notes → material suggestion** (AI-02) — parse worker free-text notes to auto-suggest the BOQ material/classification.
  5. **Duplicate/near-duplicate photo** (AI-06) — pHash pre-filter (locked by research).
  All advisory; never block or auto-decide (AI-03).

### Eval reference dataset (AI-05)
- **D-02:** The precision-≥0.80 gate's labeled dataset is built from **existing approved-submission photos**; the **worker-declared BOQ work type is the weak label**; the **office engineer confirms ground truth on a ~30–50 sample**. Real data, not synthetic fixtures. The eval harness (`tests/ai-vision.test.ts`) asserts precision ≥ 0.80 on the "anomaly" class, and that result is the **single switch** controlling whether any flag UI renders.

### Confidence display
- **D-03:** Show **ALL eval-passed flags** (no per-flag confidence threshold that hides flags), each with a **confidence badge colored traffic-light by score** (green high / amber medium / red low). Transparency over noise-suppression — the auditor judges. (The feature-level eval gate still controls whether ANY flags appear at all.)

### Model & run frequency
- **D-04:** Latest Claude vision model via the **Vercel AI Gateway**, using **`generateObject` + a Zod schema** (typed structured output — guards against prompt injection via image content). Run on **every approved submission** — field-approval volume is low (daily logs), so full coverage is affordable. Always async, off the bot critical path.

### Carried Forward (locked by research/roadmap — do not revisit)
- **Eval harness built FIRST**; precision ≥ 0.80 = the single gate controlling flag display (AI-05); `eval_passed = true` is the query/UI gate.
- **Advisory-only:** no code path connects `submission_ai_flags` to `submissions.status` (AI-03; grep-verified in SC5).
- **Async / off critical path (AI-04):** `enqueueAiFlag` inserts a `pending` row + fires `runAiAnalysis` as a detached promise AFTER the approval transaction commits; NEVER awaited in the Telegram webhook (webhook response sent before AI log line — SC2). Cron `/api/cron/ai-flags` retries `pending` rows older than 5 min, registered in `vercel.json`, protected by `CRON_SECRET` (SC6).
- **`submission_ai_flags`** table already exists (Phase 14): status, scores, classification, `eval_passed` gate, `raw_response`.
- **pHash duplicate detection (AI-06):** near-duplicate photos reuse the prior analysis — no second Claude vision call (SC4).
- **UI:** `AiFlagCard` on the submission detail page (Turkish anomaly description + confidence badge + material suggestion; absent entirely when no eval-passed flag); amber indicator on the as-built strip (Phase 15).
- **Pitfall 5:** the bot/webhook path has no Auth.js session — never `auth()`/`logOfficeActivity`/`after()` in `bot-audit.ts`; the enqueue is a best-effort post-commit call.

### Claude's Discretion
- Exact Zod schema shape; pHash library/algorithm choice; the green/amber/red confidence cutoffs; the cron schedule interval; prompt wording.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contract
- `.planning/ROADMAP.md` §"Phase 16" — goal + 6 SCs (SC1 eval-gate single switch, SC2 vision-after-webhook-response, SC4 pHash reuse, SC5 grep-proof no status coupling, SC6 cron + CRON_SECRET).
- `.planning/REQUIREMENTS.md` — AI-01..AI-06.

### v4 research (AI decisions resolved)
- `.planning/research/SUMMARY.md` §"Phase 16" + "AI vision" — generateObject+Zod, eval-first, async pattern. **MUST read.**
- `.planning/research/ARCHITECTURE.md` — `ai-vision.ts` / `ai-flag-queue.ts` / cron route / `AiFlagCard` shapes; enqueue insertion point.
- `.planning/research/PITFALLS.md` — Pitfall 10 (vision off critical path), Pitfall 11 (hallucination → eval-gate before display; prompt injection → Zod).

### Existing code / config
- `src/lib/bot-audit.ts` — `handleAuditDecision` post-commit hook (Phase 12 recompute + Phase 15 chainage snapshot already live there): the `enqueueAiFlag` insertion point. Pitfall 5 applies.
- `src/db/schema/ai-flags.ts` — the `submission_ai_flags` table (Phase 14).
- `src/components/admin/SubmissionDetailView.tsx` — `AiFlagCard` mount; `src/components/dashboard/ChainageTable.tsx` — amber strip indicator (Phase 15).
- `CLAUDE.md` AI section — AI SDK v6 via AI Gateway (`AI_GATEWAY_API_KEY`), default to latest Claude vision models; "eval rigor required since AI is in v1".

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `handleAuditDecision` post-commit best-effort hook pattern (Phase 12/15) — `enqueueAiFlag` is the third such best-effort call after the chainage snapshot.
- `submission_ai_flags` table (Phase 14) — already migrated on both branches; status/scores/classification/eval_passed/raw_response columns exist.
- AI SDK + Vercel AI Gateway already wired in the project (env present).
- Vitest harness for the eval (`tests/ai-vision.test.ts`), labeled fixtures pattern.

### Established Patterns
- Cron via Vercel + `CRON_SECRET` (new route `/api/cron/ai-flags` in `vercel.json`).
- `force-dynamic` on analytics/financial surfaces; brand primitives for `AiFlagCard`.

### Integration Points
- Enqueue from `handleAuditDecision` (no await, post-commit). Read flags via an `eval_passed = true`-gated query feeding `AiFlagCard` + the strip indicator. NO write to `submissions.status` (SC5).

</code_context>

<specifics>
## Specific Ideas

- Turkish anomaly descriptions on `AiFlagCard`; traffic-light confidence badge.
- Eval dataset uses the project's own approved photos (weak label = declared work type) — grounds the gate in real field data.
- Run on every approval (low volume) rather than sampling — complete coverage.

</specifics>

<deferred>
## Deferred Ideas

- Chainage-aware AI anomaly flag → v5 (needs this phase stable + chainage calibrated).
- Real-time AI feedback in the Telegram submission/approval critical path → anti-feature (latency); always async.
- BOQ auto-extraction from drawings → out of scope (saha ADR-0002).

</deferred>

---

*Phase: 16-ai-vision-assist*
*Context gathered: 2026-05-31*
