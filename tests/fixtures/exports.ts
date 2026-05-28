/**
 * tests/fixtures/exports.ts
 *
 * Shared seeding helpers for the four Phase 11 Wave-2 route-handler test suites
 * (Plans 11-02 / 11-03 / 11-04) and the D-109 activity-log assertions in Plan
 * 11-04 Task 1.
 *
 * Wave 1 (this plan) ships ONLY the stub signature so tests/exports.test.ts
 * can be discoverable by vitest without producing import errors. Each Wave-2
 * plan implements the seeding helper it needs as part of its own Task 1
 * (per VALIDATION.md Wave 0 Requirements bullet 4).
 *
 * The stub throws on call so an accidental Wave-1 it() that promotes an
 * it.todo to a real test will fail loudly with a clear remediation pointer.
 */

import type { getTestDb } from './db';

type Db = Awaited<ReturnType<typeof getTestDb>>;

/**
 * seedFinalizedHakedisFixture — inserts a finalized hakkediş period with priced
 * BOQ items, approved submissions, and computed period lines into the test DB.
 *
 * Returns the deterministic period and project IDs so tests can assert
 * route handler responses against known seed values.
 *
 * Wave-1 stub: throws. Plan 11-04 Task 1 implements this fixture as it needs
 * a finalized period to exercise the PDF route handler end-to-end. Plans
 * 11-02 + 11-03 may reuse the same fixture once 11-04 lands.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function seedFinalizedHakedisFixture(_db: Db): Promise<{ periodId: string; projectId: string }> {
  throw new Error('seedFinalizedHakedisFixture not yet implemented — Plan 11-04 wires this');
}
