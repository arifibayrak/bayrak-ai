'use client';

/**
 * CurrencySelector.tsx
 *
 * Page-local currency selector. State is local (NOT a URL param — D-67).
 * Governs all money displays on the page: KPI cards, EV table, trend charts.
 *
 * Default: 'TRY'.
 * Width: 100px (fits 3-char ISO codes).
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CurrencySelectorProps {
  availableCurrencies: string[];
  onCurrencyChange: (currency: string) => void;
}

export function CurrencySelector({
  availableCurrencies,
  onCurrencyChange,
}: CurrencySelectorProps) {
  const [selected, setSelected] = useState('TRY');
  const t = useTranslations('dashboard.admin.currency');

  // Ensure TRY is always present in the list
  const currencies = availableCurrencies.includes('TRY')
    ? availableCurrencies
    : ['TRY', ...availableCurrencies];

  function handleChange(value: string | null) {
    const v = value ?? 'TRY';
    setSelected(v);
    onCurrencyChange(v);
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-semibold text-muted-foreground">
        {t('label')}
      </label>
      <Select value={selected} onValueChange={handleChange}>
        <SelectTrigger className="w-[100px]" aria-label={t('label')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {currencies.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
