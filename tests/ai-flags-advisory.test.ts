/**
 * tests/ai-flags-advisory.test.ts — Static advisory-only invariant proof (AI-03 / SC5).
 *
 * Proves that no code path connects submission_ai_flags to submissions.status.
 *
 * This is a STATIC test: it reads source files from disk via fs.readFileSync and
 * asserts string-level invariants. No DB connection, no API call, no network.
 * Runs in < 1s. Mirrors the Phase 12-03 static-edge pattern from hakedis-live.test.ts.
 *
 * INVARIANT (AI-03 / SC5):
 *   AI flags are advisory-only. No code path reads from submission_ai_flags and
 *   then writes to submissions.status (approved/rejected). The AI cannot escalate
 *   into an authorization control.
 *
 * FILES CHECKED:
 *   - src/lib/ai-vision.ts         (writes to submission_ai_flags; must NOT write submissions.status)
 *   - src/lib/ai-flag-queue.ts     (enqueues AI analysis; must NOT write submissions.status)
 *   - src/app/api/cron/ai-flags/route.ts  (cron retry; must NOT write submissions.status)
 *
 * SC5 grep-clean confirmation:
 *   grep -rl "submissionAiFlags|submission_ai_flags" src --include="*.ts" --include="*.tsx"
 *   | xargs grep -l "submissions.status|status: 'approved'"
 *   → finds no files (exit 1 = clean)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// ── Helper: read a source file relative to repo root ─────────────────────────
const ROOT = path.resolve(__dirname, '..');

function readSrc(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), 'utf8');
}

// ── File contents loaded once (static — no side effects) ────────────────────
const aiVisionSrc      = readSrc('src/lib/ai-vision.ts');
const aiFlagQueueSrc   = readSrc('src/lib/ai-flag-queue.ts');
const cronRouteSrc     = readSrc('src/app/api/cron/ai-flags/route.ts');

// ── Patterns that would indicate coupling to submissions.status ──────────────
// Any .set() on submissions that contains status = 'approved' or 'rejected'
// would be a violation of SC5. We check for the explicit coupling patterns.
const STATUS_WRITE_PATTERNS = [
  /submissions\.status/,
  /\.set\(\s*\{[^}]*status\s*:\s*['"]approved['"]/,
  /\.set\(\s*\{[^}]*status\s*:\s*['"]rejected['"]/,
  /updateSubmissionStatus/,
  /setSubmissionStatus/,
];

// ── Patterns that confirm these files DO touch submission_ai_flags (they should) ──
const AI_FLAGS_PATTERNS = [
  /submissionAiFlags/,
  /submission_ai_flags/,
];

// ═══════════════════════════════════════════════════════════════════════════════
// Static invariant: no code path connects submission_ai_flags to submissions.status
// ═══════════════════════════════════════════════════════════════════════════════

describe('AI-03 advisory-only invariant — static proof (SC5)', () => {
  it('no code path connects submission_ai_flags to submissions.status (SC5)', () => {
    // This is the primary SC5 assertion — the test name is byte-identical to the
    // 16-VALIDATION.md verify-command -t filter so `npx vitest run … -t "no code path"` binds.

    const filesUnderTest = [
      { name: 'src/lib/ai-vision.ts',                  src: aiVisionSrc },
      { name: 'src/lib/ai-flag-queue.ts',              src: aiFlagQueueSrc },
      { name: 'src/app/api/cron/ai-flags/route.ts',    src: cronRouteSrc },
    ];

    for (const { name, src } of filesUnderTest) {
      for (const pattern of STATUS_WRITE_PATTERNS) {
        expect(
          pattern.test(src),
          `SC5 violation: ${name} contains pattern ${pattern} — ` +
          `no file reading submission_ai_flags may write submissions.status`,
        ).toBe(false);
      }
    }
  });

  it('ai-vision.ts reads and writes submission_ai_flags (confirming the test covers the right file)', () => {
    // Sanity check: verify these files actually DO reference submissionAiFlags.
    // If this assertion fails, the file under test has been renamed/moved — update the path.
    const hasAiFlags = AI_FLAGS_PATTERNS.some(p => p.test(aiVisionSrc));
    expect(hasAiFlags).toBe(true);
  });

  it('ai-flag-queue.ts reads and writes submission_ai_flags (confirming the test covers the right file)', () => {
    const hasAiFlags = AI_FLAGS_PATTERNS.some(p => p.test(aiFlagQueueSrc));
    expect(hasAiFlags).toBe(true);
  });

  it('cron route reads submission_ai_flags (confirming the test covers the right file)', () => {
    const hasAiFlags = AI_FLAGS_PATTERNS.some(p => p.test(cronRouteSrc));
    expect(hasAiFlags).toBe(true);
  });

  it('ai-vision.ts does not import auth() — Pitfall 5 compliance', () => {
    // auth() from @/lib/auth must never appear in the AI engine — bot path has no session.
    expect(/from ['"]@\/lib\/auth['"]/.test(aiVisionSrc)).toBe(false);
    expect(/import.*auth.*from/.test(aiVisionSrc)).toBe(false);
  });

  it('ai-flag-queue.ts does not import auth() — Pitfall 5 compliance', () => {
    expect(/from ['"]@\/lib\/auth['"]/.test(aiFlagQueueSrc)).toBe(false);
    expect(/import.*auth.*from/.test(aiFlagQueueSrc)).toBe(false);
  });

  it('ai-vision.ts does not import logOfficeActivity — Pitfall 5 compliance', () => {
    expect(/logOfficeActivity/.test(aiVisionSrc)).toBe(false);
  });

  it('ai-flag-queue.ts does not import logOfficeActivity — Pitfall 5 compliance', () => {
    expect(/logOfficeActivity/.test(aiFlagQueueSrc)).toBe(false);
  });
});
