"use client";

import { useState } from "react";
import { isOAuthConfigured, startOAuth, type OAuthProvider } from "../lib/supabase";
import { OAUTH_ERROR_MESSAGES } from "../lib/beta";

const PROVIDERS: Array<{ id: OAuthProvider; label: string }> = [
  { id: "github", label: "Continue with GitHub" },
  { id: "google", label: "Continue with Google" },
];

/** GitHub / Google sign-in. `next` is where the developer lands after /auth/callback. */
export function OAuthButtons({ next }: { next: string }) {
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOAuthConfigured) {
    return (
      <p className="card p-4 text-sm text-muted" role="status">
        {OAUTH_ERROR_MESSAGES.oauth_not_configured}
      </p>
    );
  }

  async function go(provider: OAuthProvider) {
    setError(null);
    setPending(provider);
    try {
      await startOAuth(provider, next);
    } catch {
      setPending(null);
      setError("We couldn't start sign-in. Please try again.");
    }
  }

  return (
    <div className="space-y-3">
      {PROVIDERS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => go(p.id)}
          disabled={pending !== null}
          className="w-full rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-medium hover:bg-white/[0.08] disabled:opacity-50"
        >
          {pending === p.id ? "Redirecting..." : p.label}
        </button>
      ))}
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
