'use client';

/**
 * PeriodDetailControls.tsx
 *
 * State-gated control row for the period detail page (D-96 / HAK-04 / HAK-05).
 *
 * Controls are REMOVED (not just disabled) when not applicable per status — this is
 * a deliberate UX decision to prevent confusion (D-96 / T-10-04-IMM).
 *
 * Status → controls mapping:
 *   draft      → Recompute + Finalize (via FinalizeDialog) + Delete (via DeletePeriodDialog)
 *   finalized  → "Tahakkuk Et / Mark Submitted" outline button
 *   submitted  → "Ödendi / Mark Paid" outline button
 *   paid       → no controls
 *
 * DeletePeriodDialog is IMPORTED from Wave 3 (src/components/admin/DeletePeriodDialog.tsx).
 * It renders its own trigger button — do NOT recreate it here.
 *
 * Security: all mutation actions (recompute/finalize/advance/delete) are auth-guarded
 * and tenant-scoped in their respective server actions (defense in depth, T-10-04-IMM).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { RefreshCw, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { recomputePeriodLines, updatePaymentStatus } from '@/actions/hakedis';
import { FinalizeDialog } from '@/components/admin/FinalizeDialog';
import { DeletePeriodDialog } from '@/components/admin/DeletePeriodDialog';

type HakedisStatus = 'draft' | 'finalized' | 'submitted' | 'paid';

interface PeriodDetailControlsProps {
  periodId: string;
  periodNumber: string;
  status: HakedisStatus;
}

export function PeriodDetailControls({
  periodId,
  periodNumber,
  status,
}: PeriodDetailControlsProps) {
  const t = useTranslations('dashboard.admin.hakedis');
  const router = useRouter();

  const [recomputing, setRecomputing] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRecompute() {
    setError(null);
    setRecomputing(true);
    try {
      await recomputePeriodLines(periodId);
      router.refresh();
    } catch {
      setError(t('form.err_general'));
    } finally {
      setRecomputing(false);
    }
  }

  async function handleAdvanceStatus(target: 'submitted' | 'paid') {
    setError(null);
    setAdvancing(true);
    try {
      await updatePaymentStatus(periodId, target);
      router.refresh();
    } catch {
      setError(t('form.err_general'));
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Error shown above the control row (defense-in-depth guard only) */}
      {error && (
        <Alert variant="destructive" className="max-w-xs">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        {status === 'draft' && (
          <>
            {/* Recompute: updates lines with latest approved submissions */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecompute}
              disabled={recomputing}
            >
              <RefreshCw className="h-4 w-4 mr-1" aria-hidden="true" />
              {t('detail.recompute')}
            </Button>

            {/* Finalize: opens confirmation dialog (FinalizeDialog renders its own trigger) */}
            <FinalizeDialog periodId={periodId} />

            {/* Delete: shared Wave 3 dialog (renders its own destructive trigger) */}
            <DeletePeriodDialog periodId={periodId} periodNumber={periodNumber} />
          </>
        )}

        {status === 'finalized' && (
          /* Tahakkuk Et / Mark Submitted */
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAdvanceStatus('submitted')}
            disabled={advancing}
          >
            {t('detail.mark_submitted')}
          </Button>
        )}

        {status === 'submitted' && (
          /* Ödendi / Mark Paid */
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAdvanceStatus('paid')}
            disabled={advancing}
          >
            {t('detail.mark_paid')}
          </Button>
        )}

        {/* paid: no controls — this block intentionally empty (state-gated removal D-96) */}

        {/* D-108 + UI-SPEC Surface 2: Excel + PDF download buttons.
            Routed through the same /api/exports/hakedis/[periodId] handlers as the Exports hub
            (D-108 single-handler contract). Buttons REMOVED — not disabled — when status === 'draft'
            (UI-SPEC Surface 2 Draft guard; D-96 state-gated removal). Defense in depth: route
            handlers themselves return 422 for draft periods (Plan 11-04 Pitfall 5). */}
        {status !== 'draft' && (
          <>
            <a
              href={`/api/exports/hakedis/${periodId}`}
              download
              aria-label={t('detail.export_excel')}
            >
              <Button variant="outline" size="sm">
                <FileSpreadsheet className="h-4 w-4 mr-1" aria-hidden="true" />
                {t('detail.export_excel')}
              </Button>
            </a>
            <a
              href={`/api/exports/hakedis/${periodId}/pdf`}
              download
              aria-label={t('detail.download_pdf')}
            >
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-1" aria-hidden="true" />
                {t('detail.download_pdf')}
              </Button>
            </a>
          </>
        )}
      </div>
    </div>
  );
}
