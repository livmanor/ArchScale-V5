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
    const f = await client.query(`
      SELECT routine_schema, routine_name 
      FROM information_schema.routines 
      WHERE routine_name LIKE '%random%';
    `);
    console.log('Random routines:', f.rows);
  } finally {
    await client.end();
  }
}
check();
