import { runtimePool } from '../src/db/index.js';

async function check() {
  const client = await runtimePool.connect();
  try {
    const res = await client.query(`
      SELECT role_key, permission_key 
      FROM public.role_permissions 
      WHERE permission_key LIKE 'attendance%'
      ORDER BY role_key, permission_key;
    `);
    console.log('Attendance role permissions in DB:');
    console.table(res.rows);

    const apps = await client.query(`
      SELECT organisation_id, app_key, is_enabled 
      FROM public.organisation_entitlements 
      WHERE app_key = 'attendance';
    `);
    console.log('Attendance entitlements:');
    console.table(apps.rows);
  } finally {
    client.release();
    await runtimePool.end();
  }
}
check();

