import fs from 'node:fs';
import pg from 'pg';

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
    const projectRef = process.env.ARCHSCALE_STAGING_PROJECT_REF;
    const apiUrl = process.env.SUPABASE_URL;
    const adminUrl = process.env.SUPABASE_DB_ADMIN_URL;
    if (!projectRef || !apiUrl || !adminUrl) throw new Error('Required staging configuration is missing.');

    const apiHost = new URL(apiUrl).hostname;
    const adminUser = decodeURIComponent(new URL(adminUrl).username);
    if (apiHost !== `${projectRef}.supabase.co` || !adminUser.endsWith(`.${projectRef}`)) {
        throw new Error('Staging project reference does not match configured database endpoints.');
    }

    const client = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
        await client.query('BEGIN TRANSACTION READ ONLY');
        const result = await client.query(`
            SELECT
                to_regclass('public.organisations') IS NOT NULL AS organisations,
                to_regclass('public.roles') IS NOT NULL AS roles,
                to_regclass('public.audit_logs') IS NOT NULL AS audit_logs,
                to_regclass('public.tasks') IS NOT NULL AS tasks,
                to_regclass('public.attendance_records') IS NOT NULL AS attendance_records,
                to_regclass('public.app_catalogue') IS NOT NULL AS app_catalogue,
                to_regclass('public.app_authorization_policies') IS NOT NULL AS app_authorization_policies,
                to_regclass('public.permissions') IS NOT NULL AS permissions_table,
                to_regclass('public.role_permissions') IS NOT NULL AS role_permissions_table,
                to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS migration_history_table
        `);
        const state = result.rows[0];
        const columns = await client.query(`
            SELECT table_name, column_name
              FROM information_schema.columns
             WHERE table_schema = 'public'
               AND (table_name, column_name) IN (
                   ('organisations', 'member_min_aal'),
                   ('memberships', 'department'),
                   ('memberships', 'reporting_manager_membership_id'),
                   ('access_contexts', 'support_grant_id'),
                   ('tasks', 'assigned_to_membership_id'),
                   ('attendance_records', 'membership_id')
               )
        `);
        const functions = await client.query(`
            SELECT proname FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND proname = ANY($1::text[])
        `, [[
            'fn_create_access_context', 'fn_set_app_context', 'fn_read_audit_logs',
            'fn_list_org_members', 'fn_create_invitation', 'fn_app_record_allowed',
            'fn_platform_invite_tenant_admin_with_hash', 'fn_list_platform_support_grants',
            'fn_app_support_context_can_read', 'fn_app_member_label',
            'fn_revoke_user_access_contexts'
        ]]);
        const seeded: Record<string, number | null> = {};
        if (state.roles) {
            const count = await client.query('SELECT count(*)::int AS count FROM public.roles');
            seeded.roles = count.rows[0].count;
        } else seeded.roles = null;
        if (state.permissions_table) {
            const count = await client.query('SELECT count(*)::int AS count FROM public.permissions');
            seeded.permissions = count.rows[0].count;
        } else seeded.permissions = null;
        if (state.app_catalogue) {
            const count = await client.query("SELECT count(*)::int AS count FROM public.app_catalogue WHERE app_key IN ('tasks','attendance')");
            seeded.appModules = count.rows[0].count;
        } else seeded.appModules = null;
        if (state.app_authorization_policies) {
            const count = await client.query('SELECT count(*)::int AS count FROM public.app_authorization_policies');
            seeded.appPolicies = count.rows[0].count;
        } else seeded.appPolicies = null;
        if (state.role_permissions_table) {
            const count = await client.query("SELECT count(*)::int AS count FROM public.role_permissions WHERE permission_key LIKE 'tasks.%' OR permission_key LIKE 'attendance.%'");
            seeded.appRolePermissions = count.rows[0].count;
        } else seeded.appRolePermissions = null;
        let historyCount: number | null = null;
        if (state.migration_history_table) {
            const history = await client.query('SELECT count(*)::int AS count FROM supabase_migrations.schema_migrations');
            historyCount = history.rows[0].count;
        }
        console.log(JSON.stringify({
            projectRef,
            schema: state,
            requiredColumns: columns.rows,
            requiredFunctions: functions.rows.map((row: { proname: string }) => row.proname),
            seeded,
            migrationHistoryCount: historyCount
        }, null, 2));
        await client.query('ROLLBACK');
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`Staging schema preflight failed (${error?.code || error?.name || 'unknown'}).`);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

main().catch(error => {
    console.error(`Staging schema preflight failed (${error?.code || error?.name || 'unknown'}).`);
    process.exitCode = 1;
});
