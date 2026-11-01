import React, { useState } from 'react';
import {
  signIn, signInByCode, verifyMfa, recovery, resetPassword, acceptInvitation, completeOAuthSession,
  setToken, setRefreshToken, setContextId,
} from '../../api/client';
import {
  beginGoogleSignIn, getOAuthCallbackSession, googleOAuthConfigured,
} from '../../api/supabaseAuth';
import type { SessionData } from '../../hooks/useSession';
import { Button } from '../../components/Button';
import { Alert } from '../../components/Alert';
import { FormField, TextInput } from '../../components/FormField';
import { Spinner } from '../../components/Spinner';

interface LoginProps {
  onSuccess: (session: SessionData) => void;
}

export const LoginPage: React.FC<LoginProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isInvitationPage] = useState(() => window.location.pathname === '/accept');
  const [isOAuthCallback] = useState(() => window.location.pathname === '/auth/callback');
  const [invitationToken] = useState(() =>
    new URLSearchParams(window.location.search).get('token') ??
    new URLSearchParams(window.location.hash.slice(1)).get('token')
  );
  const [invitationAuthToken] = useState(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    return isInvitationPage ? fragment.get('access_token') : null;
  });
  const [invitationPendingSession, setInvitationPendingSession] = useState<{
    sessionData: any;
    email: string;
  } | null>(null);
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteConfirmPassword, setInviteConfirmPassword] = useState('');
  const [resetToken] = useState(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    return fragment.get('type') === 'recovery' ? fragment.get('access_token') : null;
  });
  const [recoveryMode, setRecoveryMode] = useState<'login' | 'request' | 'reset'>(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    return fragment.get('type') === 'recovery' && fragment.has('access_token') ? 'reset' : 'login';
  });

  // MFA step
  const [mfaSession, setMfaSession] = useState<{ token: string; email: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');

  // Manual login
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const completeLogin = async (session: SessionData) => {
    const pendingInvite = window.localStorage.getItem('archscale_pending_invite');
    if (isInvitationPage || invitationToken || pendingInvite) {
      window.localStorage.removeItem('archscale_pending_invite');
      const tokenToUse = invitationToken || (pendingInvite && pendingInvite !== 'true' ? pendingInvite : undefined);
      setLoading(true);
      const accepted = await acceptInvitation(tokenToUse);
      setLoading(false);
      if (!accepted.ok) {
        setError(accepted.message);
        return;
      }
      window.history.replaceState(null, '', '/');
      setNotice('Invitation accepted. Select your organisation and workspace to continue.');
    }
    onSuccess(session);
  };

  const finaliseSession = (data: { accessToken: string; refreshToken?: string; principal: { id: string; email: string; aal: 'aal1'|'aal2'; role?: string; department?: string; jobRole?: string; sessionId?: string }; mfaRequired?: boolean }) => {
    // Guard: accessToken must be present or we cannot proceed
    if (!data.accessToken) {
      setError('Sign in failed: no access token returned. Please try again.');
      return;
    }
    const session: SessionData = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      principal: data.principal,
      mfaRequired: data.mfaRequired,
    };
    // Always put the token in memory first — verifyMfa will use it via overrideToken
    setToken(data.accessToken);
    setRefreshToken(data.refreshToken ?? null);
    // If MFA is required and not yet at aal2, show MFA screen
    if (data.mfaRequired && data.principal.aal !== 'aal2') {
      setMfaSession({ token: data.accessToken, email: data.principal.email });
    } else {
      setContextId(null);
      void completeLogin(session);
    }
  };

  React.useEffect(() => {
    if (!invitationAuthToken) return;
    let active = true;
    setLoading(true);
    setNotice('Verifying your invitation link…');
    void (async () => {
      try {
        const result = await completeOAuthSession(invitationAuthToken);
        if (!active) return;
        setLoading(false);
        if (!result.ok || !result.data?.principal) {
          setNotice(null);
          setError(result.message || 'This invitation link could not be verified. Request a new invitation.');
          return;
        }
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        const sessionPayload = {
          accessToken: invitationAuthToken,
          refreshToken: fragment.get('refresh_token') ?? undefined,
          principal: result.data.principal,
          mfaRequired: result.data.mfaRequired,
        };
        setToken(invitationAuthToken);
        setRefreshToken(fragment.get('refresh_token') ?? null);
        setNotice(null);
        setInvitationPendingSession({
          sessionData: sessionPayload,
          email: result.data.principal.email,
        });
      } catch {
        if (!active) return;
        setLoading(false);
        setNotice(null);
        setError('This invitation link could not be verified. Request a new invitation.');
      }
    })();
    return () => { active = false; };
  }, [invitationAuthToken]);

  React.useEffect(() => {
    if (!isOAuthCallback) return;
    let active = true;
    setLoading(true);
    setNotice('Completing Google sign-in…');
    void (async () => {
      try {
        const callbackError = new URLSearchParams(window.location.search).get('error_description');
        if (callbackError) throw new Error(callbackError);

        const { session: oauthSession, error: sessionError } = await getOAuthCallbackSession();
        if (sessionError) throw new Error(sessionError);
        if (!oauthSession) throw new Error('Google sign-in did not return an authenticated session.');

        const result = await completeOAuthSession(oauthSession.access_token);
        if (!active) return;
        if (!result.ok || !result.data?.principal) {
          throw new Error(result.message || 'The Google session could not be verified.');
        }

        window.history.replaceState(null, '', '/');
        finaliseSession({
          accessToken: oauthSession.access_token,
          refreshToken: oauthSession.refresh_token,
          principal: result.data.principal,
          mfaRequired: result.data.mfaRequired,
        });
      } catch (callbackError) {
        if (!active) return;
        setLoading(false);
        setNotice(null);
        setError(callbackError instanceof Error
          ? callbackError.message
          : 'Google sign-in could not be completed. Please try again.');
        window.history.replaceState(null, '', '/');
      }
    })();
    return () => { active = false; };
  }, [isOAuthCallback]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    if (isInvitationPage || invitationToken) {
      window.localStorage.setItem('archscale_pending_invite', invitationToken || 'true');
    }
    const startError = await beginGoogleSignIn();
    if (startError) {
      setLoading(false);
      setError(startError);
    }
  };

  const handleAcceptWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitationPendingSession) return;
    if (invitePassword.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    if (invitePassword !== inviteConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    const accepted = await acceptInvitation(invitationToken ?? undefined, invitePassword);
    setLoading(false);
    if (!accepted.ok) {
      setError(accepted.message);
      return;
    }
    window.history.replaceState(null, '', '/');
    finaliseSession(invitationPendingSession.sessionData);
  };

  const handleSkipPasswordAccept = async (sessionData: any) => {
    setLoading(true);
    setError(null);
    const accepted = await acceptInvitation(invitationToken ?? undefined);
    setLoading(false);
    if (!accepted.ok) {
      setError(accepted.message);
      return;
    }
    window.history.replaceState(null, '', '/');
    finaliseSession(sessionData);
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) { setError('Please enter your email/user code and password.'); return; }
    setLoading(true);
    setError(null);

    const isCode = identifier.trim().toUpperCase().startsWith('AS-');
    const res = isCode
      ? await signInByCode(identifier.trim(), password)
      : await signIn(identifier.trim(), password);
    setLoading(false);

    if (!res.ok) {
      // Always use a generic message for credential failures (security)
      setError('Sign in failed. Please check your credentials and try again.');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finaliseSession(res.data as any);
  };

  const handleRecoveryRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await recovery(recoveryEmail.trim());
    setLoading(false);
    if (!result.ok) { setError(result.message); return; }
    setNotice('If the address is registered, a recovery link has been sent.');
    setRecoveryMode('login');
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken) { setError('This recovery link is invalid or expired. Request a new link.'); return; }
    setLoading(true);
    setError(null);
    const result = await resetPassword(resetToken, newPassword);
    setLoading(false);
    if (!result.ok) { setError(result.message); return; }
    window.history.replaceState(null, '', '/');
    setNewPassword('');
    setNotice('Password updated. Sign in with your new password.');
    setRecoveryMode('login');
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode.trim()) { setError('Please enter your 6-digit code.'); return; }
    if (!mfaSession) return;
    setLoading(true);
    setError(null);
    const res = await verifyMfa(totpCode.trim(), mfaSession.token);
    setLoading(false);
    if (!res.ok) {
      setError('Invalid code. Please check your authenticator app and try again.');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = res.data as any;
    const session: SessionData = {
      accessToken: data.accessToken ?? mfaSession.token,
      refreshToken: data.refreshToken,
      principal: { ...data.principal, aal: 'aal2' as const },
    };
    setToken(session.accessToken);
    setRefreshToken(session.refreshToken ?? null);
    setContextId(null);
    void completeLogin(session);
  };

  // ── MFA step ──────────────────────────────────────────────────────────────
  if (mfaSession) {
    return (
      <div style={SHELL}>
        <div style={CARD}>
          <div style={LOGO_MARK}>AS</div>
          <h1 style={H1}>Two-Factor Authentication</h1>
          <p style={SUB}>Enter the 6-digit code from your authenticator app for <strong>{mfaSession.email}</strong></p>
          {error && <Alert kind="error">{error}</Alert>}
          <form onSubmit={handleMfaVerify}>
            <FormField label="Authenticator Code" required>
              <TextInput
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={totpCode}
                onChange={e => { setTotpCode(e.target.value); setError(null); }}
                style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center' }}
                autoFocus
              />
            </FormField>
            <Button type="submit" loading={loading} style={{ width: '100%', marginTop: 4 }}>
              Verify Code
            </Button>
            <button
              type="button"
              onClick={() => { setMfaSession(null); setTotpCode(''); setError(null); }}
              style={{ display: 'block', width: '100%', marginTop: 12, background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', cursor: 'pointer', textAlign: 'center' }}
            >
              ← Back to sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Main login ────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={LOGO_MARK}>AS</div>
        <div>
          <div style={{ fontSize: 'var(--font-size-h2)', fontWeight: 700, color: 'var(--color-text)' }}>ArchScale</div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Organisation Authentication Platform</div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 'var(--font-size-h1)', marginBottom: 24 }}>
          {recoveryMode === 'request'
            ? 'Reset your password'
            : recoveryMode === 'reset'
            ? 'Choose a new password'
            : invitationPendingSession
            ? 'Accept invitation & Set password'
            : isInvitationPage || invitationToken
            ? 'Accept invitation'
            : 'Sign in'}
        </h1>

        {!invitationPendingSession && (isInvitationPage || invitationToken) && recoveryMode === 'login' && (
          <Alert kind="info" style={{ marginBottom: 20 }}>Sign in or continue with Google to accept your invitation.</Alert>
        )}

        {notice && <Alert kind="info" style={{ marginBottom: 20 }}>{notice}</Alert>}
        {error && <Alert kind="error" style={{ marginBottom: 20 }}>{error}</Alert>}

        {/* Loading overlay */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Spinner size={16} />
            <span>Signing in…</span>
          </div>
        )}

        {!loading && recoveryMode === 'request' && (
          <div style={{ maxWidth: 420 }}>
            <form onSubmit={handleRecoveryRequest}>
              <FormField label="Email Address" required>
                <TextInput type="email" autoComplete="email" value={recoveryEmail} onChange={event => setRecoveryEmail(event.target.value)} required />
              </FormField>
              <Button type="submit" loading={loading} style={{ width: '100%' }}>Send recovery link</Button>
              <button type="button" onClick={() => setRecoveryMode('login')} style={{ marginTop: 14, background: 'none', border: 0, color: 'var(--color-accent)', cursor: 'pointer' }}>Back to sign in</button>
            </form>
          </div>
        )}

        {!loading && recoveryMode === 'reset' && (
          <div style={{ maxWidth: 420 }}>
            <form onSubmit={handlePasswordReset}>
              <FormField label="New Password" required hint="Use at least 12 characters.">
                <TextInput type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={event => setNewPassword(event.target.value)} required />
              </FormField>
              <Button type="submit" loading={loading} style={{ width: '100%' }}>Update password</Button>
            </form>
          </div>
        )}

        {!loading && invitationPendingSession && (
          <div style={{ maxWidth: 440 }}>
            <div style={{ marginBottom: 20 }}>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', margin: '0 0 10px 0' }}>
                You have been invited to join your organisation. Set your account password to activate your login.
              </p>
              <div style={{ padding: '10px 14px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--color-text)' }}>
                {invitationPendingSession.email}
              </div>
            </div>
            <form onSubmit={handleAcceptWithPassword}>
              <FormField label="New Password" required hint="Must be at least 12 characters.">
                <TextInput
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  placeholder="Enter new password"
                  value={invitePassword}
                  onChange={e => { setInvitePassword(e.target.value); setError(null); }}
                  required
                  autoFocus
                />
              </FormField>
              <FormField label="Confirm Password" required>
                <TextInput
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  placeholder="Re-enter password"
                  value={inviteConfirmPassword}
                  onChange={e => { setInviteConfirmPassword(e.target.value); setError(null); }}
                  required
                />
              </FormField>
              <Button type="submit" loading={loading} style={{ width: '100%', marginBottom: 16 }}>
                Set Password & Accept Invitation
              </Button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                <span>OR</span>
                <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={handleGoogleSignIn}
                disabled={!googleOAuthConfigured}
                style={{ width: '100%', marginBottom: 12 }}
              >
                Continue with Google
              </Button>
              <button
                type="button"
                onClick={() => handleSkipPasswordAccept(invitationPendingSession.sessionData)}
                style={{ display: 'block', width: '100%', marginTop: 8, background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', cursor: 'pointer', textAlign: 'center' }}
              >
                Skip password & enter workspace →
              </button>
            </form>
          </div>
        )}

        {!loading && !invitationPendingSession && recoveryMode === 'login' && (
          <div style={{ maxWidth: 420 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={handleGoogleSignIn}
              disabled={!googleOAuthConfigured}
              style={{ width: '100%', marginBottom: 16 }}
            >
              Continue with Google
            </Button>
            {!googleOAuthConfigured && (
              <p style={{ margin: '-8px 0 16px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                Google sign-in needs the Supabase project URL and anon key in the frontend build.
              </p>
            )}
            <form onSubmit={handleManualLogin}>
              <FormField label="Email or User Code" required>
                <TextInput
                  type="text"
                  placeholder="user@example.com or AS-XXXXXXXX"
                  value={identifier}
                  onChange={e => { setIdentifier(e.target.value); setError(null); }}
                  autoFocus
                  autoComplete="username"
                />
              </FormField>
              <FormField label="Password" required>
                <TextInput
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(null); }}
                  autoComplete="current-password"
                />
              </FormField>
              <Button type="submit" loading={loading} style={{ width: '100%' }}>
                Sign In
              </Button>
              <div style={{ marginTop: 14, fontSize: 'var(--font-size-sm)' }}>
                <a href="/forgot-password" onClick={event => { event.preventDefault(); setNotice(null); setError(null); setRecoveryMode('request'); }}>Forgot password?</a>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

// Shared styles
const SHELL: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--color-bg)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

const CARD: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  padding: 32,
  width: '100%',
  maxWidth: 400,
  boxShadow: 'var(--shadow-sm)',
};

const LOGO_MARK: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  background: 'var(--color-accent)',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 20,
};

const H1: React.CSSProperties = {
  fontSize: 'var(--font-size-h1)',
  fontWeight: 700,
  marginBottom: 8,
  color: 'var(--color-text)',
};

const SUB: React.CSSProperties = {
  fontSize: 'var(--font-size-body)',
  color: 'var(--color-text-muted)',
  marginBottom: 24,
  lineHeight: 1.5,
};
