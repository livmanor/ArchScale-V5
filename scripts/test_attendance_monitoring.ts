import fs from 'fs';
import { runtimePool } from '../src/db/index.js';
import pg from 'pg';

let env: Record<string, string> = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const idx = line.indexOf('=');
  if (idx > 0 && !line.startsWith('#')) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

const fixtures = JSON.parse(fs.readFileSync('.local/test-users.json', 'utf8'));

async function testRoleAttendance(personaKey: string) {
  const user = fixtures[personaKey];
  const client = new pg.Client({ connectionString: env.SUPABASE_DB_ADMIN_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log(`\n========================================`);
  console.log(`Testing attendance for ${personaKey} (${user.email})...`);

  // Find membership
  const memRes = await client.query(
    'SELECT id, organisation_id, role_key, department FROM public.memberships WHERE user_id = $1 AND status = $2 LIMIT 1',
    [user.id, 'ACTIVE']
  );
  if (!memRes.rows.length) {
    console.error(`No active membership found for ${personaKey}`);
    await client.end();
    return;
  }

  const membership = memRes.rows[0];
  const wsRes = await client.query('SELECT id FROM public.workspaces WHERE organisation_id = $1 LIMIT 1', [membership.organisation_id]);
  const workspaceId = wsRes.rows[0].id;

  // Create context
  const ctxRes = await client.query(`
    INSERT INTO public.access_contexts (principal_user_id, membership_id, organisation_id, workspace_id, role_key, auth_assurance_level, expires_at)
    VALUES ($1, $2, $3, $4, $5, 'aal1', now() + interval '1 hour')
    RETURNING id;
  `, [user.id, membership.id, membership.organisation_id, workspaceId, membership.role_key]);
  const contextId = ctxRes.rows[0].id;
  await client.end();

  // Now connect via runtime pool and query as runtime
  const rClient = await runtimePool.connect();
  try {
    await rClient.query('BEGIN');
    await rClient.query('SELECT public.fn_set_app_context($1::uuid)', [contextId]);
    const res = await rClient.query(`
      SELECT r.attendance_id, r.membership_id, r.status, r.check_in, r.check_out, r.department
        FROM public.attendance_records r
    `);
    console.log(`Query SUCCESS! Visible record count for ${personaKey}: ${res.rows.length}`);
    for (const row of res.rows) {
      const isOwn = row.membership_id === membership.id;
      console.log(`  - Record ${row.attendance_id} (dept: ${row.department}, status: ${row.status}) [${isOwn ? 'OWN RECORD' : 'OTHER EMPLOYEE'}]`);
    }
    await rClient.query('COMMIT');
  } catch (err: any) {
    await rClient.query('ROLLBACK');
    console.error(`Query FAILED for ${personaKey}:`, err.message);
  } finally {
    rClient.release();
  }
}

async function run() {
  await testRoleAttendance('intern');
  await testRoleAttendance('business_owner');
  await testRoleAttendance('hr_manager');
  await runtimePool.end();
}

run().catch(console.error);
