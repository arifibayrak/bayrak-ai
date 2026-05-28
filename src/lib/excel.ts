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
