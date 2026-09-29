"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { exchangeOAuthToken, OAUTH_ERROR_MESSAGES, safeNext } from "../../../lib/beta";
import { supabase } from "../../../lib/supabase";

/**
 * OAuth return leg: PKCE code -> Supabase access token -> DevAds session.
 * The Supabase session is signed out locally afterwards; from here on the
 * browser holds only the DevAds session, like every other sign-in path.
 */
function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const next = safeNext(params.get("next"));
    const code = params.get("code");

    (async () => {
      if (!code) {
        setError(params.get("error_description") ?? "Sign-in was cancelled.");
        return;
      }
      const auth = supabase().auth;
      try {
        const { data, error: exchangeError } = await auth.exchangeCodeForSession(code);
        if (exchangeError || !data.session) throw new Error("invalid_oauth_token");
        await exchangeOAuthToken(data.session.access_token);
        router.replace(next);
      } catch (err) {
        const code = err instanceof Error ? err.message : "";
        setError(OAUTH_ERROR_MESSAGES[code] ?? "We couldn't finish signing you in. Please try again.");
      } finally {
        await auth.signOut({ scope: "local" }).catch(() => undefined);
      }
    })();
  }, [params, router]);

  return (
    <main className="max-w-sm mx-auto px-6 py-24">
      {error ? (
        <div role="alert">
          <h1 className="text-xl font-semibold mb-3">Sign-in did not complete</h1>
          <p className="text-sm text-muted mb-6">{error}</p>
          <Link href="/login" className="btn-primary inline-block">
            Back to sign in
          </Link>
        </div>
      ) : (
        <p className="text-muted">Signing you in...</p>
      )}
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
