import fs from 'fs';
import pg from 'pg';

let adminUrl = '';
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  if (line.startsWith('SUPABASE_DB_ADMIN_URL=')) adminUrl = line.split('=')[1].trim();
}

async function main() {
  console.log('Connecting to staging Supabase as admin...');
  const client = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('Applying 019_attendance_self_service.sql...');
  await client.query('BEGIN');
  try {
    const sql = fs.readFileSync('migrations/019_attendance_self_service.sql', 'utf8');
    await client.query(sql);

    // Also ensure all subscriber organisations have attendance and tasks enabled in organisation_entitlements
    console.log('Ensuring all subscriber organisations have attendance & tasks enabled...');
    await client.query(`
      INSERT INTO public.organisation_entitlements (organisation_id, app_key, is_enabled)
      SELECT o.id, a.app_key, true
        FROM public.organisations o
        CROSS JOIN (VALUES ('attendance'), ('tasks')) AS a(app_key)
       WHERE o.portal = 'subscriber'
      ON CONFLICT (organisation_id, app_key) DO UPDATE SET is_enabled = true;
    `);

    await client.query('COMMIT');
    console.log('SUCCESS! Migration 019 and entitlements applied cleanly.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('FAILED to apply migration 019:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
