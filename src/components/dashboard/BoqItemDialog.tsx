'use client';

/**
 * BoqItemDialog.tsx
 *
 * Add/Edit BOQ line item dialog (UI-SPEC #4a).
 * Fields: Material (required), Unit (required), Contracted Qty (positive number, required).
 * Validation on submit, not on blur.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addBoqItem, updateBoqItem, setUnitPrice as setUnitPriceAction } from '@/actions/boq';
import type { BoqItem } from './BoqTable';

const CURRENCY_OPTIONS = ['TRY', 'USD', 'EUR'] as const;

interface BoqItemDialogProps {
  projectId: string;
  item?: BoqItem | null; // null = add mode; defined = edit mode
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface FormErrors {
  material?: string;
  unit?: string;
  plannedQty?: string;
  unitPrice?: string;
}

export function BoqItemDialog({
  projectId,
  item,
  open,
  onOpenChange,
  onSuccess,
}: BoqItemDialogProps) {
  const t = useTranslations('dashboard.boq');
  const tc = useTranslations('common');

  const isEdit = !!item;

  const [material, setMaterial] = useState(item?.material ?? '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [plannedQty, setPlannedQty] = useState(
    item ? parseFloat(item.plannedQty).toString() : ''
  );
  // unitPrice: null/undefined → empty string (placeholder), NOT '0'
  const [unitPrice, setUnitPrice] = useState(
    item?.unitPrice ? item.unitPrice : ''
  );
  const [currencyCode, setCurrencyCode] = useState(
    item?.currencyCode ?? 'TRY'
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [isPending, setIsPending] = useState(false);

  function validate(): boolean {
    const newErrors: FormErrors = {};
    if (!material.trim()) newErrors.material = 'Malzeme zorunludur / Material is required';
    if (!unit.trim()) newErrors.unit = 'Birim zorunludur / Unit is required';
    const qty = parseFloat(plannedQty.replace(',', '.'));
    if (isNaN(qty) || qty <= 0) {
      newErrors.plannedQty = 'Geçerli pozitif sayı gerekli / Must be a positive number';
    }
    // unitPrice is optional; if provided it must be non-negative
    if (unitPrice.trim() !== '') {
      const price = parseFloat(unitPrice.replace(',', '.'));
      if (isNaN(price) || price < 0) {
        newErrors.unitPrice = 'Geçerli fiyat giriniz (0 veya pozitif) / Must be a non-negative number';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsPending(true);
    try {
      const qty = parseFloat(plannedQty.replace(',', '.'));
      // Normalize comma to period; empty string becomes null (no price)
      const normalizedPrice = unitPrice.trim() === ''
        ? null
        : unitPrice.replace(',', '.');

      let result;
      let boqItemId: string | undefined;

      if (isEdit && item) {
        result = await updateBoqItem(item.id, { material, unit, plannedQty: qty });
        boqItemId = item.id;
      } else {
        result = await addBoqItem({ projectId, material, unit, plannedQty: qty });
        boqItemId = result.ok ? (result as { ok: true; id: string }).id : undefined;
      }

      if (result.ok && boqItemId) {
        // Set unit price (separately from the primary mutation — COST-01).
        // WR-02: check the result. setUnitPrice can fail (item not found, price
        // rejected, DB error); if we ignore it the row is saved without a price
        // and the user is falsely told it succeeded. Surface the error and keep
        // the dialog open so the user can retry.
        const priceResult = await setUnitPriceAction({ boqItemId, unitPrice: normalizedPrice, currencyCode });
        if (!priceResult.ok) {
          toast.error(priceResult.error ?? tc('error_generic'));
          return; // keep dialog open; do not call onSuccess
        }
        toast.success(tc('save'));
        onSuccess();
      } else {
        toast.error(tc('error_generic'));
      }
    } catch {
      toast.error(tc('error_generic'));
    } finally {
      setIsPending(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      // Reset state when closing
      setMaterial(item?.material ?? '');
      setUnit(item?.unit ?? '');
      setPlannedQty(item ? parseFloat(item.plannedQty).toString() : '');
      setUnitPrice(item?.unitPrice ? item.unitPrice : '');
      setCurrencyCode(item?.currencyCode ?? 'TRY');
      setErrors({});
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? tc('edit') + ' — ' + t('col_material') : t('add_item')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Material */}
          <div className="space-y-1.5">
            <Label htmlFor="boq-material">{t('col_material')}</Label>
            <Input
              id="boq-material"
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder="DN200 HDPE Boru"
              aria-invalid={!!errors.material}
              autoFocus
            />
            {errors.material && (
              <p className="text-sm text-destructive">{errors.material}</p>
            )}
          </div>

          {/* Unit */}
          <div className="space-y-1.5">
            <Label htmlFor="boq-unit">{t('col_unit')}</Label>
            <Input
              id="boq-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="m, m³, adet"
              aria-invalid={!!errors.unit}
            />
            {errors.unit && (
              <p className="text-sm text-destructive">{errors.unit}</p>
            )}
          </div>

          {/* Planned Qty */}
          <div className="space-y-1.5">
            <Label htmlFor="boq-qty">{t('col_contracted_qty')}</Label>
            <Input
              id="boq-qty"
              type="text"
              inputMode="decimal"
              value={plannedQty}
              onChange={(e) => setPlannedQty(e.target.value)}
              placeholder="1500"
              aria-invalid={!!errors.plannedQty}
            />
            {errors.plannedQty && (
              <p className="text-sm text-destructive">{errors.plannedQty}</p>
            )}
          </div>

          {/* Unit Price (optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="boq-unit-price">{t('col_unit_price')}</Label>
            <Input
              id="boq-unit-price"
              type="text"
              inputMode="decimal"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder={t('unit_price_placeholder')}
              aria-invalid={!!errors.unitPrice}
            />
            {errors.unitPrice ? (
              <p className="text-sm text-destructive">{errors.unitPrice}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{t('unit_price_hint')}</p>
            )}
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <Label htmlFor="boq-currency">{t('col_currency')}</Label>
            <select
              id="boq-currency"
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? tc('loading') : tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
