// src/lib/format-chainage.ts
// Pure utility — zero imports. Safe to import from RSC, client component, PDF helper, Telegram path.
// No circular dependency risk: this file has no imports at all.
//
// Turkish construction stationing convention: "km X+YYY"
//   km X   = kilometres (whole number)
//   +YYY   = remainder metres, zero-padded to 3 digits
//
// Examples:
//   formatChainage(0)     → "km 0+000"
//   formatChainage(500)   → "km 0+500"
//   formatChainage(1000)  → "km 1+000"
//   formatChainage(2347)  → "km 2+347"
//   formatChainage(12480) → "km 12+480"

export function formatChainage(m: number): string {
  const km = Math.floor(m / 1000);
  const remainder = Math.round(m % 1000).toString().padStart(3, '0');
  return `km ${km}+${remainder}`;
}
