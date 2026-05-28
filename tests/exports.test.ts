/**
 * tests/exports.test.ts
 *
 * Wave-2 implementation file for Phase 11. The Wave-1 it.todo entries are
 * promoted to real it() blocks here as each plan ships:
 *   - Plan 11-02: EXP-01 submission ledger (this plan)
 *   - Plan 11-03 / 11-04 / 11-05: remaining describes promoted later
 *
 * 12 critical truths from 11-VALIDATION.md ## Per-Task Verification Map are
 * pre-named so feedback sampling during execution can detect missing coverage
 * early. Test names contain the truth phrase verbatim enough for
 * `vitest run -t "..."` grep matching from the orchestrator.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { describeIfDb, getTestDb, truncateAllTables } from './fixtures/db';
import { seedFinalizedHakedisFixture } from './fixtures/exports';

// Suppress unused-import lint until later Wave-2 plans promote remaining todos.
void seedFinalizedHakedisFixture;

// ─── next/cache mock (revalidatePath throws outside Next.js rendering context) ─
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// ─── next/server mock (after() throws outside request scope) ─────────────────
// logOfficeActivity uses after() — execute callback immediately in tests.
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: vi.fn((fn) => Promise.resolve(fn())),
  };
});

// ─── auth() mock — must be set before importing the route module ────────────
let mockSession: { user: { id: string; email: string } } | null = {
  user: { id: 'test-user-id', email: 'test@example.com' },
};

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => mockSession),
}));

function setMockSession(s: typeof mockSession) {
  mockSession = s;
}

// ════════════════════════════════════════════════════════════════════════════
// EXP-01 submission ledger
// ════════════════════════════════════════════════════════════════════════════

describe('EXP-01 submission ledger', () => {
  beforeEach(() => {
    setMockSession({ user: { id: 'test-user-id', email: 'test@example.com' } });
  });

  it('returns 401 without session', async () => {
    setMockSession(null);
    const route = await import('@/app/api/exports/submissions/route');
    const res = await route.GET(new Request('http://localhost/api/exports/submissions'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('builds a workbook with 14 bilingual headers each containing " / "', async () => {
    const { buildSubmissionLedger } = await import('@/lib/excel');
    const buffer = await buildSubmissionLedger([]);
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(arrayBuffer as any);
    const sheet = workbook.worksheets[0];
    expect(sheet).toBeDefined();
    expect(sheet.name).toBe('Gönderim Listesi');

    const headerValues = sheet.getRow(1).values as unknown[];
    // ExcelJS values is 1-indexed: index 0 is empty, headers occupy 1..14
    const headers = headerValues.filter((v) => typeof v === 'string') as string[];
    expect(headers).toHaveLength(14);
    for (const h of headers) {
      expect(h).toContain(' / ');
    }

    // Freeze pane on row 1
    expect(sheet.views?.[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });

  it('does not parseFloat money — earnedValue cell value retains decimal precision', async () => {
    const { buildSubmissionLedger } = await import('@/lib/excel');
    const fakeRow = {
      id: 'sub-1',
      projectId: 'p1',
      projectName: 'P1',
      personId: 'w1',
      workerName: 'Worker',
      auditorName: 'Auditor',
      boqItemId: 'b1',
      material: 'Pipe',
      unit: 'm',
      unitPrice: '1234.56789012',
      currencyCode: 'TRY',
      quantity: '1.23456789',
      earnedValue: '1524.157875207468',
      status: 'approved' as const,
      submittedAt: '2026-01-15T10:30:00.000Z',
      decidedAt: '2026-01-15T11:00:00.000Z',
      auditLatencyHours: 0.5,
      locationMatch: 'near' as const,
      locationDistanceM: '50',
      photoUrl: 'https://example.com/photo.jpg',
      notes: null,
      rejectionReason: null,
    };
    const buf = await buildSubmissionLedger([fakeRow]);

    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(arrayBuffer as any);
    const sheet = workbook.worksheets[0];

    // Cells should retain string precision (no float drift). Read raw values.
    // Column order (1-based): id, projectName, workerName, auditorName, material,
    //                         unit, quantity, unitPrice, currencyCode, earnedValue,
    //                         status, submittedAt, decidedAt, locationMatch.
    // Column keys are not persisted in the XLSX file format, so look up by index.
    const quantityCell = sheet.getRow(2).getCell(7);
    const earnedValueCell = sheet.getRow(2).getCell(10);
    expect(String(quantityCell.value)).toBe('1.23456789');
    expect(String(earnedValueCell.value)).toBe('1524.157875207468');
  });

  it('sanitizeExcelCell prefixes apostrophe on formula-prefix worker content (WARNING 5 / T-11-02-FORMULA regression gate)', async () => {
    const { buildSubmissionLedger } = await import('@/lib/excel');
    const formulaRows = [
      {
        id: 'sub-a',
        projectId: 'p1',
        projectName: 'P1',
        personId: 'w1',
        workerName: '=cmd|/c calc',
        auditorName: 'A',
        boqItemId: 'b1',
        material: 'Pipe',
        unit: 'm',
        unitPrice: '100',
        currencyCode: 'TRY',
        quantity: '1',
        earnedValue: '100',
        status: 'approved' as const,
        submittedAt: '2026-01-15T10:30:00.000Z',
        decidedAt: null,
        auditLatencyHours: null,
        locationMatch: null,
        locationDistanceM: null,
        photoUrl: 'https://example.com/photo.jpg',
        notes: null,
        rejectionReason: null,
      },
      {
        id: 'sub-b',
        projectId: 'p1',
        projectName: 'P1',
        personId: 'w2',
        workerName: 'Worker',
        auditorName: 'A',
        boqItemId: 'b1',
        material: '+1234',
        unit: 'm',
        unitPrice: '100',
        currencyCode: 'TRY',
        quantity: '1',
        earnedValue: '100',
        status: 'approved' as const,
        submittedAt: '2026-01-15T10:30:00.000Z',
        decidedAt: null,
        auditLatencyHours: null,
        locationMatch: null,
        locationDistanceM: null,
        photoUrl: 'https://example.com/photo.jpg',
        notes: null,
        rejectionReason: null,
      },
    ];
    const buf = await buildSubmissionLedger(formulaRows);

    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(arrayBuffer as any);
    const sheet = workbook.worksheets[0];

    // Row 2: workerName starts with =, should be apostrophe-prefixed
    // workerName is column 3, material is column 5 (1-based index)
    const workerCellRow2 = sheet.getRow(2).getCell(3);
    expect(String(workerCellRow2.value)).toBe("'=cmd|/c calc");

    // Row 3: material starts with +, should be apostrophe-prefixed
    const materialCellRow3 = sheet.getRow(3).getCell(5);
    expect(String(materialCellRow3.value)).toBe("'+1234");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EXP-01 DB integration tests — tenant scope + row count + filename + activity log
// ════════════════════════════════════════════════════════════════════════════

describeIfDb('EXP-01 tenant scope', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    setMockSession({ user: { id: 'test-user-id', email: 'test@example.com' } });
    db = await getTestDb();
    await truncateAllTables(db);
    const { sql } = await import('drizzle-orm');
    // Re-seed default tenant + auth user (FK requirement for office_activity_log)
    await db.execute(
      sql.raw(
        `INSERT INTO tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Default') ON CONFLICT DO NOTHING`,
      ),
    );
    await db.execute(
      sql.raw(
        `INSERT INTO users (id, email) VALUES ('test-user-id', 'test@example.com') ON CONFLICT DO NOTHING`,
      ),
    );
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('scopes by tenant_id (no cross-tenant rows)', async () => {
    const { sql } = await import('drizzle-orm');
    const tenantA = '00000000-0000-0000-0000-000000000001'; // default tenant the session resolves to
    const tenantB = '00000000-0000-0000-0000-00000000000B';
    const projectA = '00000000-0000-0000-0000-0000000000A1';
    const projectB = '00000000-0000-0000-0000-0000000000B1';
    const boqA = '00000000-0000-0000-0000-0000000000A2';
    const boqB = '00000000-0000-0000-0000-0000000000B2';
    const personA = '00000000-0000-0000-0000-0000000000A3';
    const personB = '00000000-0000-0000-0000-0000000000B3';
    const subA = '00000000-0000-0000-0000-0000000000A4';
    const subB = '00000000-0000-0000-0000-0000000000B4';
    const flowA = '00000000-f000-0000-0000-0000000000A4';
    const flowB = '00000000-f000-0000-0000-0000000000B4';

    await db.execute(sql.raw(`INSERT INTO tenants (id, name) VALUES ('${tenantB}', 'TenantB') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectA}', '${tenantA}', 'ProjectA') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectB}', '${tenantB}', 'ProjectB') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqA}', '${tenantA}', '${projectA}', 'PipeA', 'm', 1000, 0, 1, '100', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqB}', '${tenantB}', '${projectB}', 'PipeB', 'm', 1000, 0, 1, '100', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personA}', '${tenantA}', 111111, 'WorkerA') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personB}', '${tenantB}', 222222, 'WorkerB') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at) VALUES ('${subA}', '${flowA}', '${tenantA}', '${projectA}', '${personA}', '${boqA}', 'approved', '5.000', 'https://example.com/a.jpg', NOW()) ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at) VALUES ('${subB}', '${flowB}', '${tenantB}', '${projectB}', '${personB}', '${boqB}', 'approved', '7.000', 'https://example.com/b.jpg', NOW()) ON CONFLICT DO NOTHING`));

    const route = await import('@/app/api/exports/submissions/route');
    const res = await route.GET(new Request('http://localhost/api/exports/submissions'));
    expect(res.status).toBe(200);

    const arrayBuf = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(arrayBuf as any);
    const sheet = wb.worksheets[0];

    // Collect every cell value from data rows; assert no tenant-B identifiers appear.
    // Column 1 is the submission id.
    const seenIds: string[] = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      seenIds.push(String(row.getCell(1).value));
    });
    expect(seenIds).toContain(subA);
    expect(seenIds).not.toContain(subB);
  });
});

describeIfDb('EXP-01 row count', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    setMockSession({ user: { id: 'test-user-id', email: 'test@example.com' } });
    db = await getTestDb();
    await truncateAllTables(db);
    const { sql } = await import('drizzle-orm');
    await db.execute(
      sql.raw(
        `INSERT INTO tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Default') ON CONFLICT DO NOTHING`,
      ),
    );
    await db.execute(
      sql.raw(
        `INSERT INTO users (id, email) VALUES ('test-user-id', 'test@example.com') ON CONFLICT DO NOTHING`,
      ),
    );
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('row count equals getCanonicalSubmissions({limit:100_000}).length', async () => {
    const { sql } = await import('drizzle-orm');
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-000000000C01';
    const boqItemId = '00000000-0000-0000-0000-000000000C02';
    const personId = '00000000-0000-0000-0000-000000000C03';

    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'RowCountProject') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1, '100', 'TRY') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', 333333, 'WorkerC') ON CONFLICT DO NOTHING`));

    // Seed 5 submissions
    for (let i = 0; i < 5; i++) {
      const subId = `00000000-0000-0000-0000-c00000000${String(i).padStart(3, '0')}`;
      const flowId = `00000000-f000-0000-0000-c00000000${String(i).padStart(3, '0')}`;
      await db.execute(sql.raw(`
        INSERT INTO submissions (id, flow_id, tenant_id, project_id, person_id, boq_item_id, status, quantity, photo_url, submitted_at)
        VALUES ('${subId}', '${flowId}', '${tenantId}', '${projectId}', '${personId}', '${boqItemId}', 'approved', '10.000', 'https://example.com/photo.jpg', NOW())
        ON CONFLICT DO NOTHING
      `));
    }

    const { getCanonicalSubmissions } = await import('@/actions/analytics');
    const actionRows = await getCanonicalSubmissions({ limit: 100_000 });
    const expectedCount = actionRows.length;

    const route = await import('@/app/api/exports/submissions/route');
    const res = await route.GET(new Request('http://localhost/api/exports/submissions'));
    expect(res.status).toBe(200);

    const arrayBuf = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(arrayBuf as any);
    const sheet = wb.worksheets[0];

    // Count data rows (excluding header). sheet.rowCount counts all rows ExcelJS sees.
    const dataRowCount = sheet.rowCount - 1; // subtract header
    expect(dataRowCount).toBe(expectedCount);
    expect(expectedCount).toBe(5);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D-112 Content-Disposition filename pattern
// ════════════════════════════════════════════════════════════════════════════

describe('D-112 filenames', () => {
  beforeEach(() => {
    setMockSession({ user: { id: 'test-user-id', email: 'test@example.com' } });
  });

  it('Content-Disposition filename matches verbose pattern with project + date', async () => {
    const route = await import('@/app/api/exports/submissions/route');
    // No project filter, no date filter → portfolio-all-all pattern
    const res = await route.GET(new Request('http://localhost/api/exports/submissions'));
    expect(res.status).toBe(200);
    const disposition = res.headers.get('content-disposition');
    expect(disposition).toBeTruthy();
    expect(disposition).toMatch(/submission-ledger-[a-z0-9-]+-(all|\d{8})-(all|\d{8})\.xlsx/);

    // With explicit date range
    const res2 = await route.GET(
      new Request('http://localhost/api/exports/submissions?from=2026-01-01&to=2026-01-31'),
    );
    expect(res2.status).toBe(200);
    const disp2 = res2.headers.get('content-disposition');
    expect(disp2).toMatch(/submission-ledger-[a-z0-9-]+-20260101-20260131\.xlsx/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D-109 office_activity_log — submission_ledger_exported
// ════════════════════════════════════════════════════════════════════════════

describeIfDb('D-109 activity log — submission_ledger_exported', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    setMockSession({ user: { id: 'test-user-id', email: 'test@example.com' } });
    db = await getTestDb();
    await truncateAllTables(db);
    const { sql } = await import('drizzle-orm');
    await db.execute(
      sql.raw(
        `INSERT INTO tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Default') ON CONFLICT DO NOTHING`,
      ),
    );
    await db.execute(
      sql.raw(
        `INSERT INTO users (id, email) VALUES ('test-user-id', 'test@example.com') ON CONFLICT DO NOTHING`,
      ),
    );
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('each successful export writes exactly one office_activity_log row of the right action_type', async () => {
    const route = await import('@/app/api/exports/submissions/route');
    const res = await route.GET(new Request('http://localhost/api/exports/submissions'));
    expect(res.status).toBe(200);
    // consume body so after() fires (in our mock it fires synchronously after the response is built)
    await res.arrayBuffer();

    // Brief wait — after() callback is mocked to execute immediately but resolves async.
    await new Promise((r) => setTimeout(r, 50));

    const { sql } = await import('drizzle-orm');
    const rows = await db.execute(
      sql.raw(
        `SELECT action_type FROM office_activity_log WHERE action_type = 'submission_ledger_exported'`,
      ),
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].action_type).toBe('submission_ledger_exported');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Remaining describes — promoted in Plans 11-03 / 11-04 / 11-05
// ════════════════════════════════════════════════════════════════════════════

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

describe('D-111 bilingual headers', () => {
  it.todo('every TR/EN header cell in every workbook contains a " / " separator');
});
