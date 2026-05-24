# Phase 5: Dashboard & Map - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 5-Dashboard & Map
**Areas discussed:** Dashboard IA / tab structure, Map interactivity & encoding, Submissions list presentation, Refresh/liveness model, Map viewport & framing, Empty/partial states, Mobile/responsive, i18n scope, BOQ color encoding & determinism, Color/visual accessibility, Photo thumbnail loading & preview

---

## Dashboard IA / tab structure

### Q1: How to fit map / BOQ progress / submissions into BOQ / Rota / Personel tabs?

| Option | Selected |
|--------|----------|
| Rota becomes the live map; + Kayıtlar tab; BOQ progress in BOQ tab | ✓ |
| Separate Harita tab; keep Rota for upload only | |
| Overview tab combining map + BOQ progress; + Kayıtlar | |

**User's choice:** Rota becomes the live map; + Kayıtlar tab; BOQ progress in BOQ tab → D-49.

### Q2: How should BOQ progress appear in the BOQ tab?

| Option | Selected |
|--------|----------|
| Inline columns + per-row bar | ✓ |
| Inline + project rollup header | |
| Separate progress card only | |

**User's choice:** Inline columns + per-row bar → D-50. (Rollup deferred.)

---

## Map interactivity & encoding

### Q1: What happens on marker click?

| Option | Selected |
|--------|----------|
| Rich popup (photo + details) | ✓ |
| Minimal popup + link to Kayıtlar | |
| No popup — markers visual-only | |

**User's choice:** Rich popup → D-51.

### Q2: Should far/anomaly approved points look distinct on the map?

| Option | Selected |
|--------|----------|
| Distinct style for far points | ✓ |
| Same style, flag in popup only | |
| Don't surface anomalies on the map | |

**User's choice:** Distinct style for far points (ring + distance in popup) → D-52.

---

## Submissions list presentation

### Q1: How should the submissions list be presented?

| Option | Selected |
|--------|----------|
| Table with thumbnail column | ✓ |
| Card grid | |
| Table, photo on row-expand | |

**User's choice:** Table with thumbnail column → D-53.

### Q2: Default status filter + volume handling?

| Option | Selected |
|--------|----------|
| Default 'all', newest first, paginated | ✓ |
| Default 'pending', paginated | |
| Default 'all', capped recent (no pagination) | |

**User's choice:** Default 'all', newest first, paginated → D-54.

---

## Refresh / liveness model

### Q1: How to reflect new approved work without real-time infra?

| Option | Selected |
|--------|----------|
| Dynamic RSC + refresh-on-focus | ✓ |
| Dynamic RSC only (fresh on load/nav) | |
| Timed revalidate interval | |

**User's choice:** Dynamic RSC + router.refresh() on focus → D-55.

---

## Map viewport & framing

### Q1: How should the map frame itself on load?

| Option | Selected |
|--------|----------|
| Auto-fit to route bounds | ✓ |
| Fit to route + points combined | |
| Fixed default center/zoom | |

**User's choice:** Auto-fit to route bounds; no-route → empty state → D-56.

---

## Empty / partial states

### Q1: How should surfaces behave before data exists?

| Option | Selected |
|--------|----------|
| Graceful empties with guidance | ✓ |
| Minimal empties | |
| Defer empty-state polish | |

**User's choice:** Graceful empties with guidance (TR via next-intl) → D-57.

---

## Mobile / responsive

### Q1: What responsive target for the office dashboard?

| Option | Selected |
|--------|----------|
| Desktop-first, usable on tablet | ✓ (later revised) |
| Fully responsive / mobile-first | |
| Desktop-only | |

**User's choice:** Initially "desktop-first, usable on tablet", **then revised via free-text** during the next round to "desktop-first but not only tablet — also mobile responsive." Final decision D-60: desktop-first but genuinely mobile-responsive (real mobile layouts, desktop still primary).

---

## i18n scope for new surfaces

### Q1: How much of the new UI must be TR/EN?

| Option | Selected |
|--------|----------|
| Full next-intl coverage | ✓ |
| Static labels only | |
| Turkish-first, EN later | |

**User's choice:** Full next-intl coverage → D-63.

---

## BOQ color encoding & determinism

### Q1: How to assign colors to BOQ items?

| Option | Selected |
|--------|----------|
| Curated palette by stable order + legend | ✓ |
| Hash item id → color | |
| Curated palette, cap + 'other' bucket | |

**User's choice:** Curated color-blind-safe palette by stable order + legend; overflow cycles with secondary cue → D-58.

---

## Color / visual accessibility

### Q1: How far should map/visual accessibility go in v1?

| Option | Selected |
|--------|----------|
| Practical a11y | ✓ |
| Full WCAG 2.1 AA | |
| Minimal | |

**User's choice:** Practical a11y (legend + labels, anomaly-by-shape, contrast, Mapbox built-in keyboard; data also in accessible table) → D-59.

---

## Photo thumbnail loading & preview

### Q1: How should photos load + open?

| Option | Selected |
|--------|----------|
| next/image lazy + Dialog lightbox | ✓ |
| next/image lazy + open in new tab | |
| Plain <img loading=lazy> + new tab | |

**User's choice:** next/image lazy + shadcn Dialog lightbox (+ Blob host in next.config remotePatterns) → D-61.

---

## Claude's Discretion

- Exact BOQ color palette hex (color-blind-safe), route line styling, marker size, popup layout.
- Pagination page-size + mechanism.
- ST_AsGeoJSON / wkx read-back + FeatureCollection shape; react-map-gl Source/Layer vs Markers.
- next-intl message-key organization.

## Deferred Ideas

- Export/print of BOQ progress (PDF/report) — adjacent to hakkediş, v2 (raised by user, redirected).
- Real-time / WebSocket live map updates — explicitly out of scope.
- Project-level BOQ progress rollup card — v1 is per-line-item inline only.
- Full WCAG 2.1 AA audit of map surfaces — later pass.
