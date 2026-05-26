'use client';

/**
 * BoqTable.tsx
 *
 * BOQ line items table (UI-SPEC #4a).
 * Displays contracted qty, approved qty, and remaining balance per row.
 * Remaining balance uses both color AND numeric label (accessibility).
 * Color thresholds per UI-SPEC: success (>10%), warning (≤10%), destructive (0 or negative).
 *
 * Uses Intl.NumberFormat('tr-TR') for locale-formatted numbers.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { remainingBalance } from '@/lib/boq-balance';
import { lineValue, formatCurrency } from '@/lib/boq-value';
import { deleteBoqItem } from '@/actions/boq';
import { BoqItemDialog } from './BoqItemDialog';

export interface BoqItem {
  id: string;
  material: string;
  unit: string;
  plannedQty: string;
  approvedQty: string;
  sortOrder: number;
  unitPrice?: string | null;
  currencyCode?: string | null;
}

interface BoqTableProps {
  projectId: string;
  items: BoqItem[];
  onItemChanged: () => void;
}

const trFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });

function formatQty(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return '—';
  return trFmt.format(n);
}

/**
 * balanceColorClass — returns Tailwind text color class for remaining balance.
 * Uses both color AND label (accessibility — color is not the sole differentiator).
 *
 * Thresholds (UI-SPEC):
 *   > 10% of planned → success (green)
 *   ≤ 10% of planned → warning (amber)
 *   0 or negative    → destructive (red)
 */
function balanceColorClass(balance: number, planned: number): string {
  if (balance <= 0) return 'text-destructive';
  const pct = planned > 0 ? balance / planned : 0;
  if (pct <= 0.1) return 'text-[hsl(38_92%_50%)]'; // warning
  return 'text-[hsl(142_76%_36%)]'; // success
}

/**
 * progressColorClass — returns Tailwind text color class for completion percentage.
 *
 * Thresholds (UI-SPEC, DASH-04):
 *   >= 90% → success (green) — nearly done
 *   > 0% && <= 10% → warning (amber) — barely started
 *   else → default (no class)
 */
function progressColorClass(pct: number): string {
  if (pct >= 90) return 'text-[hsl(142_76%_36%)]'; // success
  if (pct > 0 && pct <= 10) return 'text-[hsl(38_92%_50%)]'; // warning
  return '';
}

export function BoqTable({ projectId, items, onItemChanged }: BoqTableProps) {
  const t = useTranslations('dashboard.boq');
  const tc = useTranslations('common');

  const [editItem, setEditItem] = useState<BoqItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<BoqItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!deleteItem) return;
    setIsDeleting(true);
    try {
      await deleteBoqItem(deleteItem.id);
      toast.success(tc('yes_remove'));
      setDeleteItem(null);
      onItemChanged();
    } catch {
      toast.error(tc('error_generic'));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="w-10">{t('col_number')}</TableHead>
            <TableHead scope="col" className="min-w-[200px]">{t('col_material')}</TableHead>
            <TableHead scope="col" className="w-20">{t('col_unit')}</TableHead>
            <TableHead scope="col" className="w-[120px] text-right">{t('col_contracted_qty')}</TableHead>
            <TableHead scope="col" className="w-[120px] text-right">{t('col_approved_qty')}</TableHead>
            <TableHead scope="col" className="w-[140px] text-right">{t('col_contracted_value')}</TableHead>
            <TableHead scope="col" className="w-[140px] text-right">{t('col_earned_value')}</TableHead>
            <TableHead scope="col" className="w-20 text-right">{t('col_completion_pct')}</TableHead>
            <TableHead scope="col" className="min-w-[80px]">{/* Progress bar — no header text */}</TableHead>
            <TableHead scope="col" className="w-[120px] text-right">{t('col_remaining')}</TableHead>
            <TableHead scope="col" className="w-20">{t('col_actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, idx) => {
            const planned = parseFloat(item.plannedQty);
            const approved = parseFloat(item.approvedQty);
            const balance = remainingBalance(item.plannedQty, item.approvedQty);
            const colorClass = balanceColorClass(balance, planned);
            const completionPct = planned > 0 ? Math.min((approved / planned) * 100, 100) : 0;

            const bac = formatCurrency(lineValue(item.plannedQty, item.unitPrice), item.currencyCode);
            const ev = formatCurrency(lineValue(item.approvedQty, item.unitPrice), item.currencyCode);

            return (
              <TableRow key={item.id}>
                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                <TableCell className="break-words">{item.material}</TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell className="text-right tabular-nums">{formatQty(planned)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatQty(approved)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{bac}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{ev}</TableCell>
                <TableCell className={`text-right tabular-nums ${progressColorClass(completionPct)}`}>
                  {new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(completionPct) + '%'}
                </TableCell>
                <TableCell>
                  <Progress value={completionPct} className="min-w-[80px] h-2" />
                </TableCell>
                <TableCell className={`text-right tabular-nums font-medium ${colorClass}`}>
                  {formatQty(balance)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={tc('edit') + ' / ' + tc('delete')}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditItem(item)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {tc('edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteItem(item)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {tc('delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Edit dialog */}
      {/* WR-03: key={editItem.id} forces a structural remount when a different
          item is edited, so the dialog's useState initializers re-read the new
          item prop instead of showing the previously-edited item's stale values. */}
      {editItem && (
        <BoqItemDialog
          key={editItem.id}
          projectId={projectId}
          item={editItem}
          open={!!editItem}
          onOpenChange={(open) => { if (!open) setEditItem(null); }}
          onSuccess={() => { setEditItem(null); onItemChanged(); }}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteItem} onOpenChange={(open) => { if (!open) setDeleteItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('remove_item')}</DialogTitle>
            <DialogDescription>{t('remove_item_confirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)} disabled={isDeleting}>
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? tc('loading') : t('remove_item_cta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
