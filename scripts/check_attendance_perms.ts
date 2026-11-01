import { runtimePool } from '../src/db/index.js';

async function check() {
  const client = await runtimePool.connect();
  try {
    const res = await client.query(`
      SELECT grantee, privilege_type 
      FROM information_schema.role_table_grants 
      WHERE table_name = 'attendance_records';
    `);
    console.log('Grants on attendance_records:', res.rows);

    const pol = await client.query(`
      SELECT policyname, permissive, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE tablename = 'attendance_records';
    `);
    console.log('Policies on attendance_records:', pol.rows);

    const rls = await client.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity 
      FROM pg_class 
      WHERE relname = 'attendance_records';
    `);
    console.log('RLS on attendance_records:', rls.rows);

    const u = await client.query(`SELECT current_user, session_user;`);
    console.log('Current user:', u.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    await runtimePool.end();
  }
}
check();
