import fs from 'fs';
import pg from 'pg';

let adminUrl = '';
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  if (line.startsWith('SUPABASE_DB_ADMIN_URL=')) adminUrl = line.split('=')[1].trim();
}

async function main() {
  const client = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const orgs = await client.query(`SELECT id, name, portal, status FROM public.organisations ORDER BY created_at DESC LIMIT 5;`);
  console.log('Latest 5 Organisations:');
  console.table(orgs.rows);

  const workspaces = await client.query(`SELECT id, organisation_id, name, is_default, is_active FROM public.workspaces ORDER BY created_at DESC LIMIT 5;`);
  console.log('Latest 5 Workspaces:');
  console.table(workspaces.rows);

  const memberships = await client.query(`SELECT id, user_id, organisation_id, role_key, status FROM public.memberships ORDER BY created_at DESC LIMIT 5;`);
  console.log('Latest 5 Memberships:');
  console.table(memberships.rows);

  const invs = await client.query(`SELECT id, email, organisation_id, target_role_key, status, invited_by_membership_id FROM public.invitations ORDER BY created_at DESC LIMIT 5;`);
  console.log('Latest 5 Invitations:');
  console.table(invs.rows);

  await client.end();
}

main().catch(console.error);

