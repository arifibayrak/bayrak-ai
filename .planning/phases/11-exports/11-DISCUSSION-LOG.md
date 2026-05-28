# Phase 11: Exports - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-28
**Phase:** 11-exports
**Areas discussed:** PDF stack & TR font, Exports page UX + triggers, Performance summary scope, Bilingual headers + filenames

---

## PDF stack & TR font

### PDF library
| Option | Description | Selected |
|--------|-------------|----------|
| @react-pdf/renderer (recommended) | JSX-based, pure Node, TTF embed via Font.register, streams cleanly. Best default for serverless. | ✓ |
| HTML → PDF (Puppeteer + @sparticuz/chromium) | Pixel-perfect rendering by reusing HTML, but +50–100MB Chromium binary and cold-start cost on Vercel. | |
| pdfmake | Declarative + small but font setup is fiddly (vfs_fonts rebuild). | |
| You decide | Pick during planning. | |

**User's choice:** @react-pdf/renderer → D-105

### Embedded TTF font
| Option | Description | Selected |
|--------|-------------|----------|
| DejaVu Sans (recommended) | Classic free TTF with full Latin Extended-A, well-tested for Turkish financial PDFs. | (recommended) |
| Noto Sans | Modern, designed with cross-script fidelity; excellent Turkish glyph design. | |
| Inter / project UI font | Match the on-screen dashboard font for in-app/PDF consistency. | |
| You decide | Pick during planning. | ✓ |

**User's choice:** You decide → D-106 (Claude recommends DejaVu Sans for lowest-risk Turkish rendering; planner may switch to project UI font if already bundled)

### PDF generation timing
| Option | Description | Selected |
|--------|-------------|----------|
| On-demand (recommended) | Render each download click from frozen snapshot fields; deterministic; no storage. | ✓ |
| Eager at finalize, stored in Vercel Blob | Render once at finalize, store in Blob; truly immutable PDF even against future render-code changes. | |
| You decide | Pick during planning. | |

**User's choice:** On-demand → D-107 (preserves Phase 10's D-95/D-96 immutability story via snapshot-only reads)

---

## Exports page UX + triggers

### Trigger surfaces
| Option | Description | Selected |
|--------|-------------|----------|
| Distributed + Exports hub (recommended) | Filter-aware exports (ledger + perf) on /dashboard/exports; hakkediş Excel + PDF primary on period detail, secondary on Exports hub via period picker. | ✓ |
| Centralised on /dashboard/exports only | Every download on the hub; period picker for hakkediş; no buttons on the period detail page. | |
| Distributed, no hub | Hakkediş only on period detail; ledger + perf only on hub; no hub period picker. | |
| You decide | Pick during planning. | |

**User's choice:** Distributed + hub → D-108

### Activity logging
| Option | Description | Selected |
|--------|-------------|----------|
| Yes — log every export (recommended) | Four new OFFICE_ACTION_TYPES; consistent with createPeriod/finalize/delete logging; legally-useful audit trail. | ✓ |
| Hakkediş only (PDF + Excel) | Log only the hakkediş exports; ledger + perf are silent reads. | |
| No logging | Exports are silent reads; office_activity_log stays as-is. | |

**User's choice:** Yes, log every export → D-109

---

## Performance summary scope

| Option | Description | Selected |
|--------|-------------|----------|
| Workers + auditors (SC3 literal) | Two-tab workbook; office engineers excluded; matches SC3 exactly. | ✓ |
| Workers + auditors + office engineers | Three-tab workbook; goes beyond SC3 but completes 3-role parity. | |
| You decide | Pick during planning. | |

**User's choice:** Workers + auditors → D-110

---

## Bilingual headers + filenames

### Header format
| Option | Description | Selected |
|--------|-------------|----------|
| Joined 'TR / EN' single row (recommended) | One row per sheet, slash-joined; matches UI button label convention (Aç / Open Period). | ✓ |
| Two-row header (TR row + EN row) | Stacked language rows, freeze panes on row 2; cleaner per-locale reading; more complex. | |
| You decide | Pick during planning. | |

**User's choice:** Joined "TR / EN" → D-111

### Filename pattern
| Option | Description | Selected |
|--------|-------------|----------|
| Verbose with project + date (recommended) | hakkedis-{periodNumber}-{projectSlug}-{YYYYMMDD}.pdf, etc.; office engineers find files later without opening them. | ✓ |
| Minimal | hakkedis-{periodNumber}.pdf, etc.; shorter but ambiguous across projects. | |
| You decide | Pick during planning. | |

**User's choice:** Verbose with project + date → D-112

---

## Claude's Discretion
- **D-106** embedded TTF font (DejaVu Sans recommended; planner may swap to project UI font if already bundled).
- ExcelJS streaming buffer details, freeze-pane behavior, exact column ordering per sheet.
- `/dashboard/(admin)/exports` page layout — KpiCard cards vs button list; decide during UI-SPEC.
- Error-state UX (block draft-period exports server-side AND hide trigger client-side).
- Period picker filter on the Exports hub (`status != 'draft'`).
- PDF metadata (Title, Author, CreationDate).

## Deferred Ideas
- Email / queue delivery of exports — v1 is direct download only.
- Excel template branding (logo, watermark, header band) — v1 uses clean defaults.
- Cross-language export variants (`*.tr.xlsx` + `*.en.xlsx`) — joined TR/EN headers cover SC1.
- Eager PDF storage in Vercel Blob — explicitly out (D-107 on-demand).
- Office-engineer performance summary tab — out of SC3 (D-110 workers + auditors only).
- Per-period download audit beyond the single `hakedis_pdf_exported` row — v1 logs actor + period + timestamp; richer analytics deferred.
- Reviewed-not-folded todos: `submission-detail-map-link.md` (Phase-8 follow-up), `tenant-settings-seed-fk-safe.md` (Phase-9 follow-up).
</content>
