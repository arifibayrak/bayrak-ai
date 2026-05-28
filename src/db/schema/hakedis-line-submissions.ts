// src/db/schema/hakedis-line-submissions.ts
//
// D-119 (Phase 12): per-line traceability join — links a hakkediş line back to
// every approved submission that contributed to it.
//
// PRIMARY KEY (period_line_id, submission_id) is the idempotency key for the
// D-117 scoped recompute UPSERT — the qty column is updated on conflict so
// any future "edit approved qty" flow self-heals on next recompute.
//
// Foreign keys:
//   period_line_id → hakedis_period_lines  ON DELETE CASCADE
//       Phase 10 + D-97 allow deleting a draft period; the period→lines cascade
//       must also drop the join rows or the join table would orphan.
//   submission_id  → submissions            ON DELETE RESTRICT
//       D-119 snapshot durability — once a submission has contributed to a
//       finalized hakkediş line, deleting the underlying submission would
//       corrupt the immutable snapshot. RESTRICT forces any future "soft
//       delete" feature to detach the join rows first (or refuse the delete).
//
// Snapshot-frozen at finalize: once the parent period is finalized, these
// rows are effectively immutable — the manual Recompute path (the only writer
// besides D-117) throws on `status != 'draft'` per D-96 / Pitfall 4.
//
// Reverse-lookup index on submission_id (Pitfall 8) — supports any future
// "find all periods this submission contributed to" query without a full
// table scan.
//
// Tenant scoping: nullable per D-09 + Open Question 2 RESOLVED — every INSERT
// must populate via getDefaultTenantId(); read paths join through
// hakedis_period_lines (already tenant-scoped) so direct tenant_id filters
// are not required.

import { pgTable, uuid, numeric, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { hakedisPeriodLines } from './hakedis-period-lines';
import { submissions } from './submissions';

export const hakedisLineSubmissions = pgTable('hakedis_line_submissions', {
  tenantId: uuid('tenant_id').references(() => tenants.id),   // nullable D-09 + Open Question 2 RESOLVED
  periodLineId: uuid('period_line_id')
    .notNull()
    .references(() => hakedisPeriodLines.id, { onDelete: 'cascade' }),
  submissionId: uuid('submission_id')
    .notNull()
    .references(() => submissions.id, { onDelete: 'restrict' }),
  // Mirrors submissions.quantity precision/scale (12,3) so the INSERT…SELECT
  // path can copy values byte-identical without rounding.
  qtyContributed: numeric('qty_contributed', { precision: 12, scale: 3 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.periodLineId, t.submissionId] }),
  index('hakedis_line_submissions_submission_idx').on(t.submissionId),
]);
