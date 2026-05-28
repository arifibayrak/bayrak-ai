---
phase: 11
plan: 06
subsystem: exports
tags: [period-detail-ui, client-component, d-108, d-109, d-111, ui-spec-surface-2, exp-02, exp-04]
requires:
  - "Plan 11-01b complete (dashboard.admin.hakedis.detail.export_excel + detail.download_pdf bilingual joined keys in EN+TR)"
  - "Plan 11-04 complete (GET /api/exports/hakedis/[periodId] EXP-02 + /pdf EXP-04 route handlers shipped with draft guard + tenant scope)"
  - "Plan 11-01a Task 2 complete (D-109 traceability hoisted: actionTypeToKey() map + 4 action_*_exported i18n keys present in both locales)"
provides:
  - "src/components/admin/PeriodDetailControls.tsx — primary post-finalize trigger surface for hakkediş Excel + PDF (D-108 distributed UX, period-detail side)"
  - "D-108 fully complete: hub page (Plan 11-05) + period-detail buttons (this plan) BOTH wired to the same 4 route handlers"
  - "VALIDATION.md Manual-Only Verifications rows 2-4 SATISFIED (period-detail draft guard, PDF Turkish glyphs, Excel money formatting) + OE scorecard action labels in both TR and EN"
affects:
  - "Phase 11 ready for /gsd:verify-work — every EXP-01..04 requirement reachable via UI (hub + period detail)"
tech-stack:
  added: []
  patterns:
    - "Additive client-component extension: existing handlers + status-branch ternaries UNCHANGED; new conditional block appended INSIDE the existing flex row"
    - "D-96 state-gated REMOVAL (not disable): buttons absent when status === 'draft' (UI-SPEC Surface 2 Draft guard); defense-in-depth with Plan 11-04 Pitfall 5 server-side 422"
    - "Browser-native <a download> wrapping shadcn Button (UI-SPEC Surface 3 row 1) — no JS loading state, no client-side fetch, no useState extension"
    - "variant='outline' size='sm' (UI-SPEC Surface 2 explicit: outline NOT primary — the primary Finalize/Mark-Submitted/Mark-Paid action keeps the default solid)"
    - "Accessibility: aria-label on each anchor (UI-SPEC Surface 3 row 4); aria-hidden='true' on lucide icons"
    - "D-111 bilingual joined labels via t('detail.export_excel') + t('detail.download_pdf') from Plan 11-01b — render byte-identical across messages/{en,tr}.json"
key-files:
  created:
    - .planning/phases/11-exports/11-06-SUMMARY.md
  modified:
    - "src/components/admin/PeriodDetailControls.tsx (+31 / -1 lines — additive only)"
decisions:
  - "Task 2 (extend actionTypeToKey() in OE scorecard) was HOISTED to Plan 11-01a Task 2 during revision — Wave 2 office_activity_log rows render specific labels immediately rather than transiently showing action_unknown. This plan now verifies the end-to-end label rendering via Task 2 UAT."
  - "No useState added for downloading state — browser-native <a download> flow is sufficient per UI-SPEC Surface 3 Interaction Contract row 1"
  - "Both anchors point at existing Plan 11-04 route handlers — zero new generation logic; D-108 single-handler contract preserved across hub + period-detail surfaces"
  - "Task 2 end-of-phase UAT APPROVED by user — all four UAT gates passed: (1) draft period has NO export buttons, finalized period has BOTH Excel + PDF; (2) PDF Turkish glyphs render correctly; (3) Excel money values formatted; (4) OE scorecard shows all 4 specific action labels in both TR and EN"
metrics:
  duration_seconds: 0
  duration_minutes: 0
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  insertions: 31
  deletions: 1
  oe_scorecard_diff: "+0 / -0 (extension hoisted to Plan 11-01a Task 2 during revision; no changes in this plan)"
  completed: 2026-05-28
---

# Phase 11 Plan 06: Period-Detail PDF/Excel Button Wiring Summary

Extended `src/components/admin/PeriodDetailControls.tsx` with two additive outline
buttons (Excel + PDF) inside the existing flex row, gated on `status !== 'draft'`,
to deliver UI-SPEC Surface 2 and the period-detail side of D-108 (distributed UX).
This is the **primary post-finalize trigger** for hakkediş exports — office
engineers download Excel and PDF immediately after finalizing without navigating
back to the Exports hub. The hub-side period picker (Plan 11-05) remains as the
secondary "browse / re-download" surface. Both surfaces hit the same two route
handlers shipped in Plan 11-04 (`/api/exports/hakedis/[periodId]` and `/pdf`).

The change is strictly additive: one modified `lucide-react` import line, one
inserted conditional JSX block inside the existing flex row. Existing handlers
(`handleRecompute`, `handleAdvanceStatus`), error state, and the three
status-branch blocks (`draft`, `finalized`, `submitted`) are unchanged. No
`useState` was added — the browser-native `<a download>` wrapping shadcn `<Button>`
is sufficient per UI-SPEC Surface 3 Interaction Contract row 1. The draft guard
is implemented as **state-gated removal** (D-96 — buttons absent, not disabled)
with defense in depth against the Plan 11-04 server-side 422 for draft periods
(Pitfall 5).

The original Task 2 of this plan (extending `actionTypeToKey()` in the OE
scorecard with the 4 D-109 export action labels) was hoisted to Plan 11-01a
Task 2 during revision. Reason: any `office_activity_log` row written by Wave 2
plans (11-02/03/04) should render the specific label immediately rather than
transiently showing the generic `action_unknown` fallback during rollout. This
plan inherits that work as a precondition; the end-of-phase UAT (Task 2 below)
still verifies the OE scorecard renders the four new labels correctly in both
TR and EN — verification responsibility stays here even though the schema/map
edit moved earlier.

## Tasks Completed

### Task 1 — Extend PeriodDetailControls.tsx with Excel + PDF download buttons (commit `4f6d864`)

Edited `src/components/admin/PeriodDetailControls.tsx` per the plan's `<action>`
block exactly:

1. **Import extension:** changed `import { RefreshCw } from 'lucide-react';` to
   `import { RefreshCw, FileSpreadsheet, FileText } from 'lucide-react';`. No
   other imports touched.
2. **Conditional block inserted** AFTER the three existing status-branch
   ternaries (`draft`, `finalized`, `submitted`) and BEFORE the closing `</div>`
   of the flex row:
   - `{status !== 'draft' && (<>...</>)}` wrapping two `<a href download>`
     anchors, each wrapping a `<Button variant="outline" size="sm">`.
   - Excel anchor: `href={'/api/exports/hakedis/${periodId}'}` + lucide
     `<FileSpreadsheet>` icon + `t('detail.export_excel')` label.
   - PDF anchor: `href={'/api/exports/hakedis/${periodId}/pdf'}` + lucide
     `<FileText>` icon + `t('detail.download_pdf')` label.
   - `aria-label` on each anchor (UI-SPEC Surface 3 row 4 a11y).
   - `aria-hidden="true"` on each lucide icon.

Verification gates passed at commit time:
- `grep -c "/api/exports/hakedis/" src/components/admin/PeriodDetailControls.tsx` = 2 (Excel + PDF hrefs).
- `grep -c "status !== 'draft'" src/components/admin/PeriodDetailControls.tsx` = 1 (the new conditional).
- `grep -c "FileSpreadsheet\|FileText" src/components/admin/PeriodDetailControls.tsx` = 4 (1 import + 1 JSX use each).
- `grep -c "aria-label=" src/components/admin/PeriodDetailControls.tsx` ≥ 2.
- `grep -c "aria-hidden=\"true\"" src/components/admin/PeriodDetailControls.tsx` ≥ 3 (original RefreshCw + new FileSpreadsheet + new FileText).
- `tsc --noEmit` clean.
- `vitest run tests/exports.test.ts tests/hakedis.test.ts`: 61 passed (no regressions).
- `git diff`: +31 / -1 — additions only (the single deletion is the original `import { RefreshCw }` line, replaced by the extended import).

### Task 2 — End-of-phase UAT (HUMAN-VERIFY checkpoint — APPROVED)

User exercised the period-detail buttons end-to-end + cross-checked the OE
scorecard labels in the browser per the checkpoint protocol:

| Verification gate | Result |
|-------------------|--------|
| Draft period detail page: control row shows Recompute + Finalize + Delete; NO Excel / PDF buttons (UI-SPEC Surface 2 Draft guard, D-96 removal) | PASS |
| Finalized period detail page: control row shows "Tahakkuk Et / Mark Submitted" + two outline buttons "Excel'e Aktar / Export Excel" + "PDF İndir / Download PDF" | PASS |
| Locale toggle TR → EN: D-111 bilingual joined labels render byte-identical (same TR/EN string in both locales) | PASS |
| Downloaded `.pdf` opened in real PDF viewer (Preview/Acrobat): Turkish glyphs `ş ı ğ ç ö ü` render as actual accented characters (not tofu / blank rectangles / `?`) — header "Proje / Project: İstanbul …" + section titles "Yeşil Defter" / "Hesap Özeti" visually inspected | PASS |
| Downloaded `.xlsx` opened in Excel/LibreOffice: Hesap Özeti sheet renders money values as formatted numbers (locale-aware grouping: `1.234,56` under tr-TR or `1,234.56` under en-US); underlying decimal precision preserved | PASS |
| OE scorecard `/dashboard/analytics/office-engineers/{userId}` TR locale: activity log shows the 4 specific labels — "Hakkediş PDF'i indirildi", "Hakkediş Excel'i indirildi", "Gönderim listesi dışa aktarıldı", "Performans özeti dışa aktarıldı" — NOT the "Administrative action" fallback | PASS |
| OE scorecard EN locale: the 4 labels switch to "Downloaded hakkediş PDF", "Downloaded hakkediş Excel", "Exported submission ledger", "Exported performance summary" | PASS |

User resume signal: `approved`.

VALIDATION.md Manual-Only Verifications rows 2–4 are now SATISFIED:
- Row 2 (period detail draft guard) — verified.
- Row 3 (PDF Turkish glyphs in real viewer) — verified.
- Row 4 (Excel locale money grouping) — verified.

D-109 traceability is end-to-end confirmed: every Wave 2 export action writes
an `office_activity_log` row, and the OE scorecard renders the specific label
via the `actionTypeToKey()` map extension (hoisted to Plan 11-01a Task 2) +
i18n keys (also added there) in both TR and EN.

## Files Created/Modified

**Modified:**
- `src/components/admin/PeriodDetailControls.tsx` — +31 / -1 (additive only)

**Created:**
- `.planning/phases/11-exports/11-06-SUMMARY.md` (this file)

**Not modified (per plan revision):**
- `src/app/dashboard/(admin)/analytics/office-engineers/[userId]/page.tsx` —
  the original Task 2 actionTypeToKey() extension was hoisted to Plan 11-01a
  Task 2; this plan inherited it as a precondition. UAT confirmed the labels
  render correctly via that earlier work.
- `messages/{en,tr}.json` — the 4 `action_*_exported` keys were added in Plan
  11-01a Task 2; the 2 `detail.export_*` / `detail.download_*` keys were
  added in Plan 11-01b. This plan only consumes them.

## Deviations from Plan

None — plan executed exactly as written.

The only structural change versus the original plan draft was the hoisting of
the OE scorecard `actionTypeToKey()` map extension to Plan 11-01a Task 2, which
was already recorded as a planning decision in the plan file itself (lines 23 +
55-58 + 232) before execution began. No deviations were introduced during this
execution — Task 1 landed in a single commit matching every acceptance criterion;
Task 2 was a human-verify checkpoint and returned `approved` on first round with
no UAT bugs surfaced and no Rule 1–3 fixes required.

## Known Stubs

None. Both new buttons are wired to real route handlers shipped in Plan 11-04
(`/api/exports/hakedis/[periodId]` for Excel, `/api/exports/hakedis/[periodId]/pdf`
for PDF). The draft guard is handled by client-side state-gated removal (D-96)
and server-side 422 (Plan 11-04 Pitfall 5).

## Threat Flags

None — the threat surface is exactly as enumerated in the plan's `<threat_model>`.
All mitigations are in place:

- **T-11-06-AUTH** (Spoofing): route handlers behind the anchors are independently
  auth-guarded per D-114 (Plan 11-04). 401 returned on null session.
- **T-11-06-DRAFT** (Tampering): buttons REMOVED (not disabled) when
  `status === 'draft'`; server-side 422 in Plan 11-04 Pitfall 5 — defense in depth.
- **T-11-06-IDOR** (Information Disclosure): `periodId` is server-rendered from a
  tenant-scoped query (Plan 10 page logic); a malicious URL edit hits Plan 11-04's
  tenant-scoped 404.
- **T-11-06-XSS** (Tampering): `t()` returns trusted translation strings from
  compiled message files; React JSX auto-escapes; no `dangerouslySetInnerHTML`.
- **T-11-06-MAP-OVERWRITE** (Tampering): `actionTypeToKey()` falls through to
  `'action_unknown'` for unmapped strings; the DB-write side is constrained by
  the TypeScript `OfficeActionType` union (Plan 11-01a) — only the 20 known
  strings can ever be inserted by app code.

## Phase 11 Closure Notes

This is the **final plan of Phase 11**. With Task 2's `approved` signal:

- **D-108** (distributed export UX) is fully complete — hub page (Plan 11-05) +
  period-detail buttons (this plan) both wired to the same 4 route handlers.
- **D-109** (export action traceability) is end-to-end verified — every export
  writes an `office_activity_log` row (Plans 11-02/03/04), and the OE scorecard
  renders specific labels via the Plan 11-01a Task 2 hoisted map + i18n keys.
- **EXP-01..04** all reachable via UI (Submission Ledger, Hakkediş Excel,
  Performance Summary, Hakkediş PDF) — both from the hub and (for hakkediş) from
  the period detail surface.
- **VALIDATION.md Manual-Only Verifications** rows 1–4 all SATISFIED across
  Plans 11-05 (row 1) and 11-06 (rows 2–4).

Phase 11 is ready for `/gsd:verify-work`.

## Self-Check: PASSED

- `src/components/admin/PeriodDetailControls.tsx` — FOUND (modified by commit `4f6d864`, +31 / -1)
- Task 1 commit `4f6d864` — FOUND in `git log` (`feat(11-06): extend PeriodDetailControls with Excel + PDF download buttons (D-108 + UI-SPEC Surface 2)`)
- No duplicate `11-06` commits in `git log --oneline --all`
- `.planning/phases/11-exports/11-06-SUMMARY.md` — written by this self-check step
