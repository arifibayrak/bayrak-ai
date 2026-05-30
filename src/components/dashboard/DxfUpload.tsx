'use client';

/**
 * DxfUpload.tsx
 *
 * DXF route import component — full state machine for the Office Engineer
 * CAD-file import flow (RTE-01/02/05, Phase 14).
 *
 * State machine: idle → parsing → layer-picker → crs-select → uploading-blob
 *                → previewing → (modal) → saving → saved | error
 *
 * Architecture:
 *  1. File selected → FileReader.readAsText → extractDxfLayers (client-side)
 *  2. Engineer picks layer + CRS → clicks "Önizle"
 *  3. Blob upload (via @vercel/blob/client upload()) → blobUrl
 *  4. previewDxf Server Action → GeoJSON + metadata (NO DB write)
 *  5. SatellitePreviewModal opens — Onayla disabled until onLoad
 *  6. "Onayla — Kaydet" → uploadDxf Server Action (DB write) → saved
 *
 * T-14-PREVIEW: No DB write occurs until step 6 (Onayla — Kaydet).
 * T-14-GHOSTMAP: {open && <SatellitePreviewModal />} unmounts map on close (Pitfall 5).
 * T-14-CRSWRONG: Human-readable CRS labels, default TUREF/TM30, satellite preview gate.
 */

import { useRef, useState, useTransition, useCallback } from 'react';
import Map, { Source, Layer, Marker } from 'react-map-gl/mapbox';
import type { MapRef, LayerProps } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Upload,
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  TriangleAlert,
  MapPin,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { upload } from '@vercel/blob/client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { BrandButton } from '@/components/brand/BrandButton';
import { BrandCard } from '@/components/brand/BrandCard';
import { BrandBadge } from '@/components/brand/BrandBadge';
import { BrandEmpty } from '@/components/brand/BrandEmpty';
import { BrandHeading } from '@/components/brand/BrandHeading';
import { extractDxfLayers } from '@/lib/dxf-parser';
import type { LayerInfo } from '@/lib/dxf-parser';
import { uploadDxf } from '@/actions/routes';
import { previewDxf } from '@/actions/dxf-preview';

// ---------------------------------------------------------------------------
// CRS presets (UI-SPEC Copywriting Contract)
// ---------------------------------------------------------------------------

const CRS_PRESETS: { epsg: number; labelKey: string }[] = [
  { epsg: 5254, labelKey: 'crs_5254' },
  { epsg: 5253, labelKey: 'crs_5253' },
  { epsg: 5255, labelKey: 'crs_5255' },
  { epsg: 23035, labelKey: 'crs_23035' },
  { epsg: 23036, labelKey: 'crs_23036' },
  { epsg: 32635, labelKey: 'crs_32635' },
  { epsg: 32636, labelKey: 'crs_32636' },
];

const DEFAULT_CRS = 5254; // TUREF/TM30 (D-01)

function getCrsStorageKey(projectId: string): string {
  return `bayrak-dxf-crs-${projectId}`;
}

function loadLastCrs(projectId: string): number {
  if (typeof window === 'undefined') return DEFAULT_CRS;
  try {
    const stored = localStorage.getItem(getCrsStorageKey(projectId));
    if (stored) {
      const epsg = parseInt(stored, 10);
      if (CRS_PRESETS.some((p) => p.epsg === epsg)) return epsg;
    }
  } catch {
    // localStorage unavailable (private browsing mode)
  }
  return DEFAULT_CRS;
}

function saveLastCrs(projectId: string, epsg: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getCrsStorageKey(projectId), String(epsg));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// State machine type
// ---------------------------------------------------------------------------

type DxfUploadState =
  | { status: 'idle' }
  | { status: 'parsing' }
  | { status: 'layer-picker'; layers: LayerInfo[]; file: File }
  | {
      status: 'crs-select';
      layers: LayerInfo[];
      selectedLayer: string;
      selectedLayerInfo: LayerInfo;
      file: File;
      selectedCrs: number;
    }
  | {
      status: 'uploading-blob';
      layers: LayerInfo[];
      selectedLayer: string;
      selectedLayerInfo: LayerInfo;
      file: File;
      selectedCrs: number;
    }
  | {
      status: 'previewing';
      geojson: { type: 'LineString'; coordinates: [number, number][] };
      blobUrl: string;
      selectedLayer: string;
      selectedCrs: number;
      totalLengthM: number;
      hasSpline: boolean;
      gaps: number[];
      approvedCount: number;
      currentVersion: number;
    }
  | { status: 'saving' }
  | { status: 'saved'; count: number }
  | { status: 'error'; errorCode: string };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DxfUploadProps {
  projectId: string;
  onSuccess: (count: number, routeId: string) => void;
}

// ---------------------------------------------------------------------------
// Route line layer style for the preview map (amber-500)
// ---------------------------------------------------------------------------

const previewRouteLayerStyle: LayerProps = {
  id: 'dxf-preview-route',
  type: 'line',
  paint: {
    'line-color': '#f59e0b', // amber-500
    'line-width': 3,
  },
};

// ---------------------------------------------------------------------------
// SatellitePreviewModal — conditionally rendered (Pitfall 5)
// ---------------------------------------------------------------------------

interface SatellitePreviewModalProps {
  onClose: () => void;
  geojson: { type: 'LineString'; coordinates: [number, number][] };
  crsLabel: string;
  layerName: string;
  totalLengthM: number;
  approvedCount: number;
  currentVersion: number;
  isSaving: boolean;
  saveError: string | null;
  onConfirm: () => void;
}

function SatellitePreviewModal({
  onClose,
  geojson,
  crsLabel,
  layerName,
  totalLengthM,
  approvedCount,
  currentVersion,
  isSaving,
  saveError,
  onConfirm,
}: SatellitePreviewModalProps) {
  const t = useTranslations('dashboard.route');
  const mapRef = useRef<MapRef>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // fitBounds after map loads (mirrors MapView.tsx lines 163-185)
  const handleMapLoad = useCallback(() => {
    setMapLoaded(true);
    if (!mapRef.current || geojson.coordinates.length < 2) return;
    const lngs = geojson.coordinates.map((c) => c[0]);
    const lats = geojson.coordinates.map((c) => c[1]);
    // Must use .getMap() — mapRef.current.fitBounds() does not exist in react-map-gl v8
    mapRef.current.getMap().fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 60, duration: 0 },
    );
  }, [geojson]);

  const totalLengthKm = totalLengthM / 1000;
  const isUnusualLength = totalLengthKm < 0.1 || totalLengthKm > 2000;

  const startCoord = geojson.coordinates[0];
  const endCoord = geojson.coordinates[geojson.coordinates.length - 1];

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  return (
    <Dialog open={true} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="max-w-3xl p-0 overflow-hidden"
        aria-describedby={undefined}
      >
        {/* Visually hidden title for screen readers; close button gets aria-label below */}
        <DialogTitle className="sr-only">
          {t('dxf_preview_title')}
        </DialogTitle>

        {/* Use onClose handler to give the auto-generated close button the right label */}
        <span className="sr-only" id="preview-close-label">
          Önizlemeyi kapat
        </span>

        <BrandCard>
          {/* Header */}
          <BrandCard.Header className="border-b border-slate-200">
            <BrandHeading as="h3" size="h3">
              {t('dxf_preview_title')}
            </BrandHeading>
            {saveError ? (
              <p className="text-xs text-destructive mt-1">{saveError}</p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">
                {t('dxf_preview_subtitle')}
              </p>
            )}
          </BrandCard.Header>

          <BrandCard.Body className="p-0">
            {/* Re-import warning (Surface 3) — only when approved submissions exist */}
            {approvedCount > 0 && (
              <div className="mx-4 mt-4 bg-orange-50 border border-orange-200 rounded-md p-3 flex gap-2">
                <TriangleAlert className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-orange-800 font-medium">
                    {t('dxf_reimport_warning_title', { count: approvedCount })}
                  </p>
                  <p className="text-xs text-orange-700 mt-0.5">
                    {t('dxf_reimport_warning_body', {
                      version: currentVersion + 1,
                    })}
                  </p>
                </div>
              </div>
            )}

            {/* Map area — 480px height per UI-SPEC */}
            <div style={{ height: 480 }} className="mt-4 relative">
              {!token ? (
                <BrandEmpty
                  icon={<MapPin className="h-6 w-6 text-slate-400" />}
                  title="Mapbox token eksik"
                  description="NEXT_PUBLIC_MAPBOX_TOKEN ortam değişkeni tanımlanmamış."
                />
              ) : (
                <>
                  {/* Skeleton shown until map loads */}
                  {!mapLoaded && (
                    <Skeleton className="absolute inset-0 rounded-none" />
                  )}
                  <Map
                    ref={mapRef}
                    mapboxAccessToken={token}
                    mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
                    style={{
                      width: '100%',
                      height: '100%',
                      opacity: mapLoaded ? 1 : 0,
                    }}
                    onLoad={handleMapLoad}
                    initialViewState={{ longitude: 35, latitude: 39, zoom: 6 }}
                  >
                    {/* Route line — amber-500 */}
                    <Source type="geojson" data={geojson}>
                      <Layer {...previewRouteLayerStyle} />
                    </Source>
                    {/* Start marker — emerald-600 */}
                    {startCoord && (
                      <Marker
                        longitude={startCoord[0]}
                        latitude={startCoord[1]}
                      >
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: '#059669',
                          }}
                        />
                      </Marker>
                    )}
                    {/* End marker — red-600 */}
                    {endCoord && (
                      <Marker longitude={endCoord[0]} latitude={endCoord[1]}>
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: '#dc2626',
                          }}
                        />
                      </Marker>
                    )}
                  </Map>
                </>
              )}
            </div>

            {/* Length readout + metadata */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  {t('dxf_preview_length')}:
                </span>
                <span className="text-sm font-medium font-mono tabular-nums">
                  {totalLengthKm.toFixed(2)} km
                </span>
                {isUnusualLength && (
                  <BrandBadge variant="warning">
                    {t('dxf_unusual_length')}
                  </BrandBadge>
                )}
              </div>
              <div className="flex gap-4 flex-wrap text-xs text-muted-foreground">
                <span>
                  {t('dxf_preview_crs_display')}: {crsLabel}
                </span>
                <span>
                  {t('dxf_preview_layer_display')}: {layerName}
                </span>
              </div>
            </div>
          </BrandCard.Body>

          {/* Footer — İptal + Onayla — Kaydet */}
          <BrandCard.Footer className="flex justify-end gap-2">
            <BrandButton
              variant="ghost"
              size="md"
              onClick={onClose}
              disabled={isSaving}
            >
              İptal
            </BrandButton>
            <BrandButton
              variant="primary"
              size="md"
              onClick={onConfirm}
              disabled={!mapLoaded || isSaving}
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Kaydediliyor…
                </span>
              ) : (
                t('dxf_confirm_save')
              )}
            </BrandButton>
          </BrandCard.Footer>
        </BrandCard>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// DxfUpload — main component
// ---------------------------------------------------------------------------

export function DxfUpload({ projectId, onSuccess }: DxfUploadProps) {
  const t = useTranslations('dashboard.route');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<DxfUploadState>({
    status: 'idle',
  });
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Preview modal open/close + save error state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── File selection ──────────────────────────────────────────────────────────

  function handleFileSelect(file: File) {
    // Size check: 50 MB limit (UI-SPEC error_dxf_too_large)
    if (file.size > 50 * 1024 * 1024) {
      setUploadState({ status: 'error', errorCode: 'FILE_TOO_LARGE' });
      return;
    }

    setUploadState({ status: 'parsing' });

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        setUploadState({ status: 'error', errorCode: 'DXF_PARSE_FAILED' });
        return;
      }

      const layers = extractDxfLayers(text);

      if (!layers || layers.length === 0) {
        setUploadState({ status: 'error', errorCode: 'NO_LAYERS' });
        return;
      }

      setUploadState({ status: 'layer-picker', layers, file });
    };
    reader.onerror = () => {
      setUploadState({ status: 'error', errorCode: 'DXF_PARSE_FAILED' });
    };
    reader.readAsText(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  function reset() {
    setUploadState({ status: 'idle' });
    setPreviewOpen(false);
    setSaveError(null);
    setIsSaving(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Layer selection ─────────────────────────────────────────────────────────

  function handleLayerSelect(layerInfo: LayerInfo) {
    if (uploadState.status !== 'layer-picker') return;
    setUploadState({
      status: 'crs-select',
      layers: uploadState.layers,
      selectedLayer: layerInfo.name,
      selectedLayerInfo: layerInfo,
      file: uploadState.file,
      selectedCrs: loadLastCrs(projectId),
    });
  }

  function handleBackToLayers() {
    if (
      uploadState.status !== 'crs-select' &&
      uploadState.status !== 'uploading-blob'
    )
      return;
    setUploadState({
      status: 'layer-picker',
      layers: uploadState.layers,
      file: uploadState.file,
    });
  }

  function handleCrsChange(epsgStr: string | null) {
    if (uploadState.status !== 'crs-select') return;
    if (!epsgStr) return;
    const epsg = parseInt(epsgStr, 10);
    saveLastCrs(projectId, epsg);
    setUploadState({ ...uploadState, selectedCrs: epsg });
  }

  // ── "Önizle" — upload blob + call previewDxf (no DB write) ─────────────────

  function handlePreview() {
    if (uploadState.status !== 'crs-select') return;
    const { file, selectedLayer, selectedLayerInfo, selectedCrs, layers } =
      uploadState;

    setUploadState({
      status: 'uploading-blob',
      layers,
      selectedLayer,
      selectedLayerInfo,
      file,
      selectedCrs,
    });

    startTransition(async () => {
      // Step 1: Upload file to Vercel Blob (browser → Blob, bypasses bodyParser)
      let blobUrl: string;
      try {
        const result = await upload(
          `routes/${projectId}/source-${Date.now()}.dxf`,
          file,
          {
            access: 'public',
            handleUploadUrl: '/api/dxf-upload',
          },
        );
        blobUrl = result.url;
      } catch {
        setUploadState({ status: 'error', errorCode: 'BLOB_UPLOAD_FAILED' });
        return;
      }

      // Step 2: Parse for preview — Server Action, NO DB write (T-14-PREVIEW)
      const previewResult = await previewDxf(
        projectId,
        blobUrl,
        selectedCrs,
        selectedLayer,
      );

      if (!previewResult.ok) {
        setUploadState({ status: 'error', errorCode: previewResult.error });
        return;
      }

      setUploadState({
        status: 'previewing',
        geojson: previewResult.geojson,
        blobUrl,
        selectedLayer,
        selectedCrs,
        totalLengthM: previewResult.totalLengthM,
        hasSpline: previewResult.hasSpline,
        gaps: previewResult.gaps,
        approvedCount: previewResult.approvedCount,
        currentVersion: previewResult.currentVersion,
      });
      setPreviewOpen(true);
    });
  }

  // ── "Onayla — Kaydet" — write to DB ─────────────────────────────────────────

  function handleConfirm() {
    if (uploadState.status !== 'previewing') return;
    const { blobUrl, selectedCrs, selectedLayer } = uploadState;

    setIsSaving(true);
    setSaveError(null);

    uploadDxf(projectId, blobUrl, selectedCrs, selectedLayer)
      .then((result) => {
        setIsSaving(false);
        if (result.ok) {
          setPreviewOpen(false);
          setUploadState({ status: 'saved', count: result.count });
          onSuccess(result.count, result.id);
        } else {
          setSaveError(mapErrorCodeToMessage(result.error, t));
        }
      })
      .catch(() => {
        setIsSaving(false);
        setSaveError(t('error_blob_upload'));
      });
  }

  // ── Modal close — returns to idle (no DB write — T-14-PREVIEW) ─────────────

  function handleModalClose() {
    if (isSaving) return; // don't allow close during save
    setPreviewOpen(false);
    setSaveError(null);
    // Reset to idle — engineer can start fresh import
    setUploadState({ status: 'idle' });
  }

  // ── CRS label lookup ────────────────────────────────────────────────────────

  function getCrsLabel(epsg: number): string {
    const preset = CRS_PRESETS.find((p) => p.epsg === epsg);
    if (!preset) return String(epsg);
    return t(preset.labelKey as Parameters<typeof t>[0]);
  }

  // ── Render states ───────────────────────────────────────────────────────────

  // Parsing spinner
  if (uploadState.status === 'parsing') {
    return (
      <div className="space-y-3 py-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-36" />
        <p className="text-sm text-muted-foreground">{t('dxf_parsing')}</p>
      </div>
    );
  }

  // Uploading blob / fetching preview spinner
  if (uploadState.status === 'uploading-blob') {
    return (
      <div className="flex items-center gap-3 py-8 text-muted-foreground">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span className="text-sm">{t('dxf_parsing')}</span>
      </div>
    );
  }

  // Layer picker
  if (uploadState.status === 'layer-picker') {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">{t('dxf_layer_picker_title')}</p>
        <div className="rounded-md border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {uploadState.layers.map((layer) => (
            <button
              key={layer.name}
              type="button"
              onClick={() => handleLayerSelect(layer)}
              className={[
                'w-full text-left px-4 py-3 flex items-center justify-between gap-3',
                'hover:bg-slate-50 transition-colors',
                layer.suggested ? 'bg-amber-50 hover:bg-amber-100' : 'bg-white',
              ].join(' ')}
            >
              <div className="flex items-center gap-2 min-w-0">
                {layer.suggested && (
                  <BrandBadge variant="primary" className="shrink-0">
                    {t('dxf_layer_suggested')}
                  </BrandBadge>
                )}
                <span className="text-sm font-medium truncate">
                  {layer.name}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                <span className="font-mono tabular-nums">
                  {layer.entityCount.toLocaleString('tr-TR')}{' '}
                  {t('dxf_layer_col_entities').toLowerCase()}
                </span>
                {layer.vertexCount > 0 && (
                  <span className="font-mono tabular-nums">
                    {layer.vertexCount.toLocaleString('tr-TR')} nokta
                  </span>
                )}
                {layer.hasSpline && (
                  <BrandBadge variant="warning">SPLINE</BrandBadge>
                )}
              </div>
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          İptal
        </Button>
      </div>
    );
  }

  // CRS selector
  if (uploadState.status === 'crs-select') {
    const { selectedLayer, selectedLayerInfo, selectedCrs } = uploadState;
    return (
      <div className="space-y-4">
        {/* Back + selected layer summary */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-auto"
            onClick={handleBackToLayers}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('dxf_layer_col_name')}:{' '}
            <span className="font-medium text-foreground">{selectedLayer}</span>
          </span>
          {selectedLayerInfo.suggested && (
            <BrandBadge variant="primary">
              {t('dxf_layer_suggested')}
            </BrandBadge>
          )}
        </div>

        {/* SPLINE warning (non-blocking) */}
        {selectedLayerInfo.hasSpline && (
          <Alert className="border-orange-200 bg-orange-50">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-700 text-sm">
              {t('dxf_spline_warning')}
            </AlertDescription>
          </Alert>
        )}

        {/* CRS selector */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('dxf_crs_label')}</label>
          <p className="text-xs text-muted-foreground">
            {t('dxf_crs_sublabel')}
          </p>
          <Select
            value={String(selectedCrs)}
            onValueChange={handleCrsChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRS_PRESETS.map((preset) => (
                <SelectItem key={preset.epsg} value={String(preset.epsg)}>
                  {t(preset.labelKey as Parameters<typeof t>[0])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <BrandButton
            variant="primary"
            size="md"
            onClick={handlePreview}
            disabled={isPending}
          >
            {t('dxf_preview_cta')}
          </BrandButton>
          <BrandButton variant="ghost" size="md" onClick={reset}>
            İptal
          </BrandButton>
        </div>
      </div>
    );
  }

  // Previewing — satellite modal + gap warning
  if (uploadState.status === 'previewing') {
    const { geojson, selectedLayer, selectedCrs, totalLengthM, gaps, approvedCount, currentVersion } =
      uploadState;

    return (
      <>
        {/* Loading placeholder shown beneath the modal */}
        <div className="flex items-center gap-3 py-6 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
          <span className="text-sm">Önizleme hazırlanıyor…</span>
        </div>

        {/* Gap warning (non-blocking) */}
        {gaps.length > 0 && (
          <Alert className="border-orange-200 bg-orange-50 mt-2">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-700 text-sm">
              {t('dxf_gap_warning')}
            </AlertDescription>
          </Alert>
        )}

        {/* T-14-GHOSTMAP: {open && ...} — modal only mounted when open */}
        {previewOpen && (
          <SatellitePreviewModal
            onClose={handleModalClose}
            geojson={geojson}
            crsLabel={getCrsLabel(selectedCrs)}
            layerName={selectedLayer}
            totalLengthM={totalLengthM}
            approvedCount={approvedCount}
            currentVersion={currentVersion}
            isSaving={isSaving}
            saveError={saveError}
            onConfirm={handleConfirm}
          />
        )}
      </>
    );
  }

  // Saving spinner (transitional — usually very brief)
  if (uploadState.status === 'saving') {
    return (
      <div className="flex items-center gap-3 py-8 text-muted-foreground">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span className="text-sm">Kaydediliyor…</span>
      </div>
    );
  }

  // Saved
  if (uploadState.status === 'saved') {
    return (
      <div className="flex items-center gap-2 py-2">
        <CheckCircle className="h-4 w-4 text-emerald-600" />
        <BrandBadge variant="success">{t('dxf_saved')}</BrandBadge>
        <span className="text-xs text-muted-foreground font-mono tabular-nums">
          {uploadState.count.toLocaleString('tr-TR')} nokta
        </span>
      </div>
    );
  }

  // Error
  if (uploadState.status === 'error') {
    return (
      <div className="space-y-3">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {mapErrorCodeToMessage(uploadState.errorCode, t)}
          </AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={reset}>
          {t('dxf_choose_file')}
        </Button>
      </div>
    );
  }

  // Idle — drop zone (default state)
  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".dxf"
        className="hidden"
        onChange={handleInputChange}
        aria-label={t('dxf_drop_label')}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label={t('dxf_drop_label')}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ')
            fileInputRef.current?.click();
        }}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        className={[
          'flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3',
          'rounded-lg border-2 border-dashed transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary hover:bg-primary/5',
        ].join(' ')}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('dxf_drop_label')}</p>
        <p className="text-xs text-muted-foreground">
          {t('dxf_drop_sublabel')}
        </p>
      </div>
      <div className="flex justify-center">
        <BrandButton
          variant="outline"
          size="md"
          onClick={() => fileInputRef.current?.click()}
        >
          {t('dxf_choose_file')}
        </BrandButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error code → i18n message mapping
// ---------------------------------------------------------------------------

function mapErrorCodeToMessage(
  errorCode: string,
  t: ReturnType<typeof useTranslations<'dashboard.route'>>,
): string {
  switch (errorCode) {
    case 'FILE_TOO_LARGE':
      return t('error_dxf_too_large');
    case 'DXF_PARSE_FAILED':
      return t('error_dxf_parse');
    case 'NO_LAYERS':
      return t('error_dxf_no_layers');
    case 'COORDS_OUTSIDE_TURKEY':
      return t('error_dxf_out_of_turkey');
    case 'TOO_FEW_VERTICES':
    case 'NO_COMPATIBLE_GEOMETRY':
      return t('error_dxf_too_few_vertices');
    case 'BLOB_UPLOAD_FAILED':
      return t('error_blob_upload');
    default:
      return t('error_dxf_parse');
  }
}
