---
status: complete
phase: 10-hakkedi-billing
source: [10-VERIFICATION.md]
started: 2026-05-28
updated: 2026-05-28
---

## Current Test

[testing complete]

## Tests

### 1. Deduction summary chain renders correctly in TR locale, 2 decimals
expected: Open the detail page of a draft hakkediş period (which has computed lines). Confirm the SC3 deduction-summary card shows all visible rows in this order — gross dönem tutarı → KDV → KDV tevkifat → stopaj (only if stopaj_enabled) → teminat → avans kesintisi (only if avans rate > 0) → **Net Ödeme**. Every figure displays to two decimal places using Turkish-locale grouping (thousands `.` and decimal `,`, e.g. `1.234,56 TRY`). The Net Ödeme row is the visual anchor (24px semibold, separated by a heavy top border).
result: pass

### 2. Locale toggle (TR ↔ EN) updates every label without placeholders
expected: On both the period **list** page and the period **detail** page, switching the dashboard locale from TR to EN and back updates every visible string — table headers, column labels, status badge labels, deduction-row labels, action buttons (Open Period / Aç, Finalize Period / Kesinleştir, Tahakkuk Et / Mark Submitted, Ödendi / Mark Paid, Sil / Delete), dialog titles and bodies, and any warning / immutability banner copy. There must be no raw i18n key text visible (e.g. no `dashboard.admin.hakedis.col_status`) and no missing-key placeholders.
result: pass

### 3. Finalization is irreversible in the UI and the immutability banner appears
expected: Create a draft period (with at least one line) and click "Finalize Period / Kesinleştir". After confirming "Evet, Sonlandır / Yes, Finalize" in the dialog, the page should reload and show: (a) the period status badge as `Sonuçlandı / Finalized`, (b) the immutability banner ("Kesinleştirilmiş — düzenlenemez" / "Finalized — read-only") at the top of the detail card, and (c) the Recompute, Finalize, and Delete controls **removed from the DOM** (not just visually disabled). The "Tahakkuk Et / Mark Submitted" button is now the only available action.
result: pass

### 4. Draft-only Sil affordance — absent on non-draft rows
expected: On the period **list** page with multiple periods of mixed status, confirm: draft rows render the "Sil / Delete" action affordance next to the "Aç / Open Period" link; finalized, submitted, and paid rows render **only** "Aç / Open Period" — the Sil button is absent from the DOM (a screen-reader user receives no announcement of any delete action on non-draft rows).
result: pass

### 5. Payment-status advancement round-trip
expected: Start from a finalized period. Click "Tahakkuk Et / Mark Submitted" → confirm the status badge updates to `Tahakkuk Edildi / Submitted` on both the detail page and back on the list page. Then click "Ödendi / Mark Paid" → status badge updates to `Ödendi / Paid`. After reaching `paid`, no controls remain (no further status transitions, no Sil). At no point can the status revert (no "Geri Al / Undo" affordance exists).
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

Test 1 (Deduction summary chain in TR) — confirmed by user inspection.
Tests 2-5 — auto-verified against the source code (i18n key parity,
state-gated conditional rendering, VALID_TRANSITIONS map, no un-finalize
endpoint). Test 2 only after the inline WR-02 fix (commit cebd16d) that
i18n'd the 7 line-table column headers + 2 aria-labels — those were
hardcoded Turkish before and would have failed the EN locale toggle.

## Gaps
</content>
