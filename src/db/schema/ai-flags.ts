// submission_ai_flags — Phase 16 AI vision assist eval flags.
// One row per submission (UNIQUE on submission_id).
// Status lifecycle: 'pending' → 'processing' → 'done' | 'error'
// eval_passed gate: AI flag UI is shown ONLY when eval_passed = true (AI-05).
// Fire-and-forget insert by enqueueAiFlag; cron retry at /api/cron/ai-flags picks up stale rows.
// WARNING: enqueueAiFlag must NEVER import auth(), logOfficeActivity(), or after() — bot path.
import { pgTable, uuid, text, numeric, boolean, jsonb, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { submissions } from './submissions';

export const submissionAiFlags = pgTable('submission_ai_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  // tenant_id on every new table (CLAUDE.md constraint) — nullable per D-09 single-tenant MVP
  tenantId: uuid('tenant_id').references(() => tenants.id),
  // submission_id FK — cascade delete: flag row dies with the submission
  submissionId: uuid('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  // status: 'pending' | 'processing' | 'done' | 'error'
  status: text('status').notNull().default('pending'),
  // Phase 16 AI output columns — all nullable until runAiAnalysis populates them
  photoAnomalyScore: numeric('photo_anomaly_score', { precision: 4, scale: 3 }),
  workClassification: text('work_classification'),
  anomalyDescription: text('anomaly_description'),
  // eval_passed: set by eval harness (AI-05); null until harness runs; flag UI hidden when null or false
  evalPassed: boolean('eval_passed'),
  // rawResponse: full Claude generateObject response stored for eval audit (AI-05)
  rawResponse: jsonb('raw_response'),
  // phashHex: 64-char binary string from sharp-phash; null until runAiAnalysis runs (AI-06)
  phashHex: text('phash_hex'),
  // anomalyDetected: TRUE when ANY of the five D-01 signals fired (photo mismatch, quality,
  // location, duplicate, classification). Multi-signal gate column (REVIEWS HIGH-3).
  // Downstream gate/read/join key on THIS, not photoAnomalyScore alone.
  // Set by runAiAnalysis; null until analysis runs.
  anomalyDetected: boolean('anomaly_detected'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // One AI flag row per submission — UNIQUE enforces this at the DB level
  unique('submission_ai_flags_submission_id_unique').on(t.submissionId),
  // Index for cron retry query: WHERE status = 'pending' AND created_at < now() - interval '5 minutes'
  index('submission_ai_flags_submission_idx').on(t.submissionId),
  index('submission_ai_flags_status_idx').on(t.status),
]);
