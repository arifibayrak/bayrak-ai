---
phase: 16
slug: ai-vision-assist
status: draft
nyquist_compliant: true
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
| **Package manager** | npm (lockfile: package-lock.json — NOT pnpm) |
| **Config file** | vitest.config.ts (Wave 0 confirms exact path) |
| **Quick run command** | `npx vitest run tests/ai-vision.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds for the quick run; the AI_EVAL_ENABLED precision block hits the live vision API (120s timeout) and is excluded from the default run |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/ai-vision.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green; eval precision ≥ 0.80 on the "anomaly" class (AI_EVAL_ENABLED=true, Plan 04 Task 2)
- **Max feedback latency:** ~30 seconds (quick run); ~2 minutes once the gated eval block is included

---

## Per-Task Verification Map

> One row per auto-type task across all 5 plans. `checkpoint:human-*` tasks are listed as
> manual / N/A (verified by the human at the gate). The eval-gate (SC1/AI-05), log-ordering (SC2/AI-04),
> grep-no-coupling (SC5), and cron (SC6) verifications are the critical Nyquist samples.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | AI-06 | T-16-01 | phash_hex column added to schema + migration 0014; typecheck clean | grep + typecheck | `grep -q "phashHex" src/db/schema/ai-flags.ts && grep -q "phash_hex" src/db/migrations/0014_v4_ai_flags_phash.sql && grep -q "0014_v4_ai_flags_phash" src/db/migrations/meta/_journal.json && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | AI-06 | T-16-01 | Migration 0014 applied to BOTH Neon branches (blocking gate) | manual | N/A — `checkpoint:human-action` (verify `npm run migrate` + `npm run migrate:test` print "Migrations complete") | n/a | ⬜ manual |
| 16-01-03 | 01 | 1 | AI-06 | T-16-SC / T-16-02 | sharp declared as direct dep; env vars documented; AI SDK v6 + Zod v4 Output.object smoke passes | node + grep + vitest | `node -e "const p=require('./package.json'); if(!p.dependencies.sharp)process.exit(1); for(const d of ['ai','@ai-sdk/gateway','sharp-phash']) if(!p.dependencies[d])process.exit(1)" && grep -q "AI_GATEWAY_API_KEY" .env.example && grep -q "CRON_SECRET" .env.example && npx vitest run tests/ai-sdk-smoke.test.ts` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 2 | AI-06 | T-16-TS | ai-vision signature stub + pHash math tests pass + duplicate-reuse RED (clean assertion failure, not import error) | vitest (tdd red) | `test -f src/lib/ai-vision.ts && grep -q "describeIfAiEval" tests/ai-vision.test.ts && npx vitest run tests/ai-vision.test.ts -t "near-duplicate"` | ❌ W0 | ⬜ pending |
| 16-02-02 | 02 | 2 | AI-01, AI-02, AI-06 | T-16-PI / T-16-P5 / T-16-TS | runAiAnalysis: Output.object (not generateObject), tenant-scoped pHash lookup, no auth import; duplicate test GREEN | grep + vitest + typecheck | `grep -q "Output.object" src/lib/ai-vision.ts && ! grep -q "generateObject" src/lib/ai-vision.ts && grep -q "getDefaultTenantId" src/lib/ai-vision.ts && ! grep -E "from '@/lib/auth'\|logOfficeActivity\|from 'next/server'" src/lib/ai-vision.ts && npx vitest run tests/ai-vision.test.ts -t "duplicate" && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 16-02-03 | 02 | 2 | AI-01, AI-02 | T-16-P5 / T-16-NT | enqueueAiFlag fires runAiAnalysis detached (.catch, not awaited); onConflictDoNothing; no auth import | grep + typecheck | `grep -qE "runAiAnalysis\(.*\)\.catch" src/lib/ai-flag-queue.ts && grep -q "onConflictDoNothing" src/lib/ai-flag-queue.ts && ! grep -E "logOfficeActivity\|from '@/lib/auth'\|from 'next/server'\|await runAiAnalysis" src/lib/ai-flag-queue.ts && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 16-03-01 | 03 | 3 | AI-04 | T-16-CP / T-16-P5 | handleAuditDecision returns photoUrl + fires enqueueAiFlag detached post-commit; logOfficeActivity count stays 0 (SC2) | grep + typecheck | `grep -qE "enqueueAiFlag\(.*\)\.catch" src/lib/bot-audit.ts && grep -q "photoUrl: sub2.photoUrl" src/lib/bot-audit.ts && [ "$(grep -c 'logOfficeActivity' src/lib/bot-audit.ts)" = "0" ] && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 16-03-02 | 03 | 3 | AI-04 | T-16-CR | /api/cron/ai-flags rejects missing/wrong CRON_SECRET bearer (SC6); nodejs runtime; 5-min stale filter | grep + typecheck | `grep -q "Bearer \${process.env.CRON_SECRET}" src/app/api/cron/ai-flags/route.ts && grep -q "runtime = 'nodejs'" src/app/api/cron/ai-flags/route.ts && grep -q "interval '5 minutes'" src/app/api/cron/ai-flags/route.ts && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 16-03-03 | 03 | 3 | AI-04 | T-16-CR | vercel.json registers crons entry for /api/cron/ai-flags; functions block intact (SC6) | node json-parse | `node -e "const v=require('./vercel.json'); if(!Array.isArray(v.crons)\|\|!v.crons.some(c=>c.path==='/api/cron/ai-flags'))process.exit(1); if(!v.functions)process.exit(1);"` | ❌ W0 | ⬜ pending |
| 16-04-01 | 04 | 3 | AI-05 | T-16-FX | 30–50 engineer-confirmed labeled fixtures; mix of anomaly/normal; no binary images | manual | N/A — `checkpoint:human-action` (engineer confirms ground truth; auto-checked by fixtures.length / groundTruth node guard at the gate) | n/a | ⬜ manual |
| 16-04-02 | 04 | 3 | AI-05 | T-16-EG | precision ≥ 0.80 on real labeled data; eval_passed gate opener SQL applied (SC1) | manual (gated eval) | N/A — `checkpoint:human-verify`; run `AI_EVAL_ENABLED=true AI_GATEWAY_API_KEY=<key> npx vitest run tests/ai-vision.test.ts -t "precision"` then apply scripts/set-eval-passed.sql | n/a | ⬜ manual |
| 16-04-03 | 04 | 3 | AI-03 | T-16-AD | static advisory-only invariant: no submissionAiFlags-reading file writes submissions.status (SC5) | vitest static + grep | `npx vitest run tests/ai-flags-advisory.test.ts && grep -rl "submission_ai_flags\|submissionAiFlags" src --include="*.ts" --include="*.tsx" \| xargs grep -l "submissions.status\|status: 'approved'" 2>/dev/null; test $? -ne 0 && echo "SC5 grep clean"` | ❌ W0 | ⬜ pending |
| 16-05-01 | 05 | 4 | AI-03 | T-16-UG / T-16-AD2 | getSubmissionAiFlag gated on evalPassed=true (SC1); AiFlagCard zero-DOM absent + no approve/reject (AI-03); 7 i18n keys TR+EN | grep + node + typecheck | `grep -qE "evalPassed.*true\|eval_passed = true" src/actions/ai-flags.ts && grep -q "if (!flag) return null" src/components/brand/AiFlagCard.tsx && ! grep -qiE "approve\|reject\|onClick" src/components/brand/AiFlagCard.tsx && node -e "const tr=require('./messages/tr.json'),en=require('./messages/en.json'); const k=['card_heading','advisory_badge','suggested_classification_label','confidence_high','confidence_medium','confidence_low','strip_indicator_tooltip']; for(const x of k){if(!tr.dashboard.admin.ai_flags[x]\|\|!en.dashboard.admin.ai_flags[x])process.exit(1)}" && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 16-05-02 | 05 | 4 | AI-03 | T-16-UG | AiFlagCard mounted (inert slot removed); page RSC calls getSubmissionAiFlag; amber dot wired to eval_passed-gated bucket data | grep (null-guarded) + typecheck | `grep -q "AiFlagCard" src/components/admin/SubmissionDetailView.tsx && ! grep -q "ai_slot_body" src/components/admin/SubmissionDetailView.tsx && grep -q "hasAiFlag" src/lib/chainage-data.ts && grep -q "bg-amber-500" src/components/dashboard/ChainageTable.tsx && DETAIL_PAGE=$(grep -rl 'SubmissionDetailView' src/app --include='*.tsx' \| head -1) && [ -n "$DETAIL_PAGE" ] && grep -q 'getSubmissionAiFlag' "$DETAIL_PAGE" && npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 16-05-03 | 05 | 4 | AI-03 | T-16-AD2 / T-16-ID | visual + bilingual UAT: card renders for eval_passed flag, zero-DOM absent, amber dot + tooltip, TR/EN copy | manual | N/A — `checkpoint:human-verify` (visual UI rendering in both locales) | n/a | ⬜ manual |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ⬜ manual = verified by human at the gate*

---

## Wave 0 Requirements

- [ ] Declare `sharp` as a direct dependency via `npm install sharp` — currently only a transitive peer of `sharp-phash`; a clean `npm ci` / Vercel build must resolve it (Plan 01 Task 3). NOTE: `ai`, `@ai-sdk/gateway`, `sharp-phash` are ALREADY in package.json + package-lock.json (RESEARCH's "not installed" note is stale).
- [ ] Smoke-test Zod v4 + `Output.object` compatibility — `tests/ai-sdk-smoke.test.ts` (Plan 01 Task 3, RESEARCH Open Question 4 — LOW confidence)
- [ ] `tests/ai-vision.test.ts` — eval harness stub + signature stub `src/lib/ai-vision.ts` so the AI-05 precision gate test exists and the duplicate test gives a clean RED (Plan 02 Task 1)
- [ ] `tests/fixtures/ai-vision/fixtures.json` — empty-array placeholder created Plan 02 Task 1; populated with ~30–50 office-confirmed labeled photos in Plan 04 Task 1
- [ ] Migration 0014 applied to dev + test Neon branches (`npm run migrate`, `npm run migrate:test`) — Plan 01 Task 2 blocking checkpoint

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration 0014 (phash_hex + partial index) applied to BOTH Neon branches | AI-06 | DDL push to live DBs; build/typecheck pass without the live column | Run `npm run migrate` and `npm run migrate:test`; confirm both print "Migrations complete" with no permission / column-exists error (16-01-02) |
| 30–50 real-photo fixtures labeled with engineer-confirmed ground truth | AI-05 | The office engineer IS the ground truth (D-02); requires human judgment per photo | Open each photoUrl, confirm/correct the `anomaly`/`normal` label; ensure a mix incl. ≥1 anomaly (16-04-01) |
| Eval precision ≥ 0.80 on the anomaly class; eval_passed gate opened | AI-05 / SC1 | Live vision API run (token cost) + human confirms precision is real (not degenerate 1.0) | `AI_EVAL_ENABLED=true AI_GATEWAY_API_KEY=<key> npx vitest run tests/ai-vision.test.ts -t "precision"`, then apply scripts/set-eval-passed.sql (16-04-02) |
| Webhook response sent before AI analysis log line (off critical path) | AI-04 / SC2 | Requires reading Vercel function logs after a live Telegram approval | Approve a submission via Telegram; inspect Vercel logs for response-before-analysis ordering (16-03-01 runtime confirmation) |
| AiFlagCard renders Turkish anomaly description + traffic-light confidence badge + material suggestion when eval_passed=true; absent otherwise; amber strip dot + TR/EN copy | AI-01, AI-02, AI-03 | Visual/UI rendering with live flag data in both locales | Open a submission detail page with an eval_passed flag; confirm card content, zero-DOM absent state, amber chainage dot, and EN locale copy (16-05-03) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or are manual checkpoints / Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive auto-tasks without automated verify (every auto-task above has an automated command)
- [ ] Wave 0 covers all MISSING references (sharp install, smoke test, ai-vision stub, fixtures placeholder, migration 0014)
- [ ] No watch-mode flags (all commands use `vitest run`)
- [ ] Feedback latency < ~30s (quick run)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — Wave 0 not yet executed (`wave_0_complete: false`)
