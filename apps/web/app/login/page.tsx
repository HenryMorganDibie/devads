"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiPost, saveSession } from "../../lib/api";
import { safeNext } from "../../lib/beta";
import { OAuthButtons } from "../../components/OAuthButtons";

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { ok, data } = await apiPost<{ token: string; userId: string; developerId: string | null }>(
      "/api/v1/auth/login",
      { email, password }
    );
    setLoading(false);
    if (!ok) {
      setError("Invalid email or password.");
      return;
    }
    saveSession({ token: data.token, userId: data.userId, developerId: data.developerId });
    router.push(next);
  }

  return (
    <main className="max-w-sm mx-auto px-6 py-10">
      <Link href="/" className="inline-block font-semibold mb-12">
        DevAds
      </Link>
      <h1 className="text-2xl font-semibold mb-2">Sign in</h1>
      <p className="text-sm text-muted mb-8">Developers sign in with GitHub or Google.</p>
      <OAuthButtons next={next} />

      <details className="mt-10 text-sm">
        <summary className="cursor-pointer text-muted">Sign in with an email and password instead</summary>
        <form onSubmit={onSubmit} className="space-y-4 mt-4">
          <input
            className="input"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="btn-primary w-full" disabled={loading} type="submit">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="text-xs text-muted mt-3">For existing password accounts.</p>
      </details>

      <p className="text-sm text-muted mt-8">
        New to DevAds?{" "}
        <Link href="/join" className="text-accent">
          Join the Developer Beta
        </Link>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
