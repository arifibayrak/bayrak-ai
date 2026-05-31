'use client';

/**
 * ChainageOffsetForm.tsx
 *
 * Calibration offset client form — Phase 15 Plan 07 (CHN-02).
 * Calls setChainageOffset Server Action then router.refresh() on success.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BrandCard, BrandButton } from '@/components/brand';
import { setChainageOffset } from '@/actions/chainage';

interface ChainageOffsetFormProps {
  projectId: string;
  currentOffsetM: number;
}

export function ChainageOffsetForm({ projectId, currentOffsetM }: ChainageOffsetFormProps) {
  const router = useRouter();
  const t = useTranslations('dashboard.asbuilt');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();
  const [offsetInput, setOffsetInput] = useState(String(currentOffsetM));
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const parsed = parseFloat(offsetInput);
    if (isNaN(parsed)) {
      setError('Geçersiz değer');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await setChainageOffset(projectId, parsed);
        router.refresh();
        toast(tCommon('save'));
      } catch {
        setError('Kayıt başarısız');
      }
    });
  }

  return (
    <BrandCard>
      <BrandCard.Header>
        <span className="text-base font-semibold">{t('calibration_heading')}</span>
      </BrandCard.Header>
      <BrandCard.Body className="p-3">
        <div className="inline-flex items-center gap-3">
          <label className="text-sm text-muted-foreground" htmlFor="chainage-offset-input">
            {t('calibration_label')}
          </label>
          <input
            id="chainage-offset-input"
            type="number"
            step="0.01"
            value={offsetInput}
            onChange={e => setOffsetInput(e.target.value)}
            className="w-32 h-8 rounded-md border border-slate-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isPending}
          />
          <BrandButton
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isPending}
          >
            {t('calibration_save')}
          </BrandButton>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t('calibration_help')}</p>
        {error && (
          <p className="text-xs text-destructive mt-1">{error}</p>
        )}
      </BrandCard.Body>
    </BrandCard>
  );
}
