/**
 * src/lib/boq-value.ts
 *
 * Pure helpers for BOQ per-line monetary value calculation (Plan 07-05).
 *
 * Design rationale:
 * - Drizzle returns numeric columns as strings to preserve precision.
 * - Money math uses decimal.js — never raw JS float multiplication — to avoid
 *   IEEE-754 precision loss (e.g. 100 * 1250.5 === 125050.0000000001 in JS).
 * - BAC = lineValue(plannedQty, unitPrice)
 * - EV  = lineValue(approvedQty, unitPrice)
 * - Unpriced rows (unitPrice null/undefined) return null → rendered as '—'.
 */

import Decimal from 'decimal.js';

/**
 * lineValue — computes qty × unitPrice using decimal.js.
 *
 * @param qty       - Quantity as a numeric string (or null/undefined)
 * @param unitPrice - Unit price as a numeric string (or null/undefined)
 * @returns         The product as a two-decimal fixed string (e.g. "125050.00"),
 *                  or null when either operand is absent/non-numeric.
 */
export function lineValue(
  qty: string | null | undefined,
  unitPrice: string | null | undefined
): string | null {
  if (qty == null || unitPrice == null) return null;
  try {
    const qtyDecimal = new Decimal(qty);
    const priceDecimal = new Decimal(unitPrice);
    return qtyDecimal.times(priceDecimal).toFixed(2);
  } catch {
    // Decimal constructor throws on non-numeric strings
    return null;
  }
}

/**
 * formatCurrency — formats a pre-computed value string as a locale currency string.
 *
 * @param value        - Two-decimal string from lineValue, or null
 * @param currencyCode - ISO-4217 currency code (e.g. 'TRY', 'USD'); defaults to 'TRY'
 * @returns            Em-dash '—' when value is null (unpriced row);
 *                     otherwise a locale-formatted currency string using tr-TR locale.
 *                     Falls back to plain number + code suffix on invalid currency code.
 */
export function formatCurrency(
  value: string | null,
  currencyCode: string | null | undefined
): string {
  if (value === null) return '—';
  const code = currencyCode || 'TRY';
  // WR-04: do NOT parseFloat — it can yield artefacts like 1234567890.1199999.
  // `value` is already a pre-rounded 2-decimal string produced by lineValue()'s
  // Decimal.toFixed(2), so Number() reproduces it exactly at 2dp. Intl.NumberFormat
  // requires a number, and Number() is the precise bridge for an already-rounded value.
  const numeric = Number(value);
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: code,
    }).format(numeric);
  } catch {
    // Invalid currency code — fall back to plain number + code suffix
    return (
      new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(numeric) +
      ' ' +
      code
    );
  }
}
