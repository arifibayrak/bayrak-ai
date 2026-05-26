-- HAND-WRITTEN: Phase 7 analytics indexes (partial WHERE indexes not emitted by drizzle-kit generate).
-- Partial index syntax requires WHERE clause — not supported by drizzle-kit generate.
-- See Plan 07-02: T-07-03 threat mitigation — prevents full-table scans on analytics queries.
-- WARNING: Do NOT run drizzle-kit generate after Phase 7 closes without re-verifying this file is untouched.

-- Composite index: analytics primary filter (status + submitted_at)
CREATE INDEX "submissions_status_submitted_idx"
  ON "submissions" (status, submitted_at DESC);
--> statement-breakpoint
-- Partial index: pending-audit dashboard alert (hits on every overview load)
CREATE INDEX "submissions_pending_idx"
  ON "submissions" (project_id, submitted_at DESC)
  WHERE status = 'pending_audit';
--> statement-breakpoint
-- Partial index: auditor scorecard (decided_by + decided_at for decided submissions only)
CREATE INDEX "submissions_decided_by_idx"
  ON "submissions" (decided_by, decided_at DESC)
  WHERE decided_by IS NOT NULL;
--> statement-breakpoint
-- Composite index: per-person analytics (person + status + date)
CREATE INDEX "submissions_person_status_date_idx"
  ON "submissions" (person_id, status, submitted_at DESC);
--> statement-breakpoint
-- Composite index: per-project value aggregation (project + status + boq_item)
CREATE INDEX "submissions_project_status_boq_idx"
  ON "submissions" (project_id, status, boq_item_id);
