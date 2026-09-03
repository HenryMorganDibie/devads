"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, saveSession } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { ok, data } = await apiPost<{ userId: string; advertiserId: string | null }>("/api/v1/auth/login", {
      email,
      password,
    });
    setLoading(false);
    if (!ok || !data.advertiserId) {
      setError(!ok ? "Invalid email or password." : "This account has no advertiser profile.");
      return;
    }
    saveSession({ userId: data.userId, advertiserId: data.advertiserId });
    router.push("/campaigns");
  }

  return (
    <main className="max-w-sm mx-auto px-6 py-24">
      <h1 className="text-2xl font-semibold mb-8">Sign in</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <input className="input" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={loading} type="submit">
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <p className="text-sm text-muted mt-6">
        No account? <Link href="/signup" className="text-accent">Create one</Link>
      </p>
      <p className="text-xs text-muted mt-2">
        Demo login: <span className="font-mono">advertiser@devads.dev / advertiser12345</span>
      </p>
    </main>
  );
}
