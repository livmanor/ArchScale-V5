import fs from 'fs';
import pg from 'pg';

let adminUrl = process.env.SUPABASE_DB_ADMIN_URL;
if (!adminUrl && fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (line.startsWith('SUPABASE_DB_ADMIN_URL=')) {
      adminUrl = line.split('=')[1].trim();
    }
  }
}

async function main() {
  const client = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Testing migration 015 in a ROLLBACK transaction on staging...');
  await client.query('BEGIN');
  try {
    const sql = fs.readFileSync('migrations/015_invitations_refinements_and_security_hardening.sql', 'utf8');
    await client.query(sql);
    console.log('Migration 015 executed successfully in test transaction!');
  } catch (err: any) {
    console.error('Migration 015 failed:', err.message);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

