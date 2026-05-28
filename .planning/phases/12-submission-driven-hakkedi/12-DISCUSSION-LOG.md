# Phase 12: Submission-Driven Hakkediş — Discussion Log

**Discussed:** 2026-05-28
**For human reference only — not consumed by downstream agents (researcher / planner / executor read CONTEXT.md instead).**

## Origin

User raised this requirement at the end of Phase 11 execution: *"for the functionality, the hakkediş should be created by also the each work application messages"*. Logged in user memory as `hakedis-from-work-applications` and surfaced in PROJECT.md as v3.0 candidate scope. Phase 12 was opened as part of milestone v3.0 (alongside Phase 13 UX/brand pass) with the user choosing the "Proper" path on `/gsd:new-milestone`.

## Gray areas presented

Four areas surfaced from analysis of v2.0's hakkediş model (Phase 10 CONTEXT D-95..D-104):

1. Contribution mechanism on each approval
2. No-open-period behavior
3. Traceability model
4. Real-time delivery to dashboard

User selected **all four** for discussion.

## Q1 — Contribution mechanism

**Options presented:**
- (a) Auto-recompute scoped to the affected BOQ line *(Recommended)*
- (b) Incremental delta on the line row
- (c) Both — delta on write, periodic reconciliation

**User picked:** (a) Auto-recompute scoped.
**Recorded as:** D-117 in CONTEXT.md.

## Q2 — No-open-period behavior

**Options presented:**
- (a) Do nothing — v2.0 cumulative catches it *(Recommended)*
- (b) Queue with badge on the hakkediş hub
- (c) Auto-create draft period on first orphan approval

**User picked:** (a) Do nothing.
**Recorded as:** D-118 in CONTEXT.md. (b) deferred under "Queue badge for orphan approvals". (c) explicitly rejected.

## Q3 — Traceability model

**Options presented:**
- (a) New join table `hakedis_line_submissions` *(Recommended)*
- (b) Compute on-read from submissions table
- (c) Store `submission_ids[]` array on `hakedis_period_lines`

**User picked:** (a) Join table.
**Recorded as:** D-119 in CONTEXT.md.

## Q4 — Real-time delivery

**Options presented:**
- (a) Poll every 30s on draft detail only *(Recommended)*
- (b) Server-sent push (SSE / Pusher / WebSocket)
- (c) On-refresh only — no polling, no push
- (d) Poll every 10s on draft detail only

**User picked:** (a) Poll every 30s.
**Recorded as:** D-120 in CONTEXT.md. (b) deferred under "Push-based real-time".

## Scope creep redirected

None during this discussion. All four areas stayed inside the phase boundary.

## Notes for the planner

- v2.0's Phase 10 CONTEXT is the single most important upstream — every decision references it
- The `bot-audit.ts` approval handler is the integration point that didn't exist for Phase 10 — D-117 wires Phase 3's audit loop into Phase 10's hakkediş layer
- Phase 13 (UX/brand pass) will re-skin every surface including Phase 12's traceability UI — don't over-invest in bespoke UI here
