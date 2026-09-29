import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Auth is used only to run the GitHub/Google OAuth redirect. The
 * resulting Supabase access token is exchanged once, server-side, for a DevAds
 * session (see lib/beta.ts), and the Supabase session is then discarded, so
 * the browser holds a single DevAds credential like every other sign-in path.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export type OAuthProvider = "github" | "google";

export const isOAuthConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error("oauth_not_configured");
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/** Starts the OAuth redirect; the provider sends the browser back to /auth/callback. */
export async function startOAuth(provider: OAuthProvider, next: string) {
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await supabase().auth.signInWithOAuth({ provider, options: { redirectTo } });
  if (error) throw error;
}
