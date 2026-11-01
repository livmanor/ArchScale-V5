import fs from 'fs';
import pg from 'pg';

let adminUrl = '';
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  if (line.startsWith('SUPABASE_DB_ADMIN_URL=')) adminUrl = line.split('=')[1].trim();
}

async function main() {
  const client = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_approve_membership';
  `);
  console.log(res.rows[0]?.def);
  await client.end();
}

main().catch(console.error);
