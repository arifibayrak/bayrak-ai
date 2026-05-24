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
import { addBoqItem, updateBoqItem } from '@/actions/boq';
import type { BoqItem } from './BoqTable';

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
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsPending(true);
    try {
      const qty = parseFloat(plannedQty.replace(',', '.'));

      let result;
      if (isEdit && item) {
        result = await updateBoqItem(item.id, { material, unit, plannedQty: qty });
      } else {
        result = await addBoqItem({ projectId, material, unit, plannedQty: qty });
      }

      if (result.ok) {
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
