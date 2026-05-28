---
phase: 10
slug: hakkedi-billing
status: draft
nyquist_compliant: true
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
| **DB integration tests** | Guarded by `describeIfDb` (skips when `TEST_DATABASE_URL` not set) |
| **Parallelism** | `fileParallelism: false` (sequential — shared DB, FK-safe TRUNCATE) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <relevant file>`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** targeted file run is fast; full suite is the gate

---

## Per-Task Verification Map

> The auto/tdd tasks across plans 10-01..10-04 and their automated verification. UI-only tasks
> (page render, dialog interaction) carry a build/typecheck gate plus an end-of-phase manual check
> (see Manual-Only Verifications). Task IDs are `{phase}-{plan}-{task}`.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Test File |
|---------|------|------|-------------|-----------|-------------------|-----------|
| 10-01-1 | 01 | 1 | HAK-01/03/05, D-91, D-104 | typecheck + i18n parity + Wave 0 scaffold | `npx tsc --noEmit`; node i18n parity check; `npx vitest run tests/hakedis.test.ts` | tests/hakedis.test.ts (scaffold), messages/{en,tr}.json |
| 10-01-2 | 01 | 1 | HAK-02, D-104 | tdd — DB integration (GENERATED column) | `npx vitest run tests/schema.test.ts`; `grep -c "GENERATED ALWAYS AS" src/db/migrations/0008_v2_hakedis_deductions.sql` | tests/schema.test.ts (Money-Math Test 5) |
| 10-01-3 | 01 | 1 | HAK-02, D-104 | [BLOCKING] human-verify — migration apply | `npx tsx src/db/migrate.ts`; information_schema check; `npx vitest run tests/schema.test.ts` | tests/schema.test.ts (against applied test branch) |
| 10-02-1 | 02 | 2 | HAK-01/02/03 | tdd — DB integration (compute + deduction + chaining + net) | `npx vitest run tests/hakedis.test.ts`; `npx tsc --noEmit` | tests/hakedis.test.ts |
| 10-02-2 | 02 | 2 | HAK-04/05 | tdd — DB integration (lifecycle + immutability) | `npx vitest run tests/hakedis.test.ts`; `npx tsc --noEmit` | tests/hakedis.test.ts |
| 10-03-1 | 03 | 3 | HAK-01/04, D-97 | typecheck + lint (status badge + create dialog + delete dialog) | `npx tsc --noEmit`; `npx next lint --file ...` | (component typecheck; behavior via 10-02 server-action tests + end-of-phase manual) |
| 10-03-2 | 03 | 3 | HAK-01/04, D-97 | build (list page + draft-only Sil) | `npx tsc --noEmit`; `npx next build` | (route build gate; render via end-of-phase manual) |
| 10-04-1 | 04 | 4 | HAK-04/05 | typecheck (finalize dialog + control row) | `npx tsc --noEmit` | (component typecheck; behavior via 10-02 server-action tests + end-of-phase manual) |
| 10-04-2 | 04 | 4 | HAK-02/03/04/05 | build (detail page + deduction summary) | `npx tsc --noEmit`; `npx next build` | (route build gate; render via end-of-phase manual) |

*Status legend (during execution): ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> Note: the financial behaviors (compute, deduction chain, finalize/immutability, payment lifecycle,
> per-period net) are fully covered by automated DB-integration tests in `tests/hakedis.test.ts`
> (Plan 10-02) and `tests/schema.test.ts` (Plan 10-01). The Wave 3/4 UI tasks are build/typecheck
> gated; their visual rendering + TR/EN locale + finalize-immutability UX are end-of-phase manual
> checks (browser-rendered, see below). No 3 consecutive tasks lack an automated gate.

---

## Wave 0 Requirements

> Wave 0 completes at execution (Plan 10-01), not at planning time. These items are scaffolded by
> Plan 10-01 (Task 1 creates the `tests/hakedis.test.ts` scaffold; Task 2 updates Money-Math Test 5;
> fixtures confirmed present). `wave_0_complete: false` until the plans actually run.

- [x] `tests/hakedis.test.ts` — new file; scaffold created in Plan 10-01 Task 1 (it.todo entries for HAK-01..HAK-05), filled in Plan 10-02 Tasks 1+2
- [x] Update `tests/schema.test.ts` Money-Math Test 5 — Plan 10-01 Task 2 removes `periodQty` from the INSERT values and asserts the GENERATED auto-computed value
- [x] Shared fixtures — `tests/fixtures/db.ts` (`describeIfDb`, `getTestDb`, `truncateAllTables`) confirmed present and already include `hakedis_period_lines` + `hakedis_periods` in the truncate list (no new fixture file needed; Plan 10-02 reuses the schema.test.ts insert pattern for tenant/project/boq/period/submission)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Period list / detail / create rendering + TR-EN locale | HAK-01/HAK-03 | Browser-rendered UI | Create a draft period via the dialog, open detail, verify the SC3 summary chain renders to 2 decimals in both TR and EN locales |
| Draft-only Sil affordance on the list page | HAK-01 / D-97 | Browser-rendered UI | Confirm a draft row shows the "Sil / Delete" affordance; a finalized/submitted/paid row shows only "Aç / Open Period" |
| Finalize confirmation + immutability in the UI | HAK-05 | Browser interaction | Finalize a period; confirm recompute/edit/delete controls disappear and the immutability banner shows |

*Server-side enforcement of all of the above (delete blocked on non-draft, finalize lock, payment
transitions) is covered by automated tests in `tests/hakedis.test.ts`; the manual checks verify only
the browser rendering / interaction layer.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (scaffold + Money-Math Test 5 update + fixtures)
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set in frontmatter
- [ ] `wave_0_complete` — set to true at execution once Plan 10-01 lands the scaffold + applied migration

**Approval:** map backfilled from the four PLAN.md files; nyquist_compliant.
</content>
