/**
 * src/lib/excel.ts
 *
 * ExcelJS BOQ parser and template generator (D-04, D-05, SETUP-02).
 *
 * parseBoqExcel: parses a .xlsx Buffer into BoqRows with validation.
 *   - Skips header row 1; data starts at row 2.
 *   - Normalizes Turkish decimal comma "123,5" → 123.5 (Pitfall 16).
 *   - Returns row-level errors for missing material/unit and invalid qty.
 *
 * generateBoqTemplate: generates a downloadable .xlsx template with
 *   the correct column headers and one example row (D-05).
 *
 * Security (T-06-02): cell values read as typed strings, never eval()'d.
 * Security (T-06-03): 4MB body limit enforced by Next.js framework.
 */

import ExcelJS from 'exceljs';
import type { CanonicalSubmission } from '@/lib/types';
import type { PortfolioWorker, PortfolioAuditor } from '@/actions/analytics';
import type { PeriodHeader, PeriodLine, PeriodDeductions } from '@/actions/hakedis';

export type BoqRow = {
  rowNumber: number;
  material: string;
  unit: string;
  plannedQty: number;
};

export type BoqParseResult =
  | { ok: true; rows: BoqRow[] }
  | { ok: false; errors: { row: number; field: string; message: string }[] };

/**
 * parseBoqExcel — parses a .xlsx buffer into validated BoqRows.
 *
 * Column layout (per D-05 template):
 *   A: Malzeme / Material
 *   B: Birim / Unit
 *   C: Sözleşme Miktarı / Contracted Qty
 *
 * Row 1 is the header and is skipped. Data rows start at row 2.
 * Turkish decimal comma "123,5" is normalized to "123.5" before parseFloat.
 */
export async function parseBoqExcel(buffer: Buffer): Promise<BoqParseResult> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS declares its own Buffer interface (extends ArrayBuffer).
  // Node 24's Buffer<ArrayBufferLike> is not assignable to it directly.
  // Extract the underlying ArrayBuffer slice to satisfy ExcelJS's type.
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(arrayBuffer as any);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { ok: false, errors: [{ row: 0, field: 'file', message: 'Empty workbook' }] };
  }

  const rows: BoqRow[] = [];
  const errors: { row: number; field: string; message: string }[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header row

    const material = String(row.getCell(1).value ?? '').trim();
    const unit = String(row.getCell(2).value ?? '').trim();
    const qtyRaw = row.getCell(3).value;

    if (!material) {
      errors.push({
        row: rowNumber,
        field: 'Malzeme',
        message: 'Malzeme zorunludur / Material is required',
      });
    }
    if (!unit) {
      errors.push({
        row: rowNumber,
        field: 'Birim',
        message: 'Birim zorunludur / Unit is required',
      });
    }

    // Normalize Turkish decimal comma (Pitfall 16): "123,5" → 123.5
    // String(qtyRaw) handles ExcelJS's typed cell values (number/string/null)
    const qtyStr = String(qtyRaw ?? '').replace(',', '.');
    const qty = parseFloat(qtyStr);

    if (isNaN(qty) || qty <= 0) {
      errors.push({
        row: rowNumber,
        field: 'Sözleşme Miktarı',
        message: 'Geçerli pozitif sayı gerekli / Must be a positive number',
      });
    }

    // Only add row when all fields are valid (collect errors separately above)
    if (material && unit && !isNaN(qty) && qty > 0) {
      rows.push({ rowNumber, material, unit, plannedQty: qty });
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  if (rows.length === 0) {
    return { ok: false, errors: [{ row: 0, field: 'file', message: 'No data rows found' }] };
  }
  return { ok: true, rows };
}

/**
 * generateBoqTemplate — generates a .xlsx template Buffer for download.
 *
 * Per D-05: downloadable template with correct column headers + one example row
 * so office engineers know the expected format.
 */
export async function generateBoqTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('BOQ');

  sheet.columns = [
    { header: 'Malzeme / Material', key: 'material', width: 40 },
    { header: 'Birim / Unit', key: 'unit', width: 15 },
    { header: 'Sözleşme Miktarı / Contracted Qty', key: 'qty', width: 25 },
  ];

  // Example row so engineers know the format
  sheet.addRow({ material: 'DN200 HDPE Boru', unit: 'm', qty: 5000 });

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ── sanitizeExcelCell ────────────────────────────────────────────────────────

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

/**
 * sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation (WARNING 5 fix).
 *
 * Prefixes a single apostrophe to any string starting with `=`, `+`, `-`, `@`,
 * TAB (`\t`), or CR (`\r`). Excel (and other spreadsheet apps) treats the leading
 * apostrophe as a literal-text marker — it is not displayed in the rendered cell
 * but prevents the cell from being interpreted as a formula.
 *
 * Apply to every user-content string cell in Plans 11-02 / 11-03 / 11-04
 * (displayName, materialSnapshot, notes, rejectionReason, etc.). Numeric strings
 * (decimal money like `1234.56`) never match the formula prefix and pass through
 * unchanged.
 */
// Consumed by buildSubmissionLedger (Plan 11-02), buildPerformanceSummary (Plan 11-03), buildHakedisExcel (Plan 11-04).
export function sanitizeExcelCell(value: string): string {
  if (typeof value !== 'string' || value.length === 0) return value;
  return FORMULA_PREFIX_RE.test(value) ? `'${value}` : value;
}

// ── buildSubmissionLedger (EXP-01 Plan 11-02) ────────────────────────────────

/**
 * buildSubmissionLedger — build a single-sheet ExcelJS workbook for the EXP-01
 * submission ledger export.
 *
 * Sheet name:   'Gönderim Listesi'
 * Header row:   14 bilingual TR/EN columns (D-111 — each contains ' / ')
 * Styling:      bold header (row 1), freeze pane ySplit:1
 * Money cells:  numFmt '#,##0.00' applied at column level — Postgres decimal
 *               strings flow into cell values WITHOUT parseFloat (D-116).
 * User content: wrapped in sanitizeExcelCell to mitigate CVE-2014-3524
 *               formula injection (T-11-02-FORMULA / WARNING 5).
 * Dates:        ISO strings → new Date(...) → numFmt 'dd.MM.yyyy HH:mm';
 *               Istanbul rendering happens client-side in Excel.
 * Empty rows:   returns non-empty buffer with header row + frozen pane.
 *
 * Returns:      Node Buffer — caller wraps in new Uint8Array(buf) for NextResponse.
 */
export async function buildSubmissionLedger(
  rows: CanonicalSubmission[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Gönderim Listesi');

  // 14 bilingual TR/EN headers per UI-SPEC + D-111 (verbatim).
  sheet.columns = [
    { header: 'ID / ID', key: 'id', width: 38 },
    { header: 'Proje / Project', key: 'projectName', width: 24 },
    { header: 'Personel / Person', key: 'workerName', width: 24 },
    { header: 'Denetçi / Auditor', key: 'auditorName', width: 24 },
    { header: 'Malzeme / Material', key: 'material', width: 30 },
    { header: 'Birim / Unit', key: 'unit', width: 10 },
    { header: 'Miktar / Quantity', key: 'quantity', width: 12 },
    { header: 'Birim Fiyat / Unit Price', key: 'unitPrice', width: 14 },
    { header: 'Para Birimi / Currency', key: 'currencyCode', width: 10 },
    { header: 'Kazanılan Değer / Earned Value', key: 'earnedValue', width: 16 },
    { header: 'Durum / Status', key: 'status', width: 14 },
    { header: 'Gönderim Tarihi / Submitted At', key: 'submittedAt', width: 18 },
    { header: 'Karar Tarihi / Decided At', key: 'decidedAt', width: 18 },
    { header: 'Konum Uyumu / Location Match', key: 'locationMatch', width: 16 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const r of rows) {
    sheet.addRow({
      id: r.id,
      // WARNING 5 / T-11-02-FORMULA: wrap all worker-typed string content
      projectName: sanitizeExcelCell(r.projectName),
      workerName: sanitizeExcelCell(r.workerName),
      auditorName: sanitizeExcelCell(r.auditorName ?? ''),
      material: sanitizeExcelCell(r.material),
      unit: r.unit,
      // D-116: money/quantity strings flow direct into cells — NEVER parseFloat
      quantity: r.quantity,
      unitPrice: r.unitPrice ?? '',
      currencyCode: r.currencyCode ?? '',
      earnedValue: r.earnedValue ?? '',
      status: r.status,
      submittedAt: r.submittedAt ? new Date(r.submittedAt) : null,
      decidedAt: r.decidedAt ? new Date(r.decidedAt) : null,
      locationMatch: r.locationMatch ?? '',
    });
  }

  // D-116: apply numFmt at column level — Excel formats the string-typed cells.
  sheet.getColumn('quantity').numFmt = '#,##0.00';
  sheet.getColumn('unitPrice').numFmt = '#,##0.00';
  sheet.getColumn('earnedValue').numFmt = '#,##0.00';
  sheet.getColumn('submittedAt').numFmt = 'dd.MM.yyyy HH:mm';
  sheet.getColumn('decidedAt').numFmt = 'dd.MM.yyyy HH:mm';

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ── buildPerformanceSummary (EXP-03 Plan 11-03) ──────────────────────────────

/**
 * buildPerformanceSummary — two-sheet ExcelJS workbook for the EXP-03 performance
 * summary export.
 *
 * Sheets (D-110 — Office Engineers explicitly EXCLUDED):
 *   1. 'Workers - Personel'    — per-worker KPIs from getPortfolioPeople({role:'worker'})
 *   2. 'Auditors - Denetçiler' — per-auditor KPIs from getPortfolioPeople({role:'auditor'})
 *
 *   NOTE: Plan 11-03 literally specified the names as 'Workers / Personel' and
 *   'Auditors / Denetçiler' (slash separator). Excel's worksheet-name spec
 *   prohibits `/ \ ? * : [ ]` in sheet names; ExcelJS enforces this and would
 *   throw "Worksheet name cannot include …". The bilingual intent (D-111 +
 *   D-110) is preserved by switching the separator to ' - ' on the sheet TAB,
 *   while every column HEADER inside the sheet keeps the ' / ' separator
 *   (D-111 gate satisfied by header strings, not by tab names).
 *
 * Workers sheet (8 columns):
 *   Personel / Person, Onaylanan / Approved, Reddedilen / Rejected, Bekleyen / Pending,
 *   Konum Uyumu / Location Compliance, Çıktı Miktarı / Output Qty,
 *   Para Birimi / Currency, Değer Katkısı / Value Contribution.
 *
 *   D-110 layout (RESEARCH Open Question 3 RESOLVED — supersedes original Pitfall 8):
 *     ONE row per worker. valueContributedByCurrency expansion:
 *       - 0 currencies → blank Para Birimi + blank Değer Katkısı (still appears in counts)
 *       - 1 currency  → currency code + decimal value
 *       - 2+ currencies → 'multi' marker in Para Birimi + JSON.stringify(map) in Değer Katkısı
 *
 *   WARNING 4 fix: locationComplianceRate populated from PortfolioWorker.
 *     locationComplianceRate (added by Plan 11-01b). Non-null when worker has
 *     approved submissions; null when zero approved (cell renders blank).
 *
 * Auditors sheet (5 columns):
 *   Personel / Person, Karar Sayısı / Decision Count, Ort. Süre (saat) / Avg Latency (hrs),
 *   Bekleyen / Pending Backlog, SLA İhlal Oranı / SLA Breach Rate.
 *
 * Styling:
 *   - Row 1 bold + frozen pane (ySplit:1) on BOTH sheets.
 *   - D-116 numFmt at column level (no parseFloat — strings flow direct):
 *       Workers: locationCompliance '0.00%'; outputQuantity '#,##0.00'; valueContribution '#,##0.00'
 *       Auditors: avgLatencyHours '#,##0.00'; slaBreachRate '0.00%'
 *
 * Security:
 *   - WARNING 5 / T-11-03-FORMULA: every user-content string cell (worker.displayName,
 *     auditor.displayName) wrapped in sanitizeExcelCell — CVE-2014-3524 mitigation.
 *
 * Returns: non-empty Buffer (headers + freeze panes present) even when both arrays empty.
 */
export async function buildPerformanceSummary(input: {
  workers: PortfolioWorker[];
  auditors: PortfolioAuditor[];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // ── Sheet 1: Workers - Personel ──────────────────────────────────────────
  // Original D-110 wording specified 'Workers / Personel'; Excel forbids '/' in
  // sheet names (ExcelJS throws). Switched separator to ' - ' for the tab name;
  // header strings inside the sheet still use ' / ' for D-111 compliance.
  const workersSheet = workbook.addWorksheet('Workers - Personel');
  workersSheet.columns = [
    { header: 'Personel / Person', key: 'displayName', width: 24 },
    { header: 'Onaylanan / Approved', key: 'submissionsApproved', width: 12 },
    { header: 'Reddedilen / Rejected', key: 'submissionsRejected', width: 12 },
    { header: 'Bekleyen / Pending', key: 'submissionsPending', width: 12 },
    { header: 'Konum Uyumu / Location Compliance', key: 'locationCompliance', width: 20 },
    { header: 'Çıktı Miktarı / Output Qty', key: 'outputQuantity', width: 16 },
    { header: 'Para Birimi / Currency', key: 'currencyCode', width: 12 },
    { header: 'Değer Katkısı / Value Contribution', key: 'valueContribution', width: 24 },
  ];
  workersSheet.getRow(1).font = { bold: true };
  workersSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const worker of input.workers) {
    // D-110 layout — ONE row per worker. Para Birimi + Değer Katkısı driven by currency count.
    const entries = Object.entries(worker.valueContributedByCurrency ?? {});
    let currencyCell: string = '';
    let valueCell: string = '';
    if (entries.length === 1) {
      currencyCell = entries[0][0];
      valueCell = entries[0][1];
    } else if (entries.length > 1) {
      // 'multi' marker keeps the column non-empty so filters still work.
      currencyCell = 'multi';
      valueCell = JSON.stringify(worker.valueContributedByCurrency);
    }
    // entries.length === 0 → both cells stay '' (worker appears in counts only)

    workersSheet.addRow({
      // WARNING 5 / T-11-03-FORMULA mitigation
      displayName: sanitizeExcelCell(worker.displayName),
      submissionsApproved: worker.submissionsApproved,
      submissionsRejected: worker.submissionsRejected,
      submissionsPending: worker.submissionsPending,
      // WARNING 4 fix: now populated from Plan 11-01b extension
      locationCompliance: worker.locationComplianceRate,
      // outputQuantity not on PortfolioWorker (D-110 column included for SC3 parity); blank for v1
      outputQuantity: null,
      currencyCode: currencyCell,
      valueContribution: valueCell,
    });
  }

  // D-116: apply numFmt at column level — values flow direct, no parseFloat.
  workersSheet.getColumn('locationCompliance').numFmt = '0.00%';
  workersSheet.getColumn('outputQuantity').numFmt = '#,##0.00';
  workersSheet.getColumn('valueContribution').numFmt = '#,##0.00';

  // ── Sheet 2: Auditors - Denetçiler ───────────────────────────────────────
  // See Sheet 1 note re: '/' prohibition in Excel sheet names.
  const auditorsSheet = workbook.addWorksheet('Auditors - Denetçiler');
  auditorsSheet.columns = [
    { header: 'Personel / Person', key: 'displayName', width: 24 },
    { header: 'Karar Sayısı / Decision Count', key: 'decisionsCount', width: 14 },
    { header: 'Ort. Süre (saat) / Avg Latency (hrs)', key: 'avgLatencyHours', width: 24 },
    { header: 'Bekleyen / Pending Backlog', key: 'pendingBacklog', width: 18 },
    { header: 'SLA İhlal Oranı / SLA Breach Rate', key: 'slaBreachRate', width: 20 },
  ];
  auditorsSheet.getRow(1).font = { bold: true };
  auditorsSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const a of input.auditors) {
    auditorsSheet.addRow({
      // WARNING 5 / T-11-03-FORMULA mitigation
      displayName: sanitizeExcelCell(a.displayName),
      decisionsCount: a.decisionsCount,
      avgLatencyHours: a.avgDecisionLatencyHours ?? null,
      pendingBacklog: a.pendingBacklogCount,
      slaBreachRate: a.slaBreachRateDecided ?? null,
    });
  }

  auditorsSheet.getColumn('avgLatencyHours').numFmt = '#,##0.00';
  auditorsSheet.getColumn('slaBreachRate').numFmt = '0.00%';

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ── buildHakedisExcel (EXP-02 Plan 11-04) ───────────────────────────────────

/**
 * buildHakedisExcel — three-sheet ExcelJS workbook for the EXP-02 hakkediş Excel
 * export (D-115).
 *
 * Sheets in order (D-115 — Turkish names per UI-SPEC):
 *   1. 'Yeşil Defter'  — cumulative register; 9 bilingual TR/EN columns per UI-SPEC
 *   2. 'Fiyat İcmali'  — this period's qty × unit price; 6 bilingual columns
 *   3. 'Hesap Özeti'   — 7 deduction rows (label | amount); 2 columns
 *
 * D-107 + D-116 + Pitfall 2 critical contract:
 *   Every money/qty cell value is the STRING from PeriodLine / PeriodDeductions
 *   exactly as Postgres returned it (numeric → decimal string). No parseFloat,
 *   no Number() coercion in this helper. ExcelJS recognises numeric strings
 *   and applies the column-level numFmt without precision loss.
 *
 * WARNING 5 / T-11-04-FORMULA mitigation:
 *   materialSnapshot + unitSnapshot were captured from worker-typed BOQ content
 *   at period freeze (D-95 snapshot). Both are wrapped in sanitizeExcelCell()
 *   on every addRow call in Yeşil Defter + Fiyat İcmali. Hesap Özeti labels
 *   are static literals and amount values are decimal strings (cannot match
 *   formula prefix) — no wrapping needed there.
 *
 * Styling: bold + frozen row 1 on every sheet; Net Ödeme label + amount bold.
 *
 * Returns: Node Buffer — caller wraps in new Uint8Array(buf) for NextResponse.
 */
export async function buildHakedisExcel(input: {
  period: PeriodHeader;
  lines: PeriodLine[];
  deductions: PeriodDeductions;
  projectName: string;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'bayrak.ai';
  workbook.created = new Date();

  // ── Sheet 1: Yeşil Defter ───────────────────────────────────────────────
  // 9 bilingual TR/EN columns per UI-SPEC (D-111: each header contains ' / ').
  const yesilDefter = workbook.addWorksheet('Yeşil Defter');
  yesilDefter.columns = [
    { header: 'Malzeme / Material', key: 'material', width: 30 },
    { header: 'Birim / Unit', key: 'unit', width: 10 },
    { header: 'Birim Fiyat / Unit Price', key: 'unitPrice', width: 14 },
    { header: 'Para Birimi / Currency', key: 'currency', width: 10 },
    { header: 'Önceki Birikimli / Previous Cumulative', key: 'previousCumulative', width: 18 },
    { header: 'Birikimli Miktar / Cumulative Qty', key: 'cumulativeQty', width: 18 },
    { header: 'Dönem Miktarı / Period Qty', key: 'periodQty', width: 16 },
    { header: 'Dönem Tutarı / Period Value', key: 'periodValue', width: 16 },
    { header: 'Birikimli Tutar / Cumulative Value', key: 'cumulativeValue', width: 18 },
  ];
  yesilDefter.getRow(1).font = { bold: true };
  yesilDefter.views = [{ state: 'frozen', ySplit: 1 }];

  for (const line of input.lines) {
    yesilDefter.addRow({
      // WARNING 5 / T-11-04-FORMULA: worker-typed BOQ content captured in snapshot
      material: sanitizeExcelCell(line.materialSnapshot),
      unit: sanitizeExcelCell(line.unitSnapshot),
      // D-107 + D-116: Postgres decimal strings flow direct — NEVER parseFloat
      unitPrice: line.unitPriceSnapshot,
      currency: line.currencyCodeSnapshot,
      previousCumulative: line.previousCumulativeQty,
      cumulativeQty: line.cumulativeQtyApproved,
      periodQty: line.periodQty,
      periodValue: line.periodValue,
      cumulativeValue: line.cumulativeValue,
    });
  }

  // D-116: apply numFmt at column level — values stay strings, Excel renders.
  yesilDefter.getColumn('unitPrice').numFmt = '#,##0.00';
  yesilDefter.getColumn('previousCumulative').numFmt = '#,##0.00';
  yesilDefter.getColumn('cumulativeQty').numFmt = '#,##0.00';
  yesilDefter.getColumn('periodQty').numFmt = '#,##0.00';
  yesilDefter.getColumn('periodValue').numFmt = '#,##0.00';
  yesilDefter.getColumn('cumulativeValue').numFmt = '#,##0.00';

  // ── Sheet 2: Fiyat İcmali ───────────────────────────────────────────────
  // 6 bilingual TR/EN columns per UI-SPEC.
  const fiyatIcmali = workbook.addWorksheet('Fiyat İcmali');
  fiyatIcmali.columns = [
    { header: 'Malzeme / Material', key: 'material', width: 30 },
    { header: 'Birim / Unit', key: 'unit', width: 10 },
    { header: 'Dönem Miktarı / Period Qty', key: 'periodQty', width: 16 },
    { header: 'Birim Fiyat / Unit Price', key: 'unitPrice', width: 14 },
    { header: 'Para Birimi / Currency', key: 'currency', width: 10 },
    { header: 'Dönem Tutarı / Period Value', key: 'periodValue', width: 16 },
  ];
  fiyatIcmali.getRow(1).font = { bold: true };
  fiyatIcmali.views = [{ state: 'frozen', ySplit: 1 }];

  for (const line of input.lines) {
    fiyatIcmali.addRow({
      material: sanitizeExcelCell(line.materialSnapshot),
      unit: sanitizeExcelCell(line.unitSnapshot),
      periodQty: line.periodQty,
      unitPrice: line.unitPriceSnapshot,
      currency: line.currencyCodeSnapshot,
      periodValue: line.periodValue,
    });
  }

  fiyatIcmali.getColumn('periodQty').numFmt = '#,##0.00';
  fiyatIcmali.getColumn('unitPrice').numFmt = '#,##0.00';
  fiyatIcmali.getColumn('periodValue').numFmt = '#,##0.00';

  // ── Sheet 3: Hesap Özeti ────────────────────────────────────────────────
  // 7 deduction rows (label | amount), 2 columns. D-111 ' / ' on every label.
  const hesapOzeti = workbook.addWorksheet('Hesap Özeti');
  hesapOzeti.columns = [
    { header: 'Kalem / Item', key: 'label', width: 32 },
    { header: 'Tutar / Amount', key: 'amount', width: 16 },
  ];
  // D-107 + D-116 + Pitfall 2: Postgres decimal strings flow DIRECTLY to cells;
  // ExcelJS recognises numeric strings and applies the numFmt without precision loss.
  hesapOzeti.addRow({ label: 'Brüt Hakediş / Gross', amount: input.deductions.gross });
  hesapOzeti.addRow({ label: 'KDV / VAT', amount: input.deductions.kdv });
  hesapOzeti.addRow({ label: 'KDV Tevkifat / VAT Withholding', amount: input.deductions.tevkifat });
  hesapOzeti.addRow({ label: 'Stopaj / Withholding Tax', amount: input.deductions.stopaj });
  hesapOzeti.addRow({ label: 'Teminat / Retention', amount: input.deductions.teminat });
  hesapOzeti.addRow({ label: 'Avans Kesintisi / Advance Deduction', amount: input.deductions.avans });
  const netRow = hesapOzeti.addRow({ label: 'Net Ödeme / Net Payable', amount: input.deductions.net });
  netRow.font = { bold: true };

  hesapOzeti.getColumn('amount').numFmt = '#,##0.00';
  hesapOzeti.getRow(1).font = { bold: true };
  hesapOzeti.views = [{ state: 'frozen', ySplit: 1 }];

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
