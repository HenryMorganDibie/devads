/**
 * External identity for developer sign-in (OAuth via Supabase Auth).
 *
 * The browser completes OAuth with Supabase and sends the resulting access
 * token to POST /api/v1/auth/oauth/exchange. The ad-server never trusts that
 * token on its own: it asks Supabase who it belongs to (GET /auth/v1/user),
 * which also rejects expired, revoked and forged tokens. Only the project's
 * public publishable key is needed for that call; no Supabase secret is held.
 */

export interface VerifiedIdentity {
  /** Stable identity, namespaced by issuer, e.g. "supabase:<uuid>". */
  subject: string;
  email: string | null;
  /** OAuth provider that authenticated the user, e.g. "github". */
  provider: string | null;
  displayName: string | null;
}

export interface IdentityVerifier {
  /** The verified identity, or null if the token is not valid. */
  verify(accessToken: string): Promise<VerifiedIdentity | null>;
}

/**
 * Supabase sign-in methods that are not OAuth. They are refused here: the
 * beta signs developers in with OAuth only (no email delivery needed), and
 * email/password stays on DevAds' own auth. Which OAuth providers are offered
 * is an operator setting in Supabase Auth, so no vendor is named in code.
 */
export const NON_OAUTH_METHODS = new Set(["email", "phone", "anonymous"]);

export function isAllowedOAuthProvider(provider: string | null): provider is string {
  return provider !== null && provider.length > 0 && !NON_OAUTH_METHODS.has(provider);
}

type FetchFn = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export function supabaseIdentityVerifier(opts: {
  url: string;
  publishableKey: string;
  fetch?: FetchFn;
  timeoutMs?: number;
}): IdentityVerifier {
  const base = opts.url.replace(/\/+$/, "");
  const doFetch: FetchFn = opts.fetch ?? (globalThis.fetch as unknown as FetchFn);
  return {
    async verify(accessToken) {
      const res = await doFetch(`${base}/auth/v1/user`, {
        headers: { apikey: opts.publishableKey, authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
      });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new Error(`supabase_auth_unavailable_${res.status}`);
      const user = (await res.json()) as {
        id?: unknown;
        email?: unknown;
        app_metadata?: { provider?: unknown };
        user_metadata?: { full_name?: unknown; name?: unknown; user_name?: unknown };
      };
      if (typeof user.id !== "string" || user.id.length === 0) return null;
      const meta = user.user_metadata ?? {};
      const name = [meta.full_name, meta.name, meta.user_name].find((v) => typeof v === "string" && v.trim());
      return {
        subject: `supabase:${user.id}`,
        email: typeof user.email === "string" && user.email ? user.email.toLowerCase() : null,
        provider: typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : null,
        displayName: typeof name === "string" ? name.trim().slice(0, 80) : null,
      };
    },
  };
}

/** From SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY; null (OAuth disabled) when either is unset. */
export function identityVerifierFromEnv(env: NodeJS.ProcessEnv = process.env): IdentityVerifier | null {
  const url = env.SUPABASE_URL?.trim();
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  return supabaseIdentityVerifier({ url, publishableKey });
}
