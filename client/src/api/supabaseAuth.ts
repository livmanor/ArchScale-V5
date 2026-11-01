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
        storage: window.localStorage,
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
  try {
    // 1. Supabase automatically exchanges the code when detectSessionInUrl is true.
    // Check if the session is already established by initializePromise.
    const { data: initialData } = await browserAuth.auth.getSession();
    if (initialData?.session) {
      return { session: initialData.session, error: null };
    }

    // 2. If not yet resolved and code is present, exchange explicitly.
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    if (code) {
      const { data, error } = await browserAuth.auth.exchangeCodeForSession(code);
      if (data?.session) return { session: data.session, error: null };
      if (error) {
        const retry = await browserAuth.auth.getSession();
        if (retry.data?.session) return { session: retry.data.session, error: null };
        return { session: null, error: error.message };
      }
    }
    return { session: null, error: 'No authenticated session returned from Google.' };
  } catch (err: any) {
    return { session: null, error: err?.message || 'Failed to exchange OAuth session.' };
  }
}

export async function updateBrowserAuthSession(accessToken: string, refreshToken: string): Promise<void> {
  if (!browserAuth) return;
  await browserAuth.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
}

export async function clearBrowserAuthSession(): Promise<void> {
  if (!browserAuth) return;
  const { error } = await browserAuth.auth.signOut({ scope: 'local' });
  if (error) throw error;
}
