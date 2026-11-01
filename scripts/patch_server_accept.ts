import fs from 'fs';

const filePath = 'src/server/index.ts';
let content = fs.readFileSync(filePath, 'utf8');

const target1 = `        const body = req.body || {};
        const token = body.token ?? principal.userMetadata?.raw_token;
        if (typeof token !== 'string' || !token.trim()) {
            return res.status(400).json({ error: 'TOKEN_REQUIRED', message: 'Invitation token is required' });
        }`;

const replacement1 = `        const body = req.body || {};
        let token = body.token ?? principal.userMetadata?.raw_token;

        if (!token && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.ALLOW_LOCAL_AUTH !== 'true') {
            try {
                const { createClient } = await import('@supabase/supabase-js');
                const adminSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
                    auth: { persistSession: false, autoRefreshToken: false }
                });
                const { data: userData } = await adminSupabase.auth.admin.getUserById(principal.id);
                if (userData?.user?.user_metadata?.raw_token) {
                    token = userData.user.user_metadata.raw_token;
                }
            } catch {
                // Fallback attempt ignored
            }
        }

        if (typeof token !== 'string' || !token.trim()) {
            return res.status(400).json({ error: 'TOKEN_REQUIRED', message: 'Invitation token is required' });
        }

        if (body.password !== undefined) {
            if (typeof body.password !== 'string' || body.password.length < 12) {
                return res.status(400).json({ error: 'PASSWORD_TOO_SHORT', message: 'Password must be at least 12 characters' });
            }
        }`;

const target2 = `                const acceptRes = await client.query<{ fn_accept_invitation: string }>(
                    \`SELECT fn_accept_invitation($1, $2::uuid);\`,
                    [token.trim(), principal.id]
                );
                return res.status(200).json({
                    success: true,
                    membershipId: acceptRes.rows[0]?.fn_accept_invitation
                });`;

const replacement2 = `                const acceptRes = await client.query<{ fn_accept_invitation: string }>(
                    \`SELECT fn_accept_invitation($1, $2::uuid);\`,
                    [token.trim(), principal.id]
                );

                if (body.password) {
                    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.ALLOW_LOCAL_AUTH !== 'true') {
                        const { createClient } = await import('@supabase/supabase-js');
                        const adminSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
                            auth: { persistSession: false, autoRefreshToken: false }
                        });
                        const { error: pwdErr } = await adminSupabase.auth.admin.updateUserById(principal.id, {
                            password: body.password
                        });
                        if (pwdErr) {
                            return res.status(400).json({ error: 'PASSWORD_UPDATE_FAILED', message: pwdErr.message });
                        }
                    } else {
                        const idp = (req as any).idp;
                        if (idp && typeof idp.confirmPasswordReset === 'function') {
                            await idp.confirmPasswordReset(principal.id, body.password);
                        }
                    }
                }

                return res.status(200).json({
                    success: true,
                    membershipId: acceptRes.rows[0]?.fn_accept_invitation
                });`;

// Normalize CRLF to LF for matching, then restore CRLF
const isCrlf = content.includes('\r\n');
const normalizedContent = content.replace(/\r\n/g, '\n');
const normT1 = target1.replace(/\r\n/g, '\n');
const normT2 = target2.replace(/\r\n/g, '\n');

if (!normalizedContent.includes(normT1)) {
    console.error('Target 1 not found in content!');
    process.exit(1);
}
if (!normalizedContent.includes(normT2)) {
    console.error('Target 2 not found in content!');
    process.exit(1);
}

let patched = normalizedContent.replace(normT1, replacement1.replace(/\r\n/g, '\n'));
patched = patched.replace(normT2, replacement2.replace(/\r\n/g, '\n'));

if (isCrlf) {
    patched = patched.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, patched, 'utf8');
console.log('Successfully patched src/server/index.ts');
process.exit(0);

