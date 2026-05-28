// D-107: this component reads ONLY snapshot fields from PeriodLine + computed deductions.
// It never imports BOQ-item types or live project fields. The PDF is a frozen view of
// the period at finalization time; live BOQ changes do NOT affect the rendered output.

/**
 * src/lib/pdf/hakedis-pdf.tsx
 *
 * HakedisPdf — A4 hakkediş certificate rendered by @react-pdf/renderer.
 *
 * D-105: pure-Node PDF generation via renderToBuffer (no Chromium binary).
 * D-106: fontFamily 'DejaVuSans' is registered at module scope by registerFonts()
 *        BEFORE the first renderToBuffer call — DejaVu Sans has full Latin Extended-A
 *        coverage so Turkish glyphs (ğ ş ı ö ü ç İ Ş Ğ Ü Ö Ç) render correctly.
 * D-107: every field rendered MUST come from a snapshot column (materialSnapshot,
 *        unitSnapshot, unitPriceSnapshot, periodQty (DB-generated locked), periodValue,
 *        deductions.* (computed in Postgres from locked snapshot lines)) OR from the
 *        period header (periodNumber, periodEndDate, currencyCode, status). The
 *        component imports ONLY @react-pdf/renderer symbols + types from @/actions/hakedis.
 *
 * NOTE: NO 'use client' directive. react-pdf components are NOT React DOM — they are
 * rendered server-side to a binary buffer via renderToBuffer.
 */

import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { PeriodHeader, PeriodLine, PeriodDeductions } from '@/actions/hakedis';

const styles = StyleSheet.create({
  page: { fontFamily: 'DejaVuSans', fontSize: 9, padding: 32 },
  header: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#999999',
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  headerMeta: { fontSize: 9, color: '#555555' },
  sectionTitle: { fontSize: 11, fontWeight: 'bold', marginTop: 12, marginBottom: 6 },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#cccccc',
    paddingVertical: 4,
  },
  tableHeader: { fontWeight: 'bold', backgroundColor: '#f5f5f5' },
  colMaterial: { flex: 3 },
  colUnit: { flex: 1 },
  colNumeric: { flex: 1.5, textAlign: 'right' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    marginTop: 6,
    borderTopWidth: 1,
  },
  netLabel: { fontWeight: 'bold', fontSize: 11 },
  netValue: { fontWeight: 'bold', fontSize: 11 },
});

export type HakedisPdfData = {
  period: PeriodHeader;
  lines: PeriodLine[];
  deductions: PeriodDeductions;
  projectName: string;
  generatedAt: Date;
};

export function HakedisPdf({ data }: { data: HakedisPdfData }) {
  return (
    <Document
      title={`Hakkediş ${data.period.periodNumber}`}
      author="bayrak.ai"
      creationDate={data.generatedAt}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Hakkediş Belgesi / Hakkediş Certificate</Text>
          <Text style={styles.headerMeta}>Proje / Project: {data.projectName}</Text>
          <Text style={styles.headerMeta}>Dönem / Period: {data.period.periodNumber}</Text>
          <Text style={styles.headerMeta}>Bitiş Tarihi / End Date: {data.period.periodEndDate}</Text>
          <Text style={styles.headerMeta}>Para Birimi / Currency: {data.period.currencyCode}</Text>
          <Text style={styles.headerMeta}>Durum / Status: {data.period.status}</Text>
        </View>

        <Text style={styles.sectionTitle}>Yeşil Defter / Cumulative Register</Text>
        <View style={[styles.tableRow, styles.tableHeader]}>
          <Text style={styles.colMaterial}>Malzeme / Material</Text>
          <Text style={styles.colUnit}>Birim / Unit</Text>
          <Text style={styles.colNumeric}>Dönem Miktarı / Period Qty</Text>
          <Text style={styles.colNumeric}>Birim Fiyat / Unit Price</Text>
          <Text style={styles.colNumeric}>Dönem Tutarı / Period Value</Text>
        </View>
        {data.lines.map((line) => (
          <View key={line.id} style={styles.tableRow}>
            <Text style={styles.colMaterial}>{line.materialSnapshot}</Text>
            <Text style={styles.colUnit}>{line.unitSnapshot}</Text>
            <Text style={styles.colNumeric}>{line.periodQty}</Text>
            <Text style={styles.colNumeric}>{line.unitPriceSnapshot}</Text>
            <Text style={styles.colNumeric}>{line.periodValue}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Hesap Özeti / Payment Summary</Text>
        <View style={styles.summaryRow}>
          <Text>Brüt Hakediş / Gross</Text>
          <Text>{data.deductions.gross}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text>KDV / VAT</Text>
          <Text>{data.deductions.kdv}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text>KDV Tevkifat / VAT Withholding</Text>
          <Text>{data.deductions.tevkifat}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text>Stopaj / Withholding Tax</Text>
          <Text>{data.deductions.stopaj}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text>Teminat / Retention</Text>
          <Text>{data.deductions.teminat}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text>Avans Kesintisi / Advance Deduction</Text>
          <Text>{data.deductions.avans}</Text>
        </View>
        <View style={styles.netRow}>
          <Text style={styles.netLabel}>Net Ödeme / Net Payable</Text>
          <Text style={styles.netValue}>
            {data.deductions.net} {data.period.currencyCode}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/**
 * renderHakedisPdf — convenience wrapper that constructs the HakedisPdf React
 * element and pipes it through renderToBuffer. Keeps the route handler file
 * pure-TypeScript (route.ts, not route.tsx) so vitest/rolldown doesn't need
 * to parse JSX inside an api/.../[periodId] dynamic route path — which
 * triggered a rolldown JSX-parse failure on .tsx route files (#2026-05-28).
 */
export async function renderHakedisPdf(data: HakedisPdfData): Promise<Buffer> {
  return renderToBuffer(<HakedisPdf data={data} />);
}
