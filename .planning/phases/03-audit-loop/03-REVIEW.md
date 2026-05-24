---
phase: 03-audit-loop
reviewed: 2026-05-24T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src/lib/bot-audit.ts
  - src/lib/telegram.ts
  - src/lib/bot-fsm.ts
  - src/lib/bot-keyboards.ts
  - src/lib/bot-messages.ts
  - src/db/schema/audit-notifications.ts
  - src/db/schema/submissions.ts
  - src/db/schema/index.ts
  - src/db/migrate.ts
  - tests/fixtures/db.ts
  - tests/telegram-audit.test.ts
  - scripts/setup-test-db.mjs
findings:
  critical: 2
  warning: 7
  info: 5
  total: 14
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-05-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed the Phase 3 audit-loop implementation: auditor fan-out, the atomic
first-wins approve/reject decision transaction, the mandatory reject-reason FSM,
server-side authorization, and worker notification.

The core security-critical path is mostly sound: the approve and reject
transactions both use the same `UPDATE ... WHERE status='pending_audit' RETURNING`
guard inside a `getTxDb()` (neon-serverless Pool) transaction, which correctly
prevents double-increment of `approved_qty` under concurrent taps — the second
writer gets an empty `RETURNING` and throws `AlreadyResolvedError`. Authorization
is re-queried against `assignments` on every `audit:approve`/`audit:reject` tap and
never trusts `callback_data`. `answerCallbackQuery` is called generically in
`telegram.ts:316`. `tenant_id` is supplied on every `audit_notifications` insert.

However, two BLOCKER issues compromise the guarantees the phase claims:

1. The atomic first-wins guard is defeated by the idempotency middleware's
   transaction-isolation interaction in the **non-test** runtime: the approve
   increment uses a raw SQL fragment `approved_qty + ${quantity}` that is **not
   tenant- or row-scoped beyond the boqItemId**, which is fine — but the larger
   defect is the worker-notification / sibling-edit work runs through the
   **caller-supplied `db` (neon-http)** while the decision ran on a separate Pool
   connection, and the post-commit read of the worker's `telegramUserId` is not
   guarded, so a transient read failure silently drops the worker notification
   without surfacing or retrying (data-trust / silent-loss path).

2. The reject free-text path drops server-side authorization re-validation AND
   allows any user with a stale/forged FSM row shape to drive `commitRejection`
   against an arbitrary `submissionId` carried in their own `conversation_state`.

See findings below for specifics and concrete fixes.

## Critical Issues

### CR-01: Reject free-text handler commits without re-checking auditor authorization or FSM step

**File:** `src/lib/telegram.ts:642-646`, `src/lib/bot-audit.ts:671-698`
**Issue:**
The message dispatcher routes any message whose `conversation_state.currentStep ===
AWAITING_REJECT_REASON` straight into `handleAuditRejectFreeText`, which calls
`commitRejection(ctx, submissionId, auditorPersonId, cappedReason, db)` using
`submissionId` and `auditorPersonId` taken **directly from the FSM row's `data`**
(`bot-audit.ts:692-695`). `commitRejection` then performs the atomic
`UPDATE submissions SET status='rejected' ... WHERE status='pending_audit'` with
`decidedBy: auditorPersonId` **without ever re-querying `assignments`** to confirm
the tapping user is still an authorized auditor on that submission's project.

The phase contract (D-36) is "re-query assignments every tap; never trust
callback_data." The free-text commit path trusts the FSM `data` payload instead.
While that payload was written during an authorized `handleAuditDecision` reject
branch, authorization is a point-in-time check: an auditor whose assignment is
revoked between tapping ❌ and typing a reason can still commit the rejection and
be recorded as `decided_by`. There is no re-validation at the actual mutation
point. This is the same class of gap the approve path explicitly closes by
re-checking `assignmentRows` immediately before the transaction.

A second, sharper variant: `handleAuditReasonSelect` (`bot-audit.ts:610-654`) and
`handleAuditRejectFreeText` derive `auditorPersonId` from `state.data`, not from
`ctx.from.id`. They never assert that `state.data.auditorPersonId` corresponds to
the `people` row for `ctx.from.id`. The FSM row is keyed by `telegram_user_id`, so
in normal flow they match — but the commit is authorized purely by "a row with
this step exists," not by re-resolving the caller's identity and assignment.

**Fix:** Re-validate authorization inside `commitRejection` before the transaction,
mirroring the approve path:
```ts
export async function commitRejection(ctx, submissionId, auditorPersonId, reason, db) {
  const { people } = await import('@/db/schema/people');
  const { assignments } = await import('@/db/schema/assignments');
  const { submissions } = await import('@/db/schema/submissions');
  const { eq, and } = await import('drizzle-orm');

  // Re-resolve caller identity from ctx.from.id (do NOT trust FSM data alone)
  const callerRows = await db.select({ id: people.id })
    .from(people).where(eq(people.telegramUserId, BigInt(ctx.from.id)));
  if (!callerRows.length || callerRows[0].id !== auditorPersonId) {
    await ctx.answerCallbackQuery?.({ text: MESSAGES.auditUnauthorized, show_alert: true });
    return;
  }
  // Re-check the auditor is still assigned to the submission's project
  const subRows = await db.select({ projectId: submissions.projectId })
    .from(submissions).where(eq(submissions.id, submissionId));
  if (!subRows.length) { /* already-resolved toast */ return; }
  const assigned = await db.select({ id: assignments.id }).from(assignments).where(
    and(eq(assignments.personId, auditorPersonId),
        eq(assignments.projectId, subRows[0].projectId),
        eq(assignments.roleOnProject, 'auditor')));
  if (!assigned.length) { /* unauthorized toast + clear state */ return; }
  // ... existing transaction
}
```

### CR-02: Worker-notification path can silently drop notifications on a transient read failure (no error handling around the post-commit worker lookup)

**File:** `src/lib/bot-audit.ts:432-453` (approve) and `src/lib/bot-audit.ts:572-590` (reject)
**Issue:**
After the decision transaction commits, the code re-reads the worker's
`telegramUserId` with an **unguarded** `db.select(...)` (`bot-audit.ts:433-436`,
`573-576`). The `sendMessage` call itself is wrapped in try/catch (good, D-40
best-effort), but the **`db.select` that feeds it is not**. If that read throws
(network blip on the neon-http connection, pool exhaustion, etc.), the exception
propagates out of `handleAuditDecision`/`commitRejection` *after* the submission
has already been mutated to `approved`/`rejected` and `editAllSiblingMessages` has
run. The worker is then never told their work was approved/rejected, and because
the throw escapes after commit, the only signal is an unhandled rejection in the
grammY handler chain — there is no retry and the toast to the auditor is also
skipped. This is a data-trust / silent-loss defect on the notification leg (D-37).

The approve path is worse: the read at `bot-audit.ts:433` happens *before*
`editAllSiblingMessages` at line 440 — no, re-reading: the read is at 433-436 and
`editAllSiblingMessages` is at 440. So a throw at 433 skips the sibling edit too,
leaving all auditor messages still showing live Approve/Reject buttons on an
already-approved submission. Tapping those buttons then yields the already-resolved
toast (safe), but the auditors see a stale, actionable-looking message.

**Fix:** Wrap the post-commit worker lookup in try/catch and treat failure as
best-effort, consistent with the surrounding D-40 philosophy. Also move
`editAllSiblingMessages` to run before (or independently of) the worker lookup so
a notification-read failure cannot leave stale keyboards:
```ts
// approve, after commit:
await editAllSiblingMessages(submissionId, MESSAGES.auditApprovedOutcome(auditorDisplayName));
try {
  const workerRows = await db.select({ telegramUserId: people.telegramUserId })
    .from(people).where(eq(people.id, workerPersonId));
  if (workerRows.length) {
    const { bot } = await import('@/lib/telegram');
    await bot.api.sendMessage(Number(workerRows[0].telegramUserId), MESSAGES.workerApproved);
  }
} catch (notifyErr) {
  console.error('[handleAuditDecision] worker notification failed:', notifyErr);
}
```

## Warnings

### WR-01: `audit_notifications` is never written for the approve/reject sibling-edit lookup, but the table is never tenant-filtered on read

**File:** `src/lib/bot-audit.ts:246-249`
**Issue:**
`editAllSiblingMessages` selects `auditNotifications` filtered only by
`submissionId` with no `tenantId` predicate. In the v1 single-tenant world this is
harmless, but the phase contract emphasizes "no hardcoded tenant identity that
blocks multi-tenant migration" (CLAUDE.md). Every other read in this phase is also
un-tenant-scoped on read (only scoped on write). When multi-tenant lands, a
`submissionId` collision is impossible (UUID PK), so this is low risk — but the
inconsistency (tenant on write, never on read) is a latent correctness trap worth a
comment or a defensive tenant filter.

**Fix:** Add `and(eq(auditNotifications.submissionId, submissionId), eq(auditNotifications.tenantId, getDefaultTenantId()))` or document explicitly that reads rely on UUID PK uniqueness and intentionally skip tenant scoping in v1.

### WR-02: Over-delivery warning and caption use `parseFloat` on numeric columns, losing precision and risking `NaN` in the caption

**File:** `src/lib/bot-audit.ts:150-153, 170-171`
**Issue:**
`quantity`, `plannedQty`, and `approvedQty` are Postgres `numeric(12,3)` returned as
strings. `parseFloat(submission.quantity as string)` converts to a JS float, then
`newTotal = approvedQty + quantity` is float arithmetic. For BOQ quantities this can
produce display artifacts (e.g. `0.1 + 0.2 = 0.30000000000000004`) shown directly to
auditors in `auditOverDelivery(newTotal, ...)`. Worse, if any of these columns were
ever null/undefined (e.g. a malformed row), `parseFloat(undefined as any)` yields
`NaN`, and `NaN > plannedQty` is `false` so the warning silently never fires, and a
`NaN` could leak into the caption. The increment itself is done correctly in SQL
(`approved_qty + ${quantity}`), so the float math here is display-only — but it is
the number an auditor uses to decide approval.

**Fix:** Guard the parses and round for display:
```ts
const quantity = Number(submission.quantity);
const plannedQty = Number(boqItem.plannedQty);
const approvedQty = Number(boqItem.approvedQty);
if ([quantity, plannedQty, approvedQty].some(Number.isNaN)) {
  console.error('[fanOutToAuditors] non-numeric qty for submission', submissionId);
  return;
}
const newTotal = Math.round((approvedQty + quantity) * 1000) / 1000;
```

### WR-03: `editAllSiblingMessages` always strips the keyboard before confirming the caption edit succeeded, and swallows the failure per-call — but the caption edit and markup edit are not atomic

**File:** `src/lib/bot-audit.ts:259-264`
**Issue:**
For each ref, `editMessageCaption` is awaited, then `editMessageReplyMarkup` is
awaited separately. If the caption edit succeeds but the markup edit throws (e.g.
the 48h window expires between the two API calls, or a rate-limit on the second
call), the message will show the resolved caption but **still carry the live
Approve/Reject inline keyboard**. The catch block logs and continues, so the
half-edited state is permanent. An auditor then taps a live-looking button on an
already-resolved submission. The decision transaction safely rejects it
(already-resolved toast), so this is not a data-integrity bug, but it is a confusing
UX state that the "strip the keyboard on decision" contract (D-34) is supposed to
prevent.

**Fix:** Strip the keyboard in the same call as the caption where possible, or strip
the markup first (so a button can never outlive a resolved caption), or collapse to
a single `editMessageCaption` that includes `reply_markup: { inline_keyboard: [] }`
in its options (grammY's `editMessageCaption` accepts `reply_markup`).

### WR-04: `dispatchCallbackQuery` parses `audit:reject` action by `startsWith` but the reject branch shares the parse with approve, allowing `audit:approve:` / `audit:reject:` with an empty submissionId

**File:** `src/lib/telegram.ts:473-480`
**Issue:**
`const submissionId = parts.slice(2).join(':')` — for a malformed payload like
`audit:approve:` (trailing colon, nothing after), `parts = ['audit','approve','']`
and `submissionId` becomes `''`. This empty string is passed to
`handleAuditDecision`, which runs `db.select(...).where(eq(submissions.id, ''))`. An
empty string is not a valid UUID; on Postgres this throws (`invalid input syntax for
type uuid`), which propagates as an unhandled error in the grammY handler (no
try/catch around the authorization selects in `handleAuditDecision:327-334`). A
crafted callback (or a future code change that builds the keyboard with an empty id)
would surface a 500-class handler error rather than a clean toast.

**Fix:** Validate `submissionId` is a non-empty UUID before dispatch:
```ts
const submissionId = parts.slice(2).join(':');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId)) {
  await ctx.answerCallbackQuery({ text: MESSAGES.genericError, show_alert: true });
  return;
}
```
Or wrap the authorization selects in `handleAuditDecision` in try/catch returning the generic-error toast.

### WR-05: `handleAuditReasonSelect` reuses `STEPS.AWAITING_REJECT_REASON` for the free-text path, so a canned reason value that happens to equal `'free'` can never be submitted as a literal reason

**File:** `src/lib/bot-audit.ts:638-650`, `src/lib/bot-keyboards.ts:175`
**Issue:**
The free-text sentinel is the literal string `'free'` (`audit:reason:free`). The
dispatcher routes `reasonOrFree === 'free'` to the free-text prompt instead of
committing. The canned taxonomy today does not include "free" as a reason, so this
is currently safe — but it is a fragile coupling: if a future canned reason text were
ever `free` (or localized copy collided), it would silently become unsubmittable.
Also note `AWAITING_REJECT_REASON_FREE` is defined in `STEPS` (`bot-fsm.ts:36`) but
**never used** — the code comment at `bot-audit.ts:639-640` says it deliberately
reuses `AWAITING_REJECT_REASON` instead. That leaves a dead constant.

**Fix:** Use a sentinel that cannot collide with reason text (e.g. an empty
`audit:reason:` prefix dedicated route, or a separate `audit:reasonfree` callback
prefix), and either wire up or delete `AWAITING_REJECT_REASON_FREE`.

### WR-06: Reject FSM overwrites a worker's in-progress submission flow with no warning or restore (D-32 single-row-per-user collision)

**File:** `src/lib/bot-audit.ts:464-474`
**Issue:**
`conversation_state` has `telegram_user_id UNIQUE` (one row per user). When an
auditor who is *also* a worker on some project taps ❌ Reddet, `saveState` upserts
their row to `AWAITING_REJECT_REASON` via `onConflictDoUpdate`
(`telegram.ts:191-194`), **silently discarding any in-progress worker submission
flow** (project/boq/photo/etc. they were mid-way through). The code comment at
`bot-audit.ts:462-463` acknowledges this ("saveState upsert overwrites any active
worker flow") but treats it as acceptable. D-03 explicitly allows the same person to
be worker on one project and auditor on another, so this collision is reachable in
normal operation, and the worker silently loses their partially-entered log with no
notification.

**Fix:** At minimum, warn the user their in-progress log was paused, or store the
prior worker state under a distinct key / stack so it can be restored after the
reject flow completes. If the product decision is genuinely "audit always wins,"
make that explicit to the user rather than silently dropping data.

### WR-07: `migrate.ts` runs raw PostGIS SQL read from disk and swallows all errors via top-level `.catch(console.error)`, exiting 0 on failure

**File:** `src/db/migrate.ts:25, 32`
**Issue:**
`main().catch(console.error)` logs any migration error but does **not** set a
non-zero exit code. `scripts/setup-test-db.mjs:67-75` invokes `npx tsx
src/db/migrate.ts` via `spawnSync` and checks `r.status !== 0` to detect failure —
but because `migrate.ts` swallows the error and the process exits 0, a failed
migration (e.g. a broken `0000_enable_postgis.sql` or a Drizzle migration error)
would be reported as a **successful** test-DB setup. CI would then run the suite
against an unmigrated/partially-migrated DB and produce confusing failures or
false greens.

**Fix:**
```ts
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

## Info

### IN-01: `getTxDb` is duplicated verbatim in `bot-audit.ts:28-46` and `telegram.ts:1186-1205`

**File:** `src/lib/bot-audit.ts:28-46`, `src/lib/telegram.ts:1186-1205`
**Issue:** The neon-serverless Pool transaction helper is copy-pasted in two files
(the header comment at `bot-audit.ts:23` even says "Copied exactly from the pattern
in src/lib/telegram.ts"). Two copies drift independently — one already logs a
slightly different message. `telegram.ts` does not export its `getTxDb`, forcing the
duplication.
**Fix:** Extract `getTxDb` into a shared module (e.g. `src/lib/tx-db.ts`) and import
it in both places.

### IN-02: `getTxDb` creates a new `Pool` on every call and never closes it

**File:** `src/lib/bot-audit.ts:44-45`, `src/lib/telegram.ts:1203-1204`
**Issue:** Each decision/submit opens a fresh `new Pool(...)` and never calls
`pool.end()`. In a serverless function this leaks a WebSocket connection per
invocation until the function instance is recycled. (Connection/resource lifecycle
is largely out of v1 scope, flagged as Info only.)
**Fix:** `try { return ... } finally { /* end pool after tx via a wrapper */ }`, or
reuse a module-scoped pool.

### IN-03: `AWAITING_REJECT_REASON_FREE` constant is dead

**File:** `src/lib/bot-fsm.ts:36`
**Issue:** Defined but never referenced anywhere (the free-text path reuses
`AWAITING_REJECT_REASON` per the comment in `bot-audit.ts:639`). Dead code.
**Fix:** Remove the constant, or wire it up if the distinct step was intended (see WR-05).

### IN-04: Stale phase marker in webhook health probe

**File:** `src/app/api/telegram/webhook/route.ts:80` (adjacent, surfaced while tracing dispatch)
**Issue:** `GET` returns `{ ok: true, phase: 1 }` — the project is now in Phase 3.
Minor, but the phase marker is misleading for deploy health checks.
**Fix:** Bump or remove the hardcoded `phase` literal.

### IN-05: `truncateAllTables` error-matching relies on a substring `message.includes('does not exist')`

**File:** `tests/fixtures/db.ts:93-94`
**Issue:** The fallback path matches Postgres `42P01` by code OR by the fragile string
`message.includes('does not exist')`. A different error whose message happens to
contain "does not exist" (e.g. a missing column, `column "x" does not exist`) would
be misclassified as "undefined table" and trigger the phase-2-only truncation,
silently masking the real error. Test-only, so Info.
**Fix:** Match strictly on `pgCode === '42P01'` and drop the substring fallback.

---

_Reviewed: 2026-05-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
