'use client';

/**
 * BoqImportDialog.tsx
 *
 * Excel BOQ import dialog — 6-step preview→confirm flow (D-05, UI-SPEC #4a).
 *
 * Steps:
 * 1. User clicks "Excel'den İçe Aktar"
 * 2. Dialog opens: file input (.xlsx only) + "Şablon İndir" download link
 * 3. After file selection: calls previewBoqImport Server Action
 * 4. Shows preview table (read-only) + "{X} kalem içe aktarılacak" count
 * 5. User clicks "Onayla ve İçe Aktar" → calls confirmBoqImport
 * 6. On success: close dialog, toast, parent refreshes
 *
 * Threat T-06-03: 4MB body limit note shown as sub-label.
 * Threat T-06-05: .xlsx-only accept filter + ONLY_XLSX error handling.
 */

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertCircle, FileSpreadsheet } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { previewBoqImport, confirmBoqImport } from '@/actions/boq';
import type { BoqRow } from '@/lib/excel';

interface BoqImportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type DialogState =
  | { step: 'idle' }
  | { step: 'previewing' }
  | { step: 'preview'; rows: BoqRow[] }
  | { step: 'error'; errors: { row: number; field: string; message: string }[] }
  | { step: 'confirming' };

const trFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });

export function BoqImportDialog({
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: BoqImportDialogProps) {
  const t = useTranslations('dashboard.boq');
  const tc = useTranslations('common');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogState, setDialogState] = useState<DialogState>({ step: 'idle' });
  const [isPending, startTransition] = useTransition();

  function reset() {
    setDialogState({ step: 'idle' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setDialogState({
        step: 'error',
        errors: [{ row: 0, field: 'file', message: 'ONLY_XLSX' }],
      });
      e.target.value = '';
      return;
    }

    setDialogState({ step: 'previewing' });

    const formData = new FormData();
    formData.append('file', file);

    startTransition(async () => {
      const result = await previewBoqImport(formData);
      if (result.ok) {
        setDialogState({ step: 'preview', rows: result.rows });
      } else {
        setDialogState({ step: 'error', errors: result.errors });
      }
    });

    e.target.value = '';
  }

  function handleConfirm() {
    if (dialogState.step !== 'preview') return;
    const { rows } = dialogState;

    setDialogState({ step: 'confirming' });
    startTransition(async () => {
      const result = await confirmBoqImport(projectId, rows);
      if (result.ok) {
        toast.success(t('import_count', { count: result.count }));
        handleClose(false);
        onSuccess();
      } else {
        setDialogState({
          step: 'error',
          errors: [{ row: 0, field: 'file', message: tc('error_generic') }],
        });
      }
    });
  }

  const isLoading =
    dialogState.step === 'previewing' ||
    dialogState.step === 'confirming' ||
    isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('import_excel')}</DialogTitle>
          <DialogDescription>
            {t('download_template')} veya mevcut bir dosyayı yükleyin.
            <br />
            <span className="text-xs text-muted-foreground">
              Yalnızca .xlsx · Maks. 4MB
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* File input + template download */}
        {(dialogState.step === 'idle' ||
          dialogState.step === 'previewing' ||
          dialogState.step === 'error') && (
          <div className="space-y-4">
            {/* Template download link */}
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <a
                href={`/dashboard/projects/${projectId}/boq-template`}
                download="boq-template.xlsx"
                className="text-primary underline-offset-4 hover:underline"
              >
                {t('download_template')}
              </a>
            </div>

            {/* File input */}
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                className="hidden"
                aria-label={t('import_excel')}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                {isLoading ? tc('loading') : t('choose_file') + ' (.xlsx)'}
              </Button>
            </div>

            {/* Error state */}
            {dialogState.step === 'error' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {dialogState.errors.map((err, i) => {
                    if (err.message === 'ONLY_XLSX') {
                      return <div key={i}>{t('excel_not_xlsx')}</div>;
                    }
                    return (
                      <div key={i}>
                        {err.row > 0
                          ? t('row_parse_error', {
                              row: err.row,
                              fieldName: err.field,
                              requirement: err.message,
                            })
                          : err.message}
                      </div>
                    );
                  })}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Preview table */}
        {dialogState.step === 'preview' && (
          <div className="space-y-4">
            <p className="text-sm font-medium">
              {t('import_count', { count: dialogState.rows.length })}
            </p>
            <div className="max-h-[360px] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{t('col_number')}</TableHead>
                    <TableHead scope="col" className="min-w-[200px]">{t('col_material')}</TableHead>
                    <TableHead scope="col">{t('col_unit')}</TableHead>
                    <TableHead scope="col" className="text-right">{t('col_contracted_qty')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dialogState.rows.map((row, idx) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>{row.material}</TableCell>
                      <TableCell>{row.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {trFmt.format(row.plannedQty)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Confirming state (inline spinner) */}
        {dialogState.step === 'confirming' && (
          <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
            <span className="text-sm">{tc('loading')}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)} disabled={isLoading}>
            {tc('cancel')}
          </Button>
          {dialogState.step === 'preview' && (
            <Button onClick={handleConfirm} disabled={isPending}>
              {t('confirm_import')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
