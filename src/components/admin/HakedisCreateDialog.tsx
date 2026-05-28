'use client';

/**
 * HakedisCreateDialog.tsx
 *
 * Create Period dialog (HAK-01).
 * UI-SPEC Surface 2: collects period label, dates, currency, rates (D-92 defaults),
 * and a stopaj toggle (D-93). On submit calls createPeriod, navigates to detail.
 *
 * Rate display: shown as % (0–100); converted to 0-1 fraction string before calling
 * createPeriod (server action validates fraction format).
 *
 * D-92 defaults: KDV 20%, tevkifat 40%, stopaj off, teminat 5%, avans 0%.
 * D-93: stopaj is a Switch toggle; rate input (default 2%) appears only when enabled.
 *
 * Dismiss: "Vazgeç / Discard" — closes + resets state.
 * Confirm: "Oluştur ve Hesapla / Create & Compute" — primary, triggers createPeriod.
 *
 * Security: all validation enforced server-side in createPeriod; client validation is UX only.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CurrencySelector } from '@/components/admin/CurrencySelector';
import { createPeriod } from '@/actions/hakedis';

interface HakedisCreateDialogProps {
  projectId: string;
}

// Convert percentage string to 4-decimal fraction string (e.g. "20" → "0.2000")
function pctToFraction(pct: string): string {
  const n = parseFloat(pct);
  if (isNaN(n)) return '0.0000';
  return (n / 100).toFixed(4);
}

// Get today's date as YYYY-MM-DD string (client-side, no server dependency)
function todayISODate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Generate a suggested period label (client-side: HK-{YYYY}-01)
function suggestPeriodLabel(): string {
  const year = new Date().getFullYear();
  return `HK-${year}-01`;
}

export function HakedisCreateDialog({ projectId }: HakedisCreateDialogProps) {
  const t = useTranslations('dashboard.admin.hakedis');
  const router = useRouter();

  // Dialog open state (controlled so we can reset on discard)
  const [open, setOpen] = useState(false);

  // Form field state — strings to avoid NaN-snapping on empty input
  const [periodLabel, setPeriodLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(todayISODate());
  const [currency, setCurrency] = useState('TRY');
  const [kdvRate, setKdvRate] = useState('20');           // D-92: 20%
  const [tevkifatRate, setTevkifatRate] = useState('40'); // D-92: 40%
  const [stopajEnabled, setStopajEnabled] = useState(false);
  const [stopajRate, setStopajRate] = useState('2');      // D-93: 2% default when enabled
  const [teminatRate, setTeminatRate] = useState('5');    // D-92: 5%
  const [avansRate, setAvansRate] = useState('0');        // D-92: 0%

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setPeriodLabel('');
    setStartDate('');
    setEndDate(todayISODate());
    setCurrency('TRY');
    setKdvRate('20');
    setTevkifatRate('40');
    setStopajEnabled(false);
    setStopajRate('2');
    setTeminatRate('5');
    setAvansRate('0');
    setError(null);
  }

  function handleDiscard() {
    resetForm();
    setOpen(false);
  }

  // When stopaj toggle is enabled for the first time, ensure default 2% is set
  function handleStopajToggle(checked: boolean) {
    setStopajEnabled(checked);
    if (checked && stopajRate === '') {
      setStopajRate('2');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side validation (UX only — server also validates)
    if (!endDate) {
      setError(t('form.err_missing_end_date'));
      return;
    }
    const label = periodLabel.trim() || suggestPeriodLabel();

    setSubmitting(true);
    try {
      const result = await createPeriod({
        projectId,
        periodNumber: label,
        periodStartDate: startDate || undefined,
        periodEndDate: endDate,
        currencyCode: currency,
        kdvRate: pctToFraction(kdvRate),
        tevkifatFraction: pctToFraction(tevkifatRate),
        retentionRate: pctToFraction(teminatRate),
        avansKesintisiRate: pctToFraction(avansRate),
        stopajEnabled,
        stopajRate: stopajEnabled ? pctToFraction(stopajRate) : undefined,
      });

      // On success: close dialog, reset, navigate to the new period's detail page
      setOpen(false);
      resetForm();
      router.push(`/dashboard/hakedis/${result.periodId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('end date') || msg.includes('periodEndDate')) {
        setError(t('form.err_missing_end_date'));
      } else {
        setError(t('form.err_general'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        resetForm();
      }
      setOpen(isOpen);
    }}>
      <DialogTrigger
        render={
          <Button variant="default" size="default" aria-label={t('create_cta')}>
            <PlusCircle className="h-4 w-4 mr-2" aria-hidden="true" />
            {t('create_cta')}
          </Button>
        }
      />

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{t('create_cta')}</DialogTitle>
            <DialogDescription>
              {t('subtitle')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Period Label */}
            <div className="space-y-1.5">
              <Label htmlFor="period-label">{t('form.period_label')}</Label>
              <Input
                id="period-label"
                type="text"
                maxLength={50}
                placeholder={suggestPeriodLabel()}
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* Start Date (optional) */}
            <div className="space-y-1.5">
              <Label htmlFor="start-date">{t('form.start_date')}</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* End Date (required) */}
            <div className="space-y-1.5">
              <Label htmlFor="end-date">
                {t('form.end_date')}
                <span className="ml-1 text-destructive" aria-hidden="true">*</span>
              </Label>
              <Input
                id="end-date"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* Currency */}
            <div className="space-y-1.5">
              <Label>{t('form.currency')}</Label>
              <CurrencySelector
                availableCurrencies={['TRY', 'USD', 'EUR']}
                onCurrencyChange={setCurrency}
              />
            </div>

            {/* Separator: Deduction Rates */}
            <div className="space-y-2">
              <Separator />
              <p className="text-sm font-semibold text-muted-foreground">
                {t('form.deduction_rates_heading')}
              </p>
            </div>

            {/* KDV Rate */}
            <div className="space-y-1.5">
              <Label htmlFor="kdv-rate">{t('form.kdv_rate')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="kdv-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className="w-[100px] tabular-nums"
                  value={kdvRate}
                  onChange={(e) => setKdvRate(e.target.value)}
                  disabled={submitting}
                />
                <span className="text-sm text-muted-foreground" aria-hidden="true">%</span>
              </div>
            </div>

            {/* KDV Tevkifat Rate */}
            <div className="space-y-1.5">
              <Label htmlFor="tevkifat-rate">{t('form.tevkifat_rate')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="tevkifat-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className="w-[100px] tabular-nums"
                  value={tevkifatRate}
                  onChange={(e) => setTevkifatRate(e.target.value)}
                  disabled={submitting}
                />
                <span className="text-sm text-muted-foreground" aria-hidden="true">%</span>
              </div>
            </div>

            {/* Stopaj Toggle (D-93) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold" htmlFor="stopaj-toggle">
                  {t('form.stopaj_label')}
                </Label>
                <Switch
                  id="stopaj-toggle"
                  checked={stopajEnabled}
                  onCheckedChange={handleStopajToggle}
                  disabled={submitting}
                />
              </div>
              {stopajEnabled && (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    id="stopaj-rate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    className="w-[100px] tabular-nums"
                    value={stopajRate}
                    onChange={(e) => setStopajRate(e.target.value)}
                    disabled={submitting}
                    aria-label={t('form.stopaj_rate')}
                  />
                  <span className="text-sm text-muted-foreground" aria-hidden="true">%</span>
                </div>
              )}
            </div>

            {/* Teminat Rate */}
            <div className="space-y-1.5">
              <Label htmlFor="teminat-rate">{t('form.teminat_rate')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="teminat-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className="w-[100px] tabular-nums"
                  value={teminatRate}
                  onChange={(e) => setTeminatRate(e.target.value)}
                  disabled={submitting}
                />
                <span className="text-sm text-muted-foreground" aria-hidden="true">%</span>
              </div>
            </div>

            {/* Avans Kesintisi Rate */}
            <div className="space-y-1.5">
              <Label htmlFor="avans-rate">{t('form.avans_rate')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="avans-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className="w-[100px] tabular-nums"
                  value={avansRate}
                  onChange={(e) => setAvansRate(e.target.value)}
                  disabled={submitting}
                />
                <span className="text-sm text-muted-foreground" aria-hidden="true">%</span>
              </div>
            </div>

            {/* Inline error alert */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            {/* Discard: "Vazgeç / Discard" */}
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleDiscard}
                  disabled={submitting}
                >
                  {t('form.discard')}
                </Button>
              }
            />
            {/* Confirm: "Oluştur ve Hesapla / Create & Compute" */}
            <Button
              type="submit"
              variant="default"
              disabled={submitting}
            >
              {submitting ? '...' : t('form.create_compute')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
