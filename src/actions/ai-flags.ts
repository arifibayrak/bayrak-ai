'use server';

/**
 * src/actions/ai-flags.ts
 *
 * Server Action: getSubmissionAiFlag — eval_passed-gated read of submission_ai_flags.
 *
 * SC1 gate: returns ONLY rows where eval_passed = true. If no such row exists, returns null.
 * SC3 / UI-SPEC: AI failure never surfaces an error UI — all errors are caught and return null.
 * AI-03: no approve/reject affordance; advisory read only.
 *
 * Plan 04 / REVIEWS HIGH-3: eval_passed is now keyed on anomaly_detected (multi-signal gate).
 * Quality/location/duplicate-only flags arrive here too — their per-signal data is read from
 * rawResponse and exposed in SubmissionAiFlag so AiFlagCard can render the correct per-signal rows.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { submissionAiFlags } from '@/db/schema/ai-flags';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * SubmissionAiFlag — the shape passed to AiFlagCard.
 *
 * Per-signal fields are parsed out of rawResponse by getSubmissionAiFlag.
 * A null field means that signal did NOT fire for this flag.
 */
export type SubmissionAiFlag = {
  // Core columns
  photoAnomalyScore: string | null;
  workClassification: string | null;
  anomalyDescription: string | null;

  // Per-signal fields parsed from rawResponse (REVIEWS HIGH-3)
  // Photo mismatch signal
  photoMismatch: boolean;
  photoMismatchConfidence: number | null;
  // Photo quality signal
  photoQualityFlag: boolean;
  photoQualityConfidence: number | null;
  // Location second-opinion signal
  locationOpinion: string | null;         // 'consistent' | 'inconsistent' | null
  locationOpinionConfidence: number | null;
  // Duplicate detection signal
  isDuplicate: boolean;
  // Material suggestion (from notes parsing)
  materialSuggestion: string | null;
};

// ── getSubmissionAiFlag ───────────────────────────────────────────────────────

/**
 * getSubmissionAiFlag — eval_passed-gated single read.
 *
 * Queries submission_ai_flags WHERE submission_id = $1 AND eval_passed = true.
 * Returns null if no eval-passed row exists or on any error.
 *
 * This is the ONLY read path that opens the AI flag display gate (SC1).
 */
export async function getSubmissionAiFlag(
  submissionId: string,
): Promise<SubmissionAiFlag | null> {
  try {
    const rows = await db
      .select()
      .from(submissionAiFlags)
      .where(
        and(
          eq(submissionAiFlags.submissionId, submissionId),
          eq(submissionAiFlags.evalPassed, true),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];

    // Parse per-signal fields from rawResponse (REVIEWS HIGH-3).
    // rawResponse is the full Claude generateText output stored as jsonb.
    // Use a type-safe extraction with fallback defaults.
    const raw = (row.rawResponse as Record<string, unknown>) ?? {};

    const photoMismatch = Boolean(raw.photoMismatch ?? false);
    const photoMismatchConfidence = typeof raw.photoMismatchConfidence === 'number'
      ? raw.photoMismatchConfidence
      : raw.photoMismatchConfidence != null
      ? Number(raw.photoMismatchConfidence)
      : null;

    const photoQualityFlag = Boolean(raw.photoQualityFlag ?? false);
    const photoQualityConfidence = typeof raw.photoQualityConfidence === 'number'
      ? raw.photoQualityConfidence
      : raw.photoQualityConfidence != null
      ? Number(raw.photoQualityConfidence)
      : null;

    const locationOpinion = typeof raw.locationOpinion === 'string'
      ? raw.locationOpinion
      : null;
    const locationOpinionConfidence = typeof raw.locationOpinionConfidence === 'number'
      ? raw.locationOpinionConfidence
      : raw.locationOpinionConfidence != null
      ? Number(raw.locationOpinionConfidence)
      : null;

    const isDuplicate = Boolean(raw.isDuplicate ?? false);

    const materialSuggestion = typeof raw.materialSuggestion === 'string' && raw.materialSuggestion.trim()
      ? raw.materialSuggestion.trim()
      : row.workClassification ?? null;

    return {
      photoAnomalyScore: row.photoAnomalyScore ?? null,
      workClassification: row.workClassification ?? null,
      anomalyDescription: row.anomalyDescription ?? null,

      photoMismatch,
      photoMismatchConfidence,
      photoQualityFlag,
      photoQualityConfidence,
      locationOpinion,
      locationOpinionConfidence,
      isDuplicate,
      materialSuggestion,
    };
  } catch {
    // UI-SPEC: AI failure never surfaces an error UI — catch all errors, return null.
    return null;
  }
}
