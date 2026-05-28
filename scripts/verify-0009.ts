import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env.local'), override: false });

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const t = await sql`SELECT table_name FROM information_schema.tables WHERE table_name='hakedis_line_submissions'`;
  const u = await sql`SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='hakedis_period_lines' AND constraint_name='hakedis_period_lines_period_boq_unique'`;
  const fks = await sql`SELECT conname FROM pg_constraint WHERE conrelid = 'hakedis_line_submissions'::regclass AND contype='f' ORDER BY conname`;
  const pk = await sql`SELECT conname FROM pg_constraint WHERE conrelid = 'hakedis_line_submissions'::regclass AND contype='p'`;
  const idx = await sql`SELECT indexname FROM pg_indexes WHERE tablename='hakedis_line_submissions' AND indexname='hakedis_line_submissions_submission_idx'`;
  if (t.length !== 1 || u.length !== 1 || fks.length !== 3 || pk.length !== 1 || idx.length !== 1) {
    console.error('MISSING', { tables: t, unique: u, fks, pk, idx });
    process.exit(1);
  }
  console.log('OK');
  console.log('  table:', (t[0] as any).table_name);
  console.log('  pk:', (pk[0] as any).conname);
  console.log('  fks:', fks.map((r: any) => r.conname).join(', '));
  console.log('  idx:', (idx[0] as any).indexname);
  console.log('  parent unique:', (u[0] as any).constraint_name);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
