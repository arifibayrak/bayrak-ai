/**
 * seed-demo-month.ts
 *
 * Wipes all existing project data for the default demo tenant and seeds a
 * realistic ~1-month dataset (May 2026) so the office-engineer dashboard
 * shows real numbers everywhere.
 *
 * Usage:  npx tsx scripts/seed-demo-month.ts
 *
 * IDEMPOTENT: safe to re-run. Deletes then re-inserts demo rows for tenant
 * 00000000-0000-0000-0000-000000000001 only — test data (TEST_DATABASE_URL)
 * is never touched.
 */

import { config } from 'dotenv';
import path from 'path';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';

config({ path: path.resolve(process.cwd(), '.env.local'), override: false });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set — check .env.local');
  process.exit(1);
}

const sqlClient = neon(DATABASE_URL);
const db = drizzle(sqlClient);

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Fixed UUIDs so the script is fully deterministic
const IDS = {
  // People
  worker1:   'dd000000-0000-0000-0000-000000000101',
  worker2:   'dd000000-0000-0000-0000-000000000102',
  worker3:   'dd000000-0000-0000-0000-000000000103',
  worker4:   'dd000000-0000-0000-0000-000000000104',
  auditor1:  'dd000000-0000-0000-0000-000000000110',
  // Projects
  proj1:     'dd000000-0000-0000-0000-000000000201',
  proj2:     'dd000000-0000-0000-0000-000000000202',
  // BOQ items — project 1 (5 items)
  boq1_1:    'dd000000-0000-0000-0000-000000000301',
  boq1_2:    'dd000000-0000-0000-0000-000000000302',
  boq1_3:    'dd000000-0000-0000-0000-000000000303',
  boq1_4:    'dd000000-0000-0000-0000-000000000304',
  boq1_5:    'dd000000-0000-0000-0000-000000000305',
  // BOQ items — project 2 (5 items)
  boq2_1:    'dd000000-0000-0000-0000-000000000311',
  boq2_2:    'dd000000-0000-0000-0000-000000000312',
  boq2_3:    'dd000000-0000-0000-0000-000000000313',
  boq2_4:    'dd000000-0000-0000-0000-000000000314',
  boq2_5:    'dd000000-0000-0000-0000-000000000315',
  // Routes
  route1:    'dd000000-0000-0000-0000-000000000401',
  route2:    'dd000000-0000-0000-0000-000000000402',
  // Hakedis period (project 1 only)
  period1:   'dd000000-0000-0000-0000-000000000501',
  // Period lines (one per boq item of project 1)
  pline1_1:  'dd000000-0000-0000-0000-000000000601',
  pline1_2:  'dd000000-0000-0000-0000-000000000602',
  pline1_3:  'dd000000-0000-0000-0000-000000000603',
  pline1_4:  'dd000000-0000-0000-0000-000000000604',
  pline1_5:  'dd000000-0000-0000-0000-000000000605',
};

// Fixed Telegram user IDs (realistic-looking but not real accounts)
const TELEGRAM_IDS = {
  worker1:  BigInt('7100000001'),
  worker2:  BigInt('7100000002'),
  worker3:  BigInt('7100000003'),
  worker4:  BigInt('7100000004'),
  auditor1: BigInt('7100000010'),
};

// ─── Submission definitions ────────────────────────────────────────────────
// 30 submissions spread across May 2026.
// Status mix: ~60% approved, ~20% rejected, ~20% pending_audit
// Columns: flowId, personId, projectId, boqItemId, status, qty, day (1-31), workerIdx

interface SubmissionDef {
  flowId: string;
  personId: string;
  projectId: string;
  boqItemId: string;
  status: 'pending_audit' | 'approved' | 'rejected';
  qty: number;
  day: number;  // day of May 2026
  notes?: string;
}

const SUBMISSIONS: SubmissionDef[] = [
  // --- Project 1, BOQ item 1 (Kazı) — approved
  { flowId: 'dd000000-0000-0000-0001-000000000001', personId: IDS.worker1, projectId: IDS.proj1, boqItemId: IDS.boq1_1, status: 'approved',       qty: 45.0, day: 2,  notes: 'Güzergah km 0+200 kazı tamamlandı' },
  { flowId: 'dd000000-0000-0000-0001-000000000002', personId: IDS.worker1, projectId: IDS.proj1, boqItemId: IDS.boq1_1, status: 'approved',       qty: 52.0, day: 5  },
  { flowId: 'dd000000-0000-0000-0001-000000000003', personId: IDS.worker2, projectId: IDS.proj1, boqItemId: IDS.boq1_1, status: 'rejected',       qty: 38.0, day: 7,  notes: 'Zemin yumuşak, yeniden yapılacak' },
  { flowId: 'dd000000-0000-0000-0001-000000000004', personId: IDS.worker1, projectId: IDS.proj1, boqItemId: IDS.boq1_1, status: 'approved',       qty: 61.5, day: 10 },
  { flowId: 'dd000000-0000-0000-0001-000000000005', personId: IDS.worker2, projectId: IDS.proj1, boqItemId: IDS.boq1_1, status: 'approved',       qty: 48.0, day: 13 },
  // --- Project 1, BOQ item 2 (Boru Döşeme) — approved
  { flowId: 'dd000000-0000-0000-0001-000000000006', personId: IDS.worker1, projectId: IDS.proj1, boqItemId: IDS.boq1_2, status: 'approved',       qty: 30.0, day: 3  },
  { flowId: 'dd000000-0000-0000-0001-000000000007', personId: IDS.worker2, projectId: IDS.proj1, boqItemId: IDS.boq1_2, status: 'approved',       qty: 25.0, day: 6  },
  { flowId: 'dd000000-0000-0000-0001-000000000008', personId: IDS.worker1, projectId: IDS.proj1, boqItemId: IDS.boq1_2, status: 'pending_audit',  qty: 20.0, day: 22, notes: 'Denetim bekleniyor' },
  { flowId: 'dd000000-0000-0000-0001-000000000009', personId: IDS.worker3, projectId: IDS.proj1, boqItemId: IDS.boq1_2, status: 'approved',       qty: 35.0, day: 15 },
  // --- Project 1, BOQ item 3 (Dolgu) — mixed
  { flowId: 'dd000000-0000-0000-0001-000000000010', personId: IDS.worker2, projectId: IDS.proj1, boqItemId: IDS.boq1_3, status: 'approved',       qty: 40.0, day: 8  },
  { flowId: 'dd000000-0000-0000-0001-000000000011', personId: IDS.worker3, projectId: IDS.proj1, boqItemId: IDS.boq1_3, status: 'rejected',       qty: 22.0, day: 11, notes: 'Sıkıştırma yeterli değil' },
  { flowId: 'dd000000-0000-0000-0001-000000000012', personId: IDS.worker2, projectId: IDS.proj1, boqItemId: IDS.boq1_3, status: 'approved',       qty: 55.0, day: 14 },
  { flowId: 'dd000000-0000-0000-0001-000000000013', personId: IDS.worker1, projectId: IDS.proj1, boqItemId: IDS.boq1_3, status: 'pending_audit',  qty: 30.0, day: 24 },
  // --- Project 1, BOQ item 4 (Yol Kaplama) — approved
  { flowId: 'dd000000-0000-0000-0001-000000000014', personId: IDS.worker3, projectId: IDS.proj1, boqItemId: IDS.boq1_4, status: 'approved',       qty: 18.0, day: 16 },
  { flowId: 'dd000000-0000-0000-0001-000000000015', personId: IDS.worker3, projectId: IDS.proj1, boqItemId: IDS.boq1_4, status: 'approved',       qty: 22.0, day: 19 },
  { flowId: 'dd000000-0000-0000-0001-000000000016', personId: IDS.worker4, projectId: IDS.proj1, boqItemId: IDS.boq1_4, status: 'pending_audit',  qty: 15.0, day: 27 },
  // --- Project 1, BOQ item 5 (Beton) — mixed
  { flowId: 'dd000000-0000-0000-0001-000000000017', personId: IDS.worker4, projectId: IDS.proj1, boqItemId: IDS.boq1_5, status: 'approved',       qty: 8.0,  day: 9  },
  { flowId: 'dd000000-0000-0000-0001-000000000018', personId: IDS.worker4, projectId: IDS.proj1, boqItemId: IDS.boq1_5, status: 'rejected',       qty: 5.0,  day: 12, notes: 'Beton kalitesi yetersiz' },
  { flowId: 'dd000000-0000-0000-0001-000000000019', personId: IDS.worker4, projectId: IDS.proj1, boqItemId: IDS.boq1_5, status: 'approved',       qty: 11.0, day: 18 },
  // --- Project 2, BOQ item 1 (Kazı)
  { flowId: 'dd000000-0000-0000-0002-000000000001', personId: IDS.worker1, projectId: IDS.proj2, boqItemId: IDS.boq2_1, status: 'approved',       qty: 60.0, day: 4  },
  { flowId: 'dd000000-0000-0000-0002-000000000002', personId: IDS.worker2, projectId: IDS.proj2, boqItemId: IDS.boq2_1, status: 'approved',       qty: 75.0, day: 8  },
  { flowId: 'dd000000-0000-0000-0002-000000000003', personId: IDS.worker3, projectId: IDS.proj2, boqItemId: IDS.boq2_1, status: 'pending_audit',  qty: 40.0, day: 25 },
  // --- Project 2, BOQ item 2 (Boru Döşeme)
  { flowId: 'dd000000-0000-0000-0002-000000000004', personId: IDS.worker1, projectId: IDS.proj2, boqItemId: IDS.boq2_2, status: 'approved',       qty: 50.0, day: 6  },
  { flowId: 'dd000000-0000-0000-0002-000000000005', personId: IDS.worker2, projectId: IDS.proj2, boqItemId: IDS.boq2_2, status: 'rejected',       qty: 20.0, day: 9,  notes: 'Boru derinliği yetersiz' },
  { flowId: 'dd000000-0000-0000-0002-000000000006', personId: IDS.worker3, projectId: IDS.proj2, boqItemId: IDS.boq2_2, status: 'approved',       qty: 45.0, day: 16 },
  // --- Project 2, BOQ item 3 (Dolgu)
  { flowId: 'dd000000-0000-0000-0002-000000000007', personId: IDS.worker4, projectId: IDS.proj2, boqItemId: IDS.boq2_3, status: 'approved',       qty: 65.0, day: 11 },
  { flowId: 'dd000000-0000-0000-0002-000000000008', personId: IDS.worker4, projectId: IDS.proj2, boqItemId: IDS.boq2_3, status: 'approved',       qty: 70.0, day: 17 },
  // --- Project 2, BOQ item 4 (Yol Kaplama)
  { flowId: 'dd000000-0000-0000-0002-000000000009', personId: IDS.worker1, projectId: IDS.proj2, boqItemId: IDS.boq2_4, status: 'approved',       qty: 25.0, day: 20 },
  { flowId: 'dd000000-0000-0000-0002-000000000010', personId: IDS.worker2, projectId: IDS.proj2, boqItemId: IDS.boq2_4, status: 'pending_audit',  qty: 18.0, day: 28 },
  // --- Project 2, BOQ item 5 (Kazıklı Temel)
  { flowId: 'dd000000-0000-0000-0002-000000000011', personId: IDS.worker3, projectId: IDS.proj2, boqItemId: IDS.boq2_5, status: 'approved',       qty: 12.0, day: 22 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function mayDate(day: number, hour = 10, minute = 30): string {
  return `2026-05-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+03:00`;
}

function q(s: string | null | undefined): string {
  if (s == null) return 'NULL';
  return `'${s.replace(/'/g, "''")}'`;
}

// ─── Reset ─────────────────────────────────────────────────────────────────

async function reset() {
  console.log('Resetting demo data for tenant', TENANT_ID, '...');

  // Delete in FK-safe order (most dependent first)
  await db.execute(sql.raw(`
    DELETE FROM hakedis_line_submissions
    WHERE period_line_id IN (
      SELECT hpl.id FROM hakedis_period_lines hpl
      JOIN hakedis_periods hp ON hp.id = hpl.period_id
      JOIN projects p ON p.id = hp.project_id
      WHERE p.tenant_id = '${TENANT_ID}'
    )
  `));

  await db.execute(sql.raw(`
    DELETE FROM hakedis_period_lines
    WHERE period_id IN (
      SELECT hp.id FROM hakedis_periods hp
      JOIN projects p ON p.id = hp.project_id
      WHERE p.tenant_id = '${TENANT_ID}'
    )
  `));

  await db.execute(sql.raw(`
    DELETE FROM hakedis_periods
    WHERE project_id IN (SELECT id FROM projects WHERE tenant_id = '${TENANT_ID}')
  `));

  await db.execute(sql.raw(`
    DELETE FROM office_activity_log
    WHERE project_id IN (SELECT id FROM projects WHERE tenant_id = '${TENANT_ID}')
       OR tenant_id = '${TENANT_ID}'
  `));

  await db.execute(sql.raw(`
    DELETE FROM audit_notifications
    WHERE submission_id IN (
      SELECT id FROM submissions
      WHERE project_id IN (SELECT id FROM projects WHERE tenant_id = '${TENANT_ID}')
    )
  `));

  await db.execute(sql.raw(`
    DELETE FROM submission_ai_flags
    WHERE tenant_id = '${TENANT_ID}'
  `));

  await db.execute(sql.raw(`
    DELETE FROM submissions
    WHERE project_id IN (SELECT id FROM projects WHERE tenant_id = '${TENANT_ID}')
  `));

  await db.execute(sql.raw(`
    DELETE FROM assignments
    WHERE tenant_id = '${TENANT_ID}'
  `));

  await db.execute(sql.raw(`
    DELETE FROM boq_items
    WHERE tenant_id = '${TENANT_ID}'
  `));

  await db.execute(sql.raw(`
    DELETE FROM route_source_documents
    WHERE tenant_id = '${TENANT_ID}'
  `));

  await db.execute(sql.raw(`
    DELETE FROM routes
    WHERE tenant_id = '${TENANT_ID}'
  `));

  await db.execute(sql.raw(`
    DELETE FROM projects
    WHERE tenant_id = '${TENANT_ID}'
  `));

  await db.execute(sql.raw(`
    DELETE FROM people
    WHERE tenant_id = '${TENANT_ID}'
  `));

  console.log('Reset complete.');
}

// ─── Seed ──────────────────────────────────────────────────────────────────

async function seed() {
  // 1. Ensure tenant row exists
  await db.execute(sql.raw(`
    INSERT INTO tenants (id, name)
    VALUES ('${TENANT_ID}', 'Bayrak Altyapı A.Ş.')
    ON CONFLICT DO NOTHING
  `));

  // 2. Ensure tenant_settings row exists
  await db.execute(sql.raw(`
    INSERT INTO tenant_settings (tenant_id)
    VALUES ('${TENANT_ID}')
    ON CONFLICT DO NOTHING
  `));

  // 3. People
  const people = [
    { id: IDS.worker1,  telegramId: TELEGRAM_IDS.worker1,  name: 'Mehmet Yılmaz' },
    { id: IDS.worker2,  telegramId: TELEGRAM_IDS.worker2,  name: 'Ahmet Kaya' },
    { id: IDS.worker3,  telegramId: TELEGRAM_IDS.worker3,  name: 'Mustafa Demir' },
    { id: IDS.worker4,  telegramId: TELEGRAM_IDS.worker4,  name: 'Hüseyin Şahin' },
    { id: IDS.auditor1, telegramId: TELEGRAM_IDS.auditor1, name: 'Ali Çelik (Denetçi)' },
  ];
  for (const p of people) {
    await db.execute(sql.raw(`
      INSERT INTO people (id, tenant_id, telegram_user_id, display_name)
      VALUES ('${p.id}', '${TENANT_ID}', ${p.telegramId}, '${p.name.replace(/'/g, "''")}')
      ON CONFLICT DO NOTHING
    `));
  }

  // 4. Projects
  await db.execute(sql.raw(`
    INSERT INTO projects (id, tenant_id, name, description)
    VALUES
      ('${IDS.proj1}', '${TENANT_ID}', 'İstanbul Doğalgaz Hattı - Faz 2', 'Avrupa Yakası doğalgaz şebeke genişlemesi, DN200 hat'),
      ('${IDS.proj2}', '${TENANT_ID}', 'Ankara İçme Suyu Şebekesi', 'Mamak ilçesi altyapı rehabilitasyon projesi')
    ON CONFLICT DO NOTHING
  `));

  // 5. BOQ items — Project 1
  const boq1 = [
    { id: IDS.boq1_1, material: 'Kazı (Mekanik)', unit: 'm³', plannedQty: '800.000', unitPrice: '85.0000', sort: 1 },
    { id: IDS.boq1_2, material: 'DN200 HDPE Boru Döşeme', unit: 'm',  plannedQty: '500.000', unitPrice: '420.0000', sort: 2 },
    { id: IDS.boq1_3, material: 'Granüler Dolgu', unit: 'm³', plannedQty: '600.000', unitPrice: '75.0000', sort: 3 },
    { id: IDS.boq1_4, material: 'Asfalt Yol Kaplama Onarımı', unit: 'm²', plannedQty: '200.000', unitPrice: '380.0000', sort: 4 },
    { id: IDS.boq1_5, material: 'Beton (C25) Blok', unit: 'm³', plannedQty: '80.000',  unitPrice: '1850.0000', sort: 5 },
  ];
  for (const b of boq1) {
    await db.execute(sql.raw(`
      INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, unit_price, currency_code, sort_order)
      VALUES ('${b.id}', '${TENANT_ID}', '${IDS.proj1}', '${b.material}', '${b.unit}', '${b.plannedQty}', '0.000', '${b.unitPrice}', 'TRY', ${b.sort})
      ON CONFLICT DO NOTHING
    `));
  }

  // 6. BOQ items — Project 2
  const boq2 = [
    { id: IDS.boq2_1, material: 'Kazı (Mekanik)',            unit: 'm³', plannedQty: '1200.000', unitPrice: '90.0000',   sort: 1 },
    { id: IDS.boq2_2, material: 'DN150 PVC İçme Suyu Borusu', unit: 'm', plannedQty: '800.000',  unitPrice: '310.0000', sort: 2 },
    { id: IDS.boq2_3, material: 'Granüler Dolgu',            unit: 'm³', plannedQty: '900.000',  unitPrice: '72.0000',   sort: 3 },
    { id: IDS.boq2_4, material: 'Kilit Taşı Döşeme Onarımı', unit: 'm²', plannedQty: '300.000', unitPrice: '290.0000',  sort: 4 },
    { id: IDS.boq2_5, material: 'Fore Kazıklı Temel (D=60cm)', unit: 'adet', plannedQty: '24.000', unitPrice: '12500.0000', sort: 5 },
  ];
  for (const b of boq2) {
    await db.execute(sql.raw(`
      INSERT INTO boq_items (id, tenant_id, project_id, material, unit, planned_qty, approved_qty, unit_price, currency_code, sort_order)
      VALUES ('${b.id}', '${TENANT_ID}', '${IDS.proj2}', '${b.material}', '${b.unit}', '${b.plannedQty}', '0.000', '${b.unitPrice}', 'TRY', ${b.sort})
      ON CONFLICT DO NOTHING
    `));
  }

  // 7. Routes — minimal valid LINESTRINGs (Istanbul / Ankara reference coords)
  // Project 1: Istanbul European side, ~2km segment
  const route1GeoJSON = JSON.stringify({
    type: 'LineString',
    coordinates: [
      [28.7800, 41.0800],
      [28.7850, 41.0840],
      [28.7900, 41.0880],
      [28.7960, 41.0920],
    ],
  });
  await db.execute(sql`
    INSERT INTO routes (id, tenant_id, project_id, geom, coordinate_count, geometry_version, total_length_m)
    VALUES (
      ${IDS.route1}, ${TENANT_ID}, ${IDS.proj1},
      ST_GeomFromGeoJSON(${route1GeoJSON}),
      4, 1, '2150.00'
    )
    ON CONFLICT DO NOTHING
  `);

  // Project 2: Ankara Mamak district, ~2km segment
  const route2GeoJSON = JSON.stringify({
    type: 'LineString',
    coordinates: [
      [32.9300, 39.9050],
      [32.9360, 39.9090],
      [32.9420, 39.9130],
      [32.9480, 39.9170],
    ],
  });
  await db.execute(sql`
    INSERT INTO routes (id, tenant_id, project_id, geom, coordinate_count, geometry_version, total_length_m)
    VALUES (
      ${IDS.route2}, ${TENANT_ID}, ${IDS.proj2},
      ST_GeomFromGeoJSON(${route2GeoJSON}),
      4, 1, '2340.00'
    )
    ON CONFLICT DO NOTHING
  `);

  // 8. Assignments — all workers + auditor on both projects
  const workerIds = [IDS.worker1, IDS.worker2, IDS.worker3, IDS.worker4];
  const projectIds = [IDS.proj1, IDS.proj2];
  let assignSeq = 1;
  for (const pid of projectIds) {
    for (const wid of workerIds) {
      const aid = `dd000000-0000-${String(assignSeq).padStart(4, '0')}-0000-000000000700`;
      await db.execute(sql.raw(`
        INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project)
        VALUES ('${aid}', '${TENANT_ID}', '${wid}', '${pid}', 'worker')
        ON CONFLICT DO NOTHING
      `));
      assignSeq++;
    }
    // Auditor on each project
    const aAid = `dd000000-0000-${String(assignSeq).padStart(4, '0')}-0000-000000000700`;
    await db.execute(sql.raw(`
      INSERT INTO assignments (id, tenant_id, person_id, project_id, role_on_project)
      VALUES ('${aAid}', '${TENANT_ID}', '${IDS.auditor1}', '${pid}', 'auditor')
      ON CONFLICT DO NOTHING
    `));
    assignSeq++;
  }

  // 9. Submissions
  // Track approved_qty per boq_item for later boq update and hakedis lines
  const approvedQtyByBoqItem: Record<string, number> = {};

  let subSeq = 1;
  for (const s of SUBMISSIONS) {
    const subId = `ee000000-0000-0000-${String(subSeq).padStart(4, '0')}-000000000000`;
    const submittedAt = mayDate(s.day, 8, 30);
    // Local placeholder under /public so next/image renders it without a
    // remotePatterns host. Real bot photos use *.public.blob.vercel-storage.com
    // (configured in next.config.ts); the previous fake blob.vercel-storage.com
    // host was NOT configured and made next/image throw a render-time error,
    // crashing every photo surface (record detail, Kayitlar tab, map popup).
    const photoUrl = `/demo/field-photo.png`;
    const notesVal = s.notes ? q(s.notes) : 'NULL';

    let decidedByVal = 'NULL';
    let decidedAtVal = 'NULL';
    let rejectionReasonVal = 'NULL';

    if (s.status === 'approved' || s.status === 'rejected') {
      decidedByVal = q(IDS.auditor1);
      decidedAtVal = q(mayDate(s.day, 15, 0));  // decided same day afternoon
      if (s.status === 'rejected') {
        rejectionReasonVal = notesVal !== 'NULL' ? notesVal : q('Standartlara uygun değil');
      }
    }

    if (s.status === 'approved') {
      approvedQtyByBoqItem[s.boqItemId] = (approvedQtyByBoqItem[s.boqItemId] ?? 0) + s.qty;
    }

    await db.execute(sql.raw(`
      INSERT INTO submissions (
        id, tenant_id, flow_id, person_id, project_id, boq_item_id,
        photo_url, quantity, notes, status, submitted_at,
        decided_by, decided_at, rejection_reason
      ) VALUES (
        '${subId}', '${TENANT_ID}', '${s.flowId}', '${s.personId}', '${s.projectId}', '${s.boqItemId}',
        '${photoUrl}', '${s.qty}', ${notesVal}, '${s.status}', '${submittedAt}',
        ${decidedByVal}, ${decidedAtVal}, ${rejectionReasonVal}
      )
      ON CONFLICT DO NOTHING
    `));
    subSeq++;
  }

  // 10. Update boq_items approved_qty to reflect approved submissions
  for (const [boqItemId, qty] of Object.entries(approvedQtyByBoqItem)) {
    await db.execute(sql.raw(`
      UPDATE boq_items
      SET approved_qty = '${qty.toFixed(3)}'
      WHERE id = '${boqItemId}'
    `));
  }

  // 11. Hakkediş period for project 1 (May 2026)
  await db.execute(sql.raw(`
    INSERT INTO hakedis_periods (
      id, tenant_id, project_id, period_number,
      period_start_date, period_end_date, currency_code, status,
      kdv_rate, retention_rate, tevkifat_fraction, stopaj_enabled, avans_kesintisi_rate,
      notes
    ) VALUES (
      '${IDS.period1}', '${TENANT_ID}', '${IDS.proj1}', 'HK-2026-05',
      '2026-05-01', '2026-05-31', 'TRY', 'finalized',
      '0.2000', '0.0500', '0.4000', false, '0.0000',
      'Mayıs 2026 hakediş dönemi'
    )
    ON CONFLICT DO NOTHING
  `));

  // 12. Period lines (one per boq item of project 1 that has approved qty > 0)
  const periodLineItems = [
    { id: IDS.pline1_1, boqItemId: IDS.boq1_1, material: 'Kazı (Mekanik)',             unit: 'm³', unitPrice: '85.0000'   },
    { id: IDS.pline1_2, boqItemId: IDS.boq1_2, material: 'DN200 HDPE Boru Döşeme',     unit: 'm',  unitPrice: '420.0000'  },
    { id: IDS.pline1_3, boqItemId: IDS.boq1_3, material: 'Granüler Dolgu',             unit: 'm³', unitPrice: '75.0000'   },
    { id: IDS.pline1_4, boqItemId: IDS.boq1_4, material: 'Asfalt Yol Kaplama Onarımı', unit: 'm²', unitPrice: '380.0000'  },
    { id: IDS.pline1_5, boqItemId: IDS.boq1_5, material: 'Beton (C25) Blok',           unit: 'm³', unitPrice: '1850.0000' },
  ];

  let lineSubSeq = 1;
  for (const line of periodLineItems) {
    const cumQty = approvedQtyByBoqItem[line.boqItemId] ?? 0;
    if (cumQty === 0) continue;

    const prevQty = '0.000';
    const cumQtyStr = cumQty.toFixed(3);
    // period_qty is a GENERATED column — do NOT supply it
    const periodValue = (cumQty * parseFloat(line.unitPrice)).toFixed(2);
    const cumulativeValue = periodValue;  // first period, so same

    await db.execute(sql.raw(`
      INSERT INTO hakedis_period_lines (
        id, tenant_id, period_id, boq_item_id,
        material_snapshot, unit_snapshot, currency_code_snapshot, unit_price_snapshot,
        cumulative_qty_approved, previous_cumulative_qty,
        period_value, cumulative_value
      ) VALUES (
        '${line.id}', '${TENANT_ID}', '${IDS.period1}', '${line.boqItemId}',
        '${line.material}', '${line.unit}', 'TRY', '${line.unitPrice}',
        '${cumQtyStr}', '${prevQty}',
        '${periodValue}', '${cumulativeValue}'
      )
      ON CONFLICT DO NOTHING
    `));

    // 13. Link approved submissions to the period line
    const approvedForItem = SUBMISSIONS.filter(
      s => s.boqItemId === line.boqItemId && s.status === 'approved'
    );
    let lsSeq = lineSubSeq;
    for (const sub of approvedForItem) {
      // Reconstruct submission id (same formula as above)
      const subIdx = SUBMISSIONS.indexOf(sub) + 1;
      const submissionId = `ee000000-0000-0000-${String(subIdx).padStart(4, '0')}-000000000000`;
      await db.execute(sql.raw(`
        INSERT INTO hakedis_line_submissions (
          tenant_id, period_line_id, submission_id, qty_contributed
        ) VALUES (
          '${TENANT_ID}', '${line.id}', '${submissionId}', '${sub.qty.toFixed(3)}'
        )
        ON CONFLICT DO NOTHING
      `));
      lsSeq++;
    }
    lineSubSeq++;
  }
}

// ─── Summary ───────────────────────────────────────────────────────────────

async function printSummary() {
  // Use drizzle sql`` tagged template — returns rows as plain array via db.execute.
  // db.execute with drizzle-orm neon-http returns NeonHttpQueryResult which has .rows
  const tid = TENANT_ID;
  const r = async (q: ReturnType<typeof sql.raw>) => {
    const res = await db.execute(q) as any;
    // NeonHttpQueryResult shape: { rows: [...] } or iterable
    const rows = Array.isArray(res) ? res : (res?.rows ?? []);
    return rows;
  };

  const projRows   = await r(sql.raw(`SELECT COUNT(*) AS n FROM projects WHERE tenant_id = '${tid}'`));
  const peopleRows = await r(sql.raw(`SELECT COUNT(*) AS n FROM people WHERE tenant_id = '${tid}'`));
  const boqRows    = await r(sql.raw(`SELECT COUNT(*) AS n FROM boq_items WHERE tenant_id = '${tid}'`));
  const routeRows  = await r(sql.raw(`SELECT COUNT(*) AS n FROM routes WHERE tenant_id = '${tid}'`));
  const subRows    = await r(sql.raw(`SELECT status, COUNT(*) AS n FROM submissions WHERE tenant_id = '${tid}' GROUP BY status ORDER BY status`));
  const periodRows = await r(sql.raw(`SELECT COUNT(*) AS n FROM hakedis_periods WHERE tenant_id = '${tid}'`));
  const plineRows  = await r(sql.raw(`SELECT COUNT(*) AS n FROM hakedis_period_lines WHERE tenant_id = '${tid}'`));
  const hlsRows    = await r(sql.raw(`SELECT COUNT(*) AS n FROM hakedis_line_submissions WHERE tenant_id = '${tid}'`));

  const projCount   = Number(projRows[0]?.n ?? 0);
  const peopleCount = Number(peopleRows[0]?.n ?? 0);
  const boqCount    = Number(boqRows[0]?.n ?? 0);
  const routeCount  = Number(routeRows[0]?.n ?? 0);
  const periodCount = Number(periodRows[0]?.n ?? 0);
  const plineCount  = Number(plineRows[0]?.n ?? 0);
  const hlsCount    = Number(hlsRows[0]?.n ?? 0);

  console.log('\n--- Demo Seed Summary ---');
  console.log(`Projects:          ${projCount}`);
  console.log(`People:            ${peopleCount}`);
  console.log(`BOQ items:         ${boqCount}`);
  console.log(`Routes:            ${routeCount}`);
  console.log('Submissions:');
  for (const row of subRows as any[]) {
    console.log(`  ${String(row.status).padEnd(15)}: ${row.n}`);
  }
  console.log(`Hakkediş periods:  ${periodCount}`);
  console.log(`Period lines:      ${plineCount}`);
  console.log(`Line submissions:  ${hlsCount}`);
  console.log('-------------------------\n');
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  try {
    await reset();
    await seed();
    await printSummary();
    console.log('Demo seed complete.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

main();
