'use client';

/**
 * FinalizeDialog.tsx
 *
 * Finalize confirmation dialog (HAK-05 / D-96 / Surface 4).
 * Triggered by the "Kesinleştir / Finalize Period" button in the draft control row.
 *
 * Irreversibility notice: body copy makes explicit that this action is permanent.
 * Confirm button: variant="default" (primary blue — finalizing is a positive commitment,
 * NOT a destructive action per UI-SPEC Surface 4).
 * Dismiss: "Hayır, Geri Dön / No, Go Back" — ghost button.
 *
 * Both DialogTitle and DialogDescription are always rendered (a11y: aria-labelledby +
 * aria-describedby wiring provided by base-ui Dialog).
 *
 * Security: finalizePeriod (Wave 2) is auth-guarded and enforces draft-only guard
 * server-side (defense in depth — D-96 T-10-04-IMM).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
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
import { finalizePeriod } from '@/actions/hakedis';

interface FinalizeDialogProps {
  periodId: string;
}

export function FinalizeDialog({ periodId }: FinalizeDialogProps) {
  const t = useTranslations('dashboard.admin.hakedis');
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setFinalizing(true);
    try {
      await finalizePeriod(periodId);
      setOpen(false);
      router.refresh();
    } catch {
      setError(t('detail.err_finalize_blocked'));
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setError(null);
        }
        setOpen(isOpen);
      }}
    >
      <DialogTrigger
        render={
          <BrandButton variant="primary" size="sm">
            <Lock className="h-4 w-4 mr-1" aria-hidden="true" />
            {t('detail.finalize')}
          </BrandButton>
        }
      />

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          {/* Both DialogTitle and DialogDescription always present (a11y) */}
          <DialogTitle>{t('finalize_dialog.title')}</DialogTitle>
          <DialogDescription>{t('finalize_dialog.body')}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {/* "Hayır, Geri Dön / No, Go Back" — dismiss without action */}
          <DialogClose
            render={
              <BrandButton type="button" variant="outline" disabled={finalizing}>
                {t('finalize_dialog.cancel')}
              </BrandButton>
            }
          />
          {/* "Kesinleştir / Finalize Period" — primary (NOT destructive) */}
          <BrandButton
            type="button"
            variant="primary"
            disabled={finalizing}
            onClick={handleConfirm}
          >
            {finalizing ? '...' : t('finalize_dialog.confirm')}
          </BrandButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
