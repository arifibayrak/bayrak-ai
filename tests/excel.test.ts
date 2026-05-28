/**
 * tests/excel.test.ts
 *
 * Unit tests for parseBoqExcel and generateBoqTemplate (src/lib/excel.ts).
 * No DB access needed — pure unit tests using in-memory ExcelJS buffers.
 */

import { describe, it, expect } from 'vitest';
import { parseBoqExcel, generateBoqTemplate, sanitizeExcelCell } from '@/lib/excel';
import { createValidBoqBuffer, createInvalidBoqBuffer } from './fixtures/boq';

describe('parseBoqExcel', () => {
  it('parses a valid BOQ buffer and returns rows with correct values', async () => {
    const buffer = await createValidBoqBuffer();
    const result = await parseBoqExcel(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.rows).toHaveLength(3);

    // Row 2: DN200 HDPE Boru, m, 1500
    expect(result.rows[0].material).toBe('DN200 HDPE Boru');
    expect(result.rows[0].unit).toBe('m');
    expect(result.rows[0].plannedQty).toBe(1500);

    // Row 3: DN300 Çelik Boru, m³, 250
    expect(result.rows[1].material).toBe('DN300 Çelik Boru');
    expect(result.rows[1].unit).toBe('m³');
    expect(result.rows[1].plannedQty).toBe(250);
  });

  it('normalizes Turkish decimal comma "123,5" to 123.5', async () => {
    const buffer = await createValidBoqBuffer();
    const result = await parseBoqExcel(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Row 4 in the fixture has qty "123,5" as a text string (Turkish decimal)
    const vanaRow = result.rows.find((r) => r.material === 'Vana');
    expect(vanaRow).toBeDefined();
    expect(vanaRow!.plannedQty).toBe(123.5);
  });

  it('returns row-level errors for missing material, missing unit, and invalid qty', async () => {
    const buffer = await createInvalidBoqBuffer();
    const result = await parseBoqExcel(buffer);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors.length).toBeGreaterThanOrEqual(3);

    // Should have an error about missing material (row 2)
    const materialError = result.errors.find((e) => e.row === 2 && e.field.toLowerCase().includes('malzeme'));
    expect(materialError).toBeDefined();

    // Should have an error about missing unit (row 3)
    const unitError = result.errors.find((e) => e.row === 3 && e.field.toLowerCase().includes('birim'));
    expect(unitError).toBeDefined();

    // Should have an error about invalid qty (row 4)
    const qtyError = result.errors.find((e) => e.row === 4);
    expect(qtyError).toBeDefined();
  });
});

describe('generateBoqTemplate', () => {
  it('generates a valid xlsx buffer that is parseable by parseBoqExcel', async () => {
    const templateBuffer = await generateBoqTemplate();

    // Should produce a Buffer
    expect(Buffer.isBuffer(templateBuffer)).toBe(true);
    expect(templateBuffer.length).toBeGreaterThan(0);
  });

  it('template contains the example row that parseBoqExcel can parse', async () => {
    const templateBuffer = await generateBoqTemplate();
    const result = await parseBoqExcel(templateBuffer);

    // Template has one example row — should parse successfully
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].material).toBe('DN200 HDPE Boru');
    expect(result.rows[0].unit).toBe('m');
    expect(result.rows[0].plannedQty).toBe(5000);
  });
});

describe('sanitizeExcelCell — CVE-2014-3524 formula-injection mitigation (WARNING 5 fix)', () => {
  it('passes normal text through unchanged', () => {
    expect(sanitizeExcelCell('normal text')).toBe('normal text');
  });

  it("prefixes apostrophe to strings starting with '=' (formula injection)", () => {
    expect(sanitizeExcelCell('=cmd|/c calc')).toBe("'=cmd|/c calc");
  });

  it("prefixes apostrophe to strings starting with '+'", () => {
    expect(sanitizeExcelCell('+1234')).toBe("'+1234");
  });

  it("prefixes apostrophe to strings starting with '-'", () => {
    expect(sanitizeExcelCell('-1234')).toBe("'-1234");
  });

  it("prefixes apostrophe to strings starting with '@'", () => {
    expect(sanitizeExcelCell('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
  });

  it("prefixes apostrophe to strings starting with TAB", () => {
    expect(sanitizeExcelCell('\t=evil')).toBe("'\t=evil");
  });

  it("prefixes apostrophe to strings starting with CR", () => {
    expect(sanitizeExcelCell('\r=evil')).toBe("'\r=evil");
  });

  it('passes empty string through unchanged', () => {
    expect(sanitizeExcelCell('')).toBe('');
  });

  it('passes numeric strings (decimal money like 1234.56) through unchanged', () => {
    expect(sanitizeExcelCell('1234.56')).toBe('1234.56');
  });
});
