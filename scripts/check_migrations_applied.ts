import { runtimePool } from '../src/db/index.js';

async function check() {
  const client = await runtimePool.connect();
  try {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE '%migrat%';
    `);
    console.log('Migration tables:', res.rows);

    const f = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name = 'fn_attendance_self_access';
    `);
    console.log('fn_attendance_self_access exists?', f.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    await runtimePool.end();
  }
}
check();
