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
    const runtimeUrl = process.env.ARCHSCALE_RUNTIME_DB_URL;
    if (!projectRef || !apiUrl || !adminUrl || !runtimeUrl) throw new Error('Required staging configuration is missing.');

    const apiHost = new URL(apiUrl).hostname;
    const adminUser = decodeURIComponent(new URL(adminUrl).username);
    if (apiHost !== `${projectRef}.supabase.co` || !adminUser.endsWith(`.${projectRef}`)) {
        throw new Error('Staging project reference does not match configured database endpoints.');
    }

    const client = new pg.Client({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });
    const runtimeClient = new pg.Client({ connectionString: runtimeUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await runtimeClient.connect();
    try {
        await client.query('BEGIN TRANSACTION READ ONLY');
        const result = await client.query(`
            SELECT
                to_regclass('public.organisations') IS NOT NULL AS organisations,
                to_regclass('public.roles') IS NOT NULL AS roles,
                to_regclass('public.audit_logs') IS NOT NULL AS audit_logs,
                to_regclass('public.tasks') IS NOT NULL AS tasks,
                to_regclass('public.attendance_records') IS NOT NULL AS attendance_records,
                to_regclass('public.app_record_audit') IS NOT NULL AS app_record_audit,
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
                const tableColumns = await client.query(`
                    SELECT table_name, json_agg(json_build_object(
                               'name', column_name,
                               'type', data_type,
                               'udt', udt_name,
                               'nullable', is_nullable
                           ) ORDER BY ordinal_position) AS columns
                            FROM information_schema.columns
                         WHERE table_schema = 'public'
                             AND table_name IN ('tasks', 'attendance_records', 'attendance_comments', 'app_record_audit', 'workspaces', 'memberships')
                         GROUP BY table_name
                         ORDER BY table_name
                `);
                    const constraints = await client.query(`
                        SELECT c.conrelid::regclass::text AS table_name, c.conname AS constraint_name,
                               c.contype AS type, pg_get_constraintdef(c.oid) AS definition
                          FROM pg_constraint c
                         WHERE c.conrelid IN (
                             to_regclass('public.tasks'), to_regclass('public.attendance_records'),
                             to_regclass('public.attendance_comments')
                         )
                         ORDER BY table_name, constraint_name
                    `);
                    const triggers = await client.query(`
                            SELECT event_object_table AS table_name, trigger_name, event_manipulation, action_timing, action_statement
                                FROM information_schema.triggers
                             WHERE trigger_schema = 'public'
                                 AND event_object_table IN ('tasks','attendance_records','attendance_comments')
                             ORDER BY event_object_table, trigger_name
                    `);
                    const dataShape = await client.query(`
                        SELECT
                          (SELECT count(*)::int FROM public.tasks WHERE tenant_id IS NULL) AS tasks_without_tenant,
                          (SELECT count(*)::int FROM public.tasks WHERE assigned_to_membership_id IS NULL) AS tasks_without_assignee,
                          (SELECT count(*)::int FROM public.tasks WHERE created_by_membership_id IS NULL) AS tasks_without_creator,
                                (SELECT count(*)::int FROM public.tasks WHERE reporting_manager_membership_id IS NULL) AS tasks_without_reviewer_candidate,
                          (SELECT count(*)::int FROM public.attendance_records WHERE tenant_id IS NULL) AS attendance_without_tenant,
                          (SELECT count(*)::int FROM public.attendance_records WHERE membership_id IS NULL) AS attendance_without_member,
                                (SELECT count(*)::int FROM public.attendance_comments) AS attendance_comment_count,
                                (SELECT count(*)::int FROM public.tasks t WHERE NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.organisation_id=t.tenant_id AND w.is_active)) AS tasks_without_active_workspace,
                                (SELECT count(*)::int FROM public.attendance_records a WHERE NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.organisation_id=a.tenant_id AND w.is_active)) AS attendance_without_active_workspace
                    `);
                    const appPolicies = await client.query(`
                        SELECT tablename, policyname, cmd, permissive, roles, qual, with_check
                                FROM pg_policies
                             WHERE schemaname = 'public'
                                 AND tablename IN ('tasks','attendance_records','attendance_comments')
                             ORDER BY tablename, policyname
                    `);
                        const privileges = await client.query(`
                            SELECT table_name,
                                has_table_privilege('archscale_app_runtime', 'public.' || table_name, 'SELECT') AS runtime_select,
                                has_table_privilege('archscale_app_runtime', 'public.' || table_name, 'INSERT') AS runtime_insert,
                                has_table_privilege('archscale_app_runtime', 'public.' || table_name, 'UPDATE') AS runtime_update,
                                has_table_privilege('archscale_app_runtime', 'public.' || table_name, 'DELETE') AS runtime_delete,
                                has_table_privilege('anon', 'public.' || table_name, 'SELECT') AS anon_select,
                                has_table_privilege('authenticated', 'public.' || table_name, 'SELECT') AS authenticated_select
                            FROM unnest(ARRAY['tasks','attendance_records','attendance_comments']::text[]) AS table_name
                        `);
                        await runtimeClient.query('BEGIN TRANSACTION READ ONLY');
                        const runtimeCheck = await runtimeClient.query(`
                            SELECT current_user,
                                   has_table_privilege(current_user, 'public.tasks', 'SELECT') AS tasks_select,
                                   has_table_privilege(current_user, 'public.tasks', 'INSERT') AS tasks_insert,
                                   has_table_privilege(current_user, 'public.tasks', 'DELETE') AS tasks_delete,
                                   has_table_privilege(current_user, 'public.attendance_records', 'SELECT') AS attendance_select,
                                   has_table_privilege(current_user, 'public.attendance_records', 'INSERT') AS attendance_insert,
                                   has_table_privilege(current_user, 'public.attendance_comments', 'INSERT') AS comments_insert,
                                   has_function_privilege(current_user, 'public.fn_app_record_allowed(text,text,uuid,text,uuid,uuid,uuid)', 'EXECUTE') AS app_policy_execute,
                                   has_function_privilege(current_user, 'public.fn_revoke_user_access_contexts(uuid)', 'EXECUTE') AS recovery_revoke_execute
                        `);
                        await runtimeClient.query('ROLLBACK');
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
        const rowCounts: Record<string, number | null> = {};
        for (const [label, relation] of [
            ['organisations', 'public.organisations'], ['users', 'public.users'],
            ['authUsers', 'auth.users'], ['memberships', 'public.memberships'],
            ['tasks', 'public.tasks'], ['attendanceRecords', 'public.attendance_records']
        ] as const) {
            const exists = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [relation]);
            if (!exists.rows[0].present) { rowCounts[label] = null; continue; }
            const count = await client.query(`SELECT count(*)::int AS count FROM ${relation}`);
            rowCounts[label] = count.rows[0].count;
        }
        let historyCount: number | null = null;
        if (state.migration_history_table) {
            const history = await client.query('SELECT count(*)::int AS count FROM supabase_migrations.schema_migrations');
            historyCount = history.rows[0].count;
        }
        console.log(JSON.stringify({
            projectRef,
            schema: state,
            requiredColumns: columns.rows,
            tableColumns: tableColumns.rows,
            appConstraints: constraints.rows,
            appTriggers: triggers.rows,
            appDataShape: dataShape.rows[0],
            existingAppPolicies: appPolicies.rows,
            appTablePrivileges: privileges.rows,
            runtimeCheck: runtimeCheck.rows[0],
            requiredFunctions: functions.rows.map((row: { proname: string }) => row.proname),
            seeded,
            rowCounts,
            migrationHistoryCount: historyCount
        }, null, 2));
        await client.query('ROLLBACK');
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`Staging schema preflight failed (${error?.code || error?.name || 'unknown'}).`);
        process.exitCode = 1;
    } finally {
        await client.end();
        await runtimeClient.end();
    }
}

main().catch(error => {
    console.error(`Staging schema preflight failed (${error?.code || error?.name || 'unknown'}).`);
    process.exitCode = 1;
});
