/**
 * src/lib/ai-vision.ts — AI Vision analysis engine.
 *
 * Exports:
 *   AiVisionOutputSchema — Zod schema for structured Claude output (D-01 five signals)
 *   AiVisionOutput       — TypeScript type for the schema
 *   isAnomalous()        — Multi-signal gate helper (REVIEWS HIGH-3)
 *   analyzePhoto()       — SHARED production Claude-vision call (REVIEWS HIGH-2)
 *   runAiAnalysis()      — pHash pre-filter + analyzePhoto + DB write; NEVER throws
 *
 * PITFALL 5: NEVER import auth(), logOfficeActivity(), or after() here.
 * This module runs in the bot path (webhook) which has no Auth.js session.
 *
 * THIS IS THE TASK-1 STUB — Task 2 overwrites with the full implementation.
 */

import { z } from 'zod';

// Placeholder schema — real fields added in Task 2
export const AiVisionOutputSchema = z.object({});
export type AiVisionOutput = z.infer<typeof AiVisionOutputSchema>;

/**
 * isAnomalous — multi-signal gate helper.
 * Real implementation in Task 2.
 * STUB: always returns false so tests that import it get a clean assertion failure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isAnomalous(_o: any): boolean {
  return false;
}

/**
 * analyzePhoto — the SINGLE shared production Claude-vision call.
 * Real implementation in Task 2.
 * STUB: throws NOT_IMPLEMENTED so tests fail with an assertion error, not an import error.
 */
export async function analyzePhoto(
  _photoUrl: string,
  _workType: string,
  _notes: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  throw new Error('NOT_IMPLEMENTED');
}

/**
 * runAiAnalysis — pHash pre-filter + analyzePhoto + DB write.
 * Real implementation in Task 2.
 * STUB: throws NOT_IMPLEMENTED so tests fail with an assertion error, not an import error.
 */
export async function runAiAnalysis(
  _submissionId: string,
  _photoUrl: string,
): Promise<void> {
  throw new Error('NOT_IMPLEMENTED');
}
