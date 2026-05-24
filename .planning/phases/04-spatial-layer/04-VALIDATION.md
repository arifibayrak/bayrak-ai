---
phase: 4
slug: spatial-layer
status: draft
nyquist_compliant: false
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
| _TBD by planner_ | | | GEO-01 / GEO-02 | | | unit/integration | `npx vitest run tests/spatial.test.ts` | ❌ W0 | ⬜ pending |

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

**Approval:** pending
