/**
 * src/lib/boq-balance.ts
 *
 * Pure helper for BOQ remaining balance calculation (SETUP-04).
 *
 * Design rationale:
 * - Drizzle returns numeric columns as strings to preserve precision.
 * - This helper accepts both string and number inputs so it works with
 *   Drizzle query results (strings) and in-memory values (numbers).
 * - remainingBalance is computed at read time; no maintained column needed.
 */

/**
 * remainingBalance — returns plannedQty minus approvedQty.
 *
 * @param planned  - The contracted/planned quantity (numeric string or number)
 * @param approved - The approved quantity to date (numeric string or number)
 * @returns The remaining balance as a number (may be negative if over-approved)
 */
export function remainingBalance(
  planned: string | number,
  approved: string | number
): number {
  const plannedNum = typeof planned === 'string' ? parseFloat(planned) : planned;
  const approvedNum = typeof approved === 'string' ? parseFloat(approved) : approved;
  return plannedNum - approvedNum;
}
