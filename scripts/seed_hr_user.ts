import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

let env: Record<string, string> = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const idx = line.indexOf('=');
  if (idx > 0 && !line.startsWith('#')) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

async function main() {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const adminDbUrl = env.SUPABASE_DB_ADMIN_URL;
  const fixturePath = '.local/test-users.json';

  const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const studioOrgId = fixtures.business_owner.orgId;
  const studioWsId = fixtures.business_owner.workspaceId;

  console.log('Connecting to Supabase Admin API and DB...');
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const pgAdmin = new pg.Client({ connectionString: adminDbUrl, ssl: { rejectUnauthorized: false } });
  await pgAdmin.connect();

  const hrEmail = 'TEST-hr-1793191468865@archscale.test';
  const hrPassword = 'P@ss-hr-manager-2026-A1!';

  console.log(`Checking if HR user ${hrEmail} exists in Supabase Auth...`);
  // Check if exists in auth.users
  const existingUserRes = await pgAdmin.query('SELECT id FROM auth.users WHERE lower(email) = lower($1)', [hrEmail]);
  let userId: string;

  if (existingUserRes.rows.length > 0) {
    userId = existingUserRes.rows[0].id;
    console.log(`Existing user found in auth: ${userId}, resetting password...`);
    await supabaseAdmin.auth.admin.updateUserById(userId, { password: hrPassword, email_confirm: true });
  } else {
    console.log('Creating user in Supabase Auth...');
    const createRes = await supabaseAdmin.auth.admin.createUser({
      email: hrEmail,
      password: hrPassword,
      email_confirm: true
    });
    if (createRes.error || !createRes.data.user) {
      throw new Error(`Failed to create HR user: ${createRes.error?.message}`);
    }
    userId = createRes.data.user.id;
    console.log(`Created Supabase Auth user: ${userId}`);
  }

  // Ensure mirror in public.users
  const mirrorRes = await pgAdmin.query('SELECT fn_upsert_user_mirror($1::uuid, $2::text)', [userId, hrEmail]);
  const userCode = mirrorRes.rows[0]?.fn_upsert_user_mirror;
  console.log(`User mirror code: ${userCode}`);

  // Create or update membership in Studio Architecture as manager_coordinator in HR
  const membershipCheck = await pgAdmin.query(
    'SELECT id FROM public.memberships WHERE user_id = $1 AND organisation_id = $2',
    [userId, studioOrgId]
  );

  let membershipId: string;
  if (membershipCheck.rows.length > 0) {
    membershipId = membershipCheck.rows[0].id;
    await pgAdmin.query(`
      UPDATE public.memberships
         SET role_key = 'manager_coordinator',
             department = 'HR',
             job_role = 'HR Manager',
             status = 'ACTIVE'
       WHERE id = $1
    `, [membershipId]);
    console.log(`Updated membership ${membershipId} to manager_coordinator (HR)`);
  } else {
    const memInsert = await pgAdmin.query(`
      INSERT INTO public.memberships (user_id, organisation_id, role_key, department, job_role, status)
      VALUES ($1, $2, 'manager_coordinator', 'HR', 'HR Manager', 'ACTIVE')
      RETURNING id;
    `, [userId, studioOrgId]);
    membershipId = memInsert.rows[0].id;
    console.log(`Created membership ${membershipId} as manager_coordinator (HR)`);
  }

  // Update .local/test-users.json
  fixtures.hr_manager = {
    id: userId,
    email: hrEmail,
    userCode,
    password: hrPassword,
    role: 'manager_coordinator',
    department: 'HR',
    jobRole: 'HR Manager',
    orgId: studioOrgId,
    workspaceId: studioWsId,
    totpSecret: null
  };

  fs.writeFileSync(fixturePath, JSON.stringify(fixtures, null, 2), 'utf8');
  console.log(`Updated ${fixturePath} with hr_manager fixture!`);

  await pgAdmin.end();
}

main().catch(err => {
  console.error('Error seeding HR user:', err);
  process.exit(1);
});

