/**
 * tests/exports.test.ts
 *
 * Wave-1 scaffold for Phase 11 (Plan 11-01b). Twelve it.todo entries — one per
 * critical truth in 11-VALIDATION.md ## Per-Task Verification Map. Each Wave-2
 * route-handler plan (11-02 / 11-03 / 11-04 / 11-05) promotes its respective
 * todos to real tests as it lands.
 *
 * The scaffold is the Nyquist gate per the deep_work_rules: 12 critical truths
 * are pre-named so feedback sampling during execution can detect missing
 * coverage early. Test names contain the truth phrase verbatim enough for
 * `vitest run -t "..."` grep matching from the orchestrator.
 */

import { describe, it } from 'vitest';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';
import { seedFinalizedHakedisFixture } from './fixtures/exports';

// Suppress unused-import lint until Wave-2 promotes the todos.
void describeIfDb;
void getTestDb;
void truncateAllTables;
void seedFinalizedHakedisFixture;

describe('EXP-01 submission ledger', () => {
  it.todo('returns 401 without session');
  it.todo('scopes by tenant_id (no cross-tenant rows)');
  it.todo('row count equals getCanonicalSubmissions({limit:100_000}).length');
});

describe('EXP-02 hakedis Excel', () => {
  it.todo('returns 401 without session');
  it.todo('returns 422 for draft period');
  it.todo('Hesap Özeti gross cell equals getPeriodDetail().deductions.gross (decimal-string equality)');
  it.todo('Hesap Özeti kdv/tevkifat/stopaj/teminat/avans/net cells match deductions strings');
});

describe('EXP-03 performance summary', () => {
  it.todo('returns 401 without session');
  it.todo('Workers tab row count equals getPortfolioPeople({role:"worker"}).length');
});

describe('EXP-04 hakedis PDF', () => {
  it.todo('returns 401 without session');
  it.todo('returns 422 for draft period');
  it.todo('PDF binary contains embedded DejaVu Sans font name');
  it.todo('PDF binary contains Turkish glyphs from period number');
});

describe('D-109 activity log', () => {
  it.todo('each successful export writes exactly one office_activity_log row of the right action_type');
});

describe('D-112 filenames', () => {
  it.todo('Content-Disposition filename matches verbose pattern with project + date');
});

describe('D-111 bilingual headers', () => {
  it.todo('every TR/EN header cell in every workbook contains a " / " separator');
});
