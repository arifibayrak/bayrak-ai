---
status: partial
phase: 04-spatial-layer
source: [04-VERIFICATION.md]
started: 2026-05-24
updated: 2026-05-24
---

## Current Test

[awaiting human testing — deferred by user during execute-phase checkpoint]

## Tests

### 1. Far-anomaly caption renders in a live auditor Telegram notification (GEO-02 SC2)
expected: A worker submission whose shared location is >500 m from the project route produces an auditor Telegram notification whose caption includes a line like `⚠ Konum rotadan uzak (~X.X km)` with a sensible distance, AND the existing `📍 https://maps.google.com/?q=<lat>,<lon>` link is still present, with BOQ item / quantity / notes lines unchanged.
result: [pending]

### 2. No-route neutral note renders for a route-less project (GEO-02 / D-43)
expected: A submission on a project with no uploaded route produces an auditor caption containing the neutral line `ℹ Rota yüklenmemiş — konum doğrulanamadı` (not an alarm), and the submission still arrives as `pending_audit`.
result: [pending]

### 3. Near-case silence (GEO-01 / D-47)
expected: A submission within 500 m of the route produces NO location-anomaly line in the auditor caption (caption stays silent on location); the stored row has `location_match = 'near'` with a non-null `snapped_point` and `segment_fraction` in [0.0, 1.0].
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

None — all automated coverage is green (146 tests pass against live Neon, incl. GEO-01/GEO-02/D-48 and 9 pure caption-decision unit tests). These three items are the single planned manual-only checkpoint (live Telegram over-the-wire delivery), deferred to a manual smoke-test by user decision during execute-phase. Run `/gsd:verify-work 4` after a live bot session to close them.
