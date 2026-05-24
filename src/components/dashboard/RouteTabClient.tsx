'use client';

/**
 * RouteTabClient.tsx
 *
 * Client part of RouteTab (Phase 5 Plan 03).
 * When a route exists and the user is not replacing it, renders:
 *   1. <MapView> with the route GeoJSON + approved points + BOQ legend (D-49)
 *   2. The existing saved-route metadata card + Replace button below the map
 * When no route exists (or replacing), renders the RouteUpload zone.
 *
 * Serialization fix (RESEARCH Pitfall 5): ExistingRoute.uploadedAt is now
 * a string (ISO-8601), not a Date. The card uses new Date(str).toLocaleDateString().
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RouteUpload } from './RouteUpload';
import { MapView } from './MapView';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// uploadedAt is a string (ISO-8601) — Date objects cannot cross RSC→client boundary.
interface ExistingRoute {
  id: string;
  coordinateCount: number;
  uploadedAt: string;
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
}

export function RouteTabClient({
  projectId,
  existingRoute,
  routeGeoJSON,
  approvedPoints,
  boqLegend,
}: RouteTabClientProps) {
  const t = useTranslations('dashboard.route');
  const [savedRoute, setSavedRoute] = useState<ExistingRoute | null>(existingRoute);
  const [isReplacing, setIsReplacing] = useState(false);

  // After a successful upload, update local state and switch back to map view.
  // uploadedAt stored as ISO string (Pitfall 5).
  function handleUploadSuccess(count: number) {
    setSavedRoute({
      id: crypto.randomUUID(),
      coordinateCount: count,
      uploadedAt: new Date().toISOString(),
    });
    setIsReplacing(false);
  }

  // Show map + metadata card + Replace button when a route exists.
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
        <Card className="p-6">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Koordinat sayısı /</span>
              <span className="font-medium tabular-nums">
                {savedRoute.coordinateCount.toLocaleString('tr-TR')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Yükleme tarihi /</span>
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
          </div>
        </Card>

        <Button
          variant="outline"
          className="text-destructive border-destructive hover:bg-destructive/10"
          onClick={() => setIsReplacing(true)}
        >
          {t('replace_route')}
        </Button>
      </div>
    );
  }

  // Show upload zone (no route, or user triggered replace).
  return (
    <div className="space-y-4">
      {isReplacing && (
        <div className="text-sm text-muted-foreground">
          {t('replace_route_confirm')}
        </div>
      )}
      <RouteUpload projectId={projectId} onSuccess={handleUploadSuccess} />
      {isReplacing && (
        <Button variant="ghost" onClick={() => setIsReplacing(false)}>
          İptal
        </Button>
      )}
    </div>
  );
}
