# Phase 3: Audit Loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 3-Audit Loop
**Areas discussed:** BOQ approval semantics, Reject-reason flow, Multi-auditor message lifecycle, Feedback & audit trail

---

## BOQ Approval Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Allow, warn auditor | No DB cap, but the auditor's message flags "⚠ Sözleşmeyi aşıyor (X/Y)" so the decision is informed. Consistent with D-25. | ✓ |
| Allow, no cap | No constraint, no flag; approved_qty freely exceeds planned_qty. | |
| Hard cap | CHECK (approved_qty <= planned_qty); over-approval blocked. Conflicts with D-25. | |

**User's choice:** Allow, warn auditor (→ D-27, D-28)
**Notes:** Resolves the STATE.md "Phase 3 blocker" suggestion to add a CHECK constraint — we explicitly do NOT add it, because Phase 2 D-25 already permits over-delivery logging. The auditor is warned in-message instead of being hard-blocked.

---

## Reject-reason Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Canned reasons + note | Inline buttons of common reasons + a "Başka (yaz)" free-text escape. Fast, structured, dashboard-filterable. | ✓ |
| Free-text only | Auditor types the reason. Simplest, but slower and unstructured. | |
| Canned only | Buttons, no typing. Fastest, can't capture nuance. | |

**User's choice:** Canned reasons + note (→ D-30)

| Option | Description | Selected |
|--------|-------------|----------|
| Mandatory | Rejection not committed until a reason is given; abandoned reject leaves submission pending_audit. | ✓ |
| Optional / skippable | Auditor can reject without a reason. | |

**User's choice:** Mandatory (→ D-31)
**Notes:** Free-text path reuses the D-12 DB-row FSM (auditor-side `awaiting_reject_reason` state) — locked as Claude's discretion for table shape (D-32).

---

## Multi-auditor Message Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Edit all to show outcome | On first decision, edit every auditor's message: strip buttons, append outcome. Requires persisting chat_id+message_id per fan-out. | ✓ |
| Leave buttons, reject late taps | Don't touch other messages; late tap gets an ephemeral "already resolved" toast (AUDIT-06 minimum). | |

**User's choice:** Edit all to show outcome (→ D-33, D-34)

| Option | Description | Selected |
|--------|-------------|----------|
| Single tap is final | Approve acts immediately; Reject goes straight to the reason step. | ✓ |
| Confirmation step | Tapping shows "Onayla? Evet/Hayır" first. | |

**User's choice:** Single tap is final (→ D-35)

---

## Feedback & Audit Trail

| Option | Description | Selected |
|--------|-------------|----------|
| Both approve & reject | Worker notified on both outcomes; closes the loop positively. | ✓ |
| Reject only | Notify worker only on rejection (literal requirement). | |

**User's choice:** Both approve & reject (→ D-37)

| Option | Description | Selected |
|--------|-------------|----------|
| decided_by + decided_at + reason | Full accountability columns; feeds Phase 5 dashboard. | ✓ |
| reason only | Add rejection_reason only; skip who/when. | |

**User's choice:** decided_by + decided_at + rejection_reason (→ D-38)

---

## Claude's Discretion

- Atomic decision SQL (SELECT … FOR UPDATE + status guard, neon-serverless Pool) — locked strategy from STATE.md (D-29), exact SQL deferred to planner.
- Photo delivery via Telegram file_id with Blob URL fallback.
- Storage shape for fan-out message refs (table vs jsonb) — D-34.
- Auditor reject-FSM: extend conversation_state vs sibling table — D-32.
- Final Turkish microcopy and canned-reason taxonomy (within D-26 tone).
- New schema naming/indexes; tenant_id on every insert (D-09).

## Deferred Ideas

- Location anomaly flag in auditor message → GEO-02, Phase 4.
- AI advisory flags in auditor message → AI-03, Phase 6.
- Dedicated mobile-web auditor review view → AUDIT-V2-01, v2.
- Per-segment/chainage auditor assignment → AUDIT-V2-02, v2.
- SLA / escalation if no auditor acts within a time window → not in v1.
- Editing/undoing a decision after the fact → out of scope.

## Edge-case defaults (locked, not separately discussed)

- No auditor assigned at confirm → submission stays pending_audit + warning to office (D-39).
- Telegram send failure to one auditor → best-effort, don't block others/worker (D-40).
