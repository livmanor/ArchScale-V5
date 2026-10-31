import fs from 'node:fs';
import pg from 'pg';

const EXPECTED_PROJECT_REF = 'avntrnedrhysiqdkmdwc';

for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(index + 1).trim();
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    if (!dryRun && !process.argv.includes('--confirm-staging')) throw new Error('Refusing to modify staging without --confirm-staging.');
    if (process.env.ARCHSCALE_ENV !== 'staging' || process.env.ARCHSCALE_STAGING_PROJECT_REF !== EXPECTED_PROJECT_REF) {
        throw new Error('Configured staging project does not match the expected target.');
    }
    const adminUrl = process.env.SUPABASE_DB_ADMIN_URL;
    if (!adminUrl) throw new Error('Staging database configuration is missing.');
    const adminUser = decodeURIComponent(new URL(adminUrl).username);
    if (!adminUser.endsWith(`.${EXPECTED_PROJECT_REF}`)) throw new Error('Database endpoint project does not match expected target.');

    const fixturePath = '.local/test-users.json';
    if (!fs.existsSync(fixturePath)) throw new Error('Local test fixture file is missing.');
    const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Record<string, { id?: string; email?: string }>;
    const leaderFixture = fixtures.leader;
    const internFixture = fixtures.intern;
    if (!leaderFixture?.id || !internFixture?.id ||
        !leaderFixture.email?.startsWith('TEST-leader-') || !internFixture.email?.startsWith('TEST-intern-')) {
        throw new Error('Expected TEST leader and intern fixture accounts were not found.');
    }

    const client = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
    await client.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`
            SELECT
                leader.id AS leader_membership_id,
                leader.organisation_id AS leader_organisation_id,
                leader.status AS leader_status,
                intern.id AS intern_membership_id,
                intern.organisation_id AS intern_organisation_id,
                intern.status AS intern_status,
                intern.expires_at AS intern_expires_at,
                (SELECT count(*)::int FROM public.tasks t
                  WHERE (t.assigned_to_membership_id = intern.id OR t.created_by_membership_id = intern.id)
                    AND t.organisation_id <> leader.organisation_id) AS cross_tenant_tasks,
                (SELECT count(*)::int FROM public.attendance_records a
                  WHERE a.membership_id = intern.id AND a.organisation_id <> leader.organisation_id) AS cross_tenant_attendance,
                (SELECT count(*)::int FROM public.membership_seats ms
                  WHERE ms.membership_id = intern.id) AS intern_seat_count,
                EXISTS (SELECT 1 FROM public.app_catalogue WHERE app_key='tasks' AND is_active) AS tasks_app_active,
                EXISTS (SELECT 1 FROM public.app_catalogue WHERE app_key='attendance' AND is_active) AS attendance_app_active
            FROM public.memberships leader
            JOIN public.memberships intern ON intern.user_id = $2::uuid
            WHERE leader.user_id = $1::uuid
              AND leader.role_key = 'leader'
              AND intern.role_key = 'intern'
              AND (SELECT count(*) FROM public.memberships WHERE user_id = $1::uuid AND role_key='leader' AND status='ACTIVE') = 1
              AND (SELECT count(*) FROM public.memberships WHERE user_id = $2::uuid AND role_key='intern' AND status='ACTIVE') = 1
            LIMIT 1
        `, [leaderFixture.id, internFixture.id]);
        const pair = result.rows[0];
        if (!pair || pair.leader_status !== 'ACTIVE' || pair.intern_status !== 'ACTIVE') {
            throw new Error('Exactly one active leader and intern fixture membership is required.');
        }
        if (pair.intern_organisation_id === pair.leader_organisation_id) {
            console.log('Fixture memberships are already in the same tenant; no relationship repair needed.');
        }
        if (pair.cross_tenant_tasks || pair.cross_tenant_attendance || pair.intern_seat_count) {
            throw new Error('Repair would affect existing task, attendance, or seat references; manual review required.');
        }
        if (!pair.tasks_app_active || !pair.attendance_app_active) {
            throw new Error('Tasks and Attendance apps must be active in the app catalogue before repair.');
        }
        const workspace = await client.query(`
            SELECT id FROM public.workspaces
             WHERE organisation_id = $1::uuid AND is_active
             ORDER BY is_default DESC, created_at, id LIMIT 1
        `, [pair.leader_organisation_id]);
        if (!workspace.rowCount) throw new Error('Leader tenant has no active workspace.');

        await client.query(`
            UPDATE public.memberships
               SET department='Design', job_role='Design Manager', updated_at=now()
             WHERE id=$1::uuid
        `, [pair.leader_membership_id]);
        await client.query(`
            UPDATE public.memberships
               SET organisation_id=$2::uuid, department='Design', job_role='Junior Designer',
                   reporting_manager_membership_id=$3::uuid, updated_at=now()
             WHERE id=$1::uuid
        `, [pair.intern_membership_id, pair.leader_organisation_id, pair.leader_membership_id]);
        await client.query(`
            INSERT INTO public.organisation_entitlements (organisation_id, app_key, is_enabled)
            VALUES ($1::uuid, 'tasks', true), ($1::uuid, 'attendance', true)
            ON CONFLICT (organisation_id, app_key) DO UPDATE SET is_enabled=true
        `, [pair.leader_organisation_id]);
        await client.query(`
            UPDATE public.access_contexts SET revoked_at=COALESCE(revoked_at, now())
             WHERE user_id IN ($1::uuid, $2::uuid) AND revoked_at IS NULL
        `, [leaderFixture.id, internFixture.id]);

        const verify = await client.query(`
            SELECT leader.department AS leader_department,
                   intern.department AS intern_department,
                   intern.reporting_manager_membership_id = leader.id AS is_direct_report,
                   intern.organisation_id = leader.organisation_id AS same_tenant,
                   (SELECT count(*)::int FROM public.organisation_entitlements e
                     WHERE e.organisation_id=leader.organisation_id AND e.app_key IN ('tasks','attendance') AND e.is_enabled) AS enabled_apps
              FROM public.memberships leader
              JOIN public.memberships intern ON intern.id=$2::uuid
             WHERE leader.id=$1::uuid
        `, [pair.leader_membership_id, pair.intern_membership_id]);
        const verified = verify.rows[0];
        if (verified.leader_department !== 'Design' || verified.intern_department !== 'Design' ||
            !verified.is_direct_report || !verified.same_tenant || Number(verified.enabled_apps) !== 2) {
            throw new Error('Post-update hierarchy verification failed.');
        }

        if (dryRun) {
            await client.query('ROLLBACK');
            console.log('STAGING_FIXTURE_REPAIR_DRY_RUN_PASSED; transaction rolled back; no changes persisted.');
        } else {
            await client.query('COMMIT');
            console.log('STAGING_FIXTURE_REPAIR_SUCCEEDED');
        }
        console.log(JSON.stringify({ leaderMembershipId: pair.leader_membership_id, internMembershipId: pair.intern_membership_id,
            tenantChanged: pair.intern_organisation_id !== pair.leader_organisation_id,
            departments: [verified.leader_department, verified.intern_department],
            internIsDirectReport: verified.is_direct_report, enabledApps: verified.enabled_apps,
            affectedOldContextsRevoked: true }, null, 2));
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`STAGING_FIXTURE_REPAIR_ROLLED_BACK (${error?.code || error?.name || 'unknown'}).`);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

main().catch(error => {
    console.error(`STAGING_FIXTURE_REPAIR_ABORTED (${error?.code || error?.name || 'unknown'}).`);
    process.exitCode = 1;
});
