/**
 * DEV-ONLY: mint an Auth.js database session for the first allowlisted user
 * so we can curl authenticated dashboard pages locally. Prints the cookie.
 * Not for production. Run: node_modules/.bin/tsx scripts/dev-mint-session.ts
 */
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: '.env.local' });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');
  const sql = neon(url);

  const allow = (process.env.AUTH_ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean);
  const email = allow[0] ?? 'dev@bayrak.ai';

  const rows = await sql`SELECT id, email FROM users WHERE lower(email) = lower(${email}) LIMIT 1`;
  let userId: string;
  if (rows.length) {
    userId = String(rows[0].id);
  } else {
    const ins = await sql`INSERT INTO users (id, name, email, email_verified) VALUES (gen_random_uuid(), 'Dev User', ${email}, now()) RETURNING id`;
    userId = String(ins[0].id);
  }

  const token = `dev-${crypto.randomUUID()}`;
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
  await sql`INSERT INTO sessions (session_token, user_id, expires) VALUES (${token}, ${userId}, ${expires})`;

  console.log('USERID=' + userId);
  console.log('EMAIL=' + email);
  console.log('COOKIE=authjs.session-token=' + token);
}

main().catch((e) => { console.error(e); process.exit(1); });
