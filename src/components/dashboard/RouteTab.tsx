/**
 * RouteTab.tsx
 *
 * Rota tab — Server Component (Phase 5 Plan 03, extended Phase 14).
 * Fetches route GeoJSON, approved points, BOQ legend, and source-document
 * history via Promise.all, then passes serialized data to RouteTabClient.
 *
 * Date serialization: uploadedAt passed as ISO string (RESEARCH Pitfall 5 —
 * Date instances cannot cross the RSC→client boundary).
 *
 * DASH-01: route GeoJSON fed to MapView for the Mapbox line layer.
 * DASH-02: approved points + BOQ legend fed to MapView for color-coded circles.
 *
 * Phase 14 additions (RTE-03/05):
 *  - Serializes new getRoute columns (totalLengthM, sourceCrs, sourceLayer,
 *    geometryVersion, sourceBlobUrl) into serializedRoute.
 *  - Calls getRouteSourceDocuments(projectId) and passes newest-first list
 *    as sourceDocuments prop to RouteTabClient (D-05 version history).
 */

import { getTranslations } from 'next-intl/server';
import { getRoute, getRouteGeoJSON, getRouteSourceDocuments } from '@/actions/routes';
import { getApprovedPoints, getBoqLegend } from '@/actions/submissions';
import { RouteTabClient } from './RouteTabClient';
import { ElevationProfile } from './ElevationProfile';

interface RouteTabProps {
  projectId: string;
}

export async function RouteTab({ projectId }: RouteTabProps) {
  const t = await getTranslations('dashboard.route');

  // Parallel fetch: route metadata + GeoJSON + approved points + legend + source docs (D-49).
  // getRoute provides the metadata card; getRouteGeoJSON provides the geometry.
  // uploadedAt from getRoute is a Date — serialized to ISO string before passing
  // to the client component (RESEARCH Pitfall 5).
  const [existingRoute, routeGeoJSONResult, approvedPoints, boqLegend, sourceDocuments] =
    await Promise.all([
      getRoute(projectId),
      getRouteGeoJSON(projectId),
      getApprovedPoints(projectId),
      getBoqLegend(projectId),
      getRouteSourceDocuments(projectId),
    ]);

  // Serialize Date → ISO string for RSC→client boundary safety.
  // Phase 14: include new provenance/version columns (all nullable for GeoJSON routes).
  const serializedRoute = existingRoute
    ? {
        id: existingRoute.id,
        coordinateCount: existingRoute.coordinateCount,
        uploadedAt:
          existingRoute.uploadedAt instanceof Date
            ? existingRoute.uploadedAt.toISOString()
            : String(existingRoute.uploadedAt),
        // Phase 14 additions (RTE-05):
        totalLengthM: existingRoute.totalLengthM
          ? String(existingRoute.totalLengthM)
          : null,
        sourceCrs: existingRoute.sourceCrs ?? null,
        sourceLayer: existingRoute.sourceLayer ?? null,
        geometryVersion: existingRoute.geometryVersion ?? null,
        sourceBlobUrl: existingRoute.sourceBlobUrl ?? null,
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
        sourceDocuments={sourceDocuments}
      />

      {/* Real-3D terrain elevation profile — only when a route exists. */}
      {routeGeoJSONResult ? (
        <ElevationProfile
          projectId={projectId}
          sampledAt={routeGeoJSONResult.elevationSampledAt ?? null}
          minM={routeGeoJSONResult.minElevationM ? String(routeGeoJSONResult.minElevationM) : null}
          maxM={routeGeoJSONResult.maxElevationM ? String(routeGeoJSONResult.maxElevationM) : null}
          length3dM={routeGeoJSONResult.length3dM ? String(routeGeoJSONResult.length3dM) : null}
          totalLengthM={routeGeoJSONResult.totalLengthM ? String(routeGeoJSONResult.totalLengthM) : null}
          profile={routeGeoJSONResult.elevationProfile ?? null}
        />
      ) : null}
    </div>
  );
}
