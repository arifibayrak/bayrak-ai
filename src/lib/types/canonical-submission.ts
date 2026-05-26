/**
 * CanonicalSubmission — the money-safe boundary type for submission records.
 *
 * This is the single shared shape consumed by:
 *   - Analytics queries (getCanonicalSubmissions, getProjectMetrics)
 *   - Table display components
 *   - Excel export
 *   - Hakkediş period line computation (computePeriodLines)
 *
 * CRITICAL: unitPrice, quantity, earnedValue, and locationDistanceM are typed as
 * `string` (not `number`). Drizzle returns Postgres `numeric` columns as JavaScript
 * strings. Callers MUST parse these fields with `new Decimal(value)` from decimal.js
 * before any arithmetic or display formatting. NEVER use parseFloat() on these fields
 * in a multiplication or accumulation loop — it introduces IEEE 754 float drift.
 *
 * Money-safe display pattern:
 *   import Decimal from 'decimal.js';
 *   const formatted = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: row.currencyCode })
 *     .format(new Decimal(row.unitPrice ?? '0').toNumber());
 */
export type CanonicalSubmission = {
  id: string;
  projectId: string;
  projectName: string;
  personId: string;             // people.id (uuid)
  workerName: string;           // people.display_name
  auditorName: string | null;   // people.display_name of decided_by; null if pending
  boqItemId: string;
  material: string;
  unit: string;
  unitPrice: string | null;     // numeric string from DB; null if not set; use decimal.js for display
  currencyCode: string;         // ISO-4217 e.g. 'TRY', 'USD'
  quantity: string;             // numeric string from DB; parse before display — NEVER parseFloat()
  earnedValue: string | null;   // quantity * unit_price computed in Postgres; null if no price
  status: 'pending_audit' | 'approved' | 'rejected';
  submittedAt: string;          // ISO 8601
  decidedAt: string | null;
  auditLatencyHours: number | null;  // float: (decidedAt - submittedAt) / 3600; null if pending
  locationMatch: 'near' | 'far' | 'no_route' | null;
  locationDistanceM: string | null;  // numeric string; metres — use decimal.js for arithmetic
  photoUrl: string;
  notes: string | null;
  rejectionReason: string | null;
};
