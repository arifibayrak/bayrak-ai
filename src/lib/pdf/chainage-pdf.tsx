/**
 * src/lib/pdf/chainage-pdf.tsx
 *
 * ChainagePdf — A4 as-built chainage report rendered by @react-pdf/renderer.
 *
 * Mirrors hakedis-pdf.tsx structure byte-for-byte (Phase 11 lesson):
 *   - NO 'use client' directive — react-pdf renders server-side via renderToBuffer
 *   - fontFamily 'DejaVuSans' registered by registerFonts() in the route handler
 *   - Document > Page > View (header) > View (table rows)
 *   - Same StyleSheet padding/border tokens as hakedis-pdf (SC-6 aesthetic parity)
 *
 * Columns match the 8-column Excel export (CHN-07 locked decision):
 *   Km Başlangıç, Km Bitiş, İş Adedi, Malzeme, Miktar, Birim, İşçi, Denetçi
 *
 * renderChainagePdf is the exported helper — keeps route.ts pure-TypeScript
 * (avoids rolldown JSX-parse failure on .tsx route files under dynamic paths).
 *
 * registerFonts() must be called in the route handler BEFORE the first
 * renderChainagePdf call (same pattern as hakedis pdf/route.ts).
 */

import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { formatChainage } from '@/lib/format-chainage';
import type { ChainageBucket } from '@/lib/chainage-data';

// ── Styles (mirroring hakedis-pdf.tsx tokens for aesthetic parity SC-6) ─────

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
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#cccccc',
    paddingVertical: 4,
  },
  tableHeader: { fontWeight: 'bold', backgroundColor: '#f5f5f5' },
  colKm:      { flex: 1.5 },
  colCount:   { flex: 0.8, textAlign: 'right' },
  colMaterial:{ flex: 2.5 },
  colNumeric: { flex: 1.2, textAlign: 'right' },
  colUnit:    { flex: 0.8 },
  colPerson:  { flex: 2 },
});

// ── Data types ────────────────────────────────────────────────────────────────

export type ChainagePdfData = {
  buckets: ChainageBucket[];
  projectId?: string;
  projectName?: string;
  generatedAt: Date;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ChainagePdf({ data }: { data: ChainagePdfData }) {
  return (
    <Document
      title="As-Built / Chainage"
      author="bayrak.ai"
      creationDate={data.generatedAt}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>As-Built Chainage / Yapılan İşler</Text>
          {data.projectName && (
            <Text style={styles.headerMeta}>Proje / Project: {data.projectName}</Text>
          )}
          {data.projectId && !data.projectName && (
            <Text style={styles.headerMeta}>Proje ID: {data.projectId}</Text>
          )}
          <Text style={styles.headerMeta}>
            Oluşturulma / Generated: {data.generatedAt.toISOString().slice(0, 10)}
          </Text>
        </View>

        {/* Table header row */}
        <View style={[styles.tableRow, styles.tableHeader]}>
          <Text style={styles.colKm}>Km Başlangıç</Text>
          <Text style={styles.colKm}>Km Bitiş</Text>
          <Text style={styles.colCount}>İş Adedi</Text>
          <Text style={styles.colMaterial}>Malzeme</Text>
          <Text style={styles.colNumeric}>Miktar</Text>
          <Text style={styles.colUnit}>Birim</Text>
          <Text style={styles.colPerson}>İşçi</Text>
          <Text style={styles.colPerson}>Denetçi</Text>
        </View>

        {/* Table body rows — one per bucket */}
        {data.buckets.map((bucket) => {
          const materials = bucket.boqBreakdown.map(b => b.material).join(' / ');
          const quantities = bucket.boqBreakdown.map(b => b.quantity).join(' / ');
          const units = bucket.boqBreakdown.map(b => b.unit).join(' / ');
          const workers = bucket.workers.join(', ');
          const auditors = bucket.auditors.join(', ');

          return (
            <View key={bucket.bucketIndex} style={styles.tableRow}>
              <Text style={styles.colKm}>{formatChainage(bucket.bucketStart)}</Text>
              <Text style={styles.colKm}>{formatChainage(bucket.bucketEnd)}</Text>
              <Text style={styles.colCount}>{bucket.approvedCount}</Text>
              <Text style={styles.colMaterial}>{materials}</Text>
              <Text style={styles.colNumeric}>{quantities}</Text>
              <Text style={styles.colUnit}>{units}</Text>
              <Text style={styles.colPerson}>{workers}</Text>
              <Text style={styles.colPerson}>{auditors}</Text>
            </View>
          );
        })}
      </Page>
    </Document>
  );
}

// ── Render helper ─────────────────────────────────────────────────────────────

/**
 * renderChainagePdf — convenience wrapper keeping route.ts pure-TypeScript.
 * registerFonts() must be called by the caller before invoking this function.
 */
export async function renderChainagePdf(data: ChainagePdfData): Promise<Buffer> {
  return renderToBuffer(<ChainagePdf data={data} />);
}
