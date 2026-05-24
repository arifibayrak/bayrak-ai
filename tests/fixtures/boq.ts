/**
 * BOQ Excel test fixtures.
 *
 * Generates in-memory .xlsx Buffers for use in parseBoqExcel unit tests.
 * Columns: A=Malzeme/Material, B=Birim/Unit, C=Sözleşme Miktarı/Contracted Qty
 */

import ExcelJS from "exceljs";

/**
 * Creates a valid BOQ .xlsx Buffer with 3 rows:
 *   Row 2: DN200 HDPE Boru, m, 1500    (standard numeric)
 *   Row 3: DN300 Çelik Boru, m³, 250   (standard numeric)
 *   Row 4: Vana, adet, 123.5           (stored as text "123,5" — Turkish decimal)
 *
 * The Turkish decimal row tests that parseBoqExcel handles comma-as-decimal-separator.
 */
export async function createValidBoqBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("BOQ");

  sheet.columns = [
    { header: "Malzeme / Material", key: "material", width: 40 },
    { header: "Birim / Unit", key: "unit", width: 15 },
    { header: "Sözleşme Miktarı / Contracted Qty", key: "qty", width: 25 },
  ];

  // Row 2: standard numeric
  sheet.addRow({ material: "DN200 HDPE Boru", unit: "m", qty: 1500 });

  // Row 3: standard numeric
  sheet.addRow({ material: "DN300 Çelik Boru", unit: "m³", qty: 250 });

  // Row 4: Turkish decimal — stored as a text string "123,5"
  // This tests the Turkish locale comma-as-decimal-separator handling
  const turkishDecimalRow = sheet.addRow({
    material: "Vana",
    unit: "adet",
    qty: null, // we'll set it manually as a string below
  });
  turkishDecimalRow.getCell(3).value = "123,5";

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * Creates an INVALID BOQ .xlsx Buffer with rows missing required fields:
 *   Row 2: missing material (empty cell A)
 *   Row 3: missing unit (empty cell B)
 *   Row 4: missing/invalid qty (text "abc" in cell C)
 *
 * parseBoqExcel should return { ok: false, errors: [...] } for this buffer.
 */
export async function createInvalidBoqBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("BOQ");

  sheet.columns = [
    { header: "Malzeme / Material", key: "material", width: 40 },
    { header: "Birim / Unit", key: "unit", width: 15 },
    { header: "Sözleşme Miktarı / Contracted Qty", key: "qty", width: 25 },
  ];

  // Row 2: missing material
  const row2 = sheet.addRow({ material: null, unit: "m", qty: 100 });
  row2.getCell(1).value = "";

  // Row 3: missing unit
  const row3 = sheet.addRow({ material: "Some Pipe", unit: null, qty: 50 });
  row3.getCell(2).value = "";

  // Row 4: invalid qty (non-numeric text)
  sheet.addRow({ material: "Widget", unit: "adet", qty: null });
  const lastRow = sheet.lastRow;
  if (lastRow) lastRow.getCell(3).value = "abc";

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
