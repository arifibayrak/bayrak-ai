---
phase: 16
slug: ai-vision-assist
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-31
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | {path or "none — Wave 0 confirms"} |
| **Quick run command** | `pnpm vitest run tests/ai-vision.test.ts` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~{N} seconds (eval test hits live vision API — may be longer) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run tests/ai-vision.test.ts`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green; eval precision ≥ 0.80 on the "anomaly" class
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

> Populated by the planner — one row per task. The eval-gate (SC1), log-ordering (SC2),
> grep-no-coupling (SC5), and cron (SC6) verifications are the critical Nyquist samples.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | AI-05 | T-16-01 / — | Eval gate is the single switch; no flag UI before precision ≥ 0.80 | unit | `pnpm vitest run tests/ai-vision.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `pnpm add ai @ai-sdk/gateway sharp-phash sharp` — AI SDK v6 + gateway + pHash not yet installed (RESEARCH finding #2)
- [ ] Smoke-test Zod v4 + `Output.object` compatibility (RESEARCH open question — LOW confidence)
- [ ] `tests/ai-vision.test.ts` — eval harness stub for AI-05 (precision ≥ 0.80 gate)
- [ ] Labeled fixture dataset of real approved-submission photos (weak label = declared work type; ~30–50 office-confirmed ground truth)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AiFlagCard renders Turkish anomaly description + traffic-light confidence badge + material suggestion when eval_passed=true; absent otherwise | AI-01, AI-02 | Visual/UI rendering with live flag data | Open submission detail page for a submission with an eval_passed flag; confirm card content and absence on a clean submission |
| Webhook response sent before AI analysis log line (off critical path) | AI-04 | Requires reading Vercel function logs after a live Telegram approval | Approve a submission via Telegram; inspect Vercel logs for response-before-analysis ordering (SC2) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
