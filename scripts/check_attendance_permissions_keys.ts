import { runtimePool } from '../src/db/index.js';

async function check() {
  const client = await runtimePool.connect();
  try {
    const res = await client.query(`
      SELECT key, name, description FROM public.permissions WHERE key LIKE 'attendance%' ORDER BY key;
    `);
    console.log('Attendance permissions in DB:');
    console.table(res.rows);
  } finally {
    client.release();
    await runtimePool.end();
  }
}
check();

