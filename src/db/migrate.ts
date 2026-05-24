import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import path from 'path';

// Load .env.local so the runner has DATABASE_URL when invoked directly via
// `tsx src/db/migrate.ts` (Next.js auto-loads .env.local, but a bare tsx run
// does not). override: false lets an explicitly-exported DATABASE_URL (e.g. the
// test-DB setup script targeting neondb_test) take precedence over .env.local.
config({ path: path.resolve(process.cwd(), '.env.local'), override: false });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function main() {
  // Step 1: Enable PostGIS before any Drizzle migrations run (D-10, Pitfall 6)
  // 0000_enable_postgis.sql must execute first so geometry columns can be created.
  const postgisSql = readFileSync(
    path.join(process.cwd(), 'src/db/migrations/0000_enable_postgis.sql'),
    'utf-8'
  );
  // neon-http `sql` is a tagged-template fn; use `.query()` to run a raw SQL string.
  await sql.query(postgisSql);

  // Step 2: Run Drizzle-generated migrations
  await migrate(db, { migrationsFolder: 'src/db/migrations' });
  console.log('Migrations complete');
}

main().catch(console.error);
