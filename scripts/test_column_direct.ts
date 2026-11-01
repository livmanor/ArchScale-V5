import fs from 'fs';
import pg from 'pg';

let adminUrl = '';
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  if (line.startsWith('SUPABASE_DB_ADMIN_URL=')) adminUrl = line.split('=')[1].trim();
}

async function run() {
  const client = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('Running: ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ;');
  try {
    const res = await client.query('ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ;');
    console.log('Result:', res);
  } catch (err: any) {
    console.error('FAILED:', err);
  }

  const check = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'invitations' AND table_schema = 'public';");
  console.log('Columns after alter:', check.rows.map(r => r.column_name));

  await client.end();
}

run();
