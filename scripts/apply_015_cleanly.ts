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

  console.log('Applying 015_invitations_refinements_and_security_hardening.sql...');
  await client.query('BEGIN');
  try {
    const sql = fs.readFileSync('migrations/015_invitations_refinements_and_security_hardening.sql', 'utf8');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('SUCCESS! Migration 015 applied and committed cleanly.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('FAILED to apply migration 015:', err.message);
    process.exit(1);
  }

  // Verify columns
  const check = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invitations'
    ORDER BY ordinal_position;
  `);
  console.log('Invitations columns count:', check.rows.length);
  console.log('Columns:', check.rows.map(r => r.column_name));

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

