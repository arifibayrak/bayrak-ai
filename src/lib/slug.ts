/**
 * src/lib/slug.ts
 *
 * toSlug — D-112 ASCII slug helper for Content-Disposition filenames.
 *
 * Replaces Turkish characters with explicit ASCII equivalents (BEFORE lowercasing,
 * because Turkish dotted-I behaves differently under toLowerCase()), then collapses
 * any run of non-`[a-z0-9]` characters into a single dash and trims leading/trailing
 * dashes. Returns ''  for fully-invalid input (e.g. '---').
 *
 * Output is pure ASCII so it can be used directly in:
 *   Content-Disposition: attachment; filename="hakkedis-HK-2025-01-istanbul-dogalgaz.xlsx"
 * No RFC 5987 `filename*=UTF-8''…` encoding is needed (RESEARCH.md Open Question 2 RESOLVED).
 *
 * Consumed by Plans 11-02, 11-03, 11-04, 11-05 (every Excel + PDF route handler).
 */

const TURKISH_MAP: Record<string, string> = {
  'İ': 'i', 'I': 'i', 'ı': 'i',   // dotted/undotted capital + dotless lowercase
  'Ş': 's', 'ş': 's',
  'Ğ': 'g', 'ğ': 'g',
  'Ü': 'u', 'ü': 'u',
  'Ö': 'o', 'ö': 'o',
  'Ç': 'c', 'ç': 'c',
};

export function toSlug(name: string): string {
  return name
    .replace(/[İIıŞşĞğÜüÖöÇç]/g, ch => TURKISH_MAP[ch] ?? ch)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
