import fs from 'fs';
import pg from 'pg';

let adminUrl = '';
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  if (line.startsWith('SUPABASE_DB_ADMIN_URL=')) adminUrl = line.split('=')[1].trim();
}

async function check() {
  const client = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tasks'
      ORDER BY ordinal_position;
    `);
    console.log('Columns of tasks:');
    console.table(cols.rows);
  } finally {
    await client.end();
  }
}
check();

