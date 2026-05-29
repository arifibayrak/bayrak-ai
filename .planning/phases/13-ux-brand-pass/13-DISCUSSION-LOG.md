# Phase 13: UX & Brand Pass — Discussion Log

**Discussed:** 2026-05-29
**For human reference only — not consumed by downstream agents (researcher / planner / executor read CONTEXT.md instead).**

## Origin

User raised the UX-brand concern after Phase 11 closed: *"all app looks very bad, I dont like the UI - UX it is very un-professional, check the bayrak.ai logos / structure don't make it this way, focus on the styles later."* Logged in user memory as `ui-quality-concern-2026-05`. Surfaced as v3.0 candidate scope alongside Phase 12 (submission-driven hakkediş). v3.0 milestone opened on 2026-05-28 with Phase 13 as the UX/brand pass; Phase 12 finished and verified on 2026-05-29, leaving Phase 13 as the remaining v3.0 work.

When `/gsd-discuss-phase 13` was invoked, the user picked "It exists — here's where" for the brand reference question, but did not paste a path/URL in a follow-up. Discussion proceeded with the understanding that CONTEXT.md itself becomes the de facto brand reference until a Figma/Pencil/brand-kit file is checked into the repo (which would satisfy BRAND-01 differently).

## Gray areas presented

8 brand-decision categories surfaced from analysis. User selected **all 8** for discussion.

## Q1 — Color palette + semantic roles + dark mode

**Q1a Options presented:**
- (a) Slate + amber *(Recommended)*
- (b) Turkish flag direct (red primary)
- (c) Modern neutral — deep navy + single accent (Vercel-like)
- (d) Dark + high-vis orange (construction trope)

**User picked:** (a) Slate + amber.

**Q1b — Dark mode:**
- (a) Defer to v3.1+ *(Recommended)*
- (b) Light + dark both

**User picked:** (a) Defer.

**Recorded as:** D-121 in CONTEXT.md.

## Q2 — Typography

**Options presented:**
- (a) Geist Sans + Geist Mono *(Recommended)*
- (b) Inter + JetBrains Mono
- (c) IBM Plex Sans + IBM Plex Mono
- (d) System fonts (system-ui)

**User picked:** (a) Geist Sans + Geist Mono.

**Recorded as:** D-122.

## Q3 — Voice & tone

**Options presented:**
- (a) Direct + formal — siz address, action-first CTAs *(Recommended)*
- (b) Formal business descriptive
- (c) Casual / sen informality

**User picked:** (a) Direct + formal.

**Recorded as:** D-123.

## Q4 — Logo + visual marks

**Options presented:**
- (a) Wordmark only — bayrak slate + .ai amber *(Recommended)*
- (b) Wordmark + abstract mark
- (c) Wordmark + flag-literal mark
- (d) I have a logo file — will paste it next message

**User picked:** (a) Wordmark only. (No external file pasted in follow-up turns.)

**Recorded as:** D-124. Logo file ingestion can amend D-124 in a future revision if the user provides one.

## Q5 — Layout primitives

**Q5a Border-radius:**
- (a) Soft — Tailwind default *(Recommended)*
- (b) Sharp
- (c) Pill-friendly

**Q5b Spacing density:**
- (a) Compact — p-2/p-3 + gap-2 *(Recommended)*
- (b) Roomy — p-4/p-6 + gap-4

**Q5c Shadow / depth:**
- (a) Flat — borders only *(Recommended)*
- (b) Soft — shadow-sm
- (c) Lifted — shadow-md/lg

**User picked:** Soft radius + Compact density + Flat depth. All three recommended options.

**Recorded as:** D-125.

## Q6 — Icon system

**Options presented:**
- (a) Keep lucide-react *(Recommended)*
- (b) Swap to Phosphor
- (c) Swap to Heroicons / Tabler
- (d) Lucide + custom industry icons

**User picked:** (a) Keep lucide-react.

**Recorded as:** D-126. Custom industry icons deferred to v3.1+ per CONTEXT.md deferred-ideas section.

## Q7 — Sequencing

**Options presented:**
- (a) Anchored incremental — spine → hakkediş → analytics → rest *(Recommended)*
- (b) All-in-one
- (c) Hakkediş-first only
- (d) Hakkediş-first + opportunistic

**User picked:** (a) Anchored incremental.

**Recorded as:** D-127. 4 waves defined inline.

## Q8 — Visual reference analogs

**Options presented:**
- (a) Linear + Vercel dashboard + Stripe *(Recommended)*
- (b) Linear + Notion
- (c) Procore + Autodesk Construction Cloud
- (d) None — planner picks

**User picked:** (c) Procore + Autodesk Construction Cloud.

**Significance:** the user departed from my recommendation. The combined palette + density + depth + Procore/Autodesk anchor creates a coherent direction: industry-utility density executed with amber instead of blue. Amber is the explicit market differentiator against construction-software-blue norm.

**Recorded as:** D-128.

## Scope creep redirected

None during this discussion. The user did not surface new functional requirements during the 8-question pass. All decisions stayed inside the phase boundary (re-skinning, not new features).

## Notes for the planner

- This CONTEXT.md is the canonical bayrak.ai brand reference for v3.0. BRAND-01 is satisfied by this file's existence + commit, until/unless a separate brand kit is checked in.
- D-128 (Procore + Autodesk) departs from my recommendation. Take the cited references seriously — the user wants industry-correct read.
- The amber accent is THE single most identity-bearing decision. Every Wave 1 component primitive should expose amber as its interactive-state color so downstream waves get the brand "for free."
- Phase 12's LivePeriodPoller null-on-disabled contract and LineSubmissionsPanel as 8th column on draft period detail page are LOCKED — brand pass restyles visible affordances only.
- No dark mode in Phase 13. Defer.
- No custom industry icons in Phase 13. Defer.
- DejaVu Sans stays in PDF generator. Defer any PDF visual refresh to a separate phase.
