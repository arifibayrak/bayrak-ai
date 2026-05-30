# Phase 15: Chainage As-Built View + Approval Snapshot - Discussion Log

> **Audit trail only.** Not consumed by downstream agents — decisions live in CONTEXT.md.

**Date:** 2026-05-30
**Phase:** 15-chainage-as-built-view-approval-snapshot
**Areas discussed:** Bucket granularity, Completion-% meaning, Strip presentation, In-progress definition

---

## Bucket granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Engineer-selectable (default 1 km) | Default 1 km, toggle 500 m / 100 m; getChainageBuckets takes bucketSizeM | ✓ |
| Fixed 1 km | Always 1 km | |
| Fixed 100 m | Always 100 m | |

**User's choice:** Engineer-selectable, default 1 km.

---

## Completion-% meaning

| Option | Description | Selected |
|--------|-------------|----------|
| Covered buckets ÷ total buckets | Bucket 'done' if ≥1 approved; completion = covered ÷ total, clamped 100% | ✓ |
| Approved chainage span ÷ length | min→max approved chainage as covered length | |
| BOQ value-weighted | weight by approved qty×price | |

**User's choice:** Covered buckets ÷ total buckets (honest with point data, granularity-consistent).

---

## Strip presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Table-first + thin colour bar | Row-per-bucket table + at-a-glance colour bar on top | ✓ |
| Visual horizontal strip bar | TILOS-style SVG/canvas bar | |
| Plain table only | No bar | |

**User's choice:** Table-first + thin colour bar (CSS, no charting lib).

---

## In-progress definition

| Option | Description | Selected |
|--------|-------------|----------|
| Pending but no approved | ≥1 approved → green; else ≥1 pending → amber; else grey | ✓ |
| Any pending (even with approved) | amber if any pending regardless of approved | |
| Approved but BOQ incomplete | status tied to contracted quantity | |

**User's choice:** Pending-but-no-approved (clean three-state).

## Claude's Discretion

- Granularity-toggle control type; colour-bar CSS implementation; calibration-offset input placement.

## Deferred Ideas

- Anchor-on-map calibration UX → v4.x.
- Chainage-aware AI flag → v5; time-chainage Gantt → v5.
- `tenant-settings-seed-fk-safe` todo reviewed but not folded (resolved in Phase 14).
