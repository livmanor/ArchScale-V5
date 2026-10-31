import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { fileURLToPath } from 'url';

// Load .env natively without logging secrets
if (fs.existsSync('.env')) {
    const lines = fs.readFileSync('.env', 'utf-8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const idx = trimmed.indexOf('=');
            if (idx !== -1) {
                const k = trimmed.substring(0, idx).trim();
                const v = trimmed.substring(idx + 1).trim();
                if (!process.env[k]) process.env[k] = v;
            }
        }
    }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function generateStrongPassword(): string {
    return 'P@ss-' + crypto.randomBytes(12).toString('hex') + '-A1!';
}

async function main() {
    const args = process.argv.slice(2);
    if (!args.includes('--confirm-staging')) {
        console.error('ABORTED: Refusing to run without --confirm-staging flag.');
        process.exit(1);
    }

    const projectRef = process.env.ARCHSCALE_STAGING_PROJECT_REF;
    if (!projectRef) {
        console.error('ABORTED: ARCHSCALE_STAGING_PROJECT_REF missing');
        process.exit(1);
    }
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminDbUrl = process.env.SUPABASE_DB_ADMIN_URL;

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !adminDbUrl) {
        console.error('ABORTED: Missing required Supabase credentials in .env');
        process.exit(1);
    }

    console.log(`[Staging Seed] Project Ref: ${projectRef}`);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const pgAdmin = new pg.Client({
        connectionString: adminDbUrl,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000
    });
    await pgAdmin.connect();

    const timestamp = Date.now();
    const testUsersData: Record<string, any> = {};

    try {
        console.log('[1/5] Setting up test tenant organisations...');
        // 1. Studio Owner Org for business_owner
        const studioOrgRes = await pgAdmin.query(`
            INSERT INTO public.organisations (name, portal, tenant_type_key, status)
            VALUES ('TEST-Studio Architecture ' || $1, 'subscriber', 'studio_owner', 'ACTIVE')
            RETURNING id;
        `, [timestamp]);
        const studioOrgId = studioOrgRes.rows[0].id;

        const studioWsRes = await pgAdmin.query(`
            INSERT INTO public.workspaces (organisation_id, name, is_active)
            VALUES ($1, 'Studio Main WS', true)
            RETURNING id;
        `, [studioOrgId]);
        const studioWsId = studioWsRes.rows[0].id;

        // Ensure fixture tenants can use the persisted app modules.
        await pgAdmin.query(`
            INSERT INTO public.app_catalogue (app_key, name)
            VALUES ('core_billing', 'Core Billing')
            ON CONFLICT (app_key) DO NOTHING;
        `);
        await pgAdmin.query(`
            INSERT INTO public.organisation_entitlements (organisation_id, app_key, is_enabled)
            SELECT $1, app_key, true
              FROM public.app_catalogue
             WHERE app_key IN ('core_billing', 'tasks', 'attendance')
            ON CONFLICT (organisation_id, app_key) DO UPDATE SET is_enabled = true;
        `, [studioOrgId]);

        // 2. Project Owner Org for intern
        const projOrgRes = await pgAdmin.query(`
            INSERT INTO public.organisations (name, portal, tenant_type_key, status)
            VALUES ('TEST-Capital Project ' || $1, 'subscriber', 'project_owner', 'ACTIVE')
            RETURNING id;
        `, [timestamp]);
        const projOrgId = projOrgRes.rows[0].id;

        const projWsRes = await pgAdmin.query(`
            INSERT INTO public.workspaces (organisation_id, name, is_active)
            VALUES ($1, 'Project Main WS', true)
            RETURNING id;
        `, [projOrgId]);
        const projWsId = projWsRes.rows[0].id;

        await pgAdmin.query(`
            INSERT INTO public.organisation_entitlements (organisation_id, app_key, is_enabled)
            SELECT $1, app_key, true
              FROM public.app_catalogue
             WHERE app_key IN ('core_billing', 'tasks', 'attendance')
            ON CONFLICT (organisation_id, app_key) DO UPDATE SET is_enabled = true;
        `, [projOrgId]);

        // Platform org
        const platOrgRes = await pgAdmin.query(`
            SELECT id FROM public.organisations WHERE portal = 'platform' LIMIT 1;
        `);
        const platformOrgId = platOrgRes.rows[0].id;

        let platWsRes = await pgAdmin.query(`
            SELECT id FROM public.workspaces WHERE organisation_id = $1 AND is_active = true LIMIT 1;
        `, [platformOrgId]);
        let platformWsId = platWsRes.rows[0]?.id;
        if (!platformWsId) {
            const newWs = await pgAdmin.query(`
                INSERT INTO public.workspaces (organisation_id, name, is_active)
                VALUES ($1, 'Platform Ops WS', true) RETURNING id;
            `, [platformOrgId]);
            platformWsId = newWs.rows[0].id;
        }

        console.log('[2/5] Creating TEST- fixture users via Supabase Admin API...');
        const userDefs: Array<{
            key: string;
            email: string;
            role: string | null;
            orgId: string | null;
            wsId: string | null;
            enrolMfa: boolean;
            expiry?: string;
            department?: string;
            jobRole?: string;
            reportsToKey?: string;
        }> = [
            { key: 'founder', email: `TEST-founder-${timestamp}@archscale.test`, role: 'founder', orgId: platformOrgId, wsId: platformWsId, enrolMfa: true },
            { key: 'client_servicing', email: `TEST-servicing-${timestamp}@archscale.test`, role: 'client_servicing', orgId: platformOrgId, wsId: platformWsId, enrolMfa: true },
            { key: 'business_owner', email: `TEST-owner-${timestamp}@archscale.test`, role: 'business_owner', orgId: studioOrgId, wsId: studioWsId, enrolMfa: true, department: 'Management', jobRole: 'Tenant Admin' },
            { key: 'leader', email: `TEST-leader-${timestamp}@archscale.test`, role: 'leader', orgId: studioOrgId, wsId: studioWsId, enrolMfa: false, department: 'Design', jobRole: 'Design Manager' },
            { key: 'intern', email: `TEST-intern-${timestamp}@archscale.test`, role: 'intern', orgId: studioOrgId, wsId: studioWsId, enrolMfa: false, expiry: '30 days', department: 'Design', jobRole: 'Junior Designer', reportsToKey: 'leader' },
            { key: 'no_membership', email: `TEST-nomem-${timestamp}@archscale.test`, role: null, orgId: null, wsId: null, enrolMfa: false },
            { key: 'multi_membership', email: `TEST-multi-${timestamp}@archscale.test`, role: 'multi', orgId: studioOrgId, wsId: studioWsId, enrolMfa: true }
        ];

        const membershipIds: Record<string, string> = {};
        for (const def of userDefs) {
            const password = generateStrongPassword();
            const createRes = await adminClient.auth.admin.createUser({
                email: def.email,
                password: password,
                email_confirm: true
            });

            if (createRes.error || !createRes.data.user) {
                throw new Error(`Failed creating user ${def.email}: ${createRes.error?.message}`);
            }
            const user = createRes.data.user;

            // Upsert into public.users mirror via fn_upsert_user_mirror
            const mirrorRes = await pgAdmin.query(`
                SELECT fn_upsert_user_mirror($1::uuid, $2::text);
            `, [user.id, def.email]);
            const userCode = mirrorRes.rows[0]?.fn_upsert_user_mirror;

            // Setup memberships
            if (def.role === 'multi') {
                // Owner in Studio Org
                const ownerMembership = await pgAdmin.query(`
                    INSERT INTO public.memberships (organisation_id, user_id, role_key, status)
                    VALUES ($1, $2, 'business_owner', 'ACTIVE') RETURNING id;
                `, [studioOrgId, user.id]);
                membershipIds[`${def.key}:business_owner`] = ownerMembership.rows[0].id;
                // Intern in Project Org (requires expires_at)
                const internMembership = await pgAdmin.query(`
                    INSERT INTO public.memberships (organisation_id, user_id, role_key, status, expires_at)
                    VALUES ($1, $2, 'intern', 'ACTIVE', now() + INTERVAL '30 days') RETURNING id;
                `, [projOrgId, user.id]);
                membershipIds[`${def.key}:intern`] = internMembership.rows[0].id;
            } else if (def.role) {
                const expiresInterval = def.expiry ? `now() + INTERVAL '${def.expiry}'` : 'NULL';
                const managerMembershipId = def.reportsToKey ? membershipIds[def.reportsToKey] : null;
                if (def.reportsToKey && !managerMembershipId) {
                    throw new Error(`Reporting manager fixture ${def.reportsToKey} must be created before ${def.key}.`);
                }
                const membership = await pgAdmin.query(`
                    INSERT INTO public.memberships (
                        organisation_id, user_id, role_key, status, expires_at,
                        department, job_role, reporting_manager_membership_id
                    ) VALUES ($1, $2, $3, 'ACTIVE', ${expiresInterval}, $4, $5, $6::uuid)
                    RETURNING id;
                `, [def.orgId, user.id, def.role, def.department ?? null, def.jobRole ?? null, managerMembershipId]);
                membershipIds[def.key] = membership.rows[0].id;
            }

            // Enrol TOTP MFA if required
            let totpSecret = null;
            if (def.enrolMfa) {
                const userClient = createClient(supabaseUrl, anonKey, {
                    auth: { persistSession: false, autoRefreshToken: false }
                });
                const signInRes = await userClient.auth.signInWithPassword({
                    email: def.email,
                    password: password
                });

                if (signInRes.data.session) {
                    const enrollRes = await userClient.auth.mfa.enroll({
                        factorType: 'totp',
                        issuer: 'ArchScale',
                        friendlyName: `${def.key}-authenticator`
                    });

                    if (enrollRes.data) {
                        totpSecret = enrollRes.data.totp.secret;
                        // Verify challenge immediately to complete enrolment
                        const challengeRes = await userClient.auth.mfa.challenge({ factorId: enrollRes.data.id });
                        // Generate valid code for challenge
                        const { generateTotpCode } = await import('../src/utils/totp.js');
                        const code = generateTotpCode(totpSecret);
                        await userClient.auth.mfa.verify({
                            factorId: enrollRes.data.id,
                            challengeId: challengeRes.data!.id,
                            code: code
                        });
                    }
                }
            }

            testUsersData[def.key] = {
                id: user.id,
                email: def.email,
                userCode: userCode,
                password: password,
                role: def.role,
                orgId: def.orgId,
                workspaceId: def.wsId,
                totpSecret: totpSecret,
                secondaryOrgId: def.role === 'multi' ? projOrgId : undefined,
                secondaryWorkspaceId: def.role === 'multi' ? projWsId : undefined
            };

            console.log(`  ✓ Seeded user: ${def.key} (${def.email})`);
        }

        console.log('[3/5] Writing user credentials securely to .local/test-users.json...');
        const localDir = path.join(__dirname, '../.local');
        if (!fs.existsSync(localDir)) {
            fs.mkdirSync(localDir, { recursive: true });
        }
        const usersFile = path.join(localDir, 'test-users.json');
        fs.writeFileSync(usersFile, JSON.stringify(testUsersData, null, 2), 'utf-8');

        console.log(`[4/5] Credentials file generated: ${usersFile}`);
        console.log('[5/5] Staging seed complete.');

    } catch (err: any) {
        console.error('ERROR in seed_staging_users:', err.message);
        process.exit(1);
    } finally {
        await pgAdmin.end().catch(() => {});
    }
}

main();
