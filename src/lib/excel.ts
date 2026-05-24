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
