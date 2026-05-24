'use client';

/**
 * BoqTabClient.tsx
 *
 * Client part of BoqTab: manages state for the item list, add/import dialogs,
 * and triggers refresh after mutations via Server Action revalidation.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { BoqTable, type BoqItem } from './BoqTable';
import { BoqItemDialog } from './BoqItemDialog';
import { BoqImportDialog } from './BoqImportDialog';

interface BoqTabClientProps {
  projectId: string;
  initialItems: BoqItem[];
}

export function BoqTabClient({ projectId, initialItems }: BoqTabClientProps) {
  const t = useTranslations('dashboard.boq');
  const router = useRouter();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Refresh the page to pick up Server Action revalidation
  const handleItemChanged = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <div className="space-y-6">
      {/* Section header + actions */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{t('title')}</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            {t('import_excel')}
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            {t('add_item')}
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {initialItems.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          {t('empty_state')}
        </div>
      ) : (
        <BoqTable
          projectId={projectId}
          items={initialItems}
          onItemChanged={handleItemChanged}
        />
      )}

      {/* Add item dialog */}
      <BoqItemDialog
        projectId={projectId}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={() => { setShowAddDialog(false); handleItemChanged(); }}
      />

      {/* Import dialog */}
      <BoqImportDialog
        projectId={projectId}
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onSuccess={handleItemChanged}
      />
    </div>
  );
}
