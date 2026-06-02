'use client';

/**
 * MapView.tsx
 *
 * Live Mapbox map for the Rota tab (DASH-01, DASH-02).
 * Renders the project pipeline route as a LineString layer, approved submission
 * points as palette-colored circles (BOQ item), an amber anomaly ring for
 * `location_warning=true` points, a click popup, and a color→material legend.
 *
 * Critical import note (RESEARCH Pitfall 2): react-map-gl v8 with mapbox-gl ≥ 3.5
 * requires importing from 'react-map-gl/mapbox', NOT bare 'react-map-gl'.
 * The mapbox-gl CSS import is MANDATORY — controls and tiles are broken without it.
 *
 * Layer order: anomaly-ring layer declared BEFORE the circle layer so it renders
 * behind (underneath) the BOQ-color circle.
 *
 * fitBounds: must call mapRef.current.getMap().fitBounds(...) — NOT
 * mapRef.current.fitBounds(...) which does not exist in react-map-gl v8.
 *
 * D-56/D-57: null routeGeoJSON returns guided empty state, never a blank map.
 * D-58: paletteSlot read from feature.properties — not recomputed client-side.
 * D-59: shape (ring) + amber text; legend maps color→material text.
 * D-60: h-[600px] desktop / h-[400px] mobile.
 * D-63: all user-visible strings via useTranslations.
 * T-05-XSS: photos only rendered via next/image src — no raw HTML injection.
 */

import { useRef, useState, useCallback } from 'react';
import Map, { Source, Layer, Popup } from 'react-map-gl/mapbox';
import type { MapRef, LayerProps, MapMouseEvent } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Box, Square } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BoqLegendItem {
  id: string;
  material: string;
  paletteSlot: number;
}

interface ApprovedPointProperties {
  id: string;
  boqItemId: string;
  boqPaletteSlot: number;
  boqMaterial: string | null;
  locationWarning: boolean;
  locationDistanceM: number | null;
  quantity: number;
  unit: string | null;
  photoUrl: string;
  status: 'approved';
  decidedAt: string | null;
  auditorName: string | null;
}

interface PopupInfo {
  longitude: number;
  latitude: number;
  properties: ApprovedPointProperties;
}

export interface MapViewProps {
  routeGeoJSON: GeoJSON.LineString | null;
  approvedPoints: GeoJSON.FeatureCollection;
  boqLegend: BoqLegendItem[];
}

// ── BOQ palette (UI-SPEC D-58, slots 0–5) ─────────────────────────────────────

const PALETTE: Record<number, string> = {
  0: '#2563EB', // Blue
  1: '#D97706', // Amber
  2: '#7C3AED', // Violet
  3: '#059669', // Emerald
  4: '#DB2777', // Pink/Rose
  5: '#0891B2', // Cyan
};

const FALLBACK_COLOR = '#94A3B8'; // slate-400 for slots > 5

function paletteColor(slot: number): string {
  return PALETTE[slot % 6] ?? FALLBACK_COLOR;
}

// ── Layer styles (LOCKED per UI-SPEC / PLAN 03 interfaces) ─────────────────────

const routeLayerStyle: LayerProps = {
  id: 'route-line',
  type: 'line',
  paint: {
    'line-color': '#64748B',
    'line-width': 3,
    'line-opacity': 0.8,
  },
};

// Anomaly ring: declared BEFORE circle layer so it renders behind the BOQ circle.
const anomalyRingStyle: LayerProps = {
  id: 'anomaly-ring',
  type: 'circle',
  filter: ['==', ['get', 'locationWarning'], true],
  paint: {
    'circle-radius': 14,
    'circle-color': 'transparent',
    'circle-stroke-width': 3,
    'circle-stroke-color': 'hsl(38, 92%, 50%)',
  },
};

// Sky layer for the 3D outlook (atmosphere gradient above the terrain).
const skyLayerStyle: LayerProps = {
  id: 'sky',
  type: 'sky',
  paint: {
    'sky-type': 'atmosphere',
    'sky-atmosphere-sun': [0.0, 0.0],
    'sky-atmosphere-sun-intensity': 15,
  },
};

// Approved points circle: data-driven color from boqPaletteSlot property.
const circleLayerStyle: LayerProps = {
  id: 'approved-points',
  type: 'circle',
  paint: {
    'circle-color': [
      'match',
      ['get', 'boqPaletteSlot'],
      0, '#2563EB',
      1, '#D97706',
      2, '#7C3AED',
      3, '#059669',
      4, '#DB2777',
      5, '#0891B2',
      '#94A3B8', // fallback
    ],
    'circle-radius': 8,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#FFFFFF',
  },
};

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status, t }: { status: 'approved' | 'pending_audit' | 'rejected'; t: ReturnType<typeof useTranslations> }) {
  if (status === 'approved') {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        {t('status_approved')}
      </Badge>
    );
  }
  if (status === 'rejected') {
    return <Badge variant="destructive">{t('status_rejected')}</Badge>;
  }
  return <Badge variant="secondary">{t('status_pending')}</Badge>;
}

// ── MapView component ──────────────────────────────────────────────────────────

export function MapView({ routeGeoJSON, approvedPoints, boqLegend }: MapViewProps) {
  const tMap = useTranslations('dashboard.map');
  const tSub = useTranslations('dashboard.submissions');

  const mapRef = useRef<MapRef>(null);
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null);
  const [is3D, setIs3D] = useState(false);
  const [cursor, setCursor] = useState<string>('');

  // Toggle the 3D "outlook": tilt the camera (terrain + sky are bound to is3D).
  const toggle3D = useCallback(() => {
    setIs3D((prev) => {
      const next = !prev;
      const map = mapRef.current?.getMap();
      if (map) {
        map.easeTo({ pitch: next ? 60 : 0, duration: 600 });
      }
      return next;
    });
  }, []);

  // D-56: fitBounds to route bbox on load.
  const onLoad = useCallback(() => {
    if (!routeGeoJSON || !mapRef.current) return;
    const coords = routeGeoJSON.coordinates;
    if (coords.length < 2) return;  // WR-03: LineString needs ≥ 2 points for a valid bbox

    let minLng = coords[0][0];
    let maxLng = coords[0][0];
    let minLat = coords[0][1];
    let maxLat = coords[0][1];

    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    // Must use getMap() — mapRef.current.fitBounds() does not exist in v8.
    mapRef.current.getMap().fitBounds(
      [[minLng, minLat], [maxLng, maxLat]],
      { padding: 48, animate: false }
    );
  }, [routeGeoJSON]);

  // D-51: click a point → open popup.
  const handleMapClick = useCallback((event: MapMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) return;
    if (feature.geometry.type !== 'Point') return;

    const [longitude, latitude] = feature.geometry.coordinates as [number, number];
    const properties = feature.properties as ApprovedPointProperties;
    setPopupInfo({ longitude, latitude, properties });
  }, []);

  // D-57: no route → guided empty state; never render a blank map.
  if (!routeGeoJSON) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        {tMap('empty_no_route')}
      </div>
    );
  }

  const hasPoints = approvedPoints.features.length > 0;

  return (
    <div className="relative w-full">
      {/* 2D / 3D outlook toggle (top-right overlay) */}
      <div className="absolute right-2 top-2 z-10">
        <div
          role="group"
          aria-label={tMap('view_mode_label')}
          className="inline-flex overflow-hidden rounded-md border border-border bg-background/90 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => is3D && toggle3D()}
            aria-pressed={!is3D}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors',
              !is3D ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <Square className="size-3.5" aria-hidden="true" />
            {tMap('view_2d')}
          </button>
          <button
            type="button"
            onClick={() => !is3D && toggle3D()}
            aria-pressed={is3D}
            className={cn(
              'inline-flex items-center gap-1 border-l border-border px-2.5 py-1.5 text-xs font-medium transition-colors',
              is3D ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <Box className="size-3.5" aria-hidden="true" />
            {tMap('view_3d')}
          </button>
        </div>
      </div>

      {/* Map container — h-[600px] desktop / h-[400px] mobile (D-60) */}
      <div className="h-[400px] w-full sm:h-[600px]">
        <Map
          ref={mapRef}
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
          style={{ width: '100%', height: '100%' }}
          interactiveLayerIds={['approved-points']}
          onClick={handleMapClick}
          onLoad={onLoad}
          onMouseEnter={() => setCursor('pointer')}
          onMouseLeave={() => setCursor('')}
          cursor={cursor}
          initialViewState={{ longitude: 28, latitude: 41, zoom: 7 }}
          maxPitch={75}
          terrain={is3D ? { source: 'mapbox-dem', exaggeration: 1.4 } : undefined}
        >
          {/* Terrain DEM source (cheap to keep mounted; only applied when 3D). */}
          <Source
            id="mapbox-dem"
            type="raster-dem"
            url="mapbox://mapbox.mapbox-terrain-dem-v1"
            tileSize={512}
            maxzoom={14}
          />
          {is3D && <Layer {...skyLayerStyle} />}

          {/* Route line layer */}
          <Source id="route" type="geojson" data={routeGeoJSON}>
            <Layer {...routeLayerStyle} />
          </Source>

          {/* Approved points layers: anomaly ring BEFORE circle (renders behind) */}
          <Source id="approved" type="geojson" data={approvedPoints}>
            <Layer {...anomalyRingStyle} />
            <Layer {...circleLayerStyle} />
          </Source>

          {/* D-51: click popup */}
          {popupInfo && (
            <Popup
              longitude={popupInfo.longitude}
              latitude={popupInfo.latitude}
              anchor="bottom"
              onClose={() => setPopupInfo(null)}
              maxWidth="320px"
            >
              <div className="flex flex-col gap-2 p-1 text-sm">
                {/* Photo thumbnail (T-05-XSS: only via next/image) */}
                {popupInfo.properties.photoUrl && (
                  <div className="relative h-20 w-20 overflow-hidden rounded">
                    <Image
                      src={popupInfo.properties.photoUrl}
                      alt={tSub('photo_alt', { material: popupInfo.properties.boqMaterial ?? '' })}
                      width={80}
                      height={80}
                      className="h-20 w-20 object-cover"
                    />
                  </div>
                )}

                {/* BOQ material (Label) */}
                {popupInfo.properties.boqMaterial && (
                  <p className="text-sm font-semibold">{popupInfo.properties.boqMaterial}</p>
                )}

                {/* Quantity + unit (Body) */}
                <p className="tabular-nums text-sm">
                  <span className="text-muted-foreground">{tMap('popup_quantity')}: </span>
                  {new Intl.NumberFormat('tr-TR').format(popupInfo.properties.quantity)}
                  {popupInfo.properties.unit ? ` ${popupInfo.properties.unit}` : ''}
                </p>

                {/* Status badge */}
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground text-sm">{tMap('popup_status')}: </span>
                  <StatusBadge status={popupInfo.properties.status} t={tSub} />
                </div>

                {/* Date (tr-TR locale) */}
                {popupInfo.properties.decidedAt && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">{tMap('popup_date')}: </span>
                    {new Date(popupInfo.properties.decidedAt).toLocaleDateString('tr-TR')}
                  </p>
                )}

                {/* Auditor name (muted) */}
                {popupInfo.properties.auditorName && (
                  <p className="text-sm text-muted-foreground">
                    {tMap('popup_auditor')}: {popupInfo.properties.auditorName}
                  </p>
                )}

                {/* D-52: location warning amber line */}
                {popupInfo.properties.locationWarning && popupInfo.properties.locationDistanceM != null && (
                  <p className="text-sm font-medium" style={{ color: 'hsl(38, 92%, 40%)' }}>
                    {tMap('popup_distance', { meters: Math.round(popupInfo.properties.locationDistanceM) })}
                  </p>
                )}

                {/* Interactive drill-through: open the full submission record. */}
                <Link
                  href={`/dashboard/records/${popupInfo.properties.id}`}
                  className="mt-1 inline-flex items-center text-sm font-medium text-primary hover:underline"
                >
                  {tMap('view_record')} →
                </Link>
              </div>
            </Popup>
          )}

          {/* D-58: Legend — bottom-left overlay, hidden when no approved points (D-57) */}
          {hasPoints && boqLegend.length > 0 && (
            <div className="absolute bottom-8 left-2 z-10">
              <Card className="bg-background/90 p-3 backdrop-blur-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {tMap('legend_title')}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {boqLegend.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 text-xs sm:text-sm">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: paletteColor(item.paletteSlot) }}
                        aria-hidden="true"
                      />
                      {item.material}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}
        </Map>
      </div>

      {/* D-57: route exists but no approved points — subtle note below map */}
      {!hasPoints && (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {tMap('empty_no_points')}
        </p>
      )}
    </div>
  );
}
