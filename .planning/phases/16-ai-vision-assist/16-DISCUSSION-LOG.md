# Phase 16: AI Vision Assist - Discussion Log

> Audit trail only. Decisions live in CONTEXT.md.

**Date:** 2026-05-31
**Phase:** 16-ai-vision-assist
**Areas discussed:** What to flag, Eval dataset & labels, Confidence display, Model & cost/sampling

---

## What to flag
Selected (multi): Photo ≠ claimed work · Photo quality · Location 2nd opinion · Notes → material suggestion. (+ duplicate-photo AI-06 locked by research.)

## Eval dataset & labels
Selected: Existing approved-submission photos, worker-declared work type as weak label, OE confirms a ~30–50 sample. (Not hand-curated gold set; not synthetic.)

## Confidence display
Selected: Show ALL eval-passed flags + confidence badge (traffic-light by score). (Not a per-flag hide-threshold; not high-confidence-only.)

## Model & cost/sampling
Selected: Latest Claude vision via AI Gateway, run on every approved submission (low field-approval volume → full coverage affordable). (Not cheaper-model; not subset/sampling.)

## Claude's Discretion
Zod schema shape; pHash algorithm; confidence cutoffs; cron interval; prompt wording.

## Deferred
Chainage-aware AI flag → v5; real-time AI in critical path → anti-feature; BOQ auto-extraction → out of scope (ADR-0002).
