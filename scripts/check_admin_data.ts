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

    const ent = await client.query(`
      SELECT * FROM public.organisation_entitlements;
    `);
    console.log('Organisation Entitlements:');
    console.table(ent.rows);

    const pols = await client.query(`
      SELECT * FROM public.app_authorization_policies;
    `);
    console.log('App Authorization Policies:');
    console.table(pols.rows);
  } finally {
    await client.end();
  }
}
check();
