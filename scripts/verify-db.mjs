// One-shot DB verification script for plan 01-02b
// Verifies: PostGIS version, all 11 tables, routes.geom type, seed tenant
// Run: node --env-file=.env.local scripts/verify-db.mjs

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('=== bayrak.ai DB Verification ===\n');

  // 1. PostGIS version
  const pgResult = await sql`SELECT postgis_version() AS version`;
  console.log('PostGIS version:', pgResult[0].version);

  // 2. Tables present
  const tablesResult = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const tables = tablesResult.map(r => r.table_name);
  const expected = [
    'accounts', 'assignments', 'boq_items', 'pending_people', 'people',
    'projects', 'routes', 'sessions', 'tenants', 'users', 'verification_tokens'
  ];
  console.log('\nTables found:', tables.join(', '));
  const missing = expected.filter(t => !tables.includes(t));
  if (missing.length === 0) {
    console.log('All 11 expected tables present: PASS');
  } else {
    console.log('MISSING tables:', missing.join(', '));
  }

  // 3. routes.geom column type
  const geomResult = await sql`
    SELECT udt_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'routes'
      AND column_name = 'geom'
  `;
  console.log('\nroutes.geom column:', geomResult[0]);

  // Check actual geometry type via geometry_columns view
  const geomTypeResult = await sql`
    SELECT type, srid
    FROM geometry_columns
    WHERE f_table_schema = 'public'
      AND f_table_name = 'routes'
      AND f_geometry_column = 'geom'
  `;
  if (geomTypeResult.length > 0) {
    console.log('routes.geom geometry type:', geomTypeResult[0].type, 'SRID:', geomTypeResult[0].srid);
    const typeMatch = geomTypeResult[0].type.toLowerCase().includes('linestring');
    console.log('LineString check:', typeMatch ? 'PASS' : 'FAIL - got ' + geomTypeResult[0].type);
  }

  // 4. Seed tenant count
  const tenantResult = await sql`
    SELECT id, name FROM tenants WHERE id = '00000000-0000-0000-0000-000000000001'
  `;
  console.log('\nSeed tenant:', tenantResult.length === 1 ? 'PRESENT - ' + tenantResult[0].name : 'MISSING');
  const totalTenants = await sql`SELECT COUNT(*) AS cnt FROM tenants`;
  console.log('Total tenants:', totalTenants[0].cnt);

  // 5. GiST index on routes.geom
  const indexResult = await sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'routes'
      AND indexdef ILIKE '%gist%'
  `;
  console.log('\nGiST indexes on routes:', indexResult.map(r => r.indexname).join(', ') || 'NONE');

  console.log('\n=== Verification Complete ===');
}

main().catch(e => { console.error('Verification failed:', e.message); process.exit(1); });
