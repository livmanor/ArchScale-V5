import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const expectedProjectRef = 'avntrnedrhysiqdkmdwc';

if (fs.existsSync('.env')) {
    for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const index = trimmed.indexOf('=');
        if (index < 1) continue;
        const key = trimmed.slice(0, index).trim();
        if (!process.env[key]) process.env[key] = trimmed.slice(index + 1).trim();
    }
}

async function main() {
    if (process.env.ARCHSCALE_ENV !== 'staging' || process.env.ARCHSCALE_STAGING_PROJECT_REF !== expectedProjectRef) {
        throw new Error('Staging mode or target project ref does not match the approved target.');
    }
    const adminUrl = process.env.SUPABASE_DB_ADMIN_URL;
    if (!adminUrl) throw new Error('Staging admin database URL is missing.');
    const adminUser = decodeURIComponent(new URL(adminUrl).username);
    if (!adminUser.endsWith(`.${expectedProjectRef}`)) {
        throw new Error('Admin database endpoint does not match the approved target.');
    }

    const files = [
        ['migration', '016_tasks_attendance_modules.sql'],
        ['migration', '017_platform_workflows.sql'],
        ['migration', '018_recovery_context_revocation.sql'],
        ['seed', '003_app_module_permissions.sql']
    ] as const;
    const client = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
    await client.connect();
    let inTransaction = false;
    try {
        await client.query('BEGIN');
        inTransaction = true;
        const before = await client.query(`
            SELECT
              (SELECT count(*)::int FROM public.tasks) AS tasks,
              (SELECT count(*)::int FROM public.attendance_records) AS attendance_records,
              (SELECT count(*)::int FROM public.attendance_comments) AS attendance_comments
        `);
        for (const [directory, file] of files) {
            const fullPath = path.resolve(here, '..', directory === 'migration' ? 'migrations' : 'seeds', file);
            try {
                await client.query(fs.readFileSync(fullPath, 'utf8'));
            } catch (error: any) {
                console.error(`FAILED_FILE=${file}; SQLSTATE=${error?.code || 'unknown'}; ERROR=${error?.message || 'unknown'}`);
                throw error;
            }
            console.log(`Applied: ${file}`);
        }

        const functions = await client.query(`
            SELECT count(DISTINCT proname)::int AS count FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND proname = ANY($1::text[])
        `, [[
            'fn_app_record_allowed', 'fn_app_support_context_can_read', 'fn_app_member_label',
            'fn_platform_invite_tenant_admin_with_hash', 'fn_platform_list_organisations',
            'fn_platform_get_organisation', 'fn_list_platform_support_grants',
            'fn_revoke_user_access_contexts'
        ]]);
        const after = await client.query(`
            SELECT
              (SELECT count(*)::int FROM public.tasks) AS tasks,
              (SELECT count(*)::int FROM public.attendance_records) AS attendance_records,
              (SELECT count(*)::int FROM public.attendance_comments) AS attendance_comments,
              (SELECT count(*)::int FROM public.app_catalogue WHERE app_key IN ('tasks','attendance') AND is_active) AS apps,
              (SELECT count(*)::int FROM public.app_authorization_policies) AS policies,
              (SELECT count(*)::int FROM public.role_permissions WHERE permission_key LIKE 'tasks.%' OR permission_key LIKE 'attendance.%') AS app_permissions
        `);
        const existing = after.rows[0];
        const initial = before.rows[0];
        if (functions.rows[0].count !== 8 || existing.apps !== 2 || existing.policies < 1 || existing.app_permissions < 1 ||
            existing.tasks !== initial.tasks || existing.attendance_records !== initial.attendance_records || existing.attendance_comments !== initial.attendance_comments) {
            throw new Error('Post-apply verification failed; transaction will roll back.');
        }

        await client.query('COMMIT');
        inTransaction = false;
        console.log('APPLY_SUCCEEDED');
        console.log(JSON.stringify({ preservedRows: initial, installedFunctions: functions.rows[0].count, installedModuleData: {
            apps: existing.apps, policies: existing.policies, appPermissions: existing.app_permissions
        } }, null, 2));
    } catch (error: any) {
        if (inTransaction) await client.query('ROLLBACK').catch(() => {});
        console.error(`APPLY_FAILED (${error?.code || error?.name || 'unknown'}); transaction rolled back.`);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

main().catch(error => {
    console.error(`APPLY_ABORTED (${error?.code || error?.name || 'unknown'}).`);
    process.exitCode = 1;
});
