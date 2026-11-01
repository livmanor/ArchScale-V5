import fs from 'fs';
import pg from 'pg';

let adminUrl = '';
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  if (line.startsWith('SUPABASE_DB_ADMIN_URL=')) adminUrl = line.split('=')[1].trim();
}

async function main() {
  console.log('Connecting to staging Supabase...');
  const client = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('Applying 021_platform_rbac_management_functions.sql...');
  await client.query('BEGIN');
  try {
    const sql = fs.readFileSync('migrations/021_platform_rbac_management_functions.sql', 'utf8');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('SUCCESS! Migration 021 applied cleanly.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('FAILED to apply migration 021:', err.message);
    process.exit(1);
  }

  await client.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

