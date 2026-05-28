---
phase: 11
plan: 01a
subsystem: exports
tags: [setup, dependencies, schema-extension, i18n]
requires:
  - "@react-pdf/renderer not installed"
  - "dejavu-fonts-ttf not installed"
  - "pdf-parse not installed"
  - "public/fonts/ does not exist"
  - "OFFICE_ACTION_TYPES lacks 4 export action types"
  - "OE scorecard actionTypeToKey() lacks 4 D-109 entries"
  - "messages/{en,tr}.json lack 4 action_*_exported keys"
provides:
  - "@react-pdf/renderer@4.5.1 installed"
  - "dejavu-fonts-ttf@2.37.3 installed"
  - "pdf-parse@1.1.1 installed as devDependency"
  - "public/fonts/DejaVuSans.ttf (757 KB)"
  - "public/fonts/DejaVuSans-Bold.ttf (706 KB)"
  - "OFFICE_ACTION_TYPES extended with 4 export action types (D-109)"
  - "OE scorecard actionTypeToKey() map extended with 4 D-109 entries"
  - "messages/{en,tr}.json each gain 4 action_*_exported keys under oe_scorecard"
affects:
  - Plan 11-01b (Wave 1 setup half-B — toSlug, sanitizeExcelCell, getAllFinishedPeriods, test scaffold)
  - Plan 11-02 (EXP-01 submission ledger route handler — will logOfficeActivity with submission_ledger_exported)
  - Plan 11-03 (EXP-02 hakkediş Excel route handler — will logOfficeActivity with hakedis_excel_exported)
  - Plan 11-04 (EXP-04 PDF route handler — will Font.register DejaVu TTFs + logOfficeActivity with hakedis_pdf_exported)
  - Plan 11-05 (EXP-03 performance summary route handler — will logOfficeActivity with performance_summary_exported)
tech-stack:
  added:
    - "@react-pdf/renderer@4.5.1 (PDF generation; auto-externalized by Next.js 15 — no next.config.ts change)"
    - "dejavu-fonts-ttf@2.37.3 (DejaVu Sans TTF source for embedded font registration)"
    - "pdf-parse@1.1.1 (devDependency — binary PDF text-extraction in tests/exports.test.ts)"
  patterns:
    - "Font assets live at public/fonts/ — bundled with Vercel serverless function, accessible via path.join(process.cwd(), 'public/fonts/...') per A3"
    - "Activity log extension is TypeScript-only (text column, not pg enum) — no migration; honors <no_schema_migration> phase rule"
    - "OE scorecard actionTypeToKey() map hoisted from old Plan 11-06 here so any office_activity_log row from Wave 2 renders the specific label immediately"
key-files:
  created:
    - public/fonts/DejaVuSans.ttf
    - public/fonts/DejaVuSans-Bold.ttf
  modified:
    - package.json
    - package-lock.json
    - src/db/schema/office-activity-log.ts
    - "src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx"
    - messages/en.json
    - messages/tr.json
decisions:
  - "Package legitimacy gate (Task 0) cleared with explicit human approval — @react-pdf/renderer@4.5.1, dejavu-fonts-ttf@2.37.3, pdf-parse@1.1.1 all verified by user on npmjs.com per T-11-01a-SC"
  - "next.config.ts serverExternalPackages array LEFT UNCHANGED — @react-pdf/renderer is on Next.js 15's automatic opt-out list (Research A1 + Pitfall 1)"
  - "TTFs copied (cp), not symlinked — Vercel serverless functions need physical files in the bundle (A3)"
  - "Four new OFFICE_ACTION_TYPES added to the as-const tuple ONLY — no migration file (D-109; text column)"
  - "OE scorecard map + i18n keys hoisted into setup wave so downstream Wave 2 plans render specific labels with zero 'action_unknown' transient window"
metrics:
  duration_seconds: 125
  duration_minutes: 2
  tasks_completed: 2
  task_0_status: "Cleared by explicit human approval (continuation prompt user_response='approved')"
  files_modified: 6
  files_created: 2
  completed: 2026-05-28
---

# Phase 11 Plan 01a: Wave 1 Setup Half-A Summary

Installed the three new Phase 11 dependencies (@react-pdf/renderer, dejavu-fonts-ttf, pdf-parse), copied DejaVu Sans TTF assets into public/fonts/, and extended OFFICE_ACTION_TYPES + OE scorecard map + i18n action keys with the four D-109 export action types — all without a DB migration.

## Tasks Completed

### Task 0 — Package legitimacy gate (checkpoint:human-verify, gate="blocking-human")

Cleared by explicit human approval on the continuation prompt (`user_response: "approved"`). The user verified all three packages on npmjs.com per T-11-01a-SC supply-chain mitigation:

- `@react-pdf/renderer@4.5.1` — maintained by diegomura, MIT, >100k weekly downloads, GitHub repo `diegomura/react-pdf` alive.
- `dejavu-fonts-ttf@2.37.3` — assets-only package, no postinstall scripts, MIT-style font license, established Latin Extended-A font.
- `pdf-parse@1.1.1` — actively maintained, >1M weekly downloads, devDependency only (binary PDF assertions).

No suspicious findings. Gate passed; Task 1 proceeded with `npm install`.

### Task 1 — Install dependencies + copy DejaVu TTFs (commit `636d968`)

- Ran `npm install @react-pdf/renderer@4.5.1 dejavu-fonts-ttf@2.37.3` — 49 new transitive packages added; npm-list confirms exact pinned versions.
- Ran `npm install -D pdf-parse@1.1.1` — devDependency added.
- Created `public/fonts/` directory (did not previously exist).
- Copied two TTF files from `node_modules/dejavu-fonts-ttf/ttf/`:
  - `public/fonts/DejaVuSans.ttf` — **757,076 bytes** (≈739 KB), passes >100 KB acceptance gate (load-bearing for Plan 11-04 T-11-04-FONT-MISSING).
  - `public/fonts/DejaVuSans-Bold.ttf` — **705,684 bytes** (≈689 KB), passes >100 KB gate.
- `next.config.ts` left UNCHANGED — `serverExternalPackages` array still lists `["grammy", "pg", "ws", "@neondatabase/serverless"]`. @react-pdf/renderer is on Next.js 15's automatic opt-out list (Research A1 + Pitfall 1).
- `npx tsc --noEmit` clean — no new errors from the installs.

### Task 2 — OFFICE_ACTION_TYPES + OE scorecard map + i18n keys (commit `9b8aa10`)

Four atomic edits across four files:

**Edit 1 — `src/db/schema/office-activity-log.ts`:** Appended 4 strings to `OFFICE_ACTION_TYPES` tuple AFTER `'hakedis_exported'`, preserving the `as const` annotation. Column is `text('action_type').notNull()` — extending an as-const tuple is a compile-time-only change; **no migration file created** (verified `src/db/migrations/` unchanged).

**Edit 2 — `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx`:** Inside `actionTypeToKey()`'s `map` object, appended 4 entries AFTER `boq_item_created` and BEFORE the closing `};`. Function signature, `Record<string, string>` typing, and the `action_unknown` fallback all unchanged.

**Edit 3 + 4 — `messages/en.json` and `messages/tr.json`:** Under `dashboard.admin.oe_scorecard`, inserted 4 new keys between `action_boq_item_created` and `action_unknown`. JSON validity preserved.

## Files Created (2)

| Path | Size | Purpose |
|------|------|---------|
| `public/fonts/DejaVuSans.ttf` | 757,076 B | Regular TTF font for D-106 PDF body rendering |
| `public/fonts/DejaVuSans-Bold.ttf` | 705,684 B | Bold TTF font for D-106 PDF heading rendering |

## Files Modified (6)

| Path | Change |
|------|--------|
| `package.json` | +3 deps: `@react-pdf/renderer@^4.5.1`, `dejavu-fonts-ttf@^2.37.3` (runtime); `pdf-parse@^1.1.1` (dev) |
| `package-lock.json` | 49 transitive packages added |
| `src/db/schema/office-activity-log.ts` | OFFICE_ACTION_TYPES tuple extended by 4 entries (D-109) |
| `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx` | actionTypeToKey() map extended by 4 entries |
| `messages/en.json` | 4 action_*_exported keys added under oe_scorecard |
| `messages/tr.json` | Turkish parity for the 4 action_*_exported keys |

## OFFICE_ACTION_TYPES — New Entries (D-109)

```typescript
'hakedis_pdf_exported',           // EXP-04 PDF download (Plan 11-04)
'hakedis_excel_exported',         // EXP-02 hakkediş Excel (Plan 11-03)
'submission_ledger_exported',     // EXP-01 submission ledger (Plan 11-02)
'performance_summary_exported',   // EXP-03 performance summary (Plan 11-05)
```

## OE Scorecard actionTypeToKey() — New Map Entries

```typescript
hakedis_pdf_exported: 'action_hakedis_pdf_exported',
hakedis_excel_exported: 'action_hakedis_excel_exported',
submission_ledger_exported: 'action_submission_ledger_exported',
performance_summary_exported: 'action_performance_summary_exported',
```

## i18n Keys Added (8 total: 4 EN + 4 TR)

| Key | EN | TR |
|-----|----|----|
| `action_hakedis_pdf_exported` | Downloaded hakkediş PDF | Hakkediş PDF'i indirildi |
| `action_hakedis_excel_exported` | Downloaded hakkediş Excel | Hakkediş Excel'i indirildi |
| `action_submission_ledger_exported` | Exported submission ledger | Gönderim listesi dışa aktarıldı |
| `action_performance_summary_exported` | Exported performance summary | Performans özeti dışa aktarıldı |

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `DejaVuSans.ttf` size | >100 KB | 757,076 B | PASS |
| `DejaVuSans-Bold.ttf` size | >100 KB | 705,684 B | PASS |
| `@react-pdf/renderer` version | 4.5.1 | 4.5.1 | PASS |
| `dejavu-fonts-ttf` version | 2.37.3 | 2.37.3 | PASS |
| `pdf-parse` version (dev) | 1.1.1 | 1.1.1 | PASS |
| Schema new types count | 4 | 4 (lines 25-28) | PASS |
| OE scorecard map new entries | 4 | 4 (lines 69-72) | PASS |
| i18n EN+TR keys | 4 each | "all 4 i18n keys present in both en + tr" | PASS |
| `tsc --noEmit` | clean | clean | PASS |
| `next.config.ts` unchanged | yes | unchanged | PASS |
| New migration files | 0 | 0 | PASS |

## Deviations from Plan

### [Rule 2 - Correctness] REQUIREMENTS.md not marked complete for EXP-01..EXP-04

- **Found during:** State updates after Task 2 commit
- **Issue:** Plan 11-01a frontmatter declares `requirements: [EXP-01, EXP-02, EXP-03, EXP-04]`, but the plan only ships dependencies + i18n scaffolding. The actual route handlers (which fulfill EXP-01..04) are scheduled for Plans 11-02 through 11-05. Marking them `[x] Complete` here would mislead the verifier and the requirements traceability table.
- **Fix:** After `gsd-sdk query requirements.mark-complete EXP-01..04` ran, reverted `.planning/REQUIREMENTS.md` with `git checkout`. The four requirements remain `[ ] Pending`. They will be marked complete by the plans that actually deliver them (11-02 / 11-03 / 11-04 / 11-05).
- **Files reverted:** `.planning/REQUIREMENTS.md` (no commit; revert happened pre-commit)
- **Why this is correct:** Requirements traceability must reflect reality. EXP-01..04 acceptance is "Admin can export X to Excel/PDF" — neither is possible until the route handlers exist. Plan 11-01a is necessary but not sufficient.

## Authentication Gates

Task 0 (package legitimacy `checkpoint:human-verify` with `gate="blocking-human"`) was an explicit human-approval gate, not an auth gate. Resolved via continuation prompt with `user_response: "approved"`.

## Key Decisions

1. **TTFs copied (`cp`), not symlinked** — Vercel serverless functions need physical files bundled (Research A3).
2. **`next.config.ts` UNCHANGED** — `@react-pdf/renderer` is on Next.js 15's automatic `serverExternalPackages` opt-out list (A1). Adding it manually would be redundant.
3. **TypeScript-only schema extension** — `OFFICE_ACTION_TYPES` is a `text` column not a pg enum; extending the `as const` tuple is a compile-time change with zero DB impact. No migration file created — strictly honors the phase's `<no_schema_migration>` directive.
4. **OE scorecard map + i18n keys hoisted into Wave 1** — originally planned for old Plan 11-06; hoisting prevents any transient `action_unknown` fallback window when Wave 2 starts writing the new action_type rows.

## Threat Model Coverage

| Threat ID | Status |
|-----------|--------|
| T-11-01a-SC (supply chain, npm install) | MITIGATED — gate cleared with explicit human approval |
| T-11-01a-FONT (font path) | ACCEPTED — path is hardcoded constant, no user input |
| T-11-01a-TYPE (action_type extension) | MITIGATED — static as-const tuple, TypeScript narrows callers |
| T-11-01a-i18n (TR/EN merge) | ACCEPTED — JSON validated, no user-controlled content |

## Self-Check: PASSED

- FOUND: `public/fonts/DejaVuSans.ttf` (757,076 B)
- FOUND: `public/fonts/DejaVuSans-Bold.ttf` (705,684 B)
- FOUND: commit `636d968` (Task 1 chore install) in `git log`
- FOUND: commit `9b8aa10` (Task 2 feat extend OFFICE_ACTION_TYPES) in `git log`
- FOUND: all 4 new OFFICE_ACTION_TYPES strings in `src/db/schema/office-activity-log.ts`
- FOUND: all 4 new map entries in `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx`
- FOUND: all 4 EN + 4 TR `action_*_exported` keys under `dashboard.admin.oe_scorecard`
- VERIFIED: `next.config.ts` `serverExternalPackages` unchanged from `["grammy", "pg", "ws", "@neondatabase/serverless"]`
- VERIFIED: zero new files under `src/db/migrations/` (latest is still `0008_v2_hakedis_deductions.sql`)
- VERIFIED: `tsc --noEmit` clean
