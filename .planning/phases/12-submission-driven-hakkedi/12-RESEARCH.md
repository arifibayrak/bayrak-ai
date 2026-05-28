# Phase 12: Submission-Driven Hakkediş — Research

**Researched:** 2026-05-28
**Domain:** Telegram-bot ↔ hakkediş integration; live billing recompute; UI polling
**Confidence:** HIGH (every code claim verified against the live tree; library claims grounded in `package.json` versions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-117** Contribution mechanism = on each `submission.status → approved` transition, the audit handler calls the v2.0 Recompute query **scoped to `(project_id, boq_item_id, currency_code)`** — not a full period recompute. Reuses v2.0 math verbatim (D-100, D-104). Zero new math. Safe for any future "undo approval" feature.
- **D-118** No-open-period behavior = **no-op**. The approval still feeds the cumulative count via v2.0's D-100 model, and the next draft period the office creates will pick it up naturally.
- **D-119** Traceability model = new join table `hakedis_line_submissions(period_line_id uuid, submission_id uuid, qty_contributed numeric(12,3), created_at timestamptz, PRIMARY KEY (period_line_id, submission_id))`. FKs: `period_line_id` → `hakedis_period_lines (ON DELETE CASCADE)`; `submission_id` → `submissions (ON DELETE RESTRICT)`. Rows are written by the D-117 scoped recompute. **Snapshot-frozen at finalize**.
- **D-120** Real-time delivery = draft hakkediş detail pages (`status = 'draft'` only) poll the period detail Server Action **every 30 seconds** via `useEffect + setInterval` and patch the changed line(s). Finalized periods are immutable so no polling there.

### Carry-forward locked from v2.0 (DO NOT re-litigate)
- D-95/D-96/D-97 lifecycle `draft → finalized → submitted → paid`; finalize irreversible; recompute blocked once `status != 'draft'`
- D-99 `previous_cumulative_qty` always from most recent **finalized** period (sequential finalization)
- D-100 cumulative = `SUM(approved WHERE decided_at ≤ period_end_date AT TIME ZONE 'Europe/Istanbul')`
- D-101 one period = one currency
- D-104 `period_qty` = `cumulative − previous`, DB-enforced as `GENERATED ALWAYS AS STORED`
- D-13 audit handler idempotency on `submission_id` (UPDATE … WHERE status = 'pending_audit' RETURNING)

### Claude's Discretion (planner-resolves)
- Exact name of the join-table qty column (`qty_contributed` suggested; `contributed_qty` acceptable).
- Polling implementation: vanilla `useEffect + setInterval` recommended (no SWR / TanStack in `package.json`).
- UI for per-line submission traceability: inline expand-row vs side drawer vs sub-page. Planner picks; Phase 13 brand pass is coming so don't over-invest.

### Deferred Ideas (OUT OF SCOPE)
- Queue badge for orphan approvals
- Auto-create draft period on first orphan approval
- Push-based real-time (SSE / Pusher / WebSocket)
- Bulk-approval Telegram flow
- "Undo approval" — architecture supports it but not in v3.0 scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SDH-01** | Each approved Telegram submission contributes to the in-progress hakkediş period in real time; office sees billing artefacts grow with each approval | D-117 scoped recompute + D-120 30s polling; integration site is the post-commit hook in `bot-audit.ts handleAuditDecision()` (line 463-498) |
| **SDH-02** | Office engineer can trace each hakkediş line-item quantity back to the source approved submission(s) | D-119 `hakedis_line_submissions` join table; populated by the scoped-recompute INSERT…SELECT; displayed via a new "submissions for this line" UI surface (planner picks expand-row / drawer / sub-page) |
| **SDH-03** | Existing period-finalization flow continues to work — submission-driven contribution is additive and never breaks the cumulative yeşil-defter model, the deduction chain, or the immutable-snapshot guarantee | Phase 10's recompute (`src/actions/hakedis.ts recomputePeriodLines`) and finalize (`finalizePeriod`) are NOT modified at the API surface; the scoped recompute reuses the same INSERT pattern and respects the same `status === 'draft'` immutability guard |

</phase_requirements>

## Summary

Phase 12 turns each approved Telegram work-application submission into an **immediately-visible contribution** to the active draft hakkediş period for the matching `(project_id, boq_item_id, currency_code)` triplet — and adds a join table so each hakkediş line's quantity is traceable back to the source submission(s) that produced it.

The mechanics are intentionally tiny: D-117 calls **the same Postgres aggregation** Phase 10 already ships, scoped down to one BOQ item; D-119 records each contributing submission's qty into a new join table populated by the same INSERT…SELECT path; D-120 keeps the dashboard fresh with vanilla 30-second polling that only fires on draft-status detail pages. No new math, no new financial path, no v2.0 regression.

The non-trivial integration sites are:
1. **`src/lib/bot-audit.ts handleAuditDecision()` post-commit block (line 463-498)** — Phase 12 inserts the D-117 trigger AFTER the existing `editAllSiblingMessages` call and BEFORE the worker notification, wrapped in try/catch with D-40 best-effort semantics (so a transient hakkediş recompute failure never causes the approval to look "stuck" to the auditor).
2. **`src/actions/hakedis.ts`** — extract a new exported helper `recomputeHakedisLine(projectId, boqItemId, currencyCode)` from the existing `recomputePeriodLines` body so the trigger and the manual Recompute button share one code path. Internal-only (not exported from `'use server'` if it accepts the auditor flow's session-less context).
3. **`src/db/schema/hakedis-line-submissions.ts`** — new schema file + 0009 migration; the planner generates with `drizzle-kit generate` then hand-edits per established project precedent (D-49) and runs via `npx tsx src/db/migrate.ts`.
4. **`src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx`** — page stays an RSC; polling lives in a new `LivePeriodPoller` client component that wraps the table body and only mounts when `status === 'draft'`.

**Primary recommendation:** Extract a shared `recomputeHakedisLine(projectId, boqItemId, currencyCode, txOrDb?)` helper, call it from a try/catch'd post-commit hook in `handleAuditDecision`, write the `hakedis_line_submissions` rows inside the same scoped query (INSERT…SELECT from `submissions`), and add a single client component for D-120 polling that uses `useEffect + setInterval + router.refresh()` (matching the existing Phase-10 dialog pattern).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Approval-to-hakkediş trigger (D-117) | **API / Backend** (`src/lib/bot-audit.ts handleAuditDecision`) | Database (Postgres aggregate) | Trigger MUST fire from the auditor flow which is a Telegram webhook route handler — not the dashboard. The post-commit hook is the correct integration point. |
| Scoped recompute math (D-117 internals) | **Database / Storage** (`db.execute(sql\`…\`)` in a Server Action) | API (`src/actions/hakedis.ts` helper) | Money math must run in Postgres `numeric` per D-90 / v2.0 money-math lock — never in JS. |
| Traceability rows (D-119) | **Database / Storage** | API (helper writes them as part of the same scoped recompute) | The join table is queried by both office dashboard (read traceability) and finalize-snapshot logic. |
| Live UI patching (D-120) | **Frontend Server (SSR)** — RSC page re-renders on `router.refresh()` | **Browser / Client** — `setInterval` lives in a client component | Server Actions stay the data source; the client is a thin trigger. Vercel-serverless friendly. |
| Office-engineer audit-log of contribution events | **Database / Storage** (deferred to next office action; see Open Question 6) | — | The Telegram webhook is NOT in an Auth.js session — `logOfficeActivity` requires `actorUserId` (FK to `users.id`), so the bot cannot log directly. See Open Question 6. |

## Standard Stack

### Core
| Library | Version (installed) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| `drizzle-orm` | 0.45.2 [VERIFIED: package.json] | Schema + `db.execute(sql\`\`)` for scoped recompute | Already in use; v2.0 hakkediş code uses identical idioms (`src/actions/hakedis.ts`) |
| `drizzle-kit` | 0.31.10 [VERIFIED: package.json] | Generate migration scaffold for the new join table | Project precedent; hand-edit applied per D-49 + 0008-migration WR-07 note |
| `next` | 15.5.18 [VERIFIED: package.json] | App Router; `router.refresh()` for polling; `revalidatePath` | Already in use; Phase 10 dialogs already call `router.refresh()` |
| `next/server` `after()` | bundled with Next 15 [VERIFIED: package.json] | Fire-and-forget post-response side effects | Used by `logOfficeActivity` (`src/lib/log-office-activity.ts`); NOT relevant in the Telegram-bot path (no request scope) |
| `grammy` | 1.43.0 [VERIFIED: package.json] | Telegram bot framework; `ctx.answerCallbackQuery` already wired | Audit handler already lives in `src/lib/bot-audit.ts` |
| `@neondatabase/serverless` | 1.1.0 [VERIFIED: package.json] | Neon HTTP driver (read paths) + Pool for `db.transaction()` | Phase 3 D-29 pattern: `neon-serverless` Pool for any path that opens a transaction |
| `react` | 19.1.0 [VERIFIED: package.json] | `useEffect` + `useTransition` for the polling client component | React 19 patterns; cleanup in `useEffect` return prevents leaked intervals |

### Supporting (already installed — Phase 12 needs nothing new)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `next-intl` | 4.12.0 [VERIFIED: package.json] | TR/EN labels for the new traceability UI + the new office_activity_log action key (if added — see Open Question 6) | Every new label gets EN + TR keys (D-111 carry-forward) |
| `decimal.js` | 10.6.0 [VERIFIED: package.json] | If the per-line traceability UI shows a sum of `qty_contributed` | Money/numeric display only; never accumulate in JS float |
| `sonner` | 2.0.7 [VERIFIED: package.json] | Toast feedback when poll surfaces a change (optional UX polish) | Planner's discretion; not required by D-120 |
| `lucide-react` | 1.16.0 [VERIFIED: package.json] | Icons (e.g., `Activity`, `ChevronDown` for expand-row affordance) | Already used across admin components |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vanilla `useEffect + setInterval` (D-120) | SWR / TanStack Query | Adds ~30KB of client JS for one polling page; neither is installed in `package.json`. Vanilla matches CONTEXT.md's preference and the existing Phase-10 dialog pattern. |
| Post-commit hook (try/catch'd after `editAllSiblingMessages`) | Inside the approve transaction | Putting a multi-row aggregate INSERT inside the audit transaction triples the lock window during a Telegram webhook (latency-critical; Telegram retries after 60s). Post-commit is safer — failure is logged and the next manual Recompute (or the next approval) self-heals. |
| Separate Server Action for the trigger | grammY direct DB call | Keeping the helper as a plain async function (not `'use server'`) lets it be reused both from the bot path (no Auth.js session) AND from the manual Recompute (with session). |

**Installation:** Nothing new. All Phase 12 dependencies are already in `package.json` (verified above).

## Package Legitimacy Audit

> Phase 12 installs **zero** new packages. All dependencies already in the lockfile from earlier phases. Slopcheck not run because there is nothing to audit.

| Package | Registry | Status |
|---------|----------|--------|
| (none) | — | Phase 12 has no new dependency installs |

## Architecture Patterns

### System Architecture Diagram

```
Telegram                                       Office Dashboard
   │                                                   │
   ▼                                                   ▼
[Auditor taps ✅ Onayla]                    [Office Engineer opens
   │                                          /dashboard/(admin)/
   ▼                                          hakedis/[periodId]]
POST /api/telegram/webhook                            │
   │                                                  ▼
   ▼                                          getPeriodDetail()
src/lib/bot-audit.ts                          Server Action returns
handleAuditDecision()                         { period, lines, deductions,
   │                                            unpricedItems }
   │  ┌── BEGIN TX (neon-serverless Pool) ──┐         │
   │  │  UPDATE submissions                 │         ▼
   │  │    SET status='approved',           │   RSC renders table
   │  │        decided_by, decided_at       │         │
   │  │    WHERE id=? AND status=          │         ▼
   │  │      'pending_audit' RETURNING…    │   [if status='draft']
   │  │  UPDATE boq_items                   │   <LivePeriodPoller>
   │  │    SET approved_qty += quantity     │   client component
   │  └── COMMIT ─────────────────────────  ┘         │
   │                                                  │ setInterval(30s)
   ▼                                                  │  ↓
editAllSiblingMessages()                              ▼
   (existing — strips ✅/❌ buttons,                 router.refresh()
    edits captions)                                   │
   │                                                  ▼
   ▼  ┌── D-117 NEW (post-commit, try/catch) ─┐  RSC re-fetches detail
   │  │ recomputeHakedisLine(                  │       │
   │  │   projectId, boqItemId, currencyCode   │       ▼
   │  │ ) — only writes if a draft period      │  Updated table renders
   │  │ exists for that scope (D-118 no-op).   │  (period_qty + period_value
   │  │ Also INSERTs into                      │   for the affected line have
   │  │ hakedis_line_submissions (D-119)       │   bumped up — office sees
   │  │ for the row that contributed.          │   the live contribution)
   │  └────────────────────────────────────────┘
   │
   ▼
notify worker via Telegram (existing)
```

### Recommended Project Structure (deltas only)

```
src/
├── db/
│   ├── schema/
│   │   └── hakedis-line-submissions.ts     # NEW (D-119)
│   ├── migrations/
│   │   └── 0009_v3_line_submissions.sql    # NEW — hand-edit after generate
│   └── schema/index.ts                      # EDIT — export new schema
├── actions/
│   └── hakedis.ts                           # EDIT — extract helper, add traceability getter
├── lib/
│   └── bot-audit.ts                         # EDIT — call helper in post-commit hook
├── components/
│   └── admin/
│       ├── LivePeriodPoller.tsx             # NEW (D-120 polling)
│       └── LineSubmissionsPanel.tsx         # NEW (SDH-02 traceability UI)
├── app/dashboard/(admin)/hakedis/[periodId]/
│   └── page.tsx                             # EDIT — wrap table body in <LivePeriodPoller>
└── tests/
    └── hakedis-live.test.ts                 # NEW — D-117/D-119 contract + SC3 regression
```

### Pattern 1: Extracted Scoped-Recompute Helper

**What:** Pull the v2.0 cumulative-aggregation SQL out of `recomputePeriodLines` so both the manual button and the auto-trigger share one body. Manual recompute = loop over all (project_id, boq_item_id, currency_code) triplets; D-117 trigger = call once with the just-approved submission's triplet.

**When to use:** Every approve-time call; every manual "Yeniden Hesapla" click.

**Recommended signature:**

```typescript
// src/actions/hakedis.ts (NOT exported as Server Action — internal helper)
// Source: derived from existing recomputePeriodLines lines 184-282

/**
 * recomputeHakedisLine — scoped recompute for ONE (project_id, boq_item_id, currency_code).
 *
 * D-117: called from the audit-approval post-commit hook AND from the manual Recompute loop.
 * D-118: silently no-ops if no draft period exists for (project_id, currency_code).
 * D-119: also writes hakedis_line_submissions rows for the contributing submissions.
 *
 * NOT auth-guarded — it's called from the Telegram bot path where no Auth.js session exists.
 * Tenant-scoped via getDefaultTenantId() (D-09 single-tenant convention).
 *
 * Idempotent: re-running for the same triplet produces the same line + same join rows.
 */
async function recomputeHakedisLine(
  projectId: string,
  boqItemId: string,
  currencyCode: string,
): Promise<{ updated: boolean; periodLineId: string | null }> {
  const tenantId = getDefaultTenantId();

  // Find the open draft period for this (project, currency) — D-118 no-op if none.
  const draftPeriod = await db.execute(sql`
    SELECT id, period_end_date
    FROM hakedis_periods
    WHERE project_id    = ${projectId}
      AND tenant_id     = ${tenantId}
      AND currency_code = ${currencyCode}
      AND status        = 'draft'
    ORDER BY period_end_date DESC
    LIMIT 1
  `);
  if (draftPeriod.rows.length === 0) {
    return { updated: false, periodLineId: null };  // D-118
  }
  const periodId       = String(draftPeriod.rows[0].id);
  const periodEndDate  = String(draftPeriod.rows[0].period_end_date);

  // Re-run the v2.0 D-100 aggregation for this ONE boq item:
  //   cumulative = SUM(approved WHERE decided_at <= period_end_date Istanbul tz)
  //   previous   = most recent FINALIZED period's cumulative_qty_approved (D-99)
  //   period_qty = cumulative - previous (GENERATED column, D-104)
  // (SQL body mirrors existing recomputePeriodLines lines 184-282, scoped down with
  //  AND b.id = ${boqItemId} on the cumulative query and AND hpl.boq_item_id = ${boqItemId}
  //  on the previous query.)

  // …upsert one hakedis_period_lines row…
  // …upsert N hakedis_line_submissions rows (one per contributing submission)…

  return { updated: true, periodLineId };
}

// recomputePeriodLines (the existing manual Recompute) becomes:
// 1) DELETE existing lines
// 2) For each (boq_item, currency_code) priced item with cumulative > 0:
//      await recomputeHakedisLine(projectId, boqItemId, currencyCode)
// — semantically identical to today's behavior; structurally factored.
```

**Why this shape:**
- One body, two callers — no math drift between manual and auto.
- The bot path skips `auth()` (it has no Auth.js session); the manual path keeps its existing `await auth()` guard wrapping the loop.
- Idempotent — D-117 re-firing for the same submission produces the same rows (safe for D-13 idempotency replay).

### Pattern 2: Post-Commit Hook in handleAuditDecision

**Where:** `src/lib/bot-audit.ts` line 463-498 (after `editAllSiblingMessages` call, before the worker notification).

**What:** Insert the D-117 trigger inside a try/catch, mirroring the existing CR-02 worker-notification pattern (best-effort post-commit side effect):

```typescript
// AFTER the existing line 468: editAllSiblingMessages(...)
//
// D-117 post-commit hook — scoped recompute for the just-approved submission.
// Best-effort per D-40 / CR-02: a transient hakkediş write failure must NOT
// propagate back to the auditor (the approval is already committed).
try {
  // Load the BOQ item's currency for the scoped recompute.
  // boqItemId + projectId came back from the UPDATE-RETURNING earlier.
  const { recomputeHakedisLine } = await import('@/actions/hakedis');
  const { boqItems } = await import('@/db/schema/boq-items');
  const boqRows = await db
    .select({ currencyCode: boqItems.currencyCode, projectId: boqItems.projectId })
    .from(boqItems)
    .where(eq(boqItems.id, boqItemId));
  if (boqRows.length) {
    await recomputeHakedisLine(boqRows[0].projectId, boqItemId, boqRows[0].currencyCode);
  }
} catch (hakErr) {
  // D-40 best-effort: log, do not throw. Next approval (or manual Recompute)
  // self-heals because the helper is idempotent.
  console.error('[handleAuditDecision] hakkediş recompute failed for submission', submissionId, ':', hakErr);
}
```

**Why post-commit, not in-transaction:**
- The approve transaction already holds two row locks (`submissions` + `boq_items`) — extending it to also do a multi-row aggregate INSERT triples the lock window during a Telegram webhook that has a 60s server retry budget.
- Failure here is **non-fatal** — the approval is already committed and the recompute is idempotent. The next manual Recompute or the next approval for the same BOQ item self-heals.
- Matches the existing CR-02 pattern for the worker-notification call (already best-effort post-commit).

### Pattern 3: D-120 Polling Client Component

**File:** `src/components/admin/LivePeriodPoller.tsx` (NEW)

**What:** Thin wrapper component that mounts only on draft pages and calls `router.refresh()` every 30 seconds. The server-side RSC then re-fetches `getPeriodDetail` and re-renders.

```typescript
'use client';

// Source pattern: React 19 useEffect with cleanup
// https://react.dev/reference/react/useEffect#parameters
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  /**
   * Page only mounts this poller when status === 'draft' (UI-side guard).
   * Defense-in-depth: also pass `enabled` so this component is never
   * accidentally rendered on a finalized page after a refactor.
   */
  enabled: boolean;
  /** Polling interval in ms. Default 30000 per D-120. */
  intervalMs?: number;
}

export function LivePeriodPoller({ enabled, intervalMs = 30000 }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      // router.refresh() re-runs the RSC; React diffs the resulting tree
      // without losing client state (e.g., expanded rows in LineSubmissionsPanel).
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);  // cleanup on unmount or enabled→false
  }, [enabled, intervalMs, router]);

  // CONTRACT (per revision — Plan 04 Blocker 2 resolution):
  // Return null when enabled === false (pure-import assertion target for vitest node env).
  // Return the sr-only span only when enabled === true so screen-reader users hear the
  // polling notice without polluting the disabled path. Vitest's `environment: 'node'`
  // (no @testing-library/react) means component tests are pure-function invocations:
  //   expect(LivePeriodPoller({ enabled: false })).toBeNull();
  if (!enabled) return null;
  return null; // (sr-only span is emitted only on the enabled path; the actual JSX
              //  lives in the live tree — see src/components/admin/LivePeriodPoller.tsx)
}
```

**Integration in `[periodId]/page.tsx`:**

```tsx
// inside PeriodDetailPage RSC, after the existing detail render:
{status === 'draft' && <LivePeriodPoller enabled={true} />}
```

**Why vanilla useEffect:**
- No SWR / TanStack Query in `package.json` — adding one for one page is a 30KB+ client-bundle regression.
- `router.refresh()` is the official App Router pattern for "re-fetch this RSC subtree without a full page reload" — same call the existing `PeriodDetailControls` already uses on every action handler.
- React 19 + Next 15 already auto-merge concurrent `router.refresh()` calls, so a user-triggered Finalize click during a polling tick does not double-render.

### Pattern 4: SDH-02 Traceability UI

**Two viable shapes** — planner picks based on Phase 13 brand-pass appetite:

| Shape | Pros | Cons |
|-------|------|------|
| **Inline expand-row** (recommended) | Stays on the same page; no route change; reuses existing table structure | Slightly more interactive client JS in the table |
| Side drawer | Clean separation; brand pass can restyle separately | Requires a new shadcn `Sheet`/`Drawer` install or composition |
| Sub-page `/hakedis/[periodId]/lines/[lineId]` | Cleanest URL semantics; deep-linkable | Most code; deferred until brand pass would re-skin anyway |

**Recommended:** Expand-row showing a table of `{ worker_name, decided_at, qty_contributed, telegram_message_link?, photo_url? }` joined from `hakedis_line_submissions` → `submissions` → `people` → `assignments`.

### Anti-Patterns to Avoid
- **Recomputing the WHOLE period on every approval.** Existing `recomputePeriodLines` re-runs O(N_boq_items) aggregations and DELETEs/INSERTs every line. On a project with 50 BOQ items, that's 50 INSERTs per approval. Scope to the single triplet (D-117).
- **Inserting `qty_contributed` as a JS-computed value.** Must come straight from `submissions.quantity` — Postgres `numeric` text — to preserve the money-math invariant. INSERT…SELECT, never a TS-side multiply.
- **Calling `logOfficeActivity` from `recomputeHakedisLine`.** The Telegram-webhook path has no Auth.js session; `actorUserId` would be null/empty and the FK insert would either fail or pollute audit data. See Open Question 6.
- **Letting `setInterval` survive a page navigation.** The `useEffect` cleanup MUST `clearInterval(id)` — React 19 strict-mode dev re-mount would otherwise spawn two intervals per page. Acknowledged in Pattern 3 above.
- **Polling on finalized pages.** Wasted work + risks racing a stale-cache `router.refresh()` against the immutable-snapshot UI. The `status === 'draft'` mount guard MUST be at the RSC level, not just inside the client component.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cumulative SUM math | A new "sum quantity per boq item" loop in TS | The existing v2.0 SQL in `recomputePeriodLines` (lines 184-282) | Money math must live in Postgres `numeric` — D-90 lock. |
| `period_qty` calc | A TS `cumulative - previous` line | The DB GENERATED column (D-104) | Already DB-enforced; INSERT skips this column. |
| Idempotency on D-117 trigger | A new "did we already process this submission?" table | `hakedis_line_submissions` PRIMARY KEY `(period_line_id, submission_id)` + `ON CONFLICT DO NOTHING` (or `ON CONFLICT DO UPDATE SET qty_contributed = EXCLUDED.qty_contributed`) | The join table's PK is the idempotency key. |
| Real-time push | A WebSocket / SSE / Pusher integration | 30s `setInterval` + `router.refresh()` (D-120) | Vercel serverless is awkward for long-lived connections; single office-engineer user load doesn't justify the infra. |
| Auditor flow's hakkediş write atomicity | Putting the recompute inside the approve transaction | Post-commit best-effort try/catch (matches existing CR-02 pattern) | Telegram webhook latency budget + retry behavior makes a long-transaction footgun. |

**Key insight:** Phase 12's whole job is to plumb existing v2.0 math into the Telegram flow. Zero new financial logic. The only new SQL is the join table's INSERT and the per-line traceability SELECT — and both follow the v2.0 idioms in `src/actions/hakedis.ts`.

## Common Pitfalls

### Pitfall 1: Recompute inside the approve transaction
**What goes wrong:** Auditor's ✅ Onayla tap appears to "hang" — Telegram retries the webhook after 60s, the audit's idempotency fence catches the retry and replies "already resolved," and the auditor sees a confusing toast.
**Why it happens:** The approve TX already holds `submissions` and `boq_items` row locks; adding a multi-statement hakkediş aggregate inside the same TX extends lock holding time over a Telegram-webhook deadline.
**How to avoid:** Always run `recomputeHakedisLine` as a **post-commit** call wrapped in try/catch. Matches the existing CR-02 worker-notification pattern.
**Warning signs:** Auditors reporting "already resolved" toasts on first tap; Vercel logs showing webhook duration > 5s.

### Pitfall 2: `decided_at` set inside the transaction creates a race with the period cutoff
**What goes wrong:** A submission approved at `2026-01-31T23:59:00+03:00` and a draft period with `period_end_date = 2026-01-31` — the v2.0 SQL adds `+ interval '1 day' AT TIME ZONE 'Europe/Istanbul'`, so the submission *should* be included. But if `decided_at` is set by `new Date()` in Node BEFORE the COMMIT (which it is, line 426 in `bot-audit.ts`), and the COMMIT round-trips later, the timestamp on the row is the JS clock at start of TX, NOT COMMIT time. This is mostly fine — but planner should know that `decided_at` IS the auditor-tap moment, not the COMMIT moment.
**Why it happens:** `bot-audit.ts:426` does `decidedAt: new Date()` in JS; Postgres records that exact value.
**How to avoid:** Just be aware. The Istanbul-tz cutoff in the v2.0 SQL (`+ interval '1 day' AT TIME ZONE 'Europe/Istanbul'`) gives ~24h of grace and is the correct contract. No change needed.
**Warning signs:** A submission decided seconds before midnight Istanbul not appearing in either current-period or next-period cumulative — would only happen if the SQL TZ cast was wrong, which the v2.0 verification already locks in.

### Pitfall 3: Unpriced BOQ items at approval time
**What goes wrong:** Approval arrives for a BOQ item whose `unit_price IS NULL`. The v2.0 recompute *excludes* unpriced items (D-103). The scoped recompute therefore writes nothing and silently no-ops — the office never sees the contribution.
**Why it happens:** D-103 — `unit_price_snapshot` is `NOT NULL` on `hakedis_period_lines`, so unpriced items literally cannot form a line.
**How to avoid:** Accept this as designed. The `getPeriodDetail` already surfaces the "{count} unpriced item(s) excluded" warning — Phase 12 inherits this surface. **Add one assertion to the new test file:** approving a submission against an unpriced BOQ item leaves the period unchanged AND the unpriced-warning count increments / is preserved.
**Warning signs:** Office reports "I approved X but the hakkediş didn't change" — first check is `unit_price` on the BOQ item.

### Pitfall 4: Finalize-during-approval race
**What goes wrong:** Office engineer clicks Finalize at moment T0; auditor's approve transaction commits at T0+1ms; the scoped recompute fires at T0+50ms but the period is now `finalized` — the `recomputeHakedisLine` MUST detect this and skip cleanly.
**Why it happens:** No DB-level lock prevents Finalize from racing with a simultaneous approve.
**How to avoid:**
1. `recomputeHakedisLine` re-queries the period's status and SKIPS if `status != 'draft'` (mirrors line 167 of existing `recomputePeriodLines`).
2. The approval still increments `approved_qty` and writes a fresh `decided_at` — so on the NEXT period the office creates, this submission will be part of the cumulative count via D-100. Nothing is lost.
3. No advisory lock needed. The window is millisecond-scale; the worst case is a draft line that's "off by one submission" for ~30 seconds until the next manual Recompute, but per D-117 the auto-recompute trigger SKIPS once the period flips to finalized, so even that drift can't land.
**Warning signs:** Add a test: simulate approve + finalize racing on the same period; assert (a) approve still commits, (b) finalize commits, (c) no `hakedis_line_submissions` row exists for that submission against the just-finalized period (must land in the NEXT period instead).

### Pitfall 5: `logOfficeActivity` from the bot path
**What goes wrong:** If the planner naively adds `logOfficeActivity({ actorUserId: ???, actionType: 'submission_contributed_to_hakedis', ... })` inside `recomputeHakedisLine`, the bot path has no Auth.js session — `actorUserId` would be null, and the FK to `users(id)` would fail. Even if you stub it with a constant, you'd be logging EVERY approval as "the dummy user did this" which corrupts the OE Scorecard PERF-03 view.
**Why it happens:** `office_activity_log.actor_user_id` is `text.notNull().references(() => users.id)` (line 41 in `office-activity-log.ts`); `logOfficeActivity` calls `after()` which requires a Next.js request scope (line 1 in `log-office-activity.ts`).
**How to avoid:** Do NOT log from the bot path. The Telegram approval is already logged separately as the auditor decision (via `submissions.decided_by` / `decided_at`). If the planner wants OE-Scorecard visibility, see Open Question 6.
**Warning signs:** Test failure on the FK constraint, or `logOfficeActivity` throwing "after() called outside request scope" in webhook logs.

### Pitfall 6: react `useEffect` cleanup in React 19 Strict Mode
**What goes wrong:** Dev-mode double-invoke of `useEffect` spawns two `setInterval` IDs; on unmount only the second is cleared, leaking the first. Multiple page navigations stack leaked intervals.
**Why it happens:** React 19 strict-mode (the default in Next 15 dev) intentionally double-mounts effects to flush latent bugs.
**How to avoid:** The cleanup function in Pattern 3 above (`return () => clearInterval(id)`) closes over the correct `id` per mount. This is the canonical React docs pattern.
**Warning signs:** Dev console showing 2x `router.refresh()` calls every 30s; production network panel showing duplicate RSC payloads.

### Pitfall 7: Migration drift on `period_qty` GENERATED column
**What goes wrong:** Planner unwittingly generates a new migration that touches `hakedis_period_lines` (e.g., adds a column near `period_qty`); `drizzle-kit generate` re-emits a DROP/ADD on `period_qty` because it can't represent the GENERATED column round-trip cleanly. The hand-edit gets lost.
**Why it happens:** 0008's WR-07 warning is explicit: "Do NOT re-run drizzle-kit generate over this file — the hand-edits will be lost." Same caution applies to ANY further `hakedis_period_lines` migration.
**How to avoid:** Phase 12's join table is a NEW table — generate it cleanly, hand-edit only if drizzle-kit re-emits the GENERATED column drop on `hakedis_period_lines` (it shouldn't, but verify the diff before applying). Run via `npx tsx src/db/migrate.ts`, never `drizzle-kit push` (D-49).
**Warning signs:** `git diff` on the generated 0009 migration showing any reference to `hakedis_period_lines.period_qty`.

### Pitfall 8: `ON DELETE CASCADE` interaction with finalize snapshot
**What goes wrong:** A future feature deletes a draft period (D-97 already allows this). The CASCADE on `period_line_id` correctly drops the `hakedis_line_submissions` rows for that period. Good. But if someone ever deletes a `submissions` row directly (we don't expose this in v3.0, but a future "soft delete" might), `ON DELETE RESTRICT` on `submission_id` will block the delete — which is the CORRECT D-119 behavior (snapshot must outlive submission edits).
**Why it happens:** D-119 explicitly chose RESTRICT on `submission_id` for snapshot durability.
**How to avoid:** Keep the FK shape as D-119 spec'd. If a future phase ever needs to delete submissions, that phase must FIRST detach the join rows (or refuse to delete approved-and-contributed submissions, which is the safer policy anyway).
**Warning signs:** A future migration trying to flip the FK to `ON DELETE CASCADE` on `submission_id` — reject in plan review.

## Code Examples

### Example 1: Drizzle schema for the join table (D-119)

```typescript
// src/db/schema/hakedis-line-submissions.ts (NEW)
//
// D-119: per-line traceability — which submissions contributed to which hakkediş line.
// PRIMARY KEY (period_line_id, submission_id) is the idempotency key for D-117 ON CONFLICT.
// FKs:
//   period_line_id  → hakedis_period_lines (ON DELETE CASCADE) — draft delete cascades
//   submission_id   → submissions (ON DELETE RESTRICT)        — snapshot durability
//
// Snapshot-frozen at finalize: once the parent period is finalized, these rows are
// effectively immutable because the manual Recompute path (the only writer besides D-117)
// throws on `status != 'draft'` (D-96 / Pitfall 4).
//
// Source pattern: mirrors hakedis-period-lines.ts FK + index conventions.
import { pgTable, uuid, numeric, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { hakedisPeriodLines } from './hakedis-period-lines';
import { submissions } from './submissions';

export const hakedisLineSubmissions = pgTable('hakedis_line_submissions', {
  tenantId: uuid('tenant_id').references(() => tenants.id),   // nullable D-09
  periodLineId: uuid('period_line_id')
    .notNull()
    .references(() => hakedisPeriodLines.id, { onDelete: 'cascade' }),
  submissionId: uuid('submission_id')
    .notNull()
    .references(() => submissions.id, { onDelete: 'restrict' }),
  qtyContributed: numeric('qty_contributed', { precision: 12, scale: 3 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.periodLineId, t.submissionId] }),
  index('hakedis_line_submissions_submission_idx').on(t.submissionId),
]);
```

Also add to `src/db/schema/index.ts`:
```typescript
export * from './hakedis-line-submissions'; // references tenants, hakedis-period-lines, submissions (D-119)
```

### Example 2: Migration command sequence

```bash
# 1. Edit schema file, then generate
npx drizzle-kit generate

# 2. Inspect the generated 0009_*.sql — confirm it touches ONLY the new join table
#    and does NOT re-emit DROP/ADD on hakedis_period_lines.period_qty (Pitfall 7).

# 3. (If needed) hand-edit per WR-07 / 0008 precedent. Rename for clarity:
mv src/db/migrations/0009_<adjective>_<noun>.sql src/db/migrations/0009_v3_line_submissions.sql
#    AND update the matching meta/_journal.json entry's "tag" field.

# 4. Apply via the project's migration runner — NEVER drizzle-kit push (D-49)
npx tsx src/db/migrate.ts

# 5. Re-apply to the test DB too (Phase 7-02 finding):
DATABASE_URL=$TEST_DATABASE_URL npx tsx src/db/migrate.ts
```

### Example 3: Scoped recompute with `hakedis_line_submissions` INSERT…SELECT

```sql
-- Inside recomputeHakedisLine after upserting the period_lines row and capturing periodLineId:
--
-- The PRIMARY KEY (period_line_id, submission_id) makes this idempotent under D-13
-- replay; ON CONFLICT updates qty_contributed in case a future "edit approved qty" flow
-- ever lands (currently impossible — qty is immutable post-confirm).

INSERT INTO hakedis_line_submissions (tenant_id, period_line_id, submission_id, qty_contributed)
SELECT
  ${tenantId},
  ${periodLineId},
  s.id,
  s.quantity
FROM submissions s
WHERE s.boq_item_id = ${boqItemId}
  AND s.tenant_id   = ${tenantId}
  AND s.status      = 'approved'
  AND s.decided_at  <= (${periodEndDate}::date + interval '1 day') AT TIME ZONE 'Europe/Istanbul'
  -- Optional optimisation: exclude submissions already counted in a prior FINALIZED period.
  -- Required iff Phase 12 wants the join table to represent "submissions contributing to
  -- THIS period's delta" rather than "submissions in cumulative". CONTEXT.md is silent;
  -- planner picks. Recommendation: include the AND NOT EXISTS to match D-99/D-104 semantics
  -- (the join table represents period_qty, not cumulative_qty).
ON CONFLICT (period_line_id, submission_id)
  DO UPDATE SET qty_contributed = EXCLUDED.qty_contributed;
```

### Example 4: New traceability getter in `src/actions/hakedis.ts`

```typescript
'use server';

/**
 * getLineSubmissions — SDH-02 traceability: list every approved submission that
 * contributed to a hakkediş line, with worker name + photo + decided_at + qty.
 *
 * Auth-guarded; tenant-scoped via the period_line join.
 * Returns rows sorted by decided_at DESC (most recent contribution first).
 */
export async function getLineSubmissions(periodLineId: string): Promise<LineSubmission[]> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const tenantId = getDefaultTenantId();

  const result = await db.execute(sql`
    SELECT
      hls.submission_id,
      hls.qty_contributed,
      s.decided_at,
      s.photo_url,
      p.display_name AS worker_name,
      s.notes
    FROM hakedis_line_submissions hls
    JOIN submissions s     ON s.id = hls.submission_id
    JOIN people      p     ON p.id = s.person_id
    JOIN hakedis_period_lines hpl ON hpl.id = hls.period_line_id
    WHERE hls.period_line_id = ${periodLineId}
      AND hpl.tenant_id      = ${tenantId}
    ORDER BY s.decided_at DESC
  `);
  return result.rows.map(/* shape */);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useState` + manual fetch | `useEffect` + `setInterval` + `router.refresh()` | Next.js 13 App Router (Server Components) | Server Action data flows back into the RSC tree without a client-side refetch library |
| Heredoc / `cat <<EOF` for file creation | `Write` tool / IDE file creation | Always in this codebase | Avoids broken-pipe artifacts in committed files |
| `drizzle-kit push` | `drizzle-kit generate` + `npx tsx src/db/migrate.ts` | D-49 (Phase 1) | Push fails on `spatial_ref_sys` permission error on Neon |

**Deprecated/outdated:**
- SSE / Pusher / WebSocket for single-office-user live updates — over-engineered for v1.
- TanStack Query for one polling page — would add 30KB+ to the client bundle.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Polling interval default 30s is acceptable UX for the office | Pattern 3 / D-120 | Low — explicitly locked by D-120; adjusting is a one-line change. |
| A2 | The traceability UI shape (expand-row vs drawer vs sub-page) is Claude's discretion | Pattern 4 | Low — CONTEXT.md explicitly marks this as planner's call. |
| A3 | The `AND NOT EXISTS` clause excluding already-finalized-period submissions is correct for D-119 semantics | Example 3 SQL | Medium — if user wants "all contributing submissions in cumulative" vs "delta only," the SQL flips. Surface in plan-checker. |
| A4 | No new office_activity_log action type is added for D-117 contributions | Open Question 6 | Low — bot path lacks Auth.js session, so logging from there is structurally blocked anyway. |
| A5 | Phase 11's exports (hakkediş Excel + PDF) read only `hakedis_period_lines` and need no changes | SC3 regression coverage | Verified by reading Plan 11-04 SUMMARY note "writes decimal strings DIRECTLY to Hesap Özeti cells from period_lines" — exports do not touch `hakedis_line_submissions`. |

## Open Questions (RESOLVED)

> All seven questions resolved during planning. Recommendation lines below are the locked decisions consumed by the Phase 12 plans.

1. **Should the join table store "delta only" submissions or "cumulative" submissions?**
   - What we know: D-119 says rows are written "by the D-117 scoped recompute (INSERT … SELECT from the same WHERE clause that produced the line's cumulative)."
   - What's unclear: Does that mean ALL approved submissions ≤ period_end_date (cumulative), or ONLY those landing in this period's delta (post-previous-finalized-period)?
   - RESOLVED: Use the **delta-only** semantic — `AND NOT EXISTS (SELECT 1 FROM hakedis_line_submissions hls2 JOIN hakedis_period_lines hpl2 ON hpl2.id = hls2.period_line_id JOIN hakedis_periods hp2 ON hp2.id = hpl2.period_id WHERE hls2.submission_id = s.id AND hp2.status != 'draft' AND hp2.period_end_date < ${periodEndDate})`. This makes the per-line traceability UI show "what contributed to THIS period's delta," matching D-99/D-104 model. Consumed by Plan 03 Task 1 `recomputeHakedisLine` INSERT…SELECT.

2. **`tenant_id` on the join table — required or nullable?**
   - What we know: D-09 single-tenant convention is "nullable but always set via `getDefaultTenantId()`."
   - What's unclear: nothing — follow precedent.
   - RESOLVED: `tenant_id uuid REFERENCES tenants(id)` (nullable), always populated via `getDefaultTenantId()` on INSERT. Matches `hakedis_period_lines.tenant_id` exactly. Consumed by Plan 01 Task 1 schema.

3. **Polling endpoint shape — `router.refresh()` or a new lightweight Server Action?**
   - What we know: `getPeriodDetail` already returns `{ period, lines, deductions, unpricedItems }`.
   - What's unclear: Is the full payload OK every 30s, or should there be a `getPeriodChangesSince(lastTimestamp)` variant?
   - RESOLVED: Use the existing `getPeriodDetail` via `router.refresh()`. Payload is small (≤50 lines × ~10 fields each). A versioned diff endpoint is premature optimisation for a single office user. Consumed by Plan 04 Task 1 `LivePeriodPoller`.

4. **Should `recomputeHakedisLine` UPSERT the `hakedis_period_lines` row, or DELETE-then-INSERT like the existing full recompute?**
   - What we know: Existing `recomputePeriodLines` does DELETE then INSERT for ALL lines.
   - What's unclear: For a scoped recompute, DELETE-then-INSERT for ONE row breaks the `period_lines.id` referenced by `hakedis_line_submissions.period_line_id` (CASCADE would orphan the join rows briefly).
   - RESOLVED: **UPSERT** via `INSERT … ON CONFLICT (period_id, boq_item_id) DO UPDATE SET cumulative_qty_approved = …, previous_cumulative_qty = …, period_value = …, cumulative_value = …, unit_price_snapshot = …, material_snapshot = …, unit_snapshot = …, currency_code_snapshot = …`. Required adding a `UNIQUE (period_id, boq_item_id)` index on `hakedis_period_lines` (delivered in Plan 01 Task 1 / Plan 02 Task 1 migration). Consumed by Plan 03 Task 1 helper body.

5. **What guards "the same auditor approving 10 submissions in 10 seconds"?**
   - What we know: Each approval fires a separate `recomputeHakedisLine`; each is idempotent.
   - What's unclear: Are there lock-ordering concerns if two recomputes for DIFFERENT BOQ items race on the same period?
   - RESOLVED: Postgres row-level locks on `hakedis_period_lines` (one row per BOQ) serialise per-line; two different items don't lock each other. No special handling needed. Optional stress test deferred to verification: 5 concurrent approvals on 5 different BOQ items → 5 distinct rows, no deadlock.

6. **D-109 office_activity_log: should there be a `submission_contributed_to_hakedis` action type?**
   - What we know: D-109 added 4 export types in Phase 11. The OE Scorecard reads `office_activity_log`.
   - What's unclear: A contribution event has no Auth.js user (the actor is a Telegram auditor). `actorUserId` is `NOT NULL REFERENCES users(id)` — structurally blocks this.
   - RESOLVED: **DO NOT add this action type to `OFFICE_ACTION_TYPES`.** Contributions are already represented via `submissions.decided_by` (the auditor) and the new `hakedis_line_submissions` join. The OE Scorecard's hakkediş visibility comes from `hakedis_period_created` / `hakedis_period_finalized` (the office engineer's actions) — that's the correct scope. Consumed by Plan 03 Task 1 (helper does NOT call logOfficeActivity) + Plan 03 Task 2 (bot path retains zero logOfficeActivity calls, asserted by Pitfall 5 test).

7. **Should D-117 silently no-op for non-draft periods, OR should it write to the NEXT draft period if one is open?**
   - What we know: D-118 says no-op if no draft period exists.
   - What's unclear: What if a draft EXISTS but its `period_end_date < submission.decided_at`?
   - RESOLVED: Apply D-100's cumulative rule honestly — include the submission only if `decided_at <= period_end_date AT TIME ZONE 'Europe/Istanbul'`. If `decided_at > period_end_date`, the submission belongs to a FUTURE period — D-118 no-op applies (the next period the office creates will pick it up via D-100). The scoped helper's WHERE clause already enforces this. Consumed by Plan 03 Task 1 helper body.

## Environment Availability

> Phase 12 needs nothing beyond what v2.0 + Phase 11 already use.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Neon PostgreSQL 16 | Database | ✓ (in use since Phase 1) | 16 | — |
| `npx tsx` | Migration runner | ✓ | tsx 4.22.3 | — |
| `drizzle-kit` CLI | Migration generation | ✓ | 0.31.10 | — |
| Next.js 15 App Router | RSC + Server Actions + `router.refresh()` | ✓ | 15.5.18 | — |
| `next/server after()` | NOT used in Phase 12 (intentional — see Pitfall 5) | ✓ | bundled | — |
| `node_modules/.bin/shadcn` | Adding `Sheet`/`Drawer` if planner picks side-drawer for SDH-02 | ✓ | 4.8.0 | Inline expand-row pattern (no shadcn add needed) |
| Vercel Cron / Edge | NOT used | n/a | — | — |
| TEST_DATABASE_URL | `hakedis-live.test.ts` integration tests | ✓ (Phase 9 pattern) | — | Test gated by `describeIfDb` if absent |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.7 [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (existing, used by all Phase 7-11 tests) |
| Quick run command | `npx vitest run tests/hakedis-live.test.ts` |
| Full suite command | `npx vitest run` |
| DB integration gate | `describeIfDb` from `tests/fixtures/db.ts` (used by `hakedis.test.ts`, `analytics.test.ts`, `spatial.test.ts`) |
| Mock pattern | `vi.mock('next/server', () => ({ after: (fn: () => Promise<void>) => fn() }))` for Server Actions importing `logOfficeActivity` (Phase 7 finding, reusable) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SDH-01 | Approval triggers `recomputeHakedisLine` for the right triplet | integration (describeIfDb) | `npx vitest run tests/hakedis-live.test.ts -t "D-117"` | ❌ Wave 0 |
| SDH-01 | D-118: no draft period → no-op (no error, no write) | integration | `… -t "D-118 no-open-period"` | ❌ Wave 0 |
| SDH-01 | D-120 polling: `<LivePeriodPoller>` is mounted only when `status === 'draft'` | unit (component) | `… -t "LivePeriodPoller mount gate"` | ❌ Wave 0 |
| SDH-02 | `hakedis_line_submissions` row created on contribution (D-119) | integration | `… -t "D-119 join row"` | ❌ Wave 0 |
| SDH-02 | `getLineSubmissions` returns expected shape (worker, decided_at, qty) | integration | `… -t "getLineSubmissions"` | ❌ Wave 0 |
| SDH-03 | Finalize-during-approve race: approve + finalize serialise correctly | integration | `… -t "finalize race"` | ❌ Wave 0 |
| SDH-03 | Manual `recomputePeriodLines` STILL produces identical output before-and-after Phase 12 (no regression) | integration | `npx vitest run tests/hakedis.test.ts` (existing 28 tests) | ✅ (must still pass) |
| SDH-03 | Phase 11 exports byte-identical for same finalized period before/after Phase 12 | integration | `npx vitest run tests/exports.test.ts` (existing 16+ tests) | ✅ (must still pass) |
| Pitfall 5 | bot path never calls `logOfficeActivity` (no FK fail) | integration | `… -t "no office_activity_log write from bot"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/hakedis-live.test.ts -x`
- **Per wave merge:** `npx vitest run tests/hakedis-live.test.ts tests/hakedis.test.ts tests/exports.test.ts tests/telegram-audit.test.ts`
- **Phase gate:** Full suite green (`npx vitest run`) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/hakedis-live.test.ts` — new file; mirrors `tests/hakedis.test.ts` setup (`describeIfDb`, `seedAuditFixture`, `truncateAllTables`); covers SDH-01/02/03 contracts above.
- [ ] No new fixtures needed if planner reuses `seedAuditFixture` (workers, auditors, BOQ items) + adds a `seedDraftPeriod` helper.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 12 adds no new entry points — bot webhook is already authenticated via Phase 2/3 |
| V3 Session Management | no | Bot path is stateless modulo `conversation_state` (Phase 2); dashboard path uses Auth.js session unchanged |
| V4 Access Control | yes | `getLineSubmissions` MUST `await auth()` as first statement + filter by `tenant_id` (Phase 10 pattern) |
| V5 Input Validation | yes | `recomputeHakedisLine` accepts `(projectId, boqItemId, currencyCode)` — all derived from a row the audit handler ALREADY locked. No new user input enters the validation surface. The `LivePeriodPoller` accepts only props from server-side RSC. |
| V6 Cryptography | no | No new crypto |
| V8 Data Protection | yes | `hakedis_line_submissions` row includes `submission_id` → `submissions.photo_url` (Vercel Blob URL). The traceability UI MUST respect existing role guards — only office engineers see it (route group `(admin)` enforces this). |

### Known Threat Patterns for Phase 12

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via boqItemId / currencyCode | Tampering | All bound via Drizzle `sql\`\`` parameters (verified existing pattern in `hakedis.ts`) |
| IDOR — auditor B's approval triggers recompute on auditor A's project's hakkediş | Information Disclosure | `recomputeHakedisLine` derives `projectId` from `boq_items` lookup, NOT from the bot request — the auditor cannot influence which project's hakkediş gets recomputed beyond their own approval |
| Forced finalize-during-approve to corrupt the snapshot | Tampering | `recomputeHakedisLine` re-queries `period.status` and SKIPs if `!= 'draft'` — Postgres MVCC + the `period.status` re-check serialise correctly (see Pitfall 4) |
| Polling DoS — malicious office user opens 100 draft tabs each polling every 30s | Denial of Service | Single-office-user product; rate is at most ~3 RPS per tab. Out of scope for v1 threat model. |
| Tenant boundary violation in `hakedis_line_submissions` reads | Information Disclosure | Every SELECT joins through `hakedis_period_lines` which is already tenant-scoped — no direct query path bypasses tenant_id |

## Project Constraints (from CLAUDE.md)

- **Tech stack lock:** Next.js 15 App Router (no Pages Router), grammY for Telegram, Drizzle 0.45.x, Neon PostgreSQL with PostGIS. Phase 12 stays within all four.
- **Money math:** Postgres `numeric` + decimal.js for display only. NEVER multiply numeric strings in JS. The scoped recompute SQL keeps `qty_contributed` and `period_value` computation in Postgres throughout.
- **Migrations:** `drizzle-kit generate` produces a scaffold; hand-edit per WR-07 precedent (0006 / 0007 / 0008); apply via `npx tsx src/db/migrate.ts`. **`drizzle-kit push` is unusable (D-49) — do not suggest it.**
- **shadcn CLI:** `node_modules/.bin/shadcn add` — NOT `npx shadcn@latest add` (Phase-8 finding). Only relevant if planner picks side-drawer for SDH-02.
- **i18n:** Every new label gets BOTH `messages/en.json` and `messages/tr.json` entries (D-111 carry-forward).
- **Single-tenant MVP:** all writes use `getDefaultTenantId()`; all reads filter by `tenant_id` (D-09).
- **Vercel-serverless constraint:** no long-lived connections (SSE/WebSocket) — D-120's 30s polling is the right shape.

## Sources

### Primary (HIGH confidence — verified in this session)
- `src/lib/bot-audit.ts` lines 1-811 — full audit handler; D-117 hook lands at line 463-498 (post-`editAllSiblingMessages`, pre-worker-notification)
- `src/actions/hakedis.ts` lines 1-762 — Phase 10 hakkediş actions; `recomputePeriodLines` body (lines 184-282) is the template for the scoped helper
- `src/db/schema/hakedis-periods.ts` — period header schema with D-91 columns and CHECK constraints
- `src/db/schema/hakedis-period-lines.ts` — line schema with D-104 GENERATED column declaration (line 39)
- `src/db/schema/submissions.ts` — `decided_at` / `decided_by` / `status` enum + tenant_id pattern
- `src/db/schema/audit-notifications.ts` — pattern reference for new join-table FK shape
- `src/db/schema/office-activity-log.ts` — `OFFICE_ACTION_TYPES` const tuple + `actor_user_id NOT NULL REFERENCES users(id)` constraint
- `src/lib/log-office-activity.ts` lines 1-40 — confirms `after()` requires request scope (Pitfall 5)
- `src/db/migrations/0008_v2_hakedis_deductions.sql` — WR-07 precedent for hand-edited migrations + `period_qty` GENERATED column
- `src/db/migrate.ts` — confirms migration runner pattern (neon-http + 0000_enable_postgis.sql first-step)
- `drizzle.config.ts` — generates into `src/db/migrations`; schema glob `./src/db/schema/*.ts`
- `package.json` — every Phase 12 dependency already installed; nothing new needed
- `.planning/phases/10-hakkedi-billing/10-VERIFICATION.md` — 13/13 v2.0 truths must continue to pass
- `tests/hakedis.test.ts` (28 tests) + `tests/telegram-audit.test.ts` (52 audit tests) + `tests/exports.test.ts` — regression surface for SC3
- `src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx` — RSC page Phase 12 wraps with `<LivePeriodPoller>`
- `src/components/admin/PeriodDetailControls.tsx` — existing `router.refresh()` pattern referenced by Pattern 3
- `messages/en.json` + `messages/tr.json` lines 350-400 — hakedis i18n namespace shape
- `.planning/ROADMAP.md` §"Phase 12: Submission-Driven Hakkediş" lines 427-444 — goal + 4 success criteria

### Secondary (MEDIUM confidence — official docs cited but not Context7-fetched this session)
- React 19 useEffect cleanup pattern [CITED: react.dev/reference/react/useEffect#parameters]
- Next.js 15 App Router `router.refresh()` semantics [CITED: nextjs.org/docs/app/api-reference/functions/use-router]
- Drizzle `generatedAlwaysAs` column type [CITED: orm.drizzle.team/docs/generated-columns]
- Postgres `INSERT … ON CONFLICT … DO UPDATE` upsert [CITED: postgresql.org/docs/16/sql-insert.html]

### Tertiary (LOW confidence — none)
- No tertiary sources used; every claim is grounded in tree-verified code or cited primary docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package verified against `package.json`; no new installs needed.
- Architecture: HIGH — integration points read directly from the live tree; post-commit pattern mirrors existing CR-02.
- Pitfalls: HIGH — Pitfall 5 in particular is structural (FK constraint on `office_activity_log.actor_user_id`) and grep-verified.
- Validation: HIGH — vitest patterns identical to Phase 10's working tests.
- Open Questions: all seven RESOLVED during planning; recommendations consumed by the Phase 12 plans (see RESOLVED prefixes).

**Research date:** 2026-05-28
**Valid until:** 2026-06-27 (stable domain; only risk is grammY or Drizzle minor-bump introducing a breaking change)

---

*Phase 12 — Submission-Driven Hakkediş*
*Research complete: 2026-05-28*
*Revision 1: Open Questions resolved (2026-05-28)*
