'use client';

/**
 * RouteTabClient.tsx
 *
 * Client part of RouteTab: manages whether to show the upload zone or
 * the saved-route metadata card. After a successful upload, switches to
 * the metadata card view.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RouteUpload } from './RouteUpload';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface ExistingRoute {
  id: string;
  coordinateCount: number;
  uploadedAt: Date;
}

interface RouteTabClientProps {
  projectId: string;
  existingRoute: ExistingRoute | null;
}

export function RouteTabClient({ projectId, existingRoute }: RouteTabClientProps) {
  const t = useTranslations('dashboard.route');
  const [savedRoute, setSavedRoute] = useState<ExistingRoute | null>(existingRoute);
  const [isReplacing, setIsReplacing] = useState(false);

  function handleUploadSuccess(count: number) {
    setSavedRoute({
      id: crypto.randomUUID(),
      coordinateCount: count,
      uploadedAt: new Date(),
    });
    setIsReplacing(false);
  }

  // Show saved route metadata + Replace button
  if (savedRoute && !isReplacing) {
    return (
      <div className="space-y-4">
        <Card className="p-6">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Koordinat sayısı /</span>
              <span className="font-medium">{savedRoute.coordinateCount.toLocaleString('tr-TR')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Yükleme tarihi /</span>
              <span className="font-medium">
                {savedRoute.uploadedAt.toLocaleDateString('tr-TR', {
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

  // Show upload zone (no route, or replacing)
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
