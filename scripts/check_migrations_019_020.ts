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
    const f19 = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name = 'fn_attendance_self_access';
    `);
    console.log('019 fn_attendance_self_access exists:', f19.rows.length > 0);

    const f20 = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name = 'fn_approve_membership';
    `);
    console.log('020 fn_approve_membership exists:', f20.rows.length > 0);

    // Check policies on attendance_records
    const p19 = await client.query(`
      SELECT policyname FROM pg_policies WHERE tablename = 'attendance_records';
    `);
    console.log('Policies on attendance_records:', p19.rows.map(r => r.policyname));

  } finally {
    await client.end();
  }
}
check();
