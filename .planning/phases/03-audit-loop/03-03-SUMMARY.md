---
phase: 03-audit-loop
plan: "03"
subsystem: telegram-bot
tags: [keyboards, messages, pure-lib, audit-loop, turkish-copy]
dependency_graph:
  requires: [03-01]
  provides: [callback_data-contract, audit-message-catalog]
  affects: [03-04, 03-05]
tech_stack:
  added: []
  patterns: [inline-keyboard-builder, message-catalog-extension]
key_files:
  created: []
  modified:
    - src/lib/bot-keyboards.ts
    - src/lib/bot-messages.ts
decisions:
  - "Buttons on same row (D-35: single tap is final — no confirmation dialog)"
  - "Five canned reject reasons on individual rows for mobile readability (D-30)"
  - "audit:reason:free sentinel for Başka (yaz) free-text path — parseable by slice not split"
  - "Nine message keys in D-26 respectful-siz tone matching established MESSAGES object style"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-24"
  tasks_completed: 2
  files_modified: 2
---

# Phase 3 Plan 03: Audit Keyboards + Message Catalog Summary

Pure lib extensions establishing the callback_data contract and Turkish message catalog that Plans 04 (fan-out) and 05 (decision handlers) consume directly.

## What Was Built

**Task 1: buildAuditKeyboard + buildRejectReasonKeyboard (bot-keyboards.ts)**

Two exported keyboard builder functions (pure, no DB, fully synchronous):

- `buildAuditKeyboard(submissionId: string): InlineKeyboard` — single-row [✅ Onayla] / [❌ Reddet] buttons. callback_data: `audit:approve:<uuid>` (50 bytes) and `audit:reject:<uuid>` (49 bytes), both within Telegram's 64-byte max (AUDIT-02 / T-3-CB-02 mitigated).
- `buildRejectReasonKeyboard(): InlineKeyboard` — five D-30 canned reasons each on their own `.row()` for mobile readability: Yetersiz iş, Yanlış konum, Eksik/bulanık fotoğraf, Yanlış miktar, Başka (yaz). The last uses the `audit:reason:free` sentinel that Plan 05's dispatcher will parse via `data.slice('audit:reason:'.length)`.

**Task 2: Nine audit/worker decision strings (bot-messages.ts)**

Nine keys added inside the existing `MESSAGES` object literal, all in D-26 tone (respectful "siz", field-friendly Turkish, light emoji affordance cues):

| Key | Type | Value/signature |
|-----|------|----------------|
| `auditOverDelivery` | `(newTotal, planned, unit) => string` | `⚠ Sözleşmeyi aşıyor (N/M unit)` |
| `auditRejectPrompt` | string | `'Ret gerekçesini seçin:'` |
| `auditRejectFreeTextPrompt` | string | `'Lütfen ret gerekçenizi yazın:'` |
| `auditUnauthorized` | string | `'Yetkisiz erişim'` |
| `auditAlreadyResolved` | string | `'Bu kayıt zaten çözüldü'` |
| `auditApprovedOutcome` | `(auditorName) => string` | `✅ Onaylandı — ${auditorName}` |
| `auditRejectedOutcome` | `(auditorName, reason) => string` | `❌ Reddedildi — ${auditorName}: ${reason}` |
| `workerApproved` | string | `'✅ Kaydınız onaylandı.'` |
| `workerRejected` | `(reason) => string` | `❌ Kaydınız reddedildi: ${reason}` |

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: keyboard builders | a04bb75 | src/lib/bot-keyboards.ts |
| Task 2: message strings | 8bcce6b | src/lib/bot-messages.ts |

## Verification Results

- `tsc --noEmit` exits 0 (only pre-existing type errors in test scaffold from 03-01)
- AUDIT-02 callback_data byte-length unit tests: PASS (2/2)
- AUDIT-03 unauthorized mock test: PASS (unaffected by this plan; remains green)
- Phase 2 regression baseline: 46/49 pass (same as pre-plan; 3 describeIfDb failures are network-gated, no DB in sandbox)
- DB-bound audit tests (AUDIT-04, AUDIT-05, AUDIT-06 SC5): expected RED — require Plan 03-02 migration + 03-04/05 handler implementation

## Deviations from Plan

None — plan executed exactly as written. The AUDIT-02 test was already scaffolded in Wave 0 (Plan 03-01), so this plan's TDD GREEN phase directly made those tests pass.

## Known Stubs

None. Both files are pure data/builders with no wiring stubs or placeholder values.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Both files are pure library modules that emit string data only. The callback_data byte-budget guarantee (T-3-CB-02) is enforced by the AUDIT-02 unit test.

## Self-Check: PASSED

- [x] src/lib/bot-keyboards.ts exists and contains buildAuditKeyboard + buildRejectReasonKeyboard
- [x] src/lib/bot-messages.ts exists and contains all 9 new keys
- [x] Commit a04bb75 exists
- [x] Commit 8bcce6b exists
- [x] AUDIT-02 tests pass
- [x] tsc --noEmit exits 0
