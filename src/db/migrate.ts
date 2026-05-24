import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import path from 'path';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function main() {
  // Step 1: Enable PostGIS before any Drizzle migrations run (D-10, Pitfall 6)
  // 0000_enable_postgis.sql must execute first so geometry columns can be created.
  const postgisSql = readFileSync(
    path.join(process.cwd(), 'src/db/migrations/0000_enable_postgis.sql'),
    'utf-8'
  );
  await sql(postgisSql);

  // Step 2: Run Drizzle-generated migrations
  await migrate(db, { migrationsFolder: 'src/db/migrations' });
  console.log('Migrations complete');
}

main().catch(console.error);
