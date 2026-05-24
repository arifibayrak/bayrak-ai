/**
 * RouteTab.tsx
 *
 * Rota tab — Server Component (Phase 5 Plan 03).
 * Fetches route GeoJSON, approved points, and BOQ legend via Promise.all,
 * then passes serialized data to RouteTabClient.
 *
 * Date serialization: uploadedAt passed as ISO string (RESEARCH Pitfall 5 —
 * Date instances cannot cross the RSC→client boundary).
 *
 * DASH-01: route GeoJSON fed to MapView for the Mapbox line layer.
 * DASH-02: approved points + BOQ legend fed to MapView for color-coded circles.
 */

import { getTranslations } from 'next-intl/server';
import { getRoute } from '@/actions/routes';
import { getRouteGeoJSON } from '@/actions/routes';
import { getApprovedPoints, getBoqLegend } from '@/actions/submissions';
import { RouteTabClient } from './RouteTabClient';

interface RouteTabProps {
  projectId: string;
}

export async function RouteTab({ projectId }: RouteTabProps) {
  const t = await getTranslations('dashboard.route');

  // Parallel fetch: route metadata + GeoJSON + approved points + legend (D-49).
  // getRoute provides the metadata card; getRouteGeoJSON provides the geometry.
  // uploadedAt from getRoute is a Date — serialized to ISO string before passing
  // to the client component (RESEARCH Pitfall 5).
  const [existingRoute, routeGeoJSONResult, approvedPoints, boqLegend] = await Promise.all([
    getRoute(projectId),
    getRouteGeoJSON(projectId),
    getApprovedPoints(projectId),
    getBoqLegend(projectId),
  ]);

  // Serialize Date → ISO string for RSC→client boundary safety.
  const serializedRoute = existingRoute
    ? {
        id: existingRoute.id,
        coordinateCount: existingRoute.coordinateCount,
        uploadedAt: existingRoute.uploadedAt instanceof Date
          ? existingRoute.uploadedAt.toISOString()
          : String(existingRoute.uploadedAt),
      }
    : null;

  // Extract only the LineString geometry (not the full wrapper) for MapView.
  const routeGeoJSON = routeGeoJSONResult?.geojson ?? null;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{t('title')}</h2>
      <RouteTabClient
        projectId={projectId}
        existingRoute={serializedRoute}
        routeGeoJSON={routeGeoJSON}
        approvedPoints={approvedPoints}
        boqLegend={boqLegend}
      />
    </div>
  );
}
