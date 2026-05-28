// Canonical list of currencies accepted across BOQ items, hakkediş periods,
// and money-display surfaces. v2.0 lock: aggregates are currency-aware; the
// system never sums across currencies (each currency stays in its own bucket).
//
// Originally lived in `src/actions/boq.ts` but moved here because that file
// carries the `'use server'` directive (which forbids non-async exports).
// Shared by `actions/boq.ts`, `actions/hakedis.ts`, and any caller that needs
// the canonical set.

export const ALLOWED_CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
export type AllowedCurrency = (typeof ALLOWED_CURRENCIES)[number];
