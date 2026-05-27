---
phase: 10
slug: hakkedi-billing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from the `## Validation Architecture` section of `10-RESEARCH.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing — see `vitest.config.ts`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run <file>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~{N} seconds (populate from existing suite) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <relevant file>`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

> Populated by the planner from the RESEARCH.md Validation Architecture. Critical truths to cover:
> - GENERATED-column identity: `period_qty = cumulative_qty_approved − previous_cumulative_qty` (DB-enforced)
> - Deduction math correctness in Postgres `numeric` (gross → KDV → tevkifat → stopaj → teminat → avans → net)
> - Finalization immutability lock (recompute/edit on a non-draft period errors)
> - Draft-only recompute + delete guards
> - Cumulative chaining off the latest *finalized* period (D-99)

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | HAK-{XX} | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test scaffold for the deduction-chain SQL + `computePeriodLines()` (HAK-02/HAK-03)
- [ ] Update `schema.test.ts` Money-Math Test 5 for the GENERATED `period_qty` column (no INSERT of `period_qty`)
- [ ] Shared fixtures: a project with priced BOQ items + approved submissions across two cutoff dates

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Period list / detail / create rendering + TR-EN locale | HAK-01/HAK-03 | Browser-rendered UI | Create a draft period, open detail, verify the SC3 summary chain renders to 2 decimals in both locales |
| Finalize confirmation + immutability in the UI | HAK-05 | Browser interaction | Finalize a period; confirm recompute/edit controls disappear and the immutability banner shows |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
</content>
