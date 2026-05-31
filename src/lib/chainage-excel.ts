/**
 * src/lib/chainage-excel.ts
 *
 * buildChainageLedger — 8-column ExcelJS workbook for the CHN-07 as-built export.
 *
 * Columns (fixed order per 15-CONTEXT.md locked decision):
 *   1. Km Başlangıç  — formatChainage(bucket.bucketStart)
 *   2. Km Bitiş      — formatChainage(bucket.bucketEnd)
 *   3. İş Adedi      — approved submission count
 *   4. Malzeme       — BOQ material (sanitizeExcelCell — T-15-06-FORMULA)
 *   5. Miktar        — BOQ quantity string (no parseFloat — D-116)
 *   6. Birim         — BOQ unit (sanitizeExcelCell — T-15-06-FORMULA)
 *   7. İşçi          — worker display names joined (sanitizeExcelCell)
 *   8. Denetçi       — auditor display names joined (sanitizeExcelCell)
 *
 * Security:
 *   T-15-06-FORMULA: every user-content string cell wrapped in sanitizeExcelCell
 *   (CVE-2014-3524 formula-injection mitigation).
 *
 * D-116: numeric/quantity strings flow DIRECTLY into cells — never parseFloat.
 *
 * NOTE: ExcelJS XLSX format does NOT persist column keys. Tests that read back
 * the workbook must address cells by 1-based numeric index, not by key string
 * (Phase 11 Plan 11-02 decision — confirmed).
 */

import ExcelJS from 'exceljs';
import { sanitizeExcelCell } from '@/lib/excel';
import { formatChainage } from '@/lib/format-chainage';
import type { ChainageBucket } from '@/lib/chainage-data';

export type ChainageLedgerInput = {
  buckets: ChainageBucket[];
  projectId?: string;
  generatedAt?: Date;
};

/**
 * buildChainageLedger — build a single-sheet ExcelJS workbook with 8 fixed columns
 * for the as-built chainage export.
 *
 * Returns a Node Buffer — caller wraps in new Uint8Array(buf) for NextResponse.
 */
export async function buildChainageLedger(input: ChainageLedgerInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('As-Built Chainage');

  // 8 columns in fixed order (per 15-CONTEXT.md + plan 15-06 must_haves)
  // NOTE: keys are NOT persisted in XLSX format — tests use 1-based numeric index.
  sheet.columns = [
    { header: 'Km Başlangıç', key: 'kmStart',       width: 14 },
    { header: 'Km Bitiş',     key: 'kmEnd',         width: 14 },
    { header: 'İş Adedi',     key: 'jobCount',      width: 10 },
    { header: 'Malzeme',      key: 'material',      width: 28 },
    { header: 'Miktar',       key: 'quantity',      width: 12 },
    { header: 'Birim',        key: 'unit',          width: 10 },
    { header: 'İşçi',         key: 'worker',        width: 24 },
    { header: 'Denetçi',      key: 'auditor',       width: 24 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const bucket of input.buckets) {
    // Collapse BOQ breakdown into joined strings for the single row per bucket.
    // Multiple BOQ items in a bucket are separated by ' / ' for readability.
    const materials = bucket.boqBreakdown.map(b => sanitizeExcelCell(b.material)).join(' / ');
    // D-116: quantity strings flow direct — no parseFloat
    const quantities = bucket.boqBreakdown.map(b => b.quantity).join(' / ');
    const units = bucket.boqBreakdown.map(b => sanitizeExcelCell(b.unit)).join(' / ');

    const workers  = sanitizeExcelCell(bucket.workers.join(', '));
    const auditors = sanitizeExcelCell(bucket.auditors.join(', '));

    sheet.addRow({
      kmStart:   formatChainage(bucket.bucketStart),
      kmEnd:     formatChainage(bucket.bucketEnd),
      jobCount:  bucket.approvedCount,
      material:  materials,
      quantity:  quantities,
      unit:      units,
      worker:    workers,
      auditor:   auditors,
    });
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
