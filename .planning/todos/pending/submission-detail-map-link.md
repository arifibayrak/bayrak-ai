---
title: Add map/location link to canonical submission detail page
status: pending
priority: low
created: 2026-05-26
origin_phase: "08"
area: dashboard/records
---

# Add map / Google Maps link to submission detail page

## Context

D-71 (Phase 8) specified the canonical submission detail page (`/dashboard/records/[id]`)
should show **location (snapped point / Google Maps link)**. During Phase 8 execution
(plan 08-06), the `CanonicalSubmission` type returned by `getCanonicalSubmissions` was
found to carry **no raw lat/lon coordinates** — only a location-compliance distance and a
`locationMatch` flag. As a result, `SubmissionDetailView` renders the distance + a
location-warning badge, but **no Google Maps link**.

This was approved as a known deviation at the 08-06 render checkpoint, logged here as a
follow-up rather than blocking phase completion.

## What's needed

1. Extend `getCanonicalSubmissions` (and the `CanonicalSubmission` type) in
   `src/actions/analytics.ts` to include the submission's raw coordinates (snapped point
   lat/lon — the geometry is already in the DB; PostGIS `ST_X`/`ST_Y` or GeoJSON export).
2. In `src/components/admin/SubmissionDetailView.tsx`, render a Google Maps link
   (`https://www.google.com/maps?q=<lat>,<lon>`) and/or a small map embed alongside the
   existing distance + warning badge.

## Notes

- Keep the existing distance/warning UI — this is additive.
- Tenant-scoping and auth guards already exist on `getCanonicalSubmissions`; no new gate needed.
- Candidate to fold into a future analytics/UX polish phase.
