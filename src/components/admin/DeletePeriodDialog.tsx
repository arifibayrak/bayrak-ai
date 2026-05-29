'use client';

/**
 * DeletePeriodDialog.tsx
 *
 * Reusable delete confirmation dialog for draft hakkediş periods (D-97 / HAK-01).
 *
 * This component is shared between:
 *   - List page (Wave 3): draft rows render the Sil affordance
 *   - Detail page (Wave 4): PeriodDetailControls draft state renders Sil
 *
 * Trigger: "Sil / Delete" Button (variant="destructive", size="sm")
 *   — includes Trash2 lucide icon (aria-hidden)
 *   — aria-label="Delete period {periodNumber}" (UI-SPEC Accessibility Contract)
 *
 * Dialog content (max-w-sm, Surface 5):
 *   - DialogTitle: t('delete_dialog.title')
 *   - DialogDescription: t('delete_dialog.body', { periodNumber })
 *   - Footer: "Hayır, Koru / No, Keep It" ghost (cancel) + "Evet, Sil / Yes, Delete" destructive (confirm)
 *
 * On confirm: calls deletePeriod(periodId); on { ok: true } → router.refresh()
 * On error: shows inline Alert variant="destructive"
 *
 * Security: deletePeriod (Wave 2) is auth-guarded and enforces draft-only guard server-side
 * (defense in depth — the UI gates the Sil affordance to draft rows via status === 'draft').
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { BrandButton } from '@/components/brand';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { deletePeriod } from '@/actions/hakedis';

interface DeletePeriodDialogProps {
  periodId: string;
  periodNumber: string;
}

export function DeletePeriodDialog({ periodId, periodNumber }: DeletePeriodDialogProps) {
  const t = useTranslations('dashboard.admin.hakedis');
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setDeleting(true);
    try {
      await deletePeriod(periodId);
      setOpen(false);
      router.refresh();
    } catch {
      setError(t('form.err_general'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        setError(null);
      }
      setOpen(isOpen);
    }}>
      <DialogTrigger
        render={
          <BrandButton
            variant="destructive"
            size="sm"
            aria-label={`Delete period ${periodNumber}`}
          >
            <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" />
            {t('delete_link')}
          </BrandButton>
        }
      />

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('delete_dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('delete_dialog.body', { periodNumber })}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {/* "Hayır, Koru / No, Keep It" */}
          <DialogClose
            render={
              <BrandButton
                type="button"
                variant="outline"
                disabled={deleting}
              >
                {t('delete_dialog.cancel')}
              </BrandButton>
            }
          />
          {/* "Evet, Sil / Yes, Delete" */}
          <BrandButton
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={handleConfirm}
          >
            {deleting ? '...' : t('delete_dialog.confirm')}
          </BrandButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
