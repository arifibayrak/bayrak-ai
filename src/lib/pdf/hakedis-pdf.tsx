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
 *        coverage so Turkish glyphs (ğ ş ı ö ü ç İ Ş Ğ Ü Ö Ç) and the ₺ sign render.
 * D-107: every field rendered MUST come from a snapshot column (materialSnapshot,
 *        unitSnapshot, unitPriceSnapshot, periodQty (DB-generated locked), periodValue,
 *        deductions.* (computed in Postgres from locked snapshot lines)) OR from the
 *        period header (periodNumber, periodEndDate, currencyCode, status).
 *
 * All money/quantity values are formatted to exactly two decimals with Turkish
 * grouping (formatMoneyAmount → decimal.js + BigInt; never a JS float) and the
 * currency symbol — the raw snapshot strings are never printed directly.
 *
 * NOTE: NO 'use client' directive. react-pdf components are NOT React DOM — they are
 * rendered server-side to a binary buffer via renderToBuffer.
 */

import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { formatMoneyAmount, currencySymbol } from '@/lib/format-money';
import type { PeriodHeader, PeriodLine, PeriodDeductions } from '@/actions/hakedis';

// ── Brand palette (Field-Industrial) ─────────────────────────────────────────
const C = {
  graphite: '#23262D',
  steel:    '#3A3F4A',
  amber:    '#F5A623',
  light:    '#F5F6F8',
  border:   '#D9DCE0',
  muted:    '#6B7280',
  subtle:   '#AAB0B8',
  white:    '#FFFFFF',
  text:     '#1A1C20',
};

const styles = StyleSheet.create({
  page: { fontFamily: 'DejaVuSans', fontSize: 9, color: C.text, paddingBottom: 44 },

  // Header band (full-bleed graphite)
  headerBand: { backgroundColor: C.graphite, paddingVertical: 18, paddingHorizontal: 32, marginBottom: 18 },
  brand: { fontSize: 12, color: C.white, fontWeight: 'bold', marginBottom: 10, letterSpacing: 0.3 },
  brandAi: { color: C.amber },
  docTitle: { fontSize: 17, color: C.white, fontWeight: 'bold' },
  docSub: { fontSize: 8.5, color: C.subtle, marginTop: 3 },

  body: { paddingHorizontal: 32 },

  // Meta grid
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  metaItem: { width: '50%', marginBottom: 8 },
  metaLabel: { fontSize: 7, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  metaValue: { fontSize: 10, color: C.text, marginTop: 2 },
  pill: { alignSelf: 'flex-start', marginTop: 2, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 8, fontSize: 8, fontWeight: 'bold' },

  // Section title with amber underline
  sectionTitle: {
    fontSize: 10.5, fontWeight: 'bold', color: C.graphite,
    marginTop: 10, marginBottom: 6,
    borderBottomWidth: 2, borderBottomColor: C.amber, paddingBottom: 3,
  },

  // Lines table
  thead: { flexDirection: 'row', backgroundColor: C.graphite, paddingVertical: 5, paddingHorizontal: 6 },
  th: { color: C.white, fontSize: 8, fontWeight: 'bold' },
  row: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.border },
  rowAlt: { backgroundColor: C.light },
  td: { fontSize: 8.5, color: C.text },
  colMat: { flex: 3 },
  colUnit: { flex: 1, textAlign: 'center' },
  colNum: { flex: 1.7, textAlign: 'right' },

  // Payment summary (right-aligned column)
  sumWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  sumBox: { width: '58%' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: C.border },
  sumLabel: { fontSize: 9, color: C.muted },
  sumValue: { fontSize: 9, color: C.text },
  netBox: {
    marginTop: 10, backgroundColor: C.graphite, borderRadius: 5,
    paddingVertical: 11, paddingHorizontal: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  netLabel: { color: C.white, fontSize: 11, fontWeight: 'bold' },
  netValue: { color: C.amber, fontSize: 15, fontWeight: 'bold' },

  footer: {
    position: 'absolute', bottom: 18, left: 32, right: 32,
    fontSize: 7, color: C.muted, textAlign: 'center',
    borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 6,
  },
});

export type HakedisPdfData = {
  period: PeriodHeader;
  lines: PeriodLine[];
  deductions: PeriodDeductions;
  projectName: string;
  generatedAt: Date;
};

// ── Formatting helpers (precision-safe; two decimals; Turkish grouping) ───────
function money(value: string | null | undefined, currency: string): string {
  const amount = formatMoneyAmount(value, 'tr');
  if (amount === '—') return '—';
  return `${currencySymbol(currency)}${amount}`;
}
function qty(value: string | null | undefined): string {
  return formatMoneyAmount(value, 'tr'); // grouped, two decimals, no symbol
}
function fmtDate(d: string): string {
  const raw = d.split('T')[0];
  const [y, m, day] = raw.split('-');
  return y && m && day ? `${day}.${m}.${y}` : d;
}
function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function statusInfo(status: string): { label: string; bg: string; fg: string } {
  if (status === 'finalized') return { label: 'Kesinleşti / Finalized', bg: '#1F7A4D', fg: C.white };
  if (status === 'paid')      return { label: 'Ödendi / Paid',          bg: C.steel,  fg: C.white };
  return { label: 'Taslak / Draft', bg: C.amber, fg: C.graphite };
}

export function HakedisPdf({ data }: { data: HakedisPdfData }) {
  const cur = data.period.currencyCode;
  const st = statusInfo(data.period.status);

  return (
    <Document
      title={`Hakkediş ${data.period.periodNumber}`}
      author="bayrak.ai"
      creationDate={data.generatedAt}
    >
      <Page size="A4" style={styles.page}>
        {/* Header band */}
        <View style={styles.headerBand}>
          <Text style={styles.brand}>bayrak<Text style={styles.brandAi}>.ai</Text></Text>
          <Text style={styles.docTitle}>Hakkediş Belgesi</Text>
          <Text style={styles.docSub}>Progress Payment Certificate</Text>
        </View>

        <View style={styles.body}>
          {/* Meta grid */}
          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Proje / Project</Text>
              <Text style={styles.metaValue}>{data.projectName}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Dönem / Period</Text>
              <Text style={styles.metaValue}>{data.period.periodNumber}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Bitiş Tarihi / End Date</Text>
              <Text style={styles.metaValue}>{fmtDate(data.period.periodEndDate)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Para Birimi / Currency</Text>
              <Text style={styles.metaValue}>{cur} ({currencySymbol(cur)})</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Durum / Status</Text>
              <Text style={[styles.pill, { backgroundColor: st.bg, color: st.fg }]}>{st.label}</Text>
            </View>
          </View>

          {/* Lines table */}
          <Text style={styles.sectionTitle}>Yeşil Defter / Cumulative Register</Text>
          <View style={styles.thead}>
            <Text style={[styles.th, styles.colMat]}>Malzeme / Material</Text>
            <Text style={[styles.th, styles.colUnit]}>Birim / Unit</Text>
            <Text style={[styles.th, styles.colNum]}>Dönem Miktarı / Qty</Text>
            <Text style={[styles.th, styles.colNum]}>Birim Fiyat / Unit Price</Text>
            <Text style={[styles.th, styles.colNum]}>Dönem Tutarı / Value</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={line.id} style={[styles.row, ...(i % 2 === 1 ? [styles.rowAlt] : [])]}>
              <Text style={[styles.td, styles.colMat]}>{line.materialSnapshot}</Text>
              <Text style={[styles.td, styles.colUnit]}>{line.unitSnapshot}</Text>
              <Text style={[styles.td, styles.colNum]}>{qty(line.periodQty)}</Text>
              <Text style={[styles.td, styles.colNum]}>{money(line.unitPriceSnapshot, cur)}</Text>
              <Text style={[styles.td, styles.colNum]}>{money(line.periodValue, cur)}</Text>
            </View>
          ))}

          {/* Payment summary */}
          <Text style={styles.sectionTitle}>Hesap Özeti / Payment Summary</Text>
          <View style={styles.sumWrap}>
            <View style={styles.sumBox}>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>Brüt Hakediş / Gross</Text>
                <Text style={styles.sumValue}>{money(data.deductions.gross, cur)}</Text>
              </View>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>KDV / VAT</Text>
                <Text style={styles.sumValue}>{money(data.deductions.kdv, cur)}</Text>
              </View>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>KDV Tevkifat / VAT Withholding</Text>
                <Text style={styles.sumValue}>−{money(data.deductions.tevkifat, cur)}</Text>
              </View>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>Stopaj / Withholding Tax</Text>
                <Text style={styles.sumValue}>−{money(data.deductions.stopaj, cur)}</Text>
              </View>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>Teminat / Retention</Text>
                <Text style={styles.sumValue}>−{money(data.deductions.teminat, cur)}</Text>
              </View>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>Avans Kesintisi / Advance Deduction</Text>
                <Text style={styles.sumValue}>−{money(data.deductions.avans, cur)}</Text>
              </View>
              <View style={styles.netBox}>
                <Text style={styles.netLabel}>Net Ödeme / Net Payable</Text>
                <Text style={styles.netValue}>{money(data.deductions.net, cur)}</Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          bayrak.ai · Hakkediş {data.period.periodNumber} · Oluşturma / Generated: {fmtDateTime(data.generatedAt)}
        </Text>
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
