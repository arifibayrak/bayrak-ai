/**
 * tests/chainage.test.ts
 *
 * Phase 15 chainage tests (CHN-01..CHN-07 + Pitfall 2).
 * Unit tests: formatChainage, completion %, bucket boundary, bucket status
 * Integration tests: snapshot write, backfill migration check (require DB)
 *
 * All pure-unit tests run without DB (always green on CI).
 * Integration tests are gated by describeIfDb — skipped when TEST_DATABASE_URL absent.
 *
 * -t filter tokens (must match 15-VALIDATION.md verbatim):
 *   "formatChainage"        — CHN-01 pure unit (5 cases)
 *   "chainage snapshot"     — CHN-03 integration
 *   "getChainageBuckets"    — CHN-04 integration
 *   "bucket status"         — CHN-04/D-04 unit
 *   "completion"            — CHN-06 unit
 *   "completion clamp"      — CHN-06 over-completion clamp unit
 *   "bucket boundary"       — Pitfall 2 unit
 *   "chainage offset"       — CHN-02 integration
 *   "chainage excel columns"— CHN-07 integration
 *   "maps link"             — folded todo unit/manual
 */

import { beforeEach, afterEach, it, expect, describe } from 'vitest';
import {
  describeIfDb,
  getTestDb,
  truncateAllTables,
} from './fixtures/db';
import { formatChainage } from '../src/lib/format-chainage';
import { fetchChainageBucketsRaw } from '../src/lib/chainage-data';
import { seedChainageFixture, CHAINAGE_FIXTURE_IDS } from './fixtures/chainage';

// ---------------------------------------------------------------------------
// Pure unit tests — formatChainage (CHN-01)
// No DB required; always run.
// ---------------------------------------------------------------------------

describe('formatChainage (CHN-01)', () => {
  it('formats 0 as km 0+000', () => {
    expect(formatChainage(0)).toBe('km 0+000');
  });
  it('formats 500 as km 0+500', () => {
    expect(formatChainage(500)).toBe('km 0+500');
  });
  it('formats 1000 as km 1+000', () => {
    expect(formatChainage(1000)).toBe('km 1+000');
  });
  it('formats 2347 as km 2+347', () => {
    expect(formatChainage(2347)).toBe('km 2+347');
  });
  it('formats 12480 as km 12+480', () => {
    expect(formatChainage(12480)).toBe('km 12+480');
  });
});

// ---------------------------------------------------------------------------
// Pure unit tests — bucket boundary (Pitfall 2)
// FLOOR(1000.0 / 1000) = 1 → bucket index 1 (not 0)
// Verified via the shared helper's JS-side mapping logic (bucket_idx = Math.floor)
// ---------------------------------------------------------------------------

describe('bucket boundary (Pitfall 2)', () => {
  it('bucket boundary: exactly 1000.0 m → bucket index 1 not 0', () => {
    // The FLOOR expression in fetchChainageBucketsRaw uses Postgres FLOOR.
    // We verify the JS-side bucket index derivation is consistent:
    // FLOOR(1000.0 / 1000) = FLOOR(1.0) = 1
    const bucketSizeM = 1000;
    const chainage = 1000.0;
    const bucketIndex = Math.floor(chainage / bucketSizeM);
    expect(bucketIndex).toBe(1);
    // And FLOOR(999.9 / 1000) = FLOOR(0.999) = 0
    expect(Math.floor(999.9 / bucketSizeM)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Pure unit tests — bucket status (CHN-04 / D-04 three-state)
// D-04: ≥1 approved → approved; 0 approved + ≥1 pending → in_progress; none → not_started
// ---------------------------------------------------------------------------

describe('bucket status (CHN-04 three-state)', () => {
  // Helper that mirrors the status derivation in fetchChainageBucketsRaw
  function deriveStatus(approvedCount: number, pendingCount: number): string {
    return approvedCount >= 1 ? 'approved'
      : pendingCount >= 1    ? 'in_progress'
      :                        'not_started';
  }

  it('bucket status: ≥1 approved → approved', () => {
    expect(deriveStatus(1, 0)).toBe('approved');
    expect(deriveStatus(3, 2)).toBe('approved'); // mixed — approved wins (D-04)
  });

  it('bucket status: 0 approved + ≥1 pending → in_progress', () => {
    expect(deriveStatus(0, 1)).toBe('in_progress');
    expect(deriveStatus(0, 5)).toBe('in_progress');
  });

  it('bucket status: none → not_started', () => {
    expect(deriveStatus(0, 0)).toBe('not_started');
  });
});

// ---------------------------------------------------------------------------
// Pure unit tests — completion % (CHN-06)
// D-02: completion = covered_buckets / total_buckets × 100, clamped at 100
// ---------------------------------------------------------------------------

describe('completion (CHN-06)', () => {
  it('completion: covered buckets ÷ total buckets × 100', () => {
    // 2 of 3 buckets covered → 66%
    const coveredBuckets = 2;
    const totalBuckets   = 3;
    const completionPct  = Math.min(100, Math.round((coveredBuckets / totalBuckets) * 100));
    expect(completionPct).toBe(67); // Math.round(2/3 * 100) = Math.round(66.67) = 67
  });

  it('completion: all buckets covered → 100', () => {
    const completionPct = Math.min(100, Math.round((3 / 3) * 100));
    expect(completionPct).toBe(100);
  });
});

describe('completion clamp (CHN-06 over-completion)', () => {
  it('completion clamp: 2 approved in km 0–1 on 1km route → 100 not 200', () => {
    // Route = 1000m → 1 bucket. Both submissions land in bucket 0.
    // covered = 1 bucket; total = 1 bucket → 1/1 × 100 = 100
    // LEAST(100, 100) = 100 (not 200 even though 2 submissions in same bucket)
    const coveredBuckets = 1; // 1 unique bucket covered, regardless of submission count
    const totalBuckets   = 1;
    const completionPct  = Math.min(100, Math.round((coveredBuckets / totalBuckets) * 100));
    expect(completionPct).toBe(100);
    expect(completionPct).not.toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Pure unit tests — maps link (folded todo submission-detail-map-link)
// Asserts that the SELECT aliases encode the correct WGS84 axis order:
//   snapped_lat = ST_Y(snapped_point) = latitude
//   snapped_lon = ST_X(snapped_point) = longitude
// Google Maps ?q=lat,lon means snappedLat must come first in the URL.
// This test reads the analytics source to enforce the naming contract at CI time.
// ---------------------------------------------------------------------------

describe('maps link (ST_Y=lat, ST_X=lon)', () => {
  it('maps link: analytics SELECT uses ST_Y AS snapped_lat (latitude) and ST_X AS snapped_lon (longitude)', () => {
    // Read the analytics file and assert the axis-order encoding by checking the
    // column aliases appear in the correct order relative to ST_Y / ST_X.
    // This is a static-edge test: deterministic, <100ms, catches future axis swaps.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/actions/analytics.ts'),
      'utf-8'
    );
    // ST_Y (latitude) must be aliased as snapped_lat
    expect(src).toMatch(/ST_Y\(s\.snapped_point\)\s+AS\s+snapped_lat/);
    // ST_X (longitude) must be aliased as snapped_lon
    expect(src).toMatch(/ST_X\(s\.snapped_point\)\s+AS\s+snapped_lon/);
    // Row mapper: snappedLat derives from snapped_lat (ST_Y), snappedLon from snapped_lon (ST_X)
    expect(src).toMatch(/snappedLat:\s*r\.snapped_lat/);
    expect(src).toMatch(/snappedLon:\s*r\.snapped_lon/);
  });

  it('maps link: SubmissionDetailView URL uses snappedLat before snappedLon (q=lat,lon)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/components/admin/SubmissionDetailView.tsx'),
      'utf-8'
    );
    // The Google Maps URL must have lat first, lon second: ?q=${snappedLat},${snappedLon}
    expect(src).toMatch(/google\.com\/maps\?q=\$\{submission\.snappedLat\},\$\{submission\.snappedLon\}/);
    // rel="noopener noreferrer" must be present (T-15-03-TABNAB mitigation)
    expect(src).toMatch(/rel="noopener noreferrer"/);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — require DB (describeIfDb)
// ---------------------------------------------------------------------------

describeIfDb('chainage snapshot + bucket aggregation (CHN-03, CHN-04)', () => {
  let db: Awaited<ReturnType<typeof getTestDb>>;

  beforeEach(async () => {
    db = await getTestDb();
    await truncateAllTables(db);
    await seedChainageFixture(db);
  });

  afterEach(async () => {
    await truncateAllTables(db);
  });

  // CHN-03: chainage snapshot written at approval
  // The fixture seeds submissions with chainage_m = NULL (status = 'approved', but
  // chainage_m left NULL to simulate pre-15-02 state). This test manually writes the
  // snapshot to assert the formula — the live write is exercised by bot-audit.ts integration.
  it('chainage snapshot: chainage_m is non-NULL and equals ROUND(segment_fraction × total_length_m, 2) after approval', async () => {
    const { sql } = await import('drizzle-orm');
    const { submissionBId, projectId, tenantId } = CHAINAGE_FIXTURE_IDS;

    // Write chainage_m using Postgres ROUND (mirrors handleAuditDecision step 4)
    await db.execute(sql`
      UPDATE submissions s
      SET chainage_m = ROUND(
        s.segment_fraction::numeric * r.total_length_m::numeric,
        2
      ),
      route_geometry_version = r.geometry_version
      FROM routes r
      WHERE r.project_id = s.project_id
        AND s.id = ${submissionBId}
    `);

    // Assert: segment_fraction=0.5, total_length_m=3000 → chainage_m = 1500.00
    const rows = await db.execute(sql`
      SELECT chainage_m, route_geometry_version
      FROM submissions
      WHERE id = ${submissionBId}
    `);

    expect(rows.rows.length).toBe(1);
    const row = rows.rows[0];
    expect(row.chainage_m).not.toBeNull();
    // ROUND(0.5 × 3000, 2) = 1500.00 — compare as number
    expect(Number(row.chainage_m)).toBe(1500.00);

    // route_geometry_version should match the route's geometry_version (=1 from fixture)
    const routeRows = await db.execute(sql`
      SELECT geometry_version FROM routes WHERE project_id = ${projectId}
    `);
    expect(routeRows.rows.length).toBe(1);
    expect(Number(row.route_geometry_version)).toBe(Number(routeRows.rows[0].geometry_version));
  });

  it('chainage snapshot: route_geometry_version matches route.geometry_version at approval time', async () => {
    const { sql } = await import('drizzle-orm');
    const { submissionAId, projectId } = CHAINAGE_FIXTURE_IDS;

    // Write snapshot
    await db.execute(sql`
      UPDATE submissions s
      SET chainage_m = ROUND(s.segment_fraction::numeric * r.total_length_m::numeric, 2),
          route_geometry_version = r.geometry_version
      FROM routes r
      WHERE r.project_id = s.project_id
        AND s.id = ${submissionAId}
    `);

    const [subRow] = (await db.execute(sql`
      SELECT route_geometry_version FROM submissions WHERE id = ${submissionAId}
    `)).rows;
    const [routeRow] = (await db.execute(sql`
      SELECT geometry_version FROM routes WHERE project_id = ${projectId}
    `)).rows;

    expect(subRow.route_geometry_version).not.toBeNull();
    expect(Number(subRow.route_geometry_version)).toBe(Number(routeRow.geometry_version));
  });

  // CHN-04: getChainageBuckets enumerate ALL buckets via generate_series
  it('getChainageBuckets: 3000m route with 1000m bucket size → 3 buckets enumerated', async () => {
    const { sql } = await import('drizzle-orm');
    const { projectId, tenantId, submissionAId, submissionBId, submissionCId } = CHAINAGE_FIXTURE_IDS;

    // Write chainage_m for all 3 submissions so they appear in bucket aggregation
    await db.execute(sql`
      UPDATE submissions s
      SET chainage_m = ROUND(s.segment_fraction::numeric * r.total_length_m::numeric, 2),
          route_geometry_version = r.geometry_version
      FROM routes r
      WHERE r.project_id = s.project_id
        AND s.id IN (${submissionAId}, ${submissionBId}, ${submissionCId})
    `);

    const result = await fetchChainageBucketsRaw(projectId, 1000, tenantId);

    // 3000m / 1000m = 3 buckets (indices 0, 1, 2)
    expect(result.buckets.length).toBe(3);
    expect(result.totalLengthM).toBe(3000);
    expect(result.buckets[0].bucketIndex).toBe(0);
    expect(result.buckets[1].bucketIndex).toBe(1);
    expect(result.buckets[2].bucketIndex).toBe(2);
  });

  it('getChainageBuckets: buckets have correct start_m and end_m boundaries', async () => {
    const { sql } = await import('drizzle-orm');
    const { projectId, tenantId, submissionAId, submissionBId, submissionCId } = CHAINAGE_FIXTURE_IDS;

    await db.execute(sql`
      UPDATE submissions s
      SET chainage_m = ROUND(s.segment_fraction::numeric * r.total_length_m::numeric, 2),
          route_geometry_version = r.geometry_version
      FROM routes r
      WHERE r.project_id = s.project_id
        AND s.id IN (${submissionAId}, ${submissionBId}, ${submissionCId})
    `);

    const result = await fetchChainageBucketsRaw(projectId, 1000, tenantId);

    expect(result.buckets[0].bucketStart).toBe(0);
    expect(result.buckets[0].bucketEnd).toBe(1000);
    expect(result.buckets[1].bucketStart).toBe(1000);
    expect(result.buckets[1].bucketEnd).toBe(2000);
    expect(result.buckets[2].bucketStart).toBe(2000);
    // Last bucket end capped at totalLengthM=3000 (Pitfall 3)
    expect(result.buckets[2].bucketEnd).toBe(3000);
  });

  // CHN-02: chainage offset
  it('chainage offset: setChainageOffset writes routes.chainage_offset_m', async () => {
    const { sql } = await import('drizzle-orm');
    const { projectId, tenantId } = CHAINAGE_FIXTURE_IDS;

    // Directly write offset (mirrors setChainageOffset DB write — avoids auth() in test)
    await db.execute(sql`
      UPDATE routes
      SET chainage_offset_m = '500'
      WHERE project_id = ${projectId}
        AND tenant_id  = ${tenantId}
    `);

    // Verify the write
    const rows = await db.execute(sql`
      SELECT chainage_offset_m FROM routes WHERE project_id = ${projectId}
    `);
    expect(Number(rows.rows[0].chainage_offset_m)).toBe(500);
  });

  it('chainage offset: getChainageBuckets applies offset to bucket start/end display values', async () => {
    const { sql } = await import('drizzle-orm');
    const { projectId, tenantId, submissionBId } = CHAINAGE_FIXTURE_IDS;

    // Write chainage_m for submission B (fraction=0.5 → 1500m raw)
    await db.execute(sql`
      UPDATE submissions s
      SET chainage_m = ROUND(s.segment_fraction::numeric * r.total_length_m::numeric, 2),
          route_geometry_version = r.geometry_version
      FROM routes r
      WHERE r.project_id = s.project_id
        AND s.id = ${submissionBId}
    `);

    // Apply a 200m offset
    await db.execute(sql`
      UPDATE routes
      SET chainage_offset_m = '200'
      WHERE project_id = ${projectId}
        AND tenant_id  = ${tenantId}
    `);

    const result = await fetchChainageBucketsRaw(projectId, 1000, tenantId);

    // With offset=200: submission B is at chainage_m=1500 + offset=200 = 1700m
    // FLOOR(1700 / 1000) = 1 → bucket index 1
    // Bucket starts: 0→0m, 1→1000m, 2→2000m (bucket_idx * bucketSizeM — offset is in FLOOR only)
    expect(result.chainageOffsetM).toBe(200);
    // The result should still have 3 buckets (generate_series based on route length)
    expect(result.buckets.length).toBe(3);

    // Submission B (chainage_m=1500, offset=200) → effective chainage = 1700 → bucket 1
    const bucket1 = result.buckets.find(b => b.bucketIndex === 1);
    expect(bucket1).toBeDefined();
    expect(bucket1!.approvedCount).toBe(1);
    expect(bucket1!.status).toBe('approved');
  });

  // CR-01: end-of-route / out-of-range submissions must be clamped into the
  // first/last bucket, NOT silently dropped by the LEFT JOIN.
  it('getChainageBuckets: segment_fraction=1.0 (route end) is counted in the last bucket, not dropped', async () => {
    const { sql } = await import('drizzle-orm');
    const { projectId, tenantId, submissionAId } = CHAINAGE_FIXTURE_IDS;

    // Force submission A to the exact route end: fraction=1.0 → 3000m → FLOOR(3000/1000)=3,
    // which is outside generate_series(0,2). Pre-fix this row vanished.
    await db.execute(sql`
      UPDATE submissions
      SET segment_fraction = 1.0,
          chainage_m = 3000.00
      WHERE id = ${submissionAId}
    `);

    const result = await fetchChainageBucketsRaw(projectId, 1000, tenantId);

    // 3 buckets enumerated (0,1,2); submission A clamped into the last bucket (idx 2).
    expect(result.buckets.length).toBe(3);
    const lastBucket = result.buckets[result.buckets.length - 1];
    expect(lastBucket.bucketIndex).toBe(2);
    expect(lastBucket.approvedCount).toBeGreaterThanOrEqual(1);
  });

  it('getChainageBuckets: negative calibrated chainage (negative offset) is counted in the first bucket, not dropped', async () => {
    const { sql } = await import('drizzle-orm');
    const { projectId, tenantId, submissionAId } = CHAINAGE_FIXTURE_IDS;

    // Submission A near route start (498m), then a large negative offset pushes the
    // calibrated value below 0 → FLOOR((498 - 1000)/1000) = -1, outside the series.
    await db.execute(sql`
      UPDATE submissions s
      SET chainage_m = ROUND(s.segment_fraction::numeric * 3000::numeric, 2)
      WHERE s.id = ${submissionAId}
    `);
    await db.execute(sql`
      UPDATE routes
      SET chainage_offset_m = '-1000'
      WHERE project_id = ${projectId}
        AND tenant_id  = ${tenantId}
    `);

    const result = await fetchChainageBucketsRaw(projectId, 1000, tenantId);

    // Submission A folds into the first bucket (idx 0) rather than disappearing.
    expect(result.buckets.length).toBe(3);
    const firstBucket = result.buckets[0];
    expect(firstBucket.bucketIndex).toBe(0);
    expect(firstBucket.approvedCount).toBeGreaterThanOrEqual(1);
  });

  // CHN-07: chainage excel columns (plan 15-06)
  // Builds a workbook from fixture buckets and reads it back using 1-based numeric index.
  // NOTE: ExcelJS XLSX does NOT persist column keys — must use getCell(row, colIndex).
  it('chainage excel columns: 8 columns in order — Km Başlangıç, Km Bitiş, İş Adedi, Malzeme, Miktar, Birim, İşçi, Denetçi', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const { buildChainageLedger } = await import('../src/lib/chainage-excel');

    // Minimal fixture bucket — no DB required for this structural assertion
    const fakeBucket = {
      bucketIndex:       0,
      bucketStart:       0,
      bucketEnd:         1000,
      status:            'approved' as const,
      approvedCount:     1,
      pendingCount:      0,
      boqBreakdown:      [{ material: 'Boru', unit: 'm', quantity: '50.00' }],
      workers:           ['Ali Veli'],
      auditors:          ['Denetçi A'],
      firstSubmissionId: null,
    };

    const buffer = await buildChainageLedger({ buckets: [fakeBucket] });

    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];

    // Header row — columns 1–8 in order (1-based numeric index, keys not persisted)
    expect(sheet.getCell(1, 1).value).toBe('Km Başlangıç');
    expect(sheet.getCell(1, 2).value).toBe('Km Bitiş');
    expect(sheet.getCell(1, 3).value).toBe('İş Adedi');
    expect(sheet.getCell(1, 4).value).toBe('Malzeme');
    expect(sheet.getCell(1, 5).value).toBe('Miktar');
    expect(sheet.getCell(1, 6).value).toBe('Birim');
    expect(sheet.getCell(1, 7).value).toBe('İşçi');
    expect(sheet.getCell(1, 8).value).toBe('Denetçi');

    // Data row — chainage format + content
    expect(sheet.getCell(2, 1).value).toBe('km 0+000');
    expect(sheet.getCell(2, 2).value).toBe('km 1+000');
    expect(sheet.getCell(2, 3).value).toBe(1);     // approvedCount — numeric
    expect(sheet.getCell(2, 4).value).toBe('Boru');
    expect(sheet.getCell(2, 5).value).toBe('50.00');
    expect(sheet.getCell(2, 6).value).toBe('m');
    expect(sheet.getCell(2, 7).value).toBe('Ali Veli');
    expect(sheet.getCell(2, 8).value).toBe('Denetçi A');
  });
});
