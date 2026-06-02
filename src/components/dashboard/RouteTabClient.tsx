'use client';

/**
 * RouteTabClient.tsx
 *
 * Client part of RouteTab (Phase 5 Plan 03, extended Phase 14).
 * When a route exists and the user is not replacing it, renders:
 *   1. <MapView> with the route GeoJSON + approved points + BOQ legend (D-49)
 *   2. The existing saved-route metadata card + Replace button below the map
 *   3. Kaynak Belge section — version history list (D-05) + inline PDF (D-06)
 * When no route exists (or replacing), renders the RouteUpload zone +
 * the DxfUpload section below a visual separator (Phase 14).
 *
 * Serialization fix (RESEARCH Pitfall 5): ExistingRoute.uploadedAt is now
 * a string (ISO-8601), not a Date. The card uses new Date(str).toLocaleDateString().
 *
 * Phase 14 additions:
 *  - ExistingRoute interface extended with 5 nullable provenance columns.
 *  - sourceDocuments prop receives newest-first list for Kaynak Belge (D-05).
 *  - DxfUpload mounted below RouteUpload behind a Separator.
 *  - Metadata card shows CRS, layer, total length, geometry version (conditional on non-null).
 *  - Kaynak Belge lists ALL source documents + inline PDF viewer (D-06).
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileText, Download } from 'lucide-react';
import { RouteUpload } from './RouteUpload';
import { DxfUpload } from './DxfUpload';
import { LandXmlUpload } from './LandXmlUpload';
import { MapView } from './MapView';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { BrandButton } from '@/components/brand/BrandButton';
import { BrandCard } from '@/components/brand/BrandCard';
import { BrandBadge } from '@/components/brand/BrandBadge';
import { BrandEmpty } from '@/components/brand/BrandEmpty';
import { BrandHeading } from '@/components/brand/BrandHeading';
import type { SourceDocument } from '@/actions/routes';

// Dynamic import for PdfViewer — 'use client' + ssr:false (react-pdf requirement)
const PdfViewer = dynamic(() => import('./PdfViewer').then((m) => ({ default: m.PdfViewer })), {
  ssr: false,
  loading: () => (
    <p className="text-sm text-muted-foreground py-4 text-center">
      PDF yükleniyor…
    </p>
  ),
});

// ── Types ─────────────────────────────────────────────────────────────────────

// uploadedAt is a string (ISO-8601) — Date objects cannot cross RSC→client boundary.
interface ExistingRoute {
  id: string;
  coordinateCount: number;
  uploadedAt: string;
  // Phase 14: provenance + version columns (nullable — GeoJSON routes have nulls)
  totalLengthM: string | null;
  sourceCrs: string | null;
  sourceLayer: string | null;
  geometryVersion: number | null;
  sourceBlobUrl: string | null;
}

interface BoqLegendItem {
  id: string;
  material: string;
  paletteSlot: number;
}

interface RouteTabClientProps {
  projectId: string;
  existingRoute: ExistingRoute | null;
  routeGeoJSON: GeoJSON.LineString | null;
  approvedPoints: GeoJSON.FeatureCollection;
  boqLegend: BoqLegendItem[];
  /** D-05 version history — newest first, ALL source documents (not just latest) */
  sourceDocuments: SourceDocument[];
}

// ── RouteTabClient component ───────────────────────────────────────────────────

export function RouteTabClient({
  projectId,
  existingRoute,
  routeGeoJSON,
  approvedPoints,
  boqLegend,
  sourceDocuments,
}: RouteTabClientProps) {
  const t = useTranslations('dashboard.route');
  const tc = useTranslations('common');
  const router = useRouter();
  const [savedRoute, setSavedRoute] = useState<ExistingRoute | null>(existingRoute);
  const [isReplacing, setIsReplacing] = useState(false);
  const [showAllVersions, setShowAllVersions] = useState(false);

  // After a successful upload (GeoJSON or DXF), update local state and switch
  // back to map view. uploadedAt stored as ISO string (Pitfall 5).
  // WR-04: use the real route id returned by the action.
  function handleUploadSuccess(count: number, routeId: string) {
    setSavedRoute({
      id: routeId,
      coordinateCount: count,
      uploadedAt: new Date().toISOString(),
      // Provisional placeholders — replaced almost immediately by the
      // router.refresh() below, which re-runs the RSC and re-renders this
      // component with the real provenance/version metadata and the updated
      // Kaynak Belge history list.
      totalLengthM: null,
      sourceCrs: null,
      sourceLayer: null,
      geometryVersion: null,
      sourceBlobUrl: null,
    });
    setIsReplacing(false);
    // WR-06: the action calls revalidatePath, but this client component holds
    // stale all-null state in useState. router.refresh() re-fetches the RSC
    // payload so CRS/length/version and the version-history list render the
    // real just-uploaded data without requiring a full navigation/reload.
    router.refresh();
  }

  // ── Kaynak Belge section ──────────────────────────────────────────────────────

  // Find the newest PDF document for the inline viewer (D-06)
  const newestPdf = sourceDocuments.find((doc) => doc.docType === 'pdf') ?? null;

  // Version history list — max 3 shown unless expanded
  const versionLimit = showAllVersions ? sourceDocuments.length : 3;
  const visibleDocs = sourceDocuments.slice(0, versionLimit);

  function KaynakBelgeSection() {
    if (sourceDocuments.length === 0 && !savedRoute?.sourceBlobUrl) {
      return null; // no source docs at all — nothing to show
    }

    return (
      <BrandCard>
        <BrandCard.Header className="flex items-center justify-between border-b border-slate-200">
          <BrandHeading as="h3" size="h3">
            {t('source_doc_title')}
          </BrandHeading>
        </BrandCard.Header>

        {/* Version history list (D-05) */}
        {sourceDocuments.length > 0 ? (
          <BrandCard.Body className="p-0">
            <ul className="divide-y divide-slate-100">
              {visibleDocs.map((doc) => (
                <li
                  key={doc.id}
                  className="px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {/* doc_type chip */}
                    <BrandBadge variant="neutral">
                      {doc.docType.toUpperCase()}
                    </BrandBadge>

                    {/* geometry version badge */}
                    {doc.geometryVersion !== null && (
                      <BrandBadge variant="info">
                        v{doc.geometryVersion}
                      </BrandBadge>
                    )}

                    {/* uploaded date */}
                    <span className="text-xs text-muted-foreground">
                      {new Date(doc.uploadedAt).toLocaleDateString('tr-TR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>

                  {/* Download link */}
                  <a
                    href={doc.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="shrink-0"
                  >
                    <BrandButton variant="outline" size="sm">
                      <Download className="h-4 w-4" />
                      {doc.docType === 'pdf'
                        ? 'PDF İndir'
                        : t('source_doc_download_dxf')}
                    </BrandButton>
                  </a>
                </li>
              ))}
            </ul>

            {/* Show all versions toggle */}
            {sourceDocuments.length > 3 && !showAllVersions && (
              <div className="px-4 py-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAllVersions(true)}
                  className="text-xs text-primary hover:underline"
                >
                  {t('source_doc_show_all_versions')} ({sourceDocuments.length})
                </button>
              </div>
            )}
          </BrandCard.Body>
        ) : null}

        {/* Inline PDF viewer (D-06) — latest PDF only */}
        {newestPdf ? (
          <BrandCard.Body>
            <p className="text-xs text-muted-foreground mb-3">
              PDF kaynak belgesi
            </p>
            <PdfViewer url={newestPdf.blobUrl} />
          </BrandCard.Body>
        ) : (
          <BrandCard.Body>
            <BrandEmpty
              icon={<FileText className="h-6 w-6 text-slate-300" />}
              title={t('source_doc_no_pdf')}
            />
          </BrandCard.Body>
        )}
      </BrandCard>
    );
  }

  // ── Map + metadata view (when route exists + not replacing) ──────────────────

  if (savedRoute && !isReplacing) {
    return (
      <div className="space-y-4">
        {/* D-49: map is the primary view; upload control is secondary action below */}
        <MapView
          routeGeoJSON={routeGeoJSON}
          approvedPoints={approvedPoints}
          boqLegend={boqLegend}
        />

        {/* Saved-route metadata card */}
        <BrandCard>
          <BrandCard.Body className="space-y-2 text-sm">
            {/* Coordinate count (always present) */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('coord_count')}</span>
              <span className="font-medium tabular-nums">
                {savedRoute.coordinateCount.toLocaleString('tr-TR')}
              </span>
            </div>

            {/* Upload date (always present) */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('upload_date')}</span>
              <span className="font-medium">
                {new Date(savedRoute.uploadedAt).toLocaleDateString('tr-TR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            {/* Phase 14 additions — conditional on non-null (DXF imports only) */}
            {savedRoute.totalLengthM && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {t('meta_total_length')}
                </span>
                <span className="font-medium font-mono tabular-nums">
                  {(parseFloat(savedRoute.totalLengthM) / 1000).toFixed(2)} km
                </span>
              </div>
            )}

            {savedRoute.sourceCrs && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t('meta_crs')}</span>
                <span className="font-medium">{savedRoute.sourceCrs}</span>
              </div>
            )}

            {savedRoute.sourceLayer && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {t('meta_source_layer')}
                </span>
                <span className="font-medium">{savedRoute.sourceLayer}</span>
              </div>
            )}

            {savedRoute.geometryVersion !== null && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {t('meta_geometry_version')}
                </span>
                <BrandBadge variant="info">
                  v{savedRoute.geometryVersion}
                </BrandBadge>
              </div>
            )}
          </BrandCard.Body>
        </BrandCard>

        {/* Replace route button */}
        <Button
          variant="outline"
          className="text-destructive border-destructive hover:bg-destructive/10"
          onClick={() => setIsReplacing(true)}
        >
          {t('replace_route')}
        </Button>

        {/* Kaynak Belge section (D-05/D-06) */}
        <KaynakBelgeSection />
      </div>
    );
  }

  // ── Upload zone (no route, or user triggered replace) ─────────────────────────

  return (
    <div className="space-y-4">
      {isReplacing && (
        <div className="text-sm text-muted-foreground">
          {t('replace_route_confirm')}
        </div>
      )}

      {/* GeoJSON upload (unchanged — RTE-04) */}
      <RouteUpload projectId={projectId} onSuccess={handleUploadSuccess} />

      {isReplacing && (
        <Button variant="ghost" onClick={() => setIsReplacing(false)}>
          {tc('cancel')}
        </Button>
      )}

      {/* Phase 14: DXF upload section — separated by a visual divider */}
      <Separator className="my-2" />
      <p className="text-xs text-muted-foreground text-center">
        {t('dxf_section_label')}
      </p>
      <DxfUpload projectId={projectId} onSuccess={handleUploadSuccess} />

      {/* LandXML alignment import — designed elevation + civil chainage */}
      <Separator className="my-2" />
      <LandXmlUpload projectId={projectId} onSuccess={handleUploadSuccess} />
    </div>
  );
}
