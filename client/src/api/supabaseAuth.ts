import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const googleOAuthConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const browserAuth: SupabaseClient | null = googleOAuthConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.sessionStorage,
      },
    })
  : null;

export async function beginGoogleSignIn(): Promise<string | null> {
  if (!browserAuth) return 'Google sign-in is not configured for this application.';
  const { error } = await browserAuth.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { prompt: 'select_account' },
    },
  });
  return error?.message ?? null;
}

export async function getOAuthCallbackSession(): Promise<{ session: Session | null; error: string | null }> {
  if (!browserAuth) return { session: null, error: 'Google sign-in is not configured for this application.' };
  const { data, error } = await browserAuth.auth.getSession();
  return { session: data.session, error: error?.message ?? null };
}

export async function updateBrowserAuthSession(accessToken: string, refreshToken: string): Promise<void> {
  if (!browserAuth) return;
  await browserAuth.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
}

export async function clearBrowserAuthSession(): Promise<void> {
  if (!browserAuth) return;
  await browserAuth.auth.signOut({ scope: 'local' });
}
