/**
 * RouteTab.tsx
 *
 * Project Route (GeoJSON) tab — plan 01-06 replaces the stub from plan 01-05.
 * Server Component: fetches existing route metadata; renders the upload drop zone
 * (no route) OR saved-route metadata card + "Rotayı Değiştir" (route exists).
 *
 * UI-SPEC #4b: GeoJSON route tab layout and interaction contract.
 * D-07: .geojson upload, server validates WGS84 LineString.
 */

import { getTranslations } from 'next-intl/server';
import { getRoute } from '@/actions/routes';
import { RouteTabClient } from './RouteTabClient';

interface RouteTabProps {
  projectId: string;
}

export async function RouteTab({ projectId }: RouteTabProps) {
  const t = await getTranslations('dashboard.route');
  const existingRoute = await getRoute(projectId);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{t('title')}</h2>
      <RouteTabClient
        projectId={projectId}
        existingRoute={existingRoute}
      />
    </div>
  );
}
