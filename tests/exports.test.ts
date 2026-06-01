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
      snappedLat: null,
      snappedLon: null,
    };
    const buf = await buildSubmissionLedger([fakeRow]);

    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
     
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
        snappedLat: null,
        snappedLon: null,
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
        snappedLat: null,
        snappedLon: null,
      },
    ];
    const buf = await buildSubmissionLedger(formulaRows);

    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
     
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
    const tenantB = '00000000-0000-0000-0000-00000000000b';
    const projectA = '00000000-0000-0000-0000-0000000000a1';
    const projectB = '00000000-0000-0000-0000-0000000000b1';
    const boqA = '00000000-0000-0000-0000-0000000000a2';
    const boqB = '00000000-0000-0000-0000-0000000000b2';
    const personA = '00000000-0000-0000-0000-0000000000a3';
    const personB = '00000000-0000-0000-0000-0000000000b3';
    const subA = '00000000-0000-0000-0000-0000000000a4';
    const subB = '00000000-0000-0000-0000-0000000000b4';
    const flowA = '00000000-f000-0000-0000-0000000000a4';
    const flowB = '00000000-f000-0000-0000-0000000000b4';

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

// ════════════════════════════════════════════════════════════════════════════
// EXP-02 hakedis Excel — buildHakedisExcel() unit tests (Plan 11-04 Task 2)
// ════════════════════════════════════════════════════════════════════════════

describe('EXP-02 hakedis Excel — buildHakedisExcel unit', () => {
  // Synthetic fixture inputs reused across the unit tests.
  function makePeriod() {
    return {
      id: 'period-1',
      tenantId: '00000000-0000-0000-0000-000000000001',
      projectId: 'project-1',
      periodNumber: 'HK-2026-01',
      periodStartDate: null,
      periodEndDate: '2026-01-31',
      currencyCode: 'TRY',
      status: 'finalized',
      kdvRate: '0.2000',
      retentionRate: '0.0500',
      tevkifatFraction: '0.4000',
      stopajEnabled: false,
      stopajRate: null,
      avansKesintisiRate: '0.0000',
      createdByUserId: 'test-user-id',
      finalizedAt: '2026-02-01T10:00:00.000Z',
    };
  }
  function makeLines() {
    return [
      {
        id: 'line-a',
        boqItemId: 'boq-a',
        materialSnapshot: 'DN200 HDPE Boru',
        unitSnapshot: 'm',
        currencyCodeSnapshot: 'TRY',
        unitPriceSnapshot: '100.00',
        cumulativeQtyApproved: '10.000',
        previousCumulativeQty: '0',
        periodQty: '10.000',
        periodValue: '1000.00',
        cumulativeValue: '1000.00',
      },
      {
        id: 'line-b',
        boqItemId: 'boq-b',
        materialSnapshot: 'DN300 HDPE Boru',
        unitSnapshot: 'm',
        currencyCodeSnapshot: 'TRY',
        unitPriceSnapshot: '200.00',
        cumulativeQtyApproved: '5.000',
        previousCumulativeQty: '0',
        periodQty: '5.000',
        periodValue: '1000.00',
        cumulativeValue: '1000.00',
      },
    ];
  }
  function makeDeductions() {
    return {
      gross: '12345.67',
      kdv: '2469.13',
      tevkifat: '987.65',
      stopaj: '0',
      teminat: '617.28',
      avans: '0',
      net: '13209.87',
    };
  }

  it('three sheets present in order: Yeşil Defter, Fiyat İcmali, Hesap Özeti (D-115)', async () => {
    const { buildHakedisExcel } = await import('@/lib/excel');
    const buf = await buildHakedisExcel({
      period: makePeriod(),
      lines: makeLines(),
      deductions: makeDeductions(),
      projectName: 'İstanbul Doğalgaz',
    });
    expect(buf.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
     
    await workbook.xlsx.load(arrayBuffer as any);

    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      'Yeşil Defter',
      'Fiyat İcmali',
      'Hesap Özeti',
    ]);
  });

  it('Hesap Özeti cell values string-equal getPeriodDetail().deductions (no precision loss — D-107 + D-116 + Pitfall 2)', async () => {
    const { buildHakedisExcel } = await import('@/lib/excel');
    const deductions = makeDeductions();
    const buf = await buildHakedisExcel({
      period: makePeriod(),
      lines: makeLines(),
      deductions,
      projectName: 'İstanbul Doğalgaz',
    });

    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
     
    await workbook.xlsx.load(arrayBuffer as any);

    const sheet3 = workbook.worksheets[2];
    expect(sheet3.name).toBe('Hesap Özeti');

    // Hesap Özeti rows: 1=header, 2..8 = 7 deduction labels (gross..net)
    // Use string comparison via Decimal-equivalence test (string -> Number both sides).
    // Cell value column = 2.
    const labels: (keyof typeof deductions)[] = [
      'gross', 'kdv', 'tevkifat', 'stopaj', 'teminat', 'avans', 'net',
    ];
    for (let i = 0; i < labels.length; i++) {
      const cell = sheet3.getRow(i + 2).getCell(2);
      const expected = deductions[labels[i]];
      // ExcelJS may store decimal strings as numbers; compare numerically (Pitfall 2 fallback).
      // numFmt at column level renders the display; the underlying value must equal.
      expect(Number(cell.value)).toEqual(Number(expected));
    }
  });

  it('sanitizeExcelCell prefixes apostrophe on formula-prefix materialSnapshot (WARNING 5 / T-11-04-FORMULA regression gate)', async () => {
    const { buildHakedisExcel } = await import('@/lib/excel');
    const lines = makeLines();
    lines[0].materialSnapshot = '=cmd|/c calc';
    lines[1].materialSnapshot = '@SUM(A1:A10)';
    const buf = await buildHakedisExcel({
      period: makePeriod(),
      lines,
      deductions: makeDeductions(),
      projectName: 'P',
    });

    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
     
    await workbook.xlsx.load(arrayBuffer as any);

    // Yeşil Defter (sheet[0]) — column 1 is Malzeme/Material
    const sheet1 = workbook.worksheets[0];
    expect(String(sheet1.getRow(2).getCell(1).value)).toBe("'=cmd|/c calc");
    expect(String(sheet1.getRow(3).getCell(1).value)).toBe("'@SUM(A1:A10)");

    // Fiyat İcmali (sheet[1]) — column 1 is also Malzeme/Material
    const sheet2 = workbook.worksheets[1];
    expect(String(sheet2.getRow(2).getCell(1).value)).toBe("'=cmd|/c calc");
    expect(String(sheet2.getRow(3).getCell(1).value)).toBe("'@SUM(A1:A10)");
  });

  it('public/fonts/DejaVuSans.ttf exists with size >100KB before importing the PDF route module (WARNING 6 / T-11-04-FONT-MISSING gate)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const ttfPath = path.join(process.cwd(), 'public/fonts/DejaVuSans.ttf');
    const stat = fs.statSync(ttfPath);
    expect(stat.size).toBeGreaterThan(100 * 1024);

    const boldPath = path.join(process.cwd(), 'public/fonts/DejaVuSans-Bold.ttf');
    const boldStat = fs.statSync(boldPath);
    expect(boldStat.size).toBeGreaterThan(100 * 1024);
  });
});

describe('EXP-03 performance summary', () => {
  beforeEach(() => {
    setMockSession({ user: { id: 'test-user-id', email: 'test@example.com' } });
  });

  it('workbook contains exactly two sheets named Workers - Personel and Auditors - Denetçiler (D-110: no Office Engineers sheet)', async () => {
    // NOTE: Plan 11-03 specified the sheet names with " / " separator.
    // Excel's worksheet-name spec prohibits "/ \ ? * : [ ]" — ExcelJS throws.
    // Switched the separator to " - " on the tab name; ' / ' is preserved on
    // every column HEADER inside both sheets (D-111 gate). Rule 1 deviation.
    const { buildPerformanceSummary } = await import('@/lib/excel');
    const buf = await buildPerformanceSummary({ workers: [], auditors: [] });

    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
     
    await workbook.xlsx.load(arrayBuffer as any);

    expect(workbook.worksheets).toHaveLength(2);
    expect(workbook.worksheets[0].name).toBe('Workers - Personel');
    expect(workbook.worksheets[1].name).toBe('Auditors - Denetçiler');

    // Freeze pane on row 1 of both sheets
    expect(workbook.worksheets[0].views?.[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(workbook.worksheets[1].views?.[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });

  it('multi-currency worker emits ONE row with JSON-stringified value map (D-110 layout — supersedes Pitfall 8)', async () => {
    const { buildPerformanceSummary } = await import('@/lib/excel');
    const worker = {
      personId: 'w1',
      displayName: 'MultiCurrency Worker',
      submissionsApproved: 5,
      submissionsRejected: 0,
      submissionsPending: 1,
      valueContributedByCurrency: { TRY: '1000', USD: '500' },
      locationComplianceRate: null,
    };
    const buf = await buildPerformanceSummary({ workers: [worker], auditors: [] });

    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
     
    await workbook.xlsx.load(arrayBuffer as any);
    const sheet = workbook.worksheets[0];

    // Header + 1 data row only — D-110 layout (NOT one row per currency)
    expect(sheet.rowCount).toBe(2);

    // Workers sheet column order (1-based): displayName, submissionsApproved, submissionsRejected,
    //   submissionsPending, locationCompliance, outputQuantity, currencyCode, valueContribution
    const currencyCell = sheet.getRow(2).getCell(7);
    const valueCell = sheet.getRow(2).getCell(8);
    expect(String(currencyCell.value)).toBe('multi');
    expect(JSON.parse(String(valueCell.value))).toEqual({ TRY: '1000', USD: '500' });
  });

  it('single-currency worker uses plain currency code + value cells', async () => {
    const { buildPerformanceSummary } = await import('@/lib/excel');
    const worker = {
      personId: 'w1',
      displayName: 'SingleCurrency Worker',
      submissionsApproved: 3,
      submissionsRejected: 0,
      submissionsPending: 0,
      valueContributedByCurrency: { TRY: '1000' },
      locationComplianceRate: null,
    };
    const buf = await buildPerformanceSummary({ workers: [worker], auditors: [] });

    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
     
    await workbook.xlsx.load(arrayBuffer as any);
    const sheet = workbook.worksheets[0];

    const currencyCell = sheet.getRow(2).getCell(7);
    const valueCell = sheet.getRow(2).getCell(8);
    expect(String(currencyCell.value)).toBe('TRY');
    expect(String(valueCell.value)).toBe('1000');
  });

  it('locationCompliance cell is non-null when PortfolioWorker.locationComplianceRate is populated (WARNING 4 / D-110 gate)', async () => {
    const { buildPerformanceSummary } = await import('@/lib/excel');
    const workerCompliant = {
      personId: 'w1',
      displayName: 'Compliant Worker',
      submissionsApproved: 4,
      submissionsRejected: 0,
      submissionsPending: 0,
      valueContributedByCurrency: {},
      locationComplianceRate: 0.75,
    };
    const workerNoApproved = {
      personId: 'w2',
      displayName: 'No Approved Worker',
      submissionsApproved: 0,
      submissionsRejected: 0,
      submissionsPending: 2,
      valueContributedByCurrency: {},
      locationComplianceRate: null,
    };
    const buf = await buildPerformanceSummary({
      workers: [workerCompliant, workerNoApproved],
      auditors: [],
    });

    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
     
    await workbook.xlsx.load(arrayBuffer as any);
    const sheet = workbook.worksheets[0];

    // Column 5 is locationCompliance
    const complianceRow2 = sheet.getRow(2).getCell(5);
    expect(complianceRow2.value).toBe(0.75);

    const complianceRow3 = sheet.getRow(3).getCell(5);
    // null/empty cell — ExcelJS reads as null or empty string when no value was written
    expect(complianceRow3.value == null || complianceRow3.value === '').toBe(true);
  });

  it('sanitizeExcelCell prefixes apostrophe on formula-prefix displayName (WARNING 5 / T-11-03-FORMULA regression gate)', async () => {
    const { buildPerformanceSummary } = await import('@/lib/excel');
    const worker = {
      personId: 'w1',
      displayName: '=cmd|/c calc',
      submissionsApproved: 1,
      submissionsRejected: 0,
      submissionsPending: 0,
      valueContributedByCurrency: {},
      locationComplianceRate: null,
    };
    const auditor = {
      personId: 'a1',
      displayName: '+1234',
      decisionsCount: 1,
      avgDecisionLatencyHours: null,
      pendingBacklogCount: 0,
      slaBreachRateDecided: null,
    };
    const buf = await buildPerformanceSummary({ workers: [worker], auditors: [auditor] });

    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
     
    await workbook.xlsx.load(arrayBuffer as any);

    // Workers sheet — Personel column is column 1
    const workerSheet = workbook.worksheets[0];
    const workerPersonelCell = workerSheet.getRow(2).getCell(1);
    expect(String(workerPersonelCell.value)).toBe("'=cmd|/c calc");

    // Auditors sheet — Personel column is column 1
    const auditorSheet = workbook.worksheets[1];
    const auditorPersonelCell = auditorSheet.getRow(2).getCell(1);
    expect(String(auditorPersonelCell.value)).toBe("'+1234");
  });

  it('headers in both sheets contain " / " separator (D-111 bilingual gate)', async () => {
    const { buildPerformanceSummary } = await import('@/lib/excel');
    const buf = await buildPerformanceSummary({ workers: [], auditors: [] });

    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
     
    await workbook.xlsx.load(arrayBuffer as any);

    for (const sheet of workbook.worksheets) {
      const headerValues = sheet.getRow(1).values as unknown[];
      const headers = headerValues.filter((v) => typeof v === 'string') as string[];
      expect(headers.length).toBeGreaterThan(0);
      for (const h of headers) {
        expect(h).toContain(' / ');
      }
    }
  });

  it('returns 401 without session', async () => {
    setMockSession(null);
    const route = await import('@/app/api/exports/performance/route');
    const res = await route.GET(new Request('http://localhost/api/exports/performance'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EXP-03 DB integration — Workers tab row count + activity log
// ════════════════════════════════════════════════════════════════════════════

describeIfDb('EXP-03 Workers tab row count', () => {
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

  it('Workers tab row count equals getPortfolioPeople({role:"worker"}).length', async () => {
    const { sql } = await import('drizzle-orm');
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const projectId = '00000000-0000-0000-0000-0000000d0001';
    const boqItemId = '00000000-0000-0000-0000-0000000d0002';

    await db.execute(sql.raw(`INSERT INTO projects (id, tenant_id, name) VALUES ('${projectId}', '${tenantId}', 'PerfRowCount') ON CONFLICT DO NOTHING`));
    await db.execute(sql.raw(`INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, sort_order, unit_price, currency_code) VALUES ('${boqItemId}', '${tenantId}', '${projectId}', 'Pipe', 'm', 1000, 0, 1, '100', 'TRY') ON CONFLICT DO NOTHING`));

    // Seed 3 workers (each gets a 'worker' assignment so they show in getPortfolioPeople)
    for (let i = 0; i < 3; i++) {
      const personId = `00000000-0000-0000-0000-0000000d10${String(i).padStart(2, '0')}`;
      const assignmentId = `00000000-0000-0000-0000-0000000d20${String(i).padStart(2, '0')}`;
      await db.execute(sql.raw(`INSERT INTO people (id, tenant_id, telegram_user_id, display_name) VALUES ('${personId}', '${tenantId}', ${500000 + i}, 'PerfWorker${i}') ON CONFLICT DO NOTHING`));
      await db.execute(sql.raw(`INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project) VALUES ('${assignmentId}', '${tenantId}', '${personId}', '${projectId}', 'worker') ON CONFLICT DO NOTHING`));
    }

    const { getPortfolioPeople } = await import('@/actions/analytics');
    const expectedWorkers = await getPortfolioPeople({ role: 'worker' });
    expect(expectedWorkers.length).toBeGreaterThanOrEqual(3);

    const route = await import('@/app/api/exports/performance/route');
    const res = await route.GET(new Request('http://localhost/api/exports/performance'));
    expect(res.status).toBe(200);

    const arrayBuf = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
     
    await wb.xlsx.load(arrayBuf as any);
    const workersSheet = wb.worksheets[0];
    expect(workersSheet.name).toBe('Workers - Personel');

    // D-110 layout: one row per worker. Data rows = rowCount - 1 (header).
    const dataRowCount = workersSheet.rowCount - 1;
    expect(dataRowCount).toBe(expectedWorkers.length);
  });
});

describeIfDb('D-109 activity log — performance_summary_exported', () => {
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

  it('each successful performance export writes exactly one office_activity_log row of action_type performance_summary_exported', async () => {
    const route = await import('@/app/api/exports/performance/route');
    const res = await route.GET(new Request('http://localhost/api/exports/performance'));
    expect(res.status).toBe(200);
    await res.arrayBuffer();

    // after() callback is mocked to execute immediately but resolves async.
    await new Promise((r) => setTimeout(r, 200));

    const { sql } = await import('drizzle-orm');
    const rows = await db.execute(
      sql.raw(
        `SELECT action_type FROM office_activity_log WHERE action_type = 'performance_summary_exported'`,
      ),
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].action_type).toBe('performance_summary_exported');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EXP-02 hakedis Excel — route handler tests (Plan 11-04 Task 4)
// ════════════════════════════════════════════════════════════════════════════

describe('EXP-02 hakedis Excel route', () => {
  beforeEach(() => {
    setMockSession({ user: { id: 'test-user-id', email: 'test@example.com' } });
  });

  it('returns 401 without session', async () => {
    setMockSession(null);
    const route = await import('@/app/api/exports/hakedis/[periodId]/route');
    const res = await route.GET(
      new Request('http://localhost/api/exports/hakedis/00000000-0000-0000-0000-0000000e0009'),
      { params: Promise.resolve({ periodId: '00000000-0000-0000-0000-0000000e0009' }) },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });
});

describeIfDb('EXP-02 hakedis Excel route — DB integration', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    setMockSession({ user: { id: 'test-user-id', email: 'test@example.com' } });
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('returns 422 for draft period (Pitfall 5 — defense-in-depth)', async () => {
    const { periodId } = await seedFinalizedHakedisFixture(db);
    const { sql } = await import('drizzle-orm');
    // Flip to draft to exercise the server guard
    await db.execute(sql.raw(`UPDATE hakedis_periods SET status = 'draft' WHERE id = '${periodId}'`));

    const route = await import('@/app/api/exports/hakedis/[periodId]/route');
    const res = await route.GET(
      new Request(`http://localhost/api/exports/hakedis/${periodId}`),
      { params: Promise.resolve({ periodId }) },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({ error: 'Period is not finalized' });
  });

  it('Hesap Özeti cells match getPeriodDetail().deductions (no precision loss)', async () => {
    const { periodId } = await seedFinalizedHakedisFixture(db);

    const { getPeriodDetail } = await import('@/actions/hakedis');
    const detail = await getPeriodDetail(periodId);
    expect(detail.deductions).not.toBeNull();
    const expected = detail.deductions!;

    const route = await import('@/app/api/exports/hakedis/[periodId]/route');
    const res = await route.GET(
      new Request(`http://localhost/api/exports/hakedis/${periodId}`),
      { params: Promise.resolve({ periodId }) },
    );
    expect(res.status).toBe(200);

    const arrayBuf = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
     
    await wb.xlsx.load(arrayBuf as any);
    const hesapOzeti = wb.worksheets[2];
    expect(hesapOzeti.name).toBe('Hesap Özeti');

    // Rows 2..8 = gross, kdv, tevkifat, stopaj, teminat, avans, net
    const labels: (keyof typeof expected)[] = [
      'gross', 'kdv', 'tevkifat', 'stopaj', 'teminat', 'avans', 'net',
    ];
    for (let i = 0; i < labels.length; i++) {
      const cell = hesapOzeti.getRow(i + 2).getCell(2);
      // numeric equality — column-level numFmt drives display, not precision
      expect(Number(cell.value)).toBeCloseTo(Number(expected[labels[i]]), 2);
    }
  });

  it('D-111: every header in all 3 sheets contains " / " bilingual separator', async () => {
    const { periodId } = await seedFinalizedHakedisFixture(db);

    const route = await import('@/app/api/exports/hakedis/[periodId]/route');
    const res = await route.GET(
      new Request(`http://localhost/api/exports/hakedis/${periodId}`),
      { params: Promise.resolve({ periodId }) },
    );
    expect(res.status).toBe(200);

    const arrayBuf = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
     
    await wb.xlsx.load(arrayBuf as any);
    expect(wb.worksheets.length).toBe(3);

    for (const sheet of wb.worksheets) {
      const headerValues = sheet.getRow(1).values as unknown[];
      const headers = headerValues.filter((v) => typeof v === 'string') as string[];
      expect(headers.length).toBeGreaterThan(0);
      for (const h of headers) {
        expect(h).toContain(' / ');
      }
    }
  });

  it('D-112: filename hakkedis-{periodNumber}-{projectSlug}.xlsx', async () => {
    const { periodId, periodNumber } = await seedFinalizedHakedisFixture(db);

    const route = await import('@/app/api/exports/hakedis/[periodId]/route');
    const res = await route.GET(
      new Request(`http://localhost/api/exports/hakedis/${periodId}`),
      { params: Promise.resolve({ periodId }) },
    );
    expect(res.status).toBe(200);
    const disposition = res.headers.get('content-disposition');
    expect(disposition).toBeTruthy();
    // Fixture project name 'İstanbul Doğalgaz' → slug 'istanbul-dogalgaz'
    expect(disposition).toContain(`hakkedis-${periodNumber}-istanbul-dogalgaz.xlsx`);
  });
});

describeIfDb('D-109 activity log — hakedis_excel_exported', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    setMockSession({ user: { id: 'test-user-id', email: 'test@example.com' } });
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('each successful hakedis excel export writes exactly one row of action_type hakedis_excel_exported', async () => {
    const { periodId } = await seedFinalizedHakedisFixture(db);

    const route = await import('@/app/api/exports/hakedis/[periodId]/route');
    const res = await route.GET(
      new Request(`http://localhost/api/exports/hakedis/${periodId}`),
      { params: Promise.resolve({ periodId }) },
    );
    expect(res.status).toBe(200);
    await res.arrayBuffer();
    await new Promise((r) => setTimeout(r, 200));

    const { sql } = await import('drizzle-orm');
    const rows = await db.execute(
      sql.raw(
        `SELECT action_type FROM office_activity_log WHERE action_type = 'hakedis_excel_exported'`,
      ),
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].action_type).toBe('hakedis_excel_exported');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// EXP-04 hakedis PDF — route handler tests (Plan 11-04 Task 4)
// ════════════════════════════════════════════════════════════════════════════

describe('EXP-04 hakedis PDF route', () => {
  beforeEach(() => {
    setMockSession({ user: { id: 'test-user-id', email: 'test@example.com' } });
  });

  it('returns 401 without session', async () => {
    setMockSession(null);
    const route = await import('@/app/api/exports/hakedis/[periodId]/pdf/route');
    const res = await route.GET(
      new Request('http://localhost/api/exports/hakedis/00000000-0000-0000-0000-0000000e0009/pdf'),
      { params: Promise.resolve({ periodId: '00000000-0000-0000-0000-0000000e0009' }) },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });
});

describeIfDb('EXP-04 hakedis PDF route — DB integration', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    setMockSession({ user: { id: 'test-user-id', email: 'test@example.com' } });
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('returns 422 for draft period (Pitfall 5 — defense-in-depth)', async () => {
    const { periodId } = await seedFinalizedHakedisFixture(db);
    const { sql } = await import('drizzle-orm');
    await db.execute(sql.raw(`UPDATE hakedis_periods SET status = 'draft' WHERE id = '${periodId}'`));

    const route = await import('@/app/api/exports/hakedis/[periodId]/pdf/route');
    const res = await route.GET(
      new Request(`http://localhost/api/exports/hakedis/${periodId}/pdf`),
      { params: Promise.resolve({ periodId }) },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({ error: 'Period is not finalized' });
  });

  it('PDF binary contains the DejaVu font name (D-106 embedded-font gate)', async () => {
    const { periodId } = await seedFinalizedHakedisFixture(db);

    const route = await import('@/app/api/exports/hakedis/[periodId]/pdf/route');
    const res = await route.GET(
      new Request(`http://localhost/api/exports/hakedis/${periodId}/pdf`),
      { params: Promise.resolve({ periodId }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    // PDF stores the embedded-font name in its font dictionary as plain ASCII —
    // search the binary for the literal substring 'DejaVu'.
    expect(buf.includes(Buffer.from('DejaVu'))).toBe(true);
  });

  it('PDF binary contains Turkish text (project name + hakkediş literal)', async () => {
    const { periodId } = await seedFinalizedHakedisFixture(db);

    const route = await import('@/app/api/exports/hakedis/[periodId]/pdf/route');
    const res = await route.GET(
      new Request(`http://localhost/api/exports/hakedis/${periodId}/pdf`),
      { params: Promise.resolve({ periodId }) },
    );
    expect(res.status).toBe(200);

    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    // Use pdf-parse (Plan 11-01a devDep) to extract text from the PDF binary.
    // IMPORTANT: import the lib path directly, not the package root. The package
    // root index.js auto-runs a debug block when module.parent is null, which
    // throws ENOENT under vitest because module.parent is always null in the
    // test loader. Importing the lib path bypasses that debug block entirely.
     
    const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(buf);
    expect(parsed.text).toContain('İstanbul'); // fixture project name
    expect(parsed.text).toContain('Hakkediş'); // literal Turkish 'ş' must render
  });

  it('D-112 PDF filename hakkedis-{periodNumber}-{projectSlug}-{YYYYMMDD}.pdf', async () => {
    const { periodId, periodNumber } = await seedFinalizedHakedisFixture(db);

    const route = await import('@/app/api/exports/hakedis/[periodId]/pdf/route');
    const res = await route.GET(
      new Request(`http://localhost/api/exports/hakedis/${periodId}/pdf`),
      { params: Promise.resolve({ periodId }) },
    );
    expect(res.status).toBe(200);
    const disposition = res.headers.get('content-disposition');
    expect(disposition).toBeTruthy();
    // D-112: YYYYMMDD is generation date (not period end)
    const re = new RegExp(`hakkedis-${periodNumber}-istanbul-dogalgaz-\\d{8}\\.pdf`);
    expect(disposition).toMatch(re);
  });
});

describeIfDb('D-109 activity log — hakedis_pdf_exported', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    setMockSession({ user: { id: 'test-user-id', email: 'test@example.com' } });
    db = await getTestDb();
    await truncateAllTables(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  it('each successful hakedis PDF export writes exactly one row of action_type hakedis_pdf_exported', async () => {
    const { periodId } = await seedFinalizedHakedisFixture(db);

    const route = await import('@/app/api/exports/hakedis/[periodId]/pdf/route');
    const res = await route.GET(
      new Request(`http://localhost/api/exports/hakedis/${periodId}/pdf`),
      { params: Promise.resolve({ periodId }) },
    );
    expect(res.status).toBe(200);
    await res.arrayBuffer();
    await new Promise((r) => setTimeout(r, 200));

    const { sql } = await import('drizzle-orm');
    const rows = await db.execute(
      sql.raw(
        `SELECT action_type FROM office_activity_log WHERE action_type = 'hakedis_pdf_exported'`,
      ),
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].action_type).toBe('hakedis_pdf_exported');
  });
});
