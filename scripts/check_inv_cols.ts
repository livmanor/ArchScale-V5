import fs from 'fs';
import pg from 'pg';

let adminUrl = '';
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (line.startsWith('SUPABASE_DB_ADMIN_URL=')) {
      adminUrl = line.split('=')[1].trim();
    }
  }
}

async function main() {
  console.log('Connecting to:', new URL(adminUrl).host, 'user:', new URL(adminUrl).username);
  const client = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invitations'
    ORDER BY ordinal_position;
  `);
  console.log('Total columns in public.invitations:', cols.rows.length);
  console.log('Columns:', cols.rows.map(r => r.column_name));
  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
