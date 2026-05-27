# Phase 10: Hakkediş Billing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-28
**Phase:** 10-hakkedi-billing
**Areas discussed:** Deduction chain & math, Finalize vs payment lifecycle, Compute trigger & chaining, Period scope & edge cases

---

## Deduction chain & math

### Net formula
| Option | Description | Selected |
|--------|-------------|----------|
| Yes — standard chain | Net INCLUDES contractor's KDV share (KDV − tevkifat); teminat/stopaj/avans each rate × KDV-excluded gross; matches SC3. | ✓ |
| KDV handled on invoice only | Net is the KDV-excluded amount after deductions; KDV + tevkifat shown but on the fatura, not folded into net. | |
| Let me describe our exact chain | Custom order/bases. | |

**User's choice:** Yes — standard chain
**Notes:** Confirms tevkifat is a fraction OF the KDV (employer-withheld); KDV/stopaj/teminat/avans on the matrah. → D-90.

### Defaults for a new draft period
| Option | Description | Selected |
|--------|-------------|----------|
| Conservative — extras off | tevkifat 0, stopaj off, avans 0; KDV 0.20 / teminat 0.05. | |
| Construction-typical preset | tevkifat 4/10 (0.40), stopaj off, avans 0; KDV 0.20 / teminat 0.05. | ✓ |
| You decide | Pick during planning. | |

**User's choice:** Construction-typical preset → D-92

### Stopaj modeling
| Option | Description | Selected |
|--------|-------------|----------|
| Rate field, 0 = off | Single stopaj_rate column; zero means no line. | |
| Explicit toggle + rate | Boolean stopaj_enabled + stopaj_rate; toggle controls line visibility. | ✓ |

**User's choice:** Explicit toggle + rate → D-93

### Avans kesintisi mechanics
| Option | Description | Selected |
|--------|-------------|----------|
| Flat rate × gross per period | Independent each period; no balance tracking. | (recommended) |
| Tracked advance balance | Project-level advance recouped across periods until zero. | |
| You decide | Pick during planning. | ✓ |

**User's choice:** You decide → D-94 (Claude recommends flat rate × gross; tracked balance deferred)

---

## Finalize vs payment lifecycle

### Lifecycle shape
| Option | Description | Selected |
|--------|-------------|----------|
| Linear, finalize is the gate | draft → finalized → submitted → paid; finalize mandatory before submitted; draft only editable state; lock keys off status != draft. | ✓ |
| Finalize orthogonal to payment | status tracks payment only; separate finalizedAt lock; could pay without finalizing. | |
| You decide | Pick the cleaner model. | |

**User's choice:** Linear, finalize is the gate → D-95

### Reversibility
| Option | Description | Selected |
|--------|-------------|----------|
| Irreversible — no un-finalize | Permanent; corrections flow through next period's cumulative delta. | ✓ |
| Allow un-finalize to draft | Revert to draft to fix (if not paid). | |
| You decide | Pick during planning. | |

**User's choice:** Irreversible — no un-finalize → D-96

### Deletion
| Option | Description | Selected |
|--------|-------------|----------|
| Draft deletable, finalized never | Drafts deletable + logged; finalized/submitted/paid immutable. | ✓ |
| No deletion at all | Append-only even for drafts. | |
| You decide | Pick during planning. | |

**User's choice:** Draft deletable, finalized never → D-97

---

## Compute trigger & chaining

### Recompute trigger
| Option | Description | Selected |
|--------|-------------|----------|
| On create + manual recompute | Compute on create; "Yeniden Hesapla" button while draft; blocked after finalize; rows stored. | ✓ |
| Always auto-recompute (live) | Draft lines always reflect current approvals; numbers can shift under the user. | |
| Compute only at finalize | No stored lines while draft; can't preview SC3 table. | |

**User's choice:** On create + manual recompute → D-98

### Previous-period definition
| Option | Description | Selected |
|--------|-------------|----------|
| Latest finalized, same project+currency | Chain off most recent finalized period by end date; 0 if none; enforces sequential finalization. | (recommended) |
| Any most-recent prior period | Chain off most recent prior period regardless of status (incl. draft). | |
| You decide | Pick during planning. | ✓ |

**User's choice:** You decide → D-99 (Claude recommends latest-finalized chaining — correct yeşil-defter behavior)

---

## Period scope & edge cases

### Item inclusion
| Option | Description | Selected |
|--------|-------------|----------|
| All priced items (0-progress shown) | Full contract register; lines with 0 contribute 0. | (recommended, refined) |
| Only items with period progress | Only period_qty > 0; shorter table, not a full register. | |
| You decide | Pick during planning. | ✓ |

**User's choice:** You decide → D-102 (Claude recommends: all priced items with any cumulative work > 0 up to cutoff; period_qty may be 0)

### Unpriced BOQ items
| Option | Description | Selected |
|--------|-------------|----------|
| Exclude + warn | Left out (unit_price_snapshot NOT NULL); UI warns with the excluded list. | (recommended) |
| Block compute until priced | Refuse to compute if any in-scope item lacks a price. | |
| You decide | Pick during planning. | ✓ |

**User's choice:** You decide → D-103 (Claude recommends exclude + warn — avoids silent under-billing without a hard stop)

---

## Claude's Discretion
- D-94 avans model (flat rate × gross recommended; tracked balance deferred).
- D-99 previous-period rule (latest-finalized chaining recommended).
- D-102 item inclusion (all worked priced items recommended).
- D-103 unpriced-item handling (exclude + warn recommended).
- Stopaj default rate value; period_number/label format; list + detail-table layout; control
  placement; Postgres 2-decimal rounding mode; action-module location (`analytics.ts` vs new
  `hakedis.ts`).

## Deferred Ideas
- Tracked advance-balance recoupment (avans mahsubu) — v1 uses flat rate × gross.
- Fiyat farkı price-escalation auto-calc — already Out of Scope (manual override sufficient).
- Mixed-currency single certificate — prevented by one-period-per-currency.
- PDF certificate + Excel yeşil-defter export — Phase 11 (EXP-02/04).
- Reviewed-not-folded todos: `submission-detail-map-link.md` (Phase-8 follow-up),
  `tenant-settings-seed-fk-safe.md` (Phase-9 follow-up).
</content>
