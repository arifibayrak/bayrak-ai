/**
 * hakedis-status.ts
 *
 * Server-safe hakkediş status helpers. Pure, framework-free — NO 'use client'.
 *
 * Extracted from HakedisStatusBadge.tsx (a 'use client' component) so server
 * components (e.g. the hakkediş period detail page RSC) can call
 * `asHakedisStatus()` without tripping the "called a client function from the
 * server" boundary error. The client badge re-imports from here.
 */

export type HakedisStatus = 'draft' | 'finalized' | 'submitted' | 'paid';

/** Status → BrandBadge semantic variant (amber is reserved for brand primary). */
export const STATUS_VARIANT_MAP: Record<
  HakedisStatus,
  'warning' | 'info' | 'primary' | 'success'
> = {
  draft: 'warning',
  finalized: 'info',
  submitted: 'primary',
  paid: 'success',
};

/**
 * Allowlist guard for raw DB status strings (WR-04).
 * Returns the typed status if it is one of the four known values, else `null`.
 */
export function asHakedisStatus(
  s: string | null | undefined,
): HakedisStatus | null {
  return s != null && s in STATUS_VARIANT_MAP ? (s as HakedisStatus) : null;
}
