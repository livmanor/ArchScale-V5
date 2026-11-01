import { runtimePool } from '../src/db/index.js';

async function check() {
  const client = await runtimePool.connect();
  try {
    const orgs = await client.query(`
      SELECT id, name, portal, status, tenant_type_key FROM public.organisations;
    `);
    console.log('Organisations:');
    console.table(orgs.rows);

    const mems = await client.query(`
      SELECT m.id, m.organisation_id, o.name AS org_name, m.role_key, m.department, m.job_role, m.status, u.email
      FROM public.memberships m
      JOIN public.organisations o ON o.id = m.organisation_id
      LEFT JOIN public.users u ON u.id = m.user_id;
    `);
    console.log('Memberships:');
    console.table(mems.rows);
  } finally {
    client.release();
    await runtimePool.end();
  }
}
check();

