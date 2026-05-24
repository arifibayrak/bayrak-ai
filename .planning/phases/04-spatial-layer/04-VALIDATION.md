---
phase: 4
slug: spatial-layer
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-24
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (existing; `fileParallelism: false` for live-DB tests) |
| **Quick run command** | `npx vitest run tests/spatial.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30–60 seconds (live-DB tests gated by `describeIfDb`) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/spatial.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Populated during planning (gsd-planner) — one row per task. GEO-01/GEO-02 must each be covered.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-T1 (schema cols + GiST) | 04-01 | 1 | GEO-01, GEO-02 | T-04-01 | location_match enum schema-guards three-state integrity | type-check | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 04-01-T2 (seedSpatialFixture) | 04-01 | 1 | GEO-01, GEO-02 | — | parameterized ST_GeomFromGeoJSON seed | type-check | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 04-01-T3 (test scaffold + D-48) | 04-01 | 1 | GEO-01, GEO-02 (D-48) | T-04-01 | coordinate-order guard (lng-first) | integration (DB) | `npx vitest run tests/spatial.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-T1 (generate + hand-verify) | 04-02 | 2 | GEO-01, GEO-02 | T-04-01, T-04-03 | location_match CHECK constraint present | grep gate | `grep -Eq 'location_match.*CHECK' <migration>` | ❌ W0 | ⬜ pending |
| 04-02-T2 [BLOCKING] live push | 04-02 | 2 | GEO-01, GEO-02 | T-04-01 | live columns + CHECK + GiST exist (no false-positive) | live DB query | information_schema check (node script) | ❌ W0 | ⬜ pending |
| 04-03-T1 (spatial.ts snapToRoute) | 04-03 | 3 | GEO-01, GEO-02 | T-04-04, T-04-05, T-04-06, T-04-07 | parameterized lon/lat bindings; ::geography; best-effort never drops warning | type-check + grep | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 04-03-T2 (wire into handleConfirmSubmit) | 04-03 | 3 | GEO-01, GEO-02 | T-04-06 | in-tx snap (D-41), submission never lost (D-42) | type-check | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 04-03-T3 (GEO-01/GEO-02 integration tests) | 04-03 | 3 | GEO-01, GEO-02 | T-04-05, T-04-06 | near/far/no_route classification + best-effort persistence | integration (DB) | `npx vitest run tests/spatial.test.ts` | ❌ W0 | ⬜ pending |
| 04-04-T1 (D-47 caption line) | 04-04 | 4 | GEO-02 | T-04-06 | far/no_route surfaced; warning never silently dropped | type-check + grep | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 04-04-T2 (D-47 caption unit tests) | 04-04 | 4 | GEO-02 (D-47) | T-04-06 | three-state caption decision asserted (no-DB unit) | unit | `npx vitest run tests/spatial.test.ts` | ❌ W0 | ⬜ pending |
| 04-04-T3 (human-verify live notification) | 04-04 | 4 | GEO-02 | T-04-06, T-04-08 | live auditor anomaly line render | manual (checkpoint) | manual Telegram E2E | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/spatial.test.ts` — stubs for GEO-01 (snap within threshold → segment_fraction + snapped_point) and GEO-02 (beyond threshold → location_warning + auditor flag; no_route state)
- [ ] Reuse existing `describeIfDb` live-DB harness + fixtures (per `tests/postgis.test.ts`)
- [ ] D-48 coordinate-order roundtrip for `snapped_point` (lng 28.9, lat 41.0 reads back lng-first)

*Existing infrastructure (vitest + describeIfDb + Neon test DB) covers the framework; only new test files are needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Auditor sees the distance-anomaly line in a real Telegram notification | GEO-02 | End-to-end Telegram delivery is out of unit-test scope | Submit a far-from-route location via the bot; confirm the auditor message shows `⚠ Konum rotadan uzak (~X km)` |

*Caption-string construction itself is automated; only live Telegram delivery is manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** planned — every task has an automated <verify> or is a Wave 0 dependency; GEO-01 and GEO-02 both covered by `npx vitest run tests/spatial.test.ts`; one manual-only checkpoint (live Telegram delivery).
