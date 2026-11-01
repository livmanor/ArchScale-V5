import { runtimePool } from '../src/db/index.js';

async function check() {
  const client = await runtimePool.connect();
  try {
    const res = await client.query(`
      SELECT * FROM public.organisation_entitlements;
    `);
    console.log('All organisation_entitlements:');
    console.table(res.rows);

    const apps = await client.query(`
      SELECT * FROM public.app_catalogue;
    `);
    console.log('App catalogue:');
    console.table(apps.rows);
  } finally {
    client.release();
    await runtimePool.end();
  }
}
check();
