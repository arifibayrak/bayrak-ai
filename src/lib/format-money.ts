import Decimal from 'decimal.js';

/**
 * Precision-safe money formatters.
 *
 * Round with decimal.js (toFixed(2)) — never a JS float — then apply
 * locale-aware thousands grouping via Intl.NumberFormat on a BigInt of the
 * integer portion. The value passes through Number() at no point, so
 * precision is preserved for arbitrarily large amounts (above 2^53).
 *
 *   tr-TR → "1.234.567,89"
 *   en-US → "1,234,567.89"
 *
 * Return the em dash for null / undefined / unparseable input.
 *
 * Centralised in `src/lib/` so server components in the admin area share one
 * formatter — the previous per-page implementations went through `Number()`
 * for the locale-grouping step, leaking back into the JS-float domain that
 * the money-math lock forbids (10-REVIEW CR-01 / WR-01).
 */

/**
 * Number-only formatter — returns the grouped, two-decimal string without a
 * currency suffix. Use this when the currency is rendered in a separate cell
 * (e.g. the period list table where Para Birimi is its own column).
 */
export function formatMoneyAmount(
  value: string | null | undefined,
  locale: string,
): string {
  if (value == null) return '—';
  try {
    const fixed = new Decimal(value).toFixed(2); // e.g. "1234567.89" or "-12.50"
    const isNegative = fixed.startsWith('-');
    const absFixed = isNegative ? fixed.slice(1) : fixed;
    const [intPart, decPart] = absFixed.split('.');
    const localeTag = locale === 'tr' ? 'tr-TR' : 'en-US';
    const intFormatted = new Intl.NumberFormat(localeTag).format(BigInt(intPart));
    const decSeparator = locale === 'tr' ? ',' : '.';
    const signPrefix = isNegative ? '-' : '';
    return `${signPrefix}${intFormatted}${decSeparator}${decPart}`;
  } catch {
    return '—';
  }
}

/**
 * Number + currency formatter — returns the grouped, two-decimal string with
 * a trailing currency code (e.g. "1.234,56 TRY"). Use this when the figure
 * is rendered standalone (e.g. the period detail deduction-summary chain).
 */
export function formatMoney(
  value: string | null | undefined,
  currency: string,
  locale: string,
): string {
  const amount = formatMoneyAmount(value, locale);
  if (amount === '—') return '—';
  return `${amount} ${currency}`;
}

/**
 * Currency symbols for the codes this product uses. TRY → ₺ (Turkish Lira sign,
 * U+20BA). Unknown codes fall back to the code itself.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

/**
 * Symbol money formatter — grouped, exactly two decimals, with the currency
 * symbol. Known symbols prefix the amount ("₺1.234,56"); unknown codes are
 * appended ("1.234,56 XAU"). Returns the em dash for null/unparseable input.
 *
 * Precision-safe: delegates to formatMoneyAmount (decimal.js + BigInt grouping),
 * never JS float. Use everywhere a monetary value is shown to a user so the
 * currency is always explicit and the precision is always two digits.
 */
export function formatMoneySymbol(
  value: string | null | undefined,
  currency: string,
  locale: string,
): string {
  const amount = formatMoneyAmount(value, locale);
  if (amount === '—') return '—';
  const sym = CURRENCY_SYMBOLS[currency];
  return sym ? `${sym}${amount}` : `${amount} ${currency}`;
}
