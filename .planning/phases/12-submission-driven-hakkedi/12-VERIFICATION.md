---
phase: 12-submission-driven-hakkedi
verified: 2026-05-28T22:55:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 12: Submission-Driven Hakkediş Verification Report

**Phase Goal:** Each approved Telegram work-application submission contributes immediately to the in-progress hakkediş period — the office sees billing artefacts grow with each approval, and every hakkediş line-item quantity is traceable back to the source submission(s) — without breaking the v2.0 yeşil-defter cumulative model, the configurable deduction chain, or the immutable-snapshot guarantee.

**Verified:** 2026-05-28T22:55:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Auditor approval via Telegram updates draft hakkediş period within seconds | VERIFIED | `handleAuditDecision` approve branch line 498 calls `await hakedisActions.recomputeHakedisLine(projectId, boqItemId, currencyCode)` inside try/catch (lines 489-507), positioned AFTER `editAllSiblingMessages` (line 468) and BEFORE worker notification (line 513). Helper performs INSERT … ON CONFLICT UPSERT into `hakedis_period_lines` (line 303-340). Test 1 "D-117 trigger" passes against live test DB. |
| 2 | Office engineer can see approved submissions that contributed to a line | VERIFIED | `getLineSubmissions(periodLineId)` in `src/actions/hakedis.ts` lines 401-433 returns `{submissionId, workerName, decidedAt, qtyContributed, photoUrl, notes}` ordered by `decided_at DESC`, auth-guarded + tenant-scoped via the `hakedis_period_lines` JOIN. Wired into `LineSubmissionsPanel.tsx` (line 95: `await getLineSubmissions(periodLineId)`); mounted in `[periodId]/page.tsx` line 282 as 8th column per line row. Test 5 "getLineSubmissions shape" passes. |
| 3 | Existing period-finalization continues to work unchanged | VERIFIED | `recomputePeriodLines` (lines 450-523) refactored to delegate to `recomputeHakedisLine` in a loop — single math body, two callers. DELETE-then-INSERT preserved for the manual recompute UX. All 28 Phase 10 hakedis tests + 33 Phase 11 exports tests + 13 Phase 3 telegram-audit tests pass post-refactor (74 total in regression run). Test 8 "SDH-03 manual recompute no-regression" + Manual UAT Row 3 (byte-identical finalized export `cmp`) both PASSED. |
| 4 | Finalized period rejects further submission-driven contribution | VERIFIED | Helper guard at lines 199-220: WHERE `status='draft'` + Pitfall 4 defense-in-depth re-check on loaded row. If no draft period exists, returns `{updated:false, periodLineId:null}` (D-118 no-op). Test 6 "Pitfall 4 finalize race" + Manual UAT Row 3 confirm no mutation to finalized snapshots. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema/hakedis-line-submissions.ts` | D-119 join-table schema | VERIFIED | 53 lines; `hakedisLineSubmissions` exported with composite PK `(periodLineId, submissionId)`, cascade FK on `periodLineId`, restrict FK on `submissionId`, `qtyContributed` numeric(12,3), reverse-lookup index on `submissionId` |
| `src/db/schema/hakedis-period-lines.ts` | UNIQUE `(period_id, boq_item_id)` added | VERIFIED | Line 56: `unique('hakedis_period_lines_period_boq_unique').on(t.periodId, t.boqItemId)` — D-117 UPSERT target. GENERATED column for `period_qty` preserved (line 39-40); Pitfall 7 honored |
| `src/db/schema/index.ts` | Barrel re-exports new module | VERIFIED | Line 19: `export * from './hakedis-line-submissions'` slotted after `hakedis-period-lines` |
| `src/db/migrations/0009_v3_line_submissions.sql` | CREATE TABLE + 3 FK ALTERs + INDEX + parent UNIQUE | VERIFIED | 14 lines: exactly the 4 expected statements. `grep -cE 'DROP.*period_qty\|GENERATED ALWAYS AS'` = 0 (Pitfall 7 honored); journal carries `0009_v3_line_submissions` tag |
| `src/actions/hakedis.ts` | recomputeHakedisLine + getLineSubmissions + recomputePeriodLines refactor | VERIFIED | `recomputeHakedisLine` lines 192-383, `getLineSubmissions` lines 401-433, `recomputePeriodLines` lines 450-523 calling helper at line 519. ON CONSTRAINT UPSERT at line 329; INSERT INTO hakedis_line_submissions at line 357 with NOT EXISTS delta-only filter (lines 369-377) and ON CONFLICT DO UPDATE (lines 378-379) |
| `src/lib/bot-audit.ts` | D-117 post-commit hook AFTER edit, BEFORE worker notify, in try/catch | VERIFIED | Lines 489-507: try/catch wrapping dynamic import + helper call. Order: 468 (editAllSiblingMessages) → 498 (recomputeHakedisLine) → 513 (workerRows). `grep -c "logOfficeActivity" = 0` (Pitfall 5 honored) |
| `src/components/admin/LivePeriodPoller.tsx` | 30s router.refresh polling, null-on-disabled | VERIFIED | 80 lines, 'use client'. Line 52: `if (!enabled) return null` BEFORE hook calls. Hooks isolated in `LivePeriodPollerEnabled` sub-component (lines 60-80) — useEffect with setInterval(30000) + clearInterval cleanup. Default `intervalMs = 30000` (line 46). sr-only span emitted only on enabled path |
| `src/components/admin/LineSubmissionsPanel.tsx` | Inline expand-row, consumes getLineSubmissions, bilingual | VERIFIED | 183 lines, 'use client'. Line 43: imports `getLineSubmissions` and `LineSubmission` type. Line 82: `useTranslations('dashboard.admin.hakedis.line_submissions')`. Photo anchor at line 164-172 with `rel="noopener noreferrer"` (T-12-04-TAB). useState + useTransition for lazy expand-fetch |
| `src/app/dashboard/(admin)/hakedis/[periodId]/page.tsx` | Mount LivePeriodPoller (draft-only) + 8th traceability column | VERIFIED | Line 163: `{status === 'draft' && <LivePeriodPoller enabled={true} />}` — D-120 UI-side guard. Line 281-287: 8th TableCell hosts `LineSubmissionsPanel`. colSpan empty=8 (line 238), footer=7 (line 297). `export const dynamic = 'force-dynamic'` preserved (line 46) |
| `messages/en.json` + `messages/tr.json` | 12 bilingual keys under `line_submissions` namespace | VERIFIED | Both files parse; 12 keys each at byte-identical JSON path; zero missing/extra TR keys (node parity check confirmed) |
| `tests/hakedis-live.test.ts` | 10 concrete it() entries, 0 it.todo | VERIFIED | `grep -c "it("` = 10, `grep -c "it\.todo"` = 0. Includes Test 9 pure-function `expect(LivePeriodPoller({enabled:false})).toBeNull()` at exactly 1 occurrence |
| `tests/fixtures/hakedis.ts` | seedDraftPeriod helper | VERIFIED | Line 59: `export async function seedDraftPeriod` + line 32: `HAKEDIS_LIVE_FIXTURE_IDS` exported |
| `scripts/verify-0009.ts` | Live-DB schema-presence assertion | VERIFIED | Live run prints OK + full constraint summary (table, PK, 3 FKs, index, parent UNIQUE) against DATABASE_URL |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `bot-audit.ts handleAuditDecision` | `actions/hakedis.ts recomputeHakedisLine` | dynamic import in try/catch | VERIFIED | Line 490: `const hakedisActions = await import('@/actions/hakedis')` → line 498: `await hakedisActions.recomputeHakedisLine(...)`; ordering verified (468→498→513); wrapped in try/catch (489 try, 504 catch) |
| `actions/hakedis.ts recomputeHakedisLine` | DB `hakedis_line_submissions` | INSERT…SELECT…ON CONFLICT | VERIFIED | Line 357: `INSERT INTO hakedis_line_submissions` with NOT EXISTS delta-only clause and ON CONFLICT DO UPDATE at line 378-379 |
| `actions/hakedis.ts getLineSubmissions` | DB `hakedis_line_submissions + submissions + people` | JOIN query | VERIFIED | Lines 414-417: 3-way JOIN, line 419: tenant scoping via `hpl.tenant_id` |
| `LineSubmissionsPanel.tsx` | `actions/hakedis.ts getLineSubmissions` | Server Action call inside useTransition | VERIFIED | Line 43 import; line 95 invocation within startTransition callback; results stored in `rows` state |
| `[periodId]/page.tsx` | `LivePeriodPoller` | conditional mount on `status === 'draft'` | VERIFIED | Line 163: `{status === 'draft' && <LivePeriodPoller enabled={true} />}` |
| `LivePeriodPoller.tsx` | `useRouter().refresh()` | useEffect + setInterval | VERIFIED | Lines 68-73: setInterval(30000) → router.refresh; cleanup returns clearInterval(id) |
| `recomputePeriodLines` | `recomputeHakedisLine` | per-item loop | VERIFIED | Line 519: `await recomputeHakedisLine(projectId, itemId, itemCurr)` inside `for (const row of itemsResult.rows)` |
| Migration 0009 SQL | Live dev DB + test DB | `npx tsx src/db/migrate.ts` | VERIFIED | `scripts/verify-0009.ts` run prints OK with full constraint summary on dev DB; SUMMARY records both branches applied (Plan 12-02 Task 3) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `LineSubmissionsPanel.tsx` | `rows` (LineSubmission[]) | `getLineSubmissions(periodLineId)` Server Action → DB JOIN | Yes — real DB query against hakedis_line_submissions + submissions + people | FLOWING |
| `LivePeriodPoller.tsx` (enabled) | sr-only label | `useTranslations('dashboard.admin.hakedis.line_submissions').polling_indicator` | Yes — i18n keys verified in both en.json + tr.json | FLOWING |
| `[periodId]/page.tsx` lines table | `line` rows (PeriodLine) | `getPeriodDetail(periodId)` (existing Phase 10 path, unchanged) | Yes — existing Phase 10 wiring not regressed; row.periodQty + row.id passed to LineSubmissionsPanel | FLOWING |
| `recomputeHakedisLine` internal data | `cumulativeResult`, `prevResult`, `upsertResult` | `db.execute(sql\`...\`)` against live Postgres with bound params | Yes — bound SQL, real DB queries; INSERT…SELECT writes real submissions rows into join table | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles | `npx tsc --noEmit` | exits 0 | PASS |
| Phase 12 contract tests pass | `vitest run tests/hakedis-live.test.ts` | 10 passed (10), 0 todo | PASS |
| SDH-03 no-regression: Phase 10 hakedis + Phase 11 exports + Phase 3 audit | `vitest run tests/hakedis.test.ts tests/exports.test.ts tests/telegram-audit.test.ts` | 3 files passed, 74/74 tests passed | PASS |
| Live DB schema present | `tsx scripts/verify-0009.ts` | prints "OK" + full constraint summary (table + PK + 3 FKs + index + parent UNIQUE) | PASS |
| Bilingual i18n parity | node JSON parse + key diff | EN 12 keys / TR 12 keys / 0 missing / 0 extra | PASS |

### Probe Execution

No probe-style scripts exist for this phase (`find scripts -path '*/tests/probe-*.sh'` returns empty). Migration apply was gated by Plan 12-02 `checkpoint:human-verify` (resolved by user as "approved both"), confirmed via `scripts/verify-0009.ts` which printed OK both times. N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SDH-01 | 12-01, 12-02, 12-03, 12-04 | Each approved Telegram submission contributes to in-progress hakkediş in real time; office sees billing artefacts grow with each approval | SATISFIED | D-117 hook in bot-audit.ts line 498; recomputeHakedisLine writes hakedis_period_lines UPSERT; LivePeriodPoller drives `router.refresh()` every 30s on draft pages; Manual UAT Row 1 PASSED |
| SDH-02 | 12-01, 12-03, 12-04 | Office engineer can trace each hakkediş line back to source approved submissions | SATISFIED | D-119 join table populated via INSERT…SELECT in recomputeHakedisLine; getLineSubmissions Server Action returns shape `{submissionId, workerName, decidedAt, qtyContributed, photoUrl, notes}`; LineSubmissionsPanel renders inline expand-row with bilingual labels; Manual UAT Row 2 PASSED in TR + EN |
| SDH-03 | 12-01, 12-02, 12-03, 12-04 | Submission-driven contribution is additive; never breaks cumulative yeşil-defter, deduction chain, or immutable-snapshot guarantee | SATISFIED | Single math body (recomputeHakedisLine) shared by manual Recompute (recomputePeriodLines loop) and bot hook — zero math drift; Pitfall 4 defense-in-depth re-check on loaded row; helper returns no-op for finalized periods; 28 Phase 10 hakedis tests + 33 Phase 11 exports tests + 13 Phase 3 audit tests all green; Manual UAT Row 3 confirms byte-identical finalized exports via `cmp` |

No orphaned requirements found in REQUIREMENTS.md mapping to Phase 12 outside SDH-01..03.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No TBD/FIXME/XXX debt markers; no hardcoded empty data flowing to render; no console.log-only impls. The single `console.error` in bot-audit.ts hakErr catch is intentional D-40 best-effort logging |

`grep -E "TBD|FIXME|XXX"` across Phase 12 modified files returned zero unreferenced debt markers. The `placeholder` and `TODO` patterns are absent from production code paths.

### Pitfall Honor Roll

| Pitfall | Status | Evidence |
|---------|--------|----------|
| Pitfall 4 (finalize race) | HONORED | `recomputeHakedisLine` lines 199-220: WHERE filters `status='draft'` + defense-in-depth re-check on loaded row; tested by Test 6 |
| Pitfall 5 (no logOfficeActivity from bot) | HONORED | `grep -c "logOfficeActivity" src/lib/bot-audit.ts` = 0; tested by Test 7 + Plan 12-03 static-edge test |
| Pitfall 7 (migration must not re-emit period_qty) | HONORED | `grep -vE '^--' 0009.sql \| grep -cE 'DROP.*period_qty\|GENERATED ALWAYS AS'` = 0 |
| Pitfall 1 (hook outside approve TX) | HONORED | Hook lives between `editAllSiblingMessages` (post-commit) and worker notify; explicitly outside `txDb.transaction(...)` block |
| CR-02 best-effort post-commit shape | HONORED | Lines 489-507: `try { … recomputeHakedisLine(…) } catch (hakErr) { console.error(…) }` — failure does not propagate to auditor |

### Human Verification Required

None outstanding. The three Manual UAT items from Plan 12-04 Task 3 were signed off by the user as `uat-approved` during Wave 4:

1. **30s polling visibly updates draft hakkediş** — PASSED 2026-05-28 (Manual UAT Row 1)
2. **Traceability UI lists contributing submissions bilingually** — PASSED 2026-05-28 (Manual UAT Row 2)
3. **Late approval does NOT mutate finalized snapshot (`cmp` byte-identical)** — PASSED 2026-05-28 (Manual UAT Row 3)

Recorded in `.planning/phases/12-submission-driven-hakkedi/12-VALIDATION.md` with `nyquist_compliant: true`, `status: complete`, and `Approval: APPROVED 2026-05-28`.

### Gaps Summary

No gaps. All 4 ROADMAP Success Criteria verified with code-level evidence. All 3 requirements (SDH-01, SDH-02, SDH-03) satisfied. All 8 specifically-requested checks (D-117 helper extraction with single math body, D-118 no-op for orphan approvals, D-119 traceability join populated via shared INSERT…SELECT, D-120 LivePeriodPoller draft-only mount with 30s polling, Pitfall 5 no logOfficeActivity, CR-02 post-commit hook shape AFTER editAllSiblingMessages/BEFORE worker notify, SDH-03 contract preservation via 4-suite green test run, UNIQUE constraint added per OQ4, schema migration 0009 applied to both DBs) all VERIFIED with grep + test + live-DB evidence.

Behavioral spot-checks all PASS: tsc green, hakedis-live 10/10 pass, 74/74 regression tests pass, live DB has the table + UNIQUE, bilingual i18n parity 12/12.

---

_Verified: 2026-05-28T22:55:00Z_
_Verifier: Claude (gsd-verifier)_
