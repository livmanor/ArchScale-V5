import { runtimePool } from '../src/db/index.js';

async function check() {
  const client = await runtimePool.connect();
  try {
    const res = await client.query(`
      SELECT * FROM public.app_authorization_policies;
    `);
    console.log('App authorization policies:');
    console.table(res.rows);

    const apps = await client.query(`
      SELECT * FROM public.ecosystem_apps;
    `);
    console.log('Ecosystem apps:');
    console.table(apps.rows);

    const orgs = await client.query(`
      SELECT id, name, status, organisation_type FROM public.organisations;
    `);
    console.log('Organisations:');
    console.table(orgs.rows);
  } finally {
    client.release();
    await runtimePool.end();
  }
}
check();
