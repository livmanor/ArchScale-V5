import fs from 'fs';
import pg from 'pg';

let adminUrl = '';
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  if (line.startsWith('SUPABASE_DB_ADMIN_URL=')) adminUrl = line.split('=')[1].trim();
}

async function main() {
  const client = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const org = await client.query(`
    SELECT id, name, portal, status FROM public.organisations WHERE id = '748d319a-e4f6-4a66-897c-b28090a98c57';
  `);
  console.log('Org:', org.rows);

  const inv = await client.query(`
    SELECT id, email, organisation_id, target_role_key, invited_by_membership_id, status FROM public.invitations WHERE organisation_id = '748d319a-e4f6-4a66-897c-b28090a98c57';
  `);
  console.log('Invitations:', inv.rows);

  await client.end();
}

main().catch(console.error);
