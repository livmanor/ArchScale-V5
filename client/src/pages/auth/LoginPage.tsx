import React, { useState } from 'react';
import {
  signIn, signInByCode, verifyMfa, recovery, resetPassword,
  setToken, setRefreshToken, setContextId,
} from '../../api/client';
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
      onSuccess(session);
    }
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
    onSuccess(session);
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
          {recoveryMode === 'request' ? 'Reset your password' : recoveryMode === 'reset' ? 'Choose a new password' : 'Sign in'}
        </h1>

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

        {!loading && recoveryMode === 'login' && (
          <div style={{ maxWidth: 420 }}>
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

