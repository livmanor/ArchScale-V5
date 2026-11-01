import crypto from 'crypto';

export interface SentMail {
    to: string;
    subject: string;
    rawToken: string;
    invitationId?: string;
    inviteUrl: string;
    body: string;
    sentAt: Date;
}

const sentMails: SentMail[] = [];

export interface SendInvitationOptions {
    to: string;
    rawToken: string;
    invitationId?: string;
    organisationName?: string;
}

export async function sendInvitationMail(options: SendInvitationOptions): Promise<{ success: boolean; messageId: string; inviteUrl: string }> {
    const isolatedTest = process.env.NODE_ENV === 'test' && process.env.ALLOW_LOCAL_AUTH === 'true';
    const baseUrl = (process.env.ARCHSCALE_FRONTEND_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    const inviteUrl = `${baseUrl}/accept?token=${encodeURIComponent(options.rawToken)}`;
    const orgName = options.organisationName || 'ArchScale';
    const body = `You have been invited to join ${orgName}.\n\nAccept your invitation by visiting:\n${inviteUrl}`;

    if (!isolatedTest && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
                auth: { persistSession: false, autoRefreshToken: false }
            });
            const { data, error } = await supabase.auth.admin.inviteUserByEmail(options.to, {
                redirectTo: inviteUrl,
                data: {
                    invitation_id: options.invitationId,
                    raw_token: options.rawToken,
                    invite_url: inviteUrl
                }
            });
            if (error) {
                console.error('[MailDelivery:Supabase] Failed to send invite:', error.message);
                throw error;
            }
            return { success: true, messageId: data?.user?.id || 'supabase-invite', inviteUrl };
        } catch (err: any) {
            console.error('[MailDelivery:Supabase] Invite error:', err.message);
            throw err;
        }
    }

    // The sink is a test fixture only. A configured server must never report a
    // successful invitation while silently keeping its token in process memory.
    if (!isolatedTest) {
        throw new Error('Invitation delivery is not configured. Set Supabase Auth SMTP and server credentials.');
    }

    // Local in-memory sink used by isolated unit tests only.
    sentMails.push({
        to: options.to,
        subject: `You have been invited to join ${orgName}`,
        rawToken: options.rawToken,
        invitationId: options.invitationId,
        inviteUrl,
        body,
        sentAt: new Date()
    });

    return {
        success: true,
        messageId: `sink-${crypto.randomBytes(8).toString('hex')}`,
        inviteUrl
    };
}

export function getSentMails(): readonly SentMail[] {
    return sentMails;
}

export function clearSentMails(): void {
    sentMails.length = 0;
}
