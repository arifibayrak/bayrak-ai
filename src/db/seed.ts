import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { tenants } from './schema/tenants';

// Fixed seed tenant UUID — hardcoded per RESEARCH.md Open Questions (RESOLVED) #2.
// This UUID becomes BAYRAK_TENANT_ID in .env.local.
// All domain table inserts reference this ID via getDefaultTenantId().
const SEED_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function seed() {
  // Idempotent: insert the default tenant row; ignore if it already exists.
  await db.insert(tenants).values({
    id: SEED_TENANT_ID,
    name: 'Bayrak AI (Default Tenant)',
  }).onConflictDoNothing();

  console.log(`Seed complete — default tenant: ${SEED_TENANT_ID}`);
}

seed().catch(console.error);
