# Phase 2: Worker Bot - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 2-Worker Bot
**Areas discussed:** State engine & idempotency, Flow control & corrections, Input enforcement & reprompts, BOQ item selection UX

---

## State Engine & Idempotency

### Conversation state management
| Option | Description | Selected |
|--------|-------------|----------|
| Explicit DB-row FSM | conversation_state row per worker; current_step + partial submission JSON; no replay footgun | ✓ |
| @grammyjs/conversations + storage-psql | Stack default; replay semantics need conversation.external() everywhere | |
| You decide | Defer to researcher/planner | |

**User's choice:** Explicit DB-row FSM (→ D-12)
**Notes:** Flow is strictly linear (6 fixed steps); avoids the STATE.md replay landmine.

### Idempotency guarantee (SC4)
| Option | Description | Selected |
|--------|-------------|----------|
| Dedup on update_id + unique submission key | Belt-and-suspenders: pipeline-level + final-insert guard | ✓ |
| update_id dedup only | Pipeline-level guard | |
| Unique submission key only | Final-insert guard only | |

**User's choice:** update_id dedup + unique submission key (→ D-13)

### Resume behavior
| Option | Description | Selected |
|--------|-------------|----------|
| Reprompt the current step | Re-send current_step prompt in Turkish on resume | ✓ |
| Silently continue | Accept next input without re-announcing | |

**User's choice:** Reprompt current step (→ D-14)

### /start mid-flow
| Option | Description | Selected |
|--------|-------------|----------|
| Ask: continue or start over | Inline "Devam et / Baştan başla" | ✓ |
| Always resume in progress | /start = no-op reprompt | |
| Always restart fresh | /start wipes in-progress flow | |

**User's choice:** Ask continue or start over (→ D-15)

---

## Flow Control & Corrections

### Pre-confirm corrections
| Option | Description | Selected |
|--------|-------------|----------|
| Confirm screen with per-field edit | Summary + jump-back-to-redo any field | ✓ |
| Linear only — cancel & restart | No back-navigation | |
| Back one step only | "Geri" rewinds one step | |

**User's choice:** Confirm screen with per-field edit (→ D-16)

### Cancel mechanism
| Option | Description | Selected |
|--------|-------------|----------|
| /iptal command, always available | Clears state at any step | ✓ |
| Cancel button on every prompt | İptal button on each keyboard | |
| Both command and a cancel button | /iptal + İptal on confirm only | |

**User's choice:** /iptal command (→ D-17)

### After submit
| Option | Description | Selected |
|--------|-------------|----------|
| Offer "Yeni kayıt" button, don't auto-loop | Confirmation + explicit new-log button | ✓ |
| Auto-loop back to project selection | Immediately starts a new flow | |
| Just confirm, idle until next /start | Stop after "Gönderildi" | |

**User's choice:** "Yeni kayıt" button, no auto-loop (→ D-18)

---

## Input Enforcement & Reprompts

### Reprompt behavior on wrong input
| Option | Description | Selected |
|--------|-------------|----------|
| Reject + explain + how-to hint | Explicit Turkish hint each time; step doesn't advance | ✓ |
| Reject with short terse error | Minimal noise | |
| Reject, escalate help after N fails | Terse first, detailed after 2-3 fails | |

**User's choice:** Reject + how-to hint (→ D-19)

### Location validity
| Option | Description | Selected |
|--------|-------------|----------|
| Accept any native location, flag distance later | Reject only typed coords; geofence is Phase 4 | ✓ |
| Accept only fresh/live location | Reject forwarded/pinned | |

**User's choice:** Accept any native location (→ D-20)

### Notes step (optional)
| Option | Description | Selected |
|--------|-------------|----------|
| Type notes OR tap "Atla" | Explicit skip button; empty = null | ✓ |
| Type notes, or send "yok/-" to skip | No button; ambiguous | |

**User's choice:** Type or "Atla" (→ D-21)

### Stale flow expiry
| Option | Description | Selected |
|--------|-------------|----------|
| Expire after TTL (~24h), reprompt fresh | Timestamp check; stale state starts clean | ✓ |
| Never expire | Persist until finished or /iptal | |
| You decide | Planner picks lifecycle | |

**User's choice:** TTL expiry ~24h (→ D-22)

---

## BOQ Item Selection UX

### List presentation
| Option | Description | Selected |
|--------|-------------|----------|
| Paginated inline keyboard | ~6-8 per page with ‹ › nav; tap-only | ✓ |
| Flat inline keyboard | All items in one keyboard | |
| Type-to-search | Worker types material name | |

**User's choice:** Paginated inline keyboard (→ D-23); pattern reused for project list (LOG-02)

### Show remaining balance
| Option | Description | Selected |
|--------|-------------|----------|
| Yes — show remaining next to each | "320/500 m kaldı" from boq-balance | ✓ |
| No — just the material name | Cleaner buttons | |

**User's choice:** Show balance (→ D-24)

### Exhausted (0-balance) item
| Option | Description | Selected |
|--------|-------------|----------|
| Allow, show a soft warning | "Bu kalem tamamlandı. Yine de devam?" | ✓ |
| Allow silently | Reconciliation entirely Phase 3 | |
| Block / hide exhausted items | Strict; can block legit over-runs | |

**User's choice:** Allow with soft warning (→ D-25)

---

## Claude's Discretion

- Smaller items the user accepted as defaults (no deep-dive): respectful "siz" Turkish tone (→ D-26), single photo per submission, project list reusing the paginated keyboard pattern, quantity prompt showing the BOQ unit.
- Table/column names, indexes, Drizzle organization; exact TTL value; FSM internal step representation + jump-to-step mechanism; photo upload timing (on-receipt vs on-confirm); pagination page size; exact Turkish wording.

## Deferred Ideas

- Location geofencing → GEO-02, Phase 4.
- Multiple photos per submission → revisit post-v1.
- Type-to-search BOQ selection → rejected for v1 (field typing avoided).
- Escalating "Yardım" help after N input failures → v1 uses consistent hint.
- Quantity vs remaining-balance hard validation → Phase 3 (audit + atomic decrement).
