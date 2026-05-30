# Phase 14: Schema Foundation + DXF Route Import - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-30
**Phase:** 14-schema-foundation-dxf-route-import
**Areas discussed:** CRS presets & default, Centerline layer picking, Re-import behavior, Source document viewing

---

## CRS presets & default

| Option | Description | Selected |
|--------|-------------|----------|
| TUREF/TM30 default + remember last | Default to EPSG:5254, all 7 presets, remember last-used per project; preview still mandatory | ✓ |
| Show all 7, no default | Nothing pre-selected; force deliberate choice each import | |
| TUREF/TM30 default, no memory | Default each time, no per-project memory | |

**User's choice:** TUREF/TM30 default + remember last-used per project.
**Notes:** Reflects the modern Trakya/Turkey standard; satellite preview remains the safety net so a remembered default is acceptable.

---

## Centerline layer picking

| Option | Description | Selected |
|--------|-------------|----------|
| Suggest + stitch | List layers w/ vertex counts, auto-highlight AXIS/CL/CENTERLINE/MERKEZ, confirm; stitch multiple polylines end-to-end + warn on gaps | ✓ |
| List only, take longest | No name suggestion; take single longest polyline | |
| List only, require single polyline | Reject layers with >1 polyline, ask to clean DXF | |

**User's choice:** Suggest + stitch.
**Notes:** LWPOLYLINE/POLYLINE only; SPLINE → non-blocking warning; reject if <2 vertices after filtering.

---

## Re-import behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Warn-proceed + keep history | Warn (N approved keep chainage), versioned geometry, keep ALL prior source drawings | ✓ |
| Warn-proceed + latest only | Same but store only latest source drawing | |
| Block when approvals exist | Refuse re-import unless explicit override | |

**User's choice:** Warn-and-proceed + keep all prior source drawings as version history.
**Notes:** Aligns with the immutable as-built record philosophy; provides an audit trail of source documents.

---

## Source document viewing

| Option | Description | Selected |
|--------|-------------|----------|
| Inline PDF + DXF download, both allowed | Inline react-pdf viewer for PDFs, DXF as download link; project can hold both a DXF and a PDF | ✓ |
| Download links only | Both as Kaynak Belge download links, no inline viewer | |
| DXF only for now | Defer PDF reference docs | |

**User's choice:** Inline PDF viewer + DXF download link; a project can hold both a DXF (geometry) and a PDF (reference) document.
**Notes:** Turkish label "Kaynak Belge"; CRS + layer shown in the route metadata card.

---

## Claude's Discretion

- Preview affordances beyond the route line (start/end markers, total-length-km readout, bounding-box sanity line) — recommended but optional.
- Migration packaging (single 0010 vs split), column types/precision, GIST index placement, `total_length_m` recompute on the existing `uploadRoute` path.

## Deferred Ideas

- Chainage calibration "anchor on map" UX → v4.x (Phase 15 ships a numeric offset only).
- SPLINE entity tessellation → v4.x.
- Full in-browser DXF viewer → anti-feature, not built.
- `submission-detail-map-link` todo → routed to Phase 15 (reviewed, not folded into Phase 14).
