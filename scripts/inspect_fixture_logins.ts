import fs from 'node:fs';
import pg from 'pg';

for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(index + 1).trim();
}

async function main() {
    const adminUrl = process.env.SUPABASE_DB_ADMIN_URL;
    const fixturePath = '.local/test-users.json';
    if (!adminUrl || !fs.existsSync(fixturePath)) throw new Error('Staging DB or local fixture file is not configured.');
    const fixtureUsers = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Record<string, { email: string; totpSecret?: string }>;
    const client = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
        await client.query('BEGIN TRANSACTION READ ONLY');
        const results = [];
        for (const [key, user] of Object.entries(fixtureUsers)) {
            const result = await client.query(`
                SELECT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower($1)) AS exists_in_auth,
                       COALESCE(json_agg(json_build_object(
                           'role', m.role_key,
                           'organisation', o.name,
                           'department', m.department,
                           'jobRole', m.job_role,
                           'reportsToRole', manager.role_key,
                           'reportsToDepartment', manager.department
                       )) FILTER (WHERE m.status = 'ACTIVE' AND o.status = 'ACTIVE'), '[]'::json) AS active_memberships
                  FROM public.users u
                  LEFT JOIN public.memberships m ON m.user_id = u.id
                  LEFT JOIN public.organisations o ON o.id = m.organisation_id
                  LEFT JOIN public.memberships manager ON manager.id = m.reporting_manager_membership_id
                 WHERE lower(u.email) = lower($1)
            `, [user.email]);
            results.push({
                key,
                email: user.email,
                existsInAuth: result.rows[0].exists_in_auth,
                activeMemberships: result.rows[0].active_memberships,
                mfaEnrolled: Boolean(user.totpSecret)
            });
        }
        await client.query('ROLLBACK');
        console.log(JSON.stringify(results, null, 2));
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`Fixture lookup failed (${error?.code || error?.name || 'unknown'}).`);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

main().catch(error => {
    console.error(`Fixture lookup aborted (${error?.code || error?.name || 'unknown'}).`);
    process.exitCode = 1;
});
